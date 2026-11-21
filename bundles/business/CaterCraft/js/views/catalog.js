// Menu Packages Tasting Library (w/ 50-Guest Preview & 1-Click Quote Event) and Visual Client Accounts Directory.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const PKG_CATS = ['Breakfast', 'Lunch', 'Dinner', 'Grazing', 'Drinks'];
const PKG_STATUSES = ['Active', 'Seasonal', 'Retired'];
const DIET_SUPPORT = ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal', 'Kosher'];

export function renderPackagesView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const activePkgs = state.packages.filter((p) => p.active_status !== 'Retired');
  const avgPpp = activePkgs.length
    ? Math.round(activePkgs.reduce((s, p) => s + Number(p.price_per_person_cents || 0), 0) / activePkgs.length)
    : 0;
  const rows = state.pkgCat === 'All' ? state.packages : state.packages.filter((p) => p.category === state.pkgCat);

  const catCounts = new Map();
  for (const p of state.packages) catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);

  return html`
    <section class="cc-masthead" aria-label="Menu Packages Library">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          ${icon('menu-book', { size: 12 })} PER-PERSON PRICING &amp; TASTING LIBRARY
        </div>
        <h1 class="cc-masthead__title">Menu Packages</h1>
        <div class="cc-masthead__meta">
          <span>Selecting a package on an event auto-calculates per-head quotes &amp; 30% deposits</span>
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod">
          <span class="cc-pod__lbl">${icon('menu-book', { size: 12 })} Live Menus</span>
          <span class="cc-pod__val">${activePkgs.length}</span>
          <span class="cc-pod__sub">of ${state.packages.length} packages</span>
        </div>
        <div class="cc-pod cc-pod--gold">
          <span class="cc-pod__lbl">${icon('dollar', { size: 12 })} Avg / Head</span>
          <span class="cc-pod__val">${money(avgPpp, { currency })}</span>
          <span class="cc-pod__sub">Per person rate</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="pkg-new">${icon('plus', { size: 16 })} Add Package</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...PKG_CATS].map((c) => {
          const n = c === 'All' ? state.packages.length : (catCounts.get(c) || 0);
          return html`<button type="button" class="${cls('tk-pill', { 'is-on': state.pkgCat === c })}" data-action="pkg-cat" data-cat="${c}">${c} <span style="opacity:.65;font-size:11px;margin-left:2px">${n}</span></button>`;
        })}
      </div>
    </div>

    ${state.loading && !state.packages.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="tk-cards">
        ${rows.map((p) => {
          const sampleGuests = Math.max(50, Number(p.min_guests || 20));
          const sampleQuote = sampleGuests * Number(p.price_per_person_cents || 0);
          return html`
            <article class="tk-card cc-pkg-card" data-key="pkg-${p.id}">
              <div class="cc-pkg-card__head">
                <div>
                  <h3 class="tk-card__title" style="font-family:var(--k-font-display);font-size:18px">${p.package_name}</h3>
                  <div class="tk-card__sub">${p.category} · Min ${p.min_guests} guests</div>
                </div>
                <div class="cc-pkg-price">${money(p.price_per_person_cents, { currency })}<span style="font-size:12px;font-weight:600;color:var(--k-muted)">/pp</span></div>
              </div>
              <div class="cc-pkg-card__body">
                <p style="font-size:13.5px;line-height:1.45;color:var(--k-text)">${p.description || 'Custom seasonal selection.'}</p>
                <div class="cc-per-head-bar">
                  <span>Sample ${sampleGuests}-guest quote</span>
                  <span class="cc-per-head-val">${money(sampleQuote, { currency })}</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  <span class="tk-tag ${p.active_status === 'Active' ? 'tk-tag--ok' : p.active_status === 'Seasonal' ? 'tk-tag--warn' : ''}">${p.active_status}</span>
                  ${(p.dietary_support || []).map((d) => html`<span class="tk-tag tk-tag--accent">${d}</span>`)}
                  ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:9px;border-top:1px dashed var(--k-border)">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="pkg-quote" data-id="${p.id}">${icon('plus', { size: 13 })} Quote Event</button>
                  <div style="display:flex;gap:4px">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="pkg-edit" data-id="${p.id}">Edit</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="pkg-del" data-id="${p.id}">Delete</button>
                  </div>
                </div>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'menu-book', title: 'No menu packages found', text: 'Create breakfast, lunch, dinner, grazing and drinks packages with per-person pricing.' })}
  `;
}

export function renderClientsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.clientSearch.trim().toLowerCase();
  const rows = q
    ? state.clients.filter((c) => c.client_name.toLowerCase().includes(q) || c.organisation.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : state.clients;

  const totalLtv = state.clients.reduce((s, c) => s + Number(c.lifetime_cents || 0), 0);
  const totalJobs = state.clients.reduce((s, c) => s + Number(c.jobs_count || 0), 0);

  return html`
    <section class="cc-masthead" aria-label="Clients & Organisers Directory">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          ${icon('users', { size: 12 })} CORPORATE, SCHOOLS &amp; PRIVATE HOSTS
        </div>
        <h1 class="cc-masthead__title">Clients Directory</h1>
        <div class="cc-masthead__meta">
          <span>Billing contacts, venue terms &amp; lifetime catering value</span>
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod">
          <span class="cc-pod__lbl">${icon('users', { size: 12 })} Accounts</span>
          <span class="cc-pod__val">${state.clients.length}</span>
          <span class="cc-pod__sub">${totalJobs} events booked</span>
        </div>
        <div class="cc-pod cc-pod--gold">
          <span class="cc-pod__lbl">${icon('trending', { size: 12 })} Lifetime Value</span>
          <span class="cc-pod__val">${money(totalLtv, { currency })}</span>
          <span class="cc-pod__sub">Cumulative quotes</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="client-new">${icon('plus', { size: 16 })} Add Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 16 })}<input type="search" data-action="client-search" value="${state.clientSearch}" placeholder="Search clients, organisations, email…"></label>
    </div>

    ${state.loading && !state.clients.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="cc-client-grid">
        ${rows.map((c) => html`
          <article class="cc-client-card" data-key="cl-${c.id}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
              <div style="display:flex;align-items:center;gap:11px;min-width:0">
                <span class="cc-client-avatar">${initials(c.client_name)}</span>
                <div style="min-width:0">
                  <div style="font-family:var(--k-font-display);font-size:17px;font-weight:700;line-height:1.15">${c.client_name}</div>
                  <div style="font-size:12.5px;color:var(--k-muted);margin-top:2px">${c.organisation || 'Private Host'}</div>
                </div>
              </div>
              <div style="text-align:right;font-variant-numeric:tabular-nums">
                <div style="font-size:16px;font-weight:800;color:var(--k-accent)">${money(c.lifetime_cents || 0, { currency })}</div>
                <div style="font-size:11px;color:var(--k-muted)">${c.jobs_count || 0} event${c.jobs_count === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div style="display:grid;gap:4px;font-size:12.5px;color:var(--k-muted)">
              ${c.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 12 })} ${c.email}</div>` : ''}
              ${c.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 12 })} ${c.phone}</div>` : ''}
              ${c.billing_address ? html`<div style="display:flex;align-items:center;gap:6px">${icon('pin', { size: 12 })} ${c.billing_address}</div>` : ''}
            </div>

            ${c.notes ? html`<div style="font-size:12px;padding:7px 9px;border-radius:8px;background:var(--k-surface-2);color:var(--k-text)">${c.notes}</div>` : ''}

            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:9px;border-top:1px dashed var(--k-border)">
              ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : html`<span></span>`}
              <div style="display:flex;gap:4px">
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="client-del" data-id="${c.id}">Remove</button>
              </div>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No clients match', text: 'Add corporate accounts, event planners and private hosts.' })}</section>`}`;
}

export function wireCatalogActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="pkg-cat"]', (e, el) => { state.pkgCat = el.dataset.cat; draw(); });
  on(root, 'input', '[data-action="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });

  const pkgFields = (p = {}) => {
    const sup = p.dietary_support || [];
    return html`
      <label class="k-field"><span class="k-field__label">Package name</span><input class="k-input" name="package_name" value="${p.package_name || ''}" placeholder="e.g. Executive Boardroom Lunch" required></label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${PKG_CATS.map((c) => html`<option value="${c}" ${c === p.category ? 'selected' : ''}>${c}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Price per person</span><input class="k-input" type="number" step="0.50" min="0" name="price_per_person" value="${p.price_per_person_cents != null ? (p.price_per_person_cents / 100).toFixed(2) : ''}" required></label>
        <label class="k-field"><span class="k-field__label">Min guests</span><input class="k-input" type="number" min="1" name="min_guests" value="${p.min_guests ?? 10}"></label>
      </div>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="active_status">${PKG_STATUSES.map((s) => html`<option value="${s}" ${s === (p.active_status || 'Active') ? 'selected' : ''}>${s}</option>`)}</select></label>
      <div class="k-field">
        <span class="k-field__label">Supported dietary options</span>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${DIET_SUPPORT.map((d) => html`<label class="k-check"><input type="checkbox" name="dietary_support" value="${d}" ${sup.includes(d) ? 'checked' : ''}><span>${d}</span></label>`)}
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Menu description</span><textarea class="k-input" name="description" rows="2">${p.description || ''}</textarea></label>`;
  };

  on(root, 'click', '[data-action="pkg-new"]', async () => {
    const made = await formDialog({ title: 'Add Menu Package', submitLabel: 'Save package', fields: pkgFields(), onSubmit: (v) => api.post('/api/packages', v) });
    if (made) { toast.success('Menu package added.'); await loadScreen('/packages'); }
  });

  on(root, 'click', '[data-action="pkg-edit"]', async (e, el) => {
    const p = state.packages.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({ title: `Edit ${p.package_name}`, submitLabel: 'Save', fields: pkgFields(p), onSubmit: (v) => api.put('/api/packages', { ...v, id: p.id }) });
    if (saved) { toast.success('Menu package updated.'); await loadScreen('/packages'); }
  });

  on(root, 'click', '[data-action="pkg-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete package?', message: 'Existing event quotes stay untouched.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/packages', { id: Number(el.dataset.id) }); toast.success('Package deleted.'); await loadScreen('/packages'); }
    catch (err) { toastError(err); }
  });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client name</span><input class="k-input" name="client_name" value="${c.client_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Organisation</span><input class="k-input" name="organisation" value="${c.organisation || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Billing address</span><input class="k-input" name="billing_address" value="${c.billing_address || ''}"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${c.notes || ''}" placeholder="Invoicing terms, favourite menus…"></label>`;

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({ title: 'Add Client', submitLabel: 'Save client', fields: clientFields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (made) { toast.success('Client added.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.client_name}`, submitLabel: 'Save', fields: clientFields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Client updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove client?', message: 'Delete this client from the directory?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Client removed.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });
}
