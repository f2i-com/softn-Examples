// Budget Tracker (Unified Masthead + Visual Variance Bar), Event Incident Log, and Post-Event Feedback Summary views.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const BUDGET_CATS = ['Venue', 'Catering', 'AV Equipment', 'Marketing', 'Speaker Fees', 'Decorations', 'Transportation', 'Staffing', 'Insurance', 'Other'];
const INCIDENT_TYPES = ['Medical Emergency', 'Safety Hazard', 'Security Issue', 'Property Damage', 'Weather Related', 'Attendee Complaint', 'Other'];
const INCIDENT_SEVS = ['Low', 'Medium', 'High', 'Critical'];

function pctVariance(est, act) {
  const e = Number(est || 0);
  const a = Number(act || 0);
  if (e <= 0) return a > 0 ? 100 : 0;
  return Math.round(((e - a) / e) * 100);
}

export function renderBudgetView(state) {
  const cur = state.session.settings.currency || 'USD';
  const sum = state.budgetSummary || { estimatedCents: 0, actualCents: 0, varianceCents: 0 };
  const rows = state.budgetCat === 'All'
    ? state.budget
    : state.budget.filter((b) => b.category === state.budgetCat);

  const est = Number(sum.estimatedCents || 0);
  const act = Number(sum.actualCents || 0);
  const variance = Number(sum.varianceCents || 0);
  const isOver = variance < 0;
  const usedPct = est > 0 ? Math.round((act / est) * 100) : (act > 0 ? 100 : 0);
  const varPct = Math.abs(pctVariance(est, act));
  const barScaleMax = Math.max(est, act, 1);
  const actualBarWidth = Math.min(100, Math.round((act / barScaleMax) * 100));
  const plannedMarkerPos = isOver && est > 0 ? Math.min(96, Math.round((est / barScaleMax) * 100)) : null;

  const shownEst = rows.reduce((a, b) => a + Number(b.estimated_cents || 0), 0);
  const shownAct = rows.reduce((a, b) => a + Number(b.actual_cents || 0), 0);
  const shownVar = shownEst - shownAct;
  const countCat = (c) => c === 'All' ? state.budget.length : state.budget.filter((b) => b.category === c).length;

  return html`
    <section class="ev-masthead" aria-label="Event Budget Control">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${isOver ? '#fb7185' : '#4ade80'}"></span>
          FINANCIAL CONTROL · ${state.budget.length} LINE ITEM${state.budget.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ev-masthead__title">Event Budget</h1>
        <div class="ev-masthead__meta">
          <span>Live planned vs actual variance in dollars &amp; percent</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Filter by production category</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--ring">
          <div class="tk-ring" style="--p:${Math.min(100, usedPct)}%;--ring-color:${isOver ? '#fb7185' : '#34d399'};--ring-size:48px">
            <span class="tk-ring__val">${usedPct}%</span>
          </div>
          <div>
            <span class="ev-pod__lbl">Actual Spend</span>
            <div class="ev-pod__val" style="font-size:15px">${money(act, { currency: cur })}</div>
            <span class="ev-pod__sub">of ${money(est, { currency: cur })}</span>
          </div>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">Total Planned</span>
          <span class="ev-pod__val">${money(est, { currency: cur })}</span>
          <span class="ev-pod__sub">${state.budget.length} lines</span>
        </div>
        <div class="ev-pod ${isOver ? 'ev-pod--alert' : 'ev-pod--mint'}">
          <span class="ev-pod__lbl">${isOver ? 'Over Budget' : 'Under Budget'}</span>
          <span class="ev-pod__val">${variance >= 0 ? '+' : ''}${money(variance, { currency: cur })}</span>
          <span class="ev-pod__sub">${isOver ? `+${varPct}% over` : `${varPct}% saved`}</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="bud-new">${icon('plus', { size: 15 })} Add Line</button>
      </div>
    </section>

    ${est > 0 || act > 0 ? html`
      <section class="budget-var-card">
        <div class="budget-var-card__head">
          <div>
            <div style="font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.07em;color:var(--k-muted)">Planned vs Actual Ceiling</div>
            <div style="font-size:17px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums">
              ${money(act, { currency: cur })} spent of ${money(est, { currency: cur })} planned
            </div>
          </div>
          <span class="tk-tag ${isOver ? 'tk-tag--bad' : 'tk-tag--ok'}" style="font-size:12px;padding:4px 11px">
            ${isOver ? `Over by ${money(Math.abs(variance), { currency: cur })} (+${varPct}%)` : `Under by ${money(variance, { currency: cur })} (${varPct}% remaining)`}
          </span>
        </div>
        <div class="budget-var-track" role="progressbar" aria-valuenow="${Math.min(100, usedPct)}" aria-valuemin="0" aria-valuemax="100">
          <div class="budget-var-fill ${isOver ? 'budget-var-fill--over' : 'budget-var-fill--ok'}" style="width:${actualBarWidth}%"></div>
          ${plannedMarkerPos !== null ? html`<div class="budget-var-marker" style="left:${plannedMarkerPos}%" title="Planned Budget Limit"></div>` : ''}
        </div>
        <div class="budget-var-foot">
          <span>Planned Ceiling: <strong>${money(est, { currency: cur })}</strong></span>
          <span class="${isOver ? 'var-over' : 'var-under'}">Variance: ${variance >= 0 ? '+' : ''}${money(variance, { currency: cur })} (${isOver ? '-' : '+'}${varPct}%)</span>
        </div>
      </section>` : ''}

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...BUDGET_CATS].map((c) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.budgetCat === c })}" data-action="bud-filter" data-cat="${c}">${c}${countCat(c) > 0 ? ` (${countCat(c)})` : ''}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.budget.length ? skeleton(4) : rows.length ? html`
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Line Item</th><th>Category</th><th>Vendor</th><th class="tk-num">Planned</th><th class="tk-num">Actual</th><th>Spend Bar</th><th class="tk-num">Variance</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((b) => {
                const v = Number(b.variance_cents);
                const bEst = Number(b.estimated_cents || 0);
                const bAct = Number(b.actual_cents || 0);
                const over = v < 0;
                const fillPct = bEst > 0 ? Math.min(100, Math.round((bAct / bEst) * 100)) : (bAct > 0 ? 100 : 0);
                const diffPct = Math.abs(pctVariance(bEst, bAct));
                return html`
                  <tr data-key="bi-${b.id}">
                    <td><strong>${b.item_name}</strong>${b.is_sample ? html` <span class="tk-tag tk-tag--sample">Sample</span>` : ''}${b.notes ? html`<div class="tk-muted" style="font-size:12.5px">${b.notes}</div>` : ''}</td>
                    <td><span class="tk-tag">${b.category}</span></td>
                    <td>${b.vendor || '—'}</td>
                    <td class="tk-num tk-mono">${money(bEst, { currency: cur })}</td>
                    <td class="tk-num tk-mono">${money(bAct, { currency: cur })}</td>
                    <td>
                      <div class="mini-var">
                        <div class="mini-var__bar">
                          <div class="${over ? 'mini-var__fill--over' : 'mini-var__fill--ok'}" style="width:${fillPct}%"></div>
                        </div>
                        <span class="tk-muted" style="font-size:11px;font-variant-numeric:tabular-nums">${bEst > 0 ? Math.round((bAct / bEst) * 100) : 0}% spent</span>
                      </div>
                    </td>
                    <td class="tk-num">
                      <span class="${over ? 'var-over' : 'var-under'}">${v >= 0 ? '+' : ''}${money(v, { currency: cur })}</span>
                      <div style="font-size:11px" class="${over ? 'var-over' : 'var-under'}">${over ? `+${diffPct}% over` : `${diffPct}% under`}</div>
                    </td>
                    <td>
                      <div class="tk-btn-row">
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="bud-edit" data-id="${b.id}">Edit</button>
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="bud-del" data-id="${b.id}">Delete</button>
                      </div>
                    </td>
                  </tr>`;
              })}
            </tbody>
            <tfoot>
              <tr style="background:color-mix(in srgb, var(--k-bg) 80%, var(--k-surface));font-weight:750">
                <td colspan="3">TOTAL (${rows.length} ITEM${rows.length === 1 ? '' : 'S'})</td>
                <td class="tk-num tk-mono">${money(shownEst, { currency: cur })}</td>
                <td class="tk-num tk-mono">${money(shownAct, { currency: cur })}</td>
                <td></td>
                <td class="tk-num"><span class="${shownVar < 0 ? 'var-over' : 'var-under'}">${shownVar >= 0 ? '+' : ''}${money(shownVar, { currency: cur })}</span></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>` : emptyState({ iconName: 'dollar', title: 'No budget items', text: 'Track venue, catering, AV, marketing, and staffing line items.' })}
    </section>`;
}

