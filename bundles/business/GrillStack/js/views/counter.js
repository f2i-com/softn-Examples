// Live Order Counter POS — cast-iron masthead, icon-medallion burger tiles w/ build teasers,
// compact above-the-fold QSR docket w/ glowing RUSH switch, quick-ring favorites, live order stepper & 1-click repeat.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, ago, fmtDay, fmtDateTime } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const CATS = ['All', 'Burger', 'Combo', 'Side', 'Drink', 'Dessert'];
const ORDER_TYPES = ['Takeaway', 'Dine-in', 'Delivery'];
const DINE_IN_CHIPS = ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Booth 1'];
const DELIVERY_CHIPS = ['UberEats #', 'DoorDash #', 'Menulog #'];
const BURGER_MODS = [
  'No pickles',
  'No onion',
  'Extra cheese (+$1.50)',
  'Add bacon (+$2.50)',
  'GF bun (+$2.00)',
  'Combo (+$4.50)',
  'Extra sauce',
  'Well done',
  'Plant swap',
];
const QUICK_CHIPS = [
  { label: 'No Pickles', mod: 'No pickles' },
  { label: 'Extra Cheese', mod: 'Extra cheese (+$1.50)' },
  { label: 'GF Bun', mod: 'GF bun (+$2.00)' },
  { label: 'Combo', mod: 'Combo (+$4.50)' },
];
const MOD_SURCHARGE = {
  'Extra cheese (+$1.50)': 150,
  'Add bacon (+$2.50)': 250,
  'GF bun (+$2.00)': 200,
  'Combo (+$4.50)': 450,
};
const STATUS_NEXT = { New: 'Preparing', Preparing: 'Ready', Ready: 'Collected' };
const STATUS_CLASS = { New: 'tk-tag--warn', Preparing: 'tk-tag--info', Ready: 'tk-tag--ok', Collected: '', Cancelled: 'tk-tag--bad' };
const STATUS_STEP = { New: 1, Preparing: 2, Ready: 3, Collected: 3, Cancelled: 0 };

function stationBadgeClass(station) {
  if (station === 'Grill') return 'gs-station-pill gs-station--grill';
  if (station === 'Fryer') return 'gs-station-pill gs-station--fryer';
  if (station === 'Drinks') return 'gs-station-pill gs-station--drinks';
  return 'gs-station-pill gs-station--assembly';
}

function catTileClass(category) {
  const slug = String(category || 'burger').toLowerCase();
  if (slug === 'combo') return 'gs-tile--combo';
  if (slug === 'side') return 'gs-tile--side';
  if (slug === 'drink') return 'gs-tile--drink';
  if (slug === 'dessert') return 'gs-tile--dessert';
  return 'gs-tile--burger';
}

function catIconName(category) {
  const slug = String(category || 'burger').toLowerCase();
  if (slug === 'combo') return 'combo';
  if (slug === 'side') return 'fries';
  if (slug === 'drink') return 'shake';
  if (slug === 'dessert') return 'sundae';
  return 'burger';
}

function recalcLinePrice(line) {
  let extra = 0;
  for (const m of line.mods || []) extra += MOD_SURCHARGE[m] || 0;
  line.price_cents = (line.base_price_cents != null ? line.base_price_cents : line.price_cents) + extra;
}

