// FleetFlow: startup, highway micro-icons, grouped nav, calm topbar ticker, turnkey doors & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderCommandView, wireCommandActions } from './views/command.js';
import { renderVehiclesView, wireVehiclesActions } from './views/vehicles.js';
import { renderTripsView, wireTripsActions, openLogTripDialog } from './views/trips.js';
import { renderDriversView, renderMaintenanceView, renderIncidentsView, wireFleetOpsActions } from './views/ops.js';

// Register bespoke highway & fleet telemetry micro-icons
addIcons({
  'highway-shield': '<path d="M12 3.5 5 6v5.5c0 4.6 3 7.6 7 9 4-1.4 7-4.4 7-9V6zM5.5 9h13M12 9v11"/>',
  odometer: '<path d="M4.5 16.5a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13.5" r="1.5"/><path d="M7.5 18h9"/>',
  'fuel-pump': '<path d="M5 20V5.5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5.5V20M3.5 20h12M7.5 8h4v3.5h-4zM14 9h1.5a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 0 3 0V9.5L18 7"/>',
});

export const BRAND_PRESETS = [
  { id: 'highway-blue', label: 'Highway Signal Blue', accent: '#135596', soft: '#e0eefc', rail: '#11161f' },
  { id: 'signal-amber', label: 'Safety Amber', accent: '#c26508', soft: '#fef3c7', rail: '#181411' },
  { id: 'fleet-charcoal', label: 'Asphalt Charcoal', accent: '#334155', soft: '#e2e8f0', rail: '#0b111e' },
  { id: 'emerald-eco', label: 'Emerald Eco', accent: '#047857', soft: '#d1fae5', rail: '#0d221b' },
];

export const ROLES = [
  { id: 'manager', label: 'Fleet Manager' },
  { id: 'driver', label: 'Driver' },
  { id: 'workshop', label: 'Workshop Mechanic' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'highway-blue',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  compliance: null,
  vehicles: [],
  drivers: [],
  trips: [],
  tripSummary: { count: 0, totalKm: 0, businessKm: 0, personalKm: 0, businessPct: 0, totalFuelCents: 0, fuelCentsPerKm: 0 },
  maintenance: [],
  incidents: [],
  team: [],
  // Filters
  vehStatusFilter: 'All',
  tripUsageFilter: 'All',
  tripPurposeFilter: 'All',
  tripVehicleFilter: 'All',
  tripViewMode: 'folios',
  maintStatusFilter: 'All',
  incStatusFilter: 'All',
  incSevFilter: 'All',
};

const NAV = [
  { path: '/', label: 'Fleet Command', mobileLabel: 'Command', icon: 'highway-shield', badge: (c) => c?.complianceAlerts || 0, alert: true },
  { path: '/vehicles', label: 'Vehicles', mobileLabel: 'Vehicles', icon: 'truck' },
  { path: '/trips', label: 'Trip & Fuel Log', mobileLabel: 'Trips', icon: 'odometer' },
  { path: '/drivers', label: 'Drivers', mobileLabel: 'Drivers', icon: 'users' },
  { path: '/maintenance', label: 'Maintenance', mobileLabel: 'Service', icon: 'wrench', badge: (c) => c?.openMaintenance || 0 },
  { path: '/incidents', label: 'Incidents', mobileLabel: 'Incidents', icon: 'alert', badge: (c) => c?.openIncidents || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'highway-blue');
  }
  return s;
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    const tday = today();
    if (path === '/') {
      const [comp, vehs, drvs, maint] = await Promise.all([
        api.get('/api/compliance', { today: tday }),
        api.get('/api/vehicles', { today: tday }),
        api.get('/api/drivers', { today: tday }),
        api.get('/api/maintenance'),
      ]);
      state.compliance = comp;
      state.vehicles = vehs.vehicles || [];
      state.drivers = drvs.drivers || [];
      state.maintenance = maint.jobs || [];
    } else if (path === '/vehicles') {
      const [vehs, drvs, maint] = await Promise.all([
        api.get('/api/vehicles', { today: tday }),
        api.get('/api/drivers', { today: tday }),
        api.get('/api/maintenance'),
      ]);
      state.vehicles = vehs.vehicles || [];
      state.drivers = drvs.drivers || [];
      state.maintenance = maint.jobs || [];
    } else if (path === '/trips') {
      const [tr, vehs, drvs] = await Promise.all([
        api.get('/api/trips'),
        api.get('/api/vehicles', { today: tday }),
        api.get('/api/drivers', { today: tday }),
      ]);
      state.trips = tr.trips || [];
      state.tripSummary = tr.summary || state.tripSummary;
      state.vehicles = vehs.vehicles || [];
      state.drivers = drvs.drivers || [];
      if (state.query.logVehicle) {
        const vid = Number(state.query.logVehicle);
        state.query = {};
        state.loading = false;
        draw();
        await openLogTripDialog(state, { loadScreen }, vid);
        return;
      }
    } else if (path === '/drivers') {
      const drvs = await api.get('/api/drivers', { today: tday });
      state.drivers = drvs.drivers || [];
    } else if (path === '/maintenance') {
      const [m, vehs] = await Promise.all([
        api.get('/api/maintenance'),
        api.get('/api/vehicles', { today: tday }),
      ]);
      state.maintenance = m.jobs || [];
      state.vehicles = vehs.vehicles || [];
    } else if (path === '/incidents') {
      const [inc, vehs, drvs] = await Promise.all([
        api.get('/api/incidents'),
        api.get('/api/vehicles', { today: tday }),
        api.get('/api/drivers', { today: tday }),
      ]);
      state.incidents = inc.incidents || [];
      state.vehicles = vehs.vehicles || [];
      state.drivers = drvs.drivers || [];
    } else if (path === '/settings') {
      const tm = await api.get('/api/team');
      state.team = tm.team || [];
    }
  } catch (err) {
    toastError(err);
  } finally {
    state.loading = false;
    draw();
  }
}

