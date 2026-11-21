// Suppliers Directory (Unified Masthead & Monogrammed Vendor Cards) and Stock Movements Audit Ledger.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadCsv } from '../../kit/export.js';

const TERMS = ['Prepaid', 'Cash on Delivery', 'Net 7', 'Net 15', 'Net 30', 'Net 60'];
const MOVE_TYPES = ['All', 'Received', 'Sold', 'Adjustment', 'Return', 'Damaged'];
const FORM_MOVE_TYPES = ['Received', 'Sold', 'Adjustment', 'Return', 'Damaged'];

function moveTagClass(t) {
  if (t === 'Received') return 'tk-tag--ok';
  if (t === 'Return') return 'tk-tag--info';
  if (t === 'Damaged') return 'tk-tag--bad';
  if (t === 'Adjustment') return 'tk-tag--warn';
  return 'tk-tag--accent';
}

export function renderSuppliersView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const suppliers = state.suppliers || [];
  const products = state.products || [];
  const avgLead = suppliers.length
    ? Math.round(suppliers.reduce((s, x) => s + Number(x.lead_time_days || 0), 0) / suppliers.length)
    : 0;
  const totalSpend = suppliers.reduce((s, x) => s + Number(x.total_spend_cents || 0), 0);
  const openPos = suppliers.reduce((s, x) => s + Number(x.open_po_count || 0), 0);

  return html`
    <section class="ip-masthead" aria-label="Suppliers Directory">
      <div class="ip-masthead__copy">
        <div class="ip-masthead__eyebrow">
          ${icon('truck', { size: 12 })} APPROVED VENDORS &amp; LEAD TIMES
        </div>
        <h1 class="ip-masthead__title">Suppliers Directory</h1>
        <div class="ip-masthead__meta">
          <span>Payment terms, lead times &amp; cumulative purchasing spend</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click Draft PO pre-loaded with low-stock SKUs</span>
        </div>
      </div>

      <div class="ip-masthead__pods" style="align-items:center">
        <div class="ip-pod">
          <span class="ip-pod__lbl">Vendors</span>
          <span class="ip-pod__val">${suppliers.length}</span>
          <span class="ip-pod__sub">Approved accounts</span>
        </div>
        <div class="ip-pod">
          <span class="ip-pod__lbl">Avg Lead</span>
          <span class="ip-pod__val">${avgLead}d</span>
          <span class="ip-pod__sub">Transit window</span>
        </div>
        <div class="ip-pod ip-pod--amber">
          <span class="ip-pod__lbl">Total Spend</span>
          <span class="ip-pod__val">${money(totalSpend, { currency: cur })}</span>
          <span class="ip-pod__sub">${openPos} open PO${openPos === 1 ? '' : 's'}</span>
        </div>
        <div class="ip-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="sup-new">${icon('plus', { size: 15 })} Add Supplier</button>
        </div>
      </div>
    </section>

    ${state.loading && !suppliers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : suppliers.length ? html`
      <div class="ip-vendor-grid">
        ${suppliers.map((s) => {
          const lowCount = products.filter((p) => String(p.supplier_id) === String(s.id) && p.is_low).length;
          return html`
            <article class="ip-vendor-card" data-key="sup-${s.id}">
              <div class="ip-vendor-head">
                <div class="ip-avatar-sq">${initials(s.name)}</div>
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <h2 class="tk-card__title" style="font-size:15.5px">${s.name}</h2>
                    ${s.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-card__sub">${s.contact_name || 'Primary trade account'}</div>
                </div>
                <span class="tk-tag tk-tag--accent">${s.payment_terms}</span>
              </div>
              <div class="ip-stat-grid">
                <div><div class="ip-stat-grid__k">Lead Time</div><div class="ip-stat-grid__v">${s.lead_time_days} days</div></div>
                <div><div class="ip-stat-grid__k">Open POs</div><div class="ip-stat-grid__v">${s.open_po_count || 0}</div></div>
                <div><div class="ip-stat-grid__k">Total Spend</div><div class="ip-stat-grid__v">${money(s.total_spend_cents || 0, { currency: cur })}</div></div>
                <div>
                  <div class="ip-stat-grid__k">Linked SKUs</div>
                  <div class="ip-stat-grid__v">${s.sku_count || 0}${lowCount > 0 ? html` <span class="tk-tag tk-tag--warn">${lowCount} low</span>` : ''}</div>
                </div>
              </div>
              <div class="tk-row__meta">
                ${s.phone ? html`<span>${icon('phone', { size: 13 })} ${s.phone}</span>` : ''}
                ${s.email ? html`<span>${icon('mail', { size: 13 })} ${s.email}</span>` : ''}
              </div>
              ${s.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${s.notes}</p>` : ''}
              <div class="tk-btn-row" style="padding-top:9px;border-top:1px solid var(--k-border)">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sup-new-po" data-id="${s.id}">
                  ${icon('clipboard', { size: 13 })} ${lowCount > 0 ? `Draft PO (${lowCount} low)` : 'Draft PO'}
                </button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="sup-edit" data-id="${s.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sup-del" data-id="${s.id}">Remove</button>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'truck', title: 'No suppliers added yet', text: 'Register your vendors with lead times and payment terms to streamline purchasing.' })}</section>`}`;
}

