// @ts-check

export function workerConnection() {
  // TODO: load worker and expose an API for the rest of app to use

  const workerLoaded = loadWorker();

  const connection = {
    loaded: workerLoaded.then(worker => ({ env: worker.env })),
    listModels,
  loadModel,
  runPrompt,
  listChatModels
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
            resolve({ worker, pending, send, env: msg.env });
            return;
          }
          if (msg && msg.id) {
            const id = msg.id;
            const entry = pending.get(id);
            if (!entry) return;
            if (msg.type === 'response') {
              pending.delete(id);
              entry.resolve(msg.result);
            } else if (msg.type === 'error') {
              pending.delete(id);
              entry.reject(new Error(msg.error));
            } else if (msg.type === 'progress') {
              // progress message for long-running operations
              try {
                if (entry.onProgress) entry.onProgress(msg);
              } catch (e) {
                // swallow progress handler errors
              }
            }
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

  /**
   * List and classify chat-capable models via worker. Returns a promise and accepts an onProgress callback.
   * @param {object} params
   * @param {(msg: any)=>void} [onProgress]
   */
  async function listChatModels(params = {}, onProgress) {
    await workerLoaded;
    const { send, pending, worker } = await workerLoaded;
    return new Promise((resolve, reject) => {
      const id = String(Math.random()).slice(2);
      pending.set(id, { resolve, reject, onProgress });
      const msg = Object.assign({}, params, { type: 'listChatModels', id });
      try {
        worker.postMessage(msg);
      } catch (err) {
        pending.delete(id);
        return reject(err);
      }
      // also send via send to allow worker to reply with final response via same flow
      send({ type: 'listChatModels', params }).then(resolve).catch(reject);
    });
  }

  /** @param {string} modelName */
  async function loadModel(modelName) {
    await workerLoaded;
    const { send } = await workerLoaded;
    return send({ type: 'loadModel', modelName });
  }

  /**
   * @param {string} promptText
   * @param {string} [modelName]
   */
  async function runPrompt(promptText, modelName) {
    await workerLoaded;
    const { send } = await workerLoaded;
    const sendPromise = send({ type: 'runPrompt', prompt: promptText, modelName });
    return sendPromise;
  }
}
