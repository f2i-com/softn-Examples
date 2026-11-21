// Inventory & POs: startup, warehouse micro-icons, grouped nav, calm topbar ticker, turnkey doors & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, addDays, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderTodayView, wireTodayActions } from './views/today.js';
import { renderPosView, wirePosActions, openDraftPoFor } from './views/pos.js';
import { renderProductsView, wireProductsActions } from './views/products.js';
import { renderSuppliersView, renderMovementsView, wireOpsActions } from './views/ops.js';

// Register bespoke warehouse & supply-chain micro-icons
addIcons({
  'pallet-rack': '<path d="M4 20V4M20 20V4M4 11h16M4 17h16M7 11V7h4v4M13 11V7h4v4M7 17v-3h5v3M14 17v-3h3v3"/>',
  'barcode-scan': '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 8v8M10 8v8M13.5 8v8M17 8v8"/>',
  'dock-receive': '<path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M4 17h16v3H4zM7 20v-3M17 20v-3"/>',
});

export const BRAND_PRESETS = [
  { id: 'warehouse-steel', label: 'Deep Cobalt Steel', accent: '#1b5299', soft: '#e2eefc', rail: '#0b1629' },
  { id: 'freight-blue', label: 'Freight Cobalt', accent: '#1d4ed8', soft: '#dbeafe', rail: '#0f172a' },
  { id: 'crate-amber', label: 'Warehouse Amber', accent: '#b45309', soft: '#fef3c7', rail: '#18181b' },
  { id: 'logistics-emerald', label: 'Logistics Emerald', accent: '#047857', soft: '#d1fae5', rail: '#11221c' },
];

