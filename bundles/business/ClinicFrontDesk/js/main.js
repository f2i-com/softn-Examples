// Clinic Front Desk: startup, clinical micro-icons, grouped nav, calm ticker, turnkey doors, routing & shared actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderWaitingView, wireWaitingActions } from './views/waiting.js';
import { renderPatientsView, wirePatientsActions } from './views/patients.js';
import { renderIntakeView, wireIntakeActions } from './views/intake.js';
import { renderFollowUpsView, renderProvidersView, wireRecallActions } from './views/recall.js';

// Register bespoke clinical & reception micro-icons
addIcons({
  'clinic-cross': '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8v8M8 12h8"/>',
  'heart-pulse': '<path d="M3 12h4l2-5 3.5 10L15 10l1.8 2H21"/>',
  'exam-room': '<rect x="4" y="3.5" width="14" height="17" rx="1.8"/><path d="M14.5 12h.5M18 20.5h3M2.5 20.5h15.5"/>',
});

export const BRAND_PRESETS = [
  { id: 'clinical-teal', label: 'Clinical Teal', accent: '#0c7f85', soft: '#d9f3f3', rail: '#091d24' },
  { id: 'harbour-blue', label: 'Cerulean Care', accent: '#0284c7', soft: '#e0f2fe', rail: '#0e1f33' },
  { id: 'calm-sage', label: 'Calm Sage', accent: '#15803d', soft: '#dcfce7', rail: '#13261c' },
  { id: 'deep-plum', label: 'Deep Plum', accent: '#7e22ce', soft: '#f3e8ff', rail: '#231430' },
];

export const ROLES = [
  { id: 'admin', label: 'Clinic Administrator' },
  { id: 'front_desk', label: 'Front Desk' },
  { id: 'provider', label: 'Provider' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'clinical-teal',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Operational state
  selectedDate: today(),
  providerFilter: 'All',
  statusFilter: 'All',
  waitingSearch: '',
  appointments: [],
  patients: [],
  providers: [],
  intakes: [],
  followUps: [],
  team: [],
  // Patient dossier
  patientSearch: '',
  selectedPatientId: null,
  dossier: null,
  // Intake pre-selection
  intakePatientId: '',
  intakeApptId: '',
  intakePatientName: '',
  // Recall filter
  recallFilter: 'Active',
  recallSearch: '',
};

const NAV = [
  { path: '/', label: 'Waiting Room', mobileLabel: 'Queue', icon: 'heart-pulse', badge: (c) => c?.todayActive || 0 },
  { path: '/intake', label: 'Intake & Consent', mobileLabel: 'Intake', icon: 'clipboard' },
  { path: '/followups', label: 'Follow-Up Recall', mobileLabel: 'Recall', icon: 'calendar', badge: (c) => c?.dueFollowUps || 0, alert: true },
  { path: '/patients', label: 'Patients', mobileLabel: 'Patients', icon: 'users', badge: (c) => c?.totalPatients || 0 },
  { path: '/providers', label: 'Providers', mobileLabel: 'Doctors', icon: 'stethoscope' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'clinical-teal');
  }
  return s;
}

