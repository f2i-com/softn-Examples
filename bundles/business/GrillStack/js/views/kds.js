// Kitchen Pass KDS Board — unified cast-iron Command Bridge w/ Pass SLA Gauge, clickable station filter ribbons,
// integrated All-Day Production Tally, bold amber modifier callouts, and thumb-friendly bump buttons.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { ago, toMs } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';

const STATIONS = [
  { id: 'All', label: 'All Stations', kind: '' },
  { id: 'Grill', label: 'Grill', kind: 'grill' },
  { id: 'Fryer', label: 'Fryer', kind: 'fryer' },
  { id: 'Assembly', label: 'Assembly', kind: 'assembly' },
  { id: 'Drinks', label: 'Shake / Drinks', kind: 'shake' },
];
const COLS = [
  { status: 'Pending', label: 'Pending', next: 'Cooking', nextLabel: 'Start Cooking →' },
  { status: 'Cooking', label: 'On Grill / Fryer', next: 'Plated', nextLabel: 'Plate / Wrap →' },
  { status: 'Plated', label: 'Plated at Pass', next: 'Ready', nextLabel: 'Bump Ready ✓' },
];

function stationKind(station, itemsText = '') {
  if (station === 'Grill') return 'grill';
  if (station === 'Fryer') return 'fryer';
  if (station === 'Drinks' || station === 'Shake') return 'shake';
  if (String(itemsText).toLowerCase().includes('shake')) return 'shake';
  return 'assembly';
}

function stationLabel(station, itemsText = '') {
  if (station === 'Drinks') {
    return String(itemsText).toLowerCase().includes('shake') ? 'Shake' : 'Drinks';
  }
  return station;
}

function stationPill(station, itemsText = '') {
  const kind = stationKind(station, itemsText);
  return `gs-station-pill gs-station--${kind}`;
}

function ticketAgeMinutes(createdAt) {
  const ms = toMs(createdAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function renderAgePill(ticket) {
  if (ticket.status === 'Ready') {
    return html`<span class="gs-age gs-age--done">${icon('check', { size: 11 })} ${ago(ticket.completed_at || ticket.updated_at)}</span>`;
  }
  const mins = ticketAgeMinutes(ticket.created_at);
  if (mins >= 10) {
    return html`<span class="gs-age gs-age--crit">${icon('clock', { size: 12 })} ${mins}m · LATE</span>`;
  }
  if (mins >= 5) {
    return html`<span class="gs-age gs-age--warn">${icon('clock', { size: 12 })} ${mins}m</span>`;
  }
  return html`<span class="gs-age gs-age--ok">${icon('clock', { size: 12 })} ${mins < 1 ? '<1m' : mins + 'm'}</span>`;
}

function parseTicketLines(ticketItems) {
  const rawLines = String(ticketItems || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return rawLines.map((line) => {
    const mods = [];
    const main = line
      .replace(/\(([^)]+)\)/g, (_, inner) => {
        if (inner && inner.trim()) mods.push(inner.trim());
        return '';
      })
      .replace(/\[([^\]]+)\]/g, (_, inner) => {
        if (inner && inner.trim()) mods.push(inner.trim());
        return '';
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { main: main || line, mods };
  });
}

function buildAllDayTally(tickets, stationFilter) {
  const active = tickets.filter((t) => t.status !== 'Ready' && t.status !== 'Held');
  const map = new Map();
  let totalItems = 0;

  for (const t of active) {
    const lines = String(t.ticket_items || '').split('\n').map((s) => s.trim()).filter(Boolean);
    for (const rawLine of lines) {
      if (stationFilter === 'All' && t.station === 'Assembly') {
        const lower = rawLine.toLowerCase();
        if (lower.startsWith('assemble ') || lower.startsWith('dress & wrap ') || lower.startsWith('build & bag ') || lower.startsWith('bag ')) {
          continue;
        }
      }
      const cleanedLine = rawLine.replace(/^(?:assemble|dress\s*&\s*wrap|build\s*&\s*bag|bag)\s+/i, '').trim();
      const match = /^(\d+)\s*[x×]\s+(.+)$/i.exec(cleanedLine);
      const qty = match ? Number(match[1]) : 1;
      const label = (match ? match[2] : cleanedLine)
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/\s*\([^)]*\)/g, '')
        .trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const cur = map.get(key) || { label, qty: 0, kind: stationKind(t.station, label) };
      cur.qty += qty;
      map.set(key, cur);
      totalItems += qty;
    }
  }

  const items = [...map.values()].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));
  return { items, totalItems, activeCount: active.length };
}

