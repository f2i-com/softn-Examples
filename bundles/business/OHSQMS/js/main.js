// OHS & QMS: start-up, industrial safety micro-icons, turnkey setup/join gates, Safety Slate & High-Vis Amber shell, grouped nav, calm ticker & CSV exports.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDate } from '../kit/time.js';
import { initials } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderCommandView, wireCommandActions } from './views/command.js';
import { renderIncidentsView, renderHazardsView, wireIncidentHazardActions } from './views/incidents_hazards.js';
import { renderCapaView, renderQualityView, wireCapaQualityActions } from './views/capa_quality.js';
import { renderTrainingView, renderSiteOpsView, wireTrainingSiteActions } from './views/training_site.js';

// Register bespoke industrial safety & ISO compliance micro-icons
addIcons({
  'safety-beacon': '<path d="M5 19h14M7 19l1.2-7.5a3.8 3.8 0 0 1 7.6 0L17 19M12 3v2.2M5.5 6.5l1.5 1.5M18.5 6.5 17 8"/>',
  'iso-seal': '<circle cx="12" cy="11" r="6.5"/><path d="m9.2 11.2 1.9 1.9 3.8-3.8M8.5 16.5 7 21l5-2 5 2-1.5-4.5"/>',
  'hazard-matrix': '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor"/>',
});

export const BRAND_PRESETS = [
  { id: 'amber', label: 'Safety Amber', accent: '#c96a08', soft: '#fef3dc', rail: '#0c1523' },
  { id: 'navy', label: 'ISO Slate Blue', accent: '#1d4e78', soft: '#e3eef8', rail: '#0e1929' },
  { id: 'emerald', label: 'Certified Emerald', accent: '#047857', soft: '#dcfce7', rail: '#0b211a' },
  { id: 'crimson', label: 'Alert Crimson', accent: '#c81e1e', soft: '#fee2e2', rail: '#1e1014' },
];

