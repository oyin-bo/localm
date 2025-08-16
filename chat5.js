
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
 
.chat-log .milkdown {
  height: 100%;
}
.chat-input .milkdown {
  border-top: 1px solid #4c566a;
}
.prose-mirror {
    height: 100%;
    overflow-y: auto;
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
  }

  function cleanBody() {
    for (const elem of [...document.body.childNodes]) {
      if ((elem.tagName || '').toLowerCase() === 'script') continue;
      elem.remove();
    }
  }

  async function outputMessage(editor, msg) {
    await editor.action(async (ctx) => {
      const { commands } = ctx.get(milkdownCore.sliceKey);
      await commands.insert(msg);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function runBrowser() {
    alert('runBrowser...');
    window.onerror = (...args) => {
      alert(
        args.map(String).join('\n')
      );
    };
    initHTML();
    document.querySelector('chat-log').innerText = 'Loading Milkdown...';

    try {

    await Promise.all([
      loadScript('https://unpkg.com/@milkdown/core/dist/index.umd.js'),
      loadScript('https://unpkg.com/@milkdown/preset-commonmark/dist/index.umd.js'),
      loadScript('https://unpkg.com/@milkdown/theme-nord/dist/index.umd.js')
    ]);

    const { Editor, EditorStatus } = milkdownCore;
    const { nord } = milkdownThemeNord;
    const { commonmark } = milkdownPresetCommonmark;

    const editableEditor = await Editor.make()
      .config((ctx) => {
        ctx.set(milkdownCore.rootKey, document.querySelector('.chat-input'));
        ctx.set(milkdownCore.defaultValue, '# Hello, Milkdown!');
      })
      .use(nord)
      .use(commonmark)
      .create();

    const readonlyEditor = await Editor.make()
      .config((ctx) => {
        ctx.set(milkdownCore.rootKey, document.querySelector('.chat-log'));
        ctx.set(milkdownCore.defaultValue, '');
        ctx.set(milkdownCore.editorViewOptionsKey, { editable: () => false });
      })
      .use(nord)
      .use(commonmark)
      .create();

    await outputMessage(readonlyEditor, 'Loaded.');
    } catch (error) {
      const errorElem = document.createElement('pre');
      errorElem.innerText = error.stack || String(error);
      document.querySelector('chat-log').appendChild(errorElem);
    }
  }

  if (typeof window !== 'undefined' && typeof window?.alert === 'function'
    && typeof document !== 'undefined' && typeof document?.createElement === 'function') {
    runBrowser();
  }
}
chat5();
