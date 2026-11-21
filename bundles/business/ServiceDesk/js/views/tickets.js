// Support Ticket Queue Command (Pass 3 Indigo & Signal Coral SLA, Priority-Banded Cards with 1-Click Resolve/Assign,
// Inline Expandable Triage & KB Macro Composer, Sticky Escalations & Product Pulse Rail), Escalations & Refunds views.
import { html, on, cls, qs, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, ago, toMs, fmtDuration } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, openDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const TICKET_CATS = ['Billing', 'Technical', 'General Inquiry', 'Account', 'Shipping / Delivery', 'Other'];
const TICKET_PRIOS = ['Urgent', 'High', 'Medium', 'Low'];
const TICKET_STATUSES = ['Open', 'In Progress', 'Waiting on Customer', 'Escalated', 'Resolved', 'Closed'];
const QUICK_FILTERS = ['All', 'Open', 'Escalated', 'Waiting', 'Urgent', 'Resolved'];
const ESC_REASONS = ['SLA Breach', 'Customer Dissatisfied', 'Complex Technical Issue', 'Repeated Contact', 'Legal / Compliance', 'VIP Customer', 'Other'];
const ESC_URGENCIES = ['Critical (immediate)', 'High (within 4h)', 'Medium (within 24h)', 'Low (within 48h)'];
const REFUND_REASONS = ['Defective / Damaged', 'Wrong Item Received', 'Not as Described', 'No Longer Needed', 'Billing Error', 'Other'];
const REFUND_METHODS = ['Original Payment Method', 'Store Credit', 'Bank Transfer', 'Check'];

const SLA_TARGET_MINS = { Urgent: 120, High: 240, Medium: 1440, Low: 2880 };

function prioTag(p) {
  if (p === 'Urgent') return 'tk-tag--bad';
  if (p === 'High') return 'tk-tag--warn';
  if (p === 'Medium') return 'tk-tag--info';
  return '';
}

function statusTag(s) {
  if (s === 'Escalated') return 'tk-tag--bad';
  if (s === 'Resolved' || s === 'Closed') return 'tk-tag--ok';
  if (s === 'Waiting on Customer') return 'tk-tag--warn';
  if (s === 'In Progress') return 'tk-tag--accent';
  return 'tk-tag--info';
}

function ticketCardClass(t, isOpen) {
  const isClosed = t.status === 'Resolved' || t.status === 'Closed';
  return cls('cs-tkt-card', {
    'is-open': isOpen,
    'cs-tkt-card--resolved': isClosed,
    'cs-tkt-card--urgent': !isClosed && (t.priority === 'Urgent' || t.status === 'Escalated'),
    'cs-tkt-card--high': !isClosed && t.priority === 'High' && t.status !== 'Escalated',
    'cs-tkt-card--medium': !isClosed && t.priority === 'Medium' && t.status !== 'Escalated',
  });
}

function renderSlaPill(t) {
  if (t.status === 'Resolved' || t.status === 'Closed') {
    return html`<span class="sla-pill sla-pill--met"><span class="sla-pill__dot"></span>SLA Met</span>`;
  }
  const targetMins = SLA_TARGET_MINS[t.priority] || 1440;
  const createdMs = toMs(t.created_at);
  const elapsedMins = Number.isFinite(createdMs) ? Math.max(0, Math.round((Date.now() - createdMs) / 60000)) : 0;
  const remainMins = targetMins - elapsedMins;
  if (remainMins <= 0) {
    return html`<span class="sla-pill sla-pill--breach"><span class="sla-pill__dot"></span>Breach +${fmtDuration(Math.abs(remainMins))}</span>`;
  }
  if (t.status === 'Escalated' || t.priority === 'Urgent' || remainMins <= Math.max(45, targetMins * 0.35)) {
    const tone = (t.priority === 'Urgent' || t.status === 'Escalated') ? 'sla-pill--breach' : 'sla-pill--warn';
    return html`<span class="sla-pill ${tone}"><span class="sla-pill__dot"></span>${fmtDuration(remainMins)} left</span>`;
  }
  if (t.priority === 'High') {
    return html`<span class="sla-pill sla-pill--warn"><span class="sla-pill__dot"></span>${fmtDuration(remainMins)} left</span>`;
  }
  return html`<span class="sla-pill sla-pill--ok"><span class="sla-pill__dot"></span>${fmtDuration(remainMins)} left</span>`;
}

function matchesQuickFilter(t, filter) {
  if (filter === 'All') return true;
  if (filter === 'Open') return t.status === 'Open' || t.status === 'In Progress';
  if (filter === 'Escalated') return t.status === 'Escalated';
  if (filter === 'Waiting') return t.status === 'Waiting on Customer';
  if (filter === 'Urgent') return t.priority === 'Urgent' && t.status !== 'Resolved' && t.status !== 'Closed';
  if (filter === 'Resolved') return t.status === 'Resolved' || t.status === 'Closed';
  return t.status === filter;
}

