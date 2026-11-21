// Interactive 4-Stage Defect Steppers, Contract Variations, Site Gate Deliveries & Monogrammed Subcontractor Trade Cards
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay, fmtDateTime, daysBetween, isDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const DEFECT_CATS = ['Structural', 'Waterproofing', 'Finishes', 'Services', 'Safety', 'Other'];
const DEFECT_PRIOS = ['Critical', 'High', 'Medium', 'Low'];
const DEFECT_STATUSES = ['Open', 'In Progress', 'Rectified', 'Verified'];
const NEXT_DEFECT = { Open: 'In Progress', 'In Progress': 'Rectified', Rectified: 'Verified' };

const VAR_STATUSES = ['Pending', 'Approved', 'Rejected'];
const SUB_TRADES = ['Electrical', 'Plumbing', 'Carpentry', 'Concreting', 'Roofing', 'Painting', 'Earthworks', 'Tiling', 'Waterproofing', 'Other'];
const SUB_STATUSES = ['Approved', 'Pending Review', 'Expired Insurance'];

function defPrioKey(p) {
  if (p === 'Critical') return 'critical';
  if (p === 'High') return 'high';
  if (p === 'Low') return 'low';
  return 'medium';
}

function insuranceCountdown(sub, todayStr = today()) {
  if (!isDay(sub.insurance_expiry)) {
    return { state: 'none', diff: null, label: 'No expiry recorded', cls: 'ins-badge--none', iconName: 'info' };
  }
  const diff = daysBetween(todayStr, sub.insurance_expiry);
  if (diff < 0) {
    return { state: 'expired', diff, label: `Expired ${Math.abs(diff)}d ago`, cls: 'ins-badge--expired', iconName: 'alert' };
  }
  if (diff === 0) {
    return { state: 'expired', diff: 0, label: 'Expires today', cls: 'ins-badge--expired', iconName: 'alert' };
  }
  if (diff <= 30) {
    return { state: 'expiring_soon', diff, label: `Expires in ${diff}d`, cls: 'ins-badge--expiring', iconName: 'clock' };
  }
  return { state: 'valid', diff, label: `Valid · ${fmtDay(sub.insurance_expiry)}`, cls: 'ins-badge--ok', iconName: 'shield-check' };
}

function renderInsuranceBadge(sub, todayStr = today()) {
  const meta = insuranceCountdown(sub, todayStr);
  return html`
    <span class="ins-badge ${meta.cls}">
      <span class="ins-badge__light" aria-hidden="true"></span>
      ${icon(meta.iconName, { size: 13 })}
      <span>${meta.label}</span>
    </span>`;
}

