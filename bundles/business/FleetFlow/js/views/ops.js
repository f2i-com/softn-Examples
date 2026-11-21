// Drivers Directory (Monogrammed Driver Cards), Maintenance Schedule & Incident Reports (3-Stage Visual Steppers).
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { trafficLightPill } from './command.js';

const LIC_CLASSES = ['Car', 'Light rigid', 'Medium rigid', 'Heavy rigid'];
const MAINT_TYPES = ['Service', 'Tyres', 'Brakes', 'Repair', 'Inspection', 'Registration check'];
const MAINT_STATUSES = ['Scheduled', 'Booked', 'In Workshop', 'Completed'];
const MAINT_STEPS = ['Scheduled', 'In Workshop', 'Completed'];
const INC_TYPES = ['Collision', 'Near miss', 'Damage', 'Breakdown', 'Fine or infringement'];
const SEVERITIES = ['High', 'Medium', 'Low'];
const INC_STATUSES = ['Reported', 'Under review', 'Resolved'];

// ---- Drivers Directory ----

export function renderDriversView(state) {
  const drivers = state.drivers || [];
  const activeCount = drivers.filter((d) => d.active === 'Active').length;
  const expiringCount = drivers.filter((d) => d.active === 'Active' && d.licence_days_left !== null && d.licence_days_left <= 30).length;
  const totalKm = drivers.reduce((s, d) => s + Number(d.driven_km || 0), 0);

  return html`
    <section class="ff-masthead" aria-label="Drivers Directory">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          ${icon('users', { size: 12 })} DRIVERS &amp; LICENCE COMPLIANCE
        </div>
        <h1 class="ff-masthead__title">Drivers Directory</h1>
        <div class="ff-masthead__meta">
          <span>Traffic-light licence expiry status with 1-click +1 yr renewals</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Synced with Fleet Command &amp; Trip Logbook</span>
        </div>
      </div>

      <div class="ff-masthead__pods" style="align-items:center">
        <div class="ff-pod ff-pod--good">
          <span class="ff-pod__lbl">Active</span>
          <span class="ff-pod__val">${activeCount}</span>
          <span class="ff-pod__sub">Of ${drivers.length} drivers</span>
        </div>
        <div class="${cls('ff-pod', { 'ff-pod--alert': expiringCount > 0, 'ff-pod--good': !expiringCount })}">
          <span class="ff-pod__lbl">Expiring</span>
          <span class="ff-pod__val">${expiringCount}</span>
          <span class="ff-pod__sub">${expiringCount ? 'Due <= 30d' : 'All valid'}</span>
        </div>
        <div class="ff-pod ff-pod--amber">
          <span class="ff-pod__lbl">Logged km</span>
          <span class="ff-pod__val">${num(totalKm)}</span>
          <span class="ff-pod__sub">Combined trips</span>
        </div>
        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="drv-new">${icon('plus', { size: 15 })} Add Driver</button>
        </div>
      </div>
    </section>

    ${state.loading && !drivers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : drivers.length ? html`
      <div class="ff-driver-grid">
        ${drivers.map((d) => html`
          <article class="ff-driver-card" data-key="drv-${d.id}">
            <div class="ff-driver-head">
              <div class="ff-avatar-sq">${initials(d.driver_name)}</div>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <h2 class="tk-card__title" style="font-size:15.5px">${d.driver_name}</h2>
                  ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:3px">
                  <span class="tk-tag tk-tag--accent">${d.licence_class}</span>
                  <span class="tk-tag ${d.active === 'Active' ? 'tk-tag--ok' : ''}">${d.active}</span>
                </div>
              </div>
            </div>

            <div class="ff-stat-pair">
              <div>
                <div class="ff-stat-pair__k">Licence Status</div>
                <div style="margin-top:3px">${trafficLightPill(d.licence_expiry, d.licence_days_left, { emptyText: 'No expiry' })}</div>
                <div class="tk-muted" style="font-size:11px;margin-top:2px">${d.licence_expiry ? fmtDay(d.licence_expiry) : 'Not recorded'}</div>
              </div>
              <div>
                <div class="ff-stat-pair__k">Logged Driving</div>
                <div class="ff-stat-pair__v">${num(d.driven_km || 0)} km</div>
                <div class="tk-muted" style="font-size:11px">${d.trip_count || 0} trip${d.trip_count === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div class="tk-row__meta">
              ${d.phone ? html`<span>${icon('phone', { size: 13 })} ${d.phone}</span>` : ''}
              ${d.email ? html`<span>${icon('mail', { size: 13 })} ${d.email}</span>` : ''}
            </div>
            ${d.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${d.notes}</p>` : ''}

            <div class="tk-btn-row" style="padding-top:9px;border-top:1px solid var(--k-border)">
              <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} Licence">+1 yr</button>
              <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} — Driver Licence">Renew…</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="drv-edit" data-id="${d.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="drv-del" data-id="${d.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No drivers on file', text: 'Add drivers with their licence class and expiry dates so trips can be assigned.' })}</section>`}`;
}

