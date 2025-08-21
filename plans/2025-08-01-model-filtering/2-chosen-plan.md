# Chosen plan — Hybrid Config-First + Heuristic (A/B hybrid)

This document contains the final, actionable implementation plan for the hybrid approach:
- Phase 1: fast, conservative pre-filter using heuristics to remove obvious non-chat models.
- Phase 2: full-fidelity classification by fetching each candidate repo's `config.json` (concurrently) to extract `model_type` and `architectures`, classify models, and surface results to the UI.

This phase is implemented as a new worker action `listChatModels` that performs all network work and streams progress back to the main thread. No local caching (localStorage) is implemented in this phase — everything is live and online.

## Goals

- Prevent runtime loader failures by removing encoder-only models from generation candidates before the runtime loader is called.
- Keep UI responsive by running heavy network work in a worker and streaming progressive updates.
- Be conservative: when classification is uncertain, prefer exclusion from generation lists.

## High-level flow

1. Main thread requests `listChatModels` from the worker (optionally with params: concurrency, maxCandidates, hfToken).
2. Worker fetches the HF listing (or uses a passed list). The initial fetch should attempt to pull up to 5,000 models in batches using the HF API pagination (or stop earlier if the listing is exhausted); after assembling the candidate set it runs a fast pre-filter (no network) to remove obvious non-candidates.
3. Worker runs concurrent config fetches for survivors and classifies each repo using `model_type` and `architectures`.
4. Worker streams progress messages to the main thread for each significant event (prefiltered, config_fetching, classified, auth, error).
5. Worker returns final array of `ModelEntry` objects and metadata.
6. Main thread updates the UI incrementally and uses the final classification to populate the Crepe/BlockEdit menu with generation-capable models only.

## Worker action contract

- Request (main -> worker):
	{ action: "listChatModels", id: string, params?: { maxCandidates?: number, concurrency?: number, hfToken?: string|null, timeoutMs?: number } }

- Progress (worker -> main), streamed:
	{ action: "listChatModels:progress", id, modelId, status: "prefiltered"|"config_fetching"|"classified"|"auth"|"error", delta?: Partial<ModelEntry>, ts }

- Final result (worker -> main):
	{ action: "listChatModels:done", id, models: ModelEntry[], meta: { fetched:number, filtered:number, errors: Array<{modelId, code, message}>, durationMs } }

- Error (worker -> main):
	{ action: "listChatModels:error", id, code?, message }

All messages must be serializable JSON objects.

## ModelEntry shape

Each returned model entry should include only the fields the UI needs:

{
	id: string,
	name?: string,
	pipeline_tag?: string,
	siblings?: Array<string>,
	tags?: Array<string>,
	model_type?: string | null,
	architectures?: string[] | null,
	classification: 'gen'|'encoder'|'unknown'|'auth-protected',
	confidence: 'high'|'medium'|'low',
	fetchStatus: 'ok'|'404'|'401'|'403'|'429'|'error',
	fetchError?: { statusCode?: number, message?: string }
}

Progress messages should send small deltas (modelId + changed fields) rather than full objects to minimize copying.

## Worker implementation details

Constants (configurable):
- DEFAULT_CONCURRENCY = 12
- PER_FETCH_TIMEOUT_MS = 10000
- RETRIES = 3
- MAX_CANDIDATES = 250
- DENY_LIST_MODEL_TYPE = ['bert','roberta','distilbert','electra','albert','deberta','mobilebert','convbert','sentence-transformers']
- ALLOW_LIST_MODEL_TYPE = ['gpt2','gptj','gpt_neox','llama','qwen','mistral','phi','gpt','t5','bart','pegasus']

Worker steps:

1) Pre-filter (no network)
- Apply conservative rules to the HF listing to remove obvious non-candidates:
	- Exclude pipeline_tag in { 'feature-extraction', 'fill-mask', 'sentence-similarity', 'masked-lm' }
	- Exclude repo ids matching `/sentence-transformers/` or curated deny patterns
	- Exclude models missing required siblings (tokenizer files or ONNX if required)
	- Cap candidate count to `MAX_CANDIDATES`
- Emit `prefiltered` progress events for survivors (or a single aggregated event).

2) Config fetch & classification
- Use a promise-pool to fetch config.json for each candidate with concurrency `concurrency`.
- Fetch order per model (best-effort fallbacks):
	1. /resolve/main/config.json
	2. /resolve/main/config/config.json
	3. adapter_config.json (optional)
- Per-request behavior:
	- Timeout after PER_FETCH_TIMEOUT_MS
	- Retries on 429 / transient network errors with exponential backoff + jitter (max RETRIES)
	- On 200: parse JSON and extract `model_type` and `architectures`, classify via allow/deny lists
	- On 401/403: mark `auth-protected`
	- On 404: mark `no-config` and fallback to heuristics (low confidence)
	- On repeated 429s: reduce concurrency and continue; record rate-limiting in meta.errors
