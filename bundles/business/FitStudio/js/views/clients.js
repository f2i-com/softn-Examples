// Client Roster & Progress Dossier — Unified Obsidian-Cobalt-Volt Masthead, Monogrammed Athlete Cards,
// Bold Medical Caution Banners, Body-Comp Delta Cards & Active Program Plan Copy.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay, daysBetween } from '../../kit/time.js';
import { initials, money, num } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const GOALS = ['Fat loss', 'Strength', 'Muscle gain', 'Endurance', 'Mobility', 'Rehab'];
const CLIENT_STATUSES = ['Active', 'Trial', 'Paused', 'Finished'];

function round1(v) {
  return Math.round(v * 10) / 10;
}

function deltaPillSpec(val, unit, { metric = 'weight', goal = '', refLabel = 'vs prev' } = {}) {
  if (val === null || val === undefined) {
    return { clsName: 'delta-pill--flat', text: 'Baseline check-in', shortText: '' };
  }
  const signed = `${val > 0 ? '+' : ''}${num(val, { decimals: 1, fixed: true })}${unit === '%' ? '%' : ' ' + unit}`;
  if (val === 0) {
    return { clsName: 'delta-pill--flat', text: `0.0${unit === '%' ? '%' : ' ' + unit} ${refLabel}`, shortText: `0.0${unit === '%' ? '%' : ' ' + unit}` };
  }
  const arrow = val < 0 ? '↓' : '↑';
  let isPositive = val < 0;
  if (metric === 'weight' && goal === 'Muscle gain') isPositive = val > 0;
  if (metric === 'mobility') isPositive = val > 0;
  return {
    clsName: isPositive ? 'delta-pill--good' : 'delta-pill--warn',
    text: `${arrow} ${signed} ${refLabel}`,
    shortText: `${arrow} ${signed}`,
  };
}

function splitTagOf(blocks) {
  const count = (blocks || []).length;
  if (!count) return 'Custom Plan';
  return `${count}-Day Split`;
}

function phaseTagOf(start, end) {
  if (!start || !end) return '';
  const days = daysBetween(start, end);
  if (days <= 0) return '';
  const weeks = Math.max(1, Math.round(days / 7));
  return `${weeks}-Week Block`;
}

