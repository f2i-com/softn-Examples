// Dietary Requirements Matrix — Botanical Masthead w/ Chef Sign-Off Ring, Severe Allergen Count,
// Per-Event Allergen Grid w/ 1-Click Batch Sign-Off, and Filterable Kitchen Confirmation Log.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const MATRIX_COLS = ['Vegan', 'Gluten-free', 'Nut-free', 'Halal', 'Kosher', 'Dairy-free', 'Vegetarian', 'Other'];

function allergenClass(type) {
  if (type === 'Nut-free' || type === 'Gluten-free') return 'cc-allergen--severe';
  if (type === 'Vegan' || type === 'Vegetarian') return 'cc-allergen--plant';
  if (type === 'Halal' || type === 'Kosher') return 'cc-allergen--faith';
  if (type === 'Dairy-free') return 'cc-allergen--dairy';
  return 'cc-allergen--other';
}

export function renderDietaryView(state) {
  const eventMap = new Map();
  for (const d of state.dietary) {
    const key = d.job_id || d.event_name;
    if (!eventMap.has(key)) {
      eventMap.set(key, { key, job_id: d.job_id, event_name: d.event_name, event_date: d.event_date, counts: {}, pendingIds: [], total: 0 });
    }
    const row = eventMap.get(key);
    row.counts[d.requirement_type] = (row.counts[d.requirement_type] || 0) + Number(d.guest_count || 0);
    row.total += Number(d.guest_count || 0);
    if (d.kitchen_confirmed !== 'Confirmed') row.pendingIds.push(d.id);
  }
  const matrixRows = [...eventMap.values()].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  const pendingCount = state.dietary.filter((d) => d.kitchen_confirmed !== 'Confirmed').length;
  const confirmedCount = state.dietary.length - pendingCount;
  const signoffPct = state.dietary.length > 0 ? Math.round((confirmedCount / state.dietary.length) * 100) : 100;
  const ringColor = pendingCount === 0 ? '#22c55e' : '#e2bc63';
  const severeGuests = state.dietary
    .filter((d) => d.requirement_type === 'Nut-free' || d.requirement_type === 'Gluten-free')
    .reduce((s, d) => s + Number(d.guest_count || 0), 0);

  const filter = state.dietFilter || 'All';
  const q = (state.dietSearch || '').trim().toLowerCase();
  const filteredLog = state.dietary.filter((d) => {
    if (filter === 'Pending' && d.kitchen_confirmed === 'Confirmed') return false;
    if (filter === 'Confirmed' && d.kitchen_confirmed !== 'Confirmed') return false;
    if (q) {
      const hay = `${d.event_name} ${d.requirement_type} ${d.notes || ''} ${d.confirmed_by || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return html`
    <section class="cc-masthead" aria-label="Dietary & Allergen Safety">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          ${icon('shield-check', { size: 12 })} ALLERGEN SAFETY &amp; CHEF SIGN-OFF
        </div>
        <h1 class="cc-masthead__title">Dietary Matrix</h1>
        <div class="cc-masthead__meta">
          <span>Cross-check Vegan, Gluten-free, Nut-free, Halal &amp; Kosher covers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Nothing leaves the pass unconfirmed</span>
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod cc-pod--ring cc-pod--gold">
          <div class="tk-ring" style="--p:${signoffPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${signoffPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="cc-pod__lbl">Chef Sign-Off</span>
            <span class="cc-pod__val" style="font-size:16px">${confirmedCount}/${state.dietary.length}</span>
            <span class="cc-pod__sub">${pendingCount > 0 ? `${pendingCount} awaiting chef` : 'All signed off ✓'}</span>
          </div>
        </div>
        <div class="${cls('cc-pod', severeGuests > 0 ? 'cc-pod--alert' : '')}">
          <span class="cc-pod__lbl">${icon('alert', { size: 12 })} Nut / GF</span>
          <span class="cc-pod__val">${severeGuests}</span>
          <span class="cc-pod__sub">Severe allergen covers</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${state.dietary.length ? html`<button type="button" class="k-btn k-btn--glass" data-action="copy-dietary">${icon('copy', { size: 15 })} Copy Brief</button>` : ''}
          <button type="button" class="k-btn k-btn--primary" data-action="diet-new">${icon('plus', { size: 16 })} Add Alert</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'All' })}" data-action="diet-filter" data-filter="All">All Alerts (${state.dietary.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'Pending' })}" data-action="diet-filter" data-filter="Pending">Awaiting Chef (${pendingCount})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'Confirmed' })}" data-action="diet-filter" data-filter="Confirmed">Confirmed (${confirmedCount})</button>
      </div>
      <label class="cc-search-pill" style="margin-left:auto">
        ${icon('search', { size: 14 })}
        <input type="search" data-action="diet-search" value="${state.dietSearch || ''}" placeholder="Search event, allergen, note…">
      </label>
    </div>

    <div class="tk-stack">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('grid', { size: 18 })} Per-Event Dietary Matrix</h2>
          <span class="cc-signoff-pill ${pendingCount > 0 ? 'cc-signoff-pill--pending' : 'cc-signoff-pill--ok'}" style="margin-left:auto">
            ${pendingCount > 0 ? html`<span class="tk-pulse-dot" style="--dot:#ea580c"></span> ${pendingCount} awaiting chef sign-off` : html`${icon('shield-check', { size: 13 })} All events kitchen confirmed`}
          </span>
        </div>
        ${state.loading && !state.dietary.length ? skeleton(3) : matrixRows.length ? html`
          <div class="tk-table-wrap">
            <table class="tk-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  ${MATRIX_COLS.map((c) => html`<th class="cc-diet-cell">${c}</th>`)}
                  <th class="cc-diet-cell">Total</th>
                  <th>Chef Sign-off</th>
                </tr>
              </thead>
              <tbody>
                ${matrixRows.map((r, i) => html`
                  <tr data-key="mx-${i}">
                    <td><strong>${r.event_name}</strong></td>
                    <td>${fmtDay(r.event_date)}</td>
                    ${MATRIX_COLS.map((col) => {
                      const n = r.counts[col] || 0;
                      const isSevere = col === 'Nut-free' || col === 'Gluten-free';
                      return html`<td class="cc-diet-cell">${n > 0 ? html`<span class="cc-diet-pill ${isSevere ? 'cc-diet-pill--alert' : ''}">${n}</span>` : html`<span class="cc-diet-zero">—</span>`}</td>`;
                    })}
                    <td class="cc-diet-cell"><strong>${r.total}</strong></td>
                    <td>
                      ${r.pendingIds.length > 0 ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diet-confirm-batch" data-ids="${r.pendingIds.join(',')}">
                          ${icon('shield-check', { size: 12 })} Sign Off (${r.pendingIds.length})
                        </button>` : html`
                        <span class="cc-signoff-pill cc-signoff-pill--ok">${icon('shield-check', { size: 12 })} Chef Signed</span>`}
                    </td>
                  </tr>`)}
              </tbody>
            </table>
          </div>` : emptyState({ iconName: 'leaf', title: 'No dietary requirements recorded yet', text: 'Log special diets against any catering job to populate the kitchen allergen matrix.' })}
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('shield-check', { size: 18 })} Kitchen Confirmation Log</h2>
          <span class="tk-sheet__count">${filteredLog.length}</span>
        </div>
        <div>
          ${state.loading && !state.dietary.length ? skeleton(3) : filteredLog.length ? filteredLog.map((d) => {
            const isOk = d.kitchen_confirmed === 'Confirmed';
            const isSevere = d.requirement_type === 'Nut-free' || d.requirement_type === 'Gluten-free';
            return html`
              <div class="tk-row" data-key="dt-${d.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="cc-allergen-badge ${allergenClass(d.requirement_type)}">
                      ${icon(isSevere ? 'alert' : 'leaf', { size: 12 })} ${d.requirement_type}
                    </span>
                    <strong>${d.guest_count} guest${d.guest_count === 1 ? '' : 's'}</strong>
                    <span>— ${d.event_name}</span>
                    <span class="cc-signoff-pill ${isOk ? 'cc-signoff-pill--ok' : 'cc-signoff-pill--pending'}">
                      ${isOk ? html`${icon('check', { size: 12 })} Chef Signed Off` : html`${icon('clock', { size: 12 })} Pending Sign-off`}
                    </span>
                    ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>${fmtDay(d.event_date)}</span>
                    ${d.confirmed_by ? html`<span>Signed off by <strong>${d.confirmed_by}</strong></span>` : ''}
                    ${d.notes ? html`<span><strong>Detail:</strong> ${d.notes}</span>` : ''}
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm ${isOk ? '' : 'k-btn--primary'}" data-action="diet-confirm" data-id="${d.id}" data-next="${isOk ? 'Pending' : 'Confirmed'}">
                    ${isOk ? 'Confirmed ✓' : 'Kitchen Confirmed'}
                  </button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="diet-del" data-id="${d.id}">Remove</button>
                </div>
              </div>`;
          }) : html`<p class="tk-muted" style="padding:18px">No dietary entries match this filter.</p>`}
        </div>
      </section>
    </div>`;
}

