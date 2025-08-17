

# **An Expert Analysis of Public LLMs for In-Browser Inference with Transformers.js**

### **Executive Summary: The State of Browser-Based LLMs**

The paradigm of executing sophisticated artificial intelligence models directly within a web browser has advanced from a theoretical concept to a practical, and increasingly viable, reality. This shift is predicated on the confluence of three pivotal technologies: the transformers.js library, the ONNX model format, and hardware-accelerated Web runtimes, most notably WebGPU. The core finding of this analysis is that the effective performance of a model in a browser environment is not determined by its raw size alone, but rather by the degree of intelligent optimization, primarily through quantization. Smaller, highly-tuned models such as the Phi-3 series, when properly optimized, are observed to consistently outperform larger, unoptimized counterparts in real-world browser applications. This sentiment is widely echoed across technical communities and corroborated by benchmark comparisons.

This report concludes that the future of on-device AI is intrinsically tied to a decentralized, privacy-first architecture, which bypasses the need for costly and latency-prone API calls to external servers. For developers prioritizing user privacy, low latency, and reduced operational costs, the combination of a compact, quantized LLM (typically under 4 billion parameters) with a WebGPU-enabled runtime offers a compelling and robust solution. For more computationally intensive tasks, a hybrid model that intelligently combines client-side processing for common queries and server-side inference for complex requests represents a pragmatic and scalable approach.

The trend toward browser-based AI is a fundamental change in the developer mindset. It enables a new class of applications capable of handling sensitive data entirely on the client side, offering enhanced security and user control.

---

## **Part I: The Browser as an AI Runtime**

### **1.1. Foundational Concepts for On-Device Inference**

The execution of Large Language Models (LLMs) directly within a web browser is made possible by a specialized software stack designed to overcome the inherent limitations of client-side environments, such as constrained memory, limited computational power, and network latency. The transformers.js library serves as the linchpin of this ecosystem. It is a JavaScript library engineered to be a functional analogue to the popular Python transformers library, allowing developers to leverage the same pretrained models using a nearly identical API.1 This design philosophy democratizes access to state-of-the-art models for a vast community of web developers who are already proficient in JavaScript. The library's capabilities are extensive, supporting a wide array of tasks across multiple modalities, including natural language processing, vision, and multimodal applications.1

At the heart of transformers.js's operational capability lies its reliance on the ONNX (Open Neural Network Exchange) format and the corresponding ONNX Runtime Web.1 ONNX functions as a crucial intermediary, a format that allows for the conversion of models trained in diverse frameworks like PyTorch or TensorFlow into a single, standardized representation. This standardized format is essential for achieving the cross-platform compatibility required to run models reliably in different web browsers. The conversion process from a native training format to ONNX is a streamlined procedure, often facilitated by Hugging Face's

Optimum library.1 For a model to be considered

transformers.js-ready, it must either have a pre-converted ONNX version publicly available or be structured in a way that allows for easy conversion, such as by placing its ONNX weights in a dedicated subfolder within the repository.3

A critical and unavoidable step for making models viable in a web browser is optimization through quantization. LLMs are typically trained using 32-bit floating-point precision (FP32), which requires a substantial memory footprint and immense computational resources. This precision level is impractical for client-side environments where every byte of data transferred and every cycle of computation is a critical concern.5 Quantization addresses this challenge by reducing the precision of the model's weights from higher-bit formats (e.g., FP32, FP16) to lower-bit formats (e.g., INT8, INT4).6 This reduction results in a significantly smaller model size and faster inference times, as it requires less memory and bandwidth for data transfer and fewer computational cycles.6 While this process can introduce a minimal loss in model accuracy, the community has found that the trade-off is often well worth the performance gains.

