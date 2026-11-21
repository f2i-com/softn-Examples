// FitStudio: startup, athletic micro-icons, grouped nav, calm ticker, Obsidian-Lime-Cobalt shell, routes & settings.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderSessionsView, wireSessionsActions } from './views/sessions.js';
import { renderClientsView, wireClientsActions } from './views/clients.js';
import { renderAssessmentsView, renderProgramsView, wireProgramsActions } from './views/programs.js';
import { renderTrainersView, renderPaymentsView, wireStudioActions } from './views/studio.js';

// Register bespoke athletic studio micro-icons
addIcons({
  barbell: '<path d="M2 12h20M5 8v8M7.5 6.5v11M16.5 6.5v11M19 8v8"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7"/><path d="M9.5 3.5h5M12 3.5v3M12 13.5l3-2.5M17.5 7.5l1.5-1.5"/>',
  kettlebell: '<path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/><path d="M6.5 11.5a5.5 5.5 0 0 1 11 0c0 3.8-1.8 8-5.5 8s-5.5-4.2-5.5-8z"/>',
});

export const BRAND_PRESETS = [
  { id: 'studio-emerald', label: 'Obsidian Cobalt', accent: '#1d4ed8', soft: '#dbeafe', rail: '#090e19' },
  { id: 'cobalt-iron', label: 'Studio Emerald', accent: '#059669', soft: '#d1fae5', rail: '#0a1915' },
  { id: 'graphite-flame', label: 'Graphite Flame', accent: '#dc2626', soft: '#fee2e2', rail: '#18181b' },
  { id: 'amber-kettlebell', label: 'Amber Kettlebell', accent: '#d97706', soft: '#fef3c7', rail: '#1c1917' },
];

export const ROLES = [
  { id: 'manager', label: 'Studio Manager' },
  { id: 'coach', label: 'Coach / Trainer' },
  { id: 'front_desk', label: 'Front Desk' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'studio-emerald',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Caches
  sessions: [],
  clients: [],
  trainers: [],
  assessments: [],
  programs: [],
  payments: [],
  paymentSummary: null,
  team: [],
  // UI filters
  sessionScope: 'Upcoming',
  sessionStatusFilter: 'All',
  sessionSearch: '',
  trainerFilter: 'All',
  clientSearch: '',
  clientStatusFilter: 'All',
  selectedClientId: null,
  dossier: null,
  assessClientFilter: 'All',
  programStatusFilter: 'All',
  programSearch: '',
  paymentStatusFilter: 'All',
};

const NAV = [
  { path: '/', label: 'Session Board', mobileLabel: 'Sessions', icon: 'barbell', badge: (c) => c?.todaySessions || 0 },
  { path: '/clients', label: 'Clients & Dossiers', mobileLabel: 'Clients', icon: 'users', badge: (c) => c?.activeClients || 0 },
  { path: '/programs', label: 'Programs', mobileLabel: 'Programs', icon: 'zap', badge: (c) => c?.activePrograms || 0 },
  { path: '/assessments', label: 'Assessments', mobileLabel: 'Metrics', icon: 'trending' },
  { path: '/trainers', label: 'Trainers', mobileLabel: 'Coaches', icon: 'award' },
  { path: '/payments', label: 'Payments & Packs', mobileLabel: 'Packs', icon: 'dollar', badge: (c) => c?.pendingPaymentsCount || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'studio-emerald');
  }
  return s;
}

