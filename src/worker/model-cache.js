// @ts-check

import { pipeline } from '@huggingface/transformers';
import { loadModelCore } from './load-model-core';

export class ModelCache {
  cache = new Map();
  /** @type {import('@huggingface/transformers').DeviceType | undefined} */
  backend = undefined;

  knownModels = [
    'Xenova/llama2.c-stories15M', // nonsense
    'Xenova/phi-3-mini-4k-instruct',
    'Xenova/all-MiniLM-L6-v2', // unsupported model type: bert
    'Xenova/phi-1.5', // gated
    'Qwen/Qwen2.5-3B', // cannot be loaded
    'microsoft/phi-1_5', // cannot be loaded
    'FlofloB/100k_fineweb_continued_pretraining_Qwen2.5-0.5B-Instruct_Unsloth_merged_16bit', // cannot be loaded 
    'ehristoforu/coolqwen-3b-it' // cannot be loaded
  ];

  /**
   * @param {{
   *  modelName: string
   * }} _
   */
  getModel({ modelName }) {
    return this.cache.get(modelName) || this._loadModelAndStore({ modelName });
  }

  /**
   * @param {{
   *  modelName: string
   * }} _
   */
  _loadModelAndStore({ modelName }) {
    if (!this.backend) this.backend = detectTransformersBackend();
    // Create a loader promise that will try multiple backends in order.
    const loader = (async () => {
      const tried = [];
      // candidate order: detected backend first, then common fallbacks
      let candidates = ['webgpu', 'gpu', 'wasm'];
      candidates = ['gpu', 'wasm'];
      candidates = candidates.slice(candidates.indexOf(this.backend || 'wasm'));

      let lastErr = null;
      console.log('Trying candidates ', candidates);
      for (const device of candidates) {
        try {
          const model = await loadModelCore({
            modelName,
            device: /** @type {import('@huggingface/transformers').DeviceType} */ (device)
          });
          // on success, update backend to the working device and store model
          this.backend = /** @type {import('@huggingface/transformers').DeviceType} */ (device);
          this.cache.set(modelName, model);
          return model;
        } catch (err) {
          console.log('Failed ', device, ' ', err);
          tried.push({ device, error: err.stack || String(err) });
          lastErr = err;
          // continue to next candidate
        }
      }

      // none succeeded
      const err = new Error(`no available backend found. attempts=${JSON.stringify(tried)}; last=${String(lastErr)}`);
      throw err;
    })();

    // store the in-progress promise so concurrent requests reuse it
    this.cache.set(modelName, loader);
    loader.then(
      (model) => {
        // on success, loader already stored the model
        this.cache.set(modelName, model);
      },
      () => {
        this.cache.delete(modelName);
      }
    );

    return loader;
  }

}

export function detectTransformersBackend() {
  /**
   * Detect available acceleration backends
   * @type {import('@huggingface/transformers').DeviceType}
   */
  let backend = 'wasm';
  try {
    const hasWebGPU = typeof navigator !== 'undefined' && !!/** @type {*} */(navigator).gpu;
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
    else if (hasWebGL2) backend = 'gpu';
  } catch (e) {
    backend = 'wasm';
  }

  return backend;
}