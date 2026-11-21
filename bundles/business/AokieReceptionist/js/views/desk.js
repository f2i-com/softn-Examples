// Appointments & Orders Desk + Follow-Up Tasks Queue: Unified Midnight-Violet & Electric Cyan Mastheads,
// Visual Status-Banded Folio Cards, Order & Task Workflow Steppers & 1-click Completion.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const APPT_STATUSES = ['Requested', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
const ORD_STATUSES = ['New', 'Confirmed', 'Ready', 'Delivered', 'Cancelled'];
const ORD_STEPS = ['New', 'Confirmed', 'Ready', 'Delivered'];
const TASK_STATUSES = ['Open', 'In progress', 'Done', 'Cancelled'];
const TASK_STEPS = ['Open', 'In progress', 'Done'];

function renderStepper(stages, current) {
  const curIdx = Math.max(0, stages.indexOf(current));
  const isFinal = curIdx === stages.length - 1;
  return html`
    <div class="${cls('ak-stepper', { 'ak-stepper--3': stages.length === 3 })}">
      ${stages.map((st, idx) => {
        const done = idx < curIdx || (isFinal && idx === curIdx);
        const now = !isFinal && idx === curIdx;
        return html`
          <div class="${cls('ak-step', { 'is-done': done, 'is-now': now })}">
            ${done ? icon('check', { size: 11 }) : html`<span>${idx + 1}.</span>`}
            <span>${st}</span>
          </div>`;
      })}
    </div>`;
}

