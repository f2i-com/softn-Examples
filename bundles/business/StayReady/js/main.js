// StayReady: startup, coastal hospitality micro-icons, grouped Coastal Indigo & Warm Sand shell, ticker & routing.
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
import { renderBookingsView, renderPropertiesView, wireBookingsActions } from './views/bookings.js';
import { renderCleanersView, renderInspectionsView, renderSuppliesView, wireOpsActions } from './views/ops.js';

// Register bespoke short-stay hospitality micro-icons
addIcons({
  'key-card': '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7.5 14.5h4"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  'linen-stack': '<path d="M4 9.5 12 6l8 3.5-8 3.5-8-3.5zM4 13.5 12 17l8-3.5M4 17.5 12 21l8-3.5"/>',
  'turnaround': '<path d="M4.5 9.5h13l-3-3M19.5 14.5h-13l3 3"/>',
});

export const BRAND_PRESETS = [
  { id: 'coastal', label: 'Coastal Indigo', accent: '#283e7a', soft: '#e6ecfb', rail: '#101a34' },
  { id: 'coral', label: 'Terracotta Sun', accent: '#cc5a39', soft: '#fceded', rail: '#261816' },
  { id: 'dune', label: 'Dune Sand', accent: '#b45309', soft: '#fef3c7', rail: '#282014' },
  { id: 'indigo', label: 'Coastal Sage', accent: '#2a6860', soft: '#dff1ec', rail: '#10272b' },
];

