## Worker Model Listing — UI Integration Plan

Purpose: document a complete, actionable plan to replace UI-side HF model fetching and caching with the worker-based `listChatModels` flow, remove UI caching, and defer slash-command creation until the worker returns the final model list.

Requirements checklist
- Use the `listChatModels` action name everywhere (do not introduce `loadChatModels`).
- Remove UI-side HF network logic and localStorage caching.
- Defer Crepe/Milkdown BlockEdit population until the worker returns the final models list.
- Keep the implementation simple, minimal, and easy to iterate on.
- Expose cancellation for the listing operation.
- Provide a small hard-coded fallback list if the worker fails.
- Make changes recoverable (do not permanently obliterate legacy code without a backup or relying on git).

## One-line summary
Replace `fetchBrowserModels()` in the UI with a thin worker-backed proxy that calls `listChatModels`, expose a cancellable wrapper in `src/app/worker-connection.js`, and update `src/app/init-milkdown.js` to wait for the final list before adding the BlockEdit `models` group.

## Deliverables (files to change)
- Edit: `src/app/worker-connection.js` — add a small wrapper that returns `{ id, promise, cancel }` for `listChatModels` requests.
- Edit: `src/app/model-list.js` — replace the heavy `fetchBrowserModels()` implementation with a worker-proxy (no caching/localStorage).
- Edit: `src/app/init-milkdown.js` — defer BlockEdit creation until the worker returns the final list; show a simple placeholder while waiting.
- Add (optional): `src/app/_legacy/fetchBrowserModels.removed.js` — move old implementation here for safe disposal (or rely on git history).
- Add (optional): `test/app/model-list.integration.test.js` — a fast smoke test that mocks `listChatModels` and verifies BlockEdit population.

## API contract (UI-side wrapper)
- Function: `listChatModels(params = {}, onProgress?)` — keep this name and behavior.
- Wrapper return: `{ id, promise, cancel }` where:
  - `id` (string) is the request id posted to the worker;
  - `promise` resolves to the final `ModelEntry[]` (use the shape from the plan) or rejects on fatal error;
  - `cancel()` posts `{ type: 'cancelListChatModels', id }` and cleans up local pending state.
- `onProgress(delta)` will be called with small delta objects emitted by the worker. Keep deltas as-is (no heavy transformation).

Keep the `fetchBrowserModels()` export stable: it should return a Promise resolving to the model array so existing callers need no changes.

## Implementation steps (detailed, exact)

1) Worker client wrapper (`src/app/worker-connection.js`)

- Replace the current `listChatModels` helper with a thin wrapper that returns `{ id, promise, cancel }`:
  - Generate an `id` (e.g., `String(Math.random()).slice(2)`).
  - Create a pending entry in the connection's `pending` map containing `resolve`, `reject`, and `onProgress`.
  - `worker.postMessage({ type: 'listChatModels', id, params })`.
  - `promise` is a new Promise that resolves/rejects via the pending entry.
  - `cancel()` posts `{ type: 'cancelListChatModels', id }` and removes the pending entry.

- Keep naming strictly `listChatModels` (do not introduce `loadChatModels`).

2) UI proxy in `src/app/model-list.js`

- Replace the heavy implementation of `fetchBrowserModels()` with a worker-proxy implementation. Keep the same exported function name/signature to preserve callers.

- Minimal behavior for `fetchBrowserModels()`:
  - Call `const { id, promise, cancel } = workerConnection().listChatModels(params, onProgress)`.
  - Optionally handle simple timeout (e.g., `Promise.race([promise, timeout(30_000)])`). If timed out, call `cancel()` and fall back.
  - Map the `ModelEntry[]` returned by the worker to the previous UI shape expected by callers (keep only the fields UI needs: `id`, `name`, `size`, `slashCommand`, `pipeline_tag`, etc.). Use concise mapping.
  - No localStorage, no caching, no persisted TTL logic.
  - Maintain an in-memory transient map for in-progress deltas if you want to display progress — but keep it small; for this iteration final result suffices.

- Provide a small hard-coded fallback array of 3–5 known models to return on worker failure.

3) Defer BlockEdit creation (`src/app/init-milkdown.js`)

- Start Crepe without the BlockEdit `models` group (as the code already does in the repository).
- After mounting creat the Crepe editor, call `fetchBrowserModels()` (the new worker-backed function) and await the final array.
- Once the worker returns the final models list, call `crepeInput.addFeature(blockEdit, { buildMenu })` and populate the `models` group there.
  - buildMenu: loop final models and call `group.addItem(model.slashCommand, { label, icon, onRun })`.
