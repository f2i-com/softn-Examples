// kit/ui.js: toasts, dialogs, confirmations, copying, saving a file and picking one.
// Everything here is drawn by the app itself (the sandbox has no alert/confirm worth using).
// The look comes from kit/base.css and the app's own tokens.
import { html, raw, cls, render, on, readForm, qs } from './dom.js';
import { icon } from './icons.js';
import { ApiError, onBusy } from './api.js';

// ---- toasts ----------------------------------------------------------------------------------

let toastLayer = null;

/** A short message at the edge of the screen. Returns a function that removes it. */
export function toast(message, { kind = 'info', duration = 4200, action = null } = {}) {
  if (!toastLayer) {
    toastLayer = document.createElement('div');
    toastLayer.className = 'k-toasts';
    toastLayer.setAttribute('role', 'status');
    toastLayer.setAttribute('aria-live', 'polite');
    document.body.append(toastLayer);
  }
  const el = document.createElement('div');
  el.className = `k-toast k-toast--${kind}`;
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'k-toast__action';
    button.textContent = action.label;
    button.addEventListener('click', () => { close(); action.run(); });
    el.append(button);
  }
  toastLayer.append(el);
  // Three at most: an older message makes way for a newer one.
  while (toastLayer.children.length > 3) toastLayer.firstElementChild.remove();
  timer = setTimeout(close, duration);
  return close;
}
toast.success = (message, options) => toast(message, { ...options, kind: 'success' });
toast.error = (message, options) => toast(message, { duration: 6500, ...options, kind: 'error' });

/** Say what went wrong, for any thrown thing: the backend's own words when it gave some. */
export function toastError(error, fallback = 'Something went wrong. Try again.') {
  toast.error(error instanceof ApiError ? error.message : fallback);
}

// ---- dialogs ---------------------------------------------------------------------------------
//
// The sandbox's <dialog>.showModal() is not modal (no top layer and no backdrop: it is drawn where
// it stands in the page), so a dialog here is the kit's own overlay: a fixed layer over the app,
// the rest of the page made inert while it is open, Escape or a press outside to dismiss, and
// focus returned to where it was.

const openOverlays = [];
let dialogCount = 0;

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !openOverlays.length) return;
  const top = openOverlays[openOverlays.length - 1];
  if (top.dismissable) top.close(undefined);
});

/**
 * A modal dialog (a sheet from the bottom on a phone). Resolves when it closes, with the value of
 * the action chosen, or undefined when it was dismissed.
 *
 *   body:    an `html` result, a string of markup, or a DOM node
 *   actions: [{ label, value, kind: 'primary' | 'danger' | 'ghost', run }]
 *            run({ dialog, body, close }) may be async; returning false (or throwing) keeps the
 *            dialog open, anything else closes it with that value (or the action's `value`).
 *   onOpen:  ({ dialog, body, close }) => void, to wire the body's own controls
 *   size:    'sm' | 'md' | 'lg' | 'full'
 */
export function openDialog({ title = '', body = '', actions = [], size = 'md', dismissable = true, className = '', onOpen = null } = {}) {
  return new Promise((resolve) => {
    const titleId = `k-dialog-title-${++dialogCount}`;
    const overlay = document.createElement('div');
    overlay.className = 'k-overlay';
    overlay.innerHTML = String(html`
      <div class="${cls('k-dialog', `k-dialog--${size}`, className)}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <header class="k-dialog__head">
          <h2 class="k-dialog__title" id="${titleId}">${title}</h2>
          ${dismissable ? html`<button type="button" class="k-icon-btn" data-dialog-close aria-label="Close">${icon('x')}</button>` : ''}
        </header>
        <div class="k-dialog__body"></div>
        ${actions.length ? html`<footer class="k-dialog__foot">${actions.map((action, index) => html`
          <button type="button" class="${cls('k-btn', action.kind ? `k-btn--${action.kind}` : '')}" data-dialog-action="${index}">${action.label}</button>`)}</footer>` : ''}
      </div>`);
    const dialog = qs('.k-dialog', overlay);
    const bodyEl = qs('.k-dialog__body', overlay);
    if (body && body.nodeType) bodyEl.append(body); else bodyEl.innerHTML = String(body ?? '');

    const cameFrom = document.activeElement;
    document.documentElement.classList.remove('tk-nav-open');
    // Everything else on the page stops taking clicks, keys and focus while this is open.
    const stilled = Array.from(document.body.children).filter((el) => !el.hasAttribute('inert') && !el.classList.contains('k-toasts') && !el.classList.contains('k-busy'));
    for (const el of stilled) el.setAttribute('inert', '');

    let done = false;
    const entry = { dismissable, close: null };
    const close = (value) => {
      if (done) return;
      done = true;
      const at = openOverlays.indexOf(entry);
      if (at >= 0) openOverlays.splice(at, 1);
      for (const el of stilled) el.removeAttribute('inert');
      overlay.remove();
      if (cameFrom && cameFrom.focus && document.body.contains(cameFrom)) cameFrom.focus();
      resolve(value);
    };
    entry.close = close;
    const context = { dialog, body: bodyEl, close };

    // A press that begins and ends on the dimmed area dismisses; one that began inside (a text
    // selection dragged out) does not.
    let pressedOutside = false;
    overlay.addEventListener('pointerdown', (event) => { pressedOutside = event.target === overlay; });
    overlay.addEventListener('click', (event) => { if (dismissable && pressedOutside && event.target === overlay) close(undefined); });
    on(overlay, 'click', '[data-dialog-close]', () => close(undefined));
    on(overlay, 'click', '[data-dialog-action]', async (event, button) => {
      const action = actions[Number(button.getAttribute('data-dialog-action'))];
      if (!action || button.disabled) return;
      if (!action.run) { close(action.value); return; }
      button.disabled = true;
      button.classList.add('is-busy');
      try {
        const result = await action.run(context);
        if (result === false) return;
        close(result === undefined ? action.value : result);
      } catch (error) {
        showFormError(bodyEl, error);
      } finally {
        button.disabled = false;
        button.classList.remove('is-busy');
      }
    });

    document.body.append(overlay);
    openOverlays.push(entry);
    dialog.focus();
    if (onOpen) onOpen(context);
  });
}

