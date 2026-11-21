// Turnover Command Today: Unified Coastal Indigo & Warm Sand Masthead with Readiness Ring,
// Two-Column Checkout-to-Checkin Command + Sticky Linen/Damage/Movements Rail,
// Same-Day Urgency Countdown Cards, Interactive 6-Task Checklists & 1-Click Cleaner Briefs.
import { html, on, cls, qs } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const TURNOVER_COLS = [
  { status: 'Scheduled', label: 'Scheduled', tone: 'tk-ticket--muted', next: 'Cleaning', nextLabel: 'Start Clean' },
  { status: 'Cleaning', label: 'Cleaning', tone: 'tk-ticket--warn', next: 'Linen Changed', nextLabel: 'Linen Done' },
  { status: 'Linen Changed', label: 'Linen Changed', tone: '', next: 'Inspected', nextLabel: 'Mark Inspected' },
  { status: 'Inspected', label: 'Inspected', tone: 'tk-ticket--ok', next: 'Guest-Ready', nextLabel: 'Guest-Ready' },
  { status: 'Guest-Ready', label: 'Guest-Ready', tone: 'tk-ticket--ok', next: null, nextLabel: '' },
];

const STAGE_ORDER = ['Scheduled', 'Cleaning', 'Linen Changed', 'Inspected', 'Guest-Ready'];
const NEXT_STAGE = {
  Scheduled: { status: 'Cleaning', label: 'Start Clean' },
  Cleaning: { status: 'Linen Changed', label: 'Linen Done' },
  'Linen Changed': { status: 'Inspected', label: 'Mark Inspected' },
  Inspected: { status: 'Guest-Ready', label: 'Guest-Ready ✓' },
};

const CHECKLIST_TASKS = [
  { id: 'beds', label: 'Strip & remake beds / fresh linen' },
  { id: 'kitchen', label: 'Sanitise kitchen, fridge & bin' },
  { id: 'bath', label: 'Scrub bathrooms, glass & mirrors' },
  { id: 'floors', label: 'Vacuum & mop all floors' },
  { id: 'amenities', label: 'Restock toiletries & welcome kit' },
  { id: 'signoff', label: 'Lock check & photo sign-off' },
];

const STATUS_DEFAULT_DONE = {
  Scheduled: 0,
  Cleaning: 2,
  'Linen Changed': 4,
  Inspected: 5,
  'Guest-Ready': 6,
  Issue: 2,
};

export function platformClass(p) {
  if (p === 'Airbnb') return 'sr-plat sr-plat--airbnb';
  if (p === 'Booking.com') return 'sr-plat sr-plat--booking';
  if (p === 'VRBO') return 'sr-plat sr-plat--vrbo';
  if (p === 'Direct') return 'sr-plat sr-plat--direct';
  return 'sr-plat sr-plat--other';
}