export function renderMovementsView(state) {
  const q = state.moveSearch.trim().toLowerCase();
  const allMoves = state.movements || [];
  const rows = allMoves.filter((m) => {
    if (state.moveType !== 'All' && m.movement_type !== state.moveType) return false;
    if (q && !(m.sku.toLowerCase().includes(q) || m.product_name.toLowerCase().includes(q) || (m.reason || '').toLowerCase().includes(q) || (m.po_number || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const sumIn = rows.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
  const sumOut = rows.filter((r) => r.quantity < 0).reduce((s, r) => s + r.quantity, 0);
  const net = sumIn + sumOut;

  return html`
    <section class="ip-masthead" aria-label="Warehouse Stock Audit Log">
      <div class="ip-masthead__copy">
        <div class="ip-masthead__eyebrow">
          ${icon('layers', { size: 12 })} WAREHOUSE STOCK AUDIT LOG
        </div>
        <h1 class="ip-masthead__title">Stock Movements Ledger</h1>
        <div class="ip-masthead__meta">
          <span>PO receipts, dispatches, adjustments, returns &amp; write-offs</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Every stock delta traced to PO or operator</span>
        </div>
      </div>

      <div class="ip-masthead__pods" style="align-items:center">
        <div class="ip-pod">
          <span class="ip-pod__lbl">Entries</span>
          <span class="ip-pod__val">${rows.length}</span>
          <span class="ip-pod__sub">Shown</span>
        </div>
        <div class="ip-pod ip-pod--good">
          <span class="ip-pod__lbl">Units In</span>
          <span class="ip-pod__val">+${sumIn}</span>
          <span class="ip-pod__sub">Received / return</span>
        </div>
        <div class="ip-pod ip-pod--alert">
          <span class="ip-pod__lbl">Units Out</span>
          <span class="ip-pod__val">${sumOut}</span>
          <span class="ip-pod__sub">Sold / write-off</span>
        </div>
        <div class="ip-pod ip-pod--amber">
          <span class="ip-pod__lbl">Net Flow</span>
          <span class="ip-pod__val">${net >= 0 ? '+' : ''}${net}</span>
          <span class="ip-pod__sub">Net bin change</span>
        </div>
        <div class="ip-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="mv-export">${icon('download', { size: 14 })} CSV</button>
          <button type="button" class="k-btn k-btn--primary" data-action="mv-new">${icon('plus', { size: 15 })} Log Movement</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="mv-search" value="${state.moveSearch}" placeholder="Search SKU, product, PO # or reason…"></label>
      <div class="tk-segmented" role="group" aria-label="Filter by stock movement type">
        ${MOVE_TYPES.map((t) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.moveType === t })}" data-action="mv-type" data-type="${t}">${t}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !allMoves.length ? skeleton(4) : rows.length ? html`
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Date</th><th>SKU &amp; Product</th><th>Type</th><th class="tk-num">Qty</th><th class="tk-num">Stock After</th><th>Reference / Reason</th><th>By</th></tr>
            </thead>
            <tbody>
              ${rows.map((m) => html`
                <tr data-key="mv-${m.id}">
                  <td style="white-space:nowrap">${fmtDay(m.move_date)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span class="sku-chip">${m.sku}</span>
                      <strong>${m.product_name}</strong>
                      ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                  </td>
                  <td><span class="tk-tag ${moveTagClass(m.movement_type)}">${m.movement_type}</span></td>
                  <td class="tk-num"><span class="wh-delta ${m.quantity >= 0 ? 'wh-delta--in' : 'wh-delta--out'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</span></td>
                  <td class="tk-num"><strong>${m.stock_after}</strong></td>
                  <td>
                    ${m.po_number ? html`<span class="wh-code" style="margin-right:6px">${m.po_number}</span>` : ''}
                    <span class="tk-muted">${m.reason || '—'}</span>
                  </td>
                  <td style="white-space:nowrap">${m.actor_name || '—'}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : emptyState({ iconName: 'layers', title: 'No stock movements recorded', text: 'Receive a Purchase Order or log a manual stock adjustment to populate the audit trail.' })}
    </section>`;
}

export function wireOpsActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="mv-search"]', (e, el) => { state.moveSearch = el.value; draw(); });
  on(root, 'click', '[data-action="mv-type"]', (e, el) => { state.moveType = el.dataset.type; draw(); });

  const supplierFields = (s = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Supplier name</span><input class="k-input" name="name" value="${s.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Contact name</span><input class="k-input" name="contact_name" value="${s.contact_name || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${s.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${s.phone || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Payment terms</span>
        <select class="k-input" name="payment_terms">${TERMS.map((t) => html`<option value="${t}" ${t === (s.payment_terms || 'Net 30') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Lead time (days)</span>
        <input class="k-input" type="number" min="0" max="365" name="lead_time_days" value="${s.lead_time_days ?? 7}">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="MOQs, account number, freight terms…">${s.notes || ''}</textarea>
    </label>`;

  on(root, 'click', '[data-action="sup-new"]', async () => {
    const made = await formDialog({ title: 'Add Supplier', submitLabel: 'Save supplier', fields: supplierFields(), onSubmit: (v) => api.post('/api/suppliers', v) });
    if (made) { toast.success('Supplier added.'); await loadScreen('/suppliers'); }
  });

  on(root, 'click', '[data-action="sup-edit"]', async (e, el) => {
    const s = state.suppliers.find((x) => String(x.id) === el.dataset.id);
    if (!s) return;
    const saved = await formDialog({ title: `Edit ${s.name}`, submitLabel: 'Save supplier', fields: supplierFields(s), onSubmit: (v) => api.put('/api/suppliers', { ...v, id: s.id }) });
    if (saved) { toast.success('Supplier updated.'); await loadScreen('/suppliers'); }
  });

  on(root, 'click', '[data-action="sup-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove supplier?', message: 'Suppliers with existing purchase orders cannot be deleted.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/suppliers', { id: Number(el.dataset.id) }); toast.success('Supplier removed.'); await loadScreen('/suppliers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sup-new-po"]', (e, el) => {
    router.go('/pos', { draftSupplier: el.dataset.id });
  });

  on(root, 'click', '[data-action="mv-new"]', async () => {
    if (!state.products.length) { toast.error('Add a product first.'); return; }
    const made = await formDialog({
      title: 'Log Stock Movement',
      submitLabel: 'Record & Update Stock',
      fields: html`
        <label class="k-field"><span class="k-field__label">Product</span>
          <select class="k-input" name="product_id" required>
            ${state.products.map((p) => html`<option value="${p.id}">[${p.sku}] ${p.name} (on hand: ${p.stock_on_hand})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Movement type</span>
            <select class="k-input" name="movement_type">${FORM_MOVE_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Quantity</span>
            <input class="k-input" type="number" step="1" name="quantity" placeholder="+10 or -5" required>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="move_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Reason / Reference</span><input class="k-input" name="reason" placeholder="e.g. Stocktake, sales dispatch"></label>
        </div>`,
      onSubmit: (v) => api.post('/api/movements', v),
    });
    if (made) { toast.success(`Logged movement — ${made.product.sku} now has ${made.product.stock_on_hand} on hand.`); await loadScreen('/movements'); }
  });

  on(root, 'click', '[data-action="mv-export"]', () => {
    downloadCsv(`stock-movements-${today()}.csv`, [
      { key: 'move_date', label: 'Date' }, { key: 'sku', label: 'SKU' },
      { key: 'product_name', label: 'Product' }, { key: 'movement_type', label: 'Type' },
      { key: 'quantity', label: 'Qty' }, { key: 'stock_after', label: 'Stock After' },
      { key: 'po_number', label: 'PO #' }, { key: 'reason', label: 'Reason' }, { key: 'actor_name', label: 'By' },
    ], state.movements);
  });
}
