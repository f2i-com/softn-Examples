// Service Menu Visual Cards, Stylist Roster & Boutique Retail Counter (Unified Editorial Espresso Mastheads).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, fmtDuration } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { openAppointmentForm, printClientReceipt } from './book.js';

const SERVICE_CATS = ['Cut', 'Colour', 'Treatment', 'Nails', 'Beauty', 'Massage'];
const STYLIST_ROLES = ['Senior Stylist', 'Stylist', 'Colour Specialist', 'Nail Technician', 'Beauty Therapist', 'Apprentice'];

function catClass(cat) {
  if (cat === 'Cut' || cat === 'Hair') return 'sl-cat-cut';
  if (cat === 'Colour') return 'sl-cat-colour';
  if (cat === 'Treatment') return 'sl-cat-treatment';
  if (cat === 'Nails') return 'sl-cat-nails';
  return 'sl-cat-beauty';
}

function svcCardMod(cat) {
  if (cat === 'Colour') return 'sl-svc-card--colour';
  if (cat === 'Treatment') return 'sl-svc-card--treatment';
  if (cat === 'Nails') return 'sl-svc-card--nails';
  if (cat === 'Beauty' || cat === 'Massage') return 'sl-svc-card--beauty';
  return '';
}

export function renderServicesView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const shown = state.serviceCat === 'All'
    ? state.services
    : state.services.filter((s) => s.category === state.serviceCat);

  const avgPriceCents = state.services.length
    ? Math.round(state.services.reduce((s, sv) => s + Number(sv.price_cents || 0), 0) / state.services.length)
    : 0;
  const catCount = new Set(state.services.map((s) => s.category)).size;

  return html`
    <section class="sl-masthead" aria-label="Salon Service Menu">
      <div class="sl-masthead__copy">
        <div class="sl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#edd2ab"></span>
          ATELIER MENU · DURATION &amp; PRICING
        </div>
        <h1 class="sl-masthead__title">Service Menu</h1>
        <div class="sl-masthead__meta">
          <span><strong style="color:#f6dec0">${state.services.length} curated service${state.services.length === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Auto-fills duration &amp; price in Chair Book</span>
        </div>
      </div>

      <div class="sl-masthead__pods" style="align-items:center">
        <div class="sl-pod sl-pod--champagne">
          <span class="sl-pod__lbl">${icon('scissors', { size: 12 })} Services</span>
          <span class="sl-pod__val">${state.services.length}</span>
          <span class="sl-pod__sub">${catCount} categories</span>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('dollar', { size: 12 })} Avg Ticket</span>
          <span class="sl-pod__val">${money(avgPriceCents, { currency: cur })}</span>
          <span class="sl-pod__sub">Menu average</span>
        </div>

        <button type="button" class="k-btn sl-cta-gold" data-action="svc-new">${icon('plus', { size: 15 })} Add Service</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...SERVICE_CATS].map((cat) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.serviceCat === cat })}" data-action="svc-cat" data-val="${cat}">${cat}</button>`)}
      </div>
    </div>

    ${state.loading && !state.services.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : shown.length ? html`
      <div class="sl-cards-grid">
        ${shown.map((sv) => html`
          <article class="sl-svc-card ${svcCardMod(sv.category)}" data-key="svc-${sv.id}">
            <div class="sl-svc-card__head">
              <div style="min-width:0">
                <div style="font-family:var(--k-font-display);font-weight:750;font-size:17px;line-height:1.2">${sv.name}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">
                  <span class="tk-tag ${catClass(sv.category)}">${sv.category}</span>
                  <span class="sl-slot">${icon('clock', { size: 11 })} ${fmtDuration(sv.duration_minutes)}</span>
                  ${sv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
              </div>
              <span class="sl-svc-price-big">${money(sv.price_cents, { currency: cur })}</span>
            </div>
            <div class="sl-svc-card__body">
              <div class="tk-muted" style="font-size:13px;line-height:1.5">${sv.description || 'Tailored studio treatment with consultation and finish.'}</div>
            </div>
            <div class="sl-svc-card__foot">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="svc-book" data-id="${sv.id}">${icon('calendar', { size: 13 })} Book Service</button>
              <div class="tk-btn-row">
                <button type="button" class="k-btn k-btn--sm" data-action="svc-edit" data-id="${sv.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="svc-del" data-id="${sv.id}">Delete</button>
              </div>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'scissors', title: 'No services in this category', text: 'Add services with durations and prices to power your appointment book.' })}
  `;
}

export function renderStylistsView(state) {
  const activeCount = state.stylists.filter((s) => Number(s.active) === 1).length;
  const totalAppts = state.stylists.reduce((s, st) => s + Number(st.today_appts || 0), 0);
  const totalMins = state.stylists.reduce((s, st) => s + Number(st.today_minutes || 0), 0);

  return html`
    <section class="sl-masthead" aria-label="Stylist Roster">
      <div class="sl-masthead__copy">
        <div class="sl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#edd2ab"></span>
          HAIR &amp; BEAUTY TEAM · CHAIR ROSTER
        </div>
        <h1 class="sl-masthead__title">Stylist Roster</h1>
        <div class="sl-masthead__meta">
          <span><strong style="color:#f6dec0">${activeCount} stylist${activeCount === 1 ? '' : 's'}</strong> taking bookings</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${totalAppts} appts (${fmtDuration(totalMins)}) booked today</span>
        </div>
      </div>

      <div class="sl-masthead__pods" style="align-items:center">
        <div class="sl-pod sl-pod--champagne">
          <span class="sl-pod__lbl">${icon('star', { size: 12 })} Active</span>
          <span class="sl-pod__val">${activeCount}/${state.stylists.length}</span>
          <span class="sl-pod__sub">Taking bookings</span>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('clock', { size: 12 })} Booked</span>
          <span class="sl-pod__val">${fmtDuration(totalMins)}</span>
          <span class="sl-pod__sub">${totalAppts} chair sessions</span>
        </div>

        <button type="button" class="k-btn sl-cta-gold" data-action="stylist-new">${icon('plus', { size: 15 })} Add Stylist</button>
      </div>
    </section>

    ${state.loading && !state.stylists.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.stylists.length ? html`
      <div class="sl-cards-grid">
        ${state.stylists.map((st) => {
          const loadPct = Math.min(100, Math.round((Number(st.today_minutes || 0) / 420) * 100));
          return html`
            <article class="tk-card" data-key="st-${st.id}">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="sl-chair__avatar">${initials(st.name || 'S')}</div>
                <div style="min-width:0;flex:1">
                  <h2 class="tk-card__title">${st.name}</h2>
                  <div class="tk-card__sub">${st.role}</div>
                </div>
                <span class="tk-tag ${Number(st.active) ? 'tk-tag--ok' : ''}">${Number(st.active) ? 'Active' : 'Paused'}</span>
              </div>
              <div style="display:grid;gap:5px">
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
                  <span>Today's Chair Load</span>
                  <span class="tk-muted">${st.today_appts || 0} appts · ${fmtDuration(st.today_minutes || 0)}</span>
                </div>
                <div class="tk-bar"><div class="tk-bar__fill" style="width:${loadPct}%"></div></div>
              </div>
              <div class="tk-row__meta">
                ${st.phone ? html`<span>${icon('phone', { size: 13 })} ${st.phone}</span>` : ''}
                ${st.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                <button type="button" class="k-btn k-btn--sm" data-action="stylist-toggle" data-id="${st.id}">${Number(st.active) ? 'Pause Bookings' : 'Activate'}</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="stylist-edit" data-id="${st.id}">Edit</button>
                ${st.phone ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="stylist-copy" data-id="${st.id}">${icon('copy', { size: 13 })}</button>` : ''}
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="stylist-del" data-id="${st.id}">Remove</button>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'star', title: 'No stylists added yet', text: 'Add stylists, colour specialists, nail technicians and beauty therapists.' })}
  `;
}

export function renderRetailView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const sum = state.salesSummary || { todayDay: today(), todayRevenueCents: 0, todayUnits: 0, totalRevenueCents: 0, totalUnits: 0 };
  const shown = state.retailDayFilter === 'Today'
    ? state.sales.filter((s) => s.sale_date === today())
    : state.sales;

  return html`
    <section class="sl-masthead" aria-label="Boutique Retail Counter">
      <div class="sl-masthead__copy">
        <div class="sl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#edd2ab"></span>
          BOUTIQUE COUNTER · TAKE-HOME CARE
        </div>
        <h1 class="sl-masthead__title">Retail Sales</h1>
        <div class="sl-masthead__meta">
          <span><strong style="color:#f6dec0">${money(sum.todayRevenueCents, { currency: cur })}</strong> sold today</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Linked to client cards &amp; receipts</span>
        </div>
      </div>

      <div class="sl-masthead__pods" style="align-items:center">
        <div class="sl-pod sl-pod--champagne">
          <span class="sl-pod__lbl">${icon('serum-bottle', { size: 12 })} Today</span>
          <span class="sl-pod__val">${money(sum.todayRevenueCents, { currency: cur })}</span>
          <span class="sl-pod__sub">${sum.todayUnits} unit${sum.todayUnits === 1 ? '' : 's'} sold</span>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('trending', { size: 12 })} All-Time</span>
          <span class="sl-pod__val">${money(sum.totalRevenueCents, { currency: cur })}</span>
          <span class="sl-pod__sub">${sum.totalUnits} total units</span>
        </div>

        <button type="button" class="k-btn sl-cta-gold" data-action="sale-new">${icon('plus', { size: 15 })} Record Sale</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.retailDayFilter === 'All' })}" data-action="retail-filter" data-val="All">All Sales (${state.sales.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.retailDayFilter === 'Today' })}" data-action="retail-filter" data-val="Today">Today Only</button>
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.sales.length ? skeleton(3) : shown.length ? shown.map((sl) => html`
        <div class="tk-row" data-key="sale-${sl.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span>${sl.product_name}</span>
              <span class="tk-tag tk-tag--accent">Qty ${sl.quantity}</span>
              ${sl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              <span><strong>${sl.client_name || 'Client #' + sl.client_id}</strong></span>
              <span>${fmtDay(sl.sale_date)}</span>
            </div>
          </div>
          <div class="tk-row__aside">
            <strong class="sl-price" style="font-size:16px;margin-right:6px">${money(sl.amount_cents, { currency: cur })}</strong>
            <button type="button" class="k-btn k-btn--sm" data-action="sale-receipt" data-client="${sl.client_id}" data-day="${sl.sale_date}">${icon('printer', { size: 13 })} Receipt</button>
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sale-del" data-id="${sl.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'serum-bottle', title: 'No retail sales logged yet', text: 'Log take-home shampoos, oils and beauty products linked to your clients.' })}
    </section>
  `;
}

export function wireStudioActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="svc-cat"]', (e, el) => { state.serviceCat = el.dataset.val; draw(); });

  const svcFields = (sv = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Service Name</span><input class="k-input" name="name" value="${sv.name || ''}" placeholder="e.g. Cut & Blow Dry" required></label>
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${SERVICE_CATS.map((c) => html`<option value="${c}" ${c === (sv.category || 'Cut') ? 'selected' : ''}>${c}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Duration (minutes)</span><input class="k-input" type="number" min="5" max="480" step="5" name="duration_minutes" value="${sv.duration_minutes || 45}" required></label>
      <label class="k-field"><span class="k-field__label">Price</span><input class="k-input" type="number" step="0.01" min="0" name="price" value="${sv.price_cents !== undefined ? (sv.price_cents / 100).toFixed(2) : '95.00'}" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="2" placeholder="What the service includes…">${sv.description || ''}</textarea></label>`;

  on(root, 'click', '[data-action="svc-new"]', async () => {
    const made = await formDialog({ title: 'Add Salon Service', submitLabel: 'Save Service', fields: svcFields(), onSubmit: (v) => api.post('/api/services', v) });
    if (made) { toast.success('Service added.'); await loadScreen('/services'); }
  });
  on(root, 'click', '[data-action="svc-edit"]', async (e, el) => {
    const sv = state.services.find((x) => String(x.id) === el.dataset.id);
    if (!sv) return;
    const saved = await formDialog({ title: `Edit ${sv.name}`, submitLabel: 'Save Service', fields: svcFields(sv), onSubmit: (v) => api.put('/api/services', { ...v, id: sv.id }) });
    if (saved) { toast.success('Service updated.'); await loadScreen('/services'); }
  });
  on(root, 'click', '[data-action="svc-book"]', (e, el) => {
    openAppointmentForm(state, { loadScreen }, { service_id: Number(el.dataset.id) });
  });
  on(root, 'click', '[data-action="svc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete service?', message: 'Remove this service from the menu?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/services', { id: Number(el.dataset.id) }); toast.success('Service deleted.'); await loadScreen('/services'); }
    catch (err) { toastError(err); }
  });

  const stylistFields = (st = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Name</span><input class="k-input" name="name" value="${st.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Role</span><select class="k-input" name="role">${STYLIST_ROLES.map((r) => html`<option value="${r}" ${r === (st.role || 'Stylist') ? 'selected' : ''}>${r}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Phone Number</span><input class="k-input" name="phone" value="${st.phone || ''}"></label>
    <label class="k-check"><input type="checkbox" name="active" ${st.active === undefined || Number(st.active) === 1 ? 'checked' : ''}><span>Currently active / taking bookings</span></label>`;

  on(root, 'click', '[data-action="stylist-new"]', async () => {
    const made = await formDialog({ title: 'Add Stylist / Therapist', submitLabel: 'Save', fields: stylistFields(), onSubmit: (v) => api.post('/api/stylists', v) });
    if (made) { toast.success('Stylist added.'); await loadScreen('/stylists'); }
  });
  on(root, 'click', '[data-action="stylist-edit"]', async (e, el) => {
    const st = state.stylists.find((x) => String(x.id) === el.dataset.id);
    if (!st) return;
    const saved = await formDialog({ title: `Edit ${st.name}`, submitLabel: 'Save', fields: stylistFields(st), onSubmit: (v) => api.put('/api/stylists', { ...v, id: st.id }) });
    if (saved) { toast.success('Stylist updated.'); await loadScreen('/stylists'); }
  });
  on(root, 'click', '[data-action="stylist-toggle"]', async (e, el) => {
    try { await api.post('/api/stylists/toggle', { id: Number(el.dataset.id) }); toast.success('Stylist availability toggled.'); await loadScreen('/stylists'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="stylist-copy"]', (e, el) => {
    const st = state.stylists.find((x) => String(x.id) === el.dataset.id);
    if (st) copyText(`${st.name} (${st.role})\nPhone: ${st.phone}`, { title: 'Stylist Contact' });
  });
  on(root, 'click', '[data-action="stylist-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove stylist?', message: 'Remove this stylist from the roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/stylists', { id: Number(el.dataset.id) }); toast.success('Stylist removed.'); await loadScreen('/stylists'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="retail-filter"]', (e, el) => { state.retailDayFilter = el.dataset.val; draw(); });

  on(root, 'click', '[data-action="sale-new"]', async () => {
    if (!state.clients.length) { const c = await api.get('/api/clients'); state.clients = c.clients || []; }
    if (!state.clients.length) { toast.error('Add a client card first.'); return; }
    const made = await formDialog({
      title: 'Record Retail Product Sale',
      submitLabel: 'Record Sale',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Product Name</span><input class="k-input" name="product_name" placeholder="e.g. Peptide Bond Leave-In Serum" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Quantity</span><input class="k-input" type="number" min="1" max="100" name="quantity" value="1" required></label>
          <label class="k-field"><span class="k-field__label">Total Amount</span><input class="k-input" type="number" step="0.01" min="0" name="amount" value="48.00" required></label>
          <label class="k-field"><span class="k-field__label">Sale Date</span><input class="k-input" type="date" name="sale_date" value="${today()}" required></label>
        </div>`,
      onSubmit: (v) => api.post('/api/sales', v),
    });
    if (made) { toast.success('Retail sale recorded.'); await loadScreen('/retail'); }
  });

  on(root, 'click', '[data-action="sale-receipt"]', async (e, el) => {
    try { await printClientReceipt(Number(el.dataset.client), el.dataset.day, state); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sale-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete retail sale?', message: 'Delete this product sale record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/sales', { id: Number(el.dataset.id) }); toast.success('Retail sale deleted.'); await loadScreen('/retail'); }
    catch (err) { toastError(err); }
  });
}
