// Bookings Board (Unified Masthead + Channel-Banded Folio Rows) & Properties Directory (Unified Masthead + Lockbox Vault Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { platformClass, openTurnoverForm } from './command.js';

const PLATFORMS = ['Airbnb', 'Booking.com', 'VRBO', 'Direct', 'Other'];
const BOOKING_STATUSES = ['Confirmed', 'Checked in', 'Checked out', 'Cancelled'];
const PROP_TYPES = ['Apartment', 'House', 'Townhouse', 'Studio', 'Cabin'];
const PROP_STATUSES = ['Live', 'Paused', 'Offboarding'];

const BOOKING_TONE = { Confirmed: 'tk-tag--info', 'Checked in': 'tk-tag--accent', 'Checked out': 'tk-tag--ok', Cancelled: 'tk-tag--bad' };
const PROP_TONE = { Live: 'tk-tag--ok', Paused: 'tk-tag--warn', Offboarding: 'tk-tag--bad' };

function folioChannelCls(platform) {
  if (platform === 'Airbnb') return 'sr-folio--airbnb';
  if (platform === 'Booking.com') return 'sr-folio--booking';
  if (platform === 'VRBO') return 'sr-folio--vrbo';
  if (platform === 'Direct') return 'sr-folio--direct';
  return '';
}

