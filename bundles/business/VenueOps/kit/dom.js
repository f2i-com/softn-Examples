// kit/dom.js: safe HTML templates, a small DOM morph, and delegated events.
//
// The pattern every app here uses:
//   const view = (state) => html`<ul>${state.items.map((i) => html`<li data-key="${i.id}">${i.title}</li>`)}</ul>`;
//   render(root, view(state));          // changes only what differs: focus, scroll and typing survive
//   on(root, 'click', '[data-action]', (event, el) => actions[el.dataset.action]?.(el, event));
//
// `html` escapes every value it is given, so text from people or the server can never become markup.
// Only a value that is itself an `html` result, or wrapped in `raw()`, is inserted as markup.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe to place in markup or in a quoted attribute. */
export function esc(value) {
  // The quote characters are written as escapes: SoftN's module scanner misreads a quote inside a regex literal.
  // The quotes are written as \x22 and \x27: SoftN's module scanner misreads a quote inside a regex literal.
  return String(value ?? '').replace(/[&<>\x22\x27]/g, (c) => ESCAPES[c]);
}

/** Markup that `html` inserts as it is. */
export class SafeHtml {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

/** Mark a string you built yourself (an SVG icon, say) as markup. Never pass a person's text. */
export const raw = (text) => new SafeHtml(String(text ?? ''));

function part(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(part).join('');
  return esc(value);
}

/** Tagged template: html`<p>${text}</p>`. Values are escaped; arrays are joined; null/false render nothing. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Class names from strings and { name: condition } maps: cls('btn', { 'is-on': on }). */
export function cls(...names) {
  const out = [];
  for (const name of names) {
    if (!name) continue;
    if (typeof name === 'string') out.push(name);
    else for (const [key, on] of Object.entries(name)) if (on) out.push(key);
  }
  return out.join(' ');
}

/** Attributes from a map, for spreading into a tag: html`<input ${attrs({ disabled: busy, value })}>`. */
export function attrs(map) {
  let out = '';
  for (const [name, value] of Object.entries(map)) {
    if (value === null || value === undefined || value === false) continue;
    out += value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
  }
  return raw(out);
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

// ---- morph ---------------------------------------------------------------------------------

const keyOf = (node) => (node.nodeType === 1 ? node.getAttribute('data-key') || node.getAttribute('id') : null);

function syncAttributes(old, next) {
  const names = next.getAttributeNames();
  for (const name of names) {
    const value = next.getAttribute(name);
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  }
  for (const name of old.getAttributeNames()) {
    if (!next.hasAttribute(name)) old.removeAttribute(name);
  }
}

// What a person typed or ticked lives in properties, not attributes: bring those across too,
// but only for fields the view actually controls (it rendered value= / checked / selected).
function syncField(old, next) {
  const tag = old.tagName;
  if (tag === 'INPUT') {
    const type = (next.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      const checked = next.hasAttribute('checked');
      if (old.checked !== checked) old.checked = checked;
    } else if (type !== 'file' && next.hasAttribute('value')) {
      const value = next.getAttribute('value');
      if (old.value !== value) old.value = value;
    }
  } else if (tag === 'TEXTAREA') {
    if (next.hasAttribute('data-controlled')) {
      const value = next.textContent;
      if (old.value !== value) old.value = value;
    }
  } else if (tag === 'OPTION') {
    const selected = next.hasAttribute('selected');
    if (old.selected !== selected) old.selected = selected;
  }
}

function morphNode(old, next) {
  if (old.nodeType !== 1) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return;
  }
  // data-keep: a node the app manages by hand (a canvas, a map, a playing video). Left alone.
  if (old.hasAttribute('data-keep') && next.hasAttribute('data-keep')) return;
  syncAttributes(old, next);
  if (old.tagName === 'TEXTAREA') { syncField(old, next); return; }
  morphChildren(old, next);
  syncField(old, next);
}

const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

function morphChildren(parent, next) {
  const keyed = new Map();
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    const key = keyOf(node);
    if (key) keyed.set(key, node);
  }
  let cursor = parent.firstChild;
  for (const incoming of Array.from(next.childNodes)) {
    const key = keyOf(incoming);
    let match = null;
    if (key) {
      const found = keyed.get(key);
      if (found && sameKind(found, incoming)) { match = found; keyed.delete(key); }
    } else if (cursor && !keyOf(cursor) && sameKind(cursor, incoming)) {
      match = cursor;
    }
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(match, cursor);
      morphNode(match, incoming);
    } else {
      parent.insertBefore(incoming, cursor);
    }
  }
  while (cursor) {
    const gone = cursor;
    cursor = cursor.nextSibling;
    parent.removeChild(gone);
  }
}

/**
 * Make `target`'s content match `content` (an `html` result or a string of markup), changing only
 * what differs. Give list items `data-key` (or an id) so they are moved, not rebuilt.
 */
export function render(target, content) {
  const template = document.createElement('template');
  template.innerHTML = String(content ?? '');
  morphChildren(target, template.content);
}

// ---- events --------------------------------------------------------------------------------

/**
 * Delegated listener: on(root, 'click', '[data-action]', (event, el) => …).
 * `el` is the closest element matching `selector` at or above the event's target, inside `root`.
 * Returns a function that removes the listener.
 */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const start = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    if (!start || !start.closest) return;
    const el = start.closest(selector);
    if (el && (el === root || root.contains(el))) handler(event, el);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/** Run `fn` at most once per `ms`, after the calls stop. */
export function debounce(fn, ms = 250) {
  let timer = 0;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** A form's fields as a plain object (checkboxes as booleans, repeated names as arrays). */
export function readForm(form) {
  const out = {};
  for (const field of qsa('input, select, textarea', form)) {
    const name = field.getAttribute('name');
    if (!name || field.disabled) continue;
    const type = (field.getAttribute('type') || '').toLowerCase();
    if (type === 'file' || type === 'submit' || type === 'button') continue;
    if (type === 'radio') { if (field.checked) out[name] = field.value; else if (!(name in out)) out[name] = ''; continue; }
    const value = type === 'checkbox' ? (field.hasAttribute('value') ? (field.checked ? field.value : null) : field.checked) : field.value;
    if (type === 'checkbox' && field.hasAttribute('value')) {
      if (!Array.isArray(out[name])) out[name] = [];
      if (value !== null) out[name].push(value);
    } else out[name] = value;
  }
  return out;
}
