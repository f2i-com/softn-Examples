// VenueOps: startup, architectural hall micro-icons, turnkey setup/join doors, Architectural Indigo & Brass shell, routing & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderScheduleView, wireScheduleActions } from './views/schedule.js';
import { renderSpacesView, renderClientsView, wireSpacesActions } from './views/spaces.js';
import { renderSetupsView, wireSetupsActions } from './views/setups.js';
import { renderPaymentsView, renderIncidentsView, wireLedgerActions } from './views/ledger.js';

// Register bespoke architectural civic hall & stage micro-icons
addIcons({
  'arch-hall': '<path d="M3.5 20h17M5 20V9.5a7 7 0 0 1 14 0V20M9 20v-5a3 3 0 0 1 6 0v5M3 9.5h18"/>',
  'stage-light': '<path d="M5 4h14M8 4v3l-2 4h4l-2-4M16 4v3l-2 4h4l-2-4M4 19.5h16M7 16h10l1 3.5H6L7 16z"/>',
});

export const BRAND_PRESETS = [
  { id: 'indigo', label: 'Grand Indigo', accent: '#4c35b8', soft: '#ebe7fc', rail: '#141028' },
  { id: 'burgundy', label: 'Hall Burgundy', accent: '#9f1239', soft: '#ffe4e6', rail: '#2c121b' },
  { id: 'emerald', label: 'Civic Emerald', accent: '#047857', soft: '#d1fae5', rail: '#102620' },
  { id: 'brass', label: 'Brass Charcoal', accent: '#b45309', soft: '#fef3c7', rail: '#1c1b1a' },
];

