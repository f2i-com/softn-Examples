// Menu & Builds Studio — cast-iron masthead, categorized Burger Build Cards w/ color-coded ingredient chips,
// station routing pills, instant Active/Off-menu toggle, and compact Table view.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const CATS = ['Burger', 'Combo', 'Side', 'Drink', 'Dessert'];
const STATIONS = ['Grill', 'Fryer', 'Cold station', 'Drinks'];
const ACTIVES = ['Active', 'Off menu'];
const INGREDIENTS = ['Beef patty', 'Chicken', 'Plant patty', 'Cheese', 'Bacon', 'Lettuce', 'Tomato', 'Pickles', 'Special sauce'];

function catIconName(category) {
  const slug = String(category || 'burger').toLowerCase();
  if (slug === 'combo') return 'combo';
  if (slug === 'side') return 'fries';
  if (slug === 'drink') return 'shake';
  if (slug === 'dessert') return 'sundae';
  return 'burger';
}

function catTileClass(category) {
  const slug = String(category || 'burger').toLowerCase();
  if (slug === 'combo') return 'gs-tile--combo';
  if (slug === 'side') return 'gs-tile--side';
  if (slug === 'drink') return 'gs-tile--drink';
  if (slug === 'dessert') return 'gs-tile--dessert';
  return 'gs-tile--burger';
}

function stationCls(station) {
  if (station === 'Grill') return 'gs-station--grill';
  if (station === 'Fryer') return 'gs-station--fryer';
  if (station === 'Drinks') return 'gs-station--drinks';
  return 'gs-station--assembly';
}

function ingChipClass(ing) {
  const lower = String(ing || '').toLowerCase();
  if (lower.includes('beef') || lower.includes('chicken') || lower.includes('bacon')) return 'gs-ing-chip gs-ing-chip--protein';
  if (lower.includes('cheese') || lower.includes('cheddar')) return 'gs-ing-chip gs-ing-chip--cheese';
  if (lower.includes('sauce') || lower.includes('mayo') || lower.includes('bbq')) return 'gs-ing-chip gs-ing-chip--sauce';
  if (lower.includes('lettuce') || lower.includes('tomato') || lower.includes('pickle') || lower.includes('plant') || lower.includes('slaw')) return 'gs-ing-chip gs-ing-chip--veg';
  return 'gs-ing-chip';
}

