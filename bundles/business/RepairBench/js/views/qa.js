// Quality Check & Pickup Desk (Unified ESD Graphite Masthead with QA Pass-Rate Ring,
// 8-Point Interactive LED Diagnostic Grid & Ready for Pickup SMS Desk)
// + Customers & Bench Technicians Directory (Unified Masthead & Visual Cards).
import { html, on, cls, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { fmtDateTime } from '../../kit/time.js';
import { money, initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { renderRepairStepper, buildPickupReadySms } from './pipeline.js';

const QA_ITEMS = ['Power', 'Display', 'Touch', 'Charging', 'Audio', 'Cameras', 'Buttons & Ports', 'Wi-Fi & Cellular'];
const CONTACT_PREFS = ['Text message', 'Phone call', 'Email'];
const TECH_SKILLS = ['Phones', 'Laptops', 'Consoles', 'Micro-soldering', 'Data recovery', 'Water damage'];

function ensureQaToggles(state) {
  if (!state.qaToggles) state.qaToggles = {};
  for (const item of QA_ITEMS) {
    if (state.qaToggles[item] !== 'Pass' && state.qaToggles[item] !== 'Fail') {
      state.qaToggles[item] = 'Pass';
    }
  }
  return state.qaToggles;
}

export function renderQaView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const qaCandidates = state.jobs.filter((j) => j.status === 'QA Check' || j.status === 'Repairing' || j.status === 'Ready for Pickup');
  const awaitingQaCount = state.jobs.filter((j) => j.status === 'QA Check').length;
  const readyJobs = state.jobs.filter((j) => j.status === 'Ready for Pickup');
  const toNotifyCount = readyJobs.filter((j) => !j.customer_notified).length;
  const activeTechs = state.technicians.filter((t) => t.active === 'Active');

  const qaTotal = state.checks.length;
  const qaPass = state.checks.filter((c) => c.result === 'Pass').length;
  const qaPct = qaTotal > 0 ? Math.round((qaPass / qaTotal) * 100) : 100;

  const toggles = ensureQaToggles(state);
  const passCount = QA_ITEMS.filter((item) => toggles[item] === 'Pass').length;
  const failCount = QA_ITEMS.length - passCount;
  const selectedJob = qaCandidates.find((j) => String(j.id) === String(state.qaJobId)) || qaCandidates[0] || null;

  return html`
    <section class="rb-masthead" aria-label="QA Verification and Pickup Desk">
      <div class="rb-masthead__copy">
        <div class="rb-masthead__eyebrow">
          ${icon('circuit-check', { size: 12 })} 8-POINT BENCH DIAGNOSTICS &amp; HAND-BACK
        </div>
        <h1 class="rb-masthead__title">QA &amp; Pickup Desk</h1>
        <div class="rb-masthead__meta">
          <span>Pass auto-routes to Pickup</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click Pickup Ready SMS</span>
        </div>
      </div>

      <div class="rb-masthead__pods" style="align-items:center">
        <div class="rb-pod rb-pod--ring rb-pod--cyan" aria-label="QA pass rate ${qaPct}%">
          <div class="tk-ring" style="--p:${qaPct}%;--ring-color:${qaPct >= 85 ? '#10b981' : '#f59e0b'};--ring-size:48px">
            <span class="tk-ring__val">${qaPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="rb-pod__lbl">QA Pass Rate</span>
            <span class="rb-pod__val" style="font-size:16.5px">${qaPass}/${qaTotal}</span>
            <span class="rb-pod__sub">Signed tests</span>
          </div>
        </div>
        <div class="rb-pod">
          <span class="rb-pod__lbl">${icon('circuit-check', { size: 12 })} In QA</span>
          <span class="rb-pod__val">${awaitingQaCount}</span>
          <span class="rb-pod__sub">Awaiting test</span>
        </div>
        <div class="rb-pod rb-pod--amber">
          <span class="rb-pod__lbl">${icon('check-circle', { size: 12 })} Ready</span>
          <span class="rb-pod__val">${readyJobs.length}</span>
          <span class="rb-pod__sub">On pickup shelf</span>
        </div>
        <div class="${cls('rb-pod rb-pod--wide-sm', { 'rb-pod--alert': toNotifyCount > 0 })}">
          <span class="rb-pod__lbl">${icon('bell', { size: 12 })} SMS Due</span>
          <span class="rb-pod__val">${toNotifyCount}</span>
          <span class="rb-pod__sub">${toNotifyCount ? 'Notify customer' : 'All notified'}</span>
        </div>
      </div>
    </section>

    ${state.loading && !state.jobs.length && !state.checks.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="tk-grid-2">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('circuit-check', { size: 18 })} 8-Point Diagnostic Test Bench</h2>
            <span class="tk-tag ${failCount === 0 ? 'tk-tag--ok' : 'tk-tag--bad'}" style="margin-left:auto">${passCount}/${QA_ITEMS.length} Passed</span>
          </div>
          <div class="tk-sheet__body">
            ${qaCandidates.length && activeTechs.length ? html`
              <form class="k-form" data-form="add-qa" novalidate>
                <div class="k-form__row">
                  <label class="k-field"><span class="k-field__label">Repair Ticket</span>
                    <select class="k-input" name="repair_job_id" data-action="qa-select-job" required>
                      ${qaCandidates.map((j) => html`<option value="${j.id}" ${selectedJob && selectedJob.id === j.id ? 'selected' : ''}>${j.ticket_code} · ${j.brand} ${j.model} (${j.status})</option>`)}
                    </select>
                  </label>
                  <label class="k-field"><span class="k-field__label">Inspected By</span>
                    <select class="k-input" name="checked_by_id" required>
                      ${activeTechs.map((t) => html`<option value="${t.id}">${t.name}</option>`)}
                    </select>
                  </label>
                </div>

                ${selectedJob ? html`
                  <div class="qa-inspect-banner">
                    <div class="tk-row__title">
                      <span class="rb-code">${selectedJob.ticket_code}</span>
                      <strong>${selectedJob.brand} ${selectedJob.model}</strong>
                      <span class="tk-tag">${selectedJob.issue_type}</span>
                      ${selectedJob.serial ? html`
                        <button type="button" class="rb-serial-chip" data-action="copy-phone" data-val="${selectedJob.serial}" title="Copy Serial / IMEI">
                          <span class="rb-serial-chip__val">SN: ${selectedJob.serial}</span>
                          ${icon('copy', { size: 11 })}
                        </button>` : ''}
                    </div>
                    ${renderRepairStepper(selectedJob.status)}
                  </div>` : ''}

                <div class="k-field">
                  <div class="qa-console-bar">
                    <span class="${cls('qa-console-bar__status', { 'is-pass': failCount === 0, 'is-fail': failCount > 0 })}">
                      <span class="${cls('qa-led', { 'qa-led--pass': failCount === 0, 'qa-led--fail': failCount > 0 })}"></span>
                      ${failCount === 0
                        ? `CH 01–08 DIAGNOSTIC BENCH · ${passCount}/${QA_ITEMS.length} PASS`
                        : `ALERT · ${failCount} CHANNEL${failCount === 1 ? '' : 'S'} FAILED (${passCount}/${QA_ITEMS.length} PASS)`}
                    </span>
                    <div class="tk-btn-row">
                      <button type="button" class="k-btn k-btn--sm" data-action="qa-all-pass">Pass All</button>
                      <button type="button" class="k-btn k-btn--sm" data-action="qa-all-fail">Fail All</button>
                    </div>
                  </div>

                  <div class="qa-toggle-grid" role="group" aria-label="8-Point QA Pass or Fail Diagnostic Grid">
                    ${QA_ITEMS.map((item, idx) => {
                      const val = toggles[item] || 'Pass';
                      const isPass = val === 'Pass';
                      const chCode = String(idx + 1).padStart(2, '0');
                      return html`
                        <div class="${cls('qa-toggle-tile', { 'is-pass': isPass, 'is-fail': !isPass })}" data-key="qat-${item}">
                          <div class="qa-toggle-tile__lead">
                            <span class="${cls('qa-led', { 'qa-led--pass': isPass, 'qa-led--fail': !isPass })}" aria-hidden="true"></span>
                            <div style="display:grid;gap:1px;min-width:0">
                              <span class="qa-toggle-tile__ch">CH ${chCode}</span>
                              <span class="qa-toggle-tile__name">${item}</span>
                            </div>
                          </div>
                          <div class="qa-toggle-seg">
                            <button type="button" class="${cls('qa-toggle-btn', { 'is-pass-on': isPass })}" data-action="qa-toggle" data-item="${item}" data-val="Pass">Pass</button>
                            <button type="button" class="${cls('qa-toggle-btn', { 'is-fail-on': !isPass })}" data-action="qa-toggle" data-item="${item}" data-val="Fail">Fail</button>
                          </div>
                        </div>`;
                    })}
                  </div>
                </div>

                <div class="k-form__row">
                  <label class="k-field"><span class="k-field__label">Final QA Decision</span>
                    <select class="k-input" name="result">
                      <option value="Pass" ${failCount === 0 ? 'selected' : ''}>Pass (Move to Ready for Pickup)</option>
                      <option value="Fail" ${failCount > 0 ? 'selected' : ''}>Fail (Return to Bench Repairing)</option>
                    </select>
                  </label>
                  <label class="k-field"><span class="k-field__label">Customer Notified</span>
                    <select class="k-input" name="notified">
                      <option value="Not yet">Not yet</option>
                      <option value="Yes">Yes — already notified</option>
                    </select>
                  </label>
                </div>
                <label class="k-field"><span class="k-field__label">QA Inspection Notes <span class="k-field__optional">optional</span></span>
                  <textarea class="k-input" name="notes" rows="2" placeholder="Charging wattage verified, TrueTone restored, adhesive sealed…"></textarea>
                </label>
                <div class="k-form__actions">
                  <button type="submit" class="k-btn k-btn--primary">${icon('shield-check', { size: 17 })} Sign Off QA Check (${passCount}/${QA_ITEMS.length})</button>
                </div>
              </form>` : emptyState({ iconName: 'circuit-check', title: 'No jobs awaiting QA', text: 'Advance a job to Repairing or QA Check on the Repair Pipeline to run final testing.' })}
          </div>
        </section>

        <div class="tk-stack">
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('bell', { size: 18 })} Ready for Pickup Desk</h2>
              <span class="tk-sheet__count">${readyJobs.length}</span>
            </div>
            <div>
              ${readyJobs.length ? readyJobs.map((j) => html`
                <div class="${cls('pickup-card', { 'pickup-card--notified': !!j.customer_notified })}" data-key="pk-${j.id}">
                  <div class="tk-row__title">
                    <span class="rb-code">${j.ticket_code}</span>
                    <strong>${j.brand} ${j.model}</strong>
                    ${j.customer_notified
                      ? html`<span class="tk-tag tk-tag--ok">${icon('check', { size: 12 })} Notified</span>`
                      : html`<span class="tk-tag tk-tag--warn">Needs SMS</span>`}
                  </div>
                  <div class="tk-row__meta">
                    <span>Customer: <strong>${j.customer_name}</strong> (${j.customer_phone})</span>
                    <span>Prefers: ${j.preferred_contact}</span>
                    <span>Total: <strong>${money(j.quote_amount_cents || 0, { currency })}</strong></span>
                  </div>
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="copy-pickup-sms" data-id="${j.id}">${icon('copy', { size: 14 })} Copy Pickup SMS</button>
                    ${!j.customer_notified ? html`
                      <button type="button" class="k-btn k-btn--sm" data-action="job-notify" data-id="${j.id}">${icon('bell', { size: 14 })} Mark Notified</button>` : ''}
                    <button type="button" class="k-btn k-btn--sm" data-action="job-collected" data-id="${j.id}">${icon('check-circle', { size: 14 })} Collected</button>
                  </div>
                </div>`) : emptyState({ iconName: 'check-circle', title: 'Pickup shelf is clear', text: 'Devices that pass QA appear here ready for customer notification.' })}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head"><h3 class="tk-sheet__title">${icon('clipboard', { size: 16 })} Recent QA Sign-Offs</h3><span class="tk-sheet__count">${state.checks.length}</span></div>
            <div>
              ${state.checks.length ? state.checks.slice(0, 8).map((qa) => html`
                <div class="tk-row" data-key="qa-${qa.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="rb-code">${qa.ticket_code}</span>
                      <span>${qa.brand} ${qa.model}</span>
                      <span class="tk-tag ${qa.result === 'Pass' ? 'tk-tag--ok' : 'tk-tag--bad'}">${qa.result}</span>
                      <span class="tk-tag ${qa.notified === 'Yes' ? 'tk-tag--ok' : 'tk-tag--warn'}">Notified: ${qa.notified}</span>
                    </div>
                    <div class="tk-row__meta">
                      <span>Passed ${(qa.checklist || []).length}/${QA_ITEMS.length} tests</span>
                      <span>By ${qa.checked_by_name}</span>
                      <span>${fmtDateTime(qa.created_at)}</span>
                    </div>
                    ${qa.notes ? html`<div class="tk-muted" style="font-size:13px">${qa.notes}</div>` : ''}
                  </div>
                </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No QA sign-offs logged yet.</p>`}
            </div>
          </section>
        </div>
      </div>`}`;
}

function customerFields(c = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Preferred Contact</span>
        <select class="k-input" name="preferred_contact">${CONTACT_PREFS.map((p) => html`<option value="${p}" ${p === (c.preferred_contact || 'Text message') ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" value="${c.notes || ''}"></label>`;
}

function techFields(t = {}) {
  const skills = t.skills || [];
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Technician Name</span><input class="k-input" name="name" value="${t.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${(t.active || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${t.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${t.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${t.phone || ''}"></label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Bench Skills</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${TECH_SKILLS.map((sk) => html`<label class="k-check"><input type="checkbox" name="skills" value="${sk}" ${skills.includes(sk) ? 'checked' : ''}><span>${sk}</span></label>`)}
      </div>
    </div>`;
}

export function renderDirectoryView(state) {
  const activeTechs = state.technicians.filter((t) => t.active === 'Active').length;
  const totalBenchJobs = state.technicians.reduce((s, t) => s + Number(t.active_jobs || 0), 0);

  return html`
    <section class="rb-masthead" aria-label="Customers and Bench Technicians">
      <div class="rb-masthead__copy">
        <div class="rb-masthead__eyebrow">
          ${icon('users', { size: 12 })} PEOPLE &amp; BENCH CAPACITY
        </div>
        <h1 class="rb-masthead__title">Customers &amp; Techs</h1>
        <div class="rb-masthead__meta">
          <span>Contact preferences</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Bench technician workload</span>
        </div>
      </div>

      <div class="rb-masthead__pods" style="align-items:center">
        <div class="rb-pod rb-pod--cyan">
          <span class="rb-pod__lbl">${icon('users', { size: 12 })} Customers</span>
          <span class="rb-pod__val">${state.customers.length}</span>
          <span class="rb-pod__sub">Profiles</span>
        </div>
        <div class="rb-pod rb-pod--amber">
          <span class="rb-pod__lbl">${icon('solder-iron', { size: 12 })} Bench Techs</span>
          <span class="rb-pod__val">${activeTechs}/${state.technicians.length}</span>
          <span class="rb-pod__sub">${totalBenchJobs} active jobs</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="k-btn k-btn--glass" data-action="tech-new">${icon('plus', { size: 15 })} Add Tech</button>
          <button type="button" class="k-btn k-btn--primary" data-action="cust-new">${icon('plus', { size: 15 })} Add Customer</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Directory tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.directoryTab === 'Customers' })}" data-action="dir-tab" data-tab="Customers">Customers (${state.customers.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.directoryTab === 'Technicians' })}" data-action="dir-tab" data-tab="Technicians">Bench Technicians (${state.technicians.length})</button>
      </div>
    </div>

    ${state.directoryTab === 'Customers' ? (
      state.loading && !state.customers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.customers.length ? html`
        <div class="rb-cust-grid">
          ${state.customers.map((c) => html`
            <article class="rb-cust-card" data-key="cu-${c.id}">
              <div class="tech-head">
                <span class="tech-avatar">${initials(c.name || 'C')}</span>
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <strong style="font-size:15.5px">${c.name}</strong>
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:5px">
                    <span class="tk-tag tk-tag--accent">${c.preferred_contact}</span>
                    <span class="tk-tag">${c.device_count || 0} device · ${c.job_count || 0} job</span>
                  </div>
                </div>
              </div>
              <div style="display:grid;gap:4px;font-size:12.5px;color:var(--k-muted)">
                ${c.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} <span>${c.phone}</span></div>` : ''}
                ${c.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 13 })} <span style="overflow:hidden;text-overflow:ellipsis">${c.email}</span></div>` : ''}
                ${c.notes ? html`<div style="margin-top:3px;color:var(--k-text);background:var(--k-surface-2);padding:7px 9px;border-radius:7px">${c.notes}</div>` : ''}
              </div>
              <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                <button type="button" class="k-btn k-btn--sm" data-action="copy-phone" data-val="${c.phone}">${icon('copy', { size: 13 })} Copy Phone</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="cust-edit" data-id="${c.id}">Edit</button>
              </div>
            </article>`)}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No customers yet', text: 'Add a customer when they drop off a device.' })}</section>`
    ) : state.loading && !state.technicians.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-cards">
        ${state.technicians.length ? state.technicians.map((t) => {
          const load = Number(t.active_jobs || 0);
          const loadPct = Math.min(100, Math.round((load / 5) * 100));
          return html`
            <article class="tk-card" data-key="tc-${t.id}">
              <div class="tk-card__head">
                <div class="tech-head">
                  <span class="tech-avatar">${initials(t.name)}</span>
                  <div>
                    <div class="tk-card__title">${t.name}</div>
                    <div class="tk-card__sub">Active bench jobs: <strong>${load}</strong></div>
                  </div>
                </div>
                <span class="tk-tag ${t.active === 'Active' ? 'tk-tag--ok' : ''}">${t.active}</span>
              </div>
              <div class="tk-bar"><div class="tk-bar__fill ${loadPct >= 80 ? 'tk-bar__fill--warn' : ''}" style="width:${loadPct}%"></div></div>
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                ${(t.skills || []).map((sk) => html`<span class="tk-tag tk-tag--accent">${sk}</span>`)}
              </div>
              <div class="tk-row__meta">
                ${t.phone ? html`<span>${t.phone}</span>` : ''}
                ${t.email ? html`<span>${t.email}</span>` : ''}
              </div>
              <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                <button type="button" class="k-btn k-btn--sm" data-action="tech-toggle" data-id="${t.id}" data-active="${t.active === 'Active' ? 'Inactive' : 'Active'}">
                  ${t.active === 'Active' ? 'Set Inactive' : 'Set Active'}
                </button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="tech-edit" data-id="${t.id}">Edit</button>
              </div>
            </article>`;
        }) : emptyState({ iconName: 'solder-iron', title: 'No technicians added yet', text: 'Add bench technicians with their repair skills.' })}
      </div>`}`;
}

