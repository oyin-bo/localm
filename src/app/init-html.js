// @ts-check

import './app.css';

import { cleanBody } from './clean-body';

export function initHTML() {
  const ui = document.createElement('div');
  ui.innerHTML = `
<div class=chat-log>Loading...</div>
<div class=chat-input>[Input]</div>
`;

  if (!document.body) {
    document.documentElement.appendChild(document.createElement('body'));
  } else {
    cleanBody();
  }

  for (const elem of [...ui.children]) {
    document.body.appendChild(elem);
  }

  const chatLog = /** @type {HTMLElement|null} */ (document.querySelector('.chat-log'));
  const chatInput = /** @type {HTMLElement|null} */ (document.querySelector('.chat-input'));

  return { chatLog, chatInput };
}
