// @ts-check

/**
 * Model Slash Plugin for Milkdown Crepe
 * 
 * This module implements a custom slash command interface for model selection
 * using Milkdown's slash plugin following the proper factory pattern.
 * 
 * Features:
 * - Custom slash menu UI with model icons and metadata
 * - Support for auth-required models with visual indicators
 * - Dynamic model list updates via getter function
 * - Async command execution with error handling
 */

import { slashFactory, SlashProvider } from '@milkdown/plugin-slash';

import './model-slash.css';

/**
 * @typedef {{
 *  id: string,
 *  name: string,
 *  size?: string,
 *  requiresAuth?: boolean
 * }} ModelInfo
 */

// Create the slash plugin factory
export const modelSlash = slashFactory('ModelCommands');

/**
 * Creates and configures the model slash plugin
 * @param {{
 *  getModels: () => ModelInfo[],
 *  onSlashCommand?: (modelId: string) => void | boolean | Promise<void | boolean>
 * }} options
 */
export function createModelSlashPlugin({ getModels, onSlashCommand }) {
  // Create the menu DOM element
  const menu = document.createElement('div');
  menu.className = "slash-menu";

  // Function to rebuild menu content
  function rebuildMenu() {
    menu.innerHTML = '';
    
    const availableModels = getModels();
    
    // Create header if there are models
    if (availableModels.length > 0) {
      const header = document.createElement('div');
      header.className = "px-3 py-2 text-sm font-semibold text-gray-600 border-b bg-gray-50";
      header.textContent = `Models (${availableModels.length})`;
      menu.appendChild(header);
    }

    if (availableModels.length === 0) {
      const noModels = document.createElement('div');
      noModels.className = "px-3 py-4 text-sm text-gray-500 text-center";
      noModels.textContent = "No models available";
      menu.appendChild(noModels);
      return;
    }

    // Create model list
    const modelList = document.createElement('ul');
    modelList.className = 'model-list';

    availableModels.forEach((model, index) => {
      const item = document.createElement('li');
      item.className = 'model-entry';
      item.dataset.modelId = model.id;

      // Create icon
      const icon = document.createElement('span');
      icon.className = 'model-icon';
      icon.textContent = model.requiresAuth ? '🔒' : '🤖';
      
      // Create text container
      const textContainer = document.createElement('div');
      textContainer.className = 'model-text-container';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = model.name;
      textContainer.appendChild(name);
      
      if (model.size) {
        const subtitle = document.createElement('div');
        subtitle.className = 'size';
        subtitle.textContent = `(${model.size})`;
        textContainer.appendChild(subtitle);
      }
      
      item.appendChild(icon);
      item.appendChild(textContainer);
      
      // Add auth indicator if needed
      if (model.requiresAuth) {
        const authSpan = document.createElement('span');
        authSpan.className = 'auth';
        authSpan.textContent = "Auth Required";
        item.appendChild(authSpan);
      }

      modelList.appendChild(item);
    });
    
    menu.appendChild(modelList);
  }

  // Handle menu clicks
  menu.addEventListener('click', async (e) => {
    if (!e.target || !(e.target instanceof Element)) return;
    const target = e.target.closest('li[data-model-id]');
    if (!target || !(target instanceof HTMLElement)) return;
    
    const modelId = target.dataset.modelId;
    if (modelId && onSlashCommand) {
      // Hide the menu first
      provider.hide();
      
      try {
        await onSlashCommand(modelId);
      } catch (error) {
        console.error('Error executing slash command:', error);
      }
    }
  });

  // Create the slash provider
  const provider = new SlashProvider({
    content: menu,
    // Show the menu when the last character before caret is '/'
    shouldShow(view) {
      return provider.getContent(view)?.endsWith('/') ?? false;
    },
    offset: 8,
  });

  // Hide on Escape key — attach a document listener and remove it on destroy
  function onKeyDown(e) {
    if (!e) return;
    const key = e.key || e.keyCode;
    if (key === 'Escape' || key === 'Esc' || key === 27) {
      try {
        provider.hide();
      } catch (err) {
        // ignore
      }
    }
  }

  document.addEventListener('keydown', onKeyDown);

  // Configuration function for the slash plugin
  const slashConfig = (ctx) => {
    ctx.set(modelSlash.key, {
      view: () => ({
        update: (view, prevState) => {
          // Rebuild menu content on each update to reflect current models
          rebuildMenu();
          provider.update(view, prevState);
        },
        destroy: () => {
          provider.destroy();
          // cleanup the document key listener
          document.removeEventListener('keydown', onKeyDown);
        },
      }),
    });
  };

  return {
    plugin: modelSlash,
    config: slashConfig
  };
}