The degree of this trade-off is a strategic decision. Research demonstrates that the relationship between quantization level and model performance is not always linear. For certain complex tasks, such as logical reasoning, a larger model with an aggressive 2-bit quantization scheme (e.g., Q2\_K) can outperform a smaller model with a less aggressive 6-bit quantization scheme (Q6\_K) despite having a similar memory footprint.8 This highlights that a "one-size-fits-all" approach to quantization is ineffective. The optimal choice of a model and its quantization level must be carefully considered based on the application's primary function and the type of reasoning it requires. This is why the community has developed a variety of naming conventions, such as

GGUF, AWQ, and Q\_K, to denote specific quantization methods, reflecting the ongoing experimentation and specialization in this field.7

The most significant advancement in this area has been the integration of WebGPU. While transformers.js initially relied on WebAssembly (WASM) for CPU-based inference, which limited the practical size of models to a few hundred megabytes, WebGPU fundamentally alters this dynamic.10 By leveraging the user's local GPU, which is purpose-built for the parallel matrix multiplications at the core of neural network inference, WebGPU provides speed-ups ranging from 4x to an astonishing 75x compared to WASM.10 This enables the use of models with billions of parameters that were previously considered too large for a browser environment, thereby transforming a niche capability into a mainstream one.

### **1.2. The Path to Model Compatibility**

Identifying models suitable for in-browser use on Hugging Face requires a strategic approach, as compatibility is not always explicitly labeled. However, several effective indicators can guide the search. The most direct method is to utilize the Hugging Face Hub’s filtering system and select the transformers.js library tag.2 This action filters the entire repository to display only models that have been explicitly configured for the library, providing a strong signal of compatibility.

Beyond filtering, an even more reliable indicator is the presence of the Xenova organization. The Xenova user has become the de facto source of pre-converted, browser-ready models for the transformers.js community.2 This organization serves as a critical bridge, taking popular models from the broader Hugging Face ecosystem and re-packaging them with the necessary ONNX weights and detailed

transformers.js usage examples.3 A developer who finds a model under the

Xenova namespace can be highly confident in its browser readiness, as it saves them the labor of manual conversion and troubleshooting.3 This dedicated effort has established the

Xenova user as a trusted stamp of quality and a key heuristic for efficient model discovery.

Another important clue is the presence of a dedicated onnx subfolder within a model's repository.3 Even if a model is not tagged for

transformers.js, this subfolder is a strong indication that it has been prepared for ONNX Runtime inference, which is the underlying technology transformers.js uses.

The Hugging Face Hub's powerful filtering system can be combined with other criteria, such as specific tasks (e.g., text-generation or feature-extraction), to further refine the search.1 Furthermore, community-curated collections are invaluable resources. Collections from prominent contributors like

Xenova or DavidAU are excellent starting points for finding models that are not only compatible but also have been proven to work in public demonstrations.12

---

## **Part II: A Curated List of Top Browser-Compatible LLMs**

### **2.1. Defining Gated vs. Non-Gated Models**

For the purpose of this report, a clear distinction is made between "gated" and "non-gated" models, a categorization that is critical for understanding their usability within a commercial or open-source project. "Gated" models, such as those from organizations like Meta or Google, require users to be logged in to the Hugging Face platform and to explicitly accept a license agreement or acceptable use policy before they can download the model files.15 This is not a commercial paywall but a technical barrier designed to ensure users adhere to specific terms of use.

Conversely, "non-gated" models are released under permissive licenses like Apache 2.0 or MIT. These models are available for download and use without any form of authentication or explicit agreement, making them unrestricted for both commercial and research applications.17 The community often discusses this distinction, with some members praising models like Microsoft’s Phi-3 for being "truly open source" because they are under the permissive MIT license, unlike the "almost open source" models from Meta that still require a formal request.18 For developers whose projects require maximum freedom from licensing friction and legal review, non-gated models under a clear, permissive license are the preferred choice.

### **2.2. The Top 10 Gated LLMs for Browser Use**

The following models were selected based on their high performance on public leaderboards, significant community interest, and the availability of transformers.js-compatible versions.

