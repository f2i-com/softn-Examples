// Event Hub: turnkey setup/join doors, Stage Obsidian, Royal Magenta & Champagne Spotlight shell, grouped nav, bespoke icons & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderCommandView, renderCheckInView, wireCheckInActions } from './views/command.js';
import { renderSpeakersView, renderVendorsView, renderVolunteersView, wireProgramActions } from './views/program.js';
import { renderBudgetView, renderIncidentsView, renderFeedbackView, wireEventOpsActions } from './views/ops.js';

// Bespoke Event Production micro-icons
addIcons({
  spotlight: '<path d="M5 4h14M8.5 4v2.5L5 18h14L15.5 6.5V4M4 20h16"/>',
  'stage-mic': '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20.5M9 20.5h6"/>',
  'cue-sheet': '<path d="M8 6h11M8 12h11M8 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
});

export const BRAND_PRESETS = [
  { id: 'plum', label: 'Obsidian Magenta', accent: '#9b1cb8', soft: '#f5e6fe', rail: '#120b1f' },
  { id: 'coral', label: 'Spotlight Rose', accent: '#db2777', soft: '#ffe4ef', rail: '#220b19' },
  { id: 'gala', label: 'Stage Indigo', accent: '#4338ca', soft: '#e8ebff', rail: '#111530' },
  { id: 'expo', label: 'Festival Teal', accent: '#0d9488', soft: '#d5f6f1', rail: '#0e2226' },
];

