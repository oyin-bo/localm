// @ts-check

import { makeEnterPlugins } from './enter-key';
import { initHTML } from './init-html';
import { initMilkdown } from './init-milkdown';
import { outputMessage } from './output-message';
import { workerConnection } from './worker-connection';

/** @type {import('@milkdown/core').Editor} */
export var chatLogEditor;

/** @type {import('@milkdown/core').Editor} */
export var chatInputEditor;

export var worker;

export async function bootApp() {
  const { chatLog, chatInput } = initHTML();
  worker = workerConnection();
  const { chatLogEditor: chatLogEditorInstance, chatInputEditor: chatInputEditorInstance } = await initMilkdown({
    chatLog,
    chatInput,
    inputPlugins: makeEnterPlugins()
  });
  chatLogEditor = chatLogEditorInstance;
  chatInputEditor = chatInputEditorInstance;
  outputMessage('Editor loaded OK.');
}