1. **Model:** google/gemma-2b-it  
   * **Vendor:** Google  
   * **Size:** 2.0B parameters  
   * **Summary:** This model is part of Google's lightweight Gemma family, built with the same technology as the Gemini models. It is highly regarded for delivering "best-in-class performance" for its size, often surpassing larger models on key benchmarks.16 The instruction-tuned version (  
     \-it) is particularly popular for chatbot and conversational applications and is known for running efficiently on a developer's laptop. It requires users to review and agree to Google's usage license to access the files.21  
2. **Model:** google/gemma-2b  
   * **Vendor:** Google  
   * **Size:** 2.0B parameters  
   * **Summary:** This is the base version of the Gemma 2B model, designed for fine-tuning or integration into larger systems.16 It shares the same core architecture and performance characteristics as its instruction-tuned counterpart and is praised for its efficiency. The model is capable of running on consumer-grade hardware and is a strong foundation for building specialized in-browser applications.  
3. **Model:** google/gemma-7b  
   * **Vendor:** Google  
   * **Size:** 7.0B parameters  
   * **Summary:** The larger sibling in the Gemma family, this model offers enhanced performance for more complex tasks.16 It is widely used by the community to evaluate the capabilities of larger models in a browser environment, especially when leveraged with WebGPU acceleration. Community sentiment confirms that it maintains the Gemma family's efficiency and strong benchmark performance.  
4. **Model:** meta-llama/Llama-2-7b-hf  
   * **Vendor:** Meta  
   * **Size:** 7.0B parameters  
   * **Summary:** As a foundational model in the open-source community, Llama-2-7b is a highly popular choice for a wide range of tasks.22 It is known for its robust architecture, which features improvements over its predecessor, including a doubled context length and improved inference speed in its larger variants.22 Although gated, the model's widespread adoption has led to numerous  
     transformers.js-compatible conversions.  
5. **Model:** meta-llama/Llama-2-70b-hf  
   * **Vendor:** Meta  
   * **Size:** 70B parameters  
   * **Summary:** While a 70B parameter model pushes the limits of a browser environment, it has been demonstrated to run in the browser with WebGPU acceleration on high-end consumer hardware with sufficient memory.10 The community considers this a significant technical achievement and a benchmark for the library's capabilities. Its large size provides a considerable boost in reasoning and general knowledge, making it suitable for applications where quality is prioritized over initial load time.  
6. **Model:** mistralai/Mistral-7B-v0.1  
   * **Vendor:** Mistral AI  
   * **Size:** 7.3B parameters  
   * **Summary:** Mistral-7B is highly regarded for its superior performance compared to models of similar or even larger size, such as Llama 2 13B, on various benchmarks.23 Its innovative architecture, which includes Grouped-Query Attention (GQA) and Sliding Window Attention (SWA), enables faster inference and efficient handling of long sequences.23 Community benchmarks consistently place it as a top contender for its size class.24  
7. **Model:** mistralai/Mistral-7B-Instruct-v0.2  
   * **Vendor:** Mistral AI  
   * **Size:** 7.3B parameters  
   * **Summary:** The instruction-tuned version of Mistral-7B is optimized for following instructions and chat-based interactions.23 It has demonstrated remarkable capabilities, outperforming competitors like Llama 2 13B Chat in specific tasks. It is a favorite within the community for building instruction-following applications in a client-side environment.  
8. **Model:** Qwen/Qwen2.5-3B  
   * **Vendor:** Qwen  
   * **Size:** 3.0B parameters  
   * **Summary:** A strong performer in the sub-4B parameter category, the Qwen2.5-3B model is highly competitive.25 The Qwen series is trained on a premium, high-quality dataset, which contributes to its strong performance in natural language understanding and coding tasks.23 It is a viable alternative for developers seeking a high-quality, efficient model in the smaller size bracket.  
9. **Model:** Qwen/Qwen2.5-7B  
   * **Vendor:** Qwen  
   * **Size:** 8.0B parameters  
   * **Summary:** This model is recognized on leaderboards as one of the best pretrained models in its size class.25 It is particularly noted for its exceptional performance in coding, where it can outperform even some larger models.24 The community finds it to be a robust model for applications that require a balance of reasoning, creativity, and technical capabilities.  
