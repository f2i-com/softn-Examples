// Weekly Lesson Schedule Command — Academic Oxford Navy & Gold Masthead with Today Completion Ring,
// Two-Column Day-Grouped Timetable (Tutor Colour Stripes & Subject Badges) + Sticky Mastery/Homework & Unpaid Billing Rail.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDayNear, fmtDay, fmtDuration, daysBetween } from '../../kit/time.js';
import { money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Piano', 'Guitar', 'Violin', 'Spanish', 'French'];
const DURATIONS = [30, 45, 60, 90];
const AREAS = ['Technique', 'Theory', 'Confidence', 'Exam readiness', 'Homework habits'];
const TUTOR_COLORS = ['#1d356b', '#0d9488', '#c69123', '#be123c', '#7c3aed', '#0284c7', '#15803d', '#ea580c'];

const STATUS_TAG = {
  Scheduled: 'tk-tag--info',
  Completed: 'tk-tag--ok',
  Rescheduled: 'tk-tag--warn',
  Cancelled: 'tk-tag--bad',
  'No-Show': 'tk-tag--bad',
};
const CARD_TONE = {
  Completed: 'lesson-card--completed',
  Rescheduled: 'lesson-card--rescheduled',
  Cancelled: 'lesson-card--cancelled',
  'No-Show': 'lesson-card--no-show',
};

export function tutorColor(tutorId, tutorName = '') {
  const n = Number(tutorId);
  if (Number.isFinite(n) && n > 0) return TUTOR_COLORS[(n - 1) % TUTOR_COLORS.length];
  let hash = 0;
  for (const ch of String(tutorName || '')) hash = (hash * 31 + ch.codePointAt(0)) % TUTOR_COLORS.length;
  return TUTOR_COLORS[Math.abs(hash) % TUTOR_COLORS.length];
}

export function subjectBadgeClass(subject) {
  const s = String(subject || '').toLowerCase();
  if (s === 'piano' || s === 'guitar' || s === 'violin') return 'tt-subj tt-subj--music';
  if (s === 'french' || s === 'spanish') return 'tt-subj tt-subj--lang';
  if (s === 'science') return 'tt-subj tt-subj--science';
  if (s === 'english') return 'tt-subj tt-subj--english';
  return 'tt-subj';
}

function lessonFields(state, l = {}) {
  const activeTutors = state.tutors.filter((t) => t.active === 'Active' || t.id === l.tutor_id);
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Student</span>
        <select class="k-input" name="student_id" required>
          <option value="">Select student…</option>
          ${state.students.map((s) => html`<option value="${s.id}" ${Number(l.student_id) === s.id ? 'selected' : ''}>${s.student_name} (${s.subject})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Tutor</span>
        <select class="k-input" name="tutor_id" required>
          <option value="">Select tutor…</option>
          ${activeTutors.map((t) => html`<option value="${t.id}" ${Number(l.tutor_id) === t.id ? 'selected' : ''}>${t.tutor_name} (${(t.hourly_rate_cents / 100).toFixed(0)}/hr)</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date</span>
        <input class="k-input" type="date" name="lesson_date" value="${l.lesson_date || state.selectedDate || today()}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Start Time</span>
        <input class="k-input" type="time" name="start_time" value="${l.start_time || '16:00'}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Duration</span>
        <select class="k-input" name="duration">
          ${DURATIONS.map((d) => html`<option value="${d}" ${Number(l.duration || 60) === d ? 'selected' : ''}>${d} minutes</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Subject / Instrument</span>
        <select class="k-input" name="subject">
          ${SUBJECTS.map((sub) => html`<option value="${sub}" ${sub === (l.subject || 'Mathematics') ? 'selected' : ''}>${sub}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Fee <span class="k-field__optional">auto from hourly rate if blank</span></span>
        <input class="k-input" type="number" step="0.50" min="0" name="fee" value="${l.fee_cents != null ? (l.fee_cents / 100).toFixed(2) : ''}" placeholder="Auto-calculated">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Lesson Plan / Notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Pieces, chapters or exam exercises to cover…">${l.notes || ''}</textarea>
    </label>`;
}

function progressNoteFields(l) {
  return html`
    <p class="tk-muted" style="font-size:13.5px">${fmtDay(l.lesson_date)} · <strong>${l.subject}</strong> (${l.duration}m) with ${l.tutor_name}</p>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Progress Area</span>
        <select class="k-input" name="area">${AREAS.map((a) => html`<option value="${a}">${a}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Session Star Rating (1–5)</span>
        <select class="k-input" name="score">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}" ${n === 4 ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Follow-up Needed?</span>
        <select class="k-input" name="follow_up"><option value="No">No</option><option value="Yes">Yes</option></select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Lesson Progress Notes</span>
      <textarea class="k-input" name="notes" rows="3" placeholder="What went well, breakthroughs, areas to revisit next class…" required></textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Homework / Practice Assigned</span>
      <textarea class="k-input" name="homework" rows="2" placeholder="Pages, exercises, pieces or practice minutes before next lesson…"></textarea>
    </label>`;
}

export function renderScheduleView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.lessonSearch || '').trim().toLowerCase();

  const visible = state.lessons.filter((l) => {
    if (state.lessonDateMode === 'Today' && l.lesson_date !== todayStr) return false;
    if (state.tutorFilter !== 'All' && String(l.tutor_id) !== String(state.tutorFilter)) return false;
    if (q) {
      const hay = `${l.student_name || ''} ${l.tutor_name || ''} ${l.subject || ''} ${l.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const grouped = [];
  const byDay = new Map();
  for (const l of visible) {
    const key = l.lesson_date || 'Unscheduled';
    if (!byDay.has(key)) {
      const bucket = { date: key, lessons: [] };
      byDay.set(key, bucket);
      grouped.push(bucket);
    }
    byDay.get(key).lessons.push(l);
  }
  for (const g of grouped) {
    g.lessons.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  }

  const todayLessons = state.lessons.filter((l) => l.lesson_date === todayStr && l.status !== 'Cancelled');
  const todayDone = todayLessons.filter((l) => l.status === 'Completed').length;
  const todayPct = todayLessons.length ? Math.round((todayDone / todayLessons.length) * 100) : 0;
  const todayMins = todayLessons.reduce((sum, l) => sum + Number(l.duration || 0), 0);
  const feesTotal = visible.filter((l) => l.status !== 'Cancelled').reduce((s, l) => s + Number(l.fee_cents || 0), 0);

  const unpaidInvoices = (state.invoices || [])
    .filter((inv) => {
      const st = String(inv.status || '').trim().toLowerCase();
      return st !== 'paid' && st !== 'void';
    })
    .sort((a, b) => {
      const aOver = a.status === 'Overdue' || (a.due_date && a.due_date < todayStr) ? 1 : 0;
      const bOver = b.status === 'Overdue' || (b.due_date && b.due_date < todayStr) ? 1 : 0;
      return bOver - aOver;
    });
  const recentProgress = [...(state.progressNotes || [])]
    .sort((a, b) => (b.follow_up === 'Yes' ? 1 : 0) - (a.follow_up === 'Yes' ? 1 : 0))
    .slice(0, 3);
  const activeTutors = state.tutors.filter((t) => t.active === 'Active');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="tt-masthead" aria-label="Weekly Timetable Command">
      <div class="tt-masthead__copy">
        <div class="tt-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#ebc05a"></span>
          ACADEMIC TIMETABLE · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="tt-masthead__title">Lesson Schedule</h1>
        <div class="tt-masthead__meta">
          <span><strong style="color:#fae3a7">${todayLessons.length} lesson${todayLessons.length === 1 ? '' : 's'}</strong> today (${todayMins ? fmtDuration(todayMins) : '0h'})</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${activeTutors.length} tutor${activeTutors.length === 1 ? '' : 's'} active</span>
        </div>
      </div>

      <div class="tt-masthead__pods" style="align-items:center">
        <div class="tt-pod tt-pod--ring tt-pod--gold" aria-label="Today's lessons done ${todayPct}%">
          <div class="tk-ring" style="--p:${todayPct}%;--ring-color:#ebc05a;--ring-size:48px">
            <span class="tk-ring__val">${todayPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="tt-pod__lbl">Today Done</span>
            <span class="tt-pod__val" style="font-size:16.5px">${todayDone}/${todayLessons.length}</span>
            <span class="tt-pod__sub">${todayMins ? fmtDuration(todayMins) : '0h'} teaching</span>
          </div>
        </div>

        <div class="tt-pod">
          <span class="tt-pod__lbl">${icon('calendar', { size: 12 })} In View</span>
          <span class="tt-pod__val">${money(feesTotal, { currency })}</span>
          <span class="tt-pod__sub">${visible.length} lesson${visible.length === 1 ? '' : 's'}</span>
        </div>

        <a href="#/students" class="tt-pod">
          <span class="tt-pod__lbl">${icon('mortarboard', { size: 12 })} Students</span>
          <span class="tt-pod__val">${counts.activeStudents || 0}</span>
          <span class="tt-pod__sub">Enrolled →</span>
        </a>

        <a href="#/billing" class="${cls('tt-pod tt-pod--wide-sm', { 'tt-pod--alert': (counts.overdueInvoices || 0) > 0 })}">
          <span class="tt-pod__lbl">${icon('receipt', { size: 12 })} Unpaid</span>
          <span class="tt-pod__val">${money(counts.unpaidInvoicesCents || 0, { currency })}</span>
          <span class="tt-pod__sub">${counts.overdueInvoices ? `${counts.overdueInvoices} overdue →` : `${unpaidInvoices.length} open →`}</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="lesson-new">${icon('plus', { size: 15 })} Book Lesson</button>
      </div>
    </section>

    <div class="tt-split">
      <div class="tk-stack" style="gap:14px">
        <div class="tt-filter-bar">
          <div class="tt-filter-bar__row">
            <label class="tk-search" style="min-height:34px;flex:1 1 200px;max-width:270px">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="lesson-search" value="${state.lessonSearch}" placeholder="Search student, tutor or subject…">
            </label>
            <div class="tk-segmented" role="tablist" aria-label="Lesson date scope">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.lessonDateMode === 'All' })}" data-action="lesson-mode" data-mode="All">All Schedule</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.lessonDateMode === 'Today' })}" data-action="lesson-mode" data-mode="Today">Today</button>
              <label class="tk-pill ${cls({ 'is-on': state.lessonDateMode === 'Day' })}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer">
                <input type="date" data-action="lesson-date-pick" value="${state.selectedDate}" aria-label="Pick lesson date" style="border:0;background:transparent;color:inherit;font:inherit;width:118px">
              </label>
            </div>
          </div>
          <div class="tt-filter-bar__row">
            <div class="tk-segmented" role="tablist" aria-label="Filter by tutor">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.tutorFilter === 'All' })}" data-action="filter-tutor" data-id="All">All Tutors</button>
              ${activeTutors.map((t) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': String(state.tutorFilter) === String(t.id) })}" data-action="filter-tutor" data-id="${t.id}" style="display:inline-flex;align-items:center;gap:6px">
                  <span class="tutor-dot" style="background:${tutorColor(t.id, t.tutor_name)};color:${tutorColor(t.id, t.tutor_name)}"></span>
                  <span>${t.tutor_name}</span>
                </button>`)}
            </div>
          </div>
        </div>

        ${state.loading && !state.lessons.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : grouped.length ? html`
          <div class="tk-stack" style="gap:18px">
            ${grouped.map((group) => {
              const dayMins = group.lessons.filter((x) => x.status !== 'Cancelled').reduce((sum, x) => sum + Number(x.duration || 0), 0);
              return html`
                <section class="day-group" data-key="day-${group.date}">
                  <div class="day-group__head">
                    <div class="day-group__title">
                      ${icon('calendar', { size: 16 })}
                      <span>${fmtDayNear(group.date)}</span>
                      <span class="tk-muted" style="font-size:12.5px;font-weight:600;font-family:var(--k-font)">${fmtDay(group.date, { weekday: 'long' })}</span>
                    </div>
                    <div class="day-group__meta">
                      <span class="tk-tag tk-tag--accent">${group.lessons.length} ${group.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
                      <span class="dur-pill">${fmtDuration(dayMins)}</span>
                    </div>
                  </div>
                  <div class="tk-stack" style="gap:10px">
                    ${group.lessons.map((l) => {
                      const tColor = tutorColor(l.tutor_id, l.tutor_name);
                      return html`
                        <article class="lesson-card ${CARD_TONE[l.status] || ''}" style="--tutor-stripe:${tColor}" data-key="les-${l.id}">
                          <div class="lesson-time">
                            <span class="lesson-time__clock">${l.start_time}</span>
                            <span class="dur-pill">${l.duration}m</span>
                          </div>
                          <div class="tk-row__main">
                            <div class="tk-row__title">
                              <button type="button" class="student-link-btn" data-action="open-student" data-id="${l.student_id}">${l.student_name}</button>
                              <span class="${subjectBadgeClass(l.subject)}">${l.subject}</span>
                              <span class="tk-tag ${STATUS_TAG[l.status] || ''}">${l.status}</span>
                              ${Number(l.note_count) > 0 ? html`<span class="tk-tag tk-tag--ok">${icon('check', { size: 12 })} Note Logged</span>` : ''}
                              ${l.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                            </div>
                            <div class="tk-row__meta">
                              <span class="tutor-chip">
                                <span class="tutor-dot" style="background:${tColor};color:${tColor}"></span>
                                <span>${l.tutor_name}</span>
                              </span>
                              ${l.student_level ? html`<span>${l.student_level}</span>` : ''}
                              <span>Fee: <strong>${money(l.fee_cents || 0, { currency })}</strong></span>
                            </div>
                            ${l.notes ? html`<div class="tk-muted" style="font-size:13px">${l.notes}</div>` : ''}
                          </div>
                          <div class="tk-row__aside">
                            ${l.status === 'Scheduled' ? html`
                              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="lesson-complete-log" data-id="${l.id}">
                                ${icon('check-circle', { size: 13 })} Complete &amp; Note
                              </button>
                              <button type="button" class="k-btn k-btn--sm" data-action="lesson-status" data-id="${l.id}" data-status="Rescheduled">Reschedule</button>` : ''}
                            ${l.status === 'Completed' ? html`
                              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="lesson-log-note" data-id="${l.id}">${icon('quill-scroll', { size: 13 })} Log Note</button>` : ''}
                            <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="lesson-edit" data-id="${l.id}">Edit</button>
                          </div>
                        </article>`;
                    })}
                  </div>
                </section>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({
            iconName: 'calendar',
            title: 'No lessons matching filter',
            text: 'Book a 30, 45, 60 or 90 minute lesson to fill the studio schedule.',
            action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="lesson-new">${icon('plus', { size: 15 })} Book Lesson</button>`,
          })}</section>`}
      </div>

      <aside class="tt-rail-panel" aria-label="Mastery, Homework and Unpaid Billing Rail">
        <section class="tt-rail-card">
          <div class="tt-rail-card__head">
            <span class="tt-rail-card__title">${icon('quill-scroll', { size: 14 })} Mastery &amp; Homework</span>
            <a href="#/progress" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Journal</a>
          </div>
          ${recentProgress.length ? html`
            <div class="tt-rail-list">
              ${recentProgress.map((n) => html`
                <div class="tt-rail-item" data-key="rail-pn-${n.id}">
                  <div class="tt-rail-item__top">
                    <div>
                      <div class="tt-rail-item__name">${n.student_name}</div>
                      <div class="tt-rail-item__sub">${n.area} · ${n.lesson_subject || n.student_subject}</div>
                    </div>
                    <span class="star-score-pill">★ ${n.score}/5</span>
                  </div>
                  ${n.homework ? html`<div style="font-size:12px;color:#6e480a;background:#fef9eb;padding:6px 8px;border-radius:6px;border-left:2.5px solid #c69123">${n.homework}</div>` : ''}
                  <div class="tt-rail-item__foot">
                    ${n.follow_up === 'Yes' ? html`<span class="tk-tag tk-tag--warn">${icon('flag', { size: 11 })} Follow-Up</span>` : html`<span class="tk-muted" style="font-size:11.5px">${n.lesson_date ? fmtDay(n.lesson_date) : ''}</span>`}
                    <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="rail-copy-update" data-id="${n.id}">${icon('mail', { size: 12 })} Parent Update</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Complete a lesson to record mastery ratings &amp; homework.</div>`}
        </section>

        <section class="tt-rail-card">
          <div class="tt-rail-card__head">
            <span class="tt-rail-card__title">${icon('receipt', { size: 14 })} Unpaid Tuition</span>
            <button type="button" class="k-btn k-btn--primary k-btn--sm" style="min-height:25px;padding:0 9px;font-size:11px" data-action="hero-invoice-new">+ Invoice</button>
          </div>
          ${unpaidInvoices.length ? html`
            <div class="tt-rail-list">
              ${unpaidInvoices.slice(0, 4).map((inv) => {
                const gap = inv.due_date ? daysBetween(inv.due_date, todayStr) : 0;
                const isOver = inv.status === 'Overdue' || (inv.status !== 'Draft' && gap > 0);
                return html`
                  <div class="tt-rail-item" data-key="rail-inv-${inv.id}">
                    <div class="tt-rail-item__top">
                      <div>
                        <div class="tt-rail-item__name">${inv.student_name}</div>
                        <div class="tt-rail-item__sub">${inv.invoice_number} · ${inv.billing_period}</div>
                      </div>
                      <strong style="font-size:14px;font-variant-numeric:tabular-nums">${money(inv.amount_cents, { currency })}</strong>
                    </div>
                    <div class="tt-rail-item__foot">
                      ${isOver
                        ? html`<span class="overdue-tuition-badge">${gap > 0 ? `Overdue ${gap}d` : 'Overdue'}</span>`
                        : html`<span class="tk-tag tk-tag--warn">${inv.status}</span>`}
                      <button type="button" class="k-btn k-btn--sm" data-action="rail-inv-paid" data-id="${inv.id}">Mark Paid ✓</button>
                    </div>
                  </div>`;
              })}
            </div>
          ` : state.loading && !state.invoicesLoaded ? html`
            <div style="padding:14px;font-size:13px;color:var(--k-muted)">Loading tuition invoices…</div>
          ` : ((counts.unpaidInvoicesCount || 0) > 0 || (counts.overdueInvoices || 0) > 0) ? html`
            <div style="padding:14px;display:grid;gap:8px">
              <div style="font-size:13px;font-weight:700;color:#be123c">${counts.overdueInvoices ? `${counts.overdueInvoices} overdue` : `${counts.unpaidInvoicesCount} unpaid`} · ${money(counts.unpaidInvoicesCents || 0, { currency })}</div>
              <a href="#/billing" class="k-btn k-btn--soft k-btn--sm" style="justify-content:center">Open Billing Desk →</a>
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-success);font-weight:650">All tuition invoices settled ✓</div>`}
        </section>

        <section class="tt-rail-card">
          <div class="tt-rail-card__head">
            <span class="tt-rail-card__title">${icon('award', { size: 14 })} Faculty Roster</span>
            <a href="#/tutors" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.tutors.length})</a>
          </div>
          <div class="tt-rail-list">
            ${activeTutors.map((t) => {
              const color = tutorColor(t.id, t.tutor_name);
              return html`
                <div class="tt-rail-item" style="padding:9px 14px">
                  <div class="tt-rail-item__top">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0">
                      <span class="tutor-dot" style="background:${color};color:${color}"></span>
                      <span class="tt-rail-item__name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.tutor_name}</span>
                    </div>
                    <span class="tk-muted" style="font-size:11.5px;white-space:nowrap;font-weight:700">${money(t.hourly_rate_cents || 0, { currency })}/h</span>
                  </div>
                </div>`;
            })}
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireScheduleActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="lesson-search"]', (e, el) => {
    state.lessonSearch = el.value;
    draw();
  });
  on(root, 'click', '[data-action="lesson-mode"]', (e, el) => {
    state.lessonDateMode = el.dataset.mode;
    loadScreen('/');
  });
  on(root, 'change', '[data-action="lesson-date-pick"]', (e, el) => {
    if (el.value) { state.selectedDate = el.value; state.lessonDateMode = 'Day'; loadScreen('/'); }
  });
  on(root, 'click', '[data-action="filter-tutor"]', (e, el) => {
    state.tutorFilter = el.dataset.id;
    draw();
  });
  on(root, 'click', '[data-action="open-student"]', (e, el) => {
    state.selectedStudentId = Number(el.dataset.id);
    router.go('/students');
  });

  on(root, 'click', '[data-action="rail-copy-update"]', (e, el) => {
    const note = (state.progressNotes || []).find((x) => String(x.id) === el.dataset.id);
    if (!note) return;
    const greeting = note.guardian_name ? `Hi ${note.guardian_name},` : 'Hello,';
    const subject = note.lesson_subject || note.student_subject || 'tuition';
    const lines = [
      `Subject: Lesson Update for ${note.student_name} (${subject})`,
      '',
      greeting,
      '',
      `Update from ${note.student_name}'s ${subject} lesson${note.lesson_date ? ' on ' + fmtDay(note.lesson_date) : ''}:`,
      `Focus Area: ${note.area} · Rating: ${note.score}/5`,
      `Notes: ${note.notes}`,
      note.homework ? `\nHomework:\n${note.homework}` : '',
      '',
      `Warm regards,\n${state.session.settings.business_name}`,
    ].filter((x) => x !== '');
    copyText(lines.join('\n'), { title: `Parent Update · ${note.student_name}`, done: 'Parent update copied!' });
  });

  on(root, 'click', '[data-action="rail-inv-paid"]', async (e, el) => {
    try {
      await api.post('/api/invoices/status', { id: Number(el.dataset.id), status: 'Paid' });
      toast.success('Invoice marked Paid.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="lesson-status"]', async (e, el) => {
    try {
      await api.post('/api/lessons/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Lesson marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="hero-invoice-new"]', async () => {
    if (!state.students.length) { toast.error('Enrol a student first.'); return; }
    const made = await formDialog({
      title: 'Raise Tuition Invoice',
      submitLabel: 'Create invoice',
      fields: html`
        <label class="k-field"><span class="k-field__label">Student</span>
          <select class="k-input" name="student_id" required>${state.students.map((s) => html`<option value="${s.id}">${s.student_name} (${s.subject})</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Billing Period</span><input class="k-input" name="billing_period" placeholder="e.g. Term 4 · Nov 2026" required></label>
          <label class="k-field"><span class="k-field__label">Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" placeholder="320.00" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 14)}"></label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">${['Unpaid', 'Sent', 'Draft', 'Paid'].map((st) => html`<option value="${st}" ${st === 'Unpaid' ? 'selected' : ''}>${st}</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes / Line Description</span>
          <textarea class="k-input" name="notes" rows="2" placeholder="e.g. 4 x 60 min Mathematics lessons, bank transfer details…"></textarea>
        </label>`,
      onSubmit: (vals) => api.post('/api/invoices', vals),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} raised.`); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="lesson-new"]', async () => {
    if (!state.students.length || !state.tutors.length) { toast.error('Add at least one student and tutor first.'); return; }
    const made = await formDialog({
      title: 'Book Lesson',
      submitLabel: 'Schedule lesson',
      size: 'lg',
      fields: lessonFields(state),
      onSubmit: (vals) => api.post('/api/lessons', vals),
    });
    if (made) { toast.success('Lesson booked.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="lesson-edit"]', async (e, el) => {
    const cur = state.lessons.find((x) => String(x.id) === el.dataset.id);
    if (!cur) return;
    const saved = await formDialog({
      title: `Edit Lesson · ${cur.student_name}`,
      submitLabel: 'Save lesson',
      size: 'lg',
      fields: lessonFields(state, cur),
      onSubmit: (vals) => api.put('/api/lessons', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Lesson updated.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="lesson-complete-log"]', async (e, el) => {
    const l = state.lessons.find((x) => String(x.id) === el.dataset.id);
    if (!l) return;
    const made = await formDialog({
      title: `Complete & Log Progress Note · ${l.student_name}`,
      submitLabel: 'Complete Lesson & Save Note',
      size: 'lg',
      fields: progressNoteFields(l),
      onSubmit: async (vals) => {
        await api.post('/api/lessons/status', { id: l.id, status: 'Completed' });
        return api.post('/api/progress', { ...vals, student_id: l.student_id, lesson_id: l.id });
      },
    });
    if (made) { toast.success('Lesson completed and progress note logged!'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="lesson-log-note"]', async (e, el) => {
    const l = state.lessons.find((x) => String(x.id) === el.dataset.id);
    if (!l) return;
    const made = await formDialog({
      title: `Log Progress Note · ${l.student_name}`,
      submitLabel: 'Save progress note',
      size: 'lg',
      fields: progressNoteFields(l),
      onSubmit: (vals) => api.post('/api/progress', { ...vals, student_id: l.student_id, lesson_id: l.id }),
    });
    if (made) { toast.success('Progress note & homework logged!'); await loadScreen('/'); }
  });
}