function renderScreen() {
  if (state.route === '/') return renderCommandView(state);
  if (state.route === '/vehicles') return renderVehiclesView(state);
  if (state.route === '/trips') return renderTripsView(state);
  if (state.route === '/drivers') return renderDriversView(state);
  if (state.route === '/maintenance') return renderMaintenanceView(state);
  if (state.route === '/incidents') return renderIncidentsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'trips', label: 'Export FBT Trip Logbook CSV' },
        { id: 'vehicles', label: 'Export Vehicles CSV' },
        { id: 'maintenance', label: 'Export Maintenance CSV' },
        { id: 'incidents', label: 'Export Incidents CSV' },
      ],
    });
  }
  return renderCommandView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('highway-shield', { size: 26 })}</div><div><h1 class="tk-door__title">Opening FleetFlow…</h1><p class="tk-door__sub">Scanning rego, insurance and driver licence compliance.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">FleetFlow could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">FleetFlow is not set up yet</h1><p class="tk-muted">Ask your fleet manager to open FleetFlow first and complete workspace setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'FleetFlow',
      tagline: 'Track vehicles, drivers, rego/insurance/licence expiry countdowns, FBT trip & fuel logbooks with automatic odometer sync, workshop maintenance and incidents.',
      iconName: 'highway-shield',
      defaultBusiness: 'Metro Courier Fleet',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'FleetFlow',
      iconName: 'highway-shield',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('highway-shield', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Vehicle Fleet & Driver Log'}</span>
          </span>
        </a>

        <div class="tk-nav__group">Fleet Command</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}
              <span>${item.label}</span>
              ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
            </a>`;
          })}
        </nav>

        <div class="tk-nav__group">Safety &amp; Care</div>
        <nav class="tk-nav">
          ${NAV.slice(3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}
              <span>${item.label}</span>
              ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
            </a>`;
          })}
        </nav>

        <div class="tk-rail__foot">
          <a href="#/settings" class="${cls('tk-nav__item', { 'is-on': state.route === '/settings' })}">
            ${icon('settings', { size: 18 })}<span>Customize &amp; Settings</span>
          </a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'Owner')}</span>
            <span>
              <span class="tk-user-chip__name">${s.me.displayName || 'Owner'}</span>
              <span class="tk-user-chip__role">${s.me.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="ff-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.expiredCount > 0 ? '#ef4444' : counts.complianceAlerts > 0 ? '#f59e0b' : '#10b981'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ff-ticker__pill">${icon('highway-shield', { size: 13 })} Fleet Command</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && counts.complianceAlerts > 0 ? html`
              <a href="#/" class="ff-ticker__pill ff-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.complianceAlerts} Expir${counts.complianceAlerts === 1 ? 'y' : 'ies'}</a>` : ''}
            ${state.route !== '/incidents' && counts.openIncidents > 0 ? html`
              <a href="#/incidents" class="ff-ticker__pill ff-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.openIncidents} Incident${counts.openIncidents === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/trips' ? html`
              <a href="#/trips" class="ff-ticker__pill">${icon('odometer', { size: 13 })} Log Trip</a>` : ''}
            <button type="button" class="k-icon-btn" data-action="refresh-screen" aria-label="Refresh">${icon('refresh', { size: 17 })}</button>
          </div>
        </header>
        <main class="tk-page">
          ${renderScreen()}
        </main>
      </div>

      <nav class="tk-tabbar" aria-label="Mobile navigation">
        ${mobileTabs.map((item) => {
          const count = item.badge ? item.badge(counts) : 0;
          return html`<a href="#${item.path}" class="${cls('tk-tabbar__item', { 'is-on': state.route === item.path })}">
            ${icon(item.icon, { size: 20 })}
            <span>${item.mobileLabel || item.label}</span>
            ${count > 0 ? html`<span class="tk-tabbar__dot">${count}</span>` : ''}
          </a>`;
        })}
      </nav>
    </div>`);
}

