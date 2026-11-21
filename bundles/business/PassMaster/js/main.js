// PassMaster: startup, custom bistro micro-icons, turnkey setup/join doors, Bistro Marlowe Burgundy & Brass shell, routing & global actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderFloorView, wireFloorActions } from './views/floor.js';
import { renderReservationsView, wireReservationsActions } from './views/reservations.js';
import { renderPassView, wirePassActions } from './views/pass.js';
import { renderPrepView, renderRosterView, renderCloseView, wireOpsActions } from './views/ops.js';

// Register bespoke fine-bistro micro-icons for floor, wine bar & expediter pass
addIcons({
  cloche: '<path d="M3.5 17.5h17M5 17.5a7 7 0 0 1 14 0M12 10.5V8.5M10.5 8.5h3M2.5 20h19"/>',
  wine: '<path d="M8 3.5h8l-.8 6a3.5 3.5 0 0 1-3.2 3 3.5 3.5 0 0 1-3.2-3L8 3.5zM12 12.5V20M8.5 20h7"/>',
  'table-seat': '<circle cx="12" cy="12" r="4.5"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
});

export const BRAND_PRESETS = [
  { id: 'burgundy', label: 'Bistro Burgundy', accent: '#8c1d37', soft: '#fae9ee', rail: '#1a1216' },
  { id: 'olive', label: 'Olive Trattoria', accent: '#4d6b2a', soft: '#ecfccb', rail: '#1e2816' },
  { id: 'navy', label: 'Navy Brasserie', accent: '#1e3a5f', soft: '#dbeafe', rail: '#121c2e' },
  { id: 'slate', label: 'Slate Steakhouse', accent: '#334155', soft: '#e2e8f0', rail: '#151b24' },
];

