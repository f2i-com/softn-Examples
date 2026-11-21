// Cleaners Roster, Property Inspections & Damage Log, and Per-Property Linen & Supplies (Unified Coastal Mastheads).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { num, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { openInspectionDialog } from './command.js';

const AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const UNITS = ['Sets', 'Packs', 'Bottles', 'Units'];

function renderStars(n) {
  const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return html`<span class="sr-stars" aria-label="${r} of 5">${'★'.repeat(r)}<span class="sr-stars__empty">${'★'.repeat(5 - r)}</span></span>`;
}

export function renderCleanersView(state) {
  const activeCount = state.cleaners.filter((c) => c.active === 'Active').length;
  const todayAssigned = state.cleaners.reduce((s, c) => s + Number(c.today_turnovers || 0), 0);
  const weekendCount = state.cleaners.filter((c) => (c.availability || []).includes('Saturday') || (c.availability || []).includes('Sunday')).length;

  return html`
    <section class="sr-masthead" aria-label="Cleaners Roster">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          TURNOVER SPECIALISTS · WEEKLY ROSTER
        </div>
        <h1 class="sr-masthead__title">Cleaners Roster</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${activeCount} active cleaner${activeCount === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${weekendCount} with weekend availability</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live daily turnover counts</span>
        </div>
      </div>

      <div class="sr-masthead__pods" style="align-items:center">
        <div class="sr-pod sr-pod--sand">
          <span class="sr-pod__lbl">${icon('users', { size: 12 })} Active</span>
          <span class="sr-pod__val">${activeCount}/${state.cleaners.length}</span>
          <span class="sr-pod__sub">On roster</span>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('turnaround', { size: 12 })} Assigned</span>
          <span class="sr-pod__val">${todayAssigned}</span>
          <span class="sr-pod__sub">Turnovers today</span>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('calendar', { size: 12 })} Weekend</span>
          <span class="sr-pod__val">${weekendCount}</span>
          <span class="sr-pod__sub">Sat/Sun cover</span>
        </div>

        <button type="button" class="k-btn sr-cta-warm" data-action="cleaner-new">${icon('plus', { size: 15 })} Add Cleaner</button>
      </div>
    </section>

    ${state.loading && !state.cleaners.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.cleaners.length ? html`
      <div class="sr-prop-grid">
        ${state.cleaners.map((cl) => html`
          <article class="tk-card" data-key="cl-${cl.id}">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="sr-cleaner-avatar">${initials(cl.name || 'CL')}</div>
              <div style="min-width:0;flex:1">
                <h2 class="tk-card__title">${cl.name}</h2>
                <div class="tk-card__sub">${cl.today_turnovers || 0} turnover${Number(cl.today_turnovers) === 1 ? '' : 's'} today</div>
              </div>
              <span class="tk-tag ${cl.active === 'Active' ? 'tk-tag--ok' : ''}">${cl.active}</span>
            </div>
            <div class="tk-row__meta">
              ${cl.phone ? html`<span>${icon('phone', { size: 13 })} ${cl.phone}</span>` : ''}
              ${cl.email ? html`<span>${icon('mail', { size: 13 })} ${cl.email}</span>` : ''}
            </div>
            <div>
              <div class="tk-kv__k" style="margin-bottom:5px">Weekly Availability</div>
              <div class="sr-week">
                ${DAYS.map((d) => html`<span class="${cls('sr-day-chip', { 'is-on': (cl.availability || []).includes(d) })}">${d.slice(0, 3)}</span>`)}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${(cl.service_areas || []).map((a) => html`<span class="tk-tag tk-tag--accent">${a}</span>`)}
              ${cl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--sm" data-action="cleaner-edit" data-id="${cl.id}">Edit</button>
              ${cl.phone ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="cleaner-copy" data-id="${cl.id}">${icon('copy', { size: 13 })} Contact</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cleaner-del" data-id="${cl.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'users', title: 'No cleaners on roster yet', text: 'Add cleaners with their service areas and weekly days available.' })}
  `;
}

export function renderInspectionsView(state) {
  const followUps = state.inspections.filter((i) => i.follow_up_required === 'Yes').length;
  const avgNum = state.inspections.length
    ? state.inspections.reduce((s, i) => s + Number(i.condition_rating || 0), 0) / state.inspections.length
    : 0;
  const avgPct = Math.round((avgNum / 5) * 100);

  return html`
    <section class="sr-masthead" aria-label="Inspections & Damage Log">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${followUps > 0 ? '#fb7185' : '#34d399'}"></span>
          CONDITION AUDITS · DAMAGE CLAIMS
        </div>
        <h1 class="sr-masthead__title">Inspections &amp; Damage</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${state.inspections.length} inspection${state.inspections.length === 1 ? '' : 's'}</strong> logged</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Missing linen &amp; damage tracking</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable owner reports</span>
        </div>
      </div>

      <div class="sr-masthead__pods sr-masthead__pods--3" style="align-items:center">
        <div class="sr-pod sr-pod--ring sr-pod--sand">
          <div class="tk-ring" style="--p:${avgPct}%;--ring-color:#34d399;--ring-size:48px">
            <span class="tk-ring__val">${avgNum ? avgNum.toFixed(1) : '—'}</span>
          </div>
          <div>
            <span class="sr-pod__lbl">Condition</span>
            <span class="sr-pod__val">${avgNum ? avgNum.toFixed(1) + ' ★' : '—'}</span>
            <span class="sr-pod__sub">Average score</span>
          </div>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('clipboard', { size: 12 })} Logged</span>
          <span class="sr-pod__val">${state.inspections.length}</span>
          <span class="sr-pod__sub">Total audits</span>
        </div>

        <div class="${cls('sr-pod', { 'sr-pod--alert': followUps > 0 })}">
          <span class="sr-pod__lbl">${icon(followUps > 0 ? 'alert' : 'check-circle', { size: 12 })} Follow-Ups</span>
          <span class="sr-pod__val">${followUps}</span>
          <span class="sr-pod__sub">${followUps > 0 ? 'Action needed' : 'All clear'}</span>
        </div>

        <button type="button" class="k-btn sr-cta-warm" data-action="insp-new">${icon('plus', { size: 15 })} Log Inspection</button>
      </div>
    </section>

    <section class="tk-sheet">
      ${state.loading && !state.inspections.length ? skeleton(3) : state.inspections.length ? state.inspections.map((ins) => html`
        <div class="tk-row sr-insp-row ${ins.follow_up_required === 'Yes' ? 'sr-insp-row--fu' : ''}" data-key="ins-${ins.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span>${ins.property_name || 'Property #' + ins.property_id}</span>
              ${renderStars(ins.condition_rating)}
              ${ins.follow_up_required === 'Yes' ? html`<span class="sr-urgent-pill">Follow-up Needed</span>` : html`<span class="tk-tag tk-tag--ok">Clear</span>`}
              ${ins.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              <span>${fmtDay(ins.inspection_date)}</span>
              ${ins.inspector_name ? html`<span>Inspector: ${ins.inspector_name}</span>` : ''}
              ${ins.owner ? html`<span>Owner: ${ins.owner}</span>` : ''}
            </div>
            ${ins.missing_items ? html`<div style="font-size:13px;color:#92400e"><strong>Missing items:</strong> ${ins.missing_items}</div>` : ''}
            ${ins.damage_notes ? html`<div style="font-size:13px;color:var(--k-danger)"><strong>Damage notes:</strong> ${ins.damage_notes}</div>` : ''}
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--sm" data-action="insp-toggle-fu" data-id="${ins.id}">
              ${ins.follow_up_required === 'Yes' ? 'Mark Resolved ✓' : 'Flag Follow-up'}
            </button>
            <button type="button" class="k-btn k-btn--sm" data-action="insp-print" data-id="${ins.id}">${icon('printer', { size: 13 })} Report</button>
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="insp-del" data-id="${ins.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'clipboard', title: 'No inspections logged yet', text: 'Log property condition ratings, missing items and damage notes after guest checkout.' })}
    </section>
  `;
}

export function renderSuppliesView(state) {
  const lowItems = state.supplies.filter((s) => s.status !== 'OK');
  const outItems = state.supplies.filter((s) => s.status === 'Out');
  const okItems = state.supplies.filter((s) => s.status === 'OK');
  const parPct = state.supplies.length ? Math.round((okItems.length / state.supplies.length) * 100) : 100;

  const shown = state.supplies.filter((s) => {
    if (state.supplyOnlyLow && s.status === 'OK') return false;
    if (state.supplyPropertyFilter !== 'All' && String(s.property_id) !== String(state.supplyPropertyFilter)) return false;
    return true;
  });

  return html`
    <section class="sr-masthead" aria-label="Property Linen & Supplies">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${lowItems.length ? '#f59e0b' : '#34d399'}"></span>
          LINEN SETS · TOILETRIES · WELCOME KITS
        </div>
        <h1 class="sr-masthead__title">Linen &amp; Property Supplies</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${state.supplies.length} tracked item${state.supplies.length === 1 ? '' : 's'}</strong> across ${state.properties.length} properties</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click restock to par</span>
        </div>
      </div>

      <div class="sr-masthead__pods sr-masthead__pods--3" style="align-items:center">
        <div class="sr-pod sr-pod--ring sr-pod--sand">
          <div class="tk-ring" style="--p:${parPct}%;--ring-color:${parPct >= 80 ? '#34d399' : '#f59e0b'};--ring-size:48px">
            <span class="tk-ring__val">${parPct}%</span>
          </div>
          <div>
            <span class="sr-pod__lbl">Cupboard Par</span>
            <span class="sr-pod__val">${okItems.length}/${state.supplies.length}</span>
            <span class="sr-pod__sub">Stocked OK</span>
          </div>
        </div>

        <div class="${cls('sr-pod', { 'sr-pod--alert': lowItems.length > 0 })}">
          <span class="sr-pod__lbl">${icon('alert', { size: 12 })} Low / Out</span>
          <span class="sr-pod__val">${lowItems.length}</span>
          <span class="sr-pod__sub">${outItems.length} out of stock</span>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('key-card', { size: 12 })} Properties</span>
          <span class="sr-pod__val">${state.properties.length}</span>
          <span class="sr-pod__sub">Monitored</span>
        </div>

        <div class="sr-masthead__actions">
          ${lowItems.length ? html`<button type="button" class="k-btn sr-cta-glass k-btn--sm" data-action="sr-copy-restock">${icon('copy', { size: 14 })} Restock Run (${lowItems.length})</button>` : ''}
          <button type="button" class="k-btn sr-cta-warm" data-action="sr-sup-new">${icon('plus', { size: 15 })} Add Supply</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': !state.supplyOnlyLow })}" data-action="sr-sup-low" data-val="0">All Stock (${state.supplies.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.supplyOnlyLow })}" data-action="sr-sup-low" data-val="1">Low / Out (${lowItems.length})</button>
      </div>
      <select class="k-input" style="width:auto;min-height:36px;padding:4px 10px" data-action="sr-sup-prop">
        <option value="All" ${state.supplyPropertyFilter === 'All' ? 'selected' : ''}>All Properties</option>
        ${state.properties.map((p) => html`<option value="${p.id}" ${String(state.supplyPropertyFilter) === String(p.id) ? 'selected' : ''}>${p.property_name}</option>`)}
      </select>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.supplies.length ? skeleton(3) : shown.length ? shown.map((sp) => {
        const target = Math.max(1, Math.ceil(Number(sp.reorder_point) * 1.5));
        const pct = Math.min(100, Math.round((Number(sp.current_stock) / target) * 100));
        const barTone = sp.status === 'Out' ? 'tk-bar__fill--bad' : sp.status === 'Low' ? 'tk-bar__fill--warn' : 'tk-bar__fill--ok';
        const tagTone = sp.status === 'Out' ? 'tk-tag--bad' : sp.status === 'Low' ? 'tk-tag--warn' : 'tk-tag--ok';
        const rowTone = sp.status === 'Out' ? 'sr-stock-row--out' : sp.status === 'Low' ? 'sr-stock-row--low' : '';
        return html`
          <div class="tk-row sr-stock-row ${rowTone}" data-key="ssup-${sp.id}">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${sp.supply_item}</span>
                <span class="tk-tag ${tagTone}">${sp.status}</span>
                <span class="tk-tag tk-tag--accent">${sp.property_name || 'Property #' + sp.property_id}</span>
                ${sp.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                <span>Reorder alert at: ${num(sp.reorder_point, { decimals: 1 })} ${sp.unit}</span>
              </div>
            </div>
            <div class="sr-stock-par">
              <div class="sr-stock-par__nums">
                <strong>${num(sp.current_stock, { decimals: 1 })} ${sp.unit}</strong>
                <span class="tk-muted">${pct}%</span>
              </div>
              <div class="tk-bar"><div class="tk-bar__fill ${barTone}" style="width:${pct}%"></div></div>
            </div>
            <div class="tk-row__aside">
              <button type="button" class="k-btn k-btn--sm" data-action="sr-sup-adj" data-id="${sp.id}" data-delta="-1">-1</button>
              <button type="button" class="k-btn k-btn--sm" data-action="sr-sup-adj" data-id="${sp.id}" data-delta="1">+1</button>
              ${sp.status !== 'OK' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sr-sup-par" data-id="${sp.id}">Restock</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="sr-sup-edit" data-id="${sp.id}">Edit</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'linen-stack', title: 'No property supplies match filter', text: 'Track linen sets, toiletries and welcome kits per property.' })}
    </section>
  `;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  const cleanerFields = (cl = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Cleaner Name</span><input class="k-input" name="name" value="${cl.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Active</span>
        <select class="k-input" name="active">
          <option value="Active" ${cl.active !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${cl.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${cl.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${cl.email || ''}"></label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Service Areas</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${AREAS.map((a) => html`<label class="k-check"><input type="checkbox" name="service_areas" value="${a}" ${(cl.service_areas || []).includes(a) ? 'checked' : ''}><span>${a}</span></label>`)}
      </div>
    </div>
    <div class="k-field">
      <span class="k-field__label">Weekly Availability</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${DAYS.map((d) => html`<label class="k-check"><input type="checkbox" name="availability" value="${d}" ${(cl.availability || []).includes(d) ? 'checked' : ''}><span>${d.slice(0, 3)}</span></label>`)}
      </div>
    </div>`;

  on(root, 'click', '[data-action="cleaner-new"]', async () => {
    const made = await formDialog({ title: 'Add Cleaner', submitLabel: 'Save cleaner', fields: cleanerFields(), onSubmit: (v) => api.post('/api/cleaners', v) });
    if (made) { toast.success('Cleaner added.'); await loadScreen('/cleaners'); }
  });
  on(root, 'click', '[data-action="cleaner-edit"]', async (e, el) => {
    const cl = state.cleaners.find((x) => String(x.id) === el.dataset.id);
    if (!cl) return;
    const saved = await formDialog({ title: `Edit ${cl.name}`, submitLabel: 'Save cleaner', fields: cleanerFields(cl), onSubmit: (v) => api.put('/api/cleaners', { ...v, id: cl.id }) });
    if (saved) { toast.success('Cleaner updated.'); await loadScreen('/cleaners'); }
  });
  on(root, 'click', '[data-action="cleaner-copy"]', (e, el) => {
    const cl = state.cleaners.find((x) => String(x.id) === el.dataset.id);
    if (!cl) return;
    copyText(`${cl.name}\nPhone: ${cl.phone}\nEmail: ${cl.email || '—'}`, { title: 'Cleaner Contact' });
  });
  on(root, 'click', '[data-action="cleaner-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove cleaner?', message: 'Remove this cleaner from the roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/cleaners', { id: Number(el.dataset.id) }); toast.success('Cleaner removed.'); await loadScreen('/cleaners'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="insp-new"]', async () => {
    if (!state.properties.length) {
      const p = await api.get('/api/properties');
      state.properties = p.properties || [];
    }
    if (!state.properties.length) { toast.error('Add a property first.'); return; }
    const picked = await formDialog({
      title: 'Select Property to Inspect',
      submitLabel: 'Continue',
      fields: html`<label class="k-field"><span class="k-field__label">Property</span><select class="k-input" name="property_id">${state.properties.map((p) => html`<option value="${p.id}">${p.property_name}</option>`)}</select></label>`,
      onSubmit: (v) => v,
    });
    if (!picked) return;
    const prop = state.properties.find((p) => String(p.id) === String(picked.property_id));
    if (prop) openInspectionDialog({ property_id: prop.id, property_name: prop.property_name }, state, { loadScreen });
  });

  on(root, 'click', '[data-action="insp-toggle-fu"]', async (e, el) => {
    try { await api.post('/api/inspections/followup', { id: Number(el.dataset.id) }); toast.success('Follow-up status updated.'); await loadScreen('/inspections'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="insp-print"]', (e, el) => {
    const ins = state.inspections.find((x) => String(x.id) === el.dataset.id);
    if (!ins) return;
    downloadHtmlDoc(`stayready-inspection-${ins.id}.html`, {
      title: `Property Inspection Report · ${ins.property_name || ''}`,
      businessName: state.session.settings.business_name,
      subtitle: `${fmtDay(ins.inspection_date)} · Inspector: ${ins.inspector_name || 'Host Team'}`,
      accent: '#283e7a',
      bodyHtml: `<table>
        <tr><th>Property</th><td>${ins.property_name || ''}</td></tr>
        <tr><th>Owner</th><td>${ins.owner || '—'}</td></tr>
        <tr><th>Condition Rating</th><td>${ins.condition_rating} / 5 ★</td></tr>
        <tr><th>Follow-up Required</th><td>${ins.follow_up_required}</td></tr>
      </table>
      ${ins.missing_items ? `<div class="box"><strong>Missing Items:</strong> ${ins.missing_items}</div>` : ''}
      ${ins.damage_notes ? `<div class="box"><strong>Damage &amp; Maintenance Notes:</strong> ${ins.damage_notes}</div>` : '<div class="box"><strong>Condition:</strong> Property passed inspection with no damage noted.</div>'}`,
    });
  });

  on(root, 'click', '[data-action="insp-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete inspection?', message: 'Delete this property inspection record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/inspections', { id: Number(el.dataset.id) }); toast.success('Inspection deleted.'); await loadScreen('/inspections'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sr-sup-low"]', (e, el) => { state.supplyOnlyLow = el.dataset.val === '1'; draw(); });
  on(root, 'change', '[data-action="sr-sup-prop"]', (e, el) => { state.supplyPropertyFilter = el.value; draw(); });
  on(root, 'click', '[data-action="sr-sup-adj"]', async (e, el) => {
    try { await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), delta: Number(el.dataset.delta) }); await loadScreen('/supplies'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="sr-sup-par"]', async (e, el) => {
    try { await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), restockToPar: true }); toast.success('Property supply restocked.'); await loadScreen('/supplies'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="sr-copy-restock"]', () => {
    const low = state.supplies.filter((s) => s.status !== 'OK');
    const lines = low.map((s) => `- [${s.property_name}] ${s.supply_item}: have ${s.current_stock} ${s.unit}, reorder at ${s.reorder_point} ${s.unit} (${s.status})`);
    copyText(`StayReady Property Restock Run (${today()})\n${lines.join('\n')}`, { title: 'Per-Property Restock List' });
  });

  const supFields = (s = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Property</span>
        <select class="k-input" name="property_id" required>${state.properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(s.property_id) ? 'selected' : ''}>${p.property_name}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Supply Item</span><input class="k-input" name="supply_item" value="${s.supply_item || ''}" placeholder="e.g. Queen Linen Sets" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Current Stock</span><input class="k-input" type="number" step="0.5" min="0" name="current_stock" value="${s.current_stock ?? 0}" required></label>
      <label class="k-field"><span class="k-field__label">Reorder Alert Level</span><input class="k-input" type="number" step="0.5" min="0.5" name="reorder_point" value="${s.reorder_point ?? 3}" required></label>
      <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${UNITS.map((u) => html`<option value="${u}" ${u === (s.unit || 'Sets') ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>`;

  on(root, 'click', '[data-action="sr-sup-new"]', async () => {
    if (!state.properties.length) { toast.error('Add a property first.'); return; }
    const made = await formDialog({ title: 'Add Property Supply', submitLabel: 'Save', fields: supFields(), onSubmit: (v) => api.post('/api/supplies', v) });
    if (made) { toast.success('Supply item added.'); await loadScreen('/supplies'); }
  });
  on(root, 'click', '[data-action="sr-sup-edit"]', async (e, el) => {
    const sp = state.supplies.find((x) => String(x.id) === el.dataset.id);
    if (!sp) return;
    const saved = await formDialog({ title: `Edit ${sp.supply_item}`, submitLabel: 'Save', fields: supFields(sp), onSubmit: (v) => api.put('/api/supplies', { ...v, id: sp.id }) });
    if (saved) { toast.success('Supply updated.'); await loadScreen('/supplies'); }
  });
}
