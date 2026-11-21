// Traffic-Light Training & Competency Matrix (Unified Masthead, Compliance Ring & Monogrammed Contractor Cards)
// + Site Ops: Toolbox Talk Cards, Plant Inspection Cards & 3-Stage Complaint Cards.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtDay, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { trainingTrafficMeta, renderTrafficPill, renderWorkflowStepper } from '../ohs_ui.js';

const MTG_TYPES = ['Toolbox Talk', 'Safety Committee', 'Incident Review', 'Training Session', 'Management Review', 'Other'];
const PLANT_CATS = ['Vehicle', 'Forklift', 'Crane / Lifting', 'Scaffold', 'Power Tool', 'Pressure Vessel', 'Electrical Equipment', 'Other'];
const PLANT_FREQS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'];
const CMP_TYPES = ['Safety', 'Environmental', 'Quality', 'Service', 'Conduct', 'Other'];
const CMP_SOURCES = ['Customer', 'Employee', 'Contractor', 'Public', 'Regulator', 'Other'];
const CMP_STAGES = ['Open', 'Investigating', 'Resolved'];

export function renderTrainingView(state) {
  const enriched = state.training.map((r) => ({ ...r, _tl: trainingTrafficMeta(r.expiry_date) }));
  const redCount = enriched.filter((r) => r._tl.light === 'red').length;
  const amberCount = enriched.filter((r) => r._tl.light === 'amber').length;
  const greenCount = enriched.filter((r) => r._tl.light === 'green').length;
  const validCount = enriched.length - redCount;
  const compPct = enriched.length ? Math.round((validCount / enriched.length) * 100) : 100;

  const q = (state.trainSearch || '').trim().toLowerCase();
  const trainRows = enriched.filter((r) => {
    if (state.trainFilter === 'Expired' && r._tl.light !== 'red') return false;
    if (state.trainFilter === 'Expiring' && r._tl.light !== 'amber') return false;
    if (state.trainFilter === 'Current' && r._tl.light !== 'green') return false;
    if (state.trainFilter === 'Mandatory' && r.is_mandatory !== 'Yes') return false;
    if (q) {
      const hay = `${r.employee_name} ${r.course_name} ${r.provider || ''} ${r.certificate_number || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const loadingTrn = state.loading && !state.training.length;
  const loadingCon = state.loading && !state.contractors.length;

  return html`
    <section class="ohs-masthead" aria-label="Training Matrix & Contractor Approvals">
      <div class="ohs-masthead__copy">
        <div class="${cls('ohs-masthead__eyebrow', { 'ohs-masthead__eyebrow--alert': redCount > 0, 'ohs-masthead__eyebrow--ok': redCount === 0 && amberCount === 0 })}">
          ${icon('award', { size: 12 })} ISO 45001 · CLAUSE 7.2 COMPETENCY
        </div>
        <h1 class="ohs-masthead__title">Training &amp; Contractors</h1>
        <div class="ohs-masthead__meta">
          <span>Traffic-light licence &amp; certification tracking</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Contractor ABN, insurance &amp; site inductions</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--ring ohs-pod--emerald" aria-label="Training compliance ${compPct}%">
          <div class="tk-ring" style="--p:${compPct}%;--ring-color:${redCount === 0 ? '#34d399' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${compPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ohs-pod__lbl">In-Date</span>
            <span class="ohs-pod__val" style="font-size:16px">${validCount}/${enriched.length}</span>
            <span class="ohs-pod__sub">Valid certs</span>
          </div>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--alert': redCount > 0 })}">
          <span class="ohs-pod__lbl">${icon('alert', { size: 12 })} Expired</span>
          <span class="ohs-pod__val">${redCount}</span>
          <span class="ohs-pod__sub">Action required</span>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--amber': amberCount > 0 })}">
          <span class="ohs-pod__lbl">${icon('clock', { size: 12 })} ≤ 30 Days</span>
          <span class="ohs-pod__val">${amberCount}</span>
          <span class="ohs-pod__sub">Renewals due</span>
        </div>

        <div class="ohs-pod ohs-pod--banner-sm">
          <span class="ohs-pod__lbl">${icon('briefcase', { size: 12 })} Contractors</span>
          <span class="ohs-pod__val">${state.contractors.length}</span>
          <span class="ohs-pod__sub">Approved list</span>
        </div>

        <div class="ohs-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn k-btn--glass" data-action="con-new">${icon('plus', { size: 15 })} Contractor</button>
          <button type="button" class="k-btn ohs-btn-amber" data-action="trn-new">${icon('award', { size: 15 })} Add Training</button>
        </div>
      </div>
    </section>

    <div class="ohs-tabs">
      <div class="tk-segmented" role="tablist">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.trainTab === 'training' })}" data-action="trn-tab" data-tab="training">Competency Matrix (${state.training.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.trainTab === 'contractors' })}" data-action="trn-tab" data-tab="contractors">Contractors (${state.contractors.length})</button>
      </div>
    </div>

    ${state.trainTab === 'training' ? html`
      <div class="ohs-tl-strip">
        <button type="button" class="${cls('ohs-tl-card', { 'is-on': state.trainFilter === 'Expired' })}" data-action="trn-filter" data-filter="${state.trainFilter === 'Expired' ? 'All' : 'Expired'}">
          <span class="ohs-tl-lamp ohs-tl-lamp--red"></span>
          <span>
            <div class="ohs-tl-card__val" style="color:#991b1b">${redCount}</div>
            <div class="ohs-tl-card__lbl">Expired (Action Required)</div>
          </span>
        </button>
        <button type="button" class="${cls('ohs-tl-card', { 'is-on': state.trainFilter === 'Expiring' })}" data-action="trn-filter" data-filter="${state.trainFilter === 'Expiring' ? 'All' : 'Expiring'}">
          <span class="ohs-tl-lamp ohs-tl-lamp--amber"></span>
          <span>
            <div class="ohs-tl-card__val" style="color:#92400e">${amberCount}</div>
            <div class="ohs-tl-card__lbl">Expiring ≤ 30 Days</div>
          </span>
        </button>
        <button type="button" class="${cls('ohs-tl-card', { 'is-on': state.trainFilter === 'Current' })}" data-action="trn-filter" data-filter="${state.trainFilter === 'Current' ? 'All' : 'Current'}">
          <span class="ohs-tl-lamp ohs-tl-lamp--green"></span>
          <span>
            <div class="ohs-tl-card__val" style="color:#166534">${greenCount}</div>
            <div class="ohs-tl-card__lbl">Current (&gt; 30 Days)</div>
          </span>
        </button>
      </div>

      <div class="tk-toolbar">
        <div class="tk-search">
          ${icon('search', { size: 16 })}
          <input type="search" placeholder="Search employee, course or certificate #…" value="${state.trainSearch || ''}" data-action="trn-search">
        </div>
        <div class="tk-segmented">
          ${[['All', 'All'], ['Expired', 'Expired'], ['Expiring', '≤ 30 Days'], ['Current', 'Current'], ['Mandatory', 'Mandatory']].map(([val, lbl]) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.trainFilter === val })}" data-action="trn-filter" data-filter="${val}">${lbl}</button>`)}
        </div>
      </div>

      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('award', { size: 18 })} Traffic-Light Training Expiry Table</h2>
          <span class="tk-sheet__count">${trainRows.length} of ${state.training.length}</span>
        </div>
        <div class="tk-table-wrap">
          ${loadingTrn ? skeleton(4) : trainRows.length ? html`
            <table class="tk-table">
              <thead>
                <tr><th>Employee</th><th>Course / Licence</th><th>Mandatory</th><th>Completed</th><th>Expiry Date</th><th>Traffic-Light Status</th><th></th></tr>
              </thead>
              <tbody>
                ${trainRows.map((r) => html`
                  <tr class="ohs-tl-row--${r._tl.light}" data-key="tr-${r.id}">
                    <td><strong>${r.employee_name}</strong>${r.is_sample ? html` <span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                    <td>${r.course_name}<div class="tk-muted" style="font-size:12px">${r.provider || '—'}${r.certificate_number ? ' · ' + r.certificate_number : ''}</div></td>
                    <td>${r.is_mandatory === 'Yes' ? html`<span class="tk-tag tk-tag--accent">Mandatory</span>` : html`<span class="tk-tag">Optional</span>`}</td>
                    <td>${fmtDay(r.completion_date)}</td>
                    <td><strong>${r.expiry_date ? fmtDay(r.expiry_date) : 'No expiry'}</strong></td>
                    <td>${renderTrafficPill(r._tl)}</td>
                    <td><button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="trn-del" data-id="${r.id}">Delete</button></td>
                  </tr>`)}
              </tbody>
            </table>` : emptyState({ iconName: 'award', title: 'No training records match', text: 'Add worker certifications, high-risk licences, and first aid qualifications.' })}
        </div>
      </section>` : html`
      ${loadingCon ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.contractors.length ? html`
        <div class="ohs-entity-grid">
          ${state.contractors.map((c) => {
            const tl = c.public_liability !== 'Yes'
              ? { light: 'red', label: 'Insurance Missing' }
              : trainingTrafficMeta(c.approval_expiry);
            return html`
              <article class="ohs-entity-card ohs-entity-card--${tl.light}" data-key="con-${c.id}">
                <div class="ohs-entity-card__head">
                  <div style="display:flex;align-items:center;gap:11px;min-width:0">
                    <span class="ohs-entity-avatar">${initials(c.business_name)}</span>
                    <div style="min-width:0">
                      <div style="font-weight:750;font-size:15px;line-height:1.22">${c.business_name}</div>
                      <div class="tk-muted" style="font-size:12px">ABN <span class="tk-mono">${c.abn}</span></div>
                    </div>
                  </div>
                  ${renderTrafficPill(tl)}
                </div>
                <div class="ohs-entity-card__body">
                  <div class="ohs-check-chips">
                    <span class="${cls('ohs-check-chip', { 'ohs-check-chip--bad': c.public_liability !== 'Yes' })}">
                      ${icon(c.public_liability === 'Yes' ? 'check' : 'alert', { size: 11 })} Public Liability: ${c.public_liability}
                    </span>
                    <span class="${cls('ohs-check-chip', { 'ohs-check-chip--warn': c.workers_comp === 'No' })}">
                      Workers Comp: ${c.workers_comp}
                    </span>
                    <span class="${cls('ohs-check-chip', { 'ohs-check-chip--warn': c.induction_completed !== 'Yes' })}">
                      Induction: ${c.induction_completed}
                    </span>
                  </div>
                  <div style="font-size:13px;color:var(--k-text)">${c.services}${c.licence_details ? ` · ${c.licence_details}` : ''}</div>
                  <div class="ohs-card__meta">
                    <span>Contact: <strong>${c.contact_name}</strong> (${c.contact_phone || c.contact_email || '—'})</span>
                    <span>Expiry: <strong>${fmtDay(c.approval_expiry)}</strong></span>
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="display:flex;justify-content:flex-end">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="con-del" data-id="${c.id}">Delete</button>
                  </div>
                </div>
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'briefcase', title: 'No contractors registered', text: 'Verify ABN, insurance certificates and induction status before site access.' })}</section>`}`}`;
}

export function renderSiteOpsView(state) {
  const loadingSite = state.loading && !state.meetings.length && !state.plant.length && !state.complaints.length;
  const plantDueCnt = state.plant.filter((p) => {
    const tl = trainingTrafficMeta(p.next_service_date);
    return tl.light === 'red' || tl.light === 'amber';
  }).length;
  const openCmpCnt = state.complaints.filter((c) => c.status !== 'Resolved').length;

  return html`
    <section class="ohs-masthead" aria-label="Site Consultation, Plant & Complaints">
      <div class="ohs-masthead__copy">
        <div class="ohs-masthead__eyebrow">
          ${icon('wrench', { size: 12 })} SITE OPS · PLANT &amp; CONSULTATION
        </div>
        <h1 class="ohs-masthead__title">Toolbox, Plant &amp; Complaints</h1>
        <div class="ohs-masthead__meta">
          <span>Pre-start briefings &amp; crew consultation records</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Plant service compliance &amp; stakeholder resolution</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--emerald">
          <span class="ohs-pod__lbl">${icon('users', { size: 12 })} Briefings</span>
          <span class="ohs-pod__val">${state.meetings.length}</span>
          <span class="ohs-pod__sub">Toolbox talks</span>
        </div>

        <div class="${cls('ohs-pod', { 'ohs-pod--amber': plantDueCnt > 0 })}">
          <span class="ohs-pod__lbl">${icon('wrench', { size: 12 })} Plant Due</span>
          <span class="ohs-pod__val">${plantDueCnt}</span>
          <span class="ohs-pod__sub">of ${state.plant.length} assets</span>
        </div>

        <div class="${cls('ohs-pod ohs-pod--banner-sm', { 'ohs-pod--alert': openCmpCnt > 0 })}">
          <span class="ohs-pod__lbl">${icon('chat', { size: 12 })} Complaints</span>
          <span class="ohs-pod__val">${openCmpCnt}</span>
          <span class="ohs-pod__sub">Open cases</span>
        </div>

        <div class="ohs-cta-group" style="display:flex;gap:7px;flex-wrap:wrap">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="cmp-new">${icon('plus', { size: 14 })} Complaint</button>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="plt-new">${icon('plus', { size: 14 })} Plant</button>
          <button type="button" class="k-btn ohs-btn-amber k-btn--sm" data-action="mtg-new">${icon('users', { size: 14 })} Toolbox Talk</button>
        </div>
      </div>
    </section>

    <div class="ohs-tabs">
      <div class="tk-segmented" role="tablist">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.siteTab === 'meetings' })}" data-action="site-tab" data-tab="meetings">Toolbox Talks (${state.meetings.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.siteTab === 'plant' })}" data-action="site-tab" data-tab="plant">Plant Register (${state.plant.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.siteTab === 'complaints' })}" data-action="site-tab" data-tab="complaints">Complaints (${state.complaints.length})</button>
      </div>
    </div>

    ${state.siteTab === 'meetings' ? html`
      ${loadingSite ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.meetings.length ? html`
        <div class="ohs-card-list">
          ${state.meetings.map((m) => html`
            <article class="ohs-qual-card ohs-band--ok" data-key="mt-${m.id}">
              <div class="ohs-card__top">
                <div class="ohs-card__head">
                  <div class="ohs-card__title">
                    <span>${m.meeting_title}</span>
                    <span class="tk-tag tk-tag--accent">${m.meeting_type}</span>
                    ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ohs-card__meta">
                    <span><strong>${fmtDay(m.meeting_date)}</strong> at ${m.meeting_time}</span>
                    <span>Location: ${m.location || 'Site'}</span>
                    <span>Facilitator: <strong>${m.facilitator}</strong></span>
                  </div>
                </div>
                <div class="ohs-card__actions">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="mtg-del" data-id="${m.id}">Delete</button>
                </div>
              </div>
              ${m.attendees || m.minutes ? html`
                <div class="ohs-callout">
                  ${m.attendees ? html`<div><strong>Attendees:</strong> ${m.attendees}</div>` : ''}
                  ${m.minutes ? html`<div><strong>Minutes:</strong> ${m.minutes}</div>` : ''}
                </div>` : ''}
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No toolbox talks yet', text: 'Document safety briefings and worker consultation meetings.' })}</section>`}` : ''}

    ${state.siteTab === 'plant' ? html`
      ${loadingSite ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.plant.length ? html`
        <div class="ohs-entity-grid">
          ${state.plant.map((p) => {
            const tl = trainingTrafficMeta(p.next_service_date);
            return html`
              <article class="ohs-entity-card ohs-entity-card--${tl.light}" data-key="pl-${p.id}">
                <div class="ohs-entity-card__head">
                  <div style="min-width:0">
                    <div style="font-weight:750;font-size:15px;line-height:1.22">${p.asset_name}</div>
                    <div class="tk-muted" style="font-size:12.5px;margin-top:2px">${p.category}${p.manufacturer ? ` · ${p.manufacturer} ${p.model || ''}` : ''}</div>
                  </div>
                  ${renderTrafficPill(tl)}
                </div>
                <div class="ohs-entity-card__body">
                  <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                    ${p.serial_number ? html`<span class="ohs-code">S/N ${p.serial_number}</span>` : ''}
                    ${p.registration_number ? html`<span class="tk-tag tk-tag--info">Rego ${p.registration_number}</span>` : ''}
                    <span class="tk-tag">Inspect: ${p.inspection_frequency}</span>
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ohs-card__meta">
                    <span>Location: <strong>${p.equipment_location || '—'}</strong></span>
                    <span>Next Service: <strong>${p.next_service_date ? fmtDay(p.next_service_date) : '—'}</strong></span>
                    ${p.registration_expiry ? html`<span>Rego Exp: <strong>${fmtDay(p.registration_expiry)}</strong></span>` : ''}
                  </div>
                  ${p.notes ? html`<div class="tk-muted" style="font-size:12.5px">${p.notes}</div>` : ''}
                  <div style="display:flex;justify-content:flex-end">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="plt-del" data-id="${p.id}">Delete</button>
                  </div>
                </div>
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'wrench', title: 'No plant assets registered', text: 'Register forklifts, cranes, vehicles, scaffolds and electrical tools.' })}</section>`}` : ''}

    ${state.siteTab === 'complaints' ? html`
      ${loadingSite ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.complaints.length ? html`
        <div class="ohs-card-list">
          ${state.complaints.map((c) => html`
            <article class="ohs-qual-card ${c.status === 'Resolved' ? 'ohs-band--closed' : c.priority === 'Critical' || c.priority === 'High' ? 'ohs-band--high' : 'ohs-band--medium'}" data-key="cm-${c.id}">
              <div class="ohs-card__top">
                <div class="ohs-card__head">
                  <div class="ohs-card__title">
                    <span>${c.complaint_title}</span>
                    <span class="tk-tag">${c.complaint_type} · ${c.complaint_source}</span>
                    <span class="tk-tag ${c.priority === 'High' || c.priority === 'Critical' ? 'tk-tag--bad' : 'tk-tag--warn'}">${c.priority}</span>
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ohs-card__meta">
                    <span>From: <strong>${c.complainant_name || 'Anonymous'}</strong> (${fmtDay(c.received_date)})</span>
                    <span>Assigned: ${c.assigned_to || 'Unassigned'}</span>
                  </div>
                </div>
                <div class="ohs-card__actions">
                  <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="cmp-status" data-id="${c.id}" aria-label="Complaint status">
                    ${CMP_STAGES.map((st) => html`<option value="${st}" ${st === c.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cmp-del" data-id="${c.id}">Delete</button>
                </div>
              </div>
              <div class="ohs-callout">
                <div>${c.complaint_description}</div>
                ${c.resolution ? html`<div><strong>Resolution:</strong> ${c.resolution}</div>` : ''}
              </div>
              ${renderWorkflowStepper(CMP_STAGES, c.status)}
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'chat', title: 'No complaints logged', text: 'Record and resolve quality, safety, or service complaints.' })}</section>`}` : ''}`;
}

export function wireTrainingSiteActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="trn-tab"]', (e, el) => { state.trainTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="trn-filter"]', (e, el) => { state.trainFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="trn-search"]', (e, el) => { state.trainSearch = el.value; draw(); });
  on(root, 'click', '[data-action="site-tab"]', (e, el) => { state.siteTab = el.dataset.tab; draw(); });

  on(root, 'click', '[data-action="trn-new"]', async () => {
    const made = await formDialog({
      title: 'Add Training / Certification Record',
      submitLabel: 'Save Record',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" required></label>
          <label class="k-field"><span class="k-field__label">Course / Licence</span><input class="k-input" name="course_name" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Provider</span><input class="k-input" name="provider"></label>
          <label class="k-field"><span class="k-field__label">Certificate #</span><input class="k-input" name="certificate_number"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Completion Date</span><input class="k-input" type="date" name="completion_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Expiry Date</span><input class="k-input" type="date" name="expiry_date" value="${addDays(today(), 365)}"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Mandatory Training?</span><select class="k-input" name="is_mandatory"><option value="Yes">Yes</option><option value="No">No</option></select></label>
          <label class="k-field"><span class="k-field__label">Result</span><select class="k-input" name="assessment_result"><option value="Passed">Passed</option><option value="Failed">Failed</option><option value="N/A">N/A</option></select></label>
        </div>`,
      onSubmit: (v) => api.post('/api/training', { ...v, today: today() }),
    });
    if (made) { state.trainTab = 'training'; toast.success('Training record added.'); await loadScreen('/training'); }
  });
  on(root, 'click', '[data-action="trn-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete training record?', message: 'Remove this certification?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/training', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/training'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="con-new"]', async () => {
    const made = await formDialog({
      title: 'Approve Site Contractor',
      submitLabel: 'Save Contractor',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Business Name</span><input class="k-input" name="business_name" required></label>
          <label class="k-field"><span class="k-field__label">ABN</span><input class="k-input" name="abn" required placeholder="51 824 753 556"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Contact Name</span><input class="k-input" name="contact_name" required></label>
          <label class="k-field"><span class="k-field__label">Contact Email</span><input class="k-input" type="email" name="contact_email"></label>
          <label class="k-field"><span class="k-field__label">Contact Phone</span><input class="k-input" name="contact_phone"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Public Liability Insurance?</span><select class="k-input" name="public_liability"><option value="Yes">Yes</option><option value="No">No</option></select></label>
          <label class="k-field"><span class="k-field__label">Workers Comp?</span><select class="k-input" name="workers_comp"><option value="Yes">Yes</option><option value="No">No</option><option value="Exempt (sole trader)">Exempt (sole trader)</option></select></label>
          <label class="k-field"><span class="k-field__label">Site Induction?</span><select class="k-input" name="induction_completed"><option value="Yes">Yes</option><option value="Pending">Pending</option><option value="No">No</option></select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Insurance / Approval Expiry</span><input class="k-input" type="date" name="approval_expiry" value="${addDays(today(), 180)}" required></label>
          <label class="k-field"><span class="k-field__label">Licence Details</span><input class="k-input" name="licence_details"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Services Provided</span><input class="k-input" name="services" required></label>`,
      onSubmit: (v) => api.post('/api/contractors', { ...v, today: today() }),
    });
    if (made) { state.trainTab = 'contractors'; toast.success('Contractor recorded.'); await loadScreen('/training'); }
  });
  on(root, 'click', '[data-action="con-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove contractor?', message: 'Delete this contractor approval?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/contractors', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/training'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="mtg-new"]', async () => {
    const made = await formDialog({
      title: 'Log Toolbox Talk / Safety Meeting',
      submitLabel: 'Save Meeting',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">Meeting Title</span><input class="k-input" name="meeting_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Type</span><select class="k-input" name="meeting_type">${MTG_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="meeting_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="meeting_time" value="07:00"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Location</span><input class="k-input" name="location"></label>
          <label class="k-field"><span class="k-field__label">Facilitator</span><input class="k-input" name="facilitator"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Attendees</span><input class="k-input" name="attendees" placeholder="Comma-separated crew names…"></label>
        <label class="k-field"><span class="k-field__label">Minutes / Safety Topics</span><textarea class="k-input" name="minutes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/meetings', v),
    });
    if (made) { state.siteTab = 'meetings'; toast.success('Toolbox talk recorded.'); await loadScreen('/site'); }
  });
  on(root, 'click', '[data-action="mtg-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete meeting?', message: 'Remove this meeting record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/meetings', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/site'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="plt-new"]', async () => {
    const made = await formDialog({
      title: 'Register Plant / Equipment Asset',
      submitLabel: 'Save Asset',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Asset Name</span><input class="k-input" name="asset_name" required></label>
          <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${PLANT_CATS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Manufacturer</span><input class="k-input" name="manufacturer"></label>
          <label class="k-field"><span class="k-field__label">Model</span><input class="k-input" name="model"></label>
          <label class="k-field"><span class="k-field__label">Serial #</span><input class="k-input" name="serial_number"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Location</span><input class="k-input" name="equipment_location"></label>
          <label class="k-field"><span class="k-field__label">Inspection Frequency</span><select class="k-input" name="inspection_frequency">${PLANT_FREQS.map((f) => html`<option value="${f}">${f}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Next Service Date</span><input class="k-input" type="date" name="next_service_date" value="${addDays(today(), 30)}"></label>
        </div>`,
      onSubmit: (v) => api.post('/api/plant', { ...v, today: today() }),
    });
    if (made) { state.siteTab = 'plant'; toast.success('Plant asset registered.'); await loadScreen('/site'); }
  });
  on(root, 'click', '[data-action="plt-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete asset?', message: 'Remove this plant item?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/plant', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/site'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmp-new"]', async () => {
    const made = await formDialog({
      title: 'Log Customer / Workplace Complaint',
      submitLabel: 'Save Complaint',
      fields: html`
        <label class="k-field"><span class="k-field__label">Complaint Title</span><input class="k-input" name="complaint_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Type</span><select class="k-input" name="complaint_type">${CMP_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Source</span><select class="k-input" name="complaint_source">${CMP_SOURCES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority"><option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option><option value="Critical">Critical</option></select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Complainant Name</span><input class="k-input" name="complainant_name"></label>
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="complaint_description" rows="2" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/complaints', { ...v, received_date: today() }),
    });
    if (made) { state.siteTab = 'complaints'; toast.success('Complaint logged.'); await loadScreen('/site'); }
  });
  on(root, 'change', '[data-action="cmp-status"]', async (e, el) => {
    try { await api.post('/api/complaints/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Complaint status updated.'); await loadScreen('/site'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="cmp-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete complaint?', message: 'Remove this complaint?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/complaints', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/site'); }
    catch (err) { toastError(err); }
  });
}
