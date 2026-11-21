// Product Catalogue & Visual SKU Cards — Unified Masthead, Margin/Par Bars, 1-Tap (-1 Sale / +1 Receive / +Bulk / -Dmg) & Table Toggle.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const CATS = ['All', 'Apparel', 'Homewares', 'Gifts', 'Stationery', 'Jewellery', 'Seasonal'];
const PROD_CATS = ['Apparel', 'Homewares', 'Gifts', 'Stationery', 'Jewellery', 'Seasonal'];
const STATUSES = ['Active', 'Low stock', 'Discontinued'];

function marginClass(pct) {
  if (pct >= 45) return 'cf-margin--high';
  if (pct >= 25) return 'cf-margin--mid';
  return 'cf-margin--low';
}

function stockPar(p) {
  const rp = Number(p.reorder_point || 0);
  return Math.max(rp * 2, rp + 4, 1);
}

function buildReorderListText(lowItems, suppliers, businessName, cur) {
  const supById = new Map(suppliers.map((s) => [String(s.id), s]));
  const bySup = new Map();
  for (const p of lowItems) {
    const sup = supById.get(String(p.supplier_id || ''));
    const key = p.supplier_name || sup?.supplier_name || 'Unassigned Supplier';
    if (!bySup.has(key)) {
      bySup.set(key, {
        email: sup?.email || p.supplier_email || '',
        phone: sup?.phone || p.supplier_phone || '',
        items: [],
      });
    }
    bySup.get(key).items.push(p);
  }
  const lines = [`${businessName} — Supplier Reorder List (${today()})`];
  for (const [supName, group] of bySup.entries()) {
    lines.push(`\n${supName}${group.email ? ' <' + group.email + '>' : ''}${group.phone ? ' · ' + group.phone : ''}`);
    for (const p of group.items) {
      const sug = p.suggested_reorder || Math.max(1, stockPar(p) - Number(p.current_stock || 0));
      lines.push(`  - [${p.sku}] ${p.product_name}: ${p.current_stock} on hand (min ${p.reorder_point}) -> Order ${sug} @ ${money(p.cost_cents, { currency: cur })}`);
    }
  }
  return lines.join('\n');
}

