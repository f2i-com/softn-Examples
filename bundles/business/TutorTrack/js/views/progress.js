// Progress Notes & Homework Journal — Unified Oxford Navy & Gold Masthead with Mastery Score Ring,
// Subject Badges, Glowing Gold Star Ratings & 1-click Copy Parent Lesson Update.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { fmtDay, fmtDateTime } from '../../kit/time.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { subjectBadgeClass } from './schedule.js';

const AREAS = ['Technique', 'Theory', 'Confidence', 'Exam readiness', 'Homework habits'];

function scoreStars(score) {
  const s = Math.max(0, Math.min(5, Math.round(Number(score || 0))));
  return html`<span class="star-row" aria-label="Score ${s} of 5">
    ${[1, 2, 3, 4, 5].map((i) => html`<span class="${cls('star-glyph', { 'is-on': i <= s })}">★</span>`)}
    <span class="star-score-pill">${s}/5</span>
  </span>`;
}

function buildParentUpdateEmail(note, studioName) {
  const greeting = note.guardian_name ? `Hi ${note.guardian_name},` : 'Hello,';
  const subject = note.lesson_subject || note.student_subject || 'tuition';
  const lessonWhen = note.lesson_date ? ` on ${fmtDay(note.lesson_date)}` : '';
  const stars = `${'★'.repeat(Math.max(1, Math.min(5, Number(note.score || 4))))} (${note.score}/5)`;
  const lines = [
    `Subject: Lesson Update for ${note.student_name} (${subject})`,
    '',
    greeting,
    '',
    `Here is a quick update from ${note.student_name}'s ${subject} lesson${lessonWhen}${note.tutor_name ? ' with ' + note.tutor_name : ''}:`,
    '',
    `Focus Area: ${note.area} · Rating: ${stars}`,
    `Lesson Notes: ${note.notes}`,
  ];
  if (note.homework) {
    lines.push('', `Homework / Practice for Next Lesson:\n${note.homework}`);
  }
  if (note.follow_up === 'Yes') {
    lines.push('', 'Note: We have flagged a quick check-in before next lesson — feel free to reply with any questions.');
  }
  lines.push('', `Warm regards,\n${studioName}`);
  return lines.join('\n');
}

