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
      // Import all necessary Milkdown modules with the same version
      const version = '7.15.3';
      const [
        kitCore,
        kitCommonmark,
        milkdownCore,
        milkdownPresetCommonmark,
        milkdownProse,
        prosemirrorKeymap,
        prosemirrorState
      ] = await Promise.all([
        import(`https://esm.sh/@milkdown/kit@${version}/core`),
        import(`https://esm.sh/@milkdown/kit@${version}/preset/commonmark`),
        import(`https://esm.sh/@milkdown/core@${version}`),
        import(`https://esm.sh/@milkdown/preset-commonmark@${version}`),
        import(`https://esm.sh/@milkdown/prose@${version}`),
        import('https://esm.sh/prosemirror-keymap@1.2.0'),
        import('https://esm.sh/prosemirror-state@1.3.4')
      ]);

      if (chatLog) chatLog.innerHTML = '';
      if (chatInput) chatInput.innerHTML = '';

      // Use context keys from milkdownCore only
      const { rootCtx, defaultValueCtx, editorViewOptionsCtx } = milkdownCore;

      // Create read-only editor in .chat-log
      const chatLogEditor = await milkdownCore.Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, chatLog);
          ctx.set(defaultValueCtx, 'Loaded.');
          ctx.set(editorViewOptionsCtx, { editable: () => false });
        })
        .use(kitCommonmark.commonmark)
        .create();

      // Create editable editor in .chat-input, no placeholder, starts empty
      const chatInputEditor = await milkdownCore.Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, chatInput);
          ctx.set(defaultValueCtx, '');
        })
        .use(kitCommonmark.commonmark)
        .create();

      return {
        kitCore,
        kitCommonmark,
        milkdownCore,
        milkdownPresetCommonmark,
        milkdownProse,
        prosemirrorKeymap,
        prosemirrorState,
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

  async function outputMessage(chatLogEditor, milkdownCore, msg) {
    await chatLogEditor.action((ctx) => {
      const view = ctx.get(milkdownCore.editorViewCtx);
      const parser = ctx.get(milkdownCore.parserCtx);
      const serializer = ctx.get(milkdownCore.serializerCtx);
      const state = view.state;
      // Get current markdown, append new message, and parse
      const currentMarkdown = serializer(state.doc);
      const newMarkdown = currentMarkdown ? (currentMarkdown + '\n' + msg) : msg;
      const doc = parser(newMarkdown);
      // Use replaceWith and doc.content to avoid TransformError
      const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
      view.dispatch(tr);
    });
    // Scroll chat log to bottom (smooth if possible)
    const chatLogElem = document.querySelector('.chat-log');
    if (chatLogElem) {
      if ('scrollTo' in chatLogElem) {
        chatLogElem.scrollTo({ top: chatLogElem.scrollHeight, behavior: 'smooth' });
      } else {
        chatLogElem.scrollTop = chatLogElem.scrollHeight;
      }
    }
  }

  async function runBrowser() {
    window.onerror = (...args) => {
      alert(args.map(String).join('\n'));
    };
    const { kitCore, kitCommonmark, chatLog, chatInput } = initHTML();
    const milkdownResult = await initMilkdown({ chatLog, chatInput });
    if (!milkdownResult) return;
  const { chatLogEditor, chatInputEditor, milkdownCore, prosemirrorKeymap, prosemirrorState } = milkdownResult;

    outputMessage(chatLogEditor, milkdownCore, 'Milkdown editor component is loaded correctly. Please try typing...');

    // Add a ProseMirror plugin to handle Enter key in chat input editor
    await chatInputEditor.action((ctx) => {
      const serializer = ctx.get(milkdownCore.serializerCtx);
      const view = ctx.get(milkdownCore.editorViewCtx);
      const { Plugin } = prosemirrorState;
      // Add a keymap plugin for Enter
      const enterPlugin = new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (
              event.key === 'Enter' &&
              !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
            ) {
              event.preventDefault();
              const inputMarkdown = serializer(view.state.doc).trim();
              if (inputMarkdown) {
                const msg = `user typed:\n> ${inputMarkdown.replace(/\n/g, '\n> ')}`;
                outputMessage(chatLogEditor, milkdownCore, msg);
                // Clear input
                const tr = view.state.tr.replaceWith(
                  0,
                  view.state.doc.content.size,
                  view.state.schema.nodes.doc.createAndFill().content
                );
                view.dispatch(tr);
              }
              return true;
            }
            return false;
          },
        },
      });
      view.state = view.state.reconfigure({
        plugins: [...view.state.plugins, enterPlugin],
      });
      view.updateState(view.state);
    });

    window.onerror = (...args) => {
      try {
        outputMessage(chatLogEditor, milkdownCore, args.map(String).join('\n'));
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
