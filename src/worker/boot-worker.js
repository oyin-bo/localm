// @ts-check

import { ModelCache } from './model-cache';

export function bootWorker() {
  const modelCache = new ModelCache();
  // Report starting
  try {
    self.postMessage({ type: 'status', status: 'initializing' });
  } catch (e) {
    // ignore if postMessage not available for some reason
  }

  self.postMessage({ type: 'status', status: 'backend-detected', backend: modelCache.backend });


  // signal ready to main thread (worker script loaded; model runtime may still be pending)
  self.postMessage({ type: 'ready' });

  // handle incoming requests from the UI thread
  self.addEventListener('message', handleMessage);

  async function handleMessage({ data }) {
    const { id } = data;
    try {
      if (data.type === 'listModels') {
        self.postMessage({ id, type: 'response', result: modelCache.knownModels });
      } else if (data.type === 'loadModel') {
        const { modelName = modelCache.knownModels[0] } = data;
        try {
          const pipe = await modelCache.getModel({ modelName });
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

  async function handleRunPrompt({ prompt, modelName = modelCache.knownModels[0], id, options }) {
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
}

// helper to extract generated text from various runtime outputs
function extractText(output) {
  // typical shapes: [{ generated_text: '...' }] or [{ text: '...' }] or string
  try {
    if (!output) return '';
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output.length > 0) {
      const el = output[0];
      if (el.generated_text) return el.generated_text;
      if (el.text) return el.text;
      // Some runtimes return an array of strings
      if (typeof el === 'string') return el;
    }
    // Fallback: try JSON stringify
    return String(output);
  } catch (e) {
    return '';
  }
}