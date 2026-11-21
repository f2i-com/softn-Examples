// CAPA & Action Items 3-Column Board (Unified Safety Masthead, Closure Ring, CAPA Workflow Steppers & Overdue Alerts)
// + Audits, CARs & NCRs Quality Desk (Unified Masthead, Severity-Banded Cards, Steppers & Printable ISO HTML Reports).
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderCapaDuePill, renderWorkflowStepper } from '../ohs_ui.js';

const CAPA_COLS = ['Open', 'In Progress', 'Verified Closed'];
const NCR_STAGES = ['Open', 'Contained', 'Closed'];
const ACT_SOURCES = ['Incident', 'Hazard', 'Audit', 'Corrective Action Request', 'Non-Conformance', 'Complaint', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const AUD_TYPES = ['Internal', 'External', 'ISO Certification', 'Regulatory', 'Supplier', 'Other'];
const AUD_SEVS = ['Observation', 'Minor Non-Conformance', 'Major Non-Conformance', 'Critical Non-Conformance', 'Opportunity for Improvement'];
const CAR_SOURCES = ['Audit', 'Incident', 'Complaint', 'Non-Conformance Report', 'Other'];
const NCR_TYPES = ['Product', 'Process', 'System', 'Supplier', 'Other'];
const NCR_SEVS = ['Minor', 'Major', 'Critical'];
const NCR_SOURCES = ['Audit', 'Inspection', 'Customer', 'Internal', 'Supplier', 'Other'];
const NCR_DISPS = ['Rework', 'Scrap', 'Accept as Is', 'Return to Supplier', 'Other'];

export function renderCapaView(state) {
  const todayDay = today();
  const overdueList = state.actions.filter((a) => a.status !== 'Verified Closed' && a.due_date && a.due_date < todayDay);
  const closedCount = state.actions.filter((a) => a.status === 'Verified Closed').length;
  const inProgCount = state.actions.filter((a) => a.status === 'In Progress').length;
  const closePct = state.actions.length ? Math.round((closedCount / state.actions.length) * 100) : 100;
  const loadingActions = state.loading && !state.actions.length;

  const filter = state.capaFilter || 'All';
  const visible = state.actions.filter((a) => {
    if (filter === 'Overdue') return a.status !== 'Verified Closed' && a.due_date && a.due_date < todayDay;
    if (filter === 'High') return a.priority === 'Critical' || a.priority === 'High';
    return true;
  });

  return html`
    <section class="ohs-masthead" aria-label="CAPA & Actions Tracker">
      <div class="ohs-masthead__copy">
        <div class="${cls('ohs-masthead__eyebrow', { 'ohs-masthead__eyebrow--alert': overdueList.length > 0, 'ohs-masthead__eyebrow--ok': overdueList.length === 0 })}">
          ${icon('check-square', { size: 12 })} ISO 45001 / 9001 · CAPA WORKFLOW
        </div>
        <h1 class="ohs-masthead__title">CAPA &amp; Actions</h1>
        <div class="ohs-masthead__meta">
          <span>Advance actions Open → In Progress → Verified Closed</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Verifier identity &amp; timestamps stamped on closure</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--ring ohs-pod--emerald" aria-label="CAPA verification rate ${closePct}%">
          <div class="tk-ring" style="--p:${closePct}%;--ring-color:${closePct >= 70 ? '#34d399' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${closePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ohs-pod__lbl">Verified</span>
            <span class="ohs-pod__val" style="font-size:16px">${closedCount}/${state.actions.length}</span>
            <span class="ohs-pod__sub">Closed actions</span>
          </div>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--alert': overdueList.length > 0 })}">
          <span class="ohs-pod__lbl">${icon('alert', { size: 12 })} Overdue</span>
          <span class="ohs-pod__val">${overdueList.length}</span>
          <span class="ohs-pod__sub">Needs escalation</span>
        </div>

        <div class="ohs-pod ohs-pod--amber">
          <span class="ohs-pod__lbl">${icon('clock', { size: 12 })} In Progress</span>
          <span class="ohs-pod__val">${inProgCount}</span>
          <span class="ohs-pod__sub">Active work</span>
        </div>

        <button type="button" class="k-btn ohs-btn-amber" data-action="capa-new">${icon('plus', { size: 16 })} Add CAPA</button>
      </div>
    </section>

    ${overdueList.length > 0 ? html`
      <div class="ohs-overdue-banner" role="alert">
        <span style="display:inline-flex;align-items:center;gap:8px">
          ${icon('alert', { size: 18 })}
          <span><strong>${overdueList.length} Overdue CAPA Action${overdueList.length === 1 ? '' : 's'}</strong> require immediate escalation &amp; verification.</span>
        </span>
        <span class="ohs-overdue-pill">${overdueList.length} Overdue</span>
      </div>` : ''}

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter CAPA items">
        ${[['All', `All (${state.actions.length})`], ['Overdue', `Overdue (${overdueList.length})`], ['High', 'Critical / High']].map(([v, lbl]) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': filter === v })}" data-action="capa-filter" data-filter="${v}">${lbl}</button>`)}
      </div>
    </div>

    ${loadingActions ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="ohs-capa-board">
        ${CAPA_COLS.map((col) => {
          const list = visible.filter((a) => a.status === col);
          return html`
            <div class="tk-col" data-key="col-${col}">
              <div class="tk-col__head">
                <span>${col}</span>
                <span class="tk-tag ${col === 'Verified Closed' ? 'tk-tag--ok' : col === 'In Progress' ? 'tk-tag--info' : 'tk-tag--warn'}">${list.length}</span>
              </div>
              ${list.length ? list.map((a) => {
                const over = col !== 'Verified Closed' && a.due_date && a.due_date < todayDay;
                const tone = over ? 'tk-ticket--bad' : a.priority === 'Critical' || a.priority === 'High' ? 'tk-ticket--warn' : col === 'Verified Closed' ? 'tk-ticket--ok' : '';
                return html`
                  <div class="tk-ticket ${tone}" data-key="act-${a.id}">
                    <div class="tk-ticket__top">
                      <span>${a.action_title}</span>
                      <span class="tk-tag ${a.priority === 'Critical' ? 'tk-tag--bad' : a.priority === 'High' ? 'tk-tag--warn' : ''}">${a.priority}</span>
                    </div>
                    ${a.action_description ? html`<div class="tk-ticket__meta">${a.action_description}</div>` : ''}
                    <div class="tk-ticket__meta">
                      <span>Owner: <strong>${a.assigned_to}</strong></span> · <span>${a.source_type} ${a.source_ref}</span>
                    </div>
                    <div class="tk-ticket__meta" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                      ${renderCapaDuePill(a.due_date, col)}
                      <span>Due ${fmtDay(a.due_date)}</span>
                      ${a.verified_by ? html`<span>· Verified by ${a.verified_by}</span>` : ''}
                    </div>
                    ${renderWorkflowStepper(CAPA_COLS, col)}
                    <div class="tk-ticket__foot">
                      ${col === 'Open' ? html`<button type="button" class="k-btn k-btn--sm" data-action="capa-move" data-id="${a.id}" data-status="In Progress">Start →</button>` : ''}
                      ${col === 'In Progress' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="capa-move" data-id="${a.id}" data-status="Verified Closed">Verify Closed ✓</button>` : ''}
                      ${col === 'Verified Closed' ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="capa-move" data-id="${a.id}" data-status="Open">Reopen</button>` : ''}
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="capa-del" data-id="${a.id}">Delete</button>
                    </div>
                  </div>`;
              }) : html`<div class="tk-muted" style="font-size:13px;padding:8px">No actions in ${col}</div>`}
            </div>`;
        })}
      </div>`}`;
}

