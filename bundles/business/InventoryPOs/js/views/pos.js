// Multi-Line Purchase Order Builder, Unified Cobalt Masthead, 4-Step PO Pipeline Steppers, Dock Receiving & Printable PO Doc.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, addDays, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, confirmDialog, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const PO_STATUSES = ['All', 'Draft', 'Ordered', 'Part Received', 'Received', 'Cancelled'];
const PO_STEPS = ['Draft', 'Ordered', 'Part Received', 'Received'];

function statusBadgeClass(st) {
  if (st === 'Ordered') return 'tk-tag--info';
  if (st === 'Part Received') return 'tk-tag--warn';
  if (st === 'Received') return 'tk-tag--ok';
  if (st === 'Cancelled') return 'tk-tag--bad';
  return '';
}

function poCardMod(st) {
  if (st === 'Part Received') return 'po-card--part';
  if (st === 'Received') return 'po-card--received';
  if (st === 'Cancelled') return 'po-card--cancelled';
  return '';
}

/** Visual 4-Step PO Progress Stepper: Draft -> Ordered -> Part Received -> Received. */
export function renderPoStepper(status, { compact = false } = {}) {
  if (status === 'Cancelled') {
    return html`<span class="tk-tag tk-tag--bad">Cancelled PO</span>`;
  }
  const activeIdx = PO_STEPS.indexOf(status);
  const allComplete = status === 'Received';
  return html`
    <div class="${cls('po-stepper', { 'po-stepper--compact': compact })}" aria-label="Purchase order status: ${status}">
      ${PO_STEPS.map((label, idx) => {
        const isDone = allComplete || idx < activeIdx;
        const isCurrent = !allComplete && idx === activeIdx;
        const isCompleteEnd = allComplete && idx === PO_STEPS.length - 1;
        return html`
          <div class="${cls('po-stepper__item', {
            'is-done': isDone && !isCompleteEnd,
            'is-active': isCurrent,
            'is-complete': isCompleteEnd,
          })}">
            <span class="po-stepper__dot">${isDone || isCompleteEnd ? icon('check', { size: compact ? 10 : 12 }) : idx + 1}</span>
            <span class="po-stepper__lbl">${label}</span>
          </div>`;
      })}
    </div>`;
}

/** Populate the Multi-Line PO Builder cleanly for a specific product and/or supplier (1-click Draft PO for Supplier). */
export function openDraftPoFor(state, { productId = null, supplierId = null } = {}) {
  const prod = productId ? state.products.find((p) => p.id === productId) : null;
  const targetSupId = supplierId || (prod && prod.supplier_id) || (state.suppliers[0] ? state.suppliers[0].id : '');
  const sup = state.suppliers.find((s) => String(s.id) === String(targetSupId));
  const lead = sup ? Number(sup.lead_time_days || 7) : 7;

  const lines = [];
  let autoNote = '';
  if (prod) {
    lines.push({
      product_id: String(prod.id),
      quantity: Math.max(1, prod.suggested_order_qty || 10),
      unit_cost: (Number(prod.unit_cost_cents || 0) / 100).toFixed(2),
    });
    if (sup) autoNote = `Reorder replenishment for ${prod.sku}`;
  } else if (sup) {
    const lowForSup = state.products.filter((p) => String(p.supplier_id) === String(sup.id) && p.is_low);
    const seedList = lowForSup.length ? lowForSup : state.products.filter((p) => String(p.supplier_id) === String(sup.id)).slice(0, 1);
    for (const p of seedList) {
      lines.push({
        product_id: String(p.id),
        quantity: Math.max(1, p.suggested_order_qty || 10),
        unit_cost: (Number(p.unit_cost_cents || 0) / 100).toFixed(2),
      });
    }
    if (lowForSup.length) autoNote = `Reorder Radar replenishment — ${lowForSup.length} low-stock SKU${lowForSup.length === 1 ? '' : 's'}`;
  }
  if (!lines.length && state.products.length) {
    const first = state.products[0];
    lines.push({
      product_id: String(first.id),
      quantity: 10,
      unit_cost: (Number(first.unit_cost_cents || 0) / 100).toFixed(2),
    });
  }

  state.poDraft = {
    supplier_id: targetSupId ? String(targetSupId) : '',
    order_date: today(),
    expected_date: addDays(today(), lead),
    notes: autoNote,
    lines,
  };
  state.poBuilderOpen = true;
}

