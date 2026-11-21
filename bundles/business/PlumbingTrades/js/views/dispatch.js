// Field Dispatch Board (Two-Column Command + Live Technician Van Load Rail) & Job Workbench
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const JOB_TYPES = ['Repair', 'Installation', 'Maintenance', 'Emergency Call-out', 'Quote'];
export const JOB_STATUSES = ['Scheduled', 'En Route', 'On Site', 'Awaiting Parts', 'Completed', 'Invoiced'];
export const JOB_PRIORITIES = ['Emergency', 'High', 'Normal', 'Low'];
export const PART_STATUSES = ['Requested', 'Ordered', 'Received', 'Fitted'];
const QUICK_FILTERS = ['All', 'Today', 'Emergency', 'Awaiting Parts'];

const NEXT_JOB_STAGE = {
  Scheduled: { status: 'En Route', label: 'Dispatch' },
  'En Route': { status: 'On Site', label: 'Arrive On Site' },
  'On Site': { status: 'Completed', label: 'Complete' },
  'Awaiting Parts': { status: 'On Site', label: 'Resume On Site' },
};

const NEXT_PART_STAGE = {
  Requested: 'Ordered',
  Ordered: 'Received',
  Received: 'Fitted',
};

function prioClass(p) {
  if (p === 'Emergency') return 'emergency';
  if (p === 'High') return 'high';
  if (p === 'Low') return 'low';
  return 'normal';
}

function statusTagClass(s) {
  if (s === 'Completed' || s === 'Invoiced') return 'tk-tag--ok';
  if (s === 'Awaiting Parts') return 'tk-tag--warn';
  if (s === 'On Site' || s === 'En Route') return 'tk-tag--info';
  return '';
}

function statusBandKey(s) {
  if (s === 'En Route') return 'enroute';
  if (s === 'On Site') return 'onsite';
  if (s === 'Awaiting Parts') return 'parts';
  if (s === 'Completed') return 'done';
  if (s === 'Invoiced') return 'invoiced';
  return 'scheduled';
}

function partTagClass(s) {
  if (s === 'Fitted') return 'tk-tag--ok';
  if (s === 'Received') return 'tk-tag--info';
  if (s === 'Ordered') return 'tk-tag--accent';
  return 'tk-tag--warn';
}

export function buildSmsEtaText(job, settings, customerPhone = '') {
  const biz = settings.business_name || 'Our Plumbing Team';
  const tech = job.assigned_tech || 'your technician';
  const customer = job.customer_name || 'there';
  const addr = job.site_address || 'your property';
  const when = job.status === 'En Route'
    ? 'is on the way now (ETA approx. 20-30 mins)'
    : `is booked for ${fmtDayNear(job.scheduled_date)}${job.scheduled_time ? ' around ' + job.scheduled_time : ''}`;
  const contact = settings.phone ? ` Call or text us on ${settings.phone} if access notes have changed.` : '';
  const phoneNote = customerPhone ? `\n[To: ${customerPhone}]` : '';
  return `Hi ${customer}, ${tech} from ${biz} ${when} for ${job.job_number} at ${addr}.${contact}${phoneNote}`;
}

