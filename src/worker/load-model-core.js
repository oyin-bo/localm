// @ts-check

import { pipeline } from '@huggingface/transformers';

/**
 * @param {{
 *  modelName: string,
 *  device: import('@huggingface/transformers').DeviceType,
 *  onProgress?: import('@huggingface/transformers').ProgressCallback
 * }} _
 */
export async function loadModelCore({
  modelName,
  device,
  onProgress
}) {
  // Heuristic: when modelName points at a local-served path (starts with '/' or 'http'),
  // probe a few candidate base URLs to find where config/tokenizer actually live.
  // This helps when assets are under `/resolve/main/` or at the repo root.
  async function exists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      return r.ok;
    } catch (e) {
      return false;
    }
  }

  let chosenModelName = modelName;
  try {
  // Treat both '/models/owner/model' and 'models/owner/model' as local-hosted
  // mirrors so we probe and later install a fetch-rewrite. Also accept http(s) URLs.
  const isLocalLike = (/^\/?models\//).test(modelName) || /^https?:\/\//.test(modelName);
    if (isLocalLike) {
      const candidates = [];
      // as-provided
      candidates.push(modelName.replace(/\/$/, ''));
      // if modelName doesn't end with resolve/main, try adding it
      if (!/\/resolve\/main\/?$/.test(modelName)) {
        candidates.push(modelName.replace(/\/$/, '') + '/resolve/main');
      }
      // try parent directory (strip /resolve/main)
      candidates.push(modelName.replace(/\/resolve\/main\/?$/, '').replace(/\/$/, ''));

      // Deduplicate while preserving order
      const seen = new Set();
      const uniq = candidates.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });

      for (const base of uniq) {
  const cfg = (base.endsWith('/')) ? base + 'config.json' : base + '/config.json';
  const tokJson = (base.endsWith('/')) ? base + 'tokenizer.json' : base + '/tokenizer.json';
  const tokModel = (base.endsWith('/')) ? base + 'tokenizer.model' : base + '/tokenizer.model';
  const tokCfg = (base.endsWith('/')) ? base + 'tokenizer_config.json' : base + '/tokenizer_config.json';
        // Probe both config and tokenizer (tokenizer may be large but HEAD is cheap)
  const hasCfg = await exists(cfg);
  // Accept either Hugging Face tokenizer.json or SentencePiece tokenizer.model + tokenizer_config.json
  const hasTokJson = await exists(tokJson);
  const hasTokModel = await exists(tokModel);
  const hasTokCfg = await exists(tokCfg);
  const hasTok = hasTokJson || (hasTokModel && hasTokCfg);
  console.log('Probing model base', base, 'config:', hasCfg, 'tokenizer.json:', hasTokJson, 'tokenizer.model+config:', hasTokModel && hasTokCfg);
  if (hasCfg && hasTok) {
          chosenModelName = base.replace(/\/$/, '');
          break;
        }
      }
    }
  } catch (e) {
    console.log('Local model probing failed: ', String(e));
  }

  // transformers.js expects a Hugging Face-style model id like 'owner/model'.
  // If the user provided a local path (e.g. '/models/owner/model/resolve/main'),
  // derive owner/model and pass that to pipeline, but install a fetch wrapper
  // that rewrites requests to huggingface.co/<owner>/<model>/resolve/main/... -> local dev server files.
  let pipelineModelId = chosenModelName;
  let rewriteOwner = null;
  let rewriteModel = null;
  try {
    // Accept both '/models/owner/model' and 'models/owner/model' forms.
    if (typeof chosenModelName === 'string' && (/^\/?models\//).test(chosenModelName)) {
      // Expected form: [/]<models>/<owner>/<model>[/resolve/main]
      const m = chosenModelName.match(/^\/?models\/([^\/]+)\/([^\/]+)(?:\/resolve\/main)?\/?$/);
      if (m) {
        rewriteOwner = m[1];
        rewriteModel = m[2];
        pipelineModelId = `${rewriteOwner}/${rewriteModel}`;
      }
    }
  } catch (e) {
    console.log('Failed to derive owner/model from local path:', String(e));
  }

  console.log('Creating pipeline for', pipelineModelId, 'device', device);
  // Temporary fetch wrapper: if transformers.js tries to download files from
  // https://huggingface.co/<owner>/<model>/resolve/main/<file>
  // rewrite those requests to the local dev server path we probed earlier.
  const origFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch : null;
  let wrapped = false;
  if (origFetch && rewriteOwner && rewriteModel) {
    try {
      const localBase = pipelineModelId && typeof chosenModelName === 'string' ?
        (chosenModelName.replace(/\/$/, '') + '/') : null;
      globalThis.fetch = async function(input, init) {
        try {
          let urlStr = '';
          if (typeof input === 'string') urlStr = input;
          else if (input instanceof Request) urlStr = input.url;
          else {
            // cast to any to avoid TS complaining about unknown input shapes
            try {
              const anyInput = /** @type {any} */ (input);
              if (anyInput && anyInput.url) urlStr = String(anyInput.url);
            } catch (e) {}
          }

          // Match HF model asset URLs like https://huggingface.co/<owner>/<model>/resolve/main/<file>
          const hfMatch = urlStr.match(new RegExp('^https?:\\/\\/huggingface\\.co\\/' + rewriteOwner + '\\/' + rewriteModel + '\\/(?:resolve\\/main\\/)?(.*)$'));
          if (hfMatch && localBase) {
            const filePath = hfMatch[1];
            const localUrl = localBase + filePath;
            return origFetch.call(this, localUrl, init);
          }
        } catch (e) {
          // fall through to default
        }
        return origFetch.call(this, input, init);
      };
      wrapped = true;
    } catch (e) {
      console.log('Could not install fetch wrapper:', String(e));
    }
  }

  try {
    const pipe = await pipeline(
      'text-generation',
      pipelineModelId,
      {
        device,
        progress_callback: (progress) => {
          if (onProgress) onProgress(progress);
        }
      });

    return pipe;
  } finally {
    // restore original fetch
    try {
      if (wrapped && origFetch) {
        globalThis.fetch = origFetch;
      }
    } catch (e) {
      // ignore
    }
  }
}