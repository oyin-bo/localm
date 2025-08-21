# Model filtering — 2025-08-21

This document captures the investigation, problem statement, and three concrete, production-ready plans to robustly filter models so we never attempt to load encoder-only models (BERT / sentence-transformers / other non-generation architectures) with a text-generation pipeline.

## Summary

- Problem: many candidate models returned from the Hugging Face listing are encoder-only. Attempting to load them with the `text-generation` pipeline (transformers.js) results in runtime failures such as `Unsupported model type: bert`.
- Root cause: the current selection filters rely on HF list fields and heuristics (`pipeline_tag`, `tags`, model id/name), not the repository `config.json` `model_type`/`architectures` which definitively identify model architecture.
- Goal: implement a robust filtering pipeline so chat/generation candidates have a confirmed generation-capable architecture before we ever call the runtime loader.

## Requirements / constraints

- Avoid runtime load failures (`Unsupported model type`) by filtering earlier.
- Keep initial UI responsiveness acceptable.
- Cache results (config/model_type) to avoid repeated network calls.
- Fetch config.jsons concurrently but respect HF rate-limits (batching/concurrency limits).
- Be conservative: when in doubt, prefer to exclude a model from the generation list rather than attempt a risky load.

## Definitions

- encoder-only model: model that cannot generate text (BERT, RoBERTa, sentence-transformers embeddings, ELECTRA variants)
- decoder / seq2seq / generation-capable: models that can be used with `text-generation` (GPT-family, Llama, Mistral, GPT-like, decoder-only or encoder-decoder with generation head)

## High-level approach options

Below are three alternative plans. Each plan contains step-by-step implementation details, pros, cons, testing strategy, and rollout notes.

### Plan A — Config-First Filtering (Most robust)

**Goal:** Determine model architecture by reading the repository's `config.json` (or equivalent) early and filter using `model_type` and `architectures` before runtime.

**Steps (detailed):**
1. After fetching HF listing and deduping, perform a lightweight pre-filter to remove obviously unsuitable models (no ONNX/tokenizer siblings, extreme sizes).
2. For the remaining candidates, fetch `https://huggingface.co/<id>/resolve/main/config.json` concurrently in batches. Use a concurrency of 8–16 (configurable). Implement exponential backoff for 429s.
   - For repositories that do not host `config.json` at that path, also attempt `config/config.json` and `adapter_config.json` as fallbacks (best-effort).
3. Extract `model_type` and `architectures` fields from config for each model.
4. Classify model architecture:
   - If `model_type` is in deny-list (e.g., `bert`, `roberta`, `distilbert`, `electra`, `deberta`, `albert`, `sentence-transformers`, ...), mark as encoder-only.
   - If `model_type` or `architectures` indicates decoder-only or seq2seq (e.g., `gpt2`, `llama`, `mistral`, `gptj`, `gpt_neox`, `bart`, `t5`, `pegasus`), mark as generation-capable.
   - If inconclusive, fall back to existing heuristics (pipeline_tag, tags, id heuristics). Prefer conservative exclusion.
5. Attach `model_type` and classification to the model metadata returned to the UI.
6. Cache config responses in localStorage (or in-memory cache) with TTL (24h) to avoid repeated HTTP requests on each load.

**Edge cases & error handling:**
- If config fetch fails or returns null, log the model id and treat it conservatively (exclude from generation list or require on-demand validation).
- If HF rate-limits, reduce concurrency and retry with backoff.

**Pros:**
- Very accurate — prevents almost all runtime "Unsupported model type" failures.
- Works for future/unknown architectures as you can inspect `architectures`.

**Cons:**
- Extra network calls during initial model list generation (mitigate via batching and caching).
- Slightly slower first-time load for a large candidate set.

**Testing and rollout:**
- Unit tests mocking HF config.json responses for common families.
- Integration: smoke test loading sets of models (including known encoders like `sentence-transformers/all-MiniLM-L6-v2`) to ensure they're filtered.
- Rollout: enable behind a feature flag; enable caching and monitor error rate.

### Plan B — Hybrid Heuristic + Lazy Config (Balanced, lower risk to perf)

**Goal:** Use better heuristics initially and only fetch config.json for borderline cases; learn from runtime failures.

**Steps:**
1. Improve heuristics in `isModelChatCapable`:
   - Exclude pipeline tags `sentence-similarity`, `feature-extraction`, `fill-mask` from generation candidacy.
   - Exclude models whose repo ID contains `/sentence-transformers/` or well-known encoder family prefixes.
