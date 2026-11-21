// CleanShift: startup, bespoke cleaning micro-icons, grouped Aqua-Teal & Linen shell, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderDispatchView, wireDispatchActions } from './views/dispatch.js';
import { renderClientsView, renderTeamsView, wireDirectoryActions } from './views/clients.js';
import { renderQualityView, renderSuppliesView, renderIssuesView, wireOpsActions } from './views/ops.js';

// Register bespoke cleaning operations micro-icons
addIcons({
  'spray-bottle': '<path d="M9 5h5v2.5H9zM14 5.8h3.5a1.5 1.5 0 0 1 1.5 1.5V9M11.5 7.5V10M8 10h7l1.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19v-5.5zM4 5.5h2M4.5 3.5l1.2 1"/>',
  'crew-van': '<path d="M3 15V8a2 2 0 0 1 2-2h9.5l3.5 4.2L21 11.5V15h-2M3 15h2M9.5 15h5M13.5 6v4.5H18"/><circle cx="7.2" cy="16.5" r="2"/><circle cx="16.8" cy="16.5" r="2"/>',
  'key-vault': '<rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="12" cy="10.5" r="2.2"/><path d="M12 12.7V16.5M12 15h2"/>',
});

export const BRAND_PRESETS = [
  { id: 'aqua', label: 'Fresh Aqua', accent: '#0891b2', soft: '#dff7fb', rail: '#071c2b' },
  { id: 'mint', label: 'Mint Sparkle', accent: '#0d9488', soft: '#ccfbf1', rail: '#0b2626' },
  { id: 'navy', label: 'Deep Ocean', accent: '#0284c7', soft: '#e0f2fe', rail: '#0b1d33' },
  { id: 'citrus', label: 'Citrus Lemon', accent: '#ca8a04', soft: '#fef9c3', rail: '#26210f' },
];

