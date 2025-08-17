// @ts-check

import { outputMessage } from './output-message';

/**
 * @param {{
 *  promptMarkdown: string,
 *  workerConnection: ReturnType<import('./worker-connection').workerConnection>
 * }} _
 */
export async function handlePrompt({ promptMarkdown, workerConnection }) {
  const formatted = `**Question:**\n> ${promptMarkdown.replaceAll('\n', '\n> ')}`;
  outputMessage(formatted);

  outputMessage('Processing your request...');
  try {
    const promptOutput = await workerConnection.runPrompt(promptMarkdown);
    outputMessage('**Reply:**\n' + promptOutput);
  } catch (error) {
    outputMessage('**Error:** ' + error.message);
  }
}