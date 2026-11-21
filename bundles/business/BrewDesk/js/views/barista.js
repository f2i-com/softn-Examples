// Barista Ticket Queue — Espresso Bar KDS with dark command masthead, clickable milk pitcher filter,
// shot-dot meters, full-width Alt-Milk safety bars, age alerts & 1-tap bump.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { ago, toMs } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';

const COLS = [
  { status: 'Queued', label: 'Queued', next: 'Pulling shots', nextLabel: 'Pull Shots →' },
  { status: 'Pulling shots', label: 'Pulling Shots', next: 'Pouring', nextLabel: 'Pour Milk →' },
  { status: 'Pouring', label: 'Pouring', next: 'Ready', nextLabel: 'Call Ready ✓' },
];
const DRINKS = ['Flat white', 'Latte', 'Cappuccino', 'Long black', 'Espresso', 'Mocha', 'Chai', 'Matcha', 'Cold brew'];
const MILKS = ['Full cream', 'Oat', 'Almond', 'Soy', 'Skim', 'Lactose-free', 'Black / None'];
const SIZES = ['Small', 'Regular', 'Large'];
const EXTRAS = ['Extra shot', 'Decaf', 'Extra hot', 'Iced', 'Syrup'];

function isAltMilk(milk) {
  return /oat|almond|soy|lactose/i.test(milk || '');
}

function milkClass(milk) {
  if (isAltMilk(milk)) return 'milk-pill milk-pill--alt';
  if (/black|none/i.test(milk || '')) return 'milk-pill milk-pill--black';
  return 'milk-pill milk-pill--dairy';
}

function ageTone(createdAt, status) {
  if (status === 'Ready') return '';
  const ms = toMs(createdAt);
  if (Number.isNaN(ms)) return '';
  const mins = (Date.now() - ms) / 60000;
  if (mins >= 10) return 'age-pill--hot';
  if (mins >= 5) return 'age-pill--warn';
  return '';
}

function renderShotDots(shots) {
  const n = Math.max(0, Math.min(6, Number(shots) || 0));
  if (!n) return '';
  return html`
    <span class="bd-shots" title="${n} espresso shot${n === 1 ? '' : 's'}">
      ${Array.from({ length: n }, () => html`<span class="bd-shot-dot"></span>`)}
      <span>${n}sh</span>
    </span>`;
}

