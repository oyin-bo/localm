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

  const formatted = `**Question:**\n> ${promptMarkdown.replaceAll('\n', '\n> ')}`;
  outputMessage(formatted);

  outputMessage('Processing your request...');
  try {
  // Concatenate history and the new prompt into a single prompt string
    const combinedPrompt = promptMarkdown;
      // historyText ? (historyText + '\n\n' + promptMarkdown) :
      //   promptMarkdown;
  const promptOutput = await workerConnection.runPrompt(combinedPrompt);
    outputMessage('**Reply:**\n' + promptOutput);
  } catch (error) {
    outputMessage('**Error:** ' + error.message);
  }
}