export function renderDefectsView(state) {
  const todayStr = today();
  const rows = state.defects.filter((d) => {
    if (state.defProj !== 'All' && String(d.project_id) !== String(state.defProj)) return false;
    if (state.defPrio !== 'All' && d.priority !== state.defPrio) return false;
    return true;
  });

  const closedCount = state.defects.filter((d) => d.status === 'Rectified' || d.status === 'Verified').length;
  const closePct = state.defects.length ? Math.round((closedCount / state.defects.length) * 100) : 100;
  const openCount = state.defects.length - closedCount;
  const critCount = state.defects.filter((d) => d.priority === 'Critical' && d.status !== 'Verified').length;

  return html`
    <section class="sp-masthead" aria-label="Defect Snags Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">QUALITY &amp; HANDOVER CONTROL</div>
        <h1 class="sp-masthead__title">Defect &amp; Snag List</h1>
        <div class="sp-masthead__meta">
          <span>4-stage rectification steppers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Click stage to progress</span>
        </div>
      </div>

      <div class="sp-masthead__pods sp-masthead__pods--ring3" style="align-items:center">
        <div class="sp-pod sp-pod--ring">
          <div class="tk-ring" style="--p:${closePct}%;--ring-color:#22c55e;--ring-size:48px">
            <span class="tk-ring__val">${closePct}%</span>
          </div>
          <div>
            <span class="sp-pod__lbl">Closeout</span>
            <div class="sp-pod__val" style="font-size:15px">${closedCount}/${state.defects.length} Fixed</div>
            <div class="sp-pod__sub">Rectified / Verified</div>
          </div>
        </div>
        <div class="${cls('sp-pod', openCount > 0 ? 'sp-pod--hivis' : 'sp-pod--ok')}">
          <span class="sp-pod__lbl">${icon('snag-cone', { size: 11 })} Open</span>
          <span class="sp-pod__val">${openCount}</span>
          <span class="sp-pod__sub">In rectification</span>
        </div>
        <div class="${cls('sp-pod', critCount > 0 ? 'sp-pod--alert' : '')}">
          <span class="sp-pod__lbl">${icon('alert', { size: 11 })} Critical</span>
          <span class="sp-pod__val">${critCount}</span>
          <span class="sp-pod__sub">Hold points</span>
        </div>
        <div class="sp-pod sp-pod--navy">
          <span class="sp-pod__lbl">${icon('check-circle', { size: 11 })} Verified</span>
          <span class="sp-pod__val">${state.defects.filter((d) => d.status === 'Verified').length}</span>
          <span class="sp-pod__sub">Signed closed</span>
        </div>
        <div class="sp-masthead__cta">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="print-snags">${icon('printer', { size: 14 })} Print List</button>
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="def-new">${icon('plus', { size: 14 })} Raise Defect</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <select class="k-input" style="width:auto;min-width:200px" data-action="def-proj">
        <option value="All">All Projects</option>
        ${state.projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(state.defProj) ? 'selected' : ''}>${p.project_name}</option>`)}
      </select>
      <div class="tk-segmented" role="group" aria-label="Filter defects by priority">
        ${['All', ...DEFECT_PRIOS].map((p) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.defPrio === p })}" data-action="def-prio" data-prio="${p}">${p}</button>`)}
      </div>
      <div class="tk-segmented" style="margin-left:auto" role="group" aria-label="Defect layout">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.defLayout !== 'board' })}" data-action="def-layout" data-layout="deck">${icon('grid', { size: 13 })} Steppers</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.defLayout === 'board' })}" data-action="def-layout" data-layout="board">${icon('sliders', { size: 13 })} Board</button>
      </div>
    </div>

    ${state.loading && !state.defects.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.defLayout === 'board' ? html`
      <div class="sp-board-wrap">
        <div class="tk-board">
          ${DEFECT_STATUSES.map((col) => {
            const cards = rows.filter((d) => d.status === col);
            return html`
              <div class="tk-col" data-key="dcol-${col}">
                <div class="tk-col__head">
                  <span>${col}</span>
                  <span class="k-badge ${col === 'Open' && cards.length ? 'k-badge--danger' : ''}">${cards.length}</span>
                </div>
                ${cards.length ? cards.map((d) => {
                  const overdue = d.due_date && d.status !== 'Verified' && d.due_date < todayStr;
                  return html`
                    <article class="snag-card snag-card--${defPrioKey(d.priority)}" data-key="def-${d.id}">
                      <div class="tk-ticket__top">
                        <span class="sp-code">${d.defect_code}</span>
                        <span class="tk-tag ${d.priority === 'Critical' ? 'tk-tag--bad' : d.priority === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${d.priority}</span>
                      </div>
                      <div style="font-weight:750;font-size:14px;line-height:1.3">${d.issue_title}</div>
                      <div class="tk-btn-row">
                        <span class="tk-tag">${d.category}</span>
                        <span class="tk-muted" style="font-size:12px">${d.project_name || ''}</span>
                      </div>
                      <div class="tk-row__meta" style="font-size:12px">
                        ${d.assigned_to ? html`<span>Trade: <strong>${d.assigned_to}</strong></span>` : html`<span>Unassigned</span>`}
                        ${d.due_date ? html`<span class="${overdue ? 'tk-danger' : ''}">Due ${fmtDay(d.due_date)}${overdue ? ' (Overdue)' : ''}</span>` : ''}
                      </div>
                      ${d.notes ? html`<div class="tk-muted" style="font-size:12.5px">${d.notes}</div>` : ''}
                      <div class="tk-ticket__foot">
                        ${NEXT_DEFECT[d.status] ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="def-status" data-id="${d.id}" data-status="${NEXT_DEFECT[d.status]}">Mark ${NEXT_DEFECT[d.status]}</button>` : html`<span class="tk-tag tk-tag--ok">Closed</span>`}
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="def-edit" data-id="${d.id}">Edit</button>
                      </div>
                    </article>`;
                }) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px">Clear</p>`}
              </div>`;
          })}
        </div>
      </div>` : rows.length ? html`
      <div class="sp-snag-list">
        ${rows.map((d) => {
          const overdue = d.due_date && d.status !== 'Verified' && d.due_date < todayStr;
          const stepIdx = DEFECT_STATUSES.indexOf(d.status);
          return html`
            <article class="snag-card snag-card--${defPrioKey(d.priority)}" data-key="def-${d.id}">
              <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px">
                <div class="tk-stack" style="gap:5px;flex:1;min-width:220px">
                  <div class="tk-row__title">
                    <span class="sp-code">${d.defect_code}</span>
                    <strong>${d.issue_title}</strong>
                    <span class="tk-tag ${d.priority === 'Critical' ? 'tk-tag--bad' : d.priority === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${d.priority}</span>
                    <span class="tk-tag">${d.category}</span>
                    ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Project: <strong>${d.project_name || '—'}</strong></span>
                    <span>Trade: <strong>${d.assigned_to || 'Unassigned'}</strong></span>
                    ${d.due_date ? html`<span class="${overdue ? 'tk-danger' : ''}">Due ${fmtDay(d.due_date)}${overdue ? ' (Overdue)' : ''}</span>` : ''}
                  </div>
                  ${d.notes ? html`<div class="tk-muted" style="font-size:13px">${d.notes}</div>` : ''}
                </div>
                <div class="tk-btn-row">
                  ${NEXT_DEFECT[d.status] ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="def-status" data-id="${d.id}" data-status="${NEXT_DEFECT[d.status]}">Mark ${NEXT_DEFECT[d.status]}</button>` : html`<span class="tk-tag tk-tag--ok">Verified ✓</span>`}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="def-edit" data-id="${d.id}">Edit</button>
                </div>
              </div>
              <div class="sp-defect-steps" aria-label="Defect stage stepper">
                ${DEFECT_STATUSES.map((st, idx) => html`
                  <button type="button" class="${cls('sp-defect-step', { 'is-done': idx < stepIdx || d.status === 'Verified', 'is-now': idx === stepIdx && d.status !== 'Verified' })}" data-action="def-status" data-id="${d.id}" data-status="${st}">
                    ${idx < stepIdx || d.status === 'Verified' ? icon('check', { size: 12 }) : ''} ${st}
                  </button>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'snag-cone', title: 'No defects match filter', text: 'Log site snags with trade assignee and rectification due dates.' })}</section>`}`;
}

