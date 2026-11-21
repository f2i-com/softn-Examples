// Salon Studio: startup, bespoke atelier micro-icons, grouped Blush-Rose & Espresso shell, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderBookView, wireBookActions } from './views/book.js';
import { renderClientsView, wireClientActions } from './views/clients.js';
import { renderServicesView, renderStylistsView, renderRetailView, wireStudioActions } from './views/studio.js';

// Register bespoke salon & beauty atelier micro-icons
addIcons({
  'salon-chair': '<path d="M6.5 11V6.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2V11M5 11h14v3.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 14.5V11zM12 16v4M8.5 20h7"/>',
  'colour-bowl': '<path d="M4.5 13h15a6.5 6.5 0 0 1-13 0zM14 5l4.5 4.5M12 7l3 3M9.5 13l5-5"/>',
  'serum-bottle': '<path d="M10 4h4v3l2 2.5V19a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19V9.5L10 7V4zM9 13h6"/>',
});

export const BRAND_PRESETS = [
  { id: 'rosewood', label: 'Editorial Rosewood', accent: '#922649', soft: '#fae8ef', rail: '#1f1018' },
  { id: 'champagne', label: 'Champagne Noir', accent: '#a16207', soft: '#fef3c7', rail: '#1e1916' },
  { id: 'sage', label: 'Sage Spa', accent: '#3f6212', soft: '#ecfccb', rail: '#1b2419' },
  { id: 'plum', label: 'Plum Atelier', accent: '#6b21a8', soft: '#f3e8ff', rail: '#22132d' },
];

