// AgriLog: farm desk shell, bespoke agritech micro-icons, grouped nav, calm ticker, companion preloading & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderPaddocksView, renderJobsView, wirePaddockJobActions } from './views/paddocks.js';
import { renderHarvestsView, renderChemicalsView, renderMachineryView, wireFarmOpsActions } from './views/operations.js';

// Register bespoke agricultural paddock, spray-boom & harvest-sheaf micro-icons
addIcons({
  'paddock-grid': '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M11.5 4v16M3.5 11.5h17M11.5 15.5l9-4"/>',
  'spray-boom': '<path d="M12 4v6M4 10h16M6 10v2M12 10v2M18 10v2M5.5 15.5c0 1.2 1 2 1 2s1-0.8 1-2c0-0.6-1-1.5-1-1.5s-1 0.9-1 1.5zM11 16.5c0 1.2 1 2 1 2s1-0.8 1-2c0-0.6-1-1.5-1-1.5s-1 0.9-1 1.5zM17 15.5c0 1.2 1 2 1 2s1-0.8 1-2c0-0.6-1-1.5-1-1.5s-1 0.9-1 1.5z"/>',
  'wheat-sheaf': '<path d="M12 20V5M12 8c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM12 8c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5zM12 13c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM12 13c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5zM8 20h8"/>',
});

export const BRAND_PRESETS = [
  { id: 'forest', label: 'Heritage Eucalyptus', accent: '#1b5e36', soft: '#dcf5e6', rail: '#112418' },
  { id: 'ochre', label: 'Harvest Gold', accent: '#b45309', soft: '#fef3c7', rail: '#291e12' },
  { id: 'soil', label: 'Red Loam', accent: '#9a3412', soft: '#ffedd5', rail: '#261712' },
  { id: 'river', label: 'Irrigation Blue', accent: '#0369a1', soft: '#e0f2fe', rail: '#102433' },
];

export const ROLES = [
  { id: 'manager', label: 'Farm Manager' },
  { id: 'farm_hand', label: 'Farm Hand' },
  { id: 'agronomist', label: 'Agronomist' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'forest',
  setupBusy: false,
  setupError: '',
  route: '/',
  paddocks: [],
  jobs: [],
  harvests: [],
  chemicals: [],
  machines: [],
  maintenance: [],
  team: [],
  jobFilter: 'Open',
  jobTypeFilter: 'All',
  paddockFilter: 'All',
  paddockSearch: '',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Paddocks', mobileLabel: 'Paddocks', icon: 'paddock-grid', badge: (c) => c?.whpLocked || 0, alert: true },
  { path: '/jobs', label: 'Farm Jobs', mobileLabel: 'Jobs', icon: 'clipboard', badge: (c) => c?.openJobs || 0 },
  { path: '/harvests', label: 'Harvest Log', mobileLabel: 'Harvests', icon: 'wheat-sheaf' },
  { path: '/chemicals', label: 'Chemical Register', mobileLabel: 'Sprays', icon: 'spray-boom', badge: (c) => c?.whpLocked || 0, alert: true },
  { path: '/machinery', label: 'Machinery', mobileLabel: 'Shed', icon: 'tractor', badge: (c) => c?.serviceDue || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'forest');
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
      const [p, j, ch, m] = await Promise.all([
        api.get('/api/paddocks', { today: today() }),
        api.get('/api/jobs'),
        api.get('/api/chemicals'),
        api.get('/api/machinery'),
      ]);
      state.paddocks = p.paddocks || [];
      state.jobs = j.jobs || [];
      state.chemicals = ch.applications || [];
      state.machines = m.machines || [];
    } else {
      const p = await api.get('/api/paddocks', { today: today() });
      state.paddocks = p.paddocks || [];
      if (path === '/jobs') state.jobs = (await api.get('/api/jobs')).jobs || [];
      else if (path === '/harvests') state.harvests = (await api.get('/api/harvests')).harvests || [];
      else if (path === '/chemicals') state.chemicals = (await api.get('/api/chemicals')).applications || [];
      else if (path === '/machinery') {
        const [m, ml] = await Promise.all([api.get('/api/machinery'), api.get('/api/maintenance')]);
        state.machines = m.machines || [];
        state.maintenance = ml.logs || [];
      } else if (path === '/settings') state.team = (await api.get('/api/team')).team || [];
    }
  } catch (err) { toastError(err); }
  finally { state.loading = false; draw(); }
}

