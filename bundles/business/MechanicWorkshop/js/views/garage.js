// Garage & Clients Cards, Parts Used Ledger & Accounting-Grade Workshop Invoices
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { cardFormFields, regoPlate } from './bays.js';

const CUST_TYPES = ['Private / Retail', 'Fleet', 'Business', 'Dealer / Trade', 'Insurance'];
const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPG'];
const INV_STATUSES = ['Draft', 'Sent', 'Paid', 'Overdue'];

function invTone(s) {
  if (s === 'Paid') return 'tk-tag--ok';
  if (s === 'Overdue') return 'tk-tag--bad';
  if (s === 'Sent') return 'tk-tag--info';
  return '';
}

function invCardMod(s) {
  if (s === 'Paid') return 'mw-inv-card--paid';
  if (s === 'Overdue') return 'mw-inv-card--overdue';
  return '';
}

function fuelMod(fuel) {
  const f = String(fuel || '').toLowerCase();
  if (f === 'diesel') return 'veh-card--diesel';
  if (f === 'hybrid') return 'veh-card--hybrid';
  if (f === 'electric') return 'veh-card--electric';
  return '';
}

function normSearch(text) {
  return String(text || '').toLowerCase().replaceAll('-', '').replaceAll(' ', '');
}

export function renderGarageView(state) {
  const q = (state.garageSearch || '').trim().toLowerCase();
  const qNorm = normSearch(q);
  const vehicles = state.vehicles.filter((v) => {
    if (!q) return true;
    const hay = `${v.registration} ${v.make} ${v.model} ${v.year} ${v.vin || ''} ${v.customer_name || ''} ${v.customer_phone || ''}`.toLowerCase();
    return hay.includes(q) || normSearch(v.registration).includes(qNorm);
  });
  const customers = state.customers.filter((c) => {
    if (!q) return true;
    return `${c.name} ${c.phone} ${c.email || ''} ${c.customer_type}`.toLowerCase().includes(q);
  });
  const fleetCount = state.customers.filter((c) => c.customer_type !== 'Private / Retail').length;

  return html`
    <section class="mw-masthead" aria-label="Garage Header">
      <div class="mw-masthead__copy">
        <div class="mw-masthead__eyebrow">CLIENT &amp; FLEET REGISTER</div>
        <h1 class="mw-masthead__title">Garage &amp; Clients</h1>
        <div class="mw-masthead__meta">
          <span>Plates, VINs &amp; synced odometers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click check-in</span>
        </div>
      </div>

      <div class="mw-masthead__pods" style="align-items:center">
        <div class="mw-pod mw-pod--cobalt">
          <span class="mw-pod__lbl">${icon('car', { size: 11 })} Vehicles</span>
          <span class="mw-pod__val">${state.vehicles.length}</span>
          <span class="mw-pod__sub">In register</span>
        </div>
        <div class="mw-pod mw-pod--amber">
          <span class="mw-pod__lbl">${icon('users', { size: 11 })} Accounts</span>
          <span class="mw-pod__val">${state.customers.length}</span>
          <span class="mw-pod__sub">${fleetCount} fleet/trade</span>
        </div>
        <div class="mw-masthead__cta">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="cust-new">${icon('users', { size: 15 })} Add Customer</button>
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="veh-new">${icon('plus', { size: 15 })} Register Vehicle</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Garage register tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.garageTab === 'vehicles' })}" data-action="garage-tab" data-tab="vehicles">Vehicles (${state.vehicles.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.garageTab === 'customers' })}" data-action="garage-tab" data-tab="customers">Customers (${state.customers.length})</button>
      </div>
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search rego plate, VIN, make, customer…" value="${state.garageSearch}" data-action="garage-search">
      </div>
    </div>

    ${state.loading && !state.vehicles.length && !state.customers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.garageTab === 'vehicles' ? html`
      <div class="tk-cards">
        ${vehicles.length ? vehicles.map((v) => html`
          <article class="veh-card ${fuelMod(v.fuel)}" data-key="veh-${v.id}">
            <div class="veh-card__band">
              <div class="veh-card__top">
                ${regoPlate(v.registration)}
                <span class="tk-tag tk-tag--accent">${v.fuel}</span>
              </div>
              <div>
                <h3 class="veh-card__title">${v.make || 'Vehicle'} ${v.model || ''}</h3>
                <div class="veh-card__subtitle">
                  <span>${v.year || '—'}</span>
                  <span>·</span>
                  <span class="veh-header__odo">${num(Number(v.odometer || 0))} km</span>
                  ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
              </div>
            </div>
            <div class="veh-card__body">
              <div class="tk-row__meta">
                <span>Owner: <strong>${v.customer_name || '—'}</strong></span>
                ${v.customer_phone ? html`<span class="mw-meta-ico">${icon('phone', { size: 12 })} ${v.customer_phone}</span>` : ''}
                <span class="k-badge">${v.card_count || 0} job card${Number(v.card_count) === 1 ? '' : 's'}</span>
              </div>
              ${v.vin ? html`<div><button type="button" class="vin-chip" data-action="copy-val" data-label="VIN" data-val="${v.vin}">VIN: ${v.vin} ${icon('copy', { size: 11 })}</button></div>` : ''}
            </div>
            <div class="veh-card__foot">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="veh-book-card" data-id="${v.id}">${icon('car-hoist', { size: 14 })} Check In</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="veh-edit" data-id="${v.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="veh-del" data-id="${v.id}">Delete</button>
            </div>
          </article>`) : emptyState({ iconName: 'car', title: 'No vehicles in garage', text: 'Register customer vehicles with make, model, plate, VIN and odometer.' })}
      </div>` : html`
      <div class="mw-cust-grid">
        ${customers.length ? customers.map((c) => html`
          <article class="${cls('mw-cust-card', { 'mw-cust-card--fleet': c.customer_type !== 'Private / Retail' })}" data-key="gc-${c.id}">
            <div class="mw-cust-head">
              <div class="mw-cust-av">${initials(c.name || 'C')}</div>
              <div style="min-width:0;flex:1">
                <h3 class="tk-card__title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</h3>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px">
                  <span class="tk-tag tk-tag--accent">${c.customer_type}</span>
                  ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
              </div>
            </div>
            <div class="mw-cust-stats">
              <div><div class="mw-cust-stat__k">Vehicles</div><div class="mw-cust-stat__v">${c.vehicle_count || 0}</div></div>
              <div><div class="mw-cust-stat__k">Job Cards</div><div class="mw-cust-stat__v">${c.card_count || 0}</div></div>
            </div>
            <div class="tk-row__meta">
              <button type="button" class="vin-chip" data-action="copy-val" data-label="Phone" data-val="${c.phone}">${icon('phone', { size: 11 })} ${c.phone}</button>
              ${c.email ? html`<span>${c.email}</span>` : ''}
            </div>
            ${c.notes ? html`<div style="font-size:12.5px;padding:7px 9px;border-radius:7px;background:var(--k-surface-2)">${c.notes}</div>` : ''}
            <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cust-add-veh" data-id="${c.id}">${icon('plus', { size: 13 })} Add Vehicle</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="cust-edit" data-id="${c.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cust-del" data-id="${c.id}">Delete</button>
            </div>
          </article>`) : emptyState({ iconName: 'users', title: 'No customers found', text: 'Add private motorists, fleets and business clients.' })}
      </div>`}
  `;
}

