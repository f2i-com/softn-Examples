// SitePulse Projects Command (Two-Column Site Command + Safety/Defects Rail) & Interactive Daily Site Diary
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay, fmtDateTime, daysBetween, isDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const PROJ_STATUSES = ['Planning', 'Active', 'On Hold', 'Practical Completion', 'Closed'];
export const WEATHERS = ['Sunny', 'Cloudy', 'Rain', 'Windy', 'Storm'];
const SAFETY_CHECKS = ['Toolbox Talk', 'SWMS Signed', 'PPE Checked', 'Site Clean'];
const NEXT_DEFECT = { Open: 'In Progress', 'In Progress': 'Rectified', Rectified: 'Verified' };

const WEATHER_META = {
  sunny: { label: 'Sunny', iconName: 'sun', cls: 'weather-chip--sunny' },
  fine: { label: 'Sunny', iconName: 'sun', cls: 'weather-chip--sunny' },
  cloudy: { label: 'Cloudy', iconName: 'cloud', cls: 'weather-chip--cloudy' },
  overcast: { label: 'Cloudy', iconName: 'cloud', cls: 'weather-chip--cloudy' },
  rain: { label: 'Rain', iconName: 'droplet', cls: 'weather-chip--rain' },
  windy: { label: 'Windy', iconName: 'wind', cls: 'weather-chip--windy' },
  wind: { label: 'Windy', iconName: 'wind', cls: 'weather-chip--windy' },
  storm: { label: 'Storm', iconName: 'zap', cls: 'weather-chip--storm' },
  heat: { label: 'Heat', iconName: 'flame', cls: 'weather-chip--heat' },
};

export function renderWeatherPill(weather) {
  const key = String(weather || 'Sunny').trim().toLowerCase();
  const meta = WEATHER_META[key] || WEATHER_META.sunny;
  return html`
    <span class="weather-chip ${meta.cls}">
      <span class="weather-chip__icon">${icon(meta.iconName, { size: 12 })}</span>
      <span>${meta.label}</span>
    </span>`;
}

function projCardMod(s) {
  if (s === 'Active') return 'proj-card--active';
  if (s === 'On Hold') return 'proj-card--hold';
  if (s === 'Practical Completion' || s === 'Closed') return 'proj-card--complete';
  return 'proj-card--planning';
}

function projectHealth(p) {
  const snags = Number(p.open_defects || 0);
  const pendingVars = Number(p.pending_vars || 0);
  if (p.status === 'On Hold') return { label: 'On Hold', cls: 'proj-health-pill--warn', iconName: 'clock' };
  if (snags >= 2) return { label: `${snags} Snags Open`, cls: 'proj-health-pill--alert', iconName: 'alert' };
  if (snags > 0 || pendingVars > 0) return { label: 'Needs Attention', cls: 'proj-health-pill--warn', iconName: 'alert' };
  return { label: 'On Track', cls: 'proj-health-pill--ok', iconName: 'check-circle' };
}

