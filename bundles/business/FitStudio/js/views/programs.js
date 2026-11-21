// Assessments Log (Unified Masthead with Avg Mobility Ring & Delta Pills)
// + Training Programs Builder (Unified Masthead & Obsidian-Volt Magazine Workout Cards).
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, daysBetween } from '../../kit/time.js';
import { num, initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const GOALS = ['Fat loss', 'Strength', 'Muscle gain', 'Endurance', 'Mobility', 'Rehab'];
const PROG_STATUSES = ['Draft', 'Active', 'Completed', 'Abandoned'];

function mobilityPips(score) {
  const s = Number(score || 0);
  return html`<span class="mobility-pips" aria-label="Mobility ${s} of 5">
    ${[1, 2, 3, 4, 5].map((i) => html`<span class="${cls('mobility-pip', { 'is-on': i <= s })}"></span>`)}
    <span class="tk-muted" style="font-size:12px;margin-left:4px">${s}/5</span>
  </span>`;
}

function deltaPillClass(val, { metric = 'weight', goal = '' } = {}) {
  if (val === null || val === undefined || val === 0) return 'delta-pill--subtle';
  let good = val < 0;
  if (metric === 'weight' && goal === 'Muscle gain') good = val > 0;
  return good ? 'delta-pill--good' : 'delta-pill--warn';
}

function splitTagOf(blocks) {
  const count = (blocks || []).length;
  if (!count) return 'Custom Split';
  return `${count}-Day Split`;
}

function phaseTagOf(start, end) {
  if (!start || !end) return '';
  const days = daysBetween(start, end);
  if (days <= 0) return '';
  const weeks = Math.max(1, Math.round(days / 7));
  return `${weeks}-Week Phase`;
}

export function renderAssessmentsView(state) {
  const rows = state.assessClientFilter === 'All'
    ? state.assessments
    : state.assessments.filter((a) => String(a.client_id) === String(state.assessClientFilter));

  const avgMob = state.assessments.length
    ? state.assessments.reduce((s, a) => s + Number(a.mobility_score || 0), 0) / state.assessments.length
    : 0;
  const avgMobPct = Math.round((avgMob / 5) * 100);
  const trackedClients = new Set(state.assessments.map((a) => a.client_id)).size;

  return html`
    <section class="fs-masthead" aria-label="Progress Assessments Log">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          ${icon('trending', { size: 12 })} PROGRESS CHECK-INS &amp; PR METRICS
        </div>
        <h1 class="fs-masthead__title">Assessments Log</h1>
        <div class="fs-masthead__meta">
          <span>Weight &amp; body-fat deltas</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Mobility &amp; strength PRs</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--ring fs-pod--volt" aria-label="Average mobility ${avgMobPct}%">
          <div class="tk-ring" style="--p:${avgMobPct}%;--ring-color:#a3e635;--ring-size:48px">
            <span class="tk-ring__val">${avgMobPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="fs-pod__lbl">Avg Mobility</span>
            <span class="fs-pod__val" style="font-size:16.5px">${avgMob ? num(avgMob, { decimals: 1, fixed: true }) : '—'}/5</span>
            <span class="fs-pod__sub">Movement index</span>
          </div>
        </div>
        <div class="fs-pod fs-pod--cobalt fs-pod--wide-sm">
          <span class="fs-pod__lbl">${icon('trending', { size: 12 })} Check-Ins</span>
          <span class="fs-pod__val">${state.assessments.length}</span>
          <span class="fs-pod__sub">${trackedClients} athlete${trackedClients === 1 ? '' : 's'}</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="assess-new">${icon('plus', { size: 15 })} Log Check-In</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter assessments by athlete">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.assessClientFilter === 'All' })}" data-action="assess-filter" data-id="All">All Athletes (${state.assessments.length})</button>
        ${state.clients.map((c) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': String(state.assessClientFilter) === String(c.id) })}" data-action="assess-filter" data-id="${c.id}">${c.name}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.assessments.length ? skeleton(3) : rows.length ? rows.map((a) => html`
        <div class="tk-row" data-key="as-${a.id}">
          <div style="display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1">
            <span class="fs-monogram">${initials(a.client_name || 'A')}</span>
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${a.client_name}</span>
                <span class="tk-tag">${fmtDay(a.assessment_date)}</span>
                ${a.weight_kg != null ? html`
                  <span class="tk-tag tk-tag--accent">${num(a.weight_kg, { decimals: 1, fixed: true })} kg</span>
                  ${a.weight_delta_kg !== null ? html`<span class="${cls('delta-pill', deltaPillClass(a.weight_delta_kg, { metric: 'weight', goal: a.client_goal }))}">${a.weight_delta_kg < 0 ? '↓ ' : a.weight_delta_kg > 0 ? '↑ ' : ''}${a.weight_delta_kg > 0 ? '+' : ''}${num(a.weight_delta_kg, { decimals: 1, fixed: true })} kg</span>` : ''}` : ''}
                ${a.body_fat_pct != null ? html`
                  <span class="fs-volt-tag">${num(a.body_fat_pct, { decimals: 1, fixed: true })}% BF</span>
                  ${a.body_fat_delta_pct !== null ? html`<span class="${cls('delta-pill', deltaPillClass(a.body_fat_delta_pct, { metric: 'bf', goal: a.client_goal }))}">${a.body_fat_delta_pct < 0 ? '↓ ' : a.body_fat_delta_pct > 0 ? '↑ ' : ''}${a.body_fat_delta_pct > 0 ? '+' : ''}${num(a.body_fat_delta_pct, { decimals: 1, fixed: true })}%</span>` : ''}` : ''}
                ${mobilityPips(a.mobility_score)}
                ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              ${a.strength_notes ? html`<div style="font-size:13.5px;margin-top:3px"><strong>Strength PRs:</strong> ${a.strength_notes}</div>` : ''}
              ${a.coach_notes ? html`<div class="tk-muted" style="font-size:13px"><strong>Coach Notes:</strong> ${a.coach_notes}</div>` : ''}
            </div>
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--sm" data-action="print-assess" data-id="${a.id}">${icon('printer', { size: 14 })} Report</button>
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="assess-del" data-id="${a.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'trending', title: 'No assessments logged yet', text: 'Record a client check-in to begin tracking body-composition deltas.' })}
    </section>`;
}

function serializeBlocksText(blocks) {
  return (blocks || []).map((b) => `${b.day}\n${b.exercises || ''}`).join('\n---\n');
}

function parseBlocksText(raw) {
  const chunks = String(raw || '').split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((chunk, idx) => {
    const lines = chunk.split('\n');
    const title = lines[0].trim() || `Day ${idx + 1}`;
    const body = lines.slice(1).join('\n').trim();
    return { day: title, exercises: body };
  });
}

function programFields(state, p = {}) {
  const defaultBlocks = p.blocks && p.blocks.length
    ? serializeBlocksText(p.blocks)
    : 'Day 1 — Lower Strength\nBack Squat 4x6 @ RPE 8\nRomanian Deadlift 3x8\nWalking Lunges 3x10/leg\n---\nDay 2 — Upper Push & Pull\nBench Press 4x6\nSingle-Arm DB Row 4x10\nOverhead Press 3x8';
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client</span>
        <select class="k-input" name="client_id" required>
          <option value="">Select client…</option>
          ${state.clients.map((c) => html`<option value="${c.id}" ${Number(p.client_id) === c.id ? 'selected' : ''}>${c.name}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Program Name</span>
        <input class="k-input" name="program_name" value="${p.program_name || ''}" placeholder="e.g. 12-Week Strength Base" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Goal</span>
        <select class="k-input" name="goal">${GOALS.map((g) => html`<option value="${g}" ${g === (p.goal || 'Strength') ? 'selected' : ''}>${g}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${PROG_STATUSES.map((st) => html`<option value="${st}" ${st === (p.status || 'Active') ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Start Date</span><input class="k-input" type="date" name="start_date" value="${p.start_date || today()}"></label>
      <label class="k-field"><span class="k-field__label">End Date</span><input class="k-input" type="date" name="end_date" value="${p.end_date || addDays(today(), 56)}"></label>
    </div>
    <label class="k-field">
      <span class="k-field__label">Workout Blocks (separate days with <code>---</code> on its own line)</span>
      <textarea class="k-input tk-mono" name="blocks_text" rows="8">${defaultBlocks}</textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Progression &amp; Coaching Notes</span>
      <textarea class="k-input" name="program_notes" rows="2" placeholder="Weekly split, RPE targets, deload notes…">${p.program_notes || ''}</textarea>
    </label>`;
}

function buildPlanPlainText(p, studioName) {
  const phase = phaseTagOf(p.start_date, p.end_date);
  const split = splitTagOf(p.blocks);
  const lines = [
    `${studioName} — TRAINING PROGRAM PLAN`,
    `Client: ${p.client_name}`,
    `Program: ${p.program_name} · ${p.goal} · ${split}${phase ? ' · ' + phase : ''}`,
    p.start_date ? `Schedule: ${fmtDay(p.start_date)}${p.end_date ? ' – ' + fmtDay(p.end_date) : ''}` : '',
    '',
  ].filter((x) => x !== '');
  for (const blk of p.blocks || []) {
    lines.push(`=== ${blk.day} ===`);
    if (blk.exercises) lines.push(blk.exercises);
    lines.push('');
  }
  if (p.program_notes) lines.push(`Coach Notes: ${p.program_notes}`);
  return lines.join('\n').trim();
}

export function renderProgramsView(state) {
  const q = (state.programSearch || '').trim().toLowerCase();
  const rows = state.programs.filter((p) => {
    if (state.programStatusFilter !== 'All' && p.status !== state.programStatusFilter) return false;
    if (q) {
      const hay = `${p.program_name || ''} ${p.client_name || ''} ${p.goal || ''} ${p.program_notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeCount = state.programs.filter((p) => p.status === 'Active').length;
  const totalBlocks = state.programs.reduce((s, p) => s + (p.blocks || []).length, 0);

  return html`
    <section class="fs-masthead" aria-label="Training Programs Builder">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          ${icon('zap', { size: 12 })} STRUCTURED TRAINING BLOCKS
        </div>
        <h1 class="fs-masthead__title">Training Programs</h1>
        <div class="fs-masthead__meta">
          <span>Multi-day workout blocks</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click Copy Plan</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--volt">
          <span class="fs-pod__lbl">${icon('zap', { size: 12 })} Active</span>
          <span class="fs-pod__val">${activeCount}/${state.programs.length}</span>
          <span class="fs-pod__sub">Running blocks</span>
        </div>
        <div class="fs-pod fs-pod--cobalt">
          <span class="fs-pod__lbl">${icon('kettlebell', { size: 12 })} Workouts</span>
          <span class="fs-pod__val">${totalBlocks}</span>
          <span class="fs-pod__sub">Training days</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="prog-new">${icon('plus', { size: 15 })} New Program</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}
        <input type="search" data-action="prog-search" value="${state.programSearch}" placeholder="Search program, athlete or goal…">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter programs by status">
        ${['All', 'Active', 'Draft', 'Completed'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.programStatusFilter === st })}" data-action="prog-filter" data-status="${st}">${st}</button>`)}
      </div>
    </div>

    ${state.loading && !state.programs.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((p) => {
          const splitTag = splitTagOf(p.blocks);
          const phaseTag = phaseTagOf(p.start_date, p.end_date);
          return html`
            <article class="prog-card" data-key="pg-${p.id}">
              <div class="prog-card__head">
                <div class="prog-card__title-wrap">
                  <div class="prog-card__title">
                    ${icon('zap', { size: 18 })}
                    <span>${p.program_name}</span>
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="prog-card__tags">
                    <span class="prog-split-tag">${splitTag}</span>
                    ${phaseTag ? html`<span class="prog-phase-tag">${phaseTag}</span>` : ''}
                    <span class="fs-volt-tag">${p.goal}</span>
                    <span class="tk-tag ${p.status === 'Active' ? 'tk-tag--ok' : p.status === 'Completed' ? 'tk-tag--info' : ''}">${p.status}</span>
                  </div>
                </div>
                <div class="tk-sheet__actions">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prog-copy" data-id="${p.id}">${icon('copy', { size: 14 })} Copy Plan</button>
                  <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="prog-print" data-id="${p.id}">${icon('printer', { size: 14 })} Print</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prog-edit" data-id="${p.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prog-del" data-id="${p.id}">Delete</button>
                </div>
              </div>
              <div class="prog-card__body">
                <div class="prog-card__meta">
                  <span>Athlete: <strong style="color:var(--k-text)">${p.client_name}</strong></span>
                  ${p.start_date ? html`<span>${icon('calendar', { size: 13 })} ${fmtDay(p.start_date)}${p.end_date ? ' – ' + fmtDay(p.end_date) : ''}</span>` : ''}
                  ${p.program_notes ? html`<span><strong>Notes:</strong> ${p.program_notes}</span>` : ''}
                </div>
                <div class="workout-blocks-grid">
                  ${(p.blocks || []).map((b, idx) => {
                    const exCount = String(b.exercises || '').split('\n').map((l) => l.trim()).filter(Boolean).length;
                    return html`
                      <div class="workout-block">
                        <div class="workout-block__head">
                          <span class="workout-block__day">${b.day}</span>
                          <span class="workout-block__badge">D${idx + 1} · ${exCount} EX</span>
                        </div>
                        <div class="workout-block__ex">${b.exercises}</div>
                      </div>`;
                  })}
                </div>
              </div>
            </article>`;
        }) : html`<section class="tk-sheet">${emptyState({ iconName: 'zap', title: 'No training programs yet', text: 'Create a structured program with workout blocks to share with your clients.' })}</section>`}
      </div>`}`;
}

export function wireProgramsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="assess-filter"]', (e, el) => { state.assessClientFilter = el.dataset.id; draw(); });
  on(root, 'click', '[data-action="prog-filter"]', (e, el) => { state.programStatusFilter = el.dataset.status; draw(); });
  on(root, 'input', '[data-action="prog-search"]', (e, el) => { state.programSearch = el.value; draw(); });

  on(root, 'click', '[data-action="assess-new"]', async () => {
    if (!state.clients.length) { toast.error('Add a client first.'); return; }
    const made = await formDialog({
      title: 'Log Client Assessment',
      submitLabel: 'Save assessment',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span>
            <select class="k-input" name="client_id" required>
              ${state.clients.map((c) => html`<option value="${c.id}">${c.name}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="assessment_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Weight (kg)</span><input class="k-input" type="number" step="0.1" min="20" max="350" name="weight_kg" placeholder="78.5"></label>
          <label class="k-field"><span class="k-field__label">Body Fat (%)</span><input class="k-input" type="number" step="0.1" min="2" max="70" name="body_fat_pct" placeholder="19.0"></label>
          <label class="k-field"><span class="k-field__label">Mobility (1–5)</span>
            <select class="k-input" name="mobility_score">${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} / 5</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Strength Notes</span><textarea class="k-input" name="strength_notes" rows="2" placeholder="Lifts, reps and loads…"></textarea></label>
        <label class="k-field"><span class="k-field__label">Coach Notes</span><textarea class="k-input" name="coach_notes" rows="2" placeholder="Key wins and adjustments…"></textarea></label>`,
      onSubmit: (vals) => api.post('/api/assessments', vals),
    });
    if (made) { toast.success('Assessment recorded.'); await loadScreen('/assessments'); }
  });

  on(root, 'click', '[data-action="assess-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete assessment?', message: 'Remove this check-in from history?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/assessments', { id: Number(el.dataset.id) }); toast.success('Assessment removed.'); await loadScreen('/assessments'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-assess"]', (e, el) => {
    const a = state.assessments.find((x) => String(x.id) === el.dataset.id);
    if (!a) return;
    downloadHtmlDoc(`assessment-${a.assessment_date}-${a.id}.html`, {
      title: `Progress Check-In · ${fmtDay(a.assessment_date)}`,
      businessName: state.session.settings.business_name,
      subtitle: `Client: ${a.client_name}`,
      accent: '#1d4ed8',
      bodyHtml: `<table>
        <tr><th>Weight</th><td class="num">${a.weight_kg != null ? esc(String(a.weight_kg)) + ' kg' : '—'}</td></tr>
        <tr><th>Body Fat</th><td class="num">${a.body_fat_pct != null ? esc(String(a.body_fat_pct)) + '%' : '—'}</td></tr>
        <tr><th>Mobility Rating</th><td class="num">${esc(String(a.mobility_score))} / 5</td></tr>
      </table>
      <div class="box"><strong>Strength Notes</strong><p>${esc(a.strength_notes || '—')}</p></div>
      <div class="box"><strong>Coach Notes</strong><p>${esc(a.coach_notes || '—')}</p></div>`,
    });
  });

  on(root, 'click', '[data-action="prog-new"]', async () => {
    if (!state.clients.length) { toast.error('Add a client first.'); return; }
    const made = await formDialog({
      title: 'Create Training Program',
      submitLabel: 'Save program',
      size: 'lg',
      fields: programFields(state),
      onSubmit: (vals) => api.post('/api/programs', { ...vals, blocks: parseBlocksText(vals.blocks_text) }),
    });
    if (made) { toast.success('Training program saved.'); await loadScreen('/programs'); }
  });

  on(root, 'click', '[data-action="prog-edit"]', async (e, el) => {
    const cur = state.programs.find((x) => String(x.id) === el.dataset.id);
    if (!cur) return;
    const saved = await formDialog({
      title: `Edit ${cur.program_name}`,
      submitLabel: 'Save program',
      size: 'lg',
      fields: programFields(state, cur),
      onSubmit: (vals) => api.put('/api/programs', { ...vals, id: cur.id, blocks: parseBlocksText(vals.blocks_text) }),
    });
    if (saved) { toast.success('Program updated.'); await loadScreen('/programs'); }
  });

  on(root, 'click', '[data-action="prog-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete program?', message: 'Remove this training program?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/programs', { id: Number(el.dataset.id) }); toast.success('Program deleted.'); await loadScreen('/programs'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prog-copy"]', (e, el) => {
    const p = state.programs.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    copyText(buildPlanPlainText(p, state.session.settings.business_name), { title: 'Copy Program Plan', done: 'Program plan copied for client!' });
  });

  on(root, 'click', '[data-action="prog-print"]', (e, el) => {
    const p = state.programs.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const blocksHtml = (p.blocks || []).map((b) => `<div class="box"><strong>${esc(b.day)}</strong><pre style="font-family:inherit;white-space:pre-wrap;margin:6px 0 0">${esc(b.exercises || '')}</pre></div>`).join('');
    downloadHtmlDoc(`workout-plan-${p.id}.html`, {
      title: p.program_name,
      businessName: state.session.settings.business_name,
      subtitle: `${p.client_name} · Goal: ${p.goal}${p.start_date ? ' · ' + fmtDay(p.start_date) + ' – ' + fmtDay(p.end_date) : ''}`,
      accent: '#1d4ed8',
      bodyHtml: `${blocksHtml}${p.program_notes ? `<div class="box"><strong>Coach Notes</strong><p>${esc(p.program_notes)}</p></div>` : ''}`,
    });
  });
}