export function renderPartsLogView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = (state.partsSearch || '').trim().toLowerCase();
  const rows = state.parts.filter((p) => {
    if (!q) return true;
    return `${p.part_name} ${p.part_number || ''} ${p.supplier || ''} ${p.registration || ''} ${p.card_number || ''}`.toLowerCase().includes(q);
  });
  const totalParts = state.parts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_cost_cents), 0);
  const suppliers = new Set(state.parts.map((p) => (p.supplier || '').trim()).filter(Boolean)).size;

  return html`
    <section class="mw-masthead" aria-label="Parts Used Header">
      <div class="mw-masthead__copy">
        <div class="mw-masthead__eyebrow">PARTS &amp; CONSUMABLES LEDGER</div>
        <h1 class="mw-masthead__title">Parts Used Log</h1>
        <div class="mw-masthead__meta">
          <span>Parts fitted across bays</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Supplier ledger</span>
        </div>
      </div>

      <div class="mw-masthead__pods" style="align-items:center">
        <div class="mw-pod mw-pod--amber">
          <span class="mw-pod__lbl">${icon('dollar', { size: 11 })} Total Fitted</span>
          <span class="mw-pod__val">${money(totalParts, { currency })}</span>
          <span class="mw-pod__sub">${state.parts.length} line${state.parts.length === 1 ? '' : 's'}</span>
        </div>
        <div class="mw-pod mw-pod--cobalt">
          <span class="mw-pod__lbl">${icon('box', { size: 11 })} Suppliers</span>
          <span class="mw-pod__val">${suppliers}</span>
          <span class="mw-pod__sub">Trade accounts</span>
        </div>
        <div class="mw-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="part-add-pick">${icon('plus', { size: 16 })} Log Part Used</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 15 })}
        <input type="search" placeholder="Search part name, part #, rego or supplier…" value="${state.partsSearch || ''}" data-action="parts-search">
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.parts.length ? skeleton(3) : html`
        <div class="tk-table-wrap">
          ${rows.length ? html`
            <table class="tk-table">
              <thead><tr><th>Job Card / Vehicle</th><th>Part Name</th><th>Part #</th><th>Supplier</th><th class="tk-num">Qty</th><th class="tk-num">Unit</th><th class="tk-num">Line Total</th><th></th></tr></thead>
              <tbody>
                ${rows.map((p) => html`
                  <tr data-key="pl-${p.id}">
                    <td>
                      <div class="tk-btn-row" style="gap:5px">
                        ${regoPlate(p.registration || '—', { compact: true })}
                        <span class="vin-chip">${p.card_number || '#' + p.job_card_id}</span>
                      </div>
                    </td>
                    <td><strong>${p.part_name}</strong> ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                    <td class="tk-mono">${p.part_number || '—'}</td>
                    <td>${p.supplier || '—'}</td>
                    <td class="tk-num">${p.quantity}</td>
                    <td class="tk-num">${money(p.unit_cost_cents, { currency })}</td>
                    <td class="tk-num"><strong>${money(p.quantity * p.unit_cost_cents, { currency })}</strong></td>
                    <td class="tk-num">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="open-card" data-id="${p.job_card_id}">Card</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="part-del" data-id="${p.id}">Del</button>
                    </td>
                  </tr>`)}
              </tbody>
            </table>` : emptyState({ iconName: 'torque-wrench', title: 'No parts logged yet', text: 'Add parts used directly inside any Job Card Workbench or using the button above.' })}
        </div>`}
    </section>`;
}

