// Order Pad (POS & Today's Live Orders) — unified masthead, tactile icon tiles, quick-ring favorites,
// modifier surcharges, thermal GST receipt docket, and 1-click repeat live orders.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDate, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const CATS = ['All', 'Coffee', 'Cold drink', 'Tea', 'Food', 'Retail beans'];
const MILKS = ['Full cream', 'Oat', 'Almond', 'Soy', 'Skim', 'Lactose-free', 'Black / None'];
const SIZES = ['Small', 'Regular', 'Large'];
const EXTRAS = ['Extra shot', 'Decaf', 'Extra hot', 'Iced', 'Syrup'];
const QUICK_TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'Patio', 'Window'];
const PAYMENTS = ['Card', 'Cash', 'Tap'];

const STATUS_NEXT = { New: 'Making', Making: 'Ready', Ready: 'Served' };
const STATUS_CLASS = { New: 'tk-tag--warn', Making: 'tk-tag--info', Ready: 'tk-tag--ok', Served: '', Cancelled: 'tk-tag--bad' };
const STATUS_STEP = { New: 1, Making: 2, Ready: 3, Served: 3, Cancelled: 0 };

function catMeta(cat) {
  if (cat === 'Coffee') return { cls: 'bd-tile--coffee', ico: 'coffee' };
  if (cat === 'Cold drink') return { cls: 'bd-tile--cold', ico: 'iced-cup' };
  if (cat === 'Tea') return { cls: 'bd-tile--tea', ico: 'leaf' };
  if (cat === 'Food') return { cls: 'bd-tile--food', ico: 'pastry' };
  return { cls: 'bd-tile--retail', ico: 'bean-bag' };
}

function dietShort(tag) {
  if (tag === 'Vegan') return { code: 'V', cls: 'bd-diet-dot--v' };
  if (tag === 'Gluten-free') return { code: 'GF', cls: 'bd-diet-dot--gf' };
  if (tag === 'Dairy-free') return { code: 'DF', cls: 'bd-diet-dot--df' };
  if (tag === 'Nut-free') return { code: 'NF', cls: '' };
  return { code: String(tag || '').slice(0, 2).toUpperCase(), cls: '' };
}

function recalcLinePrice(line) {
  let cents = Number(line.base_price_cents != null ? line.base_price_cents : line.price_cents) || 0;
  const isDrink = line.station === 'Espresso' || line.station === 'Cold bar';
  if (isDrink) {
    if (line.size === 'Large') cents += 100;
    const baseName = String(line.name || '').toLowerCase();
    const altSelected = line.milk === 'Oat' || line.milk === 'Almond' || line.milk === 'Soy' || line.milk === 'Lactose-free';
    const altAlreadyInName = baseName.includes('oat') || baseName.includes('almond') || baseName.includes('soy');
    if (altSelected && !altAlreadyInName) cents += 80;
    if (Array.isArray(line.extras) && line.extras.includes('Extra shot')) cents += 80;
    if (Array.isArray(line.extras) && line.extras.includes('Syrup')) cents += 60;
  }
  line.price_cents = cents;
}