function computeDraftSubtotalCents(lines) {
  let sum = 0;
  for (const ln of lines) {
    const qty = Math.max(0, Number(ln.quantity || 0));
    const costCents = Math.round(Math.max(0, Number(ln.unit_cost || 0)) * 100);
    sum += qty * costCents;
  }
  return sum;
}

function renderPoBuilder(state) {
  const cur = state.session.settings.currency || 'AUD';
  const taxRate = Number(state.session.settings.tax_rate || 0);
  const d = state.poDraft;
  const subCents = computeDraftSubtotalCents(d.lines);
  const taxCents = Math.round(subCents * (taxRate / 100));
  const grandCents = subCents + taxCents;

  return html`
    <section class="tk-sheet" style="margin-bottom:18px;border:2px solid var(--k-accent)">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">${icon('clipboard', { size: 18 })} Multi-Line Purchase Order Builder</h2>
        <div class="tk-sheet__actions">
          ${d.supplier_id ? html`<button type="button" class="k-btn k-btn--sm" data-action="po-load-low-sup">${icon('alert', { size: 14 })} Load Low-Stock SKUs</button>` : ''}
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="po-builder-close">Close</button>
        </div>
      </div>
      <div class="tk-sheet__body po-builder">
        <div class="k-form__row">
          <label class="k-field">
            <span class="k-field__label">Supplier</span>
            <select class="k-input" data-po-field="supplier_id">
              <option value="">— Select supplier —</option>
              ${state.suppliers.map((s) => html`<option value="${s.id}" ${String(s.id) === String(d.supplier_id) ? 'selected' : ''}>${s.name} (${s.lead_time_days}d · ${s.payment_terms})</option>`)}
            </select>
          </label>
          <label class="k-field">
            <span class="k-field__label">Order date</span>
            <input class="k-input" type="date" data-po-field="order_date" value="${d.order_date}">
          </label>
          <label class="k-field">
            <span class="k-field__label">Expected delivery</span>
            <input class="k-input" type="date" data-po-field="expected_date" value="${d.expected_date}">
          </label>
        </div>

        <div class="tk-table-wrap">
          <table class="po-lines-table">
            <thead>
              <tr>
                <th style="min-width:220px">Product (SKU)</th>
                <th style="width:105px">Qty</th>
                <th style="width:125px">Unit Cost</th>
                <th class="tk-num" style="width:125px">Line Total</th>
                <th style="width:42px"></th>
              </tr>
            </thead>
            <tbody>
              ${d.lines.map((ln, idx) => {
                const lineCents = Math.max(0, Number(ln.quantity || 0)) * Math.round(Math.max(0, Number(ln.unit_cost || 0)) * 100);
                return html`
                  <tr data-key="poln-${idx}">
                    <td>
                      <select class="k-input" data-po-line-field="product_id" data-idx="${idx}">
                        ${state.products.map((p) => html`<option value="${p.id}" ${String(p.id) === String(ln.product_id) ? 'selected' : ''}>[${p.sku}] ${p.name} (have ${p.stock_on_hand}${p.is_low ? ' · LOW' : ''})</option>`)}
                      </select>
                    </td>
                    <td><input class="k-input" type="number" min="1" max="100000" step="1" data-po-line-field="quantity" data-idx="${idx}" value="${ln.quantity}"></td>
                    <td><input class="k-input" type="number" min="0" step="0.01" data-po-line-field="unit_cost" data-idx="${idx}" value="${ln.unit_cost}"></td>
                    <td class="tk-num"><strong>${money(lineCents, { currency: cur })}</strong></td>
                    <td><button type="button" class="k-icon-btn" data-action="po-line-del" data-idx="${idx}" aria-label="Remove line">${icon('x', { size: 15 })}</button></td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>

        <div class="tk-btn-row">
          <button type="button" class="k-btn k-btn--sm" data-action="po-line-add">${icon('plus', { size: 14 })} Add Line Item</button>
        </div>

        <label class="k-field">
          <span class="k-field__label">Delivery instructions &amp; PO notes <span class="k-field__optional">optional</span></span>
          <input class="k-input" data-po-field="notes" value="${d.notes}" placeholder="Dock number, pallet notes, quote reference…">
        </label>

        <div class="po-summary-box">
          <div>
            <div class="tk-muted" style="font-size:12.5px">Subtotal ${money(subCents, { currency: cur })} + Tax (${taxRate}%) ${money(taxCents, { currency: cur })}</div>
            <div class="po-summary-total">${money(grandCents, { currency: cur })} <span style="font-size:13px;font-weight:500;color:var(--k-muted)">incl. tax</span></div>
          </div>
          <div class="tk-btn-row">
            <button type="button" class="k-btn" data-action="po-save" data-status="Draft" ${d.lines.length && d.supplier_id ? '' : 'disabled'}>Save as Draft</button>
            <button type="button" class="k-btn k-btn--primary" data-action="po-save" data-status="Ordered" ${d.lines.length && d.supplier_id ? '' : 'disabled'}>${icon('send', { size: 15 })} Create &amp; Place Order</button>
          </div>
        </div>
      </div>
    </section>`;
}

function renderActivePoDetail(state) {
  const po = state.activePo;
  if (!po) return '';
  const cur = state.session.settings.currency || 'AUD';
  const taxRate = Number(state.session.settings.tax_rate || 0);
  const taxCents = Math.round(Number(po.total_cents || 0) * (taxRate / 100));
  const recPct = po.total_qty > 0 ? Math.min(100, Math.round((Number(po.received_qty || 0) / Number(po.total_qty)) * 100)) : 0;

  return html`
    <section class="po-detail-card" style="margin-bottom:18px">
      <div class="tk-sheet__head">
        <span class="wh-code">${po.po_number}</span>
        <h2 class="tk-sheet__title">${po.supplier_name}</h2>
        <span class="tk-tag ${statusBadgeClass(po.status)}">${po.status}</span>
        <div class="tk-sheet__actions">
          <button type="button" class="k-btn k-btn--sm" data-action="po-print" data-id="${po.id}">${icon('printer', { size: 14 })} Print PO</button>
          <button type="button" class="k-btn k-btn--sm" data-action="po-copy" data-id="${po.id}">${icon('copy', { size: 14 })} Copy</button>
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="po-close-detail">Close</button>
        </div>
      </div>
      <div class="tk-sheet__body tk-stack">
        <div style="padding:10px 14px;border-radius:var(--k-radius);background:var(--k-surface-2);border:1px solid var(--k-border)">
          ${renderPoStepper(po.status)}
        </div>

        <div class="tk-kv">
          <div class="tk-kv__item"><span class="tk-kv__k">Order Date</span><span class="tk-kv__v">${fmtDay(po.order_date)}</span></div>
          <div class="tk-kv__item"><span class="tk-kv__k">Expected Delivery</span><span class="tk-kv__v">${po.expected_date ? fmtDay(po.expected_date) : '—'}</span></div>
          <div class="tk-kv__item"><span class="tk-kv__k">Receiving Progress</span><span class="tk-kv__v">${num(po.received_qty)} / ${num(po.total_qty)} units (${recPct}%)</span></div>
          <div class="tk-kv__item"><span class="tk-kv__k">PO Subtotal (ex tax)</span><span class="tk-kv__v">${money(po.total_cents, { currency: cur })} (+${money(taxCents, { currency: cur })} tax)</span></div>
        </div>

        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>SKU &amp; Product</th><th>Put-Away Bin</th><th class="tk-num">Ordered</th><th class="tk-num">Received</th><th class="tk-num">Unit Cost</th><th class="tk-num">Line Total</th></tr>
            </thead>
            <tbody>
              ${(po.lines || []).map((ln) => {
                const done = Number(ln.received_qty) >= Number(ln.quantity);
                return html`
                  <tr data-key="dtln-${ln.id}">
                    <td>
                      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                        <span class="sku-chip">${ln.sku}</span>
                        <strong>${ln.product_name}</strong>
                      </div>
                    </td>
                    <td>${ln.bin_location ? html`<span class="bin-chip">${icon('pin', { size: 11 })} ${ln.bin_location}</span>` : html`<span class="tk-muted">—</span>`}</td>
                    <td class="tk-num">${num(ln.quantity)}</td>
                    <td class="tk-num"><span class="tk-tag ${done ? 'tk-tag--ok' : ln.received_qty > 0 ? 'tk-tag--warn' : ''}">${ln.received_qty} / ${ln.quantity}</span></td>
                    <td class="tk-num">${money(ln.unit_cost_cents, { currency: cur })}</td>
                    <td class="tk-num"><strong>${money(ln.line_total_cents, { currency: cur })}</strong></td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>

        ${po.notes ? html`<p class="tk-muted" style="font-size:13px;margin:0"><strong>Notes:</strong> ${po.notes}</p>` : ''}

        <div class="tk-btn-row" style="padding-top:10px;border-top:1px solid var(--k-border)">
          ${po.status === 'Draft' ? html`
            <button type="button" class="k-btn k-btn--primary" data-action="po-mark-ordered" data-id="${po.id}">${icon('send', { size: 15 })} Mark Ordered</button>
          ` : ''}
          ${po.status === 'Draft' || po.status === 'Ordered' || po.status === 'Part Received' ? html`
            <button type="button" class="k-btn k-btn--primary" data-action="po-receive-dock" data-id="${po.id}">${icon('dock-receive', { size: 15 })} Receive Stock…</button>
            <button type="button" class="k-btn" data-action="po-receive-all" data-id="${po.id}">${icon('check', { size: 15 })} Quick Receive All</button>
            <button type="button" class="k-btn k-btn--ghost tk-danger" style="margin-left:auto" data-action="po-cancel" data-id="${po.id}">Cancel PO</button>
          ` : ''}
          ${po.status === 'Draft' || po.status === 'Cancelled' ? html`
            <button type="button" class="k-btn k-btn--ghost tk-danger" data-action="po-delete" data-id="${po.id}">Delete PO</button>
          ` : ''}
        </div>
      </div>
    </section>`;
}

export function renderPosView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const tday = today();
  const allOrders = state.orders || [];
  const rows = state.poStatusFilter === 'All'
    ? allOrders
    : allOrders.filter((o) => o.status === state.poStatusFilter);

  const openList = allOrders.filter((o) => o.status === 'Draft' || o.status === 'Ordered' || o.status === 'Part Received');
  const openValue = openList.reduce((s, o) => s + Number(o.total_cents || 0), 0);
  const inTransit = allOrders.filter((o) => o.status === 'Ordered' || o.status === 'Part Received').length;
  const receivedCount = allOrders.filter((o) => o.status === 'Received').length;

  const lowBySup = new Map();
  for (const p of (state.products || [])) {
    if (!p.is_low || !p.supplier_id) continue;
    const key = String(p.supplier_id);
    if (!lowBySup.has(key)) lowBySup.set(key, { id: p.supplier_id, name: p.supplier_name || 'Supplier', count: 0 });
    lowBySup.get(key).count += 1;
  }
  const radarSuppliers = Array.from(lowBySup.values());

  return html`
    <section class="ip-masthead" aria-label="Purchasing & Dock Receiving">
      <div class="ip-masthead__copy">
        <div class="ip-masthead__eyebrow">
          ${icon('clipboard', { size: 12 })} PURCHASING &amp; DOCK RECEIVING
        </div>
        <h1 class="ip-masthead__title">Purchase Orders</h1>
        <div class="ip-masthead__meta">
          <span>4-step PO pipeline from Draft to atomic dock put-away</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Partial &amp; full receiving logged automatically</span>
        </div>
      </div>

      <div class="ip-masthead__pods" style="align-items:center">
        <div class="ip-pod ip-pod--amber">
          <span class="ip-pod__lbl">Open Value</span>
          <span class="ip-pod__val">${money(openValue, { currency: cur })}</span>
          <span class="ip-pod__sub">${openList.length} open PO${openList.length === 1 ? '' : 's'}</span>
        </div>
        <div class="ip-pod">
          <span class="ip-pod__lbl">In Transit</span>
          <span class="ip-pod__val">${inTransit}</span>
          <span class="ip-pod__sub">Awaiting dock</span>
        </div>
        <div class="ip-pod ip-pod--good">
          <span class="ip-pod__lbl">Received</span>
          <span class="ip-pod__val">${receivedCount}</span>
          <span class="ip-pod__sub">Put away in bins</span>
        </div>
        <div class="ip-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="po-builder-open">${icon('plus', { size: 15 })} New PO</button>
        </div>
      </div>
    </section>

    ${!state.poBuilderOpen && radarSuppliers.length ? html`
      <div class="radar-shell" style="margin-bottom:16px">
        <div class="radar-head" style="padding:11px 16px">
          <div class="radar-head__title" style="font-size:14.5px">
            <span class="tk-pulse-dot" style="--dot:#d97706"></span>
            <span>Reorder Radar · 1-Click Draft PO</span>
          </div>
          <div class="tk-btn-row">
            ${radarSuppliers.map((sup) => html`
              <button type="button" class="k-btn ip-draft-po-btn" style="min-height:30px;padding:0 11px;font-size:12px" data-action="po-radar-supplier" data-supplier="${sup.id}">
                ${icon('clipboard', { size: 13 })} ${sup.name} (${sup.count} low)
              </button>`)}
          </div>
        </div>
      </div>` : ''}

    ${state.poBuilderOpen ? renderPoBuilder(state) : ''}
    ${renderActivePoDetail(state)}

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by purchase order status">
        ${PO_STATUSES.map((st) => {
          const cnt = st === 'All' ? allOrders.length : allOrders.filter((o) => o.status === st).length;
          return html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.poStatusFilter === st })}" data-action="po-filter" data-status="${st}">
              ${st}${cnt > 0 ? ` (${cnt})` : ''}
            </button>`;
        })}
      </div>
    </div>

    ${state.loading && !allOrders.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="po-card-list">
        ${rows.map((po) => {
          const recPct = po.total_qty > 0 ? Math.min(100, Math.round((Number(po.received_qty || 0) / Number(po.total_qty)) * 100)) : 0;
          const isOverdue = (po.status === 'Ordered' || po.status === 'Part Received') && po.expected_date && po.expected_date < tday;
          const isSelected = state.activePo && state.activePo.id === po.id;
          return html`
            <article class="${cls('po-card', poCardMod(po.status), { 'po-card--selected': isSelected })}" data-key="po-${po.id}">
              <div class="po-card__top">
                <div class="po-card__id">
                  <span class="wh-code">${po.po_number}</span>
                  <span class="po-card__sup">${po.supplier_name}</span>
                  <span class="tk-tag ${statusBadgeClass(po.status)}">${po.status}</span>
                  ${isOverdue ? html`<span class="tk-tag tk-tag--bad">Overdue ETA</span>` : ''}
                  ${po.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="po-card__total">${money(po.total_cents, { currency: cur })} <span class="tk-muted" style="font-size:11.5px;font-weight:500">ex tax</span></div>
              </div>

              <div class="po-card__mid">
                ${renderPoStepper(po.status, { compact: true })}
                <div style="min-width:170px;display:grid;gap:4px;flex:0 1 220px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--k-muted);font-variant-numeric:tabular-nums">
                    <span>${po.line_count} line${po.line_count === 1 ? '' : 's'}</span>
                    <strong>${po.received_qty} / ${po.total_qty} units (${recPct}%)</strong>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${recPct === 100 ? 'tk-bar__fill--ok' : recPct > 0 ? 'tk-bar__fill--warn' : ''}" style="width:${recPct}%"></div></div>
                </div>
              </div>

              <div class="po-card__foot">
                <div class="po-card__meta">
                  <span>Ordered: <strong>${fmtDay(po.order_date)}</strong></span>
                  <span>ETA: <strong>${po.expected_date ? fmtDayNear(po.expected_date) : '—'}</strong></span>
                  ${po.received_date ? html`<span>Received: <strong>${fmtDay(po.received_date)}</strong></span>` : ''}
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="po-inspect" data-id="${po.id}">${isSelected ? 'Viewing' : 'Inspect'}</button>
                  ${po.status === 'Draft' ? html`
                    <button type="button" class="k-btn k-btn--sm" data-action="po-mark-ordered" data-id="${po.id}">${icon('send', { size: 13 })} Mark Ordered</button>
                  ` : ''}
                  ${po.status === 'Draft' || po.status === 'Ordered' || po.status === 'Part Received' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="po-receive-dock" data-id="${po.id}">${icon('dock-receive', { size: 13 })} Receive Stock</button>
                  ` : ''}
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'clipboard', title: 'No purchase orders matching filter', text: 'Build a multi-line PO to order stock from your suppliers.' })}</section>`}`;
}

