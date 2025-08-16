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
      if ((/** @type {HTMLElement} */ (elem).tagName || '').toLowerCase() === 'script') continue;
      elem.remove();
    }
  }

  async function outputMessage(editor, msg) {
    await editor.action(async (ctx) => {
      const { commands } = ctx.get(milkdownCore.sliceKey);
      await commands.insert(msg);
    });
  }



  async function runBrowser() {
    window.onerror = (...args) => {
      alert(args.map(String).join('\n'));
    };
    initHTML();
    document.querySelector('.chat-log').innerText = 'Loading Milkdown...';

    try {
      // Dynamically import Milkdown Crepe and CSS
      const crepeModule = await import('https://esm.sh/@milkdown/crepe');
      await import('https://esm.sh/@milkdown/crepe/theme/common/style.css');
      await import('https://esm.sh/@milkdown/crepe/theme/nord.css');

      // Create editable editor in .chat-input
      const editableCrepe = new crepeModule.Crepe({
        root: '.chat-input',
        defaultValue: '# Hello, Milkdown!'
      });
      await editableCrepe.create();

      // Create readonly editor in .chat-log
      const readonlyCrepe = new crepeModule.Crepe({
        root: '.chat-log',
        defaultValue: 'Loaded.',
        editable: false
      });
      await readonlyCrepe.create();
    } catch (error) {
      console.log(error);
      const errorElem = document.createElement('pre');
      errorElem.innerText = error.stack || 'ERR ' + error.message;
      errorElem.style.whiteSpace = 'pre-wrap';
      document.querySelector('.chat-log').appendChild(errorElem);
    }
  }

  if (typeof window !== 'undefined' && typeof window?.alert === 'function'
    && typeof document !== 'undefined' && typeof document?.createElement === 'function') {
    runBrowser();
  }
}
chat5();
