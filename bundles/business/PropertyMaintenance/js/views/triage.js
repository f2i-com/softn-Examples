// Work-Order Triage Command (Two-Column Split + Urgent SLA & Contractor Rail) & Handyman Work Orders
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, fmtDay, fmtDayNear, daysBetween, isDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const REQ_CATS = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Garden / Grounds', 'Other'];
export const REQ_PRIOS = ['Urgent', 'High', 'Normal', 'Low'];
export const REQ_STATUSES = ['New', 'Triaged', 'Work Order Assigned', 'In Progress', 'Resolved'];
export const WO_STATUSES = ['Scheduled', 'In Progress', 'On Hold', 'Completed', 'Invoiced'];
const WO_STEPS = ['Scheduled', 'In Progress', 'Completed', 'Invoiced'];

function prioKey(p) {
  if (p === 'Urgent') return 'urgent';
  if (p === 'High') return 'high';
  if (p === 'Low') return 'low';
  return 'normal';
}

function woTone(s) {
  if (s === 'Completed' || s === 'Invoiced') return 'tk-tag--ok';
  if (s === 'On Hold') return 'tk-tag--warn';
  if (s === 'In Progress') return 'tk-tag--info';
  return 'tk-tag--accent';
}

function woCardMod(s) {
  if (s === 'Completed' || s === 'Invoiced') return 'wo-card--done';
  if (s === 'On Hold') return 'wo-card--hold';
  return '';
}

function colDotKey(col) {
  if (col === 'New') return 'new';
  if (col === 'Triaged') return 'triaged';
  if (col === 'Work Order Assigned') return 'assigned';
  if (col === 'In Progress') return 'progress';
  return 'resolved';
}

export function slaInfo(req, todayStr = today()) {
  const targets = {
    Urgent: { days: 1, label: 'Urgent / 24h', cls: 'sla-pill--urgent' },
    High: { days: 2, label: 'High / 48h', cls: 'sla-pill--high' },
    Normal: { days: 7, label: 'Routine / 7d', cls: 'sla-pill--routine' },
    Low: { days: 14, label: 'Low / 14d', cls: 'sla-pill--low' },
  };
  const cfg = targets[req.priority] || targets.Normal;
  if (req.status === 'Resolved') {
    return { label: `${cfg.label} · Met`, cls: 'sla-pill--met', overdue: false };
  }
  const elapsed = isDay(req.reported_date) ? daysBetween(req.reported_date, todayStr) : 0;
  if (elapsed > cfg.days) {
    const over = elapsed - cfg.days;
    return { label: `Overdue +${over}d`, cls: 'sla-pill--overdue', overdue: true };
  }
  if (elapsed === cfg.days && cfg.days <= 2) {
    return { label: `${cfg.label} · Due today`, cls: cfg.cls, overdue: false };
  }
  return { label: cfg.label, cls: cfg.cls, overdue: false };
}