export function renderBookingsView(state) {
  const q = (state.bookingSearch || '').trim().toLowerCase();
  const shown = state.bookings.filter((b) => {
    if (state.bookingPlatform !== 'All' && b.platform !== state.bookingPlatform) return false;
    if (q && !`${b.guest_name} ${b.property_name} ${b.platform} ${b.notes || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const activeBookings = state.bookings.filter((b) => b.status !== 'Cancelled');
  const sameDayCount = activeBookings.filter((b) => Number(b.same_day_next) > 0).length;
  const unscheduledTurns = activeBookings.filter((b) => !b.turnover_id).length;

  return html`
    <section class="sr-masthead" aria-label="Bookings Channel Board">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#e6b35c"></span>
          GUEST STAYS · MULTI-CHANNEL SYNC
        </div>
        <h1 class="sr-masthead__title">Bookings Board</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${activeBookings.length} active stay${activeBookings.length === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Airbnb, Booking.com, VRBO &amp; Direct</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click cleaner turnover launch</span>
        </div>
      </div>

      <div class="sr-masthead__pods" style="align-items:center">
        <div class="sr-pod sr-pod--sand">
          <span class="sr-pod__lbl">${icon('calendar', { size: 12 })} Active Stays</span>
          <span class="sr-pod__val">${activeBookings.length}</span>
          <span class="sr-pod__sub">Upcoming &amp; live</span>
        </div>

        <div class="${cls('sr-pod', { 'sr-pod--alert': sameDayCount > 0 })}">
          <span class="sr-pod__lbl">${icon('zap', { size: 12 })} Same-Day</span>
          <span class="sr-pod__val">${sameDayCount}</span>
          <span class="sr-pod__sub">Back-to-back out</span>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('turnaround', { size: 12 })} Unscheduled</span>
          <span class="sr-pod__val">${unscheduledTurns}</span>
          <span class="sr-pod__sub">Need cleaner</span>
        </div>

        <button type="button" class="k-btn sr-cta-warm" data-action="booking-new">${icon('plus', { size: 15 })} Add Booking</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...PLATFORMS].map((pl) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.bookingPlatform === pl })}" data-action="booking-plat" data-val="${pl}">${pl}</button>`)}
      </div>
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input type="search" placeholder="Search guest or property…" value="${state.bookingSearch || ''}" data-action="booking-search">
      </label>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.bookings.length ? skeleton(4) : shown.length ? shown.map((b) => {
        const nights = Math.max(0, daysBetween(b.check_in, b.check_out));
        return html`
          <div class="sr-folio ${folioChannelCls(b.platform)}" data-key="bk-${b.id}">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${b.property_name || 'Property #' + b.property_id}</span>
                <span class="${platformClass(b.platform)}">${b.platform}</span>
                <span class="tk-tag ${BOOKING_TONE[b.status] || ''}">${b.status}</span>
                ${b.same_day_next > 0 ? html`<span class="sr-urgent-pill">Same-Day Out</span>` : ''}
                ${b.turnover_id ? html`<span class="tk-tag tk-tag--ok">Turnover: ${b.turnover_status}</span>` : ''}
                ${b.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                <span><strong>${b.guest_name}</strong> (${b.guest_count} guest${Number(b.guest_count) === 1 ? '' : 's'})</span>
                <span>In: <strong>${fmtDay(b.check_in)}</strong> → Out: <strong>${fmtDay(b.check_out)}</strong> (${nights} night${nights === 1 ? '' : 's'})</span>
              </div>
              ${b.notes ? html`<div class="tk-muted" style="font-size:12.5px">${b.notes}</div>` : ''}
            </div>
            <div class="tk-row__aside">
              ${!b.turnover_id && b.status !== 'Cancelled' ? html`
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="booking-turnover" data-id="${b.id}">
                  ${icon('turnaround', { size: 13 })} Schedule Turnover
                </button>` : ''}
              ${b.status === 'Confirmed' ? html`<button type="button" class="k-btn k-btn--sm" data-action="booking-status" data-id="${b.id}" data-status="Checked in">Check In</button>` : ''}
              ${b.status === 'Checked in' ? html`<button type="button" class="k-btn k-btn--sm" data-action="booking-status" data-id="${b.id}" data-status="Checked out">Check Out</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="booking-edit" data-id="${b.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="booking-del" data-id="${b.id}">Delete</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'calendar', title: 'No bookings match', text: 'Log guest stays so StayReady can flag same-day turnovers automatically.' })}
    </section>
  `;
}

export function renderPropertiesView(state) {
  const liveCount = state.properties.filter((p) => p.status === 'Live').length;
  const totalBeds = state.properties.reduce((s, p) => s + Number(p.bedrooms || 0), 0);
  const lowProps = state.properties.filter((p) => Number(p.low_supply_count) > 0).length;

  return html`
    <section class="sr-masthead" aria-label="Properties Portfolio">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          PORTFOLIO · ACCESS &amp; WIFI VAULT
        </div>
        <h1 class="sr-masthead__title">Short-Stay Properties</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${liveCount} live listing${liveCount === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${totalBeds} total bedrooms</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap copy lockbox &amp; WiFi codes</span>
        </div>
      </div>

      <div class="sr-masthead__pods" style="align-items:center">
        <div class="sr-pod sr-pod--sand">
          <span class="sr-pod__lbl">${icon('key-card', { size: 12 })} Live Stays</span>
          <span class="sr-pod__val">${liveCount}/${state.properties.length}</span>
          <span class="sr-pod__sub">Active portfolio</span>
        </div>

        <div class="sr-pod">
          <span class="sr-pod__lbl">${icon('bed', { size: 12 })} Capacity</span>
          <span class="sr-pod__val">${totalBeds}</span>
          <span class="sr-pod__sub">Total bedrooms</span>
        </div>

        <div class="${cls('sr-pod', { 'sr-pod--alert': lowProps > 0 })}">
          <span class="sr-pod__lbl">${icon('linen-stack', { size: 12 })} Restock</span>
          <span class="sr-pod__val">${lowProps}</span>
          <span class="sr-pod__sub">${lowProps > 0 ? 'Low cupboards' : 'All stocked'}</span>
        </div>

        <button type="button" class="k-btn sr-cta-warm" data-action="prop-new">${icon('plus', { size: 15 })} Add Property</button>
      </div>
    </section>

    ${state.loading && !state.properties.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.properties.length ? html`
      <div class="sr-prop-grid">
        ${state.properties.map((p) => {
          const typeCls = p.property_type === 'House' || p.property_type === 'Townhouse' ? 'sr-prop-card--house' : p.property_type === 'Cabin' ? 'sr-prop-card--cabin' : '';
          return html`
            <article class="sr-prop-card ${typeCls}" data-key="prop-${p.id}">
              <div class="sr-prop-card__head">
                <div style="min-width:0">
                  <div style="font-family:var(--k-font-display);font-weight:800;font-size:16.5px;line-height:1.2">${p.property_name}</div>
                  <div class="tk-muted" style="font-size:12px;margin-top:3px">${p.address || 'No street address'}</div>
                </div>
                <span class="tk-tag ${PROP_TONE[p.status] || ''}">${p.status}</span>
              </div>
              <div class="sr-prop-card__body">
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  <span class="tk-tag tk-tag--accent">${p.property_type}</span>
                  <span class="tk-tag">${p.bedrooms} Bed · ${p.bathrooms} Bath</span>
                  ${p.low_supply_count > 0 ? html`<span class="tk-tag tk-tag--bad">${p.low_supply_count} Low Supply</span>` : html`<span class="tk-tag tk-tag--ok">Stocked ✓</span>`}
                  ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                ${p.owner ? html`<div class="tk-muted" style="font-size:12.5px">Owner: <strong style="color:var(--k-text)">${p.owner}</strong></div>` : ''}
                ${p.access_instructions ? html`
                  <button type="button" class="sr-lockbox" data-action="prop-copy-access" data-id="${p.id}">
                    <span class="sr-lockbox__icon">${icon('key', { size: 13 })}</span>
                    <span style="min-width:0;flex:1;display:grid;gap:2px">
                      <span class="sr-lockbox__label">Lockbox / Smart Lock / WiFi</span>
                      <span class="tk-mono" style="font-size:11.5px;word-break:break-word">${p.access_instructions}</span>
                    </span>
                    <span class="tk-tag tk-tag--accent">${icon('copy', { size: 11 })} Copy</span>
                  </button>` : html`<div class="tk-muted" style="font-size:12.5px">No lockbox or WiFi instructions saved yet.</div>`}
              </div>
              <div class="sr-prop-card__foot">
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="prop-edit" data-id="${p.id}">Edit</button>
                  <a href="#/supplies" class="k-btn k-btn--ghost k-btn--sm" data-action="prop-jump-supplies" data-id="${p.id}">${icon('linen-stack', { size: 13 })} Supplies</a>
                </div>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prop-del" data-id="${p.id}">Delete</button>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'home', title: 'No properties added yet', text: 'Add your first apartment, house, studio or cabin to manage bookings and turnovers.' })}
  `;
}

export function wireBookingsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="booking-plat"]', (e, el) => { state.bookingPlatform = el.dataset.val; draw(); });
  on(root, 'input', '[data-action="booking-search"]', (e, el) => { state.bookingSearch = el.value; draw(); });

  const bookingFields = (b = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Property</span>
        <select class="k-input" name="property_id" required>
          ${state.properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(b.property_id) ? 'selected' : ''}>${p.property_name}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Guest Name</span><input class="k-input" name="guest_name" value="${b.guest_name || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Check-in Date</span><input class="k-input" type="date" name="check_in" value="${b.check_in || today()}" required></label>
      <label class="k-field"><span class="k-field__label">Check-out Date</span><input class="k-input" type="date" name="check_out" value="${b.check_out || addDays(today(), 3)}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Platform</span>
        <select class="k-input" name="platform">${PLATFORMS.map((p) => html`<option value="${p}" ${p === (b.platform || 'Airbnb') ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Guest Count</span><input class="k-input" type="number" min="1" max="40" name="guest_count" value="${b.guest_count || 2}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${BOOKING_STATUSES.map((s) => html`<option value="${s}" ${s === (b.status || 'Confirmed') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Guest Notes</span><textarea class="k-input" name="notes" rows="2" placeholder="Early check-in, cot request, celebration…">${b.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="booking-new"]', async () => {
    if (!state.properties.length) {
      const p = await api.get('/api/properties');
      state.properties = p.properties || [];
    }
    if (!state.properties.length) { toast.error('Add a property first.'); return; }
    const made = await formDialog({ title: 'Add Guest Booking', submitLabel: 'Save booking', fields: bookingFields(), onSubmit: (v) => api.post('/api/bookings', v) });
    if (made) { toast.success('Booking added.'); await loadScreen('/bookings'); }
  });

  on(root, 'click', '[data-action="booking-edit"]', async (e, el) => {
    const b = state.bookings.find((x) => String(x.id) === el.dataset.id);
    if (!b) return;
    const saved = await formDialog({ title: `Edit Booking · ${b.guest_name}`, submitLabel: 'Save booking', fields: bookingFields(b), onSubmit: (v) => api.put('/api/bookings', { ...v, id: b.id }) });
    if (saved) { toast.success('Booking updated.'); await loadScreen('/bookings'); }
  });

  on(root, 'click', '[data-action="booking-status"]', async (e, el) => {
    try { await api.post('/api/bookings/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Booking marked ${el.dataset.status}.`); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="booking-turnover"]', (e, el) => {
    const b = state.bookings.find((x) => String(x.id) === el.dataset.id);
    if (!b) return;
    openTurnoverForm(state, { loadScreen }, {
      property_id: b.property_id,
      booking_id: b.id,
      turnover_date: b.check_out,
      start_time: '10:30',
      linen_required: 'Yes',
      notes: `Checkout clean after ${b.guest_name} (${b.guest_count} guests, ${b.platform}).`,
    });
  });

  on(root, 'click', '[data-action="booking-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete booking?', message: 'Delete this guest booking?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/bookings', { id: Number(el.dataset.id) }); toast.success('Booking deleted.'); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });

  const propFields = (p = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Property Name</span><input class="k-input" name="property_name" value="${p.property_name || ''}" placeholder="e.g. Seaview Apartment 4B" required></label>
      <label class="k-field"><span class="k-field__label">Type</span>
        <select class="k-input" name="property_type">${PROP_TYPES.map((t) => html`<option value="${t}" ${t === (p.property_type || 'Apartment') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Address</span><input class="k-input" name="address" value="${p.address || ''}"></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Bedrooms</span><input class="k-input" type="number" min="0" max="30" name="bedrooms" value="${p.bedrooms ?? 2}"></label>
      <label class="k-field"><span class="k-field__label">Bathrooms</span><input class="k-input" type="number" step="0.5" min="0" max="20" name="bathrooms" value="${p.bathrooms ?? 1}"></label>
      <label class="k-field"><span class="k-field__label">Listing Status</span>
        <select class="k-input" name="status">${PROP_STATUSES.map((s) => html`<option value="${s}" ${s === (p.status || 'Live') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Owner Name</span><input class="k-input" name="owner" value="${p.owner || ''}"></label>
    <label class="k-field"><span class="k-field__label">Lockbox, WiFi &amp; Access Instructions</span>
      <textarea class="k-input" name="access_instructions" rows="3" placeholder="Lockbox PIN, smart lock code, WiFi SSID/password, parking, linen cupboard…">${p.access_instructions || ''}</textarea>
    </label>`;

  on(root, 'click', '[data-action="prop-new"]', async () => {
    const made = await formDialog({ title: 'Add Short-Stay Property', submitLabel: 'Save property', fields: propFields(), onSubmit: (v) => api.post('/api/properties', v) });
    if (made) { toast.success('Property added.'); await loadScreen('/properties'); }
  });
  on(root, 'click', '[data-action="prop-edit"]', async (e, el) => {
    const p = state.properties.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({ title: `Edit ${p.property_name}`, submitLabel: 'Save property', fields: propFields(p), onSubmit: (v) => api.put('/api/properties', { ...v, id: p.id }) });
    if (saved) { toast.success('Property updated.'); await loadScreen('/properties'); }
  });
  on(root, 'click', '[data-action="prop-copy-access"]', (e, el) => {
    const p = state.properties.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    copyText(`${p.property_name}\n${p.address || ''}\nLockbox / WiFi / Access:\n${p.access_instructions}`, { title: 'Property Access & WiFi' });
  });
  on(root, 'click', '[data-action="prop-jump-supplies"]', (e, el) => {
    state.supplyPropertyFilter = el.dataset.id;
  });
  on(root, 'click', '[data-action="prop-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete property?', message: 'Deletes this property (only allowed when no linked bookings exist).', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/properties', { id: Number(el.dataset.id) }); toast.success('Property deleted.'); await loadScreen('/properties'); }
    catch (err) { toastError(err); }
  });
}
