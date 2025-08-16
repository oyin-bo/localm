// @ts-check

import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';

export async function initMilkdown({ chatLog, chatInput }) {
  if (chatLog) chatLog.textContent = 'Loading Milkdown...';

  if (chatLog) chatLog.innerHTML = '';
  if (chatInput) chatInput.innerHTML = '';

  // Create read-only editor in .chat-log
  const chatLogEditor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, chatLog);
      ctx.set(defaultValueCtx, 'Loaded.');
      ctx.set(editorViewOptionsCtx, { editable: () => false });
    })
    .use(commonmark)
    .create();

  // Create editable editor in .chat-input, no placeholder, starts empty
  const chatInputEditor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, chatInput);
      ctx.set(defaultValueCtx, '');
    })
    .use(commonmark)
    .create();

  return {
    chatLogEditor,
    chatInputEditor
  };
}
