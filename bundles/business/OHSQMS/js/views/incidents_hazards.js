// Incidents & Injuries Register (Unified Safety Masthead, Severity-Banded Cards, 4-Stage Investigation Stepper & RTW Cards)
// + 5x5 Hazard Matrix Register (Unified Masthead, Controlled Rate Ring, Interactive 5x5 Matrix & Residual Risk Meter Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import {
  LIKELIHOOD_LABELS,
  CONSEQUENCE_LABELS,
  riskRatingFor,
  renderRiskMatrix,
  renderIncidentBadges,
  renderWorkflowStepper,
} from '../ohs_ui.js';

const INC_TYPES = ['Near Miss', 'Injury', 'Property Damage', 'Environmental', 'Security', 'Other'];
const INC_SEVS = ['Low', 'Medium', 'High', 'Critical'];
const INC_STATUSES = ['Reported', 'Investigating', 'Actions Assigned', 'Closed'];
const INC_NEXT = { Reported: 'Investigating', Investigating: 'Actions Assigned', 'Actions Assigned': 'Closed' };
const INJ_TYPES = ['Strain / Sprain', 'Laceration / Cut', 'Fracture', 'Burn', 'Contusion / Bruise', 'Eye Injury', 'Hearing Damage', 'Respiratory', 'Other'];
const HAZ_TYPES = ['Physical', 'Chemical', 'Biological', 'Ergonomic', 'Psychosocial', 'Environmental', 'Other'];
const CTRL_TYPES = ['Elimination', 'Substitution', 'Engineering Controls', 'Administrative Controls', 'PPE'];

function residualFor(score, ctrl) {
  const f = ctrl === 'Elimination' ? 0 : ctrl === 'Substitution' ? 0.3 : ctrl === 'Engineering Controls' ? 0.4 : ctrl === 'Administrative Controls' ? 0.6 : 0.8;
  return Math.round(score * f);
}

function incBandClass(i) {
  if (i.investigation_status === 'Closed') return 'ohs-band--closed';
  if (i.lost_time_injury || i.severity === 'Critical') return 'ohs-band--critical';
  if (i.severity === 'High') return 'ohs-band--high';
  if (i.severity === 'Medium') return 'ohs-band--medium';
  return 'ohs-band--low';
}

function hazBandClass(h) {
  if (h.status === 'Closed' || h.status === 'Controlled') return 'ohs-band--ok';
  const r = String(h.risk_rating || 'Low').toLowerCase();
  if (r === 'extreme') return 'ohs-band--extreme';
  if (r === 'high') return 'ohs-band--high';
  if (r === 'medium') return 'ohs-band--medium';
  return 'ohs-band--low';
}