function renderScreen() {
  if (state.route === '/') return renderPaddocksView(state);
  if (state.route === '/jobs') return renderJobsView(state);
  if (state.route === '/harvests') return renderHarvestsView(state);
  if (state.route === '/chemicals') return renderChemicalsView(state);
  if (state.route === '/machinery') return renderMachineryView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'chemicals', label: 'Export Chemical Register CSV' },
        { id: 'harvests', label: 'Export Harvest Log CSV' },
        { id: 'machinery', label: 'Export Machinery CSV' },
      ],
    });
  }
  return renderPaddocksView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('paddock-grid', { size: 26 })}</div><div><h1 class="tk-door__title">Opening AgriLog…</h1><p class="tk-door__sub">Loading your paddock blocks and farm records.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">AgriLog could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">AgriLog is not set up yet</h1><p class="tk-muted">Ask the farm owner to complete initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'AgriLog',
      tagline: 'Manage paddocks with live chemical withholding locks, schedule field jobs, record harvests, and service farm machinery.',
      iconName: 'paddock-grid',
      defaultBusiness: 'Greenridge Family Farm',
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
    render(root, renderJoinDoor({ businessName: s.businessName, appName: 'AgriLog', iconName: 'paddock-grid', pending: s.access === 'pending', roles: ROLES, busy: state.setupBusy, error: state.setupError }));
    return;
  }
  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[3], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('paddock-grid', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Farm Operations'}</span>
          </span>
        </a>

        <div class="tk-nav__group">Paddock &amp; Field</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}<span>${item.label}</span>
              ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
            </a>`;
          })}
        </nav>

        <div class="tk-nav__group">Compliance &amp; Shed</div>
        <nav class="tk-nav">
          ${NAV.slice(3).map((item) => {
            const count = item.badge ? item.badge(counts) : 0;
            return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
              ${icon(item.icon, { size: 18 })}<span>${item.label}</span>
              ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
            </a>`;
          })}
        </nav>

        <div class="tk-rail__foot">
          <a href="#/settings" class="${cls('tk-nav__item', { 'is-on': state.route === '/settings' })}">${icon('settings', { size: 18 })}<span>Customize &amp; Settings</span></a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'Owner')}</span>
            <span><span class="tk-user-chip__name">${s.me.displayName || 'Owner'}</span><span class="tk-user-chip__role">${s.me.role}</span></span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="ag-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.whpLocked > 0 ? '#ef4444' : '#4ade80'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ag-ticker__pill">${icon('paddock-grid', { size: 13 })} Paddocks (${counts.paddocks || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/chemicals' && counts.whpLocked > 0 ? html`
              <a href="#/chemicals" class="ag-ticker__pill ag-ticker__pill--alert">${icon('spray-boom', { size: 13 })} ${counts.whpLocked} WHP Lock${counts.whpLocked === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/machinery' && counts.serviceDue > 0 ? html`
              <a href="#/machinery" class="ag-ticker__pill ag-ticker__pill--alert">${icon('tractor', { size: 13 })} ${counts.serviceDue} Service Due</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/harvests" class="ag-ticker__pill">${icon('wheat-sheaf', { size: 13 })} Harvests</a>
              <a href="#/machinery" class="ag-ticker__pill">${icon('tractor', { size: 13 })} Shed</a>` : ''}
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
on(root, 'click', '[data-action="pick-preset"]', (e, el) => {
  state.setupPreset = el.dataset.preset;
  applyBrandPreset(BRAND_PRESETS, el.dataset.preset);
  const f = el.closest('form');
  if (f) { const h = qs('input[name="brand_preset"]', f); if (h) h.value = el.dataset.preset; }
  if (state.session?.settings) state.session.settings.brand_preset = el.dataset.preset;
  draw();
});
on(root, 'submit', 'form[data-form="setup"]', async (e, form) => {
  e.preventDefault();
  const vals = readForm(form);
  state.setupBusy = true; state.setupError = ''; draw();
  try { await api.post('/api/setup', { ...vals, today: today() }); toast.success('AgriLog is ready.'); state.setupBusy = false; await boot(); }
  catch (err) { state.setupBusy = false; state.setupError = messageOf(err); draw(); }
});
on(root, 'submit', 'form[data-form="join-request"]', async (e, form) => {
  e.preventDefault();
  const vals = readForm(form);
  state.setupBusy = true; state.setupError = ''; draw();
  try { await api.post('/api/team/join', vals); state.setupBusy = false; await boot(); }
  catch (err) { state.setupBusy = false; state.setupError = messageOf(err); draw(); }
});
on(root, 'submit', 'form[data-form="save-settings"]', async (e, form) => {
  e.preventDefault();
  try { const r = await api.put('/api/settings', readForm(form)); state.session.settings = r.settings; setZone(r.settings.timezone); applyBrandPreset(BRAND_PRESETS, r.settings.brand_preset); toast.success('Settings saved.'); draw(); }
  catch (err) { toastError(err); }
});
on(root, 'click', '[data-action="load-sample"]', async () => { try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample farm records loaded.'); await loadScreen(); } catch (err) { toastError(err); } });
on(root, 'click', '[data-action="clear-sample"]', async () => {
  if (!(await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample farm records while keeping your real logs.', confirmLabel: 'Clear sample data' }))) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); } catch (err) { toastError(err); }
});
on(root, 'click', '[data-action="approve-member"]', async (e, el) => { try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Approved.'); await loadScreen(); } catch (err) { toastError(err); } });
on(root, 'change', '[data-action="change-member-role"]', async (e, el) => { try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); } catch (err) { toastError(err); } });
on(root, 'click', '[data-action="remove-member"]', async (e, el) => {
  if (!(await confirmDialog({ title: 'Remove team member?', message: 'Revoke workspace access for this person?', confirmLabel: 'Remove', danger: true }))) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Removed.'); await loadScreen(); } catch (err) { toastError(err); }
});
on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  try {
    if (el.dataset.export === 'chemicals') {
      const { applications } = await api.get('/api/chemicals');
      downloadCsv(`agrilog-chemicals-${today()}.csv`, [
        { key: 'application_date', label: 'Date' }, { key: 'block_name', label: 'Paddock' }, { key: 'product_used', label: 'Product' },
        { key: 'rate', label: 'Rate' }, { key: 'operator', label: 'Operator' }, { key: 'weather', label: 'Weather' }, { key: 'whp_end', label: 'WHP End' },
      ], applications);
    } else if (el.dataset.export === 'harvests') {
      const { harvests } = await api.get('/api/harvests');
      downloadCsv(`agrilog-harvests-${today()}.csv`, [
        { key: 'harvest_date', label: 'Date' }, { key: 'block_name', label: 'Paddock' }, { key: 'crop', label: 'Crop' },
        { key: 'quantity', label: 'Quantity' }, { key: 'unit', label: 'Unit' }, { key: 'grade', label: 'Grade' }, { key: 'buyer', label: 'Buyer' },
      ], harvests);
    } else if (el.dataset.export === 'machinery') {
      const { machines } = await api.get('/api/machinery');
      downloadCsv(`agrilog-machinery-${today()}.csv`, [
        { key: 'machine_name', label: 'Machine' }, { key: 'machine_type', label: 'Type' }, { key: 'hours', label: 'Hours' },
        { key: 'service_due', label: 'Service Due' }, { key: 'status', label: 'Status' },
      ], machines);
    }
  } catch (err) { toastError(err); }
});

wirePaddockJobActions(root, state, { draw, loadScreen });
wireFarmOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/jobs': () => '/jobs',
  '/harvests': () => '/harvests',
  '/chemicals': () => '/chemicals',
  '/machinery': () => '/machinery',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (r) => { state.route = r.pattern || '/'; if (state.session?.access === 'granted') loadScreen(state.route); },
});

async function boot() {
  state.booting = true; state.bootError = ''; draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') router.start(); else draw();
  } catch (err) { state.booting = false; state.bootError = messageOf(err); draw(); }
}
boot();