export function renderQualityView(state) {
  const loadingQ = state.loading && !state.audits.length && !state.cars.length && !state.ncrs.length;
  const openCars = state.cars.filter((c) => c.status !== 'Verified Closed').length;
  const openNcrs = state.ncrs.filter((n) => n.status !== 'Closed').length;

  return html`
    <section class="ohs-masthead" aria-label="Audits, CARs & NCRs Desk">
      <div class="ohs-masthead__copy">
        <div class="ohs-masthead__eyebrow">
          ${icon('iso-seal', { size: 12 })} ISO 9001 · QUALITY CONFORMANCE
        </div>
        <h1 class="ohs-masthead__title">Audits, CARs &amp; NCRs</h1>
        <div class="ohs-masthead__meta">
          <span>Surveillance audits &amp; root-cause control</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click HTML audit &amp; CAR reports</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--emerald">
          <span class="ohs-pod__lbl">${icon('clipboard', { size: 12 })} Audits</span>
          <span class="ohs-pod__val">${state.audits.length}</span>
          <span class="ohs-pod__sub">Logged reports</span>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--amber': openCars > 0 })}">
          <span class="ohs-pod__lbl">${icon('shield', { size: 12 })} Open CARs</span>
          <span class="ohs-pod__val">${openCars}</span>
          <span class="ohs-pod__sub">of ${state.cars.length} total</span>
        </div>

        <div class="${cls('ohs-pod ohs-pod--banner-sm', { 'ohs-pod--alert': openNcrs > 0 })}">
          <span class="ohs-pod__lbl">${icon('alert', { size: 12 })} Open NCRs</span>
          <span class="ohs-pod__val">${openNcrs}</span>
          <span class="ohs-pod__sub">of ${state.ncrs.length} total</span>
        </div>

        <div class="ohs-cta-group" style="display:flex;gap:7px;flex-wrap:wrap">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="ncr-new">${icon('plus', { size: 14 })} NCR</button>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="car-new">${icon('plus', { size: 14 })} CAR</button>
          <button type="button" class="k-btn ohs-btn-amber k-btn--sm" data-action="audit-new">${icon('clipboard', { size: 14 })} Log Audit</button>
        </div>
      </div>
    </section>

    <div class="ohs-tabs">
      <div class="tk-segmented" role="tablist">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.qualityTab === 'audits' })}" data-action="q-tab" data-tab="audits">Audit Reports (${state.audits.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.qualityTab === 'cars' })}" data-action="q-tab" data-tab="cars">CARs (${state.cars.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.qualityTab === 'ncrs' })}" data-action="q-tab" data-tab="ncrs">NCRs (${state.ncrs.length})</button>
      </div>
    </div>

    ${state.qualityTab === 'audits' ? html`
      ${loadingQ ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.audits.length ? html`
        <div class="ohs-card-list">
          ${state.audits.map((a) => {
            const isMajor = a.finding_severity.includes('Major') || a.finding_severity.includes('Critical');
            return html`
              <article class="ohs-qual-card ${isMajor ? 'ohs-band--critical' : 'ohs-band--ok'}" data-key="aud-${a.id}">
                <div class="ohs-card__top">
                  <div class="ohs-card__head">
                    <div class="ohs-card__title">
                      <span class="ohs-code">${a.audit_code}</span>
                      <span>${a.audit_title}</span>
                      <span class="tk-tag ${isMajor ? 'tk-tag--bad' : 'tk-tag--info'}">${a.finding_severity}</span>
                      <span class="tk-tag">${a.audit_type}</span>
                      ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="ohs-card__meta">
                      <span>Date: <strong>${fmtDay(a.audit_date)}</strong></span>
                      <span>Lead Auditor: ${a.auditor_name}</span>
                      ${a.follow_up_date ? html`<span>Follow-up: <strong>${fmtDay(a.follow_up_date)}</strong></span>` : ''}
                    </div>
                  </div>
                  <div class="ohs-card__actions">
                    <button type="button" class="k-btn k-btn--sm" data-action="print-audit" data-id="${a.id}">${icon('printer', { size: 14 })} Report HTML</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="audit-del" data-id="${a.id}">Delete</button>
                  </div>
                </div>
                <div class="ohs-callout">
                  <div><strong>Scope:</strong> ${a.scope}</div>
                  ${a.findings ? html`<div><strong>Findings:</strong> ${a.findings}</div>` : ''}
                </div>
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'clipboard', title: 'No audits logged', text: 'Document internal, external, or ISO certification audits.' })}</section>`}` : ''}

    ${state.qualityTab === 'cars' ? html`
      ${loadingQ ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.cars.length ? html`
        <div class="ohs-card-list">
          ${state.cars.map((c) => html`
            <article class="ohs-qual-card ${c.status === 'Verified Closed' ? 'ohs-band--closed' : c.priority === 'Critical' || c.priority === 'High' ? 'ohs-band--high' : 'ohs-band--medium'}" data-key="car-${c.id}">
              <div class="ohs-card__top">
                <div class="ohs-card__head">
                  <div class="ohs-card__title">
                    <span class="ohs-code">${c.car_code}</span>
                    <span>${c.car_title}</span>
                    <span class="tk-tag ${c.priority === 'Critical' || c.priority === 'High' ? 'tk-tag--bad' : 'tk-tag--warn'}">${c.priority}</span>
                    ${renderCapaDuePill(c.due_date, c.status)}
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ohs-card__meta">
                    <span>Source: ${c.source_type} ${c.source_reference}</span>
                    <span>Assigned: <strong>${c.assigned_to}</strong></span>
                    <span>Due: <strong>${fmtDay(c.due_date)}</strong></span>
                  </div>
                </div>
                <div class="ohs-card__actions">
                  <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="car-status" data-id="${c.id}" aria-label="CAR status">
                    ${CAPA_COLS.map((st) => html`<option value="${st}" ${st === c.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--sm" data-action="print-car" data-id="${c.id}">${icon('printer', { size: 14 })} CAR HTML</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="car-del" data-id="${c.id}">Delete</button>
                </div>
              </div>
              ${c.root_cause || c.corrective_action ? html`
                <div class="ohs-callout">
                  ${c.root_cause ? html`<div><strong>Root Cause:</strong> ${c.root_cause}</div>` : ''}
                  ${c.corrective_action ? html`<div><strong>Corrective Action:</strong> ${c.corrective_action}</div>` : ''}
                </div>` : ''}
              ${renderWorkflowStepper(CAPA_COLS, c.status)}
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'shield', title: 'No CARs raised', text: 'Raise Corrective Action Requests to eliminate systemic root causes.' })}</section>`}` : ''}

    ${state.qualityTab === 'ncrs' ? html`
      ${loadingQ ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.ncrs.length ? html`
        <div class="ohs-card-list">
          ${state.ncrs.map((n) => html`
            <article class="ohs-qual-card ${n.status === 'Closed' ? 'ohs-band--closed' : n.severity === 'Critical' ? 'ohs-band--critical' : n.severity === 'Major' ? 'ohs-band--high' : 'ohs-band--medium'}" data-key="ncr-${n.id}">
              <div class="ohs-card__top">
                <div class="ohs-card__head">
                  <div class="ohs-card__title">
                    <span class="ohs-code">${n.ncr_code}</span>
                    <span>${n.ncr_title}</span>
                    <span class="tk-tag ${n.severity === 'Critical' ? 'tk-tag--bad' : n.severity === 'Major' ? 'tk-tag--warn' : 'tk-tag--info'}">${n.severity}</span>
                    <span class="tk-tag">${n.ncr_type} · ${n.disposition}</span>
                    ${renderCapaDuePill(n.due_date, n.status)}
                    ${n.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ohs-card__meta">
                    <span>Source: ${n.source_type}</span>
                    <span>Assigned: <strong>${n.assigned_to}</strong></span>
                    <span>Due: <strong>${fmtDay(n.due_date)}</strong></span>
                  </div>
                </div>
                <div class="ohs-card__actions">
                  <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="ncr-status" data-id="${n.id}" aria-label="NCR status">
                    ${NCR_STAGES.map((st) => html`<option value="${st}" ${st === n.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="ncr-del" data-id="${n.id}">Delete</button>
                </div>
              </div>
              ${n.root_cause || n.corrective_action ? html`
                <div class="ohs-callout">
                  ${n.root_cause ? html`<div><strong>Root Cause:</strong> ${n.root_cause}</div>` : ''}
                  ${n.corrective_action ? html`<div><strong>Containment / Action:</strong> ${n.corrective_action}</div>` : ''}
                </div>` : ''}
              ${renderWorkflowStepper(NCR_STAGES, n.status)}
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'alert', title: 'No NCRs recorded', text: 'Log product, process, system or supplier non-conformances.' })}</section>`}` : ''}`;
}

export function wireCapaQualityActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="q-tab"]', (e, el) => { state.qualityTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="capa-filter"]', (e, el) => { state.capaFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="capa-new"]', async () => {
    const made = await formDialog({
      title: 'Add CAPA / Corrective Action Item',
      submitLabel: 'Create Action',
      fields: html`
        <label class="k-field"><span class="k-field__label">Action Title</span><input class="k-input" name="action_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Source</span><select class="k-input" name="source_type">${ACT_SOURCES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Source Ref</span><input class="k-input" name="source_ref" placeholder="e.g. INC-101"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority">${PRIORITIES.map((p) => html`<option value="${p}" ${p === 'High' ? 'selected' : ''}>${p}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to" required></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 7)}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="action_description" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/actions', v),
    });
    if (made) { toast.success('CAPA action created.'); await loadScreen('/capa'); }
  });
  on(root, 'click', '[data-action="capa-move"]', async (e, el) => {
    try { await api.post('/api/actions/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Action moved to ${el.dataset.status}.`); await loadScreen('/capa'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="capa-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete CAPA?', message: 'Remove this action item?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/actions', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/capa'); }
    catch (err) { toastError(err); }
  });

  // Audits
  on(root, 'click', '[data-action="audit-new"]', async () => {
    const made = await formDialog({
      title: 'Log ISO / Internal Audit Report',
      submitLabel: 'Save Audit',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">Audit Title</span><input class="k-input" name="audit_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Audit Type</span><select class="k-input" name="audit_type">${AUD_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Audit Date</span><input class="k-input" type="date" name="audit_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Lead Auditor</span><input class="k-input" name="auditor_name" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Highest Finding Severity</span><select class="k-input" name="finding_severity">${AUD_SEVS.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">CAR Required?</span><select class="k-input" name="corrective_actions_required"><option value="No">No</option><option value="Yes">Yes</option></select></label>
          <label class="k-field"><span class="k-field__label">Follow-up Date</span><input class="k-input" type="date" name="follow_up_date"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Scope</span><input class="k-input" name="scope" required></label>
        <label class="k-field"><span class="k-field__label">Findings</span><textarea class="k-input" name="findings" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Summary</span><textarea class="k-input" name="summary" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/audits', v),
    });
    if (made) { state.qualityTab = 'audits'; toast.success(`Audit ${made.audit.audit_code} logged.`); await loadScreen('/quality'); }
  });
  on(root, 'click', '[data-action="audit-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete audit?', message: 'Remove this audit report?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/audits', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });

  // CARs
  on(root, 'click', '[data-action="car-new"]', async () => {
    const made = await formDialog({
      title: 'Raise Corrective Action Request (CAR)',
      submitLabel: 'Raise CAR',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">CAR Title</span><input class="k-input" name="car_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Source</span><select class="k-input" name="source_type">${CAR_SOURCES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Source Ref</span><input class="k-input" name="source_reference" placeholder="AUD-101"></label>
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority">${PRIORITIES.map((p) => html`<option value="${p}" ${p === 'High' ? 'selected' : ''}>${p}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to" required></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 14)}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Root Cause Analysis</span><textarea class="k-input" name="root_cause" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Corrective Action</span><textarea class="k-input" name="corrective_action" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Preventive Action</span><input class="k-input" name="preventive_action"></label>`,
      onSubmit: (v) => api.post('/api/cars', { ...v, raised_date: today() }),
    });
    if (made) { state.qualityTab = 'cars'; toast.success(`${made.car.car_code} raised.`); await loadScreen('/quality'); }
  });
  on(root, 'change', '[data-action="car-status"]', async (e, el) => {
    try { await api.post('/api/cars/status', { id: Number(el.dataset.id), status: el.value }); toast.success('CAR status updated.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="car-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete CAR?', message: 'Remove this CAR?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/cars', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });

  // NCRs
  on(root, 'click', '[data-action="ncr-new"]', async () => {
    const made = await formDialog({
      title: 'Raise Non-Conformance Report (NCR)',
      submitLabel: 'Raise NCR',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">NCR Title</span><input class="k-input" name="ncr_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">NCR Type</span><select class="k-input" name="ncr_type">${NCR_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${NCR_SEVS.map((s) => html`<option value="${s}" ${s === 'Major' ? 'selected' : ''}>${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Disposition</span><select class="k-input" name="disposition">${NCR_DISPS.map((d) => html`<option value="${d}">${d}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Source</span><select class="k-input" name="source_type">${NCR_SOURCES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to" required></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 10)}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Root Cause</span><textarea class="k-input" name="root_cause" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Corrective Action</span><textarea class="k-input" name="corrective_action" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/ncrs', { ...v, raised_date: today() }),
    });
    if (made) { state.qualityTab = 'ncrs'; toast.success(`${made.ncr.ncr_code} raised.`); await loadScreen('/quality'); }
  });
  on(root, 'change', '[data-action="ncr-status"]', async (e, el) => {
    try { await api.post('/api/ncrs/status', { id: Number(el.dataset.id), status: el.value }); toast.success('NCR status updated.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="ncr-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete NCR?', message: 'Remove this NCR?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/ncrs', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });

  // Printable Audit / CAR HTML Reports
  on(root, 'click', '[data-action="print-audit"]', (e, el) => {
    const a = state.audits.find((x) => String(x.id) === el.dataset.id);
    if (!a) return;
    const s = state.session.settings;
    downloadHtmlDoc(`${a.audit_code.toLowerCase()}-report.html`, {
      title: `Audit Report · ${a.audit_code}`,
      businessName: s.business_name,
      subtitle: `${s.iso_cert_ref || 'ISO 45001 / 9001'} · ${a.audit_type} Audit`,
      accent: '#c96a08',
      bodyHtml: `
        <table>
          <tr><th>Audit Title</th><td>${esc(a.audit_title)}</td><th>Audit Date</th><td>${esc(a.audit_date)}</td></tr>
          <tr><th>Lead Auditor</th><td>${esc(a.auditor_name)}</td><th>Highest Finding</th><td><strong>${esc(a.finding_severity)}</strong></td></tr>
          <tr><th>CAR Required</th><td>${esc(a.corrective_actions_required)}</td><th>Follow-Up Date</th><td>${esc(a.follow_up_date || 'N/A')}</td></tr>
        </table>
        <div class="box"><strong>Scope:</strong><br>${esc(a.scope)}</div>
        <div class="box"><strong>Audit Summary:</strong><br>${esc(a.summary || '—')}</div>
        <div class="box"><strong>Findings:</strong><br>${esc(a.findings || 'None recorded')}</div>
        <div class="box"><strong>Observations:</strong><br>${esc(a.observations || '—')}</div>`,
    });
  });

  on(root, 'click', '[data-action="print-car"]', (e, el) => {
    const c = state.cars.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const s = state.session.settings;
    downloadHtmlDoc(`${c.car_code.toLowerCase()}-report.html`, {
      title: `Corrective Action Request · ${c.car_code}`,
      businessName: s.business_name,
      subtitle: `${s.iso_cert_ref || 'ISO 45001 / 9001'} · Priority: ${c.priority}`,
      accent: '#c96a08',
      bodyHtml: `
        <table>
          <tr><th>CAR Title</th><td>${esc(c.car_title)}</td><th>Status</th><td><strong>${esc(c.status)}</strong></td></tr>
          <tr><th>Source</th><td>${esc(c.source_type + ' ' + c.source_reference)}</td><th>Assigned To</th><td>${esc(c.assigned_to)}</td></tr>
          <tr><th>Raised Date</th><td>${esc(c.raised_date)}</td><th>Due Date</th><td><strong>${esc(c.due_date)}</strong></td></tr>
        </table>
        <div class="box"><strong>Root Cause Analysis:</strong><br>${esc(c.root_cause || 'Pending analysis')}</div>
        <div class="box"><strong>Corrective Action:</strong><br>${esc(c.corrective_action || '—')}</div>
        <div class="box"><strong>Preventive Action:</strong><br>${esc(c.preventive_action || '—')}</div>`,
    });
  });
}
