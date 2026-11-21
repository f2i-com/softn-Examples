// Jobs Pipeline view: Pass 3 Midnight Navy & Emerald-Mint masthead, 5-stage visual progress dots, Kanban board & table.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

export const JOB_STAGES = ['Lead', 'Quoted', 'In Progress', 'Completed', 'Invoiced'];
export const SERVICE_TYPES = ['Consulting', 'Installation', 'Repair / Maintenance', 'Design', 'Support', 'Other'];

function stageTone(stage) {
  if (stage === 'Invoiced') return 'tk-ticket--ok';
  if (stage === 'Completed') return 'tk-ticket--warn';
  if (stage === 'Lead') return 'tk-ticket--muted';
  return '';
}

export function renderJobsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const q = (state.jobSearch || '').trim().toLowerCase();
  const matched = q
    ? state.jobs.filter((j) => [j.title, j.client_name, j.service_type, j.description].some((v) => String(v || '').toLowerCase().includes(q)))
    : state.jobs;
  const jobs = state.jobStageFilter === 'All'
    ? matched
    : matched.filter((j) => j.status === state.jobStageFilter);

  const activeJobs = state.jobs.filter((j) => j.status !== 'Invoiced');
  const activeValue = activeJobs.reduce((s, j) => s + Number(j.estimated_cents || 0), 0);
  const inProgressCount = state.jobs.filter((j) => j.status === 'In Progress').length;
  const completedCount = state.jobs.filter((j) => j.status === 'Completed').length;
  const invoicedCount = state.jobs.filter((j) => j.status === 'Invoiced').length;
  const countStage = (st) => st === 'All' ? matched.length : matched.filter((j) => j.status === st).length;

  return html`
    <section class="ji-masthead" aria-label="Jobs Pipeline Command">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          WORK LIFECYCLE · ${state.jobs.length} JOB${state.jobs.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ji-masthead__title">Jobs Pipeline</h1>
        <div class="ji-masthead__meta">
          <span>Lead → Quoted → In Progress → Completed → Invoiced</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Raise quotes directly from any card</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--gold">
          <span class="ji-pod__lbl">Active Pipeline</span>
          <span class="ji-pod__val">${money(activeValue, { currency: cur })}</span>
          <span class="ji-pod__sub">${activeJobs.length} open job${activeJobs.length === 1 ? '' : 's'}</span>
        </div>
        <div class="ji-pod">
          <span class="ji-pod__lbl">In Progress</span>
          <span class="ji-pod__val">${inProgressCount}</span>
          <span class="ji-pod__sub">Active delivery</span>
        </div>
        <div class="ji-pod">
          <span class="ji-pod__lbl">Ready to Bill</span>
          <span class="ji-pod__val">${completedCount}</span>
          <span class="ji-pod__sub">Completed stage</span>
        </div>
        <div class="ji-pod ji-pod--mint">
          <span class="ji-pod__lbl">Invoiced</span>
          <span class="ji-pod__val">${invoicedCount}</span>
          <span class="ji-pod__sub">Converted to AR</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="job-new">${icon('plus', { size: 15 })} Add Job</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search job title, client, service…" value="${state.jobSearch || ''}" data-input="job-search">
      </div>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.jobViewMode === 'board' })}" data-action="job-mode" data-mode="board">${icon('grid', { size: 14 })} Board</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.jobViewMode === 'list' })}" data-action="job-mode" data-mode="list">${icon('list', { size: 14 })} List</button>
      </div>
      ${state.jobViewMode === 'list' ? html`
        <div class="tk-segmented">
          ${['All', ...JOB_STAGES].map((st) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.jobStageFilter === st })}" data-action="job-stage-filter" data-stage="${st}">${st} (${countStage(st)})</button>`)}
        </div>` : ''}
    </div>

    ${state.loading && !state.jobs.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.jobViewMode === 'board' ? html`
      <div class="ji-board-wrap">
        <div class="tk-board">
          ${JOB_STAGES.map((stage, stageIdx) => {
            const col = matched.filter((j) => j.status === stage);
            const colSum = col.reduce((a, b) => a + Number(b.estimated_cents || 0), 0);
            return html`
              <div class="tk-col" data-key="col-${stage}">
                <div class="tk-col__head">
                  <span>${stage} (${col.length})</span>
                  <span class="stage-sum">${money(colSum, { currency: cur })}</span>
                </div>
                ${col.length ? col.map((j) => html`
                  <div class="tk-ticket ${stageTone(stage)}" data-key="jb-${j.id}">
                    <div class="tk-ticket__top">
                      <span>${j.title}</span>
                      ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="ji-stage-dots" aria-hidden="true">
                      ${JOB_STAGES.map((s, i) => html`<span class="${cls('ji-stage-dot', { 'is-done': i < stageIdx, 'is-now': i === stageIdx })}"></span>`)}
                    </div>
                    <div class="tk-ticket__meta">
                      <strong>${j.client_name}</strong> · ${j.service_type}
                    </div>
                    <div class="tk-ticket__meta">
                      ${j.estimated_cents ? html`<span class="ledger-amount">${money(j.estimated_cents, { currency: cur })}</span>` : 'No estimate'}
                      ${j.start_date ? html` · Start ${fmtDay(j.start_date)}` : ''}
                    </div>
                    ${j.description ? html`<div class="tk-muted" style="font-size:12.5px">${j.description}</div>` : ''}
                    <div class="tk-ticket__foot">
                      <div class="tk-btn-row">
                        ${stage !== 'Invoiced' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-advance" data-id="${j.id}">Next Stage</button>` : ''}
                        <button type="button" class="k-btn k-btn--sm" data-action="quote-new-for-job" data-id="${j.id}">+ Quote</button>
                      </div>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
                    </div>
                  </div>`) : html`<div class="tk-muted" style="font-size:13px;padding:12px 4px">No jobs in ${stage}</div>`}
              </div>`;
          })}
        </div>
      </div>` : html`
      <section class="tk-sheet">
        ${jobs.length ? html`
          <div class="tk-table-wrap">
            <table class="tk-table">
              <thead>
                <tr><th>Job</th><th>Client</th><th>Service</th><th>Stage</th><th>Start</th><th class="tk-num">Estimate</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${jobs.map((j) => html`
                  <tr data-key="jrow-${j.id}">
                    <td><strong>${j.title}</strong>${j.is_sample ? html` <span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                    <td>${j.client_name}</td>
                    <td>${j.service_type}</td>
                    <td><span class="tk-tag ${j.status === 'Invoiced' ? 'tk-tag--ok' : j.status === 'In Progress' ? 'tk-tag--accent' : ''}">${j.status}</span></td>
                    <td>${fmtDay(j.start_date)}</td>
                    <td class="tk-num ledger-amount">${money(j.estimated_cents || 0, { currency: cur })}</td>
                    <td>
                      <div class="tk-btn-row">
                        ${j.status !== 'Invoiced' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-advance" data-id="${j.id}">Advance</button>` : ''}
                        <button type="button" class="k-btn k-btn--sm" data-action="quote-new-for-job" data-id="${j.id}">+ Quote</button>
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="job-del" data-id="${j.id}">Delete</button>
                      </div>
                    </td>
                  </tr>`)}
              </tbody>
            </table>
          </div>` : emptyState({ iconName: 'briefcase', title: 'No jobs in this stage', text: 'Create a job linked to any client to begin quoting and invoicing.' })}
      </section>`}`;
}