function showFormError(scope, error) {
  let box = qs('.k-form-error', scope);
  if (!box) {
    box = document.createElement('p');
    box.className = 'k-form-error';
    box.setAttribute('role', 'alert');
    scope.append(box);
  }
  box.textContent = error instanceof ApiError ? error.message : (error && error.userMessage) || 'Something went wrong. Try again.';
  box.hidden = false;
}

/** Ask yes or no. Resolves true only when the person confirms. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return openDialog({
    title,
    size: 'sm',
    body: html`<p class="k-dialog__text">${message}</p>`,
    actions: [
      { label: cancelLabel, value: false, kind: 'ghost' },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  }).then((value) => value === true);
}

/**
 * A dialog holding a form. `fields` is the form's markup (an `html` result: labelled inputs with
 * name attributes). onSubmit(values, form) may be async: what it returns closes the dialog with
 * that value; throwing keeps it open and shows the error (an ApiError's message, or error.userMessage).
 * Resolves undefined when dismissed.
 */
export function formDialog({ title, fields, submitLabel = 'Save', cancelLabel = 'Cancel', size = 'md', danger = false, onSubmit, onOpen = null }) {
  return openDialog({
    title,
    size,
    body: html`<form class="k-form" novalidate>${fields}<p class="k-form-error" role="alert" hidden></p>
      <div class="k-form__actions">
        <button type="button" class="k-btn k-btn--ghost" data-dialog-close>${cancelLabel}</button>
        <button type="submit" class="${cls('k-btn', danger ? 'k-btn--danger' : 'k-btn--primary')}">${submitLabel}</button>
      </div></form>`,
    onOpen: (context) => {
      const form = qs('form', context.body);
      const submit = qs('button[type="submit"]', form);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        submit.disabled = true;
        submit.classList.add('is-busy');
        qs('.k-form-error', form).hidden = true;
        try {
          const result = await onSubmit(readForm(form), form);
          if (result !== false) context.close(result === undefined ? true : result);
        } catch (error) {
          showFormError(form, error);
        } finally {
          submit.disabled = false;
          submit.classList.remove('is-busy');
        }
      });
      const first = qs('input:not([type="hidden"]), textarea, select', form);
      if (first) first.focus();
      if (onOpen) onOpen({ ...context, form });
    },
  });
}

/** An error whose message is meant for the person: throw it from onSubmit to show it in the form. */
export function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

// ---- copying and saving ----------------------------------------------------------------------

/**
 * Copy text. The sandbox usually has no clipboard, so when the copy is refused the text is shown
 * selected in a dialog for the person to copy themselves.
 */
export async function copyText(text, { title = 'Copy this', done = 'Copied' } = {}) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    await openDialog({
      title,
      size: 'md',
      body: html`<p class="k-dialog__text">Select the text and copy it (Ctrl or ⌘ + C, or press and hold on a phone).</p>
        <textarea class="k-input k-copybox" readonly rows="6">${text}</textarea>`,
      actions: [{ label: 'Done', value: true, kind: 'primary' }],
      onOpen: ({ body }) => { const box = qs('textarea', body); box.focus(); if (box.select) box.select(); },
    });
    return false;
  }
}

/**
 * Offer a file to save (text, or bytes as a Uint8Array). Call it straight from a click. FormLogic
 * shows a "Save" bar when the app's owner allows "Files on this device"; where files are off
 * nothing is saved, so pair a download with a copy or on-screen alternative when it matters.
 */
export function saveFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('download', name);
  link.href = address;
  link.hidden = true;
  // On the page while it is clicked: the sandbox only offers a file from a link it can see there.
  document.body.append(link);
  link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(address); }, 60000);
}

