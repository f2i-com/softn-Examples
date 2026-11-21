// Mechanic Workshop — Cast-Iron & Cobalt/Amber Torque shell, bespoke micro-icons, grouped nav, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderBaysView, renderCardWorkbenchView, wireBayActions } from './views/bays.js';
import { renderGarageView, renderPartsLogView, renderWorkshopInvoicesView, wireGarageActions } from './views/garage.js';

// Register bespoke automotive workshop micro-icons
addIcons({
  'car-hoist': '<path d="M4 20V5M20 20V5M2.5 20h3M18.5 20h3M4 13.5h16M7 13.5l1.3-3.6A1.5 1.5 0 0 1 9.7 9h4.6a1.5 1.5 0 0 1 1.4.9l1.3 3.6M8.5 13.5v1.5M15.5 13.5v1.5"/>',
  'torque-wrench': '<path d="M6.5 17.5 15 9a3.5 3.5 0 1 0-4-4L9 7l2 2-2 2-2-2-1.8 1.8a3.5 3.5 0 0 0 1.3 6.7z"/><path d="M14.5 14.5 19.5 19.5M16 12.5l2.5 2.5"/>',
  'engine-diag': '<path d="M7 7h8l2 2h3v7h-3l-2 2H7l-2-2H3V9h2l2-2zM9 4h6M12 4v3M7.5 12.5h2l1.2-2.2 1.8 4.4 1.3-2.2h2.7"/>',
});

export const BRAND_PRESETS = [
  { id: 'safety-orange', label: 'Torque Amber', accent: '#e04f16', soft: '#ffedd5', rail: '#11151e' },
  { id: 'workshop-red', label: 'Workshop Red', accent: '#dc2626', soft: '#fee2e2', rail: '#1e1316' },
  { id: 'hydraulic-blue', label: 'Cobalt Diag', accent: '#2563eb', soft: '#dbeafe', rail: '#0e192d' },
  { id: 'gunmetal-steel', label: 'Cast Iron', accent: '#475569', soft: '#e2e8f0', rail: '#161a21' },
];

