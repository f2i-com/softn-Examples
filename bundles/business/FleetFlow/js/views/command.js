// Fleet Command — Highway Asphalt Slate Masthead, Fleet-Availability Ring, Two-Column Matrix + Sticky Compliance/Service Rail.
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, addMonths, daysBetween, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';
import { openLogTripDialog } from './trips.js';

export function countdownLabel(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return 'Not set';
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Due today';
  return `In ${daysLeft}d`;
}

export function trafficLightPill(dateStr, daysLeft, { emptyText = 'Not set' } = {}) {
  if (!dateStr || daysLeft === null || daysLeft === undefined) {
    return html`<span class="ff-tl ff-tl--none"><span class="ff-tl__dot"></span>${emptyText}</span>`;
  }
  if (daysLeft < 0) {
    return html`<span class="ff-tl ff-tl--red"><span class="ff-tl__dot"></span>Expired ${Math.abs(daysLeft)}d</span>`;
  }
  if (daysLeft <= 30) {
    return html`<span class="ff-tl ff-tl--amber"><span class="ff-tl__dot"></span>${daysLeft === 0 ? 'Due today' : `In ${daysLeft}d`}</span>`;
  }
  return html`<span class="ff-tl ff-tl--green"><span class="ff-tl__dot"></span>In ${daysLeft}d</span>`;
}

export function serviceStatusForVehicle(vehicleId, jobs = [], tday = today()) {
  const open = jobs
    .filter((j) => Number(j.vehicle_id) === Number(vehicleId) && j.status !== 'Completed')
    .sort((a, b) => (a.due_date || '9999-99-99').localeCompare(b.due_date || '9999-99-99'));
  if (open.length) {
    const job = open[0];
    const dLeft = job.due_date ? daysBetween(tday, job.due_date) : null;
    if (dLeft !== null && dLeft < 0) {
      return { job, tone: 'red', label: `Overdue ${Math.abs(dLeft)}d`, date: job.due_date, type: job.maintenance_type };
    }
    if (job.status === 'In Workshop') {
      return { job, tone: 'amber', label: 'In Workshop', date: job.due_date, type: job.maintenance_type };
    }
    if (dLeft !== null && dLeft <= 30) {
      return { job, tone: 'amber', label: dLeft === 0 ? 'Due today' : `In ${dLeft}d`, date: job.due_date, type: job.maintenance_type };
    }
    return { job, tone: 'green', label: dLeft !== null ? `In ${dLeft}d` : job.status, date: job.due_date, type: job.maintenance_type };
  }
  const done = jobs
    .filter((j) => Number(j.vehicle_id) === Number(vehicleId) && j.status === 'Completed')
    .sort((a, b) => (b.completed_date || '').localeCompare(a.completed_date || ''));
  const last = done[0] || null;
  return {
    job: null,
    tone: 'green',
    label: last ? 'Current' : 'Up to date',
    date: last ? last.completed_date : '',
    type: last ? `Last: ${last.maintenance_type}` : 'No overdue service',
  };
}

export async function runQuickRenewOneYear({ kind, id, currentExpiry, title, loadScreen, route = '/' }) {
  const tday = today();
  const base = currentExpiry && currentExpiry > tday ? currentExpiry : tday;
  const nextExpiry = addMonths(base, 12);
  await api.post('/api/compliance/renew', { kind, id, new_expiry: nextExpiry, today: tday });
  toast.success(`${title} renewed to ${fmtDay(nextExpiry)} (+1 yr).`);
  await loadScreen(route);
}

export async function openRenewExpiryDialog({ kind, id, currentExpiry, title, loadScreen, route = '/' }) {
  const tday = today();
  const base = currentExpiry && currentExpiry > tday ? currentExpiry : tday;
  const suggested = addMonths(base, 12);
  const done = await formDialog({
    title: `Update Expiry · ${title}`,
    submitLabel: 'Save New Expiry',
    fields: html`
      ${currentExpiry ? html`<p class="tk-muted" style="font-size:13.5px">Current expiry date: <strong>${fmtDay(currentExpiry)}</strong> (${currentExpiry})</p>` : ''}
      <label class="k-field">
        <span class="k-field__label">New expiry date</span>
        <input class="k-input" type="date" name="new_expiry" value="${suggested}" required>
        <span class="k-field__hint">Pre-filled to +12 months (${fmtDay(suggested)}).</span>
      </label>`,
    onSubmit: (v) => api.post('/api/compliance/renew', { kind, id, new_expiry: v.new_expiry, today: tday }),
  });
  if (done) {
    toast.success(`${title} expiry updated.`);
    await loadScreen(route);
  }
}