export function renderWorkshopInvoicesView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const rows = state.invStatus === 'All' ? state.invoices : state.invoices.filter((i) => i.status === state.invStatus);
  const unpaid = state.invoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + Number(i.total_cents || 0), 0);
  const paid = state.invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + Number(i.total_cents || 0), 0);
  const gross = paid + unpaid;
  const collectedPct = gross > 0 ? Math.round((paid / gross) * 100) : 100;
  const overdueCount = state.invoices.filter((i) => i.status === 'Overdue').length;

  return html`
    <section class="mw-masthead" aria-label="Workshop Invoices Header">
      <div class="mw-masthead__copy">
        <div class="mw-masthead__eyebrow">WORKSHOP COUNTER BILLING</div>
        <h1 class="mw-masthead__title">Workshop Invoices</h1>
        <div class="mw-masthead__meta">
          <span>Labour + fitted parts + tax</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>SMS &amp; HTML sheets</span>
        </div>
      </div>

      <div class="mw-masthead__pods mw-masthead__pods--ring3" style="align-items:center">
        <div class="mw-pod mw-pod--ring">
          <div class="tk-ring" style="--p:${collectedPct}%;--ring-color:#22c55e;--ring-size:48px">
            <span class="tk-ring__val">${collectedPct}%</span>
          </div>
          <div>
            <span class="mw-pod__lbl">Collected</span>
            <div class="mw-pod__val" style="font-size:15px">${money(paid, { currency })}</div>
            <div class="mw-pod__sub">${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div class="mw-pod mw-pod--amber">
          <span class="mw-pod__lbl">${icon('dollar', { size: 11 })} Unpaid</span>
          <span class="mw-pod__val">${money(unpaid, { currency })}</span>
          <span class="mw-pod__sub">Counter due</span>
        </div>
        <div class="${cls('mw-pod', { 'mw-pod--alert': overdueCount > 0 })}">
          <span class="mw-pod__lbl">${icon('alert', { size: 11 })} Overdue</span>
          <span class="mw-pod__val">${overdueCount}</span>
          <span class="mw-pod__sub">${overdueCount > 0 ? 'Follow up' : 'All current'}</span>
        </div>
        <div class="mw-pod mw-pod--cobalt">
          <span class="mw-pod__lbl">${icon('receipt', { size: 11 })} Gross</span>
          <span class="mw-pod__val">${money(gross, { currency })}</span>
          <span class="mw-pod__sub">Total billed</span>
        </div>
        <div class="mw-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="inv-pick-card">${icon('receipt', { size: 16 })} Generate from Job Card</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter invoices by status">
        ${['All', ...INV_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.invStatus === st })}" data-action="inv-filter" data-status="${st}">
            ${st} (${st === 'All' ? state.invoices.length : state.invoices.filter((x) => x.status === st).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.invoices.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="mw-inv-list">
        ${rows.map((inv) => html`
          <article class="mw-inv-card ${invCardMod(inv.status)}" data-key="winv-${inv.id}">
            <div class="mw-inv-card__top">
              <div class="tk-stack" style="gap:5px">
                <div class="tk-row__title">
                  <span class="vin-chip">${inv.invoice_number}</span>
                  ${regoPlate(inv.registration || '—', { compact: true })}
                  <strong>${inv.customer_name || 'Customer'}</strong>
                  <span class="tk-tag ${invTone(inv.status)}">${inv.status}</span>
                  ${inv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta">
                  <span>${inv.make || ''} ${inv.model || ''} ${inv.year || ''}</span>
                  ${inv.card_number ? html`<span class="vin-chip">${inv.card_number}</span>` : ''}
                  <span>Issued ${fmtDay(inv.issue_date)}</span>
                </div>
              </div>
              <div class="tk-btn-row">
                <button type="button" class="sms-chip" data-action="copy-inv-ready-sms" data-id="${inv.id}">${icon('chat', { size: 13 })} Ready SMS</button>
                <button type="button" class="k-btn k-btn--sm" data-action="print-workshop-invoice" data-id="${inv.id}">${icon('printer', { size: 14 })} Invoice Sheet</button>
              </div>
            </div>

            <div class="mw-inv-card__body">
              <div class="mw-inv-grid">
                <div class="mw-inv-cell">
                  <span class="mw-inv-cell__k">Labour</span>
                  <span class="mw-inv-cell__v">${money(inv.labour_cents, { currency })}</span>
                </div>
                <div class="mw-inv-cell">
                  <span class="mw-inv-cell__k">Parts</span>
                  <span class="mw-inv-cell__v">${money(inv.parts_cents, { currency })}</span>
                </div>
                <div class="mw-inv-cell">
                  <span class="mw-inv-cell__k">Tax (${inv.tax_rate}%)</span>
                  <span class="mw-inv-cell__v">${money(inv.tax_cents, { currency })}</span>
                </div>
                <div class="mw-inv-cell mw-inv-cell--total">
                  <span class="mw-inv-cell__k">${inv.status === 'Paid' ? 'Paid' : 'Total Due'}</span>
                  <span class="mw-inv-cell__v">${money(inv.total_cents, { currency })}</span>
                </div>
              </div>
            </div>

            <div class="mw-inv-card__foot">
              <span class="tk-muted" style="font-size:13px">${inv.notes || inv.complaint || 'Workshop mechanical invoice'}</span>
              <div class="tk-btn-row">
                ${inv.status !== 'Paid' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inv-status" data-id="${inv.id}" data-status="Paid">${icon('check', { size: 14 })} Mark Paid</button>` : ''}
                ${inv.status === 'Sent' ? html`<button type="button" class="k-btn k-btn--sm" data-action="inv-status" data-id="${inv.id}" data-status="Overdue">Overdue</button>` : ''}
              </div>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'receipt', title: 'No invoices yet', text: 'Generate an invoice straight from any Job Card Workbench.' })}</section>`}`;
}

