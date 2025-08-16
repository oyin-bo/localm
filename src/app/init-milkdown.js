// @ts-check

import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';

/**
 * @typedef {{ chatLog: HTMLElement, chatInput: HTMLElement, inputPlugins?: any[] }} InitMilkdownOptions
 */

/**
 * @param {InitMilkdownOptions} options
 */
export async function initMilkdown({ chatLog, chatInput, inputPlugins = [] }) {
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
  let inputBuilder = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, chatInput);
      ctx.set(defaultValueCtx, '');
    })
    .use(commonmark);

  for (const p of inputPlugins) {
    inputBuilder = inputBuilder.use(p);
  }

  const chatInputEditor = await inputBuilder.create();

  return {
    chatLogEditor,
    chatInputEditor
  };
}
