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
        return () => commands.call(myEnterCommand.key);
      },
      priority: 100,
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