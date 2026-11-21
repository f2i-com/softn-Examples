// Stock Movements Ledger — Unified Charcoal Masthead, Stock Movement Badges, Audited History & CSV Export.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadCsv } from '../../kit/export.js';

const MOVE_TYPES = ['All', 'Delivery', 'Sale adjustment', 'Return', 'Damage', 'Stock count'];
const MOVE_FORM_TYPES = ['Delivery', 'Sale adjustment', 'Return', 'Damage', 'Stock count'];

function mvBadge(t) {
  if (t === 'Delivery') return { cls: 'cf-mv-badge--delivery', ic: 'truck' };
  if (t === 'Sale adjustment') return { cls: 'cf-mv-badge--sale', ic: 'till-drawer' };
  if (t === 'Return') return { cls: 'cf-mv-badge--return', ic: 'refresh' };
  if (t === 'Damage') return { cls: 'cf-mv-badge--damage', ic: 'alert' };
  return { cls: 'cf-mv-badge--count', ic: 'clipboard' };
}

export function renderMovementsView(state) {
  const q = state.moveSearch.trim().toLowerCase();
  const rows = state.movements.filter((m) => {
    if (state.moveType !== 'All' && m.movement_type !== state.moveType) return false;
    if (q && !(m.sku.toLowerCase().includes(q) || m.product_name.toLowerCase().includes(q) || (m.reference || '').toLowerCase().includes(q) || (m.reason || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const netIn = rows.filter((r) => r.quantity_change > 0).reduce((s, r) => s + r.quantity_change, 0);
  const netOut = rows.filter((r) => r.quantity_change < 0).reduce((s, r) => s + r.quantity_change, 0);
  const netTotal = netIn + netOut;

  return html`
    <section class="cf-masthead" aria-label="Stock Movements Ledger">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('layers', { size: 12 })} IMMUTABLE STOCK AUDIT TRAIL
        </div>
        <h1 class="cf-masthead__title">Stock Movements Ledger</h1>
        <div class="cf-masthead__meta">
          <span>Every delivery, till sale, return restock, write-off and stocktake count</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Chronological stock-after history</span>
        </div>
      </div>

      <div class="cf-masthead__pods" style="align-items:center">
        <div class="cf-pod">
          <span class="cf-pod__lbl">Entries</span>
          <span class="cf-pod__val">${rows.length}</span>
          <span class="cf-pod__sub">Shown in ledger</span>
        </div>
        <div class="cf-pod cf-pod--good">
          <span class="cf-pod__lbl">Stock In</span>
          <span class="cf-pod__val">+${netIn}</span>
          <span class="cf-pod__sub">Units received</span>
        </div>
        <div class="cf-pod cf-pod--alert">
          <span class="cf-pod__lbl">Stock Out</span>
          <span class="cf-pod__val">${netOut}</span>
          <span class="cf-pod__sub">Units sold / out</span>
        </div>
        <div class="cf-pod cf-pod--gold">
          <span class="cf-pod__lbl">Net Flow</span>
          <span class="cf-pod__val">${netTotal >= 0 ? '+' : ''}${netTotal}</span>
          <span class="cf-pod__sub">Net unit delta</span>
        </div>
        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="mv-export">${icon('download', { size: 14 })} CSV</button>
          <button type="button" class="k-btn k-btn--primary" data-action="mv-new">${icon('plus', { size: 15 })} Log Movement</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="mv-search" value="${state.moveSearch}" placeholder="Search SKU, product, docket or reason…"></label>
      <div class="tk-segmented" role="group" aria-label="Filter by movement type">
        ${MOVE_TYPES.map((t) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.moveType === t })}" data-action="mv-type" data-type="${t}">${t}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.movements.length ? skeleton(4) : rows.length ? html`
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Date</th><th>SKU &amp; Product</th><th>Type</th><th class="tk-num">Change</th><th class="tk-num">Stock After</th><th>Staff</th><th>Ref &amp; Reason</th></tr>
            </thead>
            <tbody>
              ${rows.map((m) => {
                const b = mvBadge(m.movement_type);
                return html`
                  <tr data-key="mv-${m.id}">
                    <td style="white-space:nowrap">${fmtDay(m.move_date)}</td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="cf-sku">${m.sku}</span>
                        <strong>${m.product_name}</strong>
                        ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                    </td>
                    <td><span class="cf-mv-badge ${b.cls}">${icon(b.ic, { size: 12 })} ${m.movement_type}</span></td>
                    <td class="tk-num">
                      <span class="cf-delta ${m.quantity_change > 0 ? 'cf-delta--pos' : m.quantity_change < 0 ? 'cf-delta--neg' : 'cf-delta--zero'}">${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}</span>
                    </td>
                    <td class="tk-num"><strong>${m.stock_after}</strong></td>
                    <td style="white-space:nowrap">${m.staff_name || '—'}</td>
                    <td>
                      ${m.reference ? html`<span class="tk-mono" style="font-weight:700">${m.reference}</span> ` : ''}
                      <span class="tk-muted">${m.reason || '—'}</span>
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>` : emptyState({ iconName: 'layers', title: 'No stock movements found', text: 'Use quick adjust buttons on the Products screen or log a stock movement here.' })}
    </section>`;
}

export function wireMovementsActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="mv-search"]', (e, el) => { state.moveSearch = el.value; draw(); });
  on(root, 'click', '[data-action="mv-type"]', (e, el) => { state.moveType = el.dataset.type; draw(); });

  on(root, 'click', '[data-action="mv-new"]', async () => {
    if (!state.products.length) { toast.error('Add a product first before logging a stock movement.'); return; }
    const made = await formDialog({
      title: 'Log Stock Movement',
      submitLabel: 'Save & Update Stock',
      fields: html`
        <label class="k-field"><span class="k-field__label">Product</span>
          <select class="k-input" name="product_id" required>
            ${state.products.map((p) => html`<option value="${p.id}">[${p.sku}] ${p.product_name} (on hand: ${p.current_stock})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Movement type</span>
            <select class="k-input" name="movement_type">
              ${MOVE_FORM_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Quantity change</span>
            <input class="k-input" type="number" step="1" name="quantity_change" placeholder="e.g. 12 or -3" required>
            <span class="k-field__hint">Positive for stock in, negative for stock out.</span>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span>
            <input class="k-input" type="date" name="move_date" value="${today()}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Staff member</span>
            <select class="k-input" name="staff_id">
              <option value="">Logged-in user (${state.session.me.displayName || 'Me'})</option>
              ${state.staff.filter((s) => s.active === 'Active').map((s) => html`<option value="${s.id}">${s.name}</option>`)}
            </select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Reference <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="reference" placeholder="Delivery docket or count sheet number">
        </label>
        <label class="k-field"><span class="k-field__label">Reason <span class="k-field__optional">optional</span></span>
          <textarea class="k-input" name="reason" rows="2" placeholder="Why the stock level changed…"></textarea>
        </label>`,
      onSubmit: (v) => api.post('/api/movements', v),
    });
    if (made) { toast.success(`Movement logged — ${made.product.sku} now has ${made.product.current_stock} on hand.`); await loadScreen('/movements'); }
  });

  on(root, 'click', '[data-action="mv-export"]', () => {
    downloadCsv(`counterflow-stock-ledger-${today()}.csv`, [
      { key: 'move_date', label: 'Date' }, { key: 'sku', label: 'SKU' },
      { key: 'product_name', label: 'Product' }, { key: 'movement_type', label: 'Type' },
      { key: 'quantity_change', label: 'Qty Change' }, { key: 'stock_after', label: 'Stock After' },
      { key: 'staff_name', label: 'Staff' }, { key: 'reference', label: 'Reference' },
      { key: 'reason', label: 'Reason' },
    ], state.movements);
  });
}
