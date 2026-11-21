// Students & Guardians Directory + Visual Mastery Dossier — Unified Oxford Navy & Gold Masthead,
// Subject Badges, Student Mastery Cards, Star-Rated Timeline & 1-Click Copy Parent Update.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { fmtDay } from '../../kit/time.js';
import { initials, money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { subjectBadgeClass } from './schedule.js';

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Piano', 'Guitar', 'Violin', 'Spanish', 'French'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Exam preparation'];
const STATUSES = ['Active', 'Waitlist', 'Paused', 'Finished'];

function starRating(score) {
  const s = Math.max(0, Math.min(5, Math.round(Number(score || 0))));
  return html`<span class="star-row" aria-label="${s} out of 5 stars">
    ${[1, 2, 3, 4, 5].map((i) => html`<span class="${cls('star-glyph', { 'is-on': i <= s })}">★</span>`)}
    <span class="star-score-pill">${s}/5</span>
  </span>`;
}

function buildStudentParentUpdate(student, note, studioName) {
  const greeting = student.guardian_name ? `Hi ${student.guardian_name},` : 'Hello,';
  const subject = (note && note.lesson_subject) || student.subject || 'tuition';
  const when = note && note.lesson_date ? ` on ${fmtDay(note.lesson_date)}` : '';
  const stars = note ? `${'★'.repeat(Math.max(1, Math.min(5, Number(note.score || 4))))} (${note.score}/5)` : '';
  const lines = [
    `Subject: Lesson Update for ${student.student_name} (${subject})`,
    '',
    greeting,
    '',
    `Here is a quick update from ${student.student_name}'s ${subject} lesson${when}${note && note.tutor_name ? ' with ' + note.tutor_name : ''}:`,
    '',
  ];
  if (note) {
    lines.push(`Focus Area: ${note.area} · Session Rating: ${stars}`);
    lines.push(`Progress Notes: ${note.notes}`);
    if (note.homework) lines.push('', `Homework / Practice for Next Lesson:\n${note.homework}`);
    if (note.follow_up === 'Yes') lines.push('', 'Note: We have flagged a quick check-in before the next lesson — please reply anytime.');
  } else {
    lines.push(`Learning Goals: ${student.goals || 'Continuing steady progress in ' + subject}.`);
  }
  lines.push('', `Warm regards,\n${studioName}`);
  return lines.join('\n');
}