export function wireGarageActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="garage-tab"]', (e, el) => { state.garageTab = el.dataset.tab; draw(); });
  on(root, 'input', '[data-action="garage-search"]', (e, el) => { state.garageSearch = el.value; draw(); });
  on(root, 'input', '[data-action="parts-search"]', (e, el) => { state.partsSearch = el.value; draw(); });
  on(root, 'click', '[data-action="inv-filter"]', (e, el) => { state.invStatus = el.dataset.status; draw(); });

  const custFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Account Type</span>
        <select class="k-input" name="customer_type">${CUST_TYPES.map((t) => html`<option value="${t}" ${t === c.customer_type ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Address</span><input class="k-input" name="address" value="${c.address || ''}"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  const vehFields = (customers, v = {}, defaultCustId = '') => {
    const chosen = v.customer_id || defaultCustId || (customers[0] ? customers[0].id : '');
    return html`
      <label class="k-field"><span class="k-field__label">Customer / Owner</span>
        <select class="k-input" name="customer_id" required>
          ${customers.map((c) => html`<option value="${c.id}" ${String(c.id) === String(chosen) ? 'selected' : ''}>${c.name} (${c.customer_type})</option>`)}
        </select>
      </label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Registration / Plate</span><input class="k-input" name="registration" value="${v.registration || ''}" placeholder="e.g. ABC-123" required></label>
        <label class="k-field"><span class="k-field__label">Year</span><input class="k-input" type="number" min="1950" max="2028" name="year" value="${v.year || 2022}" required></label>
        <label class="k-field"><span class="k-field__label">Fuel Type</span>
          <select class="k-input" name="fuel">${FUEL_TYPES.map((f) => html`<option value="${f}" ${f === (v.fuel || 'Petrol') ? 'selected' : ''}>${f}</option>`)}</select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Make</span><input class="k-input" name="make" value="${v.make || ''}" placeholder="e.g. Toyota" required></label>
        <label class="k-field"><span class="k-field__label">Model</span><input class="k-input" name="model" value="${v.model || ''}" placeholder="e.g. HiLux SR5" required></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Odometer (km)</span><input class="k-input" type="number" min="0" name="odometer" value="${v.odometer ?? 0}"></label>
        <label class="k-field"><span class="k-field__label">VIN <span class="k-field__optional">optional</span></span><input class="k-input" name="vin" value="${v.vin || ''}" placeholder="17-char VIN"></label>
      </div>`;
  };

  on(root, 'click', '[data-action="cust-new"]', async () => {
    const made = await formDialog({ title: 'Add Workshop Customer', submitLabel: 'Save Customer', fields: custFields(), onSubmit: (v) => api.post('/api/customers', v) });
    if (made) { toast.success('Customer saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="cust-edit"]', async (e, el) => {
    const c = state.customers.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save', fields: custFields(c), onSubmit: (v) => api.put('/api/customers', { ...v, id: c.id }) });
    if (saved) { toast.success('Customer updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="cust-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete customer?', message: 'Delete this customer? Remove linked vehicles first.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/customers', { id: Number(el.dataset.id) }); toast.success('Customer deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  async function openNewVehicle(defaultCustId = '') {
    if (!state.customers.length) {
      const r = await api.get('/api/customers');
      state.customers = r.customers || [];
    }
    if (!state.customers.length) { toast.error('Add a customer first.'); return; }
    const made = await formDialog({
      title: 'Register Customer Vehicle',
      submitLabel: 'Save Vehicle',
      size: 'lg',
      fields: vehFields(state.customers, {}, defaultCustId),
      onSubmit: (v) => api.post('/api/vehicles', v),
    });
    if (made) { toast.success(`Vehicle ${made.vehicle.registration} registered.`); await loadScreen(); }
  }

  on(root, 'click', '[data-action="veh-new"]', () => openNewVehicle());
  on(root, 'click', '[data-action="cust-add-veh"]', (e, el) => openNewVehicle(el.dataset.id));

  on(root, 'click', '[data-action="veh-edit"]', async (e, el) => {
    const v = state.vehicles.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const saved = await formDialog({ title: `Edit ${v.registration}`, submitLabel: 'Save', size: 'lg', fields: vehFields(state.customers, v), onSubmit: (vals) => api.put('/api/vehicles', { ...vals, id: v.id }) });
    if (saved) { toast.success('Vehicle updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="veh-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete vehicle?', message: 'Delete this vehicle record? Vehicles with job cards cannot be deleted.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/vehicles', { id: Number(el.dataset.id) }); toast.success('Vehicle deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="veh-book-card"]', async (e, el) => {
    const made = await formDialog({
      title: 'Book Vehicle Into Workshop',
      submitLabel: 'Open Job Card',
      size: 'lg',
      fields: cardFormFields(state.vehicles, el.dataset.id),
      onSubmit: (vals) => api.post('/api/cards', vals),
    });
    if (made) { toast.success(`Job card ${made.card.card_number} opened.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="part-add-pick"]', async () => {
    if (!state.cards.length) {
      const r = await api.get('/api/cards');
      state.cards = r.cards || [];
    }
    if (!state.cards.length) { toast.error('Open a job card first.'); return; }
    const made = await formDialog({
      title: 'Log Part Used',
      submitLabel: 'Save Part',
      fields: html`
        <label class="k-field"><span class="k-field__label">Job Card</span>
          <select class="k-input" name="job_card_id">${state.cards.map((c) => html`<option value="${c.id}">${c.card_number} — ${c.registration} (${c.make} ${c.model})</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Part Name</span><input class="k-input" name="part_name" required></label>
          <label class="k-field"><span class="k-field__label">Part #</span><input class="k-input" name="part_number"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Qty</span><input class="k-input" type="number" min="1" name="quantity" value="1" required></label>
          <label class="k-field"><span class="k-field__label">Unit Cost</span><input class="k-input" type="number" step="0.01" min="0" name="unit_cost" value="0.00" required></label>
          <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier"></label>
        </div>`,
      onSubmit: (v) => api.post('/api/parts', v),
    });
    if (made) { toast.success('Part logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="inv-pick-card"]', async () => {
    if (!state.cards.length) {
      const r = await api.get('/api/cards');
      state.cards = r.cards || [];
    }
    if (!state.cards.length) { toast.error('No job cards available.'); return; }
    const s = state.session.settings;
    const rate = (Number(s.workshop_rate_cents || 13500) / 100).toFixed(2);
    const made = await formDialog({
      title: 'Generate Workshop Invoice from Job Card',
      submitLabel: 'Generate Invoice',
      fields: html`
        <label class="k-field"><span class="k-field__label">Job Card</span>
          <select class="k-input" name="job_card_id">${state.cards.map((c) => html`<option value="${c.id}">${c.card_number} — ${c.registration} (${c.customer_name} · ${c.labour_hours}h)</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Workshop Rate / hr</span><input class="k-input" type="number" step="0.01" min="0" name="labour_rate" value="${rate}" required></label>
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Next service interval, warranty terms…"></label>`,
      onSubmit: (v) => api.post('/api/invoices/from-card', v),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} created.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="inv-status"]', async (e, el) => {
    try { await api.post('/api/invoices/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Invoice marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-inv-ready-sms"]', (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    const veh = `${inv.year || ''} ${inv.make || ''} ${inv.model || ''} (${inv.registration || 'vehicle'})`.trim();
    const contact = s.phone ? ` Call ${s.phone} with any questions.` : '';
    const phoneNote = inv.customer_phone ? `\n[To: ${inv.customer_phone}]` : '';
    const msg = `Hi ${inv.customer_name || 'there'}, your ${veh} is ready for pickup at ${s.business_name}! Invoice ${inv.invoice_number} total: ${money(inv.total_cents, { currency: cur })} (Labour ${money(inv.labour_cents, { currency: cur })} + Parts ${money(inv.parts_cents, { currency: cur })} + Tax ${money(inv.tax_cents, { currency: cur })}).${contact}${phoneNote}`;
    copyText(msg, { title: `Customer Ready SMS · ${inv.registration || inv.invoice_number}`, done: `Customer Ready SMS copied for ${inv.registration || inv.invoice_number}.` });
  });

  on(root, 'click', '[data-action="print-workshop-invoice"]', async (e, el) => {
    try {
      const { invoice: inv, parts = [] } = await api.get('/api/invoices/detail', { id: Number(el.dataset.id) });
      const s = state.session.settings;
      const cur = s.currency || 'AUD';
      const partsHtml = parts.map((p) => `<tr><td>${esc(p.part_name)}${p.part_number ? ' (' + esc(p.part_number) + ')' : ''}</td><td class="num">${p.quantity}</td><td class="num">${money(p.unit_cost_cents, { currency: cur })}</td><td class="num">${money(p.quantity * p.unit_cost_cents, { currency: cur })}</td></tr>`).join('');
      downloadHtmlDoc(`workshop-invoice-${inv.invoice_number}.html`, {
        title: `WORKSHOP TAX INVOICE · ${inv.invoice_number}`,
        businessName: s.business_name,
        subtitle: [s.address, s.phone, s.email, s.tax_id ? `Tax ID: ${s.tax_id}` : ''].filter(Boolean).join(' · '),
        accent: '#e04f16',
        bodyHtml: `
          <div class="box">
            <strong>Customer:</strong> ${esc(inv.customer_name || '')} (${esc(inv.customer_phone || '')})<br>
            ${inv.customer_address ? esc(inv.customer_address) + '<br>' : ''}
            <strong>Vehicle:</strong> ${esc(inv.year || '')} ${esc(inv.make || '')} ${esc(inv.model || '')} · <strong>Rego:</strong> ${esc(inv.registration || '')} · <strong>VIN:</strong> ${esc(inv.vin || '—')} · <strong>Odometer:</strong> ${num(inv.odometer_in || 0)} km<br>
            <strong>Job Card:</strong> ${esc(inv.card_number || '')} · <strong>Technician:</strong> ${esc(inv.technician || 'Workshop')} · <strong>Date:</strong> ${esc(fmtDay(inv.issue_date))} · <strong>Status:</strong> ${esc(inv.status)}
          </div>
          <div class="box"><strong>Work Requested:</strong> ${esc(inv.complaint || '')}${inv.diagnosis ? `<br><strong>Work Performed:</strong> ${esc(inv.diagnosis)}` : ''}</div>
          <table>
            <thead><tr><th>Item / Description</th><th class="num">Qty / Hrs</th><th class="num">Rate</th><th class="num">Line Total</th></tr></thead>
            <tbody>
              <tr><td><strong>Workshop Labour</strong></td><td class="num">${num(inv.labour_hours, { decimals: 2 })} h</td><td class="num">${money(inv.labour_rate_cents, { currency: cur })}/h</td><td class="num">${money(inv.labour_cents, { currency: cur })}</td></tr>
              ${partsHtml}
              <tr><td colspan="3"><strong>Subtotal</strong></td><td class="num">${money(inv.subtotal_cents, { currency: cur })}</td></tr>
              <tr><td colspan="3">Tax (${inv.tax_rate}%)</td><td class="num">${money(inv.tax_cents, { currency: cur })}</td></tr>
              <tr class="total-row"><td colspan="3">TOTAL (${esc(cur)})</td><td class="num">${money(inv.total_cents, { currency: cur })}</td></tr>
            </tbody>
          </table>
          ${inv.notes ? `<div class="box"><strong>Workshop Notes:</strong> ${esc(inv.notes)}</div>` : ''}`,
      });
    } catch (err) { toastError(err); }
  });
}
