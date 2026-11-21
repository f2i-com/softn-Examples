// Service Desk: turnkey setup/join doors, Crisp Indigo-Blue & Signal Coral SLA shell, grouped nav, bespoke icons & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderTicketsView, renderEscalationsView, renderRefundsView, wireSupportActions } from './views/tickets.js';
import { renderBugsView, renderFeaturesView, renderFeedbackView, renderKbView, wireProductKbActions } from './views/product.js';

// Bespoke SLA & Support Desk micro-icons
addIcons({
  'sla-clock': '<circle cx="12" cy="13" r="7.5"/><path d="M9.5 3h5M12 5.5V3M12 9.5V13l2.5 1.8"/>',
  'escalate-bolt': '<path d="M12 3.5 3.5 19h17L12 3.5z"/><path d="M12 9.5v4M12 16v.5"/>',
  'macro-reply': '<path d="M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19.5l1.3-3.8A7.5 7.5 0 1 1 20 11.5z"/><path d="M9.5 11.5h5M12 9v5"/>',
});

export const BRAND_PRESETS = [
  { id: 'cobalt', label: 'Indigo Coral', accent: '#3748e0', soft: '#e8ecff', rail: '#101630' },
  { id: 'violet', label: 'Royal Violet', accent: '#7c3aed', soft: '#f0eaff', rail: '#181133' },
  { id: 'teal', label: 'Helpdesk Teal', accent: '#0f766e', soft: '#d7f6f1', rail: '#0e2226' },
  { id: 'slate', label: 'Slate Pro', accent: '#334155', soft: '#e6ebf2', rail: '#111827' },
];