export function renderVariationsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const rows = state.variations.filter((v) => {
    if (state.varProj !== 'All' && String(v.project_id) !== String(state.varProj)) return false;
    if (state.varStatus !== 'All' && v.status !== state.varStatus) return false;
    return true;
  });
  const approvedTotal = state.variations.filter((v) => v.status === 'Approved').reduce((s, v) => s + Number(v.estimated_cost_cents || 0), 0);
  const pendingTotal = state.variations.filter((v) => v.status === 'Pending').reduce((s, v) => s + Number(v.estimated_cost_cents || 0), 0);
  const pendingCount = state.variations.filter((v) => v.status === 'Pending').length;

  return html`
    <section class="sp-masthead" aria-label="Variations Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">CONTRACT SCOPE &amp; MARGIN PROTECTION</div>
        <h1 class="sp-masthead__title">Variation Requests</h1>
        <div class="sp-masthead__meta">
          <span>Client-signed scope changes</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live build totals</span>
        </div>
      </div>

      <div class="sp-masthead__pods" style="align-items:center">
        <div class="sp-pod sp-pod--ok">
          <span class="sp-pod__lbl">${icon('check', { size: 11 })} Approved</span>
          <span class="sp-pod__val">${money(approvedTotal, { currency })}</span>
          <span class="sp-pod__sub">Signed scope</span>
        </div>
        <div class="sp-pod sp-pod--hivis">
          <span class="sp-pod__lbl">${icon('clock', { size: 11 })} Pending</span>
          <span class="sp-pod__val">${money(pendingTotal, { currency })}</span>
          <span class="sp-pod__sub">${pendingCount} awaiting client</span>
        </div>
        <div class="sp-pod sp-pod--navy sp-pod--wide-sm">
          <span class="sp-pod__lbl">${icon('file', { size: 11 })} Orders</span>
          <span class="sp-pod__val">${state.variations.length}</span>
          <span class="sp-pod__sub">Total variations</span>
        </div>
        <div class="sp-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="var-new">${icon('plus', { size: 16 })} Raise Variation</button>
        </div>
      </div>
    </section>

    ${state.varProjectTotals.length ? html`
      <div class="var-summary-strip">
        ${state.varProjectTotals.map((pt) => html`
          <div class="var-proj-pill" data-key="vpt-${pt.project_id}">
            <span class="var-proj-pill__name">${pt.project_name}</span>
            <span class="var-proj-pill__val">${money(pt.approved_cents || 0, { currency })} approved</span>
            ${pt.pending_cents > 0 ? html`<span class="tk-muted" style="font-size:12px">+ ${money(pt.pending_cents, { currency })} pending</span>` : ''}
          </div>`)}
      </div>` : ''}

    <div class="tk-toolbar">
      <select class="k-input" style="width:auto;min-width:200px" data-action="var-proj">
        <option value="All">All Projects</option>
        ${state.projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(state.varProj) ? 'selected' : ''}>${p.project_name}</option>`)}
      </select>
      <div class="tk-segmented" role="group" aria-label="Filter variations by status">
        ${['All', ...VAR_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.varStatus === st })}" data-action="var-status" data-status="${st}">${st}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.variations.length ? skeleton(3) : rows.length ? rows.map((v) => html`
        <div class="tk-row" data-key="var-${v.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span class="sp-code">${v.var_number}</span>
              <span>${v.variation_title}</span>
              <span class="tk-tag ${v.status === 'Approved' ? 'tk-tag--ok' : v.status === 'Rejected' ? 'tk-tag--bad' : 'tk-tag--warn'}">${v.status}</span>
              <strong>${money(v.estimated_cost_cents, { currency })}</strong>
              ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            ${v.description ? html`<div style="font-size:14px">${v.description}</div>` : ''}
            <div class="tk-row__meta">
              <span>Project: <strong>${v.project_name || '—'}</strong></span>
              ${v.client_approval_name ? html`<span class="tk-ok">Approved by <strong>${v.client_approval_name}</strong>${v.client_approved_at ? ' · ' + fmtDateTime(v.client_approved_at) : ''}</span>` : ''}
            </div>
          </div>
          <div class="tk-row__aside">
            ${v.status === 'Pending' ? html`
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="var-approve" data-id="${v.id}">${icon('check', { size: 14 })} Approve</button>
              <button type="button" class="k-btn k-btn--sm" data-action="var-reject" data-id="${v.id}">Reject</button>` : ''}
            <button type="button" class="k-btn k-btn--sm" data-action="print-var" data-id="${v.id}">${icon('printer', { size: 14 })} Sheet</button>
          </div>
        </div>`) : emptyState({ iconName: 'file', title: 'No variation requests match', text: 'Raise a variation with estimated cost before starting extra scope.' })}
    </section>`;
}