function pickQuickFavorites(menu) {
  if (!menu || !menu.length) return [];
  const preferred = ['Double Smash Stack', 'Smash Combo', 'Loaded Truffle Fries'];
  const picked = [];
  for (const needle of preferred) {
    const found = menu.find((m) => m.item_name.toLowerCase().includes(needle.toLowerCase()) && !picked.includes(m));
    if (found) picked.push(found);
  }
  for (const item of menu) {
    if (picked.length >= 3) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.slice(0, 3);
}

function shortFavLabel(name) {
  if (!name) return '';
  const paren = name.indexOf('(');
  return (paren > 0 ? name.slice(0, paren) : name).trim();
}

function printCustomerReceipt(order, settings) {
  const cur = settings.currency || 'AUD';
  const taxRate = Number(settings.tax_rate ?? 10);
  const total = Number(order.total_cents || 0);
  const taxIncluded = taxRate > 0 ? Math.round(total - total / (1 + taxRate / 100)) : 0;
  const items = Array.isArray(order.items) && order.items.length
    ? order.items
    : [{ name: order.items_summary || 'Order items', qty: 1, price_cents: total, mods: [] }];

  const rowsHtml = items.map((it) => {
    const qty = Number(it.qty || 1);
    const lineCents = Number(it.price_cents || 0) * qty;
    const modList = Array.isArray(it.mods) && it.mods.length
      ? `<div style="font-size:12px;color:#52525b;margin-top:2px">${esc(it.mods.join(' · '))}</div>`
      : '';
    return `<tr>
      <td><strong>${qty}× ${esc(it.name)}</strong>${modList}</td>
      <td class="num">${money(it.price_cents || 0, { currency: cur })}</td>
      <td class="num"><strong>${money(lineCents, { currency: cur })}</strong></td>
    </tr>`;
  }).join('');

  const contactBits = [settings.address, settings.phone, settings.tax_id].filter(Boolean).join(' · ');

  downloadHtmlDoc(`receipt-${order.order_number || order.id}.html`, {
    title: `Customer Receipt · ${order.order_number}`,
    businessName: settings.business_name || 'GrillStack',
    subtitle: contactBits || `${order.order_type} · ${fmtDateTime(order.created_at)}`,
    accent: '#c8231a',
    bodyHtml: `
      <div class="box" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;color:#52525b;font-weight:700">Order #</div>
          <div style="font-size:20px;font-weight:800">${esc(order.order_number)} ${order.priority === 'Rush' ? '· RUSH' : ''}</div>
        </div>
        <div>
          <div style="font-size:12px;text-transform:uppercase;color:#52525b;font-weight:700">Customer</div>
          <div style="font-weight:700">${esc(order.customer_name || 'Walk-in')} (${esc(order.order_type)})</div>
        </div>
        <div>
          <div style="font-size:12px;text-transform:uppercase;color:#52525b;font-weight:700">Time</div>
          <div>${esc(fmtDateTime(order.created_at) || order.order_day || today())}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Unit</th><th class="num">Line Total</th></tr></thead>
        <tbody>
          ${rowsHtml}
          ${taxRate > 0 ? `<tr><td colspan="2" style="color:#52525b">Includes GST / Tax (${taxRate}%)</td><td class="num" style="color:#52525b">${money(taxIncluded, { currency: cur })}</td></tr>` : ''}
          <tr class="total-row"><td colspan="2">Total Paid</td><td class="num">${money(total, { currency: cur })}</td></tr>
        </tbody>
      </table>
      ${order.notes ? `<div class="box"><strong>Kitchen / Customer Notes:</strong> ${esc(order.notes)}</div>` : ''}
      <p style="text-align:center;color:#71717a;font-size:13px;margin-top:24px">Thanks for dining with ${esc(settings.business_name || 'us')}!</p>`,
  });
}

export function renderCounterView(state) {
  const settings = state.session.settings;
  const currency = settings.currency || 'AUD';
  const taxRate = Number(settings.tax_rate ?? 10);
  const counts = state.session.counts || {};
  const nextOrderCode = `G-${Number(settings.order_seq || 100) + 1}`;
  const avgTicketCents = counts.todayOrdersCount > 0 ? Math.round((counts.todaySalesCents || 0) / counts.todayOrdersCount) : 0;

  // Category counts for segmented tabs
  const catCounts = new Map();
  for (const m of state.menu) catCounts.set(m.category, (catCounts.get(m.category) || 0) + 1);

  const menuQ = (state.posSearch || '').trim().toLowerCase();
  const visibleMenu = state.menu.filter((m) => {
    if (state.posCat !== 'All' && m.category !== state.posCat) return false;
    if (menuQ) {
      const hay = `${m.item_name} ${m.category} ${m.prep_station} ${(m.ingredients || []).join(' ')}`.toLowerCase();
      if (!hay.includes(menuQ)) return false;
    }
    return true;
  });

  const docketTotal = state.docket.reduce((sum, l) => sum + l.price_cents * l.qty, 0);
  const docketCount = state.docket.reduce((n, l) => n + l.qty, 0);
  const docketTax = taxRate > 0 ? Math.round(docketTotal - docketTotal / (1 + taxRate / 100)) : 0;
  const docketExTax = Math.max(0, docketTotal - docketTax);

  const qtyByMenuId = new Map();
  for (const line of state.docket) {
    qtyByMenuId.set(line.menuId, (qtyByMenuId.get(line.menuId) || 0) + line.qty);
  }

  const quickFavs = pickQuickFavorites(state.menu);
  const isRush = state.docketPriority === 'Rush';
  const quickTargetChips = state.docketType === 'Dine-in'
    ? DINE_IN_CHIPS
    : state.docketType === 'Delivery'
      ? DELIVERY_CHIPS
      : [];

  const q = (state.orderSearch || '').trim().toLowerCase();
  const visibleOrders = state.orders.filter((o) => {
    if (state.orderFilter === 'Active' && (o.status === 'Collected' || o.status === 'Cancelled')) return false;
    if (q) {
      const hay = `${o.order_number} ${o.customer_name} ${o.items_summary} ${o.order_type} ${o.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeBoardCount = state.orders.filter((o) => o.status !== 'Collected' && o.status !== 'Cancelled').length;

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="gs-masthead" aria-label="Service Command">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f97316"></span>
          GRILL HOT · SERVICE OPEN · ${fmtDay(today())}
        </div>
        <h1 class="gs-masthead__title">Order Counter</h1>
        <div class="gs-masthead__meta">
          <span>Next ticket <strong style="color:#fde68a;font-family:var(--k-font-mono)">${nextOrderCode}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Avg check <strong style="color:#ffffff">${money(avgTicketCents, { currency })}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Auto-splits to Grill, Fryer, Assembly &amp; Shake</span>
        </div>
      </div>

      <div class="gs-masthead__pods">
        <div class="gs-pod gs-pod--gold">
          <span class="gs-pod__lbl">${icon('trending', { size: 12 })} Today's Sales</span>
          <span class="gs-pod__val">${money(counts.todaySalesCents || 0, { currency })}</span>
          <span class="gs-pod__sub">${counts.todayOrdersCount || 0} order${counts.todayOrdersCount === 1 ? '' : 's'} fired</span>
        </div>
        <a href="#/kds" class="${cls('gs-pod', counts.rushTickets > 0 ? 'gs-pod--rush' : '')}">
          <span class="gs-pod__lbl">${icon(counts.rushTickets > 0 ? 'zap' : 'flame', { size: 12 })} Kitchen Pass</span>
          <span class="gs-pod__val">${counts.openTickets || 0}</span>
          <span class="gs-pod__sub">${counts.rushTickets > 0 ? `${counts.rushTickets} Rush on board →` : 'Open live KDS →'}</span>
        </a>
        <a href="#/stock" class="${cls('gs-pod', counts.lowStock > 0 ? 'gs-pod--alert' : '')}">
          <span class="gs-pod__lbl">${icon('box', { size: 12 })} Prep Par</span>
          <span class="gs-pod__val">${counts.lowStock || 0}</span>
          <span class="gs-pod__sub">${counts.lowStock > 0 ? 'Low / Out lines →' : 'All lines at par'}</span>
        </a>
        <a href="#/close" class="gs-pod">
          <span class="gs-pod__lbl">${icon('clipboard', { size: 12 })} Open Orders</span>
          <span class="gs-pod__val">${activeBoardCount}</span>
          <span class="gs-pod__sub">Till closeout →</span>
        </a>
      </div>
    </section>

    <div class="gs-pos">
      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="gs-menu-bar">
            <div class="tk-segmented" role="tablist" aria-label="Menu category filter">
              ${CATS.map((c) => {
                const n = c === 'All' ? state.menu.length : (catCounts.get(c) || 0);
                return html`
                  <button type="button" class="${cls('tk-pill', { 'is-on': state.posCat === c })}" data-action="pos-cat" data-cat="${c}">
                    ${c} <span style="opacity:.65;font-size:11px;margin-left:2px">${n}</span>
                  </button>`;
              })}
            </div>
            <label class="gs-menu-search">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="pos-search" value="${state.posSearch || ''}" placeholder="Quick find item…">
            </label>
          </div>
          <div class="tk-sheet__body">
            ${state.loading && !state.menu.length ? skeleton(3) : visibleMenu.length ? html`
              <div class="gs-menu-grid">
                ${visibleMenu.map((item) => {
                  const inDocket = qtyByMenuId.get(item.id) || 0;
                  const buildTeaser = Array.isArray(item.ingredients) && item.ingredients.length
                    ? item.ingredients.slice(0, 4).join(' · ')
                    : `${item.prep_station} · Made to order`;
                  return html`
                    <button type="button" class="${cls('gs-tile pos-tile', catTileClass(item.category), { 'gs-tile--in-docket': inDocket > 0 })}" data-key="menu-${item.id}" data-action="pos-add" data-id="${item.id}">
                      ${inDocket > 0 ? html`<span class="gs-tile__qty">×${inDocket}</span>` : ''}
                      <div class="gs-tile__top">
                        <span class="gs-tile__ico">${icon(catIconName(item.category), { size: 18 })}</span>
                        <div class="gs-tile__copy">
                          <span class="gs-tile__name" title="${item.item_name}">${item.item_name}</span>
                          <span class="gs-tile__price">${money(item.price_cents, { currency })}</span>
                        </div>
                      </div>
                      <div class="gs-tile__build">${buildTeaser}</div>
                      <div class="gs-tile__foot">
                        <span class="${stationBadgeClass(item.prep_station)}">${item.prep_station}</span>
                        <span style="font-size:11px;font-weight:700;color:var(--k-muted)">${item.category}</span>
                      </div>
                    </button>`;
                })}
              </div>` : emptyState({
                iconName: 'burger',
                title: menuQ ? 'No matching menu items' : 'No active menu items here',
                text: menuQ ? 'Try a different burger, side, or ingredient keyword.' : 'Add burgers, fries, combos or shakes on Menu & Builds.',
                action: menuQ
                  ? html`<button type="button" class="k-btn k-btn--sm" data-action="pos-search-clear">Clear search</button>`
                  : html`<a href="#/menu" class="k-btn k-btn--primary k-btn--sm">Open Menu &amp; Builds</a>`,
              })}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('receipt', { size: 18 })} Live Order Board</h2>
            <span class="tk-sheet__count">${visibleOrders.length}</span>
            <div class="tk-sheet__actions">
              <label class="gs-menu-search" style="max-width:220px">
                ${icon('search', { size: 14 })}
                <input type="search" data-action="order-search" value="${state.orderSearch || ''}" placeholder="Search #order, name, item…">
              </label>
              <div class="tk-segmented">
                <button type="button" class="${cls('tk-pill', { 'is-on': state.orderFilter === 'Active' })}" data-action="order-filter" data-filter="Active">Active (${activeBoardCount})</button>
                <button type="button" class="${cls('tk-pill', { 'is-on': state.orderFilter === 'All' })}" data-action="order-filter" data-filter="All">All Today (${state.orders.length})</button>
              </div>
            </div>
          </div>
          <div>
            ${state.loading && !state.orders.length ? skeleton(3) : visibleOrders.length ? visibleOrders.map((o) => {
              const step = STATUS_STEP[o.status] || 0;
              const isReady = o.status === 'Ready' || o.status === 'Collected';
              return html`
                <div class="${cls('gs-order-card', { 'gs-order-card--rush': o.priority === 'Rush' && o.status !== 'Collected', 'gs-order-card--ready': o.status === 'Ready' })}" data-key="ord-${o.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="gs-order-code">${o.order_number}</span>
                      ${o.priority === 'Rush' ? html`<span class="gs-rush-banner">${icon('zap', { size: 11 })} RUSH</span>` : ''}
                      <span>${o.customer_name}</span>
                      <span class="tk-tag ${STATUS_CLASS[o.status] || ''}">${o.status}</span>
                      <span class="tk-tag">${o.order_type}</span>
                      ${o.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      <span>${o.items_summary}</span>
                      <span><strong>${money(o.total_cents, { currency })}</strong></span>
                      <span>${ago(o.created_at)}</span>
                      ${o.notes ? html`<span style="color:#991b1b;font-weight:650">Note: ${o.notes}</span>` : ''}
                    </div>
                    ${o.status !== 'Cancelled' ? html`
                      <div class="gs-order-steps" title="Order progress: New → Preparing → Ready">
                        <span class="${cls('gs-step-dot', { 'is-done': step >= 1, 'is-ready': isReady })}"></span>
                        <span class="${cls('gs-step-dot', { 'is-done': step >= 2, 'is-ready': isReady })}"></span>
                        <span class="${cls('gs-step-dot', { 'is-done': step >= 3, 'is-ready': isReady })}"></span>
                        <span style="font-size:10.5px;color:var(--k-muted);font-weight:700;margin-left:4px">${o.status}</span>
                      </div>` : ''}
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="order-repeat" data-id="${o.id}" title="Load these items into Current Docket">${icon('refresh', { size: 13 })} Repeat</button>
                    <button type="button" class="k-btn k-btn--sm" data-action="order-receipt" data-id="${o.id}" title="Printable customer receipt">${icon('printer', { size: 13 })} Receipt</button>
                    ${STATUS_NEXT[o.status] ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="order-status" data-id="${o.id}" data-status="${STATUS_NEXT[o.status]}">
                        Mark ${STATUS_NEXT[o.status]}
                      </button>` : ''}
                    ${o.status !== 'Collected' && o.status !== 'Cancelled' ? html`
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="order-status" data-id="${o.id}" data-status="Cancelled">Cancel</button>` : ''}
                  </div>
                </div>`;
            }) : emptyState({ iconName: 'receipt', title: q ? 'No matching orders' : 'Order board is clear', text: q ? 'Try another order number, customer name or item keyword.' : 'Tap menu tiles to build an order and auto-fire station tickets to Grill, Fryer and Assembly.' })}
          </div>
        </section>
      </div>

      <section class="${cls('tk-sheet gs-docket', { 'gs-docket--rush': isRush })}" aria-label="Current order docket">
        <div class="gs-docket__head">
          <span class="gs-docket__stub">${nextOrderCode}</span>
          <h2 class="tk-sheet__title" style="color:#ffffff;font-size:15.5px">Current Docket</h2>
          ${docketCount > 0 ? html`<span class="tk-sheet__count" style="background:rgba(255,255,255,.14);color:#ffffff">${docketCount}</span>` : ''}
          ${state.docket.length ? html`<button type="button" class="k-btn k-btn--glass k-btn--sm" style="margin-left:auto" data-action="docket-clear">Clear</button>` : ''}
        </div>
        <div class="gs-docket__body">
          <div class="tk-segmented gs-docket__types">
            ${ORDER_TYPES.map((tp) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.docketType === tp })}" data-action="docket-type" data-type="${tp}">${tp}</button>`)}
          </div>

          <button type="button" class="${cls('gs-rush-toggle', { 'is-rush': isRush })}" data-action="toggle-rush" role="switch" aria-checked="${isRush ? 'true' : 'false'}">
            <span class="gs-rush-toggle__copy">
              ${icon('zap', { size: 15 })}
              <span>
                <span style="display:block;line-height:1.15">${isRush ? 'RUSH PRIORITY ON' : 'RUSH Order Switch'}</span>
                <span class="gs-rush-toggle__sub">${isRush ? 'Jumps to front of Grill & Pass' : 'Priority fire for VIP / short break'}</span>
              </span>
            </span>
            <span class="gs-rush-switch"><span class="gs-rush-switch__thumb"></span></span>
          </button>

          <label class="k-field" style="gap:4px">
            <span class="k-field__label">${state.docketType === 'Dine-in' ? 'Table / Guest name' : state.docketType === 'Delivery' ? 'Delivery platform & #' : 'Customer name / Buzzer #'}</span>
            <input class="k-input" data-docket-field="docketCustomer" value="${state.docketCustomer}" placeholder="${state.docketType === 'Dine-in' ? 'e.g. Table 4 · Maya' : state.docketType === 'Delivery' ? 'e.g. UberEats #219' : 'e.g. Alex, Buzzer 12'}">
            ${quickTargetChips.length ? html`
              <div class="gs-quick-chips">
                ${quickTargetChips.map((chip) => html`
                  <button type="button" class="${cls('gs-quick-chip', { 'is-on': state.docketCustomer === chip })}" data-action="docket-quick-customer" data-val="${chip}">${chip}</button>`)}
              </div>` : ''}
          </label>

          ${state.docket.length ? html`
            <div>
              ${state.docket.map((line, idx) => html`
                <div class="gs-docket__line" data-key="dk-${idx}">
                  <div class="gs-docket__line-top">
                    <div style="min-width:0">
                      <div class="gs-docket__name">${line.name}</div>
                      <div class="gs-docket__sub">
                        ${money(line.price_cents, { currency })} · ${line.prep_station}${line.mods.length ? ' · ' + line.mods.join(', ') : ''}
                      </div>
                    </div>
                    <div class="gs-qty">
                      <button type="button" data-action="docket-dec" data-idx="${idx}" aria-label="Decrease quantity">−</button>
                      <span style="min-width:20px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums;font-size:13px">${line.qty}</span>
                      <button type="button" data-action="docket-inc" data-idx="${idx}" aria-label="Increase quantity">+</button>
                    </div>
                  </div>
                  <div class="gs-mod-chips">
                    ${QUICK_CHIPS.map((ch) => {
                      const active = line.mods.includes(ch.mod);
                      return html`<button type="button" class="${cls('gs-mod-chip', { 'is-on': active })}" data-action="docket-quick-mod" data-idx="${idx}" data-mod="${ch.mod}">${active ? '✓ ' : '+ '}${ch.label}</button>`;
                    })}
                    <button type="button" class="gs-mod-chip gs-mod-chip--more" data-action="docket-mod" data-idx="${idx}">More…</button>
                  </div>
                </div>`)}
            </div>` : html`
            <div class="gs-docket__empty">
              <div class="gs-docket__empty-ico">${icon('burger', { size: 18 })}</div>
              <div style="font-size:12.5px;color:var(--k-muted);font-weight:600">Tap menu tiles or quick-ring a bestseller:</div>
              ${quickFavs.length ? html`
                <div class="gs-fav-chips">
                  ${quickFavs.map((fav) => html`
                    <button type="button" class="gs-fav-chip" data-action="pos-add" data-id="${fav.id}">+ ${shortFavLabel(fav.item_name)}</button>`)}
                </div>` : ''}
            </div>`}

          <label class="k-field" style="gap:4px">
            <span class="k-field__label">Kitchen notes <span class="k-field__optional">optional</span></span>
            <input class="k-input" data-docket-field="docketNotes" value="${state.docketNotes}" placeholder="Allergy callout, separate tongs, cut in half…">
          </label>

          <div class="gs-receipt-totals">
            <div class="gs-receipt-row"><span>Subtotal (ex. tax)</span><span>${money(docketExTax, { currency })}</span></div>
            <div class="gs-receipt-row"><span>Tax incl. (${taxRate}%)</span><span>${money(docketTax, { currency })}</span></div>
            <div class="gs-receipt-row gs-receipt-row--grand"><span>Total</span><span>${money(docketTotal, { currency })}</span></div>
          </div>

          <button type="button" class="k-btn k-btn--primary k-btn--block" data-action="docket-fire" ${state.docket.length ? '' : 'disabled'}>
            ${icon(isRush ? 'zap' : 'flame', { size: 17 })}
            ${isRush
              ? `FIRE RUSH ORDER${docketTotal > 0 ? ' · ' + money(docketTotal, { currency }) : ''}`
              : `Fire Order to Pass${docketTotal > 0 ? ' · ' + money(docketTotal, { currency }) : ''}`}
          </button>
        </div>
      </section>
    </div>`;
}

export function wireCounterActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="pos-cat"]', (e, el) => { state.posCat = el.dataset.cat; draw(); });
  on(root, 'input', '[data-action="pos-search"]', (e, el) => { state.posSearch = el.value; draw(); });
  on(root, 'click', '[data-action="pos-search-clear"]', () => { state.posSearch = ''; state.posCat = 'All'; draw(); });
  on(root, 'click', '[data-action="order-filter"]', (e, el) => { state.orderFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="order-search"]', (e, el) => { state.orderSearch = el.value; draw(); });
  on(root, 'click', '[data-action="docket-type"]', (e, el) => { state.docketType = el.dataset.type; draw(); });
  on(root, 'click', '[data-action="docket-quick-customer"]', (e, el) => { state.docketCustomer = el.dataset.val || ''; draw(); });
  on(root, 'click', '[data-action="toggle-rush"]', () => {
    state.docketPriority = state.docketPriority === 'Rush' ? 'Normal' : 'Rush';
    draw();
  });
  on(root, 'input', '[data-docket-field]', (e, el) => { state[el.dataset.docketField] = el.value; });

  on(root, 'click', '[data-action="pos-add"]', (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const existing = state.docket.find((d) => d.menuId === item.id && !d.mods.length);
    if (existing) existing.qty += 1;
    else state.docket.push({
      menuId: item.id,
      name: item.item_name,
      base_price_cents: item.price_cents,
      price_cents: item.price_cents,
      category: item.category,
      prep_station: item.prep_station,
      qty: 1,
      mods: [],
    });
    draw();
  });

  on(root, 'click', '[data-action="docket-inc"]', (e, el) => { const d = state.docket[Number(el.dataset.idx)]; if (d) { d.qty++; draw(); } });
  on(root, 'click', '[data-action="docket-dec"]', (e, el) => {
    const i = Number(el.dataset.idx);
    if (!state.docket[i]) return;
    if (state.docket[i].qty > 1) state.docket[i].qty--; else state.docket.splice(i, 1);
    draw();
  });
  on(root, 'click', '[data-action="docket-clear"]', () => { state.docket = []; state.docketNotes = ''; state.docketPriority = 'Normal'; draw(); });

  on(root, 'click', '[data-action="docket-quick-mod"]', (e, el) => {
    const line = state.docket[Number(el.dataset.idx)];
    const mod = el.dataset.mod;
    if (!line || !mod) return;
    const pos = line.mods.indexOf(mod);
    if (pos >= 0) line.mods.splice(pos, 1);
    else line.mods.push(mod);
    recalcLinePrice(line);
    draw();
  });

  on(root, 'click', '[data-action="docket-mod"]', async (e, el) => {
    const line = state.docket[Number(el.dataset.idx)];
    if (!line) return;
    const updated = await formDialog({
      title: `Modifiers · ${line.name}`,
      submitLabel: 'Apply modifiers',
      fields: html`
        <div class="k-field">
          <span class="k-field__label">Quick modifiers</span>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
            ${BURGER_MODS.map((m) => html`<label class="k-check"><input type="checkbox" name="mods" value="${m}" ${line.mods.includes(m) ? 'checked' : ''}><span>${m}</span></label>`)}
          </div>
        </div>
        <label class="k-field">
          <span class="k-field__label">Custom callout <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="custom_mod" placeholder="e.g. No sesame seeds, sauce on side">
        </label>`,
      onSubmit: (vals) => vals,
    });
    if (!updated) return;
    const mods = Array.isArray(updated.mods) ? [...updated.mods] : [];
    if (updated.custom_mod && updated.custom_mod.trim()) mods.push(updated.custom_mod.trim());
    line.mods = mods;
    recalcLinePrice(line);
    draw();
  });

  on(root, 'click', '[data-action="docket-fire"]', async () => {
    if (!state.docket.length) return;
    try {
      const res = await api.post('/api/orders', {
        order_type: state.docketType,
        priority: state.docketPriority,
        customer_name: state.docketCustomer,
        notes: state.docketNotes,
        order_day: today(),
        items: state.docket,
      });
      state.docket = [];
      state.docketCustomer = '';
      state.docketNotes = '';
      state.docketPriority = 'Normal';
      const stList = (res.stations || []).join(', ');
      toast.success(`Order ${res.order.order_number} fired -> ${res.ticketsSpawned} ticket(s): ${stList}`, {
        action: { label: 'Print Receipt', run: () => printCustomerReceipt(res.order, state.session.settings) },
      });
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="order-repeat"]', (e, el) => {
    const order = state.orders.find((o) => String(o.id) === el.dataset.id);
    if (!order || !Array.isArray(order.items) || !order.items.length) return;
    state.docketType = order.order_type || 'Takeaway';
    state.docketCustomer = order.customer_name || '';
    state.docketNotes = order.notes || '';
    state.docket = order.items.map((it) => {
      const match = state.menu.find((m) => m.item_name === it.name);
      const mods = Array.isArray(it.mods) ? [...it.mods] : [];
      const line = {
        menuId: match ? match.id : (it.menuId || null),
        name: it.name,
        base_price_cents: match ? match.price_cents : Number(it.price_cents || 0),
        price_cents: Number(it.price_cents || 0),
        category: it.category || (match ? match.category : 'Burger'),
        prep_station: it.prep_station || (match ? match.prep_station : 'Grill'),
        qty: Number(it.qty || 1),
        mods,
      };
      if (match) recalcLinePrice(line);
      return line;
    });
    toast.success(`Loaded ${order.order_number} into Current Docket.`);
    draw();
  });

  on(root, 'click', '[data-action="order-receipt"]', (e, el) => {
    const order = state.orders.find((o) => String(o.id) === el.dataset.id);
    if (!order) return;
    printCustomerReceipt(order, state.session.settings);
  });

  on(root, 'click', '[data-action="order-status"]', async (e, el) => {
    try {
      await api.post('/api/orders/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Order marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
}
