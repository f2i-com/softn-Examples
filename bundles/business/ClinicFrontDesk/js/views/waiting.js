// Front Desk Waiting Room Command — Unified Clinical Slate-Teal Masthead with Intake Readiness Ring,
// Clickable Triage Filter Tiles, Two-Column Appointment Queue + Sticky Live Room, Intake & Recall Rail.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, fmtDayNear, fmtDateTime, ago, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, openDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const APPT_TYPES = ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth'];
const SHORT_TYPE = { Consultation: 'Consult', 'New Patient': 'New Pt', 'Follow-up': 'Follow-up', Procedure: 'Procedure', Telehealth: 'Telehealth' };
const STATUS_FLOW = { Booked: 'Checked In', 'Checked In': 'In Room', 'In Room': 'Completed' };
const STATUS_BTN = { Booked: 'Check In', 'Checked In': 'Move to Room', 'In Room': 'Complete Visit' };
const STAGE_ORDER = ['Booked', 'Checked In', 'In Room', 'Completed'];
const STATUS_TAG = {
  Booked: '',
  'Checked In': 'tk-tag--warn',
  'In Room': 'tk-tag--info',
  Completed: 'tk-tag--ok',
  'No-Show': 'tk-tag--bad',
  Cancelled: 'tk-tag--bad',
};
const CARD_TONE = {
  Booked: 'appt-card--booked',
  'Checked In': 'appt-card--checked-in',
  'In Room': 'appt-card--in-room',
  Completed: 'appt-card--completed',
  'No-Show': 'appt-card--no-show',
  Cancelled: 'appt-card--cancelled',
};

function calcAge(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return '';
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today().split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age >= 0 && age < 130 ? `${age} yrs` : '';
}