export function renderDeliveriesView(state) {
  const rows = state.deliveries.filter((dl) => {
    if (state.delProj !== 'All' && String(dl.project_id) !== String(state.delProj)) return false;
    if (state.delIssuesOnly && !dl.has_issue) return false;
    return true;
  });
  const issueCount = state.deliveries.filter((x) => x.has_issue).length;
  const suppliers = new Set(state.deliveries.map((d) => (d.supplier || '').trim()).filter(Boolean)).size;

  return html`
    <section class="sp-masthead" aria-label="Deliveries Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">SITE GATE &amp; SUPPLY CHAIN</div>
        <h1 class="sp-masthead__title">Material Deliveries</h1>
        <div class="sp-masthead__meta">
          <span>Signed site gate log</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Shortage &amp; damage flags</span>
        </div>
      </div>

      <div class="sp-masthead__pods" style="align-items:center">
        <div class="sp-pod sp-pod--navy">
          <span class="sp-pod__lbl">${icon('truck', { size: 11 })} Drops</span>
          <span class="sp-pod__val">${state.deliveries.length}</span>
          <span class="sp-pod__sub">${suppliers} supplier${suppliers === 1 ? '' : 's'}</span>
        </div>
        <div class="${cls('sp-pod', issueCount > 0 ? 'sp-pod--alert' : 'sp-pod--ok')}">
          <span class="sp-pod__lbl">${icon('alert', { size: 11 })} Issues</span>
          <span class="sp-pod__val">${issueCount}</span>
          <span class="sp-pod__sub">${issueCount > 0 ? 'Claims flagged' : 'All clean'}</span>
        </div>
        <div class="sp-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="del-new">${icon('plus', { size: 16 })} Log Delivery</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <select class="k-input" style="width:auto;min-width:200px" data-action="del-proj">
        <option value="All">All Projects</option>
        ${state.projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(state.delProj) ? 'selected' : ''}>${p.project_name}</option>`)}
      </select>
      <div class="tk-segmented" role="group" aria-label="Filter deliveries">
        <button type="button" class="${cls('tk-pill', { 'is-on': !state.delIssuesOnly })}" data-action="del-issues" data-val="0">All Deliveries (${state.deliveries.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.delIssuesOnly })}" data-action="del-issues" data-val="1">Issues Flagged (${issueCount})</button>
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.deliveries.length ? skeleton(3) : rows.length ? rows.map((dl) => html`
        <div class="tk-row" data-key="del-${dl.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span>${dl.material}</span>
              <span class="tk-tag tk-tag--accent">${num(dl.quantity, { decimals: 1 })} ${dl.unit}</span>
              ${dl.has_issue ? html`<span class="tk-tag tk-tag--bad">${icon('alert', { size: 12 })} Issue Flagged</span>` : html`<span class="tk-tag tk-tag--ok">Received OK</span>`}
              ${dl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              <span>${fmtDay(dl.delivery_date)}</span>
              <span>Project: <strong>${dl.project_name || '—'}</strong></span>
              ${dl.supplier ? html`<span>Supplier: ${dl.supplier}</span>` : ''}
              ${dl.received_by ? html`<span>Signed by: ${dl.received_by}</span>` : ''}
            </div>
            ${dl.issues ? html`<div class="delay-callout" style="margin-top:4px">${dl.issues}</div>` : ''}
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="del-remove" data-id="${dl.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'truck', title: 'No deliveries recorded', text: 'Log material deliveries as trucks arrive at site.' })}
    </section>`;
}

