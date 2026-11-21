// Device Intake & Hardware Registry — Unified ESD Graphite Masthead, Type Filter Pills,
// Visual Hardware Cards with Copyable Monospace IMEI/Serial Badges & Direct Job Creation.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const DEVICE_TYPES = ['Phone', 'Laptop', 'Tablet', 'Console', 'Desktop', 'Other'];
const ISSUE_TYPES = ['Screen', 'Battery', 'Charging', 'Water damage', 'Software', 'Data recovery', 'Other'];

function deviceThemeClass(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('laptop') || t.includes('desktop')) return 'rb-device-card--laptop';
  if (t.includes('tablet')) return 'rb-device-card--tablet';
  if (t.includes('console')) return 'rb-device-card--console';
  return '';
}

function deviceFields(state, d = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer</span>
        <select class="k-input" name="customer_id" required>
          <option value="">Select owner…</option>
          ${state.customers.map((c) => html`<option value="${c.id}" ${Number(d.customer_id) === c.id ? 'selected' : ''}>${c.name} (${c.phone})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Device Type</span>
        <select class="k-input" name="device_type">${DEVICE_TYPES.map((dt) => html`<option value="${dt}" ${dt === (d.device_type || 'Phone') ? 'selected' : ''}>${dt}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Brand</span><input class="k-input" name="brand" value="${d.brand || ''}" placeholder="Apple, Samsung, Sony, Dell" required></label>
      <label class="k-field"><span class="k-field__label">Model</span><input class="k-input" name="model" value="${d.model || ''}" placeholder="iPhone 15 Pro, PlayStation 5" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Serial / IMEI</span>
      <input class="k-input tk-mono" name="serial" value="${d.serial || ''}" placeholder="Serial number or IMEI">
    </label>
    <label class="k-field"><span class="k-field__label">Intake Condition Notes</span>
      <textarea class="k-input" name="condition_notes" rows="2" placeholder="Scratches, dents, cracked glass, liquid indicators, prior repairs…">${d.condition_notes || ''}</textarea>
    </label>`;
}

export function renderDevicesView(state) {
  const q = state.deviceSearch.trim().toLowerCase();
  const typeCounts = new Map();
  for (const d of state.devices) typeCounts.set(d.device_type, (typeCounts.get(d.device_type) || 0) + 1);

  const rows = state.devices.filter((d) => {
    if (state.deviceTypeFilter && state.deviceTypeFilter !== 'All' && d.device_type !== state.deviceTypeFilter) return false;
    if (q) {
      const hay = `${d.brand} ${d.model} ${d.serial || ''} ${d.customer_name || ''} ${d.device_type || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const withSerial = state.devices.filter((d) => (d.serial || '').trim()).length;
  const serialPct = state.devices.length ? Math.round((withSerial / state.devices.length) * 100) : 100;
  const totalRepairs = state.devices.reduce((s, d) => s + Number(d.repair_count || 0), 0);

  return html`
    <section class="rb-masthead" aria-label="Device Hardware Registry">
      <div class="rb-masthead__copy">
        <div class="rb-masthead__eyebrow">
          ${icon('smartphone', { size: 12 })} HARDWARE REGISTRY &amp; IMEI TRACEABILITY
        </div>
        <h1 class="rb-masthead__title">Device Intake</h1>
        <div class="rb-masthead__meta">
          <span>IMEI &amp; serial lookup</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click ticket intake</span>
        </div>
      </div>

      <div class="rb-masthead__pods" style="align-items:center">
        <div class="rb-pod rb-pod--ring rb-pod--cyan" aria-label="Serial coverage ${serialPct}%">
          <div class="tk-ring" style="--p:${serialPct}%;--ring-color:#22d3ee;--ring-size:48px">
            <span class="tk-ring__val">${serialPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="rb-pod__lbl">IMEI / Serial</span>
            <span class="rb-pod__val" style="font-size:16.5px">${withSerial}/${state.devices.length}</span>
            <span class="rb-pod__sub">Traceable assets</span>
          </div>
        </div>
        <div class="rb-pod rb-pod--amber rb-pod--wide-sm">
          <span class="rb-pod__lbl">${icon('wrench', { size: 12 })} Repairs</span>
          <span class="rb-pod__val">${totalRepairs}</span>
          <span class="rb-pod__sub">Logged jobs</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="device-new">${icon('plus', { size: 15 })} Register Device</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}
        <input type="search" data-action="device-search" value="${state.deviceSearch}" placeholder="Search serial / IMEI, brand, model or customer…">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter by device type">
        <button type="button" class="${cls('tk-pill', { 'is-on': (state.deviceTypeFilter || 'All') === 'All' })}" data-action="device-type-filter" data-type="All">All (${state.devices.length})</button>
        ${DEVICE_TYPES.filter((dt) => typeCounts.get(dt)).map((dt) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.deviceTypeFilter === dt })}" data-action="device-type-filter" data-type="${dt}">${dt} (${typeCounts.get(dt)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.devices.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="rb-device-grid">
        ${rows.map((d) => html`
          <article class="tk-card rb-device-card ${deviceThemeClass(d.device_type)}" data-key="dv-${d.id}">
            <div class="rb-device-card__head">
              <div style="min-width:0">
                <div class="tk-card__title">${d.brand} ${d.model}</div>
                <div class="tk-card__sub">${d.device_type} · Owner: <strong>${d.customer_name}</strong></div>
              </div>
              <span class="tk-tag tk-tag--accent">${d.repair_count || 0} job${Number(d.repair_count) === 1 ? '' : 's'}</span>
            </div>
            <div class="rb-device-card__body">
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                ${d.serial ? html`
                  <button type="button" class="rb-serial-chip" data-action="copy-serial" data-val="${d.serial}" title="Copy Serial / IMEI">
                    <span class="rb-serial-chip__lbl">IMEI/SN</span>
                    <span class="rb-serial-chip__val">${d.serial}</span>
                    ${icon('copy', { size: 11 })}
                  </button>` : html`<span class="tk-muted" style="font-size:12px">No serial recorded</span>`}
                ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              ${d.customer_phone ? html`<div class="tk-muted" style="font-size:12.5px;display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} ${d.customer_phone}</div>` : ''}
              ${d.condition_notes ? html`<div class="rb-cond-tag">${icon('shield', { size: 12 })} <span>${d.condition_notes}</span></div>` : ''}
              <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="device-open-job" data-id="${d.id}">${icon('plus', { size: 13 })} Open Job</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="device-edit" data-id="${d.id}">Edit</button>
              </div>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'smartphone', title: 'No devices match', text: 'Register a phone, laptop, tablet, console or desktop to trace its repair history.' })}</section>`}`;
}

