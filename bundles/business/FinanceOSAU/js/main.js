// Finance OS (AU): start-up, bespoke private wealth micro-icons, turnkey setup/join gates,
// Private Bank Forest-Emerald & Sovereign Gold shell, grouped navigation, calm topbar ticker & CSV exports.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderWorkbenchView, wireWorkbenchActions } from './views/workbench.js';
import { renderClientsView, wireClientsActions } from './views/clients.js';
import { renderRiskView, wireRiskActions } from './views/risk.js';
import { renderFeesView, wireFeesActions } from './views/fees.js';
import { renderSuperView, renderTransfersView, wireSuperTransferActions } from './views/super_transfers.js';
import { renderReviewsVaultView, wireReviewsVaultActions } from './views/reviews_vault.js';

// Register bespoke Australian private wealth & AFSL micro-icons
addIcons({
  'au-crest': '<path d="M12 3 4.5 6.2v5.4c0 4.8 3.2 8.2 7.5 9.9 4.3-1.7 7.5-5.1 7.5-9.9V6.2L12 3z"/><path d="M12 7.5 13.4 10.6 16.5 12l-3.1 1.4L12 16.5l-1.4-3.1L7.5 12l3.1-1.4z"/>',
  'au-super': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  'au-transfer': '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
});

export const BRAND_PRESETS = [
  { id: 'harbour', label: 'Forest & Gold', accent: '#114237', soft: '#e1f0eb', rail: '#081b17' },
  { id: 'eucalyptus', label: 'Harbour Navy', accent: '#163859', soft: '#e3edf7', rail: '#0e1f33' },
  { id: 'gold', label: 'Sovereign Gold', accent: '#9a6511', soft: '#fcf3dc', rail: '#141e28' },
  { id: 'charcoal', label: 'Charcoal Private', accent: '#2b3b4e', soft: '#e6ebf1', rail: '#101824' },
];

export const ROLES = [
  { id: 'manager', label: 'Practice Principal' },
  { id: 'senior_adviser', label: 'Senior Adviser' },
  { id: 'adviser', label: 'Adviser' },
  { id: 'paraplanner', label: 'Paraplanner' },
  { id: 'compliance', label: 'Compliance Officer' },
  { id: 'operations', label: 'Operations' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'harbour',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain data
  workbench: null,
  wbRollovers: [],
  clients: [],
  selectedClientId: null,
  clientDetail: null,
  clientFilter: 'All',
  clientSearch: '',
  revealTfn: false,
  // Risk scorer state
  riskAssessments: [],
  riskFilter: 'All',
  riskDraft: { client_id: '', time_horizon: 12, market_reaction: 'hold', loss_capacity: 6, investment_experience: 'moderate', best_interest_notes: '' },
  // Fee disclosure state
  fees: [],
  feeFilter: 'All',
  feeDraft: { client_id: '', portfolio_value: 750000, fee_type: 'percentage', percentage_rate: '', fixed_fee: 5500, billing_frequency: 'quarterly', ongoing_fee_consent: 'pending', effective_date: '' },
  // Super & BDBN
  superTab: 'bdbn',
  bdbns: [],
  rollovers: [],
  bdbnDraft: {
    client_id: '', super_fund_name: '', member_number: '', nomination_date: '', witness_1_name: '', witness_2_name: '',
    witness_1_over_18: true, witness_2_over_18: true, notes: '',
    primaries: [{ name: '', relationship: 'Spouse', dob: '', percentage: 100 }],
    contingents: [],
  },
  // Off-market transfers
  transfers: [],
  transferFilter: 'All',
  // Reviews & Vault
  reviewsTab: 'reviews',
  reviews: [],
  documents: [],
  docTypeFilter: 'All',
  // Team
  team: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'AFSL Workbench', mobileLabel: 'Desk', icon: 'au-crest' },
  { path: '/clients', label: 'Clients & Files', mobileLabel: 'Clients', icon: 'users', badge: (c) => c?.clients || 0 },
  { path: '/risk', label: 'Risk Scorer', mobileLabel: 'Risk', icon: 'scale' },
  { path: '/fees', label: 'Fee Disclosures', mobileLabel: 'Fees', icon: 'receipt', badge: (c) => c?.pendingConsents || 0, alert: true },
  { path: '/super', label: 'Super & BDBN', mobileLabel: 'Super', icon: 'au-super', badge: (c) => c?.bdbnExpiring || 0, alert: true },
  { path: '/transfers', label: 'Off-Market Transfers', mobileLabel: 'CHESS', icon: 'au-transfer', badge: (c) => c?.activeTransfers || 0 },
  { path: '/reviews', label: 'Reviews & Vault', mobileLabel: 'Vault', icon: 'folder', badge: (c) => (c?.reviewsDue || 0) + (c?.docsExpiring || 0), alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'harbour');
  }
  return s;
}

