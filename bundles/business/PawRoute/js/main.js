// PawRoute: startup, bespoke pet-care micro-icons, grouped Meadow Forest & Terracotta shell, ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderRunsheetView, wireRunsheetActions } from './views/runsheet.js';
import { renderPetsView, renderClientsView, wirePetClientActions } from './views/pets.js';
import { renderWalkersView, renderIncidentsView, wireOpsActions } from './views/ops.js';

// Register bespoke pet-care micro-icons
addIcons({
  'leash-route': '<circle cx="6.5" cy="7.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/><path d="M9 8.5c3.5 1 2.5 6 6 7M17.5 14v-3.5a2 2 0 0 0-2-2h-2"/>',
  'pet-bowl': '<path d="M4.5 14.5h15l1.2 4a1 1 0 0 1-1 1.3H4.3a1 1 0 0 1-1-1.3l1.2-4zM8 14.5a4 4 0 0 1 8 0"/>',
  'med-cross': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
});

export const BRAND_PRESETS = [
  { id: 'emerald', label: 'Meadow Forest', accent: '#1b6a48', soft: '#def7e8', rail: '#0f241a' },
  { id: 'bark', label: 'Terracotta Paw', accent: '#c95c36', soft: '#fceded', rail: '#261812' },
  { id: 'meadow', label: 'Park Teal', accent: '#0f766e', soft: '#ccfbf1', rail: '#102624' },
  { id: 'berry', label: 'Berry Collar', accent: '#be185d', soft: '#fce7f3', rail: '#2a1622' },
];

