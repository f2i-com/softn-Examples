// People Hub: turnkey setup/join doors, Warm Plum-Slate & Sage People-First shell, grouped nav, bespoke icons & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderTodayView, renderHiringView, renderOnboardingView, wireTalentActions } from './views/today.js';
import { renderLeaveView, renderReviewsView, renderExpensesView, renderTrainingView, renderExitsView, wirePeopleOpsActions } from './views/ops.js';

// Bespoke People-First HR micro-icons
addIcons({
  'people-badge': '<rect x="4" y="4" width="16" height="16" rx="2.5"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.6-2.2 2.2-3.5 4-3.5s3.4 1.3 4 3.5"/>',
  'palm-leave': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9.5 15l2 2 3.5-3.5"/>',
  'approval-stamp': '<path d="M4 13.5 6.5 5.5h11l2.5 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="m9.5 12.5 2 2 3.5-3.5"/>',
});

export const BRAND_PRESETS = [
  { id: 'berry', label: 'Plum Slate & Sage', accent: '#823462', soft: '#f9e9f2', rail: '#1f1627' },
  { id: 'sage', label: 'Botanical Sage', accent: '#2e7d63', soft: '#e0f4ec', rail: '#142420' },
  { id: 'plum', label: 'Velvet Plum', accent: '#6b215e', soft: '#f6e7f4', rail: '#1e1123' },
  { id: 'indigo', label: 'People Indigo', accent: '#4338ca', soft: '#e5e8ff', rail: '#151830' },
];