export function renderSubbiesView(state) {
  const todayStr = today();
  const isAlert = (s) => {
    const m = insuranceCountdown(s, todayStr);
    return m.state === 'expired' || m.state === 'expiring_soon';
  };
  const alerts = state.subcontractors.filter(isAlert);
  const validCount = state.subcontractors.filter((s) => insuranceCountdown(s, todayStr).state === 'valid').length;
  const compPct = state.subcontractors.length ? Math.round((validCount / state.subcontractors.length) * 100) : 100;
  const rows = state.subcontractors.filter((s) => {
    if (state.subFilter === 'Alerts' && !isAlert(s)) return false;
    if (state.subTrade !== 'All' && s.trade !== state.subTrade) return false;
    return true;
  });

  return html`
    <section class="sp-masthead" aria-label="Subcontractors Compliance Header">
      <div class="sp-masthead__copy">
        <div class="sp-masthead__eyebrow">TRADE COMPLIANCE REGISTER</div>
        <h1 class="sp-masthead__title">Subcontractors</h1>
        <div class="sp-masthead__meta">
          <span>COC expiry tracking</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click renewal chase</span>
        </div>
      </div>

      <div class="sp-masthead__pods sp-masthead__pods--ring3" style="align-items:center">
        <div class="sp-pod sp-pod--ring">
          <div class="tk-ring" style="--p:${compPct}%;--ring-color:${compPct >= 85 ? '#22c55e' : '#f59e0b'};--ring-size:48px">
            <span class="tk-ring__val">${compPct}%</span>
          </div>
          <div>
            <span class="sp-pod__lbl">Compliant</span>
            <div class="sp-pod__val" style="font-size:15px">${validCount}/${state.subcontractors.length} Valid</div>
            <div class="sp-pod__sub">Current COC</div>
          </div>
        </div>
        <div class="${cls('sp-pod', alerts.length > 0 ? 'sp-pod--alert' : 'sp-pod--ok')}">
          <span class="sp-pod__lbl">${icon('alert', { size: 11 })} Warnings</span>
          <span class="sp-pod__val">${alerts.length}</span>
          <span class="sp-pod__sub">Exp / ≤30d</span>
        </div>
        <div class="sp-pod sp-pod--navy">
          <span class="sp-pod__lbl">${icon('safety-vest', { size: 11 })} Trades</span>
          <span class="sp-pod__val">${state.subcontractors.length}</span>
          <span class="sp-pod__sub">Registered</span>
        </div>
        <div class="sp-pod sp-pod--ok">
          <span class="sp-pod__lbl">${icon('shield-check', { size: 11 })} Approved</span>
          <span class="sp-pod__val">${state.subcontractors.filter((s) => s.status === 'Approved').length}</span>
          <span class="sp-pod__sub">Site cleared</span>
        </div>
        <div class="sp-masthead__cta">
          ${alerts.length ? html`<button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-ins-chase">${icon('copy', { size: 14 })} Chase List (${alerts.length})</button>` : ''}
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sub-new">${icon('plus', { size: 14 })} Add Subbie</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter subcontractors by compliance">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.subFilter === 'All' })}" data-action="sub-filter" data-val="All">All Trades (${state.subcontractors.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.subFilter === 'Alerts' })}" data-action="sub-filter" data-val="Alerts">Insurance Warnings (${alerts.length})</button>
      </div>
      <select class="k-input" style="width:auto;min-width:170px" data-action="sub-trade">
        <option value="All">All Trade Types</option>
        ${SUB_TRADES.map((tr) => html`<option value="${tr}" ${tr === state.subTrade ? 'selected' : ''}>${tr}</option>`)}
      </select>
    </div>

    ${state.loading && !state.subcontractors.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="sp-subbie-grid">
        ${rows.map((sub) => {
          const meta = insuranceCountdown(sub, todayStr);
          const cardCls = meta.state === 'expired' ? 'sp-subbie-card--expired' : meta.state === 'expiring_soon' ? 'sp-subbie-card--expiring' : '';
          return html`
            <article class="sp-subbie-card ${cardCls}" data-key="sub-${sub.id}">
              <div class="sp-subbie-head">
                <div class="sp-subbie-av">${initials(sub.business_name || 'S')}</div>
                <div style="min-width:0;flex:1">
                  <h3 class="tk-card__title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub.business_name}</h3>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px">
                    <span class="tk-tag tk-tag--accent">${sub.trade}</span>
                    ${sub.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                </div>
              </div>
              <div>${renderInsuranceBadge(sub, todayStr)}</div>
              <div class="tk-row__meta">
                ${sub.contact ? html`<span>Contact: <strong>${sub.contact}</strong></span>` : ''}
                ${isDay(sub.insurance_expiry) ? html`<span>Expiry: ${fmtDay(sub.insurance_expiry)}</span>` : ''}
                <span>Status: ${sub.status}</span>
              </div>
              ${sub.notes ? html`<div style="font-size:12.5px;padding:7px 9px;border-radius:7px;background:var(--k-surface-2)">${sub.notes}</div>` : ''}
              <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                ${sub.phone ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="copy-val" data-label="Subbie phone" data-val="${sub.phone}">${icon('phone', { size: 13 })} ${sub.phone}</button>` : ''}
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="sub-edit" data-id="${sub.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sub-del" data-id="${sub.id}">Del</button>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'safety-vest', title: 'No subcontractors matching filter', text: 'Register your electrical, plumbing, carpentry and concreting trades with their insurance expiry dates.' })}</section>`}`;
}