export function renderIncidentsView(state) {
  const ltiCount = state.incidents.filter((i) => i.lost_time_injury).length;
  const openCount = state.incidents.filter((i) => i.investigation_status !== 'Closed').length;
  const closedCount = state.incidents.length - openCount;
  const closePct = state.incidents.length ? Math.round((closedCount / state.incidents.length) * 100) : 100;
  const loadingInc = state.loading && !state.incidents.length;
  const loadingInj = state.loading && !state.injuries.length;

  const incFilter = state.incFilter || 'All';
  const visibleInc = state.incidents.filter((i) => {
    if (incFilter === 'Open') return i.investigation_status !== 'Closed';
    if (incFilter === 'High') return i.severity === 'Critical' || i.severity === 'High' || !!i.lost_time_injury;
    if (incFilter === 'Near Miss') return i.incident_type === 'Near Miss';
    return true;
  });

  return html`
    <section class="ohs-masthead" aria-label="Incidents & Injury Register">
      <div class="ohs-masthead__copy">
        <div class="${cls('ohs-masthead__eyebrow', { 'ohs-masthead__eyebrow--alert': ltiCount > 0, 'ohs-masthead__eyebrow--ok': openCount === 0 })}">
          ${icon('safety-beacon', { size: 12 })} ISO 45001 · CLAUSE 10.2 INCIDENTS
        </div>
        <h1 class="ohs-masthead__title">Incidents &amp; Injuries</h1>
        <div class="ohs-masthead__meta">
          <span>Near-misses, injuries &amp; notifiable cases</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Linked RTW plans auto-flag LTI</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--ring ohs-pod--emerald" aria-label="Investigation closure rate ${closePct}%">
          <div class="tk-ring" style="--p:${closePct}%;--ring-color:${closePct >= 75 ? '#34d399' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${closePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ohs-pod__lbl">Closed Rate</span>
            <span class="ohs-pod__val" style="font-size:16px">${closedCount}/${state.incidents.length}</span>
            <span class="ohs-pod__sub">Investigations closed</span>
          </div>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--alert': openCount > 0 })}">
          <span class="ohs-pod__lbl">${icon('alert', { size: 12 })} Open</span>
          <span class="ohs-pod__val">${openCount}</span>
          <span class="ohs-pod__sub">Active cases</span>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--alert': ltiCount > 0 })}">
          <span class="ohs-pod__lbl">${icon('flame', { size: 12 })} LTI Events</span>
          <span class="ohs-pod__val">${ltiCount}</span>
          <span class="ohs-pod__sub">Lost-time injuries</span>
        </div>

        <div class="ohs-pod ohs-pod--banner-sm">
          <span class="ohs-pod__lbl">${icon('heart', { size: 12 })} RTW Plans</span>
          <span class="ohs-pod__val">${state.injuries.length}</span>
          <span class="ohs-pod__sub">Injury records</span>
        </div>

        <div class="ohs-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn k-btn--glass" data-action="ohs-inj-new">${icon('plus', { size: 15 })} Log Injury</button>
          <button type="button" class="k-btn ohs-btn-amber" data-action="ohs-inc-new">${icon('alert', { size: 15 })} Report Incident</button>
        </div>
      </div>
    </section>

    <div class="ohs-tabs">
      <div class="tk-segmented" role="tablist">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.incTab === 'incidents' })}" data-action="ohs-inc-tab" data-tab="incidents">Incident Register (${state.incidents.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.incTab === 'injuries' })}" data-action="ohs-inc-tab" data-tab="injuries">Injury &amp; RTW Records (${state.injuries.length})</button>
      </div>
      ${state.incTab === 'incidents' ? html`
        <div class="tk-segmented" role="tablist" aria-label="Filter incidents">
          ${[['All', 'All'], ['Open', 'Open'], ['High', 'High / LTI'], ['Near Miss', 'Near Miss']].map(([v, lbl]) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': incFilter === v })}" data-action="ohs-inc-filter" data-filter="${v}">${lbl}</button>`)}
        </div>` : ''}
    </div>

    ${state.incTab === 'incidents' ? html`
      ${loadingInc ? html`<section class="tk-sheet">${skeleton(4)}</section>` : visibleInc.length ? html`
        <div class="ohs-card-list">
          ${visibleInc.map((i) => {
            const nextSt = INC_NEXT[i.investigation_status];
            return html`
              <article class="ohs-inc-card ${incBandClass(i)}" data-key="inc-${i.id}">
                <div class="ohs-card__top">
                  <div class="ohs-card__head">
                    <div class="ohs-card__title">
                      <span class="ohs-code">${i.incident_code}</span>
                      <span>${i.incident_title}</span>
                      ${renderIncidentBadges(i)}
                      ${i.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="ohs-card__meta">
                      <span>${fmtDay(i.incident_date)} at ${i.incident_time}</span>
                      <span>Location: <strong>${i.location}</strong></span>
                      <span>Reported by: ${i.reported_by}</span>
                    </div>
                  </div>
                  <div class="ohs-card__actions">
                    ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="ohs-inc-advance" data-id="${i.id}" data-status="${nextSt}">${nextSt === 'Closed' ? 'Close Case ✓' : `${nextSt} →`}</button>` : ''}
                    <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="ohs-inc-status" data-id="${i.id}" aria-label="Investigation status">
                      ${INC_STATUSES.map((st) => html`<option value="${st}" ${st === i.investigation_status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="ohs-inc-del" data-id="${i.id}">Delete</button>
                  </div>
                </div>
                <div style="font-size:13.5px;color:var(--k-text);line-height:1.48">${i.description}</div>
                ${i.immediate_actions || i.root_cause ? html`
                  <div class="ohs-callout">
                    ${i.immediate_actions ? html`<div><strong>Immediate Actions:</strong> ${i.immediate_actions}</div>` : ''}
                    ${i.root_cause ? html`<div><strong>Root Cause:</strong> ${i.root_cause}</div>` : ''}
                  </div>` : ''}
                ${renderWorkflowStepper(INC_STAGES_LIST, i.investigation_status)}
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'alert', title: 'No incidents match', text: 'Report workplace incidents and near misses to investigate root causes.' })}</section>`}` : html`
      ${loadingInj ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.injuries.length ? html`
        <div class="ohs-entity-grid">
          ${state.injuries.map((j) => html`
            <article class="ohs-entity-card ${j.lost_time === 'Yes' ? 'ohs-entity-card--red' : 'ohs-entity-card--green'}" data-key="inj-${j.id}">
              <div class="ohs-entity-card__head">
                <div style="display:flex;align-items:center;gap:11px;min-width:0">
                  <span class="ohs-entity-avatar">${initials(j.employee_name)}</span>
                  <div style="min-width:0">
                    <div style="font-weight:750;font-size:15px;line-height:1.2">${j.employee_name}</div>
                    <div class="tk-muted" style="font-size:12.5px">${j.injury_type} · ${j.body_part}</div>
                  </div>
                </div>
                ${j.lost_time === 'Yes' ? html`<span class="ohs-badge-lti">LTI</span>` : html`<span class="tk-tag tk-tag--ok">No LTI</span>`}
              </div>
              <div class="ohs-entity-card__body">
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  ${j.incident_code ? html`<span class="ohs-code">${j.incident_code}</span>` : ''}
                  <span class="tk-tag">Date: ${fmtDay(j.injury_date)}</span>
                  ${j.rtw_date ? html`<span class="tk-tag tk-tag--info">RTW: ${fmtDay(j.rtw_date)}</span>` : ''}
                  ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="ohs-callout">
                  <div><strong>Treatment:</strong> ${j.treatment}</div>
                  ${j.treatment_notes ? html`<div class="tk-muted">${j.treatment_notes}</div>` : ''}
                </div>
                <div style="display:flex;justify-content:flex-end">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="ohs-inj-del" data-id="${j.id}">Delete</button>
                </div>
              </div>
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'heart', title: 'No injury records', text: 'Log injury treatment and return-to-work plans linked to site incidents.' })}</section>`}`}`;
}

const INC_STAGES_LIST = INC_STATUSES;

export function renderHazardsView(state) {
  const d = state.hazardDraft;
  const previewScore = Number(d.likelihood) * Number(d.consequence);
  const previewRating = riskRatingFor(previewScore);
  const previewResid = residualFor(previewScore, d.control_type);
  const loadingHz = state.loading && !state.hazards.length;

  const controlledCnt = state.hazards.filter((h) => h.status === 'Controlled' || h.status === 'Closed').length;
  const ctrlPct = state.hazards.length ? Math.round((controlledCnt / state.hazards.length) * 100) : 100;
  const openHighCnt = state.hazards.filter((h) => h.status === 'Open' && (h.risk_rating === 'Extreme' || h.risk_rating === 'High')).length;

  let filtered = state.hazards;
  if (state.matrixCell) {
    filtered = filtered.filter((h) => h.likelihood === state.matrixCell.l && h.consequence === state.matrixCell.c);
  } else if (state.hazardRatingFilter !== 'All') {
    filtered = filtered.filter((h) => h.risk_rating === state.hazardRatingFilter);
  }

  return html`
    <section class="ohs-masthead" aria-label="Hazard Register & 5x5 Risk Matrix">
      <div class="ohs-masthead__copy">
        <div class="ohs-masthead__eyebrow">
          ${icon('hazard-matrix', { size: 12 })} ISO 45001 · HIERARCHY OF CONTROLS
        </div>
        <h1 class="ohs-masthead__title">5×5 Hazard Matrix</h1>
        <div class="ohs-masthead__meta">
          <span>Tap any cell to filter by Likelihood × Consequence</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Low 1–4 · Med 5–9 · High 10–15 · Extreme 16–25</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--ring ohs-pod--emerald" aria-label="Hazards controlled ${ctrlPct}%">
          <div class="tk-ring" style="--p:${ctrlPct}%;--ring-color:${ctrlPct >= 75 ? '#34d399' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${ctrlPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ohs-pod__lbl">Controlled</span>
            <span class="ohs-pod__val" style="font-size:16px">${controlledCnt}/${state.hazards.length}</span>
            <span class="ohs-pod__sub">Mitigated risks</span>
          </div>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--alert': openHighCnt > 0 })}">
          <span class="ohs-pod__lbl">${icon('alert', { size: 12 })} High / Extreme</span>
          <span class="ohs-pod__val">${openHighCnt}</span>
          <span class="ohs-pod__sub">Uncontrolled open</span>
        </div>

        <div class="ohs-pod ohs-pod--amber">
          <span class="ohs-pod__lbl">${icon('shield', { size: 12 })} Total Logged</span>
          <span class="ohs-pod__val">${state.hazards.length}</span>
          <span class="ohs-pod__sub">Active register</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2" style="margin-bottom:18px">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('hazard-matrix', { size: 18 })} Interactive 5×5 Heat-Mapped Matrix</h2>
          ${state.matrixCell || state.hazardRatingFilter !== 'All'
            ? html`<button type="button" class="k-btn k-btn--sm" data-action="rm-clear">Show All (${state.hazards.length})</button>`
            : html`<span class="tk-sheet__count">Click any cell</span>`}
        </div>
        <div class="tk-sheet__body">
          ${loadingHz ? skeleton(4) : renderRiskMatrix(state.hazards, { selectedCell: state.matrixCell, ratingFilter: state.hazardRatingFilter })}
        </div>
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('plus', { size: 18 })} Assess &amp; Log Workplace Hazard</h2></div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="ohs-save-hazard" novalidate>
            <label class="k-field"><span class="k-field__label">Hazard Title</span><input class="k-input" value="${d.hazard_title}" placeholder="e.g. Unguarded conveyor pinch point" data-haz="hazard_title" required></label>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Location</span><input class="k-input" value="${d.location}" placeholder="e.g. Packaging Line 2" data-haz="location" required></label>
              <label class="k-field"><span class="k-field__label">Hazard Category</span>
                <select class="k-input" data-haz="hazard_type">${HAZ_TYPES.map((t) => html`<option value="${t}" ${t === d.hazard_type ? 'selected' : ''}>${t}</option>`)}</select>
              </label>
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Likelihood (1–5)</span>
                <select class="k-input" data-haz="likelihood">
                  ${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${Number(d.likelihood) === n ? 'selected' : ''}>${LIKELIHOOD_LABELS[n]}</option>`)}
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Consequence (1–5)</span>
                <select class="k-input" data-haz="consequence">
                  ${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${Number(d.consequence) === n ? 'selected' : ''}>${CONSEQUENCE_LABELS[n]}</option>`)}
                </select>
              </label>
            </div>
            <label class="k-field"><span class="k-field__label">Hierarchy of Controls Measure</span>
              <select class="k-input" data-haz="control_type">${CTRL_TYPES.map((c) => html`<option value="${c}" ${c === d.control_type ? 'selected' : ''}>${c}</option>`)}</select>
            </label>
            <div class="ohs-score-box">
              <div>
                <div class="tk-kv__k">Inherent Risk → Residual Risk</div>
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px">
                  <span class="tk-tag ohs-risk-${previewRating.toLowerCase()}">${previewRating} (${previewScore}/25)</span>
                  <span>→ Residual: <strong>${previewResid}/25</strong> (${riskRatingFor(previewResid)})</span>
                </div>
              </div>
              <div class="ohs-score-box__num">${previewScore}</div>
            </div>
            <label class="k-field"><span class="k-field__label">Control Measures Description</span><input class="k-input" value="${d.control_description}" placeholder="Specific engineering or admin controls…" data-haz="control_description"></label>
            <div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary">Register Hazard</button></div>
          </form>
        </div>
      </section>
    </div>

    <section class="tk-sheet">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">${icon('shield', { size: 18 })} Severity-Banded Hazard Register</h2>
        <span class="tk-sheet__count">${filtered.length} of ${state.hazards.length}</span>
        ${state.matrixCell || state.hazardRatingFilter !== 'All' ? html`
          <div class="tk-sheet__actions">
            <button type="button" class="k-btn k-btn--sm" data-action="rm-clear">Show All Hazards</button>
          </div>` : ''}
      </div>
      <div class="tk-sheet__body">
        ${loadingHz ? skeleton(3) : filtered.length ? html`
          <div class="ohs-card-list">
            ${filtered.map((h) => {
              const inhPct = Math.min(100, Math.round((Number(h.risk_score || 0) / 25) * 100));
              const resPct = Math.min(100, Math.round((Number(h.residual_risk || 0) / 25) * 100));
              const fillCls = h.residual_risk >= 10 ? 'tk-bar__fill--bad' : h.residual_risk >= 5 ? 'tk-bar__fill--warn' : 'tk-bar__fill--ok';
              return html`
                <article class="ohs-haz-card ${hazBandClass(h)}" data-key="hz-${h.id}">
                  <div class="ohs-card__top">
                    <div class="ohs-card__head">
                      <div class="ohs-card__title">
                        <span>${h.hazard_title}</span>
                        <span class="tk-tag ohs-risk-${String(h.risk_rating || 'low').toLowerCase()}">${h.risk_rating} · ${h.risk_score} (L${h.likelihood}×C${h.consequence})</span>
                        <span class="tk-tag">${h.hazard_type}</span>
                        <span class="tk-tag ${h.status === 'Open' ? 'tk-tag--warn' : 'tk-tag--ok'}">${h.status}</span>
                        ${h.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="ohs-card__meta">
                        <span>Location: <strong>${h.location}</strong></span>
                        <span>Hierarchy: <strong>${h.control_type}</strong></span>
                        <span>Reported by: ${h.reported_by}</span>
                      </div>
                    </div>
                    <div class="ohs-card__actions">
                      <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="haz-status" data-id="${h.id}" aria-label="Hazard status">
                        ${['Open', 'Controlled', 'Closed'].map((st) => html`<option value="${st}" ${st === h.status ? 'selected' : ''}>${st}</option>`)}
                      </select>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="haz-del" data-id="${h.id}">Delete</button>
                    </div>
                  </div>
                  <div class="ohs-risk-meter">
                    <div class="ohs-risk-meter__head">
                      <span>Inherent Risk ${h.risk_score}/25 (${inhPct}%) → Residual <strong style="color:var(--k-text)">${h.residual_risk}/25</strong></span>
                      <span>${h.control_type}</span>
                    </div>
                    <div class="tk-bar"><div class="tk-bar__fill ${fillCls}" style="width:${resPct}%"></div></div>
                    ${h.control_description ? html`<div class="tk-muted" style="font-size:12.5px;margin-top:2px">${h.control_description}</div>` : ''}
                  </div>
                </article>`;
            })}
          </div>` : emptyState({
            iconName: 'hazard-matrix',
            title: 'No hazards in selected cell/filter',
            text: 'Click another 5×5 matrix cell or reset the filter to view all hazards.',
            action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="rm-clear">Show All Hazards</button>`,
          })}
      </div>
    </section>`;
}

export function wireIncidentHazardActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="ohs-inc-tab"]', (e, el) => { state.incTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="ohs-inc-filter"]', (e, el) => { state.incFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="ohs-inc-new"]', async () => {
    const made = await formDialog({
      title: 'Report Workplace Incident',
      submitLabel: 'Submit Report',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">Incident Title</span><input class="k-input" name="incident_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="incident_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="incident_time" value="09:30"></label>
          <label class="k-field"><span class="k-field__label">Location</span><input class="k-input" name="location" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Incident Type</span><select class="k-input" name="incident_type">${INC_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${INC_SEVS.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select></label>
        </div>
        <label class="k-check"><input type="checkbox" name="lost_time_injury"><span><strong>Lost-Time Injury (LTI)</strong> — worker unable to return for next scheduled shift</span></label>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="2" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Immediate Actions Taken</span><input class="k-input" name="immediate_actions"></label>
        <label class="k-field"><span class="k-field__label">Initial Root Cause</span><input class="k-input" name="root_cause"></label>`,
      onSubmit: (v) => api.post('/api/incidents', v),
    });
    if (made) { state.incTab = 'incidents'; toast.success(`Incident ${made.incident.incident_code} logged.`); await loadScreen('/incidents'); }
  });

  on(root, 'change', '[data-action="ohs-inc-status"]', async (e, el) => {
    try { await api.post('/api/incidents/status', { id: Number(el.dataset.id), investigation_status: el.value }); toast.success('Investigation status updated.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ohs-inc-advance"]', async (e, el) => {
    try { await api.post('/api/incidents/status', { id: Number(el.dataset.id), investigation_status: el.dataset.status }); toast.success(`Incident moved to ${el.dataset.status}.`); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ohs-inc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete incident?', message: 'Removes this incident and any linked injury records.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/incidents', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ohs-inj-new"]', async () => {
    const made = await formDialog({
      title: 'Log Workplace Injury & RTW Plan',
      submitLabel: 'Save Injury Record',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" required></label>
          <label class="k-field"><span class="k-field__label">Related Incident</span>
            <select class="k-input" name="incident_id">
              <option value="">None / Standalone</option>
              ${state.incidents.map((i) => html`<option value="${i.id}">${i.incident_code} — ${i.incident_title}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Injury Date</span><input class="k-input" type="date" name="injury_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Injury Type</span><select class="k-input" name="injury_type">${INJ_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Body Part</span><input class="k-input" name="body_part" required placeholder="e.g. Left wrist"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Lost Time Injury?</span><select class="k-input" name="lost_time"><option value="No">No</option><option value="Yes">Yes</option></select></label>
          <label class="k-field"><span class="k-field__label">Expected RTW Date</span><input class="k-input" type="date" name="rtw_date"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Treatment Provided</span><input class="k-input" name="treatment" required placeholder="First aid, medical clinic…"></label>
        <label class="k-field"><span class="k-field__label">Ongoing RTW Notes</span><input class="k-input" name="treatment_notes"></label>`,
      onSubmit: (v) => api.post('/api/injuries', { ...v, incident_id: v.incident_id ? Number(v.incident_id) : null }),
    });
    if (made) { state.incTab = 'injuries'; toast.success('Injury record saved.'); await loadScreen('/incidents'); }
  });
  on(root, 'click', '[data-action="ohs-inj-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete injury record?', message: 'Remove this injury record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/injuries', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });

  // 5x5 Risk Matrix interactions
  on(root, 'click', '[data-action="rm-pick"]', (e, el) => {
    const l = Number(el.dataset.l), c = Number(el.dataset.c);
    if (state.matrixCell && state.matrixCell.l === l && state.matrixCell.c === c) state.matrixCell = null;
    else { state.matrixCell = { l, c }; state.hazardRatingFilter = 'All'; }
    draw();
  });
  on(root, 'click', '[data-action="rm-prefill"]', (e, el) => {
    state.hazardDraft.likelihood = Number(el.dataset.l);
    state.hazardDraft.consequence = Number(el.dataset.c);
    toast.success(`Hazard form set to L${el.dataset.l} × C${el.dataset.c}.`);
    draw();
  });
  on(root, 'click', '[data-action="rm-clear"]', () => { state.matrixCell = null; state.hazardRatingFilter = 'All'; draw(); });
  on(root, 'click', '[data-action="haz-rating-filter"]', (e, el) => { state.matrixCell = null; state.hazardRatingFilter = el.dataset.rating; draw(); });

  on(root, 'input', '[data-haz]', (e, el) => { state.hazardDraft[el.dataset.haz] = el.value; });
  on(root, 'change', '[data-haz]', (e, el) => {
    const k = el.dataset.haz;
    state.hazardDraft[k] = (k === 'likelihood' || k === 'consequence') ? Number(el.value) : el.value;
    draw();
  });

  on(root, 'submit', 'form[data-form="ohs-save-hazard"]', async (e) => {
    e.preventDefault();
    try {
      const d = state.hazardDraft;
      const res = await api.post('/api/hazards', {
        hazard_title: d.hazard_title,
        location: d.location,
        hazard_type: d.hazard_type,
        likelihood: Number(d.likelihood),
        consequence: Number(d.consequence),
        control_type: d.control_type,
        control_description: d.control_description,
      });
      toast.success(`Hazard logged: ${res.hazard.risk_rating} (Score ${res.hazard.risk_score}, Residual ${res.hazard.residual_risk}).`);
      state.hazardDraft.hazard_title = '';
      state.hazardDraft.location = '';
      state.hazardDraft.control_description = '';
      await loadScreen('/hazards');
    } catch (err) { toastError(err); }
  });

  on(root, 'change', '[data-action="haz-status"]', async (e, el) => {
    try { await api.post('/api/hazards/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Hazard status updated.'); await loadScreen('/hazards'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="haz-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete hazard?', message: 'Remove this hazard from the register?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/hazards', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/hazards'); }
    catch (err) { toastError(err); }
  });
}
