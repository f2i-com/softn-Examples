// Returns & Exchanges Desk (3-Stage Stepper Cards), Monogrammed Suppliers Directory & Weekly Staff Roster.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const PAY_TERMS = ['Prepaid', 'COD', 'Net 7', 'Net 30', 'Net 60'];
const STAFF_ROLES = ['Store manager', 'Sales assistant', 'Visual merchandiser', 'Online orders'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ISSUE_TYPES = ['Return', 'Exchange', 'Fault', 'Complaint'];
const RES_TYPES = ['Refund', 'Exchange', 'Store credit', 'Pending'];
const RET_STATUSES = ['Open', 'Processing', 'Resolved', 'Declined'];
const RET_STEPS = ['Open', 'Processing', 'Resolved'];

// ---- Returns & Exchanges Desk ----

export function renderReturnsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const rows = state.returns.filter((r) => {
    if (state.retStatus !== 'All' && r.status !== state.retStatus) return false;
    if (state.retType !== 'All' && r.issue_type !== state.retType) return false;
    return true;
  });
  const openCount = state.returns.filter((r) => r.status === 'Open' || r.status === 'Processing').length;
  const totalValue = state.returns.filter((r) => r.status !== 'Declined').reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  const restockedCount = state.returns.filter((r) => r.restocked).length;

  return html`
    <section class="cf-masthead" aria-label="Returns & Exchanges Desk">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('refresh', { size: 12 })} COUNTER CUSTOMER CARE
        </div>
        <h1 class="cf-masthead__title">Returns &amp; Exchanges</h1>
        <div class="cf-masthead__meta">
          <span>Refunds, size exchanges, store credits &amp; supplier claims</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click shelf restock to Stock Ledger</span>
        </div>
      </div>

      <div class="cf-masthead__pods" style="align-items:center">
        <div class="${cls('cf-pod', { 'cf-pod--alert': openCount > 0, 'cf-pod--good': !openCount })}">
          <span class="cf-pod__lbl">Open Cases</span>
          <span class="cf-pod__val">${openCount}</span>
          <span class="cf-pod__sub">${openCount ? 'Needs resolution' : 'Desk clear'}</span>
        </div>
        <div class="cf-pod cf-pod--gold">
          <span class="cf-pod__lbl">Case Value</span>
          <span class="cf-pod__val">${money(totalValue, { currency: cur })}</span>
          <span class="cf-pod__sub">${state.returns.length} logged</span>
        </div>
        <div class="cf-pod cf-pod--good">
          <span class="cf-pod__lbl">Restocked</span>
          <span class="cf-pod__val">${restockedCount}</span>
          <span class="cf-pod__sub">Returned to shelf</span>
        </div>
        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="ret-new">${icon('plus', { size: 15 })} Log Return</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by return status">
        ${['All', 'Open', 'Processing', 'Resolved', 'Declined'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.retStatus === st })}" data-action="ret-status-filter" data-status="${st}">${st}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Filter by issue type">
        ${['All', ...ISSUE_TYPES].map((tp) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.retType === tp })}" data-action="ret-type-filter" data-type="${tp}">${tp}</button>`)}
      </div>
    </div>

    ${state.loading && !state.returns.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="cf-ret-list">
        ${rows.map((rt) => {
          const tagClass = rt.status === 'Open' ? 'tk-tag--bad' : rt.status === 'Processing' ? 'tk-tag--warn' : rt.status === 'Resolved' ? 'tk-tag--ok' : '';
          const cardMod = rt.status === 'Processing' ? 'cf-ret-card--processing' : rt.status === 'Resolved' ? 'cf-ret-card--resolved' : rt.status === 'Declined' ? 'cf-ret-card--declined' : '';
          const stepIdx = RET_STEPS.indexOf(rt.status);
          return html`
            <article class="cf-ret-card ${cardMod}" data-key="rt-${rt.id}">
              <div class="cf-ret-card__top">
                <div style="display:grid;gap:5px;min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:15px;font-weight:750">
                    <span>${rt.customer_name}</span>
                    <span class="tk-tag ${tagClass}">${rt.status}</span>
                    <span class="tk-tag tk-tag--accent">${rt.issue_type}</span>
                    <span class="tk-tag tk-tag--info">${rt.resolution_type}</span>
                    ${rt.restocked ? html`<span class="tk-tag tk-tag--ok">Restocked +1</span>` : ''}
                    ${rt.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>${rt.sku ? html`<span class="cf-sku">${rt.sku}</span> ` : ''}${rt.product_name}</span>
                    <span><strong style="color:var(--k-text)">${money(rt.amount_cents, { currency: cur })}</strong></span>
                    <span>${fmtDay(rt.issue_date)}</span>
                  </div>
                  ${rt.notes ? html`<div class="tk-muted" style="font-size:13px">${rt.notes}</div>` : ''}
                </div>
                <div class="tk-btn-row">
                  ${rt.status === 'Open' ? html`<button type="button" class="k-btn k-btn--sm" data-action="ret-set-status" data-id="${rt.id}" data-status="Processing">Process</button>` : ''}
                  ${rt.status !== 'Resolved' && rt.status !== 'Declined' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="ret-set-status" data-id="${rt.id}" data-status="Resolved">Resolve</button>
                    ${!rt.restocked && rt.product_id ? html`<button type="button" class="k-btn k-btn--sm" data-action="ret-resolve-restock" data-id="${rt.id}">Resolve &amp; +1 Stock</button>` : ''}
                  ` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="ret-receipt" data-id="${rt.id}">${icon('printer', { size: 14 })} Slip</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="ret-edit" data-id="${rt.id}">Edit</button>
                </div>
              </div>
              ${rt.status !== 'Declined' ? html`
                <div class="cf-ret-steps" aria-label="Case progress">
                  ${RET_STEPS.map((st, idx) => html`
                    <div class="${cls('cf-ret-step', { 'is-done': idx < stepIdx || (st === 'Resolved' && rt.status === 'Resolved'), 'is-now': idx === stepIdx && rt.status !== 'Resolved' })}">
                      ${idx < stepIdx || (st === 'Resolved' && rt.status === 'Resolved') ? icon('check', { size: 12 }) : ''}
                      <span>${idx + 1}. ${st}</span>
                    </div>`)}
                </div>` : ''}
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'refresh', title: 'No returns or issues matching filter', text: 'Log customer returns, exchanges, store credits or faulty stock claims right at the counter.' })}</section>`}`;
}