// ---- Maintenance Schedule ----

export function renderMaintenanceView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const allJobs = state.maintenance || [];
  const rows = state.maintStatusFilter === 'All'
    ? allJobs
    : allJobs.filter((j) => j.status === state.maintStatusFilter);
  const totalSpend = allJobs.reduce((s, j) => s + Number(j.cost_cents || 0), 0);
  const workshopCount = allJobs.filter((j) => j.status === 'In Workshop').length;
  const openCount = allJobs.filter((j) => j.status !== 'Completed').length;
  const doneCount = allJobs.filter((j) => j.status === 'Completed').length;

  return html`
    <section class="ff-masthead" aria-label="Maintenance & Workshop Schedule">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          ${icon('wrench', { size: 12 })} WORKSHOP &amp; SERVICE PIPELINE
        </div>
        <h1 class="ff-masthead__title">Maintenance Schedule</h1>
        <div class="ff-masthead__meta">
          <span>Moving a job to <strong>In Workshop</strong> updates vehicle status automatically</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Completing returns vehicle to Available</span>
        </div>
      </div>

      <div class="ff-masthead__pods" style="align-items:center">
        <div class="${cls('ff-pod', { 'ff-pod--alert': workshopCount > 0, 'ff-pod--good': !workshopCount })}">
          <span class="ff-pod__lbl">In Workshop</span>
          <span class="ff-pod__val">${workshopCount}</span>
          <span class="ff-pod__sub">${openCount} open total</span>
        </div>
        <div class="ff-pod ff-pod--amber">
          <span class="ff-pod__lbl">Total Spend</span>
          <span class="ff-pod__val">${money(totalSpend, { currency: cur })}</span>
          <span class="ff-pod__sub">${allJobs.length} job${allJobs.length === 1 ? '' : 's'}</span>
        </div>
        <div class="ff-pod ff-pod--good">
          <span class="ff-pod__lbl">Completed</span>
          <span class="ff-pod__val">${doneCount}</span>
          <span class="ff-pod__sub">Signed off</span>
        </div>
        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="maint-new">${icon('plus', { size: 15 })} Schedule Job</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by maintenance status">
        ${['All', ...MAINT_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.maintStatusFilter === st })}" data-action="maint-filter" data-status="${st}">${st}</button>`)}
      </div>
    </div>

    ${state.loading && !allJobs.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="ff-ops-list">
        ${rows.map((job) => {
          const stepIdx = job.status === 'Completed' ? 2 : job.status === 'In Workshop' ? 1 : 0;
          const cardMod = job.status === 'Completed' ? 'ff-ops-card--ok' : job.status === 'In Workshop' ? 'ff-ops-card--warn' : '';
          return html`
            <article class="ff-ops-card ${cardMod}" data-key="mj-${job.id}">
              <div class="ff-ops-card__top">
                <div style="display:grid;gap:5px;min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:15px;font-weight:750">
                    ${job.registration ? html`<span class="rego-plate">${job.registration}</span>` : ''}
                    <span>${job.vehicle_name}</span>
                    <span class="tk-tag tk-tag--accent">${job.maintenance_type}</span>
                    <span class="tk-tag ${job.status === 'Completed' ? 'tk-tag--ok' : job.status === 'In Workshop' ? 'tk-tag--warn' : 'tk-tag--info'}">${job.status}</span>
                    ${job.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    ${job.due_date ? html`<span>Due: <strong>${fmtDayNear(job.due_date)}</strong> (${job.due_date})</span>` : ''}
                    ${job.completed_date ? html`<span>Completed: ${fmtDay(job.completed_date)}</span>` : ''}
                    ${job.supplier ? html`<span>Workshop: ${job.supplier}</span>` : ''}
                    <span>Cost: <strong style="color:var(--k-text)">${money(job.cost_cents, { currency: cur })}</strong></span>
                  </div>
                  ${job.notes ? html`<div class="tk-muted" style="font-size:12.5px">${job.notes}</div>` : ''}
                </div>
                <div class="tk-btn-row">
                  ${job.status !== 'In Workshop' && job.status !== 'Completed' ? html`
                    <button type="button" class="k-btn k-btn--sm" data-action="maint-status" data-id="${job.id}" data-status="In Workshop">Move to Workshop</button>` : ''}
                  ${job.status !== 'Completed' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="maint-status" data-id="${job.id}" data-status="Completed">${icon('check', { size: 14 })} Complete</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="maint-edit" data-id="${job.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="maint-del" data-id="${job.id}">Del</button>
                </div>
              </div>
              <div class="ff-steps" aria-label="Workshop progress">
                ${MAINT_STEPS.map((st, idx) => html`
                  <div class="${cls('ff-step', { 'is-done': idx < stepIdx || (st === 'Completed' && job.status === 'Completed'), 'is-now': idx === stepIdx && job.status !== 'Completed' })}">
                    ${idx < stepIdx || (st === 'Completed' && job.status === 'Completed') ? icon('check', { size: 12 }) : ''}
                    <span>${idx + 1}. ${st}</span>
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'wrench', title: 'No maintenance jobs matching filter', text: 'Schedule logbook services, tyre changes and roadworthy inspections for your fleet.' })}</section>`}`;
}

