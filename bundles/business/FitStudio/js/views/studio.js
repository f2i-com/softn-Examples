// Trainers Roster (Unified Obsidian-Cobalt-Volt Masthead & Role-Banded Visual Coach Cards)
// + Payments & Packs Ledger (Unified Masthead with Collection Rate Ring & Clean Responsive Rows).
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { money, initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const TRAINER_ROLES = ['Personal trainer', 'Group instructor', 'Physio', 'Nutrition coach'];
const SPECIALTIES = ['Strength', 'HIIT', 'Pilates', 'Yoga', 'Boxing', 'Rehab', 'Nutrition'];
const PAYMENT_TYPES = ['Session pack', 'Membership', 'Casual visit', 'Program fee'];
const PAYMENT_STATUSES = ['Paid', 'Pending', 'Failed'];

function coachThemeClass(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('physio')) return 'fs-coach-card--physio';
  if (r.includes('group')) return 'fs-coach-card--group';
  if (r.includes('nutrition')) return 'fs-coach-card--nutrition';
  return '';
}

function trainerFields(tr = {}) {
  const specs = tr.specialties || [];
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Coach Name</span>
        <input class="k-input" name="name" value="${tr.name || ''}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Role</span>
        <select class="k-input" name="role">${TRAINER_ROLES.map((r) => html`<option value="${r}" ${r === tr.role ? 'selected' : ''}>${r}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${tr.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${tr.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${(tr.active || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${tr.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Specialties</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${SPECIALTIES.map((sp) => html`<label class="k-check"><input type="checkbox" name="specialties" value="${sp}" ${specs.includes(sp) ? 'checked' : ''}><span>${sp}</span></label>`)}
      </div>
    </div>`;
}

export function renderTrainersView(state) {
  const activeCount = state.trainers.filter((tr) => tr.active === 'Active').length;
  const totalUpcoming = state.trainers.reduce((s, tr) => s + Number(tr.upcoming_count || 0), 0);
  const specSet = new Set(state.trainers.flatMap((tr) => tr.specialties || []));

  return html`
    <section class="fs-masthead" aria-label="Coaching Bench">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          ${icon('award', { size: 12 })} COACHING BENCH &amp; SPECIALTIES
        </div>
        <h1 class="fs-masthead__title">Trainers Roster</h1>
        <div class="fs-masthead__meta">
          <span>Coaches, physios &amp; nutrition</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live floor load bars</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--volt">
          <span class="fs-pod__lbl">${icon('award', { size: 12 })} Active</span>
          <span class="fs-pod__val">${activeCount}/${state.trainers.length}</span>
          <span class="fs-pod__sub">On floor</span>
        </div>
        <div class="fs-pod fs-pod--cobalt">
          <span class="fs-pod__lbl">${icon('barbell', { size: 12 })} Upcoming</span>
          <span class="fs-pod__val">${totalUpcoming}</span>
          <span class="fs-pod__sub">Booked sessions</span>
        </div>
        <div class="fs-pod fs-pod--wide-sm">
          <span class="fs-pod__lbl">${icon('zap', { size: 12 })} Disciplines</span>
          <span class="fs-pod__val">${specSet.size}</span>
          <span class="fs-pod__sub">Covered</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="trainer-new">${icon('plus', { size: 15 })} Add Trainer</button>
      </div>
    </section>

    ${state.loading && !state.trainers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.trainers.length ? html`
      <div class="fs-coach-grid">
        ${state.trainers.map((tr) => {
          const load = Number(tr.upcoming_count || 0);
          const loadPct = Math.min(100, Math.round((load / 6) * 100));
          return html`
            <article class="tk-card fs-coach-card ${coachThemeClass(tr.role)}" data-key="tr-${tr.id}">
              <div class="fs-coach-card__head">
                <div class="coach-head">
                  <span class="coach-avatar">${initials(tr.name)}</span>
                  <div style="min-width:0">
                    <div class="tk-card__title">${tr.name}</div>
                    <div class="tk-card__sub">${tr.role}</div>
                  </div>
                </div>
                <span class="tk-tag ${tr.active === 'Active' ? 'tk-tag--ok' : ''}">${tr.active}</span>
              </div>
              <div class="fs-coach-card__body">
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(tr.specialties || []).map((sp) => html`<span class="fs-volt-tag">${sp}</span>`)}
                </div>
                <div style="display:grid;gap:4px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:750">
                    <span class="tk-muted">Upcoming Floor Load</span>
                    <span style="font-variant-numeric:tabular-nums">${load} session${load === 1 ? '' : 's'}</span>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${load >= 5 ? 'tk-bar__fill--warn' : ''}" style="width:${loadPct}%"></div></div>
                </div>
                <div style="display:grid;gap:4px;font-size:12.5px;color:var(--k-muted)">
                  ${tr.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} <span>${tr.phone}</span></div>` : ''}
                  ${tr.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 13 })} <span style="overflow:hidden;text-overflow:ellipsis">${tr.email}</span></div>` : ''}
                </div>
                <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                  <button type="button" class="k-btn k-btn--sm" data-action="trainer-toggle" data-id="${tr.id}" data-active="${tr.active === 'Active' ? 'Inactive' : 'Active'}">
                    ${tr.active === 'Active' ? 'Set Inactive' : 'Set Active'}
                  </button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="trainer-edit" data-id="${tr.id}">Edit</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'award', title: 'No trainers added yet', text: 'Add coaches to start booking sessions.' })}</section>`}`;
}

export function renderPaymentsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const sum = state.paymentSummary || { paidMonthCents: 0, paidTotalCents: 0, pendingTotalCents: 0, failedCount: 0, month: today().slice(0, 7) };
  const totalVol = Number(sum.paidTotalCents || 0) + Number(sum.pendingTotalCents || 0);
  const colPct = totalVol > 0 ? Math.round((Number(sum.paidTotalCents || 0) / totalVol) * 100) : 100;

  const rows = state.paymentStatusFilter === 'All'
    ? state.payments
    : state.payments.filter((p) => p.status === state.paymentStatusFilter);
  const countBy = (st) => state.payments.filter((p) => p.status === st).length;

  return html`
    <section class="fs-masthead" aria-label="Payments and Packs Ledger">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          ${icon('dollar', { size: 12 })} STUDIO REVENUE &amp; PACKS · ${sum.month}
        </div>
        <h1 class="fs-masthead__title">Payments &amp; Packs</h1>
        <div class="fs-masthead__meta">
          <span>Packs, memberships &amp; visits</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click receipts</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--ring fs-pod--volt" aria-label="Collection rate ${colPct}%">
          <div class="tk-ring" style="--p:${colPct}%;--ring-color:${colPct >= 80 ? '#a3e635' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${colPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="fs-pod__lbl">Collected</span>
            <span class="fs-pod__val" style="font-size:16.5px">${money(sum.paidTotalCents, { currency })}</span>
            <span class="fs-pod__sub">${state.payments.length} entries</span>
          </div>
        </div>

        <div class="fs-pod fs-pod--cobalt">
          <span class="fs-pod__lbl">${icon('trending', { size: 12 })} This Month</span>
          <span class="fs-pod__val">${money(sum.paidMonthCents, { currency })}</span>
          <span class="fs-pod__sub">${sum.month}</span>
        </div>

        <div class="${cls('fs-pod', { 'fs-pod--alert': sum.pendingTotalCents > 0 })}">
          <span class="fs-pod__lbl">${icon('clock', { size: 12 })} Pending</span>
          <span class="fs-pod__val">${money(sum.pendingTotalCents, { currency })}</span>
          <span class="fs-pod__sub">${countBy('Pending')} due</span>
        </div>

        <div class="${cls('fs-pod fs-pod--wide-sm', { 'fs-pod--alert': sum.failedCount > 0 })}">
          <span class="fs-pod__lbl">${icon('alert', { size: 12 })} Failed</span>
          <span class="fs-pod__val">${sum.failedCount}</span>
          <span class="fs-pod__sub">Retry billing</span>
        </div>

        <button type="button" class="k-btn k-btn--primary" data-action="payment-new">${icon('plus', { size: 15 })} Record Payment</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter payments by status">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.paymentStatusFilter === 'All' })}" data-action="payment-filter" data-status="All">All (${state.payments.length})</button>
        ${['Paid', 'Pending', 'Failed'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.paymentStatusFilter === st })}" data-action="payment-filter" data-status="${st}">${st} (${countBy(st)})</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.payments.length ? skeleton(3) : rows.length ? rows.map((py) => html`
        <div class="tk-row" data-key="py-${py.id}">
          <div style="display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1">
            <span class="fs-monogram">${initials(py.client_name || 'C')}</span>
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${py.client_name}</span>
                <strong style="font-variant-numeric:tabular-nums">${money(py.amount_cents, { currency })}</strong>
                <span class="tk-tag ${py.status === 'Paid' ? 'tk-tag--ok' : py.status === 'Pending' ? 'tk-tag--warn' : 'tk-tag--bad'}">${py.status}</span>
                <span class="tk-tag tk-tag--accent">${py.payment_type}</span>
                ${py.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                <span>${fmtDay(py.payment_date)}</span>
                ${py.notes ? html`<span>${py.notes}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="tk-row__aside">
            ${py.status !== 'Paid' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="payment-paid" data-id="${py.id}">Mark Paid ✓</button>` : ''}
            <button type="button" class="k-btn k-btn--sm" data-action="payment-receipt" data-id="${py.id}">${icon('printer', { size: 14 })} Receipt</button>
          </div>
        </div>`) : emptyState({ iconName: 'dollar', title: 'No payments recorded yet', text: 'Log a session pack, membership or casual visit payment.' })}
    </section>`;
}

export function wireStudioActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="payment-filter"]', (e, el) => { state.paymentStatusFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="trainer-new"]', async () => {
    const made = await formDialog({
      title: 'Add Trainer / Coach',
      submitLabel: 'Add to roster',
      size: 'lg',
      fields: trainerFields(),
      onSubmit: (vals) => api.post('/api/trainers', { ...vals, specialties: Array.isArray(vals.specialties) ? vals.specialties : [] }),
    });
    if (made) { toast.success('Trainer added.'); await loadScreen('/trainers'); }
  });

  on(root, 'click', '[data-action="trainer-edit"]', async (e, el) => {
    const tr = state.trainers.find((x) => String(x.id) === el.dataset.id);
    if (!tr) return;
    const saved = await formDialog({
      title: `Edit ${tr.name}`,
      submitLabel: 'Save trainer',
      size: 'lg',
      fields: trainerFields(tr),
      onSubmit: (vals) => api.put('/api/trainers', { ...vals, id: tr.id, specialties: Array.isArray(vals.specialties) ? vals.specialties : [] }),
    });
    if (saved) { toast.success('Trainer updated.'); await loadScreen('/trainers'); }
  });

  on(root, 'click', '[data-action="trainer-toggle"]', async (e, el) => {
    try { await api.put('/api/trainers', { id: Number(el.dataset.id), active: el.dataset.active }); toast.success('Trainer status updated.'); await loadScreen('/trainers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="payment-new"]', async () => {
    if (!state.clients.length) { toast.error('Add a client first.'); return; }
    const made = await formDialog({
      title: 'Record Client Payment',
      submitLabel: 'Save payment',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" placeholder="320.00" required></label>
          <label class="k-field"><span class="k-field__label">Type</span>
            <select class="k-input" name="payment_type">${PAYMENT_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="payment_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">${PAYMENT_STATUSES.map((s) => html`<option value="${s}">${s}</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" placeholder="e.g. 10-session PT pack"></label>`,
      onSubmit: (vals) => api.post('/api/payments', vals),
    });
    if (made) { toast.success('Payment recorded.'); await loadScreen('/payments'); }
  });

  on(root, 'click', '[data-action="payment-paid"]', async (e, el) => {
    try { await api.post('/api/payments/status', { id: Number(el.dataset.id), status: 'Paid' }); toast.success('Payment marked Paid.'); await loadScreen('/payments'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="payment-receipt"]', (e, el) => {
    const py = state.payments.find((x) => String(x.id) === el.dataset.id);
    if (!py) return;
    const cur = state.session.settings.currency || 'AUD';
    const settings = state.session.settings;
    downloadHtmlDoc(`receipt-${py.id}-${py.payment_date}.html`, {
      title: `Payment Receipt #${py.id}`,
      businessName: settings.business_name,
      subtitle: `${settings.address || ''}${settings.tax_id ? ' · Tax ID: ' + settings.tax_id : ''}`,
      accent: '#1d4ed8',
      bodyHtml: `<table>
        <tr><th>Client</th><td><strong>${esc(py.client_name)}</strong></td></tr>
        <tr><th>Date</th><td>${esc(fmtDay(py.payment_date))}</td></tr>
        <tr><th>Description</th><td>${esc(py.payment_type)}${py.notes ? ' — ' + esc(py.notes) : ''}</td></tr>
        <tr><th>Status</th><td>${esc(py.status)}</td></tr>
        <tr class="total-row"><td>Total Amount</td><td class="num">${esc(money(py.amount_cents, { currency: cur }))}</td></tr>
      </table>`,
    });
  });
}