// ---- Suppliers Directory ----

export function renderSuppliersView(state) {
  const avgLead = state.suppliers.length
    ? Math.round(state.suppliers.reduce((s, x) => s + Number(x.lead_time_days || 0), 0) / state.suppliers.length)
    : 0;
  const needReorder = state.suppliers.filter((s) => Number(s.low_sku_count || 0) > 0).length;

  return html`
    <section class="cf-masthead" aria-label="Suppliers Directory">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('truck', { size: 12 })} WHOLESALE TRADE PARTNERS
        </div>
        <h1 class="cf-masthead__title">Suppliers Directory</h1>
        <div class="cf-masthead__meta">
          <span>Account reps, trade terms &amp; lead times in one place</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click supplier reorder messages</span>
        </div>
      </div>

      <div class="cf-masthead__pods" style="align-items:center">
        <div class="cf-pod">
          <span class="cf-pod__lbl">Suppliers</span>
          <span class="cf-pod__val">${state.suppliers.length}</span>
          <span class="cf-pod__sub">Active accounts</span>
        </div>
        <div class="cf-pod cf-pod--gold">
          <span class="cf-pod__lbl">Avg Lead</span>
          <span class="cf-pod__val">${avgLead}d</span>
          <span class="cf-pod__sub">Delivery window</span>
        </div>
        <div class="${cls('cf-pod', { 'cf-pod--alert': needReorder > 0, 'cf-pod--good': !needReorder })}">
          <span class="cf-pod__lbl">Reorder Due</span>
          <span class="cf-pod__val">${needReorder}</span>
          <span class="cf-pod__sub">${needReorder ? 'With low SKUs' : 'All stocked'}</span>
        </div>
        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="sup-new">${icon('plus', { size: 15 })} Add Supplier</button>
        </div>
      </div>
    </section>

    ${state.loading && !state.suppliers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.suppliers.length ? html`
      <div class="cf-partner-grid">
        ${state.suppliers.map((s) => html`
          <article class="cf-partner-card" data-key="sup-${s.id}">
            <div class="cf-partner-head">
              <div class="cf-avatar-sq">${initials(s.supplier_name)}</div>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <h2 class="tk-card__title" style="font-size:15.5px">${s.supplier_name}</h2>
                  ${s.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-card__sub">${s.contact_person || 'Primary trade account'}</div>
              </div>
              <span class="tk-tag tk-tag--accent">${s.payment_terms}</span>
            </div>
            <div class="cf-stat-pair">
              <div>
                <div class="cf-stat-pair__k">Lead Time</div>
                <div class="cf-stat-pair__v">${s.lead_time_days} days</div>
              </div>
              <div>
                <div class="cf-stat-pair__k">Catalogue SKUs</div>
                <div class="cf-stat-pair__v">${s.sku_count || 0}${s.low_sku_count > 0 ? html` <span class="tk-tag tk-tag--warn">${s.low_sku_count} low</span>` : ''}</div>
              </div>
            </div>
            <div class="tk-row__meta">
              ${s.phone ? html`<span>${icon('phone', { size: 13 })} ${s.phone}</span>` : ''}
              ${s.email ? html`<span>${icon('mail', { size: 13 })} ${s.email}</span>` : ''}
            </div>
            ${s.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${s.notes}</p>` : ''}
            <div class="tk-btn-row" style="padding-top:9px;border-top:1px solid var(--k-border)">
              ${s.low_sku_count > 0 ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sup-copy-order" data-id="${s.id}">${icon('copy', { size: 13 })} Copy Reorder</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="sup-edit" data-id="${s.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sup-del" data-id="${s.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'truck', title: 'No suppliers added yet', text: 'Keep wholesale reps, minimum order notes and lead times one tap away.' })}</section>`}`;
}

// ---- Staff Roster ----

export function renderStaffView(state) {
  const activeStaff = state.staff.filter((s) => s.active === 'Active');
  const dayCounts = WEEKDAYS.map((d) => activeStaff.filter((s) => (s.usual_days || []).includes(d)).length);
  const thinDays = dayCounts.filter((c) => c < 2).length;

  return html`
    <section class="cf-masthead" aria-label="Staff Roster & Weekly Coverage">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('users', { size: 12 })} FLOOR TEAM &amp; ROSTER COVERAGE
        </div>
        <h1 class="cf-masthead__title">Staff Roster</h1>
        <div class="cf-masthead__meta">
          <span>Manage roles, contact details &amp; trading day coverage</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Amber days flag under 2 staff on floor</span>
        </div>
      </div>

      <div class="cf-masthead__pods" style="align-items:center">
        <div class="cf-pod cf-pod--good">
          <span class="cf-pod__lbl">Active Staff</span>
          <span class="cf-pod__val">${activeStaff.length}</span>
          <span class="cf-pod__sub">Of ${state.staff.length} on roster</span>
        </div>
        <div class="${cls('cf-pod', { 'cf-pod--alert': thinDays > 0, 'cf-pod--gold': !thinDays })}">
          <span class="cf-pod__lbl">Thin Days</span>
          <span class="cf-pod__val">${thinDays}</span>
          <span class="cf-pod__sub">${thinDays ? 'Under 2 staff' : 'Full week covered'}</span>
        </div>
        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="stf-new">${icon('plus', { size: 15 })} Add Staff</button>
        </div>
      </div>
    </section>

    <div class="cf-coverage-grid">
      ${WEEKDAYS.map((d, i) => html`
        <div class="cf-cov-cell ${dayCounts[i] < 2 ? 'cf-cov-cell--thin' : ''}">
          <span class="cf-cov-cell__day">${DAY_SHORT[i]}</span>
          <span class="cf-cov-cell__num">${dayCounts[i]}</span>
          <span class="tk-muted" style="font-size:11px">${dayCounts[i] === 1 ? '1 on floor' : `${dayCounts[i]} on floor`}</span>
        </div>`)}
    </div>

    ${state.loading && !state.staff.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.staff.length ? html`
      <div class="cf-partner-grid">
        ${state.staff.map((st) => html`
          <article class="cf-partner-card" data-key="stf-${st.id}">
            <div class="cf-partner-head">
              <div class="cf-avatar-sq">${initials(st.name)}</div>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <h2 class="tk-card__title" style="font-size:15.5px">${st.name}</h2>
                  ${st.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:3px">
                  <span class="tk-tag tk-tag--accent">${st.role}</span>
                  <span class="tk-tag ${st.active === 'Active' ? 'tk-tag--ok' : ''}">${st.active}</span>
                </div>
              </div>
            </div>
            <div class="cf-days">
              ${WEEKDAYS.map((d, i) => html`<span class="cf-day-chip ${(st.usual_days || []).includes(d) ? 'cf-day-chip--on' : ''}">${DAY_SHORT[i]}</span>`)}
            </div>
            <div class="tk-row__meta">
              ${st.phone ? html`<span>${icon('phone', { size: 13 })} ${st.phone}</span>` : ''}
              ${st.email ? html`<span>${icon('mail', { size: 13 })} ${st.email}</span>` : ''}
            </div>
            ${st.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${st.notes}</p>` : ''}
            <div class="tk-btn-row" style="padding-top:9px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="stf-edit" data-id="${st.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="stf-del" data-id="${st.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No staff on the roster yet', text: 'Add store managers, sales assistants and merchandisers with their usual trading days.' })}</section>`}`;
}

export function wirePeopleActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="ret-status-filter"]', (e, el) => { state.retStatus = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="ret-type-filter"]', (e, el) => { state.retType = el.dataset.type; draw(); });

  const returnFields = (r = {}, isNew = false) => html`
    <label class="k-field"><span class="k-field__label">Product</span>
      <select class="k-input" name="product_id" ${isNew ? 'required' : 'disabled'}>
        ${state.products.map((p) => html`<option value="${p.id}" ${String(p.id) === String(r.product_id || '') ? 'selected' : ''}>[${p.sku}] ${p.product_name}</option>`)}
      </select>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer name</span>
        <input class="k-input" name="customer_name" value="${r.customer_name || ''}" placeholder="Who brought it back">
      </label>
      <label class="k-field"><span class="k-field__label">Date</span>
        <input class="k-input" type="date" name="issue_date" value="${r.issue_date || today()}" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Issue type</span>
        <select class="k-input" name="issue_type">${ISSUE_TYPES.map((t) => html`<option value="${t}" ${t === (r.issue_type || 'Return') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Resolution</span>
        <select class="k-input" name="resolution_type">${RES_TYPES.map((t) => html`<option value="${t}" ${t === (r.resolution_type || 'Refund') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Amount</span>
        <input class="k-input" type="number" step="0.01" min="0" name="amount" value="${r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ''}" placeholder="Auto from retail price">
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${RET_STATUSES.map((s) => html`<option value="${s}" ${s === (r.status || 'Open') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
    </div>
    ${isNew ? html`
      <label class="k-check">
        <input type="checkbox" name="restock">
        <span><strong>Restock +1 unit back into inventory</strong> (also writes a Return movement to the Stock Ledger).</span>
      </label>` : ''}
    <label class="k-field"><span class="k-field__label">Notes</span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Condition, receipt #, credit voucher code…">${r.notes || ''}</textarea>
    </label>`;

  on(root, 'click', '[data-action="ret-new"]', async () => {
    if (!state.products.length) { toast.error('Add a product first before logging a return.'); return; }
    const made = await formDialog({
      title: 'Log Return or Exchange',
      submitLabel: 'Save return case',
      fields: returnFields({}, true),
      onSubmit: (v) => api.post('/api/returns', v),
    });
    if (made) { toast.success('Return case logged.'); await loadScreen('/returns'); }
  });

  on(root, 'click', '[data-action="ret-edit"]', async (e, el) => {
    const rt = state.returns.find((x) => String(x.id) === el.dataset.id);
    if (!rt) return;
    const saved = await formDialog({
      title: `Edit Case · ${rt.customer_name}`,
      submitLabel: 'Save case',
      fields: returnFields(rt, false),
      onSubmit: (v) => api.put('/api/returns', { ...v, id: rt.id }),
    });
    if (saved) { toast.success('Return case updated.'); await loadScreen('/returns'); }
  });

  on(root, 'click', '[data-action="ret-set-status"]', async (e, el) => {
    try {
      await api.post('/api/returns/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Case marked ${el.dataset.status}.`);
      await loadScreen('/returns');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ret-resolve-restock"]', async (e, el) => {
    try {
      await api.post('/api/returns/status', { id: Number(el.dataset.id), status: 'Resolved', restock: true });
      toast.success('Case resolved and +1 unit restocked to shelf.');
      await loadScreen('/returns');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ret-receipt"]', (e, el) => {
    const rt = state.returns.find((x) => String(x.id) === el.dataset.id);
    if (!rt) return;
    const cur = state.session.settings.currency || 'AUD';
    downloadHtmlDoc(`return-slip-${rt.id}.html`, {
      title: `${rt.issue_type} Slip #${rt.id}`,
      businessName: state.session.settings.business_name,
      subtitle: `${rt.issue_date} · Status: ${rt.status}`,
      accent: '#c84b24',
      bodyHtml: `<table>
        <tr><th>Customer</th><td>${esc(rt.customer_name)}</td></tr>
        <tr><th>Product</th><td>${esc(rt.sku ? `[${rt.sku}] ` : '')}${esc(rt.product_name)}</td></tr>
        <tr><th>Issue / Resolution</th><td>${esc(rt.issue_type)} — ${esc(rt.resolution_type)}</td></tr>
        <tr><th>Amount</th><td class="num"><strong>${esc(money(rt.amount_cents, { currency: cur }))}</strong></td></tr>
        <tr><th>Inventory Restocked</th><td>${rt.restocked ? 'Yes (+1 returned to shelf)' : 'No'}</td></tr>
      </table>
      ${rt.notes ? `<div class="box"><strong>Notes:</strong> ${esc(rt.notes)}</div>` : ''}`,
    });
  });

  const supplierFields = (s = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Supplier name</span><input class="k-input" name="supplier_name" value="${s.supplier_name || ''}" placeholder="e.g. Harbour Lane Wholesale" required></label>
      <label class="k-field"><span class="k-field__label">Contact person</span><input class="k-input" name="contact_person" value="${s.contact_person || ''}" placeholder="Account rep"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${s.email || ''}" placeholder="orders@supplier.com"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${s.phone || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Lead time (days)</span><input class="k-input" type="number" min="0" max="365" name="lead_time_days" value="${s.lead_time_days ?? 7}"></label>
      <label class="k-field"><span class="k-field__label">Payment terms</span>
        <select class="k-input" name="payment_terms">${PAY_TERMS.map((t) => html`<option value="${t}" ${t === (s.payment_terms || 'Net 30') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Website <span class="k-field__optional">optional</span></span><input class="k-input" name="website" value="${s.website || ''}" placeholder="https://supplier.com"></label>
    <label class="k-field"><span class="k-field__label">Trade notes <span class="k-field__optional">optional</span></span><textarea class="k-input" name="notes" rows="2" placeholder="Minimum order, freight free threshold…">${s.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="sup-new"]', async () => {
    const made = await formDialog({ title: 'Add Supplier', submitLabel: 'Save supplier', fields: supplierFields(), onSubmit: (v) => api.post('/api/suppliers', v) });
    if (made) { toast.success('Supplier added.'); await loadScreen('/suppliers'); }
  });

  on(root, 'click', '[data-action="sup-edit"]', async (e, el) => {
    const sup = state.suppliers.find((x) => String(x.id) === el.dataset.id);
    if (!sup) return;
    const saved = await formDialog({ title: `Edit ${sup.supplier_name}`, submitLabel: 'Save supplier', fields: supplierFields(sup), onSubmit: (v) => api.put('/api/suppliers', { ...v, id: sup.id }) });
    if (saved) { toast.success('Supplier updated.'); await loadScreen('/suppliers'); }
  });

  on(root, 'click', '[data-action="sup-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove supplier?', message: 'Linked products stay in the catalogue without a supplier.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/suppliers', { id: Number(el.dataset.id) }); toast.success('Supplier removed.'); await loadScreen('/suppliers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sup-copy-order"]', (e, el) => {
    const sup = state.suppliers.find((x) => String(x.id) === el.dataset.id);
    if (!sup) return;
    const cur = state.session.settings.currency || 'AUD';
    const low = state.products.filter((p) => String(p.supplier_id) === String(sup.id) && p.is_low);
    const lines = [
      `Hi ${sup.contact_person || sup.supplier_name},`,
      ``,
      `Please place the following restock order for ${state.session.settings.business_name} (${today()}):`,
      ...low.map((p) => `- ${p.sku} · ${p.product_name} — Qty ${p.suggested_reorder} (unit cost ${money(p.cost_cents, { currency: cur })})`),
      ``,
      `Terms: ${sup.payment_terms} · Please confirm ETA.`,
    ];
    copyText(lines.join('\n'), { title: `Reorder for ${sup.supplier_name}`, done: 'Supplier reorder message copied.' });
  });

  const staffFields = (st = {}) => {
    const days = st.usual_days || [];
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Full name</span><input class="k-input" name="name" value="${st.name || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Role</span>
          <select class="k-input" name="role">${STAFF_ROLES.map((r) => html`<option value="${r}" ${r === (st.role || 'Sales assistant') ? 'selected' : ''}>${r}</option>`)}</select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${st.phone || ''}"></label>
        <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${st.email || ''}"></label>
        <label class="k-field"><span class="k-field__label">Status</span>
          <select class="k-input" name="active">
            <option value="Active" ${(st.active || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${st.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
      </div>
      <div class="k-field">
        <span class="k-field__label">Usual trading days</span>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${WEEKDAYS.map((d) => html`<label class="k-check"><input type="checkbox" name="usual_days" value="${d}" ${days.includes(d) ? 'checked' : ''}><span>${d.slice(0, 3)}</span></label>`)}
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" value="${st.notes || ''}" placeholder="Keyholder, POS lead, display specialist…"></label>`;
  };

  on(root, 'click', '[data-action="stf-new"]', async () => {
    const made = await formDialog({ title: 'Add Staff Member', submitLabel: 'Add to roster', fields: staffFields(), onSubmit: (v) => api.post('/api/staff', { ...v, usual_days: Array.isArray(v.usual_days) ? v.usual_days : [] }) });
    if (made) { toast.success('Staff member added.'); await loadScreen('/staff'); }
  });

  on(root, 'click', '[data-action="stf-edit"]', async (e, el) => {
    const st = state.staff.find((x) => String(x.id) === el.dataset.id);
    if (!st) return;
    const saved = await formDialog({ title: `Edit ${st.name}`, submitLabel: 'Save staff', fields: staffFields(st), onSubmit: (v) => api.put('/api/staff', { ...v, id: st.id, usual_days: Array.isArray(v.usual_days) ? v.usual_days : [] }) });
    if (saved) { toast.success('Staff member updated.'); await loadScreen('/staff'); }
  });

  on(root, 'click', '[data-action="stf-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove staff member?', message: 'Remove this person from the store roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/staff', { id: Number(el.dataset.id) }); toast.success('Staff member removed.'); await loadScreen('/staff'); }
    catch (err) { toastError(err); }
  });
}