export const ROLES = [
  { id: 'manager', label: 'Front Desk' },
  { id: 'stylist', label: 'Stylist' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'rosewood',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  appointments: [],
  clients: [],
  services: [],
  stylists: [],
  sales: [],
  salesSummary: null,
  team: [],
  // View controls
  bookDate: today(),
  bookMode: 'stylist', // 'stylist' | 'chrono'
  bookStatusFilter: 'All',
  clientSearch: '',
  serviceCat: 'All',
  retailDayFilter: 'All',
};

const NAV = [
  { path: '/', label: 'Appointment Book', mobileLabel: 'Book', icon: 'salon-chair', badge: (c) => c?.todayAppointments || 0 },
  { path: '/clients', label: 'Client Cards', mobileLabel: 'Clients', icon: 'colour-bowl', badge: (c) => c?.totalClients || 0 },
  { path: '/services', label: 'Service Menu', mobileLabel: 'Menu', icon: 'scissors' },
  { path: '/stylists', label: 'Stylist Roster', mobileLabel: 'Stylists', icon: 'star', badge: (c) => c?.activeStylists || 0 },
  { path: '/retail', label: 'Retail Counter', mobileLabel: 'Retail', icon: 'serum-bottle' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'rosewood');
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
      const [a, c, sv, st, sl] = await Promise.all([
        api.get('/api/appointments', { day: state.bookDate }),
        api.get('/api/clients'),
        api.get('/api/services'),
        api.get('/api/stylists', { day: state.bookDate }),
        api.get('/api/sales', { today: state.bookDate }),
      ]);
      state.appointments = a.appointments || [];
      state.clients = c.clients || [];
      state.services = sv.services || [];
      state.stylists = st.stylists || [];
      state.sales = sl.sales || [];
      state.salesSummary = sl.summary || null;
    } else if (path === '/clients') {
      const [c, sv, st] = await Promise.all([
        api.get('/api/clients'),
        api.get('/api/services'),
        api.get('/api/stylists', { day: today() }),
      ]);
      state.clients = c.clients || [];
      state.services = sv.services || [];
      state.stylists = st.stylists || [];
    } else if (path === '/services') {
      const sv = await api.get('/api/services');
      state.services = sv.services || [];
    } else if (path === '/stylists') {
      const st = await api.get('/api/stylists', { day: today() });
      state.stylists = st.stylists || [];
    } else if (path === '/retail') {
      const [sl, c] = await Promise.all([
        api.get('/api/sales', { today: today() }),
        api.get('/api/clients'),
      ]);
      state.sales = sl.sales || [];
      state.salesSummary = sl.summary || null;
      state.clients = c.clients || [];
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
  if (state.route === '/') return renderBookView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/services') return renderServicesView(state);
  if (state.route === '/stylists') return renderStylistsView(state);
  if (state.route === '/retail') return renderRetailView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'appointments', label: 'Export Appointments CSV' },
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'services', label: 'Export Service Menu CSV' },
        { id: 'sales', label: 'Export Retail Sales CSV' },
      ],
    });
  }
  return renderBookView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('scissors', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Salon Studio…</h1><p class="tk-door__sub">Connecting to your private salon desk.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Salon Studio could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Salon Studio is not set up yet</h1><p class="tk-muted">Ask the salon owner to open Salon Studio first and finish initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Salon Studio',
      tagline: 'Run your daily appointment book by stylist chair, keep client colour formulas & full visit history, manage services & retail sales, and print client receipts.',
      iconName: 'scissors',
      defaultBusiness: 'Atelier Rose Hair & Beauty',
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
      appName: 'Salon Studio',
      iconName: 'scissors',
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
          <span class="tk-brand__mark">${icon('scissors', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Hair Salon & Beauty Studio'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Front Desk</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}
              <span>${item.label}</span>
              ${count > 0 ? html`<span class="tk-nav__count">${count}</span>` : ''}
            </a>`;
          })}
        </nav>
        <div class="tk-nav__group">Atelier &amp; Retail</div>
        <nav class="tk-nav">
          ${NAV.slice(3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}
              <span>${item.label}</span>
              ${count > 0 ? html`<span class="tk-nav__count">${count}</span>` : ''}
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
          <div class="sl-ticker">
            <span class="tk-pulse-dot" style="--dot:#edd2ab"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="sl-ticker__pill">${icon('salon-chair', { size: 13 })} Chair Book (${counts.todayAppointments || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route === '/' ? html`
              <a href="#/clients" class="sl-ticker__pill">${icon('colour-bowl', { size: 13 })} Formulas</a>
              <a href="#/retail" class="sl-ticker__pill">${icon('serum-bottle', { size: 13 })} Retail</a>` : ''}
            ${state.route !== '/' && state.route !== '/retail' ? html`
              <a href="#/retail" class="sl-ticker__pill">${icon('serum-bottle', { size: 13 })} Retail Log</a>` : ''}
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
    toast.success('Salon Studio is live! Welcome to your appointment desk.');
    state.setupBusy = false;
    state.bookDate = today();
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
    toast.success('Salon settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample salon data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all example records tagged Sample. Your real clients, appointments and sales remain intact.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'appointments') {
      const { appointments } = await api.get('/api/appointments');
      downloadCsv(`salon-appointments-${today()}.csv`, [
        { key: 'appt_date', label: 'Date' }, { key: 'appt_time', label: 'Time' },
        { key: 'duration_minutes', label: 'Mins' }, { key: 'client_name', label: 'Client' },
        { key: 'service_name', label: 'Service' }, { key: 'stylist_name', label: 'Stylist' },
        { key: 'status', label: 'Status' }, { label: 'Price', get: (r) => (r.price_cents / 100).toFixed(2) },
      ], appointments);
    } else if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`salon-clients-${today()}.csv`, [
        { key: 'name', label: 'Client' }, { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' }, { key: 'client_since', label: 'Client Since' },
        { key: 'notes', label: 'Colour Formula & Notes' },
      ], clients);
    } else if (kind === 'services') {
      const { services } = await api.get('/api/services');
      downloadCsv(`salon-services-${today()}.csv`, [
        { key: 'name', label: 'Service' }, { key: 'category', label: 'Category' },
        { key: 'duration_minutes', label: 'Duration (min)' }, { label: 'Price', get: (r) => (r.price_cents / 100).toFixed(2) },
        { key: 'description', label: 'Description' },
      ], services);
    } else if (kind === 'sales') {
      const { sales } = await api.get('/api/sales');
      downloadCsv(`salon-retail-sales-${today()}.csv`, [
        { key: 'sale_date', label: 'Date' }, { key: 'client_name', label: 'Client' },
        { key: 'product_name', label: 'Product' }, { key: 'quantity', label: 'Qty' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
      ], sales);
    }
  } catch (err) { toastError(err); }
});

wireBookActions(root, state, { draw, loadScreen });
wireClientActions(root, state, { draw, loadScreen });
wireStudioActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/services': () => '/services',
  '/stylists': () => '/stylists',
  '/retail': () => '/retail',
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
