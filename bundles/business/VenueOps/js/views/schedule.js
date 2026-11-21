// Space Schedule & Bookings Command — Architectural Indigo & Brass Masthead, Interactive 08:00-22:00 Day Availability Timeline
// (clickable booking blocks & 1-click space booking), Two-Column Diary + Sticky Turnarounds & Deposits Rail, overlap protection & printable Confirmation.
import { html, on, cls, qs, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const PURPOSES = ['Party or celebration', 'Meeting', 'Class or workshop', 'Sport', 'Performance', 'Community event'];
const BOOKING_STATUSES = ['Enquiry', 'Tentative', 'Confirmed', 'Paid', 'Completed', 'Cancelled'];
const STATUS_TAG = {
  Enquiry: '',
  Tentative: 'tk-tag--warn',
  Confirmed: 'tk-tag--info',
  Paid: 'tk-tag--ok',
  Completed: 'tk-tag--ok',
  Cancelled: 'tk-tag--bad',
};
const FOLIO_TONE = {
  Enquiry: 'vo-folio--enquiry',
  Tentative: 'vo-folio--tentative',
  Confirmed: '',
  Paid: 'vo-folio--paid',
  Completed: 'vo-folio--completed',
  Cancelled: 'vo-folio--cancelled',
};

const TL_START_MIN = 8 * 60;  // 08:00
const TL_END_MIN = 22 * 60;   // 22:00
const TL_SPAN_MIN = TL_END_MIN - TL_START_MIN; // 840 min (14h)
const TL_LABELS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

function clockMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function calcHours(start, end) {
  const diff = clockMinutes(end) - clockMinutes(start);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function timelineMetrics(startTime, endTime) {
  const s = Math.max(TL_START_MIN, Math.min(TL_END_MIN, clockMinutes(startTime)));
  const e = Math.max(TL_START_MIN, Math.min(TL_END_MIN, clockMinutes(endTime)));
  if (e <= s) return null;
  const left = ((s - TL_START_MIN) / TL_SPAN_MIN) * 100;
  const width = Math.max(3, ((e - s) / TL_SPAN_MIN) * 100);
  return { left: left.toFixed(2), width: Math.min(100 - left, width).toFixed(2), mins: e - s };
}

function renderPaymentPills(b, currency) {
  const amount = Number(b.amount_cents || 0);
  const paid = Number(b.paid_cents || 0);
  const balance = Number(b.balance_cents != null ? b.balance_cents : Math.max(0, amount - paid));
  if (b.status === 'Cancelled') {
    return html`<span class="tk-tag tk-tag--bad">Cancelled</span>`;
  }
  if (amount > 0 && balance === 0) {
    return html`<span class="vo-pay-pill vo-pay-pill--paid">${icon('check', { size: 11 })} Paid in Full (${money(paid || amount, { currency })})</span>`;
  }
  if (paid > 0 && balance > 0) {
    return html`
      <span class="vo-pay-pills">
        <span class="vo-pay-pill vo-pay-pill--deposit">Deposit: ${money(paid, { currency })}</span>
        <span class="vo-pay-pill vo-pay-pill--due">Due: ${money(balance, { currency })}</span>
      </span>`;
  }
  if (amount > 0) {
    return html`
      <span class="vo-pay-pills">
        <span class="vo-pay-pill vo-pay-pill--unpaid">Balance Due: ${money(balance, { currency })}</span>
      </span>`;
  }
  return '';
}

function buildBookingRunSheetText(b, setup, settings) {
  const cur = settings.currency || 'AUD';
  const paid = Number(b.paid_cents || 0);
  const balance = Number(b.balance_cents != null ? b.balance_cents : Math.max(0, Number(b.amount_cents || 0) - paid));
  const lines = [
    `${settings.business_name || 'VenueOps'} — VENUE RUN SHEET (${b.booking_ref})`,
    '========================================',
    `Date & Window: ${fmtDay(b.booking_date, { weekday: 'short' })} · ${b.start_time} – ${b.end_time} (${b.duration_hours}h)`,
    `Space:         ${b.space_name}`,
    `Hirer:         ${b.client_name}${b.phone ? ' · ' + b.phone : ''}${b.email ? ' · ' + b.email : ''}`,
    `Purpose:       ${b.purpose} · Status: ${b.status}`,
    '',
    'ROOM SETUP & EQUIPMENT',
    '----------------------------------------',
    setup
      ? `Layout:        ${setup.layout} (${setup.setup_complete === 'Yes' ? 'Ready ✓' : 'Pending'})\nEquipment:     ${(setup.equipment || []).join(', ') || 'Standard'}\nCatering:      ${setup.catering_required}${setup.notes ? '\nSetup Notes:   ' + setup.notes : ''}`
      : (b.setup_layout ? `Layout:        ${b.setup_layout} (${b.setup_status === 'Yes' ? 'Ready ✓' : 'Pending'})` : 'Standard room configuration (no custom setup sheet logged)'),
    '',
    'FINANCIAL SUMMARY',
    '----------------------------------------',
    `Total Hire:    ${money(b.amount_cents, { currency: cur })} (${money(b.hourly_rate_cents, { currency: cur })}/hr)`,
    `Deposit/Paid:  ${money(paid, { currency: cur })}`,
    `Balance Due:   ${money(balance, { currency: cur })}${balance === 0 ? ' (PAID IN FULL)' : ''}`,
  ];
  if (b.notes) lines.push('', `Booking Notes: ${b.notes}`);
  return lines.join('\n');
}

function buildDayRunSheetText(dayStr, dayBookings, setups, settings) {
  const cur = settings.currency || 'AUD';
  const setupByBk = new Map();
  for (const s of setups || []) setupByBk.set(s.booking_id, s);
  const lines = [
    `${settings.business_name || 'VenueOps'} — DAILY VENUE RUN SHEET`,
    `Date: ${fmtDay(dayStr, { weekday: 'long' })} (${dayBookings.length} booking${dayBookings.length === 1 ? '' : 's'})`,
    '========================================',
  ];
  for (const b of dayBookings) {
    const su = setupByBk.get(b.id);
    const paid = Number(b.paid_cents || 0);
    const bal = Number(b.balance_cents != null ? b.balance_cents : Math.max(0, Number(b.amount_cents || 0) - paid));
    lines.push(
      '',
      `${b.start_time}–${b.end_time} | ${b.space_name} | ${b.booking_ref} [${b.status}]`,
      `  Hirer: ${b.client_name}${b.phone ? ' (' + b.phone + ')' : ''} · ${b.purpose}`,
      `  Payment: Paid ${money(paid, { currency: cur })} / Balance Due ${money(bal, { currency: cur })}`,
    );
    if (su) {
      lines.push(`  Setup: ${su.layout} [${su.setup_complete === 'Yes' ? 'READY' : 'TO DO'}] · Equip: ${(su.equipment || []).join(', ') || 'Standard'}${su.catering_required === 'Yes' ? ' · CATERING' : ''}`);
      if (su.notes) lines.push(`  Setup Notes: ${su.notes}`);
    }
    if (b.notes) lines.push(`  Notes: ${b.notes}`);
  }
  return lines.join('\n');
}

export function renderScheduleView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const tlDate = state.timelineDate || today();
  const tlBookings = (state.timelineBookings || []).filter((b) => b.status !== 'Cancelled' && b.booking_date === tlDate);

  // Live per-space counts across loaded bookings
  const spaceCounts = new Map();
  for (const b of state.bookings) {
    spaceCounts.set(String(b.space_id), (spaceCounts.get(String(b.space_id)) || 0) + 1);
  }

  const q = (state.bookingSearch || '').trim().toLowerCase();
  const filteredBookings = state.bookings.filter((b) => {
    if (state.spaceFilter !== 'All' && String(b.space_id) !== String(state.spaceFilter)) return false;
    if (q) {
      const hay = `${b.booking_ref} ${b.space_name} ${b.client_name} ${b.purpose} ${b.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const byDay = new Map();
  for (const b of filteredBookings) {
    if (!byDay.has(b.booking_date)) byDay.set(b.booking_date, []);
    byDay.get(b.booking_date).push(b);
  }
  const days = [...byDay.keys()].sort();

  const availSpacesCount = state.spaces.filter((s) => s.status === 'Available').length;
  const pendingSetups = (state.setups || []).filter((s) => s.setup_complete !== 'Yes');
  const pendingPays = (state.payments || []).filter((p) => p.status === 'Pending');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="vo-masthead" aria-label="Venue Diary Command">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#e8b956"></span>
          VENUE DIARY · ${fmtDay(tlDate, { weekday: 'short' })}${tlDate === today() ? ' · TODAY' : ''}
        </div>
        <h1 class="vo-masthead__title">Space Schedule</h1>
        <div class="vo-masthead__meta">
          <span><strong style="color:#f6dca0">${tlBookings.length} booking${tlBookings.length === 1 ? '' : 's'}</strong> on diary track</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${availSpacesCount} of ${state.spaces.length} spaces bookable</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Click any slot or booking block below</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="vo-pod vo-pod--gold">
          <span class="vo-pod__lbl">${icon('trending', { size: 12 })} Booked Hire</span>
          <span class="vo-pod__val">${money(counts.bookedValueCents || 0, { currency })}</span>
          <span class="vo-pod__sub">${counts.activeBookings || 0} active booking${counts.activeBookings === 1 ? '' : 's'}</span>
        </div>

        <a href="#/payments" class="vo-pod">
          <span class="vo-pod__lbl">${icon('dollar', { size: 12 })} Collected</span>
          <span class="vo-pod__val">${money(counts.collectedCents || 0, { currency })}</span>
          <span class="vo-pod__sub">${counts.pendingPaymentsCents > 0 ? `${money(counts.pendingPaymentsCents, { currency })} pending →` : 'All settled →'}</span>
        </a>

        <a href="#/setups" class="vo-pod">
          <span class="vo-pod__lbl">${icon('check-square', { size: 12 })} Room Setups</span>
          <span class="vo-pod__val">${counts.pendingSetups || 0}</span>
          <span class="vo-pod__sub">${counts.pendingSetups > 0 ? 'Turnarounds to do →' : 'All rooms ready →'}</span>
        </a>

        <a href="#/incidents" class="${cls('vo-pod', { 'vo-pod--alert': counts.openIncidents > 0 })}">
          <span class="vo-pod__lbl">${icon(counts.openIncidents > 0 ? 'alert' : 'shield-check', { size: 12 })} Incidents</span>
          <span class="vo-pod__val">${counts.openIncidents || 0}</span>
          <span class="vo-pod__sub">${counts.openIncidents > 0 ? 'Open claim →' : 'No open claims'}</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="bk-new">${icon('plus', { size: 15 })} New Booking</button>
      </div>
    </section>

    <section class="tk-sheet vo-timeline" aria-label="Day Availability Timeline">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">
          ${icon('clock', { size: 17 })} Day Availability · ${fmtDay(tlDate, { weekday: 'short' })}
          ${tlDate === today() ? html`<span class="tk-tag tk-tag--accent">Today</span>` : ''}
        </h2>
        <div class="vo-tl-controls">
          <button type="button" class="k-btn k-btn--sm" data-action="tl-step" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 14 })}</button>
          <input class="k-input" style="min-height:32px;padding:3px 9px;width:auto;font-size:13px" type="date" data-action="tl-date" value="${tlDate}">
          <button type="button" class="k-btn k-btn--sm" data-action="tl-step" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 14 })}</button>
          ${tlDate !== today() ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="tl-today">Today</button>` : ''}
          ${tlBookings.length ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-day-runsheet" data-day="${tlDate}">${icon('copy', { size: 13 })} Copy Run Sheet</button>` : ''}
        </div>
      </div>
      <div class="vo-tl-legend">
        <div class="vo-tl-legend__group">
          <span class="vo-tl-legend__item"><span class="vo-tl-swatch vo-tl-swatch--booked"></span> Confirmed / Paid</span>
          <span class="vo-tl-legend__item"><span class="vo-tl-swatch vo-tl-swatch--tentative"></span> Tentative</span>
          <span class="vo-tl-legend__item"><span class="vo-tl-swatch vo-tl-swatch--open"></span> Open (08:00–22:00)</span>
          <span class="vo-tl-legend__item"><span class="vo-tl-swatch vo-tl-swatch--maint"></span> Maintenance</span>
        </div>
        <span class="vo-tl-legend__hint">Tap any block to edit · Tap + to book space</span>
      </div>
      ${state.loading && !state.spaces.length ? skeleton(3) : state.spaces.length ? html`
        <div class="vo-tl-wrap">
          <div class="vo-tl-grid">
            <div class="vo-tl-axis">
              <div class="vo-tl-axis__lbl">Space</div>
              <div class="vo-tl-hours">
                ${TL_LABELS.map((hr, idx) => idx === TL_LABELS.length - 1
                  ? html`<span><span>${hr}</span><span>22:00</span></span>`
                  : html`<span>${hr}</span>`)}
              </div>
              <div class="vo-tl-axis__lbl" style="text-align:right">Availability</div>
            </div>
            ${state.spaces.map((sp) => {
              const isMaint = sp.status !== 'Available';
              const spBookings = tlBookings.filter((b) => Number(b.space_id) === Number(sp.id));
              let bookedMins = 0;
              const blocks = [];
              for (const b of spBookings) {
                const m = timelineMetrics(b.start_time, b.end_time);
                if (!m) continue;
                bookedMins += m.mins;
                blocks.push({ b, m });
              }
              const openHrs = Math.max(0, Math.round(((TL_SPAN_MIN - bookedMins) / 60) * 10) / 10);
              const pillCls = isMaint
                ? 'vo-tl-open-pill--maint'
                : openHrs <= 0
                  ? 'vo-tl-open-pill--full'
                  : openHrs < 5
                    ? 'vo-tl-open-pill--busy'
                    : 'vo-tl-open-pill--ok';
              return html`
                <div class="vo-tl-row" data-key="tl-sp-${sp.id}">
                  <div class="vo-tl-space">
                    <div class="vo-tl-space__name">${sp.space_name}</div>
                    <div class="vo-tl-space__meta">Cap ${sp.capacity} · ${money(sp.hourly_rate_cents, { currency })}/hr</div>
                  </div>
                  ${isMaint ? html`
                    <div class="vo-tl-track vo-tl-track--maint">
                      <span class="vo-tl-maint-lbl">${sp.status}</span>
                    </div>
                  ` : html`
                    <div class="vo-tl-track">
                      ${!blocks.length ? html`
                        <button type="button" class="vo-tl-open-btn" data-action="sp-book" data-space-id="${sp.id}" data-date="${tlDate}">
                          + Open all day — tap to book ${sp.space_name}
                        </button>` : ''}
                      ${blocks.map(({ b, m }) => html`
                        <button
                          type="button"
                          class="${cls('vo-tl-block', { 'vo-tl-block--tentative': b.status === 'Tentative', 'vo-tl-block--enquiry': b.status === 'Enquiry' })}"
                          style="left:${m.left}%;width:${m.width}%"
                          data-action="bk-edit"
                          data-id="${b.id}"
                          title="${b.booking_ref} · ${b.client_name} (${b.start_time}–${b.end_time}, ${b.status}) — Click to edit"
                        >
                          <span class="vo-tl-block__time">${b.start_time}–${b.end_time}</span>
                          <span class="vo-tl-block__client">${b.client_name}</span>
                        </button>`)}
                    </div>
                  `}
                  <div class="vo-tl-stat-cell">
                    <span class="vo-tl-open-pill ${pillCls}">
                      ${isMaint ? sp.status : openHrs > 0 ? `${openHrs}h open` : 'Full'}
                    </span>
                    ${!isMaint ? html`
                      <button type="button" class="vo-tl-book-mini" data-action="sp-book" data-space-id="${sp.id}" data-date="${tlDate}" title="Book ${sp.space_name}" aria-label="Book ${sp.space_name}">
                        ${icon('plus', { size: 13 })}
                      </button>` : ''}
                  </div>
                </div>`;
            })}
          </div>
        </div>` : html`<p class="tk-muted" style="padding:16px">Add spaces under Spaces Catalogue to see hourly availability tracks.</p>`}
    </section>

    <div class="vo-split">
      <div class="tk-stack" style="gap:14px">
        <div class="vo-diary-bar">
          <div class="tk-segmented vo-diary-spaces" role="tablist" aria-label="Filter bookings by space">
            <button type="button" class="${cls('tk-pill', { 'is-on': state.spaceFilter === 'All' })}" data-action="bk-space" data-space="All">
              All <span style="opacity:.65;font-size:11px;margin-left:2px">${state.bookings.length}</span>
            </button>
            ${state.spaces.map((sp) => {
              const n = spaceCounts.get(String(sp.id)) || 0;
              return html`
                <button type="button" class="${cls('tk-pill', { 'is-on': String(state.spaceFilter) === String(sp.id) })}" data-action="bk-space" data-space="${sp.id}">
                  ${sp.space_name} <span style="opacity:.65;font-size:11px;margin-left:2px">${n}</span>
                </button>`;
            })}
          </div>
          <div class="vo-diary-bar__tools">
            <label class="tk-search" style="min-height:34px;flex:1 1 200px;max-width:260px">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="bk-search" value="${state.bookingSearch || ''}" placeholder="Find hirer or ref…">
            </label>
            <input class="k-input" style="min-height:34px;padding:3px 9px;width:auto;font-size:13px" type="date" data-action="bk-date" value="${state.bookingDateFilter}" aria-label="Filter bookings by date">
            ${state.bookingDateFilter ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="bk-date-clear">All dates</button>` : ''}
          </div>
        </div>

        <div class="vo-day-group">
          ${state.loading && !state.bookings.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : days.length ? days.map((d) => html`
            <section class="tk-sheet" data-key="day-${d}">
              <div class="tk-sheet__head">
                <h2 class="tk-sheet__title">${icon('calendar', { size: 17 })} ${fmtDay(d, { weekday: 'short' })} ${d === today() ? html`<span class="tk-tag tk-tag--accent">Today</span>` : ''}</h2>
                <span class="tk-sheet__count">${byDay.get(d).length} booking${byDay.get(d).length === 1 ? '' : 's'}</span>
                <div class="tk-sheet__actions">
                  <button type="button" class="k-btn k-btn--sm" data-action="copy-day-runsheet" data-day="${d}">${icon('copy', { size: 13 })} Day Run Sheet</button>
                </div>
              </div>
              <div>
                ${byDay.get(d).map((b) => html`
                  <div class="vo-folio ${FOLIO_TONE[b.status] || ''}" data-key="bk-${b.id}">
                    <div class="vo-folio__main">
                      <div class="vo-folio__top">
                        <span class="vo-ref">${b.booking_ref}</span>
                        <span class="vo-time-slot">${b.start_time} – ${b.end_time} (${b.duration_hours}h)</span>
                        <strong>${b.space_name}</strong>
                        <span class="tk-muted">· ${b.client_name}</span>
                        <span class="tk-tag ${STATUS_TAG[b.status] || ''}">${b.status}</span>
                        ${b.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="vo-folio__meta">
                        <span>${b.purpose}</span>
                        <span>Hire: <strong style="color:var(--k-text)">${money(b.amount_cents, { currency })}</strong> (${money(b.hourly_rate_cents, { currency })}/h)</span>
                        ${renderPaymentPills(b, currency)}
                        ${b.setup_layout ? html`<span class="tk-tag ${b.setup_status === 'Yes' ? 'tk-tag--ok' : 'tk-tag--warn'}">Setup: ${b.setup_layout} ${b.setup_status === 'Yes' ? '✓' : 'To Do'}</span>` : ''}
                      </div>
                      ${b.notes ? html`<div style="font-size:12.5px;color:var(--k-muted)">${b.notes}</div>` : ''}
                    </div>
                    <div class="vo-folio__aside">
                      ${b.status === 'Enquiry' || b.status === 'Tentative' ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="bk-status" data-id="${b.id}" data-status="Confirmed">Confirm</button>` : ''}
                      ${b.status === 'Confirmed' || b.status === 'Paid' ? html`
                        <button type="button" class="k-btn k-btn--sm" data-action="bk-status" data-id="${b.id}" data-status="Completed">Complete</button>` : ''}
                      <button type="button" class="k-btn k-btn--sm" data-action="bk-copy-runsheet" data-id="${b.id}" title="Copy Venue Run Sheet">${icon('copy', { size: 13 })} Run Sheet</button>
                      <button type="button" class="k-btn k-btn--sm" data-action="bk-confirm-doc" data-id="${b.id}">${icon('printer', { size: 13 })} PDF</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="bk-edit" data-id="${b.id}">Edit</button>
                    </div>
                  </div>`)}
              </div>
            </section>`) : emptyState({ iconName: 'calendar', title: 'No venue bookings match', text: 'Adjust your space/date filter or create a new booking with automatic overlap protection.' })}
        </div>
      </div>

      <aside class="vo-rail-panel" aria-label="Turnarounds and Deposits Pulse">
        <section class="vo-rail-card">
          <div class="vo-rail-card__head">
            <span class="vo-rail-card__title">${icon('check-square', { size: 14 })} Room Turnarounds</span>
            <a href="#/setups" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.setups.length})</a>
          </div>
          ${pendingSetups.length ? html`
            <div class="vo-rail-list">
              ${pendingSetups.slice(0, 4).map((su) => html`
                <div class="vo-rail-item" data-key="rail-su-${su.id}">
                  <div class="vo-rail-item__top">
                    <div>
                      <div class="vo-rail-item__name">${su.space_name}</div>
                      <div class="vo-rail-item__sub">${su.booking_ref} · ${fmtDay(su.booking_date)} ${su.start_time}</div>
                    </div>
                    <span class="tk-tag tk-tag--accent">${su.layout}</span>
                  </div>
                  <div class="vo-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${(su.equipment || []).slice(0, 3).join(', ') || 'Standard room'}</span>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="su-toggle-quick" data-id="${su.id}">Mark Ready ✓</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All logged room setups are complete ✓</div>`}
        </section>

        <section class="vo-rail-card">
          <div class="vo-rail-card__head">
            <span class="vo-rail-card__title">${icon('dollar', { size: 14 })} Pending Invoices</span>
            <a href="#/payments" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Ledger</a>
          </div>
          ${pendingPays.length ? html`
            <div class="vo-rail-list">
              ${pendingPays.slice(0, 4).map((p) => html`
                <div class="vo-rail-item" data-key="rail-pm-${p.id}">
                  <div class="vo-rail-item__top">
                    <div>
                      <div class="vo-rail-item__name">${p.client_name}</div>
                      <div class="vo-rail-item__sub">${p.booking_ref} · ${p.space_name}</div>
                    </div>
                    <strong style="font-size:14px;font-variant-numeric:tabular-nums">${money(p.amount_cents, { currency })}</strong>
                  </div>
                  <div class="vo-rail-item__foot">
                    <span class="tk-tag tk-tag--warn">${p.method}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="pay-status-quick" data-id="${p.id}" data-status="Paid">Mark Paid ✓</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No pending invoices awaiting settlement.</div>`}
        </section>

        <section class="vo-rail-card">
          <div class="vo-rail-card__head">
            <span class="vo-rail-card__title">${icon('building', { size: 14 })} Spaces Pulse</span>
            <a href="#/spaces" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Catalogue</a>
          </div>
          <div>
            ${state.spaces.map((sp) => html`
              <div class="vo-space-pulse">
                <div style="display:flex;align-items:center;gap:8px;min-width:0">
                  <span class="${cls('vo-space-pulse__dot', { 'vo-space-pulse__dot--maint': sp.status !== 'Available' })}"></span>
                  <span style="font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sp.space_name}</span>
                </div>
                <span class="tk-muted" style="font-size:11.5px;white-space:nowrap">${sp.status === 'Available' ? `${money(sp.hourly_rate_cents, { currency })}/h` : sp.status}</span>
              </div>`)}
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireScheduleActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="bk-space"]', (e, el) => {
    state.spaceFilter = el.dataset.space;
    draw();
  });
  on(root, 'input', '[data-action="bk-search"]', (e, el) => {
    state.bookingSearch = el.value;
    draw();
  });
  on(root, 'change', '[data-action="bk-date"]', (e, el) => {
    state.bookingDateFilter = el.value;
    if (el.value) state.timelineDate = el.value;
    loadScreen('/');
  });
  on(root, 'click', '[data-action="bk-date-clear"]', () => { state.bookingDateFilter = ''; loadScreen('/'); });

  on(root, 'change', '[data-action="tl-date"]', (e, el) => {
    state.timelineDate = el.value || today();
    loadScreen('/');
  });
  on(root, 'click', '[data-action="tl-step"]', (e, el) => {
    const delta = Number(el.dataset.delta || 0);
    state.timelineDate = addDays(state.timelineDate || today(), delta);
    loadScreen('/');
  });
  on(root, 'click', '[data-action="tl-today"]', () => {
    state.timelineDate = today();
    loadScreen('/');
  });

  on(root, 'click', '[data-action="copy-day-runsheet"]', (e, el) => {
    const dayStr = el.dataset.day || state.timelineDate || today();
    const list = (state.bookings.filter((b) => b.booking_date === dayStr).length
      ? state.bookings.filter((b) => b.booking_date === dayStr)
      : (state.timelineBookings || []).filter((b) => b.booking_date === dayStr))
      .filter((b) => b.status !== 'Cancelled');
    const text = buildDayRunSheetText(dayStr, list, state.setups || [], state.session.settings || {});
    copyText(text, { title: `Venue Run Sheet · ${fmtDay(dayStr)}`, done: 'Venue run sheet copied!' });
  });

  on(root, 'click', '[data-action="bk-copy-runsheet"]', (e, el) => {
    const b = state.bookings.find((x) => String(x.id) === el.dataset.id)
      || (state.timelineBookings || []).find((x) => String(x.id) === el.dataset.id);
    if (!b) return;
    const setup = (state.setups || []).find((s) => Number(s.booking_id) === Number(b.id));
    const text = buildBookingRunSheetText(b, setup, state.session.settings || {});
    copyText(text, { title: `Venue Run Sheet · ${b.booking_ref}`, done: 'Venue run sheet copied!' });
  });

  on(root, 'click', '[data-action="su-toggle-quick"]', async (e, el) => {
    try {
      const id = Number(el.dataset.id);
      const res = await api.post('/api/setups/complete', { id });
      toast.success(res.setup.setup_complete === 'Yes' ? 'Room setup marked ready!' : 'Setup reopened.');
      await loadScreen(state.route);
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="pay-status-quick"]', async (e, el) => {
    try {
      await api.post('/api/payments/status', { id: Number(el.dataset.id), status: el.dataset.status || 'Paid' });
      toast.success(`Payment marked ${el.dataset.status || 'Paid'}.`);
      await loadScreen(state.route);
    } catch (err) { toastError(err); }
  });

  const openBookingDialog = async (bk = null, prefill = {}) => {
    const currency = state.session.settings.currency || 'AUD';
    const bookableSpaces = state.spaces.filter((sp) => sp.status === 'Available' || (bk && sp.id === bk.space_id));
    if (!bookableSpaces.length) { toast.error('Add an Available space first under Spaces Catalogue.'); return; }
    const initSpaceId = bk?.space_id ?? prefill.space_id;
    const initSpace = bookableSpaces.find((s) => String(s.id) === String(initSpaceId)) || bookableSpaces[0];
    const initDate = bk?.booking_date || prefill.booking_date || state.timelineDate || today();
    const initStart = bk?.start_time || '09:00';
    const initEnd = bk?.end_time || '12:00';
    const initHours = calcHours(initStart, initEnd);
    const initFee = Math.round(initHours * initSpace.hourly_rate_cents);

    const saved = await formDialog({
      title: bk ? `Edit Booking ${bk.booking_ref}` : 'New Venue Booking (Overlap Protected)',
      submitLabel: bk ? 'Save Booking' : 'Check Availability & Book',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Space</span>
            <select class="k-input" name="space_id" required>
              ${bookableSpaces.map((sp) => html`<option value="${sp.id}" data-rate="${sp.hourly_rate_cents}" ${String(sp.id) === String(initSpace.id) ? 'selected' : ''}>${sp.space_name} (${money(sp.hourly_rate_cents, { currency })}/h · cap ${sp.capacity})</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Existing hirer <span class="k-field__optional">optional</span></span>
            <select class="k-input" name="client_id">
              <option value="">— Walk-in / Custom hirer —</option>
              ${state.clients.map((c) => html`<option value="${c.id}" data-name="${c.client_name}" data-email="${c.email}" data-phone="${c.phone}" ${String(c.id) === String(bk?.client_id) ? 'selected' : ''}>${c.client_name}${c.organisation ? ' (' + c.organisation + ')' : ''}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hirer / Client name</span><input class="k-input" name="client_name" value="${bk?.client_name || ''}" placeholder="Full name or club" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${bk?.phone || ''}" placeholder="0412 555 000"></label>
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${bk?.email || ''}"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Booking date</span><input class="k-input" type="date" name="booking_date" value="${initDate}" required></label>
          <label class="k-field"><span class="k-field__label">Start time</span><input class="k-input" type="time" name="start_time" value="${initStart}" required></label>
          <label class="k-field"><span class="k-field__label">End time</span><input class="k-input" type="time" name="end_time" value="${initEnd}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Purpose</span>
            <select class="k-input" name="purpose">${PURPOSES.map((p) => html`<option value="${p}" ${p === (bk?.purpose || 'Meeting') ? 'selected' : ''}>${p}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">${BOOKING_STATUSES.map((st) => html`<option value="${st}" ${st === (bk?.status || 'Confirmed') ? 'selected' : ''}>${st}</option>`)}</select>
          </label>
        </div>
        <div class="vo-fee-box">
          <span>Auto-Calculated Hire Fee (hours × hourly rate)</span>
          <span data-fee-preview style="font-size:19px">${money(initFee, { currency })} (${initHours}h)</span>
        </div>
        <label class="k-field"><span class="k-field__label">Booking notes</span><input class="k-input" name="notes" value="${bk?.notes || ''}" placeholder="Access keys, bump-in, AV setup notes…"></label>`,
      onOpen: ({ form }) => {
        const recalc = () => {
          const sel = qs('select[name="space_id"]', form);
          const opt = sel && sel.options[sel.selectedIndex];
          const rate = opt ? Number(opt.dataset.rate || 0) : 0;
          const st = qs('input[name="start_time"]', form)?.value || '';
          const en = qs('input[name="end_time"]', form)?.value || '';
          const hrs = calcHours(st, en);
          const out = qs('[data-fee-preview]', form);
          if (out) out.textContent = hrs > 0 ? `${money(Math.round(hrs * rate), { currency })} (${hrs}h × ${money(rate, { currency })}/h)` : 'End time must be after start time';
        };
        const clientSel = qs('select[name="client_id"]', form);
        if (clientSel) {
          clientSel.addEventListener('change', () => {
            const opt = clientSel.options[clientSel.selectedIndex];
            if (!opt || !opt.value) return;
            const nm = qs('input[name="client_name"]', form);
            const em = qs('input[name="email"]', form);
            const ph = qs('input[name="phone"]', form);
            if (nm && opt.dataset.name) nm.value = opt.dataset.name;
            if (em && opt.dataset.email) em.value = opt.dataset.email;
            if (ph && opt.dataset.phone) ph.value = opt.dataset.phone;
          });
        }
        form.addEventListener('input', recalc);
        form.addEventListener('change', recalc);
      },
      onSubmit: (v) => (bk
        ? api.put('/api/bookings', { ...v, id: bk.id, space_id: Number(v.space_id) })
        : api.post('/api/bookings', { ...v, space_id: Number(v.space_id) })),
    });
    if (saved) {
      toast.success(bk ? `Booking ${saved.booking.booking_ref} updated.` : `Booking ${saved.booking.booking_ref} confirmed — ${money(saved.booking.amount_cents, { currency })}.`);
      await loadScreen(state.route);
    }
  };

  on(root, 'click', '[data-action="bk-new"]', () => openBookingDialog(null));
  on(root, 'click', '[data-action="sp-book"]', (e, el) => {
    openBookingDialog(null, { space_id: el.dataset.spaceId, booking_date: el.dataset.date || state.timelineDate || today() });
  });
  on(root, 'click', '[data-action="bk-edit"]', (e, el) => {
    const bk = state.bookings.find((x) => String(x.id) === el.dataset.id)
      || (state.timelineBookings || []).find((x) => String(x.id) === el.dataset.id);
    if (bk) openBookingDialog(bk);
  });

  on(root, 'click', '[data-action="bk-status"]', async (e, el) => {
    try {
      await api.post('/api/bookings/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Booking marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="bk-confirm-doc"]', async (e, el) => {
    try {
      const data = await api.get('/api/bookings/confirmation', { id: Number(el.dataset.id) });
      const { booking, space, setups, payments } = data;
      const cur = state.session.settings.currency || 'AUD';
      const paidTotal = (payments || []).filter((p) => p.status === 'Paid' || p.status === 'Deposit').reduce((s, p) => s + Number(p.amount_cents), 0);
      const balance = Math.max(0, Number(booking.amount_cents) - paidTotal);
      const payRows = (payments || []).map((p) => `<tr><td>${esc(p.payment_date)}</td><td>${esc(p.method)}</td><td>${esc(p.status)}</td><td class="num">${money(p.amount_cents, { currency: cur })}</td></tr>`).join('');
      const setupHtml = (setups || []).map((s) => `<div class="box"><strong>Room Setup (${esc(s.layout)}):</strong> ${esc((s.equipment || []).join(', ') || 'Standard')} · Catering: ${esc(s.catering_required)} · Status: ${esc(s.setup_complete)}${s.notes ? '<br>' + esc(s.notes) : ''}</div>`).join('');

      downloadHtmlDoc(`venueops-confirmation-${booking.booking_ref}.html`, {
        title: `Booking Confirmation · ${booking.booking_ref}`,
        businessName: state.session.settings.business_name,
        subtitle: `${booking.space_name} · ${fmtDay(booking.booking_date)} (${booking.start_time} – ${booking.end_time})`,
        accent: '#4c35b8',
        bodyHtml: `
          <div class="box">
            <strong>Hirer:</strong> ${esc(booking.client_name)}${booking.phone ? ' · ' + esc(booking.phone) : ''}${booking.email ? ' · ' + esc(booking.email) : ''}<br>
            <strong>Space:</strong> ${esc(booking.space_name)}${space ? ` (Capacity ${space.capacity}, ${esc(space.space_type)})` : ''}<br>
            <strong>Purpose:</strong> ${esc(booking.purpose)} · <strong>Status:</strong> ${esc(booking.status)}
            ${booking.notes ? '<br><strong>Notes:</strong> ' + esc(booking.notes) : ''}
          </div>
          <table>
            <thead><tr><th>Space Hire</th><th class="num">Hours</th><th class="num">Hourly Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>
              <tr><td>${esc(booking.space_name)} (${esc(booking.start_time)} – ${esc(booking.end_time)})</td><td class="num">${booking.duration_hours}</td><td class="num">${money(booking.hourly_rate_cents, { currency: cur })}</td><td class="num">${money(booking.amount_cents, { currency: cur })}</td></tr>
              <tr><td colspan="3">Paid / Deposit Received</td><td class="num">-${money(paidTotal, { currency: cur })}</td></tr>
              <tr class="total-row"><td colspan="3">Balance Remaining</td><td class="num">${money(balance, { currency: cur })}</td></tr>
            </tbody>
          </table>
          ${setupHtml}
          ${payRows ? `<h3>Payments Ledger</h3><table><thead><tr><th>Date</th><th>Method</th><th>Status</th><th class="num">Amount</th></tr></thead><tbody>${payRows}</tbody></table>` : ''}`,
      });
    } catch (err) { toastError(err); }
  });
}
