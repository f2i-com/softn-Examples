// Follow-Up & Recall Queue (Unified Clinical Masthead, Countdown Cards & 3-Stage Stepper, 1-Click SMS Copy)
// + Providers Roster (Unified Clinical Masthead & Specialty-Banded Clinician Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, fmtDayNear, daysBetween } from '../../kit/time.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const PROVIDER_ROLES = ['General Practitioner', 'Physiotherapist', 'Dentist', 'Nurse', 'Allied Health', 'Psychologist', 'Specialist'];
const RECALL_STAGES = ['Pending', 'Scheduled', 'Completed'];

function providerThemeClass(role, active) {
  if (!active) return 'cl-prov-card--paused';
  const r = String(role || '').toLowerCase();
  if (r.includes('physio')) return 'cl-prov-card--physio';
  if (r.includes('dent')) return 'cl-prov-card--dental';
  if (r.includes('nurse')) return 'cl-prov-card--nurse';
  return '';
}

export function renderFollowUpsView(state) {
  const todayStr = today();
  const overdueCount = state.followUps.filter((f) => f.status === 'Pending' && f.followup_date < todayStr).length;
  const dueTodayCount = state.followUps.filter((f) => f.status === 'Pending' && f.followup_date === todayStr).length;
  const scheduledCount = state.followUps.filter((f) => f.status === 'Scheduled').length;
  const completedCount = state.followUps.filter((f) => f.status === 'Completed').length;
  const q = (state.recallSearch || '').trim().toLowerCase();

  const rows = state.followUps.filter((f) => {
    if (state.recallFilter === 'Active' && !(f.status === 'Pending' || f.status === 'Scheduled')) return false;
    if (state.recallFilter === 'Overdue' && !(f.status === 'Pending' && f.followup_date <= todayStr)) return false;
    if (state.recallFilter === 'Completed' && !(f.status === 'Completed' || f.status === 'Cancelled')) return false;
    if (q) {
      const hay = `${f.patient_name || ''} ${f.provider_name || ''} ${f.action || ''} ${f.patient_phone || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return html`
    <section class="cl-masthead" aria-label="Patient Recall and Continuity">
      <div class="cl-masthead__copy">
        <div class="cl-masthead__eyebrow">
          ${icon('bell', { size: 12 })} PATIENT RECALL &amp; CONTINUITY
        </div>
        <h1 class="cl-masthead__title">Follow-Up Recall</h1>
        <div class="cl-masthead__meta">
          <span>Overdue &amp; upcoming recalls</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click SMS or return booking</span>
        </div>
      </div>

      <div class="cl-masthead__pods" style="align-items:center">
        <div class="${cls('cl-pod', { 'cl-pod--alert': overdueCount > 0 })}">
          <span class="cl-pod__lbl">${icon('alert', { size: 12 })} Overdue</span>
          <span class="cl-pod__val">${overdueCount}</span>
          <span class="cl-pod__sub">${dueTodayCount} due today</span>
        </div>
        <div class="cl-pod cl-pod--teal">
          <span class="cl-pod__lbl">${icon('calendar', { size: 12 })} Scheduled</span>
          <span class="cl-pod__val">${scheduledCount}</span>
          <span class="cl-pod__sub">Return booked</span>
        </div>
        <div class="cl-pod cl-pod--wide-sm">
          <span class="cl-pod__lbl">${icon('check-circle', { size: 12 })} Completed</span>
          <span class="cl-pod__val">${completedCount}</span>
          <span class="cl-pod__sub">Closed recalls</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="followup-new">${icon('plus', { size: 15 })} Add Follow-Up</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}
        <input type="search" data-action="recall-search" value="${state.recallSearch}" placeholder="Search patient, clinician or recall action…">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter recalls">
        ${[
          ['Active', 'Open Queue'],
          ['Overdue', `Due / Overdue (${overdueCount + dueTodayCount})`],
          ['Completed', 'Completed'],
          ['All', `All (${state.followUps.length})`],
        ].map(([id, lbl]) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.recallFilter === id })}" data-action="recall-filter" data-filter="${id}">${lbl}</button>`)}
      </div>
    </div>

    ${state.loading && !state.followUps.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="recall-grid">
        ${rows.map((f) => {
          const gap = daysBetween(todayStr, f.followup_date);
          const isOpen = f.status === 'Pending' || f.status === 'Scheduled';
          const isOverdue = f.status === 'Pending' && gap < 0;
          const isDueToday = f.status === 'Pending' && gap === 0;
          const isDueLater = isOpen && gap > 0;
          const isDone = f.status === 'Completed' || f.status === 'Cancelled';
          const stepIdx = RECALL_STAGES.indexOf(f.status);
          return html`
            <article class="${cls('recall-card', { 'recall-card--overdue': isOverdue, 'recall-card--today': isDueToday, 'recall-card--done': isDone })}" data-key="fu-${f.id}">
              <div class="recall-card__top">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                  <span class="tk-avatar">${initials(f.patient_name || 'P')}</span>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span>${f.patient_name}</span>
                      ${isOverdue ? html`<span class="recall-countdown recall-countdown--overdue">${icon('alert', { size: 12 })} Overdue ${Math.abs(gap)}d</span>` : ''}
                      ${isDueToday ? html`<span class="recall-countdown recall-countdown--today">${icon('clock', { size: 12 })} Due Today</span>` : ''}
                      ${isDueLater ? html`<span class="recall-countdown ${gap <= 7 ? 'recall-countdown--soon' : 'recall-countdown--later'}">${icon('calendar', { size: 12 })} Due in ${gap}d</span>` : ''}
                      <span class="tk-tag ${f.status === 'Completed' ? 'tk-tag--ok' : f.status === 'Scheduled' ? 'tk-tag--info' : 'tk-tag--warn'}">${f.status}</span>
                      ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div style="font-size:14.5px;font-weight:650;margin-top:2px;color:var(--k-text)">${f.action}</div>
                    <div class="tk-row__meta">
                      <span>${icon('calendar', { size: 13 })} Due: <strong>${fmtDayNear(f.followup_date)}</strong> (${fmtDay(f.followup_date)})</span>
                      <span>${icon('stethoscope', { size: 13 })} ${f.provider_name}</span>
                      ${f.patient_phone ? html`<span>${icon('phone', { size: 13 })} ${f.patient_phone}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-recall-sms" data-id="${f.id}">${icon('copy', { size: 13 })} Copy SMS</button>
                  ${f.status === 'Pending' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="followup-book" data-id="${f.id}">${icon('calendar', { size: 13 })} Book Return</button>` : ''}
                  ${f.status !== 'Completed' ? html`
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="followup-complete" data-id="${f.id}">${icon('check', { size: 13 })} Complete</button>` : ''}
                </div>
              </div>
              <div class="cl-steps" aria-label="Recall continuity progress">
                ${RECALL_STAGES.map((st, idx) => html`
                  <div class="${cls('cl-step', { 'is-done': idx < stepIdx || (f.status === 'Completed' && idx === 2), 'is-now': idx === stepIdx && f.status !== 'Completed' })}">
                    ${idx < stepIdx || (f.status === 'Completed' && idx === 2) ? '✓' : `${idx + 1}.`} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'calendar', title: 'Recall queue is clear', text: 'No follow-ups match this filter.' })}</section>`}`;
}

function providerFields(p = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Provider Name</span>
        <input class="k-input" name="full_name" value="${p.full_name || ''}" placeholder="e.g. Dr. Alex Morgan" required>
      </label>
      <label class="k-field"><span class="k-field__label">Specialty / Role</span>
        <select class="k-input" name="role">
          ${PROVIDER_ROLES.map((r) => html`<option value="${r}" ${r === p.role ? 'selected' : ''}>${r}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Default Room</span>
        <input class="k-input" name="room" value="${p.room || ''}" placeholder="e.g. Room 2, Physio Suite">
      </label>
      <label class="k-field"><span class="k-field__label">Phone</span>
        <input class="k-input" name="phone" value="${p.phone || ''}" placeholder="Direct extension or mobile">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Email <span class="k-field__optional">optional</span></span>
      <input class="k-input" type="email" name="email" value="${p.email || ''}" placeholder="provider@clinic.example">
    </label>
    <label class="k-check">
      <input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}>
      <span>Currently accepting appointments</span>
    </label>`;
}

export function renderProvidersView(state) {
  const activeCount = state.providers.filter((p) => p.active).length;
  const totalToday = state.providers.reduce((s, p) => s + Number(p.today_count || 0), 0);
  const specCount = new Set(state.providers.map((p) => p.role)).size;

  return html`
    <section class="cl-masthead" aria-label="Providers Roster">
      <div class="cl-masthead__copy">
        <div class="cl-masthead__eyebrow">
          ${icon('stethoscope', { size: 12 })} CLINICIANS &amp; CONSULTING ROOMS
        </div>
        <h1 class="cl-masthead__title">Providers Roster</h1>
        <div class="cl-masthead__meta">
          <span>GPs, physios, dentists &amp; nurses</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Default rooms auto-assign</span>
        </div>
      </div>

      <div class="cl-masthead__pods" style="align-items:center">
        <div class="cl-pod cl-pod--teal">
          <span class="cl-pod__lbl">${icon('shield-check', { size: 12 })} Accepting</span>
          <span class="cl-pod__val">${activeCount}/${state.providers.length}</span>
          <span class="cl-pod__sub">Active clinicians</span>
        </div>
        <div class="cl-pod">
          <span class="cl-pod__lbl">${icon('calendar', { size: 12 })} Today Load</span>
          <span class="cl-pod__val">${totalToday}</span>
          <span class="cl-pod__sub">Scheduled visits</span>
        </div>
        <div class="cl-pod cl-pod--wide-sm">
          <span class="cl-pod__lbl">${icon('clinic-cross', { size: 12 })} Specialties</span>
          <span class="cl-pod__val">${specCount}</span>
          <span class="cl-pod__sub">Disciplines</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="provider-new">${icon('plus', { size: 15 })} Add Provider</button>
      </div>
    </section>

    ${state.loading && !state.providers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.providers.length ? html`
      <div class="cl-prov-grid">
        ${state.providers.map((pr) => {
          const load = Number(pr.today_count || 0);
          const loadPct = Math.min(100, Math.round((load / 8) * 100));
          return html`
            <article class="tk-card cl-prov-card ${providerThemeClass(pr.role, pr.active)}" data-key="prov-${pr.id}">
              <div class="cl-prov-card__head">
                <div class="prov-head">
                  <span class="prov-avatar">${initials(pr.full_name)}</span>
                  <div style="min-width:0">
                    <div class="tk-card__title">${pr.full_name}</div>
                    <div class="tk-card__sub">${pr.role}</div>
                  </div>
                </div>
                <span class="tk-tag ${pr.active ? 'tk-tag--ok' : ''}">${pr.active ? 'Accepting' : 'Paused'}</span>
              </div>
              <div class="cl-prov-card__body">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                  ${pr.room ? html`<span class="tk-tag tk-tag--accent">${icon('exam-room', { size: 12 })} ${pr.room}</span>` : html`<span class="tk-muted" style="font-size:12px">No default room</span>`}
                  <span style="font-size:12.5px;font-weight:750;font-variant-numeric:tabular-nums">${load} appt${load === 1 ? '' : 's'} today</span>
                </div>
                <div class="tk-bar"><div class="tk-bar__fill ${load >= 7 ? 'tk-bar__fill--warn' : ''}" style="width:${loadPct}%"></div></div>
                <div style="display:grid;gap:4px;font-size:12.5px;color:var(--k-muted)">
                  ${pr.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} <span>${pr.phone}</span></div>` : ''}
                  ${pr.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 13 })} <span style="overflow:hidden;text-overflow:ellipsis">${pr.email}</span></div>` : ''}
                </div>
                <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                  <button type="button" class="k-btn k-btn--sm" data-action="provider-toggle" data-id="${pr.id}" data-active="${pr.active ? '0' : '1'}">
                    ${pr.active ? 'Pause Bookings' : 'Set Active'}
                  </button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="provider-edit" data-id="${pr.id}">Edit</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'stethoscope', title: 'No providers yet', text: 'Add clinicians to start scheduling appointments.' })}</section>`}`;
}

export function wireRecallActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="recall-search"]', (e, el) => {
    state.recallSearch = el.value;
    draw();
  });

  on(root, 'click', '[data-action="recall-filter"]', (e, el) => {
    state.recallFilter = el.dataset.filter;
    draw();
  });

  on(root, 'click', '[data-action="followup-new"]', async () => {
    if (!state.appointments.length) { toast.error('Book an appointment first before adding a follow-up.'); return; }
    const made = await formDialog({
      title: 'Add Follow-Up Recall',
      submitLabel: 'Add recall',
      fields: html`
        <label class="k-field"><span class="k-field__label">Original Appointment</span>
          <select class="k-input" name="appointment_id" required>
            ${state.appointments.map((a) => html`<option value="${a.id}">${fmtDay(a.appt_date)} ${a.appt_time} · ${a.patient_name} (${a.provider_name})</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Follow-Up Due Date</span>
          <input class="k-input" type="date" name="followup_date" value="${addDays(today(), 14)}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Action / Next Steps</span>
          <textarea class="k-input" name="action" rows="3" placeholder="e.g. Call patient to book 2-week physio review" required></textarea>
        </label>`,
      onSubmit: (vals) => api.post('/api/followups', vals),
    });
    if (made) { toast.success('Follow-up added.'); await loadScreen('/followups'); }
  });

  on(root, 'click', '[data-action="followup-book"]', async (e, el) => {
    const f = state.followUps.find((x) => String(x.id) === el.dataset.id);
    if (!f) return;
    const defaultDate = f.followup_date >= today() ? f.followup_date : today();
    const booked = await formDialog({
      title: `Book Follow-Up · ${f.patient_name}`,
      submitLabel: 'Book & Mark Scheduled',
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">Recall action: <strong>${f.action}</strong></p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Appointment Date</span>
            <input class="k-input" type="date" name="appt_date" value="${defaultDate}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Time</span>
            <input class="k-input" type="time" name="appt_time" value="10:00" required>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Clinician</span>
          <select class="k-input" name="provider_id">
            ${state.providers.filter((p) => p.active || p.id === f.provider_id).map((pr) => html`<option value="${pr.id}" ${pr.id === f.provider_id ? 'selected' : ''}>${pr.full_name} · ${pr.role}</option>`)}
          </select>
        </label>`,
      onSubmit: (vals) => api.post('/api/followups/book', { ...vals, id: f.id }),
    });
    if (booked) { toast.success('Follow-up appointment booked!'); await loadScreen('/followups'); }
  });

  on(root, 'click', '[data-action="followup-complete"]', async (e, el) => {
    try {
      await api.post('/api/followups/status', { id: Number(el.dataset.id), status: 'Completed' });
      toast.success('Follow-up marked complete.');
      await loadScreen('/followups');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-recall-sms"]', (e, el) => {
    const f = state.followUps.find((x) => String(x.id) === el.dataset.id);
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

  on(root, 'click', '[data-action="provider-new"]', async () => {
    const made = await formDialog({
      title: 'Add Provider',
      submitLabel: 'Add clinician',
      fields: providerFields(),
      onSubmit: (vals) => api.post('/api/providers', vals),
    });
    if (made) { toast.success('Provider added.'); await loadScreen('/providers'); }
  });

  on(root, 'click', '[data-action="provider-edit"]', async (e, el) => {
    const pr = state.providers.find((x) => String(x.id) === el.dataset.id);
    if (!pr) return;
    const saved = await formDialog({
      title: `Edit ${pr.full_name}`,
      submitLabel: 'Save provider',
      fields: providerFields(pr),
      onSubmit: (vals) => api.put('/api/providers', { ...vals, id: pr.id }),
    });
    if (saved) { toast.success('Provider updated.'); await loadScreen('/providers'); }
  });

  on(root, 'click', '[data-action="provider-toggle"]', async (e, el) => {
    try {
      await api.put('/api/providers', { id: Number(el.dataset.id), active: el.dataset.active === '1' });
      toast.success('Provider availability updated.');
      await loadScreen('/providers');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="provider-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete provider?', message: 'Remove this clinician from the roster?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/providers', { id: Number(el.dataset.id) }); toast.success('Provider removed.'); await loadScreen('/providers'); }
    catch (err) { toastError(err); }
  });
}
