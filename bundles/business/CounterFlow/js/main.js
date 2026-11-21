// CounterFlow: start-up, bespoke retail micro-icons, grouped nav, calm topbar ticker, turnkey doors & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderTodayView, wireTodayActions } from './views/today.js';
import { renderProductsView, wireProductsActions } from './views/products.js';
import { renderMovementsView, wireMovementsActions } from './views/movements.js';
import { renderTasksView, wireTasksActions } from './views/tasks.js';
import { renderReturnsView, renderSuppliersView, renderStaffView, wirePeopleActions } from './views/people.js';

// Register bespoke boutique retail micro-icons
addIcons({
  'shop-awning': '<path d="M3.5 9.5 5 4.5h14l1.5 5a2.4 2.4 0 0 1-4.6 0.5 2.4 2.4 0 0 1-3.9 0 2.4 2.4 0 0 1-3.9 0 2.4 2.4 0 0 1-4.6-0.5zM5 12v8h14v-8M9.5 20v-4.5a2.5 2.5 0 0 1 5 0V20"/>',
  'price-tag': '<path d="M4 11.8V5a1 1 0 0 1 1-1h6.8l8.2 8.2a1.2 1.2 0 0 1 0 1.7l-6.1 6.1a1.2 1.2 0 0 1-1.7 0L4 11.8z"/><circle cx="8.5" cy="8.5" r="1.4"/><path d="M12 12l4 4"/>',
  'till-drawer': '<rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5"/><path d="M5.5 13.5 7 6.5h10l1.5 7M9.5 16.8h5M8.5 9.5h7"/>',
});

export const BRAND_PRESETS = [
  { id: 'terracotta', label: 'Boutique Terracotta', accent: '#c84b24', soft: '#fdebe4', rail: '#1a1716' },
  { id: 'olive-linen', label: 'Olive Linen', accent: '#4d6b3c', soft: '#e6efe0', rail: '#1c2418' },
  { id: 'ink-slate', label: 'Ink Slate', accent: '#334155', soft: '#e2e8f0', rail: '#111827' },
  { id: 'cobalt-shop', label: 'Cobalt Studio', accent: '#1d4ed8', soft: '#dbeafe', rail: '#121c30' },
];

