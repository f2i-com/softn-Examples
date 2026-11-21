// Crew Dispatch Command: Unified Aqua-Teal Masthead with Conic Completion Gauge,
// Two-Column Run-Sheet / Board / Crew Switcher + Sticky Crew & Quality / Supply Pulse Rail,
// 1-click key/alarm code copy, 5-step job pipeline & instant room-by-room quality sign-off.
import { html, on, cls, qs } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, addDays, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const JOB_TYPES = ['Regular clean', 'Deep clean', 'End-of-lease', 'Office', 'Airbnb turnover'];
export const QC_ITEMS = ['Kitchen', 'Bathrooms', 'Floors', 'Windows and glass', 'Dusting', 'Bins and consumables'];

export const CREW_PALETTES = [
  { color: '#0284c7', soft: '#e0f2fe', fg: '#075985', border: '#7dd3fc' },
  { color: '#0d9488', soft: '#ccfbf1', fg: '#115e59', border: '#5eead4' },
  { color: '#4f46e5', soft: '#e0e7ff', fg: '#3730a3', border: '#a5b4fc' },
  { color: '#d97706', soft: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  { color: '#e11d48', soft: '#ffe4e6', fg: '#9f1239', border: '#fda4af' },
  { color: '#7c3aed', soft: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
];

export function crewPalette(teamId, teams = []) {
  const idx = teams.findIndex((t) => String(t.id) === String(teamId));
  const slot = idx >= 0 ? idx : Math.abs(Number(teamId) || 0);
  return CREW_PALETTES[slot % CREW_PALETTES.length];
}

export function crewStyle(pal) {
  return `--crew-color:${pal.color};--crew-soft:${pal.soft};--crew-fg:${pal.fg};--crew-border:${pal.border}`;
}

export function teamQualityStats(team, checks = [], jobs = []) {
  const jobTeamById = new Map();
  for (const j of jobs || []) jobTeamById.set(String(j.id), String(j.team_id));
  const matched = (checks || []).filter((q) => {
    const mappedTeamId = jobTeamById.get(String(q.job_id));
    if (mappedTeamId && String(team.id) === mappedTeamId) return true;
    return q.team_name && team.team_name && q.team_name === team.team_name;
  });
  const count = matched.length;
  if (!count) return { count: 0, avg: null, pct: 0, tone: 'none', barTone: '' };
  const sum = matched.reduce((acc, q) => acc + Number(q.rating || 0), 0);
  const avg = sum / count;
  const pct = Math.round((avg / 5) * 100);
  const tone = avg >= 4.5 ? 'high' : avg >= 3.5 ? 'mid' : 'low';
  const barTone = avg >= 4.5 ? 'tk-bar__fill--ok' : avg >= 3.5 ? 'tk-bar__fill--warn' : 'tk-bar__fill--bad';
  return { count, avg: avg.toFixed(1), pct, tone, barTone };
}

const STATUS_COLS = [
  { status: 'Scheduled', label: 'Scheduled' },
  { status: 'En Route', label: 'En Route' },
  { status: 'Cleaning', label: 'Cleaning' },
  { status: 'Inspected', label: 'Inspected' },
  { status: 'Complete', label: 'Complete' },
];

const PIPELINE_ORDER = ['Scheduled', 'En Route', 'Cleaning', 'Inspected', 'Complete'];

const STATUS_TAG = {
  Scheduled: '',
  'En Route': 'tk-tag--warn',
  Cleaning: 'tk-tag--info',
  Inspected: 'tk-tag--accent',
  Complete: 'tk-tag--ok',
  Issue: 'tk-tag--bad',
  Cancelled: 'tk-tag--bad',
};

export function timeWindow(startTime, durationHours) {
  const [h, m] = String(startTime || '09:00').split(':').map(Number);
  const startMin = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
  const endMin = startMin + Math.round((Number(durationHours) || 2) * 60);
  const fmt = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return `${fmt(startMin)}–${fmt(endMin)}`;
}

export function renderStars(rating) {
  const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return html`<span class="cs-stars" aria-label="${r} out of 5 stars">${'★'.repeat(r)}<span class="cs-stars__empty">${'★'.repeat(5 - r)}</span></span>`;
}

function renderStatusAction(j) {
  if (j.status === 'Scheduled') {
    return html`
      <button type="button" class="k-btn k-btn--sm cs-step-btn cs-step-btn--start" data-action="job-bump" data-id="${j.id}" data-status="Cleaning">
        ${icon('play', { size: 13 })} Start Clean
      </button>
      <button type="button" class="k-btn k-btn--sm" data-action="job-bump" data-id="${j.id}" data-status="En Route">
        En Route
      </button>`;
  }
  if (j.status === 'En Route') {
    return html`
      <button type="button" class="k-btn k-btn--sm cs-step-btn cs-step-btn--start" data-action="job-bump" data-id="${j.id}" data-status="Cleaning">
        ${icon('play', { size: 13 })} Start Clean
      </button>`;
  }
  if (j.status === 'Cleaning') {
    return html`
      <button type="button" class="k-btn k-btn--sm cs-step-btn cs-step-btn--inspect" data-action="job-finish-inspect" data-id="${j.id}">
        ${icon('check-square', { size: 14 })} Finish &amp; Inspect
      </button>`;
  }
  if (j.status === 'Inspected') {
    return html`
      <button type="button" class="k-btn k-btn--primary k-btn--sm cs-step-btn" data-action="job-bump" data-id="${j.id}" data-status="Complete">
        ${icon('check', { size: 14 })} Sign Off
      </button>
      <button type="button" class="k-btn k-btn--sm" data-action="job-qc" data-id="${j.id}">
        ${j.qc_count > 0 ? 'Re-check' : 'Inspect'}
      </button>`;
  }
  if (j.status === 'Complete') {
    return html`
      <button type="button" class="k-btn k-btn--sm" data-action="job-qc" data-id="${j.id}">
        ${icon('check-square', { size: 14 })} ${j.qc_count > 0 ? 'Re-check' : 'Quality Check'}
      </button>`;
  }
  return '';
}

function renderPipelineMini(status) {
  const idx = PIPELINE_ORDER.indexOf(status);
  if (idx < 0) return '';
  return html`
    <div class="cs-pipeline" aria-label="Job progress: ${status}">
      ${PIPELINE_ORDER.map((step, i) => html`
        <span class="${cls('cs-pipe-step', { 'is-done': i < idx, 'is-now': i === idx })}">${step}</span>`)}
    </div>`;
}

function renderRunSheetCard(j, currency, teams) {
  const pal = crewPalette(j.team_id, teams);
  const isDone = j.status === 'Complete';
  return html`
    <article class="${cls('cs-run-card', { 'cs-run-card--done': isDone })}" style="${crewStyle(pal)}" data-key="job-${j.id}">
      <div class="cs-run-card__head">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
          <span class="cs-window">${icon('clock', { size: 12 })} ${timeWindow(j.start_time, j.duration_hours)} · ${j.duration_hours}h</span>
          <span class="cs-crew-pill" style="${crewStyle(pal)}"><span class="cs-crew-pill__dot"></span>${j.team_name || 'Unassigned'}</span>
          <span class="tk-tag ${STATUS_TAG[j.status] || ''}">${j.status}</span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:8px">
          ${j.qc_count > 0 ? renderStars(j.qc_rating) : ''}
          <span class="cs-price">${money(j.price_cents, { currency })}</span>
        </div>
      </div>
      <div class="cs-run-card__body">
        <div class="cs-run-card__title">
          <span>${j.client_name || 'Client #' + j.client_id}</span>
          <span class="tk-tag">${j.job_type}</span>
          ${j.client_type ? html`<span class="tk-tag tk-tag--accent">${j.client_type}</span>` : ''}
          ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
        </div>
        <div class="cs-run-card__meta">
          ${j.client_address ? html`<span style="display:inline-flex;align-items:center;gap:4px">${icon('pin', { size: 13 })} ${j.client_address}</span>` : ''}
          ${j.lead_cleaner || j.vehicle ? html`<span style="display:inline-flex;align-items:center;gap:4px">${icon('crew-van', { size: 13 })} ${j.lead_cleaner ? j.lead_cleaner + (j.vehicle ? ' · ' : '') : ''}${j.vehicle || ''}</span>` : ''}
        </div>
        ${j.notes ? html`<div style="font-size:12.5px;color:var(--k-muted)">${j.notes}</div>` : ''}
        ${j.access_instructions ? html`
          <button type="button" class="cs-access-chip" data-action="job-copy-access" data-id="${j.id}" title="Click to copy site access &amp; alarm code">
            <span class="cs-access-chip__icon">${icon('key', { size: 13 })}</span>
            <span class="cs-access-chip__body">
              <span class="cs-access-chip__k">Site Key / Alarm Access</span>
              <span class="cs-access-chip__v">${j.access_instructions}</span>
            </span>
            <span class="cs-access-chip__copy">${icon('copy', { size: 11 })} Copy</span>
          </button>` : html`
          <div class="cs-access-chip cs-access-chip--empty">
            ${icon('key', { size: 13 })} <span>No access or alarm instructions saved</span>
          </div>`}
        ${renderPipelineMini(j.status)}
      </div>
      <div class="cs-run-card__foot">
        <div class="tk-btn-row">${renderStatusAction(j)}</div>
        <div class="tk-btn-row">
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
        </div>
      </div>
    </article>`;
}

function renderJobCard(j, currency, teams, { showStatus = false } = {}) {
  const pal = crewPalette(j.team_id, teams);
  const isDone = j.status === 'Complete';
  return html`
    <article class="${cls('cs-job-card', { 'cs-job-card--done': isDone })}" style="${crewStyle(pal)}" data-key="job-${j.id}">
      <div class="cs-job-card__strip">
        <span class="cs-crew-pill" style="${crewStyle(pal)}"><span class="cs-crew-pill__dot"></span>${j.team_name || 'Unassigned'}</span>
        <div style="display:inline-flex;align-items:center;gap:6px">
          ${showStatus ? html`<span class="tk-tag ${STATUS_TAG[j.status] || ''}">${j.status}</span>` : ''}
          <span class="cs-price">${money(j.price_cents, { currency })}</span>
        </div>
      </div>
      <div class="cs-job-card__body">
        <div class="tk-ticket__top">
          <span>${j.client_name || 'Client #' + j.client_id}</span>
          ${j.qc_count > 0 ? renderStars(j.qc_rating) : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          <span class="cs-window">${icon('clock', { size: 12 })} ${timeWindow(j.start_time, j.duration_hours)} · ${j.duration_hours}h</span>
          <span class="tk-tag">${j.job_type}</span>
          ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
        </div>
        <div class="tk-ticket__meta">
          ${j.client_address ? html`<div style="display:flex;align-items:flex-start;gap:5px">${icon('pin', { size: 13 })}<span>${j.client_address}</span></div>` : ''}
          ${j.notes ? html`<div style="margin-top:2px">${j.notes}</div>` : ''}
        </div>
        ${j.access_instructions ? html`
          <button type="button" class="cs-access-chip" data-action="job-copy-access" data-id="${j.id}">
            <span class="cs-access-chip__icon">${icon('key', { size: 13 })}</span>
            <span class="cs-access-chip__body">
              <span class="cs-access-chip__k">Access / Alarm</span>
              <span class="cs-access-chip__v">${j.access_instructions}</span>
            </span>
            <span class="cs-access-chip__copy">${icon('copy', { size: 11 })} Copy</span>
          </button>` : ''}
      </div>
      <div class="cs-job-card__foot">
        <div class="tk-btn-row">${renderStatusAction(j)}</div>
        <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
      </div>
    </article>`;
}

export function renderDispatchView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const q = (state.dispatchSearch || '').trim().toLowerCase();
  const teamJobs = state.dispatchTeamFilter === 'All'
    ? state.jobs
    : state.jobs.filter((j) => String(j.team_id) === String(state.dispatchTeamFilter));
  const statusFilter = state.dispatchStatusFilter || 'All';
  const visibleJobs = teamJobs.filter((j) => {
    if (statusFilter !== 'All' && j.status !== statusFilter) return false;
    if (q && !`${j.client_name} ${j.client_address} ${j.team_name} ${j.job_type} ${j.notes || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const nonCancelled = teamJobs.filter((j) => j.status !== 'Cancelled');
  const dayRev = nonCancelled.reduce((sum, j) => sum + Number(j.price_cents || 0), 0);
  const activeCount = teamJobs.filter((j) => j.status === 'En Route' || j.status === 'Cleaning').length;
  const completedCount = teamJobs.filter((j) => j.status === 'Complete' || j.status === 'Inspected').length;
  const completionPct = nonCancelled.length ? Math.round((completedCount / nonCancelled.length) * 100) : 0;
  const ringColor = completionPct >= 80 ? '#34d399' : completionPct >= 40 ? '#22d3ee' : '#38bdf8';

  const extraJobs = visibleJobs.filter((j) => j.status === 'Issue' || j.status === 'Cancelled');
  const mainJobs = visibleJobs.filter((j) => j.status !== 'Issue' && j.status !== 'Cancelled');
  const inspectQueue = state.jobs.filter((j) => j.status === 'Cleaning' || j.status === 'Inspected');
  const lowSupplies = (state.supplies || []).filter((s) => s.status !== 'OK');
  const openIssues = (state.issues || []).filter((i) => i.status !== 'Resolved');
  const shownCols = statusFilter === 'All' ? STATUS_COLS : STATUS_COLS.filter((col) => col.status === statusFilter);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="cs-masthead" aria-label="Cleaning Dispatch Command">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${activeCount > 0 ? '#22d3ee' : '#34d399'}"></span>
          CREW DISPATCH · ${fmtDayNear(state.dispatchDate).toUpperCase()}
        </div>
        <h1 class="cs-masthead__title">Daily Cleaning Dispatch</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${nonCancelled.length} clean${nonCancelled.length === 1 ? '' : 's'}</strong> on sheet</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${activeCount} crew${activeCount === 1 ? '' : 's'} on route</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click key codes &amp; room QC sign-off</span>
        </div>
      </div>

      <div class="cs-masthead__pods cs-masthead__pods--3" style="align-items:center">
        <div class="cs-pod cs-pod--ring cs-pod--aqua">
          <div class="tk-ring" style="--p:${completionPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${completionPct}%</span>
          </div>
          <div>
            <span class="cs-pod__lbl">Day Progress</span>
            <span class="cs-pod__val">${completedCount}/${nonCancelled.length}</span>
            <span class="cs-pod__sub">Inspected / done</span>
          </div>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('dollar', { size: 12 })} Scheduled</span>
          <span class="cs-pod__val">${money(dayRev, { currency })}</span>
          <span class="cs-pod__sub">${activeCount} active now</span>
        </div>

        <a href="#/quality" class="cs-pod">
          <span class="cs-pod__lbl">${icon('star', { size: 12 })} Avg Quality</span>
          <span class="cs-pod__val">${counts.avgRating ? counts.avgRating + ' ★' : '—'}</span>
          <span class="cs-pod__sub">${counts.qualityChecksCount || 0} audits →</span>
        </a>

        <a href="#/issues" class="${cls('cs-pod', { 'cs-pod--alert': counts.openIssues > 0 || counts.lowSupplies > 0 })}">
          <span class="cs-pod__lbl">${icon(counts.openIssues > 0 ? 'alert' : 'shield-check', { size: 12 })} Alerts</span>
          <span class="cs-pod__val">${(counts.openIssues || 0) + (counts.lowSupplies || 0)}</span>
          <span class="cs-pod__sub">${counts.openIssues || 0} iss · ${counts.lowSupplies || 0} stock</span>
        </a>

        <div class="cs-masthead__actions">
          <button type="button" class="k-btn cs-cta-bright" data-action="job-new">${icon('plus', { size: 15 })} Schedule Clean</button>
          <button type="button" class="k-btn cs-cta-glass k-btn--sm" data-action="copy-dispatch">${icon('copy', { size: 14 })} Run Sheet</button>
          <button type="button" class="k-btn cs-cta-glass k-btn--sm" data-action="print-dispatch">${icon('printer', { size: 14 })} Print</button>
        </div>
      </div>
    </section>

    <div class="cs-split">
      <div class="tk-stack" style="gap:14px">
        <div class="cs-daybar">
          <div class="cs-daybar__row">
            <button type="button" class="k-btn k-btn--sm" data-action="day-shift" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 15 })}</button>
            <button type="button" class="k-btn k-btn--sm" data-action="day-today">Today</button>
            <button type="button" class="k-btn k-btn--sm" data-action="day-shift" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 15 })}</button>
            <input class="k-input" type="date" style="width:auto;min-height:32px;padding:3px 9px;font-size:13px" data-action="day-pick" value="${state.dispatchDate}">
            <span class="cs-daybar__date">${fmtDay(state.dispatchDate, { weekday: 'short' })}</span>
            <div class="cs-daybar__spacer"></div>
            <div class="tk-segmented" role="group" aria-label="Dispatch view mode">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.dispatchMode === 'runsheet' })}" data-action="dispatch-mode" data-mode="runsheet">Run Sheet</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.dispatchMode === 'status' })}" data-action="dispatch-mode" data-mode="status">Board</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.dispatchMode === 'team' })}" data-action="dispatch-mode" data-mode="team">By Crew</button>
            </div>
          </div>

          <div class="cs-daybar__row">
            <div class="tk-segmented" role="group" aria-label="Filter jobs by status">
              <button type="button" class="${cls('tk-pill', { 'is-on': statusFilter === 'All' })}" data-action="dispatch-status-filter" data-status="All">All (${teamJobs.length})</button>
              ${STATUS_COLS.map((col) => {
                const n = teamJobs.filter((j) => j.status === col.status).length;
                return html`<button type="button" class="${cls('tk-pill', { 'is-on': statusFilter === col.status })}" data-action="dispatch-status-filter" data-status="${col.status}">${col.label}${n ? ` (${n})` : ''}</button>`;
              })}
            </div>
            <label class="tk-search" style="min-height:33px;flex:1 1 180px;max-width:240px">
              ${icon('search', { size: 14 })}
              <input type="search" data-action="dispatch-search" value="${state.dispatchSearch || ''}" placeholder="Find client or address…">
            </label>
            ${state.dispatchTeamFilter !== 'All' ? html`
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="dispatch-team-pill" data-team="All">Clear crew filter</button>` : ''}
          </div>
        </div>

        ${state.loading && !state.jobs.length ? html`
          <section class="tk-sheet">${skeleton(4)}</section>
        ` : mainJobs.length ? (
          state.dispatchMode === 'runsheet' ? html`
            <div class="cs-runsheet-list">
              ${mainJobs.map((j) => renderRunSheetCard(j, currency, state.teams))}
            </div>` :
          state.dispatchMode === 'status' ? html`
            <div class="cs-board-wrap">
              <div class="tk-board">
                ${shownCols.map((col) => {
                  const cards = mainJobs.filter((j) => j.status === col.status);
                  return html`
                    <div class="tk-col" data-key="col-${col.status}">
                      <div class="tk-col__head">
                        <span>${col.label}</span>
                        <span class="k-badge">${cards.length}</span>
                      </div>
                      ${cards.length ? cards.map((j) => renderJobCard(j, currency, state.teams)) : html`<p class="tk-muted" style="font-size:13px;padding:8px 4px">No jobs</p>`}
                    </div>`;
                })}
              </div>
            </div>` : html`
            <div class="cs-crew-grid">
              ${state.teams.filter((tm) => state.dispatchTeamFilter === 'All' || String(tm.id) === String(state.dispatchTeamFilter)).map((tm) => {
                const pal = crewPalette(tm.id, state.teams);
                const crewJobs = mainJobs.filter((j) => j.team_id === tm.id);
                const hrs = crewJobs.reduce((s, j) => s + Number(j.duration_hours || 0), 0);
                const qStats = teamQualityStats(tm, state.checks, state.jobs);
                return html`
                  <section class="cs-crew-col" style="${crewStyle(pal)}" data-key="crew-${tm.id}">
                    <div class="cs-crew-col__head">
                      <div>
                        <div style="font-weight:750;font-size:15px;display:flex;align-items:center;gap:7px">
                          <span class="cs-crew-pill__dot" style="width:9px;height:9px;background:${pal.color}"></span>
                          ${tm.team_name}
                        </div>
                        <div class="tk-muted" style="font-size:12px">${tm.lead_cleaner || 'Lead TBC'}${tm.vehicle ? ' · ' + tm.vehicle : ''}</div>
                      </div>
                      <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end">
                        <span class="cs-crew-pill" style="${crewStyle(pal)}">${crewJobs.length} jobs · ${hrs}h</span>
                        ${qStats.count ? html`<span class="cs-rating-pill cs-rating-pill--${qStats.tone}">${qStats.avg} ★</span>` : ''}
                      </div>
                    </div>
                    <div class="cs-crew-col__body">
                      ${crewJobs.length ? crewJobs.map((j) => renderJobCard(j, currency, state.teams, { showStatus: true })) : html`<p class="tk-muted" style="font-size:13px;padding:8px 4px">No jobs matching filter.</p>`}
                    </div>
                  </section>`;
              })}
            </div>`
        ) : emptyState({
          iconName: 'spray-bottle',
          title: statusFilter !== 'All' ? `No ${statusFilter} cleans on ${fmtDay(state.dispatchDate)}` : `No cleans scheduled for ${fmtDay(state.dispatchDate)}`,
          text: 'Adjust your status/crew filter or schedule a residential, commercial or short-stay clean.',
          action: statusFilter !== 'All'
            ? html`<button type="button" class="k-btn k-btn--sm" data-action="dispatch-status-filter" data-status="All">Show All Statuses</button>`
            : html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-new">Schedule Clean</button>`,
        })}

        ${extraJobs.length ? html`
          <section class="tk-sheet">
            <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('alert', { size: 16 })} Issues &amp; Cancelled</h2><span class="tk-sheet__count">${extraJobs.length}</span></div>
            <div>
              ${extraJobs.map((j) => html`
                <div class="tk-row" data-key="extra-${j.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span>${j.client_name}</span>
                      <span class="tk-tag ${STATUS_TAG[j.status] || ''}">${j.status}</span>
                      <span class="cs-window">${timeWindow(j.start_time, j.duration_hours)}</span>
                    </div>
                    <div class="tk-row__meta"><span>${j.team_name}</span><span>${j.job_type}</span>${j.notes ? html`<span>${j.notes}</span>` : ''}</div>
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="k-btn k-btn--sm" data-action="job-bump" data-id="${j.id}" data-status="Scheduled">Re-open</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
                  </div>
                </div>`)}
            </div>
          </section>` : ''}
      </div>

      <aside class="cs-rail-panel" aria-label="Crews, Quality & Stock Pulse">
        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('crew-van', { size: 14 })} Active Crews</span>
            <a href="#/teams" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Roster</a>
          </div>
          <div class="cs-rail-list">
            ${state.teams.length ? state.teams.map((tm) => {
              const pal = crewPalette(tm.id, state.teams);
              const cJobs = state.jobs.filter((j) => j.team_id === tm.id && j.status !== 'Cancelled');
              const doneJobs = cJobs.filter((j) => j.status === 'Complete' || j.status === 'Inspected').length;
              const hrs = cJobs.reduce((s, j) => s + Number(j.duration_hours || 0), 0);
              const qStats = teamQualityStats(tm, state.checks, state.jobs);
              const isOn = String(state.dispatchTeamFilter) === String(tm.id);
              const pct = cJobs.length ? Math.round((doneJobs / cJobs.length) * 100) : 0;
              return html`
                <div class="cs-rail-item" data-key="rail-crew-${tm.id}">
                  <div class="cs-rail-item__top">
                    <div style="min-width:0">
                      <button type="button" class="cs-crew-pill" style="${crewStyle(pal)};${isOn ? 'box-shadow:0 0 0 2px var(--crew-color)' : ''}" data-action="dispatch-team-pill" data-team="${tm.id}">
                        <span class="cs-crew-pill__dot"></span>${tm.team_name}
                      </button>
                      <div class="cs-rail-item__sub" style="margin-top:3px">${tm.lead_cleaner || 'Lead TBC'} · ${hrs}h (${cJobs.length} jobs)</div>
                    </div>
                    ${qStats.count ? html`<span class="cs-rating-pill cs-rating-pill--${qStats.tone}">${qStats.avg} ★</span>` : html`<span class="tk-tag">New</span>`}
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill tk-bar__fill--ok" style="width:${pct}%"></div></div>
                </div>`;
            }) : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active crews yet.</div>`}
          </div>
        </section>

        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('check-square', { size: 14 })} Quality Sign-Off</span>
            <a href="#/quality" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Audits (${state.checks.length})</a>
          </div>
          ${inspectQueue.length ? html`
            <div class="cs-rail-list">
              ${inspectQueue.slice(0, 4).map((j) => html`
                <div class="cs-rail-item" data-key="rail-qc-${j.id}">
                  <div class="cs-rail-item__top">
                    <div>
                      <div class="cs-rail-item__name">${j.client_name}</div>
                      <div class="cs-rail-item__sub">${j.team_name} · ${timeWindow(j.start_time, j.duration_hours)}</div>
                    </div>
                    <span class="tk-tag ${STATUS_TAG[j.status] || ''}">${j.status}</span>
                  </div>
                  <div class="cs-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${j.job_type}</span>
                    ${j.status === 'Cleaning'
                      ? html`<button type="button" class="k-btn k-btn--sm cs-step-btn cs-step-btn--inspect" data-action="job-finish-inspect" data-id="${j.id}">Inspect ✓</button>`
                      : html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-bump" data-id="${j.id}" data-status="Complete">Sign Off ✓</button>`}
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No cleans awaiting supervisor inspection right now ✓</div>`}
        </section>

        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('box', { size: 14 })} Stock &amp; Escalations</span>
            <a href="#/supplies" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Supplies</a>
          </div>
          ${lowSupplies.length || openIssues.length ? html`
            <div class="cs-rail-list">
              ${lowSupplies.slice(0, 3).map((sp) => html`
                <div class="cs-rail-item" data-key="rail-sup-${sp.id}">
                  <div class="cs-rail-item__top">
                    <div>
                      <div class="cs-rail-item__name">${sp.supply_item}</div>
                      <div class="cs-rail-item__sub">${sp.current_stock} ${sp.unit} left (par ${sp.reorder_point})</div>
                    </div>
                    <span class="tk-tag ${sp.status === 'Out' ? 'tk-tag--bad' : 'tk-tag--warn'}">${sp.status}</span>
                  </div>
                  <div class="cs-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${sp.supplier || sp.category}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-restock" data-id="${sp.id}">Restock ✓</button>
                  </div>
                </div>`)}
              ${openIssues.slice(0, 2).map((iss) => html`
                <div class="cs-rail-item" data-key="rail-iss-${iss.id}">
                  <div class="cs-rail-item__top">
                    <div>
                      <div class="cs-rail-item__name">${iss.client_name}</div>
                      <div class="cs-rail-item__sub">${iss.issue_type} · ${iss.severity}</div>
                    </div>
                    <a href="#/issues" class="tk-tag tk-tag--bad" style="text-decoration:none">Open →</a>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All vans stocked above par &amp; zero open issues ✓</div>`}
        </section>
      </aside>
    </div>
  `;
}

export async function openJobForm(state, { loadScreen }, preset = {}) {
  if (!state.clients.length || !state.teams.length) {
    const [c, t] = await Promise.all([api.get('/api/clients'), api.get('/api/teams', { day: today() })]);
    state.clients = c.clients || [];
    state.teams = t.teams || [];
  }
  if (!state.clients.length) { toast.error('Add at least one client first.'); return; }
  if (!state.teams.length) { toast.error('Add at least one cleaning team first.'); return; }

  const isEdit = Boolean(preset.id);
  const saved = await formDialog({
    title: isEdit ? 'Edit Cleaning Job' : 'Book Cleaning Job',
    submitLabel: isEdit ? 'Save changes' : 'Schedule job',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>
            ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(preset.client_id) ? 'selected' : ''}>${c.client_name} (${c.client_type})</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Assigned Team</span>
          <select class="k-input" name="team_id" required>
            ${state.teams.map((tm) => html`<option value="${tm.id}" ${String(tm.id) === String(preset.team_id) ? 'selected' : ''}>${tm.team_name}${tm.lead_cleaner ? ' — ' + tm.lead_cleaner : ''}</option>`)}
          </select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Job Type</span>
          <select class="k-input" name="job_type">${JOB_TYPES.map((jt) => html`<option value="${jt}" ${jt === (preset.job_type || 'Regular clean') ? 'selected' : ''}>${jt}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Price</span>
          <input class="k-input" type="number" step="0.01" min="0" name="price" value="${preset.price_cents !== undefined ? (preset.price_cents / 100).toFixed(2) : '180.00'}">
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Scheduled Date</span>
          <input class="k-input" type="date" name="scheduled_date" value="${preset.scheduled_date || state.dispatchDate || today()}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Start Time</span>
          <input class="k-input" type="time" name="start_time" value="${preset.start_time || '09:00'}" required>
        </label>
        <label class="k-field"><span class="k-field__label">Duration (hrs)</span>
          <input class="k-input" type="number" step="0.5" min="0.5" max="24" name="duration_hours" value="${preset.duration_hours || 2}" required>
        </label>
      </div>
      ${isEdit ? html`
        <label class="k-field"><span class="k-field__label">Status</span>
          <select class="k-input" name="status">
            ${['Scheduled', 'En Route', 'Cleaning', 'Inspected', 'Complete', 'Issue', 'Cancelled'].map((st) => html`<option value="${st}" ${st === preset.status ? 'selected' : ''}>${st}</option>`)}
          </select>
        </label>` : ''}
      <label class="k-field"><span class="k-field__label">Crew Notes</span>
        <textarea class="k-input" name="notes" rows="2" placeholder="Special instructions, oven add-on, eco products…">${preset.notes || ''}</textarea>
      </label>`,
    onSubmit: (vals) => isEdit ? api.put('/api/jobs', { ...vals, id: preset.id }) : api.post('/api/jobs', vals),
  });
  if (saved) {
    toast.success(isEdit ? 'Job updated.' : 'Cleaning job scheduled.');
    await loadScreen();
  }
}

export async function openQualityDialog(job, state, { loadScreen }) {
  let rating = 5;
  const made = await formDialog({
    title: `Quality Check · ${job.client_name || 'Job #' + job.id}`,
    submitLabel: 'Save Quality Check',
    fields: html`
      <div class="tk-muted" style="font-size:13.5px">${fmtDay(job.scheduled_date)} · ${job.job_type} · ${job.team_name || ''}</div>
      <div class="k-field">
        <span class="k-field__label">Checklist Completed</span>
        <div>
          ${QC_ITEMS.map((item) => html`<label class="tk-check-item"><input type="checkbox" name="checklist" value="${item}" checked><span>${item}</span></label>`)}
        </div>
      </div>
      <div class="k-form__row">
        <div class="k-field">
          <span class="k-field__label">Star Rating (1–5)</span>
          <input type="hidden" name="rating" value="5">
          <div class="cs-star-picker">
            ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class="cs-star-btn is-on" data-pick-star="${n}">★</button>`)}
          </div>
        </div>
        <label class="k-field"><span class="k-field__label">Follow-up Required</span>
          <select class="k-input" name="follow_up">
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </label>
      </div>
      <label class="k-field"><span class="k-field__label">Issues Found <span class="k-field__optional">optional</span></span>
        <textarea class="k-input" name="issues_found" rows="2" placeholder="Note any streaks, missed corners, or damage…"></textarea>
      </label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Checked By</span>
          <input class="k-input" name="checked_by" value="${state.session.me.displayName || ''}">
        </label>
        <label class="k-check" style="align-self:end;padding-bottom:8px">
          <input type="checkbox" name="mark_complete" checked>
          <span>Mark job Complete</span>
        </label>
      </div>`,
    onOpen: ({ form }) => {
      on(form, 'click', '[data-pick-star]', (ev, btn) => {
        rating = Number(btn.dataset.pickStar);
        const hidden = qs('input[name="rating"]', form);
        if (hidden) hidden.value = String(rating);
        form.querySelectorAll('[data-pick-star]').forEach((b) => {
          b.classList.toggle('is-on', Number(b.dataset.pickStar) <= rating);
        });
      });
    },
    onSubmit: (vals) => api.post('/api/quality', {
      job_id: job.id,
      checklist: Array.isArray(vals.checklist) ? vals.checklist : [],
      rating: Number(vals.rating || 5),
      issues_found: vals.issues_found || '',
      follow_up: vals.follow_up || 'No',
      checked_by: vals.checked_by || '',
      mark_complete: Boolean(vals.mark_complete),
    }),
  });
  if (made) {
    toast.success(`Quality check saved (${made.check.rating}★).`);
    await loadScreen();
  }
}

function buildMorningRunSheet(state) {
  const biz = state.session.settings.business_name || 'CleanShift';
  const jobs = (state.dispatchTeamFilter === 'All'
    ? state.jobs
    : state.jobs.filter((j) => String(j.team_id) === String(state.dispatchTeamFilter)))
    .filter((j) => j.status !== 'Cancelled');

  if (!jobs.length) {
    return `${biz} — Morning Run Sheet (${fmtDay(state.dispatchDate, { weekday: 'short' })})\nNo active cleaning jobs scheduled.`;
  }

  const byTeam = new Map();
  for (const j of jobs) {
    const key = String(j.team_id || 'unassigned');
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(j);
  }

  const sections = [];
  for (const [key, list] of byTeam.entries()) {
    list.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
    const team = state.teams.find((t) => String(t.id) === key);
    const title = team ? team.team_name : (list[0].team_name || 'Unassigned Crew');
    const subParts = [];
    if (team?.lead_cleaner || list[0].lead_cleaner) subParts.push(`Lead: ${team?.lead_cleaner || list[0].lead_cleaner}`);
    if (team?.vehicle || list[0].vehicle) subParts.push(team?.vehicle || list[0].vehicle);
    const totalHrs = list.reduce((s, j) => s + Number(j.duration_hours || 0), 0);
    const header = `=== ${title.toUpperCase()} (${list.length} job${list.length === 1 ? '' : 's'} · ${totalHrs}h${subParts.length ? ' · ' + subParts.join(' · ') : ''}) ===`;

    const lines = list.map((j, i) => {
      const rows = [
        `${i + 1}. ${timeWindow(j.start_time, j.duration_hours)} (${j.duration_hours}h) — ${j.client_name || 'Client #' + j.client_id} [${j.job_type} · ${j.status}]`,
        `   Address: ${j.client_address || 'See client card'}`,
        `   Access:  ${j.access_instructions || 'No access code listed'}`,
      ];
      if (j.notes) rows.push(`   Notes:   ${j.notes}`);
      return rows.join('\n');
    });
    sections.push(`${header}\n${lines.join('\n\n')}`);
  }

  return `${biz} — Morning Run Sheet\nDate: ${fmtDay(state.dispatchDate, { weekday: 'long' })}\nTotal Active Cleans: ${jobs.length}\n\n${sections.join('\n\n')}`;
}

export function wireDispatchActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="day-shift"]', (e, el) => {
    state.dispatchDate = addDays(state.dispatchDate, Number(el.dataset.delta));
    loadScreen('/');
  });
  on(root, 'click', '[data-action="day-today"]', () => {
    state.dispatchDate = today();
    loadScreen('/');
  });
  on(root, 'change', '[data-action="day-pick"]', (e, el) => {
    if (el.value) { state.dispatchDate = el.value; loadScreen('/'); }
  });
  on(root, 'click', '[data-action="dispatch-mode"]', (e, el) => {
    state.dispatchMode = el.dataset.mode;
    draw();
  });
  on(root, 'click', '[data-action="dispatch-status-filter"]', (e, el) => {
    state.dispatchStatusFilter = el.dataset.status || 'All';
    draw();
  });
  on(root, 'input', '[data-action="dispatch-search"]', (e, el) => {
    state.dispatchSearch = el.value;
    draw();
  });
  on(root, 'click', '[data-action="dispatch-team-pill"]', (e, el) => {
    const val = el.dataset.team;
    state.dispatchTeamFilter = state.dispatchTeamFilter === val ? 'All' : val;
    draw();
  });
  on(root, 'click', '[data-action="job-new"]', () => openJobForm(state, { loadScreen }));
  on(root, 'click', '[data-action="job-edit"]', (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (job) openJobForm(state, { loadScreen }, job);
  });
  on(root, 'click', '[data-action="job-bump"]', async (e, el) => {
    try {
      await api.post('/api/jobs/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Job moved to ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="job-finish-inspect"]', async (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!job) return;
    try {
      await api.post('/api/jobs/status', { id: job.id, status: 'Inspected' });
      await loadScreen('/');
      const updated = state.jobs.find((x) => x.id === job.id) || { ...job, status: 'Inspected' };
      await openQualityDialog(updated, state, { loadScreen });
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="job-qc"]', (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (job) openQualityDialog(job, state, { loadScreen });
  });
  on(root, 'click', '[data-action="rail-restock"]', async (e, el) => {
    try {
      await api.post('/api/supplies/adjust', { id: Number(el.dataset.id), restockToPar: true });
      toast.success('Supply restocked above par.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="job-copy-access"]', (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!job || !job.access_instructions) return;
    copyText(`${job.client_name}\n${job.client_address || ''}\nAccess / Alarm Code:\n${job.access_instructions}`, {
      title: 'Site Access & Alarm Instructions',
      done: `Copied access code for ${job.client_name}`,
    });
  });
  on(root, 'click', '[data-action="copy-dispatch"]', () => {
    copyText(buildMorningRunSheet(state), {
      title: 'Morning Run Sheet (Grouped by Crew)',
      done: 'Morning Run Sheet copied!',
    });
  });
  on(root, 'click', '[data-action="print-dispatch"]', () => {
    const cur = state.session.settings.currency || 'AUD';
    const rowsHtml = state.jobs.map((j) => `
      <tr>
        <td><strong>${timeWindow(j.start_time, j.duration_hours)}</strong><br>${j.duration_hours}h</td>
        <td><strong>${j.client_name || ''}</strong><br>${j.client_address || ''}</td>
        <td>${j.job_type}</td>
        <td>${j.team_name || ''}${j.vehicle ? '<br>' + j.vehicle : ''}</td>
        <td>${j.access_instructions || '—'}</td>
        <td>${j.status}</td>
        <td class="num">${money(j.price_cents, { currency: cur })}</td>
      </tr>`).join('');
    downloadHtmlDoc(`cleanshift-runsheet-${state.dispatchDate}.html`, {
      title: `Morning Run Sheet · ${fmtDay(state.dispatchDate)}`,
      businessName: state.session.settings.business_name,
      subtitle: `${state.jobs.length} scheduled job(s)`,
      accent: '#0891b2',
      bodyHtml: `<table>
        <thead><tr><th>Window</th><th>Client &amp; Address</th><th>Type</th><th>Crew</th><th>Access / Key Codes</th><th>Status</th><th class="num">Price</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="7">No jobs scheduled.</td></tr>'}</tbody>
      </table>`,
    });
  });
  on(root, 'click', '[data-action="job-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete job?', message: 'Permanently delete this cleaning job?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/jobs', { id: Number(el.dataset.id) }); toast.success('Job deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