export const ROLES = [
  { id: 'manager', label: 'Property Manager' },
  { id: 'coordinator', label: 'Guest Coordinator' },
  { id: 'cleaner', label: 'Cleaning Crew' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'coastal',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Command day & data
  commandDay: today(),
  commandMode: 'command', // 'command' | 'board'
  sameDayWindows: [],
  turnovers: [],
  checkOutsToday: [],
  checkInsToday: [],
  bookings: [],
  properties: [],
  cleaners: [],
  inspections: [],
  supplies: [],
  team: [],
  // Filters & interactive turnover helpers
  bookingPlatform: 'All',
  bookingSearch: '',
  supplyPropertyFilter: 'All',
  supplyOnlyLow: false,
  windowTimes: {},
  turnoverTasks: {},
  expandedChecklists: {},
};

const NAV = [
  { path: '/', label: 'Turnover Command', mobileLabel: 'Turnovers', icon: 'turnaround', badge: (c) => c?.sameDayUrgent || 0, alert: true },
  { path: '/bookings', label: 'Bookings Board', mobileLabel: 'Bookings', icon: 'calendar' },
  { path: '/properties', label: 'Properties', mobileLabel: 'Stays', icon: 'key-card', badge: (c) => c?.liveProperties || 0 },
  { path: '/cleaners', label: 'Cleaners Roster', mobileLabel: 'Cleaners', icon: 'users' },
  { path: '/inspections', label: 'Inspections & Damage', mobileLabel: 'Inspect', icon: 'clipboard', badge: (c) => c?.followUps || 0, alert: true },
  { path: '/supplies', label: 'Linen & Supplies', mobileLabel: 'Linen', icon: 'linen-stack', badge: (c) => c?.lowSupplies || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'coastal');
  }
  return s;
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [cmd, p, cl, sup, ins] = await Promise.all([
        api.get('/api/command', { day: state.commandDay }),
        api.get('/api/properties'),
        api.get('/api/cleaners', { day: state.commandDay }),
        api.get('/api/supplies'),
        api.get('/api/inspections'),
      ]);
      state.sameDayWindows = cmd.sameDayWindows || [];
      state.turnovers = cmd.turnovers || [];
      state.checkOutsToday = cmd.checkOutsToday || [];
      state.checkInsToday = cmd.checkInsToday || [];
      state.properties = p.properties || [];
      state.cleaners = cl.cleaners || [];
      state.supplies = sup.supplies || [];
      state.inspections = ins.inspections || [];
    } else if (path === '/bookings') {
      const [b, p, cl] = await Promise.all([
        api.get('/api/bookings'),
        api.get('/api/properties'),
        api.get('/api/cleaners', { day: today() }),
      ]);
      state.bookings = b.bookings || [];
      state.properties = p.properties || [];
      state.cleaners = cl.cleaners || [];
    } else if (path === '/properties') {
      const p = await api.get('/api/properties');
      state.properties = p.properties || [];
    } else if (path === '/cleaners') {
      const cl = await api.get('/api/cleaners', { day: today() });
      state.cleaners = cl.cleaners || [];
    } else if (path === '/inspections') {
      const [ins, p] = await Promise.all([api.get('/api/inspections'), api.get('/api/properties')]);
      state.inspections = ins.inspections || [];
      state.properties = p.properties || [];
    } else if (path === '/supplies') {
      const [sup, p] = await Promise.all([api.get('/api/supplies'), api.get('/api/properties')]);
      state.supplies = sup.supplies || [];
      state.properties = p.properties || [];
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
  if (state.route === '/bookings') return renderBookingsView(state);
  if (state.route === '/properties') return renderPropertiesView(state);
  if (state.route === '/cleaners') return renderCleanersView(state);
  if (state.route === '/inspections') return renderInspectionsView(state);
  if (state.route === '/supplies') return renderSuppliesView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'turnovers', label: 'Export Turnovers CSV' },
        { id: 'bookings', label: 'Export Bookings CSV' },
        { id: 'properties', label: 'Export Properties CSV' },
        { id: 'supplies', label: 'Export Supplies CSV' },
      ],
    });
  }
  return renderCommandView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('bed', { size: 26 })}</div><div><h1 class="tk-door__title">Opening StayReady…</h1><p class="tk-door__sub">Connecting to your private short-stay turnover database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">StayReady could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">StayReady is not set up yet</h1><p class="tk-muted">Ask the property manager to open StayReady first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'StayReady',
      tagline: 'Spot tight same-day check-out / check-in turnovers automatically, dispatch cleaners, log damage inspections, and keep per-property linen & welcome kits stocked.',
      iconName: 'bed',
      defaultBusiness: 'Coastal Keys Short-Stay',
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
      appName: 'StayReady',
      iconName: 'bed',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[5], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('bed', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Short-Stay Turnover Ops'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Guest Turnovers</div>
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
        <div class="tk-nav__group">Crew &amp; Care</div>
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
          <div class="sr-ticker">
            <span class="tk-pulse-dot" style="--dot:#e6b35c"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="sr-ticker__pill">${icon('turnaround', { size: 13 })} Turnovers (${counts.todayTurnovers || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && counts.sameDayUrgent > 0 ? html`
              <a href="#/" class="sr-ticker__pill sr-ticker__pill--alert">${icon('zap', { size: 13 })} ${counts.sameDayUrgent} Same-Day</a>` : ''}
            ${state.route !== '/inspections' && counts.followUps > 0 ? html`
              <a href="#/inspections" class="sr-ticker__pill sr-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.followUps} Follow-Up</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/bookings" class="sr-ticker__pill">${icon('calendar', { size: 13 })} Bookings</a>
              <a href="#/properties" class="sr-ticker__pill">${icon('key-card', { size: 13 })} Stays (${counts.liveProperties || 0})</a>` : ''}
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
    toast.success('StayReady is live! Turnover Command is ready.');
    state.setupBusy = false;
    state.commandDay = today();
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
    toast.success('Business settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample short-stay data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real properties, bookings & turnovers remain safe.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'turnovers') {
      const { turnovers } = await api.get('/api/turnovers');
      downloadCsv(`stayready-turnovers-${today()}.csv`, [
        { key: 'turnover_date', label: 'Date' }, { key: 'start_time', label: 'Start' },
        { key: 'property_name', label: 'Property' }, { key: 'cleaner_name', label: 'Cleaner' },
        { key: 'linen_required', label: 'Linen' }, { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
      ], turnovers);
    } else if (kind === 'bookings') {
      const { bookings } = await api.get('/api/bookings');
      downloadCsv(`stayready-bookings-${today()}.csv`, [
        { key: 'property_name', label: 'Property' }, { key: 'guest_name', label: 'Guest' },
        { key: 'platform', label: 'Platform' }, { key: 'check_in', label: 'Check-in' },
        { key: 'check_out', label: 'Check-out' }, { key: 'guest_count', label: 'Guests' }, { key: 'status', label: 'Status' },
      ], bookings);
    } else if (kind === 'properties') {
      const { properties } = await api.get('/api/properties');
      downloadCsv(`stayready-properties-${today()}.csv`, [
        { key: 'property_name', label: 'Property' }, { key: 'property_type', label: 'Type' },
        { key: 'bedrooms', label: 'Beds' }, { key: 'bathrooms', label: 'Baths' },
        { key: 'owner', label: 'Owner' }, { key: 'status', label: 'Status' },
        { key: 'address', label: 'Address' }, { key: 'access_instructions', label: 'Access / WiFi' },
      ], properties);
    } else if (kind === 'supplies') {
      const { supplies } = await api.get('/api/supplies');
      downloadCsv(`stayready-supplies-${today()}.csv`, [
        { key: 'property_name', label: 'Property' }, { key: 'supply_item', label: 'Item' },
        { key: 'current_stock', label: 'Stock' }, { key: 'reorder_point', label: 'Reorder Point' },
        { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' },
      ], supplies);
    }
  } catch (err) { toastError(err); }
});

wireCommandActions(root, state, { draw, loadScreen });
wireBookingsActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/bookings': () => '/bookings',
  '/properties': () => '/properties',
  '/cleaners': () => '/cleaners',
  '/inspections': () => '/inspections',
  '/supplies': () => '/supplies',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

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