export const ROLES = [
  { id: 'manager', label: 'Workshop Manager' },
  { id: 'service_advisor', label: 'Service Advisor' },
  { id: 'mechanic', label: 'Mechanic' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'safety-orange',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  cards: [],
  cardDetail: null,
  customers: [],
  vehicles: [],
  parts: [],
  invoices: [],
  team: [],
  bayLayout: 'deck',
  cardPriority: 'All',
  cardStageFilter: 'All',
  cardSearch: '',
  showCollected: false,
  garageTab: 'vehicles',
  garageSearch: '',
  partsSearch: '',
  invStatus: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Bay Pipeline', mobileLabel: 'Bays', icon: 'car-hoist', badge: (c) => c?.inShop || 0 },
  { path: '/parts', label: 'Parts Used', mobileLabel: 'Parts', icon: 'torque-wrench' },
  { path: '/garage', label: 'Garage & Clients', mobileLabel: 'Garage', icon: 'car', badge: (c) => c?.vehicleCount || 0 },
  { path: '/invoices', label: 'Invoices', mobileLabel: 'Invoices', icon: 'receipt', badge: (c) => c?.unpaidInvoices || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'safety-orange');
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
      const [c, v, inv] = await Promise.all([api.get('/api/cards'), api.get('/api/vehicles'), api.get('/api/invoices')]);
      state.cards = c.cards || [];
      state.vehicles = v.vehicles || [];
      state.invoices = inv.invoices || [];
    } else if (path === '/card') {
      const id = Number(state.query.id);
      state.cardDetail = id ? await api.get('/api/cards/detail', { id }) : null;
    } else if (path === '/garage') {
      const [v, c] = await Promise.all([api.get('/api/vehicles'), api.get('/api/customers')]);
      state.vehicles = v.vehicles || [];
      state.customers = c.customers || [];
    } else if (path === '/parts') {
      const p = await api.get('/api/parts');
      state.parts = p.parts || [];
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

function renderWorkshopRateCard() {
  const s = state.session.settings;
  const me = state.session.me;
  const canManage = me && (me.isOwner || me.role === 'owner' || me.role === 'manager');
  return html`
    <section class="tk-sheet">
      <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('dollar', { size: 18 })} Workshop Labour Rate</h2></div>
      <div class="tk-sheet__body">
        <form class="k-form" data-form="save-rate" novalidate>
          <label class="k-field">
            <span class="k-field__label">Standard Mechanic Labour Rate (per hour)</span>
            <input class="k-input" type="number" step="0.01" min="0" name="workshop_rate" value="${(Number(s.workshop_rate_cents || 13500) / 100).toFixed(2)}" ${canManage ? '' : 'disabled'}>
          </label>
          ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary">Save Labour Rate</button></div>` : ''}
        </form>
      </div>
    </section>`;
}

function renderScreen() {
  if (state.route === '/') return renderBaysView(state);
  if (state.route === '/card') return renderCardWorkbenchView(state);
  if (state.route === '/garage') return renderGarageView(state);
  if (state.route === '/parts') return renderPartsLogView(state);
  if (state.route === '/invoices') return renderWorkshopInvoicesView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      extraSection: renderWorkshopRateCard(),
      exports: [
        { id: 'cards', label: 'Export Job Cards CSV' },
        { id: 'vehicles', label: 'Export Vehicles CSV' },
        { id: 'parts', label: 'Export Parts Used CSV' },
        { id: 'invoices', label: 'Export Invoices CSV' },
      ],
    });
  }
  return renderBaysView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('car-hoist', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Mechanic Workshop…</h1><p class="tk-door__sub">Connecting to your private garage database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Workshop could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Workshop not set up yet</h1><p class="tk-muted">Ask the workshop owner to complete setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Mechanic Workshop',
      tagline: 'Run workshop bays, manage customer vehicles with rego plates & VINs, log fitted parts and generate 1-click workshop invoices.',
      iconName: 'car-hoist',
      defaultBusiness: 'Apex Auto & Mechanical',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <label class="k-field"><span class="k-field__label">Standard Workshop Hourly Rate</span>
          <input class="k-input" type="number" step="1" min="0" name="workshop_rate" value="135">
        </label>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Mechanic Workshop',
      iconName: 'car-hoist',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[2], NAV[1], NAV[3], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  const renderNavItem = (item) => {
    const count = item.badge ? item.badge(counts) : 0;
    const active = state.route === item.path || (item.path === '/' && state.route === '/card');
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
          <span class="tk-brand__mark">${icon('car-hoist', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Auto Workshop & Bay Ops'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Workshop Floor</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 2).map(renderNavItem)}
        </nav>
        <div class="tk-nav__group">Garage &amp; Counter</div>
        <nav class="tk-nav">
          ${NAV.slice(2).map(renderNavItem)}
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
          <div class="mw-ticker">
            <span class="tk-pulse-dot" style="--dot:#f59e0b"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="mw-ticker__pill">${icon('car-hoist', { size: 13 })} Bays (${counts.inShop || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${counts.waitingParts > 0 ? html`
              <button type="button" class="mw-ticker__pill mw-ticker__pill--alert" data-action="jump-hold">
                ${icon('alert', { size: 13 })} ${counts.waitingParts} Hold
              </button>` : ''}
            ${state.route !== '/garage' ? html`
              <a href="#/garage" class="mw-ticker__pill mw-ticker__pill--cobalt">${icon('car', { size: 13 })} Garage (${counts.vehicleCount || 0})</a>` : ''}
            ${state.route !== '/invoices' ? html`
              <a href="#/invoices" class="mw-ticker__pill">${icon('receipt', { size: 13 })} Invoices (${counts.unpaidInvoices || 0})</a>` : ''}
            <button type="button" class="k-icon-btn" data-action="refresh-screen" aria-label="Refresh">${icon('refresh', { size: 17 })}</button>
          </div>
        </header>
        <main class="tk-page">${renderScreen()}</main>
      </div>

      <nav class="tk-tabbar" aria-label="Mobile navigation">
        ${mobileTabs.map((item) => {
          const count = item.badge ? item.badge(counts) : 0;
          const active = state.route === item.path || (item.path === '/' && state.route === '/card');
          return html`<a href="#${item.path}" class="${cls('tk-tabbar__item', { 'is-on': active })}">
            ${icon(item.icon, { size: 20 })}
            <span>${item.mobileLabel || item.label}</span>
            ${count > 0 ? html`<span class="tk-tabbar__dot">${count}</span>` : ''}
          </a>`;
        })}
      </nav>
    </div>`);
}

