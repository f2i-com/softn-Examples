// Property Maintenance — Slate-Teal Estate Ops shell, bespoke micro-icons, grouped nav, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDay, fmtDate } from '../kit/time.js';
import { initials, money, num } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog, copyText } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderTriageView, renderWorkOrdersView, wireTriageActions } from './views/triage.js';
import { renderPropertiesView, renderTenantsView, renderInspectionsView, wirePortfolioActions } from './views/portfolio.js';

// Register bespoke estate ops & property care micro-icons
addIcons({
  'estate-key': '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="10.5" r="2.2"/><path d="M12 12.7V16.5M12 15h2"/>',
  'house-check': '<path d="M3.5 11 12 4l8.5 7V19.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="m9 14 2 2 4-4"/>',
  'triage-siren': '<path d="M6 17v-4a6 6 0 0 1 12 0v4M4 17h16v3H4zM12 3v2M5.5 6.5l1.4 1.4M18.5 6.5l-1.4 1.4"/>',
});

export const BRAND_PRESETS = [
  { id: 'deep-spruce', label: 'Slate Teal', accent: '#0d6e6e', soft: '#d7f2ee', rail: '#0b1e21' },
  { id: 'brick-terracotta', label: 'Brick Terracotta', accent: '#9a3412', soft: '#ffedd5', rail: '#172924' },
  { id: 'slate-manor', label: 'Slate Manor', accent: '#475569', soft: '#e2e8f0', rail: '#171d27' },
  { id: 'harbour-blue', label: 'Harbour Blue', accent: '#1e40af', soft: '#dbeafe', rail: '#101d35' },
];

