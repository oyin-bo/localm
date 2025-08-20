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
import { Crepe } from '@milkdown/crepe';

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
  inputPlugins = [], // Keep for backward compatibility but not used for Crepe
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

  // Create editable Crepe editor in .chat-input
  const crepeInput = new Crepe({
    root: chatInput,
    defaultValue: '',
    features: {
      [Crepe.Feature.BlockEdit]: false, // Disable slash menu and block editing
      [Crepe.Feature.Placeholder]: true,
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.CodeMirror]: true,
      // Disable features not needed for chat input
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.Table]: false,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.LinkTooltip]: false
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: 'Start typing...',
        mode: 'block'
      }
    }
  });

  const chatInputEditor = await crepeInput.create();

  // Auto-focus the Crepe input editor when ready
  try {
    // Crepe exposes the underlying milkdown editor through .editor property
    crepeInput.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (view && typeof view.focus === 'function') view.focus();
    });
  } catch (e) {
    // Ignore if focusing fails in some environments
  }

  return {
    chatLogEditor,
    chatInputEditor,
    crepeInput // Return the crepe instance for additional control
  };
}
