// Quality Checklists (Unified Masthead + Conic Score Ring + Team Scorecards),
// Cleaning Supplies Par Stock (Unified Masthead + Par Health Ring),
// Client Issues Desk (Unified Masthead + 3-Stage Resolution Stepper Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { num } from '../../kit/format.js';
import { today, fmtDay, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { QC_ITEMS, renderStars, openQualityDialog, crewPalette, crewStyle, teamQualityStats } from './dispatch.js';

const SUPPLY_CATS = ['Chemicals', 'Cloths and pads', 'Equipment', 'Consumables'];
const SUPPLY_UNITS = ['bottles', 'packs', 'units', 'boxes'];
const ISSUE_TYPES = ['Complaint', 'Damage', 'Access issue', 'Missed item', 'Payment issue'];
const SEVERITIES = ['High', 'Medium', 'Low'];

const SEV_CLASS = { High: 'cs-severity-high', Medium: 'cs-severity-med', Low: 'cs-severity-low' };
const ISSUE_TAG = { Open: 'tk-tag--bad', Investigating: 'tk-tag--warn', Resolved: 'tk-tag--ok' };
const ISSUE_STEPS = ['Open', 'Investigating', 'Resolved'];

export function renderQualityView(state) {
  const avgNum = state.checks.length
    ? state.checks.reduce((s, q) => s + Number(q.rating || 0), 0) / state.checks.length
    : 0;
  const avg = avgNum ? avgNum.toFixed(1) : '—';
  const avgPct = Math.round((avgNum / 5) * 100);
  const followUps = state.checks.filter((q) => q.follow_up === 'Yes').length;
  const passedCount = state.checks.filter((q) => q.follow_up !== 'Yes').length;

  return html`
    <section class="cs-masthead" aria-label="Quality Checklists Command">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          INSPECTION AUDITS · ROOM STANDARDS
        </div>
        <h1 class="cs-masthead__title">Quality Checklists</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${state.checks.length} audit${state.checks.length === 1 ? '' : 's'}</strong> logged</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>6-zone room verification</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live crew scorecards</span>
        </div>
      </div>

      <div class="cs-masthead__pods cs-masthead__pods--3" style="align-items:center">
        <div class="cs-pod cs-pod--ring cs-pod--aqua">
          <div class="tk-ring" style="--p:${avgPct}%;--ring-color:#34d399;--ring-size:48px">
            <span class="tk-ring__val">${avgPct}%</span>
          </div>
          <div>
            <span class="cs-pod__lbl">Avg Rating</span>
            <span class="cs-pod__val">${avg} ★</span>
            <span class="cs-pod__sub">Out of 5.0</span>
          </div>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('check-circle', { size: 12 })} Passed</span>
          <span class="cs-pod__val">${passedCount}</span>
          <span class="cs-pod__sub">Clean sign-offs</span>
        </div>

        <div class="${cls('cs-pod', { 'cs-pod--alert': followUps > 0 })}">
          <span class="cs-pod__lbl">${icon(followUps > 0 ? 'alert' : 'shield-check', { size: 12 })} Follow-Ups</span>
          <span class="cs-pod__val">${followUps}</span>
          <span class="cs-pod__sub">${followUps > 0 ? 'Needs rework' : 'Zero rework'}</span>
        </div>

        <button type="button" class="k-btn cs-cta-bright" data-action="qc-new">${icon('check-square', { size: 15 })} Run Check</button>
      </div>
    </section>

    ${state.teams.length ? html`
      <div class="cs-team-scores">
        ${state.teams.map((tm) => {
          const pal = crewPalette(tm.id, state.teams);
          const qStats = teamQualityStats(tm, state.checks, state.jobs);
          return html`
            <div class="cs-team-score-card" style="${crewStyle(pal)}" data-key="team-score-${tm.id}">
              <div class="cs-team-score-card__strip">
                <span class="cs-team-score-card__name"><span class="cs-crew-pill__dot" style="background:${pal.color}"></span>${tm.team_name}</span>
                <span class="cs-rating-pill cs-rating-pill--${qStats.tone}">${qStats.count ? `${qStats.avg} ★` : '—'}</span>
              </div>
              <div class="cs-team-score-card__body">
                <div class="tk-bar"><div class="tk-bar__fill ${qStats.barTone}" style="width:${qStats.pct}%"></div></div>
                <div class="tk-muted" style="font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <span>${tm.lead_cleaner || 'Crew lead'} · ${qStats.count} audit${qStats.count === 1 ? '' : 's'}</span>
                  ${qStats.count ? renderStars(Math.round(Number(qStats.avg))) : ''}
                </div>
              </div>
            </div>`;
        })}
      </div>` : ''}

    <section class="tk-sheet">
      ${state.loading && !state.checks.length ? skeleton(3) : state.checks.length ? state.checks.map((q) => html`
        <div class="tk-row" data-key="qc-${q.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span>${q.client_name || 'Job #' + q.job_id}</span>
              ${renderStars(q.rating)}
              <span class="tk-tag">${q.job_type || 'Clean'}</span>
              ${q.follow_up === 'Yes' ? html`<span class="tk-tag tk-tag--bad">Follow-up Required</span>` : html`<span class="tk-tag tk-tag--ok">Passed</span>`}
              ${q.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              <span>${q.scheduled_date ? fmtDay(q.scheduled_date) : ''}</span>
              ${q.team_name ? html`<span>Crew: <strong>${q.team_name}</strong></span>` : ''}
              <span>Checked by: ${q.checked_by || 'Supervisor'}</span>
              <span>${ago(q.created_at)}</span>
            </div>
            <div class="cs-checklist-chips">
              ${QC_ITEMS.map((item) => {
                const done = (q.checklist || []).includes(item);
                return html`<span class="${cls('cs-check-pill', { 'cs-check-pill--miss': !done })}">${done ? '✓' : '✕'} ${item}</span>`;
              })}
            </div>
            ${q.issues_found ? html`<div style="font-size:13px;margin-top:4px;color:var(--k-danger)"><strong>Issues found:</strong> ${q.issues_found}</div>` : ''}
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--sm" data-action="qc-print" data-id="${q.id}">${icon('printer', { size: 14 })} Report</button>
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="qc-del" data-id="${q.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'check-square', title: 'No quality checks recorded yet', text: 'Run a room-by-room quality checklist from the Dispatch board or here.' })}
    </section>
  `;
}

export function renderSuppliesView(state) {
  const lowItems = state.supplies.filter((s) => s.status !== 'OK');
  const outItems = state.supplies.filter((s) => s.status === 'Out');
  const okItems = state.supplies.filter((s) => s.status === 'OK');
  const stockPct = state.supplies.length ? Math.round((okItems.length / state.supplies.length) * 100) : 100;
  const rows = state.supplyFilter === 'Low'
    ? lowItems
    : state.supplyFilter === 'All'
      ? state.supplies
      : state.supplies.filter((s) => s.category === state.supplyFilter);

  return html`
    <section class="cs-masthead" aria-label="Supplies Par Stock Command">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${lowItems.length ? '#f59e0b' : '#34d399'}"></span>
          CHEMICALS &amp; VAN PAR STOCK
        </div>
        <h1 class="cs-masthead__title">Cleaning Supplies</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${state.supplies.length} tracked SKU${state.supplies.length === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Tap -1 / +1 or Restock to Par</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click supplier reorder list</span>
        </div>
      </div>

      <div class="cs-masthead__pods cs-masthead__pods--3" style="align-items:center">
        <div class="cs-pod cs-pod--ring cs-pod--aqua">
          <div class="tk-ring" style="--p:${stockPct}%;--ring-color:${stockPct >= 80 ? '#34d399' : '#f59e0b'};--ring-size:48px">
            <span class="tk-ring__val">${stockPct}%</span>
          </div>
          <div>
            <span class="cs-pod__lbl">Par Health</span>
            <span class="cs-pod__val">${okItems.length}/${state.supplies.length}</span>
            <span class="cs-pod__sub">Above par</span>
          </div>
        </div>

        <div class="${cls('cs-pod', { 'cs-pod--alert': lowItems.length > 0 })}">
          <span class="cs-pod__lbl">${icon('alert', { size: 12 })} Low / Out</span>
          <span class="cs-pod__val">${lowItems.length}</span>
          <span class="cs-pod__sub">${outItems.length} out of stock</span>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('box', { size: 12 })} Categories</span>
          <span class="cs-pod__val">${SUPPLY_CATS.length}</span>
          <span class="cs-pod__sub">Van &amp; depot</span>
        </div>

        <div class="cs-masthead__actions">
          ${lowItems.length ? html`<button type="button" class="k-btn cs-cta-glass k-btn--sm" data-action="supply-copy-reorder">${icon('copy', { size: 14 })} Reorder (${lowItems.length})</button>` : ''}
          <button type="button" class="k-btn cs-cta-bright" data-action="supply-new">${icon('plus', { size: 15 })} Add Supply</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.supplyFilter === 'All' })}" data-action="supply-filter" data-val="All">All (${state.supplies.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.supplyFilter === 'Low' })}" data-action="supply-filter" data-val="Low">Low / Out (${lowItems.length})</button>
        ${SUPPLY_CATS.map((cat) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.supplyFilter === cat })}" data-action="supply-filter" data-val="${cat}">${cat}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.supplies.length ? skeleton(3) : rows.length ? rows.map((sp) => {
        const target = Math.max(1, Math.ceil(Number(sp.reorder_point) * 1.5));
        const pct = Math.min(100, Math.round((Number(sp.current_stock) / target) * 100));
        const barTone = sp.status === 'Out' ? 'tk-bar__fill--bad' : sp.status === 'Low' ? 'tk-bar__fill--warn' : 'tk-bar__fill--ok';
        const tagTone = sp.status === 'Out' ? 'tk-tag--bad' : sp.status === 'Low' ? 'tk-tag--warn' : 'tk-tag--ok';
        const rowTone = sp.status === 'Out' ? 'cs-stock-row--out' : sp.status === 'Low' ? 'cs-stock-row--low' : '';
        return html`
          <div class="tk-row cs-stock-row ${rowTone}" data-key="sup-${sp.id}">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${sp.supply_item}</span>
                <span class="tk-tag ${tagTone}">${sp.status}</span>
                <span class="tk-tag">${sp.category}</span>
                ${sp.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                <span>Reorder at: ${num(sp.reorder_point, { decimals: 1 })} ${sp.unit}</span>
                ${sp.supplier ? html`<span>Supplier: ${sp.supplier}</span>` : ''}
              </div>
            </div>
            <div class="cs-stock-par">
              <div class="cs-stock-par__nums">
                <strong>${num(sp.current_stock, { decimals: 1 })} ${sp.unit}</strong>
                <span class="tk-muted">${pct}% of par</span>
              </div>
              <div class="tk-bar"><div class="tk-bar__fill ${barTone}" style="width:${pct}%"></div></div>
            </div>
            <div class="tk-row__aside">
              <button type="button" class="k-btn k-btn--sm" data-action="supply-adj" data-id="${sp.id}" data-delta="-1">-1</button>
              <button type="button" class="k-btn k-btn--sm" data-action="supply-adj" data-id="${sp.id}" data-delta="1">+1</button>
              ${sp.status !== 'OK' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="supply-par" data-id="${sp.id}">Restock</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="supply-edit" data-id="${sp.id}">Edit</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'box', title: 'No supplies matching filter', text: 'Track chemicals, microfibre cloths, equipment and consumables with reorder alerts.' })}
    </section>
  `;
}

