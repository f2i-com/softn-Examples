// SitePulse — High-Vis Amber & Structural Concrete Navy shell, bespoke micro-icons, grouped nav, calm ticker & routing.
import { html, render, on, cls, readForm, qs } from '../kit/dom.js';
import { api, messageOf } from '../kit/api.js';
import { createRouter } from '../kit/router.js';
import { setZone, today, fmtDay, fmtDate } from '../kit/time.js';
import { initials, money } from '../kit/format.js';
import { icon, addIcons } from '../kit/icons.js';
import { mountBusyBar, toast, toastError, confirmDialog, copyText } from '../kit/ui.js';
import { downloadCsv } from '../kit/export.js';
import { applyBrandPreset, renderSetupDoor, renderJoinDoor, renderTurnkeySettings } from '../kit/turnkey.js';
import { renderCommandView, renderDiaryView, wireCommandActions } from './views/command.js';
import { renderDefectsView, renderVariationsView, renderDeliveriesView, renderSubbiesView, wireFieldActions } from './views/field.js';

// Register bespoke construction & atmospheric micro-icons
addIcons({
  'site-crane': '<path d="M5 20h6M8 20V4l12 4.5M8 8.5h12M17 8.5V14M15.5 14a1.5 1.5 0 0 0 3 0M5 8.5h3"/>',
  'safety-vest': '<path d="M8 4h3l1 3 1-3h3l3 4-2 2.5V20H7v-9.5L5 8l3-4zM7 13h10M7 16.5h10"/>',
  'snag-cone': '<path d="M4 20h16M7 20l3.5-14.5a1.5 1.5 0 0 1 3 0L17 20M8.8 13h6.4M7.8 16.5h8.4"/>',
  cloud: '<path d="M6.5 18h11a4 4 0 0 0 0.8-7.9A5.5 5.5 0 0 0 7.6 8.3 4.2 4.2 0 0 0 6.5 18z"/>',
  wind: '<path d="M3 8h11.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2"/>',
});

export const BRAND_PRESETS = [
  { id: 'hi-vis-amber', label: 'Hi-Vis Amber', accent: '#c2590a', soft: '#fef3c7', rail: '#0e1828' },
  { id: 'blueprint-blue', label: 'Concrete Navy', accent: '#1e4b8f', soft: '#dbeafe', rail: '#0d192d' },
  { id: 'concrete-slate', label: 'Concrete Slate', accent: '#475569', soft: '#e2e8f0', rail: '#161c24' },
  { id: 'timber-rust', label: 'Timber Rust', accent: '#9a3412', soft: '#ffedd5', rail: '#221814' },
];

export const ROLES = [
  { id: 'manager', label: 'Site Manager' },
  { id: 'supervisor', label: 'Site Supervisor' },
  { id: 'subcontractor', label: 'Subcontractor' },
];

const root = document.getElementById('app');
mountBusyBar();

export const state = {
  booting: true,
  bootError: '',
  session: null,
  setupPreset: 'hi-vis-amber',
  setupBusy: false,
  setupError: '',
  route: '/',
  query: {},
  projects: [],
  diaries: [],
  defects: [],
  variations: [],
  varProjectTotals: [],
  deliveries: [],
  subcontractors: [],
  team: [],
  projFilter: 'All',
  diaryProj: 'All',
  diaryDateFilter: '',
  diaryChecks: {},
  defLayout: 'deck',
  defProj: 'All',
  defPrio: 'All',
  varProj: 'All',
  varStatus: 'All',
  delProj: 'All',
  delIssuesOnly: false,
  subFilter: 'All',
  subTrade: 'All',
  loading: false,
};