export function renderBookingsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const loadingAppts = state.loading && !state.appointments.length;
  const loadingOrders = state.loading && !state.orders.length;

  const confirmedAppts = state.appointments.filter((a) => a.status === 'Confirmed' || a.status === 'Completed').length;
  const apptPct = state.appointments.length ? Math.round((confirmedAppts / state.appointments.length) * 100) : 100;
  const orderValue = state.orders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + Number(o.total_cents || 0), 0);
  const openOrders = state.orders.filter((o) => o.status === 'New' || o.status === 'Confirmed' || o.status === 'Ready').length;

  return html`
    <section class="ak-masthead" aria-label="Appointments & Orders Desk">
      <div class="ak-masthead__copy">
        <div class="ak-masthead__eyebrow">
          ${icon('calendar', { size: 12 })} VOICE &amp; SMS CAPTURED REVENUE
        </div>
        <h1 class="ak-masthead__title">Bookings &amp; Orders</h1>
        <div class="ak-masthead__meta">
          <span>Appointments and pickup orders logged from voice &amp; SMS</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click status progression</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="ak-pod ak-pod--ring ak-pod--cyan" aria-label="Booking confirmation rate ${apptPct}%">
          <div class="tk-ring" style="--p:${apptPct}%;--ring-color:#22d3ee;--ring-size:48px">
            <span class="tk-ring__val">${apptPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ak-pod__lbl">Confirmed</span>
            <span class="ak-pod__val" style="font-size:16px">${confirmedAppts}/${state.appointments.length}</span>
            <span class="ak-pod__sub">Appointments</span>
          </div>
        </div>

        <div class="ak-pod ak-pod--banner-sm">
          <span class="ak-pod__lbl">${icon('receipt', { size: 12 })} Active Orders</span>
          <span class="ak-pod__val">${openOrders}</span>
          <span class="ak-pod__sub">${money(orderValue, { currency: cur })} total</span>
        </div>

        <div class="ak-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn k-btn--glass" data-action="ord-new">${icon('plus', { size: 15 })} Order</button>
          <button type="button" class="k-btn ak-btn-cyan" data-action="appt-new">${icon('calendar', { size: 15 })} New Booking</button>
        </div>
      </div>
    </section>

    <div class="ak-tabs">
      <div class="tk-segmented" role="tablist">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.bookingsTab === 'appointments' })}" data-action="bk-tab" data-tab="appointments">Appointments (${loadingAppts ? '…' : state.appointments.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.bookingsTab === 'orders' })}" data-action="bk-tab" data-tab="orders">Orders (${loadingOrders ? '…' : state.orders.length})</button>
      </div>
    </div>

    ${state.bookingsTab === 'appointments' ? html`
      ${loadingAppts ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.appointments.length ? html`
        <div class="ak-card-list">
          ${state.appointments.map((a) => {
            const tone = a.status === 'Confirmed' || a.status === 'Completed' ? 'ak-desk-card--ok' : a.status === 'Cancelled' || a.status === 'No-show' ? 'ak-desk-card--coral' : 'ak-desk-card--cyan';
            return html`
              <article class="ak-desk-card ${tone}" data-key="ap-${a.id}">
                <div class="ak-desk-card__top">
                  <div style="display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1 1 250px">
                    <span class="ak-queue-avatar ak-queue-avatar--cyan">${initials(a.caller_name || 'A')}</span>
                    <div class="ak-desk-card__head">
                      <div class="ak-desk-card__title">
                        <span>${a.caller_name}</span>
                        <span class="tk-muted" style="font-weight:500">· ${a.service}</span>
                        <span class="tk-tag ${a.status === 'Confirmed' || a.status === 'Completed' ? 'tk-tag--ok' : a.status === 'Cancelled' || a.status === 'No-show' ? 'tk-tag--bad' : 'tk-tag--warn'}">${a.status}</span>
                        <span class="tk-tag">${a.source}</span>
                        ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="ak-desk-card__meta">
                        <span class="ak-code">${fmtDay(a.appt_date)} · ${a.appt_time}</span>
                        ${a.phone ? html`<span class="ak-phone">${a.phone}</span>` : ''}
                      </div>
                      ${a.notes ? html`<div class="tk-muted" style="font-size:13px">${a.notes}</div>` : ''}
                    </div>
                  </div>
                  <div class="ak-desk-card__actions">
                    ${a.status === 'Requested' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-quick" data-id="${a.id}" data-status="Confirmed">Confirm ✓</button>` : ''}
                    <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="appt-status" data-id="${a.id}" aria-label="Appointment status">
                      ${APPT_STATUSES.map((st) => html`<option value="${st}" ${st === a.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="appt-del" data-id="${a.id}">Delete</button>
                  </div>
                </div>
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'calendar', title: 'No appointments booked', text: 'Create bookings directly from calls or click New Booking.' })}</section>`}` : html`
      ${loadingOrders ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.orders.length ? html`
        <div class="ak-card-list">
          ${state.orders.map((o) => {
            const tone = o.status === 'Ready' || o.status === 'Delivered' ? 'ak-desk-card--ok' : o.status === 'Cancelled' ? 'ak-desk-card--coral' : 'ak-desk-card--cyan';
            return html`
              <article class="ak-desk-card ${tone}" data-key="od-${o.id}">
                <div class="ak-desk-card__top">
                  <div class="ak-desk-card__head">
                    <div class="ak-desk-card__title">
                      <span>${o.customer_name}</span>
                      <strong style="font-variant-numeric:tabular-nums;color:var(--k-accent)">${money(o.total_cents, { currency: cur })}</strong>
                      <span class="tk-tag ${o.status === 'Ready' || o.status === 'Delivered' ? 'tk-tag--ok' : o.status === 'Cancelled' ? 'tk-tag--bad' : 'tk-tag--info'}">${o.status}</span>
                      <span class="tk-tag">${o.source}</span>
                      ${o.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="ak-desk-card__meta">
                      ${o.phone ? html`<span class="ak-phone">${o.phone}</span>` : ''}
                      <span>${o.notes}</span>
                    </div>
                  </div>
                  <div class="ak-desk-card__actions">
                    <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="ord-status" data-id="${o.id}" aria-label="Order status">
                      ${ORD_STATUSES.map((st) => html`<option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="ord-del" data-id="${o.id}">Delete</button>
                  </div>
                </div>
                ${o.status !== 'Cancelled' ? renderStepper(ORD_STEPS, o.status) : ''}
              </article>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'receipt', title: 'No orders yet', text: 'Capture pickup or service orders from incoming phone calls and SMS.' })}</section>`}`}`;
}

export function renderTasksView(state) {
  const loadingTasks = state.loading && !state.tasks.length;
  const openList = state.tasks.filter((t) => t.status === 'Open' || t.status === 'In progress');
  const doneList = state.tasks.filter((t) => t.status === 'Done');
  const urgentCount = openList.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length;
  const donePct = state.tasks.length ? Math.round((doneList.length / state.tasks.length) * 100) : 100;

  const rows = state.taskFilter === 'All'
    ? state.tasks
    : state.taskFilter === 'Open'
      ? openList
      : doneList;

  return html`
    <section class="ak-masthead" aria-label="Follow-Up Tasks Queue">
      <div class="ak-masthead__copy">
        <div class="${cls('ak-masthead__eyebrow', { 'ak-masthead__eyebrow--coral': urgentCount > 0 })}">
          ${icon('check-square', { size: 12 })} CALLBACKS, SMS LOOPS &amp; HANDOFFS
        </div>
        <h1 class="ak-masthead__title">Follow-Up Tasks</h1>
        <div class="ak-masthead__meta">
          <span>Urgent landline callbacks &amp; AI handoffs</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click completion across desk &amp; console</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="ak-pod ak-pod--ring ak-pod--cyan" aria-label="Task completion rate ${donePct}%">
          <div class="tk-ring" style="--p:${donePct}%;--ring-color:#22d3ee;--ring-size:48px">
            <span class="tk-ring__val">${donePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ak-pod__lbl">Resolved</span>
            <span class="ak-pod__val" style="font-size:16px">${doneList.length}/${state.tasks.length}</span>
            <span class="ak-pod__sub">Completed tasks</span>
          </div>
        </div>

        <div class="${cls('ak-pod ak-pod--banner-sm', { 'ak-pod--coral': urgentCount > 0 })}">
          <span class="ak-pod__lbl">${icon('alert', { size: 12 })} Urgent / High</span>
          <span class="ak-pod__val">${urgentCount}</span>
          <span class="ak-pod__sub">${openList.length} total open</span>
        </div>

        <button type="button" class="k-btn ak-btn-cyan" data-action="task-new">${icon('plus', { size: 15 })} Add Task</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist">
        ${[['Open', `Open (${openList.length})`], ['Done', `Done (${doneList.length})`], ['All', `All (${state.tasks.length})`]].map(([f, lbl]) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.taskFilter === f })}" data-action="task-filter" data-filter="${f}">${lbl}</button>`)}
      </div>
    </div>

    ${loadingTasks ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="ak-card-list">
        ${rows.map((t) => {
          const tone = t.status === 'Done' ? 'ak-desk-card--ok' : t.priority === 'Urgent' ? 'ak-desk-card--coral' : t.priority === 'High' ? 'ak-desk-card--warn' : 'ak-desk-card--cyan';
          return html`
            <article class="ak-desk-card ${tone}" data-key="tk-${t.id}">
              <div class="ak-desk-card__top">
                <div class="ak-desk-card__head">
                  <div class="ak-desk-card__title">
                    <span>${t.summary}</span>
                    <span class="tk-tag ${t.priority === 'Urgent' ? 'tk-tag--bad' : t.priority === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${t.priority}</span>
                    <span class="tk-tag ${t.status === 'Done' ? 'tk-tag--ok' : ''}">${t.status}</span>
                    ${t.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ak-desk-card__meta">
                    ${t.phone ? html`<span class="ak-phone">${t.phone}</span>` : ''}
                    <span>Due: <strong>${t.due_at ? fmtDay(t.due_at) : 'Today'}</strong></span>
                    <span>Assignee: <strong>${t.assignee || 'Front Desk'}</strong></span>
                    ${t.callback_state && t.callback_state !== 'None' ? html`<span class="tk-tag tk-tag--warn">Callback: ${t.callback_state}</span>` : ''}
                    ${t.sms_state && t.sms_state !== 'None' ? html`<span class="tk-tag tk-tag--accent">SMS: ${t.sms_state}</span>` : ''}
                  </div>
                  ${t.notes ? html`<div class="tk-muted" style="font-size:13px">${t.notes}</div>` : ''}
                </div>
                <div class="ak-desk-card__actions">
                  ${t.status !== 'Done' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="task-done" data-id="${t.id}">${icon('check', { size: 14 })} Complete</button>` : ''}
                  <select class="k-input" style="min-height:33px;padding:3px 8px;width:auto;font-size:12.5px" data-action="task-status" data-id="${t.id}" aria-label="Task status">
                    ${TASK_STATUSES.map((st) => html`<option value="${st}" ${st === t.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="task-del" data-id="${t.id}">Delete</button>
                </div>
              </div>
              ${t.status !== 'Cancelled' ? renderStepper(TASK_STEPS, t.status) : ''}
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'check-circle', title: 'Queue clear', text: 'No follow-up tasks matching this filter.' })}</section>`}`;
}

export function wireDeskActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="bk-tab"]', (e, el) => { state.bookingsTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="task-filter"]', (e, el) => { state.taskFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="appt-new"]', async () => {
    const made = await formDialog({
      title: 'New Appointment Booking',
      submitLabel: 'Save Booking',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="caller_name" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" placeholder="+61 4..."></label>
        </div>
        <label class="k-field"><span class="k-field__label">Service</span><input class="k-input" name="service" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="appt_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="appt_time" value="10:00"></label>
          <label class="k-field"><span class="k-field__label">Source</span><select class="k-input" name="source"><option value="Call">Call</option><option value="SMS">SMS</option><option value="Manual">Manual</option><option value="Flow">Flow</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/appointments', v),
    });
    if (made) { state.bookingsTab = 'appointments'; toast.success('Appointment saved.'); await loadScreen('/bookings'); }
  });
  on(root, 'click', '[data-action="appt-quick"]', async (e, el) => {
    try { await api.post('/api/appointments/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Booking ${el.dataset.status}.`); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });
  on(root, 'change', '[data-action="appt-status"]', async (e, el) => {
    try { await api.post('/api/appointments/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Status updated.'); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="appt-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete appointment?', message: 'Remove this booking?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/appointments', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ord-new"]', async () => {
    const made = await formDialog({
      title: 'New Front-Desk Order',
      submitLabel: 'Save Order',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="customer_name" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone"></label>
          <label class="k-field"><span class="k-field__label">Total</span><input class="k-input" type="number" step="0.01" min="0" name="total" value="0.00"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Order Details</span><textarea class="k-input" name="notes" rows="2" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/orders', { ...v, source: 'Manual' }),
    });
    if (made) { state.bookingsTab = 'orders'; toast.success('Order saved.'); await loadScreen('/bookings'); }
  });
  on(root, 'change', '[data-action="ord-status"]', async (e, el) => {
    try { await api.post('/api/orders/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Order updated.'); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="ord-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete order?', message: 'Remove this order?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/orders', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/bookings'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="task-new"]', async () => {
    const made = await formDialog({
      title: 'Add Follow-Up Task',
      submitLabel: 'Create Task',
      fields: html`
        <label class="k-field"><span class="k-field__label">Task Summary</span><input class="k-input" name="summary" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone"></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_at" value="${today()}"></label>
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority"><option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Assignee</span><input class="k-input" name="assignee" value="Front Desk"></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/tasks', v),
    });
    if (made) { toast.success('Task created.'); await loadScreen('/tasks'); }
  });
  on(root, 'click', '[data-action="task-done"]', async (e, el) => {
    try { await api.post('/api/tasks/status', { id: Number(el.dataset.id), status: 'Done' }); toast.success('Task completed!'); await loadScreen('/tasks'); }
    catch (err) { toastError(err); }
  });
  on(root, 'change', '[data-action="task-status"]', async (e, el) => {
    try { await api.post('/api/tasks/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Task status updated.'); await loadScreen('/tasks'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="task-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete task?', message: 'Remove this task?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/tasks', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/tasks'); }
    catch (err) { toastError(err); }
  });
}