// ---- Incident Reports ----

export function renderIncidentsView(state) {
  const allInc = state.incidents || [];
  const rows = allInc.filter((inc) => {
    if (state.incStatusFilter !== 'All' && inc.status !== state.incStatusFilter) return false;
    if (state.incSevFilter !== 'All' && inc.severity !== state.incSevFilter) return false;
    return true;
  });
  const openCount = allInc.filter((i) => i.status !== 'Resolved').length;
  const highCount = allInc.filter((i) => i.status !== 'Resolved' && i.severity === 'High').length;
  const resolvedCount = allInc.filter((i) => i.status === 'Resolved').length;

  return html`
    <section class="ff-masthead" aria-label="Fleet Safety & Incident Register">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          ${icon('alert', { size: 12 })} SAFETY &amp; INSURANCE REGISTER
        </div>
        <h1 class="ff-masthead__title">Incident Reports</h1>
        <div class="ff-masthead__meta">
          <span>Document collisions, near misses, breakdowns &amp; infringements</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable insurance sheets with resolution tracking</span>
        </div>
      </div>

      <div class="ff-masthead__pods" style="align-items:center">
        <div class="${cls('ff-pod', { 'ff-pod--alert': openCount > 0, 'ff-pod--good': !openCount })}">
          <span class="ff-pod__lbl">Open</span>
          <span class="ff-pod__val">${openCount}</span>
          <span class="ff-pod__sub">Active cases</span>
        </div>
        <div class="${cls('ff-pod', { 'ff-pod--alert': highCount > 0, 'ff-pod--good': !highCount })}">
          <span class="ff-pod__lbl">High Sev</span>
          <span class="ff-pod__val">${highCount}</span>
          <span class="ff-pod__sub">${highCount ? 'Priority review' : 'None high'}</span>
        </div>
        <div class="ff-pod ff-pod--good">
          <span class="ff-pod__lbl">Resolved</span>
          <span class="ff-pod__val">${resolvedCount}</span>
          <span class="ff-pod__sub">Closed out</span>
        </div>
        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="inc-new">${icon('plus', { size: 15 })} Report Incident</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by incident status">
        ${['All', ...INC_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.incStatusFilter === st })}" data-action="inc-status-filter" data-status="${st}">${st}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Filter by severity">
        ${['All', ...SEVERITIES].map((sv) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.incSevFilter === sv })}" data-action="inc-sev-filter" data-sev="${sv}">${sv}</button>`)}
      </div>
    </div>

    ${state.loading && !allInc.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="ff-ops-list">
        ${rows.map((inc) => {
          const stepIdx = INC_STATUSES.indexOf(inc.status);
          const cardMod = inc.status === 'Resolved' ? 'ff-ops-card--ok' : inc.severity === 'High' ? 'ff-ops-card--bad' : inc.severity === 'Medium' ? 'ff-ops-card--warn' : '';
          return html`
            <article class="ff-ops-card ${cardMod}" data-key="inc-${inc.id}">
              <div class="ff-ops-card__top">
                <div style="display:grid;gap:5px;min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:15px;font-weight:750">
                    ${inc.registration ? html`<span class="rego-plate">${inc.registration}</span>` : ''}
                    <span>${inc.incident_type}</span>
                    <span class="tk-tag ${inc.severity === 'High' ? 'tk-tag--bad' : inc.severity === 'Medium' ? 'tk-tag--warn' : 'tk-tag--info'}">${inc.severity}</span>
                    <span class="tk-tag ${inc.status === 'Resolved' ? 'tk-tag--ok' : inc.status === 'Under review' ? 'tk-tag--warn' : 'tk-tag--bad'}">${inc.status}</span>
                    ${inc.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span><strong>${inc.vehicle_name}</strong> · Driver: <strong>${inc.driver_name}</strong></span>
                    <span>Date: ${fmtDay(inc.incident_date)}</span>
                  </div>
                  ${inc.description ? html`<div style="font-size:13.5px">${inc.description}</div>` : ''}
                  ${inc.resolution_notes ? html`<div class="tk-muted" style="font-size:12.5px"><strong>Resolution:</strong> ${inc.resolution_notes}</div>` : ''}
                </div>
                <div class="tk-btn-row">
                  ${inc.status === 'Reported' ? html`<button type="button" class="k-btn k-btn--sm" data-action="inc-set-status" data-id="${inc.id}" data-status="Under review">Review</button>` : ''}
                  ${inc.status !== 'Resolved' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inc-resolve" data-id="${inc.id}">Resolve</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="inc-print" data-id="${inc.id}">${icon('printer', { size: 14 })} Sheet</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="inc-del" data-id="${inc.id}">Del</button>
                </div>
              </div>
              <div class="ff-steps" aria-label="Incident workflow">
                ${INC_STATUSES.map((st, idx) => html`
                  <div class="${cls('ff-step', { 'is-done': idx < stepIdx || (st === 'Resolved' && inc.status === 'Resolved'), 'is-now': idx === stepIdx && inc.status !== 'Resolved' })}">
                    ${idx < stepIdx || (st === 'Resolved' && inc.status === 'Resolved') ? icon('check', { size: 12 }) : ''}
                    <span>${idx + 1}. ${st}</span>
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'shield-check', title: 'No incidents matching filter', text: 'All safety, breakdown and damage reports are tracked here.' })}</section>`}`;
}