// ---- Global & Turnkey Settings Events ----
on(root, 'click', '[data-action="retry-boot"]', () => boot());
on(root, 'click', '[data-action="refresh-session"]', () => boot());
on(root, 'click', '[data-action="refresh-screen"]', () => loadScreen());

on(root, 'click', '[data-action="pick-preset"]', (event, el) => {
  const id = el.dataset.preset;
  state.setupPreset = id;
  applyBrandPreset(BRAND_PRESETS, id);
  const form = el.closest('form');
  if (form) {
    const hidden = qs('input[name="brand_preset"]', form);
    if (hidden) hidden.value = id;
    if (state.session?.settings) state.session.settings.brand_preset = id;
  }
  draw();
});

on(root, 'submit', 'form[data-form="setup"]', async (event, form) => {
  event.preventDefault();
  const vals = readForm(form);
  state.setupBusy = true;
  state.setupError = '';
  draw();
  try {
    await api.post('/api/setup', { ...vals, today: today() });
    toast.success('FleetFlow is live!');
    state.setupBusy = false;
    await boot();
  } catch (err) {
    state.setupBusy = false;
    state.setupError = messageOf(err);
    draw();
  }
});

on(root, 'submit', 'form[data-form="join-request"]', async (event, form) => {
  event.preventDefault();
  const vals = readForm(form);
  state.setupBusy = true;
  state.setupError = '';
  draw();
  try {
    await api.post('/api/team/join', vals);
    state.setupBusy = false;
    await boot();
  } catch (err) {
    state.setupBusy = false;
    state.setupError = messageOf(err);
    draw();
  }
});

