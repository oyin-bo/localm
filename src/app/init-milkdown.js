// @ts-check

import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx
} from '@milkdown/core';
import { Crepe } from '@milkdown/crepe';
import { commonmark } from '@milkdown/kit/preset/commonmark';

import { createModelSlashPlugin } from './model-slash';
import { outputMessage } from './output-message';

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

/**
 * @typedef {{
 *  chatLog: HTMLElement,
 *  chatInput: HTMLElement,
 *  inputPlugins?: any[],
 *  onSlashCommand?: (command: string) => void | boolean | Promise<void | boolean>,
 *  worker?: any
 * }} InitMilkdownOptions
 */

/**
 * @param {InitMilkdownOptions} options
 */
export async function initMilkdown({
  chatLog,
  chatInput,
  inputPlugins = [], // Keep for backward compatibility but not used for Crepe
  onSlashCommand,
  worker
}) {
  if (chatLog) chatLog.textContent = 'Loading Milkdown...';

  if (chatLog) chatLog.innerHTML = '';
  if (chatInput) chatInput.innerHTML = '';


  // Create read-only editor in .chat-log
  const chatLogEditor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, chatLog);
      ctx.set(editorViewOptionsCtx, { editable: () => false });
    })
    .use(commonmark)
    .create();

  let availableModels = [];

  // Create the model slash plugin configuration
  const modelSlashSetup = createModelSlashPlugin({
    getModels: () => availableModels,
    onSlashCommand: onSlashCommand
  });

  // Create editable Crepe editor in .chat-input (without BlockEdit)
  const crepeInput = new Crepe({
    root: chatInput,
    defaultValue: '',
    features: {
      [Crepe.Feature.BlockEdit]: false,
      [Crepe.Feature.Placeholder]: true,
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.CodeMirror]: true,
      [Crepe.Feature.ImageBlock]: true,
      [Crepe.Feature.Table]: true,
      [Crepe.Feature.Latex]: true,
      [Crepe.Feature.Toolbar]: true,
      [Crepe.Feature.LinkTooltip]: true,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: 'Prompt or /model...',
        mode: 'block'
      }
    }
  });

  // Create input editor with model slash plugin
  // Apply the model slash plugin configuration before creating the editor
  const chatInputEditor = await crepeInput
    .editor.config(modelSlashSetup.config)
    .use(modelSlashSetup.plugin)
    .create();

  // Fetch models in background and add model slash plugin when ready
  (async () => {
    const { id, promise, cancel } = await worker.listChatModels({}, undefined);
    const out = await promise;

    // Normalize possible response shapes
    let entries = [];
    if (Array.isArray(out)) entries = out;
    else if (out && Array.isArray(out.models)) entries = out.models;
    else if (out && Array.isArray(out.results)) entries = out.results;
    else entries = [];

    availableModels = entries.map(e => ({
      id: e.id || e.modelId || '',
      name: e.name || (e.id || e.modelId || '').split('/').pop(),
      size: '',
      requiresAuth: e.classification === 'auth-protected'
    }));

    outputMessage('Models discovered: **' + availableModels.length + '**');
  })();

  // Auto-focus the Crepe input editor when ready
  // Crepe exposes the underlying milkdown editor through .editor property
  crepeInput.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view && typeof view.focus === 'function') view.focus();
  });

  return {
    chatLogEditor,
    chatInputEditor,
    crepeInput // Return the crepe instance for additional control
  };
}
