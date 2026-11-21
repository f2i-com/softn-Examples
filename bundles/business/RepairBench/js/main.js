// RepairBench: startup, ESD hardware micro-icons, grouped nav, calm ticker, Graphite-Cyan-Amber shell, routes & settings.
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
import { renderDevicesView, wireDevicesActions } from './views/devices.js';
import { renderPartsView, wirePartsActions } from './views/parts.js';
import { renderQaView, renderDirectoryView, wireQaDirectoryActions } from './views/qa.js';

// Register bespoke electronics & ESD micro-repair icons
addIcons({
  microchip: '<rect x="7" y="7" width="10" height="10" rx="1.8"/><path d="M9.5 3.5V7M14.5 3.5V7M9.5 17v3.5M14.5 17v3.5M3.5 9.5H7M3.5 14.5H7M17 9.5h3.5M17 14.5h3.5"/>',
  'solder-iron': '<path d="m4 20 5-5M15 4l5 5-8 8-5-5 8-8zM13 6l5 5"/>',
  'circuit-check': '<path d="M3 12h4l2-4.5 3 9 2.5-6 1.8 1.5H21"/>',
});

export const BRAND_PRESETS = [
  { id: 'circuit-cyan', label: 'Circuit Cyan', accent: '#0891b2', soft: '#cffafe', rail: '#0b1017' },
  { id: 'solder-amber', label: 'Solder Amber', accent: '#d97706', soft: '#fef3c7', rail: '#181512' },
  { id: 'lab-indigo', label: 'Lab Indigo', accent: '#4f46e5', soft: '#e0e7ff', rail: '#11132b' },
  { id: 'matrix-emerald', label: 'Matrix Emerald', accent: '#059669', soft: '#d1fae5', rail: '#0b1c17' },
];

