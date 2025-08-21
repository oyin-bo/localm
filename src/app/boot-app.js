// @ts-check

import { makeEnterPlugins, setupCrepeEnterKey } from './enter-key';
import { initHTML } from './init-html';
import { initMilkdown } from './init-milkdown';
import { outputMessage, flushBufferedOutputs } from './output-message';
import { workerConnection } from './worker-connection';

import { name, description, version } from '../../package.json';

/** @type {import('@milkdown/core').Editor} */
export var chatLogEditor;

/** @type {import('@milkdown/core').Editor} */
export var chatInputEditor;

export var worker;

export async function bootApp() {
  const { chatLog, chatInput } = initHTML();
  worker = workerConnection();
  worker.loaded.then(async ({ env }) => {
    document.title = name + ' v' + version + ' t/' + env.version;
    outputMessage(
      'transformers.js\n\n```JSON\n' + JSON.stringify(env, null, 2) + '\n```');
    const models = await worker.listModels();
    //outputMessage('Available models: ' + models.join(', '));
  });

  const {
    chatLogEditor: chatLogEditorInstance,
    chatInputEditor: chatInputEditorInstance,
    crepeInput
  } = await initMilkdown({
    worker,
    chatLog,
    chatInput,
    inputPlugins: makeEnterPlugins({ workerConnection: worker }),
    onSlashCommand: async (modelId) => {
      try {
        outputMessage(`Loading model: ${modelId}...`);
        await worker.loadModel(modelId);
        outputMessage(`Model ${modelId} loaded successfully!`);
      } catch (error) {
        outputMessage(`Error loading model ${modelId}: ${error.message}`);
      }
    }
  });

  chatLogEditor = chatLogEditorInstance;
  chatInputEditor = chatInputEditorInstance;

  // Flush any outputs that were buffered before the editor was ready
  flushBufferedOutputs();

  // Setup Enter key handling for the Crepe input editor
  setupCrepeEnterKey(crepeInput, worker);
  document.title = name + ' v' + version;
  outputMessage(description + ' v' + version + ' loaded OK.');
}