// @ts-check

import { outputMessage } from './output-message';

export async function handlePrompt(promptMarkdown) {
  const formatted = `user typed:\n> ${promptMarkdown.replaceAll('\n', '\n> ')}`;
  outputMessage(formatted);

  await new Promise(resolve => setTimeout(resolve, 100));

  outputMessage('Processing your request...');

  await new Promise(resolve => setTimeout(resolve, 1000));
  outputMessage(`This is a simulated response to your prompt [${promptMarkdown.length}].`);
}