on(root, 'click', '[data-action="retry-boot"]', () => boot());
on(root, 'click', '[data-action="refresh-session"]', () => boot());
on(root, 'click', '[data-action="refresh-screen"]', () => loadScreen());
on(root, 'click', '[data-action="jump-hold"]', () => {
  state.cardStageFilter = 'Waiting Parts';
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
    toast.success('Workshop bay desk is ready!');
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
    toast.success('Workshop settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'submit', 'form[data-form="save-rate"]', async (event, form) => {
  event.preventDefault();
  try {
    const res = await api.put('/api/settings', readForm(form));
    state.session.settings = res.settings;
    toast.success('Workshop hourly rate saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample garage data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample vehicles, job cards and invoices. Your own records remain untouched.', confirmLabel: 'Clear sample data' });
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this workshop.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'cards') {
      const { cards } = await api.get('/api/cards');
      downloadCsv(`workshop-job-cards-${today()}.csv`, [
        { key: 'card_number', label: 'Card #' }, { key: 'registration', label: 'Rego' },
        { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'customer_name', label: 'Customer' },
        { key: 'bay_number', label: 'Bay' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' },
        { key: 'technician', label: 'Mechanic' }, { key: 'labour_hours', label: 'Hours' },
      ], cards);
    } else if (kind === 'vehicles') {
      const { vehicles } = await api.get('/api/vehicles');
      downloadCsv(`workshop-vehicles-${today()}.csv`, [
        { key: 'registration', label: 'Rego' }, { key: 'year', label: 'Year' },
        { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' },
        { key: 'fuel', label: 'Fuel' }, { key: 'odometer', label: 'Odometer (km)' },
        { key: 'vin', label: 'VIN' }, { key: 'customer_name', label: 'Owner' },
      ], vehicles);
    } else if (kind === 'parts') {
      const { parts } = await api.get('/api/parts');
      downloadCsv(`workshop-parts-${today()}.csv`, [
        { key: 'card_number', label: 'Card #' }, { key: 'registration', label: 'Rego' },
        { key: 'part_name', label: 'Part' }, { key: 'part_number', label: 'Part #' },
        { key: 'quantity', label: 'Qty' }, { label: 'Unit Cost', get: (r) => (r.unit_cost_cents / 100).toFixed(2) },
        { key: 'supplier', label: 'Supplier' },
      ], parts);
    } else if (kind === 'invoices') {
      const { invoices } = await api.get('/api/invoices');
      downloadCsv(`workshop-invoices-${today()}.csv`, [
        { key: 'invoice_number', label: 'Invoice #' }, { key: 'card_number', label: 'Card #' },
        { key: 'registration', label: 'Rego' }, { key: 'customer_name', label: 'Customer' },
        { key: 'issue_date', label: 'Issued' },
        { label: 'Labour', get: (r) => (r.labour_cents / 100).toFixed(2) },
        { label: 'Parts', get: (r) => (r.parts_cents / 100).toFixed(2) },
        { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' },
      ], invoices);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/card': () => '/card',
  '/garage': () => '/garage',
  '/parts': () => '/parts',
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

wireBayActions(root, state, { draw, loadScreen, navigate: (path, query) => router.go(path, query) });
wireGarageActions(root, state, { draw, loadScreen });

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
