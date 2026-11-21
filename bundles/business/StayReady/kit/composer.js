// kit/composer.js: a message box where Enter sends and Shift+Enter starts a new line.
//
// Why this needs a helper: the app's code runs a thread away from the page, so by the time a
// keydown reaches it the browser has already done the key's own work, and `preventDefault()` on a
// key does nothing. Enter in a <textarea> has therefore already added a line break, and an `input`
// event carrying that text is already on its way. Handled naively, a message is sent and then
// comes back into the box, ready to be sent twice; and emptying the box a second time when that
// echo arrives wipes whatever the person has typed since. So the helper keeps its own account of
// what is in the box: it takes the text as it stood at the keydown, empties the box once, and
// ignores that one echo.
//
//   const composer = composerOn(root, 'textarea[data-composer]', {
//     onSend: async (text, field) => { await api.post('/api/messages', { chatId, text }); },
//     onDraft: (text) => { state.draft = text; },       // optional: the text as the person types
//     onError: (error, text) => toastError(error),
//   });
//   on(root, 'click', '[data-action="send"]', (event, button) => composer.sendFrom(qs('textarea[data-composer]', button.closest('form'))));
//
// Leave the field uncontrolled (render writes no value into it; no data-controlled), give it
// class="k-input k-composer" so it grows with its text, and read its text through the composer
// (onDraft, textOf) rather than field.value, which can briefly hold the echo. On a phone Enter
// adds a line, as phone keyboards expect, and the Send button sends.
import { on } from './dom.js';

const ECHO_WINDOW_MS = 1500;
const states = new WeakMap();
const stateOf = (field) => {
  let state = states.get(field);
  if (!state) { state = { sending: false, text: null, echoOf: null, echoAt: 0, sentOnEnter: false }; states.set(field, state); }
  return state;
};

const touchFirst = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } };

// Is `now` the text `before` with exactly one line break added (the break Enter made)?
function isEchoOf(before, now) {
  if (now.length !== before.length + 1) return false;
  for (let i = 0; i < now.length; i++) {
    if (now[i] === '\n' && now.slice(0, i) + now.slice(i + 1) === before) return true;
  }
  return false;
}

/**
 * Wire every field matching `selector` under `root`. Options:
 *   onSend(text, field)   called with the trimmed text; may be async. If it throws, the text is
 *                         put back in the box (unless the person has typed something new) and the
 *                         error goes to onError.
 *   onDraft(text, field)  called as the person types (never for the echo of a sent message).
 *   onError(error, text)  called when onSend throws, with the message that was not sent.
 *   enterSends            true (default): Enter sends on a device with a keyboard and mouse.
 * Returns { sendFrom(field), textOf(field), setText(field, text), stop() }.
 */
export function composerOn(root, selector, { onSend, onDraft = null, onError = null, enterSends = true } = {}) {
  const textOf = (field) => { const known = stateOf(field).text; return known === null ? field.value : known; };

  function setText(field, text) {
    stateOf(field).text = text;
    field.value = text;
    if (onDraft) onDraft(text, field);
  }

  async function sendFrom(field, text = textOf(field)) {
    const state = stateOf(field);
    const message = String(text).trim();
    if (!message || state.sending) return false;
    state.sending = true;
    setText(field, '');
    try {
      await onSend(message, field);
      return true;
    } catch (error) {
      if (state.text === '') setText(field, message);
      if (onError) onError(error, message);
      return false;
    } finally {
      state.sending = false;
    }
  }

  const offKey = on(root, 'keydown', selector, (event, field) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || !enterSends || touchFirst()) return;
    const state = stateOf(field);
    if (state.sending) return;                  // a send is under way: this Enter is only a line break
    // field.value is still the text from before this Enter; its line break is already in the page.
    const before = field.value;
    state.echoOf = before;
    state.echoAt = Date.now();
    state.sentOnEnter = before.trim() !== '';
    if (state.sentOnEnter) sendFrom(field, before);
  });

  const offInput = on(root, 'input', selector, (event, field) => {
    const state = stateOf(field);
    if (state.echoOf !== null) {
      const before = state.echoOf;
      const fresh = Date.now() - state.echoAt < ECHO_WINDOW_MS;
      state.echoOf = null;
      if (fresh && isEchoOf(before, field.value)) {
        // The line break of that Enter. After a send the box was already emptied, and writing to
        // it again now would wipe what has been typed since, so the echo is only ignored. When
        // nothing was sent (Enter on an empty box) the stray line is taken out.
        if (!state.sentOnEnter) setText(field, '');
        return;
      }
    }
    state.text = field.value;
    if (onDraft) onDraft(field.value, field);
  });

  return { sendFrom, textOf, setText, stop() { offKey(); offInput(); } };
}
