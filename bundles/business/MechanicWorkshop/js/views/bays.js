// Interactive Workshop Bay Command (Two-Column Bay Deck + Live Hoist Floor Rail) & Job Card Workbench
import { html, on, cls, readForm, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const CARD_STATUSES = ['Booked In', 'Diagnosing', 'Waiting Parts', 'On Hoist', 'Ready for Pickup', 'Collected'];
export const CARD_PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
export const BAYS = ['Hoist 1', 'Hoist 2', 'Hoist 3', 'Bay 1', 'Bay 2', 'Diag Bay', 'Quick Service', ''];

const NEXT_STAGE = {
  'Booked In': { status: 'Diagnosing', label: 'Start Diag' },
  Diagnosing: { status: 'On Hoist', label: 'Put On Hoist' },
  'Waiting Parts': { status: 'On Hoist', label: 'Parts In · Hoist' },
  'On Hoist': { status: 'Ready for Pickup', label: 'Mark Ready' },
  'Ready for Pickup': { status: 'Collected', label: 'Collected' },
};

function prioKey(p) {
  if (p === 'Urgent') return 'urgent';
  if (p === 'High') return 'high';
  if (p === 'Low') return 'low';
  return 'normal';
}

function colDotKey(col) {
  if (col === 'Diagnosing') return 'diag';
  if (col === 'Waiting Parts') return 'parts';
  if (col === 'On Hoist') return 'hoist';
  if (col === 'Ready for Pickup') return 'ready';
  if (col === 'Collected') return 'done';
  return 'booked';
}

export function regoPlate(plate, { compact = false } = {}) {
  const txt = String(plate || 'NO PLATE').toUpperCase();
  return html`
    <span class="${cls('rego-plate', { 'rego-plate--sm': compact })}" aria-label="Plate ${txt}">
      <span class="rego-plate__strip" aria-hidden="true"></span>
      <span class="rego-plate__num">${txt}</span>
    </span>`;
}

export function vehicleHeader({ make, model, year, odometer }, { clickable = false, cardId = null } = {}) {
  const odoText = `${num(Number(odometer || 0))} km`;
  return html`
    <div class="${cls('veh-header', { 'veh-header--click': clickable })}" ${clickable && cardId ? html`data-action="open-card" data-id="${cardId}"` : ''}>
      <span class="veh-header__main">
        <span class="veh-header__make">${make || 'Vehicle'} ${model || ''}</span>
        ${year ? html`<span class="veh-header__dot" aria-hidden="true">·</span><span class="veh-header__year">${year}</span>` : ''}
      </span>
      <span class="veh-header__odo">${odoText}</span>
    </div>`;
}

export function renderBayProgress(status) {
  const idx = Math.max(0, CARD_STATUSES.indexOf(status));
  const stepNum = idx + 1;
  const mod = status === 'Waiting Parts'
    ? 'bay-progress--hold'
    : (status === 'Ready for Pickup' || status === 'Collected')
      ? 'bay-progress--ready'
      : '';
  return html`
    <div class="bay-progress ${mod}" aria-label="Bay stage ${stepNum} of ${CARD_STATUSES.length}: ${status}">
      <div class="bay-progress__meta">
        <span class="bay-progress__stage">${status}</span>
        <span>Step ${stepNum} / ${CARD_STATUSES.length}</span>
      </div>
      <div class="bay-progress__bars">
        ${CARD_STATUSES.map((st, i) => html`
          <span class="${cls('bay-progress__seg', { 'is-done': i < idx, 'is-now': i === idx })}" title="${st}"></span>`)}
      </div>
    </div>`;
}

function calcCardEstimate(card, settings) {
  const rateCents = Number(settings.workshop_rate_cents || 13500);
  const taxRate = Number(settings.tax_rate || 0);
  const hrs = Number(card.labour_hours || 0);
  const labourCents = Math.round(hrs * rateCents);
  const partsCents = Number(card.parts_total_cents || 0);
  const subtotalCents = labourCents + partsCents;
  const taxCents = Math.round(subtotalCents * (taxRate / 100));
  const totalCents = subtotalCents + taxCents;
  return { hrs, labourCents, partsCents, subtotalCents, taxCents, totalCents, taxRate };
}

export function buildReadySms(card, settings) {
  const cur = settings.currency || 'AUD';
  const biz = settings.business_name || 'Our Workshop';
  const est = calcCardEstimate(card, settings);
  const veh = `${card.year || ''} ${card.make || ''} ${card.model || ''} (${card.registration || 'vehicle'})`.trim();
  const phoneNote = card.customer_phone ? `\n[To: ${card.customer_phone}]` : '';
  const contact = settings.phone ? ` Call ${settings.phone} if you need anything.` : '';
  if (card.status === 'Ready for Pickup' || card.status === 'Collected') {
    return `Hi ${card.customer_name || 'there'}, great news — your ${veh} is READY FOR PICKUP at ${biz}! Job ${card.card_number} total: ${money(est.totalCents, { currency: cur })} (Labour ${money(est.labourCents, { currency: cur })} + Parts ${money(est.partsCents, { currency: cur })}${est.taxCents ? ' + Tax ' + money(est.taxCents, { currency: cur }) : ''}).${contact}${phoneNote}`;
  }
  return `Hi ${card.customer_name || 'there'}, update from ${biz} on your ${veh} (${card.card_number}): currently ${card.status}${card.bay_number ? ' in ' + card.bay_number : ''}. Current estimate: ${money(est.totalCents, { currency: cur })} (Labour + Parts). We will text you as soon as it is ready for pickup.${contact}${phoneNote}`;
}

function normSearch(text) {
  return String(text || '').toLowerCase().replaceAll('-', '').replaceAll(' ', '');
}

function renderBayCard(c, settings, currency) {
  const next = NEXT_STAGE[c.status];
  const est = calcCardEstimate(c, settings);
  return html`
    <article class="bay-card bay-card--${prioKey(c.priority)}" data-key="card-${c.id}">
      <div class="tk-ticket__top">
        ${regoPlate(c.registration)}
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end">
          <span class="prio-badge prio-badge--${prioKey(c.priority)}">${c.priority}</span>
          ${c.bay_number ? html`<span class="bay-badge">${c.bay_number}</span>` : ''}
        </div>
      </div>
      ${vehicleHeader({ make: c.make, model: c.model, year: c.year, odometer: c.odometer_in || c.vehicle_odometer }, { clickable: true, cardId: c.id })}
      ${renderBayProgress(c.status)}
      <div class="bay-card__complaint">${c.complaint}</div>
      <div class="bay-est">
        <div class="bay-est__pills">
          <span class="bay-est__pill">Labour <strong>${money(est.labourCents, { currency })}</strong> (${num(est.hrs, { decimals: 1 })}h)</span>
          <span class="bay-est__pill">Parts <strong>${money(est.partsCents, { currency })}</strong></span>
        </div>
        <span class="bay-est__total" title="Labour + Parts subtotal">${money(est.subtotalCents, { currency })}</span>
      </div>
      <div class="tk-btn-row">
        <span class="vin-chip">${c.card_number}</span>
        ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
        <span class="tk-muted" style="font-size:12px">${c.customer_name || ''} · <strong>${c.technician || 'Unassigned'}</strong></span>
      </div>
      <div class="tk-ticket__foot">
        <div class="tk-btn-row" style="gap:5px">
          <button type="button" class="k-btn k-btn--sm" data-action="open-card" data-id="${c.id}">Workbench</button>
          <button type="button" class="sms-chip" title="Copy Customer Ready SMS" data-action="copy-ready-sms" data-id="${c.id}">${icon('chat', { size: 12 })} Ready SMS</button>
        </div>
        ${next ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="card-status" data-id="${c.id}" data-status="${next.status}">${next.label}</button>` : ''}
      </div>
    </article>`;
}

export function renderBaysView(state) {
  const settings = state.session.settings;
  const currency = settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const q = (state.cardSearch || '').trim().toLowerCase();
  const qNorm = normSearch(q);

  const filtered = state.cards.filter((c) => {
    if (state.cardPriority !== 'All' && c.priority !== state.cardPriority) return false;
    if (state.cardStageFilter && state.cardStageFilter !== 'All' && c.status !== state.cardStageFilter) return false;
    if (q) {
      const hay = `${c.card_number} ${c.registration || ''} ${c.vin || ''} ${c.make || ''} ${c.model || ''} ${c.customer_name || ''} ${c.customer_phone || ''} ${c.complaint || ''} ${c.technician || ''} ${c.bay_number || ''}`.toLowerCase();
      if (!hay.includes(q) && !normSearch(c.registration).includes(qNorm)) return false;
    }
    return true;
  });

  const cols = state.showCollected ? CARD_STATUSES : CARD_STATUSES.slice(0, 5);
  const deckCards = state.showCollected || state.cardStageFilter === 'Collected'
    ? filtered
    : filtered.filter((c) => c.status !== 'Collected');

  const namedBays = BAYS.filter(Boolean);
  const totalBays = namedBays.length;
  const activeCards = state.cards.filter((c) => c.status !== 'Collected');
  const bayOccupant = new Map();
  for (const c of activeCards) {
    const b = (c.bay_number || '').trim();
    if (b && !bayOccupant.has(b)) bayOccupant.set(b, c);
  }
  const occupiedBays = bayOccupant.size > 0 ? bayOccupant.size : Math.min(totalBays, Number(counts.inShop || activeCards.length));
  const bayPct = Math.min(100, Math.round((occupiedBays / totalBays) * 100));
  const bayRingColor = bayPct >= 85 ? '#ef4444' : bayPct >= 50 ? '#f59e0b' : '#22c55e';

  const readyCards = state.cards.filter((c) => c.status === 'Ready for Pickup');

  // Mechanic workload stats
  const mechNames = Array.from(new Set(activeCards.map((c) => (c.technician || '').trim()).filter((x) => x && x !== 'Unassigned'))).sort();
  const mechStats = mechNames.map((m) => {
    const list = activeCards.filter((c) => (c.technician || '').trim() === m);
    const hrs = list.reduce((s, c) => s + Number(c.labour_hours || 0), 0);
    return { name: m, count: list.length, hrs };
  }).sort((a, b) => b.count - a.count);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="mw-masthead" aria-label="Workshop Bay Command">
      <div class="mw-masthead__copy">
        <div class="mw-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f59e0b"></span>
          BAY FLOOR LIVE · ${fmtDay(today(), { weekday: 'short' })}
        </div>
        <h1 class="mw-masthead__title">Workshop Bay Board</h1>
        <div class="mw-masthead__meta">
          <span><strong style="color:#fde68a">${counts.inShop || 0} in shop</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${money(settings.workshop_rate_cents || 13500, { currency })}/hr</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${money(counts.unpaidCents || 0, { currency })} unpaid</span>
        </div>
      </div>

      <div class="mw-masthead__pods mw-masthead__pods--ring3" style="align-items:center">
        <div class="mw-pod mw-pod--ring">
          <div class="tk-ring" style="--p:${bayPct}%;--ring-color:${bayRingColor};--ring-size:48px">
            <span class="tk-ring__val">${bayPct}%</span>
          </div>
          <div>
            <span class="mw-pod__lbl">Bay Load</span>
            <div class="mw-pod__val" style="font-size:15px">${occupiedBays}/${totalBays} Bays</div>
            <div class="mw-pod__sub">${counts.onHoist || 0} on hoist</div>
          </div>
        </div>

        <button type="button" class="mw-pod mw-pod--cobalt" style="text-align:left;cursor:pointer" data-action="stage-filter" data-stage="On Hoist">
          <span class="mw-pod__lbl">${icon('car-hoist', { size: 11 })} On Hoist</span>
          <span class="mw-pod__val">${counts.onHoist || 0}</span>
          <span class="mw-pod__sub">Active lift</span>
        </button>

        <button type="button" class="${cls('mw-pod', { 'mw-pod--alert': counts.waitingParts > 0 })}" style="text-align:left;cursor:pointer" data-action="stage-filter" data-stage="Waiting Parts">
          <span class="mw-pod__lbl">${icon('alert', { size: 11 })} Hold</span>
          <span class="mw-pod__val">${counts.waitingParts || 0}</span>
          <span class="mw-pod__sub">Waiting parts</span>
        </button>

        <button type="button" class="mw-pod mw-pod--ok" style="text-align:left;cursor:pointer" data-action="stage-filter" data-stage="Ready for Pickup">
          <span class="mw-pod__lbl">${icon('check', { size: 11 })} Ready</span>
          <span class="mw-pod__val">${counts.readyPickup || 0}</span>
          <span class="mw-pod__sub">For pickup</span>
        </button>

        <div class="mw-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="card-new">${icon('plus', { size: 15 })} Check In Vehicle</button>
        </div>
      </div>
    </section>

    <div class="mw-split">
      <div class="tk-stack" style="gap:14px">
        <div class="mw-control-bar">
          <div class="mw-control-bar__top">
            <div class="tk-search" style="flex:1 1 220px;max-width:340px">
              ${icon('search', { size: 15 })}
              <input type="search" placeholder="Search rego plate, VIN, customer, make, tech…" value="${state.cardSearch}" data-action="card-search">
            </div>
            <div class="tk-segmented" role="group" aria-label="Filter job cards by priority">
              ${['All', ...CARD_PRIORITIES].map((p) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.cardPriority === p })}" data-action="card-prio" data-prio="${p}">
                  ${p} <span style="opacity:.65;font-size:11px;margin-left:2px">${p === 'All' ? state.cards.length : state.cards.filter((x) => x.priority === p).length}</span>
                </button>`)}
            </div>
          </div>

          <div class="mw-control-bar__bot">
            <div class="tk-segmented" role="group" aria-label="Filter by bay stage">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.cardStageFilter === 'All' })}" data-action="stage-filter" data-stage="All">All Stages</button>
              ${['Booked In', 'Diagnosing', 'Waiting Parts', 'On Hoist', 'Ready for Pickup'].map((st) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.cardStageFilter === st })}" data-action="stage-filter" data-stage="${st}">
                  ${st === 'Ready for Pickup' ? 'Ready' : st}
                </button>`)}
            </div>
            <div class="tk-btn-row">
              <button type="button" class="${cls('k-btn k-btn--sm', { 'k-btn--soft': state.showCollected })}" data-action="toggle-collected">
                ${state.showCollected ? 'Hide Collected' : 'Show Collected'}
              </button>
              <div class="tk-segmented" role="group" aria-label="Workshop layout">
                <button type="button" class="${cls('tk-pill', { 'is-on': state.bayLayout !== 'board' })}" data-action="bay-layout" data-layout="deck">${icon('grid', { size: 13 })} Deck</button>
                <button type="button" class="${cls('tk-pill', { 'is-on': state.bayLayout === 'board' })}" data-action="bay-layout" data-layout="board">${icon('sliders', { size: 13 })} Board</button>
              </div>
            </div>
          </div>
        </div>

        ${state.loading && !state.cards.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.bayLayout === 'board' ? html`
          <div class="mw-board-wrap">
            <div class="tk-board">
              ${cols.map((col) => {
                const cards = filtered.filter((c) => c.status === col);
                return html`
                  <div class="tk-col" data-key="col-${col}">
                    <div class="tk-col__head">
                      <span class="mw-col-label"><span class="mw-col-dot mw-col-dot--${colDotKey(col)}"></span>${col}</span>
                      <span class="k-badge ${col === 'Waiting Parts' && cards.length ? 'k-badge--danger' : ''}">${cards.length}</span>
                    </div>
                    ${cards.length ? cards.map((c) => renderBayCard(c, settings, currency)) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px">Bay clear</p>`}
                  </div>`;
              })}
            </div>
          </div>` : deckCards.length ? html`
          <div class="mw-deck-grid">
            ${deckCards.map((c) => renderBayCard(c, settings, currency))}
          </div>` : html`
          <section class="tk-sheet">
            ${emptyState({ iconName: 'car-hoist', title: 'No job cards match filter', text: 'Clear filters or check a vehicle into a workshop bay.' })}
          </section>`}
      </div>

      <aside class="mw-rail-panel" aria-label="Live Hoist Floor and Counter Queue">
        <section class="mw-rail-card">
          <div class="mw-rail-card__head">
            <span class="mw-rail-card__title">${icon('car-hoist', { size: 14 })} Live Hoist &amp; Bay Floor</span>
            <span class="k-badge">${occupiedBays}/${totalBays}</span>
          </div>
          <div>
            ${namedBays.map((bay) => {
              const occ = bayOccupant.get(bay);
              if (occ) {
                return html`
                  <button type="button" class="mw-hoist-slot mw-hoist-slot--busy" data-action="open-card" data-id="${occ.id}">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0">
                      <span class="mw-hoist-slot__dot ${occ.status === 'Waiting Parts' ? 'mw-hoist-slot__dot--hold' : 'mw-hoist-slot__dot--busy'}"></span>
                      <div style="min-width:0">
                        <div style="font-weight:750;color:var(--k-text)">${bay}</div>
                        <div style="font-size:11.5px;color:var(--k-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${occ.make} ${occ.model}</div>
                      </div>
                    </div>
                    ${regoPlate(occ.registration, { compact: true })}
                  </button>`;
              }
              return html`
                <div class="mw-hoist-slot">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span class="mw-hoist-slot__dot"></span>
                    <span style="font-weight:650">${bay}</span>
                  </div>
                  <span class="tk-tag tk-tag--ok">Open</span>
                </div>`;
            })}
          </div>
        </section>

        <section class="mw-rail-card">
          <div class="mw-rail-card__head">
            <span class="mw-rail-card__title">${icon('check', { size: 14 })} Pickup Counter Queue</span>
            <a href="#/invoices" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Invoices</a>
          </div>
          ${readyCards.length ? html`
            <div class="mw-rail-list">
              ${readyCards.slice(0, 4).map((c) => {
                const est = calcCardEstimate(c, settings);
                return html`
                  <div class="mw-rail-item" data-key="rail-rdy-${c.id}">
                    <div class="mw-rail-item__top">
                      <div>
                        <div class="mw-rail-item__name">${c.customer_name || 'Customer'}</div>
                        <div class="mw-rail-item__sub">${c.make} ${c.model} · ${money(est.totalCents, { currency })}</div>
                      </div>
                      ${regoPlate(c.registration, { compact: true })}
                    </div>
                    <div class="mw-rail-item__foot">
                      <button type="button" class="sms-chip" data-action="copy-ready-sms" data-id="${c.id}">${icon('chat', { size: 12 })} SMS</button>
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="card-status" data-id="${c.id}" data-status="Collected">Collected ✓</button>
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No vehicles waiting at the pickup counter.</div>`}
        </section>

        <section class="mw-rail-card">
          <div class="mw-rail-card__head">
            <span class="mw-rail-card__title">${icon('torque-wrench', { size: 14 })} Mechanic Load</span>
            <span class="k-badge">${mechStats.length} Active</span>
          </div>
          ${mechStats.length ? html`
            <div class="mw-rail-list">
              ${mechStats.map((m) => html`
                <div class="mw-rail-item" style="padding:9px 14px">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="mw-cust-av" style="width:28px;height:28px;border-radius:8px;font-size:11px">${initials(m.name)}</span>
                      <span style="font-size:13.5px;font-weight:750">${m.name}</span>
                    </div>
                    <span class="k-badge k-badge--accent">${m.count} job${m.count === 1 ? '' : 's'} · ${num(m.hrs, { decimals: 1 })}h</span>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Assign mechanics to job cards to track floor hours.</div>`}
        </section>
      </aside>
    </div>`;
}

export function renderCardWorkbenchView(state) {
  if (state.loading && !state.cardDetail) {
    return html`<section class="tk-sheet">${skeleton(4)}</section>`;
  }
  const d = state.cardDetail;
  if (!d || !d.card) {
    return emptyState({
      iconName: 'car-hoist',
      title: 'Job card not selected',
      text: 'Choose a vehicle from the Bay Pipeline to open its job card workbench.',
      action: html`<a href="#/" class="k-btn k-btn--primary k-btn--sm">Back to Bay Pipeline</a>`,
    });
  }

  const { card, parts = [], invoices = [] } = d;
  const s = state.session.settings;
  const currency = s.currency || 'AUD';
  const rateCents = Number(s.workshop_rate_cents || 13500);
  const taxRate = Number(s.tax_rate || 0);
  const labourCents = Math.round(Number(card.labour_hours || 0) * rateCents);
  const partsCents = parts.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_cost_cents), 0);
  const subCents = labourCents + partsCents;
  const taxCents = Math.round(subCents * (taxRate / 100));
  const totalCents = subCents + taxCents;
  const stageIdx = CARD_STATUSES.indexOf(card.status);

  return html`
    <section class="mw-masthead" aria-label="Job Card Header">
      <div class="mw-masthead__copy">
        <div class="mw-masthead__eyebrow">
          <a href="#/">${icon('arrow-left', { size: 12 })} Bay Pipeline</a>
          <span>·</span>
          <span>${card.card_number}</span>
          <span>·</span>
          <span>${card.bay_number || 'Unassigned Bay'}</span>
        </div>
        <h1 class="mw-masthead__title">${card.make} ${card.model} (${card.year})</h1>
        <div class="mw-masthead__meta">
          ${regoPlate(card.registration, { compact: true })}
          <span>${num(card.odometer_in || card.vehicle_odometer || 0)} km</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${card.customer_name || 'Owner'}</span>
        </div>
      </div>

      <div class="mw-masthead__pods" style="align-items:center">
        <div class="mw-pod mw-pod--cobalt">
          <span class="mw-pod__lbl">${icon('clock', { size: 11 })} Labour</span>
          <span class="mw-pod__val">${num(card.labour_hours || 0, { decimals: 2 })}h</span>
          <span class="mw-pod__sub">${money(labourCents, { currency })}</span>
        </div>
        <div class="mw-pod mw-pod--amber">
          <span class="mw-pod__lbl">${icon('receipt', { size: 11 })} Est. Total</span>
          <span class="mw-pod__val">${money(totalCents, { currency })}</span>
          <span class="mw-pod__sub">${parts.length} part${parts.length === 1 ? '' : 's'} fitted</span>
        </div>
        <div class="mw-masthead__cta">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-ready-sms" data-id="${card.id}">${icon('chat', { size: 14 })} Ready SMS</button>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="print-job-card">${icon('printer', { size: 14 })} Sheet</button>
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="card-invoice" data-id="${card.id}">${icon('receipt', { size: 14 })} Generate Invoice</button>
        </div>
      </div>
    </section>

    <section class="tk-sheet" style="margin-bottom:16px">
      <div class="tk-sheet__head">
        <h2 class="tk-sheet__title">${icon('sliders', { size: 17 })} 6-Step Bay Stage</h2>
        <span class="tk-tag tk-tag--accent">Step ${Math.max(1, stageIdx + 1)} of ${CARD_STATUSES.length}</span>
        <div class="tk-sheet__actions">
          ${card.vin ? html`<button type="button" class="vin-chip" data-action="copy-val" data-label="VIN" data-val="${card.vin}">VIN: ${card.vin} ${icon('copy', { size: 11 })}</button>` : ''}
          ${card.customer_phone ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-val" data-label="Customer phone" data-val="${card.customer_phone}">${icon('phone', { size: 13 })} ${card.customer_phone}</button>` : ''}
        </div>
      </div>
      <div class="tk-sheet__body">
        <div class="stage-rail">
          ${CARD_STATUSES.map((st, idx) => html`
            <button type="button" class="${cls('stage-step', { 'is-now': st === card.status, 'is-done': idx < stageIdx })}" data-action="card-status" data-id="${card.id}" data-status="${st}">
              ${idx < stageIdx ? icon('check', { size: 14 }) : ''} ${st}
            </button>`)}
        </div>
      </div>
    </section>

    <div class="workbench-grid">
      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('engine-diag', { size: 18 })} Job Card Details &amp; Mechanic Notes</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-card" novalidate>
              <input type="hidden" name="id" value="${card.id}">
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Assigned Mechanic</span><input class="k-input" name="technician" value="${card.technician || ''}" placeholder="e.g. Shane Kelly"></label>
                <label class="k-field"><span class="k-field__label">Bay / Hoist</span>
                  <select class="k-input" name="bay_number">
                    <option value="">Unassigned</option>
                    ${BAYS.filter(Boolean).map((b) => html`<option value="${b}" ${b === card.bay_number ? 'selected' : ''}>${b}</option>`)}
                  </select>
                </label>
                <label class="k-field"><span class="k-field__label">Priority</span>
                  <select class="k-input" name="priority">${CARD_PRIORITIES.map((p) => html`<option value="${p}" ${p === card.priority ? 'selected' : ''}>${p}</option>`)}</select>
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Labour Hours</span><input class="k-input" type="number" step="0.25" min="0" name="labour_hours" value="${card.labour_hours ?? 0}" required></label>
                <label class="k-field"><span class="k-field__label">Odometer In (km)</span><input class="k-input" type="number" step="1" min="0" name="odometer_in" value="${card.odometer_in || card.vehicle_odometer || 0}"></label>
                <label class="k-field"><span class="k-field__label">Date In</span><input class="k-input" type="date" name="date_in" value="${card.date_in || today()}" required></label>
              </div>
              <label class="k-field"><span class="k-field__label">Customer Complaint / Work Requested</span><textarea class="k-input" name="complaint" rows="2" required>${card.complaint || ''}</textarea></label>
              <label class="k-field"><span class="k-field__label">Mechanic Diagnosis &amp; Work Performed</span><textarea class="k-input" name="diagnosis" rows="3" placeholder="Findings, fault codes, road test results…">${card.diagnosis || ''}</textarea></label>
              <div class="k-form__actions">
                <button type="submit" class="k-btn k-btn--primary">Save Job Card</button>
              </div>
            </form>
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('torque-wrench', { size: 18 })} Parts Used on This Job</h2>
            <span class="tk-sheet__count">${parts.length} line${parts.length === 1 ? '' : 's'} · ${money(partsCents, { currency })}</span>
          </div>
          <div class="tk-sheet__body tk-stack">
            <form class="k-form" data-form="inline-add-part" novalidate>
              <input type="hidden" name="job_card_id" value="${card.id}">
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Part Name</span><input class="k-input" name="part_name" placeholder="e.g. Ryco Oil Filter" required></label>
                <label class="k-field"><span class="k-field__label">Part #</span><input class="k-input" name="part_number" placeholder="e.g. Z418"></label>
              </div>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Qty</span><input class="k-input" type="number" min="1" name="quantity" value="1" required></label>
                <label class="k-field"><span class="k-field__label">Unit Cost</span><input class="k-input" type="number" step="0.01" min="0" name="unit_cost" value="0.00" required></label>
                <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" placeholder="Repco / Burson"></label>
              </div>
              <div class="k-form__actions">
                <button type="submit" class="k-btn k-btn--primary k-btn--sm">${icon('plus', { size: 15 })} Add Part Used</button>
              </div>
            </form>
          </div>
          <div>
            ${parts.length ? parts.map((p) => html`
              <div class="tk-row" data-key="cp-${p.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${p.quantity}× ${p.part_name}</span>
                    ${p.part_number ? html`<span class="vin-chip">${p.part_number}</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span><strong>${money(p.quantity * p.unit_cost_cents, { currency })}</strong> (${money(p.unit_cost_cents, { currency })} ea)</span>
                    ${p.supplier ? html`<span>${p.supplier}</span>` : ''}
                  </div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="part-del" data-id="${p.id}">Remove</button>
                </div>
              </div>`) : html`<div class="tk-sheet__body"><p class="tk-muted" style="font-size:13.5px">No parts logged on this job card yet.</p></div>`}
          </div>
        </section>
      </div>

      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('receipt', { size: 18 })} Live Workshop Estimate &amp; Billing</h2></div>
          <div class="tk-sheet__body tk-stack">
            <div class="tally-box">
              <div class="tally-row"><span>Labour (${num(card.labour_hours || 0, { decimals: 2 })} h × ${money(rateCents, { currency })}/h)</span><strong>${money(labourCents, { currency })}</strong></div>
              <div class="tally-row"><span>Parts Subtotal (${parts.length} item${parts.length === 1 ? '' : 's'})</span><strong>${money(partsCents, { currency })}</strong></div>
              <div class="tally-row"><span>Tax (${taxRate}%)</span><span>${money(taxCents, { currency })}</span></div>
              <div class="tally-row tally-row--total"><span>Workshop Total</span><span>${money(totalCents, { currency })}</span></div>
            </div>
            <button type="button" class="k-btn k-btn--primary k-btn--block" data-action="card-invoice" data-id="${card.id}">
              ${icon('receipt', { size: 17 })} Generate Workshop Invoice
            </button>
            <button type="button" class="k-btn k-btn--block" data-action="copy-ready-sms" data-id="${card.id}">
              ${icon('chat', { size: 16 })} Copy Customer Ready SMS
            </button>
            ${invoices.length ? html`
              <div class="tk-stack" style="gap:8px;padding-top:6px">
                <div class="tk-kv__k">Invoices for ${card.card_number}</div>
                ${invoices.map((inv) => html`
                  <div class="tk-row" style="padding:8px 0" data-key="cinv-${inv.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title"><span class="vin-chip">${inv.invoice_number}</span> <strong>${money(inv.total_cents, { currency })}</strong> <span class="tk-tag ${inv.status === 'Paid' ? 'tk-tag--ok' : inv.status === 'Overdue' ? 'tk-tag--bad' : 'tk-tag--warn'}">${inv.status}</span></div>
                      <div class="tk-row__meta"><span>Issued ${fmtDay(inv.issue_date)}</span></div>
                    </div>
                    <div class="tk-row__aside"><a href="#/invoices" class="k-btn k-btn--sm">Invoices</a></div>
                  </div>`)}
              </div>` : ''}
          </div>
        </section>
      </div>
    </div>`;
}

export function cardFormFields(vehicles, defaultVehId = '') {
  const chosen = defaultVehId || (vehicles[0] ? vehicles[0].id : '');
  return html`
    <label class="k-field"><span class="k-field__label">Vehicle</span>
      <select class="k-input" name="vehicle_id" required>
        ${vehicles.map((v) => html`<option value="${v.id}" ${String(v.id) === String(chosen) ? 'selected' : ''}>${v.registration} — ${v.year} ${v.make} ${v.model} (${v.customer_name})</option>`)}
      </select>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date In</span><input class="k-input" type="date" name="date_in" value="${today()}" required></label>
      <label class="k-field"><span class="k-field__label">Priority</span>
        <select class="k-input" name="priority">${CARD_PRIORITIES.map((p) => html`<option value="${p}" ${p === 'Normal' ? 'selected' : ''}>${p}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Bay / Hoist</span>
        <select class="k-input" name="bay_number">
          <option value="">Assign later</option>
          ${BAYS.filter(Boolean).map((b) => html`<option value="${b}">${b}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Assigned Mechanic</span><input class="k-input" name="technician" placeholder="e.g. Shane Kelly"></label>
      <label class="k-field"><span class="k-field__label">Odometer In (km) <span class="k-field__optional">auto-updates vehicle</span></span><input class="k-input" type="number" min="0" name="odometer_in" placeholder="Current km"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Complaint / Work Requested</span><textarea class="k-input" name="complaint" rows="3" placeholder="Brakes shuddering, 80,000km service, check engine light…" required></textarea></label>`;
}

export function wireBayActions(root, state, { draw, loadScreen, navigate }) {
  on(root, 'click', '[data-action="bay-layout"]', (e, el) => { state.bayLayout = el.dataset.layout; draw(); });
  on(root, 'click', '[data-action="card-prio"]', (e, el) => { state.cardPriority = el.dataset.prio; draw(); });
  on(root, 'click', '[data-action="stage-filter"]', (e, el) => {
    const st = el.dataset.stage;
    state.cardStageFilter = state.cardStageFilter === st && st !== 'All' ? 'All' : st;
    draw();
  });
  on(root, 'input', '[data-action="card-search"]', (e, el) => { state.cardSearch = el.value; draw(); });
  on(root, 'click', '[data-action="toggle-collected"]', () => { state.showCollected = !state.showCollected; draw(); });

  on(root, 'click', '[data-action="open-card"]', (e, el) => {
    if (e.target.closest('button[data-action="copy-ready-sms"], button[data-action="copy-val"]')) return;
    navigate('/card', { id: el.dataset.id });
  });
  on(root, 'click', '[data-action="copy-val"]', (e, el) => {
    e.stopPropagation();
    copyText(el.dataset.val, { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Value'} copied.` });
  });

  on(root, 'click', '[data-action="copy-ready-sms"]', (e, el) => {
    e.stopPropagation();
    const id = el.dataset.id;
    const card = (state.cardDetail?.card && String(state.cardDetail.card.id) === String(id))
      ? {
          ...state.cardDetail.card,
          parts_total_cents: (state.cardDetail.parts || []).reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_cost_cents), 0),
        }
      : state.cards.find((x) => String(x.id) === String(id));
    if (!card) return;
    const sms = buildReadySms(card, state.session.settings);
    copyText(sms, { title: `Customer Ready SMS · ${card.registration || card.card_number}`, done: `Customer SMS copied for ${card.registration || card.card_number}.` });
  });

  on(root, 'click', '[data-action="card-new"]', async () => {
    if (!state.vehicles.length) {
      const r = await api.get('/api/vehicles');
      state.vehicles = r.vehicles || [];
    }
    if (!state.vehicles.length) {
      toast.error('Register a customer vehicle in the Garage first.');
      navigate('/garage');
      return;
    }
    const made = await formDialog({
      title: 'Open Workshop Job Card',
      submitLabel: 'Book Vehicle In',
      size: 'lg',
      fields: cardFormFields(state.vehicles),
      onSubmit: (v) => api.post('/api/cards', v),
    });
    if (made) { toast.success(`Job card ${made.card.card_number} opened.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="card-status"]', async (e, el) => {
    try { await api.post('/api/cards/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Moved to ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="save-card"]', async (e, form) => {
    e.preventDefault();
    try {
      await api.put('/api/cards', readForm(form));
      toast.success('Job card updated (odometer synced to vehicle).');
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="inline-add-part"]', async (e, form) => {
    e.preventDefault();
    try {
      await api.post('/api/parts', readForm(form));
      form.reset();
      toast.success('Part added to job card.');
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="part-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove part?', message: 'Remove this part from the job card?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/parts', { id: Number(el.dataset.id) }); toast.success('Part removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="card-invoice"]', async (e, el) => {
    const cardId = Number(el.dataset.id);
    const card = state.cardDetail?.card || state.cards.find((x) => x.id === cardId);
    const s = state.session.settings;
    const rate = (Number(s.workshop_rate_cents || 13500) / 100).toFixed(2);
    const made = await formDialog({
      title: `Generate Workshop Invoice${card ? ' · ' + card.card_number : ''}`,
      submitLabel: 'Generate Invoice',
      fields: html`
        <p class="k-dialog__text">Combines mechanic labour hours × workshop hourly rate plus all logged parts used on this job card.</p>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Labour Hours</span><input class="k-input" type="number" step="0.25" min="0" name="labour_hours" value="${card ? card.labour_hours : 1}" required></label>
          <label class="k-field"><span class="k-field__label">Workshop Rate / hr</span><input class="k-input" type="number" step="0.01" min="0" name="labour_rate" value="${rate}" required></label>
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Invoice Notes</span><input class="k-input" name="notes" value="${card?.diagnosis || ''}" placeholder="Next service due, warranty note…"></label>`,
      onSubmit: (v) => api.post('/api/invoices/from-card', { ...v, job_card_id: cardId }),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} generated.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="print-job-card"]', () => {
    const d = state.cardDetail;
    if (!d || !d.card) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    const c = d.card;
    const partsRows = (d.parts || []).map((p) => `<tr><td>${esc(p.part_name)}</td><td>${esc(p.part_number || '—')}</td><td>${esc(p.supplier || '—')}</td><td class="num">${p.quantity}</td><td class="num">${money(p.quantity * p.unit_cost_cents, { currency: cur })}</td></tr>`).join('');
    downloadHtmlDoc(`job-card-${c.card_number}.html`, {
      title: `WORKSHOP JOB CARD · ${c.card_number}`,
      businessName: s.business_name,
      subtitle: [s.address, s.phone, s.tax_id ? `Tax ID: ${s.tax_id}` : ''].filter(Boolean).join(' · '),
      accent: '#e04f16',
      bodyHtml: `
        <div class="box">
          <strong>Vehicle:</strong> ${esc(c.year)} ${esc(c.make)} ${esc(c.model)} &nbsp; <strong>Rego:</strong> ${esc(c.registration)} &nbsp; <strong>Fuel:</strong> ${esc(c.fuel || '')}<br>
          <strong>VIN:</strong> ${esc(c.vin || '—')} &nbsp; <strong>Odometer In:</strong> ${num(c.odometer_in || 0)} km<br>
          <strong>Customer:</strong> ${esc(c.customer_name || '')} (${esc(c.customer_phone || '')})<br>
          <strong>Bay:</strong> ${esc(c.bay_number || 'TBD')} &nbsp; <strong>Mechanic:</strong> ${esc(c.technician || 'Unassigned')} &nbsp; <strong>Labour:</strong> ${num(c.labour_hours || 0, { decimals: 2 })} hrs
        </div>
        <div class="box"><strong>Customer Complaint / Requested Work:</strong><br>${esc(c.complaint)}</div>
        ${c.diagnosis ? `<div class="box"><strong>Diagnosis &amp; Work Performed:</strong><br>${esc(c.diagnosis)}</div>` : ''}
        <h3>Parts Used</h3>
        <table><thead><tr><th>Part</th><th>Part #</th><th>Supplier</th><th class="num">Qty</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${partsRows || '<tr><td colspan="5">No parts fitted yet.</td></tr>'}</tbody></table>`,
    });
  });
}