export function renderKdsView(state) {
  const allActive = state.tickets.filter((t) => t.status !== 'Ready' && t.status !== 'Held');
  const allRushCount = allActive.filter((t) => t.priority === 'Rush').length;

  // Live station counts across ALL active tickets
  const stationCounts = { All: allActive.length, Grill: 0, Fryer: 0, Assembly: 0, Drinks: 0 };
  for (const t of allActive) {
    if (t.station === 'Grill') stationCounts.Grill += 1;
    else if (t.station === 'Fryer') stationCounts.Fryer += 1;
    else if (t.station === 'Drinks' || t.station === 'Shake') stationCounts.Drinks += 1;
    else stationCounts.Assembly += 1;
  }

  // Pass SLA Gauge: % of active tickets under 10 minutes
  const onTimeCount = allActive.filter((t) => ticketAgeMinutes(t.created_at) < 10).length;
  const slaPct = allActive.length ? Math.round((onTimeCount / allActive.length) * 100) : 100;
  const slaColor = slaPct >= 85 ? '#22c55e' : slaPct >= 60 ? '#f59e0b' : '#ef4444';

  // Filtered view
  const filteredTickets = state.tickets.filter((t) => {
    if (state.kdsStation !== 'All') {
      if (state.kdsStation === 'Drinks') {
        if (t.station !== 'Drinks' && t.station !== 'Shake') return false;
      } else if (t.station !== state.kdsStation) {
        return false;
      }
    }
    if (state.kdsRushOnly && t.priority !== 'Rush') return false;
    return true;
  });

  const held = filteredTickets.filter((t) => t.status === 'Held');
  const tally = buildAllDayTally(filteredTickets, state.kdsStation);
  const columns = state.showReadyTickets
    ? [...COLS, { status: 'Ready', label: 'Ready / Bumped', next: null }]
    : COLS;

  return html`
    <section class="gs-masthead" aria-label="Kitchen Pass Command">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${allRushCount > 0 ? '#ef4444' : '#22c55e'}"></span>
          LIVE MULTI-STATION KDS · ${allActive.length} ACTIVE${allRushCount > 0 ? ` · ${allRushCount} RUSH` : ''}
        </div>
        <h1 class="gs-masthead__title">Kitchen Pass Command</h1>
        <div class="gs-masthead__meta">
          <span>Click any station ribbon to focus its line</span>
          <span>·</span>
          <span>All-Day Tally batches grill &amp; fryer drops ahead</span>
        </div>
      </div>

      <div class="gs-masthead__pods" style="align-items:center">
        <div class="gs-pod" style="display:flex;align-items:center;gap:12px;padding:9px 14px">
          <div class="tk-ring" style="--p:${slaPct}%;--ring-color:${slaColor};--ring-size:48px;--ring-track:rgba(255,255,255,.16)">
            <span class="tk-ring__val">${slaPct}%</span>
          </div>
          <div style="display:grid;gap:2px">
            <span class="gs-pod__lbl">Pass SLA</span>
            <span style="font-size:13.5px;font-weight:800;color:#ffffff">${onTimeCount}/${allActive.length || 0} &lt;10m</span>
            <span class="gs-pod__sub">${allActive.length - onTimeCount > 0 ? `${allActive.length - onTimeCount} overdue` : 'All on pace'}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="${cls('k-btn', state.showReadyTickets ? 'k-btn--primary' : 'k-btn--glass')}" data-action="toggle-ready-tickets">
            ${icon('check-circle', { size: 15 })} ${state.showReadyTickets ? 'Hide Ready' : 'Show Ready'}
          </button>
          <button type="button" class="k-btn k-btn--primary" data-action="add-ticket">${icon('plus', { size: 15 })} Refire / Manual</button>
        </div>
      </div>

      <div class="gs-kds-stations-bar" role="tablist" aria-label="Filter pass by station">
        ${STATIONS.map((st) => html`
          <button type="button" class="${cls('gs-kds-filter-btn', st.kind ? `gs-kds-filter-btn--${st.kind}` : '', { 'is-on': state.kdsStation === st.id })}" data-action="kds-station" data-station="${st.id}">
            ${st.kind ? html`<span class="gs-st-dot gs-st-dot--${st.kind}"></span>` : ''}
            <span>${st.label}</span>
            <strong>${stationCounts[st.id] || 0}</strong>
          </button>`)}
        <button type="button" class="${cls('gs-kds-filter-btn gs-kds-filter-btn--rush', { 'is-on': state.kdsRushOnly })}" data-action="toggle-kds-rush" style="margin-left:auto">
          ${icon('zap', { size: 13 })}
          <span>Rush Only</span>
          <strong>${allRushCount}</strong>
        </button>
      </div>

      <div class="gs-kds-tally" aria-label="All-Day Production Tally">
        <div class="gs-tally__head">
          <div class="gs-tally__title">${icon('flame', { size: 15 })} All-Day Production Tally</div>
          <div class="gs-tally__sub">
            ${tally.items.length
              ? `${tally.totalItems} active item${tally.totalItems === 1 ? '' : 's'} across ${tally.activeCount} live ticket${tally.activeCount === 1 ? '' : 's'}${state.kdsStation !== 'All' ? ` · ${state.kdsStation}` : ''}`
              : 'All stations caught up — flat-top hot and standing by'}
          </div>
        </div>
        ${tally.items.length ? html`
          <div class="gs-tally__list">
            ${tally.items.map((it) => html`
              <span class="gs-tally__item">
                <span class="gs-tally__dot gs-tally__dot--${it.kind}"></span>
                <span class="gs-tally__qty">${it.qty}×</span>
                <span>${it.label}</span>
              </span>`)}
          </div>` : ''}
      </div>
    </section>

    ${held.length ? html`
      <section class="tk-sheet" style="margin-bottom:16px">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('alert', { size: 17 })} Held Tickets (${held.length})</h2></div>
        <div>
          ${held.map((t) => html`
            <div class="tk-row" data-key="held-${t.id}">
              <div class="tk-row__main">
                <div class="tk-row__title">
                  <span class="gs-order-code">${t.order_number}</span>
                  <span class="${stationPill(t.station, t.ticket_items)}">${stationLabel(t.station, t.ticket_items)}</span>
                  ${t.priority === 'Rush' ? html`<span class="gs-rush-banner">${icon('zap', { size: 11 })} RUSH</span>` : ''}
                  <span>${t.customer_name}</span>
                  ${renderAgePill(t)}
                </div>
                <div class="tk-row__meta"><span>${t.ticket_items}</span></div>
              </div>
              <div class="tk-row__aside">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="ticket-bump" data-id="${t.id}" data-status="Pending">Resume to Pass</button>
              </div>
            </div>`)}
        </div>
      </section>` : ''}

    ${state.loading && !state.tickets.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : filteredTickets.length ? html`
      <div class="tk-board">
        ${columns.map((col) => {
          const cards = filteredTickets
            .filter((t) => t.status === col.status)
            .sort((a, b) => (b.priority === 'Rush' ? 1 : 0) - (a.priority === 'Rush' ? 1 : 0));
          return html`
            <div class="tk-col" data-key="col-${col.status}">
              <div class="tk-col__head">
                <span>${col.label}</span>
                <span class="k-badge">${cards.length}</span>
              </div>
              ${cards.length ? cards.map((t) => {
                const isRush = t.priority === 'Rush';
                const kind = stationKind(t.station, t.ticket_items);
                const parsedLines = parseTicketLines(t.ticket_items);
                return html`
                  <article class="${cls('tk-ticket gs-kds-ticket', `gs-kds-ticket--${kind}`, { 'gs-kds-ticket--rush': isRush })}" data-key="tk-${t.id}">
                    <div class="gs-kds-ticket__ribbon"></div>
                    <div class="gs-kds-ticket__head">
                      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                        <span class="gs-order-code">${t.order_number || '#' + t.id}</span>
                        <span class="${stationPill(t.station, t.ticket_items)}">${stationLabel(t.station, t.ticket_items)}</span>
                        ${isRush ? html`<span class="gs-rush-banner">${icon('zap', { size: 11 })} RUSH</span>` : ''}
                      </div>
                      ${renderAgePill(t)}
                    </div>
                    <div class="gs-kds-ticket__body">
                      <div class="gs-kds-item-list">
                        ${parsedLines.map((pl) => html`
                          <div class="gs-kds-item-line">
                            <div>${pl.main}</div>
                            ${pl.mods.length ? html`
                              <div style="display:flex;flex-wrap:wrap;gap:4px">
                                ${pl.mods.map((m) => html`<span class="gs-kds-mod-callout">★ ${m}</span>`)}
                              </div>` : ''}
                          </div>`)}
                      </div>
                      <div class="tk-ticket__meta">
                        <strong>${t.customer_name}</strong> · ${t.order_type}${t.staff_member ? ' · ' + t.staff_member : ''}
                        ${t.notes ? html`<div style="color:#991b1b;font-weight:750;margin-top:4px;padding:4px 8px;border-radius:6px;background:#fef2f2;border:1px solid #fecaca">${icon('alert', { size: 12 })} ${t.notes}</div>` : ''}
                      </div>
                      ${col.next ? html`
                        <div style="display:grid;gap:6px;padding-top:8px;border-top:1px dashed var(--k-border)">
                          <button type="button" class="k-btn k-btn--primary k-btn--block" style="min-height:36px;font-size:13px" data-action="ticket-bump" data-id="${t.id}" data-status="${col.next}">
                            ${col.nextLabel}
                          </button>
                          <div style="display:flex;gap:6px;justify-content:space-between">
                            ${col.next !== 'Ready' ? html`<button type="button" class="k-btn k-btn--sm" style="flex:1" data-action="ticket-bump" data-id="${t.id}" data-status="Ready">${icon('check', { size: 13 })} Fast Bump Ready</button>` : ''}
                            <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="ticket-bump" data-id="${t.id}" data-status="Held">Hold</button>
                          </div>
                        </div>` : ''}
                    </div>
                  </article>`;
              }) : html`<p class="tk-muted" style="font-size:13px;padding:14px 4px;text-align:center">Clear</p>`}
            </div>`;
        })}
      </div>` : emptyState({
        iconName: 'flame',
        title: state.kdsStation !== 'All' || state.kdsRushOnly ? 'No tickets match this pass filter' : 'Kitchen pass is clear',
        text: state.kdsStation !== 'All' || state.kdsRushOnly ? 'Clear the station or Rush filter to see all live kitchen tickets.' : 'Orders fired from the Order Counter automatically route here by station.',
        action: state.kdsStation !== 'All' || state.kdsRushOnly
          ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="kds-reset-filters">Show All Stations</button>`
          : html`<a href="#/" class="k-btn k-btn--primary k-btn--sm">Open Order Counter</a>`,
      })}
  `;
}

export function wireKdsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="kds-station"]', (e, el) => {
    state.kdsStation = el.dataset.station;
    draw();
  });

  on(root, 'click', '[data-action="toggle-kds-rush"]', () => {
    state.kdsRushOnly = !state.kdsRushOnly;
    draw();
  });

  on(root, 'click', '[data-action="kds-reset-filters"]', () => {
    state.kdsStation = 'All';
    state.kdsRushOnly = false;
    draw();
  });

  on(root, 'click', '[data-action="toggle-ready-tickets"]', () => {
    state.showReadyTickets = !state.showReadyTickets;
    loadScreen('/kds');
  });

  on(root, 'click', '[data-action="ticket-bump"]', async (e, el) => {
    try {
      const res = await api.post('/api/tickets/advance', { id: Number(el.dataset.id), status: el.dataset.status });
      if (res.parentOrderStatus === 'Ready' && el.dataset.status === 'Ready') {
        toast.success(`All stations done — Order ${res.ticket.order_number} is Ready for pickup!`);
      }
      await loadScreen('/kds');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="add-ticket"]', async () => {
    const made = await formDialog({
      title: 'Refire / Manual Kitchen Ticket',
      submitLabel: 'Fire to pass',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Station</span>
            <select class="k-input" name="station">
              <option value="Grill">Grill</option>
              <option value="Fryer">Fryer</option>
              <option value="Assembly">Assembly</option>
              <option value="Drinks">Shake / Drinks</option>
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Priority</span>
            <select class="k-input" name="priority">
              <option value="Rush">Rush (Refire)</option>
              <option value="Normal">Normal</option>
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Order #</span><input class="k-input" name="order_number" placeholder="e.g. G-105"></label>
          <label class="k-field"><span class="k-field__label">Customer</span><input class="k-input" name="customer_name" placeholder="e.g. Table 4"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Items to fire</span>
          <textarea class="k-input" name="ticket_items" rows="3" placeholder="1x Double Smash Patty (well done)…" required></textarea>
        </label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Sub GF bun, allergy callout…"></label>`,
      onSubmit: (vals) => api.post('/api/tickets', vals),
    });
    if (made) { toast.success('Kitchen ticket fired.'); await loadScreen('/kds'); }
  });
}
