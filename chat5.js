// @ts-check




function chat5() {

  function initHTML() {
    const ui = document.createElement('div');
    ui.innerHTML = `
<div class=chat-log>Loading...</div>
<div class=chat-input>[Input]</div>
<style>
body {
  position: absolute;
  left: 0; top: 0;
  width: 100%; height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  display: grid;
  grid-template: 1fr auto / 1fr;
}

.chat-log {
  display: grid;
  grid-template: 1fr / 1fr;
}
.chat-input {
  border-top: solid 1px black;
  display: grid;
  grid-template: 1fr auto / 1fr;
}
.prose-mirror {
  overflow-y: auto;
}

.milkdown {
  display: grid;
  grid-template: 1fr / 1fr;
}

.milkdown .ProseMirror {
  min-height: 2em;
  padding: 0.6em;
  font-family: inherit;
  white-space: pre-wrap;
}

</style>
`;

    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    } else {
      cleanBody();
    }

    for (const elem of [...ui.children]) {
      document.body.appendChild(elem);
    }

    const chatLog = /** @type {HTMLElement|null} */ (document.querySelector('.chat-log'));
    const chatInput = /** @type {HTMLElement|null} */ (document.querySelector('.chat-input'));

    return { chatLog, chatInput };
  }

  function cleanBody() {
    for (const elem of [...document.body.childNodes]) {
      if ((/** @type {HTMLElement} */ (elem).tagName || '').toLowerCase() === 'script') continue;
      elem.remove();
    }
  }

  async function initMilkdown({ chatLog, chatInput }) {
    if (chatLog) chatLog.textContent = 'Loading Milkdown...';

    try {
      const kitCore = await import('https://esm.sh/@milkdown/kit@7.15.3/core');
      const kitCommonmark = await import('https://esm.sh/@milkdown/kit@7.15.3/preset/commonmark');

      if (chatLog) chatLog.innerHTML = '';
      if (chatInput) chatInput.innerHTML = '';

      // Create read-only editor in .chat-log
      const chatLogEditor = await kitCore.Editor.make()
        .config((ctx) => {
          ctx.set(kitCore.rootCtx, chatLog);
          ctx.set(kitCore.defaultValueCtx, 'Loaded.');
          ctx.set(kitCore.editorViewOptionsCtx, { editable: () => false });
        })
        .use(kitCommonmark.commonmark)
        .create();

      // Create editable editor in .chat-input, no placeholder, starts empty
      const chatInputEditor = await kitCore.Editor.make()
        .config((ctx) => {
          ctx.set(kitCore.rootCtx, chatInput);
          ctx.set(kitCore.defaultValueCtx, '');
        })
        .use(kitCommonmark.commonmark)
        .create();
      
      return {
        kitCore,
        kitCommonmark,
        chatLogEditor,
        chatInputEditor
      };
    } catch (error) {
      console.log(error);
      const errorElem = document.createElement('pre');
      errorElem.innerText = error.stack || 'ERR ' + error.message;
      errorElem.style.whiteSpace = 'pre-wrap';
      (chatLog || document.body).appendChild(errorElem);
    }
  }

  async function outputMessage(chatLogEditor, msg) {
    await chatLogEditor.action(async (ctx) => {
      const { commands } = ctx.get(milkdownCore.sliceKey);
      await commands.insert(msg);
    });
  }

  async function runBrowser() {
    window.onerror = (...args) => {
      alert(args.map(String).join('\n'));
    };
    const { kitCore, kitCommonmark, chatLog, chatInput } = initHTML();
    const { chatLogEditor, chatInputEditor } = await initMilkdown({ chatLog, chatInput });

    window.onerror = (...args) => {
      try {
        outputMessage(chatLogEditor, args.map(String).join('\n'));
      } catch (errorNext) {
        alert(args.map(String).join('\n') + '\n\n' + errorNext.stack);
      }
    };
  }

  if (typeof window !== 'undefined' && typeof window?.alert === 'function'
    && typeof document !== 'undefined' && typeof document?.createElement === 'function') {
    runBrowser();
  }
}
chat5();