export function wireDietaryActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="diet-filter"]', (e, el) => { state.dietFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="diet-search"]', (e, el) => { state.dietSearch = el.value; draw(); });

  on(root, 'click', '[data-action="diet-confirm"]', async (e, el) => {
    try {
      await api.post('/api/dietary/confirm', { id: Number(el.dataset.id), kitchen_confirmed: el.dataset.next });
      toast.success(el.dataset.next === 'Confirmed' ? 'Kitchen confirmation signed off!' : 'Marked back to Pending.');
      await loadScreen('/dietary');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="diet-confirm-batch"]', async (e, el) => {
    const ids = String(el.dataset.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => api.post('/api/dietary/confirm', { id, kitchen_confirmed: 'Confirmed' })));
      toast.success(`Signed off ${ids.length} dietary alert${ids.length === 1 ? '' : 's'}!`);
      await loadScreen('/dietary');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="diet-new"]', async () => {
    if (!state.jobs.length) { toast.error('Create a catering event first.'); return; }
    const made = await formDialog({
      title: 'Add Dietary Requirement',
      submitLabel: 'Log Requirement',
      fields: html`
        <label class="k-field"><span class="k-field__label">Catering event</span>
          <select class="k-input" name="job_id" required>
            ${state.jobs.map((j) => html`<option value="${j.id}">${j.job_number} — ${j.event_name} (${fmtDay(j.event_date)})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Requirement type</span>
            <select class="k-input" name="requirement_type">
              ${MATRIX_COLS.map((c) => html`<option value="${c}">${c}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Guest count</span>
            <input class="k-input" type="number" min="1" max="500" name="guest_count" value="2" required>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Severity, cross-contact rules &amp; labelling notes</span>
          <textarea class="k-input" name="notes" rows="2" placeholder="e.g. Severe tree-nut anaphylaxis — box individually"></textarea>
        </label>`,
      onSubmit: (v) => api.post('/api/dietary', { ...v, job_id: Number(v.job_id) }),
    });
    if (made) { toast.success('Dietary requirement added.'); await loadScreen('/dietary'); }
  });

  on(root, 'click', '[data-action="diet-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove dietary entry?', message: 'Delete this dietary record?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/dietary', { id: Number(el.dataset.id) }); toast.success('Removed.'); await loadScreen('/dietary'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-dietary"]', () => {
    const lines = state.dietary.map((d) => `[${d.event_date}] ${d.event_name}: ${d.guest_count}x ${d.requirement_type} (${d.kitchen_confirmed})${d.notes ? ' — ' + d.notes : ''}`);
    copyText(`CaterCraft Dietary Brief (${today()})\n${lines.join('\n')}`, { title: 'Kitchen Dietary Brief' });
  });
}
