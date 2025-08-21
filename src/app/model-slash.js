// @ts-check

/**
 * Model Slash Plugin for Milkdown Crepe
 * 
 * This module implements a custom slash command interface for model selection
 * using Milkdown's slash plugin instead of the built-in block edit feature.
 * 
 * Features:
 * - Custom slash menu UI with model icons and metadata
 * - Support for auth-required models with visual indicators
 * - Keyboard and mouse navigation
 * - Async command execution with error handling
 * - Dynamic model list updates
 */

import { slashFactory, SlashProvider } from '@milkdown/plugin-slash';
import { editorViewCtx, prosePluginsCtx } from '@milkdown/core';

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  size?: string,
 *  requiresAuth?: boolean
 * }} ModelInfo
 */

/**
 * @typedef {{
 *  onSlashCommand?: (modelId: string) => void | boolean | Promise<void | boolean>
 * }} ModelSlashOptions
 */

// Create the slash plugin factory
export const modelSlash = slashFactory('ModelCommands');

/**
 * Creates a slash provider and DOM content for model selection
 * @param {ModelInfo[]} availableModels 
 * @param {ModelSlashOptions} options 
 * @returns {{provider: SlashProvider, commands: Array}}
 */
export function createModelSlashProvider(availableModels, options = {}) {
  const { onSlashCommand } = options;

  // Create the DOM content for the menu
  const content = document.createElement('div');
  content.className = "slash-menu";
  content.style.cssText = `
    position: absolute;
    padding: 4px 0;
    background: white;
    border: 1px solid #eee;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
    border-radius: 6px;
    font-size: 14px;
    max-height: 256px;
    overflow-y: auto;
    min-width: 256px;
    z-index: 50;
  `;

  // Create header if there are models
  if (availableModels.length > 0) {
    const header = document.createElement('div');
    header.style.cssText = "padding: 8px 12px; font-weight: 600; color: #666; border-bottom: 1px solid #eee; background: #f9f9f9; font-size: 12px;";
    header.textContent = `Models (${availableModels.length})`;
    content.appendChild(header);
  }

  // Create command list from available models
  const commands = availableModels.map(model => ({
    id: model.id,
    text: model.name,
    subtitle: model.size ? `(${model.size})` : '',
    icon: model.requiresAuth ? '🔒' : '🤖',
    model: model,
    onSelect: async (view) => {
      // Remove the slash character and any typed text
      const { dispatch, state } = view;
      const { tr, selection } = state;
      const { from } = selection;

      // Find the start of the slash command
      const textBefore = state.doc.textBetween(Math.max(0, from - 20), from);
      const slashIndex = textBefore.lastIndexOf('/');
      const deleteFrom = from - (textBefore.length - slashIndex);

      dispatch(tr.deleteRange(deleteFrom, from));
      view.focus();

      // Execute the model selection
      if (onSlashCommand) {
        try {
          await onSlashCommand(model.id);
        } catch (error) {
          console.error('Error executing slash command:', error);
        }
      }
    }
  }));

  // Create the list element
  const list = document.createElement('ul');
  list.style.cssText = "margin: 0; padding: 0; list-style: none;";

  // Add fallback message if no models
  if (commands.length === 0) {
    const noModels = document.createElement('li');
    noModels.style.cssText = "padding: 16px 12px; color: #666; text-align: center; font-style: italic;";
    noModels.textContent = "No models available";
    list.appendChild(noModels);
  } else {
    // Create menu items
    commands.forEach((command, index) => {
      const item = document.createElement('li');
      item.style.cssText = "padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f0f0f0;";
      item.dataset.modelId = command.id;

      // Create icon span
      const iconSpan = document.createElement('span');
      iconSpan.textContent = command.icon;
      iconSpan.style.fontSize = "16px";

      // Create text container
      const textContainer = document.createElement('div');
      textContainer.style.cssText = "flex: 1; min-width: 0;";

      const nameDiv = document.createElement('div');
      nameDiv.textContent = command.text;
      nameDiv.style.cssText = "font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";

      textContainer.appendChild(nameDiv);

      if (command.subtitle) {
        const subtitleDiv = document.createElement('div');
        subtitleDiv.textContent = command.subtitle;
        subtitleDiv.style.cssText = "font-size: 12px; color: #666;";
        textContainer.appendChild(subtitleDiv);
      }

      item.appendChild(iconSpan);
      item.appendChild(textContainer);

      // Add auth indicator if needed
      if (command.model.requiresAuth) {
        const authSpan = document.createElement('span');
        authSpan.textContent = "Auth Required";
        authSpan.style.cssText = "font-size: 10px; color: #d97706; background: #fef3c7; padding: 2px 6px; border-radius: 4px;";
        item.appendChild(authSpan);
      }

      // Add hover effects
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f0f9ff';
      });

      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });

      list.appendChild(item);
    });
  }

  content.appendChild(list);

  // Store current view reference for click handlers
  let currentView = null;

  // Create click handler for the menu
  content.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target) return;

    const item = target.closest('li[data-model-id]');
    if (item && item instanceof HTMLElement) {
      const modelId = item.dataset.modelId;
      const command = commands.find(c => c.id === modelId);
      if (command && command.onSelect && currentView) {
        command.onSelect(currentView);
      }
    }
  });

  // Create the slash provider
  const provider = new SlashProvider({
    content,
    shouldShow(view) {
      currentView = view; // Store current view for click handlers
      const content = provider.getContent(view);
      return content?.endsWith('/') ?? false;
    },
    offset: 8,
  });

  return { provider, commands };
}

/**
 * Adds the model slash plugin to a Crepe editor
 * @param {any} crepeEditor - The Crepe editor instance
 * @param {ModelInfo[]} availableModels 
 * @param {ModelSlashOptions} options 
 */
export async function addModelSlashToCrepe(crepeEditor, availableModels, options = {}) {
  try {
    const { provider } = createModelSlashProvider(availableModels, options);

    await crepeEditor.editor.action((ctx) => {
      // Configure slash plugin with the provider
      ctx.set(modelSlash.key, {
        view: () => ({
          update: provider.update.bind(provider),
          destroy: provider.destroy.bind(provider),
        }),
      });

      // Add the slash plugin to prose plugins
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, modelSlash]);
    });
  } catch (error) {
    console.error('Failed to add model slash plugin:', error);
    throw error;
  }
}

/**
 * Updates the available models in an existing slash plugin
 * @param {any} crepeEditor - The Crepe editor instance
 * @param {ModelInfo[]} availableModels 
 * @param {ModelSlashOptions} options 
 */
export async function updateModelSlash(crepeEditor, availableModels, options = {}) {
  try {
    const { provider } = createModelSlashProvider(availableModels, options);

    await crepeEditor.editor.action((ctx) => {
      // Update the slash plugin configuration with new provider
      ctx.set(modelSlash.key, {
        view: () => ({
          update: provider.update.bind(provider),
          destroy: provider.destroy.bind(provider),
        }),
      });
    });
  } catch (error) {
    console.error('Failed to update model slash plugin:', error);
    throw error;
  }
}
