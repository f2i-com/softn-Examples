// Setup & Facilities Checklists — Architectural Masthead w/ Pure-CSS Setup Readiness Ring,
// tactile per-room setup cards, interactive equipment toggle chips & 1-click "Mark Setup Complete".
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const LAYOUTS = ['Theatre', 'Banquet', 'Boardroom', 'Classroom', 'Empty', 'Custom'];
const EQUIPMENT = ['Chairs', 'Tables', 'Projector', 'PA system', 'Whiteboard', 'Stage risers'];

function checklistItemsFor(su) {
  const items = [`${su.layout} layout set`];
  for (const eq of su.equipment || []) items.push(eq);
  if (su.catering_required === 'Yes') items.push('Catering station');
  return items;
}

function checkedCountFor(su, setupChecked) {
  const items = checklistItemsFor(su);
  if (su.setup_complete === 'Yes') return { done: items.length, total: items.length, pct: 100, items };
  const ticked = setupChecked[su.id] || [];
  const done = items.filter((it) => ticked.includes(it)).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return { done, total: items.length, pct, items };
}

export function renderSetupsView(state) {
  const totalSetups = state.setups.length;
  const readySetups = state.setups.filter((s) => s.setup_complete === 'Yes').length;
  const pendingCount = totalSetups - readySetups;
  const overallPct = totalSetups > 0 ? Math.round((readySetups / totalSetups) * 100) : 0;

  const rows = state.setupFilter === 'Pending'
    ? state.setups.filter((s) => s.setup_complete !== 'Yes')
    : state.setupFilter === 'Done'
      ? state.setups.filter((s) => s.setup_complete === 'Yes')
      : state.setups;

  return html`
    <section class="vo-masthead" aria-label="Setup Readiness Command">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${overallPct === 100 ? '#34d399' : '#e8b956'}"></span>
          ROOM TURNAROUND &amp; AV STAGING
        </div>
        <h1 class="vo-masthead__title">Setup Checklists</h1>
        <div class="vo-masthead__meta">
          <span>Tick off layouts &amp; AV gear as crew stage each space</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Sign off before doors open</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="vo-pod vo-pod--ring vo-pod--gold" aria-label="Setup Readiness ${overallPct}%">
          <div class="tk-ring" style="--p:${overallPct}%;--ring-color:${overallPct === 100 ? '#34d399' : '#e8b956'};--ring-size:48px">
            <span class="tk-ring__val">${overallPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="vo-pod__lbl">Setup Readiness</span>
            <span class="vo-pod__val" style="font-size:16.5px">${readySetups}/${totalSetups}</span>
            <span class="vo-pod__sub">${pendingCount === 0 ? 'All rooms staged' : `${pendingCount} room${pendingCount === 1 ? '' : 's'} pending`}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          ${state.setups.length ? html`<button type="button" class="k-btn k-btn--glass" data-action="copy-setups">${icon('copy', { size: 14 })} Crew Brief</button>` : ''}
          <button type="button" class="k-btn k-btn--primary" data-action="su-new">${icon('plus', { size: 15 })} Add Setup Sheet</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter setup checklists">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.setupFilter === 'All' })}" data-action="su-filter" data-filter="All">All (${totalSetups})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.setupFilter === 'Pending' })}" data-action="su-filter" data-filter="Pending">To Do (${pendingCount})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.setupFilter === 'Done' })}" data-action="su-filter" data-filter="Done">Ready (${readySetups})</button>
      </div>
    </div>

    ${state.loading && !state.setups.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="vo-setup-grid">
        ${rows.map((su) => {
          const isDone = su.setup_complete === 'Yes';
          const prog = checkedCountFor(su, state.setupChecked || {});
          const ticked = (state.setupChecked || {})[su.id] || [];
          return html`
            <article class="${cls('vo-setup-card', { 'vo-setup-card--done': isDone })}" data-key="su-${su.id}">
              <div style="display:grid;gap:7px;min-width:0;flex:1">
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                  <span class="vo-ref">${su.booking_ref}</span>
                  <span class="vo-time-slot">${fmtDay(su.booking_date)} · Doors ${su.start_time}</span>
                  <strong style="font-size:15.5px">${su.space_name}</strong>
                  <span class="tk-tag tk-tag--accent">${su.layout} layout</span>
                  ${su.catering_required === 'Yes' ? html`<span class="tk-tag tk-tag--warn">Catering</span>` : ''}
                  <span class="tk-tag ${isDone ? 'tk-tag--ok' : 'tk-tag--warn'}">${isDone ? 'Setup Ready ✓' : 'Not yet ready'}</span>
                  ${su.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13px;color:var(--k-muted)">
                  <span>Hirer: <strong style="color:var(--k-text)">${su.client_name}</strong></span>
                  ${su.completed_by ? html`<span>Signed off by ${su.completed_by}</span>` : ''}
                </div>
                <div class="vo-setup-progress">
                  <div class="vo-setup-progress__lbl">
                    <span>Equipment &amp; staging checklist</span>
                    <span>${prog.done}/${prog.total} ready · ${prog.pct}%</span>
                  </div>
                  <div class="tk-bar">
                    <div class="tk-bar__fill ${prog.pct === 100 ? 'tk-bar__fill--ok' : ''}" style="width:${prog.pct}%"></div>
                  </div>
                </div>
                <div class="vo-equip-list">
                  ${prog.items.map((item) => {
                    const itemDone = isDone || ticked.includes(item);
                    return html`
                      <button type="button" class="${cls('vo-equip-chip', { 'vo-equip-chip--done': itemDone })}" data-action="su-chip-toggle" data-id="${su.id}" data-item="${item}" ${isDone ? 'disabled' : ''}>
                        ${itemDone ? '✓' : '☐'} ${item}
                      </button>`;
                  })}
                </div>
                ${su.notes ? html`<div style="font-size:12.5px;color:var(--k-muted);margin-top:2px">${su.notes}</div>` : ''}
              </div>
              <div class="vo-folio__aside">
                <button type="button" class="k-btn k-btn--sm ${isDone ? '' : 'k-btn--primary'}" data-action="su-toggle" data-id="${su.id}">
                  ${isDone ? 'Completed ✓' : 'Mark Setup Complete'}
                </button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="su-edit" data-id="${su.id}">Edit</button>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'check-square', title: 'All room setups are clear', text: 'Create a setup sheet linked to any upcoming venue booking.' })}`;
}

export function wireSetupsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="su-filter"]', (e, el) => { state.setupFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="su-chip-toggle"]', (e, el) => {
    const id = Number(el.dataset.id);
    const item = el.dataset.item;
    if (!state.setupChecked) state.setupChecked = {};
    const list = state.setupChecked[id] ? [...state.setupChecked[id]] : [];
    const idx = list.indexOf(item);
    if (idx >= 0) list.splice(idx, 1); else list.push(item);
    state.setupChecked[id] = list;
    draw();
  });

  on(root, 'click', '[data-action="su-toggle"]', async (e, el) => {
    try {
      const id = Number(el.dataset.id);
      const res = await api.post('/api/setups/complete', { id });
      if (state.setupChecked && state.setupChecked[id]) delete state.setupChecked[id];
      toast.success(res.setup.setup_complete === 'Yes' ? 'Room setup marked complete!' : 'Setup reopened.');
      await loadScreen('/setups');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-setups"]', () => {
    const todo = state.setups.filter((s) => s.setup_complete !== 'Yes');
    const source = todo.length ? todo : state.setups;
    const lines = source.map((s) => `[${s.booking_date} ${s.start_time}] ${s.space_name} (${s.booking_ref}) — ${s.layout}, Equip: ${(s.equipment || []).join(', ') || 'None'}${s.catering_required === 'Yes' ? ' [CATERING]' : ''} · ${s.setup_complete === 'Yes' ? 'READY' : 'TO DO'}${s.notes ? ' — ' + s.notes : ''}`);
    copyText(`VenueOps Facilities Setup Brief (${today()})\n${lines.join('\n')}`, { title: 'Facilities Setup Brief' });
  });

  const setupFields = (su = {}) => {
    const eq = su.equipment || [];
    return html`
      <label class="k-field"><span class="k-field__label">Booking</span>
        <select class="k-input" name="booking_id" ${su.id ? 'disabled' : 'required'}>
          ${state.bookings.map((b) => html`<option value="${b.id}" ${String(b.id) === String(su.booking_id) ? 'selected' : ''}>${b.booking_ref} — ${b.space_name} (${fmtDay(b.booking_date)} ${b.start_time} · ${b.client_name})</option>`)}
        </select>
      </label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Room layout</span>
          <select class="k-input" name="layout">${LAYOUTS.map((l) => html`<option value="${l}" ${l === (su.layout || 'Theatre') ? 'selected' : ''}>${l}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Catering required</span>
          <select class="k-input" name="catering_required">
            <option value="No" ${su.catering_required !== 'Yes' ? 'selected' : ''}>No</option>
            <option value="Yes" ${su.catering_required === 'Yes' ? 'selected' : ''}>Yes</option>
          </select>
        </label>
      </div>
      <div class="k-field">
        <span class="k-field__label">Equipment checklist</span>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
          ${EQUIPMENT.map((item) => html`<label class="k-check"><input type="checkbox" name="equipment" value="${item}" ${eq.includes(item) ? 'checked' : ''}><span>${item}</span></label>`)}
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Setup notes</span>
        <textarea class="k-input" name="notes" rows="2" placeholder="Head table at north end, aisle down middle, urn on at 6pm…">${su.notes || ''}</textarea>
      </label>`;
  };

  on(root, 'click', '[data-action="su-new"]', async () => {
    if (!state.bookings.length) { toast.error('Create a booking first.'); return; }
    const made = await formDialog({ title: 'Add Setup Sheet', submitLabel: 'Save setup', fields: setupFields(), onSubmit: (v) => api.post('/api/setups', { ...v, booking_id: Number(v.booking_id) }) });
    if (made) { toast.success('Setup sheet added.'); await loadScreen('/setups'); }
  });

  on(root, 'click', '[data-action="su-edit"]', async (e, el) => {
    const su = state.setups.find((x) => String(x.id) === el.dataset.id);
    if (!su) return;
    const saved = await formDialog({ title: `Edit Setup · ${su.booking_ref}`, submitLabel: 'Save', fields: setupFields(su), onSubmit: (v) => api.put('/api/setups', { ...v, id: su.id }) });
    if (saved) { toast.success('Setup sheet updated.'); await loadScreen('/setups'); }
  });
}