2. Build a small in-app cache of known encoder-only model ids (seed with a curated deny-list such as `sentence-transformers/*`, `bert-*`, `roberta-*`).
3. For models that pass heuristics but look suspicious (e.g., `pipeline_tag` missing or model name ambiguous), perform an on-demand config fetch only when the user attempts to load that model (lazy validation). Run config fetch concurrently per request but avoid blocking the UI: show a spinner and a safe message.
4. If lazy validation fails at runtime (loader raises Unsupported model type), mark the model as encoder-only in the cache and avoid retry.

**Pros:**
- Faster initial listing; fewer upfront network calls.
- Automatically learns from runtime failures and avoids repeated mistakes.

**Cons:**
- Some initial runtime failures may occur for borderline models during the learning phase.
- Slight complexity in caching and in-flight load handling.

### Plan C — Multi-Pipeline Architecture (Future-proof, full-feature)

**Goal:** Support both generation and embedding pipelines, categorize models appropriately.

**Steps:**
1. Implement a `ModelClassifier` class with config-first classification (Plan A) and local caching.
2. Extend `loadModelCore` and model-loading flow to accept a target pipeline type (e.g., `text-generation` or `feature-extraction`) and to route load requests accordingly.
3. Change the UI to surface two groups: "Chat models" (generation-capable) and "Embedding models" (encoder/feature-extraction). Provide clear labels and distinct icons.
4. If the user picks an embedding model but requests generation, show a friendly message explaining the mismatch and suggest an alternative generation model.
5. Cache classification and support config refresh on demand.

**Pros:**
- Best UX and future-proof: you can use all model types for the right tasks.
- Eliminates need to exclude encoder-only models from the app entirely.

**Cons:**
- Larger engineering effort: UI changes, loader changes, and broader testing.
- Some UX complexity in surfacing multiple model types to users.

## Recommended approach

- If your priority is correctness and preventing runtime failures now: implement **Plan A**.
- If startup latency and bandwidth are critical and you can tolerate a short learning period: **Plan B**.
- If you want to support embeddings/encoders as first-class citizens and invest in the broader UX: **Plan C** (longer timeline). 

## Implementation details (Plan A focus)

- Concurrency: fetch config.json with batching; default concurrency 12, configurable via constant.
- Cache: localStorage key `localm_model_config_v1` with TTL 24h; in-memory map for current session.
- Deny-list (encoder-only model_type): `['bert','roberta','distilbert','electra','albert','deberta','mobilebert','convbert','sentence-transformers']` plus common family aliases.
- Allow-list (generation): `['gpt2','gptj','gpt_neox','llama','qwen','mistral','phi','gpt']` and known seq2seq `['t5','bart','pegasus']`.
- Fallback: if `model_type` is null or config fetch failed, use heuristic checks but mark model low-confidence and exclude from default generation list.

## Files to change (implementation sketch)

- `src/app/model-list.js`
  - Add concurrent config fetch (batching), attach `model_type` and `architectures` to model metadata and persist in cache.
  - Update `isModelChatCapable` to consult `model_type` first.
- `src/worker/load-model-core.js`
  - No immediate change for Plan A (loader stays the same). For Plan C, extend to accept pipeline argument.
- `src/app/init-milkdown.js` (UI wiring - optional)
  - Ensure only models classified as generation-capable are presented in the Chat/Models group.

## Testing and QA

- Unit tests: mock HF responses, config.json shapes for representative families.
- Integration smoke test: confirm `sentence-transformers/all-MiniLM-L6-v2` is filtered and that `mistralai/Mistral-7B` (if present) is allowed.
- Load testing: measure HF config fetch throughput and tune concurrency/backoff.

## Rollout plan

1. Implement Plan A behind a feature flag.
2. Deploy to staging and run automated load and integration tests.
3. Enable in production with monitoring on model load errors and config fetch errors.
4. If desired, progress to Plan C to support embedding models explicitly.

## Open questions

- Do you want to support encoder-only models in a separate flow (Plan C) or exclude them entirely from the chat picker?
- What concurrency level is acceptable for HF (12 is a reasonable default)?
- Do you prefer localStorage caching TTL of 24h or longer?

If you confirm which plan to implement (A/B/C or hybrid), I will produce a small implementation PR with: code edits, unit tests (where practical), and a short README note describing the change and how to adjust concurrency / TTL.

Generated: 2025-08-21

```
