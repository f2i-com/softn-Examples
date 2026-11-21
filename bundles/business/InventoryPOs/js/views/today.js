// Warehouse Command Today — Deep Cobalt & Amber Masthead, In-Stock Health Conic Ring, Two-Column Reorder Radar + Pending POs Rail.
import { html, on, cls } from '../../kit/dom.js';
import { money, num } from '../../kit/format.js';
import { today, fmtDayNear, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toastError, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';
import { renderPoStepper, openDockReceiveDialog } from './pos.js';

function poTagClass(st) {
  if (st === 'Ordered') return 'tk-tag--info';
  if (st === 'Part Received') return 'tk-tag--warn';
  if (st === 'Received') return 'tk-tag--ok';
  if (st === 'Cancelled') return 'tk-tag--bad';
  return '';
}

function groupLowBySupplier(lowStock) {
  const groups = new Map();
  for (const p of lowStock) {
    const key = p.supplier_id ? `sup-${p.supplier_id}` : 'unassigned';
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: p.supplier_id || null,
        supplierName: p.supplier_name || 'Unassigned Supplier',
        leadDays: p.supplier_lead_days,
        terms: p.supplier_terms || '',
        items: [],
        estCents: 0,
        hasZero: false,
      });
    }
    const g = groups.get(key);
    g.items.push(p);
    g.estCents += Number(p.suggested_order_qty || 0) * Number(p.unit_cost_cents || 0);
    if (Number(p.stock_on_hand || 0) === 0) g.hasZero = true;
  }
  return Array.from(groups.values());
}