export function wireQaDirectoryActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="dir-tab"]', (e, el) => { state.directoryTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="copy-phone"]', (e, el) => { copyText(el.dataset.val || '', { title: 'Copy Detail', done: 'Copied to clipboard.' }); });

  on(root, 'change', '[data-action="qa-select-job"]', (e, el) => {
    state.qaJobId = el.value;
    draw();
  });

  on(root, 'click', '[data-action="qa-toggle"]', (e, el) => {
    const toggles = ensureQaToggles(state);
    toggles[el.dataset.item] = el.dataset.val === 'Fail' ? 'Fail' : 'Pass';
    draw();
  });

  on(root, 'click', '[data-action="qa-all-pass"]', () => {
    const toggles = ensureQaToggles(state);
    for (const item of QA_ITEMS) toggles[item] = 'Pass';
    draw();
  });

  on(root, 'click', '[data-action="qa-all-fail"]', () => {
    const toggles = ensureQaToggles(state);
    for (const item of QA_ITEMS) toggles[item] = 'Fail';
    draw();
  });

  on(root, 'submit', 'form[data-form="add-qa"]', async (e, form) => {
    e.preventDefault();
    try {
      const vals = readForm(form);
      const toggles = ensureQaToggles(state);
      const passedChecklist = QA_ITEMS.filter((item) => toggles[item] === 'Pass');
      const res = await api.post('/api/qa', { ...vals, checklist: passedChecklist });
      for (const item of QA_ITEMS) toggles[item] = 'Pass';
      toast.success(res.check.result === 'Pass' ? 'QA passed — job moved to Ready for Pickup!' : 'QA failed — job returned to Repairing.');
      await loadScreen('/qa');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="job-notify"]', async (e, el) => {
    try { await api.post('/api/jobs/notify', { id: Number(el.dataset.id) }); toast.success('Customer marked notified.'); await loadScreen('/qa'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-pickup-sms"]', (e, el) => {
    const j = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    copyText(buildPickupReadySms(j, state.session.settings), { title: `Pickup Ready SMS · ${j.ticket_code}`, done: 'Pickup Ready SMS copied!' });
  });

  on(root, 'click', '[data-action="job-collected"]', async (e, el) => {
    try { await api.post('/api/jobs/advance', { id: Number(el.dataset.id), status: 'Collected' }); toast.success('Device marked Collected!'); await loadScreen('/qa'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cust-new"]', async () => {
    const made = await formDialog({ title: 'Add Customer', submitLabel: 'Save customer', fields: customerFields(), onSubmit: (v) => api.post('/api/customers', v) });
    if (made) { toast.success('Customer added.'); await loadScreen('/directory'); }
  });

  on(root, 'click', '[data-action="cust-edit"]', async (e, el) => {
    const c = state.customers.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save customer', fields: customerFields(c), onSubmit: (v) => api.put('/api/customers', { ...v, id: c.id }) });
    if (saved) { toast.success('Customer updated.'); await loadScreen('/directory'); }
  });

  on(root, 'click', '[data-action="tech-new"]', async () => {
    const made = await formDialog({
      title: 'Add Bench Technician',
      submitLabel: 'Add technician',
      size: 'lg',
      fields: techFields(),
      onSubmit: (v) => api.post('/api/technicians', { ...v, skills: Array.isArray(v.skills) ? v.skills : [] }),
    });
    if (made) { toast.success('Technician added.'); await loadScreen('/directory'); }
  });

  on(root, 'click', '[data-action="tech-edit"]', async (e, el) => {
    const t = state.technicians.find((x) => String(x.id) === el.dataset.id);
    if (!t) return;
    const saved = await formDialog({
      title: `Edit ${t.name}`,
      submitLabel: 'Save technician',
      size: 'lg',
      fields: techFields(t),
      onSubmit: (v) => api.put('/api/technicians', { ...v, id: t.id, skills: Array.isArray(v.skills) ? v.skills : [] }),
    });
    if (saved) { toast.success('Technician updated.'); await loadScreen('/directory'); }
  });

  on(root, 'click', '[data-action="tech-toggle"]', async (e, el) => {
    try { await api.put('/api/technicians', { id: Number(el.dataset.id), active: el.dataset.active }); toast.success('Technician status updated.'); await loadScreen('/directory'); }
    catch (err) { toastError(err); }
  });
}
