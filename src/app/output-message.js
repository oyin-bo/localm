// @ts-check

import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, parserCtx, rootCtx, serializerCtx } from '@milkdown/core';

import { chatLogEditor } from './boot-app';

export function outputMessage(msg) {
  if (!chatLogEditor) {
    const elem = document.createElement('pre');
    elem.textContent = msg;
    elem.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(elem);
    return;
  }

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