export const ROLES = [
  { id: 'manager', label: 'Operations Manager' },
  { id: 'dispatcher', label: 'Dispatcher' },
  { id: 'cleaner', label: 'Cleaner' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'aqua',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Domain caches
  jobs: [],
  clients: [],
  teams: [],
  checks: [],
  supplies: [],
  issues: [],
  team: [],
  // View controls
  dispatchDate: today(),
  dispatchMode: 'runsheet', // 'runsheet' | 'status' | 'team'
  dispatchTeamFilter: 'All',
  dispatchStatusFilter: 'All',
  dispatchSearch: '',
  clientSearch: '',
  clientTypeFilter: 'All',
  clientBillingFilter: 'All',
  supplyFilter: 'All',
  issueFilter: 'OpenActive',
};

const NAV = [
  { path: '/', label: 'Crew Dispatch', mobileLabel: 'Dispatch', icon: 'spray-bottle', badge: (c) => c?.jobsToday || 0 },
  { path: '/clients', label: 'Clients Directory', mobileLabel: 'Clients', icon: 'key-vault', badge: (c) => c?.overdueClients || 0, alert: true },
  { path: '/teams', label: 'Teams Roster', mobileLabel: 'Crews', icon: 'crew-van' },
  { path: '/quality', label: 'Quality Checks', mobileLabel: 'Quality', icon: 'check-square' },
  { path: '/supplies', label: 'Supplies Stock', mobileLabel: 'Supplies', icon: 'box', badge: (c) => c?.lowSupplies || 0, alert: true },
  { path: '/issues', label: 'Client Issues', mobileLabel: 'Issues', icon: 'alert', badge: (c) => c?.openIssues || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'aqua');
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
      const [j, c, t, q, sup, iss] = await Promise.all([
        api.get('/api/jobs', { day: state.dispatchDate }),
        api.get('/api/clients'),
        api.get('/api/teams', { day: state.dispatchDate }),
        api.get('/api/quality'),
        api.get('/api/supplies'),
        api.get('/api/issues'),
      ]);
      state.jobs = j.jobs || [];
      state.clients = c.clients || [];
      state.teams = t.teams || [];
      state.checks = q.checks || [];
      state.supplies = sup.supplies || [];
      state.issues = iss.issues || [];
    } else if (path === '/clients') {
      const [c, t] = await Promise.all([api.get('/api/clients'), api.get('/api/teams', { day: today() })]);
      state.clients = c.clients || [];
      state.teams = t.teams || [];
    } else if (path === '/teams') {
      const [t, q, j] = await Promise.all([
        api.get('/api/teams', { day: today() }),
        api.get('/api/quality'),
        api.get('/api/jobs'),
      ]);
      state.teams = t.teams || [];
      state.checks = q.checks || [];
      state.jobs = j.jobs || [];
    } else if (path === '/quality') {
      const [q, j, t] = await Promise.all([
        api.get('/api/quality'),
        api.get('/api/jobs'),
        api.get('/api/teams', { day: today() }),
      ]);
      state.checks = q.checks || [];
      state.jobs = j.jobs || [];
      state.teams = t.teams || [];
    } else if (path === '/supplies') {
      const s = await api.get('/api/supplies');
      state.supplies = s.supplies || [];
    } else if (path === '/issues') {
      const [i, c, j] = await Promise.all([api.get('/api/issues'), api.get('/api/clients'), api.get('/api/jobs')]);
      state.issues = i.issues || [];
      state.clients = c.clients || [];
      state.jobs = j.jobs || [];
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
  if (state.route === '/') return renderDispatchView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/teams') return renderTeamsView(state);
  if (state.route === '/quality') return renderQualityView(state);
  if (state.route === '/supplies') return renderSuppliesView(state);
  if (state.route === '/issues') return renderIssuesView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'jobs', label: 'Export Jobs CSV' },
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'supplies', label: 'Export Supplies CSV' },
        { id: 'issues', label: 'Export Issues CSV' },
      ],
    });
  }
  return renderDispatchView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('spray-bottle', { size: 26 })}</div><div><h1 class="tk-door__title">Opening CleanShift…</h1><p class="tk-door__sub">Connecting to your private cleaning operations workspace.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CleanShift could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CleanShift is not set up yet</h1><p class="tk-muted">Ask the business owner to open CleanShift first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'CleanShift',
      tagline: 'Dispatch residential & commercial crews, share client key & alarm codes safely, sign off quality checklists, watch supply par levels, and resolve client issues.',
      iconName: 'spray-bottle',
      defaultBusiness: 'Harbour Sparkle Cleaning Co.',
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
      appName: 'CleanShift',
      iconName: 'spray-bottle',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('spray-bottle', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Cleaning Crew Operations'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Daily Operations</div>
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
        <div class="tk-nav__group">Standards &amp; Stock</div>
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
          <div class="cs-ticker">
            <span class="tk-pulse-dot" style="--dot:#22d3ee"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="cs-ticker__pill">${icon('spray-bottle', { size: 13 })} Dispatch (${counts.jobsToday || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/issues' && counts.openIssues > 0 ? html`
              <a href="#/issues" class="cs-ticker__pill cs-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.openIssues} Issue${counts.openIssues === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/supplies' && counts.lowSupplies > 0 ? html`
              <a href="#/supplies" class="cs-ticker__pill">${icon('box', { size: 13 })} Low Stock (${counts.lowSupplies})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/quality" class="cs-ticker__pill">${icon('check-square', { size: 13 })} Quality</a>
              <a href="#/teams" class="cs-ticker__pill">${icon('crew-van', { size: 13 })} Crews</a>` : ''}
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
    toast.success('CleanShift is live! Your dispatch desk is ready.');
    state.setupBusy = false;
    state.dispatchDate = today();
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
    toast.success('Sample cleaning data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all example records tagged Sample. Your real records stay untouched.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'jobs') {
      const { jobs } = await api.get('/api/jobs');
      downloadCsv(`cleanshift-jobs-${today()}.csv`, [
        { key: 'scheduled_date', label: 'Date' }, { key: 'start_time', label: 'Start' },
        { key: 'duration_hours', label: 'Hours' }, { key: 'client_name', label: 'Client' },
        { key: 'job_type', label: 'Job Type' }, { key: 'team_name', label: 'Team' },
        { key: 'status', label: 'Status' }, { label: 'Price', get: (r) => (r.price_cents / 100).toFixed(2) },
      ], jobs);
    } else if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`cleanshift-clients-${today()}.csv`, [
        { key: 'client_name', label: 'Client' }, { key: 'client_type', label: 'Type' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'address', label: 'Address' }, { key: 'billing_status', label: 'Billing' },
        { key: 'access_instructions', label: 'Access Instructions' },
      ], clients);
    } else if (kind === 'supplies') {
      const { supplies } = await api.get('/api/supplies');
      downloadCsv(`cleanshift-supplies-${today()}.csv`, [
        { key: 'supply_item', label: 'Item' }, { key: 'category', label: 'Category' },
        { key: 'current_stock', label: 'Stock' }, { key: 'reorder_point', label: 'Reorder Point' },
        { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' }, { key: 'supplier', label: 'Supplier' },
      ], supplies);
    } else if (kind === 'issues') {
      const { issues } = await api.get('/api/issues');
      downloadCsv(`cleanshift-issues-${today()}.csv`, [
        { key: 'client_name', label: 'Client' }, { key: 'issue_type', label: 'Type' },
        { key: 'severity', label: 'Severity' }, { key: 'status', label: 'Status' },
        { key: 'description', label: 'Description' }, { key: 'resolution', label: 'Resolution' },
      ], issues);
    }
  } catch (err) { toastError(err); }
});

wireDispatchActions(root, state, { draw, loadScreen });
wireDirectoryActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/teams': () => '/teams',
  '/quality': () => '/quality',
  '/supplies': () => '/supplies',
  '/issues': () => '/issues',
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