function renderJobCard(j, currency) {
  const next = NEXT_JOB_STAGE[j.status];
  const isEmergency = j.priority === 'Emergency';
  const isHigh = j.priority === 'High';
  const bandKey = statusBandKey(j.status);
  const stageIdx = Math.min(4, Math.max(0, JOB_STATUSES.indexOf(j.status)));

  return html`
    <article class="dispatch-card dispatch-card--${prioClass(j.priority)}" data-key="job-${j.id}">
      ${isEmergency ? html`
        <div class="emergency-strip">
          <span class="emergency-strip__left"><span class="emergency-dot"></span>${icon('zap', { size: 13 })} EMERGENCY</span>
          <span class="emergency-strip__tag">${j.status}</span>
        </div>` : isHigh ? html`
        <div class="urgent-strip">
          <span class="urgent-strip__left">${icon('alert', { size: 13 })} HIGH PRIORITY</span>
          <span>${j.status}</span>
        </div>` : html`
        <div class="pl-card-band pl-card-band--${bandKey}">
          <span class="pl-card-band__left"><span class="pl-card-band__dot"></span>${j.status}</span>
          <span>${j.job_type}</span>
        </div>`}

      <div class="tk-ticket__top">
        <span class="job-code">${j.job_number}</span>
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end">
          <span class="prio-pill prio-pill--${prioClass(j.priority)}">${j.priority}</span>
          ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
        </div>
      </div>

      <div class="dispatch-card__title" data-action="open-job" data-id="${j.id}">${j.customer_name || 'Customer'} — ${j.job_type}</div>
      <div class="dispatch-card__desc">${j.description}</div>

      <div class="pl-mini-track" aria-label="Stage ${j.status}">
        ${[0, 1, 2, 3, 4].map((idx) => html`
          <span class="${cls('pl-mini-track__seg', { 'is-done': idx < stageIdx || j.status === 'Invoiced', 'is-now': idx === stageIdx && j.status !== 'Invoiced' })}"></span>`)}
      </div>

      <div class="van-copy-row">
        ${j.customer_phone ? html`
          <button type="button" class="copy-chip copy-chip--phone" title="Tap to copy phone" data-action="copy-val" data-label="Customer phone" data-val="${j.customer_phone}">
            <span class="copy-chip__icon">${icon('phone', { size: 11 })}</span>
            <span>${j.customer_phone}</span>
            <span class="copy-chip__copy-hint">${icon('copy', { size: 11 })}</span>
          </button>` : ''}
        ${j.site_address ? html`
          <button type="button" class="copy-chip" title="Tap to copy site address" data-action="copy-val" data-label="Site address" data-val="${j.site_address}">
            <span class="copy-chip__icon">${icon('pin', { size: 11 })}</span>
            <span class="copy-chip__text">${j.site_address}</span>
            <span class="copy-chip__copy-hint">${icon('copy', { size: 11 })}</span>
          </button>` : ''}
      </div>

      <div class="tk-row__meta" style="font-size:12px">
        <span class="pl-time-chip">${icon('clock', { size: 12 })} ${fmtDayNear(j.scheduled_date)}${j.scheduled_time ? ' · ' + j.scheduled_time : ''}</span>
        ${j.assigned_tech ? html`<span class="pl-tech-chip"><span class="pl-tech-chip__av">${initials(j.assigned_tech)}</span>${j.assigned_tech}</span>` : html`<span class="tk-tag tk-tag--warn">Unassigned</span>`}
        ${Number(j.logged_hours) > 0 ? html`<span>${num(j.logged_hours, { decimals: 2 })}h</span>` : ''}
        ${Number(j.parts_total_cents) > 0 ? html`<span>Parts ${money(j.parts_total_cents, { currency })}</span>` : ''}
        ${Number(j.follow_up_count) > 0 ? html`<span class="tk-tag tk-tag--warn">Follow-up</span>` : ''}
      </div>

      <div class="tk-ticket__foot">
        <div class="tk-btn-row" style="gap:5px">
          <button type="button" class="k-btn k-btn--sm" data-action="open-job" data-id="${j.id}">Work Order</button>
          <button type="button" class="copy-chip copy-chip--eta" title="Copy Customer SMS ETA" data-action="copy-sms-eta" data-id="${j.id}">${icon('chat', { size: 12 })} SMS ETA</button>
        </div>
        ${next ? html`
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="${next.status}">${next.label}</button>` : ''}
        ${j.status === 'Completed' ? html`
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="raise-invoice" data-id="${j.id}">${icon('receipt', { size: 14 })} Invoice</button>` : ''}
      </div>
    </article>`;
}

