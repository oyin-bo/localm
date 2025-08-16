// @ts-check

import { initHTML } from './init-html';
import { initMilkdown } from './init-milkdown';
import { outputMessage } from './output-message';

/** @type {import('@milkdown/core').Editor | undefined} */
export var chatLogEditor;

/** @type {import('@milkdown/core').Editor | undefined} */
export var chatInputEditor;

export async function bootApp() {
  const { chatLog, chatInput } = initHTML();
  const { chatLogEditor: chatLogEditorInstance, chatInputEditor: chatInputEditorInstance } = await initMilkdown({ chatLog, chatInput });
  chatLogEditor = chatLogEditorInstance;
  chatInputEditor = chatInputEditorInstance;

  outputMessage('Editor loaded OK.');

}