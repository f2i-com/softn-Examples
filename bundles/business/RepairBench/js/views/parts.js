// Parts Orders Tracker — Unified ESD Graphite Masthead & 4-Stage Supply Chain Stepper Cards
// (Ordered -> Shipped -> Arrived -> Installed, auto-advancing Awaiting Parts jobs into Repairing).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, daysBetween } from '../../kit/time.js';
import { money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const PART_STAGES = ['Ordered', 'Shipped', 'Arrived', 'Installed'];
const NEXT_PART = { Ordered: 'Shipped', Shipped: 'Arrived', Backordered: 'Shipped', Arrived: 'Installed' };
const PART_TAG = {
  Ordered: 'tk-tag--info',
  Shipped: 'tk-tag--accent',
  Arrived: 'tk-tag--ok',
  Installed: 'tk-tag--ok',
  Backordered: 'tk-tag--bad',
  Cancelled: '',
};

export function renderPartsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const todayStr = today();
  const openParts = state.parts.filter((p) => p.status !== 'Installed' && p.status !== 'Cancelled');
  const arrivedCount = state.parts.filter((p) => p.status === 'Arrived').length;
  const lateCount = openParts.filter((p) => (p.status === 'Ordered' || p.status === 'Shipped' || p.status === 'Backordered') && p.eta && daysBetween(todayStr, p.eta) < 0).length;
  const rows = state.partsFilter === 'Open' ? openParts : state.parts;

  return html`
    <section class="rb-masthead" aria-label="Parts Supply Chain">
      <div class="rb-masthead__copy">
        <div class="rb-masthead__eyebrow">
          ${icon('box', { size: 12 })} BENCH SUPPLY CHAIN &amp; TRACKING
        </div>
        <h1 class="rb-masthead__title">Parts Orders</h1>
        <div class="rb-masthead__meta">
          <span>Auto-advances jobs on arrival</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>ETA &amp; carrier tracking</span>
        </div>
      </div>

      <div class="rb-masthead__pods" style="align-items:center">
        <div class="rb-pod rb-pod--cyan">
          <span class="rb-pod__lbl">${icon('box', { size: 12 })} In Transit</span>
          <span class="rb-pod__val">${openParts.length}</span>
          <span class="rb-pod__sub">${arrivedCount} arrived on bench</span>
        </div>
        <div class="rb-pod rb-pod--amber">
          <span class="rb-pod__lbl">${icon('dollar', { size: 12 })} Parts Cost</span>
          <span class="rb-pod__val">${money(state.partsTotalCostCents || 0, { currency })}</span>
          <span class="rb-pod__sub">${state.parts.length} total orders</span>
        </div>
        <div class="${cls('rb-pod rb-pod--wide-sm', { 'rb-pod--alert': lateCount > 0 })}">
          <span class="rb-pod__lbl">${icon('clock', { size: 12 })} Late ETA</span>
          <span class="rb-pod__val">${lateCount}</span>
          <span class="rb-pod__sub">${lateCount ? 'Check carrier' : 'On time'}</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="part-new">${icon('plus', { size: 15 })} Order Part</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter parts orders">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.partsFilter === 'Open' })}" data-action="parts-filter" data-filter="Open">Open Orders (${openParts.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.partsFilter === 'All' })}" data-action="parts-filter" data-filter="All">All History (${state.parts.length})</button>
      </div>
    </div>

    ${state.loading && !state.parts.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="rb-part-list">
        ${rows.map((p) => {
          const isLate = (p.status === 'Ordered' || p.status === 'Shipped' || p.status === 'Backordered') && p.eta && daysBetween(todayStr, p.eta) < 0;
          const stepIdx = PART_STAGES.indexOf(p.status);
          const tone = isLate ? 'rb-part-card--late' : p.status === 'Arrived' || p.status === 'Installed' ? 'rb-part-card--arrived' : p.status === 'Shipped' ? 'rb-part-card--shipped' : '';
          return html`
            <article class="rb-part-card ${tone}" data-key="pt-${p.id}">
              <div class="rb-part-card__top">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="rb-code">${p.ticket_code || '#' + p.repair_job_id}</span>
                    <span>${p.part_name}</span>
                    <span class="tk-tag ${PART_TAG[p.status] || ''}">${p.status}</span>
                    ${isLate ? html`<span class="tk-tag tk-tag--bad">Late ETA</span>` : ''}
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Device: <strong>${p.brand || ''} ${p.model || ''}</strong> (${p.customer_name || ''})</span>
                    ${p.supplier ? html`<span>Supplier: ${p.supplier}</span>` : ''}
                    <span>Cost: <strong>${money(p.cost_cents || 0, { currency })}</strong></span>
                    ${p.eta ? html`<span>ETA: ${fmtDay(p.eta)}</span>` : ''}
                    ${p.tracking ? html`<span class="part-track">Track: ${p.tracking}</span>` : ''}
                  </div>
                </div>
                <div class="tk-row__aside">
                  ${NEXT_PART[p.status] ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="part-status" data-id="${p.id}" data-status="${NEXT_PART[p.status]}">
                      Mark ${NEXT_PART[p.status]} →
                    </button>` : ''}
                  ${p.tracking ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-tracking" data-val="${p.tracking}">${icon('copy', { size: 13 })} Track</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="part-del" data-id="${p.id}">Delete</button>
                </div>
              </div>
              <div class="rb-part-steps" aria-label="Part supply stage">
                ${PART_STAGES.map((st, idx) => html`
                  <div class="${cls('rb-part-step', { 'is-done': idx < stepIdx || (p.status === 'Installed' && idx === 3), 'is-now': idx === stepIdx && p.status !== 'Installed' })}">
                    ${idx < stepIdx || (p.status === 'Installed' && idx === 3) ? '✓' : `${idx + 1}.`} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'box', title: 'No parts orders matching filter', text: 'Log parts ordered for bench tickets to track ETAs and supplier costs.' })}</section>`}`;
}