10. **Model:** Qwen/Qwen2.5-72B  
    * **Vendor:** Qwen  
    * **Size:** 73B parameters  
    * **Summary:** Similar to the Llama-70B, this model pushes the boundaries of in-browser inference.24 Its large size provides a significant leap in performance for complex, resource-intensive tasks. While the initial download and load time are substantial, its ability to run locally on a high-end machine with WebGPU demonstrates the immense potential of the browser as a runtime for even the largest models.

### **2.3. The Top 10 Non-Gated LLMs for Browser Use**

These models are celebrated for their permissive licensing, which allows for maximum freedom in commercial and personal projects, in addition to their strong performance.

1. **Model:** Xenova/phi-3-mini-4k-instruct  
   * **Vendor:** Microsoft (via Xenova)  
   * **Size:** 3.8B parameters  
   * **Summary:** Widely hailed as a "powerhouse" for its size, this model is a top choice for resource-constrained environments.19 Community members have expressed being "blown away by its performance," noting it performs "almost like a 7b model".19 It is praised for its strong logical reasoning, math skills, and near-perfect JSON output.19 Its permissive MIT license makes it a favorite for private and commercial projects.18  
2. **Model:** Xenova/phi-1.5  
   * **Vendor:** Microsoft (via Xenova)  
   * **Size:** 1.3B parameters  
   * **Summary:** An earlier model from the Phi series, Phi-1.5 is an efficient and capable model for its size.28 It was trained on highly curated synthetic data, which gives it strong performance in common sense reasoning and logical tasks.28 Its small size makes it ideal for fast, lightweight applications where a larger model is not required.  
3. **Model:** Xenova/all-MiniLM-L6-v2  
   * **Vendor:** Xenova  
   * **Size:** 80MB (approximate)  
   * **Summary:** This model is a cornerstone of the transformers.js ecosystem, primarily used for sentence similarity and feature extraction.3 It is celebrated for its incredibly small size and high performance, even outperforming larger models like  
     text-embedding-ada-002 on specific tasks.29 It is a perfect choice for client-side semantic search applications where data privacy is paramount, as the embeddings can be generated locally without sending user data to a server.29  
4. **Model:** Xenova/distilgpt2  
   * **Vendor:** Hugging Face (via Xenova)  
   * **Size:** 82M parameters  
   * **Summary:** DistilGPT2 is a distilled version of the GPT-2 model, designed to be smaller and faster.17 Its compact size makes it an excellent choice for applications requiring very low latency, such as simple text generation or prototyping.30 It is a foundational model for demonstrating  
     transformers.js's capabilities and is frequently used in demos.4  
5. **Model:** Xenova/llama2.c-stories15M  
   * **Vendor:** Xenova  
   * **Size:** 15.2M parameters  
   * **Summary:** This model is an extremely lightweight and highly-efficient model optimized for simple text generation tasks, particularly for storytelling.13 Its diminutive size makes it one of the fastest models to load and run in a browser, suitable for ultra-lightweight applications and embedded use cases.  
6. **Model:** Xenova/llama2.c-stories110M  
   * **Vendor:** Xenova  
   * **Size:** 110M parameters  
   * **Summary:** A larger version of the llama2.c-stories series, this model provides a better balance between size and quality for text generation.31 It remains highly efficient for browser-based inference while offering a richer generation capability than its smaller counterpart.  
7. **Model:** microsoft/Phi-3-medium-128k-instruct  
   * **Vendor:** Microsoft  
   * **Size:** 14B parameters  
   * **Summary:** This model is part of the Phi-3 family, known for strong reasoning and a very long context length of 128k tokens.32 Community discussion suggests that while the mini version is a powerhouse, the medium and larger models do not always scale as well in terms of performance relative to their size, possibly due to the curated but small dataset.19 However, for tasks requiring extensive context comprehension, this model is a strong candidate.  
