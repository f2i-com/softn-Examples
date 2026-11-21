// Leave Approval Cards (1-Click Approve/Decline), Performance Reviews, Expense Claims, Training & L&D, and Exit Interviews (Pass 3 Plum-Slate & Sage).
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, addDays } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Parental Leave', 'Bereavement', 'Unpaid Leave'];
const REVIEW_PERIODS = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)', 'Annual', 'Probation'];
const GOALS_MET = ['Exceeded All Goals', 'Met All Goals', 'Partially Met Goals', 'Did Not Meet Goals'];
const EXP_CATS = ['Travel', 'Meals & Entertainment', 'Accommodation', 'Office Supplies', 'Training & Development', 'Technology / Software', 'Client Entertainment', 'Other'];
const TRAIN_TYPES = ['Online Course', 'Certification', 'Conference', 'Workshop', 'Degree Program', 'Other'];
const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Sales', 'Operations', 'Finance', 'Human Resources', 'Other'];
const EXIT_REASONS = ['New Opportunity', 'Compensation', 'Career Growth', 'Work-Life Balance', 'Management', 'Relocation', 'Retirement', 'Personal Reasons', 'Other'];

function matchesSearch(state, fields) {
  const q = String(state.peopleSearch || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((v) => String(v || '').toLowerCase().includes(q));
}

export function renderLeaveView(state) {
  const rows = state.leave.filter((l) => {
    if (state.leaveFilter !== 'All' && l.status !== state.leaveFilter) return false;
    return matchesSearch(state, [l.employee_name, l.leave_type, l.manager_name, l.reason]);
  });
  const pendingCount = state.leave.filter((l) => l.status === 'Pending').length;
  const approvedDays = state.leave.filter((l) => l.status === 'Approved').reduce((s, l) => s + Number(l.total_days || 0), 0);
  const countL = (st) => st === 'All' ? state.leave.length : state.leave.filter((l) => l.status === st).length;

  return html`
    <section class="hr-masthead" aria-label="Leave Requests">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${pendingCount > 0 ? '#f0a8b8' : '#5ec29c'}"></span>
          TIME OFF · ${pendingCount} PENDING
        </div>
        <h1 class="hr-masthead__title">Leave Requests</h1>
        <div class="hr-masthead__meta">
          <span>Review dates &amp; handover notes with 1-click Approve or Decline</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live team absence ledger</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod ${pendingCount > 0 ? 'hr-pod--alert' : 'hr-pod--sage'}">
          <span class="hr-pod__lbl">Pending</span>
          <span class="hr-pod__val">${pendingCount}</span>
          <span class="hr-pod__sub">Awaiting decision</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Approved Days</span>
          <span class="hr-pod__val">${approvedDays}d</span>
          <span class="hr-pod__sub">${countL('Approved')} requests</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="leave-new">${icon('plus', { size: 15 })} Request Leave</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', 'Pending', 'Approved', 'Declined'].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.leaveFilter === st })}" data-action="leave-filter" data-status="${st}">${st} (${countL(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.leave.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? rows.map((l) => html`
        <article class="hr-banded-card ${l.status === 'Approved' ? 'hr-banded-card--ok' : l.status === 'Declined' ? 'hr-banded-card--bad' : 'hr-banded-card--warn'}" data-key="lv-${l.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
              <span class="person-dot person-dot--leave" aria-hidden="true">${initials(l.employee_name)}</span>
              <div style="min-width:0">
                <div class="tk-row__title">
                  <span>${l.employee_name}</span>
                  <span class="tk-tag tk-tag--accent">${l.leave_type}</span>
                  <span class="tk-tag ${l.status === 'Approved' ? 'tk-tag--ok' : l.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${l.status}</span>
                  ${l.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta" style="margin-top:4px">
                  <span><strong>${fmtDay(l.start_date)} – ${fmtDay(l.end_date)}</strong> (${l.total_days} day${Number(l.total_days) === 1 ? '' : 's'})</span>
                  ${l.manager_name ? html`<span>Manager: ${l.manager_name}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="tk-btn-row">
              ${l.status === 'Pending' ? html`
                <button type="button" class="k-btn k-btn--sm btn-approve" data-action="leave-status" data-id="${l.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                <button type="button" class="k-btn k-btn--sm btn-decline" data-action="leave-status" data-id="${l.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="leave-del" data-id="${l.id}">Delete</button>
            </div>
          </div>
          ${l.reason ? html`<div class="tk-muted" style="font-size:13.25px">${l.reason}</div>` : ''}
        </article>`) : emptyState({ iconName: 'palm-leave', title: 'No leave requests', text: 'Submit time-off requests for manager approval.' })}
    </div>`;
}

export function renderReviewsView(state) {
  const rows = state.reviews.filter((r) => matchesSearch(state, [r.employee_name, r.reviewer_name, r.review_period, r.goals_met, r.strengths]));
  const avgScore = state.reviews.length
    ? (state.reviews.reduce((s, r) => s + Number(r.overall_rating || 0), 0) / state.reviews.length).toFixed(1)
    : '—';

  return html`
    <section class="hr-masthead" aria-label="Performance Reviews">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#5ec29c"></span>
          GROWTH &amp; FEEDBACK · ${state.reviews.length} REVIEW${state.reviews.length === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Performance Reviews</h1>
        <div class="hr-masthead__meta">
          <span>Five-competency evaluations with auto-computed overall scores</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable HTML review sheets</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Avg Rating</span>
          <span class="hr-pod__val">${avgScore}${avgScore !== '—' ? '/5' : ''}</span>
          <span class="hr-pod__sub">Team average</span>
        </div>
        <div class="hr-pod hr-pod--plum">
          <span class="hr-pod__lbl">Completed</span>
          <span class="hr-pod__val">${state.reviews.length}</span>
          <span class="hr-pod__sub">Saved evaluations</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="rev-new">${icon('plus', { size: 15 })} New Review</button>
      </div>
    </section>

    ${state.loading && !state.reviews.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((r) => {
          const comps = [
            { lbl: 'Job Knowledge', val: r.job_knowledge },
            { lbl: 'Quality', val: r.quality_of_work },
            { lbl: 'Productivity', val: r.productivity },
            { lbl: 'Teamwork', val: r.teamwork },
            { lbl: 'Initiative', val: r.initiative },
          ];
          return html`
            <article class="hr-banded-card ${r.overall_rating >= 4 ? 'hr-banded-card--ok' : r.overall_rating < 3 ? 'hr-banded-card--bad' : ''}" data-key="rv-${r.id}">
              <div class="tk-card__head" style="flex-wrap:wrap">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                  <span class="person-dot">${initials(r.employee_name)}</span>
                  <div style="min-width:0">
                    <div class="tk-row__title">
                      <span>${r.employee_name}</span>
                      <span class="tk-tag tk-tag--accent">${r.review_period}</span>
                      <span class="score-pill ${r.overall_rating >= 4 ? 'score-pill--hi' : r.overall_rating < 3 ? 'score-pill--lo' : ''}">${r.overall_rating}/5</span>
                      <span class="tk-tag ${r.goals_met.includes('Exceeded') || r.goals_met.includes('Met All') ? 'tk-tag--ok' : 'tk-tag--warn'}">${r.goals_met}</span>
                      ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta" style="margin-top:4px">
                      <span>Reviewer: ${r.reviewer_name}</span>
                      <span>Date: ${fmtDay(r.review_date)}</span>
                    </div>
                  </div>
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="rev-print" data-id="${r.id}">${icon('printer', { size: 14 })} Sheet</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="rev-del" data-id="${r.id}">Delete</button>
                </div>
              </div>

              <div class="comp-grid">
                ${comps.map((cp) => html`
                  <div class="comp-cell">
                    <div class="comp-cell__val">${cp.val}/5</div>
                    <div class="tk-bar"><div class="tk-bar__fill" style="width:${Math.round((Number(cp.val || 0) / 5) * 100)}%"></div></div>
                    <div class="comp-cell__lbl">${cp.lbl}</div>
                  </div>`)}
              </div>

              ${r.strengths ? html`<div style="font-size:13.5px"><strong>Strengths:</strong> ${r.strengths}</div>` : ''}
              ${r.areas_for_improvement ? html`<div style="font-size:13.5px"><strong>Areas for Improvement:</strong> ${r.areas_for_improvement}</div>` : ''}
              ${r.goals_next_period ? html`<div class="tk-muted" style="font-size:13.25px"><strong>Next Period Goals:</strong> ${r.goals_next_period}</div>` : ''}
            </article>`;
        }) : emptyState({ iconName: 'award', title: 'No performance reviews found', text: 'Conduct quarterly, probation, or annual competency reviews.' })}
      </div>`}`;
}

export function renderExpensesView(state) {
  const cur = state.session.settings.currency || 'USD';
  const sum = state.expenseSummary || { pendingCents: 0, approvedCents: 0, reimbursedCents: 0 };
  const rows = state.expenses.filter((e) => {
    if (state.expenseFilter !== 'All' && e.status !== state.expenseFilter) return false;
    return matchesSearch(state, [e.employee_name, e.category, e.description, e.project_code]);
  });
  const countE = (st) => st === 'All' ? state.expenses.length : state.expenses.filter((e) => e.status === st).length;

  return html`
    <section class="hr-masthead" aria-label="Expense Claims">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${sum.pendingCents > 0 ? '#f0a8b8' : '#5ec29c'}"></span>
          REIMBURSEMENTS · ${state.expenses.length} CLAIM${state.expenses.length === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Expense Claims</h1>
        <div class="hr-masthead__meta">
          <span>Approve &amp; reimburse team claims by category and cost code</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>3-stage reimbursement workflow</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod ${sum.pendingCents > 0 ? 'hr-pod--alert' : 'hr-pod--plum'}">
          <span class="hr-pod__lbl">Pending / To Pay</span>
          <span class="hr-pod__val">${money(Number(sum.pendingCents || 0) + Number(sum.approvedCents || 0), { currency: cur })}</span>
          <span class="hr-pod__sub">${money(sum.pendingCents, { currency: cur })} pending</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Reimbursed</span>
          <span class="hr-pod__val">${money(sum.reimbursedCents, { currency: cur })}</span>
          <span class="hr-pod__sub">${countE('Reimbursed')} settled</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="exp-new">${icon('plus', { size: 15 })} Submit Claim</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', 'Pending', 'Approved', 'Reimbursed', 'Declined'].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.expenseFilter === st })}" data-action="exp-filter" data-status="${st}">${st} (${countE(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.expenses.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? rows.map((ex) => html`
        <article class="hr-banded-card ${ex.status === 'Reimbursed' ? 'hr-banded-card--ok' : ex.status === 'Declined' ? 'hr-banded-card--bad' : ex.status === 'Pending' ? 'hr-banded-card--warn' : ''}" data-key="ex-${ex.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
              <span class="person-dot person-dot--expense" aria-hidden="true">${initials(ex.employee_name)}</span>
              <div style="min-width:0">
                <div class="tk-row__title">
                  <span>${ex.employee_name}</span>
                  <span class="tk-tag">${ex.category}</span>
                  ${ex.project_code ? html`<span class="tk-tag tk-tag--info">${ex.project_code}</span>` : ''}
                  <span class="tk-tag ${ex.status === 'Reimbursed' ? 'tk-tag--ok' : ex.status === 'Approved' ? 'tk-tag--info' : ex.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${ex.status}</span>
                  ${ex.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta" style="margin-top:4px">
                  <span>${fmtDay(ex.expense_date)}</span>
                  <span>${ex.description}</span>
                </div>
              </div>
            </div>
            <div class="tk-btn-row">
              <strong class="tk-mono" style="font-size:16px;margin-right:4px">${money(ex.amount_cents, { currency: cur })}</strong>
              ${ex.status === 'Pending' ? html`
                <button type="button" class="k-btn k-btn--sm btn-approve" data-action="exp-status" data-id="${ex.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                <button type="button" class="k-btn k-btn--sm btn-decline" data-action="exp-status" data-id="${ex.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>` : ''}
              ${ex.status === 'Approved' ? html`
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="exp-status" data-id="${ex.id}" data-status="Reimbursed">Mark Reimbursed ✓</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="exp-del" data-id="${ex.id}">Delete</button>
            </div>
          </div>
          <div class="hr-stepper">
            <div class="hr-step is-done">1. Submitted</div>
            <div class="hr-step ${ex.status === 'Declined' ? 'is-bad' : (ex.status === 'Approved' || ex.status === 'Reimbursed') ? 'is-done' : 'is-now'}">2. ${ex.status === 'Declined' ? 'Declined' : 'Approved'}</div>
            <div class="hr-step ${ex.status === 'Reimbursed' ? 'is-done' : ex.status === 'Approved' ? 'is-now' : ''}">3. Reimbursed</div>
          </div>
        </article>`) : emptyState({ iconName: 'receipt', title: 'No expense claims', text: 'Log travel, equipment, or client expense claims for approval.' })}
    </div>`;
}

export function renderTrainingView(state) {
  const cur = state.session.settings.currency || 'USD';
  const sum = state.trainingSummary || { pendingCents: 0, committedCents: 0 };
  const rows = state.training.filter((t) => {
    if (state.trainingFilter !== 'All' && t.status !== state.trainingFilter) return false;
    return matchesSearch(state, [t.employee_name, t.course_name, t.provider, t.training_type, t.justification]);
  });
  const countT = (st) => st === 'All' ? state.training.length : state.training.filter((t) => t.status === st).length;

  return html`
    <section class="hr-masthead" aria-label="Training and Development">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#5ec29c"></span>
          LEARNING &amp; DEVELOPMENT · ${state.training.length} REQUEST${state.training.length === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Training &amp; L&amp;D</h1>
        <div class="hr-masthead__meta">
          <span>Approve courses, certifications &amp; conferences</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live L&amp;D budget tracker</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod ${sum.pendingCents > 0 ? 'hr-pod--plum' : ''}">
          <span class="hr-pod__lbl">Pending L&amp;D</span>
          <span class="hr-pod__val">${money(sum.pendingCents, { currency: cur })}</span>
          <span class="hr-pod__sub">${countT('Pending')} awaiting approval</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Committed Spend</span>
          <span class="hr-pod__val">${money(sum.committedCents, { currency: cur })}</span>
          <span class="hr-pod__sub">Approved / completed</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="tr-new">${icon('plus', { size: 15 })} Request Training</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', 'Pending', 'Approved', 'Completed', 'Declined'].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.trainingFilter === st })}" data-action="tr-filter" data-status="${st}">${st} (${countT(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.training.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? rows.map((tr) => html`
        <article class="hr-banded-card ${tr.status === 'Completed' || tr.status === 'Approved' ? 'hr-banded-card--ok' : tr.status === 'Declined' ? 'hr-banded-card--bad' : 'hr-banded-card--warn'}" data-key="tr-${tr.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
              <span class="person-dot person-dot--training" aria-hidden="true">${initials(tr.employee_name)}</span>
              <div style="min-width:0">
                <div class="tk-row__title">
                  <span>${tr.course_name}</span>
                  <span class="tk-tag">${tr.training_type}</span>
                  <span class="tk-tag ${tr.status === 'Completed' || tr.status === 'Approved' ? 'tk-tag--ok' : tr.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${tr.status}</span>
                  ${tr.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta" style="margin-top:4px">
                  <span><strong>${tr.employee_name}</strong></span>
                  ${tr.provider ? html`<span>Provider: ${tr.provider}</span>` : ''}
                  <span>${fmtDay(tr.start_date)}${tr.end_date && tr.end_date !== tr.start_date ? ' – ' + fmtDay(tr.end_date) : ''}</span>
                </div>
              </div>
            </div>
            <div class="tk-btn-row">
              <strong class="tk-mono" style="font-size:15.5px;margin-right:4px">${money(tr.cost_cents, { currency: cur })}</strong>
              ${tr.status === 'Pending' ? html`
                <button type="button" class="k-btn k-btn--sm btn-approve" data-action="tr-status" data-id="${tr.id}" data-status="Approved">${icon('check', { size: 13 })} Approve</button>
                <button type="button" class="k-btn k-btn--sm btn-decline" data-action="tr-status" data-id="${tr.id}" data-status="Declined">${icon('x', { size: 13 })} Decline</button>` : ''}
              ${tr.status === 'Approved' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="tr-status" data-id="${tr.id}" data-status="Completed">Complete ✓</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="tr-del" data-id="${tr.id}">Delete</button>
            </div>
          </div>
          ${tr.justification ? html`<div class="tk-muted" style="font-size:13.25px">${tr.justification}</div>` : ''}
        </article>`) : emptyState({ iconName: 'book', title: 'No training requests', text: 'Track courses, certifications, and L&D budget approvals.' })}
    </div>`;
}

export function renderExitsView(state) {
  const s = state.exitSummary || { total: 0, avgTenure: 0, avgSatisfaction: 0, avgManagement: 0, avgCulture: 0, recommendPct: 0 };
  const rows = state.exits.filter((ex) => matchesSearch(state, [ex.employee_name, ex.department, ex.reason_for_leaving, ex.what_enjoyed, ex.suggestions]));
  const recPct = Number(s.recommendPct || 0);
  const ringColor = recPct >= 70 ? '#5ec29c' : recPct >= 45 ? '#f59e0b' : '#fb7185';

  return html`
    <section class="hr-masthead" aria-label="Exit Interviews">
      <div class="hr-masthead__copy">
        <div class="hr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f0a8b8"></span>
          RETENTION INSIGHTS · ${s.total} INTERVIEW${s.total === 1 ? '' : 'S'}
        </div>
        <h1 class="hr-masthead__title">Exit Interviews</h1>
        <div class="hr-masthead__meta">
          <span>Capture candid departure feedback, tenure &amp; culture scores</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Spot retention drivers early</span>
        </div>
      </div>

      <div class="hr-masthead__pods" style="align-items:center">
        <div class="hr-pod hr-pod--ring">
          <div class="tk-ring" style="--p:${recPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${recPct}%</span>
          </div>
          <div>
            <span class="hr-pod__lbl">Recommend</span>
            <div class="hr-pod__val" style="font-size:15px">${s.total} exits</div>
            <span class="hr-pod__sub">Alumni advocacy</span>
          </div>
        </div>
        <div class="hr-pod hr-pod--plum">
          <span class="hr-pod__lbl">Avg Tenure</span>
          <span class="hr-pod__val">${s.avgTenure} yrs</span>
          <span class="hr-pod__sub">Culture ${s.avgCulture}/5</span>
        </div>
        <div class="hr-pod hr-pod--sage">
          <span class="hr-pod__lbl">Satisfaction</span>
          <span class="hr-pod__val">${s.avgSatisfaction}/5</span>
          <span class="hr-pod__sub">Mgmt ${s.avgManagement}/5</span>
        </div>
        <button type="button" class="k-btn k-btn--primary hr-btn-sage" data-action="exit-new">${icon('plus', { size: 15 })} Record Exit</button>
      </div>
    </section>

    ${state.loading && !state.exits.length && !state.exitSummary ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((ex) => html`
          <article class="hr-banded-card" data-key="exi-${ex.id}">
            <div class="tk-card__head" style="flex-wrap:wrap">
              <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                <span class="person-dot" aria-hidden="true">${initials(ex.employee_name)}</span>
                <div style="min-width:0">
                  <div class="tk-row__title">
                    <span>${ex.employee_name}</span>
                    <span class="tk-tag tk-tag--accent">${ex.department}</span>
                    <span class="tk-tag tk-tag--warn">${ex.reason_for_leaving}</span>
                    ${ex.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta" style="margin-top:4px">
                    <span>Last day: ${fmtDay(ex.last_day)}</span>
                    <span>Tenure: ${ex.tenure_years} yrs</span>
                    <span>Return: ${ex.would_return} · Recommend: ${ex.would_recommend}</span>
                  </div>
                </div>
              </div>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="exit-del" data-id="${ex.id}">Delete</button>
            </div>
            <div class="comp-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
              <div class="comp-cell"><div class="comp-cell__val">${ex.overall_satisfaction}/5</div><div class="comp-cell__lbl">Satisfaction</div></div>
              <div class="comp-cell"><div class="comp-cell__val">${ex.management_rating}/5</div><div class="comp-cell__lbl">Management</div></div>
              <div class="comp-cell"><div class="comp-cell__val">${ex.culture_rating}/5</div><div class="comp-cell__lbl">Culture</div></div>
            </div>
            ${ex.what_enjoyed ? html`<div style="font-size:13.5px"><strong>Enjoyed:</strong> ${ex.what_enjoyed}</div>` : ''}
            ${ex.suggestions ? html`<div class="tk-muted" style="font-size:13.25px"><strong>Suggestions:</strong> ${ex.suggestions}</div>` : ''}
          </article>`) : emptyState({ iconName: 'logout', title: 'No exit interviews logged', text: 'Record structured departure interviews to spot retention trends early.' })}
      </div>`}`;
}

export function wirePeopleOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="leave-filter"]', (e, el) => { state.leaveFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="exp-filter"]', (e, el) => { state.expenseFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="tr-filter"]', (e, el) => { state.trainingFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="leave-new"]', async () => {
    const made = await formDialog({
      title: 'Request Leave',
      submitLabel: 'Submit Request',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" value="${state.session.me.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Leave Type</span><select class="k-input" name="leave_type">${LEAVE_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Start Date</span><input class="k-input" type="date" name="start_date" value="${addDays(today(), 7)}" required></label>
          <label class="k-field"><span class="k-field__label">End Date</span><input class="k-input" type="date" name="end_date" value="${addDays(today(), 9)}" required></label>
          <label class="k-field"><span class="k-field__label">Total Days</span><input class="k-input" type="number" step="0.5" min="0.5" name="total_days" value="3" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Manager</span><input class="k-input" name="manager_name"></label>
        <label class="k-field"><span class="k-field__label">Reason / Handover Notes</span><textarea class="k-input" name="reason" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/leave', v),
    });
    if (made) { toast.success('Leave request submitted.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="leave-status"]', async (e, el) => {
    try { await api.post('/api/leave/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Leave ${el.dataset.status.toLowerCase()}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="leave-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete leave request?', message: 'Remove this leave record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/leave', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="rev-new"]', async () => {
    const made = await formDialog({
      title: 'New Performance Review',
      submitLabel: 'Save Review',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" required></label>
          <label class="k-field"><span class="k-field__label">Review Period</span><select class="k-input" name="review_period">${REVIEW_PERIODS.map((p) => html`<option value="${p}" ${p === 'Annual' ? 'selected' : ''}>${p}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Reviewer</span><input class="k-input" name="reviewer_name" value="${state.session.me.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Review Date</span><input class="k-input" type="date" name="review_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Goals Met</span><select class="k-input" name="goals_met">${GOALS_MET.map((g) => html`<option value="${g}" ${g === 'Met All Goals' ? 'selected' : ''}>${g}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Job Knowledge (1–5)</span><input class="k-input" type="number" min="1" max="5" name="job_knowledge" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Quality (1–5)</span><input class="k-input" type="number" min="1" max="5" name="quality_of_work" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Productivity (1–5)</span><input class="k-input" type="number" min="1" max="5" name="productivity" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Teamwork (1–5)</span><input class="k-input" type="number" min="1" max="5" name="teamwork" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Initiative (1–5)</span><input class="k-input" type="number" min="1" max="5" name="initiative" value="4" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Strengths</span><textarea class="k-input" name="strengths" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Areas for Improvement</span><textarea class="k-input" name="areas_for_improvement" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Goals for Next Period</span><textarea class="k-input" name="goals_next_period" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/reviews', v),
    });
    if (made) { toast.success(`Review saved (Overall ${made.review.overall_rating}/5).`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="rev-print"]', (e, el) => {
    const r = state.reviews.find((x) => String(x.id) === el.dataset.id);
    if (!r) return;
    downloadHtmlDoc(`review-${r.employee_name.toLowerCase().replaceAll(' ', '-')}-${r.review_date}.html`, {
      title: `Performance Review · ${r.employee_name}`,
      businessName: state.session.settings.business_name,
      subtitle: `${r.review_period} · Reviewer: ${r.reviewer_name} · ${fmtDay(r.review_date)}`,
      accent: '#823462',
      bodyHtml: `
        <table>
          <tr><th>Job Knowledge</th><td class="num">${r.job_knowledge} / 5</td></tr>
          <tr><th>Quality of Work</th><td class="num">${r.quality_of_work} / 5</td></tr>
          <tr><th>Productivity</th><td class="num">${r.productivity} / 5</td></tr>
          <tr><th>Teamwork &amp; Collaboration</th><td class="num">${r.teamwork} / 5</td></tr>
          <tr><th>Initiative &amp; Leadership</th><td class="num">${r.initiative} / 5</td></tr>
          <tr class="total-row"><td>Overall Rating (${esc(r.goals_met)})</td><td class="num">${r.overall_rating} / 5</td></tr>
        </table>
        ${r.strengths ? `<div class="box"><strong>Strengths:</strong> ${esc(r.strengths)}</div>` : ''}
        ${r.areas_for_improvement ? `<div class="box"><strong>Areas for Improvement:</strong> ${esc(r.areas_for_improvement)}</div>` : ''}
        ${r.goals_next_period ? `<div class="box"><strong>Next Period Goals:</strong> ${esc(r.goals_next_period)}</div>` : ''}`,
    });
  });

  on(root, 'click', '[data-action="rev-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete review?', message: 'Delete this performance review?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/reviews', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="exp-new"]', async () => {
    const made = await formDialog({
      title: 'Submit Expense Claim',
      submitLabel: 'Submit Claim',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" value="${state.session.me.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Expense Date</span><input class="k-input" type="date" name="expense_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${EXP_CATS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" required></label>
          <label class="k-field"><span class="k-field__label">Project / Cost Code</span><input class="k-input" name="project_code" placeholder="e.g. Q4-OPS"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><input class="k-input" name="description" required></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/expenses', v),
    });
    if (made) { toast.success('Expense claim submitted.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="exp-status"]', async (e, el) => {
    try { await api.post('/api/expenses/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Claim marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="exp-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete expense claim?', message: 'Delete this claim?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/expenses', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="tr-new"]', async () => {
    const made = await formDialog({
      title: 'Request Training & Development',
      submitLabel: 'Submit Request',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" value="${state.session.me.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Training Type</span><select class="k-input" name="training_type">${TRAIN_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Course / Program</span><input class="k-input" name="course_name" required></label>
          <label class="k-field"><span class="k-field__label">Provider</span><input class="k-input" name="provider"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Start Date</span><input class="k-input" type="date" name="start_date" value="${addDays(today(), 14)}" required></label>
          <label class="k-field"><span class="k-field__label">Estimated Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Business Justification</span><textarea class="k-input" name="justification" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/training', v),
    });
    if (made) { toast.success('Training request submitted.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="tr-status"]', async (e, el) => {
    try { await api.post('/api/training/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Training marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="tr-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete training request?', message: 'Delete this training request?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/training', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="exit-new"]', async () => {
    const made = await formDialog({
      title: 'Record Exit Interview',
      submitLabel: 'Save Exit Interview',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Employee Name</span><input class="k-input" name="employee_name" required></label>
          <label class="k-field"><span class="k-field__label">Department</span><select class="k-input" name="department">${DEPARTMENTS.map((d) => html`<option value="${d}">${d}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Last Day</span><input class="k-input" type="date" name="last_day" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Tenure (Years)</span><input class="k-input" type="number" step="0.5" min="0" name="tenure_years" value="2" required></label>
          <label class="k-field"><span class="k-field__label">Primary Reason</span><select class="k-input" name="reason_for_leaving">${EXIT_REASONS.map((r) => html`<option value="${r}">${r}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Satisfaction (1–5)</span><input class="k-input" type="number" min="1" max="5" name="overall_satisfaction" value="4" required></label>
          <label class="k-field"><span class="k-field__label">Management (1–5)</span><input class="k-input" type="number" min="1" max="5" name="management_rating" value="4"></label>
          <label class="k-field"><span class="k-field__label">Culture (1–5)</span><input class="k-input" type="number" min="1" max="5" name="culture_rating" value="4"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Would Return?</span><select class="k-input" name="would_return"><option>Yes</option><option>Maybe</option><option>No</option></select></label>
          <label class="k-field"><span class="k-field__label">Would Recommend?</span><select class="k-input" name="would_recommend"><option>Yes</option><option>Maybe</option><option>No</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">What did they enjoy most?</span><textarea class="k-input" name="what_enjoyed" rows="2"></textarea></label>
        <label class="k-field"><span class="k-field__label">Suggestions for improvement</span><textarea class="k-input" name="suggestions" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/exits', v),
    });
    if (made) { toast.success('Exit interview saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="exit-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete exit interview?', message: 'Delete this record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/exits', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