export const ROLES = [
  { id: 'manager', label: 'Venue Manager' },
  { id: 'coordinator', label: 'Bookings Coordinator' },
  { id: 'facilities', label: 'Facilities Crew' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'indigo',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  spaces: [],
  clients: [],
  bookings: [],
  setups: [],
  payments: [],
  incidents: [],
  team: [],
  // Filters
  spaceFilter: 'All',
  spaceTypeFilter: 'All',
  bookingDateFilter: '',
  bookingSearch: '',
  timelineDate: today(),
  timelineBookings: [],
  setupFilter: 'All',
  setupChecked: {},
  clientSearch: '',
  payFilter: 'All',
  incFilter: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Space Schedule', mobileLabel: 'Schedule', icon: 'arch-hall', badge: (c) => c?.activeBookings || 0 },
  { path: '/spaces', label: 'Spaces Catalogue', mobileLabel: 'Spaces', icon: 'building' },
  { path: '/setups', label: 'Setup Checklists', mobileLabel: 'Setups', icon: 'check-square', badge: (c) => c?.pendingSetups || 0 },
  { path: '/clients', label: 'Hirer Clients', mobileLabel: 'Hirers', icon: 'users' },
  { path: '/payments', label: 'Payments Ledger', mobileLabel: 'Ledger', icon: 'dollar', badge: (c) => c?.pendingPaymentsCount || 0 },
  { path: '/incidents', label: 'Incidents & Damage', mobileLabel: 'Incidents', icon: 'alert', badge: (c) => c?.openIncidents || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'indigo');
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
      const tlDate = state.bookingDateFilter || state.timelineDate || today();
      state.timelineDate = tlDate;
      const [bk, sp, cl, tlBk, su, pm] = await Promise.all([
        api.get('/api/bookings', { date: state.bookingDateFilter || '' }),
        api.get('/api/spaces'),
        api.get('/api/clients'),
        api.get('/api/bookings', { date: tlDate }),
        api.get('/api/setups'),
        api.get('/api/payments'),
      ]);
      state.bookings = bk.bookings || [];
      state.spaces = sp.spaces || [];
      state.clients = cl.clients || [];
      state.timelineBookings = tlBk.bookings || [];
      state.setups = su.setups || [];
      state.payments = pm.payments || [];
    } else if (path === '/spaces') {
      const [sp, tlBk, cl] = await Promise.all([
        api.get('/api/spaces'),
        api.get('/api/bookings', { date: today() }),
        api.get('/api/clients'),
      ]);
      state.spaces = sp.spaces || [];
      state.timelineBookings = tlBk.bookings || [];
      state.clients = cl.clients || [];
    } else if (path === '/clients') {
      const cl = await api.get('/api/clients');
      state.clients = cl.clients || [];
    } else if (path === '/setups') {
      const [su, bk] = await Promise.all([api.get('/api/setups'), api.get('/api/bookings')]);
      state.setups = su.setups || [];
      state.bookings = bk.bookings || [];
    } else if (path === '/payments') {
      const [pm, bk] = await Promise.all([api.get('/api/payments'), api.get('/api/bookings')]);
      state.payments = pm.payments || [];
      state.bookings = bk.bookings || [];
    } else if (path === '/incidents') {
      const [inc, bk] = await Promise.all([api.get('/api/incidents'), api.get('/api/bookings')]);
      state.incidents = inc.incidents || [];
      state.bookings = bk.bookings || [];
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
  if (state.route === '/') return renderScheduleView(state);
  if (state.route === '/spaces') return renderSpacesView(state);
  if (state.route === '/setups') return renderSetupsView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/payments') return renderPaymentsView(state);
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
        { id: 'bookings', label: 'Export Bookings CSV' },
        { id: 'payments', label: 'Export Payments CSV' },
        { id: 'incidents', label: 'Export Incidents CSV' },
      ],
    });
  }
  return renderScheduleView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('arch-hall', { size: 26 })}</div><div><h1 class="tk-door__title">Opening VenueOps…</h1><p class="tk-door__sub">Loading space diary, setups and payment ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">VenueOps could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">VenueOps is not set up yet</h1><p class="tk-muted">Ask the venue manager to open VenueOps first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'VenueOps',
      tagline: 'Schedule halls, studios and courts with automatic overlap protection, hourly hire fee calculation, room setup checklists, deposits and incident logs.',
      iconName: 'arch-hall',
      defaultBusiness: 'Grand Civic Halls & Studios',
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
      appName: 'VenueOps',
      iconName: 'arch-hall',
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
          <span class="tk-brand__mark">${icon('arch-hall', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Venue Hire & Bookings'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Venue Diary</div>
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
        <div class="tk-nav__group">Accounts &amp; Care</div>
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
          <div class="vo-ticker">
            <span class="tk-pulse-dot" style="--dot:#e8b956"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="vo-ticker__pill">${icon('arch-hall', { size: 13 })} Space Schedule (${counts.activeBookings || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/incidents' && counts.openIncidents > 0 ? html`
              <a href="#/incidents" class="vo-ticker__pill vo-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.openIncidents} Incident${counts.openIncidents === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/' && state.route !== '/setups' ? html`
              <a href="#/setups" class="vo-ticker__pill">${icon('check-square', { size: 13 })} Setups (${counts.pendingSetups || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/clients" class="vo-ticker__pill">${icon('users', { size: 13 })} Hirers</a>
              <a href="#/payments" class="vo-ticker__pill">${icon('dollar', { size: 13 })} Ledger</a>` : ''}
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

// ---- Global & Turnkey Events ----
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
    toast.success('VenueOps is ready for bookings!');
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
    toast.success('Venue settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample venue spaces and bookings loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real spaces and bookings stay intact.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', {}); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to VenueOps.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'bookings') {
      const { bookings } = await api.get('/api/bookings');
      downloadCsv(`venueops-bookings-${today()}.csv`, [
        { key: 'booking_ref', label: 'Ref' }, { key: 'booking_date', label: 'Date' },
        { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' },
        { key: 'space_name', label: 'Space' }, { key: 'client_name', label: 'Hirer' },
        { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status' },
        { label: 'Hire Fee', get: (r) => (r.amount_cents / 100).toFixed(2) },
      ], bookings);
    } else if (kind === 'payments') {
      const { payments } = await api.get('/api/payments');
      downloadCsv(`venueops-payments-${today()}.csv`, [
        { key: 'payment_date', label: 'Date' }, { key: 'booking_ref', label: 'Booking Ref' },
        { key: 'client_name', label: 'Client' }, { key: 'space_name', label: 'Space' },
        { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
      ], payments);
    } else if (kind === 'incidents') {
      const { incidents } = await api.get('/api/incidents');
      downloadCsv(`venueops-incidents-${today()}.csv`, [
        { key: 'booking_ref', label: 'Booking Ref' }, { key: 'space_name', label: 'Space' },
        { key: 'incident_type', label: 'Type' }, { key: 'status', label: 'Status' },
        { label: 'Cost Estimate', get: (r) => (r.cost_estimate_cents / 100).toFixed(2) },
        { key: 'description', label: 'Description' },
      ], incidents);
    }
  } catch (err) { toastError(err); }
});

wireScheduleActions(root, state, { draw, loadScreen });
wireSpacesActions(root, state, { draw, loadScreen });
wireSetupsActions(root, state, { draw, loadScreen });
wireLedgerActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/spaces': () => '/spaces',
  '/setups': () => '/setups',
  '/clients': () => '/clients',
  '/payments': () => '/payments',
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
