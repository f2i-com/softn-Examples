// Repair Pipeline Command — ESD Graphite, Circuit Cyan & Solder Amber Masthead with SLA Ring,
// Two-Column Bench Deck/Board (Stage-Colored Tickets with IMEI, Intake Condition & Quote Tags)
// + Sticky Parts-Waiting & QA Pass-Rate Ring Operational Rail.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, fmtDayNear, daysBetween } from '../../kit/time.js';
import { money } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const STAGES = [
  { key: 'Intake', label: 'Intake', short: 'In', next: 'Diagnosing', nextLabel: 'Start Diagnosis' },
  { key: 'Diagnosing', label: 'Diagnosing', short: 'Diag', next: 'Repairing', nextLabel: 'Start Repair' },
  { key: 'Awaiting Parts', label: 'Awaiting Parts', short: 'Parts', next: 'Repairing', nextLabel: 'Parts Ready' },
  { key: 'Repairing', label: 'Repairing', short: 'Bench', next: 'QA Check', nextLabel: 'Send to QA' },
  { key: 'QA Check', label: 'QA Check', short: 'QA', next: 'Ready for Pickup', nextLabel: 'Pass → Ready' },
  { key: 'Ready for Pickup', label: 'Ready for Pickup', short: 'Ready', next: 'Collected', nextLabel: 'Mark Collected' },
];
const STAGE_MAP = new Map(STAGES.map((s) => [s.key, s]));
const ALL_STAGES = ['Intake', 'Diagnosing', 'Awaiting Parts', 'Repairing', 'QA Check', 'Ready for Pickup', 'Collected'];
const DEVICE_TYPES = ['Phone', 'Laptop', 'Tablet', 'Console', 'Desktop', 'Other'];
const ISSUE_TYPES = ['Screen', 'Battery', 'Charging', 'Water damage', 'Software', 'Data recovery', 'Other'];
const PRIORITIES = ['Standard', 'Express'];

