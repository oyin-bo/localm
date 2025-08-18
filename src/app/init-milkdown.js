// @ts-check

import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx
} from '@milkdown/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { slashFactory } from "@milkdown/plugin-slash";

/**
 * @typedef {{
 *  chatLog: HTMLElement,
 *  chatInput: HTMLElement,
 *  inputPlugins?: any[],
 *  onSlashCommand?: (command: string) => void | boolean | Promise<void | boolean>
 * }} InitMilkdownOptions
 */

/**
 * @param {InitMilkdownOptions} options
 */
export async function initMilkdown({
  chatLog,
  chatInput,
  inputPlugins = [],
  onSlashCommand
}) {
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

  // Auto-focus the input editor's DOM when ready
  try {
    chatInputEditor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (view && typeof view.focus === 'function') view.focus();
    });
  } catch (e) {
    // Ignore if focusing fails in some environments
  }

  return {
    chatLogEditor,
    chatInputEditor
  };
}
