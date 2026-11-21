// CaterCraft: startup, bespoke culinary micro-icons, turnkey setup/join doors, Botanical Dark-Sage & Champagne shell, routing & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderPipelineView, wirePipelineActions } from './views/pipeline.js';
import { renderProductionView, renderDeliveriesView, wireProductionActions } from './views/production.js';
import { renderDietaryView, wireDietaryActions } from './views/dietary.js';
import { renderPackagesView, renderClientsView, wireCatalogActions } from './views/catalog.js';

// Register bespoke botanical catering micro-icons
addIcons({
  banquet: '<path d="M3.5 16.5h17M5.5 16.5a6.5 6.5 0 0 1 13 0M12 10V8M10.5 8h3M6 19.5h12"/>',
  'menu-book': '<path d="M4.5 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 7.5-.5v13c-2-1-5-1-7.5.5-2.5-1.5-5.5-1.5-7.5-.5v-13zM12 6v13"/>',
});

export const BRAND_PRESETS = [
  { id: 'sage', label: 'Sage Olive', accent: '#3f5f1e', soft: '#ebf3de', rail: '#152113' },
  { id: 'champagne', label: 'Champagne Gold', accent: '#b08938', soft: '#f9f1dc', rail: '#262015' },
  { id: 'plum', label: 'Plum Banquet', accent: '#701a75', soft: '#fae8ff', rail: '#241428' },
  { id: 'harbour', label: 'Harbour Navy', accent: '#1d4ed8', soft: '#dbeafe', rail: '#121c33' },
];

