// Store Ops Command Today — Boutique Charcoal & Terracotta-Coral Masthead, Two-Column Command + Sticky Floor Rail.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, fmtDayNear, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

function prioTag(p) {
  if (p === 'High') return 'tk-tag--bad';
  if (p === 'Medium') return 'tk-tag--warn';
  return '';
}

function retTag(s) {
  if (s === 'Open') return 'tk-tag--bad';
  if (s === 'Processing') return 'tk-tag--warn';
  if (s === 'Resolved') return 'tk-tag--ok';
  return '';
}

function marginClass(pct) {
  if (pct >= 45) return 'cf-margin--high';
  if (pct >= 25) return 'cf-margin--mid';
  return 'cf-margin--low';
}

function mvBadgeClass(t) {
  if (t === 'Delivery') return 'cf-mv-badge--delivery';
  if (t === 'Sale adjustment') return 'cf-mv-badge--sale';
  if (t === 'Return') return 'cf-mv-badge--return';
  if (t === 'Damage') return 'cf-mv-badge--damage';
  return 'cf-mv-badge--count';
}

export function renderTodayView(state) {
  const cur = state.session.settings.currency || 'AUD';
  if (state.loading && !state.overview) {
    return html`
      <section class="cf-masthead">
        <div class="cf-masthead__copy">
          <div class="cf-masthead__eyebrow"><span class="tk-pulse-dot" style="--dot:#ec6e43"></span> STORE FLOOR · LOADING</div>
          <h1 class="cf-masthead__title">CounterFlow Today</h1>
          <div class="cf-masthead__meta">Loading live shelf stock valuation, margins, reorder alerts and floor routines…</div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const ov = state.overview || {
    today: today(),
    counts: state.session.counts || {},
    lowStock: [],
    tasks: [],
    openReturns: [],
    recentMovements: [],
    categoryValuation: [],
  };
  const c = ov.counts || {};
  const tday = ov.today || today();
  const grossProfitCents = (c.retailValueCents || 0) - (c.costValueCents || 0);

  const allTasks = state.tasks || [];
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === 'Done').length;
  const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const ringColor = totalTasks > 0 && taskPct === 100 ? '#34d399' : taskPct >= 50 ? '#dfb060' : '#ec6e43';

  return html`
    ${renderSampleBanner(c.sampleCount)}

    <section class="cf-masthead" aria-label="Store Floor Command">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${c.lowStock > 0 ? '#ec6e43' : '#34d399'}"></span>
          STORE FLOOR · ${fmtDayNear(tday).toUpperCase()}
        </div>
        <h1 class="cf-masthead__title">${state.session.settings.business_name || 'CounterFlow Today'}</h1>
        <div class="cf-masthead__meta">
          <span><strong style="color:#f7d99b">${num(c.totalUnits || 0)} units</strong> on floor (${money(c.costValueCents || 0, { currency: cur })} cost)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>GP ${money(grossProfitCents, { currency: cur })}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.openReturns || 0} open return${c.openReturns === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="cf-masthead__pods cf-masthead__pods--3" style="align-items:center">
        <a href="#/tasks" class="cf-pod cf-pod--ring" title="Open Store Floor Tasks">
          <div class="tk-ring" style="--p:${taskPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${taskPct}%</span>
          </div>
          <div>
            <span class="cf-pod__lbl">Floor Tasks</span>
            <span class="cf-pod__val">${doneTasks}/${totalTasks}</span>
            <span class="cf-pod__sub">${c.overdueTasks ? `${c.overdueTasks} overdue →` : totalTasks === doneTasks && totalTasks > 0 ? 'Shift cleared' : `${Math.max(0, totalTasks - doneTasks)} to do →`}</span>
          </div>
        </a>

        <a href="#/products" class="cf-pod cf-pod--gold">
          <span class="cf-pod__lbl">${icon('price-tag', { size: 12 })} Retail Value</span>
          <span class="cf-pod__val">${money(c.retailValueCents || 0, { currency: cur })}</span>
          <span class="cf-pod__sub">${num(c.totalUnits || 0)} units →</span>
        </a>

        <div class="cf-pod">
          <span class="cf-pod__lbl">${icon('trending', { size: 12 })} Gross Margin</span>
          <span class="cf-pod__val">${num(c.marginPct || 0, { decimals: 1 })}%</span>
          <span class="cf-pod__sub">GP ${money(grossProfitCents, { currency: cur })}</span>
        </div>

        <a href="#/products?status=low" class="${cls('cf-pod', { 'cf-pod--alert': c.lowStock > 0, 'cf-pod--good': !c.lowStock })}">
          <span class="cf-pod__lbl">${icon(c.lowStock > 0 ? 'alert' : 'check-circle', { size: 12 })} Low Stock</span>
          <span class="cf-pod__val">${c.lowStock || 0}</span>
          <span class="cf-pod__sub">${c.lowStock > 0 ? 'Needs reorder →' : 'Above par'}</span>
        </a>

        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="today-log-sale">${icon('till-drawer', { size: 15 })} Log Sale</button>
          ${ov.lowStock.length ? html`
            <button type="button" class="k-btn k-btn--glass" data-action="today-print-reorder">${icon('printer', { size: 14 })} Reorder Sheet</button>` : ''}
        </div>
      </div>
    </section>

    <div class="cf-split">
      <div class="tk-stack" style="gap:16px">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('alert', { size: 17 })} Low-Stock Reorder Alerts</h2>
            <span class="tk-sheet__count">${ov.lowStock.length} SKU${ov.lowStock.length === 1 ? '' : 's'}</span>
            <div class="tk-sheet__actions">
              ${ov.lowStock.length ? html`<button type="button" class="k-btn k-btn--sm" data-action="today-copy-reorder">${icon('copy', { size: 13 })} Copy List</button>` : ''}
              <a href="#/products?status=low" class="k-btn k-btn--ghost k-btn--sm">All Products</a>
            </div>
          </div>
          <div>
            ${ov.lowStock.length ? ov.lowStock.map((p) => {
              const par = Math.max(Number(p.reorder_point || 0) * 2, Number(p.reorder_point || 0) + 4, 1);
              const pct = Math.min(100, Math.round((Number(p.current_stock || 0) / par) * 100));
              const markPct = Math.min(96, Math.max(4, Math.round((Number(p.reorder_point || 0) / par) * 100)));
              const barTone = p.current_stock === 0 ? 'cf-stock-meter__fill--bad' : 'cf-stock-meter__fill--warn';
              return html`
                <div class="tk-row" data-key="low-${p.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="cf-sku">${p.sku}</span>
                      <span>${p.product_name}</span>
                      ${p.current_stock === 0 ? html`<span class="tk-tag tk-tag--bad">Out of stock</span>` : html`<span class="tk-tag tk-tag--warn">Low</span>`}
                    </div>
                    <div class="tk-row__meta">
                      <span>${p.supplier_name || 'No supplier'}</span>
                      ${p.supplier_lead_days != null ? html`<span>${p.supplier_lead_days}d lead</span>` : ''}
                      <span>Suggest: <strong>+${p.suggested_reorder}</strong> (${money(p.suggested_reorder * p.cost_cents, { currency: cur })} cost)</span>
                    </div>
                  </div>
                  <div class="cf-stock-meter" title="${p.current_stock} on hand · reorder at ${p.reorder_point} · par ${par}">
                    <div class="cf-stock-meter__nums">
                      <strong>${p.current_stock} <span class="tk-muted" style="font-weight:500">/ ${par} par</span></strong>
                      <span class="tk-muted">${pct}%</span>
                    </div>
                    <div class="cf-stock-meter__wrap">
                      <div class="cf-stock-meter__track">
                        <div class="cf-stock-meter__fill ${barTone}" style="width:${pct}%"></div>
                      </div>
                      ${p.reorder_point > 0 ? html`<span class="cf-stock-meter__mark" style="left:${markPct}%"></span>` : ''}
                    </div>
                    <div class="cf-stock-meter__foot">
                      <span>min ${p.reorder_point}</span>
                      <span style="color:var(--k-warning);font-weight:700">order +${p.suggested_reorder}</span>
                    </div>
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="cf-adj-btn cf-adj-btn--in" data-action="today-receive" data-id="${p.id}" data-qty="${p.suggested_reorder}" data-name="${p.product_name}">+Receive</button>
                  </div>
                </div>`;
            }) : emptyState({ iconName: 'check-circle', title: 'Shelves are well stocked', text: 'Every active product is currently above its reorder point.' })}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('price-tag', { size: 17 })} Stock Valuation &amp; Category Margins</h2>
          </div>
          ${ov.categoryValuation.length ? html`
            <div class="tk-table-wrap">
              <table class="tk-table">
                <thead>
                  <tr><th>Category</th><th class="tk-num">SKUs</th><th class="tk-num">Units</th><th class="tk-num">Cost</th><th class="tk-num">Retail</th><th class="tk-num">Margin</th></tr>
                </thead>
                <tbody>
                  ${ov.categoryValuation.map((cat) => html`
                    <tr data-key="cat-${cat.category}">
                      <td><strong>${cat.category}</strong></td>
                      <td class="tk-num">${cat.skus}</td>
                      <td class="tk-num">${num(cat.units)}</td>
                      <td class="tk-num">${money(cat.cost_cents, { currency: cur })}</td>
                      <td class="tk-num"><strong>${money(cat.retail_cents, { currency: cur })}</strong></td>
                      <td class="tk-num"><span class="cf-margin ${marginClass(Number(cat.margin_pct || 0))}"><span class="cf-margin__dot"></span>${num(cat.margin_pct, { decimals: 1 })}%</span></td>
                    </tr>`)}
                </tbody>
              </table>
            </div>` : html`<div class="tk-sheet__body"><p class="tk-muted">Add products with cost &amp; retail prices to see live category margins.</p></div>`}
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('layers', { size: 17 })} Latest Stock Activity</h2>
            <div class="tk-sheet__actions"><a href="#/movements" class="k-btn k-btn--ghost k-btn--sm">Full Ledger</a></div>
          </div>
          <div>
            ${ov.recentMovements.length ? ov.recentMovements.slice(0, 6).map((m) => html`
              <div class="tk-row" data-key="tmv-${m.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="cf-delta ${m.quantity_change > 0 ? 'cf-delta--pos' : m.quantity_change < 0 ? 'cf-delta--neg' : 'cf-delta--zero'}">${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}</span>
                    <span class="cf-sku">${m.sku}</span>
                    <span>${m.product_name}</span>
                    <span class="cf-mv-badge ${mvBadgeClass(m.movement_type)}">${m.movement_type}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>Stock now <strong>${m.stock_after}</strong></span>
                    <span>${m.staff_name || 'Staff'}</span>
                    ${m.reference ? html`<span class="tk-mono">${m.reference}</span>` : ''}
                    <span>${ago(m.created_at)}</span>
                  </div>
                </div>
              </div>`) : html`<div class="tk-sheet__body"><p class="tk-muted">No stock movements logged yet.</p></div>`}
          </div>
        </section>
      </div>

      <aside class="cf-rail-panel" aria-label="Floor Tasks and Returns Queue">
        <section class="cf-rail-card">
          <div class="cf-rail-card__head">
            <span class="cf-rail-card__title">${icon('check-square', { size: 14 })} Floor Shift Tasks</span>
            <a href="#/tasks" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${totalTasks})</a>
          </div>
          ${totalTasks > 0 ? html`
            <div style="padding:10px 14px;border-bottom:1px solid color-mix(in srgb, var(--k-border) 75%, transparent);display:grid;gap:5px">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:750">
                <span class="tk-muted">Shift progress</span>
                <span style="color:${taskPct === 100 ? 'var(--k-success)' : 'var(--k-accent)'}">${doneTasks}/${totalTasks} (${taskPct}%)</span>
              </div>
              <div class="tk-bar"><div class="tk-bar__fill ${taskPct === 100 ? 'tk-bar__fill--ok' : ''}" style="width:${taskPct}%"></div></div>
            </div>` : ''}
          ${ov.tasks.length ? html`
            <div class="cf-rail-list">
              ${ov.tasks.slice(0, 5).map((tk) => {
                const overdue = tk.due_date && tk.due_date < tday;
                return html`
                  <div class="cf-rail-item cf-rail-item--${tk.priority.toLowerCase()}" data-key="ttk-${tk.id}">
                    <div class="cf-rail-item__top">
                      <div>
                        <div class="cf-rail-item__name">${tk.task_title}</div>
                        <div class="cf-rail-item__sub">${tk.routine} · ${tk.area}${tk.assigned_name ? ` · ${tk.assigned_name}` : ''}</div>
                      </div>
                      <span class="tk-tag ${overdue ? 'tk-tag--bad' : prioTag(tk.priority)}">${overdue ? 'Overdue' : tk.priority}</span>
                    </div>
                    <div class="cf-rail-item__foot">
                      <span class="tk-muted" style="font-size:11.5px">${tk.due_date ? `Due ${fmtDayNear(tk.due_date)}` : 'No due date'}</span>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="today-task-done" data-id="${tk.id}">${icon('check', { size: 13 })} Done</button>
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All floor shift tasks cleared ✓</div>`}
        </section>

        <section class="cf-rail-card">
          <div class="cf-rail-card__head">
            <span class="cf-rail-card__title">${icon('refresh', { size: 14 })} Counter Returns</span>
            <a href="#/returns" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Desk (${ov.openReturns.length})</a>
          </div>
          ${ov.openReturns.length ? html`
            <div class="cf-rail-list">
              ${ov.openReturns.slice(0, 4).map((rt) => html`
                <div class="cf-rail-item" data-key="trt-${rt.id}">
                  <div class="cf-rail-item__top">
                    <div>
                      <div class="cf-rail-item__name">${rt.customer_name}</div>
                      <div class="cf-rail-item__sub">${rt.sku ? `${rt.sku} · ` : ''}${rt.product_name}</div>
                    </div>
                    <strong style="font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap">${money(rt.amount_cents, { currency: cur })}</strong>
                  </div>
                  <div class="cf-rail-item__foot">
                    <span class="tk-tag ${retTag(rt.status)}">${rt.issue_type} · ${rt.resolution_type}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="today-ret-resolve" data-id="${rt.id}">Resolve ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No open returns or exchanges at the till.</div>`}
        </section>

        <section class="cf-rail-card">
          <div class="cf-rail-card__head">
            <span class="cf-rail-card__title">${icon('shop-awning', { size: 14 })} Shelf Snapshot</span>
            <a href="#/products" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Catalogue</a>
          </div>
          <div style="padding:12px 14px;display:grid;gap:8px;font-size:12.5px">
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Inventory at Cost</span>
              <strong style="font-variant-numeric:tabular-nums">${money(c.costValueCents || 0, { currency: cur })}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Inventory at Retail</span>
              <strong style="font-variant-numeric:tabular-nums;color:var(--k-accent)">${money(c.retailValueCents || 0, { currency: cur })}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span class="tk-muted">Potential Gross Profit</span>
              <strong style="font-variant-numeric:tabular-nums;color:var(--k-success)">${money(grossProfitCents, { currency: cur })}</strong>
            </div>
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireTodayActions(root, state, { loadScreen }) {
  on(root, 'click', '[data-action="today-log-sale"]', async () => {
    try {
      let prods = state.products || [];
      if (!prods.length) {
        const res = await api.get('/api/products');
        prods = res.products || [];
        state.products = prods;
      }
      const inStock = prods.filter((p) => p.status !== 'Discontinued' && Number(p.current_stock || 0) > 0);
      if (!inStock.length) {
        toast.error('No products with stock on hand available to log a sale.');
        return;
      }
      const cur = state.session.settings.currency || 'AUD';
      const done = await formDialog({
        title: 'Log Counter Sale',
        submitLabel: 'Record Sale & Deduct Stock',
        fields: html`
          <label class="k-field"><span class="k-field__label">Product sold</span>
            <select class="k-input" name="product_id" required>
              ${inStock.map((p) => html`<option value="${p.id}">[${p.sku}] ${p.product_name} · ${money(p.retail_cents, { currency: cur })} (${p.current_stock} on hand)</option>`)}
            </select>
          </label>
          <div class="k-form__row">
            <label class="k-field"><span class="k-field__label">Quantity sold</span>
              <input class="k-input" type="number" min="1" max="1000" name="qty" value="1" required>
            </label>
            <label class="k-field"><span class="k-field__label">Till / Receipt ref</span>
              <input class="k-input" name="reference" placeholder="e.g. POS-1042">
            </label>
          </div>
          <label class="k-field"><span class="k-field__label">Staff member</span>
            <select class="k-input" name="staff_id">
              <option value="">Logged-in user (${state.session.me.displayName || 'Me'})</option>
              ${(state.staff || []).filter((s) => s.active === 'Active').map((s) => html`<option value="${s.id}">${s.name}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Note <span class="k-field__optional">optional</span></span>
            <input class="k-input" name="reason" value="Boutique counter sale">
          </label>`,
        onSubmit: (v) => api.post('/api/products/adjust', {
          id: Number(v.product_id),
          movement_type: 'Sale adjustment',
          quantity_change: -Math.abs(Number(v.qty || 1)),
          reference: v.reference || 'POS-TILL',
          reason: v.reason || 'Boutique counter sale',
          staff_id: v.staff_id || undefined,
          move_date: today(),
        }),
      });
      if (done) {
        toast.success(`${done.product.sku}: logged sale (${done.movement.quantity_change}, now ${done.product.current_stock} on hand).`);
        await loadScreen('/');
      }
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="today-task-done"]', async (e, el) => {
    try {
      await api.post('/api/tasks/status', { id: Number(el.dataset.id), status: 'Done' });
      toast.success('Task marked Done.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="today-ret-resolve"]', async (e, el) => {
    try {
      await api.post('/api/returns/status', { id: Number(el.dataset.id), status: 'Resolved' });
      toast.success('Return case resolved.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="today-receive"]', async (e, el) => {
    const id = Number(el.dataset.id);
    const sug = Number(el.dataset.qty) || 6;
    const name = el.dataset.name || 'Product';
    const done = await formDialog({
      title: `Receive Delivery · ${name}`,
      submitLabel: 'Receive & Log Movement',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Quantity received</span>
            <input class="k-input" type="number" min="1" max="10000" name="quantity_change" value="${sug}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Delivery docket / Ref</span>
            <input class="k-input" name="reference" placeholder="e.g. DN-9012">
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span>
          <input class="k-input" name="reason" value="Supplier restock delivery">
        </label>`,
      onSubmit: (vals) => api.post('/api/products/adjust', {
        id,
        movement_type: 'Delivery',
        quantity_change: Math.abs(Number(vals.quantity_change || 0)),
        reference: vals.reference,
        reason: vals.reason,
        move_date: today(),
      }),
    });
    if (done) { toast.success(`Received +${done.movement.quantity_change} units into stock.`); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="today-copy-reorder"]', () => {
    const low = state.overview?.lowStock || [];
    const cur = state.session.settings.currency || 'AUD';
    const bySup = new Map();
    for (const p of low) {
      const sup = p.supplier_name || 'Unassigned Supplier';
      if (!bySup.has(sup)) bySup.set(sup, { email: p.supplier_email || '', phone: p.supplier_phone || '', items: [] });
      bySup.get(sup).items.push(p);
    }
    const blocks = [`${state.session.settings.business_name} — Supplier Reorder List (${today()})`];
    for (const [sup, group] of bySup.entries()) {
      blocks.push(`\n${sup}${group.email ? ' <' + group.email + '>' : ''}${group.phone ? ' · ' + group.phone : ''}`);
      for (const p of group.items) {
        blocks.push(`  - [${p.sku}] ${p.product_name}: on hand ${p.current_stock} (min ${p.reorder_point}) -> Order ${p.suggested_reorder} @ ${money(p.cost_cents, { currency: cur })}`);
      }
    }
    copyText(blocks.join('\n'), { title: 'Copy Supplier Reorder List', done: 'Supplier reorder list copied.' });
  });

  on(root, 'click', '[data-action="today-print-reorder"]', () => {
    const low = state.overview?.lowStock || [];
    const cur = state.session.settings.currency || 'AUD';
    let grandCost = 0;
    const rowsHtml = low.map((p) => {
      const est = p.suggested_reorder * p.cost_cents;
      grandCost += est;
      return `<tr>
        <td><code>${esc(p.sku)}</code></td>
        <td><strong>${esc(p.product_name)}</strong><br><small>${esc(p.supplier_name || 'No supplier')}</small></td>
        <td class="num">${p.current_stock} / ${p.reorder_point}</td>
        <td class="num"><strong>${p.suggested_reorder}</strong></td>
        <td class="num">${esc(money(p.cost_cents, { currency: cur }))}</td>
        <td class="num">${esc(money(est, { currency: cur }))}</td>
      </tr>`;
    }).join('');
    downloadHtmlDoc(`reorder-sheet-${today()}.html`, {
      title: `Low-Stock Reorder Sheet · ${today()}`,
      businessName: state.session.settings.business_name,
      subtitle: `${low.length} SKUs at or below reorder point`,
      accent: '#c84b24',
      bodyHtml: `<table>
        <thead><tr><th>SKU</th><th>Product &amp; Supplier</th><th class="num">Stock / Min</th><th class="num">Suggest Qty</th><th class="num">Unit Cost</th><th class="num">Est. Cost</th></tr></thead>
        <tbody>${rowsHtml}<tr class="total-row"><td colspan="5">Estimated Reorder Total (at cost)</td><td class="num">${esc(money(grandCost, { currency: cur }))}</td></tr></tbody>
      </table>`,
    });
  });
}