8. **Model:** FlofloB/100k\_fineweb\_continued\_pretraining\_Qwen2.5-0.5B-Instruct\_Unsloth\_merged\_16bit  
   * **Vendor:** FlofloB  
   * **Size:** 0.6B parameters  
   * **Summary:** Recognized on leaderboards as a highly competitive continuously pretrained model in the sub-1B size class.25 Its small size, combined with focused training, makes it an efficient and effective model for browser use, particularly for instruction-following tasks.  
9. **Model:** ehristoforu/coolqwen-3b-it  
   * **Vendor:** ehristoforu  
   * **Size:** 3.0B parameters  
   * **Summary:** This model is noted as a strong performer on leaderboards for its domain-specific fine-tuning.25 It serves as an example of how a smaller, fine-tuned model can be a better choice for specific tasks than a larger, general-purpose model, making it highly valuable for targeted browser applications.  
10. **Model:** fblgit/pancho-v1-qw25-3B-UNAMGS  
    * **Vendor:** fblgit  
    * **Size:** 3.0B parameters  
    * **Summary:** Another model recognized on leaderboards, this one also demonstrates strong performance for its size.25 Its presence in leaderboards and community discussions makes it a credible option for developers seeking a reliable and efficient model for their browser-based projects.

---

## **Part III: Comparative Analysis and Actionable Insights**

### **3.1. Comparative Analysis: A Strategic Matrix**

The selection of a model for browser-based inference is a multi-dimensional problem that requires a balanced consideration of model size, license, performance, and application-specific needs. The following table synthesizes the analysis of the 20 models identified, providing a strategic matrix for decision-making.

| Model Name | License Type | Vendor | Size (Parameters) | Quantization Support | Inference Runtime | Community Opinion Summary | Best Use Cases |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Gated Models** |  |  |  |  |  |  |  |
| google/gemma-2b-it | Gated (Google License) | Google | 2.0B | Good | WebGPU/WASM | Best-in-class for size, efficient, strong reasoning. | Chatbots, conversational AI, local reasoning. |
| google/gemma-2b | Gated (Google License) | Google | 2.0B | Good | WebGPU/WASM | High-performance base model, highly efficient. | Fine-tuning, building specialized models. |
| google/gemma-7b | Gated (Google License) | Google | 7.0B | Good | WebGPU/WASM | Best-in-class for size, strong performance. | High-quality text generation, complex reasoning. |
| meta-llama/Llama-2-7b-hf | Gated (Meta AUP) | Meta | 7.0B | Strong | WebGPU/WASM | Foundational model, robust architecture, solid. | General-purpose tasks, text summarization. |
| meta-llama/Llama-2-70b-hf | Gated (Meta AUP) | Meta | 70B | Strong | WebGPU | Pushes boundaries, high quality on high-end hardware. | Complex logical tasks, long-context analysis. |
| mistralai/Mistral-7B-v0.1 | Gated (Apache 2.0-licensed base with AUP) | Mistral AI | 7.3B | Strong | WebGPU/WASM | Superior performance, innovative architecture. | General-purpose tasks, creative writing. |
| mistralai/Mistral-7B-Instruct-v0.2 | Gated (Apache 2.0-licensed base with AUP) | Mistral AI | 7.3B | Strong | WebGPU/WASM | Excellent instruction-following. | Chatbots, interactive applications. |
| Qwen/Qwen2.5-3B | Gated | Qwen | 3.0B | Strong | WebGPU/WASM | High performance for its size, strong coding skills. | Coding assistance, general text generation. |
| Qwen/Qwen2.5-7B | Gated | Qwen | 8.0B | Strong | WebGPU/WASM | Best-in-class for its size, excellent at coding. | Coding assistance, technical tasks. |
| Qwen/Qwen2.5-72B | Gated | Qwen | 73B | Strong | WebGPU | Pushes boundaries, high quality on high-end hardware. | Complex multi-modal tasks, advanced reasoning. |
| **Non-Gated Models** |  |  |  |  |  |  |  |
| Xenova/phi-3-mini-4k-instruct | Non-Gated (MIT License) | Microsoft | 3.8B | Excellent (AWQ) | WebGPU/WASM | Powerhouse for its size, performs like a 7B model. | Private chatbots, logical reasoning, JSON output. |
| Xenova/phi-1.5 | Non-Gated (MIT License) | Microsoft | 1.3B | Good | WASM | Efficient, strong reasoning for its size. | Lightweight, latency-sensitive tasks. |
| Xenova/all-MiniLM-L6-v2 | Non-Gated (Apache 2.0) | Xenova | 80MB | Excellent (Binary) | WASM | Incredibly small, fast, and high-quality for embeddings. | Semantic search, feature extraction. |
| Xenova/distilgpt2 | Non-Gated (Apache 2.0) | Hugging Face | 82M | Good | WASM | Very fast, lightweight, excellent for demos. | Prototyping, simple text generation. |
| Xenova/llama2.c-stories15M | Non-Gated | Xenova | 15.2M | Good | WASM | Extremely lightweight, ultra-fast loading. | Ultra-lightweight text generation. |
| Xenova/llama2.c-stories110M | Non-Gated | Xenova | 110M | Good | WASM | Small, efficient, better quality than 15M version. | Efficient storytelling and text generation. |
| microsoft/Phi-3-medium-128k-instruct | Non-Gated (MIT License) | Microsoft | 14B | Good | WebGPU | Strong long-context performance, good reasoning. | Long-document summarization, broad-context tasks. |
| FlofloB/100k\_fineweb\_continued\_pretraining\_Qwen2.5-0.5B-Instruct\_Unsloth\_merged\_16bit | Non-Gated | FlofloB | 0.6B | Good | WASM | Competitive sub-1B model. | Niche, continuously trained applications. |
| ehristoforu/coolqwen-3b-it | Non-Gated | ehristoforu | 3.0B | Good | WASM | Strong domain-specific fine-tuning. | Specialized chatbot, fine-tuned tasks. |
| fblgit/pancho-v1-qw25-3B-UNAMGS | Non-Gated | fblgit | 3.0B | Good | WASM | Strong leaderboard performance for size. | General text generation, versatile tasks. |