export function renderTodayView(state) {
  const cur = state.session.settings.currency || 'AUD';
  if (state.loading && !state.overview) {
    return html`
      <section class="ip-masthead">
        <div class="ip-masthead__copy">
          <div class="ip-masthead__eyebrow"><span class="tk-pulse-dot" style="--dot:#38bdf8"></span> WAREHOUSE CONTROL · LOADING</div>
          <h1 class="ip-masthead__title">Warehouse Command</h1>
          <div class="ip-masthead__meta">Loading live Reorder Radar alerts, incoming Purchase Orders and SKU bin valuation…</div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const ov = state.overview || {
    today: today(),
    counts: state.session.counts || {},
    lowStock: [],
    openPOs: [],
    recentMovements: [],
    byCategory: [],
  };
  const c = ov.counts || {};
  const radarGroups = groupLowBySupplier(ov.lowStock || []);

  const totalSkus = Number(c.skuCount || 0);
  const lowSkus = Number(c.lowStock || 0);
  const healthySkus = Math.max(0, totalSkus - lowSkus);
  const healthPct = totalSkus > 0 ? Math.round((healthySkus / totalSkus) * 100) : 100;
  const ringColor = healthPct >= 85 ? '#34d399' : healthPct >= 60 ? '#f59e0b' : '#f87171';

  return html`
    ${renderSampleBanner(c.sampleCount)}

    <section class="ip-masthead" aria-label="Warehouse Stock & Purchasing Control">
      <div class="ip-masthead__copy">
        <div class="ip-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${lowSkus > 0 ? '#f59e0b' : '#34d399'}"></span>
          WAREHOUSE CONTROL · ${fmtDayNear(ov.today || today()).toUpperCase()}
        </div>
        <h1 class="ip-masthead__title">${state.session.settings.business_name || 'Warehouse Command'}</h1>
        <div class="ip-masthead__meta">
          <span><strong style="color:#fde68a">${num(c.totalUnits || 0)} units</strong> across ${totalSkus} SKUs</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Sell value ${money(c.sellValueCents || 0, { currency: cur })}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click Reorder Radar POs</span>
        </div>
      </div>

      <div class="ip-masthead__pods ip-masthead__pods--3" style="align-items:center">
        <a href="#/products" class="ip-pod ip-pod--ring" title="Inspect SKU Stock Health">
          <div class="tk-ring" style="--p:${healthPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${healthPct}%</span>
          </div>
          <div>
            <span class="ip-pod__lbl">In-Stock Health</span>
            <span class="ip-pod__val">${healthySkus}/${totalSkus}</span>
            <span class="ip-pod__sub">${lowSkus === 0 ? 'All bins healthy' : `${lowSkus} on radar →`}</span>
          </div>
        </a>

        <a href="#/products" class="ip-pod">
          <span class="ip-pod__lbl">${icon('pallet-rack', { size: 12 })} At Cost</span>
          <span class="ip-pod__val">${money(c.costValueCents || 0, { currency: cur })}</span>
          <span class="ip-pod__sub">${num(c.totalUnits || 0)} units</span>
        </a>

        <a href="#/pos" class="ip-pod ip-pod--amber">
          <span class="ip-pod__lbl">${icon('clipboard', { size: 12 })} Open POs</span>
          <span class="ip-pod__val">${money(c.openPOValueCents || 0, { currency: cur })}</span>
          <span class="ip-pod__sub">${c.openPOs || 0} active order${c.openPOs === 1 ? '' : 's'} →</span>
        </a>

        <a href="#/products?low=1" class="${cls('ip-pod', { 'ip-pod--alert': lowSkus > 0, 'ip-pod--good': !lowSkus })}">
          <span class="ip-pod__lbl">${icon(lowSkus > 0 ? 'alert' : 'check-circle', { size: 12 })} Reorder</span>
          <span class="ip-pod__val">${lowSkus}</span>
          <span class="ip-pod__sub">${lowSkus > 0 ? 'Below par →' : 'Clear'}</span>
        </a>

        <div class="ip-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="today-new-po">${icon('plus', { size: 15 })} New PO</button>
        </div>
      </div>
    </section>

    <div class="ip-split">
      <div class="tk-stack" style="gap:16px">
        <section class="radar-shell">
          <div class="radar-head">
            <div class="radar-head__title">
              <span class="tk-pulse-dot" style="--dot:${ov.lowStock.length ? '#d97706' : '#16a34a'}"></span>
              <span>Reorder Radar</span>
              <span class="tk-tag ${ov.lowStock.length ? 'tk-tag--warn' : 'tk-tag--ok'}">${ov.lowStock.length} SKU${ov.lowStock.length === 1 ? '' : 's'} below par</span>
            </div>
            <a href="#/products?low=1" class="k-btn k-btn--sm">${icon('barcode-scan', { size: 14 })} Inspect SKUs</a>
          </div>
          ${radarGroups.length ? html`
            <div class="radar-grid">
              ${radarGroups.map((g) => html`
                <article class="radar-card ${g.hasZero ? 'radar-card--urgent' : ''}" data-key="rad-${g.supplierId || 'none'}">
                  <div class="radar-card__head">
                    <div>
                      <div class="radar-card__sup">${g.supplierName}</div>
                      <div class="radar-card__meta">
                        ${g.leadDays != null ? `${g.leadDays}d lead time` : 'Lead time unset'}${g.terms ? ` · ${g.terms}` : ''}
                      </div>
                    </div>
                    <span class="tk-tag ${g.hasZero ? 'tk-tag--bad' : 'tk-tag--warn'}">${g.hasZero ? 'Stockout · ' : ''}${g.items.length} SKU${g.items.length === 1 ? '' : 's'}</span>
                  </div>

                  <div class="radar-items">
                    ${g.items.map((p) => html`
                      <div class="radar-item" data-key="low-${p.id}">
                        <div class="radar-item__main">
                          <div class="radar-item__top">
                            <span class="sku-chip">${p.sku}</span>
                            <strong>${p.name}</strong>
                          </div>
                          <div class="radar-item__sub">
                            ${p.location ? html`<span class="bin-chip">${icon('pin', { size: 11 })} ${p.location}</span>` : ''}
                            <span>min ${p.reorder_point}</span>
                            <span>${money(p.unit_cost_cents, { currency: cur })}/ea</span>
                            ${p.on_order_qty > 0 ? html`<span class="tk-tag tk-tag--info">${p.on_order_qty} on order</span>` : ''}
                          </div>
                        </div>
                        <div class="radar-item__qty">
                          <span class="radar-item__stock">${p.stock_on_hand} left</span>
                          <span class="radar-item__sug">+${p.suggested_order_qty} order</span>
                        </div>
                      </div>`)}
                  </div>

                  <div class="radar-card__foot">
                    <div class="radar-card__est">
                      <span>Estimated PO</span>
                      <strong>${money(g.estCents, { currency: cur })}</strong>
                    </div>
                    ${g.supplierId ? html`
                      <button type="button" class="k-btn ip-draft-po-btn" data-action="radar-draft-supplier" data-supplier="${g.supplierId}">
                        ${icon('clipboard', { size: 14 })} Draft PO
                      </button>
                    ` : html`
                      <button type="button" class="k-btn ip-draft-po-btn" data-action="today-draft-po" data-product="${g.items[0].id}" data-supplier="">
                        ${icon('clipboard', { size: 14 })} Draft PO
                      </button>
                    `}
                  </div>
                </article>`)}
            </div>` : html`<div style="padding:8px">${emptyState({ iconName: 'check-circle', title: 'Reorder Radar clear', text: 'Every tracked warehouse SKU is currently above its reorder level.' })}</div>`}
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('layers', { size: 17 })} Inventory Valuation by Category</h2></div>
          ${ov.byCategory.length ? html`
            <div class="tk-table-wrap">
              <table class="tk-table">
                <thead><tr><th>Category</th><th class="tk-num">SKUs</th><th class="tk-num">Units</th><th class="tk-num">Cost Value</th><th class="tk-num">Sell Value</th></tr></thead>
                <tbody>
                  ${ov.byCategory.map((cat) => html`
                    <tr data-key="cat-${cat.category}">
                      <td><strong>${cat.category}</strong></td>
                      <td class="tk-num">${cat.skus}</td>
                      <td class="tk-num">${num(cat.units)}</td>
                      <td class="tk-num"><strong>${money(cat.cost_cents, { currency: cur })}</strong></td>
                      <td class="tk-num">${money(cat.sell_cents, { currency: cur })}</td>
                    </tr>`)}
                </tbody>
              </table>
            </div>` : html`<div class="tk-sheet__body"><p class="tk-muted">Add warehouse products to view valuation by category.</p></div>`}
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('dock-receive', { size: 17 })} Recent Warehouse Movements</h2>
            <div class="tk-sheet__actions"><a href="#/movements" class="k-btn k-btn--ghost k-btn--sm">Full Ledger</a></div>
          </div>
          <div>
            ${ov.recentMovements.length ? ov.recentMovements.slice(0, 6).map((m) => html`
              <div class="tk-row" data-key="tmv-${m.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="wh-delta ${m.quantity >= 0 ? 'wh-delta--in' : 'wh-delta--out'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</span>
                    <span class="sku-chip">${m.sku}</span>
                    <span>${m.product_name}</span>
                    <span class="tk-tag">${m.movement_type}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>Stock now <strong>${m.stock_after}</strong></span>
                    ${m.po_number ? html`<span class="wh-code">${m.po_number}</span>` : ''}
                    <span>${m.reason || '—'}</span>
                    <span>${ago(m.created_at)}</span>
                  </div>
                </div>
              </div>`) : html`<div class="tk-sheet__body"><p class="tk-muted">No stock movements logged yet.</p></div>`}
          </div>
        </section>
      </div>

      <aside class="ip-rail-panel" aria-label="Incoming POs and Stock Pulse">
        <section class="ip-rail-card">
          <div class="ip-rail-card__head">
            <span class="ip-rail-card__title">${icon('truck', { size: 14 })} Pending POs &amp; Dock Queue</span>
            <a href="#/pos" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${ov.openPOs.length})</a>
          </div>
          ${ov.openPOs.length ? html`
            <div class="ip-rail-list">
              ${ov.openPOs.slice(0, 5).map((po) => {
                const recPct = po.total_qty > 0 ? Math.min(100, Math.round((Number(po.received_qty || 0) / Number(po.total_qty)) * 100)) : 0;
                return html`
                  <div class="ip-rail-item" data-key="opo-${po.id}">
                    <div class="ip-rail-item__top">
                      <div style="display:grid;gap:3px;min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                          <span class="wh-code">${po.po_number}</span>
                          <span class="tk-tag ${poTagClass(po.status)}">${po.status}</span>
                        </div>
                        <div style="font-size:13.5px;font-weight:750;color:var(--k-text)">${po.supplier_name}</div>
                        <div class="tk-muted" style="font-size:11.5px">${po.expected_date ? `ETA ${fmtDayNear(po.expected_date)}` : 'ETA TBC'} · ${po.received_qty}/${po.total_qty} units</div>
                      </div>
                      <strong style="font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap">${money(po.total_cents, { currency: cur })}</strong>
                    </div>
                    ${renderPoStepper(po.status, { compact: true })}
                    <div class="tk-bar"><div class="tk-bar__fill ${recPct === 100 ? 'tk-bar__fill--ok' : recPct > 0 ? 'tk-bar__fill--warn' : ''}" style="width:${recPct}%"></div></div>
                    <div class="ip-rail-item__foot">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="today-open-po" data-id="${po.id}">Inspect PO</button>
                      ${po.status === 'Ordered' || po.status === 'Part Received' ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="today-receive-po" data-id="${po.id}">${icon('dock-receive', { size: 13 })} Receive Stock</button>
                      ` : ''}
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No pending purchase orders. Draft one from Reorder Radar.</div>`}
        </section>

        <section class="ip-rail-card">
          <div class="ip-rail-card__head">
            <span class="ip-rail-card__title">${icon('pallet-rack', { size: 14 })} Warehouse Snapshot</span>
            <a href="#/products" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Catalogue</a>
          </div>
          <div style="padding:12px 14px;display:grid;gap:8px;font-size:12.5px">
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Active SKUs</span>
              <strong style="font-variant-numeric:tabular-nums">${totalSkus} (${healthySkus} healthy)</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Inventory at Cost</span>
              <strong style="font-variant-numeric:tabular-nums">${money(c.costValueCents || 0, { currency: cur })}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Inventory Sell Value</span>
              <strong style="font-variant-numeric:tabular-nums;color:var(--k-accent)">${money(c.sellValueCents || 0, { currency: cur })}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Committed Open POs</span>
              <strong style="font-variant-numeric:tabular-nums;color:var(--k-warning)">${money(c.openPOValueCents || 0, { currency: cur })}</strong>
            </div>
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireTodayActions(root, state, { loadScreen, router }) {
  on(root, 'click', '[data-action="today-new-po"]', () => {
    state.poBuilderOpen = true;
    router.go('/pos');
  });

  on(root, 'click', '[data-action="radar-draft-supplier"]', (e, el) => {
    router.go('/pos', { draftSupplier: el.dataset.supplier });
  });

  on(root, 'click', '[data-action="today-draft-po"]', (e, el) => {
    router.go('/pos', {
      draftProduct: el.dataset.product,
      draftSupplier: el.dataset.supplier || '',
    });
  });

  on(root, 'click', '[data-action="today-open-po"]', (e, el) => {
    router.go('/pos', { openPo: el.dataset.id });
  });

  on(root, 'click', '[data-action="today-receive-po"]', async (e, el) => {
    try {
      await openDockReceiveDialog(state, Number(el.dataset.id), { loadScreen, route: '/' });
    } catch (err) { toastError(err); }
  });
}