export function renderCommandView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const rows = state.projFilter === 'All'
    ? state.projects
    : state.projects.filter((p) => p.status === state.projFilter);

  const openSnags = Number(counts.openDefects || 0);
  const headcountToday = Number(counts.headcountToday || 0);
  const insAlerts = Number(counts.insuranceAlerts || 0);

  // Compliance percentage from preloaded subcontractors
  const totalSubs = state.subcontractors.length;
  const compliantSubs = state.subcontractors.filter((s) => s.insurance_state === 'valid').length;
  const compliancePct = totalSubs ? Math.round((compliantSubs / totalSubs) * 100) : 100;
  const ringColor = compliancePct >= 85 ? '#22c55e' : compliancePct >= 60 ? '#f59e0b' : '#ef4444';

  const todayDiaries = (state.diaries || []).filter((d) => d.diary_date === todayStr);
  const unsignedDiaries = (state.diaries || []).filter((d) => !d.signed_by);
  const openDefectList = (state.defects || []).filter((d) => d.status === 'Open' || d.status === 'In Progress');
  const alertSubs = (state.subcontractors || []).filter((s) => s.insurance_state === 'expired' || s.insurance_state === 'expiring_soon');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="sp-masthead" aria-label="Site Command Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${insAlerts > 0 || openSnags > 0 ? '#f59e0b' : '#22c55e'}"></span>
          SITE COMMAND · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="sp-masthead__title">Site Diary &amp; Builds</h1>
        <div class="sp-masthead__meta">
          <span><strong style="color:#fde68a">${counts.activeProjects || 0} active build${counts.activeProjects === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${todayDiaries.length} diary log${todayDiaries.length === 1 ? '' : 's'} today</span>
        </div>
      </div>

      <div class="sp-masthead__pods sp-masthead__pods--ring3" style="align-items:center">
        <a href="#/subbies" class="sp-pod sp-pod--ring">
          <div class="tk-ring" style="--p:${compliancePct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${compliancePct}%</span>
          </div>
          <div>
            <span class="sp-pod__lbl">Compliance</span>
            <div class="sp-pod__val" style="font-size:15px">${compliantSubs}/${totalSubs || 0} Valid</div>
            <div class="sp-pod__sub">${insAlerts > 0 ? `${insAlerts} alert${insAlerts === 1 ? '' : 's'} →` : 'All current'}</div>
          </div>
        </a>

        <a href="#/diary" class="sp-pod sp-pod--navy">
          <span class="sp-pod__lbl">${icon('users', { size: 11 })} Crew Today</span>
          <span class="sp-pod__val">${headcountToday}</span>
          <span class="sp-pod__sub">On site →</span>
        </a>

        <a href="#/defects" class="${cls('sp-pod', openSnags > 0 ? 'sp-pod--alert' : 'sp-pod--ok')}">
          <span class="sp-pod__lbl">${icon('snag-cone', { size: 11 })} Snags</span>
          <span class="sp-pod__val">${openSnags}</span>
          <span class="sp-pod__sub">${openSnags > 0 ? 'Open →' : 'Zero open'}</span>
        </a>

        <a href="#/variations" class="sp-pod sp-pod--hivis">
          <span class="sp-pod__lbl">${icon('file', { size: 11 })} Pending Var</span>
          <span class="sp-pod__val">${money(counts.pendingVariationCents || 0, { currency })}</span>
          <span class="sp-pod__sub">${counts.pendingVariations || 0} awaiting →</span>
        </a>

        <div class="sp-masthead__cta">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="proj-new">${icon('plus', { size: 14 })} Project</button>
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diary-new">${icon('plus', { size: 14 })} Log Diary</button>
        </div>
      </div>
    </section>

    <div class="sp-split">
      <div class="tk-stack" style="gap:14px">
        ${todayDiaries.length ? html`
          <section class="tk-sheet sp-pulse-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('clipboard', { size: 17 })} Today's Site Weather &amp; Crew Pulse</h2>
              <span class="tk-sheet__count">${todayDiaries.length} log${todayDiaries.length === 1 ? '' : 's'} · ${headcountToday} crew</span>
              <div class="tk-sheet__actions">
                <a href="#/diary" class="k-btn k-btn--sm">All Diaries</a>
              </div>
            </div>
            <div>
              ${todayDiaries.map((d) => html`
                <div class="tk-row" data-key="td-${d.id}">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <strong>${d.project_name}</strong>
                      ${renderWeatherPill(d.weather)}
                      <span class="crew-badge">${icon('users', { size: 12 })} ${d.workers_on_site} crew</span>
                      ${d.signed_by ? html`<span class="tk-tag tk-tag--ok">Signed ✓</span>` : html`<span class="tk-tag tk-tag--warn">Unsigned</span>`}
                    </div>
                    <div class="sp-pulse-desc">${d.work_completed}</div>
                    ${d.delays ? html`<div class="delay-callout" style="padding:7px 10px;font-size:12.5px"><strong>Delay:</strong> ${d.delays}</div>` : ''}
                  </div>
                  <div class="tk-row__aside">
                    ${!d.signed_by ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diary-sign" data-id="${d.id}">${icon('check', { size: 13 })} Sign Off</button>` : ''}
                    <button type="button" class="k-btn k-btn--sm" data-action="print-diary" data-id="${d.id}">${icon('printer', { size: 13 })} Sheet</button>
                  </div>
                </div>`)}
            </div>
          </section>` : ''}

        <div class="tk-toolbar" style="margin-bottom:0">
          <div class="tk-segmented" role="group" aria-label="Filter projects by status">
            ${['All', ...PROJ_STATUSES].map((st) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.projFilter === st })}" data-action="proj-filter" data-status="${st}">
                ${st} <span style="opacity:.65;font-size:11px;margin-left:2px">${st === 'All' ? state.projects.length : state.projects.filter((x) => x.status === st).length}</span>
              </button>`)}
          </div>
        </div>

        ${state.loading && !state.projects.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
          <div class="sp-proj-grid">
            ${rows.map((p) => {
              const health = projectHealth(p);
              const daysLeft = isDay(p.target_completion) ? daysBetween(todayStr, p.target_completion) : null;
              return html`
                <article class="proj-card ${projCardMod(p.status)}" data-key="proj-${p.id}">
                  <div class="proj-card__band">
                    <div class="proj-card__band-top">
                      <div>
                        <h3 class="proj-card__title">${p.project_name}</h3>
                        <div class="proj-card__client">${p.client || 'Direct Client'}</div>
                      </div>
                      <span class="proj-card__status-tag">${p.status}</span>
                    </div>
                    ${p.site_address ? html`<div class="proj-card__band-addr">${icon('pin', { size: 12 })} ${p.site_address}</div>` : ''}
                  </div>
                  <div class="proj-card__body">
                    <div class="proj-health-row">
                      <span class="proj-health-pill ${health.cls}">${icon(health.iconName, { size: 12 })} ${health.label}</span>
                      <div class="tk-btn-row" style="gap:5px">
                        ${daysLeft !== null && p.status !== 'Closed' ? html`
                          <span class="tk-tag ${daysLeft < 0 ? 'tk-tag--bad' : daysLeft <= 14 ? 'tk-tag--warn' : 'tk-tag--info'}">
                            ${daysLeft < 0 ? `${Math.abs(daysLeft)}d past target` : daysLeft === 0 ? 'Due today' : `${daysLeft}d to handover`}
                          </span>` : ''}
                        ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                    </div>
                    <div class="proj-stats">
                      <div class="proj-stat proj-stat--steel">
                        <span class="proj-stat__l">Headcount Today</span>
                        <span class="proj-stat__v">${p.headcount_today || 0} crew</span>
                      </div>
                      <div class="proj-stat">
                        <span class="proj-stat__l">Site Diaries</span>
                        <span class="proj-stat__v">${p.diary_count || 0} log${Number(p.diary_count) === 1 ? '' : 's'}</span>
                      </div>
                      <div class="${cls('proj-stat', Number(p.open_defects) > 0 ? 'proj-stat--alert' : 'proj-stat--good')}">
                        <span class="proj-stat__l">Open Snags</span>
                        <span class="proj-stat__v">${p.open_defects || 0}</span>
                      </div>
                      <div class="proj-stat proj-stat--good">
                        <span class="proj-stat__l">Approved Vars</span>
                        <span class="proj-stat__v">${money(p.approved_var_cents || 0, { currency })}</span>
                      </div>
                    </div>
                    <div class="tk-row__meta" style="font-size:12.5px">
                      ${p.project_manager ? html`<span>PM: <strong>${p.project_manager}</strong></span>` : ''}
                      ${p.target_completion ? html`<span>Target: ${fmtDay(p.target_completion)}</span>` : ''}
                      ${p.pending_vars > 0 ? html`<span class="tk-tag tk-tag--warn">${p.pending_vars} pending var</span>` : ''}
                    </div>
                    ${p.notes ? html`<div class="tk-muted" style="font-size:13px">${p.notes}</div>` : ''}
                  </div>
                  <div class="proj-card__foot">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diary-new-for" data-id="${p.id}">Log Today's Diary</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="proj-edit" data-id="${p.id}">Edit</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="proj-del" data-id="${p.id}">Del</button>
                  </div>
                </article>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'site-crane', title: 'No construction projects yet', text: 'Create a project to link daily site diaries, defects, variations and deliveries.' })}</section>`}
      </div>

      <aside class="sp-rail-panel" aria-label="Safety Compliance and Open Defects Rail">
        <section class="sp-rail-card">
          <div class="sp-rail-card__head">
            <span class="sp-rail-card__title">${icon('safety-vest', { size: 14 })} Safety &amp; Insurance Watch</span>
            <a href="#/subbies" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Subbies</a>
          </div>
          ${alertSubs.length ? html`
            <div class="sp-rail-list">
              ${alertSubs.slice(0, 4).map((sub) => {
                const isExp = sub.insurance_state === 'expired';
                return html`
                  <div class="sp-rail-item" data-key="rail-sub-${sub.id}">
                    <div class="sp-rail-item__top">
                      <div>
                        <div class="sp-rail-item__name">${sub.business_name}</div>
                        <div class="sp-rail-item__sub">${sub.trade}${sub.contact ? ' · ' + sub.contact : ''}</div>
                      </div>
                      <span class="ins-badge ${isExp ? 'ins-badge--expired' : 'ins-badge--expiring'}" style="padding:2px 8px;font-size:11px">
                        <span class="ins-badge__light"></span>
                        ${isExp ? 'Expired' : `${sub.days_to_expiry}d left`}
                      </span>
                    </div>
                    <div class="sp-rail-item__foot">
                      <span style="font-size:11.5px;color:var(--k-muted)">${isExp ? 'HOLD SITE ENTRY' : `Expires ${fmtDay(sub.insurance_expiry)}`}</span>
                      ${sub.phone ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-val" data-label="Subbie phone" data-val="${sub.phone}">${icon('phone', { size: 12 })} Copy #</button>` : ''}
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All registered subcontractors hold valid insurance ✓</div>`}
        </section>

        <section class="sp-rail-card">
          <div class="sp-rail-card__head">
            <span class="sp-rail-card__title">${icon('snag-cone', { size: 14 })} Open Defects Queue</span>
            <a href="#/defects" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.defects.length})</a>
          </div>
          ${openDefectList.length ? html`
            <div class="sp-rail-list">
              ${openDefectList.slice(0, 4).map((d) => html`
                <div class="sp-rail-item" data-key="rail-def-${d.id}">
                  <div class="sp-rail-item__top">
                    <div style="min-width:0">
                      <div class="sp-rail-item__name">${d.issue_title}</div>
                      <div class="sp-rail-item__sub">${d.defect_code} · ${d.project_name}</div>
                    </div>
                    <span class="tk-tag ${d.priority === 'Critical' ? 'tk-tag--bad' : d.priority === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${d.priority}</span>
                  </div>
                  <div class="sp-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${d.assigned_to || 'Unassigned'}</span>
                    ${NEXT_DEFECT[d.status] ? html`
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="def-status" data-id="${d.id}" data-status="${NEXT_DEFECT[d.status]}">${NEXT_DEFECT[d.status]}</button>` : ''}
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Zero open site defects or snags ✓</div>`}
        </section>

        <section class="sp-rail-card">
          <div class="sp-rail-card__head">
            <span class="sp-rail-card__title">${icon('clipboard', { size: 14 })} Unsigned Diaries</span>
            <a href="#/diary" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Diary</a>
          </div>
          ${unsignedDiaries.length ? html`
            <div class="sp-rail-list">
              ${unsignedDiaries.slice(0, 3).map((d) => html`
                <div class="sp-rail-item" data-key="rail-unsig-${d.id}">
                  <div class="sp-rail-item__top">
                    <div>
                      <div class="sp-rail-item__name">${d.project_name}</div>
                      <div class="sp-rail-item__sub">${fmtDay(d.diary_date)} · ${d.workers_on_site} crew</div>
                    </div>
                    ${renderWeatherPill(d.weather)}
                  </div>
                  <div class="sp-rail-item__foot">
                    <span class="tk-tag tk-tag--warn">Sign-off pending</span>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diary-sign" data-id="${d.id}">Sign Off ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All daily site diaries are signed off ✓</div>`}
        </section>
      </aside>
    </div>`;
}

export function renderDiaryView(state) {
  const rows = state.diaries.filter((d) => {
    if (state.diaryProj !== 'All' && String(d.project_id) !== String(state.diaryProj)) return false;
    if (state.diaryDateFilter && d.diary_date !== state.diaryDateFilter) return false;
    return true;
  });

  const signedCount = state.diaries.filter((d) => Boolean(d.signed_by)).length;
  const signedPct = state.diaries.length ? Math.round((signedCount / state.diaries.length) * 100) : 100;
  const delayCount = state.diaries.filter((d) => Boolean(d.delays)).length;
  const totalCrew = rows.reduce((s, d) => s + Number(d.workers_on_site || 0), 0);

  return html`
    <section class="sp-masthead" aria-label="Daily Site Diary Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">DEFENSIBLE DAILY SITE RECORD</div>
        <h1 class="sp-masthead__title">Daily Site Diary</h1>
        <div class="sp-masthead__meta">
          <span>Weather, crew &amp; delays</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Pre-start safety chips</span>
        </div>
      </div>

      <div class="sp-masthead__pods sp-masthead__pods--ring3" style="align-items:center">
        <div class="sp-pod sp-pod--ring">
          <div class="tk-ring" style="--p:${signedPct}%;--ring-color:#22c55e;--ring-size:48px">
            <span class="tk-ring__val">${signedPct}%</span>
          </div>
          <div>
            <span class="sp-pod__lbl">Signed Off</span>
            <div class="sp-pod__val" style="font-size:15px">${signedCount}/${state.diaries.length} Logs</div>
            <div class="sp-pod__sub">Supervisor verified</div>
          </div>
        </div>
        <div class="sp-pod sp-pod--navy">
          <span class="sp-pod__lbl">${icon('users', { size: 11 })} Crew Logged</span>
          <span class="sp-pod__val">${totalCrew}</span>
          <span class="sp-pod__sub">Worker-days</span>
        </div>
        <div class="${cls('sp-pod', { 'sp-pod--hivis': delayCount > 0 })}">
          <span class="sp-pod__lbl">${icon('clock', { size: 11 })} Delays</span>
          <span class="sp-pod__val">${delayCount}</span>
          <span class="sp-pod__sub">Recorded holds</span>
        </div>
        <div class="sp-pod">
          <span class="sp-pod__lbl">${icon('site-crane', { size: 11 })} Projects</span>
          <span class="sp-pod__val">${state.projects.length}</span>
          <span class="sp-pod__sub">Tracked sites</span>
        </div>
        <div class="sp-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="diary-new">${icon('plus', { size: 16 })} Log Daily Diary</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <select class="k-input" style="width:auto;min-width:210px" data-action="diary-proj-filter">
        <option value="All">All Projects</option>
        ${state.projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(state.diaryProj) ? 'selected' : ''}>${p.project_name}</option>`)}
      </select>
      <input class="k-input" style="width:auto" type="date" value="${state.diaryDateFilter}" data-action="diary-date-filter" aria-label="Filter by date">
      ${state.diaryDateFilter ? html`<button type="button" class="k-btn k-btn--sm" data-action="diary-date-clear">All Dates</button>` : ''}
    </div>

    ${state.loading && !state.diaries.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((d) => html`
          <section class="${cls('tk-sheet', d.signed_by ? 'diary-sheet--signed' : 'diary-sheet--unsigned')}" data-key="diary-${d.id}">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('clipboard', { size: 17 })} ${fmtDay(d.diary_date, { weekday: 'short' })} — ${d.project_name || 'Project'}</h2>
              ${renderWeatherPill(d.weather)}
              <span class="crew-badge">${icon('users', { size: 13 })} ${d.workers_on_site} crew</span>
              ${d.signed_by ? html`<span class="tk-tag tk-tag--ok">${icon('check', { size: 12 })} Signed: ${d.signed_by}</span>` : html`<span class="tk-tag tk-tag--warn">Unsigned</span>`}
              ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              <div class="tk-sheet__actions">
                ${!d.signed_by ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="diary-sign" data-id="${d.id}">${icon('check', { size: 14 })} Sign Off</button>` : ''}
                <button type="button" class="k-btn k-btn--sm" data-action="print-diary" data-id="${d.id}">${icon('printer', { size: 14 })} Diary Sheet</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="diary-edit" data-id="${d.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="diary-del" data-id="${d.id}">Del</button>
              </div>
            </div>
            <div class="tk-sheet__body tk-stack" style="gap:10px">
              <div><strong>Work Completed:</strong> ${d.work_completed}</div>
              ${d.delays ? html`<div class="delay-callout"><strong>Delays / Disruptions:</strong> ${d.delays}</div>` : ''}
              <div class="sp-check-row" aria-label="Pre-start safety checklist">
                ${SAFETY_CHECKS.map((chk) => {
                  const key = `${d.id}:${chk}`;
                  const done = Boolean(d.signed_by) || Boolean(state.diaryChecks[key]);
                  return html`
                    <button type="button" class="${cls('sp-check-chip', { 'sp-check-chip--done': done })}" data-action="diary-check" data-key="${key}">
                      ${icon(done ? 'check' : 'safety-vest', { size: 12 })} ${chk}
                    </button>`;
                })}
              </div>
              <div class="tk-row__meta">
                ${d.visitors ? html`<span><strong>Visitors:</strong> ${d.visitors}</span>` : ''}
                ${d.signed_by && d.signed_at ? html`<span>Signed by ${d.signed_by} (${fmtDateTime(d.signed_at)})</span>` : ''}
              </div>
            </div>
          </section>`) : emptyState({ iconName: 'clipboard', title: 'No site diary entries match', text: 'Log weather, headcount, work completed and delays for your active projects.' })}
      </div>`}`;
}

export function wireCommandActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="proj-filter"]', (e, el) => { state.projFilter = el.dataset.status; draw(); });
  on(root, 'change', '[data-action="diary-proj-filter"]', (e, el) => { state.diaryProj = el.value; draw(); });
  on(root, 'change', '[data-action="diary-date-filter"]', (e, el) => { state.diaryDateFilter = el.value; draw(); });
  on(root, 'click', '[data-action="diary-date-clear"]', () => { state.diaryDateFilter = ''; draw(); });
  on(root, 'click', '[data-action="diary-check"]', (e, el) => {
    const k = el.dataset.key;
    state.diaryChecks[k] = !state.diaryChecks[k];
    draw();
  });
  on(root, 'click', '[data-action="copy-val"]', (e, el) => copyText(el.dataset.val, { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Copied'}.` }));

  const projFields = (p = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Project Name</span><input class="k-input" name="project_name" value="${p.project_name || ''}" placeholder="e.g. 14 Harbour St Townhouses" required></label>
      <label class="k-field"><span class="k-field__label">Client / Head Contractor</span><input class="k-input" name="client" value="${p.client || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Site Address</span><input class="k-input" name="site_address" value="${p.site_address || ''}"></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Start Date</span><input class="k-input" type="date" name="start_date" value="${p.start_date || today()}"></label>
      <label class="k-field"><span class="k-field__label">Target Completion</span><input class="k-input" type="date" name="target_completion" value="${p.target_completion || ''}"></label>
      <label class="k-field"><span class="k-field__label">Project Manager</span><input class="k-input" name="project_manager" value="${p.project_manager || state.session.me?.displayName || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${PROJ_STATUSES.map((s) => html`<option value="${s}" ${s === (p.status || 'Active') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Site Notes &amp; Hold Points</span><textarea class="k-input" name="notes" rows="2">${p.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="proj-new"]', async () => {
    const made = await formDialog({ title: 'New Construction Project', submitLabel: 'Create Project', size: 'lg', fields: projFields(), onSubmit: (v) => api.post('/api/projects', v) });
    if (made) { toast.success('Project created.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="proj-edit"]', async (e, el) => {
    const p = state.projects.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({ title: `Edit ${p.project_name}`, submitLabel: 'Save', size: 'lg', fields: projFields(p), onSubmit: (v) => api.put('/api/projects', { ...v, id: p.id }) });
    if (saved) { toast.success('Project updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="proj-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete project?', message: 'Deletes this project and its diaries, defects, variations and deliveries.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/projects', { id: Number(el.dataset.id) }); toast.success('Project deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  const diaryFields = (projects, d = {}, defaultProjId = '') => {
    const chosen = d.project_id || defaultProjId || (projects[0] ? projects[0].id : '');
    const curWeather = d.weather || 'Sunny';
    const weatherOpts = WEATHERS.includes(curWeather) ? WEATHERS : [curWeather, ...WEATHERS];
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Project</span>
          <select class="k-input" name="project_id" required>
            ${projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(chosen) ? 'selected' : ''}>${p.project_name}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="diary_date" value="${d.diary_date || today()}" required></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Weather</span>
          <select class="k-input" name="weather">${weatherOpts.map((w) => html`<option value="${w}" ${w === curWeather ? 'selected' : ''}>${w}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Workers on Site</span><input class="k-input" type="number" min="0" name="workers_on_site" value="${d.workers_on_site ?? 6}" required></label>
        <label class="k-field"><span class="k-field__label">Signed By <span class="k-field__optional">optional</span></span><input class="k-input" name="signed_by" value="${d.signed_by || ''}" placeholder="${state.session.me?.displayName || 'Supervisor'}"></label>
      </div>
      <label class="k-field"><span class="k-field__label">Work Completed Today</span><textarea class="k-input" name="work_completed" rows="3" placeholder="Framing, rough-in, concrete pour, fit-off…" required>${d.work_completed || ''}</textarea></label>
      <label class="k-field"><span class="k-field__label">Delays / Weather Holds <span class="k-field__optional">optional</span></span><textarea class="k-input" name="delays" rows="2" placeholder="Rain stoppages, late deliveries, access holds…">${d.delays || ''}</textarea></label>
      <label class="k-field"><span class="k-field__label">Site Visitors <span class="k-field__optional">optional</span></span><input class="k-input" name="visitors" value="${d.visitors || ''}" placeholder="Certifier, structural engineer, client…"></label>`;
  };

  async function openNewDiary(defaultProjId = '') {
    if (!state.projects.length) {
      const r = await api.get('/api/projects', { today: today() });
      state.projects = r.projects || [];
    }
    if (!state.projects.length) { toast.error('Create a project first.'); return; }
    const made = await formDialog({
      title: 'Log Daily Site Diary',
      submitLabel: 'Save Diary',
      size: 'lg',
      fields: diaryFields(state.projects, {}, defaultProjId),
      onSubmit: (v) => api.post('/api/diaries', v),
    });
    if (made) { toast.success('Site diary logged.'); await loadScreen(); }
  }

  on(root, 'click', '[data-action="diary-new"]', () => openNewDiary());
  on(root, 'click', '[data-action="diary-new-for"]', (e, el) => openNewDiary(el.dataset.id));

  on(root, 'click', '[data-action="diary-edit"]', async (e, el) => {
    const d = state.diaries.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const saved = await formDialog({ title: 'Edit Site Diary', submitLabel: 'Save', size: 'lg', fields: diaryFields(state.projects, d), onSubmit: (v) => api.put('/api/diaries', { ...v, id: d.id }) });
    if (saved) { toast.success('Site diary updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="diary-sign"]', async (e, el) => {
    const signed = await formDialog({
      title: 'Sign Off Daily Site Diary',
      submitLabel: 'Sign Off',
      size: 'sm',
      fields: html`<label class="k-field"><span class="k-field__label">Supervisor / Manager Name</span><input class="k-input" name="signed_by" value="${state.session.me?.displayName || ''}" required></label>`,
      onSubmit: (v) => api.post('/api/diaries/sign', { id: Number(el.dataset.id), signed_by: v.signed_by }),
    });
    if (signed) { toast.success('Site diary signed off.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="diary-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete diary entry?', message: 'Delete this daily site diary entry?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/diaries', { id: Number(el.dataset.id) }); toast.success('Diary entry deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-diary"]', (e, el) => {
    const d = state.diaries.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const s = state.session.settings;
    downloadHtmlDoc(`site-diary-${d.diary_date}-${d.id}.html`, {
      title: `DAILY SITE DIARY · ${fmtDay(d.diary_date)}`,
      businessName: s.business_name,
      subtitle: [d.project_name, d.site_address].filter(Boolean).join(' · '),
      accent: '#c2590a',
      bodyHtml: `
        <div class="box">
          <strong>Project:</strong> ${esc(d.project_name || '')} &nbsp; <strong>Client:</strong> ${esc(d.client || '—')}<br>
          <strong>Site Address:</strong> ${esc(d.site_address || '—')}<br>
          <strong>Date:</strong> ${esc(fmtDay(d.diary_date, { weekday: 'long' }))} &nbsp; <strong>Weather:</strong> ${esc(d.weather)} &nbsp; <strong>Workers on Site:</strong> ${d.workers_on_site}
        </div>
        <div class="box"><strong>Work Completed:</strong><br><br>${esc(d.work_completed)}</div>
        <div class="box"><strong>Delays / Disruptions:</strong><br>${esc(d.delays || 'Nil delays recorded.')}</div>
        <div class="box"><strong>Site Visitors &amp; Inspections:</strong><br>${esc(d.visitors || 'None recorded.')}</div>
        <div class="box">
          <strong>Supervisor Sign-off:</strong> ${d.signed_by ? esc(d.signed_by) + (d.signed_at ? ' (' + esc(fmtDateTime(d.signed_at)) + ')' : '') : 'Pending sign-off'}
        </div>`,
    });
  });
}