The comparative analysis reveals a critical dynamic: the relationship between model size, performance, and accuracy is not linear in a browser environment. While it may seem intuitive that a larger model will always perform better, the analysis suggests that the "sweet spot" for most practical browser applications is found in models that expertly balance a manageable download size with sufficient accuracy for the task at hand.29 This is exemplified by the community's high praise for models like the Phi-3 mini and Gemma 2B, which are celebrated precisely because they challenge the assumption that high-quality results necessitate a massive model size.19

The community consensus on model strengths is highly nuanced. For instance, the Phi-3 series is consistently lauded for its strong logical reasoning and ability to produce near-perfect JSON output, making it an excellent choice for structured data generation tasks.19 In contrast, models from the Qwen series are noted for their exceptional coding abilities, and the Llama family is celebrated for its foundational robustness and versatility.23 This illustrates that a simple leaderboard ranking does not capture the full utility of a model; a developer's choice should be guided by the specific strengths required for their application.

### **3.2. Recommendations for Implementation**

The strategic selection of a model for browser-based AI should be guided by the specific needs of the application. For lightweight, latency-sensitive applications that prioritize a seamless user experience and minimal initial load time, a small, highly-quantized, non-gated model is the optimal choice. Models like Xenova/phi-3-mini or Xenova/distilgpt2 are ideal for use cases such as a local, privacy-preserving chatbot, a client-side summarizer, or a semantic search tool.4 These models can be loaded quickly and run efficiently without a server, offering a robust and autonomous solution.

For applications that demand a higher degree of quality and can accommodate a larger initial download, leveraging the power of WebGPU is essential.10 In these scenarios, a larger, gated model from the Llama, Gemma, or Mistral families may be appropriate, particularly if its specific capabilities (e.g., strong coding or reasoning) are critical to the application's function. The initial download will be substantial, but the performance gains from WebGPU will make inference fast and responsive after the model is cached.