- While waiting, show a simple spinner or placeholder. Keep the UX minimal: BlockEdit appears only after the final list resolves.

4) Remove caching + cleanup

- Remove any `localStorage` persistence logic and in-memory long-lived caches from `src/app/model-list.js`.
- Do not delete the legacy implementation irreversibly in the first pass. Move the old code into `src/app/_legacy/fetchBrowserModels.removed.js` or rely on git to recover it. Add a short header comment in `src/app/model-list.js` explaining the replacement.

5) Add fallback & feature flag

- Add a small `FALLBACK_MODELS` constant inside `src/app/model-list.js` or a small `fallback-models.js` file. Return this when the worker fails.
- Add `const FEATURE_LIST_CHAT_MODELS_WORKER = true` (or read from an ENV/config object) near top of `init-milkdown.js` so you can toggle behavior quickly.

6) Tests & smoke

- Integration test: `test/app/model-list.integration.test.js` — mock `workerConnection().listChatModels` to return a resolved promise; assert that `init-milkdown()` ends up adding BlockEdit items.
- Unit test: small test for `worker-connection` wrapper to assert returned `{ id, promise, cancel }` shape and that cancel posts a cancel message (stub worker).

## Mapping worker ModelEntry -> UI model shape

Worker returns ModelEntry with these fields (plan):

```
{
 id,
 name?,
 pipeline_tag?,
 siblings?,
 tags?,
 model_type?,
 architectures?,
 classification: 'gen'|'encoder'|'unknown'|'auth-protected',
 confidence: 'high'|'medium'|'low',
 fetchStatus: 'ok'|'404'|'401'|'403'|'429'|'error',
 fetchError?
}
```

Map into the minimal UI `ModelInfo` shape used by `init-milkdown` (example):

- `id`: same
- `name`: entry.name || humanized(id)
- `vendor`: extract from id (reuse `extractVendor` helper)
- `size`: keep conservative default or empty
- `slashCommand`: keep `generateSlashCommand(id)` helper usage
- `pipeline_tag`: pass through
- `requiresAuth`: classification === 'auth-protected'

Keep the mapping concise with a single `map()` call.

## Edge cases & caveats

- Cold start (no caching): expect slower initial load; mitigate by returning `FALLBACK_MODELS` on error.
- Many progress events: the worker may stream many small deltas; for the first iteration, only use the final `done` response to build BlockEdit. Optionally show a spinner while progress is in-flight.
- Rate limiting and auth-protected repos: worker classifies these; UI should honor `classification` and `confidence` but can ignore nuance for this initial pass.
- Cancellation: callers must keep the `id` or `cancel` handle and call it when unmounting.
- API name strictness: keep `listChatModels` everywhere; do not create `loadChatModels`.

## Rollout and rollback

- Implement in a feature branch and commit in small steps: 1) worker wrapper, 2) `fetchBrowserModels` replacement, 3) `init-milkdown` change, 4) tests + fallback.
- Test locally: open the editor, confirm the BlockEdit `models` group appears after the worker finishes and slash commands work.
- If anything breaks, toggle `FEATURE_LIST_CHAT_MODELS_WORKER` to `false` or revert via git.

## Time estimates
- `worker-connection` wrapper: 15–30 minutes
- `model-list` replacement: 30–60 minutes
- `init-milkdown` deferment: 30–60 minutes
- Tests & verification: 30–90 minutes
Total: ~1.5–3.5 hours.

## Minimal code style guidance (brevity & elegance)
- Use concise arrow functions and destructuring.
- Favor `map()`/`filter()` over manual loops.
- Keep try/catch blocks narrowly scoped.
- One-liner helpers for timeouts and small utilities: `const wait = ms => new Promise(r => setTimeout(r, ms));`
- Keep file-level exports small and stable; prefer preserving function names to avoid cascade edits.

## Next step (recommended)
- Implement the `listChatModels` wrapper in `src/app/worker-connection.js` and replace `fetchBrowserModels()` body in `src/app/model-list.js` with the worker-backed proxy. Then update `src/app/init-milkdown.js` to await the final list before adding BlockEdit. Add `FALLBACK_MODELS` for safety.

---

This document is intentionally prescriptive and conservative: small, reversible edits; stable export names; and minimal UI changes for the first iteration. Once this is merged and verified, we can iterate to add caching, incremental UI updates, and telemetry.