export async function loadDossier(patientId) {
  if (!patientId) { state.dossier = null; return; }
  state.selectedPatientId = Number(patientId);
  const res = await api.get('/api/patients/dossier', { id: state.selectedPatientId });
  state.dossier = res;
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [a, pr, pt, fu] = await Promise.all([
        api.get('/api/appointments', { date: state.selectedDate }),
        api.get('/api/providers', { today: state.selectedDate }),
        api.get('/api/patients'),
        api.get('/api/followups'),
      ]);
      state.appointments = a.appointments || [];
      state.providers = pr.providers || [];
      state.patients = pt.patients || [];
      state.followUps = fu.followUps || [];
    } else if (path === '/patients') {
      const [pt, pr] = await Promise.all([
        api.get('/api/patients'),
        api.get('/api/providers', { today: today() }),
      ]);
      state.patients = pt.patients || [];
      state.providers = pr.providers || [];
      const wanted = state.selectedPatientId || (state.patients[0] ? state.patients[0].id : null);
      if (wanted && state.patients.some((p) => p.id === wanted)) {
        await loadDossier(wanted);
      } else {
        state.selectedPatientId = state.patients[0] ? state.patients[0].id : null;
        if (state.selectedPatientId) await loadDossier(state.selectedPatientId);
        else state.dossier = null;
      }
    } else if (path === '/intake') {
      const [inRes, ptRes, apRes] = await Promise.all([
        api.get('/api/intakes'),
        api.get('/api/patients'),
        api.get('/api/appointments', { date: today() }),
      ]);
      state.intakes = inRes.intakes || [];
      state.patients = ptRes.patients || [];
      state.appointments = apRes.appointments || [];
    } else if (path === '/followups') {
      const [fu, pr, ap] = await Promise.all([
        api.get('/api/followups'),
        api.get('/api/providers', { today: today() }),
        api.get('/api/appointments'),
      ]);
      state.followUps = fu.followUps || [];
      state.providers = pr.providers || [];
      state.appointments = ap.appointments || [];
    } else if (path === '/providers') {
      const pr = await api.get('/api/providers', { today: today() });
      state.providers = pr.providers || [];
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
  if (state.route === '/') return renderWaitingView(state);
  if (state.route === '/patients') return renderPatientsView(state);
  if (state.route === '/intake') return renderIntakeView(state);
  if (state.route === '/followups') return renderFollowUpsView(state);
  if (state.route === '/providers') return renderProvidersView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'patients', label: 'Export Patients CSV' },
        { id: 'appointments', label: 'Export Appointments CSV' },
        { id: 'intakes', label: 'Export Intake Forms CSV' },
        { id: 'followups', label: 'Export Follow-Ups CSV' },
      ],
    });
  }
  return renderWaitingView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('clinic-cross', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Clinic Front Desk…</h1><p class="tk-door__sub">Connecting to your private clinic database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Clinic Front Desk could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Clinic Front Desk is not set up yet</h1><p class="tk-muted">Ask the clinic owner to open the app first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Clinic Front Desk',
      tagline: 'Manage today\u2019s waiting room queue, register patients, capture digital intake & consent forms, coordinate clinicians, and track follow-up recalls.',
      iconName: 'clinic-cross',
      defaultBusiness: 'Harbourside Family Clinic',
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
      appName: 'Clinic Front Desk',
      iconName: 'clinic-cross',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[3], NAV[1], NAV[2], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('clinic-cross', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Patient Reception & Intake'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Reception Desk</div>
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
        <div class="tk-nav__group">Clinical Records</div>
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
          <div class="cl-ticker">
            <span class="tk-pulse-dot" style="--dot:#10b981"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="cl-ticker__pill">${icon('heart-pulse', { size: 13 })} Queue (${counts.todayActive || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/followups' && counts.dueFollowUps > 0 ? html`
              <a href="#/followups" class="cl-ticker__pill cl-ticker__pill--alert">${icon('bell', { size: 13 })} ${counts.dueFollowUps} Recall${counts.dueFollowUps === 1 ? '' : 's'} Due</a>` : ''}
            ${state.route !== '/intake' ? html`
              <a href="#/intake" class="cl-ticker__pill">${icon('clipboard', { size: 13 })} Capture Intake</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/patients" class="cl-ticker__pill">${icon('users', { size: 13 })} Patients (${counts.totalPatients || 0})</a>` : ''}
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
    toast.success('Clinic Front Desk is ready!');
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
    toast.success('Clinic settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample clinic data loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real clinic records remain untouched.', confirmLabel: 'Clear sample data' });
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this clinic workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'patients') {
      const { patients } = await api.get('/api/patients');
      downloadCsv(`clinic-patients-${today()}.csv`, [
        { key: 'full_name', label: 'Full Name' }, { key: 'date_of_birth', label: 'DOB' },
        { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'address', label: 'Address' }, { key: 'emergency_contact_name', label: 'Emergency Contact' },
        { key: 'emergency_contact_phone', label: 'Emergency Phone' },
      ], patients);
    } else if (kind === 'appointments') {
      const { appointments } = await api.get('/api/appointments');
      downloadCsv(`clinic-appointments-${today()}.csv`, [
        { key: 'appt_date', label: 'Date' }, { key: 'appt_time', label: 'Time' },
        { key: 'patient_name', label: 'Patient' }, { key: 'provider_name', label: 'Provider' },
        { key: 'appt_type', label: 'Type' }, { key: 'status', label: 'Status' },
        { key: 'room', label: 'Room' }, { label: 'Intake Done', get: (r) => (r.intake_completed ? 'Yes' : 'No') },
      ], appointments);
    } else if (kind === 'intakes') {
      const { intakes } = await api.get('/api/intakes');
      downloadCsv(`clinic-intakes-${today()}.csv`, [
        { key: 'patient_name', label: 'Patient' }, { key: 'reason_for_visit', label: 'Reason for Visit' },
        { key: 'symptoms', label: 'Symptoms' }, { key: 'current_medications', label: 'Medications' },
        { key: 'preferred_contact', label: 'Preferred Contact' }, { key: 'signed_by', label: 'Signed By' },
      ], intakes);
    } else if (kind === 'followups') {
      const { followUps } = await api.get('/api/followups');
      downloadCsv(`clinic-followups-${today()}.csv`, [
        { key: 'followup_date', label: 'Due Date' }, { key: 'patient_name', label: 'Patient' },
        { key: 'provider_name', label: 'Provider' }, { key: 'action', label: 'Action' },
        { key: 'status', label: 'Status' },
      ], followUps);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/patients': () => '/patients',
  '/intake': () => '/intake',
  '/followups': () => '/followups',
  '/providers': () => '/providers',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, loadDossier, router };
wireWaitingActions(root, state, ctx);
wirePatientsActions(root, state, ctx);
wireIntakeActions(root, state, ctx);
wireRecallActions(root, state, ctx);

async function boot() {
  state.booting = true;
  state.bootError = '';
  draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') {
      state.selectedDate = today();
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