function parseClockMinutes(hhmm) {
  const parts = String(hhmm || '').split(':').map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

function formatClock(totalMins) {
  const clamped = ((Math.round(totalMins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function extractTimeFromNote(note, fallback) {
  const text = String(note || '');
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] || 0);
    const mer = ampm[3].toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return formatClock(h * 60 + m);
  }
  const hhmm = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (hhmm) return formatClock(Number(hhmm[1]) * 60 + Number(hhmm[2]));
  return fallback;
}

function fmtHours(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function getWindowInfo(w, state) {
  const override = state.windowTimes?.[w.property_id];
  const outBooking = state.checkOutsToday.find((b) => String(b.id) === String(w.checkout_booking_id));
  const inBooking = state.checkInsToday.find((b) => String(b.id) === String(w.checkin_booking_id));
  const outTime = override?.out || extractTimeFromNote(outBooking?.notes, '10:00');
  const inTime = override?.in || extractTimeFromNote(inBooking?.notes, '15:00');
  const outMins = parseClockMinutes(outTime) ?? 600;
  const inMins = parseClockMinutes(inTime) ?? 900;
  const diffHours = Math.max(0.5, (inMins - outMins) / 60);
  const urgency = w.ready
    ? 'ready'
    : diffHours <= 4
      ? 'critical'
      : diffHours <= 5
        ? 'tight'
        : 'ok';
  const label = `${outTime} out → ${inTime} in · ${fmtHours(diffHours)} window`;
  return { outTime, inTime, diffHours, urgency, label, outNotes: outBooking?.notes || '', inNotes: inBooking?.notes || '' };
}

function getChecklistMap(tv, state) {
  const key = String(tv.id);
  const saved = state.turnoverTasks?.[key];
  if (saved && saved.status === tv.status) return saved.items;
  const defaultCount = STATUS_DEFAULT_DONE[tv.status] ?? 0;
  const items = {};
  CHECKLIST_TASKS.forEach((task, idx) => { items[task.id] = idx < defaultCount; });
  return items;
}

function checklistStats(tv, state) {
  const map = getChecklistMap(tv, state);
  const total = CHECKLIST_TASKS.length;
  const done = CHECKLIST_TASKS.filter((t) => map[t.id]).length;
  const pct = Math.round((done / total) * 100);
  const barTone = pct === 100 ? 'tk-bar__fill--ok' : pct >= 50 ? '' : 'tk-bar__fill--warn';
  return { map, done, total, pct, barTone };
}

function linenSummary(bedrooms, bathrooms, guests, required) {
  if (required === 'No') return 'Refresh towels only';
  const beds = Number(bedrooms) || 2;
  const baths = Number(bathrooms) || 1;
  const g = Number(guests) || beds * 2;
  return `${beds} bed linen + ${Math.max(g, baths * 2)} towels (${g} guests)`;
}

function buildSingleCleanerBrief(tv, state, winObj = null) {
  const biz = state.session.settings.business_name || 'StayReady';
  const prop = state.properties.find((p) => String(p.id) === String(tv.property_id));
  const win = winObj || state.sameDayWindows.find((w) => String(w.property_id) === String(tv.property_id));
  const winInfo = win ? getWindowInfo(win, state) : null;
  const stats = checklistStats(tv, state);
  const bedrooms = tv.bedrooms ?? prop?.bedrooms ?? win?.bedrooms ?? 2;
  const bathrooms = tv.bathrooms ?? prop?.bathrooms ?? win?.bathrooms ?? 1;
  const guests = tv.arriving_guests || win?.arriving_guests || tv.guest_count || 2;
  const lines = [
    `${biz} — Cleaner Turnover Brief`,
    `Property: ${tv.property_name || prop?.property_name || 'Property #' + tv.property_id}`,
    `Address:  ${tv.property_address || prop?.address || 'See property profile'}`,
    `Date:     ${fmtDay(tv.turnover_date || state.commandDay, { weekday: 'short' })} · Start ${tv.start_time || '10:30'}`,
    `Window:   ${winInfo ? `${winInfo.label}${winInfo.diffHours <= 4 ? ' [URGENT <= 4h]' : ' [SAME-DAY]'}` : 'Standard checkout turnover'}`,
    `Cleaner:  ${tv.cleaner_name || 'Unassigned'}`,
    `Linen:    ${linenSummary(bedrooms, bathrooms, guests, tv.linen_required)}`,
    `Door/Key: ${tv.access_instructions || prop?.access_instructions || 'See property access sheet'}`,
    `Progress: ${stats.done}/${stats.total} tasks (${stats.pct}%) · Status: ${tv.status}`,
  ];
  if (win?.arriving_guest) lines.push(`Next In:  ${win.arriving_guest} (${win.arriving_guests} guests · ${win.arriving_platform})`);
  if (tv.notes) lines.push(`Notes:    ${tv.notes}`);
  return lines.join('\n');
}

function renderChecklistWidget(tv, state) {
  const stats = checklistStats(tv, state);
  const isOpen = Boolean(state.expandedChecklists?.[String(tv.id)]);
  return html`
    <div class="sr-checklist-box">
      <div class="sr-checklist-top">
        <span>${stats.done}/${stats.total} tasks · ${stats.pct}%</span>
        <button type="button" class="sr-checklist-toggle" data-action="tv-toggle-checklist" data-id="${tv.id}">
          ${icon('check-square', { size: 12 })} ${isOpen ? 'Hide tasks' : 'Checklist'}
        </button>
      </div>
      <div class="tk-bar"><div class="tk-bar__fill ${stats.barTone}" style="width:${stats.pct}%"></div></div>
      ${isOpen ? html`
        <div class="sr-checklist-items">
          ${CHECKLIST_TASKS.map((task) => {
            const checked = Boolean(stats.map[task.id]);
            return html`
              <label class="${cls('sr-checklist-row', { 'is-done': checked })}">
                <input type="checkbox" ${checked ? 'checked' : ''} data-action="tv-task-check" data-id="${tv.id}" data-task="${task.id}">
                <span>${task.label}</span>
              </label>`;
          })}
          ${stats.done === stats.total && tv.status !== 'Guest-Ready' ? html`
            <button type="button" class="k-btn k-btn--primary k-btn--sm" style="margin-top:4px" data-action="turnover-bump" data-id="${tv.id}" data-status="Guest-Ready">
              ${icon('check', { size: 13 })} All done — Mark Guest-Ready
            </button>` : ''}
        </div>` : ''}
    </div>`;
}

function renderStageBar(status) {
  const idx = STAGE_ORDER.indexOf(status);
  if (idx < 0) return '';
  return html`
    <div class="sr-stage-bar" aria-label="Turnover stage: ${status}">
      ${STAGE_ORDER.map((st, i) => html`
        <span class="${cls('sr-stage-step', { 'is-done': i < idx || (status === 'Guest-Ready' && i === idx), 'is-now': i === idx && status !== 'Guest-Ready' })}">${st === 'Linen Changed' ? 'Linen' : st === 'Guest-Ready' ? 'Ready' : st}</span>`)}
    </div>`;
}

export function renderCommandView(state) {
  const counts = state.session.counts || {};
  const urgentPending = state.sameDayWindows.filter((w) => !w.ready);
  const readyCount = state.turnovers.filter((t) => t.status === 'Guest-Ready').length;
  const readyPct = state.turnovers.length ? Math.round((readyCount / state.turnovers.length) * 100) : 100;
  const totalTasks = state.turnovers.length * CHECKLIST_TASKS.length;
  const doneTasks = state.turnovers.reduce((sum, tv) => sum + checklistStats(tv, state).done, 0);
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const gaugePct = state.turnovers.length ? readyPct : 0;
  const gaugeColor = gaugePct === 100 && state.turnovers.length ? '#34d399' : urgentPending.length > 0 ? '#f59e0b' : '#60a5fa';

  const lowSupplies = (state.supplies || []).filter((s) => s.status !== 'OK');
  const followUpInsps = (state.inspections || []).filter((i) => i.follow_up_required === 'Yes');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="sr-masthead" aria-label="Turnover Dispatch Command">
      <div class="sr-masthead__copy">
        <div class="sr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${urgentPending.length > 0 ? '#fb7185' : '#34d399'}"></span>
          TURNOVER COMMAND · ${fmtDayNear(state.commandDay).toUpperCase()}
        </div>
        <h1 class="sr-masthead__title">Short-Stay Turnovers</h1>
        <div class="sr-masthead__meta">
          <span><strong style="color:#f8dfa4">${state.sameDayWindows.length} same-day</strong> checkout→checkin</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${state.checkOutsToday.length} out · ${state.checkInsToday.length} in</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${overallPct}% checklist tasks done</span>
        </div>
      </div>

      <div class="sr-masthead__pods sr-masthead__pods--3" style="align-items:center">
        <div class="sr-pod sr-pod--ring sr-pod--sand">
          <div class="tk-ring" style="--p:${gaugePct}%;--ring-color:${gaugeColor};--ring-size:48px">
            <span class="tk-ring__val">${gaugePct}%</span>
          </div>
          <div>
            <span class="sr-pod__lbl">Guest-Ready</span>
            <span class="sr-pod__val">${readyCount}/${state.turnovers.length}</span>
            <span class="sr-pod__sub">Stays cleared</span>
          </div>
        </div>

        <div class="${cls('sr-pod', { 'sr-pod--alert': urgentPending.length > 0 })}">
          <span class="sr-pod__lbl">${icon('zap', { size: 12 })} Same-Day</span>
          <span class="sr-pod__val">${urgentPending.length}/${state.sameDayWindows.length}</span>
          <span class="sr-pod__sub">${urgentPending.length > 0 ? 'Tight windows' : 'All ready'}</span>
        </div>

        <a href="#/supplies" class="${cls('sr-pod', { 'sr-pod--alert': counts.lowSupplies > 0 })}">
          <span class="sr-pod__lbl">${icon('linen-stack', { size: 12 })} Linen Stock</span>
          <span class="sr-pod__val">${counts.lowSupplies || 0}</span>
          <span class="sr-pod__sub">${counts.lowSupplies > 0 ? 'Low alerts →' : 'Stocked →'}</span>
        </a>

        <a href="#/inspections" class="${cls('sr-pod', { 'sr-pod--alert': counts.followUps > 0 })}">
          <span class="sr-pod__lbl">${icon('clipboard', { size: 12 })} Damage/FU</span>
          <span class="sr-pod__val">${counts.followUps || 0}</span>
          <span class="sr-pod__sub">${counts.followUps > 0 ? 'Follow-up →' : 'All clear →'}</span>
        </a>

        <div class="sr-masthead__actions">
          <button type="button" class="k-btn sr-cta-warm" data-action="turnover-new">${icon('plus', { size: 15 })} Schedule Turnover</button>
          <button type="button" class="k-btn sr-cta-glass k-btn--sm" data-action="copy-turnovers">${icon('copy', { size: 14 })} Brief</button>
          <button type="button" class="k-btn sr-cta-glass k-btn--sm" data-action="print-turnovers">${icon('printer', { size: 14 })} Print</button>
        </div>
      </div>
    </section>

    <div class="sr-split">
      <div class="tk-stack" style="gap:16px">
        <div class="sr-daybar">
          <button type="button" class="k-btn k-btn--sm" data-action="cmd-day-shift" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 15 })}</button>
          <button type="button" class="k-btn k-btn--sm" data-action="cmd-day-today">Today</button>
          <button type="button" class="k-btn k-btn--sm" data-action="cmd-day-shift" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 15 })}</button>
          <input class="k-input" type="date" style="width:auto;min-height:32px;padding:3px 9px;font-size:13px" data-action="cmd-day-pick" value="${state.commandDay}">
          <strong style="font-size:13.5px;white-space:nowrap">${fmtDay(state.commandDay, { weekday: 'short' })}</strong>
          <div class="sr-daybar__spacer"></div>
          <div class="tk-segmented" role="group" aria-label="Turnover view mode">
            <button type="button" class="${cls('tk-pill', { 'is-on': state.commandMode === 'command' })}" data-action="cmd-mode" data-mode="command">Command</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': state.commandMode === 'board' })}" data-action="cmd-mode" data-mode="board">Pipeline</button>
          </div>
        </div>

        ${state.loading && !state.turnovers.length && !state.sameDayWindows.length ? html`
          <section class="tk-sheet">${skeleton(4)}</section>
        ` : html`
          ${state.sameDayWindows.length ? html`
            <section class="sr-windows-wrap" aria-label="Same-day turnover windows">
              <div class="sr-windows-head">
                <h2 class="sr-windows-head__title">
                  ${icon('zap', { size: 17 })}
                  <span>Same-Day Turnover Windows (${state.sameDayWindows.length})</span>
                </h2>
                <span class="tk-muted" style="font-size:12px">≤ 4h windows alert red · edit Out/In live</span>
              </div>
              <div class="sr-windows-grid">
                ${state.sameDayWindows.map((w) => {
                  const winInfo = getWindowInfo(w, state);
                  const linkedTv = w.turnover_id ? state.turnovers.find((t) => t.id === w.turnover_id) : null;
                  const linenLine = linenSummary(w.bedrooms, w.bathrooms, w.arriving_guests, linkedTv?.linen_required || 'Yes');
                  return html`
                    <article class="sr-win-card sr-win-card--${winInfo.urgency}" data-key="win-${w.property_id}">
                      <div class="sr-win-card__head">
                        <div>
                          <div class="sr-win-card__prop">${w.property_name}</div>
                          <div class="sr-win-card__addr">${w.property_address || ''} · ${w.bedrooms} Bed / ${w.bathrooms} Bath</div>
                        </div>
                        <span class="sr-window-badge sr-window-badge--${winInfo.urgency}">
                          ${w.ready ? icon('check', { size: 12 }) : icon('clock', { size: 12 })}
                          ${w.ready ? 'Guest-Ready' : winInfo.diffHours <= 4 ? `Urgent · ${fmtHours(winInfo.diffHours)}` : `${fmtHours(winInfo.diffHours)} window`}
                        </span>
                      </div>

                      <div class="sr-win-card__body">
                        <div class="sr-window-bar">
                          <span class="sr-timeline-pill">
                            <span>${winInfo.outTime} <span class="sr-timeline-pill__tag">OUT</span></span>
                            <span class="sr-timeline-pill__arrow">→</span>
                            <span>${winInfo.inTime} <span class="sr-timeline-pill__tag">IN</span></span>
                          </span>
                          <div class="sr-time-adjust">
                            <label>Out <input type="time" class="sr-time-input" value="${winInfo.outTime}" data-action="win-time" data-prop="${w.property_id}" data-bound="out"></label>
                            <label>In <input type="time" class="sr-time-input" value="${winInfo.inTime}" data-action="win-time" data-prop="${w.property_id}" data-bound="in"></label>
                          </div>
                        </div>

                        <div class="sr-handoff">
                          <div class="sr-handoff__box">
                            <span class="sr-handoff__lbl">Departing Guest</span>
                            <div class="sr-handoff__guest">
                              <span>${w.departing_guest}</span>
                              <span class="${platformClass(w.departing_platform)}">${w.departing_platform}</span>
                            </div>
                            ${winInfo.outNotes ? html`<div class="tk-muted" style="font-size:11.5px">${winInfo.outNotes}</div>` : ''}
                          </div>
                          <div class="sr-handoff__box">
                            <span class="sr-handoff__lbl">Arriving (${w.arriving_guests} guests)</span>
                            <div class="sr-handoff__guest">
                              <span>${w.arriving_guest}</span>
                              <span class="${platformClass(w.arriving_platform)}">${w.arriving_platform}</span>
                            </div>
                            ${winInfo.inNotes ? html`<div class="tk-muted" style="font-size:11.5px">${winInfo.inNotes}</div>` : ''}
                          </div>
                        </div>

                        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px">
                          <span class="tk-tag ${w.ready ? 'tk-tag--ok' : w.turnover_id ? 'tk-tag--accent' : 'tk-tag--bad'}">${w.turnover_status}</span>
                          <span class="sr-linen-pill">${icon('linen-stack', { size: 12 })} ${linenLine}</span>
                          <span class="tk-muted">Cleaner: <strong>${w.cleaner_name || 'Unassigned'}</strong></span>
                        </div>

                        ${linkedTv ? renderChecklistWidget(linkedTv, state) : ''}
                      </div>

                      <div class="sr-win-card__foot">
                        <button type="button" class="k-btn k-btn--sm" data-action="copy-win-brief" data-prop="${w.property_id}">
                          ${icon('copy', { size: 13 })} Cleaner Brief
                        </button>
                        ${w.access_instructions ? html`<button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-win-access" data-prop="${w.property_id}">${icon('key', { size: 13 })} Door Code</button>` : ''}
                        ${linkedTv && NEXT_STAGE[linkedTv.status] ? html`
                          <button type="button" class="k-btn k-btn--primary k-btn--sm" style="margin-left:auto" data-action="turnover-bump" data-id="${linkedTv.id}" data-status="${NEXT_STAGE[linkedTv.status].status}">${NEXT_STAGE[linkedTv.status].label}</button>` : ''}
                        ${!w.turnover_id ? html`<button type="button" class="k-btn k-btn--danger k-btn--sm" style="margin-left:auto" data-action="schedule-urgent" data-prop="${w.property_id}" data-booking="${w.checkout_booking_id}">Schedule Urgent</button>` : ''}
                      </div>
                    </article>`;
                })}
              </div>
            </section>` : ''}

          ${state.turnovers.length ? (
            state.commandMode === 'command' ? html`
              <section class="sr-tv-list" aria-label="Daily turnover schedule">
                ${state.turnovers.map((tv) => {
                  const win = tv.is_same_day ? state.sameDayWindows.find((w) => String(w.property_id) === String(tv.property_id)) : null;
                  const winInfo = win ? getWindowInfo(win, state) : null;
                  const nextStep = NEXT_STAGE[tv.status];
                  return html`
                    <article class="${cls('sr-tv-card', { 'sr-tv-card--ready': tv.status === 'Guest-Ready', 'sr-tv-card--urgent': tv.is_same_day && tv.status !== 'Guest-Ready' })}" data-key="tv-${tv.id}">
                      <div class="sr-tv-card__head">
                        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                          <span class="sr-timeline-pill" style="font-size:11.5px;padding:3px 9px">${icon('clock', { size: 11 })} ${tv.start_time || '10:30'}</span>
                          <strong style="font-size:15px">${tv.property_name || 'Property #' + tv.property_id}</strong>
                          ${tv.is_same_day ? html`<span class="${winInfo && winInfo.diffHours <= 4 ? 'sr-window-badge sr-window-badge--critical' : 'sr-window-badge sr-window-badge--tight'}">${winInfo ? fmtHours(winInfo.diffHours) + ' window' : 'Same-Day'}</span>` : ''}
                          ${tv.platform ? html`<span class="${platformClass(tv.platform)}">${tv.platform}</span>` : ''}
                          ${tv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                        <span class="tk-tag ${tv.status === 'Guest-Ready' ? 'tk-tag--ok' : tv.status === 'Cleaning' ? 'tk-tag--warn' : 'tk-tag--accent'}">${tv.status}</span>
                      </div>
                      <div class="sr-tv-card__body">
                        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--k-muted);align-items:center">
                          <span>Cleaner: <strong style="color:var(--k-text)">${tv.cleaner_name || 'Unassigned'}</strong></span>
                          ${tv.linen_required === 'Yes' ? html`<span class="sr-linen-pill">${icon('linen-stack', { size: 11 })} Linen · ${tv.bedrooms || 2} bed</span>` : html`<span class="tk-tag">No Linen</span>`}
                          ${tv.guest_name ? html`<span>Out: ${tv.guest_name}${tv.arriving_guest ? ' → In: ' + tv.arriving_guest : ''}</span>` : ''}
                        </div>
                        ${tv.notes ? html`<div style="font-size:12.5px;color:var(--k-muted)">${tv.notes}</div>` : ''}
                        ${renderStageBar(tv.status)}
                        ${renderChecklistWidget(tv, state)}
                      </div>
                      <div class="sr-tv-card__foot">
                        <div class="tk-btn-row">
                          ${nextStep ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="turnover-bump" data-id="${tv.id}" data-status="${nextStep.status}">${nextStep.label}</button>` : ''}
                          ${tv.status === 'Linen Changed' || tv.status === 'Inspected' ? html`<button type="button" class="k-btn k-btn--sm" data-action="turnover-inspect" data-id="${tv.id}">${icon('clipboard', { size: 13 })} Inspect</button>` : ''}
                        </div>
                        <div class="tk-btn-row">
                          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="turnover-brief" data-id="${tv.id}">${icon('copy', { size: 13 })} Brief</button>
                          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="turnover-edit" data-id="${tv.id}">Edit</button>
                        </div>
                      </div>
                    </article>`;
                })}
              </section>` : html`
              <div class="sr-board-wrap">
                <div class="tk-board">
                  ${TURNOVER_COLS.map((col) => {
                    const cards = state.turnovers.filter((t) => t.status === col.status);
                    return html`
                      <div class="tk-col" data-key="tcol-${col.status}">
                        <div class="tk-col__head">
                          <span>${col.label}</span>
                          <span class="k-badge">${cards.length}</span>
                        </div>
                        ${cards.length ? cards.map((tv) => {
                          const win = tv.is_same_day ? state.sameDayWindows.find((w) => String(w.property_id) === String(tv.property_id)) : null;
                          const winInfo = win ? getWindowInfo(win, state) : null;
                          return html`
                            <article class="tk-ticket ${tv.is_same_day && tv.status !== 'Guest-Ready' ? (winInfo && winInfo.diffHours <= 4 ? 'tk-ticket--bad' : 'tk-ticket--warn') : col.tone}" data-key="tv-${tv.id}">
                              <div class="tk-ticket__top">
                                <span>${tv.property_name || 'Property #' + tv.property_id}</span>
                                <span class="tk-mono">${tv.start_time || '10:30'}</span>
                              </div>
                              <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
                                ${tv.is_same_day ? html`<span class="${winInfo && winInfo.diffHours <= 4 ? 'sr-window-badge sr-window-badge--critical' : 'sr-window-badge sr-window-badge--tight'}">${winInfo ? fmtHours(winInfo.diffHours) + ' window' : 'Same-Day'}</span>` : ''}
                                ${tv.linen_required === 'Yes' ? html`<span class="sr-linen-pill">Linen · ${tv.bedrooms || 2} bed</span>` : html`<span class="tk-tag">No Linen</span>`}
                                ${tv.platform ? html`<span class="${platformClass(tv.platform)}">${tv.platform}</span>` : ''}
                              </div>
                              <div class="tk-ticket__meta">
                                <div><strong>Cleaner:</strong> ${tv.cleaner_name || 'Unassigned'}</div>
                                ${tv.notes ? html`<div>${tv.notes}</div>` : ''}
                              </div>
                              ${renderChecklistWidget(tv, state)}
                              <div class="tk-ticket__foot">
                                <div class="tk-btn-row">
                                  ${col.next ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="turnover-bump" data-id="${tv.id}" data-status="${col.next}">${col.nextLabel}</button>` : ''}
                                </div>
                                <div class="tk-btn-row">
                                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="turnover-brief" data-id="${tv.id}">Brief</button>
                                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="turnover-edit" data-id="${tv.id}">Edit</button>
                                </div>
                              </div>
                            </article>`;
                        }) : html`<p class="tk-muted" style="font-size:13px;padding:10px 4px">Clear</p>`}
                      </div>`;
                  })}
                </div>
              </div>`
          ) : emptyState({
            iconName: 'bed',
            title: `No turnovers scheduled for ${fmtDay(state.commandDay)}`,
            text: 'Schedule a cleaner turnover from here or in 1 click from the Bookings Board.',
            action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="turnover-new">Schedule Turnover</button>`,
          })}
        `}
      </div>

      <aside class="sr-rail-panel" aria-label="Linen, Maintenance & Guest Movements">
        <section class="sr-rail-card">
          <div class="sr-rail-card__head">
            <span class="sr-rail-card__title">${icon('linen-stack', { size: 14 })} Linen &amp; Cupboard Alerts</span>
            <a href="#/supplies" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.supplies.length})</a>
          </div>
          ${lowSupplies.length ? html`
            <div class="sr-rail-list">
              ${lowSupplies.slice(0, 4).map((sp) => html`
                <div class="sr-rail-item" data-key="rail-sup-${sp.id}">
                  <div class="sr-rail-item__top">
                    <div>
                      <div class="sr-rail-item__name">${sp.supply_item}</div>
                      <div class="sr-rail-item__sub">${sp.property_name} · ${sp.current_stock} ${Number(sp.current_stock) === 1 && String(sp.unit || '').endsWith('s') ? String(sp.unit).slice(0, -1) : sp.unit} left</div>
                    </div>
                    <span class="tk-tag ${sp.status === 'Out' ? 'tk-tag--bad' : 'tk-tag--warn'}">${sp.status}</span>
                  </div>
                  <div class="sr-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">Reorder at ${sp.reorder_point}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-restock" data-id="${sp.id}">Restock ✓</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All property linen cupboards stocked above par ✓</div>`}
        </section>

        <section class="sr-rail-card">
          <div class="sr-rail-card__head">
            <span class="sr-rail-card__title">${icon('clipboard', { size: 14 })} Maintenance &amp; Damage</span>
            <a href="#/inspections" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Log</a>
          </div>
          ${followUpInsps.length ? html`
            <div class="sr-rail-list">
              ${followUpInsps.slice(0, 3).map((ins) => html`
                <div class="sr-rail-item" data-key="rail-ins-${ins.id}">
                  <div class="sr-rail-item__top">
                    <div>
                      <div class="sr-rail-item__name">${ins.property_name}</div>
                      <div class="sr-rail-item__sub">${ins.damage_notes || ins.missing_items || 'Inspection follow-up flagged'}</div>
                    </div>
                    <span class="tk-tag tk-tag--bad">${ins.condition_rating}★</span>
                  </div>
                  <div class="sr-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${fmtDay(ins.inspection_date)}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-resolve-insp" data-id="${ins.id}">Resolve ✓</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No open damage or maintenance follow-ups ✓</div>`}
        </section>

        <section class="sr-rail-card">
          <div class="sr-rail-card__head">
            <span class="sr-rail-card__title">${icon('calendar', { size: 14 })} Today's Movements</span>
            <a href="#/bookings" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Board</a>
          </div>
          ${state.checkOutsToday.length || state.checkInsToday.length ? html`
            <div class="sr-rail-list">
              ${state.checkOutsToday.map((b) => html`
                <div class="sr-rail-item">
                  <div class="sr-rail-item__top">
                    <div>
                      <div class="sr-rail-item__name">${b.property_name}</div>
                      <div class="sr-rail-item__sub">OUT: ${b.guest_name} (${b.guest_count}g)</div>
                    </div>
                    <span class="${platformClass(b.platform)}">${b.platform}</span>
                  </div>
                </div>`)}
              ${state.checkInsToday.map((b) => html`
                <div class="sr-rail-item">
                  <div class="sr-rail-item__top">
                    <div>
                      <div class="sr-rail-item__name">${b.property_name}</div>
                      <div class="sr-rail-item__sub">IN: ${b.guest_name} (${b.guest_count}g)</div>
                    </div>
                    <span class="${platformClass(b.platform)}">${b.platform}</span>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No check-outs or check-ins logged on this date.</div>`}
        </section>
      </aside>
    </div>
  `;
}

export async function openTurnoverForm(state, { loadScreen }, preset = {}) {
  if (!state.properties.length || !state.cleaners.length) {
    const [p, cl] = await Promise.all([api.get('/api/properties'), api.get('/api/cleaners', { day: today() })]);
    state.properties = p.properties || [];
    state.cleaners = cl.cleaners || [];
  }
  if (!state.properties.length) { toast.error('Add a property first.'); return; }
  if (!state.cleaners.length) { toast.error('Add a cleaner to the roster first.'); return; }
  const isEdit = Boolean(preset.id);

  const saved = await formDialog({
    title: isEdit ? 'Edit Turnover' : 'Schedule Cleaner Turnover',
    submitLabel: isEdit ? 'Save Turnover' : 'Schedule Turnover',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Property</span>
          <select class="k-input" name="property_id" required>
            ${state.properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(preset.property_id) ? 'selected' : ''}>${p.property_name}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Assigned Cleaner</span>
          <select class="k-input" name="cleaner_id" required>
            ${state.cleaners.map((c) => html`<option value="${c.id}" ${String(c.id) === String(preset.cleaner_id) ? 'selected' : ''}>${c.name}</option>`)}
          </select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Turnover Date</span>
          <input class="k-input" type="date" name="turnover_date" value="${preset.turnover_date || state.commandDay || today()}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Start Time</span>
          <input class="k-input" type="time" name="start_time" value="${preset.start_time || '10:30'}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Linen Required</span>
          <select class="k-input" name="linen_required">
            <option value="Yes" ${(preset.linen_required || 'Yes') === 'Yes' ? 'selected' : ''}>Yes</option>
            <option value="No" ${preset.linen_required === 'No' ? 'selected' : ''}>No</option>
          </select>
        </label>
      </div>
      ${isEdit ? html`
        <label class="k-field"><span class="k-field__label">Status</span>
          <select class="k-input" name="status">
            ${['Scheduled', 'Cleaning', 'Linen Changed', 'Inspected', 'Guest-Ready', 'Issue'].map((st) => html`<option value="${st}" ${st === preset.status ? 'selected' : ''}>${st}</option>`)}
          </select>
        </label>` : ''}
      <label class="k-field"><span class="k-field__label">Cleaner Notes</span>
        <textarea class="k-input" name="notes" rows="2" placeholder="Early check-in time, welcome bottle, portacot setup…">${preset.notes || ''}</textarea>
      </label>`,
    onSubmit: (v) => isEdit
      ? api.put('/api/turnovers', { ...v, id: preset.id })
      : api.post('/api/turnovers', { ...v, booking_id: preset.booking_id || null }),
  });
  if (saved) {
    toast.success(isEdit ? 'Turnover updated.' : 'Cleaner turnover scheduled.');
    await loadScreen();
  }
}

export async function openInspectionDialog(preset, state, { loadScreen }) {
  let rating = 5;
  const made = await formDialog({
    title: `Property Inspection · ${preset.property_name || ''}`,
    submitLabel: 'Save Inspection',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Inspection Date</span>
          <input class="k-input" type="date" name="inspection_date" value="${preset.inspection_date || today()}" required>
        </label>
        <div class="k-field">
          <span class="k-field__label">Condition Rating (1–5)</span>
          <input type="hidden" name="condition_rating" value="5">
          <div class="sr-star-picker">
            ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class="sr-star-btn is-on" data-sr-star="${n}">★</button>`)}
          </div>
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Missing Items <span class="k-field__optional">optional</span></span>
        <textarea class="k-input" name="missing_items" rows="2" placeholder="Towels, keys, remotes, kitchenware…"></textarea>
      </label>
      <label class="k-field"><span class="k-field__label">Damage Notes <span class="k-field__optional">optional</span></span>
        <textarea class="k-input" name="damage_notes" rows="2" placeholder="Stains, broken glass, scuffs, maintenance…"></textarea>
      </label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Follow-up Required</span>
          <select class="k-input" name="follow_up_required">
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Inspector</span>
          <input class="k-input" name="inspector_name" value="${state.session.me.displayName || ''}">
        </label>
      </div>
      ${preset.turnover_id ? html`<label class="k-check"><input type="checkbox" name="mark_guest_ready" checked><span>Mark turnover <strong>Guest-Ready</strong></span></label>` : ''}`,
    onOpen: ({ form }) => {
      on(form, 'click', '[data-sr-star]', (ev, btn) => {
        rating = Number(btn.dataset.srStar);
        const hidden = qs('input[name="condition_rating"]', form);
        if (hidden) hidden.value = String(rating);
        form.querySelectorAll('[data-sr-star]').forEach((b) => {
          b.classList.toggle('is-on', Number(b.dataset.srStar) <= rating);
        });
      });
    },
    onSubmit: (v) => api.post('/api/inspections', {
      property_id: preset.property_id,
      turnover_id: preset.turnover_id || null,
      inspection_date: v.inspection_date,
      condition_rating: Number(v.condition_rating || 5),
      missing_items: v.missing_items || '',
      damage_notes: v.damage_notes || '',
      follow_up_required: v.follow_up_required || 'No',
      inspector_name: v.inspector_name || '',
      mark_guest_ready: Boolean(v.mark_guest_ready),
    }),
  });
  if (made) {
    toast.success('Inspection logged.');
    await loadScreen();
  }
}

export function wireCommandActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="cmd-day-shift"]', (e, el) => {
    state.commandDay = addDays(state.commandDay, Number(el.dataset.delta));
    loadScreen('/');
  });
  on(root, 'click', '[data-action="cmd-day-today"]', () => {
    state.commandDay = today();
    loadScreen('/');
  });
  on(root, 'change', '[data-action="cmd-day-pick"]', (e, el) => {
    if (el.value) { state.commandDay = el.value; loadScreen('/'); }
  });
  on(root, 'click', '[data-action="cmd-mode"]', (e, el) => {
    state.commandMode = el.dataset.mode;
    draw();
  });
  on(root, 'change', '[data-action="win-time"]', (e, el) => {
    const propId = el.dataset.prop;
    const bound = el.dataset.bound;
    if (!propId || !el.value) return;
    if (!state.windowTimes) state.windowTimes = {};
    const w = state.sameDayWindows.find((x) => String(x.property_id) === propId);
    const current = w ? getWindowInfo(w, state) : { outTime: '10:00', inTime: '15:00' };
    state.windowTimes[propId] = {
      out: bound === 'out' ? el.value : current.outTime,
      in: bound === 'in' ? el.value : current.inTime,
    };
    draw();
  });
  on(root, 'click', '[data-action="tv-toggle-checklist"]', (e, el) => {
    const id = el.dataset.id;
    if (!state.expandedChecklists) state.expandedChecklists = {};
    state.expandedChecklists[id] = !state.expandedChecklists[id];
    draw();
  });
  on(root, 'change', '[data-action="tv-task-check"]', (e, el) => {
    const id = el.dataset.id;
    const taskId = el.dataset.task;
    const tv = state.turnovers.find((x) => String(x.id) === id);
    if (!tv) return;
    const map = { ...getChecklistMap(tv, state), [taskId]: Boolean(el.checked) };
    if (!state.turnoverTasks) state.turnoverTasks = {};
    state.turnoverTasks[id] = { status: tv.status, items: map };
    draw();
  });
  on(root, 'click', '[data-action="turnover-new"]', () => openTurnoverForm(state, { loadScreen }));
  on(root, 'click', '[data-action="schedule-urgent"]', (e, el) => {
    openTurnoverForm(state, { loadScreen }, {
      property_id: Number(el.dataset.prop),
      booking_id: Number(el.dataset.booking),
      turnover_date: state.commandDay,
      start_time: '10:15',
      linen_required: 'Yes',
      notes: 'URGENT same-day checkout/check-in turnaround!',
    });
  });
  on(root, 'click', '[data-action="turnover-edit"]', (e, el) => {
    const tv = state.turnovers.find((x) => String(x.id) === el.dataset.id);
    if (tv) openTurnoverForm(state, { loadScreen }, tv);
  });
  on(root, 'click', '[data-action="turnover-bump"]', async (e, el) => {
    try {
      await api.post('/api/turnovers/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Turnover moved to ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="turnover-inspect"]', (e, el) => {
    const tv = state.turnovers.find((x) => String(x.id) === el.dataset.id);
    if (tv) openInspectionDialog({ property_id: tv.property_id, property_name: tv.property_name, turnover_id: tv.id, inspection_date: state.commandDay }, state, { loadScreen });
  });
  on(root, 'click', '[data-action="rail-restock"]', async (e, el) => {
    try {
      await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), restockToPar: true });
      toast.success('Linen/supply restocked above par.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="rail-resolve-insp"]', async (e, el) => {
    try {
      await api.post('/api/inspections/followup', { id: Number(el.dataset.id), follow_up_required: 'No' });
      toast.success('Inspection follow-up marked resolved.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="turnover-brief"]', (e, el) => {
    const tv = state.turnovers.find((x) => String(x.id) === el.dataset.id);
    if (!tv) return;
    copyText(buildSingleCleanerBrief(tv, state), {
      title: `Cleaner Brief · ${tv.property_name}`,
      done: `Cleaner brief copied for ${tv.property_name}!`,
    });
  });
  on(root, 'click', '[data-action="copy-win-brief"]', (e, el) => {
    const w = state.sameDayWindows.find((x) => String(x.property_id) === el.dataset.prop);
    if (!w) return;
    const tv = w.turnover_id
      ? state.turnovers.find((x) => x.id === w.turnover_id)
      : {
          id: 0,
          property_id: w.property_id,
          property_name: w.property_name,
          property_address: w.property_address,
          access_instructions: w.access_instructions,
          bedrooms: w.bedrooms,
          bathrooms: w.bathrooms,
          cleaner_name: w.cleaner_name,
          start_time: w.start_time || '10:15',
          linen_required: 'Yes',
          status: w.turnover_status,
          arriving_guests: w.arriving_guests,
          turnover_date: state.commandDay,
          notes: `Same-day handoff: ${w.departing_guest} (${w.departing_platform}) -> ${w.arriving_guest} (${w.arriving_platform})`,
        };
    copyText(buildSingleCleanerBrief(tv, state, w), {
      title: `Cleaner Brief · ${w.property_name}`,
      done: `Cleaner brief copied for ${w.property_name}!`,
    });
  });
  on(root, 'click', '[data-action="copy-win-access"]', (e, el) => {
    const w = state.sameDayWindows.find((x) => String(x.property_id) === el.dataset.prop);
    if (!w) return;
    copyText(`${w.property_name}\n${w.property_address || ''}\nLockbox / WiFi / Access:\n${w.access_instructions}`, {
      title: 'Property Access & WiFi',
      done: `Door code copied for ${w.property_name}`,
    });
  });
  on(root, 'click', '[data-action="copy-turnovers"]', () => {
    const biz = state.session.settings.business_name || 'StayReady';
    if (!state.turnovers.length) {
      copyText(`${biz} — Cleaner Brief (${fmtDay(state.commandDay)})\nNo turnovers scheduled.`, { title: 'Cleaner Turnover Brief' });
      return;
    }
    const blocks = state.turnovers.map((tv, idx) => `${idx + 1}) ${buildSingleCleanerBrief(tv, state)}`);
    copyText(`${biz} — Daily Cleaner Brief (${fmtDay(state.commandDay, { weekday: 'long' })})\nTotal Turnovers: ${state.turnovers.length} (${state.sameDayWindows.length} same-day)\n\n${blocks.join('\n\n---\n\n')}`, {
      title: 'Daily Cleaner Brief',
      done: 'Daily Cleaner Brief copied!',
    });
  });
  on(root, 'click', '[data-action="print-turnovers"]', () => {
    const rowsHtml = state.turnovers.map((tv) => {
      const win = tv.is_same_day ? state.sameDayWindows.find((w) => String(w.property_id) === String(tv.property_id)) : null;
      const winInfo = win ? getWindowInfo(win, state) : null;
      return `
      <tr>
        <td><strong>${tv.start_time}</strong>${winInfo ? '<br>' + winInfo.label : ''}</td>
        <td><strong>${tv.property_name || ''}</strong>${tv.is_same_day ? ' <span style="color:#e11d48;font-weight:700">[SAME-DAY]</span>' : ''}<br>${tv.property_address || ''}</td>
        <td>${tv.cleaner_name || 'Unassigned'}</td>
        <td>${linenSummary(tv.bedrooms, tv.bathrooms, tv.arriving_guests || tv.guest_count, tv.linen_required)}</td>
        <td>${tv.access_instructions || '—'}</td>
        <td>${tv.status}</td>
      </tr>`;
    }).join('');
    downloadHtmlDoc(`stayready-turnovers-${state.commandDay}.html`, {
      title: `Turnover Dispatch Sheet · ${fmtDay(state.commandDay)}`,
      businessName: state.session.settings.business_name,
      subtitle: `${state.turnovers.length} turnover(s) · ${state.sameDayWindows.length} same-day window(s)`,
      accent: '#283e7a',
      bodyHtml: `<table>
        <thead><tr><th>Window</th><th>Property</th><th>Cleaner</th><th>Linen</th><th>Lockbox / WiFi / Access</th><th>Status</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6">No turnovers scheduled.</td></tr>'}</tbody>
      </table>`,
    });
  });
}
