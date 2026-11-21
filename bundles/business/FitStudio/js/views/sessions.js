// Coach's Session Board — Athletic Obsidian-Lime-Cobalt Masthead with Today Completion Ring,
// Two-Column Session Schedule (with Capacity Bars & Inline Medical Cautions) + Sticky PR/Attendance & Programs Rail.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDayNear, fmtDay } from '../../kit/time.js';
import { money, num } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const SESSION_TYPES = ['1-on-1', 'Small Group', 'Rehab', 'Assessment', 'Nutrition'];
const STATUS_TAG = {
  Scheduled: 'tk-tag--info',
  'Checked In': 'fs-volt-tag',
  Completed: 'tk-tag--ok',
  'No-Show': 'tk-tag--bad',
  Cancelled: 'tk-tag--bad',
};
const CARD_TONE = {
  'Checked In': 'session-card--checked-in',
  Completed: 'session-card--completed',
  'No-Show': 'session-card--no-show',
  Cancelled: 'session-card--cancelled',
};

function sessionCapInfo(s) {
  const isGroup = s.session_type === 'Small Group';
  const filled = s.status === 'Completed' || s.status === 'Checked In' ? (isGroup ? 4 : 1) : (isGroup ? 3 : 1);
  const max = isGroup ? 4 : 1;
  const pct = Math.round((filled / max) * 100);
  return { label: isGroup ? `${filled}/${max} squad` : '1/1 PT', pct };
}