export function jobFormFields(clients, j = {}, presetClientId = null) {
  const cid = presetClientId || j.client_id || (clients[0] ? clients[0].id : '');
  return html`
    <label class="k-field"><span class="k-field__label">Client</span>
      <select class="k-input" name="client_id" required>
        ${clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(cid) ? 'selected' : ''}>${c.business_name} (${c.contact_name})</option>`)}
      </select>
    </label>
    <label class="k-field"><span class="k-field__label">Job Title</span>
      <input class="k-input" name="title" value="${j.title || ''}" placeholder="e.g. Office lighting upgrade" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Service Type</span>
        <select class="k-input" name="service_type">
          ${SERVICE_TYPES.map((s) => html`<option value="${s}" ${s === (j.service_type || 'Consulting') ? 'selected' : ''}>${s}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Pipeline Stage</span>
        <select class="k-input" name="status">
          ${JOB_STAGES.map((st) => html`<option value="${st}" ${st === (j.status || 'Lead') ? 'selected' : ''}>${st}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Start Date</span>
        <input class="k-input" type="date" name="start_date" value="${j.start_date || today()}">
      </label>
      <label class="k-field"><span class="k-field__label">Estimated Value</span>
        <input class="k-input" type="number" step="0.01" min="0" name="estimated_value" value="${j.estimated_cents ? (j.estimated_cents / 100).toFixed(2) : ''}" placeholder="0.00">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Scope / Description</span>
      <textarea class="k-input" name="description" rows="3" placeholder="Deliverables, materials, site notes…">${j.description || ''}</textarea>
    </label>`;
}

export function wireJobActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-input="job-search"]', (e, el) => { state.jobSearch = el.value; draw(); });
  on(root, 'click', '[data-action="job-mode"]', (e, el) => { state.jobViewMode = el.dataset.mode; draw(); });
  on(root, 'click', '[data-action="job-stage-filter"]', (e, el) => { state.jobStageFilter = el.dataset.stage; draw(); });

  async function openNewJob(presetClientId = null) {
    let clients = state.clients;
    if (!clients.length) {
      const r = await api.get('/api/clients');
      clients = r.clients || [];
      state.clients = clients;
    }
    if (!clients.length) {
      toast.error('Add a client first before creating a job.');
      return;
    }
    const made = await formDialog({
      title: 'Add Job',
      submitLabel: 'Save Job',
      fields: jobFormFields(clients, {}, presetClientId),
      onSubmit: (v) => api.post('/api/jobs', v),
    });
    if (made) { toast.success('Job added to pipeline.'); await loadScreen(); }
  }

  on(root, 'click', '[data-action="job-new"]', () => openNewJob(null));
  on(root, 'click', '[data-action="job-new-for-client"]', (e, el) => openNewJob(Number(el.dataset.id)));

  on(root, 'click', '[data-action="job-edit"]', async (e, el) => {
    const j = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!j) return;
    const saved = await formDialog({
      title: 'Edit Job',
      submitLabel: 'Save Job',
      fields: jobFormFields(state.clients, j),
      onSubmit: (v) => api.put('/api/jobs', { ...v, id: j.id }),
    });
    if (saved) { toast.success('Job updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="job-advance"]', async (e, el) => {
    try {
      const res = await api.post('/api/jobs/stage', { id: Number(el.dataset.id) });
      toast.success(`Job moved to ${res.job.status}.`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="job-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete job?', message: 'Deletes this job and any quotes linked to it.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/jobs', { id: Number(el.dataset.id) }); toast.success('Job deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
