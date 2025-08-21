// @ts-check

import { ModelCache } from './model-cache';

export function bootWorker() {
  const modelCache = new ModelCache();
  let selectedModel = modelCache.knownModels[0];
  // Report starting
  try {
    self.postMessage({ type: 'status', status: 'initializing' });
  } catch (e) {
    // ignore if postMessage not available for some reason
  }

  self.postMessage({ type: 'status', status: 'backend-detected', backend: modelCache.backend });


  // signal ready to main thread (worker script loaded; model runtime may still be pending)
  self.postMessage({ type: 'ready', env: modelCache.env, backend: modelCache.backend });

  // handle incoming requests from the UI thread
  self.addEventListener('message', handleMessage);
  // track cancellable tasks by id
  const activeTasks = new Map();

  async function handleMessage({ data }) {
    const { id } = data;
    try {
      if (data.type === 'listModels') {
        self.postMessage({ id, type: 'response', result: modelCache.knownModels });
      } else if (data.type === 'listChatModels') {
        // kick off the long-running listing/classification task
        handleListChatModels(data).catch(err => {
          self.postMessage({ id, type: 'error', error: String(err) });
        });
      } else if (data.type === 'cancelListChatModels') {
        const task = activeTasks.get(id);
        if (task && task.abort) task.abort();
        self.postMessage({ id, type: 'response', result: { cancelled: true } });
      } else if (data.type === 'loadModel') {
        const { modelName = modelCache.knownModels[0] } = data;
        try {
          const pipe = await modelCache.getModel({ modelName });
          selectedModel = modelName;
          self.postMessage({ id, type: 'response', result: { model: modelName, status: 'loaded' } });
        } catch (err) {
          self.postMessage({ id, type: 'error', error: String(err) });
        }
      } else if (data.type === 'runPrompt') {
        handleRunPrompt(data);
      } else {
        if (id) self.postMessage({ id, type: 'error', error: 'unknown-message-type' });
      }
    } catch (err) {
      if (id) self.postMessage({ id, type: 'error', error: String(err) });
    }
  }

  async function handleRunPrompt({ prompt, modelName = selectedModel, id, options }) {
    try {
      const pipe = await modelCache.getModel({ modelName });
      // run the pipeline
      if (!pipe) throw new Error('pipeline not available');
      self.postMessage({ id, type: 'status', status: 'inference-start', model: modelName });
      const out = await pipe(prompt, options || {});
      const text = extractText(out);
      self.postMessage({ id, type: 'status', status: 'inference-done', model: modelName });
      self.postMessage({ id, type: 'response', result: text });
    } catch (err) {
      self.postMessage({ id, type: 'error', error: String(err) });
    }
  }

  // Implementation of the listChatModels worker action
  async function handleListChatModels({ id, params = {} }) {
  const opts = Object.assign({ maxCandidates: 250, concurrency: 12, hfToken: null, timeoutMs: 10000, maxListing: 5000 }, params || {});
  const { maxCandidates, concurrency, hfToken, timeoutMs, maxListing } = opts;
  const MAX_TOTAL_TO_FETCH = Math.min(maxListing, 5000);
    const PAGE_SIZE = 100;
    const RETRIES = 3;
    const BACKOFF_BASE_MS = 200;

    let cancelled = false;
    const abortControllers = new Set();
    activeTasks.set(id, { abort: () => { cancelled = true; for (const c of abortControllers) c.abort(); } });

    try {
      // 1) Fetch listing pages up to MAX_TOTAL_TO_FETCH
      let listing = [];
      let offset = 0;
      while (listing.length < MAX_TOTAL_TO_FETCH && !cancelled) {
        const url = `https://huggingface.co/api/models?full=true&limit=${PAGE_SIZE}&offset=${offset}`;
        let ok = false;
        for (let attempt = 0; attempt <= RETRIES && !ok && !cancelled; attempt++) {
          try {
            const controller = new AbortController();
            abortControllers.add(controller);
            const resp = await fetch(url, { signal: controller.signal, headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {} });
            abortControllers.delete(controller);
            if (resp.status === 429) {
              const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
              await new Promise(r => setTimeout(r, backoff));
              continue;
            }
            if (!resp.ok) throw new Error(`listing-fetch-failed:${resp.status}`);
            const page = await resp.json();
            if (!Array.isArray(page) || page.length === 0) { ok = true; break; }
            listing.push(...page);
            offset += PAGE_SIZE;
            ok = true;
          } catch (err) {
            if (attempt === RETRIES) throw err;
            await new Promise(r => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
          }
        }
        if (!ok) break;
      }

      // send listing_done progress
      self.postMessage({ id, type: 'progress', status: 'listing_done', data: { totalFound: listing.length } });

      if (cancelled) {
        activeTasks.delete(id);
        return self.postMessage({ id, type: 'response', result: { cancelled: true } });
      }

      // 2) Pre-filter
      const denyPipeline = new Set(['feature-extraction', 'fill-mask', 'sentence-similarity', 'masked-lm']);
      const survivors = [];
      for (const m of listing) {
        if (survivors.length >= maxCandidates) break;
        const pipeline = m.pipeline_tag;
        if (pipeline && denyPipeline.has(pipeline)) continue;
        if (typeof m.modelId === 'string' && m.modelId.includes('sentence-transformers')) continue;
        // siblings check: allow if tokenizer or vocab present
        const siblings = m.siblings || [];
        const hasTokenizer = siblings.some(s => /tokenizer|vocab|merges|sentencepiece/i.test(s));
        if (!hasTokenizer) continue;
        survivors.push(m);
      }

      self.postMessage({ id, type: 'progress', status: 'prefiltered', data: { survivors: survivors.length } });

      // 3) Config fetch & classification with concurrency
      const results = [];
      const errors = [];
      let idx = 0;
      const pool = new Array(Math.min(concurrency, survivors.length)).fill(0).map(async () => {
        while (!cancelled && idx < survivors.length) {
          const i = idx++;
          const model = survivors[i];
          const modelId = model.modelId || model.id || model.model || model.modelId;
          try {
            self.postMessage({ id, type: 'progress', modelId, status: 'config_fetching' });
            const fetchResult = await fetchConfigForModel(modelId, hfToken, timeoutMs, RETRIES, BACKOFF_BASE_MS);
            const entry = classifyModel(model, fetchResult);
            results.push(entry);
            self.postMessage({ id, type: 'progress', modelId, status: 'classified', data: entry });
          } catch (err) {
            errors.push({ modelId, message: String(err) });
            self.postMessage({ id, type: 'progress', modelId, status: 'error', data: { message: String(err) } });
          }
        }
      });

      await Promise.all(pool);

      if (cancelled) {
        activeTasks.delete(id);
        return self.postMessage({ id, type: 'response', result: { cancelled: true } });
      }

      // finalize
      const models = results.map(r => ({ id: r.id, model_type: r.model_type, architectures: r.architectures, classification: r.classification, confidence: r.confidence, fetchStatus: r.fetchStatus }));
      const meta = { fetched: listing.length, filtered: survivors.length, errors };
      activeTasks.delete(id);
      return self.postMessage({ id, type: 'response', result: { models, meta } });
    } catch (err) {
      activeTasks.delete(id);
      return self.postMessage({ id, type: 'error', error: String(err) });
    }
  }

  // helper: fetchConfigForModel
  async function fetchConfigForModel(modelId, hfToken, timeoutMs, RETRIES, BACKOFF_BASE_MS) {
    const urls = [
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config.json`,
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config/config.json`,
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/adapter_config.json`
    ];
    for (const url of urls) {
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(url, { signal: controller.signal, headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {} });
          clearTimeout(timeout);
          if (resp.status === 200) {
            const json = await resp.json();
            return { status: 'ok', model_type: json.model_type || null, architectures: json.architectures || null };
          }
          if (resp.status === 401 || resp.status === 403) return { status: 'auth', code: resp.status };
          if (resp.status === 404) break; // try next fallback
          if (resp.status === 429) {
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          // other non-200 -> treat as error
          return { status: 'error', code: resp.status, message: `fetch failed ${resp.status}` };
        } catch (err) {
          clearTimeout(timeout);
          if (attempt === RETRIES) return { status: 'error', message: String(err) };
          const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    return { status: 'no-config' };
  }

  // helper: classifyModel
  function classifyModel(rawModel, fetchResult) {
    const id = rawModel.modelId || rawModel.id || rawModel.modelId || rawModel.modelId || rawModel.id;
    const entry = { id, model_type: null, architectures: null, classification: 'unknown', confidence: 'low', fetchStatus: 'error' };
    if (!fetchResult) return entry;
    if (fetchResult.status === 'auth') {
      entry.classification = 'auth-protected'; entry.confidence = 'high'; entry.fetchStatus = '401';
      return entry;
    }
  if (fetchResult.status === 'ok') {
  entry.model_type = fetchResult.model_type || null;
  entry.architectures = Array.isArray(fetchResult.architectures) ? fetchResult.architectures : null;
      entry.fetchStatus = 'ok';
      const deny = ['bert','roberta','distilbert','electra','albert','deberta','mobilebert','convbert','sentence-transformers'];
      const allow = ['gpt2','gptj','gpt_neox','llama','qwen','mistral','phi','gpt','t5','bart','pegasus'];
      if (entry.model_type && deny.includes(entry.model_type)) { entry.classification = 'encoder'; entry.confidence = 'high'; return entry; }
      if (entry.model_type && allow.includes(entry.model_type)) { entry.classification = 'gen'; entry.confidence = 'high'; return entry; }
      const arch = entry.architectures;
      if (arch && Array.isArray(arch)) {
        /** @type {any[]} */
        const archArr = /** @type {any[]} */ (arch);
        for (let i = 0; i < archArr.length; i++) {
          const a = archArr[i];
          const al = String(a).toLowerCase();
          if (allow.includes(al)) { entry.classification = 'gen'; entry.confidence = 'high'; return entry; }
          if (deny.includes(al)) { entry.classification = 'encoder'; entry.confidence = 'high'; return entry; }
        }
      }
      entry.classification = 'unknown'; entry.confidence = 'low'; return entry;
    }
    if (fetchResult.status === 'no-config') {
      // fallback heuristics
      const pipeline = rawModel.pipeline_tag || '';
      if (pipeline && pipeline.startsWith('text-generation')) { entry.classification = 'gen'; entry.confidence = 'medium'; }
      else entry.classification = 'unknown'; entry.confidence = 'low';
      entry.fetchStatus = '404';
      return entry;
    }
    if (fetchResult.status === 'error') {
      entry.classification = 'unknown'; entry.confidence = 'low'; entry.fetchStatus = 'error';
      entry.fetchError = { message: fetchResult.message, code: fetchResult.code };
      return entry;
    }
    return entry;
  }
}

// helper to extract generated text from various runtime outputs
function extractText(output) {
  // typical shapes: [{ generated_text: '...' }] or [{ text: '...' }] or string
  try {
    if (!output) return '';
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output.length > 0) {
      return output.map(el => {
        if (el.generated_text) return el.generated_text;
        if (el.text) return el.text;
        // Some runtimes return an array of strings
        if (typeof el === 'string') return el;
      });
    }
    // Fallback: try JSON stringify
    return String(output);
  } catch (e) {
    return '';
  }
}