async function openDockReceiveDialog(state, poId, { loadScreen, route = '/pos' }) {
  let po = state.activePo && state.activePo.id === poId ? state.activePo : null;
  if (!po) {
    const det = await api.get('/api/pos/detail', { id: poId });
    po = det.order;
  }
  if (!po) return;
  const openLines = (po.lines || []).filter((l) => Number(l.received_qty) < Number(l.quantity));
  if (!openLines.length) { toast('All line items on this PO are already received.'); return; }
  const totalRem = openLines.reduce((s, l) => s + (Number(l.quantity) - Number(l.received_qty)), 0);

  const res = await formDialog({
    title: `Dock Receiving · ${po.po_number} (${po.supplier_name})`,
    submitLabel: 'Confirm & Receive into Stock',
    size: 'md',
    fields: html`
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:var(--k-radius);background:var(--k-accent-soft);color:var(--k-accent);font-size:13px;font-weight:650">
        <span>${openLines.length} open line${openLines.length === 1 ? '' : 's'} · ${num(totalRem)} remaining unit${totalRem === 1 ? '' : 's'} to put away</span>
        <span style="font-weight:500">Leave as pre-filled for full receipt, or adjust for partial delivery.</span>
      </div>
      <label class="k-field">
        <span class="k-field__label">Receive date</span>
        <input class="k-input" type="date" name="receive_date" value="${today()}" required>
      </label>
      <div class="po-recv-list">
        ${openLines.map((l) => {
          const rem = Number(l.quantity) - Number(l.received_qty);
          return html`
            <div class="po-recv-line">
              <div class="po-recv-line__info">
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                  <span class="sku-chip">${l.sku}</span>
                  <strong>${l.product_name}</strong>
                </div>
                <div class="tk-muted" style="font-size:12px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center">
                  ${l.bin_location ? html`<span class="bin-chip">${icon('pin', { size: 11 })} ${l.bin_location}</span>` : html`<span>No bin set</span>`}
                  <span>Ordered ${l.quantity} · Received ${l.received_qty} · <strong>${rem} remaining</strong></span>
                </div>
              </div>
              <label class="k-field po-recv-line__qty">
                <span class="k-field__label" style="font-size:11.5px">Receive now</span>
                <input class="k-input" type="number" min="0" max="${rem}" name="line_${l.id}" value="${rem}">
              </label>
            </div>`;
        })}
      </div>`,
    onSubmit: (vals) => api.post('/api/pos/receive', {
      id: po.id,
      receive_date: vals.receive_date || today(),
      lines: openLines.map((l) => ({ line_id: l.id, receive_qty: Number(vals['line_' + l.id] || 0) })),
    }),
  });
  if (res) {
    state.activePo = res.order;
    toast.success(`${po.po_number}: +${res.unitsReceived} units received (${res.order.status}).`);
    await loadScreen(route);
  }
}