export const ROLES = [
  { id: 'manager', label: 'Property Manager' },
  { id: 'handyman', label: 'Handyman' },
  { id: 'landlord', label: 'Landlord' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'deep-spruce',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  requests: [],
  workOrders: [],
  properties: [],
  tenants: [],
  inspections: [],
  team: [],
  triageLayout: 'deck',
  reqPriority: 'All',
  reqCategory: 'All',
  reqSearch: '',
  showResolved: false,
  woStatus: 'All',
  propType: 'All',
  tenantSearch: '',
  inspType: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Triage Board', mobileLabel: 'Triage', icon: 'triage-siren', badge: (c) => c?.openRequests || 0, alert: true },
  { path: '/work-orders', label: 'Work Orders', mobileLabel: 'Orders', icon: 'wrench', badge: (c) => c?.openWorkOrders || 0 },
  { path: '/properties', label: 'Properties', mobileLabel: 'Assets', icon: 'building', badge: (c) => c?.propertyCount || 0 },
  { path: '/tenants', label: 'Tenants', mobileLabel: 'Tenants', icon: 'users' },
  { path: '/inspections', label: 'Inspections', mobileLabel: 'Inspect', icon: 'house-check' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'deep-spruce');
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
      const [r, p, t, w] = await Promise.all([
        api.get('/api/requests'),
        api.get('/api/properties'),
        api.get('/api/tenants'),
        api.get('/api/work-orders'),
      ]);
      state.requests = r.requests || [];
      state.properties = p.properties || [];
      state.tenants = t.tenants || [];
      state.workOrders = w.workOrders || [];
    } else if (path === '/work-orders') {
      const w = await api.get('/api/work-orders');
      state.workOrders = w.workOrders || [];
    } else if (path === '/properties') {
      const p = await api.get('/api/properties');
      state.properties = p.properties || [];
    } else if (path === '/tenants') {
      const [t, p] = await Promise.all([api.get('/api/tenants'), api.get('/api/properties')]);
      state.tenants = t.tenants || [];
      state.properties = p.properties || [];
    } else if (path === '/inspections') {
      const [i, p] = await Promise.all([api.get('/api/inspections'), api.get('/api/properties')]);
      state.inspections = i.inspections || [];
      state.properties = p.properties || [];
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
  if (state.route === '/') return renderTriageView(state);
  if (state.route === '/work-orders') return renderWorkOrdersView(state);
  if (state.route === '/properties') return renderPropertiesView(state);
  if (state.route === '/tenants') return renderTenantsView(state);
  if (state.route === '/inspections') return renderInspectionsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'requests', label: 'Export Requests CSV' },
        { id: 'work-orders', label: 'Export Work Orders CSV' },
        { id: 'properties', label: 'Export Properties CSV' },
        { id: 'inspections', label: 'Export Inspections CSV' },
      ],
    });
  }
  return renderTriageView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('house-check', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Property Maintenance…</h1><p class="tk-door__sub">Connecting to your private property care database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Property Maintenance could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Workspace not set up yet</h1><p class="tk-muted">Ask the portfolio owner to finish initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Property Maintenance',
      tagline: 'Triage tenant maintenance requests, dispatch handyman work orders, manage key safe notes, and log rated property inspections.',
      iconName: 'house-check',
      defaultBusiness: 'Hearthstone Property Care',
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
      appName: 'Property Maintenance',
      iconName: 'house-check',
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

  const renderNavItem = (item) => {
    const count = item.badge ? item.badge(counts) : 0;
    return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
      ${icon(item.icon, { size: 18 })}
      <span>${item.label}</span>
      ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
    </a>`;
  };

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('house-check', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Estate Maintenance Desk'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Maintenance Desk</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 2).map(renderNavItem)}
        </nav>
        <div class="tk-nav__group">Estate Portfolio</div>
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
          <div class="pm-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.urgentRequests > 0 ? '#ef4444' : '#2dd4bf'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="pm-ticker__pill">${icon('triage-siren', { size: 13 })} Triage (${counts.openRequests || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${counts.urgentRequests > 0 ? html`
              <button type="button" class="pm-ticker__pill pm-ticker__pill--alert" data-action="jump-urgent">
                ${icon('alert', { size: 13 })} ${counts.urgentRequests} Urgent
              </button>` : ''}
            ${state.route !== '/work-orders' ? html`
              <a href="#/work-orders" class="pm-ticker__pill">${icon('wrench', { size: 13 })} Work Orders (${counts.openWorkOrders || 0})</a>` : ''}
            <button type="button" class="pm-ticker__pill pm-ticker__pill--brass" data-action="copy-landlord-summary">${icon('copy', { size: 13 })} Landlord Brief</button>
            <button type="button" class="k-icon-btn" data-action="refresh-screen" aria-label="Refresh">${icon('refresh', { size: 17 })}</button>
          </div>
        </header>
        <main class="tk-page">${renderScreen()}</main>
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

on(root, 'click', '[data-action="retry-boot"]', () => boot());
on(root, 'click', '[data-action="refresh-session"]', () => boot());
on(root, 'click', '[data-action="refresh-screen"]', () => loadScreen());
on(root, 'click', '[data-action="jump-urgent"]', () => {
  state.reqPriority = 'Urgent';
  if (state.route !== '/') router.go('/');
  else draw();
});

on(root, 'click', '[data-action="copy-landlord-summary"]', async () => {
  try {
    const [reqRes, woRes, propRes, inspRes] = await Promise.all([
      api.get('/api/requests'),
      api.get('/api/work-orders'),
      api.get('/api/properties'),
      api.get('/api/inspections'),
    ]);
    const reqs = reqRes.requests || [];
    const wos = woRes.workOrders || [];
    const props = propRes.properties || [];
    const insps = inspRes.inspections || [];
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    const openWos = wos.filter((w) => w.status !== 'Completed' && w.status !== 'Invoiced');
    const openReqs = reqs.filter((r) => r.status !== 'Resolved');
    const totalSpend = wos.reduce((sum, w) => sum + Number(w.cost_cents || 0), 0);
    const avgScore = insps.length ? (insps.reduce((sum, i) => sum + Number(i.condition_rating || 0), 0) / insps.length).toFixed(1) : 'N/A';

    const lines = [
      `${s.business_name} — Landlord Maintenance Summary (${fmtDay(today())})`,
      `Portfolio: ${props.length} properties | Open Requests: ${openReqs.length} | Open Work Orders: ${openWos.length} | Total Spend: ${money(totalSpend, { currency: cur })} | Avg Inspection: ${avgScore}/5`,
      '',
      'OPEN WORK ORDERS & COSTS:',
      ...(openWos.length
        ? openWos.map((w) => `- ${w.wo_number} [${w.status}] ${w.property_address} — ${w.assigned_to} (${fmtDay(w.scheduled_date)}) · ${num(w.hours || 0, { decimals: 1 })}h · ${money(w.cost_cents || 0, { currency: cur })}`)
        : ['- No open work orders.']),
      '',
      'OPEN MAINTENANCE TRIAGE:',
      ...(openReqs.length
        ? openReqs.slice(0, 8).map((r) => `- ${r.request_number} [${r.priority} · ${r.status}] ${r.property_address} (${r.category}): ${r.description}`)
        : ['- All maintenance requests resolved.']),
      '',
      'RECENT INSPECTIONS:',
      ...(insps.length
        ? insps.slice(0, 5).map((i) => `- ${fmtDay(i.inspection_date)} · ${i.property_address} (${i.inspection_type}) — ${i.condition_rating}/5 stars${i.notes ? ': ' + i.notes : ''}`)
        : ['- No inspections logged yet.']),
    ];
    copyText(lines.join('\n'), { title: 'Landlord Maintenance Summary', done: 'Landlord summary copied.' });
  } catch (err) {
    toastError(err);
  }
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
    toast.success('Maintenance desk is live!');
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
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample properties, tenants, requests and inspections. Your own records remain.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'requests') {
      const { requests } = await api.get('/api/requests');
      downloadCsv(`maintenance-requests-${today()}.csv`, [
        { key: 'request_number', label: 'Req #' }, { key: 'property_address', label: 'Property' },
        { key: 'tenant_name', label: 'Tenant' }, { key: 'category', label: 'Category' },
        { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
        { key: 'reported_date', label: 'Reported' }, { key: 'description', label: 'Description' },
      ], requests);
    } else if (kind === 'work-orders') {
      const { workOrders } = await api.get('/api/work-orders');
      downloadCsv(`work-orders-${today()}.csv`, [
        { key: 'wo_number', label: 'WO #' }, { key: 'request_number', label: 'Req #' },
        { key: 'property_address', label: 'Property' }, { key: 'assigned_to', label: 'Assigned To' },
        { key: 'scheduled_date', label: 'Scheduled' }, { key: 'hours', label: 'Hours' },
        { label: 'Cost', get: (r) => (r.cost_cents / 100).toFixed(2) }, { key: 'status', label: 'Status' },
      ], workOrders);
    } else if (kind === 'properties') {
      const { properties } = await api.get('/api/properties');
      downloadCsv(`properties-${today()}.csv`, [
        { key: 'address', label: 'Address' }, { key: 'property_type', label: 'Type' },
        { key: 'owner_manager', label: 'Owner / Manager' }, { key: 'manager_phone', label: 'Phone' },
        { key: 'access_notes', label: 'Access Notes' },
      ], properties);
    } else if (kind === 'inspections') {
      const { inspections } = await api.get('/api/inspections');
      downloadCsv(`inspections-${today()}.csv`, [
        { key: 'inspection_date', label: 'Date' }, { key: 'property_address', label: 'Property' },
        { key: 'inspection_type', label: 'Type' }, { key: 'condition_rating', label: 'Condition (1-5)' },
        { key: 'inspector', label: 'Inspector' }, { key: 'notes', label: 'Notes' },
      ], inspections);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/work-orders': () => '/work-orders',
  '/properties': () => '/properties',
  '/tenants': () => '/tenants',
  '/inspections': () => '/inspections',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

wireTriageActions(root, state, {
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
wirePortfolioActions(root, state, { draw, loadScreen });

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