const NAV = [
  { path: '/', label: 'Projects Command', mobileLabel: 'Sites', icon: 'site-crane', badge: (c) => c?.activeProjects || 0 },
  { path: '/diary', label: 'Site Diary', mobileLabel: 'Diary', icon: 'clipboard' },
  { path: '/defects', label: 'Defect Snags', mobileLabel: 'Snags', icon: 'snag-cone', badge: (c) => c?.openDefects || 0, alert: true },
  { path: '/variations', label: 'Variations', mobileLabel: 'Vars', icon: 'file', badge: (c) => c?.pendingVariations || 0 },
  { path: '/deliveries', label: 'Deliveries', mobileLabel: 'Gate', icon: 'truck', badge: (c) => c?.deliveryIssues || 0, alert: true },
  { path: '/subbies', label: 'Subcontractors', mobileLabel: 'Subbies', icon: 'safety-vest', badge: (c) => c?.insuranceAlerts || 0, alert: true },
];

export async function refreshSession() {
  const s = await api.get('/api/session', { today: today() });
  state.session = s;
  if (s.settings) {
    if (s.settings.timezone) setZone(s.settings.timezone);
    applyBrandPreset(BRAND_PRESETS, s.settings.brand_preset || 'hi-vis-amber');
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
      const [p, d, df, sb] = await Promise.all([
        api.get('/api/projects', { today: today() }),
        api.get('/api/diaries'),
        api.get('/api/defects'),
        api.get('/api/subcontractors', { today: today() }),
      ]);
      state.projects = p.projects || [];
      state.diaries = d.diaries || [];
      state.defects = df.defects || [];
      state.subcontractors = sb.subcontractors || [];
    } else if (path === '/diary') {
      const [d, p] = await Promise.all([api.get('/api/diaries'), api.get('/api/projects', { today: today() })]);
      state.diaries = d.diaries || [];
      state.projects = p.projects || [];
    } else if (path === '/defects') {
      const [df, p] = await Promise.all([api.get('/api/defects'), api.get('/api/projects', { today: today() })]);
      state.defects = df.defects || [];
      state.projects = p.projects || [];
    } else if (path === '/variations') {
      const [v, p] = await Promise.all([api.get('/api/variations'), api.get('/api/projects', { today: today() })]);
      state.variations = v.variations || [];
      state.varProjectTotals = v.projectTotals || [];
      state.projects = p.projects || [];
    } else if (path === '/deliveries') {
      const [dl, p] = await Promise.all([api.get('/api/deliveries'), api.get('/api/projects', { today: today() })]);
      state.deliveries = dl.deliveries || [];
      state.projects = p.projects || [];
    } else if (path === '/subbies') {
      const sb = await api.get('/api/subcontractors', { today: today() });
      state.subcontractors = sb.subcontractors || [];
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
  if (state.route === '/diary') return renderDiaryView(state);
  if (state.route === '/defects') return renderDefectsView(state);
  if (state.route === '/variations') return renderVariationsView(state);
  if (state.route === '/deliveries') return renderDeliveriesView(state);
  if (state.route === '/subbies') return renderSubbiesView(state);
  if (state.route === '/settings') {
    return renderTurnkeySettings({
      settings: state.session.settings,
      me: state.session.me,
      team: state.team,
      roles: ROLES,
      presets: BRAND_PRESETS,
      sampleCount: state.session.counts?.sampleCount || 0,
      exports: [
        { id: 'diaries', label: 'Export Diaries CSV' },
        { id: 'defects', label: 'Export Defects CSV' },
        { id: 'variations', label: 'Export Variations CSV' },
        { id: 'deliveries', label: 'Export Deliveries CSV' },
        { id: 'subbies', label: 'Export Subbies CSV' },
      ],
    });
  }
  return renderCommandView(state);
}

export function draw() {
  if (state.booting) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><div class="tk-door__head"><div class="tk-door__icon">${icon('site-crane', { size: 26 })}</div><div><h1 class="tk-door__title">Opening SitePulse…</h1><p class="tk-door__sub">Connecting to your private site diary database.</p></div></div></div></div>`);
    return;
  }
  if (state.bootError) {
    render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">SitePulse could not start</h1><p class="tk-muted">${state.bootError}</p><button type="button" class="k-btn k-btn--primary" data-action="retry-boot">Try again</button></div></div>`);
    return;
  }
  const s = state.session;
  if (!s.setupDone) {
    if (!s.isOwner) {
      render(root, html`<div class="tk-door"><div class="tk-door__card"><h1 class="tk-door__title">SitePulse is not set up yet</h1><p class="tk-muted">Ask the builder / site manager to complete initial setup first.</p><button type="button" class="k-btn" data-action="refresh-session">Check again</button></div></div>`);
      return;
    }
    render(root, renderSetupDoor({
      appName: 'SitePulse',
      tagline: 'Run active builds, log daily site diaries with weather and headcount, chase snags, approve client variations, and track subbie insurance expiry.',
      iconName: 'site-crane',
      defaultBusiness: 'Ironbark Builders & Construction',
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
      appName: 'SitePulse',
      iconName: 'site-crane',
      pending: s.access === 'pending',
      roles: ROLES,
      busy: state.setupBusy,
      error: state.setupError,
    }));
    return;
  }

  const settings = s.settings;
  const counts = s.counts || {};
  const mobileTabs = [NAV[0], NAV[1], NAV[2], NAV[5], { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' }];

  const renderNavItem = (item) => {
    const count = item.badge ? item.badge(counts) : 0;
    return html`<a href="#${item.path}" class="${cls('tk-nav__item', { 'is-on': state.route === item.path })}">
      ${icon(item.icon, { size: 18 })}
      <span>${item.label}</span>
      ${count > 0 ? html`<span class="${cls('tk-nav__count', { 'tk-nav__count--alert': item.alert })}">${count}</span>` : ''}
    </a>`;
  };

  render(root, html`
    <div class="tk-shell">
      <aside class="tk-rail" aria-label="Primary navigation">
        <a href="#/" class="tk-brand">
          <span class="tk-brand__mark">${icon('site-crane', { size: 20 })}</span>
          <span class="tk-brand__copy">
            <span class="tk-brand__name">${settings.business_name}</span>
            <span class="tk-brand__sub">${settings.tagline || 'Construction Site Diary'}</span>
          </span>
        </a>
        <div class="tk-nav__group">Site Command</div>
        <nav class="tk-nav">
          ${NAV.slice(0, 3).map(renderNavItem)}
        </nav>
        <div class="tk-nav__group">Commercial &amp; Safety</div>
        <nav class="tk-nav">
          ${NAV.slice(3).map(renderNavItem)}
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
          <div class="sp-ticker">
            <span class="tk-pulse-dot" style="--dot:${counts.insuranceAlerts > 0 ? '#ef4444' : '#f59e0b'}"></span>
            <span>${fmtDate(today(), { weekday: 'short' })}</span>
            ${state.route !== '/' ? html`<a href="#/" class="sp-ticker__pill">${icon('site-crane', { size: 13 })} Sites (${counts.activeProjects || 0})</a>` : ''}
          </div>
          <div class="tk-topbar__spacer"></div>
          <div class="tk-topbar__actions">
            ${counts.insuranceAlerts > 0 ? html`
              <a href="#/subbies" class="sp-ticker__pill sp-ticker__pill--alert">
                ${icon('safety-vest', { size: 13 })} ${counts.insuranceAlerts} Ins. Alert${counts.insuranceAlerts === 1 ? '' : 's'}
              </a>` : ''}
            ${state.route !== '/diary' ? html`
              <a href="#/diary" class="sp-ticker__pill">${icon('clipboard', { size: 13 })} Diary</a>` : ''}
            <button type="button" class="sp-ticker__pill sp-ticker__pill--amber" data-action="copy-weekly-update">${icon('copy', { size: 13 })} Weekly Update</button>
            <button type="button" class="k-icon-btn" data-action="refresh-screen" aria-label="Refresh">${icon('refresh', { size: 17 })}</button>
          </div>
        </header>
        <main class="tk-page">${renderScreen()}</main>
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

on(root, 'click', '[data-action="copy-weekly-update"]', async () => {
  try {
    const todayStr = today();
    const [projRes, diaryRes, defRes, varRes] = await Promise.all([
      api.get('/api/projects', { today: todayStr }),
      api.get('/api/diaries'),
      api.get('/api/defects'),
      api.get('/api/variations'),
    ]);
    const projs = projRes.projects || [];
    const diaries = diaryRes.diaries || [];
    const defects = defRes.defects || [];
    const vars = varRes.variations || [];
    const s = state.session.settings;
    const cur = s.currency || 'AUD';

    const activeProjs = projs.filter((p) => p.status === 'Active' || p.status === 'Practical Completion');
    const openSnags = defects.filter((d) => d.status === 'Open' || d.status === 'In Progress');
    const approvedVarCents = vars.filter((v) => v.status === 'Approved').reduce((sum, v) => sum + Number(v.estimated_cost_cents || 0), 0);
    const pendingVarCents = vars.filter((v) => v.status === 'Pending').reduce((sum, v) => sum + Number(v.estimated_cost_cents || 0), 0);

    const lines = [
      `${s.business_name} — Weekly Client Project Update (${fmtDay(todayStr)})`,
      `Active Builds: ${activeProjs.length} | Recent Diaries: ${diaries.length} | Open Snags: ${openSnags.length} | Approved Variations: ${money(approvedVarCents, { currency: cur })}${pendingVarCents > 0 ? ' (Pending: ' + money(pendingVarCents, { currency: cur }) + ')' : ''}`,
      '',
      'ACTIVE PROJECTS:',
      ...(activeProjs.length
        ? activeProjs.map((p) => `- ${p.project_name} [${p.status}] — Crew Today: ${p.headcount_today || 0} · Diaries: ${p.diary_count || 0} · Open Snags: ${p.open_defects || 0} · Approved Vars: ${money(p.approved_var_cents || 0, { currency: cur })}${p.target_completion ? ' · Target: ' + fmtDay(p.target_completion) : ''}`)
        : ['- No active projects logged.']),
      '',
      'RECENT SITE DIARIES:',
      ...(diaries.length
        ? diaries.slice(0, 5).map((d) => `- ${fmtDay(d.diary_date)} · ${d.project_name} (${d.weather}, ${d.workers_on_site} crew): ${d.work_completed}${d.delays ? ' [Delay: ' + d.delays + ']' : ''}`)
        : ['- No site diary entries recorded yet.']),
      '',
      'OPEN DEFECTS / SNAGS:',
      ...(openSnags.length
        ? openSnags.slice(0, 6).map((d) => `- ${d.defect_code} [${d.priority} · ${d.status}] ${d.project_name}: ${d.issue_title} (${d.assigned_to || 'Unassigned'}${d.due_date ? ', due ' + fmtDay(d.due_date) : ''})`)
        : ['- Zero open defects/snags.']),
      '',
      'VARIATIONS SUMMARY:',
      ...(vars.length
        ? vars.slice(0, 6).map((v) => `- ${v.var_number} [${v.status}] ${v.project_name}: ${v.variation_title} — ${money(v.estimated_cost_cents, { currency: cur })}`)
        : ['- No contract variations raised.']),
    ];
    copyText(lines.join('\n'), { title: 'Weekly Client Update', done: 'Weekly client update copied.' });
  } catch (err) {
    toastError(err);
  }
});

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
    toast.success('SitePulse is live on site!');
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
    toast.success('SitePulse settings saved.');
    draw();
  } catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="load-sample"]', async () => {
  try { await api.post('/api/sample/load', { today: today() }); toast.success('Sample site data loaded.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="clear-sample"]', async () => {
  const ok = await confirmDialog({ title: 'Clear sample data?', message: 'Removes sample projects, diaries, defects, variations, deliveries and subbies. Real records stay.', confirmLabel: 'Clear sample data' });
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
  const ok = await confirmDialog({ title: 'Remove team member?', message: 'They will no longer have access to SitePulse.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try { await api.delete('/api/team', { user_id: el.dataset.id }); toast.success('Member removed.'); await loadScreen(); }
  catch (err) { toastError(err); }
});

on(root, 'click', '[data-action="export-data"]', async (e, el) => {
  const kind = el.dataset.export;
  try {
    if (kind === 'diaries') {
      const { diaries } = await api.get('/api/diaries');
      downloadCsv(`sitepulse-diaries-${today()}.csv`, [
        { key: 'diary_date', label: 'Date' }, { key: 'project_name', label: 'Project' },
        { key: 'weather', label: 'Weather' }, { key: 'workers_on_site', label: 'Workers' },
        { key: 'work_completed', label: 'Work Completed' }, { key: 'delays', label: 'Delays' },
        { key: 'visitors', label: 'Visitors' }, { key: 'signed_by', label: 'Signed By' },
      ], diaries);
    } else if (kind === 'defects') {
      const { defects } = await api.get('/api/defects');
      downloadCsv(`sitepulse-defects-${today()}.csv`, [
        { key: 'defect_code', label: 'Code' }, { key: 'project_name', label: 'Project' },
        { key: 'issue_title', label: 'Defect' }, { key: 'category', label: 'Category' },
        { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
        { key: 'assigned_to', label: 'Assigned To' }, { key: 'due_date', label: 'Due Date' },
      ], defects);
    } else if (kind === 'variations') {
      const { variations } = await api.get('/api/variations');
      downloadCsv(`sitepulse-variations-${today()}.csv`, [
        { key: 'var_number', label: 'Var #' }, { key: 'project_name', label: 'Project' },
        { key: 'variation_title', label: 'Title' }, { label: 'Estimated Cost', get: (r) => (r.estimated_cost_cents / 100).toFixed(2) },
        { key: 'status', label: 'Status' }, { key: 'client_approval_name', label: 'Client Approval' },
      ], variations);
    } else if (kind === 'deliveries') {
      const { deliveries } = await api.get('/api/deliveries');
      downloadCsv(`sitepulse-deliveries-${today()}.csv`, [
        { key: 'delivery_date', label: 'Date' }, { key: 'project_name', label: 'Project' },
        { key: 'supplier', label: 'Supplier' }, { key: 'material', label: 'Material' },
        { key: 'quantity', label: 'Qty' }, { key: 'unit', label: 'Unit' },
        { key: 'received_by', label: 'Received By' }, { key: 'issues', label: 'Issues' },
      ], deliveries);
    } else if (kind === 'subbies') {
      const { subcontractors } = await api.get('/api/subcontractors', { today: today() });
      downloadCsv(`sitepulse-subcontractors-${today()}.csv`, [
        { key: 'business_name', label: 'Business' }, { key: 'trade', label: 'Trade' },
        { key: 'contact', label: 'Contact' }, { key: 'phone', label: 'Phone' },
        { key: 'insurance_expiry', label: 'Insurance Expiry' }, { key: 'insurance_state', label: 'Compliance' },
        { key: 'status', label: 'Status' },
      ], subcontractors);
    }
  } catch (err) { toastError(err); }
});

const router = createRouter({
  '/': () => '/',
  '/diary': () => '/diary',
  '/defects': () => '/defects',
  '/variations': () => '/variations',
  '/deliveries': () => '/deliveries',
  '/subbies': () => '/subbies',
  '/settings': () => '/settings',
}, {
  notFound: () => '/',
  onChange: (route) => {
    state.route = route.pattern || '/';
    state.query = route.query;
    if (state.session?.access === 'granted') loadScreen(state.route);
  },
});

wireCommandActions(root, state, { draw, loadScreen });
wireFieldActions(root, state, { draw, loadScreen });

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