export async function loadClientDossier(clientId) {
  if (!clientId) { state.dossier = null; return; }
  state.selectedClientId = Number(clientId);
  state.dossier = await api.get('/api/clients/dossier', { id: state.selectedClientId });
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [se, tr, cl, as, pr] = await Promise.all([
        api.get('/api/sessions', state.sessionScope === 'All' ? {} : { from: today() }),
        api.get('/api/trainers', { today: today() }),
        api.get('/api/clients'),
        api.get('/api/assessments'),
        api.get('/api/programs'),
      ]);
      state.sessions = se.sessions || [];
      state.trainers = tr.trainers || [];
      state.clients = cl.clients || [];
      state.assessments = as.assessments || [];
      state.programs = pr.programs || [];
    } else if (path === '/clients') {
      const [cl, tr] = await Promise.all([api.get('/api/clients'), api.get('/api/trainers', { today: today() })]);
      state.clients = cl.clients || [];
      state.trainers = tr.trainers || [];
      const pick = state.selectedClientId && state.clients.some((c) => c.id === state.selectedClientId)
        ? state.selectedClientId
        : (state.clients[0] ? state.clients[0].id : null);
      if (pick) await loadClientDossier(pick);
      else { state.selectedClientId = null; state.dossier = null; }
    } else if (path === '/assessments') {
      const [as, cl] = await Promise.all([api.get('/api/assessments'), api.get('/api/clients')]);
      state.assessments = as.assessments || [];
      state.clients = cl.clients || [];
    } else if (path === '/programs') {
      const [pr, cl] = await Promise.all([api.get('/api/programs'), api.get('/api/clients')]);
      state.programs = pr.programs || [];
      state.clients = cl.clients || [];
    } else if (path === '/trainers') {
      const tr = await api.get('/api/trainers', { today: today() });
      state.trainers = tr.trainers || [];
    } else if (path === '/payments') {
      const [py, cl] = await Promise.all([api.get('/api/payments', { today: today() }), api.get('/api/clients')]);
      state.payments = py.payments || [];
      state.paymentSummary = py.summary || null;
      state.clients = cl.clients || [];
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
  if (state.route === '/') return renderSessionsView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/assessments') return renderAssessmentsView(state);
  if (state.route === '/programs') return renderProgramsView(state);
  if (state.route === '/trainers') return renderTrainersView(state);
  if (state.route === '/payments') return renderPaymentsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'sessions', label: 'Export Sessions CSV' },
        { id: 'assessments', label: 'Export Assessments CSV' },
        { id: 'payments', label: 'Export Payments CSV' },
      ],
    });
  }
  return renderSessionsView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('barbell', { size: 26 })}</div><div><h1 class="tk-door__title">Opening FitStudio…</h1><p class="tk-door__sub">Loading your private studio coaching database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">FitStudio could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">FitStudio is not set up yet</h1><p class="tk-muted">Ask the studio owner to open FitStudio first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'FitStudio',
      tagline: 'Run daily PT & small-group sessions, track automatic body-composition deltas, build structured training blocks, and manage packs & memberships.',
      iconName: 'barbell',
      defaultBusiness: 'Ironleaf Performance Studio',
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
      appName: 'FitStudio',
      iconName: 'barbell',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[5], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('barbell', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Coaching Operations'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Coaching Floor</div>
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
        <div class="tk-nav__group">Performance &amp; Studio</div>
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
          <div class="fs-ticker">
            <span class="tk-pulse-dot" style="--dot:#a3e635"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="fs-ticker__pill">${icon('barbell', { size: 13 })} Floor (${counts.todaySessions || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/payments' && counts.pendingPaymentsCount > 0 ? html`
              <a href="#/payments" class="fs-ticker__pill fs-ticker__pill--alert">${icon('dollar', { size: 13 })} ${counts.pendingPaymentsCount} Pending Pack${counts.pendingPaymentsCount === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/assessments' ? html`
              <a href="#/assessments" class="fs-ticker__pill">${icon('trending', { size: 13 })} Assessments</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/programs" class="fs-ticker__pill">${icon('zap', { size: 13 })} Programs (${counts.activePrograms || 0})</a>` : ''}
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
    toast.success('FitStudio is live!');
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
    toast.success('Studio settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample studio data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample records while keeping your real studio data safe.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Coach approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (event, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will lose access to this FitStudio workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`fitstudio-clients-${today()}.csv`, [
        { key: 'name', label: 'Client' }, { key: 'goal', label: 'Goal' }, { key: 'status', label: 'Status' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'medical_notes', label: 'Medical Notes' }, { key: 'emergency_contact', label: 'Emergency Contact' },
      ], clients);
    } else if (kind === 'sessions') {
      const { sessions } = await api.get('/api/sessions');
      downloadCsv(`fitstudio-sessions-${today()}.csv`, [
        { key: 'session_date', label: 'Date' }, { key: 'session_time', label: 'Time' },
        { key: 'client_name', label: 'Client' }, { key: 'trainer_name', label: 'Trainer' },
        { key: 'session_type', label: 'Type' }, { key: 'status', label: 'Status' },
        { label: 'Fee', get: (r) => (r.fee_cents / 100).toFixed(2) },
      ], sessions);
    } else if (kind === 'assessments') {
      const { assessments } = await api.get('/api/assessments');
      downloadCsv(`fitstudio-assessments-${today()}.csv`, [
        { key: 'assessment_date', label: 'Date' }, { key: 'client_name', label: 'Client' },
        { key: 'weight_kg', label: 'Weight (kg)' }, { key: 'body_fat_pct', label: 'Body Fat (%)' },
        { key: 'mobility_score', label: 'Mobility (1-5)' }, { key: 'strength_notes', label: 'Strength Notes' },
      ], assessments);
    } else if (kind === 'payments') {
      const { payments } = await api.get('/api/payments', { today: today() });
      downloadCsv(`fitstudio-payments-${today()}.csv`, [
        { key: 'payment_date', label: 'Date' }, { key: 'client_name', label: 'Client' },
        { key: 'payment_type', label: 'Type' }, { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
      ], payments);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/assessments': () => '/assessments',
  '/programs': () => '/programs',
  '/trainers': () => '/trainers',
  '/payments': () => '/payments',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, loadClientDossier, router };
wireSessionsActions(root, state, ctx);
wireClientsActions(root, state, ctx);
wireProgramsActions(root, state, ctx);
wireStudioActions(root, state, ctx);

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
