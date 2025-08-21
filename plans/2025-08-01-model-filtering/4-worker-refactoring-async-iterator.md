## Goal

Move the core list/classify pipeline out of `src/worker/boot-worker.js` into a small, well-scoped async-iterator action module `src/worker/actions/list-chat-models.js`. The module will implement the pipeline as an `async function*` that yields plain JSON progress objects; the worker (`boot-worker.js`) will keep a minimal wrapper that forwards yielded objects to the main thread via `postMessage`, and will cancel the task by exiting the iterator (call `iterator.return()`).

This refactor should keep code short and pragmatic, make the core logic easily unit-testable, and keep message/I/O concerns isolated to the wrapper.

## Final state / success criteria

- `src/worker/actions/list-chat-models.js` exists and exports `async function* listChatModelsIterator(params = {})`.
- The iterator contains listing, prefilter, promise-pool config fetch, classification logic, yields incremental progress objects, and throws on irrecoverable errors.
- The generator manages per-request AbortControllers and cleans them up in `finally` when iteration ends early (iterator.return()).
- `src/worker/boot-worker.js` imports the iterator and provides a 10–20 line wrapper that iterates and forwards yields via `self.postMessage({ id, type: 'progress', ...delta })`, sends final response or error, and stores an `activeTasks` abort function that calls `iterator.return()`.
- `src/app/worker-connection.js` does not double-send requests; only one control message is sent per invocation.
- All yielded objects are JSON-serializable and follow the agreed shapes.

## Yield contract (canonical shapes)

All yields must be plain JSON-serializable objects. The wrapper will not inspect internals beyond forwarding the object via `postMessage`.

- { status: 'listing_done', totalFound: number }
- { status: 'prefiltered', survivors: number }
- { modelId: string, status: 'config_fetching' }
- { modelId: string, status: 'classified', data: ModelEntry }
- { modelId: string, status: 'error', data: { message: string, code?: string } } // non-fatal per-model
- { status: 'done', models: ModelEntry[], meta: { fetched:number, filtered:number, errors:[] } }

ModelEntry minimal shape (for `classified` / final models):
- { id, model_type?, architectures?, classification?, confidence?, fetchStatus? }

Design rule: yield final `{ status: 'done' }` explicitly; do not rely on generator return value for final payload.

## Implementation steps (exact, minimal)

1) Create the action file

- File: `src/worker/actions/list-chat-models.js`
- Export: `export async function* listChatModelsIterator(params = {})`
- Move the core logic from `boot-worker.js` into this file: listing pagination, prefilter, promise-pool config fetcher (with short per-request controllers), classification helpers.
- Replace any `self.postMessage(...)` calls with `yield` of the appropriate shape described above.
- For fatal errors (e.g. listing failure), throw a plain Error with an optional `code` property, e.g. `const e = new Error('listing failed'); e.code = 'listing_failed'; throw e;`.

2) Cancellation and cleanup inside the generator (important)

- Maintain a `const inFlight = new Set()` of per-request AbortControllers.
- Use a small helper `fetchWithController(url, init)` that:
	- creates `const c = new AbortController(); inFlight.add(c);`
	- performs `fetch(url, { ...init, signal: c.signal })`
	- in a finally block does `inFlight.delete(c)`.
- Surround the main body with a `try { ... } finally { for (const c of inFlight) c.abort(); }` so when the caller calls `iterator.return()` the generator's finally runs and aborts in-flight requests.
- Do not yield a special cancelled object inside finally unless you want the wrapper to forward it; be mindful that yields inside finally will be observed by the caller. If you want a single `{ cancelled:true }` response from the wrapper, prefer the wrapper to send it after `iterator.return()` completes.

3) Helper functions

- Move `fetchConfigForModel` and `classifyModel` into the new module. Keep them small and synchronous where possible. They should return JSON-serializable values only.

4) Replace inline handler in `boot-worker.js` with thin wrapper

- Import the iterator:
	- `import { listChatModelsIterator } from './actions/list-chat-models.js';`
- Replace the long `handleListChatModels` body with:
	- Create iterator: `const iterator = listChatModelsIterator(params);`
	- Register abort: `activeTasks.set(id, { abort: () => { try { iterator.return(); } catch(e) {} } });`
	- For-await-of the iterator and forward yields:
		- `for await (const delta of iterator) { self.postMessage(Object.assign({ id, type: 'progress' }, delta)); if (delta.status === 'done') { self.postMessage({ id, type: 'response', result: { models: delta.models, meta: delta.meta } }); break; } }`
	- Catch thrown errors from the iterator and send `self.postMessage({ id, type: 'error', error: String(err), code: err.code || null })`.
	- Finally: `activeTasks.delete(id);` and if the iterator exited without a final `done` and without throwing, send `self.postMessage({ id, type: 'response', result: { cancelled: true } });`.

