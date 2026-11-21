// People Ops Command (Pass 3 Warm Plum-Slate & Sage Masthead, Two-Column Unified Approvals + Sticky Onboarding/Hiring/Reviews Rail),
// Recruitment Pipeline (Monogrammed Candidate Cards + Stage Stepper + Recommendation Badges),
// and Onboarding & People Directory (Monogrammed Employee Cards + Live Checklist Progress Bars).
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const POSITIONS = ['Software Engineer', 'Product Designer', 'Marketing Specialist', 'Account Executive', 'Operations Manager', 'Finance Analyst', 'HR Generalist', 'Other'];
const REF_SOURCES = ['Job Board', 'LinkedIn', 'Employee Referral', 'Company Website', 'Other'];
const CAND_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Declined'];
const CAND_STEPS = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];
const INT_TYPES = ['Phone Screen', 'Technical', 'Behavioral', 'Panel', 'Final'];
const INT_RECS = ['Strong Hire', 'Hire', 'Mixed', 'No Hire', 'Strong No Hire'];
const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Sales', 'Operations', 'Finance', 'Human Resources', 'Other'];

export function renderRecBadge(rec) {
  const r = String(rec || '').trim();
  if (!r) return '';
  if (r === 'Strong Hire') return html`<span class="rec-badge rec-badge--strong-hire">${icon('check-circle', { size: 12 })} Strong Hire</span>`;
  if (r === 'Hire') return html`<span class="rec-badge rec-badge--hire">${icon('check', { size: 12 })} Hire</span>`;
  if (r === 'Mixed') return html`<span class="rec-badge rec-badge--mixed">${icon('alert', { size: 12 })} Mixed</span>`;
  return html`<span class="rec-badge rec-badge--no-hire">${icon('x-circle', { size: 12 })} ${r}</span>`;
}

