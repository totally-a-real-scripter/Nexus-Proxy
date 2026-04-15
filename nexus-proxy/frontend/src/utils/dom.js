/** Minimal DOM helpers — keeps components clean */

export const $  = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
export const on = (el, event, fn) => el?.addEventListener(event, fn);
export const off = (el, event, fn) => el?.removeEventListener(event, fn);

export function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (typeof child === "string") el.appendChild(document.createTextNode(child));
    else if (child instanceof Node) el.appendChild(child);
  }
  return el;
}