5) Fix main-thread double-send (one-line)

- Edit `src/app/worker-connection.js`'s `listChatModels` to avoid both `worker.postMessage(msg)` and also calling `send({ type: 'listChatModels', params })`. Use a single path: prefer the `send()` helper which sets the pending map. Remove the duplicate call.

6) Tests & smoke checks

- Manual smoke test:
	- Start server and call UI flow to trigger `listChatModels`. Verify a stream of `progress` messages and a final `response` with `models` and `meta`.
	- Trigger `cancelListChatModels` quickly and verify the wrapper sends `{ cancelled: true }` and generator's finally cleaned up (no lingering network tasks).
	- Cause a fatal listing error (e.g., simulate network down) and verify `type:'error'` arrives with error string and code.
- Unit test ideas:
	- Mock `fetch` to return known pages and config.jsons and iterate the generator directly in node, asserting yielded items and final result.
	- Test iterator.return() from a caller and assert finally executed (e.g., manipulate an `inFlight` spy or set a flag inside finally).

## Practical caveats & guidance

- Backpressure: many model-level yields may flood the main thread. If the UI is overwhelmed, coalesce `classified` yields in the wrapper (simple time-window batching, e.g. 50-100ms). Keep this as an optimization only if necessary.
- Yielding inside `finally`: if you yield summary data during cleanup, the wrapper will forward those yields. If you prefer a single `{ cancelled:true }` response, avoid yielding in finally and let the wrapper send the cancellation response after `iterator.return()` finishes.
- Error objects are not serializable; thrown Errors should be caught by wrapper and stringified. For structured error codes, attach a `code` property to the Error before throwing.
- Keep import paths relative and test in the worker context; worker modules use the same resolution as code running in worker thread.

## Minimal timeline

- Implement the new file and wrapper: 20–45 minutes.
- Smoke test and fix small issues: 10–20 minutes.
- Optional unit test: 10–20 minutes.

## Rollout steps

1. Implement `src/worker/actions/list-chat-models.js` and wire wrapper in `boot-worker.js`.
2. Run smoke test in browser; fix any message shape mismatches.
3. Fix main-thread duplicate send and re-test.
4. Add one small unit test for iterator.abort cleanup.

---

This plan keeps the code minimal, uses language-native iterator cancellation, isolates side-effects to the generator, and leaves the worker wrapper trivial. Proceed to implement when ready.

## Follow-up improvements (post-cleanup)

After the extraction and wrapper are in place, the following three low-risk improvements should be applied as follow-ups. Each item below is written as an exact, small TODO with acceptance criteria and a short testing checklist.

1) Cleanup `boot-worker.js` (remove duplicated helpers)
- Goal: remove leftover duplicate helper implementations from `boot-worker.js` so there is a single source-of-truth for `fetchConfigForModel` and `classifyModel` (the new action module). This reduces maintenance surface and avoids accidental drift.
- Changes (exact):
	- Delete the `fetchConfigForModel` and `classifyModel` helper functions from `src/worker/boot-worker.js` (the ones that are no longer used after extraction).
	- Ensure the only import of those helpers is via `import { listChatModelsIterator } from './actions/list-chat-models.js';` — do not re-export them from the action module unless tests need them. If other parts of `boot-worker.js` still need config/classify helpers, move shared helper functions to a small `src/worker/lib/model-utils.js` and import from both places.
	- Run a quick grep for remaining references to unused symbols (`fetchConfigForModel`, `classifyModel`) and remove any stale code.
- Tests / acceptance:
	- Build/lint passes with no unused-variable warnings for the removed symbols.
	- The `listChatModels` worker flow behaves identically after cleanup (run smoke test: progress + final response + cancellation).
- Risk: trivial; mitigate by running the smoke test immediately after change.