function buildPlanPlainText(p, clientName, studioName) {
  const lines = [
    `${studioName} — TRAINING PROGRAM PLAN`,
    `Client: ${clientName || p.client_name || ''}`,
    `Program: ${p.program_name} (${p.goal})`,
    p.start_date ? `Block: ${fmtDay(p.start_date)}${p.end_date ? ' – ' + fmtDay(p.end_date) : ''}` : '',
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

function clientFields(c = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client Name</span>
        <input class="k-input" name="name" value="${c.name || ''}" placeholder="Full name" required>
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">
          ${CLIENT_STATUSES.map((st) => html`<option value="${st}" ${st === (c.status || 'Active') ? 'selected' : ''}>${st}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Fitness Goal</span>
        <select class="k-input" name="goal">
          ${GOALS.map((g) => html`<option value="${g}" ${g === (c.goal || 'Strength') ? 'selected' : ''}>${g}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Phone</span>
        <input class="k-input" name="phone" value="${c.phone || ''}" placeholder="0412 345 678">
      </label>
      <label class="k-field"><span class="k-field__label">Email</span>
        <input class="k-input" type="email" name="email" value="${c.email || ''}" placeholder="athlete@example.com">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Medical Notes &amp; Injury Cautions <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="medical_notes" rows="2" placeholder="Injuries, surgeries, medications or movement restrictions the coach must know…">${c.medical_notes || ''}</textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Emergency Contact</span>
      <input class="k-input" name="emergency_contact" value="${c.emergency_contact || ''}" placeholder="Name and phone number">
    </label>`;
}

export function renderClientsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.clientSearch.trim().toLowerCase();
  const list = state.clients.filter((c) => {
    if (state.clientStatusFilter !== 'All' && c.status !== state.clientStatusFilter) return false;
    if (q && !c.name.toLowerCase().includes(q) && !(c.goal || '').toLowerCase().includes(q) && !(c.medical_notes || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const activeCount = state.clients.filter((c) => c.status === 'Active' || c.status === 'Trial').length;
  const cautionCount = state.clients.filter((c) => (c.medical_notes || '').trim()).length;
  const withProgCount = state.clients.filter((c) => c.active_program).length;

  const d = state.dossier;
  const cl = d ? d.client : null;
  const prog = d ? d.progress : null;
  const assessments = d && d.assessments ? d.assessments : [];
  const startAssess = assessments.length > 2 ? assessments[assessments.length - 1] : null;
  const startWeightDelta = (startAssess && prog?.latest_weight_kg != null && startAssess.weight_kg != null)
    ? round1(Number(prog.latest_weight_kg) - Number(startAssess.weight_kg))
    : null;
  const startBfDelta = (startAssess && prog?.latest_body_fat_pct != null && startAssess.body_fat_pct != null)
    ? round1(Number(prog.latest_body_fat_pct) - Number(startAssess.body_fat_pct))
    : null;

  const activeProgram = d && d.programs ? d.programs.find((p) => p.status === 'Active') || d.programs[0] : null;

  const wSpec = cl ? deltaPillSpec(prog?.weight_delta_kg, 'kg', { metric: 'weight', goal: cl.goal, refLabel: 'vs prev' }) : null;
  const bfSpec = cl ? deltaPillSpec(prog?.body_fat_delta_pct, '%', { metric: 'bf', goal: cl.goal, refLabel: 'vs prev' }) : null;
  const mobSpec = cl ? deltaPillSpec(prog?.mobility_delta, 'pts', { metric: 'mobility', goal: cl.goal, refLabel: 'vs prev' }) : null;
  const wStartSpec = (cl && startWeightDelta !== null) ? deltaPillSpec(startWeightDelta, 'kg', { metric: 'weight', goal: cl.goal, refLabel: 'vs start' }) : null;
  const bfStartSpec = (cl && startBfDelta !== null) ? deltaPillSpec(startBfDelta, '%', { metric: 'bf', goal: cl.goal, refLabel: 'vs start' }) : null;

  return html`
    <section class="fs-masthead" aria-label="Athletes and Coaching Profiles">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          ${icon('users', { size: 12 })} ATHLETES &amp; PROGRESS DOSSIERS
        </div>
        <h1 class="fs-masthead__title">Clients Roster</h1>
        <div class="fs-masthead__meta">
          <span>Body-comp delta cards</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Medical cautions &amp; plans</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--volt">
          <span class="fs-pod__lbl">${icon('users', { size: 12 })} Active</span>
          <span class="fs-pod__val">${activeCount}/${state.clients.length}</span>
          <span class="fs-pod__sub">Training roster</span>
        </div>
        <div class="fs-pod fs-pod--cobalt">
          <span class="fs-pod__lbl">${icon('zap', { size: 12 })} On Program</span>
          <span class="fs-pod__val">${withProgCount}</span>
          <span class="fs-pod__sub">Active splits</span>
        </div>
        <div class="${cls('fs-pod fs-pod--wide-sm', { 'fs-pod--alert': cautionCount > 0 })}">
          <span class="fs-pod__lbl">${icon('alert', { size: 12 })} Cautions</span>
          <span class="fs-pod__val">${cautionCount}</span>
          <span class="fs-pod__sub">Injury flags</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="client-new">${icon('plus', { size: 15 })} Add Client</button>
      </div>
    </section>

    <div class="fs-dossier-grid">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Roster</h2>
          <span class="tk-sheet__count">${list.length}</span>
        </div>
        <div style="padding:10px 12px;border-bottom:1px solid var(--k-border);display:grid;gap:8px">
          <label class="tk-search" style="max-width:none">${icon('search', { size: 15 })}
            <input type="search" data-action="client-search" value="${state.clientSearch}" placeholder="Search client, goal or caution…">
          </label>
          <div class="tk-segmented" style="width:100%;justify-content:space-between">
            ${['All', 'Active', 'Trial', 'Paused'].map((st) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.clientStatusFilter === st })}" style="flex:1;justify-content:center" data-action="client-status-filter" data-status="${st}">${st}</button>`)}
          </div>
        </div>
        <div class="fs-roster-scroll">
          ${state.loading && !state.clients.length ? skeleton(4) : list.length ? list.map((c) => {
            const p = c.progress || {};
            const rw = p.weight_delta_kg !== null && p.weight_delta_kg !== undefined
              ? deltaPillSpec(p.weight_delta_kg, 'kg', { metric: 'weight', goal: c.goal })
              : null;
            const rbf = p.body_fat_delta_pct !== null && p.body_fat_delta_pct !== undefined
              ? deltaPillSpec(p.body_fat_delta_pct, '%', { metric: 'bf', goal: c.goal })
              : null;
            return html`
              <button type="button" class="${cls('client-pick', { 'is-on': state.selectedClientId === c.id })}" data-key="cl-${c.id}" data-action="select-client" data-id="${c.id}">
                <span class="fs-monogram">${initials(c.name)}</span>
                <span style="min-width:0;flex:1;display:grid;gap:4px">
                  <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:750;font-size:14.5px">
                    <span>${c.name}</span>
                    ${c.medical_notes ? html`<span class="tk-tag tk-tag--bad" style="padding:1px 6px;font-size:10.5px">${icon('alert', { size: 11 })} Caution</span>` : ''}
                  </span>
                  <span class="tk-muted" style="display:block;font-size:12px">${c.goal} · ${c.status}${c.completed_sessions ? ` · ${c.completed_sessions} done` : ''}</span>
                  ${(rw || rbf) ? html`
                    <span style="display:flex;flex-wrap:wrap;gap:4px">
                      ${rw ? html`<span class="${cls('delta-pill', rw.clsName)}" style="padding:1px 7px;font-size:11px">${rw.shortText}</span>` : ''}
                      ${rbf ? html`<span class="${cls('delta-pill', rbf.clsName)}" style="padding:1px 7px;font-size:11px">${rbf.shortText} BF</span>` : ''}
                    </span>` : ''}
                </span>
              </button>`;
          }) : emptyState({ iconName: 'users', title: 'No clients found', text: 'Add a client to track sessions, assessments and programs.' })}
        </div>
      </section>

      <div class="tk-stack">
        ${state.loading && !cl ? html`<section class="tk-sheet">${skeleton(3)}</section>` : cl ? html`
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <span class="fs-monogram">${initials(cl.name)}</span>
                <h2 class="tk-sheet__title">${cl.name} <span class="fs-volt-tag">${cl.goal}</span> <span class="tk-tag ${cl.status === 'Active' ? 'tk-tag--ok' : 'tk-tag--warn'}">${cl.status}</span></h2>
              </div>
              <div class="tk-sheet__actions">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="quick-assess" data-id="${cl.id}">${icon('trending', { size: 14 })} Log Check-In</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-edit" data-id="${cl.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="client-del" data-id="${cl.id}">Delete</button>
              </div>
            </div>
            <div class="tk-sheet__body tk-stack">
              ${cl.medical_notes ? html`
                <div class="medical-alert" role="alert">
                  <div class="medical-alert__head">
                    <span class="medical-alert__badge">${icon('alert', { size: 12 })} CAUTION</span>
                    <span>Medical &amp; Movement Restriction</span>
                  </div>
                  <div class="medical-alert__body">${cl.medical_notes}</div>
                </div>` : ''}

              <div class="tk-kv">
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Phone</span>
                  <span class="tk-kv__v">${cl.phone || '—'} ${cl.phone ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" style="min-height:24px;padding:0 6px" data-action="copy-text" data-val="${cl.phone}" data-label="Phone">${icon('copy', { size: 12 })}</button>` : ''}</span>
                </div>
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Email</span>
                  <span class="tk-kv__v">${cl.email || '—'} ${cl.email ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" style="min-height:24px;padding:0 6px" data-action="copy-text" data-val="${cl.email}" data-label="Email">${icon('copy', { size: 12 })}</button>` : ''}</span>
                </div>
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Emergency Contact</span>
                  <span class="tk-kv__v">${cl.emergency_contact || '—'}</span>
                </div>
              </div>

              <div>
                <div style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--k-muted);margin-bottom:10px">
                  Body-Composition Progress Cards ${prog?.latest_date ? `· Latest Check-In ${fmtDay(prog.latest_date)}` : ''}
                </div>
                <div class="delta-grid">
                  <div class="delta-card">
                    <div class="delta-card__band">
                      <span class="delta-card__lbl">${icon('trending', { size: 13 })} Body Weight</span>
                      ${prog?.prev_weight_kg != null ? html`<span class="delta-card__prev">Prev ${num(prog.prev_weight_kg, { decimals: 1, fixed: true })} kg</span>` : ''}
                    </div>
                    <div class="delta-card__body">
                      <span class="delta-card__val">${prog?.latest_weight_kg != null ? `${num(prog.latest_weight_kg, { decimals: 1, fixed: true })} kg` : '—'}</span>
                      <div class="delta-card__pills">
                        <span class="${cls('delta-pill', wSpec.clsName)}">${wSpec.text}</span>
                        ${wStartSpec ? html`<span class="${cls('delta-pill', wStartSpec.clsName)}">${wStartSpec.text}</span>` : ''}
                      </div>
                    </div>
                  </div>

                  <div class="delta-card">
                    <div class="delta-card__band">
                      <span class="delta-card__lbl">${icon('zap', { size: 13 })} Body Fat %</span>
                      ${prog?.prev_body_fat_pct != null ? html`<span class="delta-card__prev">Prev ${num(prog.prev_body_fat_pct, { decimals: 1, fixed: true })}%</span>` : ''}
                    </div>
                    <div class="delta-card__body">
                      <span class="delta-card__val">${prog?.latest_body_fat_pct != null ? `${num(prog.latest_body_fat_pct, { decimals: 1, fixed: true })}%` : '—'}</span>
                      <div class="delta-card__pills">
                        <span class="${cls('delta-pill', bfSpec.clsName)}">${bfSpec.text}</span>
                        ${bfStartSpec ? html`<span class="${cls('delta-pill', bfStartSpec.clsName)}">${bfStartSpec.text}</span>` : ''}
                      </div>
                    </div>
                  </div>

                  <div class="delta-card">
                    <div class="delta-card__band">
                      <span class="delta-card__lbl">${icon('shield', { size: 13 })} Mobility Rating</span>
                    </div>
                    <div class="delta-card__body">
                      <span class="delta-card__val">${prog?.latest_mobility_score ? `${prog.latest_mobility_score} / 5` : '—'}</span>
                      <div class="delta-card__pills">
                        <span class="${cls('delta-pill', mobSpec.clsName)}">${mobSpec.text}</span>
                        ${prog?.latest_mobility_score ? html`
                          <span class="mobility-pips" aria-hidden="true">
                            ${[1, 2, 3, 4, 5].map((n) => html`<span class="${cls('mobility-pip', { 'is-on': n <= Number(prog.latest_mobility_score) })}"></span>`)}
                          </span>` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h3 class="tk-sheet__title">${icon('zap', { size: 17 })} Active Training Program</h3>
              <div class="tk-sheet__actions">
                ${activeProgram ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="dossier-copy-plan">${icon('copy', { size: 14 })} Copy Plan</button>` : ''}
                <a href="#/programs" class="k-btn k-btn--ghost k-btn--sm">All Programs</a>
              </div>
            </div>
            <div class="tk-sheet__body">
              ${activeProgram ? html`
                <div class="tk-stack">
                  <div class="tk-row__title">
                    <span>${activeProgram.program_name}</span>
                    <span class="prog-split-tag">${splitTagOf(activeProgram.blocks)}</span>
                    ${phaseTagOf(activeProgram.start_date, activeProgram.end_date) ? html`<span class="tk-tag tk-tag--info">${phaseTagOf(activeProgram.start_date, activeProgram.end_date)}</span>` : ''}
                    <span class="tk-tag tk-tag--ok">${activeProgram.status}</span>
                    <span class="fs-volt-tag">${activeProgram.goal}</span>
                  </div>
                  ${activeProgram.program_notes ? html`<p class="tk-muted" style="font-size:13.5px">${activeProgram.program_notes}</p>` : ''}
                  <div class="workout-blocks-grid">
                    ${(activeProgram.blocks || []).map((b, idx) => html`
                      <div class="workout-block">
                        <div class="workout-block__head">
                          <span class="workout-block__day">${b.day}</span>
                          <span class="workout-block__badge">BLOCK ${idx + 1}</span>
                        </div>
                        <div class="workout-block__ex">${b.exercises}</div>
                      </div>`)}
                  </div>
                </div>` : html`<p class="tk-muted">No training program assigned yet. Build one under Programs.</p>`}
            </div>
          </section>

          <div class="tk-grid-even">
            <section class="tk-sheet">
              <div class="tk-sheet__head"><h3 class="tk-sheet__title">${icon('barbell', { size: 16 })} Recent Sessions</h3><span class="tk-sheet__count">${(d.sessions || []).length}</span></div>
              <div>
                ${(d.sessions || []).length ? d.sessions.slice(0, 6).map((s) => html`
                  <div class="tk-row" data-key="ds-${s.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title"><span>${fmtDay(s.session_date)} · ${s.session_time}</span><span class="tk-tag tk-tag--accent">${s.session_type}</span><span class="tk-tag">${s.status}</span></div>
                      <div class="tk-row__meta"><span>${s.trainer_name}</span><span>${money(s.fee_cents || 0, { currency })}</span></div>
                    </div>
                  </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No sessions logged yet.</p>`}
              </div>
            </section>
            <section class="tk-sheet">
              <div class="tk-sheet__head"><h3 class="tk-sheet__title">${icon('dollar', { size: 16 })} Payments &amp; Packs</h3><span class="tk-sheet__count">${(d.payments || []).length}</span></div>
              <div>
                ${(d.payments || []).length ? d.payments.slice(0, 6).map((py) => html`
                  <div class="tk-row" data-key="dp-${py.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title"><span>${py.payment_type}</span><strong>${money(py.amount_cents, { currency })}</strong><span class="tk-tag ${py.status === 'Paid' ? 'tk-tag--ok' : py.status === 'Pending' ? 'tk-tag--warn' : 'tk-tag--bad'}">${py.status}</span></div>
                      <div class="tk-row__meta"><span>${fmtDay(py.payment_date)}</span>${py.notes ? html`<span>${py.notes}</span>` : ''}</div>
                    </div>
                  </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No payments recorded yet.</p>`}
              </div>
            </section>
          </div>` : emptyState({ iconName: 'users', title: 'Select a client', text: 'Pick an athlete from the roster to open their progress dossier.' })}
      </div>
    </div>`;
}

export function wireClientsActions(root, state, { draw, loadScreen, loadClientDossier }) {
  on(root, 'input', '[data-action="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });
  on(root, 'click', '[data-action="client-status-filter"]', (e, el) => { state.clientStatusFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="select-client"]', async (e, el) => {
    try { await loadClientDossier(Number(el.dataset.id)); draw(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-text"]', (e, el) => {
    copyText(el.dataset.val || '', { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Value'} copied.` });
  });

  on(root, 'click', '[data-action="dossier-copy-plan"]', () => {
    const d = state.dossier;
    if (!d || !d.programs || !d.programs.length) return;
    const active = d.programs.find((p) => p.status === 'Active') || d.programs[0];
    copyText(buildPlanPlainText(active, d.client?.name, state.session.settings.business_name), {
      title: 'Copy Program Plan',
      done: 'Program plan copied for client.',
    });
  });

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({
      title: 'Add Coaching Client',
      submitLabel: 'Add client',
      size: 'lg',
      fields: clientFields(),
      onSubmit: (vals) => api.post('/api/clients', vals),
    });
    if (made) { state.selectedClientId = made.client.id; toast.success(`${made.client.name} added.`); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const cur = state.dossier?.client;
    if (!cur || String(cur.id) !== el.dataset.id) return;
    const saved = await formDialog({
      title: `Edit ${cur.name}`,
      submitLabel: 'Save client',
      size: 'lg',
      fields: clientFields(cur),
      onSubmit: (vals) => api.put('/api/clients', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Client updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client?', message: 'Deletes this client and their sessions, assessments, programs and payment history.', confirmLabel: 'Delete client', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); state.selectedClientId = null; toast.success('Client deleted.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="quick-assess"]', async (e, el) => {
    const clientId = Number(el.dataset.id);
    const made = await formDialog({
      title: 'Log Progress Assessment',
      submitLabel: 'Save check-in',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="assessment_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Weight (kg)</span><input class="k-input" type="number" step="0.1" min="20" max="350" name="weight_kg" placeholder="82.5"></label>
          <label class="k-field"><span class="k-field__label">Body Fat (%)</span><input class="k-input" type="number" step="0.1" min="2" max="70" name="body_fat_pct" placeholder="18.5"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Mobility Score (1–5)</span>
          <select class="k-input" name="mobility_score">
            ${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} / 5</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Strength Notes</span><textarea class="k-input" name="strength_notes" rows="2" placeholder="Key lifts, reps and loads…"></textarea></label>
        <label class="k-field"><span class="k-field__label">Coach Notes</span><textarea class="k-input" name="coach_notes" rows="2" placeholder="Wins and next block adjustments…"></textarea></label>`,
      onSubmit: (vals) => api.post('/api/assessments', { ...vals, client_id: clientId }),
    });
    if (made) { toast.success('Assessment logged & deltas updated.'); await loadScreen('/clients'); }
  });
}
