// Products & Stock-on-Hand — Unified Blueprint Masthead, Visual SKU Cards with Stock-vs-Par Bars, Bin Chips & Table Mode Toggle.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const CATS = ['All', 'Raw Materials', 'Components', 'Finished Goods', 'Packaging', 'Consumables', 'Accessories'];
const FORM_CATS = ['Raw Materials', 'Components', 'Finished Goods', 'Packaging', 'Consumables', 'Accessories'];
const MOVE_TYPES = ['Adjustment', 'Received', 'Sold', 'Return', 'Damaged'];

function productFormFields(p = {}, suppliers = []) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">SKU</span>
        <input class="k-input" name="sku" value="${p.sku || ''}" placeholder="e.g. CMP-1042" required>
      </label>
      <label class="k-field"><span class="k-field__label">Category</span>
        <select class="k-input" name="category">${FORM_CATS.map((c) => html`<option value="${c}" ${c === (p.category || 'Components') ? 'selected' : ''}>${c}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Product name</span>
      <input class="k-input" name="name" value="${p.name || ''}" placeholder="Descriptive warehouse product name" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Aisle / Bin location</span>
        <input class="k-input" name="location" value="${p.location || ''}" placeholder="e.g. Aisle 4, Bay B2">
      </label>
      <label class="k-field"><span class="k-field__label">Preferred supplier</span>
        <select class="k-input" name="supplier_id">
          <option value="">— No preferred supplier —</option>
          ${suppliers.map((s) => html`<option value="${s.id}" ${String(s.id) === String(p.supplier_id || '') ? 'selected' : ''}>${s.name}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Unit cost</span>
        <input class="k-input" type="number" step="0.01" min="0" name="unit_cost" value="${p.unit_cost_cents != null ? (p.unit_cost_cents / 100).toFixed(2) : ''}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Sell price <span class="k-field__optional">optional</span></span>
        <input class="k-input" type="number" step="0.01" min="0" name="sell_price" value="${p.sell_price_cents != null ? (p.sell_price_cents / 100).toFixed(2) : '0.00'}">
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Stock on hand</span>
        <input class="k-input" type="number" step="1" min="0" name="stock_on_hand" value="${p.stock_on_hand ?? 0}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Reorder point</span>
        <input class="k-input" type="number" step="1" min="0" name="reorder_point" value="${p.reorder_point ?? 10}" required>
      </label>
    </div>`;
}

export function renderProductsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const q = state.prodSearch.trim().toLowerCase();
  const allProducts = state.products || [];
  const lowCount = allProducts.filter((p) => p.is_low).length;
  const healthyCount = Math.max(0, allProducts.length - lowCount);
  const healthPct = allProducts.length ? Math.round((healthyCount / allProducts.length) * 100) : 100;
  const ringColor = healthPct >= 85 ? '#34d399' : healthPct >= 60 ? '#f59e0b' : '#f87171';
  const totalUnits = allProducts.reduce((s, p) => s + Number(p.stock_on_hand || 0), 0);
  const totalCost = allProducts.reduce((s, p) => s + Number(p.stock_cost_cents || 0), 0);
  const viewMode = state.prodViewMode || 'cards';

  const rows = allProducts.filter((p) => {
    if (state.prodCat !== 'All' && p.category !== state.prodCat) return false;
    if (state.prodSupplier !== 'All' && String(p.supplier_id || '') !== String(state.prodSupplier)) return false;
    if (state.prodOnlyLow && !p.is_low) return false;
    if (q && !(
      p.sku.toLowerCase().includes(q)
      || p.name.toLowerCase().includes(q)
      || (p.location || '').toLowerCase().includes(q)
      || (p.supplier_name || '').toLowerCase().includes(q)
    )) return false;
    return true;
  });

  return html`
    <section class="ip-masthead" aria-label="SKU Master & Bin Control">
      <div class="ip-masthead__copy">
        <div class="ip-masthead__eyebrow">
          ${icon('barcode-scan', { size: 12 })} SKU MASTER &amp; BIN CONTROL
        </div>
        <h1 class="ip-masthead__title">Products &amp; Stock-on-Hand</h1>
        <div class="ip-masthead__meta">
          <span>Search by SKU, bin location or supplier</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Adjust bin counts or draft a PO in one click</span>
        </div>
      </div>

      <div class="ip-masthead__pods ip-masthead__pods--3" style="align-items:center">
        <div class="ip-pod ip-pod--ring">
          <div class="tk-ring" style="--p:${healthPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${healthPct}%</span>
          </div>
          <div>
            <span class="ip-pod__lbl">In-Stock</span>
            <span class="ip-pod__val">${healthyCount}/${allProducts.length}</span>
            <span class="ip-pod__sub">Above par</span>
          </div>
        </div>
        <div class="ip-pod">
          <span class="ip-pod__lbl">Units</span>
          <span class="ip-pod__val">${num(totalUnits)}</span>
          <span class="ip-pod__sub">Total on hand</span>
        </div>
        <div class="ip-pod ip-pod--amber">
          <span class="ip-pod__lbl">Cost Value</span>
          <span class="ip-pod__val">${money(totalCost, { currency: cur })}</span>
          <span class="ip-pod__sub">At unit cost</span>
        </div>
        <div class="${cls('ip-pod', { 'ip-pod--alert': lowCount > 0, 'ip-pod--good': !lowCount })}">
          <span class="ip-pod__lbl">Reorder</span>
          <span class="ip-pod__val">${lowCount}</span>
          <span class="ip-pod__sub">${lowCount ? 'Need PO' : 'Clear'}</span>
        </div>
        <div class="ip-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="prod-new">${icon('plus', { size: 15 })} Add SKU</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="prod-search" value="${state.prodSearch}" placeholder="Search SKU, bin location, supplier or product…"></label>
      <select class="k-input" style="width:auto;min-height:37px;font-size:13px" data-action="prod-sup-filter" aria-label="Filter by supplier">
        <option value="All" ${state.prodSupplier === 'All' ? 'selected' : ''}>All Suppliers</option>
        ${(state.suppliers || []).map((s) => html`<option value="${s.id}" ${String(state.prodSupplier) === String(s.id) ? 'selected' : ''}>${s.name}</option>`)}
      </select>
      <button type="button" class="${cls('tk-pill', { 'is-on': state.prodOnlyLow })}" data-action="prod-low-toggle">
        Low Stock Only${lowCount > 0 ? ` (${lowCount})` : ''}
      </button>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Layout view">
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'cards' })}" data-action="prod-view" data-view="cards">${icon('grid', { size: 13 })} Cards</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'table' })}" data-action="prod-view" data-view="table">${icon('list', { size: 13 })} Table</button>
      </div>
    </div>

    <div class="tk-toolbar" style="margin-top:-6px">
      <div class="tk-segmented" role="group" aria-label="Filter by product category">
        ${CATS.map((c) => {
          const cnt = c === 'All' ? allProducts.length : allProducts.filter((p) => p.category === c).length;
          return html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.prodCat === c })}" data-action="prod-cat" data-cat="${c}">
              ${c}${cnt > 0 ? ` (${cnt})` : ''}
            </button>`;
        })}
      </div>
    </div>

    ${state.loading && !allProducts.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : !rows.length ? html`
      <section class="tk-sheet">${emptyState({ iconName: 'box', title: 'No products found', text: 'Try clearing your SKU, bin or supplier search filter, or add a new SKU.' })}</section>` : viewMode === 'cards' ? html`
      <div class="ip-sku-grid">
        ${rows.map((p) => {
          const par = Math.max(Number(p.reorder_point || 0) * 2, Number(p.reorder_point || 0) + 10, 1);
          const pct = Math.min(100, Math.round((Number(p.stock_on_hand || 0) / par) * 100));
          const markPct = Math.min(96, Math.max(4, Math.round((Number(p.reorder_point || 0) / par) * 100)));
          const barTone = p.stock_on_hand === 0 ? 'wh-meter__fill--bad' : p.is_low ? 'wh-meter__fill--warn' : 'wh-meter__fill--ok';
          const cardMod = p.stock_on_hand === 0 ? 'ip-sku-card--out' : p.is_low ? 'ip-sku-card--low' : '';
          return html`
            <article class="ip-sku-card ${cardMod}" data-key="p-${p.id}">
              <div class="ip-sku-card__head">
                <div style="min-width:0;display:grid;gap:5px">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="sku-chip">${p.sku}</span>
                    ${p.stock_on_hand === 0 ? html`<span class="tk-tag tk-tag--bad">Out</span>` : p.is_low ? html`<span class="tk-tag tk-tag--warn">Reorder</span>` : html`<span class="tk-tag tk-tag--ok">Healthy</span>`}
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <h3 class="tk-card__title" style="font-size:15.5px;line-height:1.25">${p.name}</h3>
                  <div class="tk-card__sub" style="margin-top:0">${p.category} · ${p.supplier_name || 'No supplier'}</div>
                </div>
                <div style="text-align:right;white-space:nowrap">
                  <div style="font-family:var(--k-font-display);font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">${money(p.unit_cost_cents, { currency: cur })}</div>
                  <div class="tk-muted" style="font-size:11px">${p.sell_price_cents > 0 ? `sell ${money(p.sell_price_cents, { currency: cur })}` : 'unit cost'}</div>
                </div>
              </div>

              <div class="ip-sku-card__body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                  ${p.location ? html`<span class="bin-chip">${icon('pin', { size: 11 })} ${p.location}</span>` : html`<span class="tk-muted" style="font-size:12px">Unassigned bin</span>`}
                  <span style="font-size:12px;font-weight:700;color:var(--k-muted);font-variant-numeric:tabular-nums">Bin val ${money(p.stock_cost_cents, { currency: cur })}</span>
                </div>

                <div class="wh-meter" style="min-width:0" title="${p.stock_on_hand} on hand · reorder at ${p.reorder_point} · par ${par}">
                  <div class="wh-meter__row">
                    <strong>${num(p.stock_on_hand)} <span class="tk-muted" style="font-weight:500">/ ${par} par</span></strong>
                    <span style="color:${p.is_low ? 'var(--k-warning)' : 'var(--k-muted)'};font-weight:700">min ${p.reorder_point}</span>
                  </div>
                  <div class="wh-meter__wrap">
                    <div class="wh-meter__track">
                      <div class="wh-meter__fill ${barTone}" style="width:${pct}%"></div>
                    </div>
                    ${p.reorder_point > 0 ? html`<span class="wh-meter__mark" style="left:${markPct}%"></span>` : ''}
                  </div>
                </div>

                <div class="ip-sku-card__foot">
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--sm" data-action="prod-adjust" data-id="${p.id}">Adjust</button>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prod-draft-po" data-id="${p.id}" data-supplier="${p.supplier_id || ''}">Draft PO</button>
                  </div>
                  <div class="tk-btn-row">
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
              <tr><th>SKU &amp; Product</th><th>Bin &amp; Supplier</th><th class="tk-num">Cost / Sell</th><th>Stock vs Par</th><th class="tk-num">Actions</th></tr>
            </thead>
            <tbody>
              ${rows.map((p) => {
                const par = Math.max(Number(p.reorder_point || 0) * 2, Number(p.reorder_point || 0) + 10, 1);
                const pct = Math.min(100, Math.round((Number(p.stock_on_hand || 0) / par) * 100));
                const markPct = Math.min(96, Math.max(4, Math.round((Number(p.reorder_point || 0) / par) * 100)));
                const barTone = p.stock_on_hand === 0 ? 'wh-meter__fill--bad' : p.is_low ? 'wh-meter__fill--warn' : 'wh-meter__fill--ok';
                return html`
                  <tr data-key="p-${p.id}">
                    <td>
                      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                        <span class="sku-chip">${p.sku}</span>
                        <strong>${p.name}</strong>
                        ${p.stock_on_hand === 0 ? html`<span class="tk-tag tk-tag--bad">Out</span>` : p.is_low ? html`<span class="tk-tag tk-tag--warn">Reorder</span>` : ''}
                      </div>
                      <div class="tk-muted" style="font-size:12px;margin-top:2px">${p.category}</div>
                    </td>
                    <td>
                      <div>${p.location ? html`<span class="bin-chip">${icon('pin', { size: 11 })} ${p.location}</span>` : html`<span class="tk-muted">—</span>`}</div>
                      <div class="tk-muted" style="font-size:12px;margin-top:3px">${p.supplier_name || '—'}</div>
                    </td>
                    <td class="tk-num">
                      <div><strong>${money(p.unit_cost_cents, { currency: cur })}</strong> cost</div>
                      ${p.sell_price_cents > 0 ? html`<div class="tk-muted" style="font-size:12px">sell ${money(p.sell_price_cents, { currency: cur })}</div>` : ''}
                    </td>
                    <td>
                      <div class="wh-meter">
                        <div class="wh-meter__row"><strong>${p.stock_on_hand}</strong><span class="tk-muted">min ${p.reorder_point}</span></div>
                        <div class="wh-meter__wrap">
                          <div class="wh-meter__track"><div class="wh-meter__fill ${barTone}" style="width:${pct}%"></div></div>
                          ${p.reorder_point > 0 ? html`<span class="wh-meter__mark" style="left:${markPct}%"></span>` : ''}
                        </div>
                      </div>
                    </td>
                    <td class="tk-num" style="white-space:nowrap">
                      <button type="button" class="k-btn k-btn--sm" data-action="prod-adjust" data-id="${p.id}">Adjust</button>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prod-draft-po" data-id="${p.id}" data-supplier="${p.supplier_id || ''}">Draft PO</button>
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

export function wireProductsActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="prod-search"]', (e, el) => { state.prodSearch = el.value; draw(); });
  on(root, 'change', '[data-action="prod-sup-filter"]', (e, el) => { state.prodSupplier = el.value; draw(); });
  on(root, 'click', '[data-action="prod-cat"]', (e, el) => { state.prodCat = el.dataset.cat; draw(); });
  on(root, 'click', '[data-action="prod-low-toggle"]', () => { state.prodOnlyLow = !state.prodOnlyLow; draw(); });
  on(root, 'click', '[data-action="prod-view"]', (e, el) => { state.prodViewMode = el.dataset.view; draw(); });

  on(root, 'click', '[data-action="prod-draft-po"]', (e, el) => {
    router.go('/pos', { draftProduct: el.dataset.id, draftSupplier: el.dataset.supplier || '' });
  });

  on(root, 'click', '[data-action="prod-new"]', async () => {
    const made = await formDialog({
      title: 'Add Product',
      submitLabel: 'Save SKU',
      fields: productFormFields({}, state.suppliers),
      onSubmit: (v) => api.post('/api/products', v),
    });
    if (made) { toast.success(`Added ${made.product.sku}.`); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-edit"]', async (e, el) => {
    const p = state.products.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({
      title: `Edit ${p.sku}`,
      submitLabel: 'Save changes',
      fields: productFormFields(p, state.suppliers),
      onSubmit: (v) => api.put('/api/products', { ...v, id: p.id }),
    });
    if (saved) { toast.success('Product updated.'); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-adjust"]', async (e, el) => {
    const p = state.products.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const res = await formDialog({
      title: `Manual Stock Adjustment · ${p.sku}`,
      submitLabel: 'Apply Adjustment',
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">${p.name} — currently <strong>${p.stock_on_hand}</strong> on hand (${p.location || 'no bin'}).</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Movement type</span>
            <select class="k-input" name="movement_type">${MOVE_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Quantity delta</span>
            <input class="k-input" type="number" step="1" name="quantity" placeholder="e.g. +20 or -5" required>
            <span class="k-field__hint">Positive adds stock; negative deducts.</span>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Reason / reference</span>
          <input class="k-input" name="reason" placeholder="e.g. Cycle count, dispatch order, damaged carton" required>
        </label>`,
      onSubmit: (v) => api.post('/api/products/adjust', {
        id: p.id,
        movement_type: v.movement_type,
        quantity: Number(v.quantity),
        reason: v.reason,
        move_date: today(),
      }),
    });
    if (res) { toast.success(`${p.sku}: stock now ${res.product.stock_on_hand}.`); await loadScreen('/products'); }
  });

  on(root, 'click', '[data-action="prod-del"]', async (e, el) => {
    const p = state.products.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const ok = await confirmDialog({ title: `Delete ${p.sku}?`, message: `Remove ${p.name} from the product catalogue?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/products', { id: p.id }); toast.success('Product deleted.'); await loadScreen('/products'); }
    catch (err) { toastError(err); }
  });
}