function productFormFields(p = {}, suppliers = []) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">SKU</span>
        <input class="k-input" name="sku" value="${p.sku || ''}" placeholder="e.g. HOM-104" required>
      </label>
      <label class="k-field"><span class="k-field__label">Category</span>
        <select class="k-input" name="category">
          ${PROD_CATS.map((c) => html`<option value="${c}" ${c === (p.category || 'Homewares') ? 'selected' : ''}>${c}</option>`)}
        </select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Product name</span>
      <input class="k-input" name="product_name" value="${p.product_name || ''}" placeholder="e.g. Stonewashed Linen Throw (Sage)" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Supplier</span>
        <select class="k-input" name="supplier_id">
          <option value="">— No supplier linked —</option>
          ${suppliers.map((s) => html`<option value="${s.id}" ${String(s.id) === String(p.supplier_id || '') ? 'selected' : ''}>${s.supplier_name}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">
          ${STATUSES.map((st) => html`<option value="${st}" ${st === (p.status || 'Active') ? 'selected' : ''}>${st}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Cost price</span>
        <input class="k-input" type="number" step="0.01" min="0" name="cost_price" value="${p.cost_cents != null ? (p.cost_cents / 100).toFixed(2) : ''}" placeholder="0.00" required>
      </label>
      <label class="k-field"><span class="k-field__label">Retail price</span>
        <input class="k-input" type="number" step="0.01" min="0" name="retail_price" value="${p.retail_cents != null ? (p.retail_cents / 100).toFixed(2) : ''}" placeholder="0.00" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Current stock</span>
        <input class="k-input" type="number" step="1" min="0" name="current_stock" value="${p.current_stock ?? 0}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Reorder point</span>
        <input class="k-input" type="number" step="1" min="0" name="reorder_point" value="${p.reorder_point ?? 5}" required>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Shelf / merchandising notes <span class="k-field__optional">optional</span></span>
      <input class="k-input" name="notes" value="${p.notes || ''}" placeholder="Bay location, display notes…">
    </label>`;
}

export function renderProductsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const q = state.prodSearch.trim().toLowerCase();
  const allProducts = state.products || [];
  const lowProducts = allProducts.filter((p) => p.is_low);

  const statusCounts = {
    All: allProducts.length,
    'Low stock': lowProducts.length,
    Active: allProducts.filter((p) => p.status === 'Active').length,
    Discontinued: allProducts.filter((p) => p.status === 'Discontinued').length,
  };
  const catCounts = {};
  for (const c of CATS) {
    catCounts[c] = c === 'All' ? allProducts.length : allProducts.filter((p) => p.category === c).length;
  }

  const rows = allProducts.filter((p) => {
    if (state.prodCat !== 'All' && p.category !== state.prodCat) return false;
    if (state.prodStatus === 'Low stock' && !p.is_low) return false;
    if (state.prodStatus !== 'All' && state.prodStatus !== 'Low stock' && p.status !== state.prodStatus) return false;
    if (q && !(p.sku.toLowerCase().includes(q) || p.product_name.toLowerCase().includes(q) || (p.supplier_name || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const val = state.valuation || { units: 0, cost_cents: 0, retail_cents: 0, margin_pct: 0 };
  const viewMode = state.prodViewMode || 'cards';

  return html`
    <section class="cf-masthead" aria-label="Products & Shelf Inventory">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('price-tag', { size: 12 })} SKU CATALOGUE &amp; SHELF CONTROL
        </div>
        <h1 class="cf-masthead__title">Products &amp; Stock</h1>
        <div class="cf-masthead__meta">
          <span>1-tap <strong>-1 Sale</strong> / <strong>+1 Receive</strong> atomic controls</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Every change logs to Stock Ledger</span>
        </div>
      </div>

      <div class="cf-masthead__pods" style="align-items:center">
        <div class="cf-pod">
          <span class="cf-pod__lbl">${icon('box', { size: 12 })} Units on Hand</span>
          <span class="cf-pod__val">${num(val.units)}</span>
          <span class="cf-pod__sub">${allProducts.length} SKUs total</span>
        </div>
        <div class="cf-pod">
          <span class="cf-pod__lbl">At Cost</span>
          <span class="cf-pod__val">${money(val.cost_cents, { currency: cur })}</span>
          <span class="cf-pod__sub">Wholesale cost</span>
        </div>
        <div class="cf-pod cf-pod--gold">
          <span class="cf-pod__lbl">At Retail</span>
          <span class="cf-pod__val">${money(val.retail_cents, { currency: cur })}</span>
          <span class="cf-pod__sub">Shelf valuation</span>
        </div>
        <div class="cf-pod cf-pod--good">
          <span class="cf-pod__lbl">Avg Margin</span>
          <span class="cf-pod__val">${num(val.margin_pct, { decimals: 1 })}%</span>
          <span class="cf-pod__sub">Weighted GP</span>
        </div>
        <div class="cf-masthead__cta">
          ${lowProducts.length ? html`
            <button type="button" class="k-btn k-btn--glass" data-action="prod-copy-reorder">${icon('copy', { size: 14 })} Reorder (${lowProducts.length})</button>` : ''}
          <button type="button" class="k-btn k-btn--primary" data-action="prod-new">${icon('plus', { size: 15 })} New Product</button>
        </div>
      </div>
    </section>

    ${lowProducts.length ? html`
      <div class="cf-reorder-banner">
        <span class="cf-reorder-banner__copy">
          ${icon('alert', { size: 16 })}
          <span><strong>${lowProducts.length} SKU${lowProducts.length === 1 ? '' : 's'} at or below reorder point</strong> — ready to replenish with suppliers.</span>
        </span>
        <div class="tk-btn-row">
          ${state.prodStatus !== 'Low stock' ? html`<button type="button" class="k-btn k-btn--sm" data-action="prod-status" data-status="Low stock">Low Stock Only</button>` : ''}
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prod-copy-reorder">${icon('copy', { size: 13 })} Copy Reorder List</button>
        </div>
      </div>` : ''}

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="prod-search" value="${state.prodSearch}" placeholder="Search SKU, product or supplier…"></label>
      <div class="tk-segmented" role="group" aria-label="Filter by stock status">
        ${['All', 'Low stock', 'Active', 'Discontinued'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.prodStatus === st })}" data-action="prod-status" data-status="${st}">
            ${st}<span class="cf-pill-count">${statusCounts[st]}</span>
          </button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Layout view">
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'cards' })}" data-action="prod-view" data-view="cards">${icon('grid', { size: 13 })} Cards</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'table' })}" data-action="prod-view" data-view="table">${icon('list', { size: 13 })} Table</button>
      </div>
    </div>

    <div class="tk-toolbar" style="margin-top:-6px">
      <div class="tk-segmented" role="group" aria-label="Filter by category">
        ${CATS.map((c) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.prodCat === c })}" data-action="prod-cat" data-cat="${c}">
            ${c}${catCounts[c] > 0 ? html`<span class="cf-pill-count">${catCounts[c]}</span>` : ''}
          </button>`)}
      </div>
    </div>

    ${state.loading && !allProducts.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : !rows.length ? html`
      <section class="tk-sheet">${emptyState({ iconName: 'box', title: 'No products match your filter', text: 'Add SKUs with cost & retail pricing to track shelf stock and margins.' })}</section>` : viewMode === 'cards' ? html`
      <div class="cf-sku-grid">
        ${rows.map((p) => {
          const par = stockPar(p);
          const pct = Math.min(100, Math.round((Number(p.current_stock || 0) / par) * 100));
          const markPct = Math.min(96, Math.max(4, Math.round((Number(p.reorder_point || 0) / par) * 100)));
          const barTone = p.current_stock === 0 ? 'cf-stock-meter__fill--bad' : p.is_low ? 'cf-stock-meter__fill--warn' : 'cf-stock-meter__fill--ok';
          const mTone = marginClass(Number(p.margin_pct || 0));
          const cardTone = p.status === 'Discontinued' ? 'cf-sku-card--disc' : p.current_stock === 0 ? 'cf-sku-card--out' : p.is_low ? 'cf-sku-card--low' : '';
          return html`
            <article class="cf-sku-card ${cardTone}" data-key="prod-${p.id}">
              <div class="cf-sku-card__head">
                <div style="min-width:0;display:grid;gap:5px">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="cf-sku">${p.sku}</span>
                    <span class="tk-tag">${p.category}</span>
                    ${p.status === 'Discontinued' ? html`<span class="tk-tag">Discontinued</span>` : p.current_stock === 0 ? html`<span class="tk-tag tk-tag--bad">Out</span>` : p.is_low ? html`<span class="tk-tag tk-tag--warn">Low</span>` : ''}
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <h3 class="tk-card__title" style="font-size:15.5px;line-height:1.25">${p.product_name}</h3>
                  <div class="tk-card__sub" style="margin-top:0">${p.supplier_name || 'No supplier linked'}</div>
                </div>
                <div>
                  <div class="cf-sku-card__price">${money(p.retail_cents, { currency: cur })}</div>
                  <div class="tk-muted" style="font-size:11.5px;text-align:right">cost ${money(p.cost_cents, { currency: cur })}</div>
                </div>
              </div>

              <div class="cf-sku-card__body">
                <div class="cf-sku-card__metrics">
                  <div class="cf-stock-meter" style="min-width:0" title="${p.current_stock} on hand · reorder at ${p.reorder_point} · par ${par}">
                    <div class="cf-stock-meter__nums">
                      <strong>${p.current_stock} <span class="tk-muted" style="font-weight:500">/ ${par} par</span></strong>
                      <span class="tk-muted">min ${p.reorder_point}</span>
                    </div>
                    <div class="cf-stock-meter__wrap">
                      <div class="cf-stock-meter__track">
                        <div class="cf-stock-meter__fill ${barTone}" style="width:${pct}%"></div>
                      </div>
                      ${p.reorder_point > 0 ? html`<span class="cf-stock-meter__mark" style="left:${markPct}%"></span>` : ''}
                    </div>
                  </div>
                  <span class="cf-margin ${mTone}" title="Gross Margin: ${num(p.margin_pct, { decimals: 1 })}%">
                    <span class="cf-margin__dot"></span>${num(p.margin_pct, { decimals: 1 })}% GP
                  </span>
                </div>

                ${p.notes ? html`<div class="tk-muted" style="font-size:12.5px;line-height:1.4">${p.notes}</div>` : ''}

                <div class="cf-quick-adj">
                  <div class="cf-stepper-pill" role="group" aria-label="Quick stock adjustment for ${p.sku}">
                    <button type="button" class="cf-step-btn cf-step-btn--sale" data-action="prod-sale" data-id="${p.id}" ${p.current_stock <= 0 ? 'disabled' : ''}>-1 Sale</button>
                    <span class="cf-stepper-pill__sep" aria-hidden="true"></span>
                    <button type="button" class="cf-step-btn cf-step-btn--recv" data-action="prod-receive-one" data-id="${p.id}">+1 Recv</button>
                  </div>
                  <button type="button" class="cf-adj-btn cf-adj-btn--bulk" data-action="prod-receive" data-id="${p.id}">+Bulk</button>
                  <button type="button" class="cf-adj-btn cf-adj-btn--dmg" data-action="prod-damage" data-id="${p.id}" ${p.current_stock <= 0 ? 'disabled' : ''}>-Dmg</button>
                </div>

                <div class="cf-sku-card__foot">
                  <span style="font-size:11.5px;font-weight:700;color:${p.is_low ? 'var(--k-warning)' : 'var(--k-success)'}">
                    ${p.is_low ? `Suggest order +${p.suggested_reorder}` : `Shelf val ${money(p.stock_retail_cents, { currency: cur })}`}
                  </span>
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prod-count" data-id="${p.id}">Count</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prod-edit" data-id="${p.id}">Edit</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prod-del" data-id="${p.id}">Del</button>
                  </div>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`
      <section class="tk-sheet">
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr>
                <th>SKU &amp; Product</th>
                <th>Category / Supplier</th>
                <th class="tk-num">Cost / Retail</th>
                <th class="tk-num">Margin</th>
                <th>Par Level</th>
                <th>Quick Stock Adjust</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((p) => {
                const par = stockPar(p);
                const pct = Math.min(100, Math.round((Number(p.current_stock || 0) / par) * 100));
                const markPct = Math.min(96, Math.max(4, Math.round((Number(p.reorder_point || 0) / par) * 100)));
                const barTone = p.current_stock === 0 ? 'cf-stock-meter__fill--bad' : p.is_low ? 'cf-stock-meter__fill--warn' : 'cf-stock-meter__fill--ok';
                const mTone = marginClass(Number(p.margin_pct || 0));
                return html`
                  <tr data-key="prod-${p.id}">
                    <td>
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="cf-sku">${p.sku}</span>
                        <strong>${p.product_name}</strong>
                        ${p.status === 'Discontinued' ? html`<span class="tk-tag">Discontinued</span>` : p.current_stock === 0 ? html`<span class="tk-tag tk-tag--bad">Out</span>` : p.is_low ? html`<span class="tk-tag tk-tag--warn">Low</span>` : ''}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight:600">${p.category}</div>
                      <div class="tk-muted" style="font-size:12px">${p.supplier_name || '—'}</div>
                    </td>
                    <td class="tk-num">
                      <div><strong>${money(p.retail_cents, { currency: cur })}</strong></div>
                      <div class="tk-muted" style="font-size:12px">cost ${money(p.cost_cents, { currency: cur })}</div>
                    </td>
                    <td class="tk-num">
                      <span class="cf-margin ${mTone}"><span class="cf-margin__dot"></span>${num(p.margin_pct, { decimals: 1 })}%</span>
                    </td>
                    <td>
                      <div class="cf-stock-meter">
                        <div class="cf-stock-meter__nums"><strong>${p.current_stock} / ${par}</strong><span class="tk-muted">min ${p.reorder_point}</span></div>
                        <div class="cf-stock-meter__wrap">
                          <div class="cf-stock-meter__track"><div class="cf-stock-meter__fill ${barTone}" style="width:${pct}%"></div></div>
                          ${p.reorder_point > 0 ? html`<span class="cf-stock-meter__mark" style="left:${markPct}%"></span>` : ''}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div class="cf-quick-adj">
                        <div class="cf-stepper-pill">
                          <button type="button" class="cf-step-btn cf-step-btn--sale" data-action="prod-sale" data-id="${p.id}" ${p.current_stock <= 0 ? 'disabled' : ''}>-1 Sale</button>
                          <span class="cf-stepper-pill__sep"></span>
                          <button type="button" class="cf-step-btn cf-step-btn--recv" data-action="prod-receive-one" data-id="${p.id}">+1</button>
                        </div>
                        <button type="button" class="cf-adj-btn cf-adj-btn--bulk" data-action="prod-receive" data-id="${p.id}">+Bulk</button>
                        <button type="button" class="cf-adj-btn cf-adj-btn--dmg" data-action="prod-damage" data-id="${p.id}" ${p.current_stock <= 0 ? 'disabled' : ''}>-Dmg</button>
                      </div>
                    </td>
                    <td class="tk-num" style="white-space:nowrap">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prod-count" data-id="${p.id}">Count</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prod-edit" data-id="${p.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prod-del" data-id="${p.id}">Del</button>
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>
      </section>`}`;
}

export function wireProductsActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="prod-search"]', (e, el) => { state.prodSearch = el.value; draw(); });
  on(root, 'click', '[data-action="prod-cat"]', (e, el) => { state.prodCat = el.dataset.cat; draw(); });
  on(root, 'click', '[data-action="prod-status"]', (e, el) => { state.prodStatus = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="prod-view"]', (e, el) => { state.prodViewMode = el.dataset.view; draw(); });

  on(root, 'click', '[data-action="prod-copy-reorder"]', () => {
    const low = (state.products || []).filter((p) => p.is_low);
    if (!low.length) { toast('All active SKUs are above their reorder point.'); return; }
    const cur = state.session.settings.currency || 'AUD';
    const text = buildReorderListText(low, state.suppliers || [], state.session.settings.business_name, cur);
    copyText(text, { title: 'Copy Supplier Reorder List', done: `Reorder list copied (${low.length} low-stock SKUs).` });
  });

  on(root, 'click', '[data-action="prod-new"]', async () => {
    const made = await formDialog({
      title: 'New Product',
      submitLabel: 'Add product',
      fields: productFormFields({}, state.suppliers),
      onSubmit: (v) => api.post('/api/products', v),
    });
    if (made) { toast.success(`Added ${made.product.sku} to catalogue.`); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-edit"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    const saved = await formDialog({
      title: `Edit ${prod.sku}`,
      submitLabel: 'Save changes',
      fields: productFormFields(prod, state.suppliers),
      onSubmit: (v) => api.put('/api/products', { ...v, id: prod.id }),
    });
    if (saved) { toast.success('Product updated.'); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-del"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    const ok = await confirmDialog({ title: `Delete ${prod.sku}?`, message: `Removes ${prod.product_name} from the catalogue. Historical ledger movements stay on record.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/products', { id: prod.id }); toast.success('Product removed.'); await loadScreen('/products'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prod-sale"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    try {
      const res = await api.post('/api/products/adjust', {
        id: prod.id,
        movement_type: 'Sale adjustment',
        quantity_change: -1,
        reason: 'Counter sale adjustment',
        reference: 'POS-QUICK',
        move_date: today(),
      });
      toast.success(`${prod.sku}: -1 sale logged (now ${res.product.current_stock} on hand).`);
      await loadScreen('/products');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prod-receive-one"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    try {
      const res = await api.post('/api/products/adjust', {
        id: prod.id,
        movement_type: 'Delivery',
        quantity_change: 1,
        reason: 'Quick unit receive',
        reference: 'RCV-QUICK',
        move_date: today(),
      });
      toast.success(`${prod.sku}: +1 unit received (now ${res.product.current_stock} on hand).`);
      await loadScreen('/products');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prod-receive"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    const defQty = prod.suggested_reorder > 0 ? prod.suggested_reorder : 6;
    const done = await formDialog({
      title: `Receive Bulk Delivery · ${prod.sku}`,
      submitLabel: 'Receive into stock',
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">${prod.product_name} — currently <strong>${prod.current_stock}</strong> on hand (reorder point ${prod.reorder_point}).</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Quantity received</span>
            <input class="k-input" type="number" min="1" max="10000" name="quantity_change" value="${defQty}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Delivery docket / Ref</span>
            <input class="k-input" name="reference" placeholder="e.g. DN-9012">
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Staff member</span>
          <select class="k-input" name="staff_id">
            <option value="">Logged-in user (${state.session.me.displayName || 'Me'})</option>
            ${state.staff.filter((s) => s.active === 'Active').map((s) => html`<option value="${s.id}">${s.name}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Notes</span>
          <input class="k-input" name="reason" value="Supplier delivery received">
        </label>`,
      onSubmit: (v) => api.post('/api/products/adjust', {
        id: prod.id,
        movement_type: 'Delivery',
        quantity_change: Math.abs(Number(v.quantity_change || 0)),
        reference: v.reference,
        reason: v.reason,
        staff_id: v.staff_id || undefined,
        move_date: today(),
      }),
    });
    if (done) { toast.success(`${prod.sku}: +${done.movement.quantity_change} received (now ${done.product.current_stock}).`); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-damage"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    const done = await formDialog({
      title: `Write Off Damage · ${prod.sku}`,
      submitLabel: 'Record damage',
      danger: true,
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">${prod.product_name} — currently <strong>${prod.current_stock}</strong> on hand.</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Damaged units</span>
            <input class="k-input" type="number" min="1" max="${Math.max(1, prod.current_stock)}" name="qty" value="1" required>
          </label>
          <label class="k-field"><span class="k-field__label">Reference</span>
            <input class="k-input" name="reference" placeholder="e.g. DMG-022">
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Reason / what happened</span>
          <input class="k-input" name="reason" placeholder="e.g. Chipped on floor display, freight damage" required>
        </label>`,
      onSubmit: (v) => api.post('/api/products/adjust', {
        id: prod.id,
        movement_type: 'Damage',
        quantity_change: -Math.abs(Number(v.qty || 1)),
        reference: v.reference,
        reason: v.reason,
        move_date: today(),
      }),
    });
    if (done) { toast.success(`${prod.sku}: ${done.movement.quantity_change} damage logged (now ${done.product.current_stock}).`); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-count"]', async (e, el) => {
    const prod = state.products.find((p) => String(p.id) === el.dataset.id);
    if (!prod) return;
    const done = await formDialog({
      title: `Stocktake Count · ${prod.sku}`,
      submitLabel: 'Reconcile stock',
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">System expects <strong>${prod.current_stock}</strong> units of ${prod.product_name}. Enter the physical shelf count below to log the variance automatically.</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Physical count</span>
            <input class="k-input" type="number" min="0" max="100000" name="set_stock" value="${prod.current_stock}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Count sheet ref</span>
            <input class="k-input" name="reference" placeholder="e.g. CNT-NOV">
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Variance note</span>
          <input class="k-input" name="reason" placeholder="e.g. Backroom shelf recount">
        </label>`,
      onSubmit: (v) => api.post('/api/products/adjust', {
        id: prod.id,
        movement_type: 'Stock count',
        set_stock: Number(v.set_stock),
        reference: v.reference,
        reason: v.reason || 'Physical stocktake count',
        move_date: today(),
      }),
    });
    if (done) { toast.success(`${prod.sku}: reconciled to ${done.product.current_stock} units.`); await loadScreen('/products'); }
  });
}
