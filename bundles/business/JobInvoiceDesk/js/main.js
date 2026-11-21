// Job & Invoice Desk: turnkey setup/join doors, Executive Midnight Navy & Emerald-Mint shell, grouped nav, bespoke icons & actions.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderDeskView, renderClientsView, wireDeskClientActions } from './views/desk.js';
import { renderJobsView, wireJobActions } from './views/jobs.js';
import { renderQuotesView, renderInvoicesView, renderPaymentsView, wireBillingActions } from './views/billing.js';

// Bespoke executive ledger & receivables micro-icons
addIcons({
  'ledger-book': '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8.5 3.5v17M12 8.5h4.5M12 12.5h4.5M12 16.5h3"/>',
  'stamp-paid': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5.1"/>',
  'cash-flow': '<path d="M4 17 9.5 11.5l3.5 3.5L20 8M15 8h5v5"/>',
});

export const BRAND_PRESETS = [
  { id: 'ledger', label: 'Midnight Emerald', accent: '#057a55', soft: '#dcf7ec', rail: '#0a1426' },
  { id: 'cobalt', label: 'Counting-House Cobalt', accent: '#1d4ed8', soft: '#e0ecff', rail: '#0d1a33' },
  { id: 'slate', label: 'Harbour Teal', accent: '#0f6674', soft: '#dff3f6', rail: '#0c1c24' },
  { id: 'burgundy', label: 'Burgundy Firm', accent: '#9f1239', soft: '#ffe4e6', rail: '#210e17' },
];