function sessionFields(state, s = {}) {
  const activeTrainers = state.trainers.filter((tr) => tr.active === 'Active' || tr.id === s.trainer_id);
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client</span>
        <select class="k-input" name="client_id" required>
          <option value="">Select client…</option>
          ${state.clients.map((c) => html`<option value="${c.id}" ${Number(s.client_id) === c.id ? 'selected' : ''}>${c.name} (${c.goal})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Trainer / Coach</span>
        <select class="k-input" name="trainer_id" required>
          <option value="">Select coach…</option>
          ${activeTrainers.map((tr) => html`<option value="${tr.id}" ${Number(s.trainer_id) === tr.id ? 'selected' : ''}>${tr.name} · ${tr.role}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Session Date</span>
        <input class="k-input" type="date" name="session_date" value="${s.session_date || today()}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Time</span>
        <input class="k-input" type="time" name="session_time" value="${s.session_time || '08:00'}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Type</span>
        <select class="k-input" name="session_type">
          ${SESSION_TYPES.map((tp) => html`<option value="${tp}" ${tp === (s.session_type || '1-on-1') ? 'selected' : ''}>${tp}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Session Fee</span>
        <input class="k-input" type="number" step="0.50" min="0" name="fee" value="${s.fee_cents != null ? (s.fee_cents / 100).toFixed(2) : '95.00'}">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Coaching focus &amp; setup notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Target lifts, equipment rack setup, cues to watch…">${s.notes || ''}</textarea>
    </label>`;
}

export function renderSessionsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.sessionSearch || '').trim().toLowerCase();

  const visible = state.sessions.filter((s) => {
    if (state.sessionScope === 'Today' && s.session_date !== todayStr) return false;
    if (state.trainerFilter !== 'All' && String(s.trainer_id) !== String(state.trainerFilter)) return false;
    if (state.sessionStatusFilter !== 'All' && s.status !== state.sessionStatusFilter) return false;
    if (q) {
      const hay = `${s.client_name || ''} ${s.trainer_name || ''} ${s.session_type || ''} ${s.client_goal || ''} ${s.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const todayAll = state.sessions.filter((s) => s.session_date === todayStr);
  const todayActive = todayAll.filter((s) => s.status !== 'Cancelled' && s.status !== 'No-Show');
  const checkedInCount = todayAll.filter((s) => s.status === 'Checked In').length;
  const completedCount = todayAll.filter((s) => s.status === 'Completed').length;
  const completedPct = todayActive.length ? Math.round((completedCount / todayActive.length) * 100) : 0;
  const todayFeesCents = todayAll.filter((s) => s.status !== 'Cancelled').reduce((sum, s) => sum + Number(s.fee_cents || 0), 0);

  const activeTrainers = state.trainers.filter((tr) => tr.active === 'Active');
  const recentAssess = (state.assessments || []).slice(0, 3);
  const activeProgs = (state.programs || []).filter((p) => p.status === 'Active').slice(0, 3);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="fs-masthead" aria-label="Coaching Floor Command">
      <div class="fs-masthead__copy">
        <div class="fs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#a3e635"></span>
          COACHING FLOOR · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="fs-masthead__title">Session Board</h1>
        <div class="fs-masthead__meta">
          <span><strong style="color:#d9f99d">${todayAll.length} session${todayAll.length === 1 ? '' : 's'}</strong> today</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${checkedInCount} checked in on floor</span>
        </div>
      </div>

      <div class="fs-masthead__pods" style="align-items:center">
        <div class="fs-pod fs-pod--ring fs-pod--volt" aria-label="Sessions completed today ${completedPct}%">
          <div class="tk-ring" style="--p:${completedPct}%;--ring-color:#a3e635;--ring-size:48px">
            <span class="tk-ring__val">${completedPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="fs-pod__lbl">Today Done</span>
            <span class="fs-pod__val" style="font-size:16.5px">${completedCount}/${todayActive.length}</span>
            <span class="fs-pod__sub">${checkedInCount} live now</span>
          </div>
        </div>

        <div class="fs-pod fs-pod--cobalt">
          <span class="fs-pod__lbl">${icon('stopwatch', { size: 12 })} Today Value</span>
          <span class="fs-pod__val">${money(todayFeesCents, { currency })}</span>
          <span class="fs-pod__sub">${todayAll.length} booked</span>
        </div>

        <a href="#/payments" class="fs-pod">
          <span class="fs-pod__lbl">${icon('dollar', { size: 12 })} Month Rev</span>
          <span class="fs-pod__val">${money(counts.monthPaidCents || 0, { currency })}</span>
          <span class="fs-pod__sub">${counts.pendingPaymentsCount ? `${counts.pendingPaymentsCount} pending →` : 'Settled →'}</span>
        </a>

        <a href="#/clients" class="fs-pod fs-pod--wide-sm">
          <span class="fs-pod__lbl">${icon('users', { size: 12 })} Athletes</span>
          <span class="fs-pod__val">${counts.activeClients || 0}</span>
          <span class="fs-pod__sub">${counts.activePrograms || 0} programs →</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="session-new">${icon('plus', { size: 15 })} Book Session</button>
      </div>
    </section>

    <div class="fs-split">
      <div class="tk-stack" style="gap:14px">
        <div class="fs-filter-bar">
          <div class="fs-filter-bar__row">
            <label class="tk-search" style="min-height:34px;flex:1 1 220px;max-width:340px">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="session-search" value="${state.sessionSearch}" placeholder="Search athlete, coach or lift…">
            </label>
            <div class="tk-segmented" role="tablist" aria-label="Session timeframe">
              ${['Today', 'Upcoming', 'All'].map((sc) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.sessionScope === sc })}" data-action="session-scope" data-scope="${sc}">${sc}</button>`)}
            </div>
          </div>
          <div class="fs-filter-bar__row">
            <div class="tk-segmented" role="tablist" aria-label="Filter by coach">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.trainerFilter === 'All' })}" data-action="filter-trainer" data-id="All">All Coaches</button>
              ${activeTrainers.map((tr) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': String(state.trainerFilter) === String(tr.id) })}" data-action="filter-trainer" data-id="${tr.id}">${tr.name}</button>`)}
            </div>
            <div class="tk-segmented" role="tablist" aria-label="Session status">
              ${['All', 'Scheduled', 'Checked In', 'Completed'].map((st) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.sessionStatusFilter === st })}" data-action="session-status-filter" data-status="${st}">${st}</button>`)}
            </div>
          </div>
        </div>

        ${state.loading && !state.sessions.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : visible.length ? html`
          <div class="tk-stack" style="gap:11px">
            ${visible.map((s) => {
              const cap = sessionCapInfo(s);
              return html`
                <article class="session-card ${CARD_TONE[s.status] || ''}" data-key="sess-${s.id}">
                  <div class="session-slot">
                    <span class="session-slot__time">${s.session_time}</span>
                    <span class="session-slot__day">${fmtDayNear(s.session_date)}</span>
                  </div>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <button type="button" class="session-client-btn" data-action="open-client" data-id="${s.client_id}">${s.client_name}</button>
                      <span class="tk-tag tk-tag--accent">${s.session_type}</span>
                      <span class="tk-tag ${STATUS_TAG[s.status] || ''}">${s.status}</span>
                      ${s.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      <span>Coach: <strong>${s.trainer_name}</strong></span>
                      <span>Goal: ${s.client_goal}</span>
                      <span>Fee: <strong>${money(s.fee_cents || 0, { currency })}</strong></span>
                      <span class="session-cap">
                        <span class="session-cap__bar"><span class="session-cap__fill" style="width:${cap.pct}%"></span></span>
                        <span>${cap.label}</span>
                      </span>
                    </div>
                    ${s.client_medical_notes ? html`
                      <div class="session-caution-strip">
                        ${icon('alert', { size: 15 })}
                        <span><strong>MEDICAL CAUTION:</strong> ${s.client_medical_notes}</span>
                      </div>` : ''}
                    ${s.notes ? html`<div class="tk-muted" style="font-size:13px">${s.notes}</div>` : ''}
                  </div>
                  <div class="tk-row__aside">
                    ${s.status === 'Scheduled' ? html`
                      <button type="button" class="k-btn tap-btn-checkin k-btn--sm" data-action="session-status" data-id="${s.id}" data-status="Checked In">
                        ${icon('play', { size: 13 })} Check In
                      </button>` : ''}
                    ${s.status === 'Checked In' || s.status === 'Scheduled' ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="session-status" data-id="${s.id}" data-status="Completed">
                        ${icon('check-circle', { size: 13 })} Complete
                      </button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="session-status" data-id="${s.id}" data-status="No-Show">No-Show</button>` : ''}
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="session-edit" data-id="${s.id}">Edit</button>
                  </div>
                </article>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({
            iconName: 'barbell',
            title: 'Floor schedule is open',
            text: 'Book a 1-on-1 PT, small group, rehab or assessment session to populate the board.',
            action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="session-new">${icon('plus', { size: 15 })} Book Session</button>`,
          })}</section>`}
      </div>

      <aside class="fs-rail-panel" aria-label="Client PRs, Attendance and Active Programs Rail">
        <section class="fs-rail-card">
          <div class="fs-rail-card__head">
            <span class="fs-rail-card__title">${icon('trending', { size: 14 })} Client PRs &amp; Deltas</span>
            <button type="button" class="k-btn k-btn--primary k-btn--sm" style="min-height:25px;padding:0 9px;font-size:11px" data-action="hero-assess-new">+ Check-In</button>
          </div>
          ${recentAssess.length ? html`
            <div class="fs-rail-list">
              ${recentAssess.map((a) => html`
                <div class="fs-rail-item" data-key="rail-as-${a.id}">
                  <div class="fs-rail-item__top">
                    <div>
                      <div class="fs-rail-item__name">${a.client_name}</div>
                      <div class="fs-rail-item__sub">${fmtDay(a.assessment_date)} · Mob ${a.mobility_score}/5</div>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
                      ${a.weight_delta_kg !== null ? html`<span class="delta-pill ${a.weight_delta_kg <= 0 ? 'delta-pill--good' : 'delta-pill--volt'}" style="padding:1px 7px;font-size:10.5px">${a.weight_delta_kg > 0 ? '+' : ''}${num(a.weight_delta_kg, { decimals: 1, fixed: true })} kg</span>` : ''}
                      ${a.body_fat_delta_pct !== null ? html`<span class="delta-pill ${a.body_fat_delta_pct <= 0 ? 'delta-pill--good' : 'delta-pill--warn'}" style="padding:1px 7px;font-size:10.5px">${a.body_fat_delta_pct > 0 ? '+' : ''}${num(a.body_fat_delta_pct, { decimals: 1, fixed: true })}% BF</span>` : ''}
                    </div>
                  </div>
                  ${a.strength_notes ? html`<div style="font-size:12px;color:var(--k-text);line-height:1.35">${a.strength_notes}</div>` : ''}
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Log a check-in to surface weight &amp; strength PR deltas.</div>`}
        </section>

        <section class="fs-rail-card">
          <div class="fs-rail-card__head">
            <span class="fs-rail-card__title">${icon('zap', { size: 14 })} Active Programs</span>
            <a href="#/programs" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${(state.programs || []).length})</a>
          </div>
          ${activeProgs.length ? html`
            <div class="fs-rail-list">
              ${activeProgs.map((p) => html`
                <div class="fs-rail-item" data-key="rail-pg-${p.id}">
                  <div class="fs-rail-item__top">
                    <div>
                      <div class="fs-rail-item__name">${p.program_name}</div>
                      <div class="fs-rail-item__sub">${p.client_name} · ${p.goal}</div>
                    </div>
                    <span class="prog-split-tag" style="font-size:10.5px">${(p.blocks || []).length}D</span>
                  </div>
                  <div class="fs-rail-item__foot">
                    <span class="tk-muted" style="font-size:11.5px">${p.end_date ? `Ends ${fmtDay(p.end_date)}` : 'Ongoing'}</span>
                    <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="rail-copy-plan" data-id="${p.id}">${icon('copy', { size: 12 })} Plan</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active training blocks yet.</div>`}
        </section>

        <section class="fs-rail-card">
          <div class="fs-rail-card__head">
            <span class="fs-rail-card__title">${icon('award', { size: 14 })} Coach Capacity</span>
            <a href="#/trainers" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Roster</a>
          </div>
          <div class="fs-rail-list">
            ${activeTrainers.map((tr) => {
              const load = Number(tr.upcoming_count || 0);
              const pct = Math.min(100, Math.round((load / 6) * 100));
              return html`
                <div class="fs-rail-item">
                  <div class="fs-rail-item__top">
                    <span class="fs-rail-item__name">${tr.name}</span>
                    <span style="font-size:11.5px;font-weight:750;font-variant-numeric:tabular-nums">${load} booked</span>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${pct >= 80 ? 'tk-bar__fill--warn' : ''}" style="width:${pct}%"></div></div>
                </div>`;
            })}
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireSessionsActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="session-search"]', (e, el) => {
    state.sessionSearch = el.value;
    draw();
  });
  on(root, 'click', '[data-action="session-scope"]', (e, el) => {
    state.sessionScope = el.dataset.scope;
    loadScreen('/');
  });
  on(root, 'click', '[data-action="session-status-filter"]', (e, el) => {
    state.sessionStatusFilter = el.dataset.status;
    draw();
  });
  on(root, 'click', '[data-action="filter-trainer"]', (e, el) => {
    state.trainerFilter = el.dataset.id;
    draw();
  });
  on(root, 'click', '[data-action="open-client"]', (e, el) => {
    state.selectedClientId = Number(el.dataset.id);
    router.go('/clients');
  });

  on(root, 'click', '[data-action="rail-copy-plan"]', (e, el) => {
    const p = (state.programs || []).find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const lines = [
      `${state.session.settings.business_name} — TRAINING PROGRAM`,
      `Client: ${p.client_name} · ${p.program_name} (${p.goal})`,
      '',
      ...(p.blocks || []).flatMap((b) => [`=== ${b.day} ===`, b.exercises || '', '']),
    ];
    copyText(lines.join('\n').trim(), { title: `Program Plan · ${p.client_name}`, done: 'Program plan copied!' });
  });

  on(root, 'click', '[data-action="session-status"]', async (e, el) => {
    try {
      await api.post('/api/sessions/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Session marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="hero-assess-new"]', async () => {
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
    if (made) { toast.success('Assessment recorded & deltas updated.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="session-new"]', async () => {
    if (!state.clients.length || !state.trainers.length) { toast.error('Add at least one client and trainer first.'); return; }
    const made = await formDialog({
      title: 'Book Coaching Session',
      submitLabel: 'Book session',
      size: 'lg',
      fields: sessionFields(state),
      onSubmit: (vals) => api.post('/api/sessions', vals),
    });
    if (made) { toast.success('Session booked on the board.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="session-edit"]', async (e, el) => {
    const cur = state.sessions.find((x) => String(x.id) === el.dataset.id);
    if (!cur) return;
    const saved = await formDialog({
      title: `Edit Session · ${cur.client_name}`,
      submitLabel: 'Save session',
      size: 'lg',
      fields: sessionFields(state, cur),
      onSubmit: (vals) => api.put('/api/sessions', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Session updated.'); await loadScreen('/'); }
  });
}
