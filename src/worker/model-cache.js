// @ts-check

import { pipeline } from '@huggingface/transformers';
import { loadModelCore } from './load-model-core';

export class ModelCache {
  cache = new Map();
  /** @type {import('@huggingface/transformers').DeviceType | undefined} */
  backend = undefined;

  knownModels = [
    'Xenova/phi-1.5',
    'Xenova/phi-3-mini-4k-instruct',
    'Xenova/all-MiniLM-L6-v2'
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
    const modelPromise = loadModelCore({
      modelName,
      device: this.backend
    });
    this.cache.set(modelName, modelPromise);
    modelPromise.then(
      model => {
        this.cache.set(modelName, model);
      },
      () => {
        this.cache.delete(modelName);
      });
    
    return modelPromise;
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