- Emit `config_fetching` when starting each model fetch and `classified` when classification is available (send delta).

3) Finalize
- Build final `models` array with classification and confidence for UI consumption.
- Emit `done` with meta (counts, sampled errors, duration).

Error handling
- Do not fail the whole operation on per-model errors; collect them into `meta.errors` and continue.
- If systemic rate-limiting is detected, include `rate_limited:true` in meta and return partial results quickly.

Learning from runtime
- Provide an optional `learnModelClassification` worker action later so the runtime loader can report back Unsupported-model errors to help the classifier learn (not implemented in this phase).

## Message protocol and main-thread client

Extend `src/app/worker-connection.js` with a `loadChatModels(params)` that:
- Generates a unique request id.
- Sends the `loadChatModels` action to the worker.
- Returns a promise that resolves on `loadChatModels:done` and exposes an event/callback for progress messages.
- Supports cancellation by sending `action: 'cancelLoadChatModels', id` to the worker.

Progress handling
- The UI registers a progress callback to update items in-place as deltas arrive.

## UI integration (what to change)

Goal: replace and simplify the existing scattered model-selection logic, delegating discovery and classification to the worker.

Edits required:
- `src/app/model-list.js`
	- Remove heavy network logic and local config-fetch code.
	- Implement a thin consumer that calls `workerConnection.loadChatModels()` and renders the streamed deltas.
	- Keep a small fallback heuristic for entries classified `unknown`.
- `src/app/init-milkdown.js`
	- Defer creating the full BlockEdit models group until worker classification results arrive. Update the group incrementally as progress events produce `classification: 'gen'` items.
	- Ensure the Crepe menu only includes generation-capable models by default; mark low-confidence items with a warning or hide them behind a toggle.

UI behavior
- Show pre-filtered results immediately (from worker prefilter event).
- Display a spinner badge for models that are `config_fetching`.
- Replace spinner with a badge on `classified` with one of: ✅Gen, 🔒Auth, ⚠️Low-confidence, ❌Encoder.
- Allow a user setting "Show low-confidence models" to reveal items classified `unknown` or `low`.

## Tests

Worker unit tests:
- `preFilterCandidates` cases (typical listings).
- `fetchConfig` retry/backoff behavior (mock 200/404/401/429 flows).
- `classifyFromConfig` for typical config.jsons (bert, gpt2, t5, sentence-transformers).

Integration tests:
- Mock worker streaming events and assert UI updates.
- End-to-end smoke: run `loadChatModels` against a small curated list and verify `sentence-transformers/all-MiniLM-L6-v2` results in `encoder` classification and a known generator results in `gen`.

## Files to add / edit

- Add: `src/worker/actions/load-chat-models.js` — main worker logic, registered with the worker command registry.
- Edit: worker registry to register the new action (e.g., `src/worker/worker-registry.js`).
- Edit: `src/app/worker-connection.js` — add `loadChatModels` API (promise + progress subscription + cancel).
- Edit: `src/app/model-list.js` — replace network-heavy code; call worker and render deltas.
- Edit: `src/app/init-milkdown.js` — defer BlockEdit group build and update incrementally.
- Add tests: `test/worker/load-chat-models.test.js`, `test/app/worker-connection.test.js`, `test/app/model-list.integration.test.js`.

## Tuning, telemetry and rollout

Defaults to start with (tune later):
- CONFIG_FETCH_CONCURRENCY = 12
- PER_FETCH_TIMEOUT_MS = 10000
- RETRIES = 3
- MAX_CANDIDATES = 250
- CACHE TTL: N/A in this phase (no caching)

Telemetry to collect:
- Per-model fetch status counts (200/404/401/403/429)
- Number classified gen / encoder / unknown
- Runtime loader failures (should fall after rollout)
- Config fetch duration histograms and 429/backoff events

Rollout plan:
1. Implement behind a feature flag `FEATURE_LOAD_CHAT_MODELS_WORKER`.
2. Deploy to staging, run smoke tests and monitor telemetry.
3. Enable for a small % of users in production and monitor error rates and 429s.
4. Ramp up and add caching (localStorage) in a follow-up to reduce HF calls.

## Next steps (actionable)

1. I can implement the worker action and `worker-connection.loadChatModels` now using the defaults above (concurrency=12, timeout=10s, retries=3) and wire a minimal UI consumer that logs progress and final result. Confirm and I will produce the patch.
2. After that, add unit tests and a basic integration test.
3. Tune concurrency and add caching in a subsequent change.

Generated: 2025-08-21