export function renderBaristaView(state) {
  const columns = state.showReadyTickets
    ? [...COLS, { status: 'Ready', label: 'Ready at Pass', next: null }]
    : COLS;

  const activeTickets = state.tickets.filter((t) => t.status !== 'Ready');
  const altCount = activeTickets.filter((t) => isAltMilk(t.milk)).length;
  const milkCounts = new Map();
  for (const t of activeTickets) {
    const key = t.milk || 'Full cream';
    milkCounts.set(key, (milkCounts.get(key) || 0) + 1);
  }
  const milkEntries = [...milkCounts.entries()].sort((a, b) => b[1] - a[1]);

  const milkFilter = state.baristaMilkFilter || 'All';
  const filteredTickets = milkFilter === 'All'
    ? state.tickets
    : state.tickets.filter((t) => (t.milk || 'Full cream') === milkFilter);

  return html`
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow"><span class="tk-pulse-dot" style="--dot:${activeTickets.length ? '#f59e0b' : '#4ade80'}"></span> Espresso Station KDS</span>
        <h1 class="bd-masthead__title">Barista Queue</h1>
        <div class="bd-masthead__meta">
          <span><strong>${activeTickets.length}</strong> cup${activeTickets.length === 1 ? '' : 's'} active</span>
          ${altCount > 0 ? html`<span class="tk-meta-sep" aria-hidden="true">·</span><span><strong style="color:#fde68a">${altCount} alt-milk</strong> flagged in amber</span>` : html`<span class="tk-meta-sep" aria-hidden="true">·</span><span>All dairy / black</span>`}
          <span class="tk-meta-sep" aria-hidden="true">·</span><span>Tap a pitcher chip below to isolate one milk jug</span>
        </div>
      </div>
      <div class="tk-hero__actions">
        <button type="button" class="${cls('k-btn', state.showReadyTickets ? 'k-btn--primary' : 'k-btn--glass')}" data-action="toggle-ready-tickets">
          ${state.showReadyTickets ? 'Hide Ready' : 'Show Ready'}
        </button>
        <button type="button" class="k-btn k-btn--primary" data-action="add-ticket">${icon('plus', { size: 16 })} Quick Ticket</button>
      </div>
      ${milkEntries.length ? html`
        <div class="bd-kds-milk-strip">
          <span class="bd-kds-milk-lbl">${icon('milk-jug', { size: 13 })} Active Pitchers</span>
          <button type="button" class="${cls('bd-milk-filter', { 'is-on': milkFilter === 'All' })}" data-action="barista-milk-filter" data-milk="All">
            All (${activeTickets.length})
          </button>
          ${milkEntries.map(([m, cnt]) => html`
            <button type="button" class="${cls('bd-milk-filter', { 'bd-milk-filter--alt': isAltMilk(m), 'is-on': milkFilter === m })}" data-action="barista-milk-filter" data-milk="${m}">
              ${cnt} &times; ${m}
            </button>`)}
        </div>` : ''}
    </section>

    ${state.loading && !state.tickets.length ? skeleton(4) : filteredTickets.length ? html`
      <div class="tk-board">
        ${columns.map((col) => {
          const cards = filteredTickets.filter((t) => t.status === col.status);
          return html`
            <div class="tk-col" data-key="col-${col.status}">
              <div class="tk-col__head">
                <span>${col.label}</span>
                <span class="k-badge">${cards.length}</span>
              </div>
              ${cards.length ? cards.map((t) => {
                const aTone = ageTone(t.created_at, t.status);
                const alt = isAltMilk(t.milk);
                return html`
                  <article class="bd-kds-card" data-key="tk-${t.id}">
                    ${alt ? html`
                      <div class="bd-kds-card__alt-bar">
                        <span>${t.milk} Milk</span>
                        <span>Alt Pitcher</span>
                      </div>` : ''}
                    <div class="bd-kds-card__body">
                      <div class="tk-ticket__top">
                        <span class="ticket-order-num">${t.order_number || '#' + t.id}</span>
                        <span class="age-pill ${aTone}">${icon('clock', { size: 12 })} ${ago(t.created_at)}</span>
                      </div>
                      <div class="bd-kds-card__drink">${t.size} ${t.drink_type}</div>
                      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
                        <span class="${milkClass(t.milk)}">${t.milk}</span>
                        ${renderShotDots(t.shots)}
                        ${(t.extras || []).map((ex) => html`<span class="tk-tag tk-tag--accent">${ex}</span>`)}
                      </div>
                      <div class="tk-ticket__meta">
                        <strong>${t.customer_name}</strong>${t.notes ? ' · ' + t.notes : ''}${t.barista_name ? ' · ' + t.barista_name : ''}
                      </div>
                      ${col.next ? html`
                        <div class="tk-ticket__foot">
                          <button type="button" class="k-btn k-btn--primary k-btn--sm" style="flex:1" data-action="ticket-bump" data-id="${t.id}" data-status="${col.next}">${col.nextLabel}</button>
                          ${col.next !== 'Ready' ? html`<button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="ticket-bump" data-id="${t.id}" data-status="Ready">Ready</button>` : ''}
                        </div>` : ''}
                    </div>
                  </article>`;
              }) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px;text-align:center">Clear</p>`}
            </div>`;
        })}
      </div>` : emptyState({ iconName: 'coffee', title: milkFilter !== 'All' ? `No active ${milkFilter} tickets` : 'Espresso queue is clear', text: milkFilter !== 'All' ? 'Tap All pitchers above to view all drinks.' : 'Drinks from the Order Pad appear here automatically, or add a manual ticket.', action: milkFilter !== 'All' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="barista-milk-filter" data-milk="All">Show All Pitchers</button>` : html`<a href="#/" class="k-btn k-btn--primary k-btn--sm">Go to Order Pad</a>` })}
  `;
}

export function wireBaristaActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="toggle-ready-tickets"]', () => {
    state.showReadyTickets = !state.showReadyTickets;
    loadScreen('/barista');
  });

  on(root, 'click', '[data-action="barista-milk-filter"]', (e, el) => {
    state.baristaMilkFilter = el.dataset.milk;
    draw();
  });

  on(root, 'click', '[data-action="ticket-bump"]', async (e, el) => {
    try {
      await api.post('/api/tickets/advance', { id: Number(el.dataset.id), status: el.dataset.status });
      await loadScreen('/barista');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="add-ticket"]', async () => {
    const made = await formDialog({
      title: 'Quick Barista Ticket',
      submitLabel: 'Queue drink',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Drink</span>
            <select class="k-input" name="drink_type">${DRINKS.map((d) => html`<option value="${d}">${d}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Milk</span>
            <select class="k-input" name="milk">${MILKS.map((m) => html`<option value="${m}">${m}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Size</span>
            <select class="k-input" name="size">${SIZES.map((s) => html`<option value="${s}" ${s === 'Regular' ? 'selected' : ''}>${s}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Shots</span>
            <input class="k-input" type="number" name="shots" min="0" max="6" value="2">
          </label>
          <label class="k-field"><span class="k-field__label">Customer / Table</span>
            <input class="k-input" name="customer_name" placeholder="e.g. Jordan">
          </label>
        </div>
        <div class="k-field">
          <span class="k-field__label">Extras</span>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            ${EXTRAS.map((ex) => html`<label class="k-check"><input type="checkbox" name="extras" value="${ex}"><span>${ex}</span></label>`)}
          </div>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Optional barista note"></label>`,
      onSubmit: (vals) => api.post('/api/tickets', vals),
    });
    if (made) { toast.success('Barista ticket queued.'); await loadScreen('/barista'); }
  });
}