export const ROLES = [
  { id: 'manager', label: 'Support Manager' },
  { id: 'support_agent', label: 'Support Agent' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'cobalt',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  tickets: [],
  selectedTicketId: null,
  composerDrafts: {},
  upvotedIds: [],
  escalations: [],
  refunds: [],
  bugs: [],
  features: [],
  feedback: [],
  npsSummary: null,
  kb: [],
  team: [],
  // Filters
  ticketSearch: '',
  ticketStatus: 'All',
  ticketPriority: 'All',
  ticketCategory: 'All',
  bugSeverity: 'All',
  bugProduct: 'All',
  featureStatus: 'All',
  refundStatus: 'All',
  escalationStatus: 'Active',
  kbSearch: '',
  kbCategory: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Ticket Queue', mobileLabel: 'Tickets', icon: 'headset', badge: (c) => c?.openTickets || 0 },
  { path: '/escalations', label: 'Escalations', mobileLabel: 'Escalate', icon: 'escalate-bolt', badge: (c) => c?.activeEscalations || 0, alert: true },
  { path: '/refunds', label: 'Refunds', mobileLabel: 'Refunds', icon: 'dollar', badge: (c) => c?.pendingRefunds || 0 },
  { path: '/bugs', label: 'Bug Reports', mobileLabel: 'Bugs', icon: 'bug', badge: (c) => c?.openBugs || 0 },
  { path: '/features', label: 'Feature Board', mobileLabel: 'Features', icon: 'sparkle' },
  { path: '/feedback', label: 'Feedback & NPS', mobileLabel: 'NPS', icon: 'smile' },
  { path: '/kb', label: 'Knowledge Base', mobileLabel: 'KB', icon: 'book' },
];

export async function refreshSession() {
  const s = await api.get('/api/session');
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'cobalt');
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
      const [t, k, e, b, r] = await Promise.all([
        api.get('/api/tickets'),
        api.get('/api/kb', { onlyPublished: 1 }),
        api.get('/api/escalations'),
        api.get('/api/bugs'),
        api.get('/api/refunds'),
      ]);
      state.tickets = t.tickets || [];
      state.kb = k.articles || [];
      state.escalations = e.escalations || [];
      state.bugs = b.bugs || [];
      state.refunds = r.refunds || [];
      if (!state.selectedTicketId || !state.tickets.some((x) => x.id === state.selectedTicketId)) {
        state.selectedTicketId = state.tickets[0]?.id || null;
      }
    } else if (path === '/escalations') {
      const [e, t] = await Promise.all([api.get('/api/escalations'), api.get('/api/tickets')]);
      state.escalations = e.escalations || [];
      state.tickets = t.tickets || [];
    } else if (path === '/bugs') {
      const b = await api.get('/api/bugs');
      state.bugs = b.bugs || [];
    } else if (path === '/features') {
      const f = await api.get('/api/features');
      state.features = f.features || [];
    } else if (path === '/refunds') {
      const r = await api.get('/api/refunds');
      state.refunds = r.refunds || [];
    } else if (path === '/feedback') {
      const [fb, t] = await Promise.all([api.get('/api/feedback'), api.get('/api/tickets')]);
      state.feedback = fb.feedback || [];
      state.npsSummary = fb.summary || null;
      state.tickets = t.tickets || [];
    } else if (path === '/kb') {
      const k = await api.get('/api/kb');
      state.kb = k.articles || [];
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
  if (state.route === '/') return renderTicketsView(state);
  if (state.route === '/escalations') return renderEscalationsView(state);
  if (state.route === '/bugs') return renderBugsView(state);
  if (state.route === '/features') return renderFeaturesView(state);
  if (state.route === '/refunds') return renderRefundsView(state);
  if (state.route === '/feedback') return renderFeedbackView(state);
  if (state.route === '/kb') return renderKbView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'tickets', label: 'Tickets CSV' },
        { id: 'bugs', label: 'Bugs CSV' },
        { id: 'features', label: 'Features CSV' },
        { id: 'refunds', label: 'Refunds CSV' },
        { id: 'feedback', label: 'Feedback CSV' },
        { id: 'kb', label: 'Knowledge Base CSV' },
      ],
    });
  }
  return renderTicketsView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('headset', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Service Desk…</h1><p class="tk-door__sub">Loading your support queue and knowledge base.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Service Desk could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Service Desk is not set up yet</h1><p class="tk-muted">Ask the support owner to open Service Desk first and complete initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Service Desk',
      tagline: 'Triage tickets with 1-click KB replies and escalations, track bugs, upvote feature requests, approve refunds, and calculate live NPS.',
      iconName: 'headset',
      defaultBusiness: 'Northstar Customer Support',
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
      appName: 'Service Desk',
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
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[6], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('headset', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Customer Support Desk'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Support Queue</div>
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
        <div class="tk-nav__group">Product &amp; Voice</div>
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
          <div class="cs-ticker">
            <span class="tk-pulse-dot" style="--dot:${(counts.activeEscalations || 0) > 0 ? '#f43f5e' : '#38bdf8'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="cs-ticker__pill">${icon('headset', { size: 13 })} Queue (${counts.openTickets || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/escalations' && counts.activeEscalations > 0 ? html`
              <a href="#/escalations" class="cs-ticker__pill cs-ticker__pill--alert">${icon('escalate-bolt', { size: 13 })} ${counts.activeEscalations} Escalated</a>` : ''}
            ${state.route !== '/kb' ? html`
              <a href="#/kb" class="cs-ticker__pill">${icon('book', { size: 13 })} KB Macros</a>` : ''}
            ${state.route !== '/bugs' && counts.openBugs > 0 ? html`
              <a href="#/bugs" class="cs-ticker__pill">${icon('bug', { size: 13 })} Bugs (${counts.openBugs})</a>` : ''}
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
    toast.success('Service Desk is live!');
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
    toast.success('Business settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample support data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all example records marked Sample. Your real tickets and articles stay intact.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', {}); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will lose access to this support desk.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (event, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'tickets') {
      const { tickets } = await api.get('/api/tickets');
      downloadCsv(`tickets-${today()}.csv`, [
        { key: 'ticket_number', label: 'Ticket #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'email', label: 'Email' }, { key: 'category', label: 'Category' },
        { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
        { key: 'subject', label: 'Subject' }, { key: 'assigned_to', label: 'Assigned To' },
      ], tickets);
    } else if (kind === 'bugs') {
      const { bugs } = await api.get('/api/bugs');
      downloadCsv(`bugs-${today()}.csv`, [
        { key: 'bug_number', label: 'Bug #' }, { key: 'product', label: 'Product' },
        { key: 'severity', label: 'Severity' }, { key: 'status', label: 'Status' },
        { key: 'bug_title', label: 'Title' }, { key: 'browser_os', label: 'Browser/OS' },
      ], bugs);
    } else if (kind === 'features') {
      const { features } = await api.get('/api/features');
      downloadCsv(`features-${today()}.csv`, [
        { key: 'feature_title', label: 'Feature' }, { key: 'submitter_name', label: 'Submitter' },
        { key: 'priority', label: 'Priority' }, { key: 'impact_score', label: 'Impact (1-5)' },
        { key: 'upvotes', label: 'Upvotes' }, { key: 'status', label: 'Status' },
      ], features);
    } else if (kind === 'refunds') {
      const { refunds } = await api.get('/api/refunds');
      downloadCsv(`refunds-${today()}.csv`, [
        { key: 'order_number', label: 'Order #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'reason', label: 'Reason' }, { key: 'refund_method', label: 'Method' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) }, { key: 'status', label: 'Status' },
      ], refunds);
    } else if (kind === 'feedback') {
      const { feedback } = await api.get('/api/feedback');
      downloadCsv(`feedback-${today()}.csv`, [
        { key: 'customer_name', label: 'Customer' }, { key: 'ticket_number', label: 'Ticket #' },
        { key: 'overall_satisfaction', label: 'CSAT (1-5)' }, { key: 'nps_score', label: 'NPS (0-10)' },
        { key: 'nps_category', label: 'Category' }, { key: 'comments', label: 'Comments' },
      ], feedback);
    } else if (kind === 'kb') {
      const { articles } = await api.get('/api/kb');
      downloadCsv(`kb-${today()}.csv`, [
        { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' },
        { key: 'question', label: 'Question' }, { key: 'answer', label: 'Answer' },
        { key: 'status', label: 'Status' }, { key: 'author', label: 'Author' },
      ], articles);
    }
  } catch (err) { toastError(err); }
});

wireSupportActions(root, state, { draw, loadScreen });
wireProductKbActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/escalations': () => '/escalations',
  '/bugs': () => '/bugs',
  '/features': () => '/features',
  '/refunds': () => '/refunds',
  '/feedback': () => '/feedback',
  '/kb': () => '/kb',
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
