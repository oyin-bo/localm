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
import { slashFactory } from "@milkdown/plugin-slash";
import { fetchBrowserModels } from './model-list.js';

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

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

  // Fetch available models for slash menu
  console.log('Starting to fetch browser models...');
  const availableModels = await fetchBrowserModels();
  console.log(`Loaded ${availableModels.length} models for slash menu`);
  console.log('Available models:', availableModels);

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
      [Crepe.Feature.BlockEdit]: true, // Enable slash menu
      [Crepe.Feature.Placeholder]: true,
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.CodeMirror]: true,
      // Disable features not needed for chat input
      [Crepe.Feature.ImageBlock]: true,
      [Crepe.Feature.Table]: true,
      [Crepe.Feature.Latex]: true,
      [Crepe.Feature.Toolbar]: true,
      [Crepe.Feature.LinkTooltip]: true
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: 'Start typing...',
        mode: 'block'
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: 'Text',
          text: null, // Hide /text option
          h1: { label: 'Heading', icon: '#' },
          h2: null, h3: null, h4: null, h5: null, h6: null, // Hide other headings
          quote: { label: 'Quote', icon: '>' },
          divider: null
        },
        listGroup: {
          label: 'Lists',
          bulletList: { label: 'List', icon: '•' },
          orderedList: { label: 'Numbered', icon: '1.' },
          taskList: null
        },
        advancedGroup: {
          label: 'Advanced',
          codeBlock: { label: 'Code', icon: '`' },
          image: null,
          table: null,
          math: null,
          // Add model commands to advanced group
          ...Object.fromEntries(
            availableModels.map(model => [
              model.slashCommand, 
              {
                label: `${model.name} (${model.size})`,
                icon: '🤖',
                command: () => {
                  if (onSlashCommand) {
                    onSlashCommand(model.id);
                  }
                }
              }
            ])
          )
        }
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
