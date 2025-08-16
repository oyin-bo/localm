// @ts-check

import { editorViewCtx, parserCtx, serializerCtx, commandsCtx } from '@milkdown/core';
import { $command, $useKeymap } from '@milkdown/utils';
import { outputMessage } from './output-message';

export function makeEnterPlugins() {
  // Create a command that sends the current input content to the chat log
  const myEnterCommand = $command('MyEnterCommand', (ctx) => {
    return () => (state, dispatch) => {
      const view = ctx.get(editorViewCtx);
      const toMarkdown = ctx.get(serializerCtx);
      const fromMarkdown = ctx.get(parserCtx);
      const markdown = (toMarkdown(view.state.doc) || '').trim();
      if (markdown) {
        const formatted = `user typed:\n> ${markdown.replaceAll('\n', '\n> ')}`;
        outputMessage(formatted);
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

  return [myEnterCommand, myEnterKeymap];
}