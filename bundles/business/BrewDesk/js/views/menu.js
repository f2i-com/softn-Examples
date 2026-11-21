// Menu Board Studio — editorial category board or compact table view, 1-click availability toggle & instant POS sync.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const CATS = ['Coffee', 'Cold drink', 'Tea', 'Food', 'Retail beans'];
const STATIONS = ['Espresso', 'Kitchen', 'Cold bar', 'Retail'];
const ACTIVES = ['Active', 'Seasonal', 'Retired'];
const DIETARY = ['Vegan', 'Gluten-free', 'Dairy-free', 'Nut-free'];

function catVisual(cat) {
  if (cat === 'Coffee') return { cls: 'bd-tile--coffee', ico: 'coffee' };
  if (cat === 'Cold drink') return { cls: 'bd-tile--cold', ico: 'iced-cup' };
  if (cat === 'Tea') return { cls: 'bd-tile--tea', ico: 'leaf' };
  if (cat === 'Food') return { cls: 'bd-tile--food', ico: 'pastry' };
  return { cls: 'bd-tile--retail', ico: 'bean-bag' };
}

function menuFormFields(item = {}) {
  const tags = item.dietary_tags || [];
  return html`
    <label class="k-field"><span class="k-field__label">Item name</span>
      <input class="k-input" name="item_name" value="${item.item_name || ''}" placeholder="e.g. Flat White, Reuben Toastie" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span>
        <select class="k-input" name="category">${CATS.map((c) => html`<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Price</span>
        <input class="k-input" type="number" step="0.05" min="0" name="price" value="${item.price_cents != null ? (item.price_cents / 100).toFixed(2) : ''}" placeholder="5.50" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Station</span>
        <select class="k-input" name="station">${STATIONS.map((s) => html`<option value="${s}" ${s === item.station ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Availability</span>
        <select class="k-input" name="active">${ACTIVES.map((a) => html`<option value="${a}" ${a === (item.active || 'Active') ? 'selected' : ''}>${a}</option>`)}</select>
      </label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Dietary tags</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${DIETARY.map((d) => html`<label class="k-check"><input type="checkbox" name="dietary_tags" value="${d}" ${tags.includes(d) ? 'checked' : ''}><span>${d}</span></label>`)}
      </div>
    </div>`;
}

export function renderMenuView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.menuSearch.trim().toLowerCase();
  const cat = state.menuCat || 'All';
  const viewMode = state.menuViewMode || 'board';

  const activeCnt = state.menu.filter((m) => m.active === 'Active').length;
  const seasonalCnt = state.menu.filter((m) => m.active === 'Seasonal').length;
  const coffees = state.menu.filter((m) => m.category === 'Coffee' && m.active !== 'Retired');
  const avgCoffee = coffees.length ? Math.round(coffees.reduce((s, c) => s + c.price_cents, 0) / coffees.length) : 0;

  const rows = state.menu.filter((m) => {
    if (cat !== 'All' && m.category !== cat) return false;
    if (!q) return true;
    return m.item_name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.station.toLowerCase().includes(q);
  });

  const grouped = CATS
    .map((c) => ({ cat: c, items: rows.filter((r) => r.category === c) }))
    .filter((g) => g.items.length > 0);

  return html`
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow">Cafe Menu Studio</span>
        <h1 class="bd-masthead__title">Menu Board</h1>
        <div class="bd-masthead__meta">
          <span>Active &amp; seasonal items sync to Order Pad immediately; Espresso &amp; Cold bar items auto-fire barista tickets.</span>
        </div>
      </div>
      <div class="bd-masthead__pods">
        <div class="bd-pod">
          <span class="bd-pod__lbl">Active Items</span>
          <span class="bd-pod__val">${activeCnt}</span>
          <span class="bd-pod__sub">${seasonalCnt} seasonal</span>
        </div>
        ${avgCoffee > 0 ? html`
          <div class="bd-pod bd-pod--crema">
            <span class="bd-pod__lbl">Avg Coffee</span>
            <span class="bd-pod__val">${money(avgCoffee, { currency })}</span>
            <span class="bd-pod__sub">${coffees.length} espresso lines</span>
          </div>` : ''}
      </div>
      <div class="tk-hero__actions">
        <button type="button" class="k-btn k-btn--primary" data-action="menu-new">${icon('plus', { size: 16 })} Add Menu Item</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="menu-search" value="${state.menuSearch}" placeholder="Search menu items…"></label>
      <div class="tk-segmented">
        ${['All', ...CATS].map((c) => html`<button type="button" class="${cls('tk-pill', { 'is-on': cat === c })}" data-action="menu-cat" data-cat="${c}">${c === 'Retail beans' ? 'Beans' : c}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto">
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'board' })}" data-action="menu-mode" data-mode="board">${icon('grid', { size: 13 })} Board</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'table' })}" data-action="menu-mode" data-mode="table">${icon('list', { size: 13 })} Table</button>
      </div>
    </div>

    ${state.loading && !state.menu.length ? skeleton(4) : !rows.length ? html`
      <section class="tk-sheet">${emptyState({ iconName: 'utensils', title: 'No menu items found', text: 'Add your coffee, drinks, toasties and retail beans to populate the Order Pad.' })}</section>
    ` : viewMode === 'board' ? html`
      <div>
        ${grouped.map((g) => {
          const vis = catVisual(g.cat);
          return html`
            <section class="bd-menu-section" data-key="mcat-${g.cat}">
              <div class="bd-menu-section__head">
                <span class="bd-tile__ico ${vis.cls}" style="width:30px;height:30px">${icon(vis.ico, { size: 15 })}</span>
                <h2 class="bd-menu-section__title">${g.cat}</h2>
                <span class="tk-sheet__count">${g.items.length}</span>
              </div>
              <div class="bd-menu-cards">
                ${g.items.map((m) => html`
                  <article class="${cls('bd-menu-card', vis.cls, { 'bd-menu-card--retired': m.active === 'Retired' })}" data-key="mc-${m.id}">
                    <div class="tk-card__head">
                      <div>
                        <div class="tk-card__title">${m.item_name} ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</div>
                        <div class="tk-card__sub">${m.station} station</div>
                      </div>
                      <span class="bd-tile__price" style="font-size:17px">${money(m.price_cents, { currency })}</span>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
                      <button type="button" class="tk-tag ${m.active === 'Active' ? 'tk-tag--ok' : m.active === 'Seasonal' ? 'tk-tag--warn' : ''}" data-action="menu-cycle" data-id="${m.id}" title="Click to toggle status">${m.active}</button>
                      ${(m.dietary_tags || []).map((t) => html`<span class="tk-tag">${t}</span>`)}
                    </div>
                    <div class="tk-ticket__foot">
                      <button type="button" class="k-btn k-btn--sm" data-action="menu-edit" data-id="${m.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="menu-del" data-id="${m.id}">Delete</button>
                    </div>
                  </article>`)}
              </div>
            </section>`;
        })}
      </div>` : html`
      <section class="tk-sheet">
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Station</th><th>Dietary</th><th>Status</th><th class="tk-num">Price</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((m) => html`
                <tr data-key="m-${m.id}">
                  <td><strong>${m.item_name}</strong> ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                  <td>${m.category}</td>
                  <td><span class="tk-tag">${m.station}</span></td>
                  <td>${(m.dietary_tags || []).map((t) => html`<span class="tk-tag">${t}</span> `)}</td>
                  <td><button type="button" class="tk-tag ${m.active === 'Active' ? 'tk-tag--ok' : m.active === 'Seasonal' ? 'tk-tag--warn' : ''}" data-action="menu-cycle" data-id="${m.id}" title="Click to toggle status">${m.active}</button></td>
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
  on(root, 'click', '[data-action="menu-cat"]', (e, el) => { state.menuCat = el.dataset.cat; draw(); });
  on(root, 'click', '[data-action="menu-mode"]', (e, el) => { state.menuViewMode = el.dataset.mode; draw(); });

  on(root, 'click', '[data-action="menu-cycle"]', async (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const next = item.active === 'Active' ? 'Seasonal' : item.active === 'Seasonal' ? 'Retired' : 'Active';
    try {
      await api.put('/api/menu', { id: item.id, item_name: item.item_name, category: item.category, price: (item.price_cents / 100).toFixed(2), station: item.station, active: next, dietary_tags: item.dietary_tags || [] });
      toast.success(`${item.item_name} marked ${next}.`);
      await loadScreen('/menu');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="menu-new"]', async () => {
    const made = await formDialog({
      title: 'New Menu Item',
      submitLabel: 'Add to menu',
      fields: menuFormFields(),
      onSubmit: (vals) => api.post('/api/menu', vals),
    });
    if (made) { toast.success('Menu item added.'); await loadScreen('/menu'); }
  });

  on(root, 'click', '[data-action="menu-edit"]', async (e, el) => {
    const item = state.menu.find((m) => String(m.id) === el.dataset.id);
    if (!item) return;
    const saved = await formDialog({
      title: `Edit ${item.item_name}`,
      submitLabel: 'Save item',
      fields: menuFormFields(item),
      onSubmit: (vals) => api.put('/api/menu', { ...vals, id: item.id }),
    });
    if (saved) { toast.success('Menu item updated.'); await loadScreen('/menu'); }
  });

  on(root, 'click', '[data-action="menu-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete menu item?', message: 'Existing orders keep their history, and this item will be removed from the Order Pad.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/menu', { id: Number(el.dataset.id) }); toast.success('Menu item removed.'); await loadScreen('/menu'); }
    catch (err) { toastError(err); }
  });
}