/** Exported 6-step visual repair progress bar (Intake -> Diagnosing -> Awaiting Parts -> Repairing -> QA -> Ready). */
export function renderRepairStepper(status) {
  const isCollected = status === 'Collected';
  const idx = isCollected ? 5 : Math.max(0, STAGES.findIndex((s) => s.key === status));
  const isReady = status === 'Ready for Pickup' || isCollected;
  const isParts = status === 'Awaiting Parts';
  return html`
    <div class="rb-stepper" aria-label="Repair progress: ${status}">
      <div class="rb-stepper__head">
        <span>Step ${idx + 1}/6</span>
        <span class="rb-stepper__stage">${isCollected ? 'Collected' : STAGES[idx].label}</span>
      </div>
      <div class="rb-stepper__bars">
        ${STAGES.map((st, i) => html`
          <span class="${cls('rb-stepper__seg', {
            'is-ready': isReady && i <= idx,
            'is-done': !isReady && i < idx,
            'is-amber': !isReady && isParts && i === idx,
            'is-now': !isReady && !isParts && i === idx,
          })}" title="${st.label}"></span>`)}
      </div>
      <div class="rb-stepper__labels">
        ${STAGES.map((st, i) => html`
          <span class="${cls('rb-stepper__lbl', {
            'is-ready': isReady && i === idx,
            'is-now': !isReady && i === idx,
          })}">${st.short}</span>`)}
      </div>
    </div>`;
}

/** Shared pickup ready SMS formatter with ticket #, device model, final total & store contact info. */
export function buildPickupReadySms(j, settings) {
  const cur = settings.currency || 'AUD';
  const total = money(j.quote_amount_cents || 0, { currency: cur });
  const contactParts = [
    settings.address ? `Pickup at ${settings.address}` : '',
    settings.phone ? `Tel: ${settings.phone}` : '',
    settings.email ? settings.email : '',
  ].filter(Boolean);
  const contactLine = contactParts.length ? ` ${contactParts.join(' · ')}.` : '';
  return `Hi ${j.customer_name}, your ${j.brand} ${j.model} (Ticket ${j.ticket_code}) at ${settings.business_name} has passed QA and is ready for pickup! Final total: ${total}. Please quote ${j.ticket_code} at collection.${contactLine}`;
}

function partsEtaInfo(jobId, parts, todayStr) {
  const linked = (parts || []).filter((p) => Number(p.repair_job_id) === Number(jobId) && p.status !== 'Cancelled');
  if (!linked.length) return null;
  const transit = linked.filter((p) => p.status === 'Ordered' || p.status === 'Shipped' || p.status === 'Backordered');
  if (transit.length) {
    const withEta = transit.filter((p) => p.eta).sort((a, b) => String(a.eta).localeCompare(String(b.eta)));
    if (withEta.length) {
      const nextEta = withEta[0].eta;
      const gap = daysBetween(todayStr, nextEta);
      if (gap < 0) return { clsName: 'rb-eta-pill--late', text: `Parts Late ${Math.abs(gap)}d` };
      return { clsName: 'rb-eta-pill--transit', text: `Parts ETA ${fmtDayNear(nextEta)}` };
    }
    return { clsName: 'rb-eta-pill--transit', text: `${transit.length} Part(s) Ordered` };
  }
  const arrived = linked.filter((p) => p.status === 'Arrived');
  if (arrived.length) return { clsName: 'rb-eta-pill--arrived', text: `Parts Arrived (${arrived.length})` };
  return null;
}

function ticketTone(j) {
  if (j.status === 'Ready for Pickup' || j.status === 'Collected') return 'rb-ticket--ready';
  if (j.priority === 'Express') return 'rb-ticket--express';
  if (j.status === 'Awaiting Parts') return 'rb-ticket--parts';
  if (j.status === 'QA Check') return 'rb-ticket--qa';
  return 'rb-ticket--standard';
}

function renderTicketCard(j, state, currency, todayStr) {
  const col = STAGE_MAP.get(j.status) || { next: null, nextLabel: '' };
  const slaGap = j.due_date ? daysBetween(todayStr, j.due_date) : null;
  const isOverdue = j.status !== 'Collected' && slaGap !== null && slaGap < 0;
  const isDueToday = j.status !== 'Collected' && slaGap === 0;
  const etaInfo = partsEtaInfo(j.id, state.parts, todayStr);
  const hasPasscodeNote = /passcode|pin|lock/i.test(`${j.notes || ''} ${j.condition_notes || ''}`);

  return html`
    <article class="rb-ticket ${ticketTone(j)}" data-key="job-${j.id}">
      <div class="rb-ticket__header">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <span class="rb-code">${j.ticket_code}</span>
          <span class="rb-ticket__issue-pill">${j.issue_type}</span>
          <span class="rb-ticket__issue-pill">${j.status}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${j.priority === 'Express' ? html`<span class="rb-priority-express">${icon('zap', { size: 11 })} Express</span>` : ''}
          ${j.is_sample ? html`<span class="tk-tag tk-tag--sample" style="color:#cbd5e1;border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08)">Sample</span>` : ''}
        </div>
      </div>
      <div class="rb-ticket__body">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">
          <div style="font-weight:750;font-size:15.5px;line-height:1.25">${j.brand} ${j.model} <span class="tk-muted" style="font-weight:600;font-size:13px">(${j.device_type})</span></div>
          <span class="rb-quote-pill">Quote ${money(j.quote_amount_cents || 0, { currency })}</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          ${j.serial ? html`
            <button type="button" class="rb-serial-chip" data-action="copy-ticket-serial" data-val="${j.serial}" title="Copy Serial / IMEI">
              <span class="rb-serial-chip__lbl">IMEI/SN</span>
              <span class="rb-serial-chip__val">${j.serial}</span>
              ${icon('copy', { size: 11 })}
            </button>` : ''}
          ${hasPasscodeNote ? html`<span class="tk-tag tk-tag--warn">${icon('lock', { size: 11 })} Passcode Noted</span>` : ''}
          ${isOverdue
            ? html`<span class="rb-sla-pill rb-sla-pill--overdue">${icon('alert', { size: 11 })} SLA Overdue ${Math.abs(slaGap)}d</span>`
            : isDueToday
              ? html`<span class="rb-sla-pill rb-sla-pill--today">${icon('clock', { size: 11 })} Due Today</span>`
              : j.due_date
                ? html`<span class="rb-sla-pill rb-sla-pill--ok">Due ${fmtDayNear(j.due_date)}</span>`
                : ''}
          ${etaInfo ? html`<span class="${cls('rb-eta-pill', etaInfo.clsName)}">${icon('box', { size: 11 })} ${etaInfo.text}</span>` : ''}
          ${j.status === 'Ready for Pickup' && j.customer_notified ? html`<span class="tk-tag tk-tag--ok">${icon('check', { size: 11 })} Notified</span>` : ''}
        </div>

        ${renderRepairStepper(j.status)}

        <div class="tk-ticket__meta">
          <strong>${j.customer_name}</strong> · Tech: <strong>${j.technician_name}</strong>
          ${j.customer_phone ? ` · ${j.customer_phone}` : ''}
        </div>
        ${j.condition_notes ? html`<div class="rb-cond-tag">${icon('shield', { size: 12 })} <span>Intake: ${j.condition_notes}</span></div>` : ''}
        ${j.notes ? html`<div class="tk-muted" style="font-size:12.5px">${j.notes}</div>` : ''}

        <div class="tk-ticket__foot">
          ${col.next ? html`
            <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-advance" data-id="${j.id}" data-status="${col.next}">${col.nextLabel}</button>` : ''}
          ${j.status === 'Repairing' || j.status === 'QA Check' ? html`
            <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="job-open-qa" data-id="${j.id}">${icon('circuit-check', { size: 13 })} Run QA</button>` : ''}
          ${j.status === 'Ready for Pickup' ? html`
            <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="job-pickup-sms" data-id="${j.id}">${icon('copy', { size: 13 })} Pickup SMS</button>` : ''}
          <button type="button" class="k-btn k-btn--sm" data-action="job-claim" data-id="${j.id}">${icon('printer', { size: 13 })} Claim</button>
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
        </div>
      </div>
    </article>`;
}

function quickIntakeFields(state) {
  const activeTechs = state.technicians.filter((t) => t.active === 'Active');
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer</span>
        <select class="k-input" name="customer_id" required>
          <option value="">Select customer…</option>
          ${state.customers.map((c) => html`<option value="${c.id}">${c.name} (${c.phone})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Assigned Bench Tech</span>
        <select class="k-input" name="technician_id" required>
          ${activeTechs.map((t) => html`<option value="${t.id}">${t.name}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Device Type</span>
        <select class="k-input" name="device_type">${DEVICE_TYPES.map((dt) => html`<option value="${dt}">${dt}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Brand</span><input class="k-input" name="brand" placeholder="Apple, Samsung, Dell" required></label>
      <label class="k-field"><span class="k-field__label">Model</span><input class="k-input" name="model" placeholder="iPhone 15 Pro, XPS 13" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Serial / IMEI</span><input class="k-input tk-mono" name="serial" placeholder="Serial or 15-digit IMEI"></label>
      <label class="k-field"><span class="k-field__label">Issue Type</span>
        <select class="k-input" name="issue_type">${ISSUE_TYPES.map((it) => html`<option value="${it}">${it}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">${PRIORITIES.map((p) => html`<option value="${p}">${p}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Quote Amount</span><input class="k-input" type="number" step="0.50" min="0" name="quote_amount" placeholder="199.00"></label>
      <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 2)}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Intake Condition Notes</span><input class="k-input" name="condition_notes" placeholder="Scratches, cracked glass, missing screws…"></label>
    <label class="k-field"><span class="k-field__label">Fault &amp; Repair Notes</span><textarea class="k-input" name="notes" rows="2" placeholder="Reported fault, passcode policy, approval notes…"></textarea></label>`;
}

function editJobFields(state, j) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Pipeline Stage</span>
        <select class="k-input" name="status">${ALL_STAGES.map((st) => html`<option value="${st}" ${st === j.status ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Technician</span>
        <select class="k-input" name="technician_id">${state.technicians.map((t) => html`<option value="${t.id}" ${t.id === j.technician_id ? 'selected' : ''}>${t.name}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">${PRIORITIES.map((p) => html`<option value="${p}" ${p === j.priority ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Issue Type</span>
        <select class="k-input" name="issue_type">${ISSUE_TYPES.map((it) => html`<option value="${it}" ${it === j.issue_type ? 'selected' : ''}>${it}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Quote Amount</span><input class="k-input" type="number" step="0.50" min="0" name="quote_amount" value="${(j.quote_amount_cents / 100).toFixed(2)}"></label>
      <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${j.due_date || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Bench Notes</span><textarea class="k-input" name="notes" rows="3">${j.notes || ''}</textarea></label>`;
}

export function renderPipelineView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.jobSearch || '').trim().toLowerCase();

  const cols = state.showCollected
    ? [...STAGES, { key: 'Collected', label: 'Collected', short: 'Done', next: null }]
    : STAGES;

  const baseJobs = state.jobs.filter((j) => {
    if (state.techFilter !== 'All' && String(j.technician_id) !== String(state.techFilter)) return false;
    if (q) {
      const hay = `${j.ticket_code || ''} ${j.brand || ''} ${j.model || ''} ${j.serial || ''} ${j.customer_name || ''} ${j.issue_type || ''} ${j.technician_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const stageCounts = new Map();
  for (const j of baseJobs) stageCounts.set(j.status, (stageCounts.get(j.status) || 0) + 1);

  const visibleJobs = state.stageFilter === 'All'
    ? baseJobs
    : baseJobs.filter((j) => j.status === state.stageFilter);

  const openActiveCount = Math.max(state.jobs.filter((j) => j.status !== 'Collected').length, Number(counts.activeJobs || 0));
  const overdueCount = Number(counts.overdueJobs || 0);
  const onTimeCount = Math.max(0, openActiveCount - overdueCount);
  const slaPct = openActiveCount > 0 ? Math.round((onTimeCount / openActiveCount) * 100) : 100;
  const slaColor = slaPct >= 85 ? '#22d3ee' : slaPct >= 60 ? '#f59e0b' : '#f87171';

  const qaTotal = (state.checks || []).length;
  const qaPass = (state.checks || []).filter((c) => c.result === 'Pass').length;
  const qaPct = qaTotal > 0 ? Math.round((qaPass / qaTotal) * 100) : 100;

  const waitingParts = (state.parts || []).filter((p) => p.status === 'Ordered' || p.status === 'Shipped' || p.status === 'Backordered');
  const readyJobs = state.jobs.filter((j) => j.status === 'Ready for Pickup' || j.status === 'QA Check');
  const activeTechs = state.technicians.filter((t) => t.active === 'Active');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="rb-masthead" aria-label="Hardware Bench Command">
      <div class="rb-masthead__copy">
        <div class="rb-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#22d3ee"></span>
          ESD REPAIR BENCH · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="rb-masthead__title">Repair Pipeline</h1>
        <div class="rb-masthead__meta">
          <span><strong style="color:#a5f3fc">${counts.activeJobs || 0} active ticket${counts.activeJobs === 1 ? '' : 's'}</strong> on bench</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${activeTechs.length} bench tech${activeTechs.length === 1 ? '' : 's'} active</span>
        </div>
      </div>

      <div class="rb-masthead__pods" style="align-items:center">
        <div class="rb-pod rb-pod--ring rb-pod--cyan" aria-label="SLA on-time ${slaPct}%">
          <div class="tk-ring" style="--p:${slaPct}%;--ring-color:${slaColor};--ring-size:48px">
            <span class="tk-ring__val">${slaPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="rb-pod__lbl">SLA On-Time</span>
            <span class="rb-pod__val" style="font-size:16.5px">${onTimeCount}/${openActiveCount}</span>
            <span class="rb-pod__sub">${overdueCount ? `${overdueCount} overdue` : 'On schedule'}</span>
          </div>
        </div>

        <div class="rb-pod rb-pod--amber">
          <span class="rb-pod__lbl">${icon('dollar', { size: 12 })} Quoted</span>
          <span class="rb-pod__val">${money(counts.quotedOpenCents || 0, { currency })}</span>
          <span class="rb-pod__sub">Open bench</span>
        </div>

        <a href="#/parts" class="rb-pod">
          <span class="rb-pod__lbl">${icon('box', { size: 12 })} Parts</span>
          <span class="rb-pod__val">${counts.waitingParts || 0}</span>
          <span class="rb-pod__sub">In transit →</span>
        </a>

        <a href="#/qa" class="${cls('rb-pod rb-pod--wide-sm', { 'rb-pod--alert': overdueCount > 0 || (counts.toNotify || 0) > 0 })}">
          <span class="rb-pod__lbl">${icon('circuit-check', { size: 12 })} Ready</span>
          <span class="rb-pod__val">${counts.readyPickup || 0}</span>
          <span class="rb-pod__sub">${counts.toNotify ? `${counts.toNotify} SMS due →` : 'Pickup desk →'}</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="quick-intake">${icon('plus', { size: 15 })} New Intake</button>
      </div>
    </section>

    <div class="rb-split">
      <div class="tk-stack" style="gap:14px">
        <div class="rb-filter-bar">
          <div class="rb-filter-bar__row">
            <label class="tk-search" style="min-height:34px;flex:1 1 200px;max-width:290px">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="job-search" value="${state.jobSearch}" placeholder="Search RB-#, IMEI or device…">
            </label>
            <div class="tk-segmented" role="tablist" aria-label="Pipeline view mode">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.pipelineLayout === 'Deck' })}" data-action="pipeline-layout" data-layout="Deck">${icon('list', { size: 13 })} Deck</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.pipelineLayout === 'Board' })}" data-action="pipeline-layout" data-layout="Board">${icon('grid', { size: 13 })} Board</button>
            </div>
            <button type="button" class="k-btn k-btn--sm" style="margin-left:auto" data-action="toggle-collected">
              ${state.showCollected ? 'Hide Collected' : 'Show Collected'}
            </button>
          </div>
          <div class="rb-filter-bar__row">
            <div class="tk-segmented" role="tablist" aria-label="Filter by pipeline stage">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.stageFilter === 'All' })}" data-action="stage-filter" data-stage="All">All (${baseJobs.length})</button>
              ${cols.map((col) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.stageFilter === col.key })}" data-action="stage-filter" data-stage="${col.key}">
                  ${col.short} <span style="opacity:.65;font-size:11px;margin-left:2px">${stageCounts.get(col.key) || 0}</span>
                </button>`)}
            </div>
            <div class="tk-segmented" role="tablist" aria-label="Filter by technician">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.techFilter === 'All' })}" data-action="filter-tech" data-id="All">All Techs</button>
              ${activeTechs.map((t) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': String(state.techFilter) === String(t.id) })}" data-action="filter-tech" data-id="${t.id}">${t.name}</button>`)}
            </div>
          </div>
        </div>

        ${state.loading && !state.jobs.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : visibleJobs.length ? (
          state.pipelineLayout === 'Board' ? html`
            <div class="rb-board-wrap">
              <div class="tk-board">
                ${cols.map((col) => {
                  const cards = visibleJobs.filter((j) => j.status === col.key);
                  return html`
                    <div class="tk-col" data-key="col-${col.key}">
                      <div class="tk-col__head">
                        <span>${col.label}</span>
                        <span class="k-badge">${cards.length}</span>
                      </div>
                      ${cards.length ? cards.map((j) => renderTicketCard(j, state, currency, todayStr)) : html`<p class="tk-muted" style="font-size:13px;padding:10px 4px">Clear</p>`}
                    </div>`;
                })}
              </div>
            </div>` : html`
            <div class="rb-deck">
              ${visibleJobs.map((j) => renderTicketCard(j, state, currency, todayStr))}
            </div>`
        ) : html`<section class="tk-sheet">${emptyState({
          iconName: 'microchip',
          title: 'Bench pipeline is clear',
          text: 'Check in a customer device to generate a claim ticket and open a repair job.',
          action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="quick-intake">${icon('plus', { size: 15 })} New Device Intake</button>`,
        })}</section>`}
      </div>

      <aside class="rb-rail-panel" aria-label="Parts Waiting and QA Pass-Rate Rail">
        <section class="rb-rail-card">
          <div class="rb-rail-card__head">
            <span class="rb-rail-card__title">${icon('circuit-check', { size: 14 })} QA Pass Rate &amp; Pickup</span>
            <a href="#/qa" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">QA Bench</a>
          </div>
          <div class="rb-rail-qa-hero">
            <div class="tk-ring" style="--p:${qaPct}%;--ring-color:${qaPct >= 85 ? '#10b981' : '#f59e0b'};--ring-size:50px">
              <span class="tk-ring__val">${qaPct}%</span>
            </div>
            <div style="display:grid;gap:2px">
              <span style="font-family:var(--k-font-mono);font-size:10px;font-weight:800;letter-spacing:.07em;color:#67e8f9;text-transform:uppercase">8-Point QA Pass Rate</span>
              <span style="font-size:15px;font-weight:800">${qaPass} of ${qaTotal} sign-offs passed</span>
              <span style="font-size:11.5px;color:rgba(203,213,225,.78)">${counts.qaPending || 0} in QA · ${counts.readyPickup || 0} ready</span>
            </div>
          </div>
          ${readyJobs.length ? html`
            <div class="rb-rail-list">
              ${readyJobs.slice(0, 3).map((j) => html`
                <div class="rb-rail-item" data-key="rail-qa-${j.id}">
                  <div class="rb-rail-item__top">
                    <div>
                      <div class="rb-rail-item__name">${j.ticket_code} · ${j.brand} ${j.model}</div>
                      <div class="rb-rail-item__sub">${j.customer_name} · ${money(j.quote_amount_cents || 0, { currency })}</div>
                    </div>
                    <span class="tk-tag ${j.status === 'Ready for Pickup' ? 'tk-tag--ok' : 'tk-tag--info'}">${j.status === 'Ready for Pickup' ? 'Ready' : 'QA'}</span>
                  </div>
                  <div class="rb-rail-item__foot">
                    ${j.status === 'QA Check' ? html`
                      <span class="tk-muted" style="font-size:11.5px">Needs 8-pt test</span>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-open-qa" data-id="${j.id}">Run QA →</button>` : html`
                      <span class="tk-muted" style="font-size:11.5px">${j.customer_notified ? 'Notified ✓' : 'SMS needed'}</span>
                      <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="job-pickup-sms" data-id="${j.id}">${icon('copy', { size: 12 })} SMS</button>`}
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No tickets waiting on QA or pickup.</div>`}
        </section>

        <section class="rb-rail-card">
          <div class="rb-rail-card__head">
            <span class="rb-rail-card__title">${icon('box', { size: 14 })} Parts Waiting</span>
            <a href="#/parts" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.parts.length})</a>
          </div>
          ${waitingParts.length ? html`
            <div class="rb-rail-list">
              ${waitingParts.slice(0, 4).map((p) => {
                const isLate = p.eta && daysBetween(todayStr, p.eta) < 0;
                return html`
                  <div class="rb-rail-item" data-key="rail-pt-${p.id}">
                    <div class="rb-rail-item__top">
                      <div>
                        <div class="rb-rail-item__name">${p.part_name}</div>
                        <div class="rb-rail-item__sub">${p.ticket_code || '#' + p.repair_job_id} · ${p.supplier || 'Supplier'}</div>
                      </div>
                      <span class="tk-tag ${isLate ? 'tk-tag--bad' : 'tk-tag--warn'}">${isLate ? 'Late' : p.status}</span>
                    </div>
                    <div class="rb-rail-item__foot">
                      <span class="tk-muted" style="font-size:11.5px">${p.eta ? `ETA ${fmtDayNear(p.eta)}` : 'No ETA'}</span>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="rail-part-arrived" data-id="${p.id}">Arrived ✓</button>
                    </div>
                  </div>`;
              })}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-success);font-weight:650">All ordered parts arrived on bench ✓</div>`}
        </section>

        <section class="rb-rail-card">
          <div class="rb-rail-card__head">
            <span class="rb-rail-card__title">${icon('solder-iron', { size: 14 })} Bench Technicians</span>
            <a href="#/directory" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Shop</a>
          </div>
          <div class="rb-rail-list">
            ${activeTechs.map((t) => {
              const load = Number(t.active_jobs || 0);
              const pct = Math.min(100, Math.round((load / 5) * 100));
              return html`
                <div class="rb-rail-item">
                  <div class="rb-rail-item__top">
                    <span class="rb-rail-item__name">${t.name}</span>
                    <span style="font-family:var(--k-font-mono);font-size:11.5px;font-weight:800">${load} active</span>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${pct >= 80 ? 'tk-bar__fill--warn' : ''}" style="width:${pct}%"></div></div>
                </div>`;
            })}
          </div>
        </section>
      </aside>
    </div>`;
}

export function wirePipelineActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="job-search"]', (e, el) => { state.jobSearch = el.value; draw(); });
  on(root, 'click', '[data-action="filter-tech"]', (e, el) => { state.techFilter = el.dataset.id; draw(); });
  on(root, 'click', '[data-action="stage-filter"]', (e, el) => { state.stageFilter = el.dataset.stage; draw(); });
  on(root, 'click', '[data-action="pipeline-layout"]', (e, el) => { state.pipelineLayout = el.dataset.layout; draw(); });
  on(root, 'click', '[data-action="toggle-collected"]', () => { state.showCollected = !state.showCollected; loadScreen('/'); });

  on(root, 'click', '[data-action="copy-ticket-serial"]', (e, el) => {
    copyText(el.dataset.val || '', { title: 'Serial / IMEI', done: 'Serial / IMEI copied.' });
  });

  on(root, 'click', '[data-action="rail-part-arrived"]', async (e, el) => {
    try {
      const res = await api.post('/api/parts/status', { id: Number(el.dataset.id), status: 'Arrived' });
      toast.success(res.jobAdvanced ? 'Part arrived — job auto-moved to Repairing!' : 'Part marked Arrived.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="job-open-qa"]', (e, el) => {
    state.qaJobId = el.dataset.id || '';
    router.go('/qa');
  });

  on(root, 'click', '[data-action="job-pickup-sms"]', (e, el) => {
    const j = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    copyText(buildPickupReadySms(j, state.session.settings), {
      title: `Pickup Ready SMS · ${j.ticket_code}`,
      done: 'Pickup Ready SMS copied!',
    });
  });

  on(root, 'click', '[data-action="job-advance"]', async (e, el) => {
    try {
      await api.post('/api/jobs/advance', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Job moved to ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="quick-intake"]', async () => {
    if (!state.customers.length || !state.technicians.length) {
      toast.error('Add at least one customer and active technician under Customers & Techs first.');
      return;
    }
    const made = await formDialog({
      title: 'Device Intake & Open Repair Job',
      submitLabel: 'Open Ticket',
      size: 'lg',
      fields: quickIntakeFields(state),
      onSubmit: (vals) => api.post('/api/jobs/intake', vals),
    });
    if (made) { toast.success(`Ticket ${made.job.ticket_code} opened!`); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="job-edit"]', async (e, el) => {
    const j = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    const saved = await formDialog({
      title: `Edit Ticket ${j.ticket_code}`,
      submitLabel: 'Save job',
      size: 'lg',
      fields: editJobFields(state, j),
      onSubmit: (vals) => api.put('/api/jobs', { ...vals, id: j.id }),
    });
    if (saved) { toast.success(`Ticket ${j.ticket_code} updated.`); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="job-claim"]', (e, el) => {
    const j = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    const settings = state.session.settings;
    const cur = settings.currency || 'AUD';
    downloadHtmlDoc(`claim-ticket-${j.ticket_code}.html`, {
      title: `Customer Claim Ticket · ${j.ticket_code}`,
      businessName: settings.business_name,
      subtitle: [settings.address, settings.phone, settings.email].filter(Boolean).join(' · '),
      accent: '#0891b2',
      bodyHtml: `
        <table>
          <tr><th style="width:190px">Ticket Number</th><td><strong style="font-family:monospace;font-size:17px">${esc(j.ticket_code)}</strong> (${esc(j.priority)})</td></tr>
          <tr><th>Customer</th><td><strong>${esc(j.customer_name)}</strong> · ${esc(j.customer_phone || '')} (${esc(j.preferred_contact || '')})</td></tr>
          <tr><th>Device</th><td>${esc(j.device_type)} — <strong>${esc(j.brand)} ${esc(j.model)}</strong></td></tr>
          <tr><th>Serial / IMEI</th><td style="font-family:monospace">${esc(j.serial || 'Not recorded')}</td></tr>
          <tr><th>Reported Fault</th><td>${esc(j.issue_type)}${j.notes ? ' — ' + esc(j.notes) : ''}</td></tr>
          <tr><th>Intake Condition</th><td>${esc(j.condition_notes || 'Standard wear noted at intake')}</td></tr>
          <tr><th>Assigned Technician</th><td>${esc(j.technician_name)}</td></tr>
          <tr><th>Estimated Due Date</th><td>${j.due_date ? esc(fmtDay(j.due_date)) : 'To be confirmed after diagnosis'}</td></tr>
          <tr class="total-row"><td>Estimated Quote</td><td class="num">${esc(money(j.quote_amount_cents || 0, { currency: cur }))}</td></tr>
        </table>
        <div class="box">
          <strong>Claim &amp; Data Notice</strong>
          <p style="margin:6px 0 0;font-size:13px">Please present ticket <strong>${esc(j.ticket_code)}</strong> when collecting your device. Customers are responsible for backing up data prior to repair. Uncollected devices after 60 days may incur storage fees.</p>
        </div>`,
    });
  });
}
