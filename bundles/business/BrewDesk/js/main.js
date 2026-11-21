// BrewDesk: start-up, custom cafe icons, turnkey setup/join gates, refined shell, routes & delegated actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderPosView, wirePosActions } from './views/pos.js';
import { renderBaristaView, wireBaristaActions } from './views/barista.js';
import { renderMenuView, wireMenuActions } from './views/menu.js';
import { renderStockView, renderRosterView, renderCloseView, wireOpsActions } from './views/ops.js';

// Register specialty cafe micro-icons for menu tiles, milk jugs & pastry items
addIcons({
  'iced-cup': '<path d="M6.5 8h11l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H9.2a1.5 1.5 0 0 1-1.5-1.3L6.5 8zM5.5 8h13M13.5 3 11 13M10 13h4"/>',
  'bean-bag': '<path d="M7 6.5h10l1.2 13a1.5 1.5 0 0 1-1.5 1.5H7.3a1.5 1.5 0 0 1-1.5-1.5L7 6.5zM8.5 6.5 7.5 3.5h9l-1 3"/><ellipse cx="12" cy="13.5" rx="2.8" ry="3.6" transform="rotate(-18 12 13.5)"/>',
  'milk-jug': '<path d="M7 7h8l1.5 12a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19L7 7zM15 9h2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H16M5 7l2-2h7"/>',
  pastry: '<path d="M4.5 15.5c0-4.2 3.4-7.5 7.5-7.5s7.5 3.3 7.5 7.5a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5zM9.5 8.5 8.5 17.5M14.5 8.5l1 9"/>',
});

export const BRAND_PRESETS = [
  { id: 'espresso', label: 'Espresso Roast', accent: '#8c3413', soft: '#f9ebe2', rail: '#1a110b' },
  { id: 'matcha', label: 'Ceremonial Matcha', accent: '#276749', soft: '#e0f2e9', rail: '#122119' },
  { id: 'midnight', label: 'Midnight Roaster', accent: '#1e3a5f', soft: '#e2ebf6', rail: '#111a29' },
  { id: 'terracotta', label: 'Terracotta Cup', accent: '#b45309', soft: '#fef3c7', rail: '#26180f' },
];