export function renderCommandView(state) {
  const cur = state.session.settings.currency || 'AUD';
  if (state.loading && !state.compliance) {
    return html`
      <section class="ff-masthead">
        <div class="ff-masthead__copy">
          <div class="ff-masthead__eyebrow"><span class="tk-pulse-dot" style="--dot:#f59e0b"></span> HIGHWAY TELEMETRY · SCANNING</div>
          <h1 class="ff-masthead__title">Fleet Command</h1>
          <div class="ff-masthead__meta">Scanning vehicle registration, insurance policies, workshop services and driver licences…</div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const comp = state.compliance || {
    today: today(),
    counts: state.session.counts || {},
    alerts: [],
    openMaintenance: [],
    openIncidents: [],
    recentTrips: [],
  };
  const c = comp.counts || {};
  const tday = comp.today || today();
  const vehicles = state.vehicles || [];
  const drivers = (state.drivers || []).filter((d) => d.active === 'Active');
  const maintJobs = state.maintenance || comp.openMaintenance || [];

  const totalVehs = Number(c.totalVehicles || vehicles.length || 0);
  const readyVehs = vehicles.length
    ? vehicles.filter((v) => v.status === 'Available' || v.status === 'In use').length
    : Number(c.availableVehicles || 0);
  const availPct = totalVehs > 0 ? Math.round((readyVehs / totalVehs) * 100) : 100;
  const ringColor = availPct >= 85 ? '#34d399' : availPct >= 60 ? '#f59e0b' : '#f87171';
  const alertCount = (comp.alerts || []).length;
  const pulseDot = c.expiredCount > 0 ? '#ef4444' : alertCount > 0 ? '#f59e0b' : '#34d399';

  return html`
    ${renderSampleBanner(c.sampleCount)}

    <section class="ff-masthead" aria-label="Fleet Command & Telemetry">
      <div class="ff-masthead__copy">
        <div class="ff-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${pulseDot}"></span>
          FLEET COMMAND · ${fmtDayNear(tday).toUpperCase()}
        </div>
        <h1 class="ff-masthead__title">${state.session.settings.business_name || 'Fleet Command'}</h1>
        <div class="ff-masthead__meta">
          <span><strong style="color:#fde68a">${num(c.totalKm || 0)} km</strong> logged (${money(c.totalFuelCents || 0, { currency: cur })} fuel)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.openMaintenance || 0} workshop · ${c.openIncidents || 0} incidents</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click +1 yr compliance renewals</span>
        </div>
      </div>

      <div class="ff-masthead__pods ff-masthead__pods--3" style="align-items:center">
        <a href="#/vehicles" class="ff-pod ff-pod--ring" title="Open Vehicles Register">
          <div class="tk-ring" style="--p:${availPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${availPct}%</span>
          </div>
          <div>
            <span class="ff-pod__lbl">Fleet Ready</span>
            <span class="ff-pod__val">${readyVehs}/${totalVehs}</span>
            <span class="ff-pod__sub">${c.workshopVehicles || 0} in workshop →</span>
          </div>
        </a>

        <div class="${cls('ff-pod', { 'ff-pod--alert': alertCount > 0, 'ff-pod--good': !alertCount })}">
          <span class="ff-pod__lbl">${icon(alertCount > 0 ? 'alert' : 'shield-check', { size: 12 })} Expiries</span>
          <span class="ff-pod__val">${alertCount}</span>
          <span class="ff-pod__sub">${c.expiredCount > 0 ? `${c.expiredCount} expired` : alertCount > 0 ? 'Due <= 30d' : '100% clear'}</span>
        </div>

        <a href="#/trips" class="ff-pod ff-pod--amber">
          <span class="ff-pod__lbl">${icon('fuel-pump', { size: 12 })} FBT Split</span>
          <span class="ff-pod__val">${num(c.businessPct || 0, { decimals: 1 })}%</span>
          <span class="ff-pod__sub">${money(c.fuelCentsPerKm || 0, { currency: cur })}/km →</span>
        </a>

        <a href="#/maintenance" class="ff-pod">
          <span class="ff-pod__lbl">${icon('wrench', { size: 12 })} Service</span>
          <span class="ff-pod__val">${c.openMaintenance || 0}</span>
          <span class="ff-pod__sub">${c.openIncidents || 0} incident${c.openIncidents === 1 ? '' : 's'} →</span>
        </a>

        <div class="ff-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="cmd-log-trip">${icon('odometer', { size: 15 })} Log Trip</button>
          <button type="button" class="k-btn k-btn--glass" data-action="cmd-print-compliance">${icon('printer', { size: 14 })} Audit PDF</button>
        </div>
      </div>
    </section>

    <div class="ff-split">
      <div class="tk-stack" style="gap:16px">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('highway-shield', { size: 17 })} Compliance Traffic-Light Matrix</h2>
            <div class="tk-sheet__actions">
              <div class="ff-legend">
                <span class="ff-tl ff-tl--green"><span class="ff-tl__dot"></span>&gt;30d</span>
                <span class="ff-tl ff-tl--amber"><span class="ff-tl__dot"></span>&lt;=30d</span>
                <span class="ff-tl ff-tl--red"><span class="ff-tl__dot"></span>Expired</span>
              </div>
              <button type="button" class="k-btn k-btn--sm" data-action="cmd-copy-compliance">${icon('copy', { size: 13 })} Copy</button>
            </div>
          </div>
          ${vehicles.length ? html`
            <div class="ff-matrix-desktop">
              <div class="tk-table-wrap">
                <table class="tk-table">
                  <thead>
                    <tr>
                      <th>Vehicle &amp; Plate</th>
                      <th>Registration</th>
                      <th>Insurance</th>
                      <th>Service</th>
                      <th>Odometer</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${vehicles.map((v) => {
                      const svc = serviceStatusForVehicle(v.id, maintJobs, tday);
                      const expiredPlate = (v.rego_days_left !== null && v.rego_days_left < 0) || (v.insurance_days_left !== null && v.insurance_days_left < 0);
                      const soonPlate = (v.rego_days_left !== null && v.rego_days_left <= 30) || (v.insurance_days_left !== null && v.insurance_days_left <= 30);
                      return html`
                        <tr data-key="mx-v-${v.id}">
                          <td>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                              ${v.registration ? html`<span class="rego-plate ${expiredPlate ? 'rego-plate--red' : soonPlate ? 'rego-plate--amber' : ''}">${v.registration}</span>` : html`<span class="tk-tag">No Plate</span>`}
                              <div>
                                <strong>${v.vehicle_name}</strong>
                                <div class="tk-muted" style="font-size:11.5px">${v.make_model || 'Fleet Vehicle'} · ${v.status}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div class="ff-cell">
                              <div class="ff-cell__top">
                                ${trafficLightPill(v.rego_expiry, v.rego_days_left)}
                                <div class="ff-cell__acts">
                                  <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} Rego">+1 yr</button>
                                  <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} — Registration">Date</button>
                                </div>
                              </div>
                              <span class="ff-cell__date">${v.rego_expiry ? fmtDay(v.rego_expiry) : 'Not set'}</span>
                            </div>
                          </td>
                          <td>
                            <div class="ff-cell">
                              <div class="ff-cell__top">
                                ${trafficLightPill(v.insurance_expiry, v.insurance_days_left)}
                                <div class="ff-cell__acts">
                                  <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} Insurance">+1 yr</button>
                                  <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} — Insurance">Date</button>
                                </div>
                              </div>
                              <span class="ff-cell__date">${v.insurance_expiry ? fmtDay(v.insurance_expiry) : 'Not set'}</span>
                            </div>
                          </td>
                          <td>
                            <div class="ff-cell">
                              <div class="ff-cell__top">
                                <span class="ff-tl ff-tl--${svc.tone}"><span class="ff-tl__dot"></span>${svc.label}</span>
                                ${svc.job ? html`<button type="button" class="ff-renew-btn" data-action="cmd-maint-status" data-id="${svc.job.id}" data-status="Completed">Done</button>` : html`<a href="#/maintenance" class="ff-renew-btn ff-renew-btn--ghost">Log</a>`}
                              </div>
                              <span class="ff-cell__date">${svc.type}</span>
                            </div>
                          </td>
                          <td><span class="ff-odo">${num(v.odometer_km)} km</span></td>
                        </tr>`;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="ff-matrix-mobile">
              ${vehicles.map((v) => {
                const svc = serviceStatusForVehicle(v.id, maintJobs, tday);
                const expiredPlate = (v.rego_days_left !== null && v.rego_days_left < 0) || (v.insurance_days_left !== null && v.insurance_days_left < 0);
                const soonPlate = (v.rego_days_left !== null && v.rego_days_left <= 30) || (v.insurance_days_left !== null && v.insurance_days_left <= 30);
                return html`
                  <article class="ff-mob-comp" data-key="mob-v-${v.id}">
                    <div class="ff-mob-comp__head">
                      <div class="ff-mob-comp__id">
                        <div class="ff-mob-comp__name">
                          ${v.registration ? html`<span class="rego-plate ${expiredPlate ? 'rego-plate--red' : soonPlate ? 'rego-plate--amber' : ''}">${v.registration}</span>` : html`<span class="tk-tag">No Plate</span>`}
                          <span>${v.vehicle_name}</span>
                        </div>
                        <div class="ff-mob-comp__sub">${v.make_model || 'Fleet Vehicle'} · ${v.status}</div>
                      </div>
                      <span class="ff-odo">${num(v.odometer_km)} km</span>
                    </div>
                    <div class="ff-mob-comp__rows">
                      <div class="ff-mob-comp__row">
                        <span class="ff-mob-comp__k">Rego</span>
                        <div class="ff-mob-comp__val">
                          ${trafficLightPill(v.rego_expiry, v.rego_days_left)}
                          <span class="ff-cell__date">${v.rego_expiry ? fmtDay(v.rego_expiry) : 'Not set'}</span>
                        </div>
                        <div class="ff-mob-comp__acts">
                          <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} Rego">+1 yr</button>
                          <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="rego" data-id="${v.id}" data-cur="${v.rego_expiry || ''}" data-title="${v.vehicle_name} — Registration">Date</button>
                        </div>
                      </div>
                      <div class="ff-mob-comp__row">
                        <span class="ff-mob-comp__k">Insurance</span>
                        <div class="ff-mob-comp__val">
                          ${trafficLightPill(v.insurance_expiry, v.insurance_days_left)}
                          <span class="ff-cell__date">${v.insurance_expiry ? fmtDay(v.insurance_expiry) : 'Not set'}</span>
                        </div>
                        <div class="ff-mob-comp__acts">
                          <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} Insurance">+1 yr</button>
                          <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="insurance" data-id="${v.id}" data-cur="${v.insurance_expiry || ''}" data-title="${v.vehicle_name} — Insurance">Date</button>
                        </div>
                      </div>
                      <div class="ff-mob-comp__row">
                        <span class="ff-mob-comp__k">Service</span>
                        <div class="ff-mob-comp__val">
                          <span class="ff-tl ff-tl--${svc.tone}"><span class="ff-tl__dot"></span>${svc.label}</span>
                          <span class="ff-cell__date">${svc.type}</span>
                        </div>
                        <div class="ff-mob-comp__acts">
                          ${svc.job ? html`<button type="button" class="ff-renew-btn" data-action="cmd-maint-status" data-id="${svc.job.id}" data-status="Completed">Done</button>` : html`<a href="#/maintenance" class="ff-renew-btn ff-renew-btn--ghost">Log</a>`}
                        </div>
                      </div>
                    </div>
                  </article>`;
              })}
            </div>` : html`<div class="tk-sheet__body">${emptyState({ iconName: 'truck', title: 'No vehicles registered yet', text: 'Add fleet vehicles to track Registration, Insurance and Service traffic lights.' })}</div>`}

          ${drivers.length ? html`
            <div class="tk-sheet__head" style="border-top:1px solid var(--k-border)">
              <h3 class="tk-sheet__title" style="font-size:14px">${icon('users', { size: 15 })} Driver Licences</h3>
              <span class="tk-sheet__count">${drivers.length} active</span>
              <div class="tk-sheet__actions"><a href="#/drivers" class="k-btn k-btn--ghost k-btn--sm">All Drivers</a></div>
            </div>
            <div class="ff-matrix-desktop">
              <div class="tk-table-wrap">
                <table class="tk-table">
                  <thead>
                    <tr><th>Driver</th><th>Class</th><th>Status</th><th>Expiry</th><th class="tk-num">Renew</th></tr>
                  </thead>
                  <tbody>
                    ${drivers.map((d) => html`
                      <tr data-key="mx-d-${d.id}">
                        <td><strong>${d.driver_name}</strong></td>
                        <td><span class="tk-tag tk-tag--accent">${d.licence_class}</span></td>
                        <td>${trafficLightPill(d.licence_expiry, d.licence_days_left)}</td>
                        <td class="tk-muted" style="white-space:nowrap">${d.licence_expiry ? fmtDay(d.licence_expiry) : 'Not set'}</td>
                        <td class="tk-num" style="white-space:nowrap">
                          <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} Licence">+1 yr</button>
                          <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} — Driver Licence">Date</button>
                        </td>
                      </tr>`)}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="ff-matrix-mobile">
              ${drivers.map((d) => html`
                <article class="ff-mob-comp" data-key="mob-d-${d.id}">
                  <div class="ff-mob-comp__row">
                    <div class="ff-mob-comp__id">
                      <div class="ff-mob-comp__name">
                        <span>${d.driver_name}</span>
                        <span class="tk-tag tk-tag--accent">${d.licence_class}</span>
                      </div>
                      <div class="ff-mob-comp__val" style="margin-top:3px">
                        ${trafficLightPill(d.licence_expiry, d.licence_days_left)}
                        <span class="ff-cell__date">${d.licence_expiry ? fmtDay(d.licence_expiry) : 'Not set'}</span>
                      </div>
                    </div>
                    <div class="ff-mob-comp__acts">
                      <button type="button" class="ff-renew-btn" data-action="cmd-renew-1y" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} Licence">+1 yr</button>
                      <button type="button" class="ff-renew-btn ff-renew-btn--ghost" data-action="cmd-renew" data-kind="licence" data-id="${d.id}" data-cur="${d.licence_expiry || ''}" data-title="${d.driver_name} — Driver Licence">Date</button>
                    </div>
                  </div>
                </article>`)}
            </div>` : ''}
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('odometer', { size: 17 })} Recent Trips &amp; Fuel Log</h2>
            <div class="tk-sheet__actions"><a href="#/trips" class="k-btn k-btn--ghost k-btn--sm">Full Logbook</a></div>
          </div>
          <div>
            ${(comp.recentTrips || []).length ? comp.recentTrips.slice(0, 5).map((tr) => html`
              <div class="tk-row" data-key="ctr-${tr.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    ${tr.registration ? html`<span class="rego-plate">${tr.registration}</span>` : ''}
                    <span>${tr.vehicle_name}</span>
                    <span class="tk-tag ${tr.usage_class === 'Business' ? 'tk-tag--ok' : 'tk-tag--warn'}">${tr.usage_class}</span>
                    <span class="tk-tag tk-tag--accent">${tr.purpose}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>${fmtDay(tr.trip_date)}</span>
                    <span>${tr.driver_name}</span>
                    <span>${tr.destination || 'Local route'}</span>
                  </div>
                </div>
                <div class="tk-row__aside">
                  <span class="ff-trip-stat">${num(tr.distance_km)} km</span>
                  ${tr.fuel_cost_cents > 0 ? html`<span class="tk-tag">${money(tr.fuel_cost_cents, { currency: cur })}</span>` : ''}
                </div>
              </div>`) : html`<div class="tk-sheet__body"><p class="tk-muted">No trips logged yet. Click Log Trip above to record mileage and fuel.</p></div>`}
          </div>
        </section>
      </div>

      <aside class="ff-rail-panel" aria-label="Compliance Alerts, Service Due & Incidents">
        <section class="ff-rail-card">
          <div class="ff-rail-card__head">
            <span class="ff-rail-card__title">${icon('alert', { size: 14 })} Compliance Due (&lt;=30d)</span>
            <span class="tk-tag ${alertCount > 0 ? 'tk-tag--bad' : 'tk-tag--ok'}">${alertCount}</span>
          </div>
          ${comp.alerts.length ? html`
            <div class="ff-rail-list">
              ${comp.alerts.map((al) => html`
                <div class="ff-rail-item ff-rail-item--${al.severity}" data-key="${al.key}">
                  <div class="ff-rail-item__top">
                    <div style="display:grid;gap:3px;min-width:0">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span class="ff-tl ${al.days_left < 0 ? 'ff-tl--red' : 'ff-tl--amber'}"><span class="ff-tl__dot"></span>${countdownLabel(al.days_left)}</span>
                        ${al.entity_type === 'Vehicle' ? html`<span class="rego-plate rego-plate--amber">${al.badge}</span>` : html`<span class="tk-tag tk-tag--info">${al.badge}</span>`}
                      </div>
                      <div style="font-size:13px;font-weight:750;color:var(--k-text)">${al.title}</div>
                      <div class="tk-muted" style="font-size:11.5px">Expires ${fmtDay(al.expiry_date)}</div>
                    </div>
                  </div>
                  <div class="ff-rail-item__foot">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cmd-renew-1y" data-kind="${al.kind}" data-id="${al.entity_id}" data-cur="${al.expiry_date}" data-title="${al.title}">Renew +1 yr</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="cmd-renew" data-kind="${al.kind}" data-id="${al.entity_id}" data-cur="${al.expiry_date}" data-title="${al.title}">Set date</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">100% compliant — all regos, policies &amp; licences valid &gt;30 days ✓</div>`}
        </section>

        <section class="ff-rail-card">
          <div class="ff-rail-card__head">
            <span class="ff-rail-card__title">${icon('wrench', { size: 14 })} Service &amp; Workshop Due</span>
            <a href="#/maintenance" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${comp.openMaintenance.length})</a>
          </div>
          ${comp.openMaintenance.length ? html`
            <div class="ff-rail-list">
              ${comp.openMaintenance.slice(0, 4).map((job) => html`
                <div class="ff-rail-item ${job.status === 'In Workshop' ? 'ff-rail-item--soon' : 'ff-rail-item--low'}" data-key="cmj-${job.id}">
                  <div class="ff-rail-item__top">
                    <div style="display:grid;gap:3px;min-width:0">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        ${job.registration ? html`<span class="rego-plate">${job.registration}</span>` : ''}
                        <span class="tk-tag ${job.status === 'In Workshop' ? 'tk-tag--warn' : 'tk-tag--info'}">${job.status}</span>
                      </div>
                      <div style="font-size:13px;font-weight:750">${job.vehicle_name} · ${job.maintenance_type}</div>
                      <div class="tk-muted" style="font-size:11.5px">${job.due_date ? `Due ${fmtDayNear(job.due_date)}` : ''}${job.supplier ? ` · ${job.supplier}` : ''}</div>
                    </div>
                  </div>
                  <div class="ff-rail-item__foot">
                    ${job.status !== 'In Workshop' ? html`<button type="button" class="k-btn k-btn--sm" data-action="cmd-maint-status" data-id="${job.id}" data-status="In Workshop">Workshop</button>` : html`<span class="tk-muted" style="font-size:11.5px">${job.cost_cents > 0 ? money(job.cost_cents, { currency: cur }) : 'In bay'}</span>`}
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cmd-maint-status" data-id="${job.id}" data-status="Completed">Complete ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No open workshop or service jobs ✓</div>`}
        </section>

        <section class="ff-rail-card">
          <div class="ff-rail-card__head">
            <span class="ff-rail-card__title">${icon('alert', { size: 14 })} Open Safety Incidents</span>
            <a href="#/incidents" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Register</a>
          </div>
          ${comp.openIncidents.length ? html`
            <div class="ff-rail-list">
              ${comp.openIncidents.slice(0, 4).map((inc) => html`
                <div class="ff-rail-item ff-rail-item--${inc.severity.toLowerCase()}" data-key="cinc-${inc.id}">
                  <div class="ff-rail-item__top">
                    <div style="display:grid;gap:3px;min-width:0">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        ${inc.registration ? html`<span class="rego-plate">${inc.registration}</span>` : ''}
                        <span class="tk-tag ${inc.severity === 'High' ? 'tk-tag--bad' : inc.severity === 'Medium' ? 'tk-tag--warn' : 'tk-tag--info'}">${inc.severity}</span>
                      </div>
                      <div style="font-size:13px;font-weight:750">${inc.incident_type} · ${inc.driver_name}</div>
                      <div class="tk-muted" style="font-size:11.5px">${fmtDay(inc.incident_date)}${inc.description ? ` — ${inc.description.slice(0, 68)}${inc.description.length > 68 ? '…' : ''}` : ''}</div>
                    </div>
                  </div>
                  <div class="ff-rail-item__foot">
                    <span class="tk-tag">${inc.status}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="cmd-inc-resolve" data-id="${inc.id}">Resolve ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No open vehicle incidents ✓</div>`}
        </section>
      </aside>
    </div>`;
}

export function wireCommandActions(root, state, { loadScreen }) {
  on(root, 'click', '[data-action="cmd-log-trip"]', () => openLogTripDialog(state, { loadScreen }, null, '/'));

  on(root, 'click', '[data-action="cmd-renew-1y"]', async (e, el) => {
    try {
      await runQuickRenewOneYear({
        kind: el.dataset.kind,
        id: Number(el.dataset.id),
        currentExpiry: el.dataset.cur || '',
        title: el.dataset.title || 'Compliance Date',
        loadScreen,
        route: state.route || '/',
      });
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmd-renew"]', async (e, el) => {
    try {
      await openRenewExpiryDialog({
        kind: el.dataset.kind,
        id: Number(el.dataset.id),
        currentExpiry: el.dataset.cur || '',
        title: el.dataset.title || 'Compliance Date',
        loadScreen,
        route: state.route || '/',
      });
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmd-maint-status"]', async (e, el) => {
    try {
      await api.post('/api/maintenance/status', { id: Number(el.dataset.id), status: el.dataset.status, completed_date: today() });
      toast.success(`Maintenance job marked ${el.dataset.status}.`);
      await loadScreen(state.route || '/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmd-inc-resolve"]', async (e, el) => {
    try {
      await api.post('/api/incidents/status', { id: Number(el.dataset.id), status: 'Resolved' });
      toast.success('Incident marked Resolved.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmd-copy-compliance"]', () => {
    const comp = state.compliance;
    if (!comp) return;
    const lines = [
      `${state.session.settings.business_name} — Fleet Compliance Report (${today()})`,
      `Vehicles: ${comp.counts.availableVehicles}/${comp.counts.totalVehicles} available | Alerts: ${comp.alerts.length} (${comp.counts.expiredCount} expired)`,
      ``,
      ...(comp.alerts.length
        ? comp.alerts.map((a) => `- [${countdownLabel(a.days_left)}] ${a.title} (${a.badge}) · Expiry ${a.expiry_date}`)
        : ['All rego, insurance and driver licences are compliant (>30 days remaining).']),
    ];
    copyText(lines.join('\n'), { title: 'Copy Compliance Summary', done: 'Compliance summary copied.' });
  });

  on(root, 'click', '[data-action="cmd-print-compliance"]', () => {
    const comp = state.compliance;
    if (!comp) return;
    const rows = comp.alerts.map((a) => `<tr>
      <td><strong>${esc(countdownLabel(a.days_left))}</strong></td>
      <td>${esc(a.entity_type)}</td>
      <td>${esc(a.title)}</td>
      <td><code>${esc(a.badge)}</code></td>
      <td>${esc(a.expiry_date)}</td>
    </tr>`).join('');
    downloadHtmlDoc(`fleet-compliance-${today()}.html`, {
      title: `Fleet Compliance Audit · ${today()}`,
      businessName: state.session.settings.business_name,
      subtitle: `${comp.counts.totalVehicles} vehicles · ${comp.alerts.length} expiry alerts (<= 30 days)`,
      accent: '#135596',
      bodyHtml: `<table>
        <thead><tr><th>Status</th><th>Entity</th><th>Compliance Item</th><th>Plate / Class</th><th>Expiry Date</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">All vehicles and drivers are compliant for > 30 days.</td></tr>'}</tbody>
      </table>`,
    });
  });
}