function apptFields(state, a = {}) {
  const activeProviders = state.providers.filter((p) => p.active || p.id === a.provider_id);
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Patient</span>
        <select class="k-input" name="patient_id" required>
          <option value="">Select patient…</option>
          ${state.patients.map((p) => html`<option value="${p.id}" ${Number(a.patient_id) === p.id ? 'selected' : ''}>${p.full_name} (${p.phone})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Provider</span>
        <select class="k-input" name="provider_id" required>
          <option value="">Select clinician…</option>
          ${activeProviders.map((pr) => html`<option value="${pr.id}" ${Number(a.provider_id) === pr.id ? 'selected' : ''}>${pr.full_name} · ${pr.role}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date</span>
        <input class="k-input" type="date" name="appt_date" value="${a.appt_date || state.selectedDate || today()}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Time</span>
        <input class="k-input" type="time" name="appt_time" value="${a.appt_time || '09:30'}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Appointment Type</span>
        <select class="k-input" name="appt_type">
          ${APPT_TYPES.map((tp) => html`<option value="${tp}" ${tp === (a.appt_type || 'Consultation') ? 'selected' : ''}>${tp}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Room <span class="k-field__optional">optional</span></span>
        <input class="k-input" name="room" value="${a.room || ''}" placeholder="Defaults to provider's room">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Front desk notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Reason for visit, prep required, mobility notes…">${a.notes || ''}</textarea>
    </label>`;
}

export function renderWaitingView(state) {
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.waitingSearch || '').trim().toLowerCase();

  const list = state.appointments.filter((a) => {
    if (state.providerFilter !== 'All' && String(a.provider_id) !== String(state.providerFilter)) return false;
    if (state.statusFilter === 'Intake Pending') {
      if (a.intake_completed || a.status === 'Cancelled' || a.status === 'No-Show') return false;
    } else if (state.statusFilter !== 'All' && a.status !== state.statusFilter) {
      return false;
    }
    if (q) {
      const hay = `${a.patient_name || ''} ${a.provider_name || ''} ${a.room || ''} ${a.patient_phone || ''} ${a.appt_type || ''} ${a.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dayCheckedIn = state.appointments.filter((a) => a.status === 'Checked In').length;
  const dayInRoom = state.appointments.filter((a) => a.status === 'In Room').length;
  const dayBooked = state.appointments.filter((a) => a.status === 'Booked').length;
  const dayCompleted = state.appointments.filter((a) => a.status === 'Completed').length;
  const activeVisits = state.appointments.filter((a) => a.status !== 'Cancelled' && a.status !== 'No-Show');
  const pendingIntakeList = activeVisits.filter((a) => !a.intake_completed);
  const intakeDoneCount = activeVisits.length - pendingIntakeList.length;
  const intakePendingCount = pendingIntakeList.length;
  const intakePct = activeVisits.length ? Math.round((intakeDoneCount / activeVisits.length) * 100) : 100;

  const activeProviders = state.providers.filter((p) => p.active);
  const dueRecalls = (state.followUps || []).filter((f) => f.status === 'Pending' && f.followup_date <= todayStr);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="cl-masthead" aria-label="Waiting Room Command">
      <div class="cl-masthead__copy">
        <div class="cl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#2dd4bf"></span>
          WAITING ROOM · ${fmtDay(state.selectedDate, { weekday: 'short' })}${state.selectedDate === todayStr ? ' · TODAY' : ''}
        </div>
        <h1 class="cl-masthead__title">Patient Queue &amp; Triage</h1>
        <div class="cl-masthead__meta">
          <span><strong style="color:#99f6e4">${activeVisits.length} visit${activeVisits.length === 1 ? '' : 's'}</strong> today</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${activeProviders.length} clinician${activeProviders.length === 1 ? '' : 's'} on duty</span>
        </div>
      </div>

      <div class="cl-masthead__pods" style="align-items:center">
        <div class="cl-pod cl-pod--ring cl-pod--teal" aria-label="Intake readiness ${intakePct}%">
          <div class="tk-ring" style="--p:${intakePct}%;--ring-color:${intakePct >= 80 ? '#2dd4bf' : intakePct >= 50 ? '#fbbf24' : '#fb7185'};--ring-size:48px">
            <span class="tk-ring__val">${intakePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="cl-pod__lbl">Intake Ready</span>
            <span class="cl-pod__val" style="font-size:16.5px">${intakeDoneCount}/${activeVisits.length}</span>
            <span class="cl-pod__sub">${intakePendingCount ? `${intakePendingCount} awaiting form` : 'All signed ✓'}</span>
          </div>
        </div>

        <div class="cl-pod">
          <span class="cl-pod__lbl">${icon('clock', { size: 12 })} Waiting</span>
          <span class="cl-pod__val">${dayCheckedIn}</span>
          <span class="cl-pod__sub">${dayBooked} booked</span>
        </div>

        <div class="cl-pod">
          <span class="cl-pod__lbl">${icon('exam-room', { size: 12 })} In Room</span>
          <span class="cl-pod__val">${dayInRoom}</span>
          <span class="cl-pod__sub">${dayCompleted} seen</span>
        </div>

        <a href="#/followups" class="${cls('cl-pod cl-pod--wide-sm', { 'cl-pod--alert': dueRecalls.length > 0 })}">
          <span class="cl-pod__lbl">${icon('bell', { size: 12 })} Recalls</span>
          <span class="cl-pod__val">${dueRecalls.length}</span>
          <span class="cl-pod__sub">${dueRecalls.length ? 'Due now →' : 'Clear'}</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="appt-new">${icon('plus', { size: 15 })} Book Appt</button>
      </div>
    </section>

    <div class="wr-strip" role="region" aria-label="Waiting Room Triage Filter Tiles">
      <button type="button" class="${cls('wr-pill wr-pill--waiting', { 'is-on': state.statusFilter === 'Checked In' })}" data-action="strip-filter" data-status="Checked In">
        <span class="wr-pill__body">
          <span class="wr-pill__icon">${icon('clock', { size: 17 })}</span>
          <span class="wr-pill__left">
            <span class="wr-pill__label">Waiting</span>
            <span class="wr-pill__sub">${state.statusFilter === 'Checked In' ? 'Active filter' : 'Waiting'}</span>
          </span>
        </span>
        <span class="wr-pill__val">${dayCheckedIn}</span>
      </button>

      <button type="button" class="${cls('wr-pill wr-pill--room', { 'is-on': state.statusFilter === 'In Room' })}" data-action="strip-filter" data-status="In Room">
        <span class="wr-pill__body">
          <span class="wr-pill__icon">${icon('stethoscope', { size: 17 })}</span>
          <span class="wr-pill__left">
            <span class="wr-pill__label">In Room</span>
            <span class="wr-pill__sub">${state.statusFilter === 'In Room' ? 'Active filter' : 'In room'}</span>
          </span>
        </span>
        <span class="wr-pill__val">${dayInRoom}</span>
      </button>

      <button type="button" class="${cls('wr-pill wr-pill--seen', { 'is-on': state.statusFilter === 'Completed' })}" data-action="strip-filter" data-status="Completed">
        <span class="wr-pill__body">
          <span class="wr-pill__icon">${icon('check-circle', { size: 17 })}</span>
          <span class="wr-pill__left">
            <span class="wr-pill__label">Seen</span>
            <span class="wr-pill__sub">${state.statusFilter === 'Completed' ? 'Active filter' : 'Completed'}</span>
          </span>
        </span>
        <span class="wr-pill__val">${dayCompleted}</span>
      </button>

      <button type="button" class="${cls('wr-pill wr-pill--intake', { 'is-on': state.statusFilter === 'Intake Pending', 'wr-pill--clear': intakePendingCount === 0 })}" data-action="strip-filter" data-status="Intake Pending">
        <span class="wr-pill__body">
          <span class="wr-pill__icon">${icon(intakePendingCount ? 'clipboard' : 'shield-check', { size: 17 })}</span>
          <span class="wr-pill__left">
            <span class="wr-pill__label">Intake Due</span>
            <span class="wr-pill__sub">${state.statusFilter === 'Intake Pending' ? 'Active filter' : (intakePendingCount ? 'Pending' : 'All signed')}</span>
          </span>
        </span>
        <span class="wr-pill__val">${intakePendingCount}</span>
      </button>
    </div>

    <div class="cl-split">
      <div class="tk-stack" style="gap:14px">
        <div class="cl-filter-bar">
          <div class="cl-filter-bar__top">
            <div class="clinic-date-nav">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="day-step" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 15 })}</button>
              <input type="date" data-action="day-pick" value="${state.selectedDate}" aria-label="Select date">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="day-step" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 15 })}</button>
              ${state.selectedDate !== todayStr ? html`<button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="day-today">Today</button>` : ''}
            </div>
            <div class="tk-btn-row">
              <label class="tk-search" style="min-height:33px;flex:1 1 200px;max-width:260px">
                ${icon('search', { size: 14 })}
                <input type="search" data-action="waiting-search" value="${state.waitingSearch}" placeholder="Search patient or room…">
              </label>
              <button type="button" class="k-btn k-btn--sm" data-action="print-daysheet">${icon('printer', { size: 14 })} Day Sheet</button>
            </div>
          </div>

          <div class="cl-filter-bar__row">
            <div class="tk-segmented" role="tablist" aria-label="Filter by clinician">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.providerFilter === 'All' })}" data-action="filter-provider" data-id="All">All Clinicians</button>
              ${activeProviders.map((pr) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': String(state.providerFilter) === String(pr.id) })}" data-action="filter-provider" data-id="${pr.id}">
                  ${pr.full_name}
                </button>`)}
            </div>
            <div class="tk-segmented" style="margin-left:auto" role="tablist" aria-label="Filter by visit status">
              ${[
                ['All', `All (${state.appointments.length})`],
                ['Booked', `Booked (${dayBooked})`],
                ['Checked In', 'Waiting'],
                ['In Room', 'In Room'],
                ['Completed', 'Seen'],
                ['No-Show', 'No-Show'],
              ].map(([st, lbl]) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.statusFilter === st })}" data-action="filter-status" data-status="${st}">${lbl}</button>`)}
            </div>
          </div>
        </div>

        ${state.loading && !state.appointments.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : list.length ? html`
          <div class="appt-list">
            ${list.map((a) => {
              const age = calcAge(a.patient_dob);
              const stageIdx = STAGE_ORDER.indexOf(a.status);
              return html`
                <article class="appt-card ${CARD_TONE[a.status] || ''}" data-key="appt-${a.id}">
                  <div class="appt-time">
                    <span class="appt-time__clock">${a.appt_time}</span>
                    <span class="appt-time__type" title="${a.appt_type}">${SHORT_TYPE[a.appt_type] || a.appt_type}</span>
                  </div>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <button type="button" class="appt-patient-btn" data-action="open-patient" data-id="${a.patient_id}">${a.patient_name}</button>
                      ${age ? html`<span class="age-pill">${age}</span>` : ''}
                      <span class="tk-tag ${STATUS_TAG[a.status] || ''}">${a.status === 'Checked In' ? 'Waiting' : a.status === 'Completed' ? 'Seen' : a.status}</span>
                      <button type="button" class="${cls('intake-badge', a.intake_completed ? 'intake-badge--ok' : 'intake-badge--pending')}" data-action="open-intake" data-id="${a.id}" data-patient="${a.patient_id}" data-completed="${a.intake_completed ? '1' : '0'}">
                        ${icon(a.intake_completed ? 'check-circle' : 'alert', { size: 12 })} ${a.intake_completed ? 'Intake Ready' : 'Intake Pending'}
                      </button>
                      ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      <span><strong>${a.provider_name}</strong> (${a.provider_role})</span>
                      ${a.room ? html`<span>${icon('exam-room', { size: 13 })} ${a.room}</span>` : ''}
                      ${a.patient_phone ? html`<span>${icon('phone', { size: 13 })} ${a.patient_phone}</span>` : ''}
                      ${a.checked_in_at && (a.status === 'Checked In' || a.status === 'In Room') ? html`<span>${icon('clock', { size: 13 })} Arrived ${ago(a.checked_in_at)}</span>` : ''}
                      ${stageIdx >= 0 ? html`
                        <span class="appt-progress" title="Booked → Waiting → In Room → Seen" aria-label="Visit stage ${stageIdx + 1} of 4">
                          ${STAGE_ORDER.map((_, idx) => html`<span class="${cls('appt-step-dot', { 'is-done': idx < stageIdx || (a.status === 'Completed' && idx === 3), 'is-now': idx === stageIdx && a.status !== 'Completed' })}"></span>`)}
                        </span>` : ''}
                    </div>
                    ${a.notes ? html`<div class="tk-muted" style="font-size:12.5px">${a.notes}</div>` : ''}
                  </div>
                  <div class="tk-row__aside">
                    ${STATUS_FLOW[a.status] ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-status" data-id="${a.id}" data-status="${STATUS_FLOW[a.status]}">
                        ${STATUS_BTN[a.status]}
                      </button>` : ''}
                    <button type="button" class="k-btn k-btn--sm" data-action="open-intake" data-id="${a.id}" data-patient="${a.patient_id}" data-completed="${a.intake_completed ? '1' : '0'}">
                      ${icon('clipboard', { size: 13 })} Intake
                    </button>
                    ${a.status === 'Completed' ? html`
                      <button type="button" class="k-btn k-btn--sm" data-action="appt-followup" data-id="${a.id}">
                        ${icon('calendar', { size: 13 })} Recall
                      </button>` : ''}
                    ${a.status === 'Booked' || a.status === 'Checked In' ? html`
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="appt-status" data-id="${a.id}" data-status="No-Show">No-Show</button>` : ''}
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="appt-edit" data-id="${a.id}">Edit</button>
                  </div>
                </article>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({
            iconName: 'calendar',
            title: state.appointments.length ? 'No appointments match this filter' : `No appointments on ${fmtDay(state.selectedDate)}`,
            text: state.appointments.length
              ? 'Clear the Waiting Room status filter or search query to see all bookings for the day.'
              : 'Book a patient into a clinician slot or switch dates above to view another day.',
            action: state.appointments.length
              ? html`<button type="button" class="k-btn k-btn--sm" data-action="reset-waiting-filters">Show All Appointments</button>`
              : html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-new">${icon('plus', { size: 15 })} Book Appointment</button>`,
          })}</section>`}
      </div>

      <aside class="cl-rail-panel" aria-label="Live Room and Intake Readiness Rail">
        <section class="cl-rail-card">
          <div class="cl-rail-card__head">
            <span class="cl-rail-card__title">${icon('exam-room', { size: 14 })} Live Rooms &amp; Clinicians</span>
            <a href="#/providers" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Roster</a>
          </div>
          ${activeProviders.length ? html`
            <div>
              ${activeProviders.map((pr) => {
                const inRoomAppt = state.appointments.find((a) => Number(a.provider_id) === Number(pr.id) && a.status === 'In Room');
                const waitingAppt = state.appointments.find((a) => Number(a.provider_id) === Number(pr.id) && a.status === 'Checked In');
                const prCount = state.appointments.filter((a) => Number(a.provider_id) === Number(pr.id) && a.status !== 'Cancelled').length;
                return html`
                  <div class="cl-room-row" data-key="rail-rm-${pr.id}">
                    <div style="display:flex;align-items:center;gap:9px;min-width:0">
                      <span class="${cls('cl-room-dot', { 'cl-room-dot--busy': !!inRoomAppt, 'cl-room-dot--wait': !inRoomAppt && !!waitingAppt })}"></span>
                      <div style="min-width:0">
                        <div style="font-size:13px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pr.room || pr.role} · ${pr.full_name}</div>
                        <div style="font-size:11.5px;color:var(--k-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                          ${inRoomAppt ? `In Room: ${inRoomAppt.patient_name}` : waitingAppt ? `Waiting: ${waitingAppt.patient_name}` : 'Room open'}
                        </div>
                      </div>
                    </div>
                    <span class="tk-tag ${inRoomAppt ? 'tk-tag--info' : waitingAppt ? 'tk-tag--warn' : 'tk-tag--ok'}">${prCount} appt${prCount === 1 ? '' : 's'}</span>
                  </div>`;
              })}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active providers on roster.</div>`}
        </section>

        <section class="cl-rail-card">
          <div class="cl-rail-card__head">
            <span class="cl-rail-card__title">${icon('clipboard', { size: 14 })} Intake Readiness Queue</span>
            <a href="#/intake" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Forms</a>
          </div>
          ${pendingIntakeList.length ? html`
            <div class="cl-rail-list">
              ${pendingIntakeList.slice(0, 4).map((a) => html`
                <div class="cl-rail-item" data-key="rail-in-${a.id}">
                  <div class="cl-rail-item__top">
                    <div>
                      <div class="cl-rail-item__name">${a.patient_name}</div>
                      <div class="cl-rail-item__sub">${a.appt_time} · ${a.provider_name}</div>
                    </div>
                    <span class="tk-tag ${STATUS_TAG[a.status] || ''}">${a.status === 'Checked In' ? 'Waiting' : a.status}</span>
                  </div>
                  <div class="cl-rail-item__foot">
                    <span style="font-size:11.5px;color:#b45309;font-weight:650">Consent form required</span>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="open-intake" data-id="${a.id}" data-patient="${a.patient_id}" data-completed="0">Capture →</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-success);font-weight:650">All scheduled patients have signed intake &amp; consent ✓</div>`}
        </section>

        <section class="cl-rail-card">
          <div class="cl-rail-card__head">
            <span class="cl-rail-card__title">${icon('bell', { size: 14 })} Due Follow-Up Recalls</span>
            <a href="#/followups" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${(state.followUps || []).length})</a>
          </div>
          ${dueRecalls.length ? html`
            <div class="cl-rail-list">
              ${dueRecalls.slice(0, 3).map((f) => {
                const gap = daysBetween(todayStr, f.followup_date);
                return html`
                  <div class="cl-rail-item" data-key="rail-fu-${f.id}">
                    <div class="cl-rail-item__top">
                      <div>
                        <div class="cl-rail-item__name">${f.patient_name}</div>
                        <div class="cl-rail-item__sub">${f.provider_name}</div>
                      </div>
                      <span class="recall-countdown ${gap < 0 ? 'recall-countdown--overdue' : 'recall-countdown--today'}">
                        ${gap < 0 ? `Overdue ${Math.abs(gap)}d` : 'Due Today'}
                      </span>
                    </div>
                    <div style="font-size:12px;color:var(--k-text);line-height:1.35">${f.action}</div>
                    <div class="cl-rail-item__foot">
                      <span class="tk-muted" style="font-size:11.5px">${f.patient_phone || ''}</span>
                      <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-recall-sms-rail" data-id="${f.id}">${icon('copy', { size: 12 })} SMS</button>
                    </div>
                  </div>`;
              })}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No overdue or due-today patient recalls ✓</div>`}
        </section>
      </aside>
    </div>`;
}

export function wireWaitingActions(root, state, { draw, loadScreen, router }) {
  on(root, 'click', '[data-action="day-step"]', (e, el) => {
    state.selectedDate = addDays(state.selectedDate, Number(el.dataset.delta));
    state.appointments = [];
    loadScreen('/');
  });
  on(root, 'change', '[data-action="day-pick"]', (e, el) => {
    if (el.value) {
      state.selectedDate = el.value;
      state.appointments = [];
      loadScreen('/');
    }
  });
  on(root, 'click', '[data-action="day-today"]', () => {
    state.selectedDate = today();
    state.appointments = [];
    loadScreen('/');
  });
  on(root, 'input', '[data-action="waiting-search"]', (e, el) => {
    state.waitingSearch = el.value;
    draw();
  });
  on(root, 'click', '[data-action="filter-provider"]', (e, el) => {
    state.providerFilter = el.dataset.id;
    draw();
  });
  on(root, 'click', '[data-action="filter-status"]', (e, el) => {
    state.statusFilter = el.dataset.status;
    draw();
  });
  on(root, 'click', '[data-action="strip-filter"]', (e, el) => {
    const target = el.dataset.status;
    state.statusFilter = state.statusFilter === target ? 'All' : target;
    draw();
  });
  on(root, 'click', '[data-action="reset-waiting-filters"]', () => {
    state.statusFilter = 'All';
    state.providerFilter = 'All';
    state.waitingSearch = '';
    draw();
  });

  on(root, 'click', '[data-action="copy-recall-sms-rail"]', (e, el) => {
    const f = (state.followUps || []).find((x) => String(x.id) === el.dataset.id);
    if (!f) return;
    const clinic = state.session.settings.business_name;
    const phone = state.session.settings.phone ? ` on ${state.session.settings.phone}` : '';
    const gap = daysBetween(today(), f.followup_date);
    const timing = gap < 0
      ? `is now overdue (was due ${fmtDay(f.followup_date)})`
      : gap === 0
        ? 'is due today'
        : `is due on ${fmtDay(f.followup_date)}`;
    const msg = `Hi ${f.patient_name}, this is ${clinic}. Your follow-up with ${f.provider_name} (${f.action}) ${timing}. Please call reception${phone} to book a convenient time.`;
    copyText(msg, { title: 'Recall Reminder SMS', done: 'Recall reminder SMS copied.' });
  });

  on(root, 'click', '[data-action="open-patient"]', (e, el) => {
    state.selectedPatientId = Number(el.dataset.id);
    router.go('/patients');
  });

  on(root, 'click', '[data-action="open-intake"]', async (e, el) => {
    const appt = state.appointments.find((x) => String(x.id) === el.dataset.id);
    const patientId = el.dataset.patient || (appt ? String(appt.patient_id) : '');
    const apptId = el.dataset.id || '';
    const isCompleted = el.dataset.completed === '1';

    if (!isCompleted) {
      state.intakePatientId = patientId;
      state.intakeApptId = apptId;
      state.intakePatientName = appt ? `${appt.patient_name} (${appt.appt_time})` : '';
      router.go('/intake');
      return;
    }

    try {
      const res = await api.get('/api/intakes', { patient_id: Number(patientId) });
      const intakes = res.intakes || [];
      const latest = intakes.find((f) => String(f.appointment_id) === String(apptId)) || intakes[0];
      if (!latest) {
        state.intakePatientId = patientId;
        state.intakeApptId = apptId;
        state.intakePatientName = appt ? `${appt.patient_name} (${appt.appt_time})` : '';
        router.go('/intake');
        return;
      }

      const age = calcAge(latest.patient_dob);
      const choice = await openDialog({
        title: `Intake Summary · ${latest.patient_name}`,
        size: 'md',
        body: html`
          <div class="intake-summary-card">
            <div class="tk-row__meta">
              <span class="intake-badge intake-badge--ok">${icon('check-circle', { size: 12 })} Consent Signed (${(latest.consent || []).length})</span>
              ${age ? html`<span class="age-pill">${age}</span>` : ''}
              <span>Captured ${fmtDateTime(latest.created_at)}</span>
              <span>Contact: <strong>${latest.preferred_contact}</strong></span>
            </div>
            <div class="intake-summary-box">
              <span class="intake-summary-box__lbl">Reason for Visit</span>
              <div><strong>${latest.reason_for_visit}</strong></div>
            </div>
            <div class="intake-summary-box">
              <span class="intake-summary-box__lbl">Current Symptoms</span>
              <div>${latest.symptoms || 'None reported'}</div>
            </div>
            <div class="intake-summary-box">
              <span class="intake-summary-box__lbl">Current Medications</span>
              <div>${latest.current_medications || 'None reported'}</div>
            </div>
            <div class="intake-summary-box">
              <span class="intake-summary-box__lbl">Signed / Confirmed By</span>
              <div>${latest.signed_by || latest.patient_name}</div>
            </div>
          </div>`,
        actions: [
          { label: 'Capture New Intake', value: 'new', kind: 'ghost' },
          { label: 'Download Summary', value: 'print' },
          { label: 'Close', value: 'close', kind: 'primary' },
        ],
      });

      if (choice === 'new') {
        state.intakePatientId = patientId;
        state.intakeApptId = apptId;
        state.intakePatientName = appt ? `${appt.patient_name} (${appt.appt_time})` : '';
        router.go('/intake');
      } else if (choice === 'print') {
        const consents = (latest.consent || []).map((c) => `<li>&#10003; ${esc(c)}</li>`).join('');
        downloadHtmlDoc(`intake-${latest.id}.html`, {
          title: 'Patient Intake & Consent Summary',
          businessName: state.session.settings.business_name,
          subtitle: `Captured ${fmtDateTime(latest.created_at)}`,
          accent: '#0c7f85',
          bodyHtml: `
            <table>
              <tr><th style="width:200px">Patient</th><td><strong>${esc(latest.patient_name)}</strong>${age ? ' (' + esc(age) + ')' : ''}</td></tr>
              <tr><th>Date of Birth</th><td>${esc(fmtDay(latest.patient_dob))}</td></tr>
              <tr><th>Phone</th><td>${esc(latest.patient_phone || '')}</td></tr>
              <tr><th>Preferred Contact</th><td>${esc(latest.preferred_contact)}</td></tr>
            </table>
            <div class="box"><strong>Reason for Visit</strong><p>${esc(latest.reason_for_visit)}</p></div>
            <div class="box"><strong>Current Symptoms</strong><p>${esc(latest.symptoms || 'None reported')}</p></div>
            <div class="box"><strong>Current Medications</strong><p>${esc(latest.current_medications || 'None reported')}</p></div>
            <div class="box"><strong>Consent Acknowledgements</strong><ul style="padding-left:18px;margin:8px 0">${consents}</ul><p><strong>Signed by:</strong> ${esc(latest.signed_by || latest.patient_name)}</p></div>`,
        });
      }
    } catch (err) {
      toastError(err);
    }
  });

  on(root, 'click', '[data-action="appt-status"]', async (e, el) => {
    try {
      await api.post('/api/appointments/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Appointment marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="appt-new"]', async () => {
    if (!state.patients.length || !state.providers.length) {
      toast.error('Add at least one patient and one active provider first.');
      return;
    }
    const made = await formDialog({
      title: 'Book Appointment',
      submitLabel: 'Confirm booking',
      size: 'lg',
      fields: apptFields(state),
      onSubmit: (vals) => api.post('/api/appointments', vals),
    });
    if (made) {
      toast.success('Appointment booked.');
      if (made.appointment?.appt_date) state.selectedDate = made.appointment.appt_date;
      await loadScreen('/');
    }
  });

  on(root, 'click', '[data-action="appt-edit"]', async (e, el) => {
    const cur = state.appointments.find((x) => String(x.id) === el.dataset.id);
    if (!cur) return;
    const saved = await formDialog({
      title: `Edit Appointment · ${cur.patient_name}`,
      submitLabel: 'Save changes',
      size: 'lg',
      fields: apptFields(state, cur),
      onSubmit: (vals) => api.put('/api/appointments', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Appointment updated.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="appt-followup"]', async (e, el) => {
    const cur = state.appointments.find((x) => String(x.id) === el.dataset.id);
    if (!cur) return;
    const made = await formDialog({
      title: `Schedule Follow-Up · ${cur.patient_name}`,
      submitLabel: 'Add to recall queue',
      fields: html`
        <label class="k-field"><span class="k-field__label">Follow-up due date</span>
          <input class="k-input" type="date" name="followup_date" value="${addDays(today(), 14)}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Action / Next steps</span>
          <textarea class="k-input" name="action" rows="3" placeholder="e.g. Review lab results and re-check blood pressure" required></textarea>
        </label>`,
      onSubmit: (vals) => api.post('/api/followups', { ...vals, appointment_id: cur.id }),
    });
    if (made) { toast.success('Follow-up added to recall queue.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="print-daysheet"]', () => {
    const rowsHtml = state.appointments.map((a) =>
      `<tr>
        <td><strong>${esc(a.appt_time)}</strong></td>
        <td>${esc(a.patient_name)}${calcAge(a.patient_dob) ? ' (' + esc(calcAge(a.patient_dob)) + ')' : ''}<br><small>${esc(a.patient_phone || '')}</small></td>
        <td>${esc(a.provider_name)} (${esc(a.room || a.provider_role)})</td>
        <td>${esc(a.appt_type)}</td>
        <td>${a.intake_completed ? 'Complete' : 'Pending'}</td>
        <td>${esc(a.status)}</td>
      </tr>`
    ).join('');
    downloadHtmlDoc(`clinic-daysheet-${state.selectedDate}.html`, {
      title: `Waiting Room Sheet · ${fmtDay(state.selectedDate)}`,
      businessName: state.session.settings.business_name,
      subtitle: `${state.appointments.length} appointments scheduled`,
      accent: '#0c7f85',
      bodyHtml: state.appointments.length
        ? `<table><thead><tr><th>Time</th><th>Patient</th><th>Provider / Room</th><th>Type</th><th>Intake</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
        : '<p>No appointments scheduled for this date.</p>',
    });
  });

  on(root, 'click', '[data-action="appt-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete appointment?', message: 'Permanently remove this appointment record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/appointments', { id: Number(el.dataset.id) }); toast.success('Appointment removed.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });
}