export const ROLES = [
  { id: 'manager', label: 'Shift Manager' },
  { id: 'barista', label: 'Barista' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'front_counter', label: 'Front Counter' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'espresso',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain caches
  menu: [],
  orders: [],
  tickets: [],
  stock: [],
  shifts: [],
  closes: [],
  todayCloseSummary: null,
  team: [],
  // Live POS docket & filters
  posCat: 'All',
  posSearch: '',
  docket: [],
  docketType: 'Takeaway',
  docketTable: '',
  docketCustomer: '',
  docketNotes: '',
  docketPayment: 'Card',
  orderFilter: 'Active',
  orderSearch: '',
  // Barista KDS filters
  showReadyTickets: false,
  baristaMilkFilter: 'All',
  // Menu studio filters
  menuSearch: '',
  menuCat: 'All',
  menuViewMode: 'board',
  // Stock & Close states
  stockFilter: 'All',
  stockSearch: '',
  closeDraftRegister: null,
  closeCash: '',
  closeEftpos: '',
  closeChecks: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'Order Pad', mobileLabel: 'Orders', icon: 'coffee', badge: (c) => c?.activeOrders || 0 },
  { path: '/barista', label: 'Barista Queue', mobileLabel: 'Barista', icon: 'flame', badge: (c) => c?.queuedTickets || 0, alert: true },
  { path: '/menu', label: 'Menu Board', mobileLabel: 'Menu', icon: 'utensils' },
  { path: '/stock', label: 'Stock & Par', mobileLabel: 'Stock', icon: 'box', badge: (c) => c?.lowStock || 0, alert: true },
  { path: '/roster', label: 'Shift Roster', mobileLabel: 'Roster', icon: 'calendar' },
  { path: '/close', label: 'Daily Close', mobileLabel: 'Close', icon: 'clipboard' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'espresso');
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
      const [m, o] = await Promise.all([api.get('/api/menu', { onlyActive: 1 }), api.get('/api/orders', { day: today() })]);
      state.menu = m.items || [];
      state.orders = o.orders || [];
    } else if (path === '/barista') {
      const t = await api.get('/api/tickets', { includeReady: state.showReadyTickets ? 1 : 0 });
      state.tickets = t.tickets || [];
    } else if (path === '/menu') {
      const m = await api.get('/api/menu');
      state.menu = m.items || [];
    } else if (path === '/stock') {
      const st = await api.get('/api/stock');
      state.stock = st.items || [];
    } else if (path === '/roster') {
      const sh = await api.get('/api/shifts');
      state.shifts = sh.shifts || [];
    } else if (path === '/close') {
      const cl = await api.get('/api/closes', { today: today() });
      state.closes = cl.closes || [];
      state.todayCloseSummary = cl.todaySummary || null;
      if (state.closeDraftRegister == null && cl.todaySummary) {
        state.closeDraftRegister = (cl.todaySummary.posCents / 100).toFixed(2);
      }
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
  if (state.route === '/') return renderPosView(state);
  if (state.route === '/barista') return renderBaristaView(state);
  if (state.route === '/menu') return renderMenuView(state);
  if (state.route === '/stock') return renderStockView(state);
  if (state.route === '/roster') return renderRosterView(state);
  if (state.route === '/close') return renderCloseView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'orders', label: 'Export Orders CSV' },
        { id: 'stock', label: 'Export Stock CSV' },
        { id: 'closes', label: 'Export Closeouts CSV' },
      ],
    });
  }
  return renderPosView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('coffee', { size: 26 })}</div><div><h1 class="tk-door__title">Opening BrewDesk…</h1><p class="tk-door__sub">Dialing in your espresso bar and private cafe ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">BrewDesk could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">BrewDesk is not set up yet</h1><p class="tk-muted">Ask the cafe owner to open BrewDesk first and finish initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'BrewDesk',
      tagline: 'Take dine-in & takeaway orders, run the espresso bar queue, manage beans & milk par stock, roster shifts, and close the till.',
      iconName: 'coffee',
      defaultBusiness: 'Sunbeam Espresso Bar',
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
      appName: 'BrewDesk',
      iconName: 'coffee',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4], { path: '/settings', label: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('coffee', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Cafe & Barista Ops'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Service Desk</div>
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
        <div class="tk-nav__group">Back of House</div>
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
          <div class="bd-ticker">
            <span class="tk-pulse-dot" style="--dot:#16a34a"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="bd-ticker__pill">${icon('coffee', { size: 13 })} Order Pad</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${counts.lowStock > 0 && state.route !== '/' && state.route !== '/stock' ? html`
              <a href="#/stock" class="bd-ticker__pill bd-ticker__pill--alert">${icon('box', { size: 13 })} ${counts.lowStock} Low Stock</a>` : ''}
            ${state.route !== '/' && state.route !== '/barista' ? html`
              <a href="#/barista" class="bd-ticker__pill">${icon('flame', { size: 13 })} Espresso Bar (${counts.queuedTickets || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/menu" class="bd-ticker__pill">${icon('utensils', { size: 13 })} Menu Board</a>
              <a href="#/roster" class="bd-ticker__pill">${icon('calendar', { size: 13 })} Roster</a>` : ''}
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
    toast.success('BrewDesk is live! Welcome to your cafe desk.');
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
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample cafe data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real records stay untouched.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'orders') {
      const { orders } = await api.get('/api/orders');
      downloadCsv(`brewdesk-orders-${today()}.csv`, [
        { key: 'order_number', label: 'Order #' }, { key: 'order_day', label: 'Date' },
        { key: 'order_type', label: 'Type' }, { key: 'table_number', label: 'Table' },
        { key: 'customer_name', label: 'Customer' }, { key: 'items_summary', label: 'Items' },
        { key: 'status', label: 'Status' }, { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
      ], orders);
    } else if (kind === 'stock') {
      const { items } = await api.get('/api/stock');
      downloadCsv(`brewdesk-stock-${today()}.csv`, [
        { key: 'item_name', label: 'Item' }, { key: 'category', label: 'Category' },
        { key: 'current_qty', label: 'Current Qty' }, { key: 'par_level', label: 'Par Level' },
        { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' }, { key: 'supplier', label: 'Supplier' },
      ], items);
    } else if (kind === 'closes') {
      const { closes } = await api.get('/api/closes');
      downloadCsv(`brewdesk-closes-${today()}.csv`, [
        { key: 'close_date', label: 'Date' }, { label: 'Register', get: (r) => (r.register_cents / 100).toFixed(2) },
        { label: 'POS Sales', get: (r) => (r.pos_cents / 100).toFixed(2) }, { label: 'Tips', get: (r) => (r.tips_cents / 100).toFixed(2) },
        { key: 'beans_used', label: 'Beans (kg)' }, { key: 'milk_used', label: 'Milk (L)' }, { key: 'closed_by', label: 'Closed By' },
      ], closes);
    }
  } catch (err) { toastError(err); }
});

wirePosActions(root, state, { draw, loadScreen });
wireBaristaActions(root, state, { draw, loadScreen });
wireMenuActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/barista': () => '/barista',
  '/menu': () => '/menu',
  '/stock': () => '/stock',
  '/roster': () => '/roster',
  '/close': () => '/close',
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
