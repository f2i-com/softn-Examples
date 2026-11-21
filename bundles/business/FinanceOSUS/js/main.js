// Finance OS (US): start-up, bespoke RIA micro-icons, turnkey setup/join doors,
// Institutional Oxford Navy & Champagne Brass shell, grouped nav, calm topbar ticker & CSV exports.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderDeskView, wireDeskActions } from './views/desk.js';
import { renderClientsView, wireClientsActions } from './views/clients.js';
import { renderRiskView, renderFeesView, wireRiskFeeActions } from './views/risk_fees.js';
import { renderTransfersView, wireTransferActions } from './views/transfers.js';
import { renderEstateView, renderVaultView, wireEstateVaultActions } from './views/estate_vault.js';

// Register bespoke Wall Street RIA, ACATS transition & trust micro-icons
addIcons({
  'us-pillar': '<path d="M3 9.5 12 4l9 5.5H3zM5 9.5V18M9.5 9.5V18M14.5 9.5V18M19 9.5V18M3 18h18M2.5 20.5h19"/>',
  'us-acat': '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  'us-trust': '<path d="M12 3.5 5 6.3v5c0 4.6 3 7.9 7 9.5 4-1.6 7-4.9 7-9.5v-5L12 3.5z"/><circle cx="12" cy="11.5" r="2.5"/><path d="M12 14v3"/>',
});

export const BRAND_PRESETS = [
  { id: 'federal', label: 'Oxford Navy', accent: '#162a4c', soft: '#e6ecf6', rail: '#0a1222' },
  { id: 'wallstreet', label: 'Wall Street Slate', accent: '#253143', soft: '#e7ebf1', rail: '#0b0f19' },
  { id: 'bronze', label: 'Champagne Brass', accent: '#965d24', soft: '#fbf3e2', rail: '#161411' },
  { id: 'emerald', label: 'Heritage Emerald', accent: '#154c39', soft: '#e2f1ea', rail: '#0c2019' },
];

export const ROLES = [
  { id: 'manager', label: 'Managing Advisor' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'transition', label: 'Transition Coordinator' },
  { id: 'compliance', label: 'Compliance Officer' },
  { id: 'operations', label: 'Operations' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'federal',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain state
  desk: null,
  deskFees: [],
  clients: [],
  selectedClientId: null,
  clientDetail: null,
  clientFilter: 'All',
  clientSearch: '',
  revealSsn: false,
  // Risk scorer
  riskAssessments: [],
  riskFilter: 'All',
  riskDraft: { client_id: '', time_horizon: 15, market_reaction: 'hold', loss_capacity: 6, investment_experience: 'moderate', portfolio_type: 'Moderate', rationale: '' },
  // Tiered AUM Fee Calculator
  agreements: [],
  feeFilter: 'All',
  feeDraft: { client_id: '', account_value: 1250000, fee_tier: 'Standard', billing_frequency: 'Quarterly', status: 'Executed', effective_date: '' },
  // Transfers Hub
  transferTab: 'acat',
  acats: [],
  rollovers: [],
  exchanges: [],
  // Beneficiaries & POA
  estateTab: 'beneficiaries',
  beneficiaries: [],
  poas: [],
  benDraft: {
    client_id: '', account_label: '', effective_date: '', notes: '',
    primaries: [{ name: '', relationship: 'Spouse', percentage: 100 }],
  },
  // Reviews & Vault
  vaultTab: 'reviews',
  reviews: [],
  documents: [],
  docFilter: 'All',
  team: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'RIA Desk', mobileLabel: 'Desk', icon: 'us-pillar' },
  { path: '/clients', label: 'Clients & CRS', mobileLabel: 'Clients', icon: 'users', badge: (c) => c?.crsPending || 0, alert: true },
  { path: '/risk', label: 'IPS & Risk', mobileLabel: 'Risk', icon: 'scale' },
  { path: '/fees', label: 'AUM Fee Calc', mobileLabel: 'Fees', icon: 'dollar' },
  { path: '/transfers', label: 'Transfers Hub', mobileLabel: 'ACATS', icon: 'us-acat', badge: (c) => c?.activeTransfers || 0 },
  { path: '/estate', label: 'Estate & POA', mobileLabel: 'Estate', icon: 'us-trust' },
  { path: '/vault', label: 'Reviews & Vault', mobileLabel: 'Vault', icon: 'folder', badge: (c) => (c?.reviewsDue || 0) + (c?.docsExpiring || 0), alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'federal');
  }
  return s;
}

