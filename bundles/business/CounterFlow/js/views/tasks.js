// Store Floor Tasks — Unified Masthead with Completion Conic Ring, Routine Progress Cards & 1-Click Done.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const ROUTINES = ['All', 'Opening', 'Merchandising', 'Stocktake', 'Closing'];
const FORM_ROUTINES = ['Opening', 'Merchandising', 'Stocktake', 'Closing'];
const AREAS = ['Floor', 'Stockroom', 'Display', 'Admin', 'Online'];
const PRIOS = ['High', 'Medium', 'Low'];
const STATUSES = ['To do', 'Doing', 'Done', 'Blocked'];

function taskFormFields(tk = {}, staff = []) {
  return html`
    <label class="k-field"><span class="k-field__label">Task title</span>
      <input class="k-input" name="task_title" value="${tk.task_title || ''}" placeholder="e.g. Rebuild window plinth display" required>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Routine</span>
        <select class="k-input" name="routine">
          ${FORM_ROUTINES.map((r) => html`<option value="${r}" ${r === (tk.routine || 'Merchandising') ? 'selected' : ''}>${r}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Area</span>
        <select class="k-input" name="area">
          ${AREAS.map((a) => html`<option value="${a}" ${a === (tk.area || 'Floor') ? 'selected' : ''}>${a}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">
          ${PRIOS.map((p) => html`<option value="${p}" ${p === (tk.priority || 'Medium') ? 'selected' : ''}>${p}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Assigned to</span>
        <select class="k-input" name="assigned_staff_id">
          <option value="">— Unassigned —</option>
          ${staff.filter((s) => s.active === 'Active').map((s) => html`<option value="${s.id}" ${String(s.id) === String(tk.assigned_staff_id || '') ? 'selected' : ''}>${s.name} (${s.role})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Due date</span>
        <input class="k-input" type="date" name="due_date" value="${tk.due_date || today()}">
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">
          ${STATUSES.map((st) => html`<option value="${st}" ${st === (tk.status || 'To do') ? 'selected' : ''}>${st}</option>`)}
        </select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Anything the team member picking this up should know…">${tk.notes || ''}</textarea>
    </label>`;
}

export function renderTasksView(state) {
  const tday = today();
  const allTasks = state.tasks || [];
  const scopeTasks = state.taskRoutine === 'All' ? allTasks : allTasks.filter((t) => t.routine === state.taskRoutine);
  const scopeTotal = scopeTasks.length;
  const scopeDone = scopeTasks.filter((t) => t.status === 'Done').length;
  const scopePct = scopeTotal > 0 ? Math.round((scopeDone / scopeTotal) * 100) : 0;

  const rows = scopeTasks.filter((tk) => {
    if (state.taskStatus === 'Open' && tk.status === 'Done') return false;
    if (state.taskStatus !== 'All' && state.taskStatus !== 'Open' && tk.status !== state.taskStatus) return false;
    return true;
  });

  const openCount = allTasks.filter((t) => t.status !== 'Done').length;
  const doneCount = allTasks.filter((t) => t.status === 'Done').length;
  const overdueCount = allTasks.filter((t) => t.status !== 'Done' && t.due_date && t.due_date < tday).length;
  const ringColor = scopePct === 100 && scopeTotal > 0 ? '#34d399' : '#ec6e43';

  return html`
    <section class="cf-masthead" aria-label="Store Floor Tasks">
      <div class="cf-masthead__copy">
        <div class="cf-masthead__eyebrow">
          ${icon('check-square', { size: 12 })} DAILY FLOOR ROUTINES
        </div>
        <h1 class="cf-masthead__title">Store Floor Tasks</h1>
        <div class="cf-masthead__meta">
          <span>Shop floor, stockroom, window displays &amp; online dispatch</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click shift sign-off</span>
        </div>
      </div>

      <div class="cf-masthead__pods cf-masthead__pods--3" style="align-items:center">
        <div class="cf-pod cf-pod--ring">
          <div class="tk-ring" style="--p:${scopePct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${scopePct}%</span>
          </div>
          <div>
            <span class="cf-pod__lbl">${state.taskRoutine === 'All' ? 'All Routines' : state.taskRoutine}</span>
            <span class="cf-pod__val">${scopeDone}/${scopeTotal}</span>
            <span class="cf-pod__sub">Completed</span>
          </div>
        </div>
        <div class="cf-pod cf-pod--accent">
          <span class="cf-pod__lbl">Open</span>
          <span class="cf-pod__val">${openCount}</span>
          <span class="cf-pod__sub">Active jobs</span>
        </div>
        <div class="${cls('cf-pod', { 'cf-pod--alert': overdueCount > 0, 'cf-pod--good': !overdueCount })}">
          <span class="cf-pod__lbl">Overdue</span>
          <span class="cf-pod__val">${overdueCount}</span>
          <span class="cf-pod__sub">${overdueCount ? 'Action now' : 'On schedule'}</span>
        </div>
        <div class="cf-pod cf-pod--good">
          <span class="cf-pod__lbl">Done</span>
          <span class="cf-pod__val">${doneCount}</span>
          <span class="cf-pod__sub">Ticked off</span>
        </div>
        <div class="cf-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="task-print">${icon('printer', { size: 14 })} Checklist</button>
          <button type="button" class="k-btn k-btn--primary" data-action="task-new">${icon('plus', { size: 15 })} Add Task</button>
        </div>
      </div>
    </section>

    <div class="cf-routine-grid">
      ${FORM_ROUTINES.map((r) => {
        const rTasks = allTasks.filter((t) => t.routine === r);
        const rDone = rTasks.filter((t) => t.status === 'Done').length;
        const pct = rTasks.length ? Math.round((rDone / rTasks.length) * 100) : 0;
        const active = state.taskRoutine === r;
        return html`
          <button type="button" class="${cls('cf-routine-card', { 'is-on': active })}" data-action="task-routine" data-routine="${active ? 'All' : r}">
            <div class="cf-routine-card__top">
              <span>${r}</span>
              <span class="cf-routine-card__count">${rDone}/${rTasks.length}</span>
            </div>
            <div class="tk-bar"><div class="tk-bar__fill ${pct === 100 && rTasks.length ? 'tk-bar__fill--ok' : ''}" style="width:${pct}%"></div></div>
          </button>`;
      })}
    </div>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by routine">
        ${ROUTINES.map((r) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.taskRoutine === r })}" data-action="task-routine" data-routine="${r}">${r}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Filter by status">
        ${['Open', 'Blocked', 'Done', 'All'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.taskStatus === st })}" data-action="task-filter-status" data-status="${st}">${st}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !allTasks.length ? skeleton(4) : rows.length ? rows.map((tk) => {
        const overdue = tk.status !== 'Done' && tk.due_date && tk.due_date < tday;
        const rowClass = tk.status === 'Done' ? 'cf-task-row--done' : `cf-task-row--${tk.priority.toLowerCase()}`;
        return html`
          <div class="tk-row cf-task-row ${rowClass}" data-key="tk-${tk.id}">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${tk.task_title}</span>
                <span class="tk-tag tk-tag--accent">${tk.routine}</span>
                <span class="tk-tag">${tk.area}</span>
                <span class="tk-tag ${tk.priority === 'High' ? 'tk-tag--bad' : tk.priority === 'Medium' ? 'tk-tag--warn' : ''}">${tk.priority}</span>
                <span class="tk-tag ${tk.status === 'Done' ? 'tk-tag--ok' : tk.status === 'Blocked' ? 'tk-tag--bad' : tk.status === 'Doing' ? 'tk-tag--info' : ''}">${tk.status}</span>
                ${overdue ? html`<span class="tk-tag tk-tag--bad">Overdue</span>` : ''}
                ${tk.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                ${tk.assigned_name ? html`<span>Owner: <strong>${tk.assigned_name}</strong></span>` : html`<span>Unassigned</span>`}
                ${tk.due_date ? html`<span>Due: ${fmtDayNear(tk.due_date)} (${tk.due_date})</span>` : ''}
                ${tk.notes ? html`<span>${tk.notes}</span>` : ''}
              </div>
            </div>
            <div class="tk-row__aside">
              ${tk.status === 'To do' ? html`<button type="button" class="k-btn k-btn--sm" data-action="task-set-status" data-id="${tk.id}" data-status="Doing">Start</button>` : ''}
              ${tk.status !== 'Done'
                ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="task-set-status" data-id="${tk.id}" data-status="Done">${icon('check', { size: 14 })} Done</button>`
                : html`<button type="button" class="k-btn k-btn--sm" data-action="task-set-status" data-id="${tk.id}" data-status="To do">Reopen</button>`}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="task-edit" data-id="${tk.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="task-del" data-id="${tk.id}">Del</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'check-square', title: 'No tasks matching this view', text: 'Create opening, merchandising, stocktake or closing jobs for your retail team.' })}
    </section>`;
}

export function wireTasksActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="task-routine"]', (e, el) => { state.taskRoutine = el.dataset.routine; draw(); });
  on(root, 'click', '[data-action="task-filter-status"]', (e, el) => { state.taskStatus = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="task-new"]', async () => {
    const made = await formDialog({
      title: 'New Store Floor Task',
      submitLabel: 'Add task',
      fields: taskFormFields({}, state.staff),
      onSubmit: (v) => api.post('/api/tasks', v),
    });
    if (made) { toast.success('Store task created.'); await loadScreen('/tasks'); }
  });

  on(root, 'click', '[data-action="task-edit"]', async (e, el) => {
    const tk = state.tasks.find((x) => String(x.id) === el.dataset.id);
    if (!tk) return;
    const saved = await formDialog({
      title: 'Edit Store Task',
      submitLabel: 'Save task',
      fields: taskFormFields(tk, state.staff),
      onSubmit: (v) => api.put('/api/tasks', { ...v, id: tk.id }),
    });
    if (saved) { toast.success('Store task updated.'); await loadScreen('/tasks'); }
  });

  on(root, 'click', '[data-action="task-set-status"]', async (e, el) => {
    try {
      await api.post('/api/tasks/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Task marked ${el.dataset.status}.`);
      await loadScreen('/tasks');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="task-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete task?', message: 'Remove this task from the store floor list?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/tasks', { id: Number(el.dataset.id) }); toast.success('Task deleted.'); await loadScreen('/tasks'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="task-print"]', () => {
    const open = state.tasks.filter((t) => t.status !== 'Done');
    const bodyRows = open.map((t) => `<tr>
      <td>[ &nbsp; ]</td>
      <td><strong>${esc(t.task_title)}</strong>${t.notes ? `<br><small>${esc(t.notes)}</small>` : ''}</td>
      <td>${esc(t.routine)} · ${esc(t.area)}</td>
      <td>${esc(t.priority)}</td>
      <td>${esc(t.assigned_name || 'Any staff')}</td>
      <td>${esc(t.due_date || '—')}</td>
    </tr>`).join('');
    downloadHtmlDoc(`store-tasks-${today()}.html`, {
      title: `Store Floor Shift Checklist · ${today()}`,
      businessName: state.session.settings.business_name,
      subtitle: `${open.length} open tasks for the shop floor`,
      accent: '#c84b24',
      bodyHtml: `<table>
        <thead><tr><th>Done</th><th>Task</th><th>Routine / Area</th><th>Priority</th><th>Owner</th><th>Due</th></tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="6">All tasks completed!</td></tr>'}</tbody>
      </table>`,
    });
  });
}
