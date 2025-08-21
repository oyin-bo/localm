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
  menu.style.cssText = `
    position: absolute;
    padding: 0;
    background: white;
    border: 1px solid #e5e7eb;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    font-size: 14px;
    max-height: 256px;
    overflow-y: auto;
    min-width: 256px;
    z-index: 50;
  `;

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
    modelList.style.cssText = "margin: 0; padding: 0; list-style: none;";
    
    availableModels.forEach((model, index) => {
      const item = document.createElement('li');
      item.style.cssText = "padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f3f4f6;";
      item.dataset.modelId = model.id;
      
      // Add hover effects
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f0f9ff';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
      });
      
      // Create icon
      const icon = document.createElement('span');
      icon.textContent = model.requiresAuth ? '🔒' : '🤖';
      icon.style.fontSize = '18px';
      
      // Create text container
      const textContainer = document.createElement('div');
      textContainer.style.cssText = "flex: 1; min-width: 0;";
      
      const name = document.createElement('div');
      name.textContent = model.name;
      name.style.cssText = "font-weight: 500; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
      textContainer.appendChild(name);
      
      if (model.size) {
        const subtitle = document.createElement('div');
        subtitle.textContent = `(${model.size})`;
        subtitle.style.cssText = "font-size: 12px; color: #6b7280;";
        textContainer.appendChild(subtitle);
      }
      
      item.appendChild(icon);
      item.appendChild(textContainer);
      
      // Add auth indicator if needed
      if (model.requiresAuth) {
        const authSpan = document.createElement('span');
        authSpan.textContent = "Auth Required";
        authSpan.style.cssText = "font-size: 10px; color: #ea580c; background: #fed7aa; padding: 2px 6px; border-radius: 4px;";
        item.appendChild(authSpan);
      }
      
      // Remove bottom border from last item
      if (index === availableModels.length - 1) {
        item.style.borderBottom = 'none';
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
        },
      }),
    });
  };

  return {
    plugin: modelSlash,
    config: slashConfig
  };
}
