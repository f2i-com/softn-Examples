// Plumbing & Trades Field Service Operations: Copper/Brass Blueprint Steel shell, bespoke micro-icons, grouped nav, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderDispatchView, renderJobDetailView, wireDispatchActions } from './views/dispatch.js';
import { renderVisitsView, renderPartsView, renderCustomersView, renderInvoicesView, wireRecordActions } from './views/records.js';

// Register bespoke plumbing & hydraulic micro-icons
addIcons({
  'pipe-wrench': '<path d="M5 19.5 14.2 10.3a4.3 4.3 0 0 0 5.5-5.5l-2.6 2.6-2.4-2.4 2.6-2.6a4.3 4.3 0 0 0-5.5 5.5L2.6 17.1a1.7 1.7 0 0 0 2.4 2.4z"/><path d="M14.5 14.5 19 19"/>',
  'valve-gauge': '<circle cx="12" cy="11" r="6.5"/><path d="M12 11l3-2.5M9.5 17.5V21M14.5 17.5V21M7 21h10M12 4.5V2.5M9.5 2.5h5"/>',
  'service-van': '<path d="M3 16V9.5a1.5 1.5 0 0 1 1.5-1.5H14l3.2 3.2 2.8.8a1 1 0 0 1 .8 1V16h-2M3 16h2M9.5 16h5.5M5 5.5h9M7 8V5.5M12 8V5.5"/><circle cx="7.2" cy="16.8" r="1.9"/><circle cx="17" cy="16.8" r="1.9"/>',
});

export const BRAND_PRESETS = [
  { id: 'trade-blue', label: 'Blueprint Steel', accent: '#1d4ed8', soft: '#dbeafe', rail: '#091526' },
  { id: 'copper-pipe', label: 'Copper Pipe', accent: '#c86d2d', soft: '#fef4e2', rail: '#1f140c' },
  { id: 'steel-charcoal', label: 'Steel Charcoal', accent: '#334155', soft: '#e2e8f0', rail: '#111827' },
  { id: 'safety-teal', label: 'Hydro Teal', accent: '#0f766e', soft: '#ccfbf1', rail: '#0b2224' },
];