export function renderPosView(state) {
  const settings = state.session.settings || {};
  const currency = settings.currency || 'AUD';
  const taxRate = Number(settings.tax_rate != null ? settings.tax_rate : 10);
  const counts = state.session.counts || {};
  const nextOrderNum = `B-${Number(settings.order_seq || 100) + 1}`;
  const avgTicket = counts.todayOrdersCount > 0 ? Math.round((counts.todaySalesCents || 0) / counts.todayOrdersCount) : 0;

  const mq = (state.posSearch || '').trim().toLowerCase();
  const visibleMenu = state.menu.filter((m) => {
    if (state.posCat !== 'All' && m.category !== state.posCat) return false;
    if (!mq) return true;
    return m.item_name.toLowerCase().includes(mq) || m.category.toLowerCase().includes(mq) || m.station.toLowerCase().includes(mq);
  });

  const docketTotal = state.docket.reduce((sum, l) => sum + l.price_cents * l.qty, 0);
  const docketUnits = state.docket.reduce((sum, l) => sum + l.qty, 0);
  const taxCents = taxRate > 0 ? Math.round(docketTotal - docketTotal / (1 + taxRate / 100)) : 0;
  const subtotalCents = docketTotal - taxCents;

  const docketQtyByMenu = new Map();
  for (const line of state.docket) {
    docketQtyByMenu.set(line.menuId, (docketQtyByMenu.get(line.menuId) || 0) + line.qty);
  }

  const preferredFavs = ['Flat White', 'Oat Latte', 'Almond Croissant'];
  const quickFavs = [
    ...preferredFavs.map((nm) => state.menu.find((m) => m.item_name === nm)).filter(Boolean),
    ...state.menu.filter((m) => !preferredFavs.includes(m.item_name) && (m.category === 'Coffee' || m.category === 'Food')),
  ].slice(0, 3);

  const q = (state.orderSearch || '').trim().toLowerCase();
  const baseOrders = state.orderFilter === 'Active'
    ? state.orders.filter((o) => o.status !== 'Served' && o.status !== 'Cancelled')
    : state.orders;
  const visibleOrders = q
    ? baseOrders.filter((o) =>
      String(o.order_number || '').toLowerCase().includes(q)
      || String(o.customer_name || '').toLowerCase().includes(q)
      || String(o.items_summary || '').toLowerCase().includes(q))
    : baseOrders;

  return html`
    ${renderSampleBanner(counts.sampleCount)}
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow"><span class="tk-pulse-dot" style="--dot:#f59e0b"></span> Front Counter POS · ${fmtDate(today(), { weekday: 'short' })}</span>
        <h1 class="bd-masthead__title">Order Pad</h1>
        <div class="bd-masthead__meta">
          <span>Next docket <strong>${nextOrderNum}</strong></span>
          ${avgTicket > 0 ? html`<span class="tk-meta-sep" aria-hidden="true">·</span><span>Avg ticket <strong>${money(avgTicket, { currency })}</strong></span>` : ''}
          <span class="tk-meta-sep" aria-hidden="true">·</span><span>Tap tiles to build &amp; fire drinks straight to bar</span>
        </div>
      </div>
      <div class="bd-masthead__pods">
        <div class="bd-pod bd-pod--crema">
          <span class="bd-pod__lbl">Today's Sales</span>
          <span class="bd-pod__val">${money(counts.todaySalesCents || 0, { currency })}</span>
          <span class="bd-pod__sub">${counts.todayOrdersCount || 0} order${counts.todayOrdersCount === 1 ? '' : 's'}</span>
        </div>
        <a href="#/barista" class="bd-pod">
          <span class="bd-pod__lbl">${icon('flame', { size: 12 })} Espresso Bar</span>
          <span class="bd-pod__val">${counts.queuedTickets || 0}</span>
          <span class="bd-pod__sub">${counts.queuedTickets ? 'Open queue →' : 'All clear'}</span>
        </a>
        <a href="#/stock" class="${cls('bd-pod', { 'bd-pod--alert': counts.lowStock > 0 })}">
          <span class="bd-pod__lbl">${icon('box', { size: 12 })} Low Stock</span>
          <span class="bd-pod__val">${counts.lowStock || 0}</span>
          <span class="bd-pod__sub">${counts.lowStock ? 'Check par →' : 'Par stocked'}</span>
        </a>
        <a href="#/close" class="bd-pod">
          <span class="bd-pod__lbl">${icon('clipboard', { size: 12 })} Daily Close</span>
          <span class="bd-pod__val">Till</span>
          <span class="bd-pod__sub">Reconcile →</span>
        </a>
      </div>
    </section>

    <div class="pos-layout">
      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="pos-menu-bar">
            <div class="tk-segmented">
              ${CATS.map((c) => {
                const cnt = c === 'All' ? state.menu.length : state.menu.filter((m) => m.category === c).length;
                return html`<button type="button" class="${cls('tk-pill', { 'is-on': state.posCat === c })}" data-action="pos-cat" data-cat="${c}">${c === 'Retail beans' ? 'Beans' : c} <span style="opacity:.65;font-size:11px;margin-left:2px">${cnt}</span></button>`;
              })}
            </div>
            <label class="pos-menu-search">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="pos-search" value="${state.posSearch || ''}" placeholder="Quick find item…">
            </label>
          </div>
          <div class="tk-sheet__body">
            ${state.loading && !state.menu.length ? skeleton(3) : visibleMenu.length ? html`
              <div class="pos-grid">
                ${visibleMenu.map((item) => {
                  const inDocket = docketQtyByMenu.get(item.id) || 0;
                  const meta = catMeta(item.category);
                  return html`
                    <button type="button" class="${cls('bd-tile', meta.cls, { 'bd-tile--in-docket': inDocket > 0 })}" data-key="menu-${item.id}" data-action="pos-add" data-id="${item.id}">
                      ${inDocket > 0 ? html`<span class="bd-tile__badge">&times;${inDocket}</span>` : ''}
                      <div class="bd-tile__top">
                        <span class="bd-tile__ico">${icon(meta.ico, { size: 17 })}</span>
                        <div class="bd-tile__copy">
                          <span class="bd-tile__name">${item.item_name}</span>
                          <span class="bd-tile__price">${money(item.price_cents, { currency })}</span>
                        </div>
                      </div>
                      <div class="bd-tile__foot">
                        <span class="bd-tile__station">${item.station}</span>
                        ${(item.dietary_tags || []).length ? html`
                          <span class="bd-diet-row">
                            ${item.dietary_tags.map((t) => {
                              const d = dietShort(t);
                              return html`<span class="bd-diet-dot ${d.cls}" title="${t}">${d.code}</span>`;
                            })}
                          </span>` : ''}
                      </div>
                    </button>`;
                })}
              </div>` : emptyState({ iconName: 'utensils', title: mq ? 'No matching menu items' : 'No active items in this category', text: mq ? 'Try another keyword or switch back to All.' : 'Add drinks or dishes on the Menu Board to tap them into orders.', action: html`<a href="#/menu" class="k-btn k-btn--primary k-btn--sm">Open Menu Board</a>` })}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('receipt', { size: 17 })} Live Orders</h2>
            <span class="tk-sheet__count">${visibleOrders.length}</span>
            <div class="tk-sheet__actions">
              <label class="pos-menu-search" style="max-width:190px">
                ${icon('search', { size: 14 })}
                <input type="search" data-action="order-search" value="${state.orderSearch || ''}" placeholder="Order # or name…">
              </label>
              <div class="tk-segmented">
                <button type="button" class="${cls('tk-pill', { 'is-on': state.orderFilter === 'Active' })}" data-action="order-filter" data-filter="Active">Active</button>
                <button type="button" class="${cls('tk-pill', { 'is-on': state.orderFilter === 'All' })}" data-action="order-filter" data-filter="All">All Today</button>
              </div>
            </div>
          </div>
          <div>
            ${state.loading && !state.orders.length ? html`<div class="tk-sheet__body">${skeleton(3)}</div>` : visibleOrders.length ? visibleOrders.map((o) => {
              const step = STATUS_STEP[o.status] || 0;
              return html`
                <div class="${cls('bd-order-card', { 'bd-order-card--ready': o.status === 'Ready' })}" data-key="order-${o.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="ticket-order-num">${o.order_number}</span>
                      <span>${o.customer_name}</span>
                      <span class="tk-tag ${STATUS_CLASS[o.status] || ''}">${o.status}</span>
                      <span class="tk-tag">${o.order_type}${o.table_number ? ' · ' + o.table_number : ''}</span>
                      ${o.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      <span>${o.items_summary}</span>
                      <span><strong>${money(o.total_cents, { currency })}</strong></span>
                      <span>${ago(o.created_at)}</span>
                      ${o.notes ? html`<span>Note: ${o.notes}</span>` : ''}
                    </div>
                    ${o.status !== 'Cancelled' ? html`
                      <div class="bd-order-steps" aria-label="Order progress: ${o.status}">
                        <span class="${cls('bd-step-dot', { 'is-done': step >= 1, 'is-ready': o.status === 'Ready' || o.status === 'Served' })}"></span>
                        <span class="${cls('bd-step-dot', { 'is-done': step >= 2, 'is-ready': o.status === 'Ready' || o.status === 'Served' })}"></span>
                        <span class="${cls('bd-step-dot', { 'is-done': step >= 3, 'is-ready': o.status === 'Ready' || o.status === 'Served' })}"></span>
                      </div>` : ''}
                  </div>
                  <div class="tk-row__aside">
                    ${STATUS_NEXT[o.status] ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="order-status" data-id="${o.id}" data-status="${STATUS_NEXT[o.status]}">
                        Mark ${STATUS_NEXT[o.status]}
                      </button>` : ''}
                    <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="order-repeat" data-id="${o.id}" title="Load items into Current Docket">Repeat</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="order-receipt" data-id="${o.id}" title="Download thermal receipt">${icon('printer', { size: 15 })}</button>
                    ${o.status !== 'Cancelled' && o.status !== 'Served' ? html`
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="order-status" data-id="${o.id}" data-status="Cancelled">Cancel</button>` : ''}
                  </div>
                </div>`;
            }) : emptyState({ iconName: 'receipt', title: q ? 'No matching orders' : 'Counter is clear', text: q ? 'Try another name or order number.' : 'Tap drinks or pastries on the menu to ring up your next cafe order.' })}
          </div>
        </section>
      </div>

      <section class="tk-sheet bd-docket">
        <div class="bd-docket__head">
          ${icon('receipt', { size: 17 })}
          <strong style="font-size:15px;letter-spacing:-0.01em">Current Docket</strong>
          <span class="bd-docket__stub">${nextOrderNum}</span>
          ${docketUnits > 0 ? html`<span class="tk-sheet__count" style="background:rgba(255,255,255,.16);color:#fff">${docketUnits}</span>` : ''}
          ${state.docket.length ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" style="margin-left:auto;color:rgba(255,251,245,.82)" data-action="docket-clear">Clear</button>` : ''}
        </div>
        <div class="bd-docket__body">
          <div class="tk-segmented" style="justify-content:center">
            ${['Takeaway', 'Dine-in', 'Delivery'].map((tp) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.docketType === tp })}" style="flex:1" data-action="docket-type" data-type="${tp}">${tp}</button>`)}
          </div>
          <div class="k-form__row">
            <label class="k-field">
              <span class="k-field__label">Customer / Name</span>
              <input class="k-input" data-docket-field="docketCustomer" value="${state.docketCustomer}" placeholder="e.g. Alex">
            </label>
            ${state.docketType === 'Dine-in' ? html`
              <label class="k-field">
                <span class="k-field__label">Table #</span>
                <input class="k-input" data-docket-field="docketTable" value="${state.docketTable}" placeholder="e.g. T4">
              </label>` : ''}
          </div>
          ${state.docketType === 'Dine-in' ? html`
            <div class="bd-table-chips">
              ${QUICK_TABLES.map((tb) => html`
                <button type="button" class="${cls('bd-table-chip', { 'is-on': state.docketTable === tb })}" data-action="docket-table-pick" data-table="${tb}">${tb}</button>`)}
            </div>` : ''}

          ${state.docket.length ? html`
            <div>
              ${state.docket.map((line, idx) => {
                const isDrink = line.station === 'Espresso' || line.station === 'Cold bar';
                return html`
                  <div class="docket__line" data-key="dk-${idx}">
                    <div class="docket__line-top">
                      <div>
                        <div class="docket__line-name">${line.name}</div>
                        <div class="docket__line-price">
                          <strong>${money(line.price_cents * line.qty, { currency })}</strong>
                          ${isDrink ? ` · ${line.size} · ${line.milk}${line.shots ? ` · ${line.shots}sh` : ''}${line.extras.length ? ' · ' + line.extras.join(', ') : ''}` : ''}
                        </div>
                      </div>
                      <div class="docket__qty">
                        <button type="button" data-action="docket-dec" data-idx="${idx}" aria-label="Decrease">&minus;</button>
                        <span style="min-width:22px;text-align:center;font-weight:750;font-variant-numeric:tabular-nums">${line.qty}</span>
                        <button type="button" data-action="docket-inc" data-idx="${idx}" aria-label="Increase">+</button>
                      </div>
                    </div>
                    ${isDrink ? html`
                      <div class="mod-chips">
                        <button type="button" class="${cls('mod-chip', { 'is-on': line.milk === 'Oat' })}" data-action="docket-qmod" data-idx="${idx}" data-mod="milk:Oat">Oat +80c</button>
                        <button type="button" class="${cls('mod-chip', { 'is-on': line.milk === 'Almond' })}" data-action="docket-qmod" data-idx="${idx}" data-mod="milk:Almond">Almond</button>
                        <button type="button" class="${cls('mod-chip', { 'is-on': line.size === 'Large' })}" data-action="docket-qmod" data-idx="${idx}" data-mod="size:Large">Large +$1</button>
                        <button type="button" class="${cls('mod-chip', { 'is-on': line.extras.includes('Extra shot') })}" data-action="docket-qmod" data-idx="${idx}" data-mod="extra:Extra shot">+Shot</button>
                        <button type="button" class="${cls('mod-chip', { 'is-on': line.extras.includes('Iced') })}" data-action="docket-qmod" data-idx="${idx}" data-mod="extra:Iced">Iced</button>
                        <button type="button" class="mod-chip" data-action="docket-mod" data-idx="${idx}">More…</button>
                      </div>` : ''}
                  </div>`;
              })}
            </div>` : html`
            <div class="bd-docket__empty">
              <span class="bd-docket__empty-ico">${icon('coffee', { size: 20 })}</span>
              <span class="tk-muted" style="font-size:13px">Tap any menu tile to start ringing up an order.</span>
              ${quickFavs.length ? html`
                <div class="bd-fav-chips">
                  ${quickFavs.map((f) => html`<button type="button" class="bd-fav-chip" data-action="pos-add" data-id="${f.id}">+ ${f.item_name}</button>`)}
                </div>` : ''}
            </div>`}

          <label class="k-field">
            <span class="k-field__label">Order notes <span class="k-field__optional">optional</span></span>
            <input class="k-input" data-docket-field="docketNotes" value="${state.docketNotes}" placeholder="Allergies, split toastie, extra hot…">
          </label>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span class="k-field__label">Payment</span>
            <div class="tk-segmented">
              ${PAYMENTS.map((pm) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': (state.docketPayment || 'Card') === pm })}" data-action="docket-pay" data-pay="${pm}">${pm}</button>`)}
            </div>
          </div>

          <div class="bd-receipt-totals">
            <div class="bd-receipt-row"><span>Subtotal (ex. tax)</span><span>${money(subtotalCents, { currency })}</span></div>
            <div class="bd-receipt-row"><span>Tax incl. (${taxRate}%)</span><span>${money(taxCents, { currency })}</span></div>
            <div class="bd-receipt-row bd-receipt-row--grand"><span>Total</span><span>${money(docketTotal, { currency })}</span></div>
          </div>

          <button type="button" class="k-btn k-btn--primary k-btn--block" data-action="docket-fire" ${state.docket.length ? '' : 'disabled'}>
            ${icon('flame', { size: 17 })} ${state.docket.length ? `Fire Order · ${money(docketTotal, { currency })}` : 'Fire Order & Queue Barista'}
          </button>
        </div>
      </section>
    </div>`;
}

export function wirePosActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="pos-cat"]', (e, el) => { state.posCat = el.dataset.cat; draw(); });
  on(root, 'input', '[data-action="pos-search"]', (e, el) => { state.posSearch = el.value; draw(); });
  on(root, 'click', '[data-action="order-filter"]', (e, el) => { state.orderFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="order-search"]', (e, el) => { state.orderSearch = el.value; draw(); });
  on(root, 'click', '[data-action="docket-type"]', (e, el) => { state.docketType = el.dataset.type; draw(); });
  on(root, 'click', '[data-action="docket-table-pick"]', (e, el) => { state.docketTable = el.dataset.table; draw(); });
  on(root, 'click', '[data-action="docket-pay"]', (e, el) => { state.docketPayment = el.dataset.pay; draw(); });
  on(root, 'input', '[data-docket-field]', (e, el) => { state[el.dataset.docketField] = el.value; });

  on(root, 'click', '[data-action="pos-add"]', (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const isAltMilk = /oat/i.test(item.item_name) ? 'Oat' : /almond/i.test(item.item_name) ? 'Almond' : /long black|cold brew|batch brew/i.test(item.item_name) ? 'Black / None' : 'Full cream';
    const existing = state.docket.find((d) => d.menuId === item.id && d.milk === isAltMilk && d.size === 'Regular' && !d.extras.length);
    if (existing) existing.qty += 1;
    else state.docket.push({
      menuId: item.id, name: item.item_name, base_price_cents: item.price_cents, price_cents: item.price_cents,
      station: item.station, qty: 1, milk: isAltMilk, size: 'Regular', shots: item.category === 'Coffee' ? 2 : 0, extras: [],
    });
    draw();
  });

  on(root, 'click', '[data-action="docket-qmod"]', (e, el) => {
    const line = state.docket[Number(el.dataset.idx)];
    if (!line) return;
    const [kind, val] = String(el.dataset.mod || '').split(':');
    if (kind === 'milk') line.milk = line.milk === val ? 'Full cream' : val;
    else if (kind === 'size') line.size = line.size === val ? 'Regular' : val;
    else if (kind === 'extra') {
      const i = line.extras.indexOf(val);
      if (i >= 0) {
        line.extras.splice(i, 1);
        if (val === 'Extra shot' && line.shots > 2) line.shots -= 1;
      } else {
        line.extras.push(val);
        if (val === 'Extra shot') line.shots = Math.max(3, (line.shots || 2) + 1);
      }
    }
    recalcLinePrice(line);
    draw();
  });

  on(root, 'click', '[data-action="docket-inc"]', (e, el) => { const d = state.docket[Number(el.dataset.idx)]; if (d) { d.qty++; draw(); } });
  on(root, 'click', '[data-action="docket-dec"]', (e, el) => {
    const i = Number(el.dataset.idx);
    if (!state.docket[i]) return;
    if (state.docket[i].qty > 1) state.docket[i].qty--; else state.docket.splice(i, 1);
    draw();
  });
  on(root, 'click', '[data-action="docket-clear"]', () => { state.docket = []; state.docketNotes = ''; draw(); });

  on(root, 'click', '[data-action="docket-mod"]', async (e, el) => {
    const line = state.docket[Number(el.dataset.idx)];
    if (!line) return;
    const updated = await formDialog({
      title: `Customize ${line.name}`,
      submitLabel: 'Apply',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Size</span>
            <select class="k-input" name="size">${SIZES.map((s) => html`<option value="${s}" ${s === line.size ? 'selected' : ''}>${s}${s === 'Large' ? ' (+$1.00)' : ''}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Milk</span>
            <select class="k-input" name="milk">${MILKS.map((m) => html`<option value="${m}" ${m === line.milk ? 'selected' : ''}>${m}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Shots</span>
            <input class="k-input" type="number" min="0" max="6" name="shots" value="${line.shots}">
          </label>
        </div>
        <div class="k-field">
          <span class="k-field__label">Extras</span>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            ${EXTRAS.map((ex) => html`<label class="k-check"><input type="checkbox" name="extras" value="${ex}" ${line.extras.includes(ex) ? 'checked' : ''}><span>${ex}</span></label>`)}
          </div>
        </div>`,
      onSubmit: (vals) => vals,
    });
    if (!updated) return;
    line.size = updated.size;
    line.milk = updated.milk;
    line.shots = Number(updated.shots || 0);
    line.extras = Array.isArray(updated.extras) ? updated.extras : [];
    recalcLinePrice(line);
    draw();
  });

  on(root, 'click', '[data-action="docket-fire"]', async () => {
    if (!state.docket.length) return;
    try {
      const noteText = [state.docketNotes.trim(), state.docketPayment ? `Paid: ${state.docketPayment}` : ''].filter(Boolean).join(' · ');
      const res = await api.post('/api/orders', {
        order_type: state.docketType,
        table_number: state.docketType === 'Dine-in' ? state.docketTable : '',
        customer_name: state.docketCustomer,
        notes: noteText,
        order_day: today(),
        items: state.docket,
      });
      state.docket = [];
      state.docketCustomer = '';
      state.docketTable = '';
      state.docketNotes = '';
      toast.success(`Order ${res.order.order_number} fired${res.ticketsSpawned ? ` · ${res.ticketsSpawned} barista ticket(s) queued` : ''}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="order-repeat"]', (e, el) => {
    const o = state.orders.find((x) => String(x.id) === el.dataset.id);
    if (!o || !Array.isArray(o.items) || !o.items.length) return;
    state.docket = o.items.map((it) => {
      const match = state.menu.find((m) => m.item_name === it.name);
      return {
        menuId: match ? match.id : 0,
        name: it.name,
        base_price_cents: match ? match.price_cents : it.price_cents,
        price_cents: it.price_cents,
        station: it.station || (match ? match.station : 'Espresso'),
        qty: it.qty || 1,
        milk: it.milk || 'Full cream',
        size: it.size || 'Regular',
        shots: it.shots != null ? it.shots : 2,
        extras: Array.isArray(it.extras) ? [...it.extras] : [],
      };
    });
    state.docketCustomer = o.customer_name || '';
    state.docketType = o.order_type || 'Takeaway';
    state.docketTable = o.table_number || '';
    toast.success(`Loaded ${o.customer_name}'s order into Current Docket.`);
    draw();
  });

  on(root, 'click', '[data-action="order-status"]', async (e, el) => {
    try {
      await api.post('/api/orders/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Order marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="order-receipt"]', (e, el) => {
    const o = state.orders.find((x) => String(x.id) === el.dataset.id);
    if (!o) return;
    const cur = state.session.settings.currency || 'AUD';
    const settings = state.session.settings;
    const taxRate = Number(settings.tax_rate != null ? settings.tax_rate : 10);
    const taxCents = taxRate > 0 ? Math.round(o.total_cents - o.total_cents / (1 + taxRate / 100)) : 0;
    downloadHtmlDoc(`receipt-${o.order_number}.html`, {
      title: `Tax Receipt ${o.order_number}`,
      businessName: settings.business_name,
      subtitle: `${fmtDate(o.order_day)} · ${o.order_type}${o.table_number ? ' · Table ' + o.table_number : ''} · ${o.customer_name}`,
      accent: '#8c3413',
      bodyHtml: `<div class="box"><strong>Order Items:</strong><br>${o.items_summary}</div>
        <table>
          <tr><th>Status</th><td>${o.status}</td></tr>
          <tr><th>Subtotal (ex. tax)</th><td class="num">${money(o.total_cents - taxCents, { currency: cur })}</td></tr>
          <tr><th>Tax incl. (${taxRate}%)</th><td class="num">${money(taxCents, { currency: cur })}</td></tr>
          <tr><th>Total Paid</th><td class="num"><strong>${money(o.total_cents, { currency: cur })}</strong></td></tr>
        </table>
        ${o.notes ? `<div class="box"><strong>Notes:</strong> ${o.notes}</div>` : ''}
        <p style="margin-top:20px;color:#666;font-size:12px">Thank you for visiting ${settings.business_name}${settings.tax_id ? ' · ' + settings.tax_id : ''}${settings.phone ? ' · ' + settings.phone : ''}.</p>`,
    });
  });
}