export const ROLES = [
  { id: 'manager', label: 'HR / People Manager' },
  { id: 'employee', label: 'Team Member' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'berry',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  todayData: null,
  candidates: [],
  onboardings: [],
  itItems: [],
  policyItems: [],
  leave: [],
  reviews: [],
  expenses: [],
  expenseSummary: null,
  training: [],
  trainingSummary: null,
  exits: [],
  exitSummary: null,
  team: [],
  // Filters
  peopleSearch: '',
  approvalFilter: 'All',
  candSearch: '',
  candStage: 'All',
  onbSearch: '',
  onbDept: 'All',
  leaveFilter: 'All',
  expenseFilter: 'All',
  trainingFilter: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Approvals Inbox', mobileLabel: 'Inbox', icon: 'approval-stamp', badge: (c) => c?.pendingApprovals || 0, alert: true },
  { path: '/hiring', label: 'Recruitment', mobileLabel: 'Hiring', icon: 'users', badge: (c) => c?.activeCandidates || 0 },
  { path: '/onboarding', label: 'Onboarding & People', mobileLabel: 'People', icon: 'people-badge', badge: (c) => c?.inProgressOnboardings || 0 },
  { path: '/leave', label: 'Leave Requests', mobileLabel: 'Leave', icon: 'palm-leave', badge: (c) => c?.pendingLeave || 0 },
  { path: '/reviews', label: 'Performance', mobileLabel: 'Reviews', icon: 'award' },
  { path: '/expenses', label: 'Expenses', mobileLabel: 'Expenses', icon: 'receipt', badge: (c) => c?.pendingExpenses || 0 },
  { path: '/training', label: 'Training & L&D', mobileLabel: 'L&D', icon: 'book', badge: (c) => c?.pendingTraining || 0 },
  { path: '/exits', label: 'Exit Interviews', mobileLabel: 'Exits', icon: 'logout' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'berry');
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
      const [td, rev] = await Promise.all([api.get('/api/today'), api.get('/api/reviews')]);
      state.todayData = td;
      state.reviews = rev.reviews || [];
    } else if (path === '/hiring') {
      const r = await api.get('/api/candidates');
      state.candidates = r.candidates || [];
    } else if (path === '/onboarding') {
      const r = await api.get('/api/onboardings');
      state.onboardings = r.onboardings || [];
      state.itItems = r.itItems || [];
      state.policyItems = r.policyItems || [];
    } else if (path === '/leave') {
      const r = await api.get('/api/leave');
      state.leave = r.leave || [];
    } else if (path === '/reviews') {
      const [rev, ob] = await Promise.all([api.get('/api/reviews'), api.get('/api/onboardings')]);
      state.reviews = rev.reviews || [];
      state.onboardings = ob.onboardings || [];
    } else if (path === '/expenses') {
      const r = await api.get('/api/expenses');
      state.expenses = r.expenses || [];
      state.expenseSummary = r.summary || null;
    } else if (path === '/training') {
      const r = await api.get('/api/training');
      state.training = r.training || [];
      state.trainingSummary = r.summary || null;
    } else if (path === '/exits') {
      const r = await api.get('/api/exits');
      state.exits = r.exits || [];
      state.exitSummary = r.summary || null;
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
  if (state.route === '/') return renderTodayView(state);
  if (state.route === '/hiring') return renderHiringView(state);
  if (state.route === '/onboarding') return renderOnboardingView(state);
  if (state.route === '/leave') return renderLeaveView(state);
  if (state.route === '/reviews') return renderReviewsView(state);
  if (state.route === '/expenses') return renderExpensesView(state);
  if (state.route === '/training') return renderTrainingView(state);
  if (state.route === '/exits') return renderExitsView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'candidates', label: 'Candidates CSV' },
        { id: 'onboardings', label: 'Onboarding CSV' },
        { id: 'leave', label: 'Leave CSV' },
        { id: 'reviews', label: 'Reviews CSV' },
        { id: 'expenses', label: 'Expenses CSV' },
        { id: 'training', label: 'Training CSV' },
        { id: 'exits', label: 'Exit Interviews CSV' },
      ],
    });
  }
  return renderTodayView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('people-badge', { size: 26 })}</div><div><h1 class="tk-door__title">Opening People Hub…</h1><p class="tk-door__sub">Loading your HR desk and approvals inbox.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">People Hub could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">People Hub is not set up yet</h1><p class="tk-muted">Ask your HR administrator to complete initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'People Hub',
      tagline: 'Approve leave, expenses & training from one inbox, score candidates, run live onboarding checklists, performance reviews & exit interviews.',
      iconName: 'people-badge',
      defaultBusiness: 'Kindred People Co.',
      defaultCurrency: 'USD',
      defaultZone: 'America/New_York',
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
      appName: 'People Hub',
      iconName: 'people-badge',
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
          <span class="tk-brand__mark">${icon('people-badge', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'HR & People Ops'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Talent &amp; People</div>
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
        <div class="tk-nav__group">Time, Growth &amp; Ops</div>
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
          <div class="hr-ticker">
            <span class="tk-pulse-dot" style="--dot:${(counts.pendingApprovals || 0) > 0 ? '#f0a8b8' : '#5ec29c'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="hr-ticker__pill">${icon('approval-stamp', { size: 13 })} Inbox</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && counts.pendingApprovals > 0 ? html`
              <a href="#/" class="hr-ticker__pill hr-ticker__pill--alert">${icon('approval-stamp', { size: 13 })} ${counts.pendingApprovals} Pending</a>` : ''}
            ${state.route !== '/hiring' ? html`
              <a href="#/hiring" class="hr-ticker__pill">${icon('users', { size: 13 })} Hiring (${counts.activeCandidates || 0})</a>` : ''}
            ${state.route !== '/leave' ? html`
              <a href="#/leave" class="hr-ticker__pill">${icon('palm-leave', { size: 13 })} Leave (${counts.pendingLeave || 0})</a>` : ''}
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
on(root, 'input', '[data-input="global-people-search"]', (e, el) => { state.peopleSearch = el.value; draw(); });

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
    toast.success('People Hub is ready!');
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
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample HR data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes example records tagged Sample. Your own HR records stay untouched.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'candidates') {
      const { candidates } = await api.get('/api/candidates');
      downloadCsv(`candidates-${today()}.csv`, [
        { label: 'Name', get: (r) => `${r.first_name} ${r.last_name}` }, { key: 'position', label: 'Position' },
        { key: 'stage', label: 'Stage' }, { key: 'email', label: 'Email' },
        { key: 'avg_score', label: 'Avg Interview Score' }, { key: 'referral_source', label: 'Source' },
      ], candidates);
    } else if (kind === 'onboardings') {
      const { onboardings } = await api.get('/api/onboardings');
      downloadCsv(`onboardings-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'department', label: 'Department' },
        { key: 'start_date', label: 'Start Date' }, { key: 'manager', label: 'Manager' },
        { label: 'Completion %', get: (r) => `${r.completion_pct}%` },
      ], onboardings);
    } else if (kind === 'leave') {
      const { leave } = await api.get('/api/leave');
      downloadCsv(`leave-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'leave_type', label: 'Type' },
        { key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' },
        { key: 'total_days', label: 'Days' }, { key: 'status', label: 'Status' },
      ], leave);
    } else if (kind === 'reviews') {
      const { reviews } = await api.get('/api/reviews');
      downloadCsv(`reviews-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'review_period', label: 'Period' },
        { key: 'reviewer_name', label: 'Reviewer' }, { key: 'overall_rating', label: 'Overall Rating' },
        { key: 'goals_met', label: 'Goals Met' },
      ], reviews);
    } else if (kind === 'expenses') {
      const { expenses } = await api.get('/api/expenses');
      downloadCsv(`expenses-${today()}.csv`, [
        { key: 'expense_date', label: 'Date' }, { key: 'employee_name', label: 'Employee' },
        { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) }, { key: 'project_code', label: 'Project Code' },
        { key: 'status', label: 'Status' },
      ], expenses);
    } else if (kind === 'training') {
      const { training } = await api.get('/api/training');
      downloadCsv(`training-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'course_name', label: 'Course' },
        { key: 'provider', label: 'Provider' }, { key: 'training_type', label: 'Type' },
        { label: 'Cost', get: (r) => (r.cost_cents / 100).toFixed(2) }, { key: 'status', label: 'Status' },
      ], training);
    } else if (kind === 'exits') {
      const { exits } = await api.get('/api/exits');
      downloadCsv(`exits-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'department', label: 'Department' },
        { key: 'last_day', label: 'Last Day' }, { key: 'tenure_years', label: 'Tenure (yrs)' },
        { key: 'reason_for_leaving', label: 'Reason' }, { key: 'overall_satisfaction', label: 'Satisfaction' },
        { key: 'would_recommend', label: 'Would Recommend' },
      ], exits);
    }
  } catch (err) { toastError(err); }
});

wireTalentActions(root, state, { draw, loadScreen });
wirePeopleOpsActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/hiring': () => '/hiring',
  '/onboarding': () => '/onboarding',
  '/leave': () => '/leave',
  '/reviews': () => '/reviews',
  '/expenses': () => '/expenses',
  '/training': () => '/training',
  '/exits': () => '/exits',
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
