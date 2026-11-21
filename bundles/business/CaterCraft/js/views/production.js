// Kitchen Commissary Production Board (w/ Readiness Ring & Station Ribbons) & Visual Delivery Dispatch Runs w/ 4-Stage Steppers.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const STATIONS = ['Hot Kitchen', 'Cold Larder', 'Pastry', 'Packing'];
const TASK_NEXT = { 'Not started': 'In progress', 'In progress': 'Done', Blocked: 'In progress' };
const TASK_TAG = { 'Not started': 'tk-tag--warn', 'In progress': 'tk-tag--info', Done: 'tk-tag--ok', Blocked: 'tk-tag--bad' };

const RUN_STAGES = ['Scheduled', 'Loaded', 'En Route', 'Delivered'];
const RUN_NEXT = { Scheduled: 'Loaded', Loaded: 'En Route', 'En Route': 'Delivered', Issue: 'En Route' };
const RUN_TAG = { Scheduled: 'tk-tag--warn', Loaded: 'tk-tag--info', 'En Route': 'tk-tag--accent', Delivered: 'tk-tag--ok', Issue: 'tk-tag--bad' };

function printMasterPrepRunSheet(state) {
  const settings = state.session.settings || {};
  const tasks = state.tasks || [];
  const runs = state.runs || [];
  const dietary = state.dietary || [];

  const stationBlocks = STATIONS.map((st) => {
    const list = tasks.filter((t) => t.station === st);
    if (!list.length) return '';
    const rows = list.map((t) => `<tr>
      <td>${t.status === 'Done' ? '☑' : '☐'} <strong>${esc(t.task)}</strong>${t.notes ? `<div style="font-size:12px;color:#52525b">${esc(t.notes)}</div>` : ''}</td>
      <td>${esc(t.event_name)}</td>
      <td>${esc(fmtDay(t.due_date))} ${esc(t.due_time)}</td>
      <td>${esc(t.assigned_to || '—')}</td>
      <td>${esc(t.status)}</td>
    </tr>`).join('');
    return `<h3>${esc(st)} (${list.filter((t) => t.status === 'Done').length}/${list.length} done)</h3>
      <table><thead><tr><th>Prep Task</th><th>Event</th><th>Due</th><th>Chef</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  const runRows = runs.map((rn) => `<tr>
    <td><strong>${esc(rn.event_name)}</strong><div style="font-size:12px;color:#52525b">${esc(rn.venue_address || 'TBC')}</div></td>
    <td>${esc(fmtDay(rn.event_date))}</td>
    <td><strong>${esc(rn.pickup_time)} → ${esc(rn.delivery_time)}</strong></td>
    <td>${esc(rn.driver)}${rn.vehicle ? ' · ' + esc(rn.vehicle) : ''}</td>
    <td>${esc(rn.status)}</td>
    <td>${esc(rn.delivery_notes || '—')}</td>
  </tr>`).join('');

  const dietRows = dietary.map((d) => `<tr>
    <td><strong>${esc(d.event_name)}</strong> (${esc(fmtDay(d.event_date))})</td>
    <td><strong>${esc(d.requirement_type)}</strong></td>
    <td class="num">${d.guest_count}</td>
    <td>${esc(d.kitchen_confirmed)}</td>
    <td>${esc(d.notes || '—')}</td>
  </tr>`).join('');

  downloadHtmlDoc(`catercraft-kitchen-delivery-runsheet-${today()}.html`, {
    title: 'Kitchen Prep & Delivery Run Sheet',
    businessName: settings.business_name || 'CaterCraft',
    subtitle: `Printed ${fmtDay(today())} · ${tasks.length} prep tasks · ${runs.length} delivery runs`,
    accent: '#3f5f1e',
    bodyHtml: `
      ${stationBlocks || '<div class="box">No kitchen production tasks scheduled.</div>'}
      <h3>Delivery Dispatch Schedule (${runs.length})</h3>
      ${runRows ? `<table><thead><tr><th>Event &amp; Venue</th><th>Date</th><th>Window</th><th>Driver &amp; Van</th><th>Status</th><th>Access Notes</th></tr></thead><tbody>${runRows}</tbody></table>` : '<p>No delivery runs scheduled.</p>'}
      <h3>Dietary &amp; Allergen Alerts (${dietary.length})</h3>
      ${dietRows ? `<table><thead><tr><th>Event</th><th>Requirement</th><th class="num">Guests</th><th>Sign-Off</th><th>Notes</th></tr></thead><tbody>${dietRows}</tbody></table>` : '<p>No dietary alerts logged.</p>'}
    `,
  });
}

export function renderProductionView(state) {
  const allTasks = state.tasks || [];
  const doneTotal = allTasks.filter((t) => t.status === 'Done').length;
  const blockedTotal = allTasks.filter((t) => t.status === 'Blocked').length;
  const readyPct = allTasks.length > 0 ? Math.round((doneTotal / allTasks.length) * 100) : 100;
  const ringColor = readyPct === 100 ? '#22c55e' : '#e2bc63';

  // Unique events appearing in tasks for quick event filter
  const eventNames = [...new Set(allTasks.map((t) => t.event_name).filter(Boolean))];
  const evFilter = state.prodEventFilter || 'All';
  const visibleTasks = evFilter === 'All' ? allTasks : allTasks.filter((t) => t.event_name === evFilter);
  const stations = state.prodStation === 'All' ? STATIONS : [state.prodStation];

  return html`
    <section class="cc-masthead" aria-label="Commissary Production Command">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          ${icon('chef', { size: 12 })} COMMISSARY &amp; PREP SCHEDULE
        </div>
        <h1 class="cc-masthead__title">Kitchen Production</h1>
        <div class="cc-masthead__meta">
          <span>Hot Kitchen, Cold Larder, Pastry &amp; Packing batch prep</span>
          ${blockedTotal > 0 ? html`<span class="tk-meta-sep" aria-hidden="true">·</span><span style="color:#fecaca;font-weight:700">${blockedTotal} blocked</span>` : ''}
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod cc-pod--ring cc-pod--gold">
          <div class="tk-ring" style="--p:${readyPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${readyPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="cc-pod__lbl">Batch Ready</span>
            <span class="cc-pod__val" style="font-size:16px">${doneTotal}/${allTasks.length}</span>
            <span class="cc-pod__sub">${allTasks.length - doneTotal} remaining</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="k-btn k-btn--glass" data-action="print-master-runsheet">${icon('printer', { size: 15 })} Master Run Sheet</button>
          <button type="button" class="k-btn k-btn--primary" data-action="prod-new">${icon('plus', { size: 16 })} Add Task</button>
        </div>
      </div>

      <div class="cc-ribbons" role="tablist" aria-label="Filter by kitchen station">
        <button type="button" class="${cls('cc-ribbon-btn', { 'is-on': state.prodStation === 'All' })}" data-action="prod-station" data-station="All">
          <span>All Stations</span>
          <strong>${doneTotal}/${allTasks.length}</strong>
        </button>
        ${STATIONS.map((st) => {
          const stList = visibleTasks.filter((t) => t.station === st);
          const stDone = stList.filter((t) => t.status === 'Done').length;
          return html`
            <button type="button" class="${cls('cc-ribbon-btn', { 'is-on': state.prodStation === st })}" data-action="prod-station" data-station="${st}">
              <span>${st}</span>
              <strong>${stDone}/${stList.length}</strong>
            </button>`;
        })}
      </div>
    </section>

    ${eventNames.length > 1 ? html`
      <div class="tk-toolbar">
        <div class="tk-segmented">
          <button type="button" class="${cls('tk-pill', { 'is-on': evFilter === 'All' })}" data-action="prod-event" data-event="All">All Events (${allTasks.length})</button>
          ${eventNames.map((ev) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': evFilter === ev })}" data-action="prod-event" data-event="${ev}">${ev}</button>`)}
        </div>
      </div>` : ''}

    ${state.loading && !allTasks.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="cc-station-grid">
        ${stations.map((st) => {
          const list = visibleTasks.filter((tk) => tk.station === st);
          const done = list.filter((tk) => tk.status === 'Done').length;
          const pct = list.length ? Math.round((done / list.length) * 100) : 0;
          return html`
            <section class="tk-sheet" data-key="pcol-${st}">
              <div class="tk-sheet__head">
                <h2 class="tk-sheet__title">${icon(st === 'Packing' ? 'box' : 'chef', { size: 17 })} ${st}</h2>
                <span class="tk-sheet__count">${done}/${list.length} done</span>
                ${list.length ? html`<div class="cc-station-prog"><div class="tk-bar"><div class="tk-bar__fill ${pct === 100 ? 'tk-bar__fill--ok' : ''}" style="width:${pct}%"></div></div></div>` : ''}
              </div>
              <div>
                ${list.length ? list.map((tk) => html`
                  <div class="tk-row" data-key="ptk-${tk.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title">
                        <span style="${tk.status === 'Done' ? 'text-decoration:line-through;color:var(--k-muted)' : ''}">${tk.task}</span>
                        <span class="tk-tag ${TASK_TAG[tk.status] || ''}">${tk.status}</span>
                        ${tk.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="tk-row__meta">
                        <span><strong>${tk.event_name}</strong></span>
                        <span>${icon('clock', { size: 11 })} Due ${fmtDay(tk.due_date)} ${tk.due_time}</span>
                        ${tk.assigned_to ? html`<span>${tk.assigned_to}</span>` : ''}
                        ${tk.notes ? html`<span>${tk.notes}</span>` : ''}
                      </div>
                    </div>
                    <div class="tk-row__aside">
                      ${TASK_NEXT[tk.status] ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prod-bump" data-id="${tk.id}" data-status="${TASK_NEXT[tk.status]}">
                          ${tk.status === 'Not started' ? 'Start →' : tk.status === 'Blocked' ? 'Unblock' : 'Done ✓'}
                        </button>` : ''}
                      ${tk.status !== 'Done' && tk.status !== 'Blocked' ? html`
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prod-bump" data-id="${tk.id}" data-status="Blocked">Block</button>` : ''}
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prod-edit" data-id="${tk.id}">Edit</button>
                    </div>
                  </div>`) : html`<p class="tk-muted" style="padding:16px;font-size:13.5px">No tasks queued for ${st}.</p>`}
              </div>
            </section>`;
        })}
      </div>`}`;
}

