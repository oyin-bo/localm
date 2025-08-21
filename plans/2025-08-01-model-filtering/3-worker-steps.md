# Worker implementation steps — detailed

Purpose: give an exact, actionable sequence to implement the `listChatModels` worker action. This is an engineering-level checklist that can be followed to implement the worker reliably and safely against the HF API.

Summary plan (one-liner)
- Implement a worker action `listChatModels` that: (A) fetches up to 5,000 model listings from HF in paginated batches, (B) runs a fast local pre-filter to reduce the candidate set, (C) fetches each candidate's `config.json` concurrently using a promise-pool with retries/backoff, (D) classifies models and streams small delta progress messages back to the main thread, and (E) returns a final list and meta summary.

Checklist (top-level)
- [ ] Add worker action skeleton and registration: `src/worker/actions/list-chat-models.js` + registry entry.
- [ ] Implement HF listing pagination & batching (up to 5k total models).
- [ ] Implement preFilter (pipeline tags, repo-name patterns, required siblings check, MAX_CANDIDATES cap).
- [ ] Implement promise-pool config fetcher with timeout/retries/backoff and fallbacks for config paths.
- [ ] Implement classification logic (deny-list/allow-list + heuristics fallback) and attach confidence.
- [ ] Stream `listChatModels:progress` deltas and emit `listChatModels:done` with meta.
- [ ] Add cancellation support and robust per-model error handling.
- [ ] Instrument telemetry events (fetch counts, status codes, durations, rate-limited events).

Detailed steps

1) Worker action skeleton
- File: `src/worker/actions/list-chat-models.js`
- Export a handler with signature: async function handleListChatModels({ id, params, postMessage }) where `postMessage` sends messages back to main thread in the worker environment.
- Register this handler in your worker registry file (where other actions are registered).

2) Parse params and set constants
- Accept params: { maxCandidates = 250, concurrency = 12, hfToken = null, timeoutMs = 10000, maxListing = 5000 }.
- Important derived limits: MAX_TOTAL_TO_FETCH = Math.min(maxListing, 5000).
- Backoff/retry constants: RETRIES = 3, BACKOFF_BASE_MS = 200, JITTER_MS = 100.

3) HF listing pagination (assemble candidate list)
- Use the HF models list endpoint with pagination (the repo already calls HF; mirror how existing code fetches models). Fetch in pages and accumulate results until you have MAX_TOTAL_TO_FETCH or the API signals end.
- Batch size per page: choose HF's default or 100 per page depending on API. Stop early if the server returns empty pages.
- Respect rate-limits: if you get 429 on listing, back off (exponential) and retry a few times, but keep aggregating partial results and proceed to pre-filter with what you have if listing is slow.
- Outcome: array `listingCandidates[]` of raw HF model metadata (id, siblings, pipeline_tag, tags, etc.). Post a progress message: { action:'listChatModels:progress', id, status:'listing_done', delta:{ totalFound: listingCandidates.length } }

4) Pre-filter (local, fast)
- Input: `listingCandidates[]`.
- Rules (conservative):
	- Exclude models with pipeline_tag in { 'feature-extraction','fill-mask','sentence-similarity','masked-lm' }.
	- Exclude repos whose id matches `/sentence-transformers/` or other curated deny patterns.
	- Exclude models missing required siblings: if your runtime requires ONNX check that a .onnx sibling exists; always check for some tokenizer file presence (tokenizer.json / vocab.* / merges.txt) and exclude if absent.
	- If size estimation or metadata shows extremely large models and you want a size cap, filter here.
	- After filtering, cap survivors to `maxCandidates` (default 250) by priority (e.g., pipeline_tag preference or popularity if available).
- Emit one aggregated `prefiltered` progress delta with counts and optionally per-model minimal entries, e.g. postMessage({ action:'listChatModels:progress', id, status:'prefiltered', delta:{ survivors: survivors.length } })

