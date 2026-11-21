// Bug Reports Tracker, Feature Requests Board (Tactile Upvote Counters & Impact Meter),
// Customer Feedback & Segmented NPS Bar, Knowledge Base (Pass 3 Unified Indigo & Signal Coral Mastheads).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { fmtDay, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const BUG_PRODUCTS = ['Web Application', 'Mobile App (iOS)', 'Mobile App (Android)', 'Desktop Application', 'API', 'Other'];
const BUG_SEVS = ['Critical', 'High', 'Medium', 'Low'];
const BUG_STATUSES = ['New', 'Triaged', 'In Fix', 'Verified', 'Closed'];
const FEAT_PRIOS = ['Nice to Have', 'Important', 'Critical'];
const FEAT_STATUSES = ['Under Review', 'Planned', 'Shipped', 'Declined'];
const KB_CATS = ['Getting Started', 'Account Management', 'Billing & Payments', 'Technical', 'Troubleshooting', 'How-To Guide', 'FAQ', 'Policy'];
const KB_STATUSES = ['Published', 'Draft', 'Needs Review', 'Archived'];

function npsHealthBadge(sum) {
  if (!sum.total) return html`<span class="tk-tag">Awaiting surveys</span>`;
  if (sum.nps >= 50) return html`<span class="tk-tag tk-tag--ok">World-Class</span>`;
  if (sum.nps >= 20) return html`<span class="tk-tag tk-tag--ok">Strong</span>`;
  if (sum.nps >= 0) return html`<span class="tk-tag tk-tag--warn">Positive</span>`;
  return html`<span class="tk-tag tk-tag--bad">Needs Focus</span>`;
}