export const ROLES = [
  { id: 'manager', label: 'Floor Manager' },
  { id: 'server', label: 'Server' },
  { id: 'kitchen', label: 'Kitchen / Chef' },
  { id: 'bartender', label: 'Bartender' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'burgundy',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain state
  tables: [],
  staff: [],
  reservations: [],
  tickets: [],
  prep: [],
  closes: [],
  todayCloseSummary: null,
  team: [],
  // Filters & interactive UI state
  floorSection: 'All',
  floorStatusFilter: 'All',
  resDateFilter: today(),
  resShowAll: false,
  resStatusFilter: 'All',
  resSearch: '',
  passCourse: 'All',
  passAllergyOnly: false,
  showServedTickets: false,
  prepStation: 'All',
  prepStatusFilter: 'All',
  rosterRoleFilter: 'All',
  rosterSearch: '',
  closeCovers: '',
  closeSales: '',
  closeVoids: '0.00',
  closeChecks: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'Floor & Tables', mobileLabel: 'Floor', icon: 'table-seat', badge: (c) => c?.seatedTables || 0 },
  { path: '/reservations', label: 'Reservations', mobileLabel: 'Book', icon: 'calendar', badge: (c) => c?.bookedToday || 0 },
  { path: '/pass', label: 'Kitchen Pass', mobileLabel: 'Pass', icon: 'cloche', badge: (c) => c?.openTickets || 0, alert: true },
  { path: '/prep', label: 'Station Prep', mobileLabel: 'Prep', icon: 'check-square', badge: (c) => c?.pendingPrep || 0 },
  { path: '/roster', label: 'Staff Roster', mobileLabel: 'Roster', icon: 'users' },
  { path: '/close', label: 'Shift Close', mobileLabel: 'Close', icon: 'clipboard' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'burgundy');
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
      const [tb, st, rv] = await Promise.all([
        api.get('/api/tables'),
        api.get('/api/staff'),
        api.get('/api/reservations', { date: today() }),
      ]);
      state.tables = tb.tables || [];
      state.staff = st.staff || [];
      state.reservations = rv.reservations || [];
    } else if (path === '/reservations') {
      const [rv, tb] = await Promise.all([
        api.get('/api/reservations', state.resShowAll ? {} : { date: state.resDateFilter || today() }),
        api.get('/api/tables'),
      ]);
      state.reservations = rv.reservations || [];
      state.tables = tb.tables || [];
    } else if (path === '/pass') {
      const [tk, tb, st] = await Promise.all([
        api.get('/api/tickets', { course: '', includeServed: state.showServedTickets ? 1 : 0 }),
        api.get('/api/tables'),
        api.get('/api/staff'),
      ]);
      state.tickets = tk.tickets || [];
      state.tables = tb.tables || [];
      state.staff = st.staff || [];
    } else if (path === '/prep') {
      const [pr, st] = await Promise.all([
        api.get('/api/prep', { station: '' }),
        api.get('/api/staff'),
      ]);
      state.prep = pr.items || [];
      state.staff = st.staff || [];
    } else if (path === '/roster') {
      const [st, tb] = await Promise.all([
        api.get('/api/staff'),
        api.get('/api/tables'),
      ]);
      state.staff = st.staff || [];
      state.tables = tb.tables || [];
    } else if (path === '/close') {
      const cl = await api.get('/api/closes', { today: today() });
      state.closes = cl.closes || [];
      state.todayCloseSummary = cl.todaySummary || null;
      if (state.todayCloseSummary && state.closeCovers === '') {
        state.closeCovers = String(state.todayCloseSummary.suggestedCovers || 0);
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
  if (state.route === '/') return renderFloorView(state);
  if (state.route === '/reservations') return renderReservationsView(state);
  if (state.route === '/pass') return renderPassView(state);
  if (state.route === '/prep') return renderPrepView(state);
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
        { id: 'reservations', label: 'Export Reservations CSV' },
        { id: 'prep', label: 'Export Prep List CSV' },
        { id: 'closes', label: 'Export Shift Closes CSV' },
      ],
    });
  }
  return renderFloorView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('cloche', { size: 26 })}</div><div><h1 class="tk-door__title">Opening PassMaster…</h1><p class="tk-door__sub">Preparing the dining room and kitchen pass.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">PassMaster could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">PassMaster is not set up yet</h1><p class="tk-muted">Ask the restaurant owner to open PassMaster first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'PassMaster',
      tagline: 'Run the interactive dining floor map, seat bookings in one click, fire course tickets with allergy alerts down the pass, track station prep and close out nightly covers.',
      iconName: 'cloche',
      defaultBusiness: 'Maison Verve Bistro',
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
      appName: 'PassMaster',
      iconName: 'cloche',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[3], { path: '/settings', label: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('cloche', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Dining & Kitchen Pass'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Dining Room</div>
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
          <div class="pm-ticker">
            <span class="tk-pulse-dot" style="--dot:#d4a359"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="pm-ticker__pill">${icon('table-seat', { size: 13 })} Floor Map (${counts.seatedCovers || 0} covers)</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/pass' && counts.allergyTickets > 0 ? html`
              <a href="#/pass" class="pm-ticker__pill pm-ticker__pill--allergy">${icon('alert', { size: 13 })} ${counts.allergyTickets} Allergy Alert${counts.allergyTickets === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/' && state.route !== '/pass' ? html`
              <a href="#/pass" class="pm-ticker__pill">${icon('cloche', { size: 13 })} Kitchen Pass (${counts.openTickets || 0})</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/roster" class="pm-ticker__pill">${icon('users', { size: 13 })} Brigade</a>
              <a href="#/close" class="pm-ticker__pill">${icon('clipboard', { size: 13 })} Shift Close</a>` : ''}
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
    toast.success('PassMaster is live for service!');
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
    toast.success('Restaurant settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample restaurant service loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your own real records remain untouched.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Brigade member approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (event, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to PassMaster.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'reservations') {
      const { reservations } = await api.get('/api/reservations');
      downloadCsv(`passmaster-reservations-${today()}.csv`, [
        { key: 'res_date', label: 'Date' }, { key: 'res_time', label: 'Time' },
        { key: 'guest_name', label: 'Guest' }, { key: 'party_size', label: 'Party' },
        { key: 'table_pref', label: 'Preference' }, { key: 'assigned_table_number', label: 'Table' },
        { key: 'status', label: 'Status' }, { key: 'phone', label: 'Phone' }, { key: 'notes', label: 'Notes' },
      ], reservations);
    } else if (kind === 'prep') {
      const { items } = await api.get('/api/prep');
      downloadCsv(`passmaster-prep-${today()}.csv`, [
        { key: 'station', label: 'Station' }, { key: 'prep_item', label: 'Prep Item' },
        { key: 'quantity_needed', label: 'Qty' }, { key: 'unit', label: 'Unit' },
        { key: 'due_by', label: 'Due By' }, { key: 'assigned_to_name', label: 'Assigned To' }, { key: 'status', label: 'Status' },
      ], items);
    } else if (kind === 'closes') {
      const { closes } = await api.get('/api/closes');
      downloadCsv(`passmaster-closes-${today()}.csv`, [
        { key: 'close_date', label: 'Date' }, { key: 'covers_served', label: 'Covers' },
        { label: 'Sales', get: (r) => (r.sales_cents / 100).toFixed(2) },
        { label: 'Voids/Comps', get: (r) => (r.voids_comps_cents / 100).toFixed(2) },
        { key: 'manager_signoff', label: 'Signed Off By' }, { key: 'incidents', label: 'Incidents' },
      ], closes);
    }
  } catch (err) { toastError(err); }
});

wireFloorActions(root, state, { draw, loadScreen });
wireReservationsActions(root, state, { draw, loadScreen });
wirePassActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/reservations': () => '/reservations',
  '/pass': () => '/pass',
  '/prep': () => '/prep',
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
