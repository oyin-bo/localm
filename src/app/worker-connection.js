// @ts-check

export function workerConnection() {
  // TODO: load worker and expose an API for the rest of app to use

  const workerLoaded = loadWorker();

  const connection = {
    loaded: workerLoaded.then(() => { }),
    listModels,
    loadModel,
    runPrompt
  };

  return connection;

  function loadWorker() {
    // Create a worker from the same URL as the currently executing script.
    // We locate the current script URL via document.currentScript when in the window context.
    // Build a blob that imports this script and calls bootWorker when executed inside a worker.
    return new Promise((resolve, reject) => {
      try {
        const scriptUrl = (typeof document !== 'undefined' && (document.currentScript && /** @type {HTMLScriptElement} */(document.currentScript).src)) ||
          (typeof document !== 'undefined' && document.scripts && document.scripts[document.scripts.length - 1] && document.scripts[document.scripts.length - 1].src) ||
          (typeof window !== 'undefined' && window.location && window.location.href) || '';

        const worker = new Worker(scriptUrl, { type: 'module' });

        const pending = new Map();
        let ready = false;

        worker.addEventListener('message', (ev) => {
          const msg = ev.data || {};
          if (msg && msg.type === 'ready') {
            ready = true;
            resolve({ worker: worker, pending, send });
            return;
          }

          if (msg && msg.id) {
            const id = msg.id;
            const entry = pending.get(id);
            if (!entry) return;
            pending.delete(id);
            if (msg.type === 'response') entry.resolve(msg.result);
            else if (msg.type === 'error') entry.reject(new Error(msg.error));
            else entry.resolve(msg);
          }
        });

        worker.addEventListener('error', (err) => {
          if (!ready) reject(err);
        });

        function send(message) {
          return new Promise((res, rej) => {
            const id = String(Math.random()).slice(2);
            pending.set(id, { resolve: res, reject: rej });
            worker.postMessage(Object.assign({}, message, { id }));
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async function listModels() {
    await workerLoaded;
  const { send } = await workerLoaded;
  return send({ type: 'listModels' });
  }

  /** @param {string} modelName */
  async function loadModel(modelName) {
    await workerLoaded;
  const { send } = await workerLoaded;
  return send({ type: 'loadModel', modelName });
  }

  /**
   * @param {string} promptText
   * @param {string} modelName
   */
  async function runPrompt(promptText, modelName) {
    await workerLoaded;
    const { send } = await workerLoaded;
    return send({ type: 'runPrompt', prompt: promptText, modelName });
  }
}
