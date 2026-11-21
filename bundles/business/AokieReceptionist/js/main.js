// Aokie Receptionist: start-up, telecom micro-icons, turnkey setup/join doors, Midnight-Violet & Electric Cyan shell, grouped nav, calm ticker & CSV exports.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderConsoleView, wireConsoleActions } from './views/console.js';
import { renderSmsView, wireSmsActions } from './views/sms.js';
import { renderBookingsView, renderTasksView, wireDeskActions } from './views/desk.js';
import { renderCustomersView, renderHardwareView, renderAiSettingsView, wireCrmHardwareActions } from './views/crm_hardware.js';

// Register bespoke modern telecom & AI voice micro-icons
addIcons({
  'voice-wave': '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
  'bt-bridge': '<path d="m7 7 10 10-5 4V3l5 4-10 10"/>',
  'ai-prompt': '<rect x="3.5" y="4.5" width="17" height="13" rx="2.5"/><path d="M8.5 17.5 6 20.5v-3M12 8l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/>',
});

export const BRAND_PRESETS = [
  { id: 'teal', label: 'Midnight Violet', accent: '#5b3df5', soft: '#ede9fe', rail: '#0d0a20' },
  { id: 'indigo', label: 'Electric Cyan', accent: '#0891b2', soft: '#ecfeff', rail: '#0b1824' },
  { id: 'violet', label: 'Telecom Plum', accent: '#7c3aed', soft: '#f3e8ff', rail: '#160d2a' },
  { id: 'amber', label: 'Warm Coral', accent: '#e11d48', soft: '#fff1f2', rail: '#1f0d18' },
];

export const ROLES = [
  { id: 'manager', label: 'Front-Desk Manager' },
  { id: 'receptionist', label: 'Receptionist' },
  { id: 'device_admin', label: 'Device Admin' },
  { id: 'viewer', label: 'Viewer' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'teal',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Live Call Console
  calls: [],
  callFilter: 'All',
  callSearch: '',
  selectedCallId: null,
  callDetail: null,
  turnSpeaker: 'Caller',
  // SMS Inbox
  smsThreads: [],
  selectedThreadId: null,
  smsThread: null,
  smsMessages: [],
  smsAiDraftMode: false,
  // Appointments, Orders & Tasks
  bookingsTab: 'appointments',
  appointments: [],
  orders: [],
  tasks: [],
  taskFilter: 'Open',
  // Customers & Hardware & AI Config
  customers: [],
  customerSearch: '',
  customerFilter: 'All',
  hardwareEvents: [],
  hwFilter: 'All',
  aiConfig: null,
  team: [],
  loading: true,
};

const NAV = [
  { path: '/', label: 'Live Call Console', mobileLabel: 'Calls', icon: 'voice-wave', badge: (c) => c?.liveCalls || 0 },
  { path: '/sms', label: 'SMS Inbox', mobileLabel: 'SMS', icon: 'chat', badge: (c) => (c?.unreadSms || 0) + (c?.pendingDrafts || 0), alert: true },
  { path: '/bookings', label: 'Bookings & Orders', mobileLabel: 'Bookings', icon: 'calendar', badge: (c) => (c?.pendingAppts || 0) + (c?.openOrders || 0) },
  { path: '/tasks', label: 'Follow-Up Tasks', mobileLabel: 'Tasks', icon: 'check-square', badge: (c) => c?.openTasks || 0, alert: true },
  { path: '/customers', label: 'Callers CRM', mobileLabel: 'Callers', icon: 'users' },
  { path: '/hardware', label: 'Hardware & Bridge', mobileLabel: 'Bridge', icon: 'bt-bridge', badge: (c) => c?.hwAlerts || 0, alert: true },
  { path: '/ai-settings', label: 'AI Persona & Routing', mobileLabel: 'Persona', icon: 'ai-prompt' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'teal');
  }
  return s;
}

export async function loadCallDetail(callId) {
  if (!callId) { state.callDetail = null; return; }
  state.selectedCallId = Number(callId);
  state.callDetail = await api.get('/api/calls/detail', { id: state.selectedCallId });
}

