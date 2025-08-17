// @ts-check

import { pipeline } from '@huggingface/transformers';

export function bootWorker() {
  // Report starting
  try {
    self.postMessage({ type: 'status', status: 'initializing' });
  } catch (e) {
    // ignore if postMessage not available for some reason
  }

  (async () => {
  // named import `pipeline` is available from the bundled runtime

    // Detect available acceleration backends
    let backend = 'wasm';
    try {
      const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu;
      let hasWebGL2 = false;
      try {
        // In a worker environment prefer OffscreenCanvas to test webgl2
        if (typeof OffscreenCanvas !== 'undefined') {
          const c = new OffscreenCanvas(1, 1);
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          hasWebGL2 = !!gl;
        } else if (typeof document !== 'undefined') {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          hasWebGL2 = !!gl;
        }
      } catch (e) {
        hasWebGL2 = false;
      }

      if (hasWebGPU) backend = 'webgpu';
      else if (hasWebGL2) backend = 'webgl';
    } catch (e) {
      backend = 'wasm';
    }

    self.postMessage({ type: 'status', status: 'backend-detected', backend });

    // verify the named import is present
    try {
      if (!pipeline) throw new Error('transformers pipeline import not available');
      self.postMessage({ type: 'status', status: 'transformers-loaded', source: '@huggingface/transformers' });
    } catch (err) {
      self.postMessage({ type: 'status', status: 'transformers-load-failed', error: String(err) });
    }

    // Model cache to avoid loading the same model multiple times.
    // value = { promise, pipeline }
    const modelCache = new Map();

    const availableModels = [
      'Xenova/phi-3-mini-4k-instruct',
      'Xenova/phi-1.5',
      'Xenova/all-MiniLM-L6-v2'
    ];

    // signal ready to main thread (worker script loaded; model runtime may still be pending)
    self.postMessage({ type: 'ready' });

    // helper: create or return existing pipeline promise
    async function ensureModel(modelName, id) {
      if (modelCache.has(modelName)) {
        const entry = modelCache.get(modelName);
        // If pipeline already resolved, return it, otherwise await the promise
        if (entry.pipeline) return entry.pipeline;
        return entry.promise;
      }

      // create loader promise
      const loader = (async () => {
        if (!pipeline) {
          throw new Error('transformers runtime not available');
        }

        // Post progress and status
        if (id) self.postMessage({ id, type: 'status', status: 'model-loading', model: modelName });

        // Choose device hint as a literal union. Cast only at the call site if TypeScript
        // needs help narrowing.
        const deviceOption = backend === 'webgpu' ? 'webgpu' : (backend === 'webgl' ? 'gpu' : 'wasm');

        // Create a text-generation pipeline. Depending on the model this may
        // perform downloads of model weights; the library should report progress
        // via its own callbacks if available.
        const pipe = await pipeline('text-generation', modelName, /** @type {any} */ ({
          device: deviceOption,
          progress_callback: (progress) => {
            if (id) self.postMessage({ id, type: 'model-progress', progress, model: modelName });
          }
        }));

        // store pipeline for reuse
        const entry = modelCache.get(modelName) || {};
        entry.pipeline = pipe;
        modelCache.set(modelName, entry);

        if (id) self.postMessage({ id, type: 'status', status: 'model-loaded', model: modelName });
        return pipe;
      })();

      // temporarly store the in-progress promise so concurrent requests reuse it
      modelCache.set(modelName, { promise: loader });
      return loader;
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

    // handle incoming requests from the UI thread
    self.addEventListener('message', async (ev) => {
      const msg = ev.data || {};
      const id = msg.id;
      try {
        if (msg.type === 'listModels') {
          self.postMessage({ id, type: 'response', result: availableModels });
        } else if (msg.type === 'loadModel') {
          const modelName = msg.model;
          try {
            await ensureModel(modelName, id);
            self.postMessage({ id, type: 'response', result: { model: modelName, status: 'loaded' } });
          } catch (err) {
            self.postMessage({ id, type: 'error', error: String(err) });
          }
        } else if (msg.type === 'runPrompt') {
          const prompt = msg.prompt || '';
          const modelName = msg.model;
          try {
            const pipe = await ensureModel(modelName, id);
            // run the pipeline
            if (!pipe) throw new Error('pipeline not available');
            self.postMessage({ id, type: 'status', status: 'inference-start', model: modelName });
            const out = await pipe(prompt, msg.options || {});
            const text = extractText(out);
            self.postMessage({ id, type: 'status', status: 'inference-done', model: modelName });
            self.postMessage({ id, type: 'response', result: text });
          } catch (err) {
            self.postMessage({ id, type: 'error', error: String(err) });
          }
        } else {
          if (id) self.postMessage({ id, type: 'error', error: 'unknown-message-type' });
        }
      } catch (err) {
        if (id) self.postMessage({ id, type: 'error', error: String(err) });
      }
    });
  })();
}