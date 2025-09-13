// @ts-check

import { pipeline, env } from '@huggingface/transformers';
import * as webllm from '@mlc-ai/web-llm';

import { loadModelCore } from './load-model-core';

export class ModelCache {
  cache = new Map();
  /** @type {import('@huggingface/transformers').DeviceType | undefined} */
  backend = undefined;
  /** @type {{ possible: boolean, lastError?: string } | undefined} */
  webllmProbe = undefined;

  env = env;

  knownModels = [
    'Xenova/llama2.c-stories15M', // nonsense
    'Xenova/phi-3-mini-4k-instruct', // huge
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
   * @return {ReturnType<typeof this._loadModelAndStore>}
   */
  getModel({ modelName }) {
    return this.cache.get(modelName) || this._loadModelAndStore({ modelName });
  }

  /**
   * Lightweight probe to detect WebLLM API availability (advisory only)
   */
  probeWebLLM() {
    if (this.webllmProbe) return this.webllmProbe;
    
    try {
      // Check if basic WebLLM APIs are available
      const hasWebLLM = typeof webllm?.CreateMLCEngine === 'function' && 
                        typeof webllm?.prebuiltAppConfig !== 'undefined';
      this.webllmProbe = { possible: hasWebLLM };
    } catch (err) {
      this.webllmProbe = { possible: false, lastError: String(err) };
    }
    
    return this.webllmProbe;
  }

  /**
   * @param {{
   *  modelName: string
   * }} _
   */
  _loadModelAndStore({ modelName }) {
    if (!this.backend) this.backend = detectTransformersBackend();
    // Create a loader promise that will try multiple backends in order.
    const loader = this._loadWebLLMOrFallbackToTransformersModelNow({ modelName });

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

  async _loadWebLLMOrFallbackToTransformersModelNow({ modelName }) {
    const probe = this.probeWebLLM();
    
    // Try WebLLM first if probe suggests it's possible
    if (probe.possible) {
      try {
        // Derive a sensible WebLLM model id (prefer owner/model when supplied)
        let webLLMId = modelName;
        try {
          // Accept both '/models/owner/model' and 'models/owner/model' forms.
          if (typeof modelName === 'string' && (/^\/?models\//).test(modelName)) {
            const m = modelName.match(/^\/?models\/([^\/]+)\/([^\/]+)(?:\/resolve\/main)?\/?$/);
            if (m) webLLMId = `${m[1]}/${m[2]}`;
            else webLLMId = String(modelName).replace(/^\//, '');
          } else if (typeof modelName === 'string' && modelName.includes('/')) {
            // use as-is owner/model
            webLLMId = modelName;
          } else {
            webLLMId = String(modelName).split('/').pop() || String(modelName);
          }
        } catch (e) {
          webLLMId = String(modelName).split('/').pop() || String(modelName);
        }

  console.log(`Loading ${webLLMId} via WebLLM...`);

  // The web-llm engine looks up the provided model id in appConfig.model_list.
  // Many prebuilt entries use short model_ids like "gemma-2b-it-q4f16_1-MLC" rather than
  // owner/model (google/gemma-2b). To increase the chance of a match, when we detect a
  // local Gemma path choose a known prebuilt Gemma model_id and use it as the engine id.
  let engineRequestedId = webLLMId;

        // Prepare an appConfig that includes a mapping for this model id
        // so WebLLM can locate the local safetensors files served by the dev server.
        const baseAppConfig = webllm.prebuiltAppConfig ? JSON.parse(JSON.stringify(webllm.prebuiltAppConfig)) : {};
        try {
            // Ensure model_list is an array (prebuiltAppConfig uses an array)
            if (!baseAppConfig.model_list) baseAppConfig.model_list = [];
            // If the prebuilt appConfig already contains a gemma entry, prefer
            // that exact model_id so our engineRequestedId matches what the
            // runtime expects. This helps avoid mismatches from similar ids.
            try {
              if (Array.isArray(baseAppConfig.model_list)) {
                const gemmaEntry = baseAppConfig.model_list.find(e => e && typeof e.model_id === 'string' && /gemma/i.test(e.model_id));
                if (gemmaEntry && gemmaEntry.model_id) {
                  engineRequestedId = gemmaEntry.model_id;
                }
              }
            } catch (e) {
              // ignore
            }
            // Helper to push a model_list entry if it doesn't already exist
            const pushModelListEntry = (entry) => {
              try {
                if (!Array.isArray(baseAppConfig.model_list)) baseAppConfig.model_list = [];
                const exists = baseAppConfig.model_list.find(e => e && (e.model_id === entry.model_id || e.model === entry.model));
                if (!exists) {
                  // put injected entries at the front so engine lookup sees them first
                  baseAppConfig.model_list.unshift(entry);
                }
              } catch (e) {
                // ignore
              }
            };

            // If modelName is a local-served path, derive its HTTP base
            if (typeof modelName === 'string' && modelName.startsWith('/models/')) {
              const origin = (typeof self !== 'undefined' && self.location && self.location.origin) ? self.location.origin : (typeof location !== 'undefined' ? location.origin : '');
              // Ensure we build a stable absolute URL for the local model base.
              // If modelName is a path like '/models/owner/model/resolve/main' keep the
              // leading slash; if it's missing, add it. Avoid using new URL with a
              // relative path that can append to the current document path and
              // produce duplicated segments (e.g. '/models/models/...').
              const cleaned = modelName.replace(/\/$/, '');
              const withLeading = cleaned.startsWith('/') ? cleaned : '/' + cleaned.replace(/^\/*/, '');
              const localBase = origin ? origin.replace(/\/$/, '') + withLeading : withLeading;
              // Create entries to mirror the prebuilt Gemma manifest exactly and
              // also point a local copy at our dev-server URLs. This increases
              // the chance the engine will find and accept the model record.
              if (/gemma-2b/i.test(localBase)) {
                engineRequestedId = 'gemma-2b-it-q4f16_1-MLC';
              }

              // Verbatim-style prebuilt gemma entry (same shape as webllm.prebuiltAppConfig)
              const prebuiltGemmaEntry = {
                model: 'https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC',
                model_id: 'gemma-2-2b-it-q4f16_1-MLC',
                model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
                vram_required_MB: 1895.3,
                low_resource_required: false,
                buffer_size_required_bytes: 262144000,
                required_features: ['shader-f16'],
                overrides: { context_window_size: 4096 }
              };

              pushModelListEntry(prebuiltGemmaEntry);

              // Local copy that points to our served files and uses the short id
              const localGemmaEntry = {
                model: localBase,
                model_id: engineRequestedId || prebuiltGemmaEntry.model_id,
                model_lib: prebuiltGemmaEntry.model_lib,
                model_type: 0,
                vram_required_MB: prebuiltGemmaEntry.vram_required_MB,
                buffer_size_required_bytes: prebuiltGemmaEntry.buffer_size_required_bytes,
                low_resource_required: prebuiltGemmaEntry.low_resource_required,
                required_features: prebuiltGemmaEntry.required_features,
                overrides: prebuiltGemmaEntry.overrides,
                weights: [localBase + '/model.safetensors'],
                tokenizer: localBase + '/tokenizer.model',
                tokenizer_config: localBase + '/tokenizer_config.json',
                config: localBase + '/config.json',
                format: 'safetensors',
                dtype: 'fp16'
              };

              pushModelListEntry(localGemmaEntry);

              // Also create a variant keyed by the owner/model string so engines
              // that look up that id will match; the files still point locally.
              const localGemmaOwnerKey = Object.assign({}, localGemmaEntry, { model_id: webLLMId });
              pushModelListEntry(localGemmaOwnerKey);

              // Some engine lookups are picky: they may compare against the
              // model field or expect a record whose `model` value equals the
              // requested id. Add a minimal mapping that uses the owner/model
              // string as both `model` and `model_id` to maximize matching
              // possibilities.
              try {
                pushModelListEntry({
                  model: webLLMId,
                  model_id: webLLMId,
                  model_lib: prebuiltGemmaEntry.model_lib,
                  model_type: 0,
                  vram_required_MB: prebuiltGemmaEntry.vram_required_MB,
                  buffer_size_required_bytes: prebuiltGemmaEntry.buffer_size_required_bytes,
                  low_resource_required: prebuiltGemmaEntry.low_resource_required,
                  required_features: prebuiltGemmaEntry.required_features,
                  overrides: prebuiltGemmaEntry.overrides,
                  weights: [localBase + '/model.safetensors'],
                  tokenizer: localBase + '/tokenizer.model',
                  tokenizer_config: localBase + '/tokenizer_config.json',
                  config: localBase + '/config.json',
                  format: 'safetensors',
                  dtype: 'fp16'
                });
              } catch (e) {
                // ignore
              }
            } else if (typeof modelName === 'string' && modelName.includes('/')) {
              // If modelName looks like owner/model (or 'models/owner/model') and we also have a local mirror
              // under /models, attempt to point at that mirror (best-effort). Normalize accidental
              // leading 'models' segments to avoid constructing '/models/models/...'.
              const parts = modelName.split('/').filter(p => p !== '');
              let owner = parts[0], model = parts[1];
              // If someone passed 'models/owner/model/...' shift the window
              if (owner === 'models' && parts.length >= 3) {
                owner = parts[1];
                model = parts[2];
              }
              const origin = (typeof self !== 'undefined' && self.location && self.location.origin) ? self.location.origin : (typeof location !== 'undefined' ? location.origin : '');
              const probeLocal = origin ? `${origin}/models/${owner}/${model}/resolve/main` : `/models/${owner}/${model}/resolve/main`;
              // If owner/model style was provided, also prefer a prebuilt gemma id when appropriate
              if (/gemma-2b/i.test(probeLocal)) {
                engineRequestedId = 'gemma-2b-it-q4f16_1-MLC';
              }

              pushModelListEntry({
                model: probeLocal,
                model_id: engineRequestedId,
                model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
                model_type: 0,
                vram_required_MB: 1895.3,
                buffer_size_required_bytes: 262144000,
                low_resource_required: false,
                required_features: ['shader-f16'],
                overrides: { context_window_size: 4096 },
                weights: [probeLocal + '/model.safetensors'],
                tokenizer: probeLocal + '/tokenizer.model',
                tokenizer_config: probeLocal + '/tokenizer_config.json',
                config: probeLocal + '/config.json',
                format: 'safetensors',
                dtype: 'fp16'
              });
              // Also insert an entry that uses the owner/model string as model_id
              // to handle engines that match against that id.
              pushModelListEntry({
                model: probeLocal,
                model_id: webLLMId,
                model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
                model_type: 0,
                vram_required_MB: 1895.3,
                buffer_size_required_bytes: 262144000,
                low_resource_required: false,
                required_features: ['shader-f16'],
                overrides: { context_window_size: 4096 },
                weights: [probeLocal + '/model.safetensors'],
                tokenizer: probeLocal + '/tokenizer.model',
                tokenizer_config: probeLocal + '/tokenizer_config.json',
                config: probeLocal + '/config.json',
                format: 'safetensors',
                dtype: 'fp16'
              });
            }
        } catch (e) {
          console.log('Failed to prepare WebLLM appConfig override:', String(e));
        }

        // Debug: print what appConfig we are passing so we can diagnose
        // why CreateMLCEngine may not find the model record.
        try {
          console.log('WebLLM appConfig for', webLLMId, JSON.stringify(baseAppConfig, null, 2));
          try {
            // Also print a concise list of model_ids/models present to help
            // quickly spot mismatches between the requested id and available
            // entries.
            const mappings = (Array.isArray(baseAppConfig.model_list) ? baseAppConfig.model_list : []).map(e => ({ model: e.model, model_id: e.model_id }));
            console.log('WebLLM appConfig mappings:', JSON.stringify(mappings, null, 2));
          } catch (e) {}
        } catch (e) {
          console.log('WebLLM appConfig (unserializable)');
        }

        // Debug: print which id we will request so we can correlate with the
        // engine error message about missing model records.
        try {
          console.log('Requesting CreateMLCEngine with engineRequestedId=', engineRequestedId, ' webLLMId=', webLLMId);
        } catch (e) {}

        // Try requesting the engine with the requested model id (which may be a
        // prebuilt short id like 'gemma-2b-it-q4f16_1-MLC'). The engine matches
        // against appConfig.model_list entries using the model_id field, so we
        // pass engineRequestedId when available to improve matching.
        const engine = await webllm.CreateMLCEngine(engineRequestedId || webLLMId, {
          appConfig: baseAppConfig
        });
        
        // Quick end-to-end validation: run a very small prompt to ensure the
        // engine responds correctly before caching it. If this fails we
        // throw so the outer catch falls back to Transformers.js.
        try {
          const webllmEngine = engine;
          const testResp = await webllmEngine.chat.completions.create({
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 8,
            temperature: 0.2
          });
          const testText = testResp?.choices?.[0]?.message?.content ?? '';
          if (!testText || String(testText).trim() === '') {
            throw new Error('WebLLM test prompt returned empty response');
          }
        } catch (e) {
          throw new Error('WebLLM validation failed: ' + String(e));
        }
        
        console.log(`WebLLM loaded: ${webLLMId}`);
        return engine;
      } catch (err) {
        console.log(`WebLLM failed for ${modelName}: ${err.message}`);
        // Fall through to Transformers.js
      }
    }

    // Fallback to Transformers.js
    return this._loadTransformersModelNow({ modelName });
  }

  async _loadTransformersModelNow({ modelName }) {
    // candidate order: detected backend first, then common fallbacks
    let candidates = ['webgpu', 'gpu', 'wasm'];
    // candidates = ['gpu', 'wasm'];
    candidates = candidates.slice(candidates.indexOf(this.backend || 'wasm'));
    candidates = ['auto'];// , 'wasm'];

    let errs = [];
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
        errs.push(device + ': ' + err.stack);
        // continue to next candidate
      }
    }

    // none succeeded
    const err = new Error(
      'Backends failed: ' + JSON.stringify(candidates) + ', errors:\n\n' +
      errs.join('\n\n'));
    throw err;
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