export function renderIncidentsView(state) {
  const rows = state.incidentFilter === 'All'
    ? state.incidents
    : state.incidents.filter((i) => i.status === state.incidentFilter);
  const openCount = state.incidents.filter((i) => i.status === 'Open').length;
  const resolvedCount = state.incidents.filter((i) => i.status === 'Resolved').length;
  const countI = (st) => st === 'All' ? state.incidents.length : state.incidents.filter((i) => i.status === st).length;

  return html`
    <section class="ev-masthead" aria-label="Event Incident Log">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${openCount > 0 ? '#fb7185' : '#4ade80'}"></span>
          SAFETY &amp; FLOOR OPS · ${openCount} OPEN
        </div>
        <h1 class="ev-masthead__title">Incident Log</h1>
        <div class="ev-masthead__meta">
          <span>Document medical, security &amp; logistics issues with immediate actions</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Open incidents auto-pin to Command Run Sheet</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ${openCount > 0 ? 'ev-pod--alert' : 'ev-pod--mint'}">
          <span class="ev-pod__lbl">Open Issues</span>
          <span class="ev-pod__val">${openCount}</span>
          <span class="ev-pod__sub">${openCount > 0 ? 'Active response' : 'Floor clear'}</span>
        </div>
        <div class="ev-pod ev-pod--mint">
          <span class="ev-pod__lbl">Resolved</span>
          <span class="ev-pod__val">${resolvedCount}</span>
          <span class="ev-pod__sub">Documented</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="inc-new">${icon('alert', { size: 15 })} Log Incident</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['Open', 'Resolved', 'All'].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.incidentFilter === st })}" data-action="inc-filter" data-status="${st}">${st} (${countI(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.incidents.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? rows.map((inc) => html`
        <article class="ev-banded-card ${inc.status === 'Resolved' ? 'ev-banded-card--ok' : (inc.severity === 'Critical' || inc.severity === 'High') ? 'ev-banded-card--bad' : 'ev-banded-card--warn'}" data-key="in-${inc.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span class="tk-tag ${inc.severity === 'Critical' || inc.severity === 'High' ? 'tk-tag--bad' : inc.severity === 'Medium' ? 'tk-tag--warn' : 'tk-tag--info'}">${inc.severity}</span>
                <span>${inc.incident_type} · ${inc.location}</span>
                <span class="tk-tag ${inc.status === 'Resolved' ? 'tk-tag--ok' : 'tk-tag--bad'}">${inc.status}</span>
                ${inc.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta" style="margin-top:4px">
                <span>${fmtDay(inc.incident_date)} at ${inc.incident_time}</span>
                <span>Reported by ${inc.reporter_name}</span>
                ${inc.witnesses ? html`<span>Witnesses: ${inc.witnesses}</span>` : ''}
              </div>
            </div>
            <div class="tk-btn-row">
              ${inc.status === 'Open'
                ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inc-resolve" data-id="${inc.id}">Mark Resolved ✓</button>`
                : html`<button type="button" class="k-btn k-btn--sm" data-action="inc-reopen" data-id="${inc.id}">Reopen</button>`}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="inc-del" data-id="${inc.id}">Delete</button>
            </div>
          </div>
          <div style="font-size:13.75px">${inc.description}</div>
          <div style="font-size:13.25px;color:var(--k-muted)"><strong style="color:var(--k-text)">Actions Taken:</strong> ${inc.actions_taken}</div>
        </article>`) : emptyState({ iconName: 'shield-check', title: 'No incidents in this view', text: 'Log any safety, medical, or logistics issue so response actions are documented.' })}
    </div>`;
}

export function renderFeedbackView(state) {
  const s = state.feedbackSummary || { total: 0, avgOverall: 0, avgVenue: 0, avgSpeakers: 0, avgOrganization: 0, avgFood: 0, recommendPct: 0, attendAgainPct: 0 };
  const recPct = Number(s.recommendPct || 0);
  const ringColor = recPct >= 75 ? '#34d399' : recPct >= 50 ? '#f3c969' : '#fb7185';
  const scoreTiles = [
    { label: 'Overall', val: s.avgOverall },
    { label: 'Venue', val: s.avgVenue },
    { label: 'Speakers', val: s.avgSpeakers },
    { label: 'Logistics', val: s.avgOrganization },
    { label: 'Food & Bev', val: s.avgFood },
  ];

  return html`
    <section class="ev-masthead" aria-label="Post-Event Feedback">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f3c969"></span>
          ATTENDEE RATINGS · ${s.total} RESPONSE${s.total === 1 ? '' : 'S'}
        </div>
        <h1 class="ev-masthead__title">Post-Event Feedback</h1>
        <div class="ev-masthead__meta">
          <span>Live averages across venue, speakers, logistics &amp; catering</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Attend again &amp; recommendation metrics</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--ring">
          <div class="tk-ring" style="--p:${recPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${recPct}%</span>
          </div>
          <div>
            <span class="ev-pod__lbl">Recommend</span>
            <div class="ev-pod__val" style="font-size:15.5px">${s.total} replies</div>
            <span class="ev-pod__sub">Would share event</span>
          </div>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">Overall Score</span>
          <span class="ev-pod__val">${s.avgOverall} / 5</span>
          <span class="ev-pod__sub">Speakers ${s.avgSpeakers}/5</span>
        </div>
        <div class="ev-pod ev-pod--mint">
          <span class="ev-pod__lbl">Venue &amp; Ops</span>
          <span class="ev-pod__val">${s.avgVenue} / 5</span>
          <span class="ev-pod__sub">Logistics ${s.avgOrganization}/5</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="efb-new">${icon('plus', { size: 15 })} Log Feedback</button>
      </div>
    </section>

    ${state.loading && !state.feedback.length && !state.feedbackSummary ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="rating-grid">
        ${scoreTiles.map((tile) => {
          const barPct = Math.min(100, Math.round((Number(tile.val || 0) / 5) * 100));
          return html`
            <div class="rating-tile">
              <span class="rating-tile__lbl">${tile.label}</span>
              <span class="rating-tile__val">${tile.val} <span style="font-size:14px;color:var(--k-muted);font-weight:650">/ 5</span></span>
              <div class="tk-bar"><div class="tk-bar__fill" style="width:${barPct}%"></div></div>
            </div>`;
        })}
      </div>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('star', { size: 17 })} Individual Responses</h2><span class="tk-sheet__count">${state.feedback.length}</span></div>
        <div>
          ${state.feedback.length ? state.feedback.map((f) => html`
            <div class="tk-row" data-key="ef-${f.id}">
              <div class="ev-avatar" style="width:36px;height:36px;font-size:12.5px">${initials(f.attendee_name || 'A')}</div>
              <div class="tk-row__main">
                <div class="tk-row__title">
                  <span>${f.attendee_name}</span>
                  <span class="tk-tag tk-tag--accent">Overall ${f.overall_rating}/5</span>
                  <span class="tk-tag ${f.would_recommend === 'Yes' ? 'tk-tag--ok' : 'tk-tag--warn'}">Recommend: ${f.would_recommend}</span>
                  ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta">
                  <span>Venue ${f.venue_rating}/5</span><span>Speakers ${f.speakers_rating}/5</span><span>Logistics ${f.organization_rating}/5</span><span>Food ${f.food_rating}/5</span><span>Return: ${f.would_attend_again}</span>
                </div>
                ${f.what_enjoyed ? html`<div style="font-size:13.5px;margin-top:4px"><strong>Enjoyed:</strong> ${f.what_enjoyed}</div>` : ''}
                ${f.suggestions ? html`<div class="tk-muted" style="font-size:13px"><strong>Suggestions:</strong> ${f.suggestions}</div>` : ''}
              </div>
              <div class="tk-row__aside">
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="efb-del" data-id="${f.id}">Delete</button>
              </div>
            </div>`) : emptyState({ iconName: 'star', title: 'No post-event feedback yet', text: 'Record attendee ratings to compute live averages across venue, speakers, and catering.' })}
        </div>
      </section>`}`;
}

export function wireEventOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="bud-filter"]', (e, el) => { state.budgetCat = el.dataset.cat; draw(); });
  on(root, 'click', '[data-action="inc-filter"]', (e, el) => { state.incidentFilter = el.dataset.status; draw(); });

  const budFields = (b = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Item Name</span><input class="k-input" name="item_name" value="${b.item_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${BUDGET_CATS.map((c) => html`<option value="${c}" ${c === (b.category || 'Venue') ? 'selected' : ''}>${c}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Estimated Cost</span><input class="k-input" type="number" step="0.01" min="0" name="estimated_cost" value="${b.estimated_cents !== undefined ? (b.estimated_cents / 100).toFixed(2) : ''}" required></label>
      <label class="k-field"><span class="k-field__label">Actual Cost</span><input class="k-input" type="number" step="0.01" min="0" name="actual_cost" value="${b.actual_cents !== undefined ? (b.actual_cents / 100).toFixed(2) : '0.00'}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Vendor / Supplier</span><input class="k-input" name="vendor" value="${b.vendor || ''}"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${b.notes || ''}"></label>`;

  on(root, 'click', '[data-action="bud-new"]', async () => {
    const made = await formDialog({ title: 'Add Budget Item', submitLabel: 'Save Item', fields: budFields(), onSubmit: (v) => api.post('/api/budget', v) });
    if (made) { toast.success('Budget item saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="bud-edit"]', async (e, el) => {
    const b = state.budget.find((x) => String(x.id) === el.dataset.id);
    if (!b) return;
    const saved = await formDialog({ title: `Edit ${b.item_name}`, submitLabel: 'Save Changes', fields: budFields(b), onSubmit: (v) => api.put('/api/budget', { ...v, id: b.id }) });
    if (saved) { toast.success('Budget updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="bud-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete budget line?', message: 'Remove this item from the budget?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/budget', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-new"]', async () => {
    const made = await formDialog({
      title: 'Log Event Incident',
      submitLabel: 'Record Incident',
      danger: true,
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Incident Type</span><select class="k-input" name="incident_type">${INCIDENT_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${INCIDENT_SEVS.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="incident_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="incident_time" value="12:00" required></label>
          <label class="k-field"><span class="k-field__label">Location</span><input class="k-input" name="location" placeholder="Main Stage / Foyer" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="2" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Actions Taken</span><textarea class="k-input" name="actions_taken" rows="2" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Witnesses</span><input class="k-input" name="witnesses"></label>`,
      onSubmit: (v) => api.post('/api/incidents', v),
    });
    if (made) { toast.success('Incident logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="inc-resolve"]', async (e, el) => {
    try { await api.post('/api/incidents/status', { id: Number(el.dataset.id), status: 'Resolved' }); toast.success('Incident resolved.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-reopen"]', async (e, el) => {
    try { await api.post('/api/incidents/status', { id: Number(el.dataset.id), status: 'Open' }); toast.success('Incident reopened.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete incident?', message: 'Remove this incident log entry?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/incidents', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="efb-new"]', async () => {
    const made = await formDialog({
      title: 'Log Post-Event Feedback',
      submitLabel: 'Save Feedback',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Attendee Name</span><input class="k-input" name="attendee_name" required></label>
          <label class="k-field"><span class="k-field__label">Overall (1–5)</span><input class="k-input" type="number" min="1" max="5" name="overall_rating" value="5" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Venue (1–5)</span><input class="k-input" type="number" min="1" max="5" name="venue_rating" value="5"></label>
          <label class="k-field"><span class="k-field__label">Speakers (1–5)</span><input class="k-input" type="number" min="1" max="5" name="speakers_rating" value="5"></label>
          <label class="k-field"><span class="k-field__label">Logistics (1–5)</span><input class="k-input" type="number" min="1" max="5" name="organization_rating" value="5"></label>
          <label class="k-field"><span class="k-field__label">Food (1–5)</span><input class="k-input" type="number" min="1" max="5" name="food_rating" value="4"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Attend Again?</span><select class="k-input" name="would_attend_again"><option>Definitely</option><option>Probably</option><option>Unsure</option><option>No</option></select></label>
          <label class="k-field"><span class="k-field__label">Recommend?</span><select class="k-input" name="would_recommend"><option>Yes</option><option>Maybe</option><option>No</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">What did they enjoy?</span><textarea class="k-input" name="what_enjoyed" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Suggestions</span><textarea class="k-input" name="suggestions" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/feedback', v),
    });
    if (made) { toast.success('Feedback logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="efb-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete feedback?', message: 'Remove this survey response?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/feedback', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
