// TutorTrack: startup, academic micro-icons, grouped nav, calm ticker, Oxford Navy & Gold shell, routes & settings.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderScheduleView, wireScheduleActions } from './views/schedule.js';
import { renderStudentsView, wireStudentsActions } from './views/students.js';
import { renderProgressView, wireProgressActions } from './views/progress.js';
import { renderTutorsView, renderBillingView, wireBillingActions } from './views/billing.js';

// Register bespoke academic & conservatory micro-icons
addIcons({
  mortarboard: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5z"/><path d="M6 11.5V16c0 1.8 2.7 3 6 3s6-1.2 6-3v-4.5M20 10.5v5"/>',
  'music-clef': '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  'quill-scroll': '<path d="M5 4.5h11a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V4.5z"/><path d="M8.5 9h6M8.5 13h6M8.5 17h3.5"/>',
});

export const BRAND_PRESETS = [
  { id: 'academic-royal', label: 'Oxford Navy', accent: '#1d356b', soft: '#e3e9f8', rail: '#0d1933' },
  { id: 'chalkboard-forest', label: 'Chalkboard Forest', accent: '#166534', soft: '#dcfce7', rail: '#11261b' },
  { id: 'burgundy-conservatory', label: 'Burgundy Conservatory', accent: '#9f1239', soft: '#ffe4e6', rail: '#2c111a' },
  { id: 'ochre-studio', label: 'Ochre Studio', accent: '#b45309', soft: '#fef3c7', rail: '#291c0f' },
];

export const ROLES = [
  { id: 'manager', label: 'Studio Coordinator' },
  { id: 'tutor', label: 'Tutor' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'academic-royal',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  loading: false,
  // Data caches
  lessons: [],
  students: [],
  tutors: [],
  progressNotes: [],
  invoices: [],
  invoicesLoaded: false,
  invoiceSummary: null,
  team: [],
  // UI filters
  lessonDateMode: 'All',
  selectedDate: today(),
  lessonSearch: '',
  tutorFilter: 'All',
  studentSearch: '',
  studentSubjectFilter: 'All',
  selectedStudentId: null,
  dossier: null,
  progressFilter: 'All',
  invoiceFilter: 'All',
  invoiceSearch: '',
};

const NAV = [
  { path: '/', label: 'Lesson Schedule', mobileLabel: 'Schedule', icon: 'calendar', badge: (c) => c?.todayLessons || 0 },
  { path: '/students', label: 'Students & Guardians', mobileLabel: 'Students', icon: 'mortarboard', badge: (c) => c?.activeStudents || 0 },
  { path: '/progress', label: 'Progress & Homework', mobileLabel: 'Progress', icon: 'quill-scroll', badge: (c) => c?.followUpNotes || 0 },
  { path: '/tutors', label: 'Tutors Roster', mobileLabel: 'Tutors', icon: 'award' },
  { path: '/billing', label: 'Billing & Invoices', mobileLabel: 'Billing', icon: 'receipt', badge: (c) => c?.overdueInvoices || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'academic-royal');
  }
  return s;
}

export async function loadStudentDossier(studentId) {
  if (!studentId) { state.dossier = null; return; }
  state.selectedStudentId = Number(studentId);
  state.dossier = await api.get('/api/students/dossier', { id: state.selectedStudentId });
}