export async function loadClientDetail(clientId) {
  if (!clientId) { state.clientDetail = null; return; }
  state.selectedClientId = Number(clientId);
  state.revealTfn = false;
  const d = await api.get('/api/clients/detail', { id: state.selectedClientId, today: today() });
  state.clientDetail = d;
}

export async function loadScreen(path = state.route) {
  state.loading = true;
  draw();
  try {
    await refreshSession();
    if (state.session?.access !== 'granted') { state.loading = false; draw(); return; }
    if (path === '/') {
      const [wb, rl] = await Promise.all([
        api.get('/api/workbench', { today: today() }),
        api.get('/api/rollovers'),
      ]);
      state.workbench = wb;
      state.wbRollovers = rl.rollovers || [];
    } else if (path === '/clients') {
      const res = await api.get('/api/clients', { stage: state.clientFilter, q: state.clientSearch });
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
      const [cl, fd] = await Promise.all([api.get('/api/clients'), api.get('/api/fees')]);
      state.clients = cl.clients || [];
      state.fees = fd.fees || [];
      if (!state.feeDraft.client_id && state.clients[0]) state.feeDraft.client_id = String(state.clients[0].id);
      if (!state.feeDraft.effective_date) state.feeDraft.effective_date = today();
    } else if (path === '/super') {
      const [cl, bd, rl] = await Promise.all([api.get('/api/clients'), api.get('/api/bdbns'), api.get('/api/rollovers')]);
      state.clients = cl.clients || [];
      state.bdbns = bd.bdbns || [];
      state.rollovers = rl.rollovers || [];
      if (!state.bdbnDraft.client_id && state.clients[0]) state.bdbnDraft.client_id = String(state.clients[0].id);
      if (!state.bdbnDraft.nomination_date) state.bdbnDraft.nomination_date = today();
    } else if (path === '/transfers') {
      const [cl, tr] = await Promise.all([api.get('/api/clients'), api.get('/api/transfers')]);
      state.clients = cl.clients || [];
      state.transfers = tr.transfers || [];
    } else if (path === '/reviews') {
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
  if (state.route === '/') return renderWorkbenchView(state);
  if (state.route === '/clients') return renderClientsView(state);
  if (state.route === '/risk') return renderRiskView(state);
  if (state.route === '/fees') return renderFeesView(state);
  if (state.route === '/super') return renderSuperView(state);
  if (state.route === '/transfers') return renderTransfersView(state);
  if (state.route === '/reviews') return renderReviewsVaultView(state);
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
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('au-crest', { size: 18 })} Australian AFSL Licence Details</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-afsl" novalidate>
              <label class="k-field">
                <span class="k-field__label">AFSL Number (printed on FDS &amp; Compliance Documents)</span>
                <input class="k-input" name="afsl_number" value="${s.afsl_number || ''}" placeholder="e.g. AFSL 514892" ${canManage ? '' : 'disabled'}>
              </label>
              ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary k-btn--sm">Update AFSL Licence</button></div>` : ''}
            </form>
          </div>
        </section>`,
      exports: [
        { id: 'clients', label: 'Export Clients CSV' },
        { id: 'fees', label: 'Export FDS Register CSV' },
        { id: 'transfers', label: 'Export Transfers CSV' },
        { id: 'reviews', label: 'Export Reviews CSV' },
      ],
    });
  }
  return renderWorkbenchView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('au-crest', { size: 26 })}</div><div><h1 class="tk-door__title">Opening Finance OS (AU)…</h1><p class="tk-door__sub">Connecting to your private AFSL advisory &amp; compliance ledger.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Finance OS (AU) could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">Finance OS (AU) is not set up yet</h1><p class="tk-muted">Ask the practice owner to complete initial AFSL workspace setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'Finance OS (AU)',
      tagline: 'Australian AFSL client onboarding, Best Interest Duty risk scoring, Fee Disclosure Statements (FDS), super rollovers, SIS Act BDBNs & document vault.',
      iconName: 'au-crest',
      defaultBusiness: 'Harbour Private Wealth',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <label class="k-field">
          <span class="k-field__label">AFSL Licence Number <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="afsl_number" value="AFSL 514892" placeholder="e.g. AFSL 514892">
        </label>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'Finance OS (AU)',
      iconName: 'au-crest',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const urgentDue = (counts.reviewsDue || 0) + (counts.docsExpiring || 0) + (counts.bdbnExpiring || 0);
  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('au-crest', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Australian AFSL Advisory'}</span>
            ${settings.afsl_number ? html`<span class="au-rail-afsl">${settings.afsl_number}</span>` : ''}
          </span>
        </a>
        <div class="tk-nav__group">Advisory Practice</div>
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
        <div class="tk-nav__group">Super &amp; Governance</div>
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
            ${icon('settings', { size: 18 })}<span>Practice &amp; Settings</span>
          </a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'Principal')}</span>
            <span>
              <span class="tk-user-chip__name">${s.me.displayName || 'Principal'}</span>
              <span class="tk-user-chip__role">${s.me.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="au-ticker">
            <span class="tk-pulse-dot" style="--dot:#d8a748"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${settings.afsl_number ? html`<span class="au-ticker__pill au-ticker__pill--gold">${settings.afsl_number}</span>` : ''}
            ${state.route !== '/' ? html`<a href="#/" class="au-ticker__pill">${icon('au-crest', { size: 13 })} Workbench</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/' && state.route !== '/fees' && counts.pendingConsents > 0 ? html`
              <a href="#/fees" class="au-ticker__pill au-ticker__pill--alert">${icon('receipt', { size: 13 })} ${counts.pendingConsents} FDS Pending</a>` : ''}
            ${state.route !== '/' && state.route !== '/reviews' && urgentDue > 0 ? html`
              <a href="#/reviews" class="au-ticker__pill au-ticker__pill--alert">${icon('alert', { size: 13 })} ${urgentDue} Due</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/risk" class="au-ticker__pill">${icon('scale', { size: 13 })} Risk Scorer</a>
              <a href="#/transfers" class="au-ticker__pill">${icon('au-transfer', { size: 13 })} CHESS (${counts.activeTransfers || 0})</a>` : ''}
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
    toast.success('Finance OS (AU) is live! Welcome to your AFSL workbench.');
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
    toast.success('Practice settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'submit', 'form[data-form="save-afsl"]', async (event, form) => {
  event.preventDefault();
  try {
    const vals = readForm(form);
    const cur = state.session.settings;
    const res = await api.put('/api/settings', { ...cur, afsl_number: vals.afsl_number });
    state.session.settings = res.settings;
    toast.success('AFSL licence number updated.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample AFSL client files loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all records tagged Sample. Your real client records stay untouched.', confirmLabel: 'Clear sample data' });
  if (!ok) return;
  try { await api.post('/api/sample/clear', { today: today() }); toast.success('Sample data cleared.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="approve-member"]', async (e, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, status: 'active' }); toast.success('Team member approved.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'change', '[data-action="change-member-role"]', async (e, el) => {
  try { await api.put('/api/team', { user_id: el.dataset.id, role: el.value }); toast.success('Role updated.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="remove-member"]', async (e, el) => {
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will lose access to this AFSL workspace.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'clients') {
      const { clients } = await api.get('/api/clients');
      downloadCsv(`finance-os-au-clients-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'email', label: 'Email' }, { key: 'residency_status', label: 'Residency' },
        { key: 'onboarding_stage', label: 'Stage' }, { key: 'wholesale_status', label: 'Wholesale s761G' },
        { label: 'Annual Income', get: (r) => (r.annual_income_cents / 100).toFixed(2) },
        { label: 'Net Assets', get: (r) => (r.net_assets_cents / 100).toFixed(2) },
        { key: 'risk_score', label: 'Risk Score' }, { label: 'FSG Ack', get: (r) => r.fsg_acknowledged ? 'Yes' : 'Pending' },
        { key: 'adviser_name', label: 'Adviser' },
      ], clients);
    } else if (kind === 'fees') {
      const { fees } = await api.get('/api/fees');
      downloadCsv(`finance-os-au-fds-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { label: 'Portfolio', get: (r) => (r.portfolio_value_cents / 100).toFixed(2) },
        { key: 'fee_type', label: 'Fee Type' }, { key: 'percentage_rate', label: 'Rate (%)' },
        { label: 'Annual Fee', get: (r) => (r.calculated_annual_fee_cents / 100).toFixed(2) },
        { key: 'billing_frequency', label: 'Billing' }, { key: 'ongoing_fee_consent', label: 'Consent' },
        { key: 'effective_date', label: 'Effective' }, { key: 'renewal_due_date', label: 'Renewal Due' },
      ], fees);
    } else if (kind === 'transfers') {
      const { transfers } = await api.get('/api/transfers');
      downloadCsv(`finance-os-au-transfers-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'delivering_platform', label: 'Delivering Platform' }, { key: 'hin_or_srn', label: 'HIN/SRN' },
        { key: 'transfer_type', label: 'Type' }, { key: 'chess_sponsorship', label: 'CHESS' },
        { label: 'Est Value', get: (r) => (r.estimated_value_cents / 100).toFixed(2) },
        { label: 'Fee', get: (r) => (r.transfer_fee_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' }, { key: 'submitted_date', label: 'Submitted' },
      ], transfers);
    } else if (kind === 'reviews') {
      const { reviews } = await api.get('/api/reviews');
      downloadCsv(`finance-os-au-reviews-${today()}.csv`, [
        { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'review_date', label: 'Review Date' },
        { label: 'Portfolio', get: (r) => (r.current_portfolio_value_cents / 100).toFixed(2) },
        { label: 'Annual Fee', get: (r) => (r.current_annual_fee_cents / 100).toFixed(2) },
        { key: 'goal_progress', label: 'Goal Progress (/10)' },
        { label: 'SOA Required', get: (r) => r.soa_required ? 'Yes' : 'No' },
        { key: 'next_review_date', label: 'Next Review' }, { key: 'status', label: 'Status' },
      ], reviews);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/clients': () => '/clients',
  '/risk': () => '/risk',
  '/fees': () => '/fees',
  '/super': () => '/super',
  '/transfers': () => '/transfers',
  '/reviews': () => '/reviews',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const actionsCtx = { draw, loadScreen, loadClientDetail, go: (p, q) => router.go(p, q) };
wireWorkbenchActions(root, state, actionsCtx);
wireClientsActions(root, state, actionsCtx);
wireRiskActions(root, state, actionsCtx);
wireFeesActions(root, state, actionsCtx);
wireSuperTransferActions(root, state, actionsCtx);
wireReviewsVaultActions(root, state, actionsCtx);

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
