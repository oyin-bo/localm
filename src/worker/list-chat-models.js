// Minimal async-iterator implementation of the listChatModels pipeline.
// Yields plain JSON-serializable progress objects. Uses per-request AbortControllers
// and a finally block so iterator.return() causes cleanup.

export async function* listChatModelsIterator(params = {}) {
  const opts = Object.assign({ maxCandidates: 250, concurrency: 12, hfToken: null, timeoutMs: 10000, maxListing: 5000 }, params || {});
  const { maxCandidates, concurrency, hfToken, timeoutMs, maxListing } = opts;
  const MAX_TOTAL_TO_FETCH = Math.min(maxListing, 5000);
  const PAGE_SIZE = 100;
  const RETRIES = 3;
  const BACKOFF_BASE_MS = 200;

  const inFlight = new Set();

  async function fetchWithController(url, init = {}) {
    const c = new AbortController();
    inFlight.add(c);
    try {
      const merged = Object.assign({}, init, { signal: c.signal });
      const resp = await fetch(url, merged);
      return resp;
    } finally {
      inFlight.delete(c);
    }
  }

  // helper: fetchConfigForModel (tries multiple paths, per-request timeouts & retries)
  async function fetchConfigForModel(modelId) {
    const urls = [
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config.json`,
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config/config.json`,
      `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/adapter_config.json`
    ];
    for (const url of urls) {
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        // per-request timeout via race
        const controller = new AbortController();
        inFlight.add(controller);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(url, { signal: controller.signal, headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {} });
          clearTimeout(timeout);
          inFlight.delete(controller);
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
          return { status: 'error', code: resp.status, message: `fetch failed ${resp.status}` };
        } catch (err) {
          clearTimeout(timeout);
          inFlight.delete(controller);
          if (attempt === RETRIES) return { status: 'error', message: String(err) };
          const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    return { status: 'no-config' };
  }

  function classifyModel(rawModel, fetchResult) {
    const id = rawModel.modelId || rawModel.id || rawModel.model || rawModel.modelId;
    const entry = { id, model_type: null, architectures: null, classification: 'unknown', confidence: 'low', fetchStatus: 'error' };
    if (!fetchResult) return entry;
    if (fetchResult.status === 'auth') {
      entry.classification = 'auth-protected'; entry.confidence = 'high'; entry.fetchStatus = String(fetchResult.code || 401);
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
        for (let i = 0; i < arch.length; i++) {
          const a = String(arch[i]).toLowerCase();
          if (allow.includes(a)) { entry.classification = 'gen'; entry.confidence = 'high'; return entry; }
          if (deny.includes(a)) { entry.classification = 'encoder'; entry.confidence = 'high'; return entry; }
        }
      }
      entry.classification = 'unknown'; entry.confidence = 'low'; return entry;
    }
    if (fetchResult.status === 'no-config') {
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

  // Main pipeline
  let listing = [];
  try {
    // 1) listing
    let offset = 0;
    while (listing.length < MAX_TOTAL_TO_FETCH) {
      const url = `https://huggingface.co/api/models?full=true&limit=${PAGE_SIZE}&offset=${offset}`;
      let ok = false;
      for (let attempt = 0; attempt <= RETRIES && !ok; attempt++) {
        try {
          const resp = await fetch(url, { headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {} });
          if (resp.status === 429) {
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          if (!resp.ok) throw Object.assign(new Error(`listing-fetch-failed:${resp.status}`), { code: 'listing_fetch_failed', status: resp.status });
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

    // emit listing_done
    yield { status: 'listing_done', totalFound: listing.length };

    // 2) prefilter
    const denyPipeline = new Set(['feature-extraction', 'fill-mask', 'sentence-similarity', 'masked-lm']);
    const survivors = [];
    for (const m of listing) {
      if (survivors.length >= maxCandidates) break;
      const pipeline = m.pipeline_tag;
      if (pipeline && denyPipeline.has(pipeline)) continue;
      if (typeof m.modelId === 'string' && m.modelId.includes('sentence-transformers')) continue;
      const siblings = m.siblings || [];
      const hasTokenizer = siblings.some(s => /tokenizer|vocab|merges|sentencepiece/i.test(s));
      if (!hasTokenizer) continue;
      survivors.push(m);
    }

    yield { status: 'prefiltered', survivors: survivors.length };

    // 3) concurrent config fetch & classify using an event queue so workers can emit
    // progress while the generator yields them.
    const results = [];
    const errors = [];
    let idx = 0;
    let processed = 0;
    const events = [];
    let resolveNext = null;
    function emit(ev) {
      events.push(ev);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    }
    async function nextEvent() {
      while (events.length === 0) {
        await new Promise(r => { resolveNext = r; });
      }
      return events.shift();
    }

    const workerCount = Math.min(concurrency, survivors.length || 1);
    const pool = new Array(workerCount).fill(0).map(async () => {
      while (true) {
        const i = idx++;
        if (i >= survivors.length) break;
        const model = survivors[i];
        const modelId = model.modelId || model.id || model.model || model.modelId;
        try {
          emit({ modelId, status: 'config_fetching' });
          const fetchResult = await fetchConfigForModel(modelId);
          const entry = classifyModel(model, fetchResult);
          results.push(entry);
          emit({ modelId, status: 'classified', data: entry });
        } catch (err) {
          errors.push({ modelId, message: String(err) });
          emit({ modelId, status: 'error', data: { message: String(err) } });
        } finally {
          processed++;
        }
      }
    });

    // consume events as workers produce them
    while (processed < survivors.length) {
      const ev = await nextEvent();
      yield ev;
    }

    // make sure any remaining events are yielded
    while (events.length > 0) {
      yield events.shift();
    }

    await Promise.all(pool);

    // final
    const models = results.map(r => ({ id: r.id, model_type: r.model_type, architectures: r.architectures, classification: r.classification, confidence: r.confidence, fetchStatus: r.fetchStatus }));
    const meta = { fetched: listing.length, filtered: survivors.length, errors };
    yield { status: 'done', models, meta };
  } finally {
    // abort any in-flight fetches if iteration stopped early
    for (const c of Array.from(inFlight)) try { c.abort(); } catch (e) {}
  }
}
