// Trip & Fuel Logbook — Unified Highway Masthead with FBT Ring, Business/Personal Split Bar, Trip Log Folios & Printable FBT Report.
import { html, esc, on, cls, qs } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadCsv, downloadHtmlDoc } from '../../kit/export.js';

const PURPOSES = ['All', 'Delivery', 'Site visit', 'Client transport', 'Maintenance run', 'Other'];
const FORM_PURPOSES = ['Delivery', 'Site visit', 'Client transport', 'Maintenance run', 'Other'];
const USAGE_FILTERS = ['All', 'Business', 'Personal'];

function filteredTrips(state) {
  return (state.trips || []).filter((tr) => {
    if (state.tripUsageFilter !== 'All' && tr.usage_class !== state.tripUsageFilter) return false;
    if (state.tripPurposeFilter !== 'All' && tr.purpose !== state.tripPurposeFilter) return false;
    if (state.tripVehicleFilter !== 'All' && String(tr.vehicle_id) !== String(state.tripVehicleFilter)) return false;
    return true;
  });
}

export async function openLogTripDialog(state, { loadScreen }, preselectVehicleId = null, reloadRoute = '/trips') {
  if (!state.vehicles.length || !state.drivers.length) {
    toast.error('Register at least one vehicle and one driver before logging a trip.');
    return;
  }
  const initVeh = (preselectVehicleId ? state.vehicles.find((v) => v.id === preselectVehicleId) : null) || state.vehicles[0];
  const initOdo = Number(initVeh?.odometer_km || 0);

  const made = await formDialog({
    title: 'Log Fleet Trip & Fuel',
    submitLabel: 'Save Trip & Sync Odometer',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Vehicle</span>
          <select class="k-input" name="vehicle_id" required>
            ${state.vehicles.map((v) => html`<option value="${v.id}" data-odo="${v.odometer_km}" ${v.id === initVeh.id ? 'selected' : ''}>${v.registration ? `[${v.registration}] ` : ''}${v.vehicle_name} (${num(v.odometer_km)} km)</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Driver</span>
          <select class="k-input" name="driver_id" required>
            ${state.drivers.filter((d) => d.active === 'Active').map((d) => html`<option value="${d.id}">${d.driver_name} (${d.licence_class})</option>`)}
          </select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Trip date</span>
          <input class="k-input" type="date" name="trip_date" value="${today()}" required>
        </label>
        <label class="k-field"><span class="k-field__label">FBT Classification</span>
          <select class="k-input" name="usage_class">
            <option value="Business" selected>Business (FBT deductible)</option>
            <option value="Personal">Personal / Private</option>
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Purpose</span>
          <select class="k-input" name="purpose">${FORM_PURPOSES.map((p) => html`<option value="${p}">${p}</option>`)}</select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Start odometer (km)</span>
          <input class="k-input" type="number" min="0" name="start_odometer" value="${initOdo}" required>
        </label>
        <label class="k-field"><span class="k-field__label">End odometer (km)</span>
          <input class="k-input" type="number" min="0" name="end_odometer" value="${initOdo + 45}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Fuel cost</span>
          <input class="k-input" type="number" step="0.01" min="0" name="fuel_cost" value="0.00">
        </label>
      </div>
      <div class="tk-sample-bar" style="margin-bottom:0" data-trip-live-preview>
        <span>Calculated distance: <strong>45 km</strong> · Fuel efficiency: <strong>$0.00 / km</strong></span>
      </div>
      <label class="k-field"><span class="k-field__label">Destination / Route</span>
        <input class="k-input" name="destination" placeholder="e.g. Parramatta Depot & North Ryde">
      </label>
      <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span>
        <input class="k-input" name="notes" placeholder="Litres filled, tolls, delivery manifest…">
      </label>`,
    onOpen: ({ form }) => {
      const vehSel = qs('select[name="vehicle_id"]', form);
      const startIn = qs('input[name="start_odometer"]', form);
      const endIn = qs('input[name="end_odometer"]', form);
      const fuelIn = qs('input[name="fuel_cost"]', form);
      const preview = qs('[data-trip-live-preview]', form);

      const updateCalc = () => {
        const dist = Math.max(0, Number(endIn.value || 0) - Number(startIn.value || 0));
        const fuel = Math.max(0, Number(fuelIn.value || 0));
        const perKm = dist > 0 ? (fuel / dist).toFixed(2) : '0.00';
        if (preview) preview.textContent = `Calculated distance: ${num(dist)} km · Fuel cost: $${perKm} / km`;
      };
      vehSel.addEventListener('change', () => {
        const v = state.vehicles.find((x) => String(x.id) === String(vehSel.value));
        if (v) {
          startIn.value = String(v.odometer_km || 0);
          endIn.value = String(Number(v.odometer_km || 0) + 40);
          updateCalc();
        }
      });
      startIn.addEventListener('input', updateCalc);
      endIn.addEventListener('input', updateCalc);
      fuelIn.addEventListener('input', updateCalc);
      updateCalc();
    },
    onSubmit: (v) => api.post('/api/trips', v),
  });

  if (made) {
    toast.success(`Trip logged (${num(made.trip.distance_km)} km)${made.vehicleOdometerUpdated ? ` — vehicle odometer updated to ${num(made.newVehicleOdometer)} km` : ''}.`);
    await loadScreen(reloadRoute);
  }
}

export function renderTripsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const allTrips = state.trips || [];
  const rows = filteredTrips(state);

  const totalKm = rows.reduce((s, r) => s + Number(r.distance_km || 0), 0);
  const bizKm = rows.filter((r) => r.usage_class === 'Business').reduce((s, r) => s + Number(r.distance_km || 0), 0);
  const persKm = Math.max(0, totalKm - bizKm);
  const bizPct = totalKm > 0 ? Math.round((bizKm / totalKm) * 1000) / 10 : 0;
  const bizPctInt = Math.round(bizPct);
  const persPct = totalKm > 0 ? Math.round((100 - bizPct) * 10) / 10 : 0;

  const fuelCents = rows.reduce((s, r) => s + Number(r.fuel_cost_cents || 0), 0);
  const perKmCents = totalKm > 0 ? Math.round((fuelCents / totalKm) * 10) / 10 : 0;
  const deductibleFuelCents = Math.round(fuelCents * (bizPct / 100));
  const viewMode = state.tripViewMode || 'folios';

  return html`
    <section class="ff-masthead" aria-label="Trip & Fuel FBT Logbook">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          ${icon('odometer', { size: 12 })} FBT TAX &amp; FUEL TELEMETRY LOGBOOK
        </div>
        <h1 class="ff-masthead__title">Trip &amp; Fuel Logbook</h1>
        <div class="ff-masthead__meta">
          <span><strong style="color:#fde68a">${num(totalKm)} km</strong> across ${rows.length} trip${rows.length === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Auto-odometer sync &amp; printable FBT summary</span>
        </div>
      </div>

      <div class="ff-masthead__pods ff-masthead__pods--3" style="align-items:center">
        <div class="ff-pod ff-pod--ring">
          <div class="tk-ring" style="--p:${bizPctInt}%;--ring-color:#38bdf8;--ring-size:48px">
            <span class="tk-ring__val">${bizPctInt}%</span>
          </div>
          <div>
            <span class="ff-pod__lbl">Business FBT</span>
            <span class="ff-pod__val">${num(bizKm)} km</span>
            <span class="ff-pod__sub">${num(persKm)} km personal</span>
          </div>
        </div>
        <div class="ff-pod">
          <span class="ff-pod__lbl">${icon('fuel-pump', { size: 12 })} Fuel $/km</span>
          <span class="ff-pod__val">${money(perKmCents, { currency: cur })}</span>
          <span class="ff-pod__sub">${money(perKmCents * 100, { currency: cur })}/100km</span>
        </div>
        <div class="ff-pod ff-pod--amber">
          <span class="ff-pod__lbl">Fuel Spend</span>
          <span class="ff-pod__val">${money(fuelCents, { currency: cur })}</span>
          <span class="ff-pod__sub">Total logged</span>
        </div>
        <div class="ff-pod ff-pod--good">
          <span class="ff-pod__lbl">Deductible</span>
          <span class="ff-pod__val">${money(deductibleFuelCents, { currency: cur })}</span>
          <span class="ff-pod__sub">Pro-rata FBT</span>
        </div>
        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="trip-export-csv">${icon('download', { size: 14 })} CSV</button>
          <button type="button" class="k-btn k-btn--glass" data-action="trip-print">${icon('printer', { size: 14 })} FBT PDF</button>
          <button type="button" class="k-btn k-btn--primary" data-action="trip-new">${icon('plus', { size: 15 })} Log Trip</button>
        </div>
      </div>
    </section>

    <div class="ff-fbt-card">
      <div class="ff-fbt-head">
        <div class="ff-fbt-title">
          ${icon('chart', { size: 17 })}
          <span>FBT Business vs Personal Split</span>
          <span class="tk-tag tk-tag--accent">${rows.length} trip${rows.length === 1 ? '' : 's'} · ${num(totalKm)} km</span>
        </div>
        <div class="ff-fbt-readout">
          <div class="ff-fbt-big">
            <span class="ff-fbt-big__pct ff-fbt-big__pct--biz">${num(bizPct, { decimals: 1 })}%</span>
            <span class="ff-fbt-big__lbl">Business</span>
          </div>
          <div class="ff-fbt-big">
            <span class="ff-fbt-big__pct ff-fbt-big__pct--pers">${num(persPct, { decimals: 1 })}%</span>
            <span class="ff-fbt-big__lbl">Personal</span>
          </div>
        </div>
      </div>
      <div class="ff-fbt-bar" role="img" aria-label="FBT split: ${bizPct}% business, ${persPct}% personal">
        ${bizPct > 0 ? html`<div class="ff-fbt-bar__biz ${persPct <= 0 ? 'ff-fbt-bar__biz--full' : ''}" style="width:${bizPct}%"></div>` : ''}
        ${persPct > 0 ? html`<div class="ff-fbt-bar__pers ${bizPct <= 0 ? 'ff-fbt-bar__pers--full' : ''}" style="width:${persPct}%"></div>` : ''}
      </div>
      <div class="ff-fbt-legend">
        <span class="ff-fbt-leg-item"><span class="ff-swatch-sq ff-swatch-sq--biz"></span><span><strong>Business:</strong> ${num(bizKm)} km (${num(bizPct, { decimals: 1 })}%)</span></span>
        <span class="ff-fbt-leg-item"><span class="ff-swatch-sq ff-swatch-sq--pers"></span><span><strong>Personal:</strong> ${num(persKm)} km (${num(persPct, { decimals: 1 })}%)</span></span>
      </div>
    </div>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter by FBT usage">
        ${USAGE_FILTERS.map((u) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.tripUsageFilter === u })}" data-action="trip-usage" data-usage="${u}">${u}</button>`)}
      </div>
      <select class="k-input" style="width:auto;min-height:36px;padding:4px 10px;font-size:13px" data-action="trip-veh-filter" aria-label="Filter by vehicle">
        <option value="All">All Vehicles</option>
        ${state.vehicles.map((v) => html`<option value="${v.id}" ${String(state.tripVehicleFilter) === String(v.id) ? 'selected' : ''}>${v.registration ? `[${v.registration}] ` : ''}${v.vehicle_name}</option>`)}
      </select>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Layout view">
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'folios' })}" data-action="trip-view" data-view="folios">${icon('grid', { size: 13 })} Folios</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': viewMode === 'table' })}" data-action="trip-view" data-view="table">${icon('list', { size: 13 })} Table</button>
      </div>
    </div>

    <div class="tk-toolbar" style="margin-top:-6px">
      <div class="tk-segmented" role="group" aria-label="Filter by trip purpose">
        ${PURPOSES.map((p) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.tripPurposeFilter === p })}" data-action="trip-purpose" data-purpose="${p}">${p}</button>`)}
      </div>
    </div>

    ${state.loading && !allTrips.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : !rows.length ? html`
      <section class="tk-sheet">${emptyState({ iconName: 'odometer', title: 'No trips matching filter', text: 'Log trips with start and end odometer readings to keep vehicle odometers and FBT logs current.' })}</section>` : viewMode === 'folios' ? html`
      <div class="ff-folio-list">
        ${rows.map((tr) => html`
          <article class="${cls('ff-folio', { 'ff-folio--personal': tr.usage_class === 'Personal' })}" data-key="tr-${tr.id}">
            <div class="ff-folio__main">
              <div class="ff-folio__top">
                ${tr.registration ? html`<span class="rego-plate">${tr.registration}</span>` : ''}
                <strong>${tr.vehicle_name}</strong>
                <span class="tk-tag ${tr.usage_class === 'Business' ? 'tk-tag--ok' : 'tk-tag--warn'}">${tr.usage_class}</span>
                <span class="tk-tag tk-tag--accent">${tr.purpose}</span>
                ${tr.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="ff-folio__meta">
                <span>${icon('calendar', { size: 12 })} ${fmtDay(tr.trip_date)}</span>
                <span>${icon('user', { size: 12 })} ${tr.driver_name}</span>
                <span>${icon('pin', { size: 12 })} ${tr.destination || 'Local route'}</span>
                <span class="tk-mono">${num(tr.start_odometer)} → ${num(tr.end_odometer)} km</span>
              </div>
              ${tr.notes ? html`<div class="tk-muted" style="font-size:12.5px">${tr.notes}</div>` : ''}
            </div>
            <div class="ff-folio__aside">
              <span class="ff-trip-stat">${num(tr.distance_km)} km</span>
              <div style="text-align:right;font-variant-numeric:tabular-nums">
                <strong style="font-size:14px">${money(tr.fuel_cost_cents, { currency: cur })}</strong>
                ${tr.distance_km > 0 ? html`<div class="tk-muted" style="font-size:11px">${money(tr.fuel_cents_per_km, { currency: cur })}/km</div>` : ''}
              </div>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="trip-del" data-id="${tr.id}">Del</button>
            </div>
          </article>`)}
      </div>` : html`
      <section class="tk-sheet">
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Date</th><th>Vehicle &amp; Driver</th><th>FBT / Purpose &amp; Route</th><th>Odometer</th><th class="tk-num">Distance</th><th class="tk-num">Fuel ($ / km)</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((tr) => html`
                <tr data-key="tr-${tr.id}">
                  <td style="white-space:nowrap">${fmtDay(tr.trip_date)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                      ${tr.registration ? html`<span class="rego-plate">${tr.registration}</span>` : ''}
                      <strong>${tr.vehicle_name}</strong>
                    </div>
                    <div class="tk-muted" style="font-size:12px;margin-top:2px">${tr.driver_name}</div>
                  </td>
                  <td>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:2px">
                      <span class="tk-tag ${tr.usage_class === 'Business' ? 'tk-tag--ok' : 'tk-tag--warn'}">${tr.usage_class}</span>
                      <span class="tk-tag tk-tag--accent">${tr.purpose}</span>
                    </div>
                    <div class="tk-muted" style="font-size:12px">${tr.destination || '—'}</div>
                  </td>
                  <td class="tk-mono" style="white-space:nowrap">${num(tr.start_odometer)} → ${num(tr.end_odometer)}</td>
                  <td class="tk-num"><span class="ff-trip-stat">${num(tr.distance_km)} km</span></td>
                  <td class="tk-num">
                    <div><strong>${money(tr.fuel_cost_cents, { currency: cur })}</strong></div>
                    ${tr.distance_km > 0 ? html`<div class="tk-muted" style="font-size:11.5px">${money(tr.fuel_cents_per_km, { currency: cur })}/km</div>` : ''}
                  </td>
                  <td class="tk-num"><button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="trip-del" data-id="${tr.id}">Del</button></td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </section>`}`;
}

export function wireTripsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="trip-usage"]', (e, el) => { state.tripUsageFilter = el.dataset.usage; draw(); });
  on(root, 'click', '[data-action="trip-purpose"]', (e, el) => { state.tripPurposeFilter = el.dataset.purpose; draw(); });
  on(root, 'change', '[data-action="trip-veh-filter"]', (e, el) => { state.tripVehicleFilter = el.value; draw(); });
  on(root, 'click', '[data-action="trip-view"]', (e, el) => { state.tripViewMode = el.dataset.view; draw(); });

  on(root, 'click', '[data-action="trip-new"]', () => openLogTripDialog(state, { loadScreen }));

  on(root, 'click', '[data-action="trip-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete trip entry?', message: 'Remove this trip from the logbook?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/trips', { id: Number(el.dataset.id) }); toast.success('Trip deleted.'); await loadScreen('/trips'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="trip-export-csv"]', () => {
    const rows = filteredTrips(state);
    downloadCsv(`fleetflow-fbt-logbook-${today()}.csv`, [
      { key: 'trip_date', label: 'Date' }, { key: 'registration', label: 'Rego' },
      { key: 'vehicle_name', label: 'Vehicle' }, { key: 'driver_name', label: 'Driver' },
      { key: 'usage_class', label: 'FBT Class' }, { key: 'purpose', label: 'Purpose' },
      { key: 'destination', label: 'Destination' },
      { key: 'start_odometer', label: 'Start Odo (km)' }, { key: 'end_odometer', label: 'End Odo (km)' },
      { key: 'distance_km', label: 'Distance (km)' },
      { label: 'Fuel Cost', get: (r) => (r.fuel_cost_cents / 100).toFixed(2) },
      { label: 'Fuel $/km', get: (r) => (r.fuel_cents_per_km / 100).toFixed(3) },
      { key: 'notes', label: 'Notes' },
    ], rows);
  });

  on(root, 'click', '[data-action="trip-print"]', () => {
    const cfg = state.session.settings;
    const cur = cfg.currency || 'AUD';
    const rows = filteredTrips(state);
    const totalKm = rows.reduce((s, r) => s + Number(r.distance_km || 0), 0);
    const bizKm = rows.filter((r) => r.usage_class === 'Business').reduce((s, r) => s + Number(r.distance_km || 0), 0);
    const persKm = Math.max(0, totalKm - bizKm);
    const bizPct = totalKm > 0 ? Math.round((bizKm / totalKm) * 1000) / 10 : 0;
    const persPct = totalKm > 0 ? Math.round((100 - bizPct) * 10) / 10 : 0;
    const fuel = rows.reduce((s, r) => s + Number(r.fuel_cost_cents || 0), 0);
    const perKmCents = totalKm > 0 ? Math.round((fuel / totalKm) * 10) / 10 : 0;
    const dedFuel = Math.round(fuel * (bizPct / 100));

    const dates = rows.map((r) => r.trip_date).filter(Boolean).sort();
    const periodLabel = dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : today();

    const byVeh = new Map();
    for (const tr of rows) {
      const key = String(tr.vehicle_id || tr.vehicle_name);
      if (!byVeh.has(key)) {
        byVeh.set(key, { rego: tr.registration || '—', name: tr.vehicle_name, trips: 0, bizKm: 0, persKm: 0, fuel: 0 });
      }
      const g = byVeh.get(key);
      g.trips += 1;
      if (tr.usage_class === 'Business') g.bizKm += Number(tr.distance_km || 0);
      else g.persKm += Number(tr.distance_km || 0);
      g.fuel += Number(tr.fuel_cost_cents || 0);
    }
    const vehSummaryRows = Array.from(byVeh.values()).map((v) => {
      const vKm = v.bizKm + v.persKm;
      const vPct = vKm > 0 ? Math.round((v.bizKm / vKm) * 1000) / 10 : 0;
      const vPerKm = vKm > 0 ? Math.round((v.fuel / vKm) * 10) / 10 : 0;
      return `<tr>
        <td><code>${esc(v.rego)}</code></td>
        <td><strong>${esc(v.name)}</strong></td>
        <td class="num">${v.trips}</td>
        <td class="num">${num(v.bizKm)} km</td>
        <td class="num">${num(v.persKm)} km</td>
        <td class="num"><strong>${num(vPct, { decimals: 1 })}%</strong></td>
        <td class="num">${esc(money(v.fuel, { currency: cur }))}</td>
        <td class="num">${esc(money(vPerKm, { currency: cur }))}/km</td>
      </tr>`;
    }).join('');

    const tripRowsHtml = rows.map((t) => `<tr>
      <td>${esc(t.trip_date)}</td>
      <td><strong>${esc(t.registration || t.vehicle_name)}</strong><br><small>${esc(t.vehicle_name)} · ${esc(t.driver_name)}</small></td>
      <td><strong>${esc(t.usage_class)}</strong> · ${esc(t.purpose)}<br><small>${esc(t.destination || '')}</small></td>
      <td class="num">${num(t.start_odometer)} – ${num(t.end_odometer)}</td>
      <td class="num"><strong>${num(t.distance_km)} km</strong></td>
      <td class="num">${esc(money(t.fuel_cost_cents, { currency: cur }))}${t.distance_km > 0 ? `<br><small>${esc(money(t.fuel_cents_per_km, { currency: cur }))}/km</small>` : ''}</td>
    </tr>`).join('');

    downloadHtmlDoc(`fleet-fbt-logbook-${today()}.html`, {
      title: `FBT Vehicle Logbook Summary`,
      businessName: cfg.business_name,
      subtitle: [
        `Period: ${periodLabel}`,
        cfg.tax_id ? `Tax ID: ${cfg.tax_id}` : '',
        `Generated ${today()}`,
      ].filter(Boolean).join(' · '),
      accent: '#135596',
      bodyHtml: `
        <div class="box" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          <div><small style="color:#52525b;text-transform:uppercase;font-weight:700">Business Use %</small><div style="font-size:22px;font-weight:800;color:#135596">${num(bizPct, { decimals: 1 })}%</div><small>${num(bizKm)} km biz / ${num(persKm)} km pers</small></div>
          <div><small style="color:#52525b;text-transform:uppercase;font-weight:700">Total Distance</small><div style="font-size:22px;font-weight:800">${num(totalKm)} km</div><small>${rows.length} trips (${num(persPct, { decimals: 1 })}% personal)</small></div>
          <div><small style="color:#52525b;text-transform:uppercase;font-weight:700">Avg Fuel Cost / km</small><div style="font-size:22px;font-weight:800">${esc(money(perKmCents, { currency: cur }))}</div><small>${esc(money(fuel, { currency: cur }))} total fuel</small></div>
          <div><small style="color:#52525b;text-transform:uppercase;font-weight:700">FBT-Deductible Fuel</small><div style="font-size:22px;font-weight:800;color:#15703d">${esc(money(dedFuel, { currency: cur }))}</div><small>Pro-rata by business km</small></div>
        </div>
        <h3 style="margin:20px 0 8px">Vehicle FBT &amp; Efficiency Breakdown</h3>
        <table>
          <thead><tr><th>Rego</th><th>Vehicle</th><th class="num">Trips</th><th class="num">Business km</th><th class="num">Personal km</th><th class="num">Business %</th><th class="num">Fuel</th><th class="num">$/km</th></tr></thead>
          <tbody>${vehSummaryRows || '<tr><td colspan="8">No trips in selected filter.</td></tr>'}</tbody>
        </table>
        <h3 style="margin:22px 0 8px">Detailed Chronological Trip Log</h3>
        <table>
          <thead><tr><th>Date</th><th>Vehicle &amp; Driver</th><th>FBT Class &amp; Route</th><th class="num">Odometer</th><th class="num">Distance</th><th class="num">Fuel ($/km)</th></tr></thead>
          <tbody>${tripRowsHtml || '<tr><td colspan="6">No trips recorded.</td></tr>'}<tr class="total-row"><td colspan="4">Total (${num(bizPct, { decimals: 1 })}% Business · ${num(bizKm)} km)</td><td class="num">${num(totalKm)} km</td><td class="num">${esc(money(fuel, { currency: cur }))}</td></tr></tbody>
        </table>`,
    });
  });
}
