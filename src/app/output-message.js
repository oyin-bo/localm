// @ts-check

import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/core';

import { chatLogEditor } from './boot-app';

// Buffer early outputs when the chat log editor is not yet initialized
const earlyOutputs = [];
const earlyElements = [];

export function outputMessage(msg) {
  if (!chatLogEditor) {
    // Store message for later flushing
    earlyOutputs.push(msg);
    // Also create a temporary visible element so user sees progress
    const elem = document.createElement('pre');
    elem.textContent = msg;
    elem.style.whiteSpace = 'pre-wrap';
    elem.dataset.earlyOutput = '1';
    // Prefer appending into .chat-log container if present
    const container = document.querySelector('.chat-log') || document.body;
    container.appendChild(elem);
    earlyElements.push(elem);
    return;
  }

  // If there are buffered early outputs, flush them first
  if (earlyOutputs.length > 0) {
    flushBufferedOutputs();
  }

  // Insert the new message into the Milkdown editor
  chatLogEditor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const serializer = ctx.get(serializerCtx);
    const state = view.state;
    // Get current markdown, append new message, and parse
    const currentMarkdown = serializer(state.doc);
    const newMarkdown = currentMarkdown ? (currentMarkdown + '\n' + msg) : msg;
    const doc = parser(newMarkdown);
    // Use replaceWith and doc.content to avoid TransformError
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    view.dispatch(tr);
  });
  // Scroll chat log to bottom (smooth if possible)
  const chatLogElem = document.querySelector('.chat-log .milkdown .ProseMirror');
  if (chatLogElem) {
    if (typeof chatLogElem.scrollTo === 'function') {
      chatLogElem.scrollTo({ top: chatLogElem.scrollHeight, behavior: 'smooth' });
    } else {
      chatLogElem.scrollTop = chatLogElem.scrollHeight;
    }
  }
}

/**
 * Move any early buffered outputs into the initialized chat log editor and remove temporary DOM nodes
 */
export function flushBufferedOutputs() {
  if (!chatLogEditor) return;
  if (earlyOutputs.length === 0) return;

  // Combine buffered messages into one block separated by newlines
  const combined = earlyOutputs.join('\n');

  chatLogEditor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const serializer = ctx.get(serializerCtx);
    const state = view.state;

    const currentMarkdown = serializer(state.doc);
    const newMarkdown = currentMarkdown ? (currentMarkdown + '\n' + combined) : combined;
    const doc = parser(newMarkdown);
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    view.dispatch(tr);
  });

  // Remove temporary DOM elements that showed early outputs
  for (const el of earlyElements) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  earlyElements.length = 0;
  earlyOutputs.length = 0;

  // Scroll chat log to bottom after flushing
  const chatLogElem = document.querySelector('.chat-log .milkdown .ProseMirror');
  if (chatLogElem) {
    if (typeof chatLogElem.scrollTo === 'function') {
      chatLogElem.scrollTo({ top: chatLogElem.scrollHeight, behavior: 'smooth' });
    } else {
      chatLogElem.scrollTop = chatLogElem.scrollHeight;
    }
  }
}