export function renderDispatchView(state) {
  const settings = state.session.settings;
  const currency = settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.jobSearch || '').trim().toLowerCase();

  const techs = Array.from(new Set(state.jobs.map((j) => (j.assigned_tech || '').trim()).filter(Boolean))).sort();
  const hasUnassigned = state.jobs.some((j) => !(j.assigned_tech || '').trim());

  const matchesQuick = (j, f) => {
    if (f === 'Today') return j.scheduled_date === todayStr;
    if (f === 'Emergency') return j.priority === 'Emergency' || j.priority === 'High';
    if (f === 'Awaiting Parts') return j.status === 'Awaiting Parts';
    return true;
  };
  const quickCount = (f) => state.jobs.filter((j) => matchesQuick(j, f)).length;

  const filtered = state.jobs.filter((j) => {
    if (!matchesQuick(j, state.jobQuickFilter || 'All')) return false;
    if (state.jobTech === '__unassigned__') {
      if ((j.assigned_tech || '').trim()) return false;
    } else if (state.jobTech && state.jobTech !== 'All') {
      if ((j.assigned_tech || '').trim() !== state.jobTech) return false;
    }
    if (q) {
      const hay = `${j.job_number} ${j.customer_name || ''} ${j.customer_phone || ''} ${j.site_address || ''} ${j.description || ''} ${j.assigned_tech || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const boardCols = state.showInvoicedOnBoard ? JOB_STATUSES : JOB_STATUSES.slice(0, 5);
  const emergencyCount = Number(counts.emergencyJobs || 0);
  const activeCount = Number(counts.activeJobs || 0);
  const completedCount = state.jobs.filter((j) => j.status === 'Completed' || j.status === 'Invoiced').length;
  const completionPct = state.jobs.length ? Math.round((completedCount / state.jobs.length) * 100) : 100;

  // Technician van workload aggregation for sticky operational rail
  const techStats = techs.map((name) => {
    const jobs = state.jobs.filter((j) => (j.assigned_tech || '').trim() === name);
    const open = jobs.filter((j) => j.status !== 'Completed' && j.status !== 'Invoiced');
    const hrs = jobs.reduce((sum, j) => sum + Number(j.logged_hours || 0), 0);
    const activeJob = open.find((j) => j.status === 'On Site' || j.status === 'En Route') || open[0];
    return { name, total: jobs.length, openCount: open.length, hrs, activeJob };
  }).sort((a, b) => b.openCount - a.openCount);

  const pendingParts = (state.parts || []).filter((p) => p.status === 'Requested' || p.status === 'Ordered');
  const followUpVisits = (state.visits || []).filter((v) => v.follow_up_required);
  const visibleDeck = state.showInvoicedOnBoard ? filtered : filtered.filter((j) => j.status !== 'Invoiced');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="pl-masthead" aria-label="Field Dispatch Command">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${emergencyCount > 0 ? '#f87171' : '#e6ad54'}"></span>
          DISPATCH LIVE · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="pl-masthead__title">Field Dispatch Board</h1>
        <div class="pl-masthead__meta">
          <span><strong style="color:#fde6b8">${activeCount} active</strong> across ${techs.length || 1} van${techs.length === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${money(settings.hourly_rate_cents || 12500, { currency })}/hr std rate</span>
        </div>
      </div>

      <div class="pl-masthead__pods pl-masthead__pods--ring3" style="align-items:center">
        <div class="pl-pod pl-pod--ring">
          <div class="tk-ring" style="--p:${completionPct}%;--ring-color:#e6ad54;--ring-size:48px">
            <span class="tk-ring__val">${completionPct}%</span>
          </div>
          <div>
            <span class="pl-pod__lbl">Completion</span>
            <div class="pl-pod__val" style="font-size:15px">${completedCount}/${state.jobs.length} Done</div>
            <div class="pl-pod__sub">${activeCount} in progress</div>
          </div>
        </div>

        <button type="button" class="${cls('pl-pod', { 'pl-pod--alert': emergencyCount > 0 })}" style="text-align:left;cursor:pointer" data-action="job-quick" data-filter="Emergency">
          <span class="pl-pod__lbl">${icon(emergencyCount > 0 ? 'zap' : 'shield-check', { size: 11 })} Emergency</span>
          <span class="pl-pod__val">${emergencyCount}</span>
          <span class="pl-pod__sub">${emergencyCount > 0 ? 'Filter urgent →' : 'All calm'}</span>
        </button>

        <a href="#/parts" class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('valve-gauge', { size: 11 })} Parts</span>
          <span class="pl-pod__val">${counts.pendingParts || 0}</span>
          <span class="pl-pod__sub">${counts.pendingParts > 0 ? 'To order/pick →' : 'Stock ready'}</span>
        </a>

        <a href="#/invoices" class="pl-pod">
          <span class="pl-pod__lbl">${icon('receipt', { size: 11 })} Unpaid</span>
          <span class="pl-pod__val">${money(counts.unpaidCents || 0, { currency })}</span>
          <span class="pl-pod__sub">${counts.unpaidInvoices || 0} open →</span>
        </a>

        <div class="pl-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="job-new">${icon('plus', { size: 15 })} Book Job</button>
        </div>
      </div>
    </section>

    <div class="pl-split">
      <div class="tk-stack" style="gap:14px">
        <div class="pl-control-bar">
          <div class="pl-control-bar__top">
            <div class="tk-search" style="flex:1 1 210px;max-width:340px">
              ${icon('search', { size: 15 })}
              <input type="search" placeholder="Search job #, customer, phone, address, tech…" value="${state.jobSearch}" data-action="job-search">
            </div>
            <label class="tech-filter-wrap">
              ${icon('service-van', { size: 14 })}
              <select data-action="job-tech" aria-label="Filter by technician">
                <option value="All" ${state.jobTech === 'All' ? 'selected' : ''}>All Technicians</option>
                ${techs.map((t) => html`<option value="${t}" ${state.jobTech === t ? 'selected' : ''}>${t}</option>`)}
                ${hasUnassigned ? html`<option value="__unassigned__" ${state.jobTech === '__unassigned__' ? 'selected' : ''}>Unassigned</option>` : ''}
              </select>
            </label>
          </div>
          <div class="pl-control-bar__bot">
            <div class="tk-segmented" role="group" aria-label="Quick dispatch filters">
              ${QUICK_FILTERS.map((f) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': (state.jobQuickFilter || 'All') === f })}" data-action="job-quick" data-filter="${f}">
                  ${f} <span style="opacity:.65;font-size:11px;margin-left:2px">${quickCount(f)}</span>
                </button>`)}
            </div>
            <div class="tk-btn-row">
              <button type="button" class="${cls('k-btn k-btn--sm', { 'k-btn--soft': state.showInvoicedOnBoard })}" data-action="toggle-invoiced-col">
                ${state.showInvoicedOnBoard ? 'Hide Invoiced' : 'Show Invoiced'}
              </button>
              <div class="tk-segmented" role="group" aria-label="Dispatch view layout">
                <button type="button" class="${cls('tk-pill', { 'is-on': state.dispatchLayout !== 'board' })}" data-action="dispatch-layout" data-layout="cards">${icon('grid', { size: 13 })} Deck</button>
                <button type="button" class="${cls('tk-pill', { 'is-on': state.dispatchLayout === 'board' })}" data-action="dispatch-layout" data-layout="board">${icon('sliders', { size: 13 })} Board</button>
              </div>
            </div>
          </div>
        </div>

        ${state.loading && !state.jobs.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.dispatchLayout === 'board' ? html`
          <div class="pl-board-wrap">
            <div class="tk-board">
              ${boardCols.map((col) => {
                const cards = filtered.filter((j) => j.status === col);
                const colKey = statusBandKey(col);
                return html`
                  <div class="tk-col" data-key="col-${col}">
                    <div class="tk-col__head">
                      <span class="pl-col-label"><span class="pl-col-dot pl-col-dot--${colKey}"></span>${col}</span>
                      <span class="k-badge ${col === 'Awaiting Parts' && cards.length ? 'k-badge--danger' : ''}">${cards.length}</span>
                    </div>
                    ${cards.length ? cards.map((j) => renderJobCard(j, currency)) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px">No jobs</p>`}
                  </div>`;
              })}
            </div>
          </div>` : visibleDeck.length ? html`
          <div class="pl-deck-grid">
            ${visibleDeck.map((j) => renderJobCard(j, currency))}
          </div>` : html`
          <section class="tk-sheet">
            ${emptyState({ iconName: 'pipe-wrench', title: 'No field jobs match your filter', text: 'Clear filters or book a new plumbing call-out to dispatch a technician.' })}
          </section>`}
      </div>

      <aside class="pl-rail-panel" aria-label="Technician Load and Field Queue">
        <section class="pl-rail-card">
          <div class="pl-rail-card__head">
            <span class="pl-rail-card__title">${icon('service-van', { size: 14 })} Technician Van Load</span>
            ${state.jobTech !== 'All' ? html`<button type="button" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px" data-action="tech-clear">Clear</button>` : html`<span class="k-badge">${techStats.length} Vans</span>`}
          </div>
          ${techStats.length ? html`
            <div>
              ${techStats.map((t) => {
                const pct = Math.min(100, Math.round((t.openCount / 4) * 100));
                const isSelected = state.jobTech === t.name;
                return html`
                  <button type="button" class="${cls('pl-tech-load', { 'is-on': isSelected })}" data-action="tech-pick" data-tech="${t.name}">
                    <div class="pl-tech-load__top">
                      <span class="pl-tech-load__who">
                        <span class="pl-tech-load__av">${initials(t.name)}</span>
                        <span style="min-width:0">
                          <span style="display:block;font-size:13.5px;font-weight:750;color:var(--k-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</span>
                          <span style="display:block;font-size:11.5px;color:var(--k-muted)">${t.activeJob ? `${t.activeJob.status} · ${t.activeJob.job_number}` : 'Available for dispatch'}</span>
                        </span>
                      </span>
                      <span class="k-badge ${t.openCount >= 3 ? 'k-badge--danger' : 'k-badge--accent'}">${t.openCount} open</span>
                    </div>
                    <div class="tk-bar"><div class="tk-bar__fill ${t.openCount >= 3 ? 'tk-bar__fill--warn' : ''}" style="width:${pct}%"></div></div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--k-muted)">
                      <span>${t.total} total job${t.total === 1 ? '' : 's'}</span>
                      <span>${num(t.hrs, { decimals: 1 })}h logged</span>
                    </div>
                  </button>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Assign technicians to jobs to monitor live van capacity.</div>`}
        </section>

        <section class="pl-rail-card">
          <div class="pl-rail-card__head">
            <span class="pl-rail-card__title">${icon('valve-gauge', { size: 14 })} Parts Action Queue</span>
            <a href="#/parts" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.parts.length})</a>
          </div>
          ${pendingParts.length ? html`
            <div class="pl-rail-list">
              ${pendingParts.slice(0, 4).map((p) => html`
                <div class="pl-rail-item" data-key="rail-pt-${p.id}">
                  <div class="pl-rail-item__top">
                    <div style="min-width:0">
                      <div class="pl-rail-item__name">${p.quantity}× ${p.item}</div>
                      <div class="pl-rail-item__sub">${p.job_number || '#' + p.job_id}${p.supplier ? ' · ' + p.supplier : ''}</div>
                    </div>
                    <span class="tk-tag ${partTagClass(p.status)}">${p.status}</span>
                  </div>
                  <div class="pl-rail-item__foot">
                    <strong style="font-size:12.5px;font-variant-numeric:tabular-nums">${money(p.quantity * p.unit_cost_cents, { currency })}</strong>
                    ${NEXT_PART_STAGE[p.status] ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="part-status" data-id="${p.id}" data-status="${NEXT_PART_STAGE[p.status]}">Mark ${NEXT_PART_STAGE[p.status]}</button>` : ''}
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No parts awaiting order or trade counter pickup ✓</div>`}
        </section>

        <section class="pl-rail-card">
          <div class="pl-rail-card__head">
            <span class="pl-rail-card__title">${icon('clipboard', { size: 14 })} Follow-Up Visits</span>
            <a href="#/visits" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Orders</a>
          </div>
          ${followUpVisits.length ? html`
            <div class="pl-rail-list">
              ${followUpVisits.slice(0, 3).map((v) => html`
                <div class="pl-rail-item" data-key="rail-fu-${v.id}">
                  <div class="pl-rail-item__top">
                    <div>
                      <div class="pl-rail-item__name">${v.job_number || '#' + v.job_id} · ${v.customer_name || 'Site'}</div>
                      <div class="pl-rail-item__sub">${v.technician_name} · ${fmtDay(v.visit_date)}</div>
                    </div>
                    <span class="tk-tag tk-tag--warn">Follow-up</span>
                  </div>
                  <div class="pl-rail-item__foot">
                    <span style="font-size:12px;color:var(--k-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px">${v.work_performed}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="open-job" data-id="${v.job_id}">Open</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No return visits currently flagged ✓</div>`}
        </section>
      </aside>
    </div>`;
}

export function renderJobDetailView(state) {
  if (state.loading && !state.jobDetail) {
    return html`<section class="tk-sheet">${skeleton(4)}</section>`;
  }
  const detail = state.jobDetail;
  if (!detail || !detail.job) {
    return emptyState({
      iconName: 'pipe-wrench',
      title: 'Job not loaded',
      text: 'Choose a job from the Dispatch Board to open its work orders, parts and invoicing.',
      action: html`<a href="#/" class="k-btn k-btn--primary k-btn--sm">Back to Dispatch Board</a>`,
    });
  }

  const { job, customer, visits = [], parts = [], invoices = [] } = detail;
  const settings = state.session.settings;
  const currency = settings.currency || 'AUD';
  const rateCents = Number(settings.hourly_rate_cents || 12500);
  const taxRate = Number(settings.tax_rate || 0);
  const loggedHours = Number(job.logged_hours || 0);
  const estLabour = Math.round(loggedHours * rateCents);
  const estParts = Number(job.parts_total_cents || 0);
  const estSub = estLabour + estParts;
  const estTax = Math.round(estSub * (taxRate / 100));
  const estTotal = estSub + estTax;
  const stageIdx = JOB_STATUSES.indexOf(job.status);

  return html`
    <section class="pl-masthead" aria-label="Job Work Order Summary">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">
          <a href="#/">${icon('arrow-left', { size: 12 })} Dispatch</a>
          <span>·</span>
          <span>${job.job_number}</span>
          <span>·</span>
          <span>${job.priority}</span>
        </div>
        <h1 class="pl-masthead__title">${customer?.name || job.customer_name} — ${job.job_type}</h1>
        <div class="pl-masthead__meta">
          <span class="pl-meta-ico">${icon('pin', { size: 13 })} ${job.site_address}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${job.assigned_tech || 'Unassigned'}</span>
        </div>
      </div>

      <div class="pl-masthead__pods" style="align-items:center">
        <div class="pl-pod">
          <span class="pl-pod__lbl">${icon('clock', { size: 11 })} Logged</span>
          <span class="pl-pod__val">${num(loggedHours, { decimals: 2 })}h</span>
          <span class="pl-pod__sub">${visits.length} visit${visits.length === 1 ? '' : 's'}</span>
        </div>
        <div class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('dollar', { size: 11 })} Est. Total</span>
          <span class="pl-pod__val">${money(estTotal, { currency })}</span>
          <span class="pl-pod__sub">${parts.length} part line${parts.length === 1 ? '' : 's'}</span>
        </div>
        <div class="pl-masthead__cta">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-sms-eta" data-id="${job.id}">${icon('chat', { size: 14 })} SMS ETA</button>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="print-work-order">${icon('printer', { size: 14 })} Sheet</button>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="job-edit" data-id="${job.id}">${icon('edit', { size: 14 })} Edit</button>
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="raise-invoice" data-id="${job.id}">${icon('receipt', { size: 14 })} Raise Invoice</button>
        </div>
      </div>
    </section>

    <section class="tk-sheet" style="margin-bottom:16px">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">${icon('sliders', { size: 17 })} Dispatch Pipeline</h2>
        <span class="tk-muted" style="font-size:13px">Click any stage to update job status</span>
        <div class="tk-sheet__actions">
          ${customer?.phone ? html`<button type="button" class="copy-chip copy-chip--phone" data-action="copy-val" data-label="Customer phone" data-val="${customer.phone}"><span class="copy-chip__icon">${icon('phone', { size: 11 })}</span><span>${customer.phone}</span><span class="copy-chip__copy-hint">${icon('copy', { size: 11 })}</span></button>` : ''}
        </div>
      </div>
      <div class="tk-sheet__body">
        <div class="stage-rail">
          ${JOB_STATUSES.map((st, idx) => html`
            <button type="button" class="${cls('stage-step', { 'is-now': st === job.status, 'is-done': idx < stageIdx })}" data-action="job-status" data-id="${job.id}" data-status="${st}">
              ${idx < stageIdx ? icon('check', { size: 14 }) : ''} ${st}
            </button>`)}
        </div>
      </div>
    </section>

    <div class="workbench-grid">
      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('clipboard', { size: 18 })} Job Brief &amp; Site Notes</h2></div>
          <div class="tk-sheet__body tk-stack">
            <p style="font-size:15px">${job.description}</p>
            <div class="tk-kv">
              <div class="tk-kv__item"><span class="tk-kv__k">Scheduled</span><span class="tk-kv__v">${fmtDay(job.scheduled_date)}${job.scheduled_time ? ' · ' + job.scheduled_time : ''}</span></div>
              <div class="tk-kv__item"><span class="tk-kv__k">Assigned Tech</span><span class="tk-kv__v">${job.assigned_tech || 'Unassigned'}</span></div>
              <div class="tk-kv__item"><span class="tk-kv__k">Customer Type</span><span class="tk-kv__v">${customer?.customer_type || '—'}</span></div>
              <div class="tk-kv__item"><span class="tk-kv__k">Estimated Value</span><span class="tk-kv__v">${money(job.estimated_cents || 0, { currency })}</span></div>
            </div>
            ${customer?.notes ? html`<div style="padding:10px 12px;border-radius:8px;background:var(--k-surface-2);font-size:13.5px"><strong>Access / Site Notes:</strong> ${customer.notes}</div>` : ''}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('check-square', { size: 18 })} On-Site Work Orders / Visits</h2>
            <span class="tk-sheet__count">${visits.length} · ${num(loggedHours, { decimals: 2 })} h</span>
            <div class="tk-sheet__actions">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="visit-new" data-job="${job.id}">${icon('plus', { size: 15 })} Log Site Visit</button>
            </div>
          </div>
          <div>
            ${visits.length ? visits.map((v) => html`
              <div class="tk-row" data-key="visit-${v.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${v.technician_name}</span>
                    <span class="tk-tag tk-tag--accent">${num(v.hours_on_site, { decimals: 2 })} hrs</span>
                    <span class="tk-muted" style="font-size:13px">${fmtDay(v.visit_date)}</span>
                    ${v.follow_up_required ? html`<span class="tk-tag tk-tag--warn">Follow-up required</span>` : ''}
                  </div>
                  <div style="font-size:14px">${v.work_performed}</div>
                  ${v.materials_used ? html`<div class="tk-row__meta"><span>Materials: ${v.materials_used}</span></div>` : ''}
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="visit-del" data-id="${v.id}">Delete</button>
                </div>
              </div>`) : emptyState({ iconName: 'clipboard', title: 'No site visits logged yet', text: 'Record technician hours, work completed and materials used on site.' })}
          </div>
        </section>
      </div>

      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('valve-gauge', { size: 18 })} Parts &amp; Materials</h2>
            <span class="tk-sheet__count">${money(estParts, { currency })}</span>
            <div class="tk-sheet__actions">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="part-new" data-job="${job.id}">${icon('plus', { size: 15 })} Request Part</button>
            </div>
          </div>
          <div>
            ${parts.length ? parts.map((p) => html`
              <div class="tk-row" data-key="part-${p.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${p.quantity}× ${p.item}</span>
                    <span class="tk-tag ${partTagClass(p.status)}">${p.status}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>${money(p.quantity * p.unit_cost_cents, { currency })} (${money(p.unit_cost_cents, { currency })} ea)</span>
                    ${p.supplier ? html`<span>${p.supplier}</span>` : ''}
                  </div>
                </div>
                <div class="tk-row__aside">
                  ${NEXT_PART_STAGE[p.status] ? html`
                    <button type="button" class="k-btn k-btn--sm" data-action="part-status" data-id="${p.id}" data-status="${NEXT_PART_STAGE[p.status]}">Mark ${NEXT_PART_STAGE[p.status]}</button>` : ''}
                </div>
              </div>`) : html`<div class="tk-sheet__body"><p class="tk-muted" style="font-size:13.5px">No parts requested for this job yet.</p></div>`}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('receipt', { size: 18 })} Billing &amp; Tax Invoice Tally</h2>
          </div>
          <div class="tk-sheet__body tk-stack">
            <div class="invoice-calc-box">
              <div class="invoice-calc-row"><span>Logged Labour (${num(loggedHours, { decimals: 2 })} h × ${money(rateCents, { currency })}/h)</span><strong>${money(estLabour, { currency })}</strong></div>
              <div class="invoice-calc-row"><span>Parts &amp; Materials (${parts.length} line${parts.length === 1 ? '' : 's'})</span><strong>${money(estParts, { currency })}</strong></div>
              <div class="invoice-calc-row"><span>Tax (${taxRate}%)</span><span>${money(estTax, { currency })}</span></div>
              <div class="invoice-calc-row invoice-calc-row--total"><span>Estimated Total</span><span>${money(estTotal, { currency })}</span></div>
            </div>
            <button type="button" class="k-btn k-btn--primary k-btn--block" data-action="raise-invoice" data-id="${job.id}">
              ${icon('receipt', { size: 17 })} Raise Tax Invoice from Job
            </button>
            ${invoices.length ? html`
              <div class="tk-stack" style="gap:8px;padding-top:6px">
                <div class="tk-kv__k">Existing Invoices for ${job.job_number}</div>
                ${invoices.map((inv) => html`
                  <div class="tk-row" style="padding:8px 0" data-key="jinv-${inv.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title"><span class="job-code">${inv.invoice_number}</span> <strong>${money(inv.total_cents, { currency })}</strong> <span class="tk-tag ${inv.status === 'Paid' ? 'tk-tag--ok' : inv.status === 'Overdue' ? 'tk-tag--bad' : 'tk-tag--warn'}">${inv.status}</span></div>
                      <div class="tk-row__meta"><span>Issued ${fmtDay(inv.issue_date)}</span></div>
                    </div>
                    <div class="tk-row__aside">
                      <a href="#/invoices" class="k-btn k-btn--sm">View</a>
                    </div>
                  </div>`)}
              </div>` : ''}
          </div>
        </section>
      </div>
    </div>`;
}

export function jobFormFields(customers, job = {}, defaultCustId = '') {
  const chosenCust = job.customer_id || defaultCustId || (customers[0] ? customers[0].id : '');
  return html`
    <label class="k-field"><span class="k-field__label">Customer</span>
      <select class="k-input" name="customer_id" required>
        ${customers.map((c) => html`<option value="${c.id}" ${String(c.id) === String(chosenCust) ? 'selected' : ''}>${c.name} (${c.customer_type})</option>`)}
      </select>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Job Type</span>
        <select class="k-input" name="job_type">${JOB_TYPES.map((t) => html`<option value="${t}" ${t === (job.job_type || 'Repair') ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">${JOB_PRIORITIES.map((p) => html`<option value="${p}" ${p === (job.priority || 'Normal') ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${JOB_STATUSES.map((s) => html`<option value="${s}" ${s === (job.status || 'Scheduled') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Scheduled Date</span>
        <input class="k-input" type="date" name="scheduled_date" value="${job.scheduled_date || today()}" required>
      </label>
      <label class="k-field"><span class="k-field__label">Arrival Window <span class="k-field__optional">optional</span></span>
        <input class="k-input" type="time" name="scheduled_time" value="${job.scheduled_time || '09:00'}">
      </label>
      <label class="k-field"><span class="k-field__label">Assigned Tech</span>
        <input class="k-input" name="assigned_tech" value="${job.assigned_tech || ''}" placeholder="e.g. Liam Cooper">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Site Address <span class="k-field__optional">leave blank to use customer address</span></span>
      <input class="k-input" name="site_address" value="${job.site_address || ''}" placeholder="Street, suburb, postcode">
    </label>
    <label class="k-field"><span class="k-field__label">Job Description</span>
      <textarea class="k-input" name="description" rows="3" placeholder="Burst pipe, blocked drain, hot water replacement…" required>${job.description || ''}</textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Estimated Value <span class="k-field__optional">optional</span></span>
      <input class="k-input" type="number" step="0.01" min="0" name="estimated_value" value="${job.estimated_cents ? (job.estimated_cents / 100).toFixed(2) : ''}" placeholder="0.00">
    </label>`;
}

export function wireDispatchActions(root, state, { draw, loadScreen, navigate }) {
  on(root, 'click', '[data-action="dispatch-layout"]', (e, el) => { state.dispatchLayout = el.dataset.layout; draw(); });
  on(root, 'click', '[data-action="job-quick"]', (e, el) => { state.jobQuickFilter = el.dataset.filter; draw(); });
  on(root, 'change', '[data-action="job-tech"]', (e, el) => { state.jobTech = el.value; draw(); });
  on(root, 'click', '[data-action="tech-pick"]', (e, el) => {
    state.jobTech = state.jobTech === el.dataset.tech ? 'All' : el.dataset.tech;
    draw();
  });
  on(root, 'click', '[data-action="tech-clear"]', () => { state.jobTech = 'All'; draw(); });
  on(root, 'input', '[data-action="job-search"]', (e, el) => { state.jobSearch = el.value; draw(); });
  on(root, 'click', '[data-action="toggle-invoiced-col"]', () => { state.showInvoicedOnBoard = !state.showInvoicedOnBoard; draw(); });

  on(root, 'click', '[data-action="open-job"]', (e, el) => {
    if (e.target.closest('button[data-action="copy-val"], button[data-action="copy-sms-eta"]')) return;
    navigate('/job', { id: el.dataset.id });
  });

  on(root, 'click', '[data-action="copy-val"]', (e, el) => {
    e.stopPropagation();
    copyText(el.dataset.val, { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Text'} copied.` });
  });

  on(root, 'click', '[data-action="copy-sms-eta"]', (e, el) => {
    e.stopPropagation();
    const id = el.dataset.id;
    const job = (state.jobDetail?.job && String(state.jobDetail.job.id) === String(id))
      ? { ...state.jobDetail.job, customer_name: state.jobDetail.customer?.name || state.jobDetail.job.customer_name, customer_phone: state.jobDetail.customer?.phone || state.jobDetail.job.customer_phone }
      : state.jobs.find((x) => String(x.id) === String(id));
    if (!job) return;
    const msg = buildSmsEtaText(job, state.session.settings, job.customer_phone || '');
    copyText(msg, { title: `Customer SMS ETA · ${job.job_number}`, done: `SMS ETA copied for ${job.customer_name || job.job_number}.` });
  });

  on(root, 'click', '[data-action="job-new"]', async () => {
    let customers = state.customers;
    if (!customers.length) {
      const r = await api.get('/api/customers');
      customers = r.customers || [];
      state.customers = customers;
    }
    if (!customers.length) {
      toast.error('Add a customer first before booking a job.');
      navigate('/customers');
      return;
    }
    const made = await formDialog({
      title: 'Book Field Service Job',
      submitLabel: 'Book Job',
      size: 'lg',
      fields: jobFormFields(customers),
      onSubmit: (v) => api.post('/api/jobs', v),
    });
    if (made) { toast.success(`Job ${made.job.job_number} booked.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="job-edit"]', async (e, el) => {
    const job = state.jobDetail?.job || state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!job) return;
    if (!state.customers.length) {
      const r = await api.get('/api/customers');
      state.customers = r.customers || [];
    }
    const saved = await formDialog({
      title: `Edit ${job.job_number}`,
      submitLabel: 'Save changes',
      size: 'lg',
      fields: jobFormFields(state.customers, job),
      onSubmit: (v) => api.put('/api/jobs', { ...v, id: job.id }),
    });
    if (saved) { toast.success('Job updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="job-status"]', async (e, el) => {
    try {
      await api.post('/api/jobs/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Job moved to ${el.dataset.status}.`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="visit-new"]', async (e, el) => {
    const jobId = el.dataset.job || state.jobDetail?.job?.id;
    const defaultTech = state.jobDetail?.job?.assigned_tech || state.session.me?.displayName || '';
    const made = await formDialog({
      title: 'Log On-Site Work Order / Visit',
      submitLabel: 'Log Visit',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Technician</span><input class="k-input" name="technician_name" value="${defaultTech}" required></label>
          <label class="k-field"><span class="k-field__label">Visit Date</span><input class="k-input" type="date" name="visit_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Hours on Site</span><input class="k-input" type="number" step="0.25" min="0.25" name="hours_on_site" value="1.5" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Work Performed</span><textarea class="k-input" name="work_performed" rows="3" placeholder="Isolated supply, replaced burst section, pressure tested…" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Materials Used <span class="k-field__optional">optional</span></span><input class="k-input" name="materials_used" placeholder="Copper fittings, valves, sealant…"></label>
        <label class="k-check"><input type="checkbox" name="follow_up_required"><span>Follow-up visit required</span></label>`,
      onSubmit: (v) => api.post('/api/visits', { ...v, job_id: Number(jobId) }),
    });
    if (made) { toast.success('Site visit logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="visit-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete site visit?', message: 'Remove this site visit log from the job?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/visits', { id: Number(el.dataset.id) }); toast.success('Visit deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="raise-invoice"]', async (e, el) => {
    const jobId = Number(el.dataset.id);
    const settings = state.session.settings;
    const rate = (Number(settings.hourly_rate_cents || 12500) / 100).toFixed(2);
    const made = await formDialog({
      title: 'Raise Tax Invoice from Job',
      submitLabel: 'Generate Invoice',
      fields: html`
        <p class="k-dialog__text">Automatically tallies all logged site-visit hours × hourly rate plus parts requested on this job, and marks the job <strong>Invoiced</strong>.</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hourly Rate</span><input class="k-input" type="number" step="0.01" min="0" name="hourly_rate" value="${rate}" required></label>
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
        </div>
        <label class="k-check"><input type="checkbox" name="include_callout" checked><span>Include call-out fee (${money(settings.callout_fee_cents || 0, { currency: settings.currency })})</span></label>
        <label class="k-field"><span class="k-field__label">Invoice Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" placeholder="Payment terms, certificate reference…"></label>`,
      onSubmit: (v) => api.post('/api/invoices/from-job', { ...v, job_id: jobId }),
    });
    if (made) {
      toast.success(`Invoice ${made.invoice.invoice_number} raised for ${money(made.invoice.total_cents, { currency: settings.currency })}.`);
      await loadScreen();
    }
  });

  on(root, 'click', '[data-action="print-work-order"]', () => {
    const d = state.jobDetail;
    if (!d || !d.job) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    const visitsHtml = (d.visits || []).map((v) => `<tr><td>${esc(fmtDay(v.visit_date))}</td><td>${esc(v.technician_name)}</td><td>${esc(v.work_performed)}</td><td class="num">${num(v.hours_on_site, { decimals: 2 })} h</td></tr>`).join('');
    const partsHtml = (d.parts || []).map((p) => `<tr><td>${esc(p.item)}</td><td>${esc(p.supplier || '—')}</td><td>${esc(p.status)}</td><td class="num">${p.quantity}</td><td class="num">${money(p.quantity * p.unit_cost_cents, { currency: cur })}</td></tr>`).join('');
    downloadHtmlDoc(`work-order-${d.job.job_number}.html`, {
      title: `Work Order · ${d.job.job_number}`,
      businessName: s.business_name,
      subtitle: `${s.phone ? s.phone + ' · ' : ''}${s.tax_id || ''}`,
      accent: '#1d4ed8',
      bodyHtml: `
        <div class="box">
          <strong>Customer:</strong> ${esc(d.customer?.name || d.job.customer_name)} (${esc(d.customer?.phone || '')})<br>
          <strong>Site Address:</strong> ${esc(d.job.site_address)}<br>
          <strong>Job Type / Priority:</strong> ${esc(d.job.job_type)} · ${esc(d.job.priority)} · Status: ${esc(d.job.status)}<br>
          <strong>Assigned Technician:</strong> ${esc(d.job.assigned_tech || 'Unassigned')} · Scheduled: ${esc(fmtDay(d.job.scheduled_date))}
        </div>
        <div class="box"><strong>Scope of Work:</strong><br>${esc(d.job.description)}</div>
        <h3>On-Site Visits</h3>
        <table><thead><tr><th>Date</th><th>Technician</th><th>Work Performed</th><th class="num">Hours</th></tr></thead>
        <tbody>${visitsHtml || '<tr><td colspan="4">No visits logged yet.</td></tr>'}</tbody></table>
        <h3>Parts &amp; Materials</h3>
        <table><thead><tr><th>Item</th><th>Supplier</th><th>Status</th><th class="num">Qty</th><th class="num">Line Total</th></tr></thead>
        <tbody>${partsHtml || '<tr><td colspan="5">No parts logged.</td></tr>'}</tbody></table>`,
    });
  });
}