export const ROLES = [
  { id: 'manager', label: 'Operations Manager' },
  { id: 'dispatch', label: 'Office / Dispatch' },
  { id: 'technician', label: 'Technician' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'trade-blue',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  jobs: [],
  jobDetail: null,
  visits: [],
  parts: [],
  customers: [],
  invoices: [],
  team: [],
  dispatchLayout: 'cards',
  jobQuickFilter: 'All',
  jobTech: 'All',
  jobSearch: '',
  showInvoicedOnBoard: false,
  visitsFollowUpOnly: false,
  partsStatus: 'All',
  custType: 'All',
  custSearch: '',
  invStatus: 'All',
  invSearch: '',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Dispatch Board', mobileLabel: 'Dispatch', icon: 'pipe-wrench', badge: (c) => c?.activeJobs || 0 },
  { path: '/visits', label: 'Work Orders', mobileLabel: 'Orders', icon: 'clipboard', badge: (c) => c?.followUps || 0, alert: true },
  { path: '/parts', label: 'Parts & Materials', mobileLabel: 'Parts', icon: 'valve-gauge', badge: (c) => c?.pendingParts || 0, alert: true },
  { path: '/customers', label: 'Customers', mobileLabel: 'Clients', icon: 'users' },
  { path: '/invoices', label: 'Invoices', mobileLabel: 'Invoices', icon: 'receipt', badge: (c) => c?.unpaidInvoices || 0 },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'trade-blue');
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
      const [j, c, p, v] = await Promise.all([
        api.get('/api/jobs'),
        api.get('/api/customers'),
        api.get('/api/parts'),
        api.get('/api/visits'),
      ]);
      state.jobs = j.jobs || [];
      state.customers = c.customers || [];
      state.parts = p.parts || [];
      state.visits = v.visits || [];
    } else if (path === '/job') {
      const id = Number(state.query.id);
      if (id) state.jobDetail = await api.get('/api/jobs/detail', { id });
      else state.jobDetail = null;
    } else if (path === '/visits') {
      const v = await api.get('/api/visits');
      state.visits = v.visits || [];
    } else if (path === '/parts') {
      const p = await api.get('/api/parts');
      state.parts = p.parts || [];
    } else if (path === '/customers') {
      const c = await api.get('/api/customers');
      state.customers = c.customers || [];
    } else if (path === '/invoices') {
      const inv = await api.get('/api/invoices');
      state.invoices = inv.invoices || [];
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

function renderRatesCard() {
  const s = state.session.settings;
  const me = state.session.me;
  const canManage = me && (me.isOwner || me.role === 'owner' || me.role === 'manager');
  return html`
    <section class="tk-sheet">
      <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('dollar', { size: 18 })} Trade Billing Rates</h2></div>
      <div class="tk-sheet__body">
        <form class="k-form" data-form="save-rates" novalidate>
          <div class="k-form__row">
            <label class="k-field">
              <span class="k-field__label">Standard Hourly Rate</span>
              <input class="k-input" type="number" step="0.01" min="0" name="hourly_rate" value="${(Number(s.hourly_rate_cents || 12500) / 100).toFixed(2)}" ${canManage ? '' : 'disabled'}>
            </label>
            <label class="k-field">
              <span class="k-field__label">Standard Call-out Fee</span>
              <input class="k-input" type="number" step="0.01" min="0" name="callout_fee" value="${(Number(s.callout_fee_cents || 8500) / 100).toFixed(2)}" ${canManage ? '' : 'disabled'}>
            </label>
          </div>
          ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary">Update Trade Rates</button></div>` : ''}
        </form>
      </div>
    </section>`;
}

function renderScreen() {
  if (state.route === '/') return renderDispatchView(state);
  if (state.route === '/job') return renderJobDetailView(state);
  if (state.route === '/visits') return renderVisitsView(state);
  if (state.route === '/parts') return renderPartsView(state);
  if (state.route === '/customers') return renderCustomersView(state);
  if (state.route === '/invoices') return renderInvoicesView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      extraSection: renderRatesCard(),
      exports: [
        { id: 'jobs', label: 'Export Jobs CSV' },
        { id: 'customers', label: 'Export Customers CSV' },
        { id: 'parts', label: 'Export Parts CSV' },
        { id: 'invoices', label: 'Export Invoices CSV' },
      ],
    });
  }
  return renderDispatchView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('pipe-wrench', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Plumbing &amp; Trades…</h1><p class="tk-door__sub">Connecting to your private field service database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Plumbing &amp; Trades could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Workspace not set up yet</h1><p class="tk-muted">Ask the business owner to complete initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Plumbing & Trades',
      tagline: 'Dispatch emergency and scheduled jobs, log on-site work orders, track trade parts requests, and raise 1-click Tax Invoices.',
      iconName: 'pipe-wrench',
      defaultBusiness: 'BlueLine Plumbing & Gas',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hourly labour rate</span><input class="k-input" type="number" step="1" min="0" name="hourly_rate" value="125"></label>
          <label class="k-field"><span class="k-field__label">Call-out fee</span><input class="k-input" type="number" step="1" min="0" name="callout_fee" value="85"></label>
        </div>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Plumbing & Trades',
      iconName: 'pipe-wrench',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[2], NAV[3], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  const renderNavItem = (item) => {
    const count = item.badge ? item.badge(counts) : 0;
    const active = state.route === item.path || (item.path === '/' && state.route === '/job');
    return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': active })}">
      ${icon(item.icon, { size: 18 })}
      <span>${item.label}</span>
      ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
    </a>`;
  };

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('pipe-wrench', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Field Service Ops'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Field Dispatch</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 3).map(renderNavItem)}
        </nav>
        <div class="tk-nav__group">Clients &amp; Billing</div>
        <nav class="tk-nav">
          ${NAV.slice(3).map(renderNavItem)}
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
          <div class="pl-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.emergencyJobs > 0 ? '#ef4444' : '#e6ad54'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="pl-ticker__pill">${icon('pipe-wrench', { size: 13 })} Dispatch (${counts.activeJobs || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${counts.emergencyJobs > 0 ? html`
              <button type="button" class="pl-ticker__pill pl-ticker__pill--alert" data-action="jump-emergency">
                ${icon('alert', { size: 13 })} ${counts.emergencyJobs} Emergency
              </button>` : ''}
            ${state.route !== '/parts' && counts.pendingParts > 0 ? html`
              <a href="#/parts" class="pl-ticker__pill pl-ticker__pill--copper">${icon('valve-gauge', { size: 13 })} Parts (${counts.pendingParts})</a>` : ''}
            ${state.route !== '/invoices' ? html`
              <a href="#/invoices" class="pl-ticker__pill">${icon('receipt', { size: 13 })} Invoices (${counts.unpaidInvoices || 0})</a>` : ''}
            <button type="button" class="k-icon-btn" data-action="refresh-screen" aria-label="Refresh">${icon('refresh', { size: 17 })}</button>
          </div>
        </header>
        <main class="tk-page">${renderScreen()}</main>
      </div>

      <nav class="tk-tabbar" aria-label="Mobile navigation">
        ${mobileTabs.map((item) => {
          const count = item.badge ? item.badge(counts) : 0;
          const active = state.route === item.path || (item.path === '/' && state.route === '/job');
          return html`<a href="#${item.path}" class="${cls('tk-tabbar__item', { 'is-on': active })}">
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
on(root, 'click', '[data-action="jump-emergency"]', () => {
  state.jobQuickFilter = 'Emergency';
  if (state.route !== '/') router.go('/');
  else draw();
});

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
    toast.success('Field service workspace ready!');
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

on(root, 'submit', 'form[data-form="save-rates"]', async (event, form) => {
  event.preventDefault();
  try {
    const res = await api.put('/api/settings', readForm(form));
    state.session.settings = res.settings;
    toast.success('Trade billing rates updated.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real records stay untouched.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (e, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Member approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (e, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (e, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'jobs') {
      const { jobs } = await api.get('/api/jobs');
      downloadCsv(`plumbing-jobs-${today()}.csv`, [
        { key: 'job_number', label: 'Job #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'job_type', label: 'Type' }, { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' }, { key: 'scheduled_date', label: 'Date' },
        { key: 'assigned_tech', label: 'Technician' }, { key: 'site_address', label: 'Site Address' },
        { key: 'logged_hours', label: 'Logged Hours' },
      ], jobs);
    } else if (kind === 'customers') {
      const { customers } = await api.get('/api/customers');
      downloadCsv(`plumbing-customers-${today()}.csv`, [
        { key: 'name', label: 'Customer' }, { key: 'customer_type', label: 'Type' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' },
      ], customers);
    } else if (kind === 'parts') {
      const { parts } = await api.get('/api/parts');
      downloadCsv(`plumbing-parts-${today()}.csv`, [
        { key: 'job_number', label: 'Job #' }, { key: 'item', label: 'Item' },
        { key: 'quantity', label: 'Qty' }, { label: 'Unit Cost', get: (r) => (r.unit_cost_cents / 100).toFixed(2) },
        { key: 'supplier', label: 'Supplier' }, { key: 'status', label: 'Status' },
      ], parts);
    } else if (kind === 'invoices') {
      const { invoices } = await api.get('/api/invoices');
      downloadCsv(`plumbing-invoices-${today()}.csv`, [
        { key: 'invoice_number', label: 'Invoice #' }, { key: 'job_number', label: 'Job #' },
        { key: 'customer_name', label: 'Customer' }, { key: 'issue_date', label: 'Issued' },
        { label: 'Labour', get: (r) => (r.labour_cents / 100).toFixed(2) },
        { label: 'Parts', get: (r) => (r.parts_cents / 100).toFixed(2) },
        { label: 'Tax', get: (r) => (r.tax_cents / 100).toFixed(2) },
        { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' },
      ], invoices);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/job': () => '/job',
  '/visits': () => '/visits',
  '/parts': () => '/parts',
  '/customers': () => '/customers',
  '/invoices': () => '/invoices',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

wireDispatchActions(root, state, {
  draw,
  loadScreen,
  navigate: (path, query) => {
    if (!query && typeof path === 'string' && path.includes('?')) {
      const cut = path.indexOf('?');
      const cleanPath = path.slice(0, cut);
      const parsed = {};
      for (const pair of path.slice(cut + 1).split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const k = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
        parsed[k] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      }
      router.go(cleanPath, parsed);
    } else {
      router.go(path, query);
    }
  },
});
wireRecordActions(root, state, { draw, loadScreen });

async function boot() {
  state.booting = true;
  state.bootError = '';
  draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') router.start();
    else draw();
  } catch (err) {
    state.booting = false;
    state.bootError = messageOf(err);
    draw();
  }
}

boot();