export const ROLES = [
  { id: 'manager', label: 'HSE / Quality Manager' },
  { id: 'safety_officer', label: 'Safety Officer' },
  { id: 'auditor', label: 'ISO Auditor' },
  { id: 'worker', label: 'Worker / Team Member' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'amber',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  // Domain state
  command: null,
  incidents: [],
  injuries: [],
  incTab: 'incidents',
  incFilter: 'All',
  hazards: [],
  matrixCell: null, // { l, c } or null
  hazardRatingFilter: 'All',
  hazardDraft: { hazard_title: '', location: '', hazard_type: 'Physical', likelihood: 4, consequence: 4, control_type: 'Engineering Controls', control_description: '', hazard_description: '' },
  actions: [],
  capaFilter: 'All',
  qualityTab: 'audits',
  audits: [],
  cars: [],
  ncrs: [],
  trainTab: 'training',
  training: [],
  trainFilter: 'All',
  trainSearch: '',
  contractors: [],
  siteTab: 'meetings',
  meetings: [],
  plant: [],
  complaints: [],
  team: [],
  loading: false,
};

const NAV = [
  { path: '/', label: 'Safety Command', mobileLabel: 'Command', icon: 'hardhat' },
  { path: '/incidents', label: 'Incidents & Injuries', mobileLabel: 'Incidents', icon: 'safety-beacon', badge: (c) => c?.openIncidents || 0, alert: true },
  { path: '/hazards', label: '5×5 Hazard Matrix', mobileLabel: 'Hazards', icon: 'hazard-matrix', badge: (c) => c?.highHazards || 0, alert: true },
  { path: '/capa', label: 'CAPA & Actions', mobileLabel: 'CAPA', icon: 'check-square', badge: (c) => c?.overdueCapas || 0, alert: true },
  { path: '/quality', label: 'Audits, CARs & NCRs', mobileLabel: 'Quality', icon: 'iso-seal', badge: (c) => c?.openQuality || 0 },
  { path: '/training', label: 'Training & Contractors', mobileLabel: 'Training', icon: 'award', badge: (c) => (c?.expiringTraining || 0) + (c?.expiringContractors || 0), alert: true },
  { path: '/site', label: 'Toolbox, Plant & Complaints', mobileLabel: 'Site', icon: 'wrench', badge: (c) => c?.plantDue || 0 },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'amber');
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
      const [cmd, hz, tr] = await Promise.all([
        api.get('/api/command', { today: today() }),
        api.get('/api/hazards'),
        api.get('/api/training', { today: today() }),
      ]);
      state.command = cmd;
      state.hazards = hz.hazards || [];
      state.training = tr.training || [];
    } else if (path === '/incidents') {
      const [inc, inj] = await Promise.all([api.get('/api/incidents'), api.get('/api/injuries')]);
      state.incidents = inc.incidents || [];
      state.injuries = inj.injuries || [];
    } else if (path === '/hazards') {
      const hz = await api.get('/api/hazards');
      state.hazards = hz.hazards || [];
    } else if (path === '/capa') {
      const ac = await api.get('/api/actions');
      state.actions = ac.actions || [];
    } else if (path === '/quality') {
      const [au, ca, nc] = await Promise.all([api.get('/api/audits'), api.get('/api/cars'), api.get('/api/ncrs')]);
      state.audits = au.audits || [];
      state.cars = ca.cars || [];
      state.ncrs = nc.ncrs || [];
    } else if (path === '/training') {
      const [tr, co] = await Promise.all([api.get('/api/training', { today: today() }), api.get('/api/contractors', { today: today() })]);
      state.training = tr.training || [];
      state.contractors = co.contractors || [];
    } else if (path === '/site') {
      const [mt, pl, cm] = await Promise.all([api.get('/api/meetings'), api.get('/api/plant', { today: today() }), api.get('/api/complaints')]);
      state.meetings = mt.meetings || [];
      state.plant = pl.plant || [];
      state.complaints = cm.complaints || [];
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
  if (state.route === '/') return renderCommandView(state);
  if (state.route === '/incidents') return renderIncidentsView(state);
  if (state.route === '/hazards') return renderHazardsView(state);
  if (state.route === '/capa') return renderCapaView(state);
  if (state.route === '/quality') return renderQualityView(state);
  if (state.route === '/training') return renderTrainingView(state);
  if (state.route === '/site') return renderSiteOpsView(state);
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
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('iso-seal', { size: 18 })} ISO Certification Reference</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-iso" novalidate>
              <label class="k-field">
                <span class="k-field__label">ISO 45001 / ISO 9001 Certification Reference</span>
                <input class="k-input" name="iso_cert_ref" value="${s.iso_cert_ref || ''}" placeholder="e.g. ISO 45001:2018 · ISO 9001:2015" ${canManage ? '' : 'disabled'}>
              </label>
              ${canManage ? html`<div class="k-form__actions"><button type="submit" class="k-btn k-btn--primary k-btn--sm">Save Certification Ref</button></div>` : ''}
            </form>
          </div>
        </section>`,
      exports: [
        { id: 'incidents', label: 'Export Incidents CSV' },
        { id: 'hazards', label: 'Export 5x5 Hazards CSV' },
        { id: 'actions', label: 'Export CAPA Register CSV' },
        { id: 'training', label: 'Export Training Matrix CSV' },
      ],
    });
  }
  return renderCommandView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('hardhat', { size: 26 })}</div><div><h1 class="tk-door__title">Opening OHS &amp; QMS…</h1><p class="tk-door__sub">Connecting to your private ISO 45001 &amp; ISO 9001 database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">OHS &amp; QMS could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">OHS &amp; QMS is not set up yet</h1><p class="tk-muted">Ask your HSE / Quality owner to finish initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'OHS & QMS',
      tagline: 'ISO 45001 workplace safety & ISO 9001 quality management: incidents, 5×5 risk matrix, CAPAs, audits/CARs/NCRs, training expiry, contractors & plant register.',
      iconName: 'hardhat',
      defaultBusiness: 'Apex Industrial Operations',
      defaultCurrency: 'AUD',
      defaultZone: 'Australia/Sydney',
      presets: BRAND_PRESETS,
      selectedPreset: state.setupPreset,
      extraFields: html`
        <label class="k-field">
          <span class="k-field__label">ISO Certification Scope <span class="k-field__optional">optional</span></span>
          <input class="k-input" name="iso_cert_ref" value="ISO 45001:2018 / ISO 9001:2015">
        </label>`,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }
  if (s.access === 'join' || s.access === 'pending') {
    render(root, renderJoinDoor({
      businessName: s.businessName,
      appName: 'OHS & QMS',
      iconName: 'hardhat',
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
  const hasUrgent = (counts.ltiCount || 0) > 0 || (counts.overdueCapas || 0) > 0;
  const tickerDot = hasUrgent ? '#ef4444' : (counts.openIncidents || 0) > 0 ? '#f59e0b' : '#10b981';

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('hardhat', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Workplace Health & Quality'}</span>
            ${settings.iso_cert_ref ? html`<span class="ohs-rail-iso">${settings.iso_cert_ref}</span>` : ''}
          </span>
        </a>
        <div class="tk-nav__group">Safety &amp; Risk</div>
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
        <div class="tk-nav__group">Quality &amp; Site</div>
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
            ${icon('settings', { size: 18 })}<span>System &amp; Settings</span>
          </a>
          <div class="tk-user-chip">
            <span class="tk-avatar">${initials(s.me.displayName || 'HSE')}</span>
            <span>
              <span class="tk-user-chip__name">${s.me.displayName || 'HSE'}</span>
              <span class="tk-user-chip__role">${s.me.role}</span>
            </span>
          </div>
        </div>
      </aside>

      <div class="tk-main">
        <header class="tk-topbar">
          <a href="#/" class="tk-topbar__brand">${settings.business_name}</a>
          <div class="ohs-ticker">
            <span class="tk-pulse-dot" style="--dot:${tickerDot}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${settings.iso_cert_ref ? html`<span class="ohs-ticker__iso">${icon('iso-seal', { size: 12 })} ${settings.iso_cert_ref}</span>` : ''}
            ${state.route !== '/' ? html`<a href="#/" class="ohs-ticker__pill">${icon('hardhat', { size: 13 })} Command</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${state.route !== '/capa' && (counts.overdueCapas || 0) > 0 ? html`
              <a href="#/capa" class="ohs-ticker__pill ohs-ticker__pill--alert">${icon('alert', { size: 13 })} ${counts.overdueCapas} Overdue CAPA</a>` : ''}
            ${state.route !== '/incidents' && (counts.openIncidents || 0) > 0 ? html`
              <a href="#/incidents" class="ohs-ticker__pill ohs-ticker__pill--alert">${icon('safety-beacon', { size: 13 })} ${counts.openIncidents} Incident${counts.openIncidents === 1 ? '' : 's'}</a>` : ''}
            ${state.route === '/' ? html`
              <a href="#/quality" class="ohs-ticker__pill">${icon('iso-seal', { size: 13 })} Quality (${counts.openQuality || 0})</a>
              <a href="#/training" class="ohs-ticker__pill">${icon('award', { size: 13 })} Training</a>` : ''}
            ${state.route !== '/' && state.route !== '/hazards' ? html`
              <a href="#/hazards" class="ohs-ticker__pill">${icon('hazard-matrix', { size: 13 })} 5×5 Matrix</a>` : ''}
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
    toast.success('OHS & QMS is live!');
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
    toast.success('System settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'submit', 'form[data-form="save-iso"]', async (event, form) => {
  event.preventDefault();
  try {
    const res = await api.put('/api/settings', { ...state.session.settings, iso_cert_ref: readForm(form).iso_cert_ref });
    state.session.settings = res.settings;
    toast.success('ISO certification reference saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample OHS & QMS records loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes all Sample safety & quality records while preserving your real entries.', confirmLabel: 'Clear sample data' });
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'Remove their access?', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'incidents') {
      const { incidents } = await api.get('/api/incidents');
      downloadCsv(`ohs-incidents-${today()}.csv`, [
        { key: 'incident_code', label: 'Code' }, { key: 'incident_date', label: 'Date' },
        { key: 'incident_title', label: 'Title' }, { key: 'location', label: 'Location' },
        { key: 'incident_type', label: 'Type' }, { key: 'severity', label: 'Severity' },
        { label: 'LTI', get: (r) => r.lost_time_injury ? 'Yes' : 'No' },
        { key: 'investigation_status', label: 'Status' }, { key: 'reported_by', label: 'Reported By' },
      ], incidents);
    } else if (kind === 'hazards') {
      const { hazards } = await api.get('/api/hazards');
      downloadCsv(`ohs-hazards-5x5-${today()}.csv`, [
        { key: 'hazard_title', label: 'Hazard' }, { key: 'location', label: 'Location' },
        { key: 'hazard_type', label: 'Category' }, { key: 'likelihood', label: 'L (1-5)' },
        { key: 'consequence', label: 'C (1-5)' }, { key: 'risk_score', label: 'Risk Score' },
        { key: 'risk_rating', label: 'Rating' }, { key: 'control_type', label: 'Control Hierarchy' },
        { key: 'residual_risk', label: 'Residual Risk' }, { key: 'status', label: 'Status' },
      ], hazards);
    } else if (kind === 'actions') {
      const { actions } = await api.get('/api/actions');
      downloadCsv(`ohs-capa-actions-${today()}.csv`, [
        { key: 'action_title', label: 'Action' }, { key: 'source_type', label: 'Source' },
        { key: 'priority', label: 'Priority' }, { key: 'assigned_to', label: 'Assigned To' },
        { key: 'due_date', label: 'Due Date' }, { key: 'status', label: 'Status' },
      ], actions);
    } else if (kind === 'training') {
      const { training } = await api.get('/api/training', { today: today() });
      downloadCsv(`ohs-training-matrix-${today()}.csv`, [
        { key: 'employee_name', label: 'Employee' }, { key: 'course_name', label: 'Course' },
        { key: 'is_mandatory', label: 'Mandatory' }, { key: 'completion_date', label: 'Completed' },
        { key: 'expiry_date', label: 'Expiry' }, { key: 'expiry_status', label: 'Status' },
        { key: 'certificate_number', label: 'Certificate #' },
      ], training);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/incidents': () => '/incidents',
  '/hazards': () => '/hazards',
  '/capa': () => '/capa',
  '/quality': () => '/quality',
  '/training': () => '/training',
  '/site': () => '/site',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

const ctx = { draw, loadScreen, go: (p, q) => router.go(p, q) };
wireCommandActions(root, state, ctx);
wireIncidentHazardActions(root, state, ctx);
wireCapaQualityActions(root, state, ctx);
wireTrainingSiteActions(root, state, ctx);

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