export async function loadSmsThread(threadId, { markRead = true } = {}) {
  if (!threadId) { state.smsThread = null; state.smsMessages = []; return; }
  state.selectedThreadId = Number(threadId);
  const res = await api.get('/api/sms/messages', { thread_id: state.selectedThreadId });
  state.smsThread = res.thread;
  state.smsMessages = res.messages || [];
  if (markRead && state.smsThread && Number(state.smsThread.unread_count) > 0) {
    const rd = await api.post('/api/sms/read', { thread_id: state.selectedThreadId });
    state.smsThread = rd.thread;
    const item = state.smsThreads.find((t) => t.id === state.selectedThreadId);
    if (item) item.unread_count = 0;
    if (rd.counts && state.session) state.session.counts = rd.counts;
  }
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [res, tk, thr, hw] = await Promise.all([
        api.get('/api/calls', { status: state.callFilter }),
        api.get('/api/tasks'),
        api.get('/api/sms/threads'),
        api.get('/api/hardware'),
      ]);
      state.calls = res.calls || [];
      state.tasks = tk.tasks || [];
      state.smsThreads = thr.threads || [];
      state.hardwareEvents = hw.events || [];
      const pick = state.calls.find((c) => c.id === state.selectedCallId) || state.calls[0];
      if (pick) await loadCallDetail(pick.id);
      else { state.selectedCallId = null; state.callDetail = null; }
    } else if (path === '/sms') {
      const res = await api.get('/api/sms/threads');
      state.smsThreads = res.threads || [];
      const wanted = state.query.thread ? Number(state.query.thread) : state.selectedThreadId;
      const pick = state.smsThreads.find((t) => t.id === wanted) || state.smsThreads[0];
      if (pick) await loadSmsThread(pick.id, { markRead: true });
      else { state.selectedThreadId = null; state.smsThread = null; state.smsMessages = []; }
    } else if (path === '/bookings') {
      const [ap, od] = await Promise.all([api.get('/api/appointments'), api.get('/api/orders')]);
      state.appointments = ap.appointments || [];
      state.orders = od.orders || [];
    } else if (path === '/tasks') {
      const tk = await api.get('/api/tasks');
      state.tasks = tk.tasks || [];
    } else if (path === '/customers') {
      const cu = await api.get('/api/customers', { q: state.customerSearch });
      state.customers = cu.customers || [];
    } else if (path === '/hardware') {
      const hw = await api.get('/api/hardware');
      state.hardwareEvents = hw.events || [];
    } else if (path === '/ai-settings') {
      const cfg = await api.get('/api/receptionist');
      state.aiConfig = cfg.config;
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
  if (state.route === '/') return renderConsoleView(state);
  if (state.route === '/sms') return renderSmsView(state);
  if (state.route === '/bookings') return renderBookingsView(state);
  if (state.route === '/tasks') return renderTasksView(state);
  if (state.route === '/customers') return renderCustomersView(state);
  if (state.route === '/hardware') return renderHardwareView(state);
  if (state.route === '/ai-settings') return renderAiSettingsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'calls', label: 'Export Call Log CSV' },
        { id: 'appointments', label: 'Export Appointments CSV' },
        { id: 'tasks', label: 'Export Follow-Up Tasks CSV' },
        { id: 'customers', label: 'Export Callers CRM CSV' },
      ],
    });
  }
  return renderConsoleView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('headset', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Aokie Receptionist…</h1><p class="tk-door__sub">Connecting to your front-desk call &amp; SMS console.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Aokie Receptionist could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Aokie Receptionist is not set up yet</h1><p class="tk-muted">Ask the business owner to complete initial front-desk setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Aokie Receptionist',
      tagline: 'AI phone receptionist console: live call queue & structured transcripts, two-pane SMS inbox with AI draft replies, bookings, orders, tasks & dongle diagnostics.',
      iconName: 'headset',
      defaultBusiness: 'Harbourside Dental & Wellness',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <label class="k-field">
          <span class="k-field__label">Main Front-Desk Phone Line <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="phone" value="+61 2 9000 4120" placeholder="+61 2 9000 4120">
        </label>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Aokie Receptionist',
      iconName: 'headset',
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
  const smsPending = (counts.unreadSms || 0) + (counts.pendingDrafts || 0);

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('headset', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.phone || settings.tagline || 'AI Front Desk'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Front Desk</div>
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
        <div class="tk-nav__group">Directory &amp; System</div>
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
            ${icon('settings', { size: 18 })}<span>Business Settings</span>
          </a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'Desk')}</span>
            <span>
              <span class="tk-user-chip__name">${s.me.displayName || 'Desk'}</span>
              <span class="tk-user-chip__role">${s.me.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="ak-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.liveCalls > 0 ? '#22d3ee' : '#10b981'}"></span>
            <span>${counts.liveCalls > 0 ? `${counts.liveCalls} Live Call${counts.liveCalls === 1 ? '' : 's'}` : 'Bridge Ready'}</span>
            <span class="tk-muted">· ${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ak-ticker__pill ak-ticker__pill--cyan">${icon('voice-wave', { size: 13 })} Live Desk</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/sms' && smsPending > 0 ? html`
              <a href="#/sms" class="ak-ticker__pill ak-ticker__pill--alert">${icon('chat', { size: 13 })} ${smsPending} SMS</a>` : ''}
            ${state.route !== '/hardware' && (counts.hwAlerts || 0) > 0 ? html`
              <a href="#/hardware" class="ak-ticker__pill ak-ticker__pill--alert">${icon('bt-bridge', { size: 13 })} ${counts.hwAlerts} Bridge Alert</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/customers" class="ak-ticker__pill">${icon('users', { size: 13 })} Callers</a>
              <a href="#/ai-settings" class="ak-ticker__pill">${icon('ai-prompt', { size: 13 })} Persona</a>` : ''}
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
    toast.success('Aokie Receptionist is live!');
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
  try { await api.post('/api/team/join', vals); state.setupBusy = false; await boot(); }
  catch (err) { state.setupBusy = false; state.setupError = messageOf(err); draw(); }
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
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample front-desk calls & SMS threads loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real calls, bookings and SMS threads remain.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear'); toast.success('Sample data cleared.'); await loadScreen(); }
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will lose front-desk console access.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'calls') {
      const { calls } = await api.get('/api/calls');
      downloadCsv(`aokie-calls-${today()}.csv`, [
        { key: 'call_code', label: 'Call #' }, { key: 'caller_name', label: 'Caller' },
        { key: 'caller_phone', label: 'Phone' }, { key: 'direction', label: 'Direction' },
        { key: 'status', label: 'Status' }, { key: 'duration_seconds', label: 'Duration (s)' },
        { key: 'intent', label: 'Intent' }, { key: 'sentiment', label: 'Sentiment' }, { key: 'summary', label: 'AI Summary' },
      ], calls);
    } else if (kind === 'appointments') {
      const { appointments } = await api.get('/api/appointments');
      downloadCsv(`aokie-appointments-${today()}.csv`, [
        { key: 'caller_name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
        { key: 'service', label: 'Service' }, { key: 'appt_date', label: 'Date' },
        { key: 'appt_time', label: 'Time' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source' },
      ], appointments);
    } else if (kind === 'tasks') {
      const { tasks } = await api.get('/api/tasks');
      downloadCsv(`aokie-tasks-${today()}.csv`, [
        { key: 'summary', label: 'Task' }, { key: 'phone', label: 'Phone' },
        { key: 'priority', label: 'Priority' }, { key: 'due_at', label: 'Due' },
        { key: 'status', label: 'Status' }, { key: 'assignee', label: 'Assignee' },
      ], tasks);
    } else if (kind === 'customers') {
      const { customers } = await api.get('/api/customers');
      downloadCsv(`aokie-customers-${today()}.csv`, [
        { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' }, { key: 'status', label: 'Status' },
        { key: 'sms_capable', label: 'SMS Capable' }, { key: 'preferred_service', label: 'Preferred Service' },
      ], customers);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/sms': () => '/sms',
  '/bookings': () => '/bookings',
  '/tasks': () => '/tasks',
  '/customers': () => '/customers',
  '/hardware': () => '/hardware',
  '/ai-settings': () => '/ai-settings',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, loadCallDetail, loadSmsThread, go: (p, q) => router.go(p, q) };
wireConsoleActions(root, state, ctx);
wireSmsActions(root, state, ctx);
wireDeskActions(root, state, ctx);
wireCrmHardwareActions(root, state, ctx);

async function boot() {
  state.booting = true;
  state.bootError = '';
  draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') {
      state.loading = true;
      router.start();
    } else {
      state.loading = false;
      draw();
    }
  } catch (err) {
    state.booting = false;
    state.bootError = messageOf(err);
    draw();
  }
}

boot();