export const ROLES = [
  { id: 'manager', label: 'Inventory Manager' },
  { id: 'purchasing_officer', label: 'Purchasing Officer' },
  { id: 'warehouse_staff', label: 'Warehouse Staff' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'warehouse-steel',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  overview: null,
  products: [],
  suppliers: [],
  orders: [],
  activePo: null,
  movements: [],
  team: [],
  // PO Builder state
  poBuilderOpen: false,
  poDraft: {
    supplier_id: '',
    order_date: today(),
    expected_date: addDays(today(), 7),
    notes: '',
    lines: [],
  },
  // Filters
  poStatusFilter: 'All',
  prodSearch: '',
  prodCat: 'All',
  prodSupplier: 'All',
  prodOnlyLow: false,
  prodViewMode: 'cards',
  moveType: 'All',
  moveSearch: '',
};

const NAV = [
  { path: '/', label: 'Warehouse Today', mobileLabel: 'Today', icon: 'pallet-rack' },
  { path: '/products', label: 'Products & Stock', mobileLabel: 'Stock', icon: 'barcode-scan', badge: (c) => c?.lowStock || 0, alert: true },
  { path: '/pos', label: 'Purchase Orders', mobileLabel: 'Orders', icon: 'clipboard', badge: (c) => c?.openPOs || 0 },
  { path: '/suppliers', label: 'Suppliers', mobileLabel: 'Vendors', icon: 'truck' },
  { path: '/movements', label: 'Stock Ledger', mobileLabel: 'Ledger', icon: 'layers' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'warehouse-steel');
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
      const ov = await api.get('/api/overview', { today: today() });
      state.overview = ov;
    } else if (path === '/pos') {
      const [poRes, supRes, prodRes] = await Promise.all([
        api.get('/api/pos'),
        api.get('/api/suppliers'),
        api.get('/api/products'),
      ]);
      state.orders = poRes.orders || [];
      state.suppliers = supRes.suppliers || [];
      state.products = prodRes.products || [];
      if (state.query.draftProduct || state.query.draftSupplier) {
        openDraftPoFor(state, {
          productId: state.query.draftProduct ? Number(state.query.draftProduct) : null,
          supplierId: state.query.draftSupplier ? Number(state.query.draftSupplier) : null,
        });
        state.query = {};
      } else if (state.query.openPo) {
        const det = await api.get('/api/pos/detail', { id: Number(state.query.openPo) });
        state.activePo = det.order || null;
        state.query = {};
      } else if (state.activePo) {
        const still = state.orders.find((o) => o.id === state.activePo.id);
        if (still) {
          const det = await api.get('/api/pos/detail', { id: still.id });
          state.activePo = det.order || null;
        } else {
          state.activePo = null;
        }
      }
    } else if (path === '/products') {
      const [pr, sup] = await Promise.all([api.get('/api/products'), api.get('/api/suppliers')]);
      state.products = pr.products || [];
      state.suppliers = sup.suppliers || [];
    } else if (path === '/suppliers') {
      const [sup, pr] = await Promise.all([api.get('/api/suppliers'), api.get('/api/products')]);
      state.suppliers = sup.suppliers || [];
      state.products = pr.products || [];
    } else if (path === '/movements') {
      const [mv, pr] = await Promise.all([api.get('/api/movements'), api.get('/api/products')]);
      state.movements = mv.movements || [];
      state.products = pr.products || [];
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
  if (state.route === '/pos') return renderPosView(state);
  if (state.route === '/products') return renderProductsView(state);
  if (state.route === '/suppliers') return renderSuppliersView(state);
  if (state.route === '/movements') return renderMovementsView(state);
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
        { id: 'pos', label: 'Export Purchase Orders CSV' },
        { id: 'movements', label: 'Export Stock Ledger CSV' },
        { id: 'suppliers', label: 'Export Suppliers CSV' },
      ],
    });
  }
  return renderTodayView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('pallet-rack', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Inventory &amp; POs…</h1><p class="tk-door__sub">Connecting to your private warehouse database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Inventory &amp; POs could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Inventory &amp; POs is not set up yet</h1><p class="tk-muted">Ask the warehouse owner to open this app first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Inventory & POs',
      tagline: 'Track SKU bin locations and stock levels, draft multi-line purchase orders in one click, receive goods atomically onto shelves, and audit every movement.',
      iconName: 'pallet-rack',
      defaultBusiness: 'Apex Supply Warehouse',
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
      appName: 'Inventory & POs',
      iconName: 'pallet-rack',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[2], NAV[1], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('pallet-rack', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Stock Control & Purchasing'}</span>
          </span>
        </a>

        <div class="tk-nav__group">Warehouse Ops</div>
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

        <div class="tk-nav__group">Supply Chain</div>
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
          <div class="ip-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.lowStock > 0 ? '#f59e0b' : '#10b981'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ip-ticker__pill">${icon('pallet-rack', { size: 13 })} Warehouse Today</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/products' && counts.lowStock > 0 ? html`
              <a href="#/products?low=1" class="ip-ticker__pill ip-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.lowStock} Low Stock</a>` : ''}
            ${state.route !== '/pos' ? html`
              <a href="#/pos" class="ip-ticker__pill">${icon('clipboard', { size: 13 })} Open POs (${counts.openPOs || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/suppliers" class="ip-ticker__pill">${icon('truck', { size: 13 })} Vendors</a>
              <a href="#/movements" class="ip-ticker__pill">${icon('layers', { size: 13 })} Ledger</a>` : ''}
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
    toast.success('Warehouse hub is live!');
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
    toast.success('Sample warehouse & PO data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all Sample products, suppliers, POs and ledger rows while keeping your real records.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try {
    await api.post('/api/sample/clear');
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
      downloadCsv(`inventory-products-${today()}.csv`, [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' },
        { key: 'category', label: 'Category' }, { key: 'location', label: 'Bin Location' },
        { key: 'supplier_name', label: 'Supplier' },
        { label: 'Unit Cost', get: (r) => (r.unit_cost_cents / 100).toFixed(2) },
        { label: 'Sell Price', get: (r) => (r.sell_price_cents / 100).toFixed(2) },
        { key: 'stock_on_hand', label: 'Stock on Hand' }, { key: 'reorder_point', label: 'Reorder Point' },
      ], products);
    } else if (kind === 'pos') {
      const { orders } = await api.get('/api/pos');
      downloadCsv(`purchase-orders-${today()}.csv`, [
        { key: 'po_number', label: 'PO #' }, { key: 'supplier_name', label: 'Supplier' },
        { key: 'order_date', label: 'Order Date' }, { key: 'expected_date', label: 'Expected' },
        { key: 'status', label: 'Status' }, { key: 'line_count', label: 'Lines' },
        { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
      ], orders);
    } else if (kind === 'movements') {
      const { movements } = await api.get('/api/movements');
      downloadCsv(`stock-movements-${today()}.csv`, [
        { key: 'move_date', label: 'Date' }, { key: 'sku', label: 'SKU' },
        { key: 'product_name', label: 'Product' }, { key: 'movement_type', label: 'Type' },
        { key: 'quantity', label: 'Qty' }, { key: 'stock_after', label: 'Stock After' },
        { key: 'po_number', label: 'PO #' }, { key: 'reason', label: 'Reason' }, { key: 'actor_name', label: 'By' },
      ], movements);
    } else if (kind === 'suppliers') {
      const { suppliers } = await api.get('/api/suppliers');
      downloadCsv(`suppliers-${today()}.csv`, [
        { key: 'name', label: 'Supplier' }, { key: 'contact_name', label: 'Contact' },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
        { key: 'payment_terms', label: 'Terms' }, { key: 'lead_time_days', label: 'Lead Time (d)' },
      ], suppliers);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/pos': () => '/pos',
  '/products': () => '/products',
  '/suppliers': () => '/suppliers',
  '/movements': () => '/movements',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query || {};
    if (state.route === '/products' && state.query.low === '1') {
      state.prodOnlyLow = true;
    }
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

wireTodayActions(root, state, { draw, loadScreen, router });
wirePosActions(root, state, { draw, loadScreen, router });
wireProductsActions(root, state, { draw, loadScreen, router });
wireOpsActions(root, state, { draw, loadScreen, router });

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
