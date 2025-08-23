# Chosen Plan: Inline WebLLM Integration — Tight Execution Roadmap

## Reinforcement (start)

Keep changes tiny, readable, and modern: concise async/await, arrow functions, optional chaining, nullish coalescing. Do not swallow exceptions — when a catch occurs, act: log a concise diagnostic and take the fallback path or rethrow if necessary.

## Core intent

Optimistically use WebLLM when available; when it fails use the existing Transformers.js pipeline. Use a single cache (Promise or resolved engine) as the source of truth. No persistent flags, no timeouts on engine creation, no extra shutdown disposal, minimal logging.

***

## Essentials checklist

* Probe the runtime once (advisory only) to avoid pointless attempts on unsupported platforms.
* On model load, try WebLLM first when probe suggests possible; if it fails, immediately and deterministically fall back to Transformers.js.
* Cache the in-progress Promise and then the resolved engine object in the same cache used today for Transformers.js pipelines.
* Decide backend at runtime by inspecting the resolved cached object (duck-typing), not by reading separate per-model flags.
* Keep logging minimal and actionable (one-line load start/success/fail, inference fail).
* Do not impose timeouts on engine creation; allow large models to finish loading.
* Do not add shutdown dispose hooks; worker shutdown will clean up resources.

***

## Steps (order of implementation) with success criteria

1. Add a cheap advisory probe (in-memory)

* What: perform a single, lightweight probe at first load attempt to detect presence of WebLLM APIs; cache boolean and last error in-memory.
* Why: skip obviously impossible attempts on unsupported platforms without preventing valid loads elsewhere.
* Success: probe returns quickly and avoids repeated futile attempts.

1. Implement WebLLM-first load path into `ModelCache` (single-cache logic)

* What: on getModel, store an in-progress Promise into the existing cache; if probe suggests WebLLM is possible, attempt engine creation first (no timeout). If WebLLM creation or a short validation check fails, log a concise diagnostic and proceed to the existing Transformers.js loader. When the Promise resolves, replace it with the engine object in the same cache.
* Why: ensure concurrent requests dedupe and the cache remains the single source of truth.
* Success: when WebLLM loads successfully the cached engine is used for inference; when it fails, Transformers.js is used with no UI change.

1. Runtime routing by object shape (duck-typing)

* What: at runPrompt, await the cached model, inspect the resolved object for a small, documented signature that identifies WebLLM vs Transformers.js, and dispatch via one conditional.
* Error handling: if WebLLM inference throws, log a concise diagnostic and attempt Transformers.js for that run where sensible. Do not silently swallow errors.
* Success: a single conditional routes inference correctly; fallback happens within the same request when possible.

1. Minimal logging

* What to log (brief): model load start (backend attempted), model load success, model load failure (one-line error + model id), inference failure (one-line).
* Why: keep logs actionable and small; avoid verbose progress dumps.

1. No explicit disposal at shutdown

* Decision: do not add dispose hooks for worker shutdown; rely on worker termination to clean up. Avoid extra lifecycle complexity.

***

## Developer checklist (compact, ready for PR body)

* Add in-memory `probe()` used only at first load attempt; cache result and last error for session.
* In `ModelCache.getModel`: store in-progress Promise in cache; if probe indicates WebLLM may be present, attempt WebLLM engine creation first (no timeout). On success, cache engine object. On failure, log concise diagnostic and run existing Transformers.js loader.
* In inference handler (`runPrompt`): await cached model, detect backend by object shape (duck-typing), call with minimal options (max\_new\_tokens, temperature). If WebLLM inference fails, log and attempt Transformers.js fallback for that request.
* Keep logs concise and developer-focused.
* Use modern, compact JS idioms and keep code short.

***

## Success criteria (project-level)

* WebLLM used when available; Transformers.js fallback always available.
* No feature flags or persisted per-model success flags introduced.
* Exceptions are not swallowed; catches produce concise diagnostics and a clear fallback or propagate.
* Changes are minimal, readable, and easy to revert.

***

## Final reinforcement (end)

Start small: one compact change to `ModelCache` and a single conditional in inference. Keep the implementation elegant and short. If an exception is caught, do not hide it — act: log minimal diagnostic and fallback or rethrow.

If you want, I can now draft a compact PR description based on this checklist or implement the code changes directly — tell me which and I will proceed.
