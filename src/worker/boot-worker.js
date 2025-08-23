// @ts-check

import { ModelCache } from './model-cache';
import { listChatModelsIterator } from './list-chat-models.js';

import curatedList from './curated-model-list.json' assert { type: 'json' };

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
      if (data.type === 'listChatModels') {
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
      const out = await pipe(prompt, {
        max_new_tokens: 250,        // Increase from default
        temperature: 0.7,
        do_sample: true,
        pad_token_id: pipe.tokenizer.eos_token_id,
        return_full_text: false,     // Only return the generated text
        ...options
      });
      const text = extractText(out);
      self.postMessage({ id, type: 'status', status: 'inference-done', model: modelName });
      self.postMessage({ id, type: 'response', result: text });
    } catch (err) {
      self.postMessage({ id, type: 'error', error: String(err) });
    }
  }

  // Implementation of the listChatModels worker action using the async-iterator action.
  async function handleListChatModels({ id, params = {} }) {

    self.postMessage({ id, type: 'response', result: { models: curatedList } });
    return;

    const iterator = listChatModelsIterator(params);
    let sawDone = false;
    // batching buffer
    let batchBuffer = [];
    let batchTimer = null;
    const BATCH_MS = 50;
    const BATCH_MAX = 50;

    function flushBatch() {
      if (!batchBuffer || batchBuffer.length === 0) return;
      try {
        console.log('Loading: ', batchBuffer[batchBuffer.length - 1]);
        self.postMessage({ id, type: 'progress', batch: true, items: batchBuffer.splice(0) });
      } catch (e) {}
      if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    }

    function enqueueProgress(delta) {
      batchBuffer.push(delta);
      if (batchBuffer.length >= BATCH_MAX) return flushBatch();
      if (!batchTimer) {
        batchTimer = setTimeout(() => { flushBatch(); }, BATCH_MS);
      }
    }

    activeTasks.set(id, { abort: () => iterator.return() });
    let lastBatchDelta;
    try {
      for await (const delta of iterator) {
        try { enqueueProgress(delta); } catch (e) { }
        if (delta.models) lastBatchDelta = delta;
        if (delta && delta.status === 'done') {
          sawDone = true;
        }
      }

      // flush any remaining progress messages synchronously
      flushBatch();
      if (!sawDone) {
        // iterator exited early (likely cancelled)
        self.postMessage({ id, type: 'response', result: { cancelled: true } });
      } else {
        self.postMessage({ id, type: 'response', result: lastBatchDelta });
      }
    } catch (err) {
      flushBatch();
      self.postMessage({ id, type: 'error', error: String(err), code: err.code || null });
    } finally {
      activeTasks.delete(id);
    }
  }

  // helper: fetchConfigForModel
  // Note: fetchConfigForModel and classifyModel were moved to the
  // `src/worker/list-chat-models.js` async-iterator action. Keep this file
  // minimal and delegate to the iterator for listing/classification logic.
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