export const ROLES = [
  { id: 'manager', label: 'Accounts Manager' },
  { id: 'billing_clerk', label: 'Billing Clerk' },
  { id: 'technician', label: 'Field / Delivery Staff' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'ledger',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain state
  desk: null,
  clients: [],
  jobs: [],
  quotes: [],
  invoices: [],
  payments: [],
  team: [],
  // Filters
  clientSearch: '',
  clientTypeFilter: 'All',
  jobViewMode: 'board',
  jobStageFilter: 'All',
  jobSearch: '',
  quoteFilter: 'All',
  quoteSearch: '',
  invoiceFilter: 'All',
  invoiceSearch: '',
  paymentMethodFilter: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Billing Desk', mobileLabel: 'Desk', icon: 'ledger-book', badge: (c) => c?.overdueInvoices || 0, alert: true },
  { path: '/jobs', label: 'Jobs Pipeline', mobileLabel: 'Jobs', icon: 'briefcase', badge: (c) => c?.activeJobs || 0 },
  { path: '/clients', label: 'Clients', mobileLabel: 'Clients', icon: 'building' },
  { path: '/quotes', label: 'Quotes', mobileLabel: 'Quotes', icon: 'file', badge: (c) => c?.openQuotes || 0 },
  { path: '/invoices', label: 'Invoices', mobileLabel: 'Invoices', icon: 'receipt', badge: (c) => c?.openInvoices || 0 },
  { path: '/payments', label: 'Payments', mobileLabel: 'Receipts', icon: 'dollar' },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'ledger');
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
      const [d, c, j] = await Promise.all([
        api.get('/api/desk', { today: today() }),
        api.get('/api/clients'),
        api.get('/api/jobs'),
      ]);
      state.desk = d;
      state.clients = c.clients || [];
      state.jobs = j.jobs || [];
    } else if (path === '/clients') {
      const c = await api.get('/api/clients');
      state.clients = c.clients || [];
    } else if (path === '/jobs') {
      const [j, c] = await Promise.all([api.get('/api/jobs'), api.get('/api/clients')]);
      state.jobs = j.jobs || [];
      state.clients = c.clients || [];
    } else if (path === '/quotes') {
      const [q, j, c] = await Promise.all([api.get('/api/quotes'), api.get('/api/jobs'), api.get('/api/clients')]);
      state.quotes = q.quotes || [];
      state.jobs = j.jobs || [];
      state.clients = c.clients || [];
    } else if (path === '/invoices') {
      const [inv, c, j] = await Promise.all([
        api.get('/api/invoices', { today: today() }),
        api.get('/api/clients'),
        api.get('/api/jobs'),
      ]);
      state.invoices = inv.invoices || [];
      state.clients = c.clients || [];
      state.jobs = j.jobs || [];
    } else if (path === '/payments') {
      const [p, inv] = await Promise.all([
        api.get('/api/payments'),
        api.get('/api/invoices', { today: today() }),
      ]);
      state.payments = p.payments || [];
      state.invoices = inv.invoices || [];
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

function renderBillingPrefs(settings, canManage) {
  return html`
    <section class="tk-sheet">
      <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('receipt', { size: 18 })} Invoice Terms &amp; Bank Details</h2></div>
      <div class="tk-sheet__body">
        <form class="k-form" data-form="save-billing-prefs" novalidate>
          <label class="k-field">
            <span class="k-field__label">Default Payment Terms (days)</span>
            <input class="k-input" type="number" min="0" max="180" name="payment_terms_days" value="${settings.payment_terms_days ?? 14}" ${canManage ? '' : 'disabled'}>
          </label>
          <label class="k-field">
            <span class="k-field__label">Remittance / Bank Transfer Instructions</span>
            <textarea class="k-input" name="bank_details" rows="3" placeholder="BSB 062-000 · Account 1234 5678 · Ref: Invoice Number" ${canManage ? '' : 'disabled'}>${settings.bank_details || ''}</textarea>
            <span class="k-field__hint">Printed at the bottom of every Tax Invoice HTML sheet and payment reminder.</span>
          </label>
          ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary">Save billing terms</button></div>` : ''}
        </form>
      </div>
    </section>`;
}

function renderScreen() {
  if (state.route === '/') return renderDeskView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/jobs') return renderJobsView(state);
  if (state.route === '/quotes') return renderQuotesView(state);
  if (state.route === '/invoices') return renderInvoicesView(state);
  if (state.route === '/payments') return renderPaymentsView(state);
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
      extraSection: renderBillingPrefs(settings, canManage),
      exports: [
        { id: 'clients', label: 'Clients CSV' },
        { id: 'jobs', label: 'Jobs CSV' },
        { id: 'quotes', label: 'Quotes CSV' },
        { id: 'invoices', label: 'Invoices CSV' },
        { id: 'payments', label: 'Payments CSV' },
      ],
    });
  }
  return renderDeskView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('ledger-book', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Job &amp; Invoice Desk…</h1><p class="tk-door__sub">Connecting to your private billing ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Job &amp; Invoice Desk could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Workspace not set up yet</h1><p class="tk-muted">Ask the business owner to open Job &amp; Invoice Desk first and finish initial setup.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Job & Invoice Desk',
      tagline: 'Manage clients, jobs, auto-numbered quotes, 1-click invoice conversion, partial payments, and overdue reminders.',
      iconName: 'ledger-book',
      defaultBusiness: 'Meridian Trade & Advisory',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <div class="k-form__row">
          <label class="k-field">
            <span class="k-field__label">Default Tax Rate (%)</span>
            <input class="k-input" type="number" step="0.1" min="0" max="50" name="tax_rate" value="10">
          </label>
          <label class="k-field">
            <span class="k-field__label">Business / Tax ID <span class="k-field__optional">optional</span></span>
            <input class="k-input" name="tax_id" placeholder="e.g. ABN 48 123 456 789">
          </label>
        </div>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Job & Invoice Desk',
      iconName: 'ledger-book',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('ledger-book', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Jobs & Receivables Ledger'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Desk &amp; Pipeline</div>
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
        <div class="tk-nav__group">Quotes &amp; Ledger</div>
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
          <div class="ji-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.overdueInvoices > 0 ? '#f59e0b' : '#34d399'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="ji-ticker__pill">${icon('ledger-book', { size: 13 })} Billing Desk</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/invoices' && counts.overdueInvoices > 0 ? html`
              <a href="#/invoices" class="ji-ticker__pill ji-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.overdueInvoices} Overdue</a>` : ''}
            ${state.route !== '/quotes' ? html`
              <a href="#/quotes" class="ji-ticker__pill">${icon('file', { size: 13 })} Quotes (${counts.openQuotes || 0})</a>` : ''}
            ${state.route !== '/invoices' ? html`
              <a href="#/invoices" class="ji-ticker__pill">${icon('receipt', { size: 13 })} Invoices (${counts.openInvoices || 0})</a>` : ''}
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
    toast.success('Job & Invoice Desk is ready!');
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

on(root, 'submit', 'form[data-form="save-billing-prefs"]', async (event, form) => {
  event.preventDefault();
  try {
    const cur = state.session.settings;
    const vals = readForm(form);
    const res = await api.put('/api/settings', {
      business_name: cur.business_name,
      tagline: cur.tagline,
      phone: cur.phone,
      email: cur.email,
      address: cur.address,
      tax_id: cur.tax_id,
      currency: cur.currency,
      tax_rate: cur.tax_rate,
      timezone: cur.timezone,
      brand_preset: cur.brand_preset,
      payment_terms_days: vals.payment_terms_days,
      bank_details: vals.bank_details,
    });
    state.session.settings = res.settings;
    toast.success('Invoice terms & remittance details saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try {
    await api.post('/api/sample/load', { today: today() });
    toast.success('Sample billing pipeline loaded.');
    await loadScreen();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real clients, jobs, quotes, invoices and payments stay safe.', confirmLabel: 'Clear sample data' });
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
    if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`clients-${today()}.csv`, [
        { key: 'business_name', label: 'Business Name' }, { key: 'contact_name', label: 'Contact' },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
        { key: 'client_type', label: 'Type' }, { key: 'billing_address', label: 'Billing Address' },
        { label: 'Lifetime Billed', get: (r) => (r.billed_cents / 100).toFixed(2) },
        { label: 'Balance Owed', get: (r) => (r.owed_cents / 100).toFixed(2) },
      ], clients);
    } else if (kind === 'jobs') {
      const { jobs } = await api.get('/api/jobs');
      downloadCsv(`jobs-${today()}.csv`, [
        { key: 'title', label: 'Job Title' }, { key: 'client_name', label: 'Client' },
        { key: 'service_type', label: 'Service Type' }, { key: 'status', label: 'Stage' },
        { key: 'start_date', label: 'Start Date' }, { label: 'Estimated Value', get: (r) => (r.estimated_cents / 100).toFixed(2) },
      ], jobs);
    } else if (kind === 'quotes') {
      const { quotes } = await api.get('/api/quotes');
      downloadCsv(`quotes-${today()}.csv`, [
        { key: 'quote_number', label: 'Quote #' }, { key: 'client_name', label: 'Client' },
        { key: 'job_title', label: 'Job' }, { key: 'issue_date', label: 'Issued' },
        { key: 'valid_until', label: 'Valid Until' }, { key: 'status', label: 'Status' },
        { label: 'Subtotal', get: (r) => (r.subtotal_cents / 100).toFixed(2) },
        { label: 'Tax', get: (r) => (r.tax_cents / 100).toFixed(2) },
        { label: 'Total', get: (r) => (r.total_cents / 100).toFixed(2) },
      ], quotes);
    } else if (kind === 'invoices') {
      const { invoices } = await api.get('/api/invoices', { today: today() });
      downloadCsv(`invoices-${today()}.csv`, [
        { key: 'invoice_number', label: 'Invoice #' }, { key: 'client_name', label: 'Client' },
        { key: 'job_title', label: 'Job' }, { key: 'issue_date', label: 'Issued' },
        { key: 'due_date', label: 'Due Date' }, { key: 'status', label: 'Status' },
        { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
        { label: 'Paid', get: (r) => (r.amount_paid_cents / 100).toFixed(2) },
        { label: 'Balance', get: (r) => (r.balance_cents / 100).toFixed(2) },
      ], invoices);
    } else if (kind === 'payments') {
      const { payments } = await api.get('/api/payments');
      downloadCsv(`payments-${today()}.csv`, [
        { key: 'payment_date', label: 'Date' }, { key: 'invoice_number', label: 'Invoice #' },
        { key: 'client_name', label: 'Client' }, { key: 'method', label: 'Method' },
        { key: 'reference', label: 'Reference' }, { label: 'Amount', get: (r) => (r.amount_cents / 100).toFixed(2) },
      ], payments);
    }
  } catch (err) { toastError(err); }
});

wireDeskClientActions(root, state, { draw, loadScreen });
wireJobActions(root, state, { draw, loadScreen });
wireBillingActions(root, state, { draw, loadScreen });

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/jobs': () => '/jobs',
  '/quotes': () => '/quotes',
  '/invoices': () => '/invoices',
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