export function renderIssuesView(state) {
  const openList = state.issues.filter((i) => i.status !== 'Resolved');
  const highOpen = openList.filter((i) => i.severity === 'High').length;
  const resolvedCount = state.issues.filter((i) => i.status === 'Resolved').length;
  const shown = state.issueFilter === 'OpenActive'
    ? openList
    : state.issueFilter === 'All'
      ? state.issues
      : state.issues.filter((i) => i.status === state.issueFilter);

  return html`
    <section class="cs-masthead" aria-label="Client Issues Escalation Desk">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${openList.length ? '#f87171' : '#34d399'}"></span>
          CLIENT CARE · ESCALATION DESK
        </div>
        <h1 class="cs-masthead__title">Client Issues</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${openList.length} active case${openList.length === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Open → Investigating → Resolved</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Linked directly to client cleans</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="${cls('cs-pod', { 'cs-pod--alert': openList.length > 0 })}">
          <span class="cs-pod__lbl">${icon('alert', { size: 12 })} Active</span>
          <span class="cs-pod__val">${openList.length}</span>
          <span class="cs-pod__sub">${highOpen} high severity</span>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('check-circle', { size: 12 })} Resolved</span>
          <span class="cs-pod__val">${resolvedCount}</span>
          <span class="cs-pod__sub">Closed cases</span>
        </div>

        <button type="button" class="k-btn cs-cta-bright" data-action="issue-new">${icon('plus', { size: 15 })} Log Issue</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.issueFilter === 'OpenActive' })}" data-action="issue-filter" data-val="OpenActive">Active (${openList.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.issueFilter === 'Open' })}" data-action="issue-filter" data-val="Open">Open</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.issueFilter === 'Investigating' })}" data-action="issue-filter" data-val="Investigating">Investigating</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.issueFilter === 'Resolved' })}" data-action="issue-filter" data-val="Resolved">Resolved</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.issueFilter === 'All' })}" data-action="issue-filter" data-val="All">All (${state.issues.length})</button>
      </div>
    </div>

    ${state.loading && !state.issues.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : shown.length ? html`
      <div class="cs-issue-list">
        ${shown.map((iss) => {
          const stepIdx = ISSUE_STEPS.indexOf(iss.status);
          const cardTone = iss.status === 'Resolved'
            ? 'cs-issue-card--resolved'
            : iss.severity === 'Medium' ? 'cs-issue-card--med'
            : iss.severity === 'Low' ? 'cs-issue-card--low' : '';
          return html`
            <article class="cs-issue-card ${cardTone}" data-key="iss-${iss.id}">
              <div class="cs-issue-card__top">
                <div style="display:grid;gap:6px;min-width:0;flex:1">
                  <div class="tk-row__title">
                    <span>${iss.client_name || 'Client #' + iss.client_id}</span>
                    <span class="tk-tag ${SEV_CLASS[iss.severity] || ''}">${iss.severity}</span>
                    <span class="tk-tag ${ISSUE_TAG[iss.status] || ''}">${iss.status}</span>
                    <span class="tk-tag">${iss.issue_type}</span>
                    ${iss.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="font-size:13.5px">${iss.description}</div>
                  ${iss.resolution ? html`<div style="font-size:13px;color:var(--k-success)"><strong>Resolution:</strong> ${iss.resolution}</div>` : ''}
                  <div class="tk-row__meta">
                    ${iss.scheduled_date ? html`<span>Job: ${fmtDay(iss.scheduled_date)} (${iss.job_type})</span>` : ''}
                    ${iss.client_phone ? html`<span>${icon('phone', { size: 12 })} ${iss.client_phone}</span>` : ''}
                    <span>Logged ${ago(iss.created_at)}</span>
                  </div>
                </div>
                <div class="tk-btn-row">
                  ${iss.status === 'Open' ? html`<button type="button" class="k-btn k-btn--sm" data-action="issue-investigate" data-id="${iss.id}">Investigate</button>` : ''}
                  ${iss.status !== 'Resolved' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="issue-resolve" data-id="${iss.id}">Resolve ✓</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="issue-del" data-id="${iss.id}">Delete</button>
                </div>
              </div>
              <div class="cs-issue-steps" aria-label="Resolution workflow">
                ${ISSUE_STEPS.map((st, idx) => html`
                  <span class="${cls('cs-issue-step', { 'is-done': idx < stepIdx || (iss.status === 'Resolved' && idx === stepIdx), 'is-now': idx === stepIdx && iss.status !== 'Resolved' })}">
                    ${idx < stepIdx || (iss.status === 'Resolved' && idx === stepIdx) ? icon('check', { size: 11 }) : ''} ${st}
                  </span>`)}
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'check-circle', title: 'No client issues here', text: 'All quiet! Log any access trouble, complaint or missed item so nothing slips through.' })}
  `;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="qc-new"]', async () => {
    if (!state.jobs.length) {
      const res = await api.get('/api/jobs');
      state.jobs = res.jobs || [];
    }
    if (!state.jobs.length) { toast.error('Schedule a cleaning job first to attach a quality check.'); return; }
    const picked = await formDialog({
      title: 'Select Job to Inspect',
      submitLabel: 'Next',
      fields: html`
        <label class="k-field"><span class="k-field__label">Cleaning Job</span>
          <select class="k-input" name="job_id">
            ${state.jobs.map((j) => html`<option value="${j.id}">${fmtDay(j.scheduled_date)} ${j.start_time} — ${j.client_name} (${j.status})</option>`)}
          </select>
        </label>`,
      onSubmit: (v) => v,
    });
    if (!picked) return;
    const job = state.jobs.find((j) => String(j.id) === String(picked.job_id));
    if (job) openQualityDialog(job, state, { loadScreen });
  });

  on(root, 'click', '[data-action="qc-print"]', (e, el) => {
    const q = state.checks.find((x) => String(x.id) === el.dataset.id);
    if (!q) return;
    downloadHtmlDoc(`quality-check-${q.id}.html`, {
      title: `Quality Inspection · ${q.client_name || 'Job #' + q.job_id}`,
      businessName: state.session.settings.business_name,
      subtitle: `${q.scheduled_date ? fmtDay(q.scheduled_date) : ''} · Crew: ${q.team_name || '—'}`,
      accent: '#0891b2',
      bodyHtml: `<table>
        <tr><th>Star Rating</th><td>${q.rating} / 5 ★</td></tr>
        <tr><th>Checked By</th><td>${q.checked_by || 'Supervisor'}</td></tr>
        <tr><th>Follow-up Required</th><td>${q.follow_up}</td></tr>
        <tr><th>Checklist Completed (${(q.checklist || []).length}/${QC_ITEMS.length})</th><td>${(q.checklist || []).join(', ') || 'None ticked'}</td></tr>
      </table>
      ${q.issues_found ? `<div class="box"><strong>Issues Found:</strong> ${q.issues_found}</div>` : '<div class="box"><strong>Result:</strong> Passed with no issues noted.</div>'}`,
    });
  });

  on(root, 'click', '[data-action="qc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete quality check?', message: 'Remove this quality audit record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/quality', { id: Number(el.dataset.id) }); toast.success('Quality check deleted.'); await loadScreen('/quality'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="supply-filter"]', (e, el) => { state.supplyFilter = el.dataset.val; draw(); });
  on(root, 'click', '[data-action="supply-adj"]', async (e, el) => {
    try { await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), delta: Number(el.dataset.delta) }); await loadScreen('/supplies'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="supply-par"]', async (e, el) => {
    try { await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), restockToPar: true }); toast.success('Restocked above par.'); await loadScreen('/supplies'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="supply-copy-reorder"]', () => {
    const low = state.supplies.filter((s) => s.status !== 'OK');
    const lines = low.map((s) => {
      const target = Math.ceil(Number(s.reorder_point) * 1.5);
      const orderQty = Math.max(1, Math.ceil(target - Number(s.current_stock)));
      return `- ${s.supply_item}: have ${s.current_stock} ${s.unit}, order ${orderQty} ${s.unit}${s.supplier ? ' (' + s.supplier + ')' : ''}`;
    });
    copyText(`Cleaning Supplies Reorder (${today()})\n${lines.join('\n')}`, { title: 'Supply Reorder List' });
  });

  const supplyFields = (s = {}) => html`
    <label class="k-field"><span class="k-field__label">Supply Item</span><input class="k-input" name="supply_item" value="${s.supply_item || ''}" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${SUPPLY_CATS.map((c) => html`<option value="${c}" ${c === s.category ? 'selected' : ''}>${c}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${SUPPLY_UNITS.map((u) => html`<option value="${u}" ${u === s.unit ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Current Stock</span><input class="k-input" type="number" step="0.5" min="0" name="current_stock" value="${s.current_stock ?? 0}" required></label>
      <label class="k-field"><span class="k-field__label">Reorder Point</span><input class="k-input" type="number" step="0.5" min="0.5" name="reorder_point" value="${s.reorder_point ?? 5}" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" value="${s.supplier || ''}"></label>`;

  on(root, 'click', '[data-action="supply-new"]', async () => {
    const made = await formDialog({ title: 'Add Cleaning Supply', submitLabel: 'Save', fields: supplyFields(), onSubmit: (v) => api.post('/api/supplies', v) });
    if (made) { toast.success('Supply added.'); await loadScreen('/supplies'); }
  });
  on(root, 'click', '[data-action="supply-edit"]', async (e, el) => {
    const sp = state.supplies.find((x) => String(x.id) === el.dataset.id);
    if (!sp) return;
    const saved = await formDialog({ title: `Edit ${sp.supply_item}`, submitLabel: 'Save', fields: supplyFields(sp), onSubmit: (v) => api.put('/api/supplies', { ...v, id: sp.id }) });
    if (saved) { toast.success('Supply updated.'); await loadScreen('/supplies'); }
  });

  on(root, 'click', '[data-action="issue-filter"]', (e, el) => { state.issueFilter = el.dataset.val; draw(); });

  on(root, 'click', '[data-action="issue-new"]', async () => {
    if (!state.clients.length) {
      const c = await api.get('/api/clients');
      state.clients = c.clients || [];
    }
    if (!state.clients.length) { toast.error('Add a client first.'); return; }
    const made = await formDialog({
      title: 'Log Client Issue',
      submitLabel: 'Create Issue',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span>
            <select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.client_name}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Linked Job (optional)</span>
            <select class="k-input" name="job_id">
              <option value="">None</option>
              ${state.jobs.map((j) => html`<option value="${j.id}">${fmtDay(j.scheduled_date)} — ${j.client_name}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Issue Type</span><select class="k-input" name="issue_type">${ISSUE_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${SEVERITIES.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="3" required placeholder="What happened and what needs fixing?"></textarea></label>`,
      onSubmit: (v) => api.post('/api/issues', { ...v, job_id: v.job_id ? Number(v.job_id) : null }),
    });
    if (made) { toast.success('Client issue logged.'); await loadScreen('/issues'); }
  });

  on(root, 'click', '[data-action="issue-investigate"]', async (e, el) => {
    try { await api.post('/api/issues/status', { id: Number(el.dataset.id), status: 'Investigating' }); toast.success('Marked Investigating.'); await loadScreen('/issues'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="issue-resolve"]', async (e, el) => {
    const iss = state.issues.find((x) => String(x.id) === el.dataset.id);
    if (!iss) return;
    const saved = await formDialog({
      title: `Resolve Issue · ${iss.client_name}`,
      submitLabel: 'Mark Resolved',
      fields: html`<label class="k-field"><span class="k-field__label">Resolution Note</span><textarea class="k-input" name="resolution" rows="3" placeholder="How was this resolved for the client?" required>${iss.resolution || ''}</textarea></label>`,
      onSubmit: (v) => api.post('/api/issues/status', { id: iss.id, status: 'Resolved', resolution: v.resolution }),
    });
    if (saved) { toast.success('Issue resolved.'); await loadScreen('/issues'); }
  });

  on(root, 'click', '[data-action="issue-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete issue?', message: 'Remove this client issue record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/issues', { id: Number(el.dataset.id) }); toast.success('Issue deleted.'); await loadScreen('/issues'); }
    catch (err) { toastError(err); }
  });
}
