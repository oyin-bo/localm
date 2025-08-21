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

