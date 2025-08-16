// @ts-check

export function cleanBody() {
  for (const elem of [...document.body.childNodes]) {
    if ((/** @type {HTMLElement} */ (elem).tagName || '').toLowerCase() === 'script') continue;
    elem.remove();
  }
}
