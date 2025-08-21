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
  // Start hidden; provider may only control positioning. We'll manage visibility.
  menu.style.display = 'none';

  // Function to rebuild menu content
  function rebuildMenu() {
    menu.innerHTML = '';
    
    const availableModels = getModels();

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

  // We'll attach click handler after potential wrapping defined later

  // Track current editor view for mutation operations (removing the slash)
  let currentView = null;

  // Helper: check if cursor is directly after a solitary '/'
  function hasTriggerSlash(view) {
    if (!view) return false;
    const { state } = view;
    const { from } = state.selection;
    if (from === 0) return false;
    const $pos = state.doc.resolve(from);
    // Get char before cursor
    const prevChar = state.doc.textBetween(from - 1, from, '\n', '\n');
    if (prevChar !== '/') return false;
    // Optional: ensure it's start of line or preceded by space (avoid paths / urls)
    const beforePrev = from - 2 >= 0 ? state.doc.textBetween(from - 2, from - 1, '\n', '\n') : '';
    if (beforePrev && /[\w/]/.test(beforePrev)) return false; // part of word or // sequence
    return true;
  }

  // Helper: remove the trigger slash silently
  function removeTriggerSlash(view) {
    try {
      if (!view) return;
      const { state } = view;
      const { from } = state.selection;
      if (from === 0) return;
      const prevChar = state.doc.textBetween(from - 1, from, '\n', '\n');
      if (prevChar === '/') {
        const tr = state.tr.delete(from - 1, from);
        view.dispatch(tr);
      }
    } catch (e) {
      // ignore
    }
  }

  // Create the slash provider
  const provider = new SlashProvider({
    content: menu,
    shouldShow(view) {
      return hasTriggerSlash(view);
    },
    offset: 15,
  });

  // Hide on Escape key — attach a document listener and remove it on destroy
  function onKeyDown(e) {
    if (!e) return;
    const key = e.key || e.keyCode;
    if (key === 'Escape' || key === 'Esc' || key === 27) {
      try {
        provider.hide();
        removeTriggerSlash(currentView);
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
          currentView = view;
          // Rebuild menu content on each update to reflect current models
          rebuildMenu();
          provider.update(view, prevState);
          if (hasTriggerSlash(view)) {
            menu.style.display = '';
          } else {
            menu.style.display = 'none';
          }
        },
        destroy: () => {
          provider.destroy();
          // cleanup the document key listener
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('mousedown', onOutsideMouseDown, true);
        },
      }),
    });
  };

  // Expose a public helper so external code (onSlashCommand) can explicitly close & clean
  function finalize() {
    provider.hide();
    removeTriggerSlash(currentView);
    menu.style.display = 'none';
  }

  // Wrapped handler: no finalize here so UI hides immediately on click
  const wrapped = onSlashCommand ? async (modelId) => {
    try {
      await onSlashCommand(modelId);
    } catch (error) {
      console.error('Error executing slash command:', error);
    }
  } : null;

  // Attach click handler now
  menu.addEventListener('click', async (e) => {
    if (!e.target || !(e.target instanceof Element)) return;
    const target = e.target.closest('li[data-model-id]');
    if (!target || !(target instanceof HTMLElement)) return;
    const modelId = target.dataset.modelId;
    if (!modelId) return;
    // Hide immediately
    finalize();
    if (wrapped) await wrapped(modelId);
  });

  // Outside click handler to dismiss menu
  function onOutsideMouseDown(e) {
    if (menu.style.display === 'none') return;
    if (e.target instanceof Node && !menu.contains(e.target)) {
      finalize();
    }
  }
  document.addEventListener('mousedown', onOutsideMouseDown, true);

  return {
    plugin: modelSlash,
    config: slashConfig
  };
}