let skipNextSessionRefresh = false;

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    if (skipNextSessionRefresh) skipNextSessionRefresh = false;
    else await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const lessonQuery = state.lessonDateMode === 'Day' ? { date: state.selectedDate } : {};
      const [le, inv, pn, tu, st] = await Promise.all([
        api.get('/api/lessons', lessonQuery),
        api.get('/api/invoices', { today: today() }),
        api.get('/api/progress'),
        api.get('/api/tutors'),
        api.get('/api/students'),
      ]);
      state.lessons = le.lessons || [];
      state.invoices = inv.invoices || [];
      state.invoicesLoaded = true;
      state.invoiceSummary = inv.summary || null;
      state.progressNotes = pn.notes || [];
      state.tutors = tu.tutors || [];
      state.students = st.students || [];
    } else if (path === '/students') {
      const [st, tu] = await Promise.all([api.get('/api/students'), api.get('/api/tutors')]);
      state.students = st.students || [];
      state.tutors = tu.tutors || [];
      const pick = state.selectedStudentId && state.students.some((s) => s.id === state.selectedStudentId)
        ? state.selectedStudentId
        : (state.students[0] ? state.students[0].id : null);
      if (pick) await loadStudentDossier(pick);
      else { state.selectedStudentId = null; state.dossier = null; }
    } else if (path === '/progress') {
      const [pn, st, le] = await Promise.all([api.get('/api/progress'), api.get('/api/students'), api.get('/api/lessons')]);
      state.progressNotes = pn.notes || [];
      state.students = st.students || [];
      state.lessons = le.lessons || [];
    } else if (path === '/tutors') {
      const tu = await api.get('/api/tutors');
      state.tutors = tu.tutors || [];
    } else if (path === '/billing') {
      const [inv, st, le] = await Promise.all([api.get('/api/invoices', { today: today() }), api.get('/api/students'), api.get('/api/lessons')]);
      state.invoices = inv.invoices || [];
      state.invoicesLoaded = true;
      state.invoiceSummary = inv.summary || null;
      state.students = st.students || [];
      state.lessons = le.lessons || [];
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
  if (state.route === '/') return renderScheduleView(state);
  if (state.route === '/students') return renderStudentsView(state);
  if (state.route === '/progress') return renderProgressView(state);
  if (state.route === '/tutors') return renderTutorsView(state);
  if (state.route === '/billing') return renderBillingView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'students', label: 'Export Students CSV' },
        { id: 'lessons', label: 'Export Lessons CSV' },
        { id: 'progress', label: 'Export Progress Notes CSV' },
        { id: 'invoices', label: 'Export Invoices CSV' },
      ],
    });
  }
  return renderScheduleView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('mortarboard', { size: 26 })}</div><div><h1 class="tk-door__title">Opening TutorTrack…</h1><p class="tk-door__sub">Connecting to your private tutoring studio database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">TutorTrack could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">TutorTrack is not set up yet</h1><p class="tk-muted">Ask the studio owner to open TutorTrack first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'TutorTrack',
      tagline: 'Schedule tutoring & music lessons, log progress scores and homework right after class, copy guardian updates in one click, and issue printable tuition invoices.',
      iconName: 'mortarboard',
      defaultBusiness: 'Brightwell Tutoring & Music Studio',
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
      appName: 'TutorTrack',
      iconName: 'mortarboard',
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
          <span class="tk-brand__mark">${icon('mortarboard', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Lessons & Progress'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Academic Studio</div>
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
        <div class="tk-nav__group">Faculty &amp; Tuition</div>
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
          <div class="tt-ticker">
            <span class="tk-pulse-dot" style="--dot:#ebc05a"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="tt-ticker__pill">${icon('calendar', { size: 13 })} Schedule (${counts.todayLessons || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/billing' && counts.overdueInvoices > 0 ? html`
              <a href="#/billing" class="tt-ticker__pill tt-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.overdueInvoices} Overdue</a>` : ''}
            ${state.route !== '/progress' ? html`
              <a href="#/progress" class="tt-ticker__pill">${icon('quill-scroll', { size: 13 })} Progress</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/billing" class="tt-ticker__pill">${icon('receipt', { size: 13 })} Billing</a>` : ''}
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
    toast.success('TutorTrack studio is live!');
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
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample records while keeping your real studio records intact.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Tutor approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (event, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (event, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to this studio.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'students') {
      const { students } = await api.get('/api/students');
      downloadCsv(`tutortrack-students-${today()}.csv`, [
        { key: 'student_name', label: 'Student' }, { key: 'subject', label: 'Subject' }, { key: 'level', label: 'Level' },
        { key: 'status', label: 'Status' }, { key: 'guardian_name', label: 'Guardian' },
        { key: 'guardian_email', label: 'Guardian Email' }, { key: 'phone', label: 'Phone' },
      ], students);
    } else if (kind === 'lessons') {
      const { lessons } = await api.get('/api/lessons');
      downloadCsv(`tutortrack-lessons-${today()}.csv`, [
        { key: 'lesson_date', label: 'Date' }, { key: 'start_time', label: 'Start' }, { key: 'duration', label: 'Mins' },
        { key: 'student_name', label: 'Student' }, { key: 'tutor_name', label: 'Tutor' },
        { key: 'subject', label: 'Subject' }, { key: 'status', label: 'Status' },
        { label: 'Fee', get: (r) => (r.fee_cents / 100).toFixed(2) },
      ], lessons);
    } else if (kind === 'progress') {
      const { notes } = await api.get('/api/progress');
      downloadCsv(`tutortrack-progress-${today()}.csv`, [
        { key: 'student_name', label: 'Student' }, { key: 'lesson_date', label: 'Lesson Date' },
        { key: 'area', label: 'Area' }, { key: 'score', label: 'Score (1-5)' },
        { key: 'notes', label: 'Notes' }, { key: 'homework', label: 'Homework' }, { key: 'follow_up', label: 'Follow-Up' },
      ], notes);
    } else if (kind === 'invoices') {
      const { invoices } = await api.get('/api/invoices', { today: today() });
      downloadCsv(`tutortrack-invoices-${today()}.csv`, [
        { key: 'invoice_number', label: 'Invoice #' }, { key: 'student_name', label: 'Student' },
        { key: 'billing_period', label: 'Period' }, { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' }, { key: 'due_date', label: 'Due Date' },
      ], invoices);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/students': () => '/students',
  '/progress': () => '/progress',
  '/tutors': () => '/tutors',
  '/billing': () => '/billing',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, loadStudentDossier, router };
wireScheduleActions(root, state, ctx);
wireStudentsActions(root, state, ctx);
wireProgressActions(root, state, ctx);
wireBillingActions(root, state, ctx);

async function boot() {
  state.booting = true;
  state.bootError = '';
  draw();
  try {
    await refreshSession();
    state.booting = false;
    if (state.session.access === 'granted') {
      state.selectedDate = today();
      skipNextSessionRefresh = true;
      router.start();
      skipNextSessionRefresh = false;
    } else draw();
  } catch (err) {
    state.booting = false;
    state.bootError = messageOf(err);
    draw();
  }
}

boot();
