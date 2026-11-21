// Shared UI helpers for OHS & QMS:
// Interactive 5x5 Heat-Mapped Risk Matrix, Incident Badges (LTI / Notifiable / Near Miss),
// Overdue CAPA Alert pills, Workflow Steppers & Traffic-Light Training Expiry badges.
import { html, cls } from '../kit/dom.js';
import { today, daysBetween, fmtDay } from '../kit/time.js';
import { icon } from '../kit/icons.js';

export const LIKELIHOOD_LABELS = ['', '1 · Rare', '2 · Unlikely', '3 · Possible', '4 · Likely', '5 · Almost Certain'];
export const LIKELIHOOD_SHORT = ['', 'L1 Rare', 'L2 Unlikely', 'L3 Possible', 'L4 Likely', 'L5 Certain'];
export const CONSEQUENCE_LABELS = ['', '1 · Insignificant', '2 · Minor', '3 · Moderate', '4 · Major', '5 · Catastrophic'];
export const CONSEQUENCE_SHORT = ['', 'C1 Insig.', 'C2 Minor', 'C3 Mod.', 'C4 Major', 'C5 Catast.'];

export function riskRatingFor(score) {
  if (score >= 16) return 'Extreme';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

export function heatLevelFor(score) {
  if (score >= 25) return 8;
  if (score >= 16) return 7;
  if (score >= 15) return 6;
  if (score >= 10) return 5;
  if (score >= 8) return 4;
  if (score >= 5) return 3;
  if (score >= 3) return 2;
  return 1;
}

/** Interactive 5x5 Heat-Mapped Risk Matrix (clickable cells, live counts, legend & active filter chip). */
export function renderRiskMatrix(hazards = [], { selectedCell = null, ratingFilter = 'All', compact = false, action = 'rm-pick' } = {}) {
  const cellCounts = new Map();
  const ratingCounts = { Low: 0, Medium: 0, High: 0, Extreme: 0 };
  for (const h of hazards) {
    const key = `${h.likelihood}-${h.consequence}`;
    cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
    const r = h.risk_rating || riskRatingFor(Number(h.likelihood) * Number(h.consequence));
    if (ratingCounts[r] !== undefined) ratingCounts[r]++;
  }

  const selScore = selectedCell ? selectedCell.l * selectedCell.c : 0;
  const selRating = selectedCell ? riskRatingFor(selScore) : '';
  const selCount = selectedCell ? (cellCounts.get(`${selectedCell.l}-${selectedCell.c}`) || 0) : 0;

  return html`
    <div class="rm-wrap">
      <div class="${cls('rm-grid', { 'rm-grid--compact': compact })}">
        <div class="rm-axis rm-axis--corner">
          <span class="rm-axis__full">${compact ? 'L ↓ / C →' : 'Likelihood ↓ / Consequence →'}</span>
          <span class="rm-axis__xs">L / C</span>
        </div>
        ${[1, 2, 3, 4, 5].map((c) => html`
          <div class="rm-axis">
            <span class="rm-axis__full">${compact ? CONSEQUENCE_SHORT[c] : CONSEQUENCE_LABELS[c]}</span>
            <span class="rm-axis__xs">C${c}</span>
          </div>`)}
        ${[5, 4, 3, 2, 1].map((l) => html`
          <div class="rm-axis rm-axis--row">
            <span class="rm-axis__full">${compact ? LIKELIHOOD_SHORT[l] : LIKELIHOOD_LABELS[l]}</span>
            <span class="rm-axis__xs">L${l}</span>
          </div>
          ${[1, 2, 3, 4, 5].map((c) => {
            const sc = l * c;
            const heat = heatLevelFor(sc);
            const rt = riskRatingFor(sc);
            const cnt = cellCounts.get(`${l}-${c}`) || 0;
            const isSel = selectedCell && selectedCell.l === l && selectedCell.c === c;
            return html`
              <button type="button" class="${cls('rm-cell', `rm-heat-${heat}`, { 'is-selected': isSel })}" data-action="${action}" data-l="${l}" data-c="${c}" title="Likelihood ${l} × Consequence ${c} = ${sc} (${rt}) · ${cnt} hazard${cnt === 1 ? '' : 's'}">
                <span class="rm-cell__score">${sc}</span>
                ${cnt > 0 ? html`<span class="rm-cell__cnt">${cnt}</span>` : ''}
              </button>`;
          })}`)}
      </div>
    </div>
    ${compact ? html`
      <div class="rm-legend rm-legend--compact">
        <span class="rm-legend-pill rm-legend-pill--low"><span class="rm-legend-swatch rm-legend-swatch--low"></span>Low · ${ratingCounts.Low}</span>
        <span class="rm-legend-pill rm-legend-pill--med"><span class="rm-legend-swatch rm-legend-swatch--med"></span>Medium · ${ratingCounts.Medium}</span>
        <span class="rm-legend-pill rm-legend-pill--high"><span class="rm-legend-swatch rm-legend-swatch--high"></span>High · ${ratingCounts.High}</span>
        <span class="rm-legend-pill rm-legend-pill--ext"><span class="rm-legend-swatch rm-legend-swatch--ext"></span>Extreme · ${ratingCounts.Extreme}</span>
      </div>` : html`
      <div class="rm-legend">
        <button type="button" class="${cls('rm-legend-btn', { 'is-on': !selectedCell && ratingFilter === 'All' })}" data-action="haz-rating-filter" data-rating="All">All (${hazards.length})</button>
        <button type="button" class="${cls('rm-legend-btn', { 'is-on': !selectedCell && ratingFilter === 'Low' })}" data-action="haz-rating-filter" data-rating="Low"><span class="rm-legend-swatch rm-legend-swatch--low"></span>Low 1–4 (${ratingCounts.Low})</button>
        <button type="button" class="${cls('rm-legend-btn', { 'is-on': !selectedCell && ratingFilter === 'Medium' })}" data-action="haz-rating-filter" data-rating="Medium"><span class="rm-legend-swatch rm-legend-swatch--med"></span>Medium 5–9 (${ratingCounts.Medium})</button>
        <button type="button" class="${cls('rm-legend-btn', { 'is-on': !selectedCell && ratingFilter === 'High' })}" data-action="haz-rating-filter" data-rating="High"><span class="rm-legend-swatch rm-legend-swatch--high"></span>High 10–15 (${ratingCounts.High})</button>
        <button type="button" class="${cls('rm-legend-btn', { 'is-on': !selectedCell && ratingFilter === 'Extreme' })}" data-action="haz-rating-filter" data-rating="Extreme"><span class="rm-legend-swatch rm-legend-swatch--ext"></span>Extreme 16–25 (${ratingCounts.Extreme})</button>
      </div>
      ${selectedCell || ratingFilter !== 'All' ? html`
        <div class="rm-active-filter">
          <span>
            ${selectedCell
              ? `Filtered by Cell L${selectedCell.l} × C${selectedCell.c} · Score ${selScore} (${selRating}) — ${selCount} matching hazard${selCount === 1 ? '' : 's'}`
              : `Filtered by Risk Tier: ${ratingFilter} (${ratingCounts[ratingFilter] || 0} hazard${(ratingCounts[ratingFilter] || 0) === 1 ? '' : 's'})`}
          </span>
          <div class="tk-btn-row">
            ${selectedCell ? html`<button type="button" class="k-btn k-btn--sm" data-action="rm-prefill" data-l="${selectedCell.l}" data-c="${selectedCell.c}">Use L${selectedCell.l}×C${selectedCell.c} in Form</button>` : ''}
            <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="rm-clear">Show All</button>
          </div>
        </div>` : ''}`}`;
}

/** Crisp non-wrapping incident classification & regulatory badges (LTI, Notifiable, Near Miss). */
export function renderIncidentBadges(inc) {
  const isLti = !!inc.lost_time_injury;
  const isNotifiable = inc.severity === 'Critical' || (inc.incident_type === 'Injury' && isLti);
  const isNearMiss = inc.incident_type === 'Near Miss';
  const sevTone = inc.severity === 'Critical' || inc.severity === 'High' ? 'tk-tag--bad' : inc.severity === 'Medium' ? 'tk-tag--warn' : 'tk-tag--ok';
  return html`
    <span class="tk-tag ${sevTone}">${inc.severity}</span>
    ${isNearMiss ? html`<span class="ohs-badge-nearmiss">Near Miss</span>` : html`<span class="tk-tag">${inc.incident_type}</span>`}
    ${isLti ? html`<span class="ohs-badge-lti" title="Lost-Time Injury">LTI</span>` : ''}
    ${isNotifiable ? html`<span class="ohs-badge-notifiable" title="WHS Statutory Notifiable Incident">Notifiable</span>` : ''}`;
}

/** Stage stepper for Incidents (4-stage), CAPAs / CARs / NCRs / Complaints (3-stage). */
export function renderWorkflowStepper(stages, currentStage) {
  const curIdx = Math.max(0, stages.indexOf(currentStage));
  const isFinal = curIdx === stages.length - 1;
  return html`
    <div class="${cls('ohs-stepper', { 'ohs-stepper--3': stages.length === 3 })}" aria-label="Workflow progress">
      ${stages.map((st, idx) => {
        const done = idx < curIdx || (isFinal && idx === curIdx);
        const now = !isFinal && idx === curIdx;
        return html`
          <div class="${cls('ohs-step', { 'is-done': done, 'is-now': now })}">
            ${done ? icon('check', { size: 11 }) : html`<span>${idx + 1}.</span>`}
            <span>${st}</span>
          </div>`;
      })}
    </div>`;
}

/** Clear Overdue CAPA Alert badge ("Overdue by Xd") or remaining days countdown. */
export function renderCapaDuePill(dueDate, status) {
  if (status === 'Verified Closed' || status === 'Closed') {
    return html`<span class="ohs-tl-pill ohs-tl-pill--green"><span class="ohs-tl-pill__dot"></span>Closed</span>`;
  }
  if (!dueDate) return '';
  const diff = daysBetween(today(), dueDate);
  if (diff < 0) {
    return html`<span class="ohs-overdue-pill" title="Due ${fmtDay(dueDate)}">${icon('alert', { size: 12 })} Overdue ${Math.abs(diff)}d</span>`;
  }
  if (diff === 0) {
    return html`<span class="ohs-overdue-pill" title="Due today">${icon('clock', { size: 12 })} Due Today</span>`;
  }
  if (diff <= 7) {
    return html`<span class="ohs-tl-pill ohs-tl-pill--amber" title="Due ${fmtDay(dueDate)}"><span class="ohs-tl-pill__dot"></span>Due in ${diff}d</span>`;
  }
  return html`<span class="tk-tag" title="Due ${fmtDay(dueDate)}">${diff}d left</span>`;
}

/** Traffic-light training expiry helper: Red (Expired), Amber (<=30d), Green (Current). */
export function trainingTrafficMeta(expiryDate) {
  if (!expiryDate) return { light: 'green', status: 'Current', label: 'Current · Permanent', days: null };
  const diff = daysBetween(today(), expiryDate);
  if (diff < 0) return { light: 'red', status: 'Expired', label: `Expired · ${Math.abs(diff)}d ago`, days: diff };
  if (diff === 0) return { light: 'red', status: 'Expired', label: 'Expires Today', days: 0 };
  if (diff <= 30) return { light: 'amber', status: 'Expiring Soon', label: `Due in ${diff}d`, days: diff };
  return { light: 'green', status: 'Current', label: `Current · ${diff}d`, days: diff };
}

export function renderTrafficPill(meta) {
  return html`<span class="ohs-tl-pill ohs-tl-pill--${meta.light}"><span class="ohs-tl-pill__dot"></span>${meta.label}</span>`;
}
