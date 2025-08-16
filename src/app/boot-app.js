// @ts-check

import { editorViewCtx, parserCtx, serializerCtx, commandsCtx } from '@milkdown/core';
import { $command, $useKeymap } from '@milkdown/utils';
import { initHTML } from './init-html';
import { initMilkdown } from './init-milkdown';
import { outputMessage } from './output-message';
import { makeEnterPlugins } from './enter-key';

/** @type {import('@milkdown/core').Editor} */
export var chatLogEditor;

/** @type {import('@milkdown/core').Editor} */
export var chatInputEditor;



export async function bootApp() {
  const { chatLog, chatInput } = initHTML();
  const { chatLogEditor: chatLogEditorInstance, chatInputEditor: chatInputEditorInstance } = await initMilkdown({
    chatLog,
    chatInput,
    inputPlugins: makeEnterPlugins()
  });
  chatLogEditor = chatLogEditorInstance;
  chatInputEditor = chatInputEditorInstance;
  outputMessage('Editor loaded OK.');
}