function studentFields(s = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Student Name</span>
        <input class="k-input" name="student_name" value="${s.student_name || ''}" placeholder="Full name" required>
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${STATUSES.map((st) => html`<option value="${st}" ${st === (s.status || 'Active') ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Subject / Instrument</span>
        <select class="k-input" name="subject">${SUBJECTS.map((sub) => html`<option value="${sub}" ${sub === (s.subject || 'Mathematics') ? 'selected' : ''}>${sub}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Level</span>
        <select class="k-input" name="level">${LEVELS.map((lv) => html`<option value="${lv}" ${lv === (s.level || 'Intermediate') ? 'selected' : ''}>${lv}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Guardian / Parent Name</span>
        <input class="k-input" name="guardian_name" value="${s.guardian_name || ''}" placeholder="Parent or guardian name">
      </label>
      <label class="k-field"><span class="k-field__label">Guardian Email</span>
        <input class="k-input" type="email" name="guardian_email" value="${s.guardian_email || ''}" placeholder="parent@example.com">
      </label>
      <label class="k-field"><span class="k-field__label">Phone</span>
        <input class="k-input" name="phone" value="${s.phone || ''}" placeholder="0412 345 678">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Learning Goals</span>
      <textarea class="k-input" name="goals" rows="3" placeholder="Exam dates, repertoire, grade level targets, focus areas…">${s.goals || ''}</textarea>
    </label>`;
}

export function renderStudentsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.studentSearch.trim().toLowerCase();
  const list = state.students.filter((s) => {
    if (state.studentSubjectFilter !== 'All' && s.subject !== state.studentSubjectFilter) return false;
    if (q && !s.student_name.toLowerCase().includes(q) && !(s.guardian_name || '').toLowerCase().includes(q) && !(s.subject || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const activeCount = state.students.filter((s) => s.status === 'Active').length;
  const scored = state.students.filter((s) => Number(s.avg_score) > 0);
  const studioAvg = scored.length ? scored.reduce((sum, s) => sum + Number(s.avg_score), 0) / scored.length : 0;
  const masteryPct = Math.round((studioAvg / 5) * 100);
  const subjectCount = new Set(state.students.map((s) => s.subject)).size;

  const d = state.dossier;
  const st = d ? d.student : null;
  const notes = d && d.progressNotes ? d.progressNotes : [];
  const stAvg = notes.length ? (notes.reduce((sum, n) => sum + Number(n.score || 0), 0) / notes.length) : 0;
  const stDoneLessons = (d?.lessons || []).filter((l) => l.status === 'Completed').length;

  return html`
    <section class="tt-masthead" aria-label="Students and Guardians Directory">
      <div class="tt-masthead__copy">
        <div class="tt-masthead__eyebrow">
          ${icon('mortarboard', { size: 12 })} ENROLLED STUDENTS &amp; FAMILIES
        </div>
        <h1 class="tt-masthead__title">Students &amp; Guardians</h1>
        <div class="tt-masthead__meta">
          <span>Mastery dossiers &amp; contacts</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click parent update</span>
        </div>
      </div>

      <div class="tt-masthead__pods" style="align-items:center">
        <div class="tt-pod tt-pod--ring tt-pod--gold" aria-label="Studio mastery ${masteryPct}%">
          <div class="tk-ring" style="--p:${masteryPct}%;--ring-color:#ebc05a;--ring-size:48px">
            <span class="tk-ring__val">${masteryPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="tt-pod__lbl">Avg Mastery</span>
            <span class="tt-pod__val" style="font-size:16.5px">${studioAvg ? studioAvg.toFixed(1) : '—'}/5</span>
            <span class="tt-pod__sub">Studio average</span>
          </div>
        </div>
        <div class="tt-pod tt-pod--wide-sm">
          <span class="tt-pod__lbl">${icon('users', { size: 12 })} Enrolled</span>
          <span class="tt-pod__val">${activeCount}/${state.students.length}</span>
          <span class="tt-pod__sub">${subjectCount} subjects</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="student-new">${icon('plus', { size: 15 })} Enrol Student</button>
      </div>
    </section>

    <div class="tt-dossier-grid">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Directory</h2>
          <span class="tk-sheet__count">${list.length}</span>
        </div>
        <div style="padding:10px 12px;border-bottom:1px solid var(--k-border);display:grid;gap:8px">
          <label class="tk-search" style="max-width:none">${icon('search', { size: 15 })}
            <input type="search" data-action="student-search" value="${state.studentSearch}" placeholder="Search student or guardian…">
          </label>
          <select class="k-input" style="min-height:34px;padding:4px 10px;font-size:13px" data-action="student-subject-filter" aria-label="Filter by subject">
            <option value="All">All subjects</option>
            ${SUBJECTS.map((sub) => html`<option value="${sub}" ${state.studentSubjectFilter === sub ? 'selected' : ''}>${sub}</option>`)}
          </select>
        </div>
        <div class="tt-roster-scroll">
          ${state.loading && !state.students.length ? skeleton(4) : list.length ? list.map((s) => html`
            <button type="button" class="${cls('student-pick', { 'is-on': state.selectedStudentId === s.id })}" data-key="st-${s.id}" data-action="select-student" data-id="${s.id}">
              <span class="tt-monogram">${initials(s.student_name)}</span>
              <span style="min-width:0;flex:1;display:grid;gap:3px">
                <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:750;font-size:14.5px">
                  <span>${s.student_name}</span>
                  ${s.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </span>
                <span style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                  <span class="${subjectBadgeClass(s.subject)}" style="padding:1px 7px;font-size:10.5px">${s.subject}</span>
                  <span class="tk-muted" style="font-size:12px">${s.level} · ${s.status}</span>
                </span>
              </span>
              ${s.avg_score ? html`<span class="star-score-pill">★ ${s.avg_score}</span>` : ''}
            </button>`) : emptyState({ iconName: 'users', title: 'No students match', text: 'Enrol a student to start scheduling lessons.' })}
        </div>
      </section>

      <div class="tk-stack">
        ${state.loading && !st ? html`<section class="tk-sheet">${skeleton(3)}</section>` : st ? html`
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <span class="tt-monogram">${initials(st.student_name)}</span>
                <h2 class="tk-sheet__title">${st.student_name} <span class="${subjectBadgeClass(st.subject)}">${st.subject}</span> <span class="tk-tag">${st.level}</span> <span class="tk-tag ${st.status === 'Active' ? 'tk-tag--ok' : 'tk-tag--warn'}">${st.status}</span></h2>
              </div>
              <div class="tk-sheet__actions">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="copy-parent-lesson-update" data-note-id="${notes[0] ? notes[0].id : ''}">${icon('mail', { size: 14 })} Copy Parent Update</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="student-edit" data-id="${st.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="student-del" data-id="${st.id}">Delete</button>
              </div>
            </div>
            <div class="tk-sheet__body tk-stack">
              <div class="tt-mastery-grid">
                <div class="tt-mastery-card">
                  <span class="tt-mastery-card__lbl">Mastery Rating</span>
                  <span class="tt-mastery-card__val">${stAvg ? `${stAvg.toFixed(1)}/5` : '—'}</span>
                  <div class="tk-bar"><div class="tk-bar__fill" style="width:${Math.round((stAvg / 5) * 100)}%;background:#c69123"></div></div>
                </div>
                <div class="tt-mastery-card">
                  <span class="tt-mastery-card__lbl">Completed</span>
                  <span class="tt-mastery-card__val">${stDoneLessons}</span>
                  <span class="tk-muted" style="font-size:11.5px">${(d.lessons || []).length} total lessons</span>
                </div>
                <div class="tt-mastery-card">
                  <span class="tt-mastery-card__lbl">Journal Notes</span>
                  <span class="tt-mastery-card__val">${notes.length}</span>
                  <span class="tk-muted" style="font-size:11.5px">${notes.filter((n) => n.follow_up === 'Yes').length} follow-up</span>
                </div>
              </div>

              <div class="guardian-card">
                <div style="display:grid;gap:2px">
                  <span style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#85560a">Parent / Guardian Contact</span>
                  <strong style="font-size:15.5px">${st.guardian_name || 'No guardian listed'}</strong>
                  <span class="tk-muted" style="font-size:13px">${[st.guardian_email, st.phone].filter(Boolean).join(' · ') || 'No contact details on file'}</span>
                </div>
                <div class="tk-btn-row">
                  ${st.guardian_email ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-guardian" data-val="${st.guardian_email}" data-label="Guardian email">${icon('copy', { size: 13 })} Copy Email</button>` : ''}
                  ${st.phone ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-guardian" data-val="${st.phone}" data-label="Phone">${icon('phone', { size: 13 })} Copy Phone</button>` : ''}
                </div>
              </div>
              ${st.goals ? html`<div><strong style="font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--k-muted)">Learning Goals</strong><p style="margin-top:4px">${st.goals}</p></div>` : ''}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h3 class="tk-sheet__title">${icon('star', { size: 17 })} Star-Rated Student Progress Timeline</h3>
              <span class="tk-sheet__count">${notes.length}</span>
            </div>
            ${notes.length ? html`
              <div class="progress-timeline">
                ${notes.slice(0, 10).map((pn) => html`
                  <article class="progress-node" data-key="sp-${pn.id}">
                    <div class="progress-node__head">
                      <div class="tk-row__title">
                        <span class="tk-tag tk-tag--accent">${pn.area}</span>
                        ${starRating(pn.score)}
                        ${pn.follow_up === 'Yes' ? html`<span class="tk-tag tk-tag--warn">${icon('flag', { size: 11 })} Follow-Up</span>` : ''}
                      </div>
                      <div class="tk-btn-row">
                        ${pn.lesson_date ? html`<span class="tk-muted" style="font-size:12.5px">${fmtDay(pn.lesson_date)}${pn.tutor_name ? ' · ' + pn.tutor_name : ''}</span>` : ''}
                        <button type="button" class="k-btn k-btn--sm" data-action="copy-parent-lesson-update" data-note-id="${pn.id}">${icon('copy', { size: 13 })} Copy Update</button>
                      </div>
                    </div>
                    <div style="font-size:14px;line-height:1.5">${pn.notes}</div>
                    ${pn.homework ? html`<div class="homework-box"><strong>Homework / Practice:</strong> ${pn.homework}</div>` : ''}
                  </article>`)}
              </div>` : html`<p class="tk-muted" style="padding:16px">No progress notes logged yet. Complete a scheduled lesson to add the first star-rated progress entry.</p>`}
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head"><h3 class="tk-sheet__title">${icon('calendar', { size: 16 })} Lesson History</h3><span class="tk-sheet__count">${(d.lessons || []).length}</span></div>
            <div>
              ${(d.lessons || []).length ? d.lessons.slice(0, 8).map((l) => html`
                <div class="tk-row" data-key="sl-${l.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span>${fmtDay(l.lesson_date)} · ${l.start_time}</span>
                      <span class="dur-pill">${l.duration}m</span>
                      <span class="tk-tag ${l.status === 'Completed' ? 'tk-tag--ok' : 'tk-tag--info'}">${l.status}</span>
                    </div>
                    <div class="tk-row__meta"><span>${l.tutor_name}</span><span>${l.subject}</span><span>${money(l.fee_cents || 0, { currency })}</span></div>
                  </div>
                </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No lessons recorded yet.</p>`}
            </div>
          </section>` : emptyState({ iconName: 'users', title: 'Select a student', text: 'Choose a student on the left to inspect guardian contacts, goals, lessons and progress.' })}
      </div>
    </div>`;
}

export function wireStudentsActions(root, state, { draw, loadScreen, loadStudentDossier }) {
  on(root, 'input', '[data-action="student-search"]', (e, el) => { state.studentSearch = el.value; draw(); });
  on(root, 'change', '[data-action="student-subject-filter"]', (e, el) => { state.studentSubjectFilter = el.value; draw(); });

  on(root, 'click', '[data-action="select-student"]', async (e, el) => {
    try { await loadStudentDossier(Number(el.dataset.id)); draw(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-guardian"]', (e, el) => {
    copyText(el.dataset.val || '', { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Contact'} copied.` });
  });

  on(root, 'click', '[data-action="copy-parent-lesson-update"]', (e, el) => {
    const d = state.dossier;
    if (!d || !d.student) return;
    const noteId = el.dataset.noteId;
    const note = noteId
      ? (d.progressNotes || []).find((n) => String(n.id) === String(noteId))
      : (d.progressNotes || [])[0] || null;
    const msg = buildStudentParentUpdate(d.student, note, state.session.settings.business_name);
    copyText(msg, { title: `Parent Lesson Update · ${d.student.student_name}`, done: 'Parent lesson update copied!' });
  });

  on(root, 'click', '[data-action="student-new"]', async () => {
    const made = await formDialog({
      title: 'Enrol New Student',
      submitLabel: 'Enrol student',
      size: 'lg',
      fields: studentFields(),
      onSubmit: (vals) => api.post('/api/students', vals),
    });
    if (made) { state.selectedStudentId = made.student.id; toast.success(`${made.student.student_name} enrolled.`); await loadScreen('/students'); }
  });

  on(root, 'click', '[data-action="student-edit"]', async (e, el) => {
    const cur = state.dossier?.student;
    if (!cur || String(cur.id) !== el.dataset.id) return;
    const saved = await formDialog({
      title: `Edit ${cur.student_name}`,
      submitLabel: 'Save student',
      size: 'lg',
      fields: studentFields(cur),
      onSubmit: (vals) => api.put('/api/students', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Student updated.'); await loadScreen('/students'); }
  });

  on(root, 'click', '[data-action="student-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete student?', message: 'Removes this student along with their lessons, progress notes and invoices.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/students', { id: Number(el.dataset.id) }); state.selectedStudentId = null; toast.success('Student deleted.'); await loadScreen('/students'); }
    catch (err) { toastError(err); }
  });
}