export function wirePartsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="parts-filter"]', (e, el) => { state.partsFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="copy-tracking"]', (e, el) => {
    copyText(el.dataset.val || '', { title: 'Tracking Number', done: 'Tracking # copied.' });
  });

  on(root, 'click', '[data-action="part-status"]', async (e, el) => {
    try {
      const res = await api.post('/api/parts/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(res.jobAdvanced ? `Part marked ${el.dataset.status} · Linked repair job moved to Repairing!` : `Part marked ${el.dataset.status}.`);
      await loadScreen('/parts');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="part-new"]', async () => {
    if (!state.jobs.length) { toast.error('Open a repair job first before ordering a part.'); return; }
    const made = await formDialog({
      title: 'Order Replacement Part',
      submitLabel: 'Log parts order',
      fields: html`
        <label class="k-field"><span class="k-field__label">Linked Repair Job</span>
          <select class="k-input" name="repair_job_id" required>
            ${state.jobs.map((j) => html`<option value="${j.id}">${j.ticket_code} · ${j.brand} ${j.model} (${j.customer_name})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Part Name</span><input class="k-input" name="part_name" placeholder="e.g. OLED Screen Assembly" required></label>
          <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" placeholder="e.g. MobileParts Wholesale"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" placeholder="65.00"></label>
          <label class="k-field"><span class="k-field__label">Tracking / Order #</span><input class="k-input tk-mono" name="tracking" placeholder="AUSP-123456"></label>
          <label class="k-field"><span class="k-field__label">ETA</span><input class="k-input" type="date" name="eta" value="${addDays(today(), 2)}"></label>
        </div>`,
      onSubmit: (vals) => api.post('/api/parts', vals),
    });
    if (made) { toast.success('Parts order logged.'); await loadScreen('/parts'); }
  });

  on(root, 'click', '[data-action="part-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete parts order?', message: 'Remove this parts order record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/parts', { id: Number(el.dataset.id) }); toast.success('Parts order deleted.'); await loadScreen('/parts'); }
    catch (err) { toastError(err); }
  });
}
