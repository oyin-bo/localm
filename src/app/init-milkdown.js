// @ts-check

import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx
} from '@milkdown/core';
import { Crepe } from '@milkdown/crepe';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { commonmark } from '@milkdown/kit/preset/commonmark';

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
      ctx.set(defaultValueCtx, 'Loaded.');
      ctx.set(editorViewOptionsCtx, { editable: () => false });
    })
    .use(commonmark)
    .create();

  // Create editable Crepe editor in .chat-input (without BlockEdit)
  const crepeInput = new Crepe({
    root: chatInput,
    defaultValue: '',
    features: {
      // Do NOT enable BlockEdit here; we'll add it later after models load
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
        text: 'Start typing...',
        mode: 'block'
      }
    }
  });
  // Create input editor immediately so the UI is responsive.
  const chatInputEditor = await crepeInput.create();

  // Fetch models in background and add BlockEdit when ready
  (async () => {
    try {
      const { id, promise, cancel } = await worker.listChatModels({}, undefined);
      const out = await promise;
      const entries = Array.isArray(out.models ? out.models : out) ? (out.models || out) : [];
      const availableModels = entries.map(e => ({ id: e.id, name: e.name || (e.id || '').split('/').pop(), size: '', slashCommand: (e.id || '').split('/').pop(), pipeline_tag: e.pipeline_tag || null, requiresAuth: e.classification === 'auth-protected' }));

      // Add BlockEdit feature now that models are available
      crepeInput.addFeature(blockEdit, {
        buildMenu: (groupBuilder) => {
          const modelsGroup = groupBuilder.addGroup('models', 'Models');
          (availableModels || []).forEach((model) => modelsGroup.addItem(model.slashCommand, { label: `${model.name} ${model.size ? `(${model.size})` : ''}`, icon: '🤖', onRun: () => { if (onSlashCommand) onSlashCommand(model.id); } }));
        }
      });
    } catch (e) {
      console.warn('Failed to load models for BlockEdit via worker:', e);
    }
  })();

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