A hybrid architecture represents a balanced and strategic approach for more complex applications. In this model, a small, fast model can be used on the client side to handle common or simple user requests, while a more powerful server-side model is reserved for complex or infrequent queries.10 This approach effectively reduces API costs, improves the overall user experience by handling routine tasks instantly, and reserves server resources for where they are most needed.

The browser-based AI ecosystem is still in its nascent stages, but it is developing at an accelerated pace. The continued refinement of WebGPU and the emergence of new quantization methods are constantly pushing the boundaries of what is possible. As the community continues to refine these technologies, the performance gap between client-side and server-side models will continue to narrow, ushering in a future where powerful, private AI becomes a standard and expected feature of modern web applications.

#### **Works cited**

1. Transformers.js \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/docs/transformers.js/index](https://huggingface.co/docs/transformers.js/index)  
2. xenova/transformers \- NPM, accessed on August 17, 2025, [https://www.npmjs.com/package/@xenova/transformers](https://www.npmjs.com/package/@xenova/transformers)  
3. Xenova/all-MiniLM-L6-v2 · Hugging Face, accessed on August 17, 2025, [https://huggingface.co/Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)  
4. Xenova/distilgpt2 \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/Xenova/distilgpt2](https://huggingface.co/Xenova/distilgpt2)  
5. An Overview of Transformers.js / Daniel Russ \- Observable, accessed on August 17, 2025, [https://observablehq.com/@ca0474a5f8162efb/an-overview-of-transformers-js](https://observablehq.com/@ca0474a5f8162efb/an-overview-of-transformers-js)  
6. LLM Quantization Explained \- joydeep bhattacharjee \- Medium, accessed on August 17, 2025, [https://joydeep31415.medium.com/llm-quantization-explained-4c7ebc7ed4ab](https://joydeep31415.medium.com/llm-quantization-explained-4c7ebc7ed4ab)  
7. What is LLM Quantization ? \- YouTube, accessed on August 17, 2025, [https://www.youtube.com/watch?v=vFLNdOUvD90](https://www.youtube.com/watch?v=vFLNdOUvD90)  
8. LLM Quantization Comparison \- dat1.co, accessed on August 17, 2025, [https://dat1.co/blog/llm-quantization-comparison](https://dat1.co/blog/llm-quantization-comparison)  
9. Can Someone Explain the Differences Between Various LLM Quantization Types? \- Reddit, accessed on August 17, 2025, [https://www.reddit.com/r/LLMDevs/comments/1fbdcj8/can\_someone\_explain\_the\_differences\_between/](https://www.reddit.com/r/LLMDevs/comments/1fbdcj8/can_someone_explain_the_differences_between/)  
10. Excited about WebGPU \+ transformers.js (v3): utilize your full (GPU) hardware in the browser : r/LocalLLaMA \- Reddit, accessed on August 17, 2025, [https://www.reddit.com/r/LocalLLaMA/comments/1fexeoc/excited\_about\_webgpu\_transformersjs\_v3\_utilize/](https://www.reddit.com/r/LocalLLaMA/comments/1fexeoc/excited_about_webgpu_transformersjs_v3_utilize/)  
11. Models \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/models](https://huggingface.co/models)  
12. Transformers.js demos \- a Xenova Collection \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/collections/Xenova/transformersjs-demos-64f9c4f49c099d93dbc611df](https://huggingface.co/collections/Xenova/transformersjs-demos-64f9c4f49c099d93dbc611df)  
13. Xenova/llama2.c-stories15M \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/Xenova/llama2.c-stories15M](https://huggingface.co/Xenova/llama2.c-stories15M)  
14. 2000+ Run LLMs here \- Directly in your browser \- a DavidAU ..., accessed on August 17, 2025, [https://huggingface.co/collections/DavidAU/2000-run-llms-here-directly-in-your-browser-672964a3cdd83d2779124f83](https://huggingface.co/collections/DavidAU/2000-run-llms-here-directly-in-your-browser-672964a3cdd83d2779124f83)  
15. Meta Llama \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/meta-llama](https://huggingface.co/meta-llama)  
16. google/gemma-2b \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/google/gemma-2b](https://huggingface.co/google/gemma-2b)  
17. distilbert/distilgpt2 \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/distilbert/distilgpt2](https://huggingface.co/distilbert/distilgpt2)  
18. microsoft/Phi-3-mini-4k-instruct · Hugging Face, accessed on August 17, 2025, [https://huggingface.co/microsoft/Phi-3-mini-4k-instruct](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct)  
19. How good is Phi-3-mini for everyone? : r/LocalLLaMA \- Reddit, accessed on August 17, 2025, [https://www.reddit.com/r/LocalLLaMA/comments/1cbt78y/how\_good\_is\_phi3mini\_for\_everyone/](https://www.reddit.com/r/LocalLLaMA/comments/1cbt78y/how_good_is_phi3mini_for_everyone/)  
20. Gemma vs. Llama 2 Comparison \- SourceForge, accessed on August 17, 2025, [https://sourceforge.net/software/compare/Gemma-LLM-vs-Llama-2/](https://sourceforge.net/software/compare/Gemma-LLM-vs-Llama-2/)  
21. google/gemma-2b-sfp-cpp \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/google/gemma-2b-sfp-cpp](https://huggingface.co/google/gemma-2b-sfp-cpp)  
22. Llama 2 \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/docs/transformers/model\_doc/llama2](https://huggingface.co/docs/transformers/model_doc/llama2)  
23. Compare Mistral 7B vs. Qwen-7B in 2025 \- Slashdot, accessed on August 17, 2025, [https://slashdot.org/software/comparison/Mistral-7B-vs-Qwen-7B/](https://slashdot.org/software/comparison/Mistral-7B-vs-Qwen-7B/)  
24. Mistral Small/Medium vs Qwen 3 14/32B : r/LocalLLaMA \- Reddit, accessed on August 17, 2025, [https://www.reddit.com/r/LocalLLaMA/comments/1knnyco/mistral\_smallmedium\_vs\_qwen\_3\_1432b/](https://www.reddit.com/r/LocalLLaMA/comments/1knnyco/mistral_smallmedium_vs_qwen_3_1432b/)  
25. Open LLM Leaderboard best models ❤️‍ \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/collections/open-llm-leaderboard/open-llm-leaderboard-best-models-652d6c7965a4619fb5c27a03](https://huggingface.co/collections/open-llm-leaderboard/open-llm-leaderboard-best-models-652d6c7965a4619fb5c27a03)  
26. Phi-3: Microsoft's Mini Language Model is Capable of Running on Your Phone \- Encord, accessed on August 17, 2025, [https://encord.com/blog/microsoft-phi-3-small-language-model/](https://encord.com/blog/microsoft-phi-3-small-language-model/)  
27. microsoft/Phi-3-mini-4k-instruct-gguf \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf)  
28. microsoft/phi-1\_5 \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/microsoft/phi-1\_5](https://huggingface.co/microsoft/phi-1_5)  
29. Transformers.js – Run Transformers directly in the browser | Hacker News, accessed on August 17, 2025, [https://news.ycombinator.com/item?id=40001193](https://news.ycombinator.com/item?id=40001193)  
30. LLMs and JavaScript: practical approaches \- Volcanic Minds, accessed on August 17, 2025, [https://volcanicminds.com/en/insights/llm-javascript-practical-guide](https://volcanicminds.com/en/insights/llm-javascript-practical-guide)  
31. Xenova/llama2.c-stories110M \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/Xenova/llama2.c-stories110M](https://huggingface.co/Xenova/llama2.c-stories110M)  
32. microsoft/Phi-3-medium-128k-instruct \- Hugging Face, accessed on August 17, 2025, [https://huggingface.co/microsoft/Phi-3-medium-128k-instruct](https://huggingface.co/microsoft/Phi-3-medium-128k-instruct)