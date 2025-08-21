// @ts-check

import {
  commandsCtx,
  editorViewCtx,
  parserCtx,
  serializerCtx
} from '@milkdown/core';
import { $command, $useKeymap } from '@milkdown/utils';

import { handlePrompt } from './handle-prompt';

export function makeEnterPlugins({ workerConnection }) {
  // Create a command that sends the current input content to the chat log
  const myEnterCommand = $command('MyEnterCommand', (ctx) => {
    return () => (state, dispatch) => {
      const view = ctx.get(editorViewCtx);
      const toMarkdown = ctx.get(serializerCtx);
      const fromMarkdown = ctx.get(parserCtx);
      const markdown = (toMarkdown(view.state.doc) || '').trim();

      if (markdown) {
        handlePrompt({ promptMarkdown: markdown, workerConnection });
      }

      // Clear input
      const emptyDoc = fromMarkdown('');
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, emptyDoc.content);
      view.dispatch(tr);
      return true;
    };
  });

  const myEnterKeymap = $useKeymap('MyEnterKeymap', {
    MyEnter: {
      shortcuts: 'Enter',
      command: (ctx) => {
        const commands = ctx.get(commandsCtx);
        return () => {
          // Check if slash menu is open first
          const slashMenu = document.querySelector('.milkdown-slash-menu[data-show="true"]');
          if (slashMenu) {
            // Let the slash menu handle Enter
            return false;
          }
          return commands.call(myEnterCommand.key);
        };
      },
      priority: 50, // Lower priority so slash menu can intercept first
    },
  });

  return [
    myEnterCommand,
    myEnterKeymap
  ];
}

/**
 * Setup Enter key handling for Crepe editor
 * @param {import('@milkdown/crepe').Crepe} crepeInput 
 * @param {ReturnType<import('./worker-connection').workerConnection>} workerConnection 
 */
export function setupCrepeEnterKey(crepeInput, workerConnection) {
  // Add Enter key handling through Crepe's underlying editor
  crepeInput.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view.dom) {
      view.dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
          // Check if slash menu is open - if so, let it handle Enter
          const slashMenu = document.querySelector('.milkdown-slash-menu[data-show="true"]');
          if (slashMenu) {
            return false; // Don't prevent default, let slash menu handle it
          }
          
          e.preventDefault();
          
          // Get markdown using the underlying editor's serializer
          const toMarkdown = ctx.get(serializerCtx);
          const markdown = toMarkdown(view.state.doc).trim();
          
          if (markdown) {
            handlePrompt({ promptMarkdown: markdown, workerConnection });
            // Clear the input
            const fromMarkdown = ctx.get(parserCtx);
            const emptyDoc = fromMarkdown('');
            const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, emptyDoc.content);
            view.dispatch(tr);
          }
          
          return true;
        }
        return false;
      });
    }
  });
}