export const ROLES = [
  { id: 'manager', label: 'Store Manager' },
  { id: 'sales_assistant', label: 'Sales Assistant' },
  { id: 'visual_merchandiser', label: 'Visual Merchandiser' },
  { id: 'online_orders', label: 'Online Orders' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'terracotta',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  overview: null,
  products: [],
  valuation: { units: 0, cost_cents: 0, retail_cents: 0, margin_pct: 0 },
  movements: [],
  tasks: [],
  suppliers: [],
  staff: [],
  returns: [],
  team: [],
  // Filters
  prodSearch: '',
  prodCat: 'All',
  prodStatus: 'All',
  prodViewMode: 'cards',
  moveType: 'All',
  moveSearch: '',
  taskRoutine: 'All',
  taskStatus: 'Open',
  retStatus: 'All',
  retType: 'All',
};

const NAV = [
  { path: '/', label: 'Store Today', mobileLabel: 'Today', icon: 'shop-awning' },
  { path: '/products', label: 'Products & Stock', mobileLabel: 'Stock', icon: 'price-tag', badge: (c) => c?.lowStock || 0, alert: true },
  { path: '/tasks', label: 'Floor Tasks', mobileLabel: 'Tasks', icon: 'check-square', badge: (c) => c?.openTasks || 0 },
  { path: '/returns', label: 'Returns Desk', mobileLabel: 'Returns', icon: 'refresh', badge: (c) => c?.openReturns || 0, alert: true },
  { path: '/movements', label: 'Stock Ledger', mobileLabel: 'Ledger', icon: 'layers' },
  { path: '/suppliers', label: 'Suppliers', mobileLabel: 'Suppliers', icon: 'truck' },
  { path: '/staff', label: 'Staff Roster', mobileLabel: 'Roster', icon: 'users' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'terracotta');
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
      const [ov, st, tk, pr] = await Promise.all([
        api.get('/api/overview', { today: today() }),
        api.get('/api/staff'),
        api.get('/api/tasks'),
        api.get('/api/products'),
      ]);
      state.overview = ov;
      state.staff = st.staff || [];
      state.tasks = tk.tasks || [];
      state.products = pr.products || [];
    } else if (path === '/products') {
      const [pr, sup, st] = await Promise.all([
        api.get('/api/products'),
        api.get('/api/suppliers'),
        api.get('/api/staff'),
      ]);
      state.products = pr.products || [];
      state.valuation = pr.valuation || { units: 0, cost_cents: 0, retail_cents: 0, margin_pct: 0 };
      state.suppliers = sup.suppliers || [];
      state.staff = st.staff || [];
    } else if (path === '/movements') {
      const [mv, pr, st] = await Promise.all([
        api.get('/api/movements'),
        api.get('/api/products'),
        api.get('/api/staff'),
      ]);
      state.movements = mv.movements || [];
      state.products = pr.products || [];
      state.staff = st.staff || [];
    } else if (path === '/tasks') {
      const [tk, st] = await Promise.all([
        api.get('/api/tasks'),
        api.get('/api/staff'),
      ]);
      state.tasks = tk.tasks || [];
      state.staff = st.staff || [];
    } else if (path === '/returns') {
      const [rt, pr] = await Promise.all([
        api.get('/api/returns'),
        api.get('/api/products'),
      ]);
      state.returns = rt.returns || [];
      state.products = pr.products || [];
    } else if (path === '/suppliers') {
      const [sup, pr] = await Promise.all([
        api.get('/api/suppliers'),
        api.get('/api/products'),
      ]);
      state.suppliers = sup.suppliers || [];
      state.products = pr.products || [];
    } else if (path === '/staff') {
      const st = await api.get('/api/staff');
      state.staff = st.staff || [];
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
  if (state.route === '/') return renderTodayView(state);
  if (state.route === '/products') return renderProductsView(state);
  if (state.route === '/movements') return renderMovementsView(state);
  if (state.route === '/tasks') return renderTasksView(state);
  if (state.route === '/returns') return renderReturnsView(state);
  if (state.route === '/suppliers') return renderSuppliersView(state);
  if (state.route === '/staff') return renderStaffView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'products', label: 'Export Products CSV' },
        { id: 'movements', label: 'Export Stock Ledger CSV' },
        { id: 'returns', label: 'Export Returns CSV' },
        { id: 'tasks', label: 'Export Floor Tasks CSV' },
      ],
    });
  }
  return renderTodayView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('shop-awning', { size: 26 })}</div><div><h1 class="tk-door__title">Opening CounterFlow…</h1><p class="tk-door__sub">Loading your retail store operations hub.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CounterFlow could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">CounterFlow is not set up yet</h1><p class="tk-muted">Ask the store owner to open CounterFlow first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'CounterFlow',
      tagline: 'Manage your product catalogue, gross margins, instant stock adjustments, floor tasks, suppliers, roster and customer returns around the till.',
      iconName: 'shop-awning',
      defaultBusiness: 'Loom & Clay Boutique',
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
      appName: 'CounterFlow',
      iconName: 'shop-awning',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[3], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('shop-awning', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Retail Store Operations'}</span>
          </span>
        </a>

        <div class="tk-nav__group">Shop Floor</div>
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

        <div class="tk-nav__group">Backroom &amp; Team</div>
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
          <div class="cf-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.lowStock > 0 ? '#ec6e43' : '#10b981'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="cf-ticker__pill">${icon('shop-awning', { size: 13 })} Store Today</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/products' && counts.lowStock > 0 ? html`
              <a href="#/products?status=low" class="cf-ticker__pill cf-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.lowStock} Low Stock</a>` : ''}
            ${state.route !== '/returns' && counts.openReturns > 0 ? html`
              <a href="#/returns" class="cf-ticker__pill cf-ticker__pill--alert">${icon('refresh', { size: 13 })} ${counts.openReturns} Return${counts.openReturns === 1 ? '' : 's'}</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/movements" class="cf-ticker__pill">${icon('layers', { size: 13 })} Stock Ledger</a>
              <a href="#/suppliers" class="cf-ticker__pill">${icon('truck', { size: 13 })} Suppliers</a>` : ''}
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
    toast.success('CounterFlow is ready for the shop floor!');
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
    toast.success('Sample boutique data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample while keeping your real products, tasks and ledger entries untouched.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'products') {
      const { products } = await api.get('/api/products');
      downloadCsv(`counterflow-products-${today()}.csv`, [
        { key: 'sku', label: 'SKU' }, { key: 'product_name', label: 'Product' },
        { key: 'category', label: 'Category' }, { key: 'supplier_name', label: 'Supplier' },
        { label: 'Cost', get: (r) => (r.cost_cents / 100).toFixed(2) },
        { label: 'Retail', get: (r) => (r.retail_cents / 100).toFixed(2) },
        { label: 'Margin %', get: (r) => r.margin_pct },
        { key: 'current_stock', label: 'Stock' }, { key: 'reorder_point', label: 'Reorder Point' },
        { key: 'status', label: 'Status' },
      ], products);
    } else if (kind === 'movements') {
      const { movements } = await api.get('/api/movements');
      downloadCsv(`counterflow-stock-ledger-${today()}.csv`, [
        { key: 'move_date', label: 'Date' }, { key: 'sku', label: 'SKU' },
        { key: 'product_name', label: 'Product' }, { key: 'movement_type', label: 'Type' },
        { key: 'quantity_change', label: 'Qty Change' }, { key: 'stock_after', label: 'Stock After' },
        { key: 'staff_name', label: 'Staff' }, { key: 'reference', label: 'Reference' },
        { key: 'reason', label: 'Reason' },
      ], movements);
    } else if (kind === 'returns') {
      const { returns } = await api.get('/api/returns');
      downloadCsv(`counterflow-returns-${today()}.csv`, [
        { key: 'issue_date', label: 'Date' }, { key: 'customer_name', label: 'Customer' },
        { key: 'sku', label: 'SKU' }, { key: 'product_name', label: 'Product' },
        { key: 'issue_type', label: 'Issue' }, { key: 'resolution_type', label: 'Resolution' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
      ], returns);
    } else if (kind === 'tasks') {
      const { tasks } = await api.get('/api/tasks');
      downloadCsv(`counterflow-tasks-${today()}.csv`, [
        { key: 'task_title', label: 'Task' }, { key: 'routine', label: 'Routine' },
        { key: 'area', label: 'Area' }, { key: 'priority', label: 'Priority' },
        { key: 'assigned_name', label: 'Assigned To' }, { key: 'due_date', label: 'Due Date' },
        { key: 'status', label: 'Status' },
      ], tasks);
    }
  } catch (err) { toastError(err); }
});

wireTodayActions(root, state, { draw, loadScreen });
wireProductsActions(root, state, { draw, loadScreen });
wireMovementsActions(root, state, { draw, loadScreen });
wireTasksActions(root, state, { draw, loadScreen });
wirePeopleActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/products': () => '/products',
  '/movements': () => '/movements',
  '/tasks': () => '/tasks',
  '/returns': () => '/returns',
  '/suppliers': () => '/suppliers',
  '/staff': () => '/staff',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query || {};
    if (state.route === '/products' && state.query.status === 'low') {
      state.prodStatus = 'Low stock';
    }
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
