// Vehicles Register — Unified Highway Masthead, Registration-Plate Vehicle Cards, Traffic-Light Compliance Strip & 1-click +1 yr Renew.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { num, money } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { trafficLightPill, serviceStatusForVehicle } from './command.js';

const VEH_STATUSES = ['All', 'Available', 'In use', 'Maintenance', 'Out of service'];
const FORM_STATUSES = ['Available', 'In use', 'Maintenance', 'Out of service'];

function statusClass(st) {
  if (st === 'Available') return 'tk-tag--ok';
  if (st === 'In use') return 'tk-tag--info';
  if (st === 'Maintenance') return 'tk-tag--warn';
  return 'tk-tag--bad';
}

function cardTone(st) {
  if (st === 'In use') return 'ff-veh-card--inuse';
  if (st === 'Maintenance') return 'ff-veh-card--maint';
  if (st === 'Out of service') return 'ff-veh-card--out';
  return '';
}

function vehicleFields(v = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Vehicle name</span>
        <input class="k-input" name="vehicle_name" value="${v.vehicle_name || ''}" placeholder="e.g. Van 2, Ute - Dave" required>
      </label>
      <label class="k-field"><span class="k-field__label">Registration plate</span>
        <input class="k-input" name="registration" value="${v.registration || ''}" placeholder="e.g. 1AB 2CD">
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Make &amp; model</span>
        <input class="k-input" name="make_model" value="${v.make_model || ''}" placeholder="e.g. Toyota HiAce">
      </label>
      <label class="k-field"><span class="k-field__label">Year</span>
        <input class="k-input" type="number" min="1980" max="2040" name="year" value="${v.year ?? 2023}">
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Odometer (km)</span>
        <input class="k-input" type="number" min="0" max="9999999" name="odometer_km" value="${v.odometer_km ?? 0}">
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${FORM_STATUSES.map((st) => html`<option value="${st}" ${st === (v.status || 'Available') ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Rego expiry</span>
        <input class="k-input" type="date" name="rego_expiry" value="${v.rego_expiry || ''}">
      </label>
      <label class="k-field"><span class="k-field__label">Insurance expiry</span>
        <input class="k-input" type="date" name="insurance_expiry" value="${v.insurance_expiry || ''}">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span>
      <input class="k-input" name="notes" value="${v.notes || ''}" placeholder="Tow pack, cold chain, depot bay…">
    </label>`;
}

export function renderVehiclesView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const tday = today();
  const allVehicles = state.vehicles || [];
  const rows = state.vehStatusFilter === 'All'
    ? allVehicles
    : allVehicles.filter((v) => v.status === state.vehStatusFilter);

  const readyCount = allVehicles.filter((v) => v.status === 'Available' || v.status === 'In use').length;
  const availPct = allVehicles.length ? Math.round((readyCount / allVehicles.length) * 100) : 100;
  const ringColor = availPct >= 85 ? '#34d399' : availPct >= 60 ? '#f59e0b' : '#f87171';
  const maintCount = allVehicles.filter((v) => v.status === 'Maintenance').length;
  const totalOdo = allVehicles.reduce((s, v) => s + Number(v.odometer_km || 0), 0);
  const dueDocs = allVehicles.filter((v) => (v.rego_days_left !== null && v.rego_days_left <= 30) || (v.insurance_days_left !== null && v.insurance_days_left <= 30)).length;

  return html`
    <section class="ff-masthead" aria-label="Vehicles Register">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          ${icon('truck', { size: 12 })} FLEET ASSETS &amp; LIVE ODOMETERS
        </div>
        <h1 class="ff-masthead__title">Vehicles Register</h1>
        <div class="ff-masthead__meta">
          <span>Odometers sync automatically from logged trips</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click +1 yr Rego &amp; Insurance renewals on every plate card</span>
        </div>
      </div>

      <div class="ff-masthead__pods ff-masthead__pods--3" style="align-items:center">
        <div class="ff-pod ff-pod--ring">
          <div class="tk-ring" style="--p:${availPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${availPct}%</span>
          </div>
          <div>
            <span class="ff-pod__lbl">Road Ready</span>
            <span class="ff-pod__val">${readyCount}/${allVehicles.length}</span>
            <span class="ff-pod__sub">Active fleet</span>
          </div>
        </div>
        <div class="${cls('ff-pod', { 'ff-pod--amber': maintCount > 0 })}">
          <span class="ff-pod__lbl">Workshop</span>
          <span class="ff-pod__val">${maintCount}</span>
          <span class="ff-pod__sub">In maintenance</span>
        </div>
        <div class="${cls('ff-pod', { 'ff-pod--alert': dueDocs > 0, 'ff-pod--good': !dueDocs })}">
          <span class="ff-pod__lbl">Docs Due</span>
          <span class="ff-pod__val">${dueDocs}</span>
          <span class="ff-pod__sub">${dueDocs ? 'Rego / ins <=30d' : 'All valid'}</span>
        </div>
        <div class="ff-pod">
          <span class="ff-pod__lbl">Fleet Odo</span>
          <span class="ff-pod__val">${num(Math.round(totalOdo / 1000))}k</span>
          <span class="ff-pod__sub">Total km</span>
        </div>
        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="veh-new">${icon('plus', { size: 15 })} Register Vehicle</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by vehicle status">
        ${VEH_STATUSES.map((st) => {
          const cnt = st === 'All' ? allVehicles.length : allVehicles.filter((v) => v.status === st).length;
          return html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.vehStatusFilter === st })}" data-action="veh-filter" data-status="${st}">
              ${st}${cnt > 0 ? ` (${cnt})` : ''}
            </button>`;
        })}
      </div>
    </div>

    ${state.loading && !allVehicles.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="ff-veh-grid">
        ${rows.map((v) => {
          const svc = serviceStatusForVehicle(v.id, state.maintenance || [], tday);
          const regoExpired = v.rego_days_left !== null && v.rego_days_left < 0;
          const insExpired = v.insurance_days_left !== null && v.insurance_days_left < 0;
          const regoSoon = v.rego_days_left !== null && v.rego_days_left <= 30;
          const insSoon = v.insurance_days_left !== null && v.insurance_days_left <= 30;
          const plateMod = (regoExpired || insExpired) ? 'rego-plate--red' : (regoSoon || insSoon) ? 'rego-plate--amber' : '';
          return html`
            <article class="ff-veh-card ${cardTone(v.status)}" data-key="veh-${v.id}">
              <div class="ff-veh-card__head">
                <div style="min-width:0;display:grid;gap:5px">
                  <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                    ${v.registration ? html`<span class="rego-plate ${plateMod}">${v.registration}</span>` : html`<span class="tk-tag">Unplated</span>`}
                    <span class="tk-tag ${statusClass(v.status)}">${v.status}</span>
                    ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <h2 class="tk-card__title" style="font-size:15.5px;line-height:1.25">${v.vehicle_name}</h2>
                  <div class="tk-card__sub" style="margin-top:0">${v.make_model || 'Fleet Vehicle'}${v.year ? ` · ${v.year}` : ''}</div>
                </div>
                <span class="ff-odo">${num(v.odometer_km)} km</span>
              </div>

              <div class="ff-veh-card__body">
                <div class="ff-veh-comp">
                  <div class="ff-veh-comp__col">
                    <span class="ff-veh-comp__lbl">Registration</span>
                    ${trafficLightPill(v.rego_expiry, v.rego_days_left)}
                    <span class="ff-cell__date">${v.rego_expiry ? fmtDay(v.rego_expiry) : '—'}</span>
                    <div class="ff-cell__acts">
                      <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} Rego">+1 yr</button>
                      <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} — Registration">Date</button>
                    </div>
                  </div>
                  <div class="ff-veh-comp__col">
                    <span class="ff-veh-comp__lbl">Insurance</span>
                    ${trafficLightPill(v.insurance_expiry, v.insurance_days_left)}
                    <span class="ff-cell__date">${v.insurance_expiry ? fmtDay(v.insurance_expiry) : '—'}</span>
                    <div class="ff-cell__acts">
                      <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} Insurance">+1 yr</button>
                      <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} — Insurance">Date</button>
                    </div>
                  </div>
                  <div class="ff-veh-comp__col">
                    <span class="ff-veh-comp__lbl">Service</span>
                    <span class="ff-tl ff-tl--${svc.tone}"><span class="ff-tl__dot"></span>${svc.label}</span>
                    <span class="ff-cell__date">${svc.date ? fmtDay(svc.date) : svc.type}</span>
                  </div>
                </div>

                <div class="tk-row__meta">
                  <span>${v.trip_count || 0} trips (${num(v.logged_km || 0)} km)</span>
                  ${v.fuel_cents > 0 ? html`<span>Fuel: <strong>${money(v.fuel_cents, { currency: cur })}</strong>${v.logged_km > 0 ? ` (${money(Math.round((v.fuel_cents / v.logged_km) * 10) / 10, { currency: cur })}/km)` : ''}</span>` : ''}
                </div>
                ${v.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${v.notes}</p>` : ''}

                <div class="tk-btn-row" style="padding-top:9px;border-top:1px solid var(--k-border)">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="veh-log-trip" data-id="${v.id}">${icon('odometer', { size: 13 })} Log Trip</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="veh-edit" data-id="${v.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="veh-del" data-id="${v.id}">Remove</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'truck', title: 'No vehicles in this status', text: 'Register your vans, utes, trucks and pool cars with rego and insurance expiry dates.' })}</section>`}`;
}

export function wireVehiclesActions(root, state, { draw, loadScreen, router }) {
  on(root, 'click', '[data-action="veh-filter"]', (e, el) => { state.vehStatusFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="veh-log-trip"]', (e, el) => {
    router.go('/trips', { logVehicle: el.dataset.id });
  });

  on(root, 'click', '[data-action="veh-new"]', async () => {
    const made = await formDialog({ title: 'Register Vehicle', submitLabel: 'Save vehicle', fields: vehicleFields(), onSubmit: (v) => api.post('/api/vehicles', v) });
    if (made) { toast.success(`${made.vehicle.vehicle_name} added to fleet.`); await loadScreen('/vehicles'); }
  });

  on(root, 'click', '[data-action="veh-edit"]', async (e, el) => {
    const v = state.vehicles.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const saved = await formDialog({ title: `Edit ${v.vehicle_name}`, submitLabel: 'Save changes', fields: vehicleFields(v), onSubmit: (vals) => api.put('/api/vehicles', { ...vals, id: v.id }) });
    if (saved) { toast.success('Vehicle updated.'); await loadScreen('/vehicles'); }
  });

  on(root, 'click', '[data-action="veh-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove vehicle?', message: 'Delete this vehicle from the fleet register?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/vehicles', { id: Number(el.dataset.id) }); toast.success('Vehicle removed.'); await loadScreen('/vehicles'); }
    catch (err) { toastError(err); }
  });
}
