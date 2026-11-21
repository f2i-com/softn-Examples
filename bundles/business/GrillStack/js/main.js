// GrillStack: startup, custom craft-diner icons, turnkey setup/join doors, cast-iron shell, routing & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderCounterView, wireCounterActions } from './views/counter.js';
import { renderKdsView, wireKdsActions } from './views/kds.js';
import { renderMenuView, wireMenuActions } from './views/menu.js';
import { renderStockView, renderShiftsView, renderCloseView, wireOpsActions } from './views/ops.js';

// Register bespoke burger-shop micro-icons for tiles & menu studio
addIcons({
  burger: '<path d="M4.5 11.5C4.5 7.6 7.8 5 12 5s7.5 2.6 7.5 6.5H4.5zM3.5 14.5h17M5 17.5h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>',
  fries: '<path d="M6.5 11h11l-1.3 9H7.8L6.5 11zM8 11V5.5M10.7 11V4M13.3 11V4.8M16 11V6"/>',
  shake: '<path d="M7.5 9h9l-1.2 11a1.4 1.4 0 0 1-1.4 1.2h-3.8A1.4 1.4 0 0 1 8.7 20L7.5 9zM6.5 9a5.5 5.5 0 0 1 11 0M14 3l-1.5 6"/>',
  combo: '<path d="M4 11.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5H4zM4 14.5h10M4.5 17.5h9a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5zM16 9h4.5l-.8 10h-2.9L16 9zM18.5 5l-.5 4"/>',
  sundae: '<path d="M6 12h12l-1.8 6.5a2 2 0 0 1-1.9 1.5H9.7a2 2 0 0 1-1.9-1.5L6 12zM8 12a4 4 0 0 1 8 0M12 5.5a1.5 1.5 0 1 0 0.01 0"/>',
});

export const BRAND_PRESETS = [
  { id: 'flame', label: 'Flame Red', accent: '#c8231a', soft: '#fde9e6', rail: '#13151a' },
  { id: 'mustard', label: 'Mustard Diner', accent: '#d97706', soft: '#fef3c7', rail: '#1c1711' },
  { id: 'charcoal', label: 'Charcoal Grill', accent: '#3f3f46', soft: '#e4e4e7', rail: '#101115' },
  { id: 'emerald', label: 'Emerald Patty', accent: '#15803d', soft: '#dcfce7', rail: '#101e16' },
];