export const ROLES = [
  { id: 'manager', label: 'Catering Manager' },
  { id: 'kitchen_lead', label: 'Kitchen Lead' },
  { id: 'delivery_driver', label: 'Delivery Driver' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'sage',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  jobs: [],
  packages: [],
  clients: [],
  tasks: [],
  runs: [],
  dietary: [],
  team: [],
  // Filters & view state
  pipelineSearch: '',
  pipelineStage: 'All',
  pipelineViewMode: 'deck',
  prodStation: 'All',
  prodEventFilter: 'All',
  dietFilter: 'All',
  dietSearch: '',
  clientSearch: '',
  pkgCat: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Event Pipeline', mobileLabel: 'Events', icon: 'banquet', badge: (c) => c?.activeJobs || 0 },
  { path: '/production', label: 'Kitchen Production', mobileLabel: 'Kitchen', icon: 'chef', badge: (c) => c?.openTasks || 0 },
  { path: '/deliveries', label: 'Delivery Runs', mobileLabel: 'Vans', icon: 'truck', badge: (c) => c?.openRuns || 0 },
  { path: '/dietary', label: 'Dietary Matrix', mobileLabel: 'Dietary', icon: 'leaf', badge: (c) => c?.pendingDietary || 0, alert: true },
  { path: '/packages', label: 'Menu Packages', mobileLabel: 'Menus', icon: 'menu-book' },
  { path: '/clients', label: 'Clients Directory', mobileLabel: 'Clients', icon: 'users' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'sage');
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
      const [jb, pk, cl, dt, dl, pr] = await Promise.all([
        api.get('/api/jobs'),
        api.get('/api/packages'),
        api.get('/api/clients'),
        api.get('/api/dietary'),
        api.get('/api/deliveries'),
        api.get('/api/production'),
      ]);
      state.jobs = jb.jobs || [];
      state.packages = pk.packages || [];
      state.clients = cl.clients || [];
      state.dietary = dt.items || [];
      state.runs = dl.runs || [];
      state.tasks = pr.tasks || [];
    } else if (path === '/production') {
      const [pr, jb, dl, dt] = await Promise.all([
        api.get('/api/production', { station: '' }),
        api.get('/api/jobs'),
        api.get('/api/deliveries'),
        api.get('/api/dietary'),
      ]);
      state.tasks = pr.tasks || [];
      state.jobs = jb.jobs || [];
      state.runs = dl.runs || [];
      state.dietary = dt.items || [];
    } else if (path === '/deliveries') {
      const [dl, jb, pr, dt] = await Promise.all([
        api.get('/api/deliveries'),
        api.get('/api/jobs'),
        api.get('/api/production'),
        api.get('/api/dietary'),
      ]);
      state.runs = dl.runs || [];
      state.jobs = jb.jobs || [];
      state.tasks = pr.tasks || [];
      state.dietary = dt.items || [];
    } else if (path === '/dietary') {
      const [dt, jb] = await Promise.all([api.get('/api/dietary'), api.get('/api/jobs')]);
      state.dietary = dt.items || [];
      state.jobs = jb.jobs || [];
    } else if (path === '/packages') {
      const [pk, cl] = await Promise.all([api.get('/api/packages'), api.get('/api/clients')]);
      state.packages = pk.packages || [];
      state.clients = cl.clients || [];
    } else if (path === '/clients') {
      const cl = await api.get('/api/clients');
      state.clients = cl.clients || [];
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
  if (state.route === '/') return renderPipelineView(state);
  if (state.route === '/production') return renderProductionView(state);
  if (state.route === '/deliveries') return renderDeliveriesView(state);
  if (state.route === '/dietary') return renderDietaryView(state);
  if (state.route === '/packages') return renderPackagesView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'jobs', label: 'Export Catering Jobs CSV' },
        { id: 'dietary', label: 'Export Dietary Matrix CSV' },
        { id: 'clients', label: 'Export Clients CSV' },
      ],
    });
  }
  return renderPipelineView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('banquet', { size: 26 })}</div><div><h1 class="tk-door__title">Opening CaterCraft…</h1><p class="tk-door__sub">Loading event pipeline and kitchen production sheets.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CaterCraft could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CaterCraft is not set up yet</h1><p class="tk-muted">Ask the catering director to open CaterCraft first and complete setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'CaterCraft',
      tagline: 'Quote events from menu packages, run kitchen production across Hot, Cold, Pastry and Packing stations, dispatch vans and confirm every dietary requirement.',
      iconName: 'banquet',
      defaultBusiness: 'Sage & Table Catering',
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
      appName: 'CaterCraft',
      iconName: 'banquet',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[3], { path: '/settings', label: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('banquet', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Catering & Event Orders'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Events &amp; Kitchen</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 4).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}
              <span>${item.label}</span>
              ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
            </a>`;
          })}
        </nav>
        <div class="tk-nav__group">Menus &amp; Clients</div>
        <nav class="tk-nav">
          ${NAV.slice(4).map((item) => {
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
          <div class="cc-ticker">
            <span class="tk-pulse-dot" style="--dot:#b88c32"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="cc-ticker__pill">${icon('banquet', { size: 13 })} Event Pipeline (${counts.activeJobs || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/dietary' && counts.pendingDietary > 0 ? html`
              <a href="#/dietary" class="cc-ticker__pill cc-ticker__pill--warn">${icon('leaf', { size: 13 })} ${counts.pendingDietary} Dietary Pending</a>` : ''}
            ${state.route !== '/' && state.route !== '/production' ? html`
              <a href="#/production" class="cc-ticker__pill">${icon('chef', { size: 13 })} Production (${counts.openTasks || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/packages" class="cc-ticker__pill">${icon('menu-book', { size: 13 })} Menu Packages</a>
              <a href="#/clients" class="cc-ticker__pill">${icon('users', { size: 13 })} Clients</a>` : ''}
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
    toast.success('CaterCraft is ready for your upcoming events!');
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
    toast.success('Business settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample catering events loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real clients and events remain untouched.', confirmLabel: 'Clear sample data' });
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to CaterCraft.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'jobs') {
      const { jobs } = await api.get('/api/jobs');
      downloadCsv(`catercraft-jobs-${today()}.csv`, [
        { key: 'job_number', label: 'Job #' }, { key: 'event_name', label: 'Event' },
        { key: 'event_date', label: 'Date' }, { key: 'delivery_time', label: 'Delivery Time' },
        { key: 'client_name', label: 'Client' }, { key: 'organisation', label: 'Organisation' },
        { key: 'package_name', label: 'Package' }, { key: 'guest_count', label: 'Guests' },
        { key: 'service_type', label: 'Service Type' }, { key: 'status', label: 'Status' },
        { label: 'Quote Value', get: (r) => (r.estimated_value_cents / 100).toFixed(2) },
      ], jobs);
    } else if (kind === 'dietary') {
      const { items } = await api.get('/api/dietary');
      downloadCsv(`catercraft-dietary-${today()}.csv`, [
        { key: 'event_date', label: 'Event Date' }, { key: 'event_name', label: 'Event' },
        { key: 'requirement_type', label: 'Dietary Requirement' }, { key: 'guest_count', label: 'Guests' },
        { key: 'kitchen_confirmed', label: 'Kitchen Confirmed' }, { key: 'confirmed_by', label: 'Confirmed By' },
        { key: 'notes', label: 'Notes' },
      ], items);
    } else if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`catercraft-clients-${today()}.csv`, [
        { key: 'client_name', label: 'Client' }, { key: 'organisation', label: 'Organisation' },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'billing_address', label: 'Billing Address' },
      ], clients);
    }
  } catch (err) { toastError(err); }
});

wirePipelineActions(root, state, { draw, loadScreen });
wireProductionActions(root, state, { draw, loadScreen });
wireDietaryActions(root, state, { draw, loadScreen });
wireCatalogActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/production': () => '/production',
  '/deliveries': () => '/deliveries',
  '/dietary': () => '/dietary',
  '/packages': () => '/packages',
  '/clients': () => '/clients',
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