export function wireFleetOpsActions(root, state, { draw, loadScreen }) {
  const driverFields = (d = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Driver name</span><input class="k-input" name="driver_name" value="${d.driver_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Licence class</span>
        <select class="k-input" name="licence_class">${LIC_CLASSES.map((c) => html`<option value="${c}" ${c === (d.licence_class || 'Car') ? 'selected' : ''}>${c}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Licence expiry</span><input class="k-input" type="date" name="licence_expiry" value="${d.licence_expiry || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${(d.active || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${d.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${d.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${d.email || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" value="${d.notes || ''}"></label>`;

  on(root, 'click', '[data-action="drv-new"]', async () => {
    const made = await formDialog({ title: 'Add Driver', submitLabel: 'Save driver', fields: driverFields(), onSubmit: (v) => api.post('/api/drivers', v) });
    if (made) { toast.success('Driver added.'); await loadScreen('/drivers'); }
  });

  on(root, 'click', '[data-action="drv-edit"]', async (e, el) => {
    const d = state.drivers.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const saved = await formDialog({ title: `Edit ${d.driver_name}`, submitLabel: 'Save driver', fields: driverFields(d), onSubmit: (v) => api.put('/api/drivers', { ...v, id: d.id }) });
    if (saved) { toast.success('Driver updated.'); await loadScreen('/drivers'); }
  });

  on(root, 'click', '[data-action="drv-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove driver?', message: 'Delete this driver from the directory?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/drivers', { id: Number(el.dataset.id) }); toast.success('Driver removed.'); await loadScreen('/drivers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="maint-filter"]', (e, el) => { state.maintStatusFilter = el.dataset.status; draw(); });

  const maintFields = (j = {}, isNew = false) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Vehicle</span>
        <select class="k-input" name="vehicle_id" ${isNew ? 'required' : 'disabled'}>
          ${state.vehicles.map((v) => html`<option value="${v.id}" ${String(v.id) === String(j.vehicle_id || '') ? 'selected' : ''}>${v.registration ? `[${v.registration}] ` : ''}${v.vehicle_name}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Job type</span>
        <select class="k-input" name="maintenance_type">${MAINT_TYPES.map((t) => html`<option value="${t}" ${t === (j.maintenance_type || 'Service') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Due date</span><input class="k-input" type="date" name="due_date" value="${j.due_date || today()}"></label>
      <label class="k-field"><span class="k-field__label">Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" value="${j.cost_cents != null ? (j.cost_cents / 100).toFixed(2) : '0.00'}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${MAINT_STATUSES.map((st) => html`<option value="${st}" ${st === (j.status || 'Scheduled') ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Workshop / Supplier</span><input class="k-input" name="supplier" value="${j.supplier || ''}" placeholder="e.g. City Commercial Auto"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2" placeholder="Parts, quote reference, service interval…">${j.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="maint-new"]', async () => {
    if (!state.vehicles.length) { toast.error('Register a vehicle first.'); return; }
    const made = await formDialog({ title: 'Schedule Maintenance Job', submitLabel: 'Save job', fields: maintFields({}, true), onSubmit: (v) => api.post('/api/maintenance', v) });
    if (made) { toast.success('Maintenance job scheduled.'); await loadScreen('/maintenance'); }
  });

  on(root, 'click', '[data-action="maint-edit"]', async (e, el) => {
    const j = state.maintenance.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    const saved = await formDialog({ title: `Edit ${j.maintenance_type}`, submitLabel: 'Save job', fields: maintFields(j, false), onSubmit: (v) => api.put('/api/maintenance', { ...v, id: j.id }) });
    if (saved) { toast.success('Maintenance job updated.'); await loadScreen('/maintenance'); }
  });

  on(root, 'click', '[data-action="maint-status"]', async (e, el) => {
    try {
      await api.post('/api/maintenance/status', { id: Number(el.dataset.id), status: el.dataset.status, completed_date: today() });
      toast.success(`Job moved to ${el.dataset.status}.`);
      await loadScreen('/maintenance');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="maint-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete maintenance job?', message: 'Remove this job from the maintenance schedule?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/maintenance', { id: Number(el.dataset.id) }); toast.success('Maintenance job deleted.'); await loadScreen('/maintenance'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-status-filter"]', (e, el) => { state.incStatusFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="inc-sev-filter"]', (e, el) => { state.incSevFilter = el.dataset.sev; draw(); });

  on(root, 'click', '[data-action="inc-new"]', async () => {
    if (!state.vehicles.length || !state.drivers.length) { toast.error('Add a vehicle and a driver first.'); return; }
    const made = await formDialog({
      title: 'Report Fleet Incident',
      submitLabel: 'Submit report',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Vehicle</span>
            <select class="k-input" name="vehicle_id" required>
              ${state.vehicles.map((v) => html`<option value="${v.id}">${v.registration ? `[${v.registration}] ` : ''}${v.vehicle_name}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Driver</span>
            <select class="k-input" name="driver_id" required>
              ${state.drivers.map((d) => html`<option value="${d.id}">${d.driver_name}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="incident_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Type</span>
            <select class="k-input" name="incident_type">${INC_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Severity</span>
            <select class="k-input" name="severity">${SEVERITIES.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">What happened</span>
          <textarea class="k-input" name="description" rows="3" placeholder="Location, witnesses, vehicle damage, police or claim ref…" required></textarea>
        </label>`,
      onSubmit: (v) => api.post('/api/incidents', v),
    });
    if (made) { toast.success('Incident reported.'); await loadScreen('/incidents'); }
  });

  on(root, 'click', '[data-action="inc-set-status"]', async (e, el) => {
    try {
      await api.post('/api/incidents/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Incident moved to ${el.dataset.status}.`);
      await loadScreen('/incidents');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-resolve"]', async (e, el) => {
    const inc = state.incidents.find((x) => String(x.id) === el.dataset.id);
    if (!inc) return;
    const done = await formDialog({
      title: `Resolve Incident #${inc.id}`,
      submitLabel: 'Mark Resolved',
      fields: html`
        <label class="k-field"><span class="k-field__label">Resolution &amp; insurance notes</span>
          <textarea class="k-input" name="resolution_notes" rows="3" placeholder="Repairs completed, insurer claim #, safety follow-up…">${inc.resolution_notes || ''}</textarea>
        </label>`,
      onSubmit: (v) => api.post('/api/incidents/status', { id: inc.id, status: 'Resolved', resolution_notes: v.resolution_notes }),
    });
    if (done) { toast.success('Incident resolved.'); await loadScreen('/incidents'); }
  });

  on(root, 'click', '[data-action="inc-print"]', (e, el) => {
    const inc = state.incidents.find((x) => String(x.id) === el.dataset.id);
    if (!inc) return;
    downloadHtmlDoc(`incident-${inc.id}.html`, {
      title: `Fleet Incident Report #${inc.id}`,
      businessName: state.session.settings.business_name,
      subtitle: `${inc.incident_date} · ${inc.severity} Severity · ${inc.status}`,
      accent: '#135596',
      bodyHtml: `<table>
        <tr><th>Vehicle</th><td>${esc(inc.registration ? `[${inc.registration}] ` : '')}${esc(inc.vehicle_name)}</td></tr>
        <tr><th>Driver</th><td>${esc(inc.driver_name)}</td></tr>
        <tr><th>Incident Type</th><td>${esc(inc.incident_type)} (${esc(inc.severity)})</td></tr>
        <tr><th>Status</th><td>${esc(inc.status)}</td></tr>
      </table>
      <div class="box"><strong>Description:</strong><br>${esc(inc.description || '—')}</div>
      ${inc.resolution_notes ? `<div class="box"><strong>Resolution Notes:</strong><br>${esc(inc.resolution_notes)}</div>` : ''}`,
    });
  });

  on(root, 'click', '[data-action="inc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete incident?', message: 'Permanently delete this incident report?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/incidents', { id: Number(el.dataset.id) }); toast.success('Incident deleted.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });
}