export function renderBugsView(state) {
  const rows = state.bugs.filter((b) => {
    if (state.bugSeverity !== 'All' && b.severity !== state.bugSeverity) return false;
    if (state.bugProduct !== 'All' && b.product !== state.bugProduct) return false;
    return true;
  });
  const openBugs = state.bugs.filter((b) => b.status !== 'Verified' && b.status !== 'Closed');
  const critCount = openBugs.filter((b) => b.severity === 'Critical').length;
  const fixedCount = state.bugs.filter((b) => b.status === 'Verified' || b.status === 'Closed').length;
  const countSev = (s) => s === 'All' ? state.bugs.length : state.bugs.filter((b) => b.severity === s).length;

  return html`
    <section class="cs-masthead" aria-label="Bug Reports Tracker">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${critCount > 0 ? '#f43f5e' : '#38bdf8'}"></span>
          ENGINEERING TRIAGE · ${openBugs.length} OPEN DEFECT${openBugs.length === 1 ? '' : 'S'}
        </div>
        <h1 class="cs-masthead__title">Bug Reports</h1>
        <div class="cs-masthead__meta">
          <span>Reproducible steps with Expected vs Actual diff cards</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>5-stage defect lifecycle tracking</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="${cls('cs-pod', { 'cs-pod--coral': critCount > 0, 'cs-pod--indigo': critCount === 0 })}">
          <span class="cs-pod__lbl">Open Defects</span>
          <span class="cs-pod__val">${openBugs.length}</span>
          <span class="cs-pod__sub">${critCount > 0 ? `${critCount} critical` : 'Zero critical'}</span>
        </div>
        <div class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">Verified / Closed</span>
          <span class="cs-pod__val">${fixedCount}</span>
          <span class="cs-pod__sub">of ${state.bugs.length} logged</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="bug-new">${icon('plus', { size: 15 })} Report Bug</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...BUG_SEVS].map((s) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.bugSeverity === s })}" data-action="bug-sev-filter" data-sev="${s}">${s} (${countSev(s)})</button>`)}
      </div>
      <select class="k-input" style="width:auto;min-height:36px;padding:4px 10px" data-change="bug-prod-filter" aria-label="Filter by product">
        <option value="All" ${state.bugProduct === 'All' ? 'selected' : ''}>All Products</option>
        ${BUG_PRODUCTS.map((p) => html`<option value="${p}" ${state.bugProduct === p ? 'selected' : ''}>${p}</option>`)}
      </select>
    </div>

    ${state.loading && !state.bugs.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((b) => {
          const stIdx = Math.max(0, BUG_STATUSES.indexOf(b.status));
          const cardTone = (b.status === 'Verified' || b.status === 'Closed')
            ? 'cs-banded-card--ok'
            : b.severity === 'Critical' ? 'cs-banded-card--bad' : b.severity === 'High' ? 'cs-banded-card--warn' : '';
          return html`
            <article class="cs-banded-card ${cardTone}" data-key="bug-${b.id}">
              <div class="tk-card__head" style="flex-wrap:wrap">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="tkt-num">${b.bug_number}</span>
                    <span>${b.bug_title}</span>
                    <span class="tk-tag ${b.severity === 'Critical' ? 'tk-tag--bad' : b.severity === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${b.severity}</span>
                    <span class="tk-tag">${b.product}</span>
                    ${b.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta" style="margin-top:4px">
                    <span>Reported by ${b.reporter_name}</span>
                    ${b.browser_os ? html`<span>Env: ${b.browser_os}</span>` : ''}
                    <span>${ago(b.created_at)}</span>
                  </div>
                </div>
                <div class="tk-btn-row">
                  <select class="k-input" style="width:auto;min-height:34px;padding:4px 8px" data-change="bug-status" data-id="${b.id}">
                    ${BUG_STATUSES.map((st) => html`<option value="${st}" ${st === b.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="bug-del" data-id="${b.id}">Delete</button>
                </div>
              </div>
              <div style="font-size:13.5px;white-space:pre-line"><strong>Steps to Reproduce:</strong>\n${b.steps_to_reproduce}</div>
              <div class="bug-diff">
                <div class="bug-box bug-box--exp"><div class="bug-box__lbl">Expected Behavior</div>${b.expected_behavior}</div>
                <div class="bug-box bug-box--act"><div class="bug-box__lbl">Actual Behavior</div>${b.actual_behavior}</div>
              </div>
              <div class="cs-stepper">
                ${BUG_STATUSES.map((st, idx) => html`
                  <div class="cs-step ${idx < stIdx ? 'is-done' : idx === stIdx ? (st === 'Verified' || st === 'Closed' ? 'is-done' : 'is-now') : ''}">${st}</div>`)}
              </div>
            </article>`;
        }) : emptyState({ iconName: 'bug', title: 'No bugs matching filter', text: 'Log reproducible product bugs for engineering triage.' })}
      </div>`}`;
}

export function renderFeaturesView(state) {
  const rows = state.featureStatus === 'All'
    ? state.features
    : state.features.filter((f) => f.status === state.featureStatus);
  const upvotedSet = new Set(state.upvotedIds || []);
  const totalVotes = state.features.reduce((s, f) => s + Number(f.upvotes || 0), 0);
  const shippedOrPlanned = state.features.filter((f) => f.status === 'Planned' || f.status === 'Shipped').length;
  const countF = (st) => st === 'All' ? state.features.length : state.features.filter((f) => f.status === st).length;

  return html`
    <section class="cs-masthead" aria-label="Feature Requests Board">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#38bdf8"></span>
          PRODUCT VOICE · ${state.features.length} IDEA${state.features.length === 1 ? '' : 'S'}
        </div>
        <h1 class="cs-masthead__title">Feature Board</h1>
        <div class="cs-masthead__meta">
          <span>Tactile customer upvoting &amp; 1–5 business impact scoring</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Track requests from Review to Shipped</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="cs-pod cs-pod--indigo">
          <span class="cs-pod__lbl">Total Upvotes</span>
          <span class="cs-pod__val">${totalVotes}</span>
          <span class="cs-pod__sub">Customer demand</span>
        </div>
        <div class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">Planned / Shipped</span>
          <span class="cs-pod__val">${shippedOrPlanned}</span>
          <span class="cs-pod__sub">On roadmap</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="feat-new">${icon('plus', { size: 15 })} Add Request</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...FEAT_STATUSES].map((st) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.featureStatus === st })}" data-action="feat-filter" data-status="${st}">${st} (${countF(st)})</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.features.length ? skeleton(4) : rows.length ? rows.map((f) => {
        const impact = Math.max(1, Math.min(5, Number(f.impact_score || 3)));
        return html`
          <div class="tk-row" data-key="ft-${f.id}">
            <button type="button" class="${cls('upvote-btn', { 'is-upvoted': upvotedSet.has(Number(f.id)) })}" data-action="feat-upvote" data-id="${f.id}" aria-label="Upvote ${f.feature_title}">
              <span class="upvote-btn__top"><span class="upvote-btn__arrow">▲</span><span>${f.upvotes}</span></span>
              <span class="upvote-btn__lbl">${upvotedSet.has(Number(f.id)) ? 'Voted' : 'Upvote'}</span>
            </button>
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${f.feature_title}</span>
                <span class="tk-tag ${f.status === 'Shipped' ? 'tk-tag--ok' : f.status === 'Planned' ? 'tk-tag--accent' : f.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--info'}">${f.status}</span>
                <span class="tk-tag ${f.priority === 'Critical' ? 'tk-tag--bad' : f.priority === 'Important' ? 'tk-tag--warn' : ''}">${f.priority}</span>
                ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div style="font-size:13.75px">${f.description}</div>
              <div class="tk-row__meta">
                <span><strong>Use case:</strong> ${f.use_case}</span>
                <span>By ${f.submitter_name}</span>
                <span style="display:inline-flex;align-items:center;gap:5px">
                  Impact ${impact}/5
                  <span class="cs-impact-dots" aria-hidden="true">
                    ${[1, 2, 3, 4, 5].map((n) => html`<span class="${cls('cs-impact-dot', { 'is-on': n <= impact })}"></span>`)}
                  </span>
                </span>
              </div>
            </div>
            <div class="tk-row__aside">
              <select class="k-input" style="width:auto;min-height:34px;padding:4px 8px" data-change="feat-status" data-id="${f.id}">
                ${FEAT_STATUSES.map((st) => html`<option value="${st}" ${st === f.status ? 'selected' : ''}>${st}</option>`)}
              </select>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="feat-del" data-id="${f.id}">Delete</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'sparkle', title: 'No feature requests', text: 'Capture customer ideas and upvote the highest-impact requests.' })}
    </section>`;
}

