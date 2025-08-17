// @ts-check

// Use a normal static import from the official package. This keeps import semantics
// predictable and lets your bundler (esbuild) resolve the package during build.
import * as hf from '@huggingface/transformers';

export function bootWorker() {
  // Report starting
  try {
    self.postMessage({ type: 'status', status: 'initializing' });
  } catch (e) {
    // ignore if postMessage not available for some reason
  }

  (async () => {
    // Use the imported @huggingface/transformers module
    let transformersLib = hf;
    try {
      if (!transformersLib) throw new Error('transformers module not available');
      self.postMessage({ type: 'status', status: 'transformers-loaded', source: '@huggingface/transformers' });
    } catch (err) {
      self.postMessage({ type: 'status', status: 'transformers-load-failed', error: String(err) });
    }

    // Minimal in-worker state for later model operations
    const availableModels = [
      'Xenova/phi-3-mini-4k-instruct',
      'Xenova/phi-1.5',
      'Xenova/all-MiniLM-L6-v2'
    ];
    let currentModel = null;

    // signal ready to main thread
    self.postMessage({ type: 'ready' });

    // handle incoming requests from the UI thread
    self.addEventListener('message', async (ev) => {
      const msg = ev.data || {};
      const id = msg.id;
      try {
        if (msg.type === 'listModels') {
          self.postMessage({ id, type: 'response', result: availableModels });
        } else if (msg.type === 'loadModel') {
          const modelName = msg.model;
          // TODO: replace with real model loading code using transformersLib
          await new Promise((r) => setTimeout(r, 150));
          currentModel = modelName;
          self.postMessage({ id, type: 'response', result: { model: modelName, status: 'loaded' } });
        } else if (msg.type === 'runPrompt') {
          const prompt = msg.prompt || '';
          // TODO: run the prompt with transformersLib pipeline once integrated
          const text = `Worker(${currentModel || 'no-model'}): ${prompt}`;
          self.postMessage({ id, type: 'response', result: text });
        } else {
          if (id) self.postMessage({ id, type: 'error', error: 'unknown-message-type' });
        }
      } catch (err) {
        if (id) self.postMessage({ id, type: 'error', error: String(err) });
      }
    });
  })();
}