(() => {
  const $ = (s) => document.querySelector(s);
  const messagesEl = $("#messages");
  const statusEl = $("#status");
  const statusText = $("#status-text");
  const modelSel = $("#model");
  const promptEl = $("#prompt");
  const sendBtn = $("#send");
  const form = $("#composer");

  // Режими/стан
  let busy = false;
  let currentModel = modelSel.value || "Xenova/distilgpt2";
  const cache = new Map(); // model -> { pipe, task }
  const chatHistory = [];  // { role: 'user'|'assistant', content: string }

  // Зручні хелпери UI
  function setStatus(text, isBusy) {
    statusText.textContent = text;
    messagesEl.setAttribute("aria-busy", isBusy ? "true" : "false");
    busy = !!isBusy;
    promptEl.disabled = !!isBusy;
    sendBtn.disabled = !!isBusy;
    modelSel.disabled = !!isBusy;
  }
  function pushMsg(role, text, details) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    if (role === 'sys' && details) {
      // Показати повідомлення з розгортанням stack trace
    div.innerHTML = `<span>${text}</span><pre class="error-details">${escapeHtml(details)}</pre>`;
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Захист від XSS у stack trace
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Визначення задачі для моделі
  function taskForModel(model) {
    if ((model || "").toLowerCase().includes("t5")) return "text2text-generation";
    return "text-generation";
  }

  // Побудова простого prompt’а (мінімально універсальний)
  function buildPrompt(model, history) {
    const task = taskForModel(model);
    const lastUser = history.slice().reverse().find(m => m.role === "user");
    const userText = lastUser ? lastUser.content : "";

    if (task === "text2text-generation") {
      // T5 зазвичай у форматі інструкції
      return `Instruction: Answer briefly.\nInput: ${userText}\nOutput:`;
    } else {
      // GPT-подібні моделі — простий діалоговий патерн
      const sys = "You are a helpful assistant. Answer briefly.";
      const turns = history.map(m => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`));
      return `${sys}\n${turns.join("\n")}\nAssistant:`;
    }
  }

  // Завантаження/кешування пайплайну
  async function ensurePipeline(model) {
    if (cache.has(model)) return cache.get(model);
    const task = taskForModel(model);
    setStatus(`Завантаження моделі (${task})…`, true);
    try {
      // Опційно: можна налаштувати шляхи для wasm:
      // window.transformers.env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/@xenova/transformers@3.0.0/dist/wasm/";

      const pipe = await window.transformers.pipeline(task, model);
      const entry = { pipe, task };
      cache.set(model, entry);
      setStatus("Готово", false);
      return entry;
    } catch (err) {
      setStatus("Помилка завантаження моделі", false);
      pushMsg("sys", `Помилка при завантаженні '${model}': ${String(err && err.message || err)}`,
        err && err.stack ? err.stack : undefined);
      throw err;
    }
  }

  async function generateAndReply() {
    const model = currentModel;
    const { pipe, task } = await ensurePipeline(model);
    const prompt = buildPrompt(model, chatHistory);

    setStatus("Генерація відповіді…", true);
    try {
      // Параметри генерації обрані консервативно для мобільних пристроїв
      const genOpts = {
        max_new_tokens: 64,
        temperature: 0.8,
        top_p: 0.9,
        do_sample: true
      };
      const out = await pipe(prompt, genOpts);

      // Узгодження виходу для різних пайплайнів
      let fullText = "";
      if (Array.isArray(out) && out.length) {
        // text-generation: [{ generated_text }]
        // text2text-generation: [{ generated_text }]
        fullText = out[0].generated_text ?? out[0].summary_text ?? String(out[0].text || "");
      } else if (typeof out === "string") {
        fullText = out;
      } else {
        fullText = JSON.stringify(out);
      }

      // Для text-generation відповідь часто містить prompt + продовження — відтягуємо лише продовження
      let reply = fullText;
      if (task === "text-generation" && fullText.startsWith(prompt)) {
        reply = fullText.slice(prompt.length);
      }

      reply = (reply || "").trim();
      if (!reply) reply = "(порожня відповідь)";

      chatHistory.push({ role: "assistant", content: reply });
      pushMsg("bot", reply);
    } catch (err) {
      pushMsg("sys", `Помилка генерації: ${String(err && err.message || err)}`,
        err && err.stack ? err.stack : undefined);
    } finally {
      setStatus("Готово", false);
    }
  }

  // Обробники подій
  modelSel.addEventListener("change", async () => {
    currentModel = modelSel.value;
    // Не завантажуємо модель негайно — лише коли треба згенерувати.
    // Але повідомимо користувача:
    pushMsg("sys", `Обрано модель: ${currentModel}`);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = (promptEl.value || "").trim();
    if (!text) return;

    chatHistory.push({ role: "user", content: text });
    pushMsg("me", text);

    promptEl.value = "";
    await generateAndReply();
    promptEl.focus();
  });

  // Стартовий стан
  promptEl.focus();
})();
