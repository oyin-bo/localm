# LocalM: Project Goals & Architectural Decisions

This document outlines the problem statement, goals, and key architectural and technical policies for the `localm` project, synthesized from the project's structure and planning documents.

## 1. Problem Statement

The core challenge is to build a web application that can **run large language models (LLMs) for text generation directly in the browser**. This presents three primary technical hurdles:

1.  **Model Compatibility**: Many models available on public hubs (like Hugging Face) are not designed for text generation (e.g., encoder-only models like BERT). Attempting to load these with a generation pipeline leads to runtime errors and a poor user experience.
2.  **UI Responsiveness**: Model discovery, loading, and inference are resource-intensive operations that can easily block the browser's main thread, causing the UI to freeze and become unresponsive.
3.  **Backend Optimization**: Multiple technologies exist for running models in the browser (e.g., Transformers.js, WebLLM), each with different performance characteristics and model support. The application needs an efficient strategy to use the best available backend for any given situation.

## 2. Core Goals

To address the problem, the project is guided by the following goals:

1.  **Robust Model Loading**: Implement a reliable system to filter models and ensure only generation-capable architectures are loaded, thereby preventing runtime failures.
2.  **Responsive User Experience**: Guarantee a fluid UI by offloading all heavy computation (model discovery, loading, inference) to a background web worker.
3.  **Optimized Inference Performance**: Integrate multiple backends with an "optimistic fallback" strategy: attempt to use the most performant backend first (WebLLM), and seamlessly fall back to the more broadly compatible one (Transformers.js) if it fails.
4.  **Simple & Maintainable Architecture**: Prioritize simplicity and pragmatism. Avoid premature or unnecessary abstractions in favor of clear, minimal, and maintainable code that is easy to debug and evolve.

## 3. Architectural & Technical Policies

The project adheres to several key implementation decisions that form its architectural foundation.

### a. Worker-First Architecture

All computationally expensive tasks are delegated to a dedicated Web Worker (`src/worker/boot-worker.js`). The main UI thread remains lightweight and communicates with the worker via a dedicated connection manager (`src/app/worker-connection.js`). This is the fundamental policy for ensuring UI responsiveness.

### b. Two-Phase Model Discovery & Filtering

A robust, multi-step process, executed entirely within the worker, is used to identify suitable chat models.

1.  **Phase 1: Heuristic Pre-filtering**: The worker first fetches a large list of model candidates from Hugging Face and applies a fast, network-free filter to eliminate obviously unsuitable models based on their metadata (e.g., `pipeline_tag`, name patterns).
2.  **Phase 2: Config-Based Classification**: For the remaining candidates, the worker fetches each model's `config.json` file. It uses the `model_type` and `architectures` fields within this file to definitively classify the model as either generation-capable (`gen`), `encoder`, or `unknown`. This is the authoritative step for ensuring compatibility.

This entire process is implemented as a modern `async` generator (`src/worker/actions/list-chat-models.js`), which streams progress back to the UI for an incremental and responsive experience.

### c. Inline, Dual-Backend Integration

To achieve the best performance, the application integrates both WebLLM and Transformers.js using a simple, inline strategy.

-   **Policy**: Optimistic Fallback.
-   **Implementation**:
    1.  When a model is requested, the application first attempts to load it using the high-performance **WebLLM** engine.
    2.  If the WebLLM load fails for any reason (e.g., unsupported model, runtime error), the failure is logged, and the system **automatically falls back** to loading the model with the more universally compatible **Transformers.js** library.
    3.  At inference time, a simple, inline check (`if`/`else`) determines which engine is backing the loaded model and routes the request accordingly.

This approach was deliberately chosen over more complex architectural patterns (like registries, adapters, or orchestrators) to minimize complexity and maintenance overhead, in alignment with the goal of architectural simplicity.

### d. Minimal & Pragmatic Code Style

The project favors modern, concise, and readable JavaScript. It avoids complex abstractions where simple conditionals suffice and prefers clear, self-contained logic that is easy to test and debug. Exceptions are handled explicitly to either trigger a fallback or provide clear diagnostic information.