on(root, 'submit', 'form[data-form="save-settings"]', async (event, form) => {
  event.preventDefault();
  try {
    const res = await api.put('/api/settings', readForm(form));
    state.session.settings = res.settings;
    setZone(res.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, res.settings.brand_preset);
    toast.success('Fleet settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample fleet data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample fleet data?', message: 'Removes all Sample vehicles, drivers, trips, workshop jobs and incidents while preserving real records.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try {
    await api.post('/api/sample/clear', { today: today() });
    toast.success('Sample data cleared.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Member approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (event, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'trips') {
      const { trips } = await api.get('/api/trips');
      downloadCsv(`fleetflow-logbook-${today()}.csv`, [
        { key: 'trip_date', label: 'Date' }, { key: 'registration', label: 'Rego' },
        { key: 'vehicle_name', label: 'Vehicle' }, { key: 'driver_name', label: 'Driver' },
        { key: 'usage_class', label: 'FBT Class' }, { key: 'purpose', label: 'Purpose' },
        { key: 'destination', label: 'Destination' },
        { key: 'start_odometer', label: 'Start Odo (km)' }, { key: 'end_odometer', label: 'End Odo (km)' },
        { key: 'distance_km', label: 'Distance (km)' },
        { label: 'Fuel Cost', get: (r) => (r.fuel_cost_cents / 100).toFixed(2) },
        { label: 'Fuel $/km', get: (r) => (r.fuel_cents_per_km / 100).toFixed(3) },
      ], trips);
    } else if (kind === 'vehicles') {
      const { vehicles } = await api.get('/api/vehicles', { today: today() });
      downloadCsv(`fleetflow-vehicles-${today()}.csv`, [
        { key: 'vehicle_name', label: 'Vehicle' }, { key: 'registration', label: 'Rego' },
        { key: 'make_model', label: 'Make/Model' }, { key: 'year', label: 'Year' },
        { key: 'odometer_km', label: 'Odometer (km)' }, { key: 'status', label: 'Status' },
        { key: 'rego_expiry', label: 'Rego Expiry' }, { key: 'insurance_expiry', label: 'Insurance Expiry' },
      ], vehicles);
    } else if (kind === 'maintenance') {
      const { jobs } = await api.get('/api/maintenance');
      downloadCsv(`fleetflow-maintenance-${today()}.csv`, [
        { key: 'registration', label: 'Rego' }, { key: 'vehicle_name', label: 'Vehicle' },
        { key: 'maintenance_type', label: 'Type' }, { key: 'due_date', label: 'Due' },
        { key: 'completed_date', label: 'Completed' }, { key: 'status', label: 'Status' },
        { key: 'supplier', label: 'Workshop' }, { label: 'Cost', get: (r) => (r.cost_cents / 100).toFixed(2) },
      ], jobs);
    } else if (kind === 'incidents') {
      const { incidents } = await api.get('/api/incidents');
      downloadCsv(`fleetflow-incidents-${today()}.csv`, [
        { key: 'incident_date', label: 'Date' }, { key: 'registration', label: 'Rego' },
        { key: 'vehicle_name', label: 'Vehicle' }, { key: 'driver_name', label: 'Driver' },
        { key: 'incident_type', label: 'Type' }, { key: 'severity', label: 'Severity' },
        { key: 'status', label: 'Status' }, { key: 'description', label: 'Description' },
      ], incidents);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/vehicles': () => '/vehicles',
  '/trips': () => '/trips',
  '/drivers': () => '/drivers',
  '/maintenance': () => '/maintenance',
  '/incidents': () => '/incidents',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

wireCommandActions(root, state, { draw, loadScreen, router });
wireVehiclesActions(root, state, { draw, loadScreen, router });
wireTripsActions(root, state, { draw, loadScreen, router });
wireFleetOpsActions(root, state, { draw, loadScreen, router });

async function boot() {
  state.booting = true;
  state.bootError = '';
  draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') {
      router.start();
    } else {
      draw();
    }
  } catch (err) {
    state.booting = false;
    state.bootError = messageOf(err);
    draw();
  }
}

boot();