export const ROLES = [
  { id: 'manager', label: 'Bench Manager' },
  { id: 'technician', label: 'Bench Technician' },
  { id: 'front_counter', label: 'Front Counter' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'circuit-cyan',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Caches
  jobs: [],
  devices: [],
  parts: [],
  partsTotalCostCents: 0,
  checks: [],
  customers: [],
  technicians: [],
  team: [],
  // UI filters
  showCollected: false,
  pipelineLayout: 'Deck',
  stageFilter: 'All',
  techFilter: 'All',
  jobSearch: '',
  deviceSearch: '',
  deviceTypeFilter: 'All',
  partsFilter: 'Open',
  directoryTab: 'Customers',
  qaJobId: '',
  qaToggles: {
    Power: 'Pass',
    Display: 'Pass',
    Touch: 'Pass',
    Charging: 'Pass',
    Audio: 'Pass',
    Cameras: 'Pass',
    'Buttons & Ports': 'Pass',
    'Wi-Fi & Cellular': 'Pass',
  },
};

const NAV = [
  { path: '/', label: 'Repair Pipeline', mobileLabel: 'Bench', icon: 'microchip', badge: (c) => c?.activeJobs || 0 },
  { path: '/devices', label: 'Device Intake', mobileLabel: 'Devices', icon: 'smartphone' },
  { path: '/parts', label: 'Parts Orders', mobileLabel: 'Parts', icon: 'box', badge: (c) => c?.waitingParts || 0 },
  { path: '/qa', label: 'QA & Pickup Desk', mobileLabel: 'QA', icon: 'circuit-check', badge: (c) => (c?.qaPending || 0) + (c?.toNotify || 0), alert: true },
  { path: '/directory', label: 'Customers & Techs', mobileLabel: 'Shop', icon: 'users' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'circuit-cyan');
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
      const [jb, dv, cu, tc, pt, qa] = await Promise.all([
        api.get('/api/jobs', { includeCollected: state.showCollected ? 1 : 0 }),
        api.get('/api/devices'),
        api.get('/api/customers'),
        api.get('/api/technicians'),
        api.get('/api/parts'),
        api.get('/api/qa'),
      ]);
      state.jobs = jb.jobs || [];
      state.devices = dv.devices || [];
      state.customers = cu.customers || [];
      state.technicians = tc.technicians || [];
      state.parts = pt.parts || [];
      state.partsTotalCostCents = pt.totalCostCents || 0;
      state.checks = qa.checks || [];
    } else if (path === '/devices') {
      const [dv, cu, tc] = await Promise.all([api.get('/api/devices'), api.get('/api/customers'), api.get('/api/technicians')]);
      state.devices = dv.devices || [];
      state.customers = cu.customers || [];
      state.technicians = tc.technicians || [];
    } else if (path === '/parts') {
      const [pt, jb] = await Promise.all([api.get('/api/parts'), api.get('/api/jobs', { includeCollected: 1 })]);
      state.parts = pt.parts || [];
      state.partsTotalCostCents = pt.totalCostCents || 0;
      state.jobs = jb.jobs || [];
    } else if (path === '/qa') {
      const [qa, jb, tc] = await Promise.all([api.get('/api/qa'), api.get('/api/jobs', { includeCollected: 0 }), api.get('/api/technicians')]);
      state.checks = qa.checks || [];
      state.jobs = jb.jobs || [];
      state.technicians = tc.technicians || [];
    } else if (path === '/directory') {
      const [cu, tc] = await Promise.all([api.get('/api/customers'), api.get('/api/technicians')]);
      state.customers = cu.customers || [];
      state.technicians = tc.technicians || [];
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
  if (state.route === '/devices') return renderDevicesView(state);
  if (state.route === '/parts') return renderPartsView(state);
  if (state.route === '/qa') return renderQaView(state);
  if (state.route === '/directory') return renderDirectoryView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'jobs', label: 'Export Repair Jobs CSV' },
        { id: 'devices', label: 'Export Devices CSV' },
        { id: 'parts', label: 'Export Parts Orders CSV' },
        { id: 'qa', label: 'Export QA Checks CSV' },
      ],
    });
  }
  return renderPipelineView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('microchip', { size: 26 })}</div><div><h1 class="tk-door__title">Opening RepairBench…</h1><p class="tk-door__sub">Connecting to your private workshop database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">RepairBench could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">RepairBench is not set up yet</h1><p class="tk-muted">Ask the shop owner to open RepairBench first and finish initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'RepairBench',
      tagline: 'Run devices from intake and diagnosis through parts tracking, bench repair, interactive QA testing, and pickup notifications with printable claim tickets.',
      iconName: 'microchip',
      defaultBusiness: 'Voltcraft Device Repair',
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
      appName: 'RepairBench',
      iconName: 'microchip',
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
          <span class="tk-brand__mark">${icon('microchip', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Device Repair Workshop'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Repair Bench</div>
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
        <div class="tk-nav__group">Verification &amp; Shop</div>
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
          <div class="rb-ticker">
            <span class="tk-pulse-dot" style="--dot:#22d3ee"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="rb-ticker__pill">${icon('microchip', { size: 13 })} Bench (${counts.activeJobs || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/qa' && ((counts.overdueJobs || 0) > 0 || (counts.toNotify || 0) > 0) ? html`
              <a href="#/qa" class="rb-ticker__pill rb-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.overdueJobs > 0 ? `${counts.overdueJobs} SLA Overdue` : `${counts.toNotify} Ready SMS`}</a>` : ''}
            ${state.route !== '/parts' ? html`
              <a href="#/parts" class="rb-ticker__pill">${icon('box', { size: 13 })} Parts (${counts.waitingParts || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/qa" class="rb-ticker__pill">${icon('circuit-check', { size: 13 })} QA &amp; Pickup (${counts.readyPickup || 0})</a>` : ''}
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
    toast.success('RepairBench workshop is live!');
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

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample workshop data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample records while keeping your real shop records intact.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Technician approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (event, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this workshop.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'jobs') {
      const { jobs } = await api.get('/api/jobs', { includeCollected: 1 });
      downloadCsv(`repairbench-jobs-${today()}.csv`, [
        { key: 'ticket_code', label: 'Ticket #' }, { key: 'status', label: 'Stage' }, { key: 'priority', label: 'Priority' },
        { key: 'customer_name', label: 'Customer' }, { label: 'Device', get: (r) => `${r.brand || ''} ${r.model || ''}`.trim() },
        { key: 'serial', label: 'Serial / IMEI' }, { key: 'issue_type', label: 'Issue' },
        { key: 'technician_name', label: 'Technician' }, { key: 'due_date', label: 'Due Date' },
        { label: 'Quote', get: (r) => (r.quote_amount_cents / 100).toFixed(2) },
      ], jobs);
    } else if (kind === 'devices') {
      const { devices } = await api.get('/api/devices');
      downloadCsv(`repairbench-devices-${today()}.csv`, [
        { key: 'customer_name', label: 'Customer' }, { key: 'device_type', label: 'Type' },
        { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
        { key: 'serial', label: 'Serial / IMEI' }, { key: 'condition_notes', label: 'Intake Condition' },
      ], devices);
    } else if (kind === 'parts') {
      const { parts } = await api.get('/api/parts');
      downloadCsv(`repairbench-parts-${today()}.csv`, [
        { key: 'ticket_code', label: 'Ticket #' }, { key: 'part_name', label: 'Part' },
        { key: 'supplier', label: 'Supplier' }, { label: 'Cost', get: (r) => (r.cost_cents / 100).toFixed(2) },
        { key: 'tracking', label: 'Tracking #' }, { key: 'eta', label: 'ETA' }, { key: 'status', label: 'Status' },
      ], parts);
    } else if (kind === 'qa') {
      const { checks } = await api.get('/api/qa');
      downloadCsv(`repairbench-qa-${today()}.csv`, [
        { key: 'ticket_code', label: 'Ticket #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'result', label: 'Result' }, { label: 'Checks Passed', get: (r) => (r.checklist || []).join('; ') },
        { key: 'checked_by_name', label: 'Checked By' }, { key: 'notified', label: 'Customer Notified' },
      ], checks);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/devices': () => '/devices',
  '/parts': () => '/parts',
  '/qa': () => '/qa',
  '/directory': () => '/directory',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, router };
wirePipelineActions(root, state, ctx);
wireDevicesActions(root, state, ctx);
wirePartsActions(root, state, ctx);
wireQaDirectoryActions(root, state, ctx);

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
