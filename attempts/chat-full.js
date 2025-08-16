import * as transformers from 'https://cdn.jsdelivr.net/npm/@xenova/transformers/+esm';

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
    return `Instruction: Answer briefly.\nInput: ${userText}\nOutput:`;
  } else {
    const sys = "You are a helpful assistant. Answer briefly.";
    const turns = history.map(m => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`));
    return `${sys}\n${turns.join("\n")}\nAssistant:`;
  }
}

// Динамічний імпорт transformers.js
let transformers = null;
let transformersLoadError = null;

async function loadTransformers() {
  if (transformers) return transformers;
  try {
    pushMsg("sys", "[debug] Завантаження transformers.js...");
    transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1');
    pushMsg("sys", "[debug] transformers.js успішно завантажено");
    return transformers;
  } catch (err) {
    transformersLoadError = err;
    pushMsg("sys", `Помилка завантаження transformers.js: ${String(err && err.message || err)}`,
      err && err.stack ? err.stack : undefined);
    throw err;
  }
}

// --- DEBUG-AWARE ensurePipeline ---
async function ensurePipeline(model) {
  pushMsg("sys", `[debug] ensurePipeline called for ${model}`);
  if (cache.has(model)) {
    pushMsg("sys", `[debug] ensurePipeline cache hit for ${model}`);
    return cache.get(model);
  }
  const task = taskForModel(model);
  setStatus(`Завантаження моделі (${task})…`, true);
  let tjs;
  try {
    tjs = await loadTransformers();
    if (!tjs || typeof tjs.pipeline !== 'function') {
      const msg = "Transformers.js (ESM) не завантажено або недоступно. Перевірте імпорт.";
      const err = new Error(msg);
      setStatus("Помилка завантаження моделі", false);
      pushMsg("sys", `Помилка при завантаженні '${model}': ${msg}`,
        err.stack);
      throw err;
    }
    pushMsg("sys", `[debug] calling transformers.pipeline(${task}, ${model})`);
    const pipe = await tjs.pipeline(task, model);
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

// --- DEBUG-AWARE generateAndReply ---
async function generateAndReply() {
  pushMsg("sys", "[debug] generateAndReply called");
  const model = currentModel;
  let pipe, task;
  try {
    pushMsg("sys", `[debug] ensurePipeline for ${model}`);
    const pipeObj = await ensurePipeline(model);
    pipe = pipeObj.pipe;
    task = pipeObj.task;
    pushMsg("sys", `[debug] ensurePipeline ok: ${model}, task=${task}`);
  } catch (err) {
    pushMsg("sys", `[debug] ensurePipeline failed: ${String(err && err.message || err)}`);
    throw err;
  }
  const prompt = buildPrompt(model, chatHistory);

  setStatus("Генерація відповіді…", true);
  try {
    const genOpts = {
      max_new_tokens: 64,
      temperature: 0.8,
      top_p: 0.9,
      do_sample: true
    };
    pushMsg("sys", "[debug] calling pipe");
    const out = await pipe(prompt, genOpts);
    pushMsg("sys", "[debug] pipe returned");

    let fullText = "";
    if (Array.isArray(out) && out.length) {
      fullText = out[0].generated_text ?? out[0].summary_text ?? String(out[0].text || "");
    } else if (typeof out === "string") {
      fullText = out;
    } else {
      fullText = JSON.stringify(out);
    }

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
    throw err;
  } finally {
    setStatus("Готово", false);
  }
}

// --- DEBUG-AWARE form submit ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = (promptEl.value || "").trim();
  if (!text) return;

  chatHistory.push({ role: "user", content: text });
  pushMsg("me", text);

  promptEl.value = "";
  try {
    pushMsg("sys", "[debug] form submit: calling generateAndReply");
    await generateAndReply();
  } catch (err) {
    pushMsg("sys", `global unhandled in submit: ${String(err && err.message || err)}`,
      err && err.stack ? err.stack : undefined);
  }
  promptEl.focus();
});

promptEl.focus();

window.onerror = function (msg, url, line, col, error) {
  let details = '';
  if (error && error.stack) {
    details = error.stack;
  } else {
    details = `${msg} at ${url}:${line}:${col}`;
  }
  pushMsg('sys', `global unhandled: ${msg}`, details);
  return false;
};

// DEBUG: перевірка виконання модуля
try {
  const el = document.querySelector('#messages');
  if (el) {
    const div = document.createElement('div');
    div.className = 'msg sys';
    div.textContent = '[debug] JS loaded';
    el.appendChild(div);
  }
} catch (e) {}
