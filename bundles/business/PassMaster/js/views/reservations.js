// Editorial Reservations Book — Burgundy masthead w/ Cover Pacing & Service Wave Strip,
// dietary/occasion callout badges, guest search, and smart best-fit "Seat at Table".
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';

const PREFS = ['No preference', 'Window', 'Booth', 'Bar', 'Outside', 'Private'];
const STATUS_CLASS = { Booked: 'tk-tag--info', Seated: 'tk-tag--ok', 'No-show': 'tk-tag--bad', Cancelled: '' };

function extractFlags(notes) {
  const lower = String(notes || '').toLowerCase();
  const out = [];
  if (lower.includes('allerg') || lower.includes('nut') || lower.includes('coeliac') || lower.includes('shellfish') || lower.includes('gluten')) {
    out.push({ label: lower.includes('coeliac') ? 'Coeliac' : 'Dietary / Allergy', kind: 'allergy' });
  }
  if (lower.includes('birthday')) out.push({ label: 'Birthday', kind: 'occasion' });
  else if (lower.includes('anniversary')) out.push({ label: 'Anniversary', kind: 'occasion' });
  else if (lower.includes('tasting') || lower.includes('vip')) out.push({ label: 'VIP / Tasting', kind: 'occasion' });
  return out;
}

function bestTableMatch(rv, avail) {
  if (!avail.length) return null;
  const fits = avail.filter((t) => Number(t.capacity) >= Number(rv.party_size || 1));
  const pool = fits.length ? fits : avail;
  const score = (t) => {
    let s = 0;
    const note = String(t.notes || '').toLowerCase();
    if (rv.table_pref === 'Private' && t.section === 'Private') s += 40;
    if (rv.table_pref === 'Outside' && t.section === 'Patio') s += 35;
    if (rv.table_pref === 'Bar' && t.section === 'Bar') s += 35;
    if (rv.table_pref === 'Window' && note.includes('window')) s += 35;
    if (rv.table_pref === 'Booth' && (note.includes('booth') || note.includes('banquette'))) s += 30;
    s -= Math.abs(Number(t.capacity) - Number(rv.party_size || 2)) * 2;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

function resFields(rv = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Guest name</span><input class="k-input" name="guest_name" value="${rv.guest_name || ''}" placeholder="Full name or party" required></label>
      <label class="k-field"><span class="k-field__label">Party size</span><input class="k-input" type="number" min="1" max="60" name="party_size" value="${rv.party_size ?? 2}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="res_date" value="${rv.res_date || today()}" required></label>
      <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="res_time" value="${rv.res_time || '19:00'}" required></label>
      <label class="k-field"><span class="k-field__label">Table preference</span>
        <select class="k-input" name="table_pref">${PREFS.map((p) => html`<option value="${p}" ${p === (rv.table_pref || 'No preference') ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${rv.phone || ''}" placeholder="0412 555 000"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${rv.email || ''}" placeholder="guest@example.com"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes &amp; Dietary Alerts</span><input class="k-input" name="notes" value="${rv.notes || ''}" placeholder="Anniversary, high chair, nut allergy, regular guest…"></label>`;
}

export function renderReservationsView(state) {
  const availTables = state.tables.filter((t) => t.status === 'Available');
  const activeRes = state.reservations.filter((r) => r.status !== 'Cancelled' && r.status !== 'No-show');
  const totalCovers = activeRes.reduce((s, r) => s + Number(r.party_size || 0), 0);
  const toArrive = state.reservations.filter((r) => r.status === 'Booked');
  const toArriveCovers = toArrive.reduce((s, r) => s + Number(r.party_size || 0), 0);

  // Build service wave slots (grouped by res_time)
  const waveMap = new Map();
  for (const r of activeRes) {
    const slot = r.res_time || 'TBD';
    const cur = waveMap.get(slot) || { slot, covers: 0, parties: 0 };
    cur.covers += Number(r.party_size || 0);
    cur.parties += 1;
    waveMap.set(slot, cur);
  }
  const waves = [...waveMap.values()].sort((a, b) => a.slot.localeCompare(b.slot));

  const stFilter = state.resStatusFilter || 'All';
  const q = (state.resSearch || '').trim().toLowerCase();
  const visible = state.reservations.filter((r) => {
    if (stFilter === 'Booked' && r.status !== 'Booked') return false;
    if (stFilter === 'Seated' && r.status !== 'Seated') return false;
    if (stFilter === 'Closed' && r.status !== 'No-show' && r.status !== 'Cancelled') return false;
    if (q) {
      const hay = `${r.guest_name} ${r.phone || ''} ${r.email || ''} ${r.notes || ''} ${r.table_pref || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return html`
    <section class="pm-masthead" aria-label="Host Stand Diary">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          ${icon('calendar', { size: 12 })} HOST STAND DIARY · ${state.resShowAll ? 'ALL UPCOMING' : fmtDay(state.resDateFilter)}
        </div>
        <h1 class="pm-masthead__title">Reservations Book</h1>
        <div class="pm-masthead__meta">
          <span>Seat bookings in one click to link directly to the Floor Map</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Dietary &amp; occasion flags highlighted</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--gold">
          <span class="pm-pod__lbl">${icon('users', { size: 12 })} Booked Covers</span>
          <span class="pm-pod__val">${totalCovers}</span>
          <span class="pm-pod__sub">${activeRes.length} active part${activeRes.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('clock', { size: 12 })} Yet to Arrive</span>
          <span class="pm-pod__val">${toArriveCovers}</span>
          <span class="pm-pod__sub">${toArrive.length} pending arrival</span>
        </div>
        <a href="#/" class="pm-pod">
          <span class="pm-pod__lbl">${icon('table-seat', { size: 12 })} Open Tables</span>
          <span class="pm-pod__val">${availTables.length}</span>
          <span class="pm-pod__sub">View floor map →</span>
        </a>
        <button type="button" class="k-btn k-btn--primary" data-action="res-new">${icon('plus', { size: 16 })} New Reservation</button>
      </div>

      ${waves.length ? html`
        <div class="pm-wave-bar" aria-label="Service pacing waves">
          <span style="font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.07em;color:#f3d49c;align-self:center;margin-right:4px">Seating Waves:</span>
          ${waves.map((w) => html`
            <span class="pm-wave-slot">
              <strong>${w.slot}</strong>
              <span>${w.covers} covers (${w.parties})</span>
            </span>`)}
        </div>` : ''}
    </section>

    <div class="tk-toolbar">
      <label class="k-field" style="flex-direction:row;align-items:center;gap:8px">
        <span class="k-field__label">Date</span>
        <input class="k-input" style="min-height:35px;width:auto" type="date" data-action="res-date" value="${state.resDateFilter}">
      </label>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': !state.resShowAll })}" data-action="res-mode" data-all="0">Selected Date</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.resShowAll })}" data-action="res-mode" data-all="1">All Dates</button>
      </div>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': stFilter === 'All' })}" data-action="res-status-filter" data-filter="All">All (${state.reservations.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': stFilter === 'Booked' })}" data-action="res-status-filter" data-filter="Booked">To Arrive (${toArrive.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': stFilter === 'Seated' })}" data-action="res-status-filter" data-filter="Seated">Seated</button>
      </div>
      <label class="tk-search" style="margin-left:auto;flex:1 1 180px;max-width:250px">
        ${icon('search', { size: 15 })}
        <input type="search" data-action="res-search" value="${state.resSearch || ''}" placeholder="Search guest, dietary…">
      </label>
    </div>

    <section class="tk-sheet">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">${icon('calendar', { size: 18 })} ${state.resShowAll ? 'All Reservations' : fmtDay(state.resDateFilter)}</h2>
        <span class="tk-sheet__count">${visible.length}</span>
      </div>
      <div>
        ${state.loading && !state.reservations.length ? skeleton(3) : visible.length ? visible.map((rv) => {
          const flags = extractFlags(rv.notes);
          return html`
            <div class="pm-res-row" data-key="rv-${rv.id}">
              <div style="display:flex;align-items:flex-start;gap:13px;min-width:0;flex:1">
                <div class="pm-res-time-stamp">${rv.res_time}</div>
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span style="font-family:var(--k-font-display);font-size:16.5px">${rv.guest_name}</span>
                    <span class="tk-tag" style="font-weight:800">${rv.party_size} guests</span>
                    <span class="tk-tag ${STATUS_CLASS[rv.status] || ''}">${rv.status}${rv.assigned_table_number ? ' · Table ' + rv.assigned_table_number : ''}</span>
                    ${rv.table_pref && rv.table_pref !== 'No preference' ? html`<span class="tk-tag">${rv.table_pref}</span>` : ''}
                    ${flags.map((fl) => html`<span class="pm-flag-pill pm-flag--${fl.kind}">${fl.label}</span>`)}
                    ${rv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    ${state.resShowAll ? html`<span>${fmtDay(rv.res_date)}</span>` : ''}
                    ${rv.phone ? html`<span>${icon('phone', { size: 12 })} ${rv.phone}</span>` : ''}
                    ${rv.email ? html`<span>${rv.email}</span>` : ''}
                    ${rv.notes ? html`<span><strong>Notes:</strong> ${rv.notes}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="tk-row__aside">
                ${rv.status === 'Booked' ? html`
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="res-seat" data-id="${rv.id}">Seat at Table</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="res-status" data-id="${rv.id}" data-status="No-show">No-show</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="res-status" data-id="${rv.id}" data-status="Cancelled">Cancel</button>
                ` : ''}
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="res-edit" data-id="${rv.id}">Edit</button>
              </div>
            </div>`;
        }) : emptyState({ iconName: 'calendar', title: q ? 'No matching bookings' : 'No reservations for this view', text: q ? 'Try another guest name, phone number, or dietary note.' : 'Take a guest booking or switch to All Dates to inspect upcoming services.' })}
      </div>
    </section>`;
}

export function wireReservationsActions(root, state, { draw, loadScreen }) {
  on(root, 'change', '[data-action="res-date"]', (e, el) => {
    state.resDateFilter = el.value || today();
    state.resShowAll = false;
    loadScreen('/reservations');
  });

  on(root, 'click', '[data-action="res-mode"]', (e, el) => {
    state.resShowAll = el.dataset.all === '1';
    loadScreen('/reservations');
  });

  on(root, 'click', '[data-action="res-status-filter"]', (e, el) => {
    state.resStatusFilter = el.dataset.filter;
    draw();
  });

  on(root, 'input', '[data-action="res-search"]', (e, el) => {
    state.resSearch = el.value;
    draw();
  });

  on(root, 'click', '[data-action="res-new"]', async () => {
    const made = await formDialog({
      title: 'New Reservation',
      submitLabel: 'Save booking',
      fields: resFields({ res_date: state.resDateFilter }),
      onSubmit: (v) => api.post('/api/reservations', v),
    });
    if (made) { toast.success('Reservation booked.'); await loadScreen('/reservations'); }
  });

  on(root, 'click', '[data-action="res-edit"]', async (e, el) => {
    const rv = state.reservations.find((x) => String(x.id) === el.dataset.id);
    if (!rv) return;
    const saved = await formDialog({
      title: `Edit · ${rv.guest_name}`,
      submitLabel: 'Save changes',
      fields: resFields(rv),
      onSubmit: (v) => api.put('/api/reservations', { ...v, id: rv.id }),
    });
    if (saved) { toast.success('Reservation updated.'); await loadScreen('/reservations'); }
  });

  on(root, 'click', '[data-action="res-seat"]', async (e, el) => {
    const rv = state.reservations.find((x) => String(x.id) === el.dataset.id);
    if (!rv) return;
    const avail = state.tables.filter((t) => t.status === 'Available');
    if (!avail.length) {
      toast.error('No available tables right now. Clear a table on the Floor Map first.');
      return;
    }
    const best = bestTableMatch(rv, avail);
    const seated = await formDialog({
      title: `Seat ${rv.guest_name} (${rv.party_size} guests)`,
      submitLabel: 'Seat at Table',
      fields: html`
        <p class="tk-muted" style="font-size:14px">Preference: <strong>${rv.table_pref}</strong>${rv.notes ? ' · ' + rv.notes : ''}</p>
        <label class="k-field"><span class="k-field__label">Choose available table</span>
          <select class="k-input" name="table_id" required>
            ${avail.map((t) => html`<option value="${t.id}" ${best && best.id === t.id ? 'selected' : ''}>Table ${t.table_number} — ${t.section} (${t.capacity} seats)${best && best.id === t.id ? ' ★ Best fit' : ''}</option>`)}
          </select>
        </label>`,
      onSubmit: (v) => api.post('/api/reservations/seat', { reservation_id: rv.id, table_id: Number(v.table_id) }),
    });
    if (seated) {
      toast.success(`${rv.guest_name} seated at Table ${seated.table.table_number}!`);
      await loadScreen('/reservations');
    }
  });

  on(root, 'click', '[data-action="res-status"]', async (e, el) => {
    try {
      await api.post('/api/reservations/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Reservation marked ${el.dataset.status}.`);
      await loadScreen('/reservations');
    } catch (err) { toastError(err); }
  });
}
