
# Review: critique of WebLLM integration plans (short)

This document records a concise, one‑page critique of the three proposals in
`webllm-integration-plans.md`. The focus is strictly on unnecessary complexity,
maintenance risk, and how each plan deviates from the original, tightly scoped
requirement: "optimistic WebLLM load with Transformers.js fallback, and simple
runtime routing at inference time."

## Checklist (requirements extracted)
- Attempt WebLLM first when loading a model in `boot-worker` — Required
- If WebLLM load fails, fallback to Transformers.js — Required
- At inference time, route to WebLLM or Transformers.js based on the loaded model — Required

Status: The three plans nominally address these rules, but each layers
additional architecture that is not required by the stated behavior.

## Plan 1 — Unified Backend Manager
- What it proposes: registry, adapters, compatibility matrix, unified cache, smart selector.
- Why it’s over‑engineered: converts a simple dual‑backend decision into a general multi‑backend platform.
- Specific harms:
	- Large maintenance surface: many new modules to design, document, and keep in sync.
	- Harder debugging: faults are displaced into adapter/registry layers.
	- Test explosion: compatibility matrix and routing logic require extensive tests.
	- Delayed delivery: substantial upfront work with little immediate value.
- Salvageable idea: a very small, local adapter contract or a backend marker can be useful — but only if kept intentionally minimal.

## Plan 2 — Progressive Enhancement
- What it proposes: capability detection, curated metadata changes, hybrid loader, small inference adapter.
- Why it still feels heavy: it expands metadata and loader paths despite the requirement being a single optimistic attempt + fallback.
- Specific harms:
	- Metadata maintenance and schema versioning overhead.
	- Increased regression risk by touching the hot path (`model-cache`).
	- API leakage: adapters can hide backend differences and cause subtle runtime mismatches.
- Merit: conceptually the safest approach; its incremental philosophy is appropriate — but the plan should avoid broad metadata and API surface growth at this stage.

## Plan 3 — Microservice Backend Architecture
- What it proposes: independent backend services, orchestrator, IPC/protocols, health checks, worker isolation.
- Why it’s inappropriate now: it’s a heavy structural shift that doesn’t fit an in‑browser, worker‑based app nor the simple requirement.
- Specific harms:
	- Severe implementation and operational overhead.
	- Debugging and runtime complexity across service boundaries.
	- Overfitting server patterns to client‑side code.

## Summary
All three plans contain useful long‑term ideas, but they escalate architecture well beyond the immediate need. Plan 2’s incremental mindset is the closest fit, yet even it introduces schema and loader surface growth that is not required today. Plans 1 and 3 add costly abstractions that will negatively affect maintainability, testing, and delivery speed if implemented now.

Recommendation (for reviewers): preserve the useful concepts (capability detection, explicit backend marker) but avoid registry/orchestrator layers and wide metadata changes at this stage. Keep the initial implementation small and focused on the two behaviors the project must guarantee.
