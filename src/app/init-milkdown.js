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
import { outputMessage } from './output-message';

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
      if (!worker || typeof worker.listChatModels !== 'function') {
        console.warn('[initMilkdown] worker.listChatModels not available; skipping BlockEdit setup');
        return;
      }
  console.log('[initMilkdown] requesting models from worker');
      const { id, promise, cancel } = await worker.listChatModels({}, undefined);
      const out = await promise;
  console.log('[initMilkdown] worker.listChatModels resolved', out && out.meta ? out.meta : out);

      // Normalize possible response shapes
      let entries = [];
      if (Array.isArray(out)) entries = out;
      else if (out && Array.isArray(out.models)) entries = out.models;
      else if (out && Array.isArray(out.results)) entries = out.results;
      else entries = [];

      const availableModels = entries.map(e => ({
        id: e.id || e.modelId || '',
        name: e.name || (e.id || e.modelId || '').split('/').pop(),
        size: '',
        slashCommand: (e.id || e.modelId || '').split('/').pop(),
        pipeline_tag: e.pipeline_tag || null,
        requiresAuth: e.classification === 'auth-protected'
      }));

      console.log('[initMilkdown] extracted models', { count: availableModels.length });

      outputMessage('Models discovered: **' + availableModels.length + '**');

      // Add BlockEdit feature now that models are available
      const _addFeatureResult = crepeInput.addFeature(blockEdit, {
        buildMenu: (groupBuilder) => {
          const modelsGroup = groupBuilder.addGroup('models', 'Models');
          (availableModels || []).forEach((model) => modelsGroup.addItem(model.slashCommand, {
            label: `${model.name} ${model.size ? `(${model.size})` : ''}`,
            icon: '🤖',
            onRun: () => { if (onSlashCommand) onSlashCommand(model.id); }
          }));
        }
      });
      // await in case addFeature returns a promise (some implementations do async init)
      try {
        await Promise.resolve(_addFeatureResult);
      } catch (e) {
        console.warn('[initMilkdown] addFeature promise rejected', e);
      }
      console.log('[initMilkdown] BlockEdit feature added');
      // Non-destructive smoke-test: insert a '/' then remove it to trigger the slash provider
      // This helps verify the menu actually shows when the feature is registered.
      try {
        crepeInput.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (!view) return;
          const pos = view.state.selection.from;
          try {
            view.dispatch(view.state.tr.insertText('/', pos));
            console.log('[initMilkdown] probe: inserted slash at', pos);
          } catch (e) {
            console.warn('[initMilkdown] probe insert failed', e);
          }
          // Remove the inserted slash shortly after to avoid mutating user content
          setTimeout(() => {
            try {
              crepeInput.editor.action((ctx2) => {
                const view2 = ctx2.get(editorViewCtx);
                if (!view2) return;
                const selFrom = view2.state.selection.from;
                // delete the single character if still present at the original position
                const delTr = view2.state.tr.delete(pos, pos + 1);
                view2.dispatch(delTr);
                console.log('[initMilkdown] probe: removed slash at', pos);
              });
            } catch (e) {
              console.warn('[initMilkdown] probe cleanup failed', e);
            }
          }, 300);
        });
      } catch (e) {
        console.warn('[initMilkdown] probe failed', e);
      }
      // Trigger a small editor action to ensure the UI acknowledges the new feature
      try {
        crepeInput.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (view && typeof view.update === 'function') try { view.update(view.state); } catch (e) {}
        });
      } catch (e) {
        // if action fails, ignore
      }
    } catch (e) {
      console.warn('Failed to load models for BlockEdit via worker:', e);
      try {
        const marker = document.getElementById('models-loaded-indicator');
        if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
      } catch (ee) {}
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