export const ROLES = [
  { id: 'manager', label: 'Event Manager' },
  { id: 'coordinator', label: 'Stage / Floor Coordinator' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'plum',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain state
  command: null,
  attendees: [],
  speakers: [],
  vendors: [],
  volunteers: [],
  shirtCounts: {},
  budget: [],
  budgetSummary: null,
  incidents: [],
  feedback: [],
  feedbackSummary: null,
  team: [],
  // Filters
  cueFilter: 'All',
  attSearch: '',
  attTicket: 'All',
  attCheckIn: 'All',
  attAlertsOnly: false,
  speakerFilter: 'All',
  vendorFilter: 'All',
  budgetCat: 'All',
  incidentFilter: 'Open',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Event Command', mobileLabel: 'Command', icon: 'spotlight' },
  { path: '/checkin', label: 'Check-In Desk', mobileLabel: 'Check-In', icon: 'ticket', badge: (c) => c?.totalRegistrations || 0 },
  { path: '/speakers', label: 'Speakers', mobileLabel: 'Speakers', icon: 'stage-mic', badge: (c) => c?.confirmedSpeakers || 0 },
  { path: '/vendors', label: 'Vendors & Booths', mobileLabel: 'Vendors', icon: 'store', badge: (c) => c?.assignedBooths || 0 },
  { path: '/volunteers', label: 'Volunteers', mobileLabel: 'Crew', icon: 'users' },
  { path: '/budget', label: 'Budget', mobileLabel: 'Budget', icon: 'dollar' },
  { path: '/incidents', label: 'Incident Log', mobileLabel: 'Safety', icon: 'alert', badge: (c) => c?.openIncidents || 0, alert: true },
  { path: '/feedback', label: 'Feedback', mobileLabel: 'Ratings', icon: 'star' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'plum');
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
      const [cmd, vol, vnd] = await Promise.all([
        api.get('/api/command'),
        api.get('/api/volunteers'),
        api.get('/api/vendors'),
      ]);
      state.command = cmd;
      state.volunteers = vol.volunteers || [];
      state.shirtCounts = vol.shirtCounts || {};
      state.vendors = vnd.vendors || [];
    } else if (path === '/checkin') {
      const r = await api.get('/api/attendees');
      state.attendees = r.attendees || [];
    } else if (path === '/speakers') {
      const r = await api.get('/api/speakers');
      state.speakers = r.speakers || [];
    } else if (path === '/vendors') {
      const r = await api.get('/api/vendors');
      state.vendors = r.vendors || [];
    } else if (path === '/volunteers') {
      const r = await api.get('/api/volunteers');
      state.volunteers = r.volunteers || [];
      state.shirtCounts = r.shirtCounts || {};
    } else if (path === '/budget') {
      const r = await api.get('/api/budget');
      state.budget = r.items || [];
      state.budgetSummary = r.summary || null;
    } else if (path === '/incidents') {
      const r = await api.get('/api/incidents');
      state.incidents = r.incidents || [];
    } else if (path === '/feedback') {
      const [fb, att] = await Promise.all([api.get('/api/feedback'), api.get('/api/attendees')]);
      state.feedback = fb.feedback || [];
      state.feedbackSummary = fb.summary || null;
      state.attendees = att.attendees || [];
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

function renderEventDetailsSection(settings, canManage) {
  return html`
    <section class="tk-sheet">
      <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('spotlight', { size: 18 })} Active Event Details</h2></div>
      <div class="tk-sheet__body">
        <form class="k-form" data-form="save-event-details" novalidate>
          <label class="k-field"><span class="k-field__label">Event Title</span>
            <input class="k-input" name="event_title" value="${settings.event_title || ''}" ${canManage ? '' : 'disabled'}>
          </label>
          <div class="k-form__row">
            <label class="k-field"><span class="k-field__label">Event Date</span>
              <input class="k-input" type="date" name="event_date" value="${settings.event_date || today()}" ${canManage ? '' : 'disabled'}>
            </label>
            <label class="k-field"><span class="k-field__label">Venue Name</span>
              <input class="k-input" name="event_venue" value="${settings.event_venue || ''}" ${canManage ? '' : 'disabled'}>
            </label>
          </div>
          ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary">Save event details</button></div>` : ''}
        </form>
      </div>
    </section>`;
}

function renderScreen() {
  if (state.route === '/') return renderCommandView(state);
  if (state.route === '/checkin') return renderCheckInView(state);
  if (state.route === '/speakers') return renderSpeakersView(state);
  if (state.route === '/vendors') return renderVendorsView(state);
  if (state.route === '/volunteers') return renderVolunteersView(state);
  if (state.route === '/budget') return renderBudgetView(state);
  if (state.route === '/incidents') return renderIncidentsView(state);
  if (state.route === '/feedback') return renderFeedbackView(state);
  if (state.route === '/settings') {
    const settings = state.session.settings;
    const me = state.session.me;
    const canManage = me && (me.isOwner || me.role === 'owner' || me.role === 'manager');
    return renderTurnkeySettings({
      settings,
      me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      extraSection: renderEventDetailsSection(settings, canManage),
      exports: [
        { id: 'attendees', label: 'Attendees CSV' },
        { id: 'speakers', label: 'Speakers CSV' },
        { id: 'vendors', label: 'Vendors CSV' },
        { id: 'volunteers', label: 'Volunteers CSV' },
        { id: 'budget', label: 'Budget CSV' },
        { id: 'incidents', label: 'Incidents CSV' },
        { id: 'feedback', label: 'Feedback CSV' },
      ],
    });
  }
  return renderCommandView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('spotlight', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Event Hub…</h1><p class="tk-door__sub">Connecting to your live event production desk.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Event Hub could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Event Hub is not set up yet</h1><p class="tk-muted">Ask the event manager to finish initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Event Hub',
      tagline: 'Run 1-tap check-in with dietary & accessibility alerts, manage speakers, vendor booths, volunteer shifts, live budget variance, and incidents.',
      iconName: 'spotlight',
      defaultBusiness: 'Summit Live Productions',
      defaultCurrency: 'USD',
      defaultZone: 'America/New_York',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Event Title</span><input class="k-input" name="event_title" value="Annual Innovation Summit 2026"></label>
          <label class="k-field"><span class="k-field__label">Venue</span><input class="k-input" name="event_venue" value="Metro Convention Center"></label>
        </div>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Event Hub',
      iconName: 'spotlight',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[6], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('spotlight', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.event_title || settings.tagline || 'Event Production'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Show Floor &amp; Program</div>
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
        <div class="tk-nav__group">Crew &amp; Operations</div>
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
          <a href="#/" class="tk-topbar__brand">${settings.event_title || settings.business_name}</a>
          <div class="ev-ticker">
            <span class="tk-pulse-dot" style="--dot:#f3c969"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ev-ticker__pill">${icon('spotlight', { size: 13 })} Command</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/incidents' && counts.openIncidents > 0 ? html`
              <a href="#/incidents" class="ev-ticker__pill ev-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.openIncidents} Incident${counts.openIncidents === 1 ? '' : 's'}</a>` : ''}
            ${state.route !== '/checkin' ? html`
              <a href="#/checkin" class="ev-ticker__pill">${icon('ticket', { size: 13 })} Check-In (${counts.checkInPct || 0}%)</a>` : ''}
            ${state.route !== '/budget' ? html`
              <a href="#/budget" class="ev-ticker__pill">${icon('dollar', { size: 13 })} Budget</a>` : ''}
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
    toast.success('Event Hub is live!');
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
    toast.success('Settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'submit', 'form[data-form="save-event-details"]', async (event, form) => {
  event.preventDefault();
  try {
    const cur = state.session.settings;
    const vals = readForm(form);
    const res = await api.put('/api/settings', {
      business_name: cur.business_name, tagline: cur.tagline, phone: cur.phone, email: cur.email,
      address: cur.address, tax_id: cur.tax_id, currency: cur.currency, tax_rate: cur.tax_rate,
      timezone: cur.timezone, brand_preset: cur.brand_preset,
      event_title: vals.event_title, event_date: vals.event_date, event_venue: vals.event_venue,
    });
    state.session.settings = res.settings;
    toast.success('Event details updated.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample event data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes example records tagged Sample. Your real event records stay safe.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', {}); toast.success('Sample data cleared.'); await loadScreen(); }
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'attendees') {
      const { attendees } = await api.get('/api/attendees');
      downloadCsv(`attendees-${today()}.csv`, [
        { key: 'attendee_name', label: 'Name' }, { key: 'organization', label: 'Organization' },
        { key: 'email', label: 'Email' }, { key: 'ticket_type', label: 'Ticket Type' },
        { label: 'Checked In', get: (r) => r.checked_in ? 'Yes' : 'No' },
        { label: 'Dietary', get: (r) => (r.dietary || []).join('; ') },
        { key: 'accessibility_needs', label: 'Accessibility' },
      ], attendees);
    } else if (kind === 'speakers') {
      const { speakers } = await api.get('/api/speakers');
      downloadCsv(`speakers-${today()}.csv`, [
        { key: 'speaker_name', label: 'Speaker' }, { key: 'topic_title', label: 'Topic' },
        { key: 'presentation_type', label: 'Type' }, { key: 'status', label: 'Status' },
        { key: 'session_slot', label: 'Session Slot' }, { label: 'Equipment', get: (r) => (r.equipment || []).join('; ') },
      ], speakers);
    } else if (kind === 'vendors') {
      const { vendors } = await api.get('/api/vendors');
      downloadCsv(`vendors-${today()}.csv`, [
        { key: 'company_name', label: 'Company' }, { key: 'contact_name', label: 'Contact' },
        { key: 'booth_size', label: 'Booth Size' }, { key: 'booth_number', label: 'Booth #' },
        { key: 'status', label: 'Status' }, { label: 'Power', get: (r) => (r.power || []).join('; ') },
      ], vendors);
    } else if (kind === 'volunteers') {
      const { volunteers } = await api.get('/api/volunteers');
      downloadCsv(`volunteers-${today()}.csv`, [
        { key: 'volunteer_name', label: 'Name' }, { key: 'email', label: 'Email' },
        { key: 't_shirt_size', label: 'T-Shirt' }, { key: 'assigned_shift', label: 'Shift' },
        { label: 'Skills', get: (r) => (r.skills || []).join('; ') },
        { key: 'emergency_contact_name', label: 'Emergency Contact' }, { key: 'emergency_contact_phone', label: 'Emergency Phone' },
      ], volunteers);
    } else if (kind === 'budget') {
      const { items } = await api.get('/api/budget');
      downloadCsv(`budget-${today()}.csv`, [
        { key: 'item_name', label: 'Item' }, { key: 'category', label: 'Category' },
        { label: 'Estimated', get: (r) => (r.estimated_cents / 100).toFixed(2) },
        { label: 'Actual', get: (r) => (r.actual_cents / 100).toFixed(2) },
        { label: 'Variance', get: (r) => (r.variance_cents / 100).toFixed(2) },
        { key: 'vendor', label: 'Vendor' },
      ], items);
    } else if (kind === 'incidents') {
      const { incidents } = await api.get('/api/incidents');
      downloadCsv(`incidents-${today()}.csv`, [
        { key: 'incident_date', label: 'Date' }, { key: 'incident_time', label: 'Time' },
        { key: 'location', label: 'Location' }, { key: 'incident_type', label: 'Type' },
        { key: 'severity', label: 'Severity' }, { key: 'status', label: 'Status' },
        { key: 'actions_taken', label: 'Actions Taken' },
      ], incidents);
    } else if (kind === 'feedback') {
      const { feedback } = await api.get('/api/feedback');
      downloadCsv(`feedback-${today()}.csv`, [
        { key: 'attendee_name', label: 'Attendee' }, { key: 'overall_rating', label: 'Overall' },
        { key: 'venue_rating', label: 'Venue' }, { key: 'speakers_rating', label: 'Speakers' },
        { key: 'organization_rating', label: 'Logistics' }, { key: 'food_rating', label: 'Food' },
        { key: 'would_recommend', label: 'Recommend' },
      ], feedback);
    }
  } catch (err) { toastError(err); }
});

wireCheckInActions(root, state, { draw, loadScreen });
wireProgramActions(root, state, { draw, loadScreen });
wireEventOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/checkin': () => '/checkin',
  '/speakers': () => '/speakers',
  '/vendors': () => '/vendors',
  '/volunteers': () => '/volunteers',
  '/budget': () => '/budget',
  '/incidents': () => '/incidents',
  '/feedback': () => '/feedback',
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
    if (state.session.access === 'granted') router.start();
    else draw();
  } catch (err) {
    state.booting = false;
    state.bootError = messageOf(err);
    draw();
  }
}

boot();