export function extractAccessCode(notes) {
  const s = String(notes || '');
  const m = /\b(?:code|pin|lockbox|key\s*safe)\s*[:#-]?\s*([*#\dA-Za-z-]{3,10})/i.exec(s);
  if (m) return m[1];
  const m2 = /([*#]\d{3,6}[*#]?)/.exec(s);
  return m2 ? m2[1] : '';
}

export function renderKeySafeChip(accessNotes, address = '') {
  if (!accessNotes || !String(accessNotes).trim()) return '';
  const code = extractAccessCode(accessNotes);
  const copyVal = address ? `${address}\nAccess / Key Safe: ${accessNotes}` : accessNotes;
  return html`
    <button type="button" class="keysafe-chip" data-action="copy-val" data-label="Key Safe / Access Code" data-val="${copyVal}" title="Click to copy key safe &amp; access instructions">
      <span class="keysafe-chip__main">
        <span class="keysafe-chip__badge"><span class="keysafe-chip__ring" aria-hidden="true"></span>${icon('estate-key', { size: 12 })} Key Safe</span>
        ${code ? html`<span class="keysafe-chip__code">${icon('lock', { size: 11 })} ${code}</span>` : ''}
        <span class="keysafe-chip__note">${accessNotes}</span>
      </span>
      <span class="keysafe-chip__cta">${icon('copy', { size: 11 })} Copy</span>
    </button>`;
}

function renderTriageCard(r, todayStr) {
  const sla = slaInfo(r, todayStr);
  const pk = prioKey(r.priority);
  const stIdx = Math.max(0, REQ_STATUSES.indexOf(r.status));
  return html`
    <article class="${cls('triage-card', `triage-card--${pk}`, { 'triage-card--overdue': sla.overdue })}" data-key="req-${r.id}">
      <div class="pm-sev-band pm-sev-band--${sla.overdue ? 'urgent' : pk}">
        <span>${sla.overdue ? 'SLA OVERDUE' : r.priority.toUpperCase()} · ${r.category}</span>
        <span>${r.status}</span>
      </div>
      <div class="tk-ticket__top">
        <span class="req-code">${r.request_number}</span>
        <span class="sla-pill ${sla.cls}">${icon('clock', { size: 11 })} ${sla.label}</span>
      </div>
      <div style="font-weight:750;font-size:14.5px;line-height:1.25">${r.property_address || 'Property'}</div>
      <div style="font-size:13px;color:var(--k-muted);line-height:1.45">${r.description}</div>

      <div class="pm-mini-steps" aria-label="Stage ${r.status}">
        ${REQ_STATUSES.map((st, idx) => html`
          <span class="${cls('pm-mini-steps__seg', { 'is-done': idx < stIdx || r.status === 'Resolved', 'is-now': idx === stIdx && r.status !== 'Resolved' })}" title="${st}"></span>`)}
      </div>

      <div class="tk-btn-row">
        ${r.latest_wo_number ? html`<span class="req-code">${r.latest_wo_number}</span>` : ''}
        ${r.latest_assignee ? html`<span class="tk-tag tk-tag--accent">${r.latest_assignee}</span>` : ''}
        ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
      </div>

      <div class="tk-row__meta" style="font-size:12px">
        ${r.tenant_name ? html`<span>Tenant: <strong>${r.tenant_name}</strong>${r.tenant_unit ? ' (' + r.tenant_unit + ')' : ''}</span>` : ''}
        <span>Reported ${fmtDayNear(r.reported_date)}</span>
      </div>

      <div class="tk-ticket__foot">
        <div class="tk-btn-row" style="gap:5px">
          ${r.status === 'New' ? html`<button type="button" class="k-btn k-btn--sm" data-action="req-status" data-id="${r.id}" data-status="Triaged">Triage</button>` : ''}
          ${r.status !== 'Resolved' ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="req-status" data-id="${r.id}" data-status="Resolved">Resolve</button>` : ''}
        </div>
        ${r.status !== 'Resolved' ? html`
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="wo-from-req" data-id="${r.id}">${icon('wrench', { size: 13 })} Dispatch WO</button>` : html`<span class="tk-tag tk-tag--ok">Resolved ✓</span>`}
      </div>
    </article>`;
}

export function renderTriageView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();
  const q = (state.reqSearch || '').trim().toLowerCase();

  const filtered = state.requests.filter((r) => {
    if (state.reqPriority !== 'All' && r.priority !== state.reqPriority) return false;
    if (state.reqCategory !== 'All' && r.category !== state.reqCategory) return false;
    if (q) {
      const hay = `${r.request_number} ${r.property_address || ''} ${r.tenant_name || ''} ${r.description || ''} ${r.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const cols = state.showResolved ? REQ_STATUSES : REQ_STATUSES.slice(0, 4);
  const deckReqs = state.showResolved ? filtered : filtered.filter((r) => r.status !== 'Resolved');

  const totalReqs = state.requests.length;
  const overdueReqs = state.requests.filter((r) => slaInfo(r, todayStr).overdue).length;
  const onSlaCount = Math.max(0, totalReqs - overdueReqs);
  const slaPct = totalReqs ? Math.round((onSlaCount / totalReqs) * 100) : 100;
  const slaRingColor = slaPct >= 85 ? '#2dd4bf' : slaPct >= 60 ? '#f59e0b' : '#ef4444';

  const urgentWatch = state.requests.filter((r) => r.status !== 'Resolved' && (r.priority === 'Urgent' || slaInfo(r, todayStr).overdue));
  const openWos = (state.workOrders || []).filter((w) => w.status !== 'Completed' && w.status !== 'Invoiced');
  const activeKeyProps = (state.properties || []).filter((p) => p.access_notes && Number(p.open_requests || 0) > 0);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="pm-masthead" aria-label="Estate Maintenance Triage Command">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${overdueReqs > 0 ? '#f59e0b' : '#2dd4bf'}"></span>
          ESTATE OPS · ${fmtDay(todayStr, { weekday: 'short' })}
        </div>
        <h1 class="pm-masthead__title">Maintenance Triage</h1>
        <div class="pm-masthead__meta">
          <span><strong style="color:#f6dca0">${counts.openRequests || 0} open</strong> across ${counts.propertyCount || 0} sites</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Avg ${counts.avgCondition ? counts.avgCondition + '/5' : '—'}</span>
        </div>
      </div>

      <div class="pm-masthead__pods pm-masthead__pods--ring3" style="align-items:center">
        <div class="pm-pod pm-pod--ring">
          <div class="tk-ring" style="--p:${slaPct}%;--ring-color:${slaRingColor};--ring-size:48px">
            <span class="tk-ring__val">${slaPct}%</span>
          </div>
          <div>
            <span class="pm-pod__lbl">SLA Health</span>
            <div class="pm-pod__val" style="font-size:15px">${onSlaCount}/${totalReqs} On-SLA</div>
            <div class="pm-pod__sub">${overdueReqs > 0 ? `${overdueReqs} overdue` : 'All on time'}</div>
          </div>
        </div>

        <button type="button" class="${cls('pm-pod', { 'pm-pod--alert': counts.urgentRequests > 0 })}" style="text-align:left;cursor:pointer" data-action="req-prio" data-prio="Urgent">
          <span class="pm-pod__lbl">${icon('alert', { size: 11 })} Urgent</span>
          <span class="pm-pod__val">${counts.urgentRequests || 0}</span>
          <span class="pm-pod__sub">24h SLA</span>
        </button>

        <a href="#/work-orders" class="pm-pod">
          <span class="pm-pod__lbl">${icon('wrench', { size: 11 })} Work Orders</span>
          <span class="pm-pod__val">${counts.openWorkOrders || 0}</span>
          <span class="pm-pod__sub">Active →</span>
        </a>

        <div class="pm-pod pm-pod--brass">
          <span class="pm-pod__lbl">${icon('dollar', { size: 11 })} Spend</span>
          <span class="pm-pod__val">${money(counts.totalSpendCents || 0, { currency })}</span>
          <span class="pm-pod__sub">Logged WOs</span>
        </div>

        <div class="pm-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="req-new">${icon('plus', { size: 15 })} Log Request</button>
        </div>
      </div>
    </section>

    <div class="pm-split">
      <div class="tk-stack" style="gap:14px">
        <div class="pm-control-bar">
          <div class="pm-control-bar__top">
            <div class="tk-search" style="flex:1 1 210px;max-width:340px">
              ${icon('search', { size: 15 })}
              <input type="search" placeholder="Search req #, property, tenant, issue…" value="${state.reqSearch}" data-action="req-search">
            </div>
            <div class="tk-segmented" role="group" aria-label="Filter requests by priority">
              ${['All', ...REQ_PRIOS].map((p) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.reqPriority === p })}" data-action="req-prio" data-prio="${p}">
                  ${p} <span style="opacity:.65;font-size:11px;margin-left:2px">${p === 'All' ? state.requests.length : state.requests.filter((x) => x.priority === p).length}</span>
                </button>`)}
            </div>
          </div>

          <div class="pm-control-bar__bot">
            <div class="tk-segmented" role="group" aria-label="Filter by category">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.reqCategory === 'All' })}" data-action="req-cat" data-cat="All">All Trades</button>
              ${REQ_CATS.slice(0, 5).map((cat) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.reqCategory === cat })}" data-action="req-cat" data-cat="${cat}">${cat === 'Garden / Grounds' ? 'Grounds' : cat}</button>`)}
            </div>
            <div class="tk-btn-row">
              <button type="button" class="${cls('k-btn k-btn--sm', { 'k-btn--soft': state.showResolved })}" data-action="toggle-resolved">
                ${state.showResolved ? 'Hide Resolved' : 'Show Resolved'}
              </button>
              <div class="tk-segmented" role="group" aria-label="Triage view layout">
                <button type="button" class="${cls('tk-pill', { 'is-on': state.triageLayout !== 'board' })}" data-action="triage-layout" data-layout="deck">${icon('grid', { size: 13 })} Deck</button>
                <button type="button" class="${cls('tk-pill', { 'is-on': state.triageLayout === 'board' })}" data-action="triage-layout" data-layout="board">${icon('sliders', { size: 13 })} Board</button>
              </div>
            </div>
          </div>
        </div>

        ${state.loading && !state.requests.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.triageLayout === 'board' ? html`
          <div class="pm-board-wrap">
            <div class="tk-board">
              ${cols.map((col) => {
                const cards = filtered.filter((r) => r.status === col);
                return html`
                  <div class="tk-col" data-key="col-${col}">
                    <div class="tk-col__head">
                      <span class="pm-col-label"><span class="pm-col-dot pm-col-dot--${colDotKey(col)}"></span>${col}</span>
                      <span class="k-badge">${cards.length}</span>
                    </div>
                    ${cards.length ? cards.map((r) => renderTriageCard(r, todayStr)) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px">Clear</p>`}
                  </div>`;
              })}
            </div>
          </div>` : deckReqs.length ? html`
          <div class="pm-deck-grid">
            ${deckReqs.map((r) => renderTriageCard(r, todayStr))}
          </div>` : html`
          <section class="tk-sheet">
            ${emptyState({ iconName: 'triage-siren', title: 'No maintenance requests match', text: 'Adjust your filters or log a tenant maintenance request to start triage.' })}
          </section>`}
      </div>

      <aside class="pm-rail-panel" aria-label="Urgent SLA and Active Contractors Rail">
        <section class="pm-rail-card">
          <div class="pm-rail-card__head">
            <span class="pm-rail-card__title">${icon('alert', { size: 14 })} Urgent &amp; SLA Watch</span>
            <span class="k-badge ${urgentWatch.length ? 'k-badge--danger' : ''}">${urgentWatch.length}</span>
          </div>
          ${urgentWatch.length ? html`
            <div class="pm-rail-list">
              ${urgentWatch.slice(0, 4).map((r) => {
                const sla = slaInfo(r, todayStr);
                return html`
                  <div class="pm-rail-item" data-key="rail-urg-${r.id}">
                    <div class="pm-rail-item__top">
                      <div style="min-width:0">
                        <div class="pm-rail-item__name">${r.property_address}</div>
                        <div class="pm-rail-item__sub">${r.request_number} · ${r.category}</div>
                      </div>
                      <span class="sla-pill ${sla.cls}">${sla.label}</span>
                    </div>
                    <div class="pm-rail-item__foot">
                      <span style="font-size:12px;color:var(--k-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px">${r.description}</span>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="wo-from-req" data-id="${r.id}">Dispatch</button>
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All estate SLAs are on track ✓</div>`}
        </section>

        <section class="pm-rail-card">
          <div class="pm-rail-card__head">
            <span class="pm-rail-card__title">${icon('wrench', { size: 14 })} Active Contractors</span>
            <a href="#/work-orders" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.workOrders.length})</a>
          </div>
          ${openWos.length ? html`
            <div class="pm-rail-list">
              ${openWos.slice(0, 4).map((w) => html`
                <div class="pm-rail-item" data-key="rail-wo-${w.id}">
                  <div class="pm-rail-item__top">
                    <div>
                      <div class="pm-rail-item__name">${w.assigned_to}</div>
                      <div class="pm-rail-item__sub">${w.wo_number} · ${w.property_address}</div>
                    </div>
                    <span class="tk-tag ${woTone(w.status)}">${w.status}</span>
                  </div>
                  <div class="pm-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${fmtDayNear(w.scheduled_date)} · ${money(w.cost_cents || 0, { currency })}</span>
                    ${w.status === 'Scheduled'
                      ? html`<button type="button" class="k-btn k-btn--sm" data-action="wo-start" data-id="${w.id}">Start</button>`
                      : html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="wo-complete" data-id="${w.id}">Complete ✓</button>`}
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active contractor work orders scheduled.</div>`}
        </section>

        <section class="pm-rail-card">
          <div class="pm-rail-card__head">
            <span class="pm-rail-card__title">${icon('estate-key', { size: 14 })} Active Key Safes</span>
            <a href="#/properties" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Assets</a>
          </div>
          ${activeKeyProps.length ? html`
            <div class="pm-rail-list">
              ${activeKeyProps.slice(0, 3).map((p) => {
                const code = extractAccessCode(p.access_notes);
                return html`
                  <div class="pm-rail-item">
                    <div class="pm-rail-item__top">
                      <div style="min-width:0">
                        <div class="pm-rail-item__name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.address}</div>
                        <div class="pm-rail-item__sub">${p.open_requests} open request${Number(p.open_requests) === 1 ? '' : 's'}</div>
                      </div>
                      ${code ? html`<span class="keysafe-chip__code">${code}</span>` : ''}
                    </div>
                    <button type="button" class="k-btn k-btn--sm" data-action="copy-val" data-label="Access notes" data-val="${p.address}\n${p.access_notes}">${icon('copy', { size: 12 })} Copy Key Access</button>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No open site access codes needed.</div>`}
        </section>
      </aside>
    </div>`;
}

export function renderWorkOrdersView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const rows = state.woStatus === 'All' ? state.workOrders : state.workOrders.filter((w) => w.status === state.woStatus);
  const totalHrs = state.workOrders.reduce((s, w) => s + Number(w.hours || 0), 0);
  const totalCost = state.workOrders.reduce((s, w) => s + Number(w.cost_cents || 0), 0);
  const openCount = state.workOrders.filter((w) => w.status !== 'Completed' && w.status !== 'Invoiced').length;

  return html`
    <section class="pm-masthead" aria-label="Work Orders Header">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">TRADESPERSON &amp; HANDYMAN DISPATCH</div>
        <h1 class="pm-masthead__title">Work Orders</h1>
        <div class="pm-masthead__meta">
          <span>1-tap key safe access tags</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Auto-resolves requests</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('wrench', { size: 11 })} Active</span>
          <span class="pm-pod__val">${openCount}</span>
          <span class="pm-pod__sub">of ${state.workOrders.length} total</span>
        </div>
        <div class="pm-pod pm-pod--brass">
          <span class="pm-pod__lbl">${icon('dollar', { size: 11 })} Total Spend</span>
          <span class="pm-pod__val">${money(totalCost, { currency })}</span>
          <span class="pm-pod__sub">${num(totalHrs, { decimals: 1 })}h logged</span>
        </div>
        <div class="pm-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="wo-new-pick">${icon('plus', { size: 16 })} New Work Order</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter work orders by status">
        ${['All', ...WO_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.woStatus === st })}" data-action="wo-filter" data-status="${st}">
            ${st} (${st === 'All' ? state.workOrders.length : state.workOrders.filter((w) => w.status === st).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.workOrders.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="wo-card-list">
        ${rows.map((w) => {
          const stepIdx = w.status === 'On Hold' ? 1 : Math.max(0, WO_STEPS.indexOf(w.status));
          return html`
            <article class="wo-card ${woCardMod(w.status)}" data-key="wo-${w.id}">
              <div class="tk-card__head">
                <div class="tk-stack" style="gap:5px">
                  <div class="tk-row__title">
                    <span class="req-code">${w.wo_number}</span>
                    <span>${w.assigned_to}</span>
                    <span class="tk-tag ${woTone(w.status)}">${w.status}</span>
                    ${w.request_number ? html`<span class="req-code">${w.request_number}</span>` : ''}
                    ${w.priority ? html`<span class="prio-chip prio-chip--${prioKey(w.priority)}">${w.priority}</span>` : ''}
                    ${w.category ? html`<span class="tk-tag">${w.category}</span>` : ''}
                    ${w.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="font-size:14.5px"><strong>${w.property_address}</strong> — ${w.request_description || ''}</div>
                  ${w.work_done ? html`<div style="font-size:13.5px;color:var(--k-muted)">Work notes: ${w.work_done}</div>` : ''}
                </div>
                <div class="tk-row__aside">
                  ${w.status === 'Scheduled' ? html`<button type="button" class="k-btn k-btn--sm" data-action="wo-start" data-id="${w.id}">Start</button>` : ''}
                  ${w.status !== 'Completed' && w.status !== 'Invoiced' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="wo-complete" data-id="${w.id}">${icon('check', { size: 15 })} Complete &amp; Resolve</button>` : ''}
                  <button type="button" class="k-btn k-btn--sm" data-action="print-wo" data-id="${w.id}">${icon('printer', { size: 14 })} Sheet</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="wo-edit" data-id="${w.id}">Edit</button>
                </div>
              </div>
              ${renderKeySafeChip(w.access_notes, w.property_address)}
              <div class="tk-row__meta">
                <span class="pm-meta-ico">${icon('calendar', { size: 13 })} Scheduled: <strong>${fmtDayNear(w.scheduled_date)}</strong> (${fmtDay(w.scheduled_date)})</span>
                <span class="pm-meta-ico">${icon('clock', { size: 13 })} ${num(w.hours || 0, { decimals: 2 })} h</span>
                <span>Cost: <strong>${money(w.cost_cents || 0, { currency })}</strong></span>
                ${w.tenant_name ? html`<span>Tenant: ${w.tenant_name} ${w.tenant_phone ? '(' + w.tenant_phone + ')' : ''}</span>` : ''}
              </div>
              <div class="pm-wo-steps" aria-label="Work order stage">
                ${WO_STEPS.map((st, idx) => html`
                  <div class="${cls('pm-wo-step', { 'is-done': idx < stepIdx || w.status === 'Invoiced', 'is-now': idx === stepIdx && w.status !== 'Invoiced' })}">
                    ${idx < stepIdx || w.status === 'Invoiced' ? icon('check', { size: 12 }) : ''} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'wrench', title: 'No work orders here', text: 'Create a work order from any tenant maintenance request on the Triage Board.' })}</section>`}`;
}

export function reqFormFields(properties, tenants, defaultPropId = '') {
  const chosenProp = defaultPropId || (properties[0] ? properties[0].id : '');
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Property</span>
        <select class="k-input" name="property_id" required>
          ${properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(chosenProp) ? 'selected' : ''}>${p.address} (${p.property_type})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Reporting Tenant <span class="k-field__optional">optional</span></span>
        <select class="k-input" name="tenant_id">
          <option value="">Landlord / Manager reported</option>
          ${tenants.map((t) => html`<option value="${t.id}">${t.name}${t.unit ? ' · ' + t.unit : ''} (${t.property_address || ''})</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span>
        <select class="k-input" name="category">${REQ_CATS.map((c) => html`<option value="${c}">${c}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">${REQ_PRIOS.map((p) => html`<option value="${p}" ${p === 'Normal' ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Reported Date</span>
        <input class="k-input" type="date" name="reported_date" value="${today()}" required>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Issue Description</span>
      <textarea class="k-input" name="description" rows="3" placeholder="Describe the fault, location and urgency…" required></textarea>
    </label>`;
}

export function wireTriageActions(root, state, { draw, loadScreen, navigate }) {
  on(root, 'click', '[data-action="triage-layout"]', (e, el) => { state.triageLayout = el.dataset.layout; draw(); });
  on(root, 'click', '[data-action="req-prio"]', (e, el) => {
    const pr = el.dataset.prio;
    state.reqPriority = state.reqPriority === pr && pr !== 'All' ? 'All' : pr;
    draw();
  });
  on(root, 'click', '[data-action="req-cat"]', (e, el) => { state.reqCategory = el.dataset.cat; draw(); });
  on(root, 'input', '[data-action="req-search"]', (e, el) => { state.reqSearch = el.value; draw(); });
  on(root, 'click', '[data-action="toggle-resolved"]', () => { state.showResolved = !state.showResolved; draw(); });
  on(root, 'click', '[data-action="wo-filter"]', (e, el) => { state.woStatus = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="copy-val"]', (e, el) => copyText(el.dataset.val, { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Details'} copied.` }));

  async function ensurePortfolio() {
    if (!state.properties.length) {
      const [p, t] = await Promise.all([api.get('/api/properties'), api.get('/api/tenants')]);
      state.properties = p.properties || [];
      state.tenants = t.tenants || [];
    }
  }

  on(root, 'click', '[data-action="req-new"]', async () => {
    await ensurePortfolio();
    if (!state.properties.length) { toast.error('Add a property first.'); navigate('/properties'); return; }
    const made = await formDialog({
      title: 'Log Maintenance Request',
      submitLabel: 'Submit Request',
      size: 'lg',
      fields: reqFormFields(state.properties, state.tenants),
      onSubmit: (v) => api.post('/api/requests', v),
    });
    if (made) { toast.success(`Request ${made.request.request_number} logged.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="req-status"]', async (e, el) => {
    try { await api.post('/api/requests/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Request marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="wo-from-req"]', async (e, el) => {
    const req = state.requests.find((x) => String(x.id) === el.dataset.id);
    if (!req) return;
    const made = await formDialog({
      title: `Create Work Order for ${req.request_number}`,
      submitLabel: 'Dispatch Work Order',
      fields: html`
        <p class="k-dialog__text"><strong>${req.property_address}</strong> — ${req.description}</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Assigned Handyman / Trade</span><input class="k-input" name="assigned_to" placeholder="e.g. Greg Miller (Handyman)" required></label>
          <label class="k-field"><span class="k-field__label">Scheduled Date</span><input class="k-input" type="date" name="scheduled_date" value="${today()}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Instructions / Scope</span><textarea class="k-input" name="work_done" rows="2" placeholder="Bring replacement parts, call tenant 30 min prior…"></textarea></label>`,
      onSubmit: (v) => api.post('/api/work-orders', { ...v, request_id: req.id, status: 'Scheduled' }),
    });
    if (made) { toast.success(`Work Order ${made.workOrder.wo_number} dispatched!`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="wo-new-pick"]', async () => {
    if (!state.requests.length) {
      const r = await api.get('/api/requests');
      state.requests = r.requests || [];
    }
    const open = state.requests.filter((r) => r.status !== 'Resolved');
    const choices = open.length ? open : state.requests;
    if (!choices.length) { toast.error('Log a maintenance request first.'); return; }
    const made = await formDialog({
      title: 'Create Handyman Work Order',
      submitLabel: 'Save Work Order',
      fields: html`
        <label class="k-field"><span class="k-field__label">Maintenance Request</span>
          <select class="k-input" name="request_id">${choices.map((r) => html`<option value="${r.id}">${r.request_number} — ${r.property_address} (${r.category})</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to" required></label>
          <label class="k-field"><span class="k-field__label">Scheduled Date</span><input class="k-input" type="date" name="scheduled_date" value="${today()}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes / Scope</span><textarea class="k-input" name="work_done" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/work-orders', v),
    });
    if (made) { toast.success(`Work Order ${made.workOrder.wo_number} created.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="wo-start"]', async (e, el) => {
    try { await api.put('/api/work-orders', { id: Number(el.dataset.id), status: 'In Progress' }); toast.success('Work order started.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="wo-complete"]', async (e, el) => {
    const wo = state.workOrders.find((x) => String(x.id) === el.dataset.id);
    if (!wo) return;
    const done = await formDialog({
      title: `Complete ${wo.wo_number} & Resolve Request`,
      submitLabel: 'Complete Work Order',
      fields: html`
        <p class="k-dialog__text">Completing this work order automatically marks <strong>${wo.request_number}</strong> as <strong>Resolved</strong>.</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hours Worked</span><input class="k-input" type="number" step="0.25" min="0" name="hours" value="${wo.hours || 1.5}" required></label>
          <label class="k-field"><span class="k-field__label">Total Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" value="${wo.cost_cents ? (wo.cost_cents / 100).toFixed(2) : '0.00'}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Work Done &amp; Parts Used</span><textarea class="k-input" name="work_done" rows="3" required>${wo.work_done || ''}</textarea></label>`,
      onSubmit: (v) => api.post('/api/work-orders/complete', { ...v, id: wo.id }),
    });
    if (done) { toast.success(`${wo.wo_number} completed & linked request resolved!`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="wo-edit"]', async (e, el) => {
    const wo = state.workOrders.find((x) => String(x.id) === el.dataset.id);
    if (!wo) return;
    const saved = await formDialog({
      title: `Edit ${wo.wo_number}`,
      submitLabel: 'Save',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Assigned To</span><input class="k-input" name="assigned_to" value="${wo.assigned_to}" required></label>
          <label class="k-field"><span class="k-field__label">Scheduled Date</span><input class="k-input" type="date" name="scheduled_date" value="${wo.scheduled_date}" required></label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">${WO_STATUSES.map((s) => html`<option value="${s}" ${s === wo.status ? 'selected' : ''}>${s}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hours</span><input class="k-input" type="number" step="0.25" min="0" name="hours" value="${wo.hours || 0}"></label>
          <label class="k-field"><span class="k-field__label">Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" value="${(Number(wo.cost_cents || 0) / 100).toFixed(2)}"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Work Done</span><textarea class="k-input" name="work_done" rows="3">${wo.work_done || ''}</textarea></label>`,
      onSubmit: (v) => api.put('/api/work-orders', { ...v, id: wo.id }),
    });
    if (saved) { toast.success('Work order saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="print-wo"]', (e, el) => {
    const w = state.workOrders.find((x) => String(x.id) === el.dataset.id);
    if (!w) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    downloadHtmlDoc(`work-order-${w.wo_number}.html`, {
      title: `WORK ORDER · ${w.wo_number}`,
      businessName: s.business_name,
      subtitle: [s.phone, s.email].filter(Boolean).join(' · '),
      accent: '#0d6e6e',
      bodyHtml: `
        <div class="box">
          <strong>Property:</strong> ${esc(w.property_address || '')}<br>
          <strong>Tenant:</strong> ${esc(w.tenant_name || 'N/A')} ${w.tenant_phone ? '(' + esc(w.tenant_phone) + ')' : ''}<br>
          <strong>Assigned Tradesperson:</strong> ${esc(w.assigned_to)} &nbsp; <strong>Scheduled:</strong> ${esc(fmtDay(w.scheduled_date))}<br>
          <strong>Request Ref:</strong> ${esc(w.request_number || '')} (${esc(w.category || '')} · ${esc(w.priority || '')}) &nbsp; <strong>Status:</strong> ${esc(w.status)}
        </div>
        ${w.access_notes ? `<div class="box"><strong>Site Access / Key Safe:</strong> ${esc(w.access_notes)}</div>` : ''}
        <div class="box"><strong>Reported Issue:</strong><br>${esc(w.request_description || '')}</div>
        <div class="box"><strong>Work Done &amp; Notes:</strong><br>${esc(w.work_done || 'Pending completion')}</div>
        <table>
          <tr><th>Hours Logged</th><td class="num">${num(w.hours || 0, { decimals: 2 })} hrs</td></tr>
          <tr class="total-row"><td>Work Order Cost (${esc(cur)})</td><td class="num">${money(w.cost_cents || 0, { currency: cur })}</td></tr>
        </table>`,
    });
  });
}