export function wireDevicesActions(root, state, { draw, loadScreen, router }) {
  on(root, 'input', '[data-action="device-search"]', (e, el) => { state.deviceSearch = el.value; draw(); });
  on(root, 'click', '[data-action="device-type-filter"]', (e, el) => { state.deviceTypeFilter = el.dataset.type; draw(); });
  on(root, 'click', '[data-action="copy-serial"]', (e, el) => {
    copyText(el.dataset.val || '', { title: 'Serial / IMEI', done: 'Serial / IMEI copied.' });
  });

  on(root, 'click', '[data-action="device-new"]', async () => {
    if (!state.customers.length) { toast.error('Add a customer under Customers & Techs first.'); return; }
    const made = await formDialog({
      title: 'Register Customer Device',
      submitLabel: 'Register device',
      size: 'lg',
      fields: deviceFields(state),
      onSubmit: (vals) => api.post('/api/devices', vals),
    });
    if (made) { toast.success('Device registered.'); await loadScreen('/devices'); }
  });

  on(root, 'click', '[data-action="device-edit"]', async (e, el) => {
    const d = state.devices.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const saved = await formDialog({
      title: `Edit ${d.brand} ${d.model}`,
      submitLabel: 'Save device',
      size: 'lg',
      fields: deviceFields(state, d),
      onSubmit: (vals) => api.put('/api/devices', { ...vals, id: d.id }),
    });
    if (saved) { toast.success('Device updated.'); await loadScreen('/devices'); }
  });

  on(root, 'click', '[data-action="device-open-job"]', async (e, el) => {
    const d = state.devices.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const activeTechs = state.technicians.filter((t) => t.active === 'Active');
    if (!activeTechs.length) { toast.error('Add an active technician first.'); return; }
    const made = await formDialog({
      title: `Open Repair Job · ${d.brand} ${d.model}`,
      submitLabel: 'Create Ticket',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Issue Type</span>
            <select class="k-input" name="issue_type">${ISSUE_TYPES.map((i) => html`<option value="${i}">${i}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Priority</span>
            <select class="k-input" name="priority"><option value="Standard">Standard</option><option value="Express">Express</option></select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Technician</span>
            <select class="k-input" name="technician_id">${activeTechs.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Quote Amount</span><input class="k-input" type="number" step="0.50" min="0" name="quote_amount" placeholder="180.00"></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 2)}"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Bench Notes</span><textarea class="k-input" name="notes" rows="2"></textarea></label>`,
      onSubmit: (vals) => api.post('/api/jobs', { ...vals, device_id: d.id, customer_id: d.customer_id }),
    });
    if (made) {
      toast.success(`Repair ticket ${made.job.ticket_code} opened!`);
      router.go('/');
    }
  });
}