function renderOnboardingProgress(ob) {
  const done = Number(ob.completed_count || 0);
  const total = Number(ob.total_count || 0);
  const pct = Number(ob.completion_pct || 0);
  const isDone = pct >= 100;
  return html`
    <div class="onb-prog">
      <div class="onb-prog__head">
        <span class="onb-prog__label">${done}/${total} done · ${pct}%</span>
        <span class="onb-pct ${isDone ? 'onb-pct--done' : ''}">${isDone ? 'Ready for Day 1' : `${Math.max(0, total - done)} left`}</span>
      </div>
      <div class="onb-prog__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="onb-prog__fill ${isDone ? 'onb-prog__fill--done' : ''}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function matchesText(query, fields) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((v) => String(v || '').toLowerCase().includes(q));
}

function scorecardToneClass(rec) {
  const r = String(rec || '').trim();
  if (r === 'Strong Hire') return 'scorecard-mini--strong-hire';
  if (r === 'Hire') return 'scorecard-mini--hire';
  if (r === 'Mixed') return 'scorecard-mini--mixed';
  if (r) return 'scorecard-mini--no-hire';
  return '';
}

export function renderTodayView(state) {
  const settings = state.session.settings || {};
  const cur = settings.currency || 'USD';
  const td = state.todayData;

  if (state.loading && !td) {
    return html`
      <section class="hr-masthead">
        <div class="hr-masthead__copy">
          <div class="hr-masthead__eyebrow">
            <span class="tk-pulse-dot" style="--dot:#5ec29c"></span>
            PEOPLE OPS · ${fmtDay(today(), { weekday: 'short' })}
          </div>
          <h1 class="hr-masthead__title">${settings.business_name || 'People Hub'}</h1>
          <div class="hr-masthead__meta"><span>Loading approvals queue, onboarding checklists, hiring &amp; reviews…</span></div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const c = td?.counts || state.session.counts || {
    pendingApprovals: 0, pendingLeave: 0, pendingExpenses: 0, pendingTraining: 0,
    activeCandidates: 0, inProgressOnboardings: 0, sampleCount: 0,
  };
  const q = state.peopleSearch || '';

  const allLeave = (td?.pendingLeave || []).filter((l) => matchesText(q, [l.employee_name, l.leave_type, l.reason]));
  const allExpenses = (td?.pendingExpenses || []).filter((ex) => matchesText(q, [ex.employee_name, ex.category, ex.description, ex.project_code]));
  const allTraining = (td?.pendingTraining || []).filter((tr) => matchesText(q, [tr.employee_name, tr.course_name, tr.provider, tr.training_type]));

  const showLeave = state.approvalFilter === 'All' || state.approvalFilter === 'Leave';
  const showExpenses = state.approvalFilter === 'All' || state.approvalFilter === 'Expenses';
  const showTraining = state.approvalFilter === 'All' || state.approvalFilter === 'Training';

  const visibleCount = (showLeave ? allLeave.length : 0) + (showExpenses ? allExpenses.length : 0) + (showTraining ? allTraining.length : 0);
  const totalFiltered = allLeave.length + allExpenses.length + allTraining.length;

  const rawOnbs = td?.inProgressOnboardings || [];
  const avgOnbPct = rawOnbs.length
    ? Math.round(rawOnbs.reduce((acc, ob) => acc + Number(ob.completion_pct || 0), 0) / rawOnbs.length)
    : 100;
  const onbRingColor = avgOnbPct >= 75 ? '#5ec29c' : avgOnbPct >= 45 ? '#f59e0b' : '#fb7185';

  const onbs = rawOnbs.filter((ob) => matchesText(q, [ob.employee_name, ob.department, ob.manager, ob.email]));
  const cands = (td?.activeCandidates || []).filter((cd) => matchesText(q, [cd.first_name, cd.last_name, cd.position, cd.email, cd.referral_source]));
  const recentReviews = (state.reviews || []).slice(0, 3);

  return html`
    ${renderSampleBanner(c.sampleCount || 0, { canClear: state.session.me.isOwner || state.session.me.role === 'manager' })}

    <section class="hr-masthead" aria-label="People Operations Command">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${c.pendingApprovals > 0 ? '#f0a8b8' : '#5ec29c'}"></span>
          PEOPLE OPS · ${c.pendingApprovals > 0 ? `${c.pendingApprovals} PENDING APPROVAL${c.pendingApprovals === 1 ? '' : 'S'}` : 'INBOX CLEAR'}
        </div>
        <h1 class="hr-masthead__title">${settings.business_name || 'People Hub'}</h1>
        <div class="hr-masthead__meta">
          <span>${c.pendingLeave} leave</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.pendingExpenses} expense${Number(c.pendingExpenses) === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.pendingTraining} L&amp;D</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.inProgressOnboardings} onboarding</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <a href="#/onboarding" class="hr-pod hr-pod--ring">
          <div class="tk-ring" style="--p:${avgOnbPct}%;--ring-color:${onbRingColor};--ring-size:48px">
            <span class="tk-ring__val">${avgOnbPct}%</span>
          </div>
          <div>
            <span class="hr-pod__lbl">Day-1 Ready</span>
            <div class="hr-pod__val" style="font-size:15px">${rawOnbs.length} active</div>
            <span class="hr-pod__sub">Checklists →</span>
          </div>
        </a>

        <a href="#/leave" class="hr-pod ${c.pendingApprovals > 0 ? 'hr-pod--alert' : 'hr-pod--sage'}">
          <span class="hr-pod__lbl">${icon('approval-stamp', { size: 12 })} Approvals</span>
          <span class="hr-pod__val">${c.pendingApprovals}</span>
          <span class="hr-pod__sub">${c.pendingLeave} leave waiting →</span>
        </a>

        <a href="#/hiring" class="hr-pod hr-pod--plum">
          <span class="hr-pod__lbl">${icon('users', { size: 12 })} Recruiting</span>
          <span class="hr-pod__val">${c.activeCandidates}</span>
          <span class="hr-pod__sub">Active pipeline →</span>
        </a>

        <div class="hr-masthead__cta-group">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="leave-new">${icon('palm-leave', { size: 14 })} Leave</button>
          <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="cand-new">${icon('plus', { size: 15 })} New Candidate</button>
        </div>
      </div>
    </section>

    <div class="hr-split">
      <div class="tk-stack" style="gap:16px">
        <section class="approvals-queue">
          <div class="approvals-queue__head">
            <div style="display:flex;align-items:center;gap:9px">
              <h2 class="tk-sheet__title">${icon('approval-stamp', { size: 17 })} Unified Approvals Queue</h2>
              <span class="tk-tag ${totalFiltered > 0 ? 'tk-tag--accent' : 'tk-tag--ok'}">${totalFiltered} pending</span>
            </div>
            <div class="tk-segmented">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.approvalFilter === 'All' })}" data-action="approval-filter" data-val="All">All (${totalFiltered})</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.approvalFilter === 'Leave' })}" data-action="approval-filter" data-val="Leave">Leave (${allLeave.length})</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.approvalFilter === 'Expenses' })}" data-action="approval-filter" data-val="Expenses">Expenses (${allExpenses.length})</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.approvalFilter === 'Training' })}" data-action="approval-filter" data-val="Training">L&amp;D (${allTraining.length})</button>
            </div>
          </div>

          <div style="padding:10px 18px;border-bottom:1px solid color-mix(in srgb, var(--k-text) 6%, transparent)">
            <div class="tk-search" style="max-width:340px;min-height:34px">
              ${icon('search', { size: 14 })}
              <input type="search" placeholder="Filter people, requests, departments…" value="${state.peopleSearch}" data-input="global-people-search">
            </div>
          </div>

          <div>
            ${showLeave ? allLeave.map((l) => html`
              <div class="approval-row" data-key="il-${l.id}">
                <div class="approval-row__left">
                  <span class="person-dot person-dot--leave" aria-hidden="true">${initials(l.employee_name)}</span>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="inbox-kind inbox-kind--leave">Leave</span>
                      <span>${l.employee_name}</span>
                      <span class="tk-tag">${l.leave_type} · ${l.total_days}d</span>
                    </div>
                    <div class="tk-row__meta">
                      <span><strong>${fmtDay(l.start_date)} – ${fmtDay(l.end_date)}</strong></span>
                      ${l.reason ? html`<span>${l.reason}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm btn-approve" data-action="leave-status" data-id="${l.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                  <button type="button" class="k-btn k-btn--sm btn-decline" data-action="leave-status" data-id="${l.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>
                </div>
              </div>`) : ''}

            ${showExpenses ? allExpenses.map((ex) => html`
              <div class="approval-row" data-key="ie-${ex.id}">
                <div class="approval-row__left">
                  <span class="person-dot person-dot--expense" aria-hidden="true">${initials(ex.employee_name)}</span>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="inbox-kind inbox-kind--expense">Expense</span>
                      <span>${ex.employee_name}</span>
                      <strong class="tk-mono">${money(ex.amount_cents, { currency: cur })}</strong>
                      <span class="tk-tag">${ex.category}</span>
                    </div>
                    <div class="tk-row__meta">
                      <span>${ex.description}</span>
                      <span>${fmtDay(ex.expense_date)}</span>
                      ${ex.project_code ? html`<span>Code: ${ex.project_code}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm btn-approve" data-action="exp-status" data-id="${ex.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                  <button type="button" class="k-btn k-btn--sm btn-decline" data-action="exp-status" data-id="${ex.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>
                </div>
              </div>`) : ''}

            ${showTraining ? allTraining.map((tr) => html`
              <div class="approval-row" data-key="it-${tr.id}">
                <div class="approval-row__left">
                  <span class="person-dot person-dot--training" aria-hidden="true">${initials(tr.employee_name)}</span>
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="inbox-kind inbox-kind--training">L&amp;D</span>
                      <span>${tr.employee_name}</span>
                      <strong class="tk-mono">${money(tr.cost_cents, { currency: cur })}</strong>
                      <span class="tk-tag">${tr.training_type}</span>
                    </div>
                    <div class="tk-row__meta">
                      <span><strong>${tr.course_name}</strong>${tr.provider ? ' · ' + tr.provider : ''}</span>
                      <span>Starts ${fmtDay(tr.start_date)}</span>
                    </div>
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm btn-approve" data-action="tr-status" data-id="${tr.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                  <button type="button" class="k-btn k-btn--sm btn-decline" data-action="tr-status" data-id="${tr.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>
                </div>
              </div>`) : ''}

            ${visibleCount === 0 ? emptyState({ iconName: 'check-circle', title: 'Approvals inbox clear!', text: q ? 'No pending requests match your search.' : 'All pending leave requests, expense claims, and training requests have been actioned.' }) : ''}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('people-badge', { size: 17 })} Active New-Hire Checklists</h2>
            <span class="tk-sheet__count">${onbs.length}</span>
            <div class="tk-sheet__actions">
              <button type="button" class="k-btn k-btn--sm" data-action="onb-new">${icon('plus', { size: 13 })} New Hire</button>
              <a href="#/onboarding" class="k-btn k-btn--ghost k-btn--sm">Directory →</a>
            </div>
          </div>
          <div>
            ${onbs.length ? onbs.map((ob) => html`
              <div class="tk-row" data-key="tob-${ob.id}">
                <span class="person-dot" aria-hidden="true">${initials(ob.employee_name)}</span>
                <div class="tk-row__main" style="gap:7px">
                  <div class="tk-row__title">
                    <span>${ob.employee_name}</span>
                    <span class="tk-tag tk-tag--accent">${ob.department}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>Starts <strong>${fmtDay(ob.start_date)}</strong></span>
                    ${ob.manager ? html`<span>Manager: ${ob.manager}</span>` : ''}
                  </div>
                  ${renderOnboardingProgress(ob)}
                </div>
              </div>`) : emptyState({ iconName: 'check-square', title: 'All onboardings 100% complete', text: 'Start a new checklist when you make your next hire.' })}
          </div>
        </section>
      </div>

      <aside class="hr-rail-panel" aria-label="Onboarding, Hiring and Review Pulse">
        <section class="hr-rail-card">
          <div class="hr-rail-card__head">
            <span class="hr-rail-card__title">${icon('users', { size: 14 })} Hiring Pipeline (${cands.length})</span>
            <a href="#/hiring" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Board</a>
          </div>
          ${cands.length ? html`
            <div>
              ${cands.slice(0, 5).map((cd) => html`
                <div class="hr-rail-item" data-key="tcd-${cd.id}">
                  <div class="hr-rail-item__top">
                    <div style="display:flex;align-items:center;gap:9px;min-width:0">
                      <span class="person-dot" style="width:32px;height:32px;font-size:11.5px;border-radius:9px">${initials(`${cd.first_name} ${cd.last_name}`)}</span>
                      <div style="min-width:0">
                        <div class="hr-rail-item__name">${cd.first_name} ${cd.last_name}</div>
                        <div class="hr-rail-item__sub">${cd.position}</div>
                      </div>
                    </div>
                    <span class="tk-tag tk-tag--accent">${cd.stage}</span>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active candidates in pipeline.</div>`}
        </section>

        <section class="hr-rail-card">
          <div class="hr-rail-card__head">
            <span class="hr-rail-card__title">${icon('award', { size: 14 })} Review Pulse</span>
            <a href="#/reviews" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Reviews</a>
          </div>
          ${recentReviews.length ? html`
            <div>
              ${recentReviews.map((r) => html`
                <div class="hr-rail-item" data-key="rr-${r.id}">
                  <div class="hr-rail-item__top">
                    <div>
                      <div class="hr-rail-item__name">${r.employee_name}</div>
                      <div class="hr-rail-item__sub">${r.review_period} · ${r.goals_met}</div>
                    </div>
                    <span class="score-pill ${r.overall_rating >= 4 ? 'score-pill--hi' : r.overall_rating < 3 ? 'score-pill--lo' : ''}">${r.overall_rating}/5</span>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No performance reviews logged yet.</div>`}
        </section>

        <section class="hr-rail-card">
          <div class="hr-rail-card__head">
            <span class="hr-rail-card__title">${icon('palm-leave', { size: 14 })} Quick People Actions</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 14px">
            <button type="button" class="k-btn k-btn--sm" data-action="onb-new">+ New Hire</button>
            <button type="button" class="k-btn k-btn--sm" data-action="leave-new">+ Leave</button>
            <button type="button" class="k-btn k-btn--sm" data-action="exp-new">+ Expense</button>
            <button type="button" class="k-btn k-btn--sm" data-action="rev-new">+ Review</button>
          </div>
        </section>
      </aside>
    </div>`;
}

export function renderHiringView(state) {
  const cur = state.session.settings.currency || 'USD';
  const q = (state.candSearch || state.peopleSearch || '').trim();
  const rows = state.candidates.filter((c) => {
    if (state.candStage !== 'All' && c.stage !== state.candStage) return false;
    return matchesText(q, [c.first_name, c.last_name, `${c.first_name} ${c.last_name}`, c.position, c.email, c.referral_source, c.cover_letter]);
  });
  const activeCount = state.candidates.filter((c) => c.stage !== 'Hired' && c.stage !== 'Declined').length;
  const offersOrHired = state.candidates.filter((c) => c.stage === 'Offer' || c.stage === 'Hired').length;
  const countStage = (st) => st === 'All' ? state.candidates.length : state.candidates.filter((c) => c.stage === st).length;

  return html`
    <section class="hr-masthead" aria-label="Recruitment Pipeline">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#5ec29c"></span>
          TALENT ACQUISITION · ${state.candidates.length} CANDIDATE${state.candidates.length === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Recruitment Pipeline</h1>
        <div class="hr-masthead__meta">
          <span>Structured 4-dimension interview scorecards</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live stage tracking from Applied to Hired</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod hr-pod--plum">
          <span class="hr-pod__lbl">Active Pipeline</span>
          <span class="hr-pod__val">${activeCount}</span>
          <span class="hr-pod__sub">In interview stages</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Offers / Hired</span>
          <span class="hr-pod__val">${offersOrHired}</span>
          <span class="hr-pod__sub">Closing talent</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="cand-new">${icon('plus', { size: 15 })} Add Candidate</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search candidates by name, role, email, source…" value="${state.candSearch}" data-input="cand-search">
      </div>
      <div class="tk-segmented">
        ${['All', ...CAND_STAGES].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.candStage === st })}" data-action="cand-filter" data-stage="${st}">${st} (${countStage(st)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.candidates.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((cd) => {
          const latestRec = (cd.scorecards && cd.scorecards[0]) ? cd.scorecards[0].overall_recommendation : '';
          const stepIdx = CAND_STEPS.indexOf(cd.stage);
          return html`
            <article class="hr-banded-card ${cd.stage === 'Hired' ? 'hr-banded-card--ok' : cd.stage === 'Declined' ? 'hr-banded-card--bad' : cd.stage === 'Offer' ? 'hr-banded-card--warn' : ''}" data-key="cd-${cd.id}">
              <div class="tk-card__head" style="flex-wrap:wrap">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                  <span class="person-dot">${initials(`${cd.first_name} ${cd.last_name}`)}</span>
                  <div style="min-width:0">
                    <div class="tk-row__title">
                      <span>${cd.first_name} ${cd.last_name}</span>
                      <span class="tk-tag tk-tag--accent">${cd.position}</span>
                      <span class="tk-tag ${cd.stage === 'Hired' ? 'tk-tag--ok' : cd.stage === 'Declined' ? 'tk-tag--bad' : cd.stage === 'Offer' ? 'tk-tag--warn' : 'tk-tag--info'}">${cd.stage}</span>
                      ${cd.avg_score !== null ? html`<span class="score-pill ${cd.avg_score >= 4 ? 'score-pill--hi' : cd.avg_score < 3 ? 'score-pill--lo' : ''}">Avg ${cd.avg_score}/5</span>` : ''}
                      ${latestRec ? renderRecBadge(latestRec) : ''}
                      ${cd.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta" style="margin-top:4px">
                      <span>${cd.email}</span>
                      ${cd.phone ? html`<span>${cd.phone}</span>` : ''}
                      <span>Source: ${cd.referral_source}</span>
                      ${cd.availability_date ? html`<span>Avail ${fmtDay(cd.availability_date)}</span>` : ''}
                      ${cd.salary_expectations_cents ? html`<span>Expected ${money(cd.salary_expectations_cents, { currency: cur })}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="score-new" data-id="${cd.id}">${icon('clipboard', { size: 14 })} Score</button>
                  <select class="k-input" style="width:auto;min-height:34px;padding:4px 8px" data-change="cand-stage" data-id="${cd.id}">
                    ${CAND_STAGES.map((st) => html`<option value="${st}" ${st === cd.stage ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cand-del" data-id="${cd.id}">Delete</button>
                </div>
              </div>

              ${cd.cover_letter ? html`<div class="tk-muted" style="font-size:13.25px">${cd.cover_letter}</div>` : ''}

              ${cd.stage !== 'Declined' ? html`
                <div class="hr-stepper">
                  ${CAND_STEPS.map((st, idx) => html`
                    <div class="hr-step ${idx < stepIdx || (st === 'Hired' && stepIdx === 4) ? 'is-done' : idx === stepIdx ? 'is-now' : ''}">${st}</div>`)}
                </div>` : ''}

              ${(cd.scorecards || []).length ? html`
                <div class="tk-stack" style="gap:8px">
                  <div style="font-size:11.5px;font-weight:750;text-transform:uppercase;letter-spacing:.05em;color:var(--k-muted)">Linked Interview Scorecards (${cd.scorecards.length})</div>
                  ${cd.scorecards.map((sc) => html`
                    <div class="scorecard-mini ${scorecardToneClass(sc.overall_recommendation)}" data-key="sc-${sc.id}">
                      <div class="tk-row__title" style="font-size:13.5px">
                        <span>${sc.interview_type} · ${sc.interviewer_name} (${fmtDay(sc.interview_date)})</span>
                        <span class="score-pill ${sc.overall_score >= 4 ? 'score-pill--hi' : sc.overall_score < 3 ? 'score-pill--lo' : ''}">${sc.overall_score}/5</span>
                        ${renderRecBadge(sc.overall_recommendation)}
                      </div>
                      <div class="tk-row__meta">
                        <span>Tech: <strong>${sc.technical_skills}/5</strong></span>
                        <span>Comm: <strong>${sc.communication}/5</strong></span>
                        <span>Culture: <strong>${sc.culture_fit}/5</strong></span>
                        <span>Problem: <strong>${sc.problem_solving}/5</strong></span>
                      </div>
                      ${sc.strengths ? html`<div><strong>Strengths:</strong> ${sc.strengths}</div>` : ''}
                      ${sc.concerns ? html`<div class="tk-muted"><strong>Concerns:</strong> ${sc.concerns}</div>` : ''}
                    </div>`)}
                </div>` : ''}
            </article>`;
        }) : emptyState({ iconName: 'users', title: 'No candidates match', text: 'Adjust your search or add applicants to track structured interview scorecards.' })}
      </div>`}`;
}

export function renderOnboardingView(state) {
  const itList = state.itItems || [];
  const polList = state.policyItems || [];
  const q = (state.onbSearch || state.peopleSearch || '').trim();
  const rows = state.onboardings.filter((ob) => {
    if (state.onbDept !== 'All' && ob.department !== state.onbDept) return false;
    return matchesText(q, [ob.employee_name, ob.department, ob.manager, ob.email, ob.notes]);
  });
  const avgPct = state.onboardings.length
    ? Math.round(state.onboardings.reduce((s, o) => s + Number(o.completion_pct || 0), 0) / state.onboardings.length)
    : 100;
  const inFlight = state.onboardings.filter((o) => Number(o.completion_pct || 0) < 100).length;
  const ringColor = avgPct >= 75 ? '#5ec29c' : avgPct >= 45 ? '#f59e0b' : '#fb7185';
  const depts = ['All', ...new Set(state.onboardings.map((o) => o.department).filter(Boolean))];
  const countDept = (d) => d === 'All' ? state.onboardings.length : state.onboardings.filter((o) => o.department === d).length;

  return html`
    <section class="hr-masthead" aria-label="Onboarding and People Directory">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#5ec29c"></span>
          PEOPLE DIRECTORY · ${state.onboardings.length} EMPLOYEE${state.onboardings.length === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Onboarding &amp; People</h1>
        <div class="hr-masthead__meta">
          <span>Monogrammed employee cards with live IT &amp; policy checklists</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable Day-1 readiness sheets</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod hr-pod--ring">
          <div class="tk-ring" style="--p:${avgPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${avgPct}%</span>
          </div>
          <div>
            <span class="hr-pod__lbl">Avg Readiness</span>
            <div class="hr-pod__val" style="font-size:15px">${state.onboardings.length - inFlight}/${state.onboardings.length}</div>
            <span class="hr-pod__sub">Complete</span>
          </div>
        </div>
        <div class="hr-pod hr-pod--plum">
          <span class="hr-pod__lbl">Directory</span>
          <span class="hr-pod__val">${state.onboardings.length}</span>
          <span class="hr-pod__sub">${depts.length - 1} departments</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">In Progress</span>
          <span class="hr-pod__val">${inFlight}</span>
          <span class="hr-pod__sub">Active checklists</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="onb-new">${icon('plus', { size: 15 })} Add New Hire</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search people by name, department, manager…" value="${state.onbSearch}" data-input="onb-search">
      </div>
      ${depts.length > 2 ? html`
        <div class="tk-segmented">
          ${depts.map((d) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.onbDept === d })}" data-action="onb-dept" data-dept="${d}">${d} (${countDept(d)})</button>`)}
        </div>` : ''}
    </div>

    ${state.loading && !state.onboardings.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((ob) => {
          const itDone = new Set(ob.it_setup || []);
          const polDone = new Set(ob.policy_acknowledgement || []);
          return html`
            <article class="hr-banded-card ${ob.completion_pct === 100 ? 'hr-banded-card--ok' : 'hr-banded-card--warn'}" data-key="ob-${ob.id}">
              <div class="tk-card__head" style="flex-wrap:wrap">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                  <span class="person-dot" aria-hidden="true">${initials(ob.employee_name)}</span>
                  <div style="min-width:0">
                    <div class="tk-row__title">
                      <span>${ob.employee_name}</span>
                      <span class="tk-tag tk-tag--accent">${ob.department}</span>
                      ${ob.completion_pct === 100 ? html`<span class="tk-tag tk-tag--ok">Day-1 Ready</span>` : html`<span class="tk-tag tk-tag--warn">In Progress</span>`}
                      ${ob.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta" style="margin-top:4px">
                      <span>Start: <strong>${fmtDay(ob.start_date)}</strong></span>
                      <span>${ob.email}</span>
                      ${ob.manager ? html`<span>Manager: ${ob.manager}</span>` : ''}
                      ${ob.emergency_contact_name ? html`<span>ICE: ${ob.emergency_contact_name} (${ob.emergency_contact_phone})</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="onb-print" data-id="${ob.id}">${icon('printer', { size: 14 })} Sheet</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="onb-del" data-id="${ob.id}">Delete</button>
                </div>
              </div>

              ${renderOnboardingProgress(ob)}

              <div class="onb-cols">
                <div class="onb-box">
                  <div class="onb-box__title">IT Setup (${itDone.size}/${itList.length})</div>
                  ${itList.map((item) => html`
                    <label class="${cls('tk-check-item', { 'is-done': itDone.has(item) })}">
                      <input type="checkbox" ${itDone.has(item) ? 'checked' : ''} data-toggle-onb="${ob.id}" data-kind="it" data-item="${item}">
                      <span>${item}</span>
                    </label>`)}
                </div>
                <div class="onb-box">
                  <div class="onb-box__title">Policy Acknowledgement (${polDone.size}/${polList.length})</div>
                  ${polList.map((item) => html`
                    <label class="${cls('tk-check-item', { 'is-done': polDone.has(item) })}">
                      <input type="checkbox" ${polDone.has(item) ? 'checked' : ''} data-toggle-onb="${ob.id}" data-kind="policy" data-item="${item}">
                      <span>${item}</span>
                    </label>`)}
                </div>
              </div>
              ${ob.notes ? html`<div class="tk-muted" style="font-size:13px">${ob.notes}</div>` : ''}
            </article>`;
        }) : emptyState({ iconName: 'people-badge', title: 'No employees match', text: 'Adjust your search or create an interactive IT & Policy checklist for a new hire.' })}
      </div>`}`;
}

export function wireTalentActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="approval-filter"]', (e, el) => { state.approvalFilter = el.dataset.val; draw(); });
  on(root, 'click', '[data-action="cand-filter"]', (e, el) => { state.candStage = el.dataset.stage; draw(); });
  on(root, 'input', '[data-input="cand-search"]', (e, el) => { state.candSearch = el.value; draw(); });
  on(root, 'input', '[data-input="onb-search"]', (e, el) => { state.onbSearch = el.value; draw(); });
  on(root, 'click', '[data-action="onb-dept"]', (e, el) => { state.onbDept = el.dataset.dept; draw(); });

  on(root, 'click', '[data-action="cand-new"]', async () => {
    const made = await formDialog({
      title: 'Add Job Candidate',
      submitLabel: 'Save Candidate',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">First Name</span><input class="k-input" name="first_name" required></label>
          <label class="k-field"><span class="k-field__label">Last Name</span><input class="k-input" name="last_name" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Position</span><select class="k-input" name="position">${POSITIONS.map((p) => html`<option value="${p}">${p}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Stage</span><select class="k-input" name="stage">${CAND_STAGES.map((st) => html`<option value="${st}">${st}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Referral Source</span><select class="k-input" name="referral_source">${REF_SOURCES.map((r) => html`<option value="${r}">${r}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Available From</span><input class="k-input" type="date" name="availability_date" value="${addDays(today(), 14)}"></label>
          <label class="k-field"><span class="k-field__label">Salary Expectations</span><input class="k-input" type="number" step="1000" min="0" name="salary_expectations" placeholder="120000"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Cover Letter / Summary</span><textarea class="k-input" name="cover_letter" rows="3"></textarea></label>`,
      onSubmit: (v) => api.post('/api/candidates', v),
    });
    if (made) { toast.success('Candidate added to pipeline.'); await loadScreen(); }
  });

  on(root, 'change', '[data-change="cand-stage"]', async (e, el) => {
    try { await api.post('/api/candidates/stage', { id: Number(el.dataset.id), stage: el.value }); toast.success(`Candidate moved to ${el.value}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cand-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete candidate?', message: 'Deletes this candidate and linked interview scorecards.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/candidates', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="score-new"]', async (e, el) => {
    const cd = state.candidates.find((x) => String(x.id) === el.dataset.id);
    if (!cd) return;
    const made = await formDialog({
      title: `Interview Scorecard — ${cd.first_name} ${cd.last_name}`,
      submitLabel: 'Save Scorecard',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Interviewer</span><input class="k-input" name="interviewer_name" value="${state.session.me.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="interview_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Interview Type</span><select class="k-input" name="interview_type">${INT_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Technical (1–5)</span><input class="k-input" type="number" min="1" max="5" name="technical_skills" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Communication (1–5)</span><input class="k-input" type="number" min="1" max="5" name="communication" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Culture Fit (1–5)</span><input class="k-input" type="number" min="1" max="5" name="culture_fit" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Problem Solving (1–5)</span><input class="k-input" type="number" min="1" max="5" name="problem_solving" value="4" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Overall Recommendation</span><select class="k-input" name="overall_recommendation">${INT_RECS.map((r) => html`<option value="${r}" ${r === 'Hire' ? 'selected' : ''}>${r}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Strengths</span><textarea class="k-input" name="strengths" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Concerns</span><textarea class="k-input" name="concerns" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/scorecards', { ...v, candidate_id: cd.id }),
    });
    if (made) { toast.success(`Scorecard saved (Overall ${made.scorecard.overall_score}/5 · ${made.scorecard.overall_recommendation}).`); await loadScreen('/hiring'); }
  });

  on(root, 'click', '[data-action="onb-new"]', async () => {
    const made = await formDialog({
      title: 'Start New Hire Onboarding',
      submitLabel: 'Create Checklist',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" required></label>
          <label class="k-field"><span class="k-field__label">Work Email</span><input class="k-input" type="email" name="email" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Start Date</span><input class="k-input" type="date" name="start_date" value="${addDays(today(), 7)}" required></label>
          <label class="k-field"><span class="k-field__label">Department</span><select class="k-input" name="department">${DEPARTMENTS.map((d) => html`<option value="${d}">${d}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Manager</span><input class="k-input" name="manager"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Emergency Contact</span><input class="k-input" name="emergency_contact_name"></label>
          <label class="k-field"><span class="k-field__label">Emergency Phone</span><input class="k-input" name="emergency_contact_phone"></label>
          <label class="k-field"><span class="k-field__label">Relationship</span><input class="k-input" name="emergency_contact_relationship"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Laptop spec, welcome buddy…"></label>`,
      onSubmit: (v) => api.post('/api/onboardings', v),
    });
    if (made) { toast.success('Onboarding checklist created.'); await loadScreen(); }
  });

  on(root, 'change', '[data-toggle-onb]', async (e, el) => {
    try {
      const res = await api.post('/api/onboardings/toggle', { id: Number(el.dataset.toggleOnb), kind: el.dataset.kind, item: el.dataset.item });
      const idx = state.onboardings.findIndex((x) => x.id === res.onboarding.id);
      if (idx >= 0) state.onboardings[idx] = res.onboarding;
      await loadScreen('/onboarding');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="onb-print"]', (e, el) => {
    const ob = state.onboardings.find((x) => String(x.id) === el.dataset.id);
    if (!ob) return;
    const itDone = new Set(ob.it_setup || []);
    const polDone = new Set(ob.policy_acknowledgement || []);
    downloadHtmlDoc(`onboarding-${ob.employee_name.toLowerCase().replaceAll(' ', '-')}.html`, {
      title: `Onboarding Checklist · ${ob.employee_name}`,
      businessName: state.session.settings.business_name,
      subtitle: `${ob.department} · Start ${fmtDay(ob.start_date)} · Completion ${ob.completion_pct}%`,
      accent: '#823462',
      bodyHtml: `
        <div class="box"><strong>Work Email:</strong> ${esc(ob.email)} · <strong>Manager:</strong> ${esc(ob.manager || 'TBD')}<br>
        <strong>Emergency Contact:</strong> ${esc(ob.emergency_contact_name || '—')} (${esc(ob.emergency_contact_phone || '—')})</div>
        <h3>IT Setup</h3>
        <table><tbody>${(state.itItems || []).map((i) => `<tr><td>${esc(i)}</td><td class="num">${itDone.has(i) ? 'Done' : 'Pending'}</td></tr>`).join('')}</tbody></table>
        <h3>Policy Acknowledgement</h3>
        <table><tbody>${(state.policyItems || []).map((i) => `<tr><td>${esc(i)}</td><td class="num">${polDone.has(i) ? 'Acknowledged' : 'Pending'}</td></tr>`).join('')}</tbody></table>`,
    });
  });

  on(root, 'click', '[data-action="onb-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete onboarding checklist?', message: 'Remove this employee onboarding record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/onboardings', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
