// Interactive Floor & Table Map — Bistro Marlowe masthead w/ Occupancy Ring, two-column Maitre d' Floor + Live Arrivals Rail,
// upholstered architectural table cards w/ 3-stage dining pace bars, seat pips, smart 1-click booking seating & quick walk-in.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay, toMs, fmtDuration } from '../../kit/time.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const SECTIONS = ['Main', 'Patio', 'Bar', 'Private'];
const COURSES = ['Entree', 'Mains', 'Desserts', 'Drinks'];
const PREFS = ['No preference', 'Window', 'Booth', 'Bar', 'Outside', 'Private'];

function tableShapeClass(tb) {
  const cap = Number(tb.capacity || 4);
  const note = String(tb.notes || '').toLowerCase();
  if (cap >= 6 || tb.section === 'Private' || note.includes('banquette') || note.includes('booth')) {
    return 'pm-shape--banquette';
  }
  if (cap <= 2) return 'pm-shape--2top';
  return 'pm-shape--4top';
}

function tableTypeLabel(tb) {
  const cap = Number(tb.capacity || 4);
  const note = String(tb.notes || '').toLowerCase();
  if (tb.section === 'Private') return `Private · ${cap}-top`;
  if (note.includes('banquette') || note.includes('booth')) return `Banquette · ${cap}`;
  if (cap >= 6) return `Banquette · ${cap}`;
  if (cap <= 2) return '2-top';
  return `${cap}-top`;
}

function tableToneClass(status, hasUpcomingRes) {
  if (status === 'Available') return hasUpcomingRes ? 'pm-table--reserved' : 'pm-table--available';
  if (status === 'Seated') return 'pm-table--seated';
  if (status === 'Mains Firing') return 'pm-table--mains';
  if (status === 'Check Dropped') return 'pm-table--check';
  return 'pm-table--clean';
}

function statusTagClass(status, hasUpcomingRes) {
  if (status === 'Available') return hasUpcomingRes ? 'tk-tag--warn' : 'tk-tag--ok';
  if (status === 'Seated') return 'tk-tag--accent';
  if (status === 'Mains Firing') return 'tk-tag--warn';
  if (status === 'Check Dropped') return 'tk-tag--info';
  return 'tk-tag--bad';
}

function nextActionFor(status) {
  if (status === 'Seated') return { status: 'Mains Firing', label: 'Fire Mains →' };
  if (status === 'Mains Firing') return { status: 'Check Dropped', label: 'Drop Check' };
  if (status === 'Check Dropped') return { status: 'Needs Cleaning', label: 'Clear Table' };
  return { status: 'Available', label: 'Reset & Open' };
}

function diningStage(status) {
  if (status === 'Seated') return 1;
  if (status === 'Mains Firing') return 2;
  if (status === 'Check Dropped') return 3;
  return 0;
}