export function renderTicketsView(state) {
  const counts = state.session.counts || {};
  const settings = state.session.settings || {};
  const cur = settings.currency || 'USD';
  const myName = state.session.me?.displayName || 'Agent';

  const q = state.ticketSearch.trim().toLowerCase();
  const list = state.tickets.filter((t) => {
    if (!matchesQuickFilter(t, state.ticketStatus)) return false;
    if (state.ticketPriority !== 'All' && t.priority !== state.ticketPriority) return false;
    if (state.ticketCategory !== 'All' && t.category !== state.ticketCategory) return false;
    if (!q) return true;
    return [t.ticket_number, t.customer_name, t.email, t.subject, t.description].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const activeId = list.some((x) => x.id === state.selectedTicketId) ? state.selectedTicketId : (list[0]?.id || null);
  const publishedKb = (state.kb || []).filter((a) => !a.status || a.status === 'Published');
  const countFor = (f) => state.tickets.filter((t) => matchesQuickFilter(t, f)).length;

  const totalTickets = state.tickets.length;
  const openTickets = state.tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed');
  const breachedCount = openTickets.filter((t) => {
    const targetMins = SLA_TARGET_MINS[t.priority] || 1440;
    const createdMs = toMs(t.created_at);
    const elapsedMins = Number.isFinite(createdMs) ? Math.max(0, Math.round((Date.now() - createdMs) / 60000)) : 0;
    return targetMins - elapsedMins <= 0;
  }).length;
  const slaHealthPct = totalTickets > 0
    ? Math.max(0, Math.min(100, Math.round(((totalTickets - breachedCount) / totalTickets) * 100)))
    : 100;
  const slaRingColor = slaHealthPct >= 85 ? '#34d399' : slaHealthPct >= 65 ? '#fbbf24' : '#f43f5e';

  const activeEscs = (state.escalations || []).filter((e) => e.status === 'Active');
  const pendingRefunds = (state.refunds || []).filter((r) => r.status === 'Pending');
  const openBugs = (state.bugs || []).filter((b) => b.status !== 'Verified' && b.status !== 'Closed');

  return html`
    ${renderSampleBanner(counts.sampleCount || 0, { canClear: state.session.me.isOwner || state.session.me.role === 'manager' })}

    <section class="cs-masthead" aria-label="Service Desk Queue Command">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${breachedCount > 0 || activeEscs.length > 0 ? '#f43f5e' : '#38bdf8'}"></span>
          SLA COMMAND · ${publishedKb.length} KB MACRO${publishedKb.length === 1 ? '' : 'S'} READY
        </div>
        <h1 class="cs-masthead__title">${settings.business_name || 'Service Desk'}</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#93c5fd">${counts.openTickets ?? openTickets.length} open</strong> (${counts.urgentTickets || 0} urgent)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Click any ticket for KB macros &amp; triage</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="cs-pod cs-pod--ring">
          <div class="tk-ring" style="--p:${slaHealthPct}%;--ring-color:${slaRingColor};--ring-size:48px">
            <span class="tk-ring__val">${slaHealthPct}%</span>
          </div>
          <div>
            <span class="cs-pod__lbl">${icon('sla-clock', { size: 11 })} SLA Health</span>
            <div class="cs-pod__val" style="font-size:15px">${breachedCount > 0 ? `${breachedCount} breach` : 'On Target'}</div>
            <span class="cs-pod__sub">${openTickets.length} active ticket${openTickets.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <a href="#/escalations" class="${cls('cs-pod', { 'cs-pod--coral': (counts.activeEscalations || 0) > 0, 'cs-pod--indigo': !(counts.activeEscalations > 0) })}">
          <span class="cs-pod__lbl">${icon('escalate-bolt', { size: 12 })} Escalations</span>
          <span class="cs-pod__val">${counts.activeEscalations || 0}</span>
          <span class="cs-pod__sub">${(counts.activeEscalations || 0) > 0 ? 'Needs action →' : 'All clear →'}</span>
        </a>

        <a href="#/feedback" class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">${icon('smile', { size: 12 })} Live NPS</span>
          <span class="cs-pod__val">${counts.feedbackCount ? (counts.nps > 0 ? '+' + counts.nps : counts.nps) : '—'}</span>
          <span class="cs-pod__sub">${counts.feedbackCount || 0} survey${Number(counts.feedbackCount) === 1 ? '' : 's'} →</span>
        </a>

        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="ticket-new">${icon('plus', { size: 15 })} New Ticket</button>
      </div>
    </section>

    <div class="cs-split">
      <div class="tk-stack" style="gap:14px">
        <div class="tk-toolbar cs-toolbar" style="margin-bottom:0">
          <div class="tk-search">
            ${icon('search', { size: 16 })}
            <input type="search" placeholder="Search ticket #, customer, subject…" value="${state.ticketSearch}" data-input="ticket-search">
          </div>
          <div class="tk-segmented">
            ${QUICK_FILTERS.map((st) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.ticketStatus === st })}" data-action="ticket-status-filter" data-status="${st}">${st} (${countFor(st)})</button>`)}
          </div>
          <select class="k-input cs-toolbar-select" data-change="ticket-priority" aria-label="Filter by priority">
            <option value="All" ${state.ticketPriority === 'All' ? 'selected' : ''}>All Priorities</option>
            ${TICKET_PRIOS.map((p) => html`<option value="${p}" ${state.ticketPriority === p ? 'selected' : ''}>${p}</option>`)}
          </select>
          <select class="k-input cs-toolbar-select" data-change="ticket-category" aria-label="Filter by category">
            <option value="All" ${state.ticketCategory === 'All' ? 'selected' : ''}>All Categories</option>
            ${TICKET_CATS.map((c) => html`<option value="${c}" ${state.ticketCategory === c ? 'selected' : ''}>${c}</option>`)}
          </select>
        </div>

        ${state.loading && !state.tickets.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : list.length ? html`
          <div class="cs-ticket-deck">
            ${list.map((t) => {
              const isOpen = activeId === t.id;
              const isClosed = t.status === 'Resolved' || t.status === 'Closed';
              const draft = state.composerDrafts[t.id] || '';
              return html`
                <article class="${ticketCardClass(t, isOpen)}" data-key="tk-${t.id}">
                  <div class="cs-tkt-card__summary" data-action="ticket-select" data-id="${t.id}">
                    <div class="cs-tkt-avatar">${initials(t.customer_name || 'CS')}</div>
                    <div class="cs-tkt-card__main">
                      <div class="tk-row__title">
                        <span class="tkt-num">${t.ticket_number}</span>
                        <span class="cs-tkt-card__title">${t.subject}</span>
                        ${renderSlaPill(t)}
                      </div>
                      <div class="tk-btn-row">
                        <span class="tk-tag ${prioTag(t.priority)}">${t.priority}</span>
                        <span class="tk-tag ${statusTag(t.status)}">${t.status}</span>
                        <span class="tk-tag">${t.category}</span>
                        ${t.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="tk-row__meta">
                        <span><strong>${t.customer_name}</strong> (${t.email})</span>
                        <span>${t.assigned_to ? 'Owner: ' + t.assigned_to : 'Unassigned'}</span>
                        <span>Updated ${ago(t.updated_at)}</span>
                      </div>
                    </div>
                    <div class="cs-tkt-card__actions">
                      ${!isClosed && t.assigned_to !== myName ? html`
                        <button type="button" class="k-btn k-btn--sm" data-action="ticket-quick-assign" data-id="${t.id}">Assign Me</button>` : ''}
                      ${!isClosed ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="ticket-quick-resolve" data-id="${t.id}">${icon('check', { size: 13 })} Resolve</button>` : ''}
                      <span class="k-btn k-btn--ghost k-btn--sm" aria-hidden="true">
                        ${icon(isOpen ? 'chevron-up' : 'chevron-down', { size: 14 })} ${isOpen ? 'Close' : 'Triage'}
                      </span>
                    </div>
                  </div>

                  ${isOpen ? html`
                    <div class="cs-tkt-drawer">
                      <div class="k-form__row">
                        <label class="k-field">
                          <span class="k-field__label">Status</span>
                          <select class="k-input" data-change="ticket-set-status" data-id="${t.id}">
                            ${TICKET_STATUSES.map((st) => html`<option value="${st}" ${st === t.status ? 'selected' : ''}>${st}</option>`)}
                          </select>
                        </label>
                        <label class="k-field">
                          <span class="k-field__label">Priority</span>
                          <select class="k-input" data-change="ticket-set-priority" data-id="${t.id}">
                            ${TICKET_PRIOS.map((p) => html`<option value="${p}" ${p === t.priority ? 'selected' : ''}>${p}</option>`)}
                          </select>
                        </label>
                        <label class="k-field">
                          <span class="k-field__label">Assigned Owner</span>
                          <input class="k-input" value="${t.assigned_to || ''}" placeholder="Assign agent…" data-blur="ticket-set-owner" data-id="${t.id}">
                        </label>
                      </div>

                      <div class="kb-answer">${t.description}</div>

                      <div class="tk-stack" style="gap:10px">
                        <div class="cs-triage-notes-head">
                          <span style="font-weight:750;font-size:13.5px">Internal Triage Notes (${(t.internal_notes || []).length})</span>
                          <div class="tk-btn-row">
                            <button type="button" class="k-btn k-btn--sm" data-action="insert-kb" data-id="${t.id}">${icon('book', { size: 14 })} Browse KB</button>
                            <button type="button" class="k-btn k-btn--danger k-btn--sm" data-action="ticket-escalate" data-id="${t.id}">${icon('escalate-bolt', { size: 14 })} Escalate</button>
                          </div>
                        </div>

                        <div class="triage-notes">
                          ${(t.internal_notes || []).length ? (t.internal_notes || []).map((n) => html`
                            <div class="triage-note">
                              <div class="triage-note__head"><span>${n.author}</span><span>${ago(n.ts)}</span></div>
                              <div style="white-space:pre-line">${n.body}</div>
                            </div>`) : html`<div class="tk-muted" style="font-size:13px">No internal notes yet — insert a KB macro or add triage notes below.</div>`}
                        </div>

                        <form class="reply-composer" data-form="ticket-note" data-id="${t.id}" novalidate>
                          <div class="reply-composer__bar">
                            <div class="reply-composer__macro">
                              <span class="reply-composer__macro-lbl">${icon('macro-reply', { size: 13 })} KB Macro</span>
                              <select class="k-input kb-macro-select" data-change="kb-macro-insert" data-id="${t.id}" aria-label="Insert Knowledge Base macro">
                                <option value="">Choose KB snippet to insert…</option>
                                ${publishedKb.map((a) => html`<option value="${a.id}">[${a.category}] ${a.title}</option>`)}
                              </select>
                            </div>
                          </div>
                          <div class="reply-composer__body">
                            <textarea class="k-input" name="body" rows="3" data-reply-composer="${t.id}" data-controlled placeholder="Draft a customer reply using a KB macro above, or type an internal triage note…" required>${draft}</textarea>
                          </div>
                          <div class="reply-composer__foot">
                            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="ticket-del" data-id="${t.id}">Delete</button>
                            <div class="tk-btn-row">
                              <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-composer-reply" data-id="${t.id}">${icon('copy', { size: 13 })} Copy Reply</button>
                              <button type="submit" class="k-btn k-btn--primary k-btn--sm">${icon('send', { size: 13 })} Save Note</button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>` : ''}
                </article>`;
            })}
          </div>` : emptyState({ iconName: 'headset', title: 'Queue clear', text: 'No support tickets match the active filters.' })}
      </div>

      <aside class="cs-rail-panel" aria-label="Urgent Escalations and Product Pulse">
        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('escalate-bolt', { size: 14 })} Urgent Escalations</span>
            <a href="#/escalations" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.escalations.length})</a>
          </div>
          ${activeEscs.length ? html`
            <div class="cs-rail-list">
              ${activeEscs.slice(0, 4).map((e) => html`
                <div class="cs-rail-item cs-rail-item--alert" data-key="rail-esc-${e.id}">
                  <div class="cs-rail-item__top">
                    <div style="min-width:0">
                      <div class="cs-rail-item__name">${e.escalation_reason}</div>
                      <div class="cs-rail-item__sub">${e.ticket_number || ''} · ${e.customer_name || e.escalated_to}</div>
                    </div>
                    <span class="sla-pill ${e.urgency.startsWith('Critical') ? 'sla-pill--breach' : 'sla-pill--warn'}">${e.urgency.split(' ')[0]}</span>
                  </div>
                  <div class="cs-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">To: ${e.escalated_to}</span>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="esc-resolve" data-id="${e.id}">Resolve ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active escalations — SLA queue healthy ✓</div>`}
        </section>

        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('dollar', { size: 14 })} Pending Refunds</span>
            <a href="#/refunds" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Desk</a>
          </div>
          ${pendingRefunds.length ? html`
            <div class="cs-rail-list">
              ${pendingRefunds.slice(0, 3).map((r) => html`
                <div class="cs-rail-item" data-key="rail-rf-${r.id}">
                  <div class="cs-rail-item__top">
                    <div style="min-width:0">
                      <div class="cs-rail-item__name">${r.customer_name}</div>
                      <div class="cs-rail-item__sub">${r.order_number} · ${r.reason}</div>
                    </div>
                    <strong class="tk-mono" style="font-size:13.5px">${money(r.amount_cents, { currency: cur })}</strong>
                  </div>
                  <div class="cs-rail-item__foot">
                    <span class="tk-tag tk-tag--warn">${r.refund_method}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="refund-status" data-id="${r.id}" data-status="Approved">Approve ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No refund approvals waiting.</div>`}
        </section>

        <section class="cs-rail-card">
          <div class="cs-rail-card__head">
            <span class="cs-rail-card__title">${icon('bug', { size: 14 })} Product &amp; KB Pulse</span>
            <a href="#/bugs" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Tracker</a>
          </div>
          <div class="cs-pulse-grid">
            <a href="#/bugs" class="cs-pulse-tile">
              <span class="cs-pulse-tile__k">Open Bugs</span>
              <span class="cs-pulse-tile__v">${openBugs.length}</span>
            </a>
            <a href="#/kb" class="cs-pulse-tile">
              <span class="cs-pulse-tile__k">KB Macros</span>
              <span class="cs-pulse-tile__v">${publishedKb.length}</span>
            </a>
            <a href="#/features" class="cs-pulse-tile">
              <span class="cs-pulse-tile__k">Features</span>
              <span class="cs-pulse-tile__v">Board →</span>
            </a>
            <a href="#/feedback" class="cs-pulse-tile">
              <span class="cs-pulse-tile__k">NPS Score</span>
              <span class="cs-pulse-tile__v">${counts.feedbackCount ? (counts.nps > 0 ? '+' + counts.nps : counts.nps) : '—'}</span>
            </a>
          </div>
        </section>
      </aside>
    </div>`;
}

export function renderEscalationsView(state) {
  const rows = state.escalationStatus === 'All'
    ? state.escalations
    : state.escalations.filter((e) => e.status === state.escalationStatus);
  const activeCount = state.escalations.filter((e) => e.status === 'Active').length;
  const resolvedCount = state.escalations.filter((e) => e.status === 'Resolved').length;
  const countE = (st) => st === 'All' ? state.escalations.length : state.escalations.filter((e) => e.status === st).length;

  return html`
    <section class="cs-masthead" aria-label="Escalations Desk">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${activeCount > 0 ? '#f43f5e' : '#34d399'}"></span>
          PRIORITY INTERVENTIONS · ${activeCount} ACTIVE
        </div>
        <h1 class="cs-masthead__title">Escalations Desk</h1>
        <div class="cs-masthead__meta">
          <span>Every escalated ticket tracked with SLA urgency &amp; target outcome</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click resolve closes the linked support ticket</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="${cls('cs-pod', { 'cs-pod--coral': activeCount > 0 })}">
          <span class="cs-pod__lbl">Active</span>
          <span class="cs-pod__val">${activeCount}</span>
          <span class="cs-pod__sub">Awaiting resolution</span>
        </div>
        <div class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">Resolved</span>
          <span class="cs-pod__val">${resolvedCount}</span>
          <span class="cs-pod__sub">Closed clean</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="esc-new">${icon('escalate-bolt', { size: 15 })} Log Escalation</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['Active', 'Resolved', 'All'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.escalationStatus === st })}" data-action="esc-filter" data-status="${st}">${st} (${countE(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.escalations.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? rows.map((e) => html`
        <article class="cs-banded-card ${e.status === 'Resolved' ? 'cs-banded-card--ok' : 'cs-banded-card--bad'}" data-key="esc-${e.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div class="tk-row__main">
              <div class="tk-row__title">
                ${e.ticket_number ? html`<span class="tkt-num">${e.ticket_number}</span>` : ''}
                <span>${e.escalation_reason}</span>
                <span class="sla-pill ${e.urgency.startsWith('Critical') ? 'sla-pill--breach' : e.urgency.startsWith('High') ? 'sla-pill--warn' : 'sla-pill--ok'}"><span class="sla-pill__dot"></span>${e.urgency}</span>
                <span class="tk-tag ${e.status === 'Resolved' ? 'tk-tag--ok' : 'tk-tag--bad'}">${e.status}</span>
                ${e.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta" style="margin-top:4px">
                ${e.customer_name ? html`<span>Customer: <strong>${e.customer_name}</strong></span>` : ''}
                <span>Escalated to: <strong>${e.escalated_to}</strong></span>
                <span>By ${e.escalated_by} on ${fmtDay(e.escalation_date)}</span>
              </div>
            </div>
            <div class="tk-btn-row">
              ${e.status === 'Active' ? html`
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="esc-resolve" data-id="${e.id}">${icon('check', { size: 14 })} Resolve &amp; Close Ticket</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="esc-del" data-id="${e.id}">Delete</button>
            </div>
          </div>
          <div style="display:grid;gap:4px;font-size:13.5px">
            <div><strong>Current status:</strong> ${e.current_status}</div>
            <div><strong>Desired outcome:</strong> ${e.desired_outcome}</div>
          </div>
          <div class="cs-stepper">
            <div class="cs-step is-done">1. Escalated</div>
            <div class="cs-step ${e.status === 'Resolved' ? 'is-done' : 'is-bad'}">2. In Intervention</div>
            <div class="cs-step ${e.status === 'Resolved' ? 'is-done' : ''}">3. Resolved</div>
          </div>
        </article>`) : emptyState({ iconName: 'shield-check', title: 'No active escalations', text: 'Escalated tickets from the Support Queue appear here automatically.' })}
    </div>`;
}

export function renderRefundsView(state) {
  const cur = state.session.settings.currency || 'USD';
  const rows = state.refundStatus === 'All'
    ? state.refunds
    : state.refunds.filter((r) => r.status === state.refundStatus);
  const pendingAmt = state.refunds.filter((r) => r.status === 'Pending' || r.status === 'Approved').reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const refundedAmt = state.refunds.filter((r) => r.status === 'Refunded').reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const countR = (st) => st === 'All' ? state.refunds.length : state.refunds.filter((r) => r.status === st).length;

  return html`
    <section class="cs-masthead" aria-label="Refunds and Returns">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#38bdf8"></span>
          ORDER ADJUSTMENTS · ${state.refunds.length} REQUEST${state.refunds.length === 1 ? '' : 'S'}
        </div>
        <h1 class="cs-masthead__title">Refunds &amp; Returns</h1>
        <div class="cs-masthead__meta">
          <span>Approve, decline, or settle refunds with 1-click workflow steppers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Full order reference &amp; method audit</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="${cls('cs-pod', { 'cs-pod--coral': pendingAmt > 0 })}">
          <span class="cs-pod__lbl">Pending / Approved</span>
          <span class="cs-pod__val">${money(pendingAmt, { currency: cur })}</span>
          <span class="cs-pod__sub">${countR('Pending')} pending approval</span>
        </div>
        <div class="cs-pod cs-pod--mint">
          <span class="cs-pod__lbl">Refunded Total</span>
          <span class="cs-pod__val">${money(refundedAmt, { currency: cur })}</span>
          <span class="cs-pod__sub">${countR('Refunded')} settled</span>
        </div>
        <button type="button" class="k-btn k-btn--primary cs-btn-coral" data-action="refund-new">${icon('plus', { size: 15 })} New Refund</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', 'Pending', 'Approved', 'Refunded', 'Declined'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.refundStatus === st })}" data-action="refund-filter" data-status="${st}">${st} (${countR(st)})</button>`)}
      </div>
    </div>

    <div class="tk-stack">
      ${state.loading && !state.refunds.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? rows.map((r) => html`
        <article class="cs-banded-card ${r.status === 'Refunded' ? 'cs-banded-card--ok' : r.status === 'Declined' ? 'cs-banded-card--bad' : r.status === 'Pending' ? 'cs-banded-card--warn' : ''}" data-key="rf-${r.id}">
          <div class="tk-card__head" style="flex-wrap:wrap">
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span class="tkt-num">${r.order_number}</span>
                <span>${r.customer_name}</span>
                <span class="tk-tag ${r.status === 'Refunded' ? 'tk-tag--ok' : r.status === 'Approved' ? 'tk-tag--info' : r.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${r.status}</span>
                ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta" style="margin-top:4px">
                <span><strong>${r.reason}</strong></span>
                <span>Method: ${r.refund_method}</span>
                ${r.purchase_date ? html`<span>Purchased ${fmtDay(r.purchase_date)}</span>` : ''}
              </div>
            </div>
            <div class="tk-btn-row">
              <strong class="tk-mono" style="font-size:16.5px;margin-right:4px">${money(r.amount_cents, { currency: cur })}</strong>
              ${r.status === 'Pending' ? html`
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="refund-status" data-id="${r.id}" data-status="Approved">Approve</button>
                <button type="button" class="k-btn k-btn--sm" data-action="refund-status" data-id="${r.id}" data-status="Declined">Decline</button>` : ''}
              ${r.status === 'Approved' ? html`
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="refund-status" data-id="${r.id}" data-status="Refunded">Mark Refunded ✓</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="refund-del" data-id="${r.id}">Delete</button>
            </div>
          </div>
          <div style="font-size:13.5px">${r.items}</div>
          ${r.additional_details ? html`<div class="tk-muted" style="font-size:13px">${r.additional_details}</div>` : ''}
          <div class="cs-stepper">
            <div class="cs-step is-done">1. Logged</div>
            <div class="cs-step ${r.status === 'Declined' ? 'is-bad' : (r.status === 'Approved' || r.status === 'Refunded') ? 'is-done' : 'is-now'}">2. ${r.status === 'Declined' ? 'Declined' : 'Approved'}</div>
            <div class="cs-step ${r.status === 'Refunded' ? 'is-done' : r.status === 'Approved' ? 'is-now' : ''}">3. Refunded</div>
          </div>
        </article>`) : emptyState({ iconName: 'dollar', title: 'No refund requests', text: 'Log customer return and refund requests to manage approvals cleanly.' })}
    </div>`;
}

export function wireSupportActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-input="ticket-search"]', (e, el) => { state.ticketSearch = el.value; draw(); });
  on(root, 'change', '[data-change="ticket-priority"]', (e, el) => { state.ticketPriority = el.value; draw(); });
  on(root, 'change', '[data-change="ticket-category"]', (e, el) => { state.ticketCategory = el.value; draw(); });
  on(root, 'click', '[data-action="ticket-status-filter"]', (e, el) => { state.ticketStatus = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="ticket-select"]', (e, el) => {
    const btn = e.target.closest('button');
    if (btn && btn !== el) return;
    const id = Number(el.dataset.id);
    state.selectedTicketId = state.selectedTicketId === id ? null : id;
    draw();
  });

  on(root, 'click', '[data-action="ticket-quick-resolve"]', async (e, el) => {
    e.stopPropagation();
    try {
      await api.put('/api/tickets', { id: Number(el.dataset.id), status: 'Resolved' });
      toast.success('Ticket marked Resolved.');
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ticket-quick-assign"]', async (e, el) => {
    e.stopPropagation();
    const myName = state.session.me?.displayName || 'Agent';
    try {
      await api.put('/api/tickets', { id: Number(el.dataset.id), assigned_to: myName, status: 'In Progress' });
      toast.success(`Assigned to ${myName}.`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'input', '[data-reply-composer]', (e, el) => {
    state.composerDrafts[Number(el.dataset.replyComposer)] = el.value;
  });

  on(root, 'change', '[data-change="kb-macro-insert"]', (e, el) => {
    const artId = el.value;
    if (!artId) return;
    const tktId = Number(el.dataset.id);
    const tkt = state.tickets.find((x) => Number(x.id) === tktId);
    const art = state.kb.find((a) => String(a.id) === String(artId));
    if (!tkt || !art) return;
    const biz = state.session.settings.business_name || 'Support Team';
    const snippet = `Hi ${tkt.customer_name},\n\nThanks for reaching out about ${tkt.ticket_number} (${tkt.subject}).\n\n${art.answer}\n\nLet us know if we can help with anything else!\n— ${biz}`;
    const prev = (state.composerDrafts[tktId] || '').trim();
    const next = prev ? `${prev}\n\n${snippet}` : snippet;
    state.composerDrafts[tktId] = next;
    el.value = '';
    draw();
    const box = qs(`[data-reply-composer="${tktId}"]`, root);
    if (box) { box.value = next; box.focus(); }
    toast.success(`Inserted KB macro: ${art.title}`);
  });

  on(root, 'click', '[data-action="copy-composer-reply"]', async (e, el) => {
    const tktId = Number(el.dataset.id);
    const tkt = state.tickets.find((x) => Number(x.id) === tktId);
    const box = qs(`[data-reply-composer="${tktId}"]`, root);
    const text = (box ? box.value : state.composerDrafts[tktId] || '').trim();
    if (!text) { toast.error('Insert a KB macro or type a reply first.'); return; }
    await copyText(text, {
      title: tkt ? `Customer Reply — ${tkt.ticket_number}` : 'Customer Reply',
      done: 'Customer reply copied!',
    });
  });

  on(root, 'click', '[data-action="ticket-new"]', async () => {
    const made = await formDialog({
      title: 'New Support Ticket',
      submitLabel: 'Create Ticket',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="customer_name" required></label>
          <label class="k-field"><span class="k-field__label">Email Address</span><input class="k-input" type="email" name="email" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone"></label>
          <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${TICKET_CATS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority">${TICKET_PRIOS.map((p) => html`<option value="${p}" ${p === 'Medium' ? 'selected' : ''}>${p}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Subject</span><input class="k-input" name="subject" placeholder="Brief summary of the issue" required></label>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="4" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/tickets', v),
    });
    if (made) {
      state.selectedTicketId = made.ticket.id;
      toast.success(`Ticket ${made.ticket.ticket_number} created.`);
      await loadScreen('/');
    }
  });

  on(root, 'change', '[data-change="ticket-set-status"]', async (e, el) => {
    try { await api.put('/api/tickets', { id: Number(el.dataset.id), status: el.value }); toast.success(`Status updated to ${el.value}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'change', '[data-change="ticket-set-priority"]', async (e, el) => {
    try { await api.put('/api/tickets', { id: Number(el.dataset.id), priority: el.value }); toast.success(`Priority set to ${el.value}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'change', '[data-blur="ticket-set-owner"]', async (e, el) => {
    try { await api.put('/api/tickets', { id: Number(el.dataset.id), assigned_to: el.value }); toast.success('Assigned owner updated.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="ticket-note"]', async (e, form) => {
    e.preventDefault();
    try {
      const id = Number(form.dataset.id);
      const vals = readForm(form);
      await api.post('/api/tickets/note', { id, body: vals.body });
      delete state.composerDrafts[id];
      form.reset();
      toast.success('Internal triage note saved.');
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="insert-kb"]', async (e, el) => {
    const tkt = state.tickets.find((x) => String(x.id) === el.dataset.id);
    if (!tkt) return;
    let articles = state.kb;
    if (!articles.length) { const r = await api.get('/api/kb', { onlyPublished: 1 }); articles = r.articles || []; state.kb = articles; }
    if (!articles.length) { toast.error('No published Knowledge Base articles available.'); return; }
    await openDialog({
      title: `Knowledge Base Macros for ${tkt.ticket_number}`,
      size: 'lg',
      body: html`
        <div class="tk-stack">
          <p class="tk-muted" style="font-size:13.5px">Insert any Knowledge Base article straight into the reply composer or copy a ready-to-send reply for <strong>${tkt.customer_name}</strong>.</p>
          ${articles.map((a) => html`
            <div class="tk-card">
              <div class="tk-card__head">
                <div><strong>${a.title}</strong><div class="tk-muted" style="font-size:12.5px">${a.category} · ${a.question}</div></div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-insert-kb="${a.id}">${icon('zap', { size: 14 })} Insert</button>
                  <button type="button" class="k-btn k-btn--sm" data-pick-kb="${a.id}">${icon('copy', { size: 14 })} Copy</button>
                </div>
              </div>
              <div class="kb-answer">${a.answer}</div>
            </div>`)}
        </div>`,
      onOpen: ({ body, close }) => {
        on(body, 'click', '[data-insert-kb]', (ev, btn) => {
          const art = articles.find((x) => String(x.id) === btn.dataset.insertKb);
          if (!art) return;
          const reply = `Hi ${tkt.customer_name},\n\nThanks for reaching out regarding ${tkt.ticket_number} (${tkt.subject}).\n\n${art.answer}\n\nPlease let us know if you need anything else!\n— ${state.session.settings.business_name}`;
          state.composerDrafts[tkt.id] = reply;
          close();
          draw();
          toast.success(`Inserted "${art.title}" into composer.`);
        });
        on(body, 'click', '[data-pick-kb]', async (ev, btn) => {
          const art = articles.find((x) => String(x.id) === btn.dataset.pickKb);
          if (!art) return;
          const reply = `Hi ${tkt.customer_name},\n\nThanks for reaching out regarding ${tkt.ticket_number} (${tkt.subject}).\n\n${art.answer}\n\nPlease let us know if you need anything else!\n— ${state.session.settings.business_name}`;
          close();
          await copyText(reply, { title: `KB Reply — ${art.title}`, done: 'KB reply copied to clipboard!' });
        });
      },
    });
  });

  async function openEscalateDialog(presetTicketId = null) {
    let tickets = state.tickets;
    if (!tickets.length) { const r = await api.get('/api/tickets'); tickets = r.tickets || []; state.tickets = tickets; }
    if (!tickets.length) { toast.error('No tickets available to escalate.'); return; }
    const tkt = tickets.find((x) => Number(x.id) === Number(presetTicketId)) || tickets[0];
    const made = await formDialog({
      title: 'Escalate Ticket',
      submitLabel: 'Create Escalation',
      danger: true,
      fields: html`
        <label class="k-field"><span class="k-field__label">Original Support Ticket</span>
          <select class="k-input" name="ticket_id" required>
            ${tickets.map((x) => html`<option value="${x.id}" ${String(x.id) === String(tkt.id) ? 'selected' : ''}>${x.ticket_number} — ${x.subject} (${x.customer_name})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Escalation Reason</span><select class="k-input" name="escalation_reason">${ESC_REASONS.map((r) => html`<option value="${r}">${r}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Urgency</span><select class="k-input" name="urgency">${ESC_URGENCIES.map((u) => html`<option value="${u}">${u}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Escalated To</span><input class="k-input" name="escalated_to" placeholder="e.g. Tier-2 Engineering Lead" required></label>
          <label class="k-field"><span class="k-field__label">Escalation Date</span><input class="k-input" type="date" name="escalation_date" value="${today()}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Current Status</span><textarea class="k-input" name="current_status" rows="2" placeholder="What has been investigated so far…"></textarea></label>
        <label class="k-field"><span class="k-field__label">Desired Outcome</span><textarea class="k-input" name="desired_outcome" rows="2" placeholder="Target fix, refund approval, or customer callback…" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/tickets/escalate', v),
    });
    if (made) { toast.success('Ticket escalated and linked escalation created.'); await loadScreen(); }
  }

  on(root, 'click', '[data-action="ticket-escalate"]', (e, el) => openEscalateDialog(Number(el.dataset.id)));
  on(root, 'click', '[data-action="esc-new"]', () => openEscalateDialog(null));
  on(root, 'click', '[data-action="esc-filter"]', (e, el) => { state.escalationStatus = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="esc-resolve"]', async (e, el) => {
    try { await api.post('/api/escalations/resolve', { id: Number(el.dataset.id), resolveTicket: true }); toast.success('Escalation and linked ticket resolved.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="esc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete escalation?', message: 'Remove this escalation record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/escalations', { id: Number(el.dataset.id) }); toast.success('Escalation removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="ticket-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete ticket?', message: 'Deletes this support ticket permanently.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/tickets', { id: Number(el.dataset.id) }); state.selectedTicketId = null; toast.success('Ticket deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="refund-filter"]', (e, el) => { state.refundStatus = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="refund-new"]', async () => {
    const made = await formDialog({
      title: 'New Refund / Return Request',
      submitLabel: 'Log Request',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="customer_name" required></label>
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Order Number</span><input class="k-input" name="order_number" placeholder="ORD-10025" required></label>
          <label class="k-field"><span class="k-field__label">Purchase Date</span><input class="k-input" type="date" name="purchase_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Refund Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Reason</span><select class="k-input" name="reason">${REFUND_REASONS.map((r) => html`<option value="${r}">${r}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Refund Method</span><select class="k-input" name="refund_method">${REFUND_METHODS.map((m) => html`<option value="${m}">${m}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Items</span><textarea class="k-input" name="items" rows="2" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Additional Details</span><textarea class="k-input" name="additional_details" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/refunds', v),
    });
    if (made) { toast.success('Refund request logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="refund-status"]', async (e, el) => {
    try { await api.post('/api/refunds/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Refund marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="refund-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete refund request?', message: 'Delete this refund record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/refunds', { id: Number(el.dataset.id) }); toast.success('Refund deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