export function renderProgressView(state) {
  const rows = state.progressFilter === 'FollowUp'
    ? state.progressNotes.filter((n) => n.follow_up === 'Yes')
    : state.progressNotes;

  const avgNum = state.progressNotes.length
    ? state.progressNotes.reduce((sum, n) => sum + Number(n.score || 0), 0) / state.progressNotes.length
    : 0;
  const avgPct = Math.round((avgNum / 5) * 100);
  const followUps = state.progressNotes.filter((n) => n.follow_up === 'Yes').length;

  return html`
    <section class="tt-masthead" aria-label="Progress and Homework Journal">
      <div class="tt-masthead__copy">
        <div class="tt-masthead__eyebrow">
          ${icon('quill-scroll', { size: 12 })} TERM-BY-TERM LEARNING JOURNAL
        </div>
        <h1 class="tt-masthead__title">Progress &amp; Homework</h1>
        <div class="tt-masthead__meta">
          <span>Star-rated mastery notes</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click guardian emails</span>
        </div>
      </div>

      <div class="tt-masthead__pods" style="align-items:center">
        <div class="tt-pod tt-pod--ring tt-pod--gold" aria-label="Average mastery ${avgPct}%">
          <div class="tk-ring" style="--p:${avgPct}%;--ring-color:#ebc05a;--ring-size:48px">
            <span class="tk-ring__val">${avgPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="tt-pod__lbl">Avg Rating</span>
            <span class="tt-pod__val" style="font-size:16.5px">${avgNum ? `${avgNum.toFixed(1)}/5` : '—'}</span>
            <span class="tt-pod__sub">${state.progressNotes.length} note${state.progressNotes.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div class="${cls('tt-pod tt-pod--wide-sm', { 'tt-pod--alert': followUps > 0 })}">
          <span class="tt-pod__lbl">${icon('flag', { size: 12 })} Follow-Ups</span>
          <span class="tt-pod__val">${followUps}</span>
          <span class="tt-pod__sub">${followUps ? 'Need check-in' : 'All clear'}</span>
        </div>

        <button type="button" class="k-btn k-btn--primary" data-action="progress-new">${icon('plus', { size: 15 })} Add Note</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter progress notes">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.progressFilter === 'All' })}" data-action="progress-filter" data-filter="All">All Notes (${state.progressNotes.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.progressFilter === 'FollowUp' })}" data-action="progress-filter" data-filter="FollowUp">Follow-Up Needed (${followUps})</button>
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.progressNotes.length ? skeleton(3) : rows.length ? html`
        <div class="progress-timeline">
          ${rows.map((n) => {
            const subj = n.lesson_subject || n.student_subject;
            return html`
              <article class="progress-node" data-key="pn-${n.id}">
                <div class="progress-node__head">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <span class="tt-monogram" style="width:32px;height:32px;font-size:12px">${initials(n.student_name || 'S')}</span>
                    <div class="tk-row__title">
                      <span>${n.student_name}</span>
                      ${subj ? html`<span class="${subjectBadgeClass(subj)}">${subj}</span>` : ''}
                      <span class="tk-tag tk-tag--accent">${n.area}</span>
                      ${scoreStars(n.score)}
                      ${n.follow_up === 'Yes' ? html`<span class="tk-tag tk-tag--warn">${icon('flag', { size: 12 })} Follow-Up</span>` : ''}
                      ${n.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                  </div>
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-parent-update" data-id="${n.id}">${icon('mail', { size: 13 })} Parent Update</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="progress-del" data-id="${n.id}">Delete</button>
                  </div>
                </div>
                <div class="tk-row__meta">
                  ${n.lesson_date ? html`<span>${icon('calendar', { size: 13 })} ${fmtDay(n.lesson_date)}</span>` : html`<span>${fmtDateTime(n.created_at)}</span>`}
                  ${n.tutor_name ? html`<span>Tutor: <strong>${n.tutor_name}</strong></span>` : ''}
                  ${n.guardian_name ? html`<span>Guardian: ${n.guardian_name}</span>` : ''}
                </div>
                <div style="font-size:14px;line-height:1.52">${n.notes}</div>
                ${n.homework ? html`<div class="homework-box"><strong>Homework Assigned:</strong> ${n.homework}</div>` : ''}
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'quill-scroll', title: 'No progress notes yet', text: 'Log progress notes directly from completed lessons or using the button above.' })}
    </section>`;
}

export function wireProgressActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="progress-filter"]', (e, el) => { state.progressFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="copy-parent-update"]', (e, el) => {
    const note = state.progressNotes.find((x) => String(x.id) === el.dataset.id);
    if (!note) return;
    const text = buildParentUpdateEmail(note, state.session.settings.business_name);
    copyText(text, { title: `Parent Lesson Update · ${note.student_name}`, done: 'Parent lesson update copied!' });
  });

  on(root, 'click', '[data-action="progress-new"]', async () => {
    if (!state.students.length) { toast.error('Enrol a student first.'); return; }
    const made = await formDialog({
      title: 'Add Progress Note & Homework',
      submitLabel: 'Save note',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Student</span>
            <select class="k-input" name="student_id" required>${state.students.map((s) => html`<option value="${s.id}">${s.student_name} (${s.subject})</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Linked Lesson <span class="k-field__optional">optional</span></span>
            <select class="k-input" name="lesson_id">
              <option value="">General note</option>
              ${state.lessons.slice(0, 30).map((l) => html`<option value="${l.id}">${fmtDay(l.lesson_date)} · ${l.student_name} (${l.subject})</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Progress Area</span>
            <select class="k-input" name="area">${AREAS.map((a) => html`<option value="${a}">${a}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Star Rating (1–5)</span>
            <select class="k-input" name="score">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}" ${n === 4 ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Follow-up Needed?</span>
            <select class="k-input" name="follow_up"><option value="No">No</option><option value="Yes">Yes</option></select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Progress Notes</span>
          <textarea class="k-input" name="notes" rows="3" placeholder="What improved, milestones reached, focus points…" required></textarea>
        </label>
        <label class="k-field"><span class="k-field__label">Homework Assigned</span>
          <textarea class="k-input" name="homework" rows="2" placeholder="Practice tasks, chapters or exercises…"></textarea>
        </label>`,
      onSubmit: (vals) => api.post('/api/progress', { ...vals, lesson_id: vals.lesson_id || null }),
    });
    if (made) { toast.success('Progress note saved.'); await loadScreen('/progress'); }
  });

  on(root, 'click', '[data-action="progress-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete progress note?', message: 'Permanently delete this progress note?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/progress', { id: Number(el.dataset.id) }); toast.success('Note deleted.'); await loadScreen('/progress'); }
    catch (err) { toastError(err); }
  });
}