5) Promise-pool config fetcher
- Implement a promise pool / worker queue to fetch config.json for each survivor with concurrency `concurrency`.
- Per-model fetch function (fetchConfigForModel(modelId)):
	1. Prepare URLs to try in order: `/resolve/main/config.json`, `/resolve/main/config/config.json`, `/resolve/main/adapter_config.json`.
	2. For each URL attempt: perform fetch with Authorization header if hfToken provided.
	3. Apply per-request timeout (abort controller) using `timeoutMs`.
	4. On 200: parse JSON, extract `model_type` and `architectures` (array if present). Return `{ status:'ok', model_type, architectures }`.
	5. On 401/403: return `{ status:'auth', code: resp.status }`.
	6. On 404: continue to next fallback; if all fallbacks 404, return `{ status:'no-config' }`.
	7. On 429 or transient network errors: retry up to RETRIES with exponential backoff: wait = BACKOFF_BASE_MS * 2**attempt + random(0..JITTER_MS).
	8. If retries exhausted, return `{ status:'error', code, message }`.
- Emit per-model progress: when fetch starts -> post progress { status:'config_fetching', modelId }, when result -> post { status:'classified', modelId, delta:{ model_type, architectures, fetchStatus } }.

6) Classification logic
- Given fetch result and original model metadata, implement classify(model, fetchResult):
	- If fetchResult.status === 'auth' -> classification = 'auth-protected', confidence = 'high'.
	- If fetchResult.status === 'ok':
		 * If model_type in DENY_LIST_MODEL_TYPE -> 'encoder' (high confidence).
		 * Else if model_type or architectures contains any ALLOW_LIST_MODEL_TYPE -> 'gen' (high confidence).
		 * Else -> 'unknown' (low confidence).
	- If fetchResult.status === 'no-config' -> run heuristic fallback using pipeline_tag/tags/name -> set 'unknown' or 'gen'/'encoder' with medium/low confidence.
	- If fetchResult.status === 'error' -> classification = 'unknown', confidence = 'low', attach fetchError.
- Attach classification, confidence, model_type, architectures, fetchStatus to ModelEntry.

7) Streaming deltas and finalizing
- Always stream small deltas (modelId + changed fields). Example messages:
	- { action:'listChatModels:progress', id, modelId, status:'config_fetching', delta:null }
	- { action:'listChatModels:progress', id, modelId, status:'classified', delta:{ classification:'gen', confidence:'high', model_type:'gpt2' } }
- After all models are processed, assemble final `models[]` (ModelEntry minimal fields) and post `{ action:'listChatModels:done', id, models, meta:{ fetched: totalFetched, filtered: survivors.length, errors } }`.

8) Cancellation
- Support cancellation by listening for a `cancelLoad`-style message from main thread with the same `id`. On cancel, stop launching new fetches, abort in-flight fetches (via AbortController), and send a final `listChatModels:error` with code 'cancelled' and partial meta.

9) Error handling and rate-limiting mitigation
- Per-model failures are non-fatal; collect into `errors[]` for meta.
- If the pool experiences a high ratio of 429 responses, reduce concurrency by half and continue; include `rate_limited:true` in final meta if observed frequently.
- If the listing fetch fails fatally (network down) return `listChatModels:error` with code 'listing_failed' and message.

10) Telemetry & logging
- Emit telemetry counters (send to your existing telemetry mechanism): configFetch.total, configFetch.200, configFetch.404, configFetch.401, configFetch.403, configFetch.429, configFetch.error, classification.gen, classification.encoder, classification.unknown, runtime.unsupportedModel (later).
- Track durations: per-config fetch duration histogram for tuning concurrency/timeouts.

11) Memory & performance considerations
- Avoid holding large copies of HF listing; process pages incrementally and drop unneeded fields.
- Cap number of survivors to `maxCandidates` early to keep memory bounded.

12) Integration hooks
- Provide hooks to accept a pre-fetched listing from the main thread: params.listing (array). If provided, skip HF listing pagination and start at pre-filter.
- Expose a small debug mode via params.debug:true that returns per-model raw fetch errors in meta (useful during staging).

Files to modify/create
- Add: `src/worker/actions/list-chat-models.js`
- Edit: `src/worker/worker-registry.js` (or equivalent) to register the new action
- Edit: `src/app/worker-connection.js` to support the new action and cancellation messages

Notes
- This document focuses on an implementable worker logic; UI integration and caching come later. Keep messages minimal to avoid copying big objects between worker and main thread.

Generated: 2025-08-21

