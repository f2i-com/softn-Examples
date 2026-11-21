// Payments & Deposits Ledger (Collection Rate Ring, status filters & 1-click settlement)
// + Incidents & Damage Reports (Bond Exposure Masthead & 4-Stage Claim Stepper Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';

const PAY_METHODS = ['Bank transfer', 'Card', 'Cash', 'Invoice'];
const PAY_STATUSES = ['Paid', 'Deposit', 'Pending', 'Refunded'];
const PAY_TAG = { Paid: 'tk-tag--ok', Deposit: 'tk-tag--info', Pending: 'tk-tag--warn', Refunded: 'tk-tag--bad' };

const INC_TYPES = ['Damage', 'Noise complaint', 'Overstay', 'Cleaning issue', 'Safety'];
const INC_STAGES = ['Reported', 'Assessing', 'Invoiced', 'Closed'];
const INC_NEXT = { Reported: 'Assessing', Assessing: 'Invoiced', Invoiced: 'Closed' };
const INC_TAG = { Reported: 'tk-tag--bad', Assessing: 'tk-tag--warn', Invoiced: 'tk-tag--info', Closed: 'tk-tag--ok' };
const INC_TONE = { Reported: '', Assessing: 'vo-inc-card--assessing', Invoiced: 'vo-inc-card--invoiced', Closed: 'vo-inc-card--closed' };

export function renderPaymentsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const collected = state.payments.filter((p) => p.status === 'Paid' || p.status === 'Deposit').reduce((s, p) => s + Number(p.amount_cents), 0);
  const pending = state.payments.filter((p) => p.status === 'Pending').reduce((s, p) => s + Number(p.amount_cents), 0);
  const totalBilled = collected + pending;
  const colPct = totalBilled > 0 ? Math.round((collected / totalBilled) * 100) : 100;

  const filter = state.payFilter || 'All';
  const rows = filter === 'All' ? state.payments : state.payments.filter((p) => p.status === filter);
  const countBy = (st) => state.payments.filter((p) => p.status === st).length;

  return html`
    <section class="vo-masthead" aria-label="Payments & Deposits Ledger">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          ${icon('dollar', { size: 12 })} DEPOSITS, HIRE FEES &amp; SETTLEMENTS
        </div>
        <h1 class="vo-masthead__title">Payments Ledger</h1>
        <div class="vo-masthead__meta">
          <span>Once payments cover a booking's hire fee, the booking automatically marks Paid</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="vo-pod vo-pod--ring vo-pod--gold" aria-label="Collection rate ${colPct}%">
          <div class="tk-ring" style="--p:${colPct}%;--ring-color:${colPct >= 80 ? '#34d399' : '#e8b956'};--ring-size:48px">
            <span class="tk-ring__val">${colPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="vo-pod__lbl">Collected</span>
            <span class="vo-pod__val" style="font-size:16.5px">${money(collected, { currency })}</span>
            <span class="vo-pod__sub">${state.payments.length} ledger entr${state.payments.length === 1 ? 'y' : 'ies'}</span>
          </div>
        </div>

        <div class="${cls('vo-pod', { 'vo-pod--alert': pending > 0 })}">
          <span class="vo-pod__lbl">${icon('clock', { size: 12 })} Pending</span>
          <span class="vo-pod__val">${money(pending, { currency })}</span>
          <span class="vo-pod__sub">${countBy('Pending')} invoice${countBy('Pending') === 1 ? '' : 's'} due</span>
        </div>

        <button type="button" class="k-btn k-btn--primary" data-action="pay-new">${icon('plus', { size: 15 })} Record Payment</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter payments by status">
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'All' })}" data-action="pay-filter" data-filter="All">All (${state.payments.length})</button>
        ${PAY_STATUSES.map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': filter === st })}" data-action="pay-filter" data-filter="${st}">${st} (${countBy(st)})</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.payments.length ? skeleton(3) : rows.length ? rows.map((p) => html`
        <div class="tk-row" data-key="pm-${p.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span class="vo-ref">${p.booking_ref}</span>
              <strong style="font-variant-numeric:tabular-nums">${money(p.amount_cents, { currency })}</strong>
              <span class="tk-tag ${PAY_TAG[p.status] || ''}">${p.status}</span>
              <span class="tk-tag">${p.method}</span>
              ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              <span>${fmtDay(p.payment_date)}</span>
              <span><strong>${p.client_name}</strong> · ${p.space_name}</span>
              ${p.notes ? html`<span>${p.notes}</span>` : ''}
            </div>
          </div>
          <div class="tk-row__aside">
            ${p.status === 'Pending' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="pay-status" data-id="${p.id}" data-status="Paid">Mark Paid ✓</button>` : ''}
            ${p.status === 'Deposit' ? html`<button type="button" class="k-btn k-btn--sm" data-action="pay-status" data-id="${p.id}" data-status="Paid">Mark Paid</button>` : ''}
            ${p.status !== 'Refunded' ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="pay-status" data-id="${p.id}" data-status="Refunded">Refund</button>` : ''}
          </div>
        </div>`) : emptyState({ iconName: 'dollar', title: 'No payments match', text: 'Log deposits or full room-hire payments against any booking.' })}
    </section>`;
}