export function renderDeliveriesView(state) {
  const runs = state.runs || [];
  const activeCount = runs.filter((r) => r.status !== 'Delivered').length;
  const loadedOrRoute = runs.filter((r) => r.status === 'Loaded' || r.status === 'En Route').length;
  const deliveredCount = runs.filter((r) => r.status === 'Delivered').length;

  return html`
    <section class="cc-masthead" aria-label="Delivery Dispatch Command">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          ${icon('truck', { size: 12 })} LOGISTICS &amp; REFRIGERATED VAN SCHEDULE
        </div>
        <h1 class="cc-masthead__title">Delivery Dispatch Runs</h1>
        <div class="cc-masthead__meta">
          <span>Track Scheduled → Loaded → En Route → Delivered with venue dock access notes</span>
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod cc-pod--gold">
          <span class="cc-pod__lbl">${icon('truck', { size: 12 })} Active Runs</span>
          <span class="cc-pod__val">${activeCount}</span>
          <span class="cc-pod__sub">${loadedOrRoute} loaded / rolling</span>
        </div>
        <div class="cc-pod">
          <span class="cc-pod__lbl">${icon('check-circle', { size: 12 })} Delivered</span>
          <span class="cc-pod__val">${deliveredCount}</span>
          <span class="cc-pod__sub">Completed drops</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="k-btn k-btn--glass" data-action="print-master-runsheet">${icon('printer', { size: 15 })} Master Run Sheet</button>
          <button type="button" class="k-btn k-btn--primary" data-action="run-new">${icon('plus', { size: 16 })} Schedule Run</button>
        </div>
      </div>
    </section>

    ${state.loading && !runs.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : runs.length ? html`
      <div class="cc-run-list">
        ${runs.map((rn) => {
          const stepIdx = RUN_STAGES.indexOf(rn.status);
          return html`
            <article class="cc-run-card" data-key="run-${rn.id}">
              <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                  <span class="cc-client-avatar">${initials(rn.driver || 'DR')}</span>
                  <div style="min-width:0">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                      <span class="cc-route-badge">${rn.pickup_time} → ${rn.delivery_time}</span>
                      <span class="tk-tag ${RUN_TAG[rn.status] || ''}">${rn.status}</span>
                      <span class="tk-tag">${fmtDay(rn.event_date)}</span>
                      ${rn.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="cc-job-title" style="margin-top:4px">${rn.event_name}</div>
                    <div style="font-size:12.5px;color:var(--k-muted);margin-top:2px">
                      Driver: <strong style="color:var(--k-text)">${rn.driver}</strong>${rn.vehicle ? ' · ' + rn.vehicle : ''}${rn.venue_address ? ' · ' + rn.venue_address : ''}
                    </div>
                  </div>
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  ${RUN_NEXT[rn.status] ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="run-status" data-id="${rn.id}" data-status="${RUN_NEXT[rn.status]}">
                      Mark ${RUN_NEXT[rn.status]} →
                    </button>` : ''}
                  ${rn.status !== 'Delivered' && rn.status !== 'Issue' ? html`
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="run-status" data-id="${rn.id}" data-status="Issue">Flag Issue</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="run-edit" data-id="${rn.id}">Edit</button>
                </div>
              </div>

              <div class="cc-run-steps">
                ${RUN_STAGES.map((st, idx) => html`
                  <div class="${cls('cc-run-step', { 'is-done': stepIdx > idx || rn.status === 'Delivered', 'is-now': stepIdx === idx && rn.status !== 'Delivered' })}">
                    ${idx < stepIdx || rn.status === 'Delivered' ? '✓ ' : ''}${st}
                  </div>`)}
              </div>

              ${rn.delivery_notes ? html`
                <div class="cc-dock-note">
                  ${icon('pin', { size: 14 })}
                  <span><strong>Dock &amp; Arrival Notes:</strong> ${rn.delivery_notes}</span>
                </div>` : ''}
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'truck', title: 'No delivery runs scheduled', text: 'Assign a driver, vehicle and pickup window for an upcoming catering event.' })}</section>`}`;
}

export function wireProductionActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="prod-station"]', (e, el) => { state.prodStation = el.dataset.station; draw(); });
  on(root, 'click', '[data-action="prod-event"]', (e, el) => { state.prodEventFilter = el.dataset.event; draw(); });
  on(root, 'click', '[data-action="print-master-runsheet"]', () => printMasterPrepRunSheet(state));

  on(root, 'click', '[data-action="prod-bump"]', async (e, el) => {
    try { await api.post('/api/production/status', { id: Number(el.dataset.id), status: el.dataset.status }); await loadScreen('/production'); }
    catch (err) { toastError(err); }
  });

  const prodFields = (tk = {}) => html`
    <label class="k-field"><span class="k-field__label">Catering event</span>
      <select class="k-input" name="job_id" ${tk.id ? 'disabled' : ''}>
        <option value="">General kitchen prep</option>
        ${state.jobs.map((j) => html`<option value="${j.id}" ${String(j.id) === String(tk.job_id) ? 'selected' : ''}>${j.job_number} — ${j.event_name} (${fmtDay(j.event_date)})</option>`)}
      </select>
    </label>
    <label class="k-field"><span class="k-field__label">Production task</span><input class="k-input" name="task" value="${tk.task || ''}" placeholder="e.g. Bake 120 sourdough dinner rolls" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Station</span>
        <select class="k-input" name="station">${STATIONS.map((s) => html`<option value="${s}" ${s === tk.station ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Due date</span><input class="k-input" type="date" name="due_date" value="${tk.due_date || today()}"></label>
      <label class="k-field"><span class="k-field__label">Due time</span><input class="k-input" type="time" name="due_time" value="${tk.due_time || '10:00'}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Assigned chef / staff</span><input class="k-input" name="assigned_to" value="${tk.assigned_to || ''}" placeholder="e.g. Chef Amir"></label>
      <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${tk.notes || ''}" placeholder="Batch size, allergen separation…"></label>
    </div>`;

  on(root, 'click', '[data-action="prod-new"]', async () => {
    const made = await formDialog({ title: 'Add Production Task', submitLabel: 'Add task', fields: prodFields(), onSubmit: (v) => api.post('/api/production', v) });
    if (made) { toast.success('Production task added.'); await loadScreen('/production'); }
  });

  on(root, 'click', '[data-action="prod-edit"]', async (e, el) => {
    const tk = state.tasks.find((x) => String(x.id) === el.dataset.id);
    if (!tk) return;
    const saved = await formDialog({ title: 'Edit Production Task', submitLabel: 'Save', fields: prodFields(tk), onSubmit: (v) => api.put('/api/production', { ...v, id: tk.id }) });
    if (saved) { toast.success('Production task updated.'); await loadScreen('/production'); }
  });

  const runFields = (rn = {}) => html`
    <label class="k-field"><span class="k-field__label">Catering event</span>
      <select class="k-input" name="job_id" ${rn.id ? 'disabled' : 'required'}>
        ${state.jobs.map((j) => html`<option value="${j.id}" ${String(j.id) === String(rn.job_id) ? 'selected' : ''}>${j.job_number} — ${j.event_name} (${fmtDay(j.event_date)})</option>`)}
      </select>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Driver</span><input class="k-input" name="driver" value="${rn.driver || ''}" placeholder="Driver name" required></label>
      <label class="k-field"><span class="k-field__label">Vehicle</span><input class="k-input" name="vehicle" value="${rn.vehicle || ''}" placeholder="e.g. Van 1 (Refrigerated)"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Pickup time</span><input class="k-input" type="time" name="pickup_time" value="${rn.pickup_time || '10:30'}"></label>
      <label class="k-field"><span class="k-field__label">Delivery time</span><input class="k-input" type="time" name="delivery_time" value="${rn.delivery_time || '11:30'}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Delivery &amp; loading dock notes</span><input class="k-input" name="delivery_notes" value="${rn.delivery_notes || ''}" placeholder="Gate codes, loading dock, contact on arrival…"></label>`;

  on(root, 'click', '[data-action="run-new"]', async () => {
    if (!state.jobs.length) { toast.error('Create a catering event first.'); return; }
    const made = await formDialog({ title: 'Schedule Delivery Run', submitLabel: 'Schedule run', fields: runFields(), onSubmit: (v) => api.post('/api/deliveries', { ...v, job_id: Number(v.job_id) }) });
    if (made) { toast.success('Delivery run scheduled.'); await loadScreen('/deliveries'); }
  });

  on(root, 'click', '[data-action="run-edit"]', async (e, el) => {
    const rn = state.runs.find((x) => String(x.id) === el.dataset.id);
    if (!rn) return;
    const saved = await formDialog({ title: 'Edit Delivery Run', submitLabel: 'Save', fields: runFields(rn), onSubmit: (v) => api.put('/api/deliveries', { ...v, id: rn.id }) });
    if (saved) { toast.success('Delivery run updated.'); await loadScreen('/deliveries'); }
  });

  on(root, 'click', '[data-action="run-status"]', async (e, el) => {
    try {
      await api.post('/api/deliveries/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Delivery marked ${el.dataset.status}.`);
      await loadScreen('/deliveries');
    } catch (err) { toastError(err); }
  });
}