2) Adaptive concurrency on repeated 429 responses
- Goal: make the config-fetch promise pool responsive to huggingface rate-limits by reducing parallelism when many 429s occur and gradually increasing when the rate improves.
- Design (practical, minimal):
	- Instrument a small rate-limit counter in the action module: keep a sliding window counter of `configFetch.429` events (for example, track count and timestamp of recent 429s in an array limited to the last 30s).
	- Add two simple thresholds: if 429_count_in_window >= 10 then reduce `effectiveConcurrency = Math.max(1, Math.floor(effectiveConcurrency / 2))` and mark `rateLimitedUntil = Date.now() + backoffWindowMs` (backoffWindowMs e.g. 30s). If no 429s recorded for backoffWindowMs, gradually restore `effectiveConcurrency = Math.min(initialConcurrency, effectiveConcurrency + 1)` every backoffWindowMs/2.
	- Implementation notes: do not recreate worker goroutines; rather implement a token/semaphore scheme where each worker must acquire a token before starting a config fetch. Maintain `tokenCount = effectiveConcurrency`. When thresholds change, adjust tokenCount (release or reduce available tokens). This allows workers to respect new concurrency without tearing down the pool.
	- Track metrics: increment `counters.configFetch429++` and `counters.configFetch200++` for telemetry (simple numeric fields inside the action module). Expose the counters in the final meta if `params.debug` is true.
- Changes (exact):
	- Add `const counters = { configFetch429:0, configFetch200:0, configFetchError:0 }` to the top of `list-chat-models.js` action module.
	- Replace the fixed `workerCount = Math.min(concurrency, survivors.length || 1)` with a token-based semaphore that uses `effectiveConcurrency` which can be modified at runtime by the rate-limit detector.
	- On each fetch response with 429, update the sliding window and possibly reduce `effectiveConcurrency` and tokenCount; when tokenCount changes, wake waiting workers so they re-evaluate.
- Tests / acceptance:
	- Simulate many 429s using a mocked fetch; confirm effectiveConcurrency is reduced and fewer concurrent requests are outstanding (can use counters or a small instrumentation hook).
	- After simulated quiet period, confirm effectiveConcurrency slowly ramps back up.
- Risk: medium subtlety but implementable as a simple token count and counters; keep logic intentionally conservative and well-tested.

3) Batching of progress messages to avoid UI flood
- Goal: reduce main-thread overhead when the generator emits many small per-model progress objects in a short time window by coalescing them into small batches sent by the wrapper.
- Design (minimal):
	- Implement a tiny buffer in `boot-worker.js`'s wrapper around `self.postMessage` for progress messages: collect deltas into an array `batchBuffer` and flush every `BATCH_MS` (recommended 50ms) or when buffer reaches `BATCH_MAX` (recommended 50 items).
	- Message shape: send `{ id, type: 'progress', batch: true, items: [ ...deltas ] }` for batched messages. Keep single-item messages as `{ id, type: 'progress', ...delta }` for backward compatibility if prefer — but prefer consistent batching (UI can accept either if updated). Document the change for the UI consumer and update the UI progress handler to accept `msg.batch ? msg.items : [msg]`.
	- Implementation exact steps:
		1. In `boot-worker.js` create `let batchBuffer = []; let batchTimer = null; const BATCH_MS = 50; const BATCH_MAX = 50;`
		2. Replace immediate `self.postMessage(Object.assign({ id, type: 'progress' }, delta))` with `enqueueProgress(delta)` where `enqueueProgress` pushes delta into `batchBuffer`, starts the timer if not running, and flushes when length >= BATCH_MAX.
		3. `flush` sends one message `self.postMessage({ id, type: 'progress', batch: true, items: batchBuffer.splice(0) })` and clears timer.
		4. On `done` or `error` ensure `flush()` is called synchronously before sending `response`/`error` so UI receives final state.
- Tests / acceptance:
	- Smoke test: when scanning many models, verify UI receives fewer, larger progress messages (monitor frequency in devtools) and UI still updates correctly.
	- Ensure cancellation still works and that flush is invoked on iterator termination.
- Risk: low; main caution is updating UI to accept `batch` messages (small consumer change). If you prefer zero-change on UI, the wrapper can detect if `pendingEntry.onProgress` exists and deliver either single items or preferrably call `onProgress({ batch:true, items })`.

Order of follow-ups and rollout suggestion
- Apply `boot-worker.js` cleanup first (trivial, low-risk). Run smoke tests.
- Add batching next (low-risk). Update the UI progress handler to accept batch messages; smoke test with a large run to ensure smooth UI.
- Add adaptive concurrency last (medium risk). Implement with conservative thresholds and unit tests that simulate 429 storms.

Verification checklist after all follow-ups
- Lint/build: PASS
- Worker: streams progress in batches, final `response` arrives unchanged
- Cancellation: `cancelListChatModels` aborts iterator quickly and no more progress messages are sent after final cancellation response (or only those emitted during cleanup if intentionally emitted)
- Under repeated 429s: concurrency reduced and total in-flight requests observed to drop; counters exposed in `meta` when `params.debug` is enabled

When you want, I can implement these three follow-ups in that order; tell me to proceed and I'll make small, focused edits and run quick smoke tests after each one.