export function wireFieldActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="def-layout"]', (e, el) => { state.defLayout = el.dataset.layout; draw(); });
  on(root, 'change', '[data-action="def-proj"]', (e, el) => { state.defProj = el.value; draw(); });
  on(root, 'click', '[data-action="def-prio"]', (e, el) => { state.defPrio = el.dataset.prio; draw(); });
  on(root, 'change', '[data-action="var-proj"]', (e, el) => { state.varProj = el.value; draw(); });
  on(root, 'click', '[data-action="var-status"]', (e, el) => { state.varStatus = el.dataset.status; draw(); });
  on(root, 'change', '[data-action="del-proj"]', (e, el) => { state.delProj = el.value; draw(); });
  on(root, 'click', '[data-action="del-issues"]', (e, el) => { state.delIssuesOnly = el.dataset.val === '1'; draw(); });
  on(root, 'click', '[data-action="sub-filter"]', (e, el) => { state.subFilter = el.dataset.val; draw(); });
  on(root, 'change', '[data-action="sub-trade"]', (e, el) => { state.subTrade = el.value; draw(); });

  async function ensureProjects() {
    if (!state.projects.length) {
      const r = await api.get('/api/projects', { today: today() });
      state.projects = r.projects || [];
    }
    return state.projects;
  }

  // Defects
  const defectFields = (projects, d = {}) => html`
    <label class="k-field"><span class="k-field__label">Project</span>
      <select class="k-input" name="project_id" required>
        ${projects.map((p) => html`<option value="${p.id}" ${String(p.id) === String(d.project_id) ? 'selected' : ''}>${p.project_name}</option>`)}
      </select>
    </label>
    <label class="k-field"><span class="k-field__label">Defect / Snag Title</span><input class="k-input" name="issue_title" value="${d.issue_title || ''}" placeholder="e.g. Cracked render to north wall" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${DEFECT_CATS.map((c) => html`<option value="${c}" ${c === d.category ? 'selected' : ''}>${c}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority">${DEFECT_PRIOS.map((p) => html`<option value="${p}" ${p === (d.priority || 'Medium') ? 'selected' : ''}>${p}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${DEFECT_STATUSES.map((s) => html`<option value="${s}" ${s === (d.status || 'Open') ? 'selected' : ''}>${s}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Trade Assignee</span><input class="k-input" name="assigned_to" value="${d.assigned_to || ''}" placeholder="Subcontractor or trade"></label>
      <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${d.due_date || today()}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2">${d.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="def-new"]', async () => {
    const projs = await ensureProjects();
    if (!projs.length) { toast.error('Create a project first.'); return; }
    const made = await formDialog({ title: 'Raise Defect / Snag', submitLabel: 'Save Defect', size: 'lg', fields: defectFields(projs), onSubmit: (v) => api.post('/api/defects', v) });
    if (made) { toast.success(`Defect ${made.defect.defect_code} raised.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="def-edit"]', async (e, el) => {
    const d = state.defects.find((x) => String(x.id) === el.dataset.id);
    if (!d) return;
    const projs = await ensureProjects();
    const saved = await formDialog({ title: `Edit ${d.defect_code}`, submitLabel: 'Save', size: 'lg', fields: defectFields(projs, d), onSubmit: (v) => api.put('/api/defects', { ...v, id: d.id }) });
    if (saved) { toast.success('Defect updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="def-status"]', async (e, el) => {
    try { await api.post('/api/defects/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Defect marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-snags"]', () => {
    const s = state.session.settings;
    const rows = state.defects.filter((d) => state.defProj === 'All' || String(d.project_id) === String(state.defProj));
    const htmlRows = rows.map((d) => `<tr><td>${esc(d.defect_code)}</td><td>${esc(d.project_name || '')}</td><td>${esc(d.issue_title)}</td><td>${esc(d.category)}</td><td>${esc(d.priority)}</td><td>${esc(d.assigned_to || '—')}</td><td>${esc(d.due_date ? fmtDay(d.due_date) : '—')}</td><td><strong>${esc(d.status)}</strong></td></tr>`).join('');
    downloadHtmlDoc(`snag-list-${today()}.html`, {
      title: `DEFECT & SNAG LIST · ${fmtDay(today())}`,
      businessName: s.business_name,
      subtitle: `${rows.length} defects tracked`,
      accent: '#c2590a',
      bodyHtml: `<table><thead><tr><th>Code</th><th>Project</th><th>Defect</th><th>Category</th><th>Priority</th><th>Trade</th><th>Due</th><th>Status</th></tr></thead><tbody>${htmlRows || '<tr><td colspan="8">No defects.</td></tr>'}</tbody></table>`,
    });
  });

  // Variations
  on(root, 'click', '[data-action="var-new"]', async () => {
    const projs = await ensureProjects();
    if (!projs.length) { toast.error('Create a project first.'); return; }
    const made = await formDialog({
      title: 'Raise Variation Request',
      submitLabel: 'Save Variation',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">Project</span>
          <select class="k-input" name="project_id" required>${projs.map((p) => html`<option value="${p.id}">${p.project_name}</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Variation Title</span><input class="k-input" name="variation_title" placeholder="e.g. Upgrade to stone benchtops" required></label>
          <label class="k-field"><span class="k-field__label">Estimated Cost</span><input class="k-input" type="number" step="0.01" min="0" name="estimated_cost" placeholder="0.00" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Scope Description</span><textarea class="k-input" name="description" rows="3" placeholder="Explain scope change, materials and labour impact…"></textarea></label>`,
      onSubmit: (v) => api.post('/api/variations', v),
    });
    if (made) { toast.success(`Variation ${made.variation.var_number} raised.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="var-approve"]', async (e, el) => {
    const v = state.variations.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const ok = await formDialog({
      title: `Approve ${v.var_number}`,
      submitLabel: 'Record Client Approval',
      size: 'sm',
      fields: html`
        <p class="k-dialog__text">Approve <strong>${v.variation_title}</strong> (${money(v.estimated_cost_cents, { currency: state.session.settings.currency })}) and record the client sign-off timestamp.</p>
        <label class="k-field"><span class="k-field__label">Client Approval Name</span><input class="k-input" name="client_approval_name" value="${v.client || ''}" placeholder="Full name of approving client" required></label>`,
      onSubmit: (vals) => api.post('/api/variations/decide', { id: v.id, status: 'Approved', client_approval_name: vals.client_approval_name }),
    });
    if (ok) { toast.success(`${v.var_number} approved!`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="var-reject"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Mark variation rejected?', message: 'Marks this variation request as Rejected.', confirmLabel: 'Mark Rejected', danger: true });
    if (!ok) return;
    try { await api.post('/api/variations/decide', { id: Number(el.dataset.id), status: 'Rejected' }); toast.success('Variation marked Rejected.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-var"]', (e, el) => {
    const v = state.variations.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    downloadHtmlDoc(`variation-${v.var_number}.html`, {
      title: `CONTRACT VARIATION · ${v.var_number}`,
      businessName: s.business_name,
      subtitle: `${v.project_name || ''} · Client: ${v.client || '—'}`,
      accent: '#c2590a',
      bodyHtml: `
        <div class="box"><strong>Title:</strong> ${esc(v.variation_title)}<br><strong>Status:</strong> ${esc(v.status)}</div>
        <div class="box"><strong>Scope Description:</strong><br><br>${esc(v.description || '—')}</div>
        <table><tr class="total-row"><td>Estimated Variation Value (${esc(cur)})</td><td class="num">${money(v.estimated_cost_cents, { currency: cur })}</td></tr></table>
        <div class="box"><strong>Client Approval:</strong> ${v.client_approval_name ? esc(v.client_approval_name) + (v.client_approved_at ? ' · Signed ' + esc(fmtDateTime(v.client_approved_at)) : '') : 'Awaiting client sign-off'}</div>`,
    });
  });

  // Deliveries
  on(root, 'click', '[data-action="del-new"]', async () => {
    const projs = await ensureProjects();
    if (!projs.length) { toast.error('Create a project first.'); return; }
    const made = await formDialog({
      title: 'Log Material Delivery',
      submitLabel: 'Save Delivery',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Project</span><select class="k-input" name="project_id" required>${projs.map((p) => html`<option value="${p.id}">${p.project_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Delivery Date</span><input class="k-input" type="date" name="delivery_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Material</span><input class="k-input" name="material" placeholder="e.g. Reo bar, Gyprock sheets" required></label>
          <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" placeholder="Supplier name"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Quantity</span><input class="k-input" type="number" step="0.5" min="0" name="quantity" value="1" required></label>
          <label class="k-field"><span class="k-field__label">Unit</span><input class="k-input" name="unit" value="Units" placeholder="Sheets, Lengths, Pallets…"></label>
          <label class="k-field"><span class="k-field__label">Received By</span><input class="k-input" name="received_by" value="${state.session.me?.displayName || ''}"></label>
        </div>
        <label class="k-check"><input type="checkbox" name="has_issue"><span>Flag shortage, damage or wrong item issue</span></label>
        <label class="k-field"><span class="k-field__label">Issue Notes <span class="k-field__optional">optional</span></span><textarea class="k-input" name="issues" rows="2" placeholder="Describe damaged sheets, missing bundles, docket #…"></textarea></label>`,
      onSubmit: (v) => api.post('/api/deliveries', v),
    });
    if (made) { toast.success('Delivery logged.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="del-remove"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete delivery?', message: 'Delete this material delivery record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/deliveries', { id: Number(el.dataset.id) }); toast.success('Delivery deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  // Subcontractors
  const subFields = (s = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Business Name</span><input class="k-input" name="business_name" value="${s.business_name || ''}" placeholder="e.g. Coastline Electrical" required></label>
      <label class="k-field"><span class="k-field__label">Trade</span><select class="k-input" name="trade">${SUB_TRADES.map((tr) => html`<option value="${tr}" ${tr === s.trade ? 'selected' : ''}>${tr}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Contact Person</span><input class="k-input" name="contact" value="${s.contact || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${s.phone || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Insurance Expiry Date</span><input class="k-input" type="date" name="insurance_expiry" value="${s.insurance_expiry || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${SUB_STATUSES.map((st) => html`<option value="${st}" ${st === (s.status || 'Approved') ? 'selected' : ''}>${st}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Licence &amp; Compliance Notes</span><textarea class="k-input" name="notes" rows="2">${s.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="sub-new"]', async () => {
    const made = await formDialog({ title: 'Add Subcontractor', submitLabel: 'Save Subbie', size: 'lg', fields: subFields(), onSubmit: (v) => api.post('/api/subcontractors', { ...v, today: today() }) });
    if (made) { toast.success('Subcontractor added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="sub-edit"]', async (e, el) => {
    const sub = state.subcontractors.find((x) => String(x.id) === el.dataset.id);
    if (!sub) return;
    const saved = await formDialog({ title: `Edit ${sub.business_name}`, submitLabel: 'Save', size: 'lg', fields: subFields(sub), onSubmit: (v) => api.put('/api/subcontractors', { ...v, id: sub.id, today: today() }) });
    if (saved) { toast.success('Subcontractor updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="sub-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete subcontractor?', message: 'Remove this subcontractor from the register?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/subcontractors', { id: Number(el.dataset.id) }); toast.success('Subcontractor deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-ins-chase"]', () => {
    const todayStr = today();
    const alerts = state.subcontractors.filter((s) => {
      const m = insuranceCountdown(s, todayStr);
      return m.state === 'expired' || m.state === 'expiring_soon';
    });
    const lines = alerts.map((s) => {
      const m = insuranceCountdown(s, todayStr);
      return `- ${s.business_name} (${s.trade}) · ${s.contact || ''} ${s.phone || ''} · Expiry: ${s.insurance_expiry} (${m.label})`;
    });
    copyText(`Subcontractor Insurance Renewal Chase (${todayStr})\n${lines.join('\n')}`, { title: 'Insurance renewal chase list' });
  });
}