export function renderFeedbackView(state) {
  const sum = state.npsSummary || {
    total: 0, promoters: 0, passives: 0, detractors: 0,
    promoterPct: 0, passivePct: 0, detractorPct: 0, nps: 0,
    avgSatisfaction: 0, avgResponse: 0, avgResolution: 0, avgAgent: 0,
  };
  const npsTone = sum.nps >= 30 ? 'nps-dial__num--good' : sum.nps >= 0 ? 'nps-dial__num--mid' : 'nps-dial__num--bad';
  const ringColor = sum.promoterPct >= 60 ? '#34d399' : sum.promoterPct >= 35 ? '#fbbf24' : '#f43f5e';

  return html`
    <section class="cs-masthead" aria-label="Customer Feedback and Live NPS">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          LOYALTY TELEMETRY · ${sum.total} SURVEY${sum.total === 1 ? '' : 'S'}
        </div>
        <h1 class="cs-masthead__title">Feedback &amp; Live NPS</h1>
        <div class="cs-masthead__meta">
          <span>Auto-computes Promoter (9–10), Passive (7–8) &amp; Detractor (0–6) mix</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live CSAT &amp; agent scores</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="cs-pod cs-pod--ring">
          <div class="tk-ring" style="--p:${sum.promoterPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${sum.promoterPct}%</span>
          </div>
          <div>
            <span class="cs-pod__lbl">Promoters</span>
            <div class="cs-pod__val" style="font-size:15px">${sum.promoters} of ${sum.total}</div>
            <span class="cs-pod__sub">Scores 9–10</span>
          </div>
        </div>
        <div class="cs-pod ${sum.nps >= 20 ? 'cs-pod--mint' : sum.nps < 0 ? 'cs-pod--coral' : 'cs-pod--indigo'}">
          <span class="cs-pod__lbl">Live NPS</span>
          <span class="cs-pod__val">${sum.total ? (sum.nps > 0 ? '+' + sum.nps : sum.nps) : '—'}</span>
          <span class="cs-pod__sub">Net Promoter</span>
        </div>
        <div class="cs-pod">
          <span class="cs-pod__lbl">Avg CSAT</span>
          <span class="cs-pod__val">${sum.avgSatisfaction}/5</span>
          <span class="cs-pod__sub">Agent ${sum.avgAgent}/5</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="fb-new">${icon('plus', { size: 15 })} Record Survey</button>
      </div>
    </section>

    ${state.loading && !state.feedback.length && !state.npsSummary ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <div class="nps-hero">
        <div class="nps-dial">
          <span class="tk-muted" style="font-size:11.5px;font-weight:750;text-transform:uppercase;letter-spacing:.05em">Live NPS Score</span>
          <span class="nps-dial__num ${npsTone}">${sum.total ? (sum.nps > 0 ? '+' + sum.nps : sum.nps) : '—'}</span>
          ${npsHealthBadge(sum)}
          <span class="tk-muted" style="font-size:12px">${sum.total} survey response${sum.total === 1 ? '' : 's'}</span>
        </div>
        <div>
          <div class="tk-kv">
            <div class="tk-kv__item"><span class="tk-kv__k">Promoters (9–10)</span><span class="tk-kv__v tk-ok">${sum.promoters} (${sum.promoterPct}%)</span></div>
            <div class="tk-kv__item"><span class="tk-kv__k">Passives (7–8)</span><span class="tk-kv__v" style="color:#b45309">${sum.passives} (${sum.passivePct}%)</span></div>
            <div class="tk-kv__item"><span class="tk-kv__k">Detractors (0–6)</span><span class="tk-kv__v tk-danger">${sum.detractors} (${sum.detractorPct}%)</span></div>
            <div class="tk-kv__item"><span class="tk-kv__k">Avg CSAT</span><span class="tk-kv__v">${sum.avgSatisfaction} / 5</span></div>
            <div class="tk-kv__item"><span class="tk-kv__k">Response / Resolution</span><span class="tk-kv__v">${sum.avgResponse} / ${sum.avgResolution}</span></div>
            <div class="tk-kv__item"><span class="tk-kv__k">Agent Rating</span><span class="tk-kv__v">${sum.avgAgent} / 5</span></div>
          </div>

          <div class="nps-bar-wrap">
            <div class="nps-splitbar" role="img" aria-label="NPS breakdown: ${sum.promoterPct}% Promoters, ${sum.passivePct}% Passives, ${sum.detractorPct}% Detractors">
              ${sum.promoterPct > 0 ? html`<div class="nps-seg nps-seg--pro" style="width:${sum.promoterPct}%">${sum.promoterPct >= 10 ? sum.promoterPct + '%' : ''}</div>` : ''}
              ${sum.passivePct > 0 ? html`<div class="nps-seg nps-seg--pas" style="width:${sum.passivePct}%">${sum.passivePct >= 10 ? sum.passivePct + '%' : ''}</div>` : ''}
              ${sum.detractorPct > 0 ? html`<div class="nps-seg nps-seg--det" style="width:${sum.detractorPct}%">${sum.detractorPct >= 10 ? sum.detractorPct + '%' : ''}</div>` : ''}
            </div>
            <div class="nps-legend">
              <span class="nps-legend__item"><span class="nps-legend__dot nps-legend__dot--pro"></span><strong>${sum.promoterPct}%</strong> Promoters (9–10)</span>
              <span class="nps-legend__item"><span class="nps-legend__dot nps-legend__dot--pas"></span><strong>${sum.passivePct}%</strong> Passives (7–8)</span>
              <span class="nps-legend__item"><span class="nps-legend__dot nps-legend__dot--det"></span><strong>${sum.detractorPct}%</strong> Detractors (0–6)</span>
            </div>
          </div>
        </div>
      </div>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('smile', { size: 17 })} Survey Responses</h2><span class="tk-sheet__count">${state.feedback.length}</span></div>
        <div>
          ${state.feedback.length ? state.feedback.map((f) => html`
            <div class="tk-row" data-key="fb-${f.id}">
              <div class="tk-row__main">
                <div class="tk-row__title">
                  <span>${f.customer_name}</span>
                  ${f.ticket_number ? html`<span class="tkt-num">${f.ticket_number}</span>` : ''}
                  <span class="tk-tag ${f.nps_category === 'Promoter' ? 'tk-tag--ok' : f.nps_category === 'Passive' ? 'tk-tag--warn' : 'tk-tag--bad'}">NPS ${f.nps_score}/10 · ${f.nps_category}</span>
                  <span class="tk-tag">CSAT ${f.overall_satisfaction}/5</span>
                  ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta">
                  <span>Response: ${f.response_time_rating}/5</span>
                  <span>Resolution: ${f.resolution_rating}/5</span>
                  <span>Agent: ${f.agent_rating}/5</span>
                  <span>Would return: ${f.would_recommend}</span>
                </div>
                ${f.comments ? html`<div style="font-size:13.75px;margin-top:4px">"${f.comments}"</div>` : ''}
              </div>
              <div class="tk-row__aside">
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="fb-del" data-id="${f.id}">Delete</button>
              </div>
            </div>`) : emptyState({ iconName: 'smile', title: 'No feedback recorded yet', text: 'Log customer CSAT and NPS responses to calculate your live Net Promoter Score.' })}
        </div>
      </section>`}`;
}

export function renderKbView(state) {
  const q = state.kbSearch.trim().toLowerCase();
  const rows = state.kb.filter((a) => {
    if (state.kbCategory !== 'All' && a.category !== state.kbCategory) return false;
    if (!q) return true;
    return [a.title, a.question, a.answer, a.keywords].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const pubCount = state.kb.filter((a) => a.status === 'Published').length;
  const catSet = new Set(state.kb.map((a) => a.category).filter(Boolean));
  const countCat = (c) => c === 'All' ? state.kb.length : state.kb.filter((a) => a.category === c).length;

  return html`
    <section class="cs-masthead" aria-label="Knowledge Base">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#38bdf8"></span>
          CANNED REPLIES &amp; SELF-HELP · ${pubCount} LIVE MACRO${pubCount === 1 ? '' : 'S'}
        </div>
        <h1 class="cs-masthead__title">Knowledge Base</h1>
        <div class="cs-masthead__meta">
          <span>Search by keyword or category for 1-click ticket reply macros</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Published articles auto-sync to the Ticket Queue</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">Published</span>
          <span class="cs-pod__val">${pubCount}</span>
          <span class="cs-pod__sub">Active macros</span>
        </div>
        <div class="cs-pod cs-pod--indigo">
          <span class="cs-pod__lbl">Categories</span>
          <span class="cs-pod__val">${catSet.size}</span>
          <span class="cs-pod__sub">${state.kb.length} total articles</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="kb-new">${icon('plus', { size: 15 })} New Article</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search title, question, keywords…" value="${state.kbSearch}" data-input="kb-search">
      </div>
      <div class="tk-segmented">
        ${['All', ...KB_CATS].map((c) => html`<button type="button" class="${cls('tk-pill', { 'is-on': state.kbCategory === c })}" data-action="kb-cat-filter" data-cat="${c}">${c} (${countCat(c)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.kb.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-cards">
        ${rows.length ? rows.map((a) => html`
          <article class="tk-card" data-key="kb-${a.id}">
            <div class="tk-card__head">
              <div>
                <h2 class="tk-card__title">${a.title}</h2>
                <div class="tk-card__sub">${a.question}</div>
              </div>
              <div class="tk-btn-row">
                <span class="tk-tag tk-tag--accent">${a.category}</span>
                <span class="tk-tag ${a.status === 'Published' ? 'tk-tag--ok' : 'tk-tag--warn'}">${a.status}</span>
                ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
            </div>
            <div class="kb-answer">${a.answer}</div>
            <div class="tk-ticket__foot">
              <div class="tk-row__meta">
                ${a.keywords ? html`<span>${a.keywords}</span>` : ''}
                <span>By ${a.author}</span>
                ${a.last_reviewed ? html`<span>Reviewed ${fmtDay(a.last_reviewed)}</span>` : ''}
              </div>
              <div class="tk-btn-row">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="kb-copy" data-id="${a.id}">${icon('copy', { size: 14 })} Copy Answer</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="kb-edit" data-id="${a.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="kb-del" data-id="${a.id}">Delete</button>
              </div>
            </div>
          </article>`) : emptyState({ iconName: 'book', title: 'No Knowledge Base articles match', text: 'Write reusable troubleshooting and policy answers for your team.' })}
      </div>`}`;
}

export function wireProductKbActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="bug-sev-filter"]', (e, el) => { state.bugSeverity = el.dataset.sev; draw(); });
  on(root, 'change', '[data-change="bug-prod-filter"]', (e, el) => { state.bugProduct = el.value; draw(); });

  on(root, 'click', '[data-action="bug-new"]', async () => {
    const made = await formDialog({
      title: 'Report Software Bug',
      submitLabel: 'Log Bug',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Reporter</span><input class="k-input" name="reporter_name" required></label>
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Product</span><select class="k-input" name="product">${BUG_PRODUCTS.map((p) => html`<option value="${p}">${p}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${BUG_SEVS.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Browser / OS</span><input class="k-input" name="browser_os" placeholder="Chrome 130 / macOS"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Bug Title</span><input class="k-input" name="bug_title" required></label>
        <label class="k-field"><span class="k-field__label">Steps to Reproduce</span><textarea class="k-input" name="steps_to_reproduce" rows="3" required></textarea></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Expected Behavior</span><textarea class="k-input" name="expected_behavior" rows="2" required></textarea></label>
          <label class="k-field"><span class="k-field__label">Actual Behavior</span><textarea class="k-input" name="actual_behavior" rows="2" required></textarea></label>
        </div>`,
      onSubmit: (v) => api.post('/api/bugs', v),
    });
    if (made) { toast.success(`Bug ${made.bug.bug_number} logged.`); await loadScreen(); }
  });

  on(root, 'change', '[data-change="bug-status"]', async (e, el) => {
    try { await api.put('/api/bugs', { id: Number(el.dataset.id), status: el.value }); toast.success(`Bug marked ${el.value}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="bug-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete bug report?', message: 'Remove this bug report permanently?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/bugs', { id: Number(el.dataset.id) }); toast.success('Bug deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="feat-filter"]', (e, el) => { state.featureStatus = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="feat-new"]', async () => {
    const made = await formDialog({
      title: 'Add Feature Request',
      submitLabel: 'Submit Request',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Submitter</span><input class="k-input" name="submitter_name" required></label>
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Feature Title</span><input class="k-input" name="feature_title" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority">${FEAT_PRIOS.map((p) => html`<option value="${p}" ${p === 'Important' ? 'selected' : ''}>${p}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Impact Score (1–5)</span><input class="k-input" type="number" min="1" max="5" name="impact_score" value="4" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="2" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Use Case</span><textarea class="k-input" name="use_case" rows="2" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/features', v),
    });
    if (made) { toast.success('Feature request added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="feat-upvote"]', async (e, el) => {
    const id = Number(el.dataset.id);
    try {
      await api.post('/api/features/upvote', { id });
      if (!state.upvotedIds.includes(id)) state.upvotedIds.push(id);
      toast.success('Upvoted!');
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'change', '[data-change="feat-status"]', async (e, el) => {
    try { await api.post('/api/features/status', { id: Number(el.dataset.id), status: el.value }); toast.success(`Moved to ${el.value}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="feat-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete feature request?', message: 'Remove this feature request?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/features', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="fb-new"]', async () => {
    const made = await formDialog({
      title: 'Record Customer Feedback',
      submitLabel: 'Save Feedback',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="customer_name" required></label>
          <label class="k-field"><span class="k-field__label">Related Ticket</span>
            <select class="k-input" name="ticket_id">
              <option value="">General feedback</option>
              ${state.tickets.map((t) => html`<option value="${t.id}">${t.ticket_number} — ${t.customer_name}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">NPS Score (0–10)</span><input class="k-input" type="number" min="0" max="10" name="nps_score" value="9" required></label>
          <label class="k-field"><span class="k-field__label">Overall CSAT (1–5)</span><input class="k-input" type="number" min="1" max="5" name="overall_satisfaction" value="5" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Response Time (1–5)</span><input class="k-input" type="number" min="1" max="5" name="response_time_rating" value="5"></label>
          <label class="k-field"><span class="k-field__label">Resolution (1–5)</span><input class="k-input" type="number" min="1" max="5" name="resolution_rating" value="5"></label>
          <label class="k-field"><span class="k-field__label">Agent Rating (1–5)</span><input class="k-input" type="number" min="1" max="5" name="agent_rating" value="5"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Would use support again?</span>
          <select class="k-input" name="would_recommend"><option value="Yes">Yes</option><option value="Maybe">Maybe</option><option value="No">No</option></select>
        </label>
        <label class="k-field"><span class="k-field__label">Comments</span><textarea class="k-input" name="comments" rows="3"></textarea></label>`,
      onSubmit: (v) => api.post('/api/feedback', v),
    });
    if (made) { toast.success(`Feedback saved (${made.entry.nps_category}). Live NPS: ${made.summary.nps}`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="fb-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete feedback entry?', message: 'This recalculates the live NPS score.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/feedback', { id: Number(el.dataset.id) }); toast.success('Feedback removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'input', '[data-input="kb-search"]', (e, el) => { state.kbSearch = el.value; draw(); });
  on(root, 'click', '[data-action="kb-cat-filter"]', (e, el) => { state.kbCategory = el.dataset.cat; draw(); });

  const kbFields = (a = {}) => html`
    <label class="k-field"><span class="k-field__label">Article Title</span><input class="k-input" name="title" value="${a.title || ''}" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${KB_CATS.map((c) => html`<option value="${c}" ${c === (a.category || 'FAQ') ? 'selected' : ''}>${c}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${KB_STATUSES.map((s) => html`<option value="${s}" ${s === (a.status || 'Published') ? 'selected' : ''}>${s}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Customer Question</span><input class="k-input" name="question" value="${a.question || ''}" required></label>
    <label class="k-field"><span class="k-field__label">Answer / Solution</span><textarea class="k-input" name="answer" rows="5" required>${a.answer || ''}</textarea></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Keywords</span><input class="k-input" name="keywords" value="${a.keywords || ''}" placeholder="billing, refund, login"></label>
      <label class="k-field"><span class="k-field__label">Author</span><input class="k-input" name="author" value="${a.author || ''}"></label>
    </div>`;

  on(root, 'click', '[data-action="kb-new"]', async () => {
    const made = await formDialog({ title: 'New Knowledge Base Article', submitLabel: 'Publish Article', fields: kbFields(), onSubmit: (v) => api.post('/api/kb', v) });
    if (made) { toast.success('KB article saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="kb-edit"]', async (e, el) => {
    const a = state.kb.find((x) => String(x.id) === el.dataset.id);
    if (!a) return;
    const saved = await formDialog({ title: 'Edit KB Article', submitLabel: 'Save Changes', fields: kbFields(a), onSubmit: (v) => api.put('/api/kb', { ...v, id: a.id }) });
    if (saved) { toast.success('KB article updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="kb-copy"]', (e, el) => {
    const a = state.kb.find((x) => String(x.id) === el.dataset.id);
    if (a) copyText(a.answer, { title: a.title, done: 'KB answer copied!' });
  });

  on(root, 'click', '[data-action="kb-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete article?', message: 'Remove this Knowledge Base article permanently?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/kb', { id: Number(el.dataset.id) }); toast.success('Article deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
