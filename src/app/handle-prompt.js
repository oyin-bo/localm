// @ts-check

import { outputMessage } from './output-message';
import { chatLogEditor } from './boot-app';
import { editorViewCtx, serializerCtx } from '@milkdown/core';

/**
 * @param {{
 *  promptMarkdown: string,
 *  workerConnection: ReturnType<import('./worker-connection').workerConnection>
 * }} _
 */
export async function handlePrompt({ promptMarkdown, workerConnection }) {
  // Build history from chat log editor (serialize entire document)
  let historyText = await chatLogEditor.action(async (ctx) => {
    const serializer = ctx.get(serializerCtx);
    const view = ctx.get(editorViewCtx);
    return serializer(view.state.doc);
  });

  // If the user typed a slash command like `/owner/model-name`, treat it as a direct
  // load-model request and do not treat it as a chat prompt.
  const trimmed = (promptMarkdown || '').trim();
  if (trimmed.startsWith('/') && trimmed.length > 1) {
    const modelId = trimmed.slice(1).trim();
    outputMessage(`Loading model: ${modelId}...`);
    try {
      await workerConnection.loadModel(modelId);
      outputMessage(`Model ${modelId} loaded successfully!`);
    } catch (error) {
      outputMessage(`Error loading model ${modelId}: ${error.message}`);
    }
    return;
  }

  const formatted = `**Question:**\n> ${promptMarkdown.replaceAll('\n', '\n> ')}`;
  outputMessage(formatted);

  outputMessage('Processing your request...');
  try {
    // Concatenate history and the new prompt into a single prompt string
    const combinedPrompt = promptMarkdown;
    const promptOutput = await workerConnection.runPrompt(combinedPrompt);
    outputMessage('**Reply:**\n' + promptOutput);
  } catch (error) {
    outputMessage('**Error:** ' + error.message);
  }
}