export const ROLES = [
  { id: 'manager', label: 'Studio Manager' },
  { id: 'dispatcher', label: 'Dispatcher' },
  { id: 'walker', label: 'Walker' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'emerald',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  walks: [],
  pets: [],
  clients: [],
  walkers: [],
  incidents: [],
  team: [],
  // Filters
  walkDate: today(),
  walkWalkerFilter: 'All',
  walkStatusFilter: 'All',
  petSearch: '',
  petFilter: 'All',
  clientSearch: '',
  incidentFilter: 'All',
};

const NAV = [
  { path: '/', label: 'Daily Run-Sheet', mobileLabel: 'Walks', icon: 'leash-route', badge: (c) => c?.walksToday || 0 },
  { path: '/pets', label: 'Pet Profiles', mobileLabel: 'Pets', icon: 'paw', badge: (c) => c?.activePets || 0 },
  { path: '/clients', label: 'Owners & Access', mobileLabel: 'Owners', icon: 'users', badge: (c) => c?.overdueBilling || 0, alert: true },
  { path: '/walkers', label: 'Walkers Roster', mobileLabel: 'Walkers', icon: 'calendar' },
  { path: '/incidents', label: 'Safety & Notes', mobileLabel: 'Safety', icon: 'med-cross', badge: (c) => c?.openIncidents || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'emerald');
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
      const [wk, p, wkr, inc] = await Promise.all([
        api.get('/api/walks', { day: state.walkDate }),
        api.get('/api/pets'),
        api.get('/api/walkers', { day: state.walkDate }),
        api.get('/api/incidents'),
      ]);
      state.walks = wk.walks || [];
      state.pets = p.pets || [];
      state.walkers = wkr.walkers || [];
      state.incidents = inc.incidents || [];
    } else if (path === '/pets') {
      const [p, c, wkr] = await Promise.all([
        api.get('/api/pets'),
        api.get('/api/clients'),
        api.get('/api/walkers', { day: today() }),
      ]);
      state.pets = p.pets || [];
      state.clients = c.clients || [];
      state.walkers = wkr.walkers || [];
    } else if (path === '/clients') {
      const c = await api.get('/api/clients');
      state.clients = c.clients || [];
    } else if (path === '/walkers') {
      const wkr = await api.get('/api/walkers', { day: today() });
      state.walkers = wkr.walkers || [];
    } else if (path === '/incidents') {
      const [inc, p, wkr] = await Promise.all([
        api.get('/api/incidents'),
        api.get('/api/pets'),
        api.get('/api/walkers', { day: today() }),
      ]);
      state.incidents = inc.incidents || [];
      state.pets = p.pets || [];
      state.walkers = wkr.walkers || [];
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
  if (state.route === '/') return renderRunsheetView(state);
  if (state.route === '/pets') return renderPetsView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/walkers') return renderWalkersView(state);
  if (state.route === '/incidents') return renderIncidentsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'walks', label: 'Export Walks CSV' },
        { id: 'pets', label: 'Export Pets CSV' },
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'incidents', label: 'Export Incidents CSV' },
      ],
    });
  }
  return renderRunsheetView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('paw', { size: 26 })}</div><div><h1 class="tk-door__title">Opening PawRoute…</h1><p class="tk-door__sub">Connecting to your private pet-care workspace.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">PawRoute could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">PawRoute is not set up yet</h1><p class="tk-muted">Ask the studio manager to open PawRoute first and finish initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'PawRoute',
      tagline: 'Run daily dog walks, drop-ins & pet sits with temperament safety badges, feeding & medical cards, copyable home access codes, and 1-click owner updates.',
      iconName: 'paw',
      defaultBusiness: 'GreenPark Dog Walking & Care',
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
      appName: 'PawRoute',
      iconName: 'paw',
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
          <span class="tk-brand__mark">${icon('paw', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Dog Walking & Pet Care'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Daily Walks</div>
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
        <div class="tk-nav__group">Pack &amp; Safety</div>
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
          <div class="pr-ticker">
            <span class="tk-pulse-dot" style="--dot:#e07a47"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="pr-ticker__pill">${icon('leash-route', { size: 13 })} Run-Sheet (${counts.walksToday || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/incidents' && counts.openIncidents > 0 ? html`
              <a href="#/incidents" class="pr-ticker__pill pr-ticker__pill--alert">${icon('med-cross', { size: 13 })} ${counts.openIncidents} Follow-Up${counts.openIncidents === 1 ? '' : 's'}</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/pets" class="pr-ticker__pill">${icon('paw', { size: 13 })} Pets (${counts.activePets || 0})</a>
              <a href="#/clients" class="pr-ticker__pill">${icon('users', { size: 13 })} Owners</a>` : ''}
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
    toast.success('PawRoute is live! Your walk run-sheet is ready.');
    state.setupBusy = false;
    state.walkDate = today();
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
    toast.success('Sample pet-care data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all example records tagged Sample. Your real clients, pets and walks remain untouched.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'walks') {
      const { walks } = await api.get('/api/walks');
      downloadCsv(`pawroute-walks-${today()}.csv`, [
        { key: 'walk_date', label: 'Date' }, { key: 'walk_time', label: 'Time' },
        { key: 'pet_name', label: 'Pet' }, { key: 'client_name', label: 'Client' },
        { key: 'walker_name', label: 'Walker' }, { key: 'service_type', label: 'Service' },
        { key: 'duration', label: 'Duration' }, { key: 'status', label: 'Status' },
        { label: 'Charge', get: (r) => (r.charge_cents / 100).toFixed(2) },
      ], walks);
    } else if (kind === 'pets') {
      const { pets } = await api.get('/api/pets');
      downloadCsv(`pawroute-pets-${today()}.csv`, [
        { key: 'name', label: 'Pet' }, { key: 'species', label: 'Species' },
        { key: 'breed', label: 'Breed' }, { key: 'size', label: 'Size' },
        { key: 'owner_name', label: 'Owner' }, { label: 'Temperament', get: (r) => (r.temperament || []).join('; ') },
        { key: 'medical_notes', label: 'Medical Notes' }, { key: 'feeding_instructions', label: 'Feeding' },
      ], pets);
    } else if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`pawroute-clients-${today()}.csv`, [
        { key: 'name', label: 'Client' }, { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' },
        { key: 'billing_status', label: 'Billing' }, { key: 'access_instructions', label: 'Home Access' },
        { key: 'emergency_contact', label: 'Emergency Contact' },
      ], clients);
    } else if (kind === 'incidents') {
      const { incidents } = await api.get('/api/incidents');
      downloadCsv(`pawroute-incidents-${today()}.csv`, [
        { key: 'pet_name', label: 'Pet' }, { key: 'incident_type', label: 'Type' },
        { key: 'severity', label: 'Severity' }, { key: 'follow_up', label: 'Follow-up' },
        { key: 'description', label: 'Description' }, { key: 'action_taken', label: 'Action Taken' },
      ], incidents);
    }
  } catch (err) { toastError(err); }
});

wireRunsheetActions(root, state, { draw, loadScreen });
wirePetClientActions(root, state, { draw, loadScreen });
wireOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/pets': () => '/pets',
  '/clients': () => '/clients',
  '/walkers': () => '/walkers',
  '/incidents': () => '/incidents',
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
