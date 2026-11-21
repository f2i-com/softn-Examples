// Paddocks Status Board (Heritage Eucalyptus Masthead, Acreage & Crop-Stage Banded Cards + Sticky Field/Spray/Shed Rail) & Farm Jobs.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { num } from '../../kit/format.js';
import { today, fmtDate, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const IRRIGATIONS = ['Drip', 'Sprinkler', 'Flood', 'Dryland'];
const P_STATUSES = ['In crop', 'Fallow', 'Being prepared', 'Grazing'];
const JOB_TYPES = ['Planting', 'Spraying', 'Irrigation', 'Fertiliser', 'Harvest', 'Maintenance'];
const JOB_STATUSES = ['Planned', 'In progress', 'Done', 'Rained off'];

function whpRemainingLabel(whpEnd) {
  if (!whpEnd) return '';
  const diff = daysBetween(today(), whpEnd);
  if (diff <= 0) return 'Clears today';
  return `${diff}d left`;
}

export function renderPaddocksView(state) {
  const c = state.session.counts || {};
  const tday = today();
  const filter = state.paddockFilter || 'All';
  const q = (state.paddockSearch || '').trim().toLowerCase();
  const allPaddocks = state.paddocks || [];
  const totalHa = allPaddocks.reduce((s, p) => s + Number(p.area_ha || 0), 0) || Number(c.totalHa || 0);

  const paddocks = allPaddocks.filter((p) => {
    if (filter === 'WHP' && !p.active_whp) return false;
    if (filter === 'In crop' && p.status !== 'In crop') return false;
    if (filter === 'Grazing' && p.status !== 'Grazing' && p.status !== 'Fallow') return false;
    if (q && !(p.block_name.toLowerCase().includes(q) || (p.crop || '').toLowerCase().includes(q) || (p.soil_notes || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const clearCount = allPaddocks.filter((p) => !p.active_whp).length;
  const clearPct = allPaddocks.length ? Math.round((clearCount / allPaddocks.length) * 100) : 100;
  const openJobs = (state.jobs || []).filter((j) => j.status !== 'Done');
  const recentSprays = (state.chemicals || []).slice(0, 4);
  const dueMachines = (state.machines || []).filter((m) => m.status === 'Due for service' || m.status === 'In workshop' || (m.service_due && m.service_due <= tday && m.status !== 'Retired'));
  const grazingBlocks = allPaddocks.filter((p) => p.status === 'Grazing');

  return html`
    ${renderSampleBanner(c.sampleCount)}

    <section class="ag-masthead" aria-label="Farm Paddock Operations Command">
      <div class="ag-masthead__copy">
        <div class="ag-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${c.whpLocked > 0 ? '#f87171' : '#4ade80'}"></span>
          PADDOCK COMMAND · ${fmtDate(tday).toUpperCase()}
        </div>
        <h1 class="ag-masthead__title">${state.session.settings.business_name || 'Paddocks & Blocks'}</h1>
        <div class="ag-masthead__meta">
          <span><strong style="color:#fef08a">${num(totalHa, { decimals: 1 })} ha</strong> mapped across ${allPaddocks.length} paddock${allPaddocks.length === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live WHP spray locks guard every harvest</span>
        </div>
      </div>

      <div class="ag-masthead__pods ag-masthead__pods--3" style="align-items:center">
        <div class="ag-pod ag-pod--ring" title="${clearPct}% blocks harvest-clear">
          <div class="tk-ring" style="--p:${clearPct}%;--ring-color:${c.whpLocked > 0 ? '#eab308' : '#4ade80'};--ring-size:48px">
            <span class="tk-ring__val">${clearPct}%</span>
          </div>
          <div>
            <span class="ag-pod__lbl">Harvest Clear</span>
            <span class="ag-pod__val">${clearCount}/${allPaddocks.length}</span>
            <span class="ag-pod__sub">${c.whpLocked > 0 ? `${c.whpLocked} WHP locked` : 'All clear'}</span>
          </div>
        </div>

        <div class="ag-pod ag-pod--gold">
          <span class="ag-pod__lbl">${icon('paddock-grid', { size: 12 })} Area</span>
          <span class="ag-pod__val">${num(totalHa, { decimals: 1 })} ha</span>
          <span class="ag-pod__sub">${allPaddocks.filter((p) => p.status === 'In crop').length} in crop</span>
        </div>

        <a href="#/jobs" class="ag-pod">
          <span class="ag-pod__lbl">${icon('clipboard', { size: 12 })} Field Jobs</span>
          <span class="ag-pod__val">${c.openJobs || 0}</span>
          <span class="ag-pod__sub">Open runs →</span>
        </a>

        <a href="#/chemicals" class="${cls('ag-pod', { 'ag-pod--alert': c.whpLocked > 0, 'ag-pod--good': !c.whpLocked })}">
          <span class="ag-pod__lbl">${icon('spray-boom', { size: 12 })} WHP Locks</span>
          <span class="ag-pod__val">${c.whpLocked || 0}</span>
          <span class="ag-pod__sub">${c.whpLocked > 0 ? 'Active hold →' : 'None active'}</span>
        </a>

        <div class="ag-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="job-new">${icon('clipboard', { size: 14 })} Log Job</button>
          <button type="button" class="k-btn k-btn--primary" data-action="paddock-new">${icon('plus', { size: 15 })} Add Paddock</button>
        </div>
      </div>
    </section>

    <div class="ag-split">
      <div class="tk-stack" style="gap:14px">
        <div class="tk-toolbar" style="margin-bottom:0">
          <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="paddock-search" value="${state.paddockSearch || ''}" placeholder="Find paddock, crop or soil note…"></label>
          <div class="tk-segmented ag-filter-pills" role="group" aria-label="Filter paddocks">
            <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'All' })}" data-action="paddock-filter" data-filter="All">All (${allPaddocks.length})</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'In crop' })}" data-action="paddock-filter" data-filter="In crop">In Crop (${allPaddocks.filter((p) => p.status === 'In crop').length})</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'Grazing' })}" data-action="paddock-filter" data-filter="Grazing">Rest/Graze (${allPaddocks.filter((p) => p.status === 'Grazing' || p.status === 'Fallow').length})</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': filter === 'WHP' })}" data-action="paddock-filter" data-filter="WHP">WHP Locked (${allPaddocks.filter((p) => !!p.active_whp).length})</button>
          </div>
        </div>

        ${state.loading && !allPaddocks.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : paddocks.length ? html`
          <div class="ag-paddock-grid">
            ${paddocks.map((p) => {
              const locked = !!p.active_whp;
              const cardCls = locked
                ? 'paddock-card--whp'
                : p.status === 'Fallow'
                  ? 'paddock-card--fallow'
                  : p.status === 'Being prepared'
                    ? 'paddock-card--prep'
                    : p.status === 'Grazing'
                      ? 'paddock-card--grazing'
                      : '';
              const sharePct = totalHa > 0 ? Math.min(100, Math.round((Number(p.area_ha || 0) / totalHa) * 100)) : 0;
              return html`
                <article class="paddock-card ${cardCls}" data-key="pad-${p.id}">
                  <div class="paddock-card__band">
                    <div style="min-width:0">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <h2 class="tk-card__title" style="font-size:16px">${p.block_name}</h2>
                        ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="tk-card__sub" style="font-weight:650;color:var(--k-text);opacity:.8">${p.crop || 'No active crop'}</div>
                    </div>
                    <span class="paddock-area">${num(p.area_ha, { decimals: 1 })} ha</span>
                  </div>

                  <div class="paddock-card__body">
                    <div class="paddock-meta-bar">
                      <span class="tk-tag ${p.status === 'In crop' ? 'tk-tag--ok' : p.status === 'Being prepared' ? 'tk-tag--warn' : p.status === 'Grazing' ? 'tk-tag--info' : ''}">${p.status}</span>
                      <span class="tk-tag tk-tag--info">${icon('droplet', { size: 11 })} ${p.irrigation}</span>
                      ${p.open_jobs > 0 ? html`<span class="tk-tag tk-tag--accent">${p.open_jobs} job${p.open_jobs === 1 ? '' : 's'}</span>` : ''}
                    </div>

                    <div class="paddock-share">
                      <div class="paddock-share__lbl">
                        <span>Farm acreage share</span>
                        <span>${sharePct}% of ${num(totalHa, { decimals: 1 })} ha</span>
                      </div>
                      <div class="tk-bar"><div class="tk-bar__fill ${locked ? 'tk-bar__fill--bad' : p.status === 'Being prepared' ? 'tk-bar__fill--warn' : 'tk-bar__fill--ok'}" style="width:${sharePct}%"></div></div>
                    </div>

                    ${locked ? html`
                      <div class="whp-alert">
                        <span class="whp-alert__main">${icon('spray-boom', { size: 14 })} WHP: ${p.active_whp.product_used} until ${fmtDate(p.active_whp.whp_end)}</span>
                        <span class="whp-countdown">${whpRemainingLabel(p.active_whp.whp_end)}</span>
                      </div>` : ''}

                    ${p.soil_notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0;line-height:1.45">${p.soil_notes}</p>` : ''}

                    ${p.last_harvest ? html`
                      <div class="paddock-harvest-note">
                        <span>${icon('wheat-sheaf', { size: 13 })} Last yield: <strong>${num(p.last_harvest.quantity, { decimals: 1 })} ${p.last_harvest.unit}</strong></span>
                        <span class="tk-muted">${fmtDate(p.last_harvest.harvest_date)}</span>
                      </div>` : ''}

                    <div class="tk-btn-row" style="padding-top:8px;border-top:1px solid var(--k-border)">
                      <button type="button" class="k-btn k-btn--sm" data-action="paddock-edit" data-id="${p.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="paddock-del" data-id="${p.id}">Delete</button>
                    </div>
                  </div>
                </article>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'leaf', title: filter === 'All' ? 'No paddocks added yet' : 'No paddocks match this filter', text: 'Map out your farm blocks, crops, irrigation and soil notes to begin.' })}</section>`}
      </div>

      <aside class="ag-rail-panel" aria-label="Field Tasks, Weather & Spray Locks, and Shed Pulse">
        <section class="ag-rail-card">
          <div class="ag-rail-card__head">
            <span class="ag-rail-card__title">${icon('clipboard', { size: 14 })} Field Tasks Queue</span>
            <a href="#/jobs" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${(state.jobs || []).length})</a>
          </div>
          ${openJobs.length ? html`
            <div class="ag-rail-list">
              ${openJobs.slice(0, 4).map((j) => html`
                <div class="ag-rail-item ${j.status === 'In progress' ? 'ag-rail-item--progress' : 'ag-rail-item--planned'}" data-key="rjob-${j.id}">
                  <div class="ag-rail-item__top">
                    <div style="min-width:0">
                      <div style="font-size:13.5px;font-weight:750;color:var(--k-text)">${j.job_type}${j.block_name ? ` · ${j.block_name}` : ''}</div>
                      <div class="tk-muted" style="font-size:11.5px">${fmtDate(j.scheduled_date)}${j.assigned_to ? ` · ${j.assigned_to}` : ''}</div>
                    </div>
                    <span class="tk-tag ${j.status === 'In progress' ? 'tk-tag--info' : j.status === 'Rained off' ? 'tk-tag--warn' : ''}">${j.status}</span>
                  </div>
                  ${j.notes ? html`<div class="tk-muted" style="font-size:12px">${j.notes}</div>` : ''}
                  <div class="ag-rail-item__foot">
                    ${j.status === 'Planned' ? html`<button type="button" class="k-btn k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="In progress">Start</button>` : html`<span></span>`}
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="Done">${icon('check', { size: 13 })} Done</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All scheduled paddock jobs completed ✓</div>`}
        </section>

        <section class="ag-rail-card">
          <div class="ag-rail-card__head">
            <span class="ag-rail-card__title">${icon('spray-boom', { size: 14 })} Spray &amp; Weather Log</span>
            <a href="#/chemicals" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Register</a>
          </div>
          ${recentSprays.length ? html`
            <div class="ag-rail-list">
              ${recentSprays.map((ch) => {
                const active = ch.whp_end && ch.whp_end >= tday;
                return html`
                  <div class="ag-rail-item ${active ? 'ag-rail-item--whp' : ''}" data-key="rchem-${ch.id}">
                    <div class="ag-rail-item__top">
                      <div style="min-width:0">
                        <div style="font-size:13px;font-weight:750">${ch.product_used}</div>
                        <div class="tk-muted" style="font-size:11.5px">${ch.block_name || 'General'} · ${fmtDate(ch.application_date)}</div>
                      </div>
                      ${active
                        ? html`<span class="whp-countdown">${whpRemainingLabel(ch.whp_end)}</span>`
                        : html`<span class="tk-tag tk-tag--ok">Clear</span>`}
                    </div>
                    ${ch.weather ? html`<div><span class="ag-weather-chip">${icon('sun', { size: 11 })} ${ch.weather}</span></div>` : ''}
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No chemical applications logged yet.</div>`}
        </section>

        <section class="ag-rail-card">
          <div class="ag-rail-card__head">
            <span class="ag-rail-card__title">${icon('tractor', { size: 14 })} Shed &amp; Grazing Pulse</span>
            <a href="#/machinery" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Shed</a>
          </div>
          <div class="ag-rail-list">
            ${dueMachines.length ? dueMachines.slice(0, 3).map((m) => html`
              <div class="ag-rail-item ag-rail-item--warn">
                <div class="ag-rail-item__top">
                  <div>
                    <div style="font-size:13px;font-weight:750">${m.machine_name}</div>
                    <div class="tk-muted" style="font-size:11.5px">${num(m.hours)} hrs${m.service_due ? ` · Due ${fmtDate(m.service_due)}` : ''}</div>
                  </div>
                  <span class="tk-tag tk-tag--bad">Service</span>
                </div>
              </div>`) : html`<div class="ag-rail-item"><div style="font-size:12.5px;color:var(--k-muted)">All shed machinery running within service intervals ✓</div></div>`}
            <div class="ag-rail-item">
              <div style="display:flex;justify-content:space-between;font-size:12.5px">
                <span class="tk-muted">Livestock / Grazing blocks</span>
                <strong>${grazingBlocks.length} block${grazingBlocks.length === 1 ? '' : 's'} (${num(grazingBlocks.reduce((s, p) => s + Number(p.area_ha || 0), 0), { decimals: 1 })} ha)</strong>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>`;
}

export function renderJobsView(state) {
  const allJobs = state.jobs || [];
  const openCount = allJobs.filter((j) => j.status !== 'Done').length;
  const activeCount = allJobs.filter((j) => j.status === 'In progress').length;
  const doneCount = allJobs.filter((j) => j.status === 'Done').length;
  const rainedCount = allJobs.filter((j) => j.status === 'Rained off').length;
  const pct = allJobs.length ? Math.round((doneCount / allJobs.length) * 100) : 0;

  const rows = allJobs.filter((j) => {
    if (state.jobFilter === 'Open' && j.status === 'Done') return false;
    if (state.jobTypeFilter && state.jobTypeFilter !== 'All' && j.job_type !== state.jobTypeFilter) return false;
    return true;
  });

  return html`
    <section class="ag-masthead" aria-label="Farm Field Jobs">
      <div class="ag-masthead__copy">
        <div class="ag-masthead__eyebrow">
          ${icon('clipboard', { size: 12 })} FIELD OPERATIONS &amp; PADDOCK RUNS
        </div>
        <h1 class="ag-masthead__title">Farm Jobs</h1>
        <div class="ag-masthead__meta">
          <span>Planting, spraying, irrigation, fertiliser &amp; harvest runs</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click Start, Done or Rained Off sign-off</span>
        </div>
      </div>

      <div class="ag-masthead__pods ag-masthead__pods--3" style="align-items:center">
        <div class="ag-pod ag-pod--ring">
          <div class="tk-ring" style="--p:${pct}%;--ring-color:${pct === 100 ? '#4ade80' : '#eab308'};--ring-size:48px">
            <span class="tk-ring__val">${pct}%</span>
          </div>
          <div>
            <span class="ag-pod__lbl">Completion</span>
            <span class="ag-pod__val">${doneCount}/${allJobs.length}</span>
            <span class="ag-pod__sub">Jobs done</span>
          </div>
        </div>
        <div class="ag-pod ag-pod--gold">
          <span class="ag-pod__lbl">Open</span>
          <span class="ag-pod__val">${openCount}</span>
          <span class="ag-pod__sub">${activeCount} in progress</span>
        </div>
        <div class="ag-pod">
          <span class="ag-pod__lbl">Rained Off</span>
          <span class="ag-pod__val">${rainedCount}</span>
          <span class="ag-pod__sub">Weather hold</span>
        </div>
        <div class="ag-pod ag-pod--good">
          <span class="ag-pod__lbl">Completed</span>
          <span class="ag-pod__val">${doneCount}</span>
          <span class="ag-pod__sub">Signed off</span>
        </div>
        <div class="ag-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="job-new">${icon('plus', { size: 15 })} Schedule Job</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter jobs by status">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.jobFilter === 'Open' })}" data-action="job-filter" data-filter="Open">Open (${openCount})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.jobFilter === 'All' })}" data-action="job-filter" data-filter="All">All (${allJobs.length})</button>
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Filter jobs by type">
        ${['All', ...JOB_TYPES].map((t) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': (state.jobTypeFilter || 'All') === t })}" data-action="job-type-filter" data-type="${t}">${t}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !allJobs.length ? html`<div class="tk-sheet__body">${skeleton(3)}</div>` : rows.length ? rows.map((j) => {
        const rowMod = j.status === 'Done' ? 'ag-job-row--done' : j.status === 'Rained off' ? 'ag-job-row--rained' : j.status === 'Planned' ? 'ag-job-row--planned' : '';
        return html`
          <div class="tk-row ag-job-row ${rowMod}" data-key="job-${j.id}">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${j.job_type}</span>
                ${j.block_name ? html`<span class="tk-tag tk-tag--accent">${j.block_name}</span>` : ''}
                <span class="tk-tag ${j.status === 'Done' ? 'tk-tag--ok' : j.status === 'In progress' ? 'tk-tag--info' : j.status === 'Rained off' ? 'tk-tag--warn' : ''}">${j.status}</span>
                ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                <span>${icon('calendar', { size: 12 })} Scheduled: <strong>${fmtDate(j.scheduled_date)}</strong></span>
                ${j.assigned_to ? html`<span>${icon('user', { size: 12 })} ${j.assigned_to}</span>` : ''}
                ${j.completed_date ? html`<span>Completed: ${fmtDate(j.completed_date)}</span>` : ''}
              </div>
              ${j.notes ? html`<p class="tk-muted" style="font-size:13px;margin:2px 0 0">${j.notes}</p>` : ''}
            </div>
            <div class="tk-row__aside">
              ${j.status === 'Planned' ? html`<button type="button" class="k-btn k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="In progress">Start</button>` : ''}
              ${j.status !== 'Done' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="Done">${icon('check', { size: 14 })} Mark Done</button>` : ''}
              ${j.status !== 'Done' && j.status !== 'Rained off' ? html`<button type="button" class="k-btn k-btn--sm" data-action="job-status" data-id="${j.id}" data-status="Rained off">Rained Off</button>` : ''}
            </div>
          </div>`;
      }) : emptyState({ iconName: 'clipboard', title: 'No jobs in this view', text: 'Schedule your next paddock run.' })}
    </section>`;
}

export function wirePaddockJobActions(root, state, { draw, loadScreen }) {
  const paddockFields = (p = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Block name</span><input class="k-input" name="block_name" value="${p.block_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Current crop</span><input class="k-input" name="crop" value="${p.crop || ''}" placeholder="e.g. Shiraz Grapes"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Area (ha)</span><input class="k-input" type="number" step="0.1" min="0" name="area_ha" value="${p.area_ha ?? ''}"></label>
      <label class="k-field"><span class="k-field__label">Irrigation</span><select class="k-input" name="irrigation">${IRRIGATIONS.map((x) => html`<option value="${x}" ${x === p.irrigation ? 'selected' : ''}>${x}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${P_STATUSES.map((x) => html`<option value="${x}" ${x === (p.status || 'In crop') ? 'selected' : ''}>${x}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Soil notes</span><textarea class="k-input" name="soil_notes" rows="2">${p.soil_notes || ''}</textarea></label>`;

  on(root, 'input', '[data-action="paddock-search"]', (e, el) => { state.paddockSearch = el.value; draw(); });
  on(root, 'click', '[data-action="paddock-filter"]', (e, el) => { state.paddockFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="paddock-new"]', async () => {
    const made = await formDialog({ title: 'New Paddock / Block', submitLabel: 'Save paddock', fields: paddockFields(), onSubmit: (v) => api.post('/api/paddocks', v) });
    if (made) { toast.success('Paddock added.'); await loadScreen('/'); }
  });
  on(root, 'click', '[data-action="paddock-edit"]', async (e, el) => {
    const p = state.paddocks.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({ title: `Edit ${p.block_name}`, submitLabel: 'Save', fields: paddockFields(p), onSubmit: (v) => api.put('/api/paddocks', { ...v, id: p.id }) });
    if (saved) { toast.success('Paddock updated.'); await loadScreen('/'); }
  });
  on(root, 'click', '[data-action="paddock-del"]', async (e, el) => {
    if (!(await confirmDialog({ title: 'Delete paddock?', message: 'Remove this paddock block?', confirmLabel: 'Delete', danger: true }))) return;
    try { await api.delete('/api/paddocks', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/'); } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="job-filter"]', (e, el) => { state.jobFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="job-type-filter"]', (e, el) => { state.jobTypeFilter = el.dataset.type; draw(); });
  on(root, 'click', '[data-action="job-new"]', async () => {
    const made = await formDialog({
      title: 'Schedule Farm Job',
      submitLabel: 'Save job',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Paddock</span><select class="k-input" name="paddock_id"><option value="">General farm</option>${state.paddocks.map((p) => html`<option value="${p.id}">${p.block_name} (${p.crop || p.status})</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Job type</span><select class="k-input" name="job_type">${JOB_TYPES.map((x) => html`<option value="${x}">${x}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Scheduled date</span><input class="k-input" type="date" name="scheduled_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Assigned to</span><input class="k-input" name="assigned_to" placeholder="Operator name"></label>
          <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${JOB_STATUSES.map((x) => html`<option value="${x}">${x}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/jobs', v),
    });
    if (made) { toast.success('Farm job scheduled.'); await loadScreen(state.route || '/jobs'); }
  });
  on(root, 'click', '[data-action="job-status"]', async (e, el) => {
    try { await api.post('/api/jobs/status', { id: Number(el.dataset.id), status: el.dataset.status, today: today() }); toast.success(`Job marked ${el.dataset.status}.`); await loadScreen(state.route || '/jobs'); }
    catch (err) { toastError(err); }
  });
}