function menuFields(item = {}) {
  const ings = item.ingredients || [];
  return html`
    <label class="k-field"><span class="k-field__label">Item name</span>
      <input class="k-input" name="item_name" value="${item.item_name || ''}" placeholder="e.g. Double Smash Stack" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span>
        <select class="k-input" name="category">${CATS.map((c) => html`<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Base price</span>
        <input class="k-input" type="number" step="0.10" min="0" name="base_price" value="${item.price_cents != null ? (item.price_cents / 100).toFixed(2) : ''}" placeholder="16.50" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Prep station</span>
        <select class="k-input" name="prep_station">${STATIONS.map((s) => html`<option value="${s}" ${s === item.prep_station ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Availability</span>
        <select class="k-input" name="active">${ACTIVES.map((a) => html`<option value="${a}" ${a === (item.active || 'Active') ? 'selected' : ''}>${a}</option>`)}</select>
      </label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Standard ingredient build</span>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
        ${INGREDIENTS.map((ing) => html`<label class="k-check"><input type="checkbox" name="ingredients" value="${ing}" ${ings.includes(ing) ? 'checked' : ''}><span>${ing}</span></label>`)}
      </div>
    </div>`;
}

export function renderMenuView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.menuSearch.trim().toLowerCase();
  const rows = state.menu.filter((m) => {
    if (state.menuCatFilter !== 'All' && m.category !== state.menuCatFilter) return false;
    if (q && !m.item_name.toLowerCase().includes(q) && !(m.ingredients || []).join(' ').toLowerCase().includes(q) && !String(m.prep_station || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const activeItems = state.menu.filter((m) => m.active === 'Active');
  const burgers = activeItems.filter((m) => m.category === 'Burger');
  const avgBurgerCents = burgers.length ? Math.round(burgers.reduce((s, b) => s + Number(b.price_cents || 0), 0) / burgers.length) : 0;
  const stationSet = new Set(activeItems.map((m) => m.prep_station).filter(Boolean));
  const mode = state.menuViewMode || 'board';

  // Grouped sections for Build Cards view
  const grouped = CATS.map((cat) => ({
    cat,
    items: rows.filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  return html`
    <section class="gs-masthead" aria-label="Menu & Builds Studio">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          ${icon('utensils', { size: 12 })} BURGER BUILDS &amp; STATION ROUTING
        </div>
        <h1 class="gs-masthead__title">Menu &amp; Builds</h1>
        <div class="gs-masthead__meta">
          <span>Every Active item appears live on Order Counter</span>
          <span>·</span>
          <span>Auto-routes to Grill, Fryer, Assembly &amp; Drinks</span>
        </div>
      </div>

      <div class="gs-masthead__pods" style="align-items:center">
        <div class="gs-pod">
          <span class="gs-pod__lbl">${icon('burger', { size: 12 })} Active Menu</span>
          <span class="gs-pod__val">${activeItems.length}</span>
          <span class="gs-pod__sub">of ${state.menu.length} total items</span>
        </div>
        <div class="gs-pod gs-pod--gold">
          <span class="gs-pod__lbl">${icon('dollar', { size: 12 })} Avg Burger</span>
          <span class="gs-pod__val">${money(avgBurgerCents, { currency })}</span>
          <span class="gs-pod__sub">${burgers.length} smash &amp; chicken</span>
        </div>
        <div class="gs-pod">
          <span class="gs-pod__lbl">${icon('flame', { size: 12 })} Stations</span>
          <span class="gs-pod__val">${stationSet.size}</span>
          <span class="gs-pod__sub">Routed lines</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="menu-new">${icon('plus', { size: 16 })} Add Menu Item</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 16 })}<input type="search" data-action="menu-search" value="${state.menuSearch}" placeholder="Search burgers, station, ingredients…"></label>
      <div class="tk-segmented">
        ${['All', ...CATS].map((c) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.menuCatFilter === c })}" data-action="menu-cat" data-cat="${c}">${c}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" aria-label="View layout">
        <button type="button" class="${cls('tk-pill', { 'is-on': mode === 'board' })}" data-action="menu-view-mode" data-mode="board" style="display:inline-flex;align-items:center;gap:5px">${icon('grid', { size: 13 })} Build Cards</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': mode === 'table' })}" data-action="menu-view-mode" data-mode="table" style="display:inline-flex;align-items:center;gap:5px">${icon('list', { size: 13 })} Table</button>
      </div>
    </div>

    ${state.loading && !state.menu.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : !rows.length ? html`
      <section class="tk-sheet">${emptyState({ iconName: 'burger', title: 'No menu items match', text: 'Add smash burgers, crispy chicken, fries, shakes and combos.' })}</section>
    ` : mode === 'board' ? html`
      <div>
        ${grouped.map((g) => html`
          <section class="gs-menu-section" data-key="sec-${g.cat}">
            <div class="gs-menu-section__head">
              <span class="gs-tile__ico ${catTileClass(g.cat)}" style="width:28px;height:28px;border-radius:8px">${icon(catIconName(g.cat), { size: 15 })}</span>
              <h2 class="gs-menu-section__title">${g.cat}s</h2>
              <span class="tk-sheet__count">${g.items.length}</span>
            </div>
            <div class="gs-build-grid">
              ${g.items.map((m) => html`
                <article class="${cls('gs-build-card', catTileClass(m.category), { 'gs-build-card--off': m.active !== 'Active' })}" data-key="bc-${m.id}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                    <div style="display:flex;align-items:flex-start;gap:10px;min-width:0">
                      <span class="gs-tile__ico">${icon(catIconName(m.category), { size: 18 })}</span>
                      <div style="min-width:0">
                        <div style="font-family:var(--k-font-display);font-weight:800;font-size:16px;line-height:1.2">${m.item_name}</div>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
                          <span class="gs-station-pill ${stationCls(m.prep_station)}">${m.prep_station}</span>
                          ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                      </div>
                    </div>
                    <strong style="font-size:16px;font-weight:800;color:var(--k-accent);font-variant-numeric:tabular-nums;white-space:nowrap">${money(m.price_cents, { currency })}</strong>
                  </div>

                  <div style="display:flex;flex-wrap:wrap;gap:5px;min-height:24px;align-content:flex-start">
                    ${(m.ingredients || []).length
                      ? (m.ingredients || []).map((ing) => html`<span class="${ingChipClass(ing)}">${ing}</span>`)
                      : html`<span class="tk-muted" style="font-size:12px">Standard ${m.prep_station} prep build</span>`}
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:9px;border-top:1px dashed var(--k-border)">
                    <button type="button" class="tk-tag ${m.active === 'Active' ? 'tk-tag--ok' : 'tk-tag--bad'}" data-action="menu-toggle" data-id="${m.id}" title="Click to toggle POS availability">
                      ${m.active === 'Active' ? '● Live on POS' : '○ Off menu'}
                    </button>
                    <div style="display:flex;gap:4px">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="menu-edit" data-id="${m.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="menu-del" data-id="${m.id}">Delete</button>
                    </div>
                  </div>
                </article>`)}
            </div>
          </section>`)}
      </div>
    ` : html`
      <section class="tk-sheet">
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Station</th><th>Ingredient Build</th><th>Status</th><th class="tk-num">Price</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((m) => html`
                <tr data-key="m-${m.id}">
                  <td><strong>${m.item_name}</strong> ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                  <td>${m.category}</td>
                  <td><span class="gs-station-pill ${stationCls(m.prep_station)}">${m.prep_station}</span></td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">
                      ${(m.ingredients || []).length ? (m.ingredients || []).map((t) => html`<span class="${ingChipClass(t)}">${t}</span>`) : html`<span class="tk-muted">—</span>`}
                    </div>
                  </td>
                  <td>
                    <button type="button" class="tk-tag ${m.active === 'Active' ? 'tk-tag--ok' : 'tk-tag--bad'}" data-action="menu-toggle" data-id="${m.id}" title="Click to toggle availability">${m.active}</button>
                  </td>
                  <td class="tk-num"><strong>${money(m.price_cents, { currency })}</strong></td>
                  <td class="tk-num">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="menu-edit" data-id="${m.id}">Edit</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="menu-del" data-id="${m.id}">Delete</button>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </section>`}`;
}

export function wireMenuActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="menu-search"]', (e, el) => { state.menuSearch = el.value; draw(); });
  on(root, 'click', '[data-action="menu-cat"]', (e, el) => { state.menuCatFilter = el.dataset.cat; draw(); });
  on(root, 'click', '[data-action="menu-view-mode"]', (e, el) => { state.menuViewMode = el.dataset.mode; draw(); });

  on(root, 'click', '[data-action="menu-toggle"]', async (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const next = item.active === 'Active' ? 'Off menu' : 'Active';
    try {
      await api.put('/api/menu', { id: item.id, active: next });
      toast.success(`${item.item_name} set to ${next}.`);
      await loadScreen('/menu');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="menu-new"]', async () => {
    const made = await formDialog({
      title: 'Add Menu Item',
      submitLabel: 'Save item',
      fields: menuFields(),
      onSubmit: (vals) => api.post('/api/menu', vals),
    });
    if (made) { toast.success('Menu item added.'); await loadScreen('/menu'); }
  });

  on(root, 'click', '[data-action="menu-edit"]', async (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const saved = await formDialog({
      title: `Edit ${item.item_name}`,
      submitLabel: 'Save changes',
      fields: menuFields(item),
      onSubmit: (vals) => api.put('/api/menu', { ...vals, id: item.id }),
    });
    if (saved) { toast.success('Menu item updated.'); await loadScreen('/menu'); }
  });

  on(root, 'click', '[data-action="menu-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete menu item?', message: 'Past orders stay intact. This removes the item from the Order Counter.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/menu', { id: Number(el.dataset.id) }); toast.success('Menu item deleted.'); await loadScreen('/menu'); }
    catch (err) { toastError(err); }
  });
}