function seatedMinutes(seatedAt) {
  if (!seatedAt) return 0;
  const ms = toMs(seatedAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(1, Math.floor((Date.now() - ms) / 60000));
}

function shortGuestName(name) {
  if (!name) return 'Party';
  return String(name).split(' ')[0];
}

function extractNoteFlags(notes) {
  const lower = String(notes || '').toLowerCase();
  const flags = [];
  if (lower.includes('allerg') || lower.includes('nut') || lower.includes('coeliac') || lower.includes('gluten') || lower.includes('shellfish')) {
    flags.push({ label: lower.includes('coeliac') ? 'Coeliac' : 'Allergy', kind: 'allergy' });
  }
  if (lower.includes('birthday') || lower.includes('anniversary') || lower.includes('vip') || lower.includes('tasting')) {
    const lbl = lower.includes('birthday') ? 'Birthday' : lower.includes('anniversary') ? 'Anniversary' : lower.includes('tasting') ? 'Tasting' : 'VIP';
    flags.push({ label: lbl, kind: 'occasion' });
  }
  return flags;
}

function renderSeatDots(capacity, partySize) {
  const cap = Math.max(1, Number(capacity || 2));
  const filled = Math.min(cap, Math.max(0, Number(partySize || 0)));
  const shown = Math.min(cap, 8);
  const dots = [];
  for (let i = 0; i < shown; i++) {
    dots.push(html`<span class="${cls('pm-seat-dot', { 'is-filled': i < filled })}"></span>`);
  }
  const label = filled > 0 ? `${filled}/${cap}` : `${cap} seats`;
  return html`
    <span class="pm-seats" title="${filled} seated of ${cap} seats">
      ${dots}
      ${cap > shown ? html`<span class="pm-seats__lbl">+${cap - shown}</span>` : ''}
      <span class="pm-seats__lbl">${label}</span>
    </span>`;
}

function upcomingBookingForTable(tb, bookedToday) {
  if (tb.status !== 'Available' || !bookedToday.length) return null;
  const note = String(tb.notes || '').toLowerCase();
  return bookedToday.find((rv) => {
    if (rv.assigned_table_id && Number(rv.assigned_table_id) === Number(tb.id)) return true;
    if (tb.section === 'Private' && rv.table_pref === 'Private') return true;
    if (rv.table_pref === 'Window' && note.includes('window') && tb.capacity >= rv.party_size) return true;
    if (rv.table_pref === 'Outside' && tb.section === 'Patio' && tb.capacity >= rv.party_size) return true;
    return false;
  }) || null;
}

function bestTableForBooking(rv, availTables) {
  if (!availTables.length) return null;
  const fits = availTables.filter((t) => Number(t.capacity) >= Number(rv.party_size || 1));
  const pool = fits.length ? fits : availTables;
  const score = (t) => {
    let s = 0;
    const note = String(t.notes || '').toLowerCase();
    if (rv.table_pref === 'Private' && t.section === 'Private') s += 40;
    if (rv.table_pref === 'Outside' && t.section === 'Patio') s += 35;
    if (rv.table_pref === 'Bar' && t.section === 'Bar') s += 35;
    if (rv.table_pref === 'Window' && note.includes('window')) s += 35;
    if (rv.table_pref === 'Booth' && (note.includes('booth') || note.includes('banquette'))) s += 30;
    s -= Math.abs(Number(t.capacity) - Number(rv.party_size || 2)) * 2;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

export function renderFloorView(state) {
  const counts = state.session.counts || {};
  const visibleSections = state.floorSection === 'All' ? SECTIONS : [state.floorSection];
  const bookedToday = (state.reservations || [])
    .filter((r) => r.status === 'Booked' && r.res_date === today())
    .sort((a, b) => String(a.res_time || '').localeCompare(String(b.res_time || '')));

  const seatedTables = Number(counts.seatedTables || 0);
  const totalTables = Number(counts.totalTables || state.tables.length || 0);
  const occPct = totalTables > 0 ? Math.min(100, Math.round((seatedTables / totalTables) * 100)) : 0;

  const availTables = state.tables.filter((t) => t.status === 'Available');
  const dirtyTables = state.tables.filter((t) => t.status === 'Needs Cleaning');
  const diningTables = state.tables.filter((t) => t.status === 'Seated' || t.status === 'Mains Firing' || t.status === 'Check Dropped');

  const statusFilter = state.floorStatusFilter || 'All';
  const matchStatus = (tb) => {
    if (statusFilter === 'Open') return tb.status === 'Available';
    if (statusFilter === 'Dining') return tb.status === 'Seated' || tb.status === 'Mains Firing' || tb.status === 'Check Dropped';
    if (statusFilter === 'Clean') return tb.status === 'Needs Cleaning';
    return true;
  };

  const sectionCounts = new Map();
  for (const t of state.tables) sectionCounts.set(t.section, (sectionCounts.get(t.section) || 0) + 1);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="pm-masthead" aria-label="Dining Room Service Command">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#eab967"></span>
          EVENING SERVICE · ${fmtDay(today())}
        </div>
        <h1 class="pm-masthead__title">Floor &amp; Table Map</h1>
        <div class="pm-masthead__meta">
          <span><strong style="color:#f8dfb0">${counts.seatedCovers || 0} covers</strong> seated across ${seatedTables} tables</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${availTables.length} open now</span>
          ${dirtyTables.length ? html`<span class="tk-meta-sep" aria-hidden="true">·</span><span style="color:#fde68a">${dirtyTables.length} to reset</span>` : ''}
        </div>
      </div>

      <div class="pm-masthead__pods pm-masthead__pods--floor">
        <div class="pm-pod pm-pod--ring pm-pod--gold" aria-label="Table occupancy ${occPct}%">
          <div class="tk-ring" style="--p:${occPct}%;--ring-color:#eab967;--ring-size:48px">
            <span class="tk-ring__val">${occPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="pm-pod__lbl">Occupancy</span>
            <span class="pm-pod__val" style="font-size:16.5px">${seatedTables}/${totalTables}</span>
            <span class="pm-pod__sub">${counts.seatedCovers || 0} covers dining</span>
          </div>
        </div>

        <a href="#/reservations" class="pm-pod">
          <span class="pm-pod__lbl">${icon('calendar', { size: 12 })} Arrivals</span>
          <span class="pm-pod__val">${counts.bookedToday || 0}</span>
          <span class="pm-pod__sub">${counts.expectedCovers || 0} covers →</span>
        </a>

        <a href="#/pass" class="${cls('pm-pod', counts.allergyTickets > 0 ? 'pm-pod--alert' : '')}">
          <span class="pm-pod__lbl">${icon(counts.allergyTickets > 0 ? 'alert' : 'cloche', { size: 12 })} Kitchen Pass</span>
          <span class="pm-pod__val">${counts.openTickets || 0}</span>
          <span class="pm-pod__sub">${counts.allergyTickets > 0 ? `${counts.allergyTickets} allerg${counts.allergyTickets === 1 ? 'y' : 'ies'} →` : 'Live pass →'}</span>
        </a>

        <a href="#/prep" class="pm-pod">
          <span class="pm-pod__lbl">${icon('check-square', { size: 12 })} Station Prep</span>
          <span class="pm-pod__val">${counts.pendingPrep || 0}</span>
          <span class="pm-pod__sub">${counts.pendingPrep > 0 ? 'Tasks open →' : 'All ready →'}</span>
        </a>
      </div>
    </section>

    <div class="pm-floor-split">
      <div class="tk-stack" style="gap:14px">
        <div class="pm-floor-bar">
          <div class="tk-segmented" role="tablist" aria-label="Dining sections">
            ${['All', ...SECTIONS].map((sec) => {
              const n = sec === 'All' ? state.tables.length : (sectionCounts.get(sec) || 0);
              return html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.floorSection === sec })}" data-action="floor-section" data-section="${sec}">
                  ${sec === 'All' ? 'All' : sec} <span style="opacity:.65;font-size:11px;margin-left:2px">${n}</span>
                </button>`;
            })}
          </div>
          <div class="pm-status-pills">
            <button type="button" class="${cls('pm-status-chip', { 'is-on': statusFilter === 'All' })}" data-action="floor-status" data-status="All">All</button>
            <button type="button" class="${cls('pm-status-chip', { 'is-on': statusFilter === 'Open' })}" data-action="floor-status" data-status="Open"><span class="pm-dot pm-dot--open"></span> Open (${availTables.length})</button>
            <button type="button" class="${cls('pm-status-chip', { 'is-on': statusFilter === 'Dining' })}" data-action="floor-status" data-status="Dining"><span class="pm-dot pm-dot--dining"></span> Dining (${diningTables.length})</button>
            <button type="button" class="${cls('pm-status-chip', { 'is-on': statusFilter === 'Clean' })}" data-action="floor-status" data-status="Clean"><span class="pm-dot pm-dot--clean"></span> Reset (${dirtyTables.length})</button>
            <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="table-new">${icon('plus', { size: 14 })} Table</button>
          </div>
        </div>

        ${state.loading && !state.tables.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : state.tables.length ? (() => {
          const renderedSections = visibleSections.map((sec) => {
            const secTables = state.tables.filter((t) => t.section === sec && matchStatus(t));
            if (!secTables.length) return null;
            const avail = secTables.filter((t) => t.status === 'Available').length;
            return html`
              <section class="tk-sheet" data-key="sec-${sec}">
                <div class="tk-sheet__head" style="min-height:46px;padding:10px 16px">
                  <h2 class="tk-sheet__title">${icon(sec === 'Bar' ? 'wine' : 'table-seat', { size: 16 })} ${sec} Section</h2>
                  <span class="tk-sheet__count">${avail} of ${secTables.length} open</span>
                </div>
                <div class="tk-sheet__body" style="padding:13px 15px">
                  <div class="pm-floor-grid">
                    ${secTables.map((tb) => {
                      const isAvailable = tb.status === 'Available';
                      const upcoming = upcomingBookingForTable(tb, bookedToday);
                      const next = nextActionFor(tb.status);
                      const mins = tb.seated_at ? seatedMinutes(tb.seated_at) : 0;
                      const stage = diningStage(tb.status);
                      return html`
                        <article class="pm-table-card ${tableShapeClass(tb)} ${tableToneClass(tb.status, Boolean(upcoming))}" data-key="tb-${tb.id}">
                          <div class="pm-table-head">
                            <div class="pm-table-id">
                              <span class="pm-table-glyph">${tb.table_number}</span>
                              <div>
                                <div class="pm-table-num">Table ${tb.table_number}</div>
                                <div class="pm-table-type">${tableTypeLabel(tb)}</div>
                              </div>
                            </div>
                            <span class="tk-tag ${statusTagClass(tb.status, Boolean(upcoming))}">${isAvailable && upcoming ? `Held ${upcoming.res_time}` : tb.status}</span>
                          </div>

                          <div class="pm-table-body">
                            <div class="pm-table-visual">
                              ${renderSeatDots(tb.capacity, tb.current_party_size)}
                              <div class="pm-table-badges">
                                ${mins > 0 ? html`
                                  <span class="${cls('pm-dur-pill', { 'pm-dur-pill--long': mins >= 75 })}" title="Seated duration">
                                    ${icon('clock', { size: 11 })} ${fmtDuration(mins)}
                                  </span>` : ''}
                                ${tb.server_name ? html`
                                  <span class="pm-server-badge" title="Server: ${tb.server_name}">${initials(tb.server_name)}</span>` : ''}
                              </div>
                            </div>

                            ${stage > 0 ? html`
                              <div class="pm-pace-steps" title="Course pacing: Seated → Mains Firing → Check Dropped">
                                <span class="pm-pace-step is-on"></span>
                                <span class="${cls('pm-pace-step', { 'is-mains': stage >= 2 })}"></span>
                                <span class="${cls('pm-pace-step', { 'is-check': stage >= 3 })}"></span>
                              </div>` : ''}

                            <div style="display:grid;gap:5px">
                              ${tb.current_guest ? html`
                                <div class="pm-table-guest">${tb.current_guest} ${tb.current_party_size ? `(${tb.current_party_size})` : ''}</div>
                                ${tb.notes ? html`<div class="tk-muted" style="font-size:12px">${tb.notes}</div>` : ''}
                              ` : upcoming ? html`
                                <div class="pm-table-guest" style="color:#9a3412">Held: ${upcoming.guest_name} (${upcoming.party_size}) · ${upcoming.res_time}</div>
                                ${upcoming.notes ? html`<div class="tk-muted" style="font-size:12px">${upcoming.notes}</div>` : tb.notes ? html`<div class="tk-muted" style="font-size:12px">${tb.notes}</div>` : ''}
                              ` : html`<div class="tk-muted" style="font-size:12.5px">${tb.notes || 'Ready for seating'}</div>`}
                              ${tb.has_allergy ? html`
                                <div class="pm-table-allergy-strip">${icon('alert', { size: 13 })} <span>ALLERGY ON PASS</span></div>` : ''}
                              ${tb.open_tickets > 0 ? html`
                                <div style="display:flex;flex-wrap:wrap;gap:5px">
                                  <a href="#/pass" class="tk-tag tk-tag--warn" style="text-decoration:none">${icon('cloche', { size: 11 })} ${tb.open_tickets} on pass</a>
                                </div>` : ''}
                            </div>

                            <div class="pm-table-actions">
                              ${isAvailable && upcoming ? html`
                                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="floor-seat-booking" data-res-id="${upcoming.id}" data-table-id="${tb.id}">${icon('check', { size: 13 })} Seat ${shortGuestName(upcoming.guest_name)} (${upcoming.party_size})</button>
                                <button type="button" class="k-btn k-btn--sm" data-action="table-quick-seat" data-id="${tb.id}">Walk-in</button>
                              ` : isAvailable ? html`
                                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="table-quick-seat" data-id="${tb.id}">${icon('zap', { size: 13 })} Quick Seat</button>
                                <button type="button" class="k-btn k-btn--sm" data-action="table-step" data-id="${tb.id}" data-status="Seated">Named…</button>
                              ` : html`
                                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="table-step" data-id="${tb.id}" data-status="${next.status}">${next.label}</button>
                              `}
                              ${tb.status !== 'Needs Cleaning' && !isAvailable ? html`
                                <button type="button" class="k-btn k-btn--sm" data-action="table-fire" data-id="${tb.id}">${icon('flame', { size: 13 })} Fire</button>` : ''}
                              <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="margin-left:auto" data-action="table-edit" data-id="${tb.id}">Edit</button>
                            </div>
                          </div>
                        </article>`;
                    })}
                  </div>
                </div>
              </section>`;
          }).filter(Boolean);
          return renderedSections.length
            ? renderedSections
            : html`<section class="tk-sheet">${emptyState({ iconName: 'table-seat', title: 'No tables match this filter', text: 'Switch back to All sections or clear the status pill.' })}</section>`;
        })() : html`<section class="tk-sheet">${emptyState({ iconName: 'table-seat', title: 'No dining tables configured', text: 'Add tables across Main, Patio, Bar and Private sections to manage live floor service.' })}</section>`}
      </div>

      <aside class="tk-sheet pm-host-rail" aria-label="Tonight's Arrivals & Host Stand">
        <div class="pm-host-rail__head">
          <div style="display:flex;align-items:center;gap:8px">
            ${icon('calendar', { size: 16 })}
            <div>
              <div style="font-family:var(--k-font-display);font-size:16px;font-weight:700;line-height:1.1">Tonight's Book</div>
              <div style="font-size:11px;color:rgba(255,244,232,.72)">${bookedToday.length} to arrive · ${counts.expectedCovers || 0} covers</div>
            </div>
          </div>
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="floor-new-res">${icon('plus', { size: 13 })} Book</button>
        </div>

        <div class="pm-host-rail__body">
          ${bookedToday.length ? bookedToday.map((rv) => {
            const best = bestTableForBooking(rv, availTables);
            const flags = extractNoteFlags(rv.notes);
            return html`
              <div class="pm-arrival-card" data-key="arr-${rv.id}">
                <div class="pm-arrival-top">
                  <div style="display:flex;align-items:center;gap:7px;min-width:0">
                    <span class="pm-arrival-time">${rv.res_time}</span>
                    <span class="pm-arrival-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rv.guest_name}</span>
                  </div>
                  <span class="tk-tag" style="font-weight:800">${rv.party_size}p</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                  ${rv.table_pref && rv.table_pref !== 'No preference' ? html`<span class="tk-tag">${rv.table_pref}</span>` : ''}
                  ${flags.map((fl) => html`<span class="pm-flag-pill pm-flag--${fl.kind}">${fl.label}</span>`)}
                </div>
                ${rv.notes ? html`<div class="pm-arrival-note">${rv.notes}</div>` : ''}
                <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
                  ${best ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" style="flex:1" data-action="floor-seat-booking" data-res-id="${rv.id}" data-table-id="${best.id}">
                      Seat → ${best.table_number} (${best.capacity}p)
                    </button>` : html`
                    <span class="tk-muted" style="font-size:11.5px">Waiting for open table…</span>`}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="floor-pick-table" data-res-id="${rv.id}">Choose…</button>
                </div>
              </div>`;
          }) : html`
            <div style="text-align:center;padding:16px 10px;border:1.5px dashed var(--k-border);border-radius:10px">
              <div style="font-size:13px;font-weight:700">All tonight's bookings seated</div>
              <div class="tk-muted" style="font-size:12px;margin-top:3px">Ready for walk-ins or late bookings.</div>
            </div>`}

          <div class="pm-floor-pulse">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:var(--k-muted)">Open Tables Now</span>
              <a href="#/reservations" style="font-size:11.5px;font-weight:700;color:var(--k-accent);text-decoration:none">Full Diary →</a>
            </div>
            <div class="pm-pulse-chips">
              ${availTables.length ? availTables.map((t) => html`
                <span class="pm-pulse-chip">${t.table_number} <span style="opacity:.75">(${t.capacity})</span></span>`)
                : html`<span class="tk-muted" style="font-size:12px">House full — check clearing tables</span>`}
            </div>
            ${dirtyTables.length ? html`
              <div style="display:grid;gap:5px;margin-top:4px">
                <span style="font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:var(--k-muted)">Tap to Mark Clean &amp; Open</span>
                <div class="pm-pulse-chips">
                  ${dirtyTables.map((t) => html`
                    <button type="button" class="pm-pulse-chip pm-pulse-chip--clean" data-action="table-step" data-id="${t.id}" data-status="Available">
                      ${icon('check', { size: 11 })} Reset ${t.table_number}
                    </button>`)}
                </div>
              </div>` : ''}
          </div>
        </div>
      </aside>
    </div>`;
}

export function wireFloorActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="floor-section"]', (e, el) => { state.floorSection = el.dataset.section; draw(); });
  on(root, 'click', '[data-action="floor-status"]', (e, el) => { state.floorStatusFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="table-quick-seat"]', async (e, el) => {
    const tb = state.tables.find((x) => String(x.id) === el.dataset.id);
    if (!tb) return;
    try {
      await api.post('/api/tables/status', {
        id: tb.id,
        status: 'Seated',
        guest_name: `Walk-in (${tb.capacity})`,
        party_size: tb.capacity,
      });
      toast.success(`Walk-in seated at Table ${tb.table_number}!`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="floor-seat-booking"]', async (e, el) => {
    const resId = Number(el.dataset.resId);
    const tableId = Number(el.dataset.tableId);
    if (!resId || !tableId) return;
    try {
      const seated = await api.post('/api/reservations/seat', { reservation_id: resId, table_id: tableId });
      toast.success(`${seated.reservation.guest_name} seated at Table ${seated.table.table_number}!`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="floor-pick-table"]', async (e, el) => {
    const rv = state.reservations.find((x) => String(x.id) === el.dataset.resId);
    if (!rv) return;
    const avail = state.tables.filter((t) => t.status === 'Available');
    if (!avail.length) { toast.error('No open tables available right now.'); return; }
    const best = bestTableForBooking(rv, avail);
    const seated = await formDialog({
      title: `Seat ${rv.guest_name} (${rv.party_size} guests)`,
      submitLabel: 'Seat Guests',
      fields: html`
        <p class="tk-muted" style="font-size:13.5px">Preference: <strong>${rv.table_pref}</strong>${rv.notes ? ' · ' + rv.notes : ''}</p>
        <label class="k-field"><span class="k-field__label">Assign table</span>
          <select class="k-input" name="table_id" required>
            ${avail.map((t) => html`<option value="${t.id}" ${best && best.id === t.id ? 'selected' : ''}>Table ${t.table_number} — ${t.section} (${t.capacity} seats)</option>`)}
          </select>
        </label>`,
      onSubmit: (v) => api.post('/api/reservations/seat', { reservation_id: rv.id, table_id: Number(v.table_id) }),
    });
    if (seated) { toast.success(`${rv.guest_name} seated at Table ${seated.table.table_number}!`); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="floor-new-res"]', async () => {
    const made = await formDialog({
      title: 'Quick Booking · Tonight',
      submitLabel: 'Add to Book',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Guest name</span><input class="k-input" name="guest_name" placeholder="Full name or party" required></label>
          <label class="k-field"><span class="k-field__label">Party size</span><input class="k-input" type="number" min="1" max="60" name="party_size" value="2" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="res_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="res_time" value="19:30" required></label>
          <label class="k-field"><span class="k-field__label">Preference</span>
            <select class="k-input" name="table_pref">${PREFS.map((p) => html`<option value="${p}">${p}</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes &amp; Dietary Alerts</span><input class="k-input" name="notes" placeholder="Anniversary, nut allergy, coeliac…"></label>`,
      onSubmit: (v) => api.post('/api/reservations', v),
    });
    if (made) { toast.success('Reservation added to tonight’s book.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="table-step"]', async (e, el) => {
    const tb = state.tables.find((x) => String(x.id) === el.dataset.id);
    if (!tb) return;
    const nextStatus = el.dataset.status;
    if (nextStatus === 'Seated') {
      const seated = await formDialog({
        title: `Seat Walk-in · Table ${tb.table_number}`,
        submitLabel: 'Seat Guests',
        fields: html`
          <div class="k-form__row">
            <label class="k-field"><span class="k-field__label">Guest / Party Name</span>
              <input class="k-input" name="guest_name" placeholder="e.g. Walk-in · Sofia" required>
            </label>
            <label class="k-field"><span class="k-field__label">Covers</span>
              <input class="k-input" type="number" min="1" max="40" name="party_size" value="${tb.capacity}" required>
            </label>
          </div>`,
        onSubmit: (vals) => api.post('/api/tables/status', { id: tb.id, status: 'Seated', ...vals }),
      });
      if (seated) { toast.success(`Table ${tb.table_number} seated.`); await loadScreen('/'); }
      return;
    }
    try {
      await api.post('/api/tables/status', { id: tb.id, status: nextStatus });
      toast.success(`Table ${tb.table_number} -> ${nextStatus}`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="table-fire"]', async (e, el) => {
    const tb = state.tables.find((x) => String(x.id) === el.dataset.id);
    if (!tb) return;
    const fired = await formDialog({
      title: `Fire Kitchen Ticket · Table ${tb.table_number}`,
      submitLabel: 'Fire to Pass',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Course</span>
            <select class="k-input" name="course">${COURSES.map((c) => html`<option value="${c}" ${c === 'Mains' ? 'selected' : ''}>${c}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Priority</span>
            <select class="k-input" name="priority"><option value="Normal">Normal</option><option value="Priority">Priority / VIP</option></select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Order items</span>
          <textarea class="k-input" name="items" rows="3" placeholder="2x Steak Frites (med-rare)&#10;1x Market Snapper&#10;1x Pommes Purée" required></textarea>
        </label>
        <label class="k-field"><span class="k-field__label" style="color:#b91c1c">Allergy alert (highlighted red on pass)</span>
          <input class="k-input" name="allergy_notes" placeholder="e.g. Severe nut allergy, Coeliac GF">
        </label>`,
      onSubmit: (vals) => api.post('/api/tickets', { ...vals, table_id: tb.id, table_number: tb.table_number }),
    });
    if (fired) { toast.success(`Ticket fired for Table ${tb.table_number}!`); await loadScreen('/'); }
  });

  const tableFormFields = (tb = {}) => {
    const servers = state.staff.filter((s) => s.active === 'Active');
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Table number</span><input class="k-input" name="table_number" value="${tb.table_number || ''}" placeholder="e.g. M5, P4, B3" required></label>
        <label class="k-field"><span class="k-field__label">Section</span>
          <select class="k-input" name="section">${SECTIONS.map((s) => html`<option value="${s}" ${s === tb.section ? 'selected' : ''}>${s}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Capacity</span><input class="k-input" type="number" min="1" max="40" name="capacity" value="${tb.capacity ?? 4}" required></label>
      </div>
      <label class="k-field"><span class="k-field__label">Assigned server</span>
        <select class="k-input" name="server_id">
          <option value="">Unassigned</option>
          ${servers.map((st) => html`<option value="${st.id}" ${String(st.id) === String(tb.server_id) ? 'selected' : ''}>${st.name} (${st.role})</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${tb.notes || ''}" placeholder="Window two-top, banquette booth…"></label>`;
  };

  on(root, 'click', '[data-action="table-new"]', async () => {
    const made = await formDialog({ title: 'Add Dining Table', submitLabel: 'Add table', fields: tableFormFields(), onSubmit: (v) => api.post('/api/tables', v) });
    if (made) { toast.success('Table added to floor map.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="table-edit"]', async (e, el) => {
    const tb = state.tables.find((x) => String(x.id) === el.dataset.id);
    if (!tb) return;
    const saved = await formDialog({ title: `Edit Table ${tb.table_number}`, submitLabel: 'Save table', fields: tableFormFields(tb), onSubmit: (v) => api.put('/api/tables', { ...v, id: tb.id }) });
    if (saved) { toast.success('Table updated.'); await loadScreen('/'); }
  });
}