export async function loadClientDetail(clientId) {
  if (!clientId) { state.clientDetail = null; return; }
  state.selectedClientId = Number(clientId);
  state.revealSsn = false;
  state.clientDetail = await api.get('/api/clients/detail', { id: state.selectedClientId, today: today() });
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [dk, fe] = await Promise.all([
        api.get('/api/desk', { today: today() }),
        api.get('/api/fees'),
      ]);
      state.desk = dk;
      state.deskFees = fe.agreements || [];
    } else if (path === '/clients') {
      const res = await api.get('/api/clients', { filter: state.clientFilter, q: state.clientSearch });
      state.clients = res.clients || [];
      const wanted = state.query.client ? Number(state.query.client) : state.selectedClientId;
      const pick = state.clients.find((c) => c.id === wanted) || state.clients[0];
      if (pick) await loadClientDetail(pick.id);
      else { state.selectedClientId = null; state.clientDetail = null; }
    } else if (path === '/risk') {
      const [cl, rk] = await Promise.all([api.get('/api/clients'), api.get('/api/risk')]);
      state.clients = cl.clients || [];
      state.riskAssessments = rk.assessments || [];
      if (!state.riskDraft.client_id && state.clients[0]) state.riskDraft.client_id = String(state.clients[0].id);
    } else if (path === '/fees') {
      const [cl, ag] = await Promise.all([api.get('/api/clients'), api.get('/api/fees')]);
      state.clients = cl.clients || [];
      state.agreements = ag.agreements || [];
      if (!state.feeDraft.client_id && state.clients[0]) state.feeDraft.client_id = String(state.clients[0].id);
      if (!state.feeDraft.effective_date) state.feeDraft.effective_date = today();
    } else if (path === '/transfers') {
      const [cl, ac, rl, ex] = await Promise.all([api.get('/api/clients'), api.get('/api/acats'), api.get('/api/rollovers'), api.get('/api/exchanges')]);
      state.clients = cl.clients || [];
      state.acats = ac.acats || [];
      state.rollovers = rl.rollovers || [];
      state.exchanges = ex.exchanges || [];
    } else if (path === '/estate') {
      const [cl, bn, po] = await Promise.all([api.get('/api/clients'), api.get('/api/beneficiaries'), api.get('/api/poas')]);
      state.clients = cl.clients || [];
      state.beneficiaries = bn.beneficiaries || [];
      state.poas = po.poas || [];
      if (!state.benDraft.client_id && state.clients[0]) state.benDraft.client_id = String(state.clients[0].id);
      if (!state.benDraft.effective_date) state.benDraft.effective_date = today();
    } else if (path === '/vault') {
      const [cl, rv, dc] = await Promise.all([api.get('/api/clients'), api.get('/api/reviews'), api.get('/api/documents', { today: today() })]);
      state.clients = cl.clients || [];
      state.reviews = rv.reviews || [];
      state.documents = dc.documents || [];
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
  if (state.route === '/') return renderDeskView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/risk') return renderRiskView(state);
  if (state.route === '/fees') return renderFeesView(state);
  if (state.route === '/transfers') return renderTransfersView(state);
  if (state.route === '/estate') return renderEstateView(state);
  if (state.route === '/vault') return renderVaultView(state);
  if (state.route === '/settings') {
    const s = state.session.settings;
    const canManage = state.session.me && (state.session.me.isOwner || state.session.me.role === 'owner' || state.session.me.role === 'manager');
    return renderTurnkeySettings({
      settings: s,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      extraSection: html`
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('us-pillar', { size: 18 })} SEC RIA / CRD Registration</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-crd" novalidate>
              <label class="k-field">
                <span class="k-field__label">SEC IARD / CRD Number (shown on Fee Schedules &amp; Compliance Docs)</span>
                <input class="k-input" name="crd_number" value="${s.crd_number || ''}" placeholder="e.g. CRD #289410" ${canManage ? '' : 'disabled'}>
              </label>
              ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary k-btn--sm">Save CRD Number</button></div>` : ''}
            </form>
          </div>
        </section>`,
      exports: [
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'fees', label: 'Export AUM Fee Schedules CSV' },
        { id: 'acats', label: 'Export ACAT Transfers CSV' },
        { id: 'reviews', label: 'Export Annual Reviews CSV' },
      ],
    });
  }
  return renderDeskView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('us-pillar', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Finance OS (US)…</h1><p class="tk-door__sub">Connecting to your private RIA compliance ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Finance OS (US) could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Finance OS (US) is not set up yet</h1><p class="tk-muted">Ask the RIA firm owner to finish initial workspace setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Finance OS (US)',
      tagline: 'SEC Form CRS & W-9 onboarding, Reg BI risk scoring, progressive tiered AUM fee schedules, ACAT/Rollover/1035 transfers, 100%-validated beneficiaries & document vault.',
      iconName: 'us-pillar',
      defaultBusiness: 'Meridian Federal Wealth RIA',
      defaultCurrency: 'USD',
      defaultZone: 'America/New_York',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <label class="k-field">
          <span class="k-field__label">SEC CRD / IARD Number <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="crd_number" value="CRD #289410" placeholder="e.g. CRD #289410">
        </label>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Finance OS (US)',
      iconName: 'us-pillar',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const urgentVault = (counts.reviewsDue || 0) + (counts.docsExpiring || 0);
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('us-pillar', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'SEC Registered RIA'}</span>
            ${settings.crd_number ? html`<span class="us-rail-crd">${settings.crd_number}</span>` : ''}
          </span>
        </a>
        <div class="tk-nav__group">Advisory &amp; Portfolio</div>
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
        <div class="tk-nav__group">Transitions &amp; Governance</div>
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
            ${icon('settings', { size: 18 })}<span>Firm &amp; Settings</span>
          </a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'Advisor')}</span>
            <span>
              <span class="tk-user-chip__name">${s.me.displayName || 'Advisor'}</span>
              <span class="tk-user-chip__role">${s.me.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="us-ticker">
            <span class="tk-pulse-dot" style="--dot:#d3a154"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${settings.crd_number ? html`<span class="us-ticker__pill us-ticker__pill--brass">${settings.crd_number}</span>` : ''}
            ${state.route !== '/' ? html`<a href="#/" class="us-ticker__pill">${icon('us-pillar', { size: 13 })} RIA Desk</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/clients' && counts.crsPending > 0 ? html`
              <a href="#/clients" class="us-ticker__pill us-ticker__pill--alert">${icon('shield', { size: 13 })} ${counts.crsPending} CRS Pending</a>` : ''}
            ${state.route !== '/' && state.route !== '/vault' && urgentVault > 0 ? html`
              <a href="#/vault" class="us-ticker__pill us-ticker__pill--alert">${icon('alert', { size: 13 })} ${urgentVault} Due</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/fees" class="us-ticker__pill">${icon('dollar', { size: 13 })} AUM Calc</a>
              <a href="#/transfers" class="us-ticker__pill">${icon('us-acat', { size: 13 })} ACATS (${counts.activeTransfers || 0})</a>` : ''}
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
    toast.success('Finance OS (US) is live! Welcome to your RIA desk.');
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
    toast.success('Firm settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'submit', 'form[data-form="save-crd"]', async (event, form) => {
  event.preventDefault();
  try {
    const res = await api.put('/api/settings', { ...state.session.settings, crd_number: readForm(form).crd_number });
    state.session.settings = res.settings;
    toast.success('SEC CRD number saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample US RIA data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real client records stay untouched.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will lose access to this RIA workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`finance-os-us-clients-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'email', label: 'Email' }, { key: 'citizenship', label: 'Citizenship' },
        { key: 'onboarding_stage', label: 'Stage' }, { key: 'accredited_investor', label: 'Accredited (501a)' },
        { label: 'Annual Income', get: (r) => (r.annual_income_cents / 100).toFixed(2) },
        { label: 'Net Worth', get: (r) => (r.net_worth_cents / 100).toFixed(2) },
        { key: 'portfolio_allocation', label: 'Allocation' },
        { label: 'Form CRS', get: (r) => r.crs_acknowledged ? 'Signed' : 'Pending' },
        { key: 'w9_tax_classification', label: 'W-9 Class' },
      ], clients);
    } else if (kind === 'fees') {
      const { agreements } = await api.get('/api/fees');
      downloadCsv(`finance-os-us-fees-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { label: 'AUM', get: (r) => (r.account_value_cents / 100).toFixed(2) },
        { key: 'fee_tier', label: 'Tier' }, { key: 'effective_bps', label: 'Eff. Bps' },
        { label: 'Annual Fee', get: (r) => (r.annual_fee_cents / 100).toFixed(2) },
        { label: 'Quarterly Fee', get: (r) => (r.quarterly_fee_cents / 100).toFixed(2) },
        { key: 'billing_frequency', label: 'Billing' }, { key: 'status', label: 'Status' },
      ], agreements);
    } else if (kind === 'acats') {
      const { acats } = await api.get('/api/acats');
      downloadCsv(`finance-os-us-acats-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'custodian', label: 'Custodian' }, { key: 'account_number', label: 'Account #' },
        { key: 'transfer_type', label: 'Type' }, { label: 'Value', get: (r) => (r.estimated_value_cents / 100).toFixed(2) },
        { label: 'Fee', get: (r) => (r.transfer_fee_cents / 100).toFixed(2) }, { key: 'status', label: 'Status' },
      ], acats);
    } else if (kind === 'reviews') {
      const { reviews } = await api.get('/api/reviews');
      downloadCsv(`finance-os-us-reviews-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'review_date', label: 'Review Date' }, { label: 'AUM', get: (r) => (r.current_aum_cents / 100).toFixed(2) },
        { key: 'goal_progress', label: 'Goal (/10)' }, { key: 'next_review_date', label: 'Next Due' },
      ], reviews);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/risk': () => '/risk',
  '/fees': () => '/fees',
  '/transfers': () => '/transfers',
  '/estate': () => '/estate',
  '/vault': () => '/vault',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, loadClientDetail };
wireDeskActions(root, state, ctx);
wireClientsActions(root, state, ctx);
wireRiskFeeActions(root, state, ctx);
wireTransferActions(root, state, ctx);
wireEstateVaultActions(root, state, ctx);

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