export function renderIncidentsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const openList = state.incidents.filter((i) => i.status !== 'Closed');
  const closedList = state.incidents.filter((i) => i.status === 'Closed');
  const exposure = openList.reduce((s, i) => s + Number(i.cost_estimate_cents), 0);

  const filter = state.incFilter || 'All';
  const rows = filter === 'Open' ? openList : filter === 'Closed' ? closedList : state.incidents;

  return html`
    <section class="vo-masthead" aria-label="Incidents and Bond Recovery">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          ${icon('shield-check', { size: 12 })} VENUE CONDITION &amp; BOND RECOVERY
        </div>
        <h1 class="vo-masthead__title">Incidents &amp; Damage</h1>
        <div class="vo-masthead__meta">
          <span>Log damage, overstays, noise or cleaning claims tied to bookings</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Track repair quotes through bond closeout</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="${cls('vo-pod', { 'vo-pod--alert': openList.length > 0 })}">
          <span class="vo-pod__lbl">${icon('alert', { size: 12 })} Open Claims</span>
          <span class="vo-pod__val">${openList.length}</span>
          <span class="vo-pod__sub">${closedList.length} resolved</span>
        </div>
        <div class="${cls('vo-pod', exposure > 0 ? 'vo-pod--alert' : 'vo-pod--gold')}">
          <span class="vo-pod__lbl">${icon('dollar', { size: 12 })} Bond Exposure</span>
          <span class="vo-pod__val">${money(exposure, { currency })}</span>
          <span class="vo-pod__sub">Open repair est.</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="inc-new">${icon('plus', { size: 15 })} Log Incident</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter incidents">
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'All' })}" data-action="inc-filter" data-filter="All">All (${state.incidents.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'Open' })}" data-action="inc-filter" data-filter="Open">Open (${openList.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'Closed' })}" data-action="inc-filter" data-filter="Closed">Closed (${closedList.length})</button>
      </div>
    </div>

    ${state.loading && !state.incidents.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="vo-inc-list">
        ${rows.map((inc) => {
          const curIdx = INC_STAGES.indexOf(inc.status);
          return html`
            <article class="vo-inc-card ${INC_TONE[inc.status] || ''}" data-key="inc-${inc.id}">
              <div class="vo-inc-card__top">
                <div style="display:grid;gap:6px;min-width:0;flex:1">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                    ${inc.booking_ref ? html`<span class="vo-ref">${inc.booking_ref}</span>` : ''}
                    <span class="tk-tag tk-tag--accent">${inc.incident_type}</span>
                    <strong style="font-size:15.5px">${inc.space_name || 'General Venue'}</strong>
                    <span class="tk-tag ${INC_TAG[inc.status] || ''}">${inc.status}</span>
                    ${inc.cost_estimate_cents > 0 ? html`<span class="tk-tag tk-tag--bad">Est. ${money(inc.cost_estimate_cents, { currency })}</span>` : ''}
                    ${inc.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="font-size:13.5px;color:var(--k-text);line-height:1.45">${inc.description}</div>
                  ${inc.client_name ? html`<div class="tk-muted" style="font-size:12.5px">Hirer: <strong>${inc.client_name}</strong></div>` : ''}
                </div>
                <div class="vo-folio__aside">
                  ${INC_NEXT[inc.status] ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inc-status" data-id="${inc.id}" data-status="${INC_NEXT[inc.status]}">
                      Move to ${INC_NEXT[inc.status]} →
                    </button>` : html`<span class="tk-tag tk-tag--ok">Claim Closed ✓</span>`}
                </div>
              </div>
              <div class="vo-inc-steps" aria-label="Claim workflow stage">
                ${INC_STAGES.map((st, idx) => html`
                  <div class="${cls('vo-inc-step', { 'is-done': idx < curIdx || (inc.status === 'Closed' && idx === 3), 'is-now': idx === curIdx && inc.status !== 'Closed' })}">
                    ${idx < curIdx || (inc.status === 'Closed' && idx === 3) ? '✓' : `${idx + 1}.`} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'shield-check', title: 'No incidents match', text: 'Log damage, cleaning issues or overstays tied to a booking here.' })}`;
}

export function wireLedgerActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="pay-filter"]', (e, el) => { state.payFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="inc-filter"]', (e, el) => { state.incFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="pay-new"]', async () => {
    if (!state.bookings.length) { toast.error('Create a booking first.'); return; }
    const currency = state.session.settings.currency || 'AUD';
    const made = await formDialog({
      title: 'Record Booking Payment / Deposit',
      submitLabel: 'Save Payment',
      fields: html`
        <label class="k-field"><span class="k-field__label">Booking</span>
          <select class="k-input" name="booking_id" required>
            ${state.bookings.map((b) => html`<option value="${b.id}">${b.booking_ref} — ${b.client_name} · ${b.space_name} (${money(b.amount_cents, { currency })})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" placeholder="250.00" required></label>
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="payment_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Method</span><select class="k-input" name="method">${PAY_METHODS.map((m) => html`<option value="${m}">${m}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${PAY_STATUSES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Reference #, deposit %, receipt note…"></label>`,
      onSubmit: (v) => api.post('/api/payments', { ...v, booking_id: Number(v.booking_id) }),
    });
    if (made) { toast.success('Payment recorded.'); await loadScreen('/payments'); }
  });

  on(root, 'click', '[data-action="pay-status"]', async (e, el) => {
    try { await api.post('/api/payments/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Payment marked ${el.dataset.status}.`); await loadScreen('/payments'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-new"]', async () => {
    const made = await formDialog({
      title: 'Log Incident / Damage Report',
      submitLabel: 'Submit Report',
      fields: html`
        <label class="k-field"><span class="k-field__label">Linked booking <span class="k-field__optional">optional</span></span>
          <select class="k-input" name="booking_id">
            <option value="">General venue incident</option>
            ${state.bookings.map((b) => html`<option value="${b.id}">${b.booking_ref} — ${b.space_name} (${b.client_name})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Incident type</span><select class="k-input" name="incident_type">${INC_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Cost estimate</span><input class="k-input" type="number" step="0.01" min="0" name="cost_estimate" value="0.00"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="3" placeholder="What happened, where in the venue, and who was involved…" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/incidents', { ...v, booking_id: v.booking_id ? Number(v.booking_id) : null }),
    });
    if (made) { toast.success('Incident report logged.'); await loadScreen('/incidents'); }
  });

  on(root, 'click', '[data-action="inc-status"]', async (e, el) => {
    try { await api.post('/api/incidents/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Incident moved to ${el.dataset.status}.`); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });
}