export const ROLES = [
  { id: 'manager', label: 'Shift Manager' },
  { id: 'grill_crew', label: 'Grill Crew' },
  { id: 'front_counter', label: 'Front Counter' },
  { id: 'runner', label: 'Runner' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'flame',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  menu: [],
  orders: [],
  tickets: [],
  stock: [],
  shifts: [],
  closes: [],
  todayCloseSummary: null,
  team: [],
  // Live counter POS state
  posCat: 'All',
  posSearch: '',
  docket: [],
  docketType: 'Takeaway',
  docketPriority: 'Normal',
  docketCustomer: '',
  docketNotes: '',
  orderFilter: 'Active',
  orderSearch: '',
  // KDS & Ops filters
  kdsStation: 'All',
  kdsRushOnly: false,
  showReadyTickets: false,
  stockFilter: 'All',
  stockSearch: '',
  menuSearch: '',
  menuCatFilter: 'All',
  menuViewMode: 'board',
  // Live Till Calc & checklist on Close view
  closeCash: '',
  closeEftpos: '',
  closeDelivery: '',
  closeChecks: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'Order Counter', mobileLabel: 'Counter', icon: 'burger', badge: (c) => c?.activeOrders || 0 },
  { path: '/kds', label: 'Kitchen Pass', mobileLabel: 'Pass', icon: 'flame', badge: (c) => c?.openTickets || 0, alert: true },
  { path: '/menu', label: 'Menu & Builds', mobileLabel: 'Menu', icon: 'utensils' },
  { path: '/stock', label: 'Prep & Par Stock', mobileLabel: 'Prep', icon: 'box', badge: (c) => c?.lowStock || 0, alert: true },
  { path: '/shifts', label: 'Staff Shifts', mobileLabel: 'Shifts', icon: 'users' },
  { path: '/close', label: 'Daily Close', mobileLabel: 'Close', icon: 'clipboard' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'flame');
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
    } else if (path === '/kds') {
      const t = await api.get('/api/tickets', {
        station: '',
        includeReady: state.showReadyTickets ? 1 : 0,
      });
      state.tickets = t.tickets || [];
    } else if (path === '/menu') {
      const m = await api.get('/api/menu');
      state.menu = m.items || [];
    } else if (path === '/stock') {
      const st = await api.get('/api/stock');
      state.stock = st.items || [];
    } else if (path === '/shifts') {
      const sh = await api.get('/api/shifts');
      state.shifts = sh.shifts || [];
    } else if (path === '/close') {
      const cl = await api.get('/api/closes', { today: today() });
      state.closes = cl.closes || [];
      state.todayCloseSummary = cl.todaySummary || null;
      if (state.todayCloseSummary && state.closeCash === '' && state.closeEftpos === '' && state.closeDelivery === '') {
        const deliv = state.todayCloseSummary.deliveryPosCents || 0;
        const nonDeliv = Math.max(0, (state.todayCloseSummary.posCents || 0) - deliv);
        state.closeCash = (Math.round(nonDeliv * 0.25) / 100).toFixed(2);
        state.closeEftpos = ((nonDeliv - Math.round(nonDeliv * 0.25)) / 100).toFixed(2);
        state.closeDelivery = (deliv / 100).toFixed(2);
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
  if (state.route === '/') return renderCounterView(state);
  if (state.route === '/kds') return renderKdsView(state);
  if (state.route === '/menu') return renderMenuView(state);
  if (state.route === '/stock') return renderStockView(state);
  if (state.route === '/shifts') return renderShiftsView(state);
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
        { id: 'stock', label: 'Export Prep & Stock CSV' },
        { id: 'closes', label: 'Export Daily Closes CSV' },
      ],
    });
  }
  return renderCounterView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('flame', { size: 26 })}</div><div><h1 class="tk-door__title">Firing up GrillStack…</h1><p class="tk-door__sub">Heating the flat-top and syncing your burger shop ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">GrillStack could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">GrillStack is not set up yet</h1><p class="tk-muted">Ask the shop owner to open GrillStack first and complete the initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'GrillStack',
      tagline: 'Run the live burger order counter, route multi-station Grill/Fryer/Assembly tickets, track prep par levels, manage crew breaks, and reconcile the nightly close.',
      iconName: 'flame',
      defaultBusiness: 'Iron & Ember Smash Burgers',
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
      appName: 'GrillStack',
      iconName: 'flame',
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
          <span class="tk-brand__mark">${icon('flame', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Burger Shop Command'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Front &amp; Pass</div>
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
        <div class="tk-nav__group">Kitchen Ops</div>
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
          <div class="gs-ticker">
            <span class="tk-pulse-dot" style="--dot:#16a34a"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="gs-ticker__pill">${icon('burger', { size: 13 })} Order Counter</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/kds' && counts.rushTickets > 0 ? html`
              <a href="#/kds" class="gs-ticker__pill gs-ticker__pill--rush">${icon('zap', { size: 13 })} ${counts.rushTickets} Rush</a>` : ''}
            ${state.route !== '/' && state.route !== '/kds' ? html`
              <a href="#/kds" class="gs-ticker__pill">${icon('flame', { size: 13 })} Kitchen Pass (${counts.openTickets || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/menu" class="gs-ticker__pill">${icon('utensils', { size: 13 })} Menu &amp; Builds</a>
              <a href="#/shifts" class="gs-ticker__pill">${icon('users', { size: 13 })} Shifts</a>` : ''}
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
    toast.success('GrillStack is hot and ready for service!');
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
    toast.success('Sample burger shop data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real records stay intact.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try {
    await api.post('/api/sample/clear', { today: today() });
    toast.success('Sample data cleared.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Crew member approved.'); await loadScreen(); }
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
      downloadCsv(`grillstack-orders-${today()}.csv`, [
        { key: 'order_number', label: 'Order #' }, { key: 'order_day', label: 'Date' },
        { key: 'order_type', label: 'Type' }, { key: 'priority', label: 'Priority' },
        { key: 'customer_name', label: 'Customer' }, { key: 'items_summary', label: 'Items' },
        { key: 'status', label: 'Status' }, { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
      ], orders);
    } else if (kind === 'stock') {
      const { items } = await api.get('/api/stock');
      downloadCsv(`grillstack-prep-stock-${today()}.csv`, [
        { key: 'ingredient', label: 'Ingredient' }, { key: 'category', label: 'Category' },
        { key: 'opening_count', label: 'Opening' }, { key: 'current_count', label: 'Current' },
        { key: 'par_level', label: 'Par Level' }, { key: 'unit', label: 'Unit' }, { key: 'status', label: 'Status' },
      ], items);
    } else if (kind === 'closes') {
      const { closes } = await api.get('/api/closes');
      downloadCsv(`grillstack-closes-${today()}.csv`, [
        { key: 'close_date', label: 'Date' },
        { label: 'Cash', get: (r) => (r.cash_cents / 100).toFixed(2) },
        { label: 'EFTPOS', get: (r) => (r.eftpos_cents / 100).toFixed(2) },
        { label: 'Delivery', get: (r) => (r.delivery_cents / 100).toFixed(2) },
        { label: 'POS Orders', get: (r) => (r.pos_cents / 100).toFixed(2) },
        { key: 'manager', label: 'Manager' }, { key: 'status', label: 'Status' },
      ], closes);
    }
  } catch (err) { toastError(err); }
});

wireCounterActions(root, state, { draw, loadScreen });
wireKdsActions(root, state, { draw, loadScreen });
wireMenuActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/kds': () => '/kds',
  '/menu': () => '/menu',
  '/stock': () => '/stock',
  '/shifts': () => '/shifts',
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