export { openDockReceiveDialog };

export function wirePosActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="po-filter"]', (e, el) => { state.poStatusFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="po-builder-open"]', () => {
    if (!state.suppliers.length || !state.products.length) {
      toast.error('Add at least one supplier and one product before creating a PO.');
      return;
    }
    openDraftPoFor(state);
    draw();
  });

  on(root, 'click', '[data-action="po-radar-supplier"]', (e, el) => {
    const supId = Number(el.dataset.supplier);
    openDraftPoFor(state, { supplierId: supId });
    const sup = state.suppliers.find((s) => s.id === supId);
    toast.success(`Draft PO pre-loaded with ${state.poDraft.lines.length} low-stock SKU(s) for ${sup ? sup.name : 'supplier'}.`);
    draw();
  });

  on(root, 'click', '[data-action="po-builder-close"]', () => { state.poBuilderOpen = false; draw(); });
  on(root, 'click', '[data-action="po-close-detail"]', () => { state.activePo = null; draw(); });

  on(root, 'change', '[data-po-field]', (e, el) => {
    const field = el.dataset.poField;
    state.poDraft[field] = el.value;
    if (field === 'supplier_id') {
      const sup = state.suppliers.find((s) => String(s.id) === String(el.value));
      if (sup) state.poDraft.expected_date = addDays(state.poDraft.order_date || today(), Number(sup.lead_time_days || 7));
      draw();
    }
  });
  on(root, 'input', '[data-po-field="notes"]', (e, el) => { state.poDraft.notes = el.value; });

  on(root, 'change', '[data-po-line-field]', (e, el) => {
    const idx = Number(el.dataset.idx);
    const field = el.dataset.poLineField;
    const ln = state.poDraft.lines[idx];
    if (!ln) return;
    ln[field] = el.value;
    if (field === 'product_id') {
      const prod = state.products.find((p) => String(p.id) === String(el.value));
      if (prod) ln.unit_cost = (Number(prod.unit_cost_cents || 0) / 100).toFixed(2);
    }
    draw();
  });
  on(root, 'input', '[data-po-line-field="quantity"], [data-po-line-field="unit_cost"]', (e, el) => {
    const idx = Number(el.dataset.idx);
    const ln = state.poDraft.lines[idx];
    if (!ln) return;
    ln[el.dataset.poLineField] = el.value;
    draw();
  });

  on(root, 'click', '[data-action="po-line-add"]', () => {
    if (!state.products.length) return;
    const usedIds = new Set(state.poDraft.lines.map((l) => String(l.product_id)));
    const supId = String(state.poDraft.supplier_id || '');
    const pick = state.products.find((p) => String(p.supplier_id) === supId && !usedIds.has(String(p.id)))
      || state.products.find((p) => !usedIds.has(String(p.id)))
      || state.products[0];
    state.poDraft.lines.push({
      product_id: String(pick.id),
      quantity: Math.max(1, pick.suggested_order_qty || 10),
      unit_cost: (Number(pick.unit_cost_cents || 0) / 100).toFixed(2),
    });
    draw();
  });

  on(root, 'click', '[data-action="po-line-del"]', (e, el) => {
    state.poDraft.lines.splice(Number(el.dataset.idx), 1);
    draw();
  });

  on(root, 'click', '[data-action="po-load-low-sup"]', () => {
    const supId = String(state.poDraft.supplier_id || '');
    const lows = state.products.filter((p) => String(p.supplier_id) === supId && p.is_low);
    if (!lows.length) { toast('No low-stock SKUs linked to this supplier.'); return; }
    state.poDraft.lines = lows.map((p) => ({
      product_id: String(p.id),
      quantity: Math.max(1, p.suggested_order_qty || 10),
      unit_cost: (Number(p.unit_cost_cents || 0) / 100).toFixed(2),
    }));
    toast.success(`Loaded ${lows.length} low-stock SKU(s).`);
    draw();
  });

  on(root, 'click', '[data-action="po-save"]', async (e, el) => {
    const status = el.dataset.status || 'Draft';
    const d = state.poDraft;
    if (!d.supplier_id) { toast.error('Select a supplier first.'); return; }
    if (!d.lines.length) { toast.error('Add at least one line item.'); return; }
    try {
      const res = await api.post('/api/pos', {
        supplier_id: Number(d.supplier_id),
        order_date: d.order_date || today(),
        expected_date: d.expected_date || '',
        status,
        notes: d.notes || '',
        lines: d.lines.map((l) => ({
          product_id: Number(l.product_id),
          quantity: Number(l.quantity),
          unit_cost: l.unit_cost,
        })),
      });
      state.poBuilderOpen = false;
      state.activePo = res.order;
      toast.success(`${res.order.po_number} saved (${status}).`);
      await loadScreen('/pos');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-inspect"]', async (e, el) => {
    try {
      const res = await api.get('/api/pos/detail', { id: Number(el.dataset.id) });
      state.activePo = res.order;
      draw();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-mark-ordered"]', async (e, el) => {
    try {
      const res = await api.post('/api/pos/status', { id: Number(el.dataset.id), status: 'Ordered' });
      state.activePo = res.order;
      toast.success(`${res.order.po_number} marked Ordered.`);
      await loadScreen('/pos');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-receive-dock"]', async (e, el) => {
    try {
      await openDockReceiveDialog(state, Number(el.dataset.id), { loadScreen, route: '/pos' });
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-receive-all"]', async (e, el) => {
    const id = Number(el.dataset.id);
    const ok = await confirmDialog({
      title: 'Receive all remaining stock on this PO?',
      message: 'Every unreceived line item will atomically increment product Stock on Hand and write a Purchase Order Received audit entry.',
      confirmLabel: 'Receive All Stock',
    });
    if (!ok) return;
    try {
      const res = await api.post('/api/pos/receive', { id, receive_date: today() });
      state.activePo = res.order;
      toast.success(`${res.order.po_number} received — +${res.unitsReceived} units added across ${res.movementsCreated} SKU(s).`);
      await loadScreen('/pos');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-cancel"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Cancel Purchase Order?', message: 'Marks this purchase order as Cancelled.', confirmLabel: 'Cancel PO', danger: true });
    if (!ok) return;
    try {
      const res = await api.post('/api/pos/status', { id: Number(el.dataset.id), status: 'Cancelled' });
      state.activePo = res.order;
      toast.success(`${res.order.po_number} cancelled.`);
      await loadScreen('/pos');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete Purchase Order?', message: 'Permanently removes this draft/cancelled purchase order.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.delete('/api/pos', { id: Number(el.dataset.id) });
      state.activePo = null;
      toast.success('Purchase order deleted.');
      await loadScreen('/pos');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="po-copy"]', () => {
    const po = state.activePo;
    if (!po) return;
    const cur = state.session.settings.currency || 'AUD';
    const lines = [
      `PURCHASE ORDER ${po.po_number}`,
      `From: ${state.session.settings.business_name}`,
      `To: ${po.supplier_name}${po.supplier_contact ? ' (' + po.supplier_contact + ')' : ''}`,
      `Order Date: ${po.order_date} | Expected: ${po.expected_date || 'TBC'}`,
      ``,
      ...(po.lines || []).map((l) => `- [${l.sku}] ${l.product_name} x ${l.quantity} @ ${money(l.unit_cost_cents, { currency: cur })} = ${money(l.line_total_cents, { currency: cur })}`),
      ``,
      `Subtotal (ex tax): ${money(po.total_cents, { currency: cur })}`,
      po.notes ? `Notes: ${po.notes}` : '',
    ].filter(Boolean);
    copyText(lines.join('\n'), { title: `Copy ${po.po_number}`, done: `${po.po_number} summary copied.` });
  });

  on(root, 'click', '[data-action="po-print"]', () => {
    const po = state.activePo;
    if (!po) return;
    const cfg = state.session.settings;
    const cur = cfg.currency || 'AUD';
    const taxRate = Number(cfg.tax_rate || 0);
    const taxCents = Math.round(Number(po.total_cents || 0) * (taxRate / 100));
    const grandCents = Number(po.total_cents || 0) + taxCents;

    const lineRows = (po.lines || []).map((l) => `<tr>
      <td><code>${esc(l.sku)}</code></td>
      <td><strong>${esc(l.product_name)}</strong>${l.bin_location ? `<br><small>Bin: ${esc(l.bin_location)}</small>` : ''}</td>
      <td class="num">${l.quantity}</td>
      <td class="num">${esc(money(l.unit_cost_cents, { currency: cur }))}</td>
      <td class="num"><strong>${esc(money(l.line_total_cents, { currency: cur }))}</strong></td>
    </tr>`).join('');

    downloadHtmlDoc(`${po.po_number}.html`, {
      title: `Purchase Order ${po.po_number}`,
      businessName: cfg.business_name,
      subtitle: [cfg.address, cfg.phone, cfg.email, cfg.tax_id ? `Tax ID: ${cfg.tax_id}` : ''].filter(Boolean).join(' · '),
      accent: '#1b5299',
      bodyHtml: `<div class="box" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <strong>Supplier</strong><br>
          ${esc(po.supplier_name)}<br>
          ${po.supplier_contact ? `Attn: ${esc(po.supplier_contact)}<br>` : ''}
          ${po.supplier_email ? `${esc(po.supplier_email)}<br>` : ''}
          ${po.supplier_phone ? `${esc(po.supplier_phone)}` : ''}
        </div>
        <div>
          <strong>Order Details</strong><br>
          PO Number: <strong>${esc(po.po_number)}</strong><br>
          Order Date: ${esc(po.order_date)}<br>
          Expected Delivery: ${esc(po.expected_date || 'TBC')}<br>
          Terms: ${esc(po.supplier_terms || 'Standard')} · Status: ${esc(po.status)}
        </div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Item Description</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Line Total</th></tr></thead>
        <tbody>
          ${lineRows}
          <tr><td colspan="4" class="num">Subtotal (ex tax)</td><td class="num">${esc(money(po.total_cents, { currency: cur }))}</td></tr>
          <tr><td colspan="4" class="num">Tax (${taxRate}%)</td><td class="num">${esc(money(taxCents, { currency: cur }))}</td></tr>
          <tr class="total-row"><td colspan="4" class="num">Total (${esc(cur)})</td><td class="num">${esc(money(grandCents, { currency: cur }))}</td></tr>
        </tbody>
      </table>
      ${po.notes ? `<div class="box"><strong>Delivery Instructions &amp; Notes:</strong><br>${esc(po.notes)}</div>` : ''}`,
    });
  });
}