/** Markup for a button that opens the device's file picker: html`${fileButton({ label: 'Add photo', accept: 'image/*', name: 'photo' })}`. */
export function fileButton({ label, accept = '', name = 'file', className = 'k-btn', iconName = '', multiple = false }) {
  return html`<label class="${className} k-file">${iconName ? icon(iconName) : ''}<span>${label}</span>
    <input type="file" class="k-file__input" data-file="${name}" ${accept ? raw(`accept="${accept}"`) : ''} ${multiple ? raw('multiple') : ''}></label>`;
}

export const FILE_LIMIT_BYTES = 1500000;
const FILE_REFUSED = 'That file could not be read here. Files up to 1.5 MB work; if smaller ones fail too, the app\'s owner needs to allow "Files on this device" in FormLogic.';

/**
 * Read the file a person picked in an <input type="file"> (from its change event) as a data URL.
 * Resolves { name, type, size, dataUrl }. Rejects with a userError when the sandbox handed no file
 * over (files are off for this app, or the file is larger than 1.5 MB).
 */
export function readPickedFile(input) {
  return new Promise((resolve, reject) => {
    const file = input.files && input.files[0];
    if (!file) { reject(userError(FILE_REFUSED)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
    reader.onerror = () => reject(userError('That file could not be read. Try another one.'));
    reader.readAsDataURL(file);
  });
}

/** The same, as text (for importing CSV or JSON). */
export function readPickedText(input) {
  return new Promise((resolve, reject) => {
    const file = input.files && input.files[0];
    if (!file) { reject(userError(FILE_REFUSED)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, text: String(reader.result) });
    reader.onerror = () => reject(userError('That file could not be read. Try another one.'));
    reader.readAsText(file);
  });
}

// ---- progress & universal mobile navigation drawer -------------------------------------------

let mobileDrawerMounted = false;

function mountMobileNavDrawer() {
  if (mobileDrawerMounted) return;
  mobileDrawerMounted = true;

  const setOpen = (open) => {
    document.documentElement.classList.toggle('tk-nav-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tk-nav-trigger';
  trigger.setAttribute('aria-label', 'Open navigation menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = String(icon('menu', { size: 19 }));

  const scrim = document.createElement('div');
  scrim.className = 'tk-nav-scrim';
  scrim.setAttribute('aria-hidden', 'true');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tk-nav-close';
  closeBtn.setAttribute('aria-label', 'Close navigation menu');
  closeBtn.innerHTML = String(icon('x', { size: 17 }));

  trigger.addEventListener('click', () => {
    setOpen(!document.documentElement.classList.contains('tk-nav-open'));
  });
  scrim.addEventListener('click', () => setOpen(false));
  closeBtn.addEventListener('click', () => setOpen(false));

  document.addEventListener('click', (event) => {
    if (!document.documentElement.classList.contains('tk-nav-open')) return;
    if (event.target && event.target.closest && event.target.closest('.tk-rail a[href]')) {
      setOpen(false);
    }
  });
  window.addEventListener('hashchange', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.documentElement.classList.contains('tk-nav-open')) {
      setOpen(false);
    }
  });

  document.body.append(trigger, scrim, closeBtn);
}

/** A thin bar at the top of the app while any backend call is under way. Call once at start-up. */
export function mountBusyBar() {
  const bar = document.createElement('div');
  bar.className = 'k-busy';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let timer = 0;
  onBusy((count) => {
    clearTimeout(timer);
    if (count > 0) timer = setTimeout(() => bar.classList.add('is-on'), 150);
    else bar.classList.remove('is-on');
  });
  mountMobileNavDrawer();
}

// ---- small pieces of markup ------------------------------------------------------------------

/** A labelled field: field('Name', html`<input class="k-input" name="name">`, { hint, error }). */
export function field(label, control, { hint = '', error = '', optional = false } = {}) {
  return html`<label class="${cls('k-field', { 'has-error': !!error })}">
    <span class="k-field__label">${label}${optional ? html` <span class="k-field__optional">optional</span>` : ''}</span>
    ${control}
    ${error ? html`<span class="k-field__error">${error}</span>` : hint ? html`<span class="k-field__hint">${hint}</span>` : ''}
  </label>`;
}

/** An empty state: what this place is for, and the one thing to do next. */
export function emptyState({ iconName = '', title, text = '', action = null }) {
  return html`<div class="k-empty">
    ${iconName ? html`<div class="k-empty__icon">${icon(iconName)}</div>` : ''}
    <h3 class="k-empty__title">${title}</h3>
    ${text ? html`<p class="k-empty__text">${text}</p>` : ''}
    ${action || ''}
  </div>`;
}

/** Placeholder rows while a list loads. */
export function skeleton(rows = 3) {
  return html`<div class="k-skeleton" aria-hidden="true">${Array.from({ length: rows }, () => html`<div class="k-skeleton__row"></div>`)}</div>`;
}

export { render };
