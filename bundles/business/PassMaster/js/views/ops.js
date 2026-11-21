// Station Mise en Place Board, FOH/BOH Brigade Cards, and Nightly Shift Close w/ Live Spend-per-Cover & Tile Checklist.
import { html, on, cls, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const PREP_STATIONS = ['Hot', 'Cold', 'Pastry', 'Bar'];
const PREP_UNITS = ['portions', 'kg', 'litres', 'trays'];
const PREP_STATUS_FILTERS = [
  { id: 'All', label: 'All' },
  { id: 'Open', label: 'Remaining' },
  { id: 'In progress', label: 'Working' },
  { id: 'Done', label: 'Done' },
  { id: 'Eighty-sixed', label: '86\'d' },
];
const STAFF_ROLES = ['Server', 'Chef', 'Kitchen hand', 'Bartender', 'Manager'];
const STAFF_STATIONS = ['Main', 'Patio', 'Bar', 'Private', 'Hot line', 'Cold larder', 'Pastry'];
const CLEANING_CHECKS = [
  'Pass wiped down',
  'Line degreased',
  'Fridges temped',
  'Floors done',
  'Bar restocked',
  'Bins out',
];

function isFohRole(role) {
  return role === 'Server' || role === 'Bartender' || role === 'Manager';
}

export function renderPrepView(state) {
  const doneCount = state.prep.filter((p) => p.status === 'Done').length;
  const inProgCount = state.prep.filter((p) => p.status === 'In progress').length;
  const eightySixed = state.prep.filter((p) => p.status === 'Eighty-sixed');
  const totalCount = state.prep.length;
  const overallPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 100;
  const ringColor = overallPct === 100 ? '#22c55e' : '#eab967';

  const stations = state.prepStation === 'All' ? PREP_STATIONS : [state.prepStation];
  const filteredPrep = state.prep.filter((p) => {
    if (state.prepStation !== 'All' && p.station !== state.prepStation) return false;
    const f = state.prepStatusFilter || 'All';
    if (f === 'Open') return p.status === 'Not started' || p.status === 'In progress';
    if (f === 'All') return true;
    return p.status === f;
  });

  return html`
    <section class="pm-masthead" aria-label="Mise en Place Board">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          ${icon('check-square', { size: 12 })} MISE EN PLACE &amp; 86 BOARD
        </div>
        <h1 class="pm-masthead__title">Station Prep</h1>
        <div class="pm-masthead__meta">
          <span>Tick off Hot, Cold, Pastry &amp; Bar prep before doors open</span>
          <span>·</span>
          <span>${inProgCount} working right now</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--ring pm-pod--gold">
          <div class="tk-ring" style="--p:${overallPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${overallPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="pm-pod__lbl">Doors Ready</span>
            <span class="pm-pod__val" style="font-size:16px">${doneCount}/${totalCount}</span>
            <span class="pm-pod__sub">${overallPct === 100 ? 'Ready for service' : `${totalCount - doneCount} remaining`}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${totalCount ? html`<button type="button" class="k-btn k-btn--glass" data-action="copy-prep">${icon('copy', { size: 15 })} Copy Brief</button>` : ''}
          <button type="button" class="k-btn k-btn--primary" data-action="prep-new">${icon('plus', { size: 16 })} Add Prep Task</button>
        </div>
      </div>

      <div class="pm-pass-ribbons" role="tablist" aria-label="Prep stations">
        <button type="button" class="${cls('pm-ribbon-btn', { 'is-on': state.prepStation === 'All' })}" data-action="prep-station" data-station="All">
          <span>All Stations</span>
          <strong>${doneCount}/${totalCount}</strong>
        </button>
        ${PREP_STATIONS.map((st) => {
          const stAll = state.prep.filter((p) => p.station === st);
          const stDone = stAll.filter((p) => p.status === 'Done').length;
          return html`
            <button type="button" class="${cls('pm-ribbon-btn', { 'is-on': state.prepStation === st })}" data-action="prep-station" data-station="${st}">
              <span>${st}</span>
              <strong>${stDone}/${stAll.length}</strong>
            </button>`;
        })}
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${PREP_STATUS_FILTERS.map((sf) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': (state.prepStatusFilter || 'All') === sf.id })}" data-action="prep-status-filter" data-filter="${sf.id}">${sf.label}</button>`)}
      </div>
    </div>

    ${eightySixed.length ? html`
      <div class="pm-86-banner">
        <span style="display:inline-flex;align-items:center;gap:8px">
          ${icon('alert', { size: 16 })}
          <span><strong>86'd Board (Tell Floor Immediately):</strong> ${eightySixed.map((x) => x.prep_item).join(' · ')}</span>
        </span>
      </div>` : ''}

    ${state.loading && !state.prep.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : filteredPrep.length ? html`
      <div class="pm-prep-grid">
        ${stations.map((st) => {
          const rows = filteredPrep.filter((p) => p.station === st);
          if (!rows.length) return '';
          const allStation = state.prep.filter((p) => p.station === st);
          const stDone = allStation.filter((p) => p.status === 'Done').length;
          const pct = allStation.length ? Math.round((stDone / allStation.length) * 100) : 0;
          return html`
            <section class="tk-sheet" data-key="prep-sec-${st}">
              <div class="tk-sheet__head">
                <div class="pm-prep-head">
                  <h2 class="tk-sheet__title">${icon(st === 'Bar' ? 'wine' : 'cloche', { size: 16 })} ${st} Station <span class="tk-sheet__count">${stDone}/${allStation.length} · ${pct}%</span></h2>
                  <div class="pm-prep-bar"><div class="tk-bar"><div class="tk-bar__fill ${pct === 100 ? 'tk-bar__fill--ok' : ''}" style="width:${pct}%"></div></div></div>
                </div>
              </div>
              <div>
                ${rows.map((p) => {
                  const isDone = p.status === 'Done';
                  const is86 = p.status === 'Eighty-sixed';
                  return html`
                    <div class="tk-row" data-key="pr-${p.id}">
                      <label style="display:flex;align-items:flex-start;gap:10px;flex:1;cursor:pointer;min-width:0">
                        <input type="checkbox" style="width:19px;height:19px;margin-top:2px;accent-color:var(--k-accent);flex:none" data-action="prep-check" data-id="${p.id}" ${isDone ? 'checked' : ''}>
                        <div class="tk-row__main">
                          <div class="tk-row__title ${isDone ? 'tk-muted' : ''} ${is86 ? 'pm-prep-86' : ''}" style="${isDone ? 'text-decoration:line-through' : ''}">
                            <span>${p.prep_item}</span>
                            <span class="tk-tag ${isDone ? 'tk-tag--ok' : is86 ? 'tk-tag--bad' : p.status === 'In progress' ? 'tk-tag--info' : 'tk-tag--warn'}">${p.status}</span>
                          </div>
                          <div class="tk-row__meta">
                            <span><strong>${num(p.quantity_needed, { decimals: 1 })} ${p.unit}</strong></span>
                            <span>${icon('clock', { size: 11 })} Due ${p.due_by}</span>
                            ${p.assigned_to_name ? html`<span>${p.assigned_to_name}</span>` : ''}
                          </div>
                        </div>
                      </label>
                      <div class="tk-row__aside">
                        ${!isDone && !is86 && p.status !== 'In progress' ? html`<button type="button" class="k-btn k-btn--sm" data-action="prep-status" data-id="${p.id}" data-status="In progress">Start</button>` : ''}
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm ${is86 ? '' : 'tk-danger'}" data-action="prep-status" data-id="${p.id}" data-status="${is86 ? 'Not started' : 'Eighty-sixed'}">${is86 ? 'Restore' : '86 It'}</button>
                        <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prep-edit" data-id="${p.id}">Edit</button>
                      </div>
                    </div>`;
                })}
              </div>
            </section>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'check-square', title: state.prep.length ? 'No prep items match this filter' : 'Prep list is empty', text: state.prep.length ? 'Try another status or station filter.' : 'Add Hot, Cold, Pastry and Bar mise en place tasks for today.' })}</section>`}`;
}

export function renderRosterView(state) {
  const activeStaff = state.staff.filter((m) => m.active === 'Active');
  const fohCount = activeStaff.filter((m) => isFohRole(m.role)).length;
  const bohCount = activeStaff.length - fohCount;

  // Count assigned floor tables per server
  const tablesByServer = new Map();
  for (const t of state.tables || []) {
    if (t.server_id) tablesByServer.set(Number(t.server_id), (tablesByServer.get(Number(t.server_id)) || 0) + 1);
  }

  const rf = state.rosterRoleFilter || 'All';
  const q = (state.rosterSearch || '').trim().toLowerCase();
  const visible = state.staff.filter((m) => {
    if (rf === 'FOH' && !isFohRole(m.role)) return false;
    if (rf === 'BOH' && isFohRole(m.role)) return false;
    if (q && !m.name.toLowerCase().includes(q) && !String(m.role || '').toLowerCase().includes(q) && !String(m.station || '').toLowerCase().includes(q)) return false;
    return true;
  });

  return html`
    <section class="pm-masthead" aria-label="Brigade Roster">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          ${icon('users', { size: 12 })} FRONT &amp; BACK OF HOUSE BRIGADE
        </div>
        <h1 class="pm-masthead__title">Staff Roster</h1>
        <div class="pm-masthead__meta">
          <span>Assign servers to dining sections and chefs to line stations</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--gold">
          <span class="pm-pod__lbl">${icon('users', { size: 12 })} Active Brigade</span>
          <span class="pm-pod__val">${activeStaff.length}</span>
          <span class="pm-pod__sub">of ${state.staff.length} rostered</span>
        </div>
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('wine', { size: 12 })} Front of House</span>
          <span class="pm-pod__val">${fohCount}</span>
          <span class="pm-pod__sub">Floor, Bar &amp; Host</span>
        </div>
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('cloche', { size: 12 })} Kitchen</span>
          <span class="pm-pod__val">${bohCount}</span>
          <span class="pm-pod__sub">Hot, Cold &amp; Pastry</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="staff-new">${icon('plus', { size: 16 })} Add Member</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="roster-search" value="${state.rosterSearch || ''}" placeholder="Search name, role, station…"></label>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': rf === 'All' })}" data-action="roster-role" data-role="All">All (${state.staff.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': rf === 'FOH' })}" data-action="roster-role" data-role="FOH">Front of House (${fohCount})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': rf === 'BOH' })}" data-action="roster-role" data-role="BOH">Kitchen (${bohCount})</button>
      </div>
    </div>

    ${state.loading && !state.staff.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : visible.length ? html`
      <div class="pm-brigade-grid">
        ${visible.map((m) => {
          const tCount = tablesByServer.get(Number(m.id)) || 0;
          return html`
            <article class="pm-brigade-card" data-key="st-${m.id}">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="pm-brigade-avatar">${initials(m.name)}</span>
                <div style="min-width:0;flex:1">
                  <div style="font-family:var(--k-font-display);font-weight:750;font-size:16.5px;line-height:1.15">${m.name}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">
                    <span class="tk-tag tk-tag--accent">${m.role}</span>
                    <span class="tk-tag">${m.station}</span>
                    <span class="tk-tag ${m.active === 'Active' ? 'tk-tag--ok' : ''}">${m.active}</span>
                  </div>
                </div>
              </div>

              <div style="display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12.5px;color:var(--k-muted)">
                ${m.phone ? html`<span style="display:inline-flex;align-items:center;gap:5px">${icon('phone', { size: 12 })} ${m.phone}</span>` : ''}
                ${tCount > 0 ? html`<span style="display:inline-flex;align-items:center;gap:5px;color:var(--k-text);font-weight:700">${icon('table-seat', { size: 12 })} ${tCount} table${tCount === 1 ? '' : 's'} assigned</span>` : ''}
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:9px;border-top:1px dashed var(--k-border)">
                ${m.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : html`<span></span>`}
                <div style="display:flex;gap:4px">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="staff-edit" data-id="${m.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="staff-del" data-id="${m.id}">Remove</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No brigade members match', text: 'Add servers, chefs, kitchen hands and bartenders to assign them across service.' })}</section>`}`;
}

export function renderCloseView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const sum = state.todayCloseSummary || { day: today(), suggestedCovers: 0 };
  const coversVal = state.closeCovers !== '' ? Number(state.closeCovers) || 0 : Number(sum.suggestedCovers || 0);
  const salesCents = Math.round((Number(state.closeSales) || 0) * 100);
  const voidsCents = Math.round((Number(state.closeVoids) || 0) * 100);
  const netCents = Math.max(0, salesCents - voidsCents);
  const spendPerHead = coversVal > 0 && salesCents > 0 ? Math.round(salesCents / coversVal) : 0;

  const checkedList = Array.isArray(state.closeChecks) ? state.closeChecks : [];
  const checkPct = Math.round((checkedList.length / CLEANING_CHECKS.length) * 100);
  const checkColor = checkedList.length === CLEANING_CHECKS.length ? '#22c55e' : '#eab967';

  return html`
    <section class="pm-masthead" aria-label="Nightly Service Closeout">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          ${icon('clipboard', { size: 12 })} NIGHTLY SERVICE HANDOVER · ${fmtDay(sum.day)}
        </div>
        <h1 class="pm-masthead__title">Shift Close</h1>
        <div class="pm-masthead__meta">
          <span>Reconcile covers, gross sales, voids &amp; comps</span>
          <span>·</span>
          <span>Sign off closing hygiene checklist</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--gold">
          <span class="pm-pod__lbl">${icon('trending', { size: 12 })} Net Revenue</span>
          <span class="pm-pod__val">${money(netCents, { currency })}</span>
          <span class="pm-pod__sub">${coversVal} covers entered</span>
        </div>
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('dollar', { size: 12 })} Spend / Cover</span>
          <span class="pm-pod__val">${money(spendPerHead, { currency })}</span>
          <span class="pm-pod__sub">Live average check</span>
        </div>
        <div class="pm-pod pm-pod--ring">
          <div class="tk-ring" style="--p:${checkPct}%;--ring-color:${checkColor};--ring-size:48px">
            <span class="tk-ring__val">${checkedList.length}/${CLEANING_CHECKS.length}</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="pm-pod__lbl">Closeout</span>
            <span class="pm-pod__val" style="font-size:15px">${checkedList.length === CLEANING_CHECKS.length ? 'Ready to sign' : 'Checklist open'}</span>
            <span class="pm-pod__sub">Hygiene tasks</span>
          </div>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('clipboard', { size: 18 })} Close Service (${fmtDay(sum.day)})</h2>
          <span class="tk-tag tk-tag--accent">Seated today: ${sum.suggestedCovers} covers</span>
        </div>
        <div class="tk-sheet__body tk-stack">
          <div class="pm-close-calc">
            <div>
              <div class="pm-close-calc__lbl">Gross Sales</div>
              <div class="pm-close-calc__val">${money(salesCents, { currency })}</div>
            </div>
            <div>
              <div class="pm-close-calc__lbl">Net Revenue</div>
              <div class="pm-close-calc__val tk-ok">${money(netCents, { currency })}</div>
            </div>
            <div>
              <div class="pm-close-calc__lbl">Avg / Head</div>
              <div class="pm-close-calc__val">${money(spendPerHead, { currency })}</div>
            </div>
          </div>

          <form class="k-form" data-form="add-close" novalidate>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Service date</span><input class="k-input" type="date" name="close_date" value="${sum.day}" required></label>
              <label class="k-field"><span class="k-field__label">Covers served</span><input class="k-input" type="number" min="0" step="1" name="covers_served" data-close-calc="closeCovers" value="${state.closeCovers !== '' ? state.closeCovers : sum.suggestedCovers}" required></label>
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Sales total</span><input class="k-input" type="number" step="0.01" min="0" name="sales_total" data-close-calc="closeSales" value="${state.closeSales}" placeholder="6840.00" required></label>
              <label class="k-field"><span class="k-field__label">Voids &amp; Comps</span><input class="k-input" type="number" step="0.01" min="0" name="voids_comps" data-close-calc="closeVoids" value="${state.closeVoids}"></label>
            </div>
            <div class="k-field">
              <span class="k-field__label">Closing Cleaning Checklist (${checkedList.length}/${CLEANING_CHECKS.length})</span>
              <div class="pm-check-grid">
                ${CLEANING_CHECKS.map((ck) => {
                  const isOn = checkedList.includes(ck);
                  return html`
                    <label class="${cls('pm-check-tile', { 'is-checked': isOn })}">
                      <input type="checkbox" name="cleaning" value="${ck}" data-action="close-check-toggle" ${isOn ? 'checked' : ''}>
                      <span>${ck}</span>
                    </label>`;
                })}
              </div>
            </div>
            <label class="k-field"><span class="k-field__label">Service incidents &amp; notes <span class="k-field__optional">optional</span></span>
              <textarea class="k-input" name="incidents" rows="2" placeholder="86'd dishes, guest comps, maintenance flags…"></textarea>
            </label>
            <label class="k-field"><span class="k-field__label">Manager sign-off</span>
              <input class="k-input" name="manager_signoff" value="${state.session.me.displayName || ''}" required>
            </label>
            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary">${icon('check-circle', { size: 16 })} Submit Shift Close</button>
            </div>
          </form>
        </div>
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('file', { size: 18 })} Past Shift Closes</h2><span class="tk-sheet__count">${state.closes.length}</span></div>
        <div>
          ${state.loading && !state.closes.length ? skeleton(3) : state.closes.length ? state.closes.map((cl) => {
            const avg = cl.covers_served > 0 ? Math.round(cl.sales_cents / cl.covers_served) : 0;
            const net = Math.max(0, Number(cl.sales_cents) - Number(cl.voids_comps_cents));
            return html`
              <div class="tk-row" data-key="cl-${cl.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${fmtDay(cl.close_date)}</span>
                    <strong>${money(net, { currency })}</strong>
                    <span class="tk-tag tk-tag--accent">${cl.covers_served} covers</span>
                    ${avg > 0 ? html`<span class="tk-tag">${money(avg, { currency })}/head</span>` : ''}
                    ${cl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Gross: ${money(cl.sales_cents, { currency })}</span>
                    <span>Voids/Comps: ${money(cl.voids_comps_cents, { currency })}</span>
                    <span>Checklist: ${(cl.cleaning || []).length}/${CLEANING_CHECKS.length}</span>
                    <span>Signed: ${cl.manager_signoff}</span>
                  </div>
                  ${cl.incidents ? html`<div class="tk-muted" style="font-size:12.5px;margin-top:2px">${cl.incidents}</div>` : ''}
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm" data-action="print-close" data-id="${cl.id}">${icon('printer', { size: 14 })} Sheet</button>
                </div>
              </div>`;
          }) : emptyState({ iconName: 'clipboard', title: 'No shift closes logged yet', text: 'Sign off tonight’s covers, sales and cleaning checklist on the left.' })}
        </div>
      </section>
    </div>`;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="prep-station"]', (e, el) => { state.prepStation = el.dataset.station; draw(); });
  on(root, 'click', '[data-action="prep-status-filter"]', (e, el) => { state.prepStatusFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="roster-role"]', (e, el) => { state.rosterRoleFilter = el.dataset.role; draw(); });
  on(root, 'input', '[data-action="roster-search"]', (e, el) => { state.rosterSearch = el.value; draw(); });
  on(root, 'input', '[data-close-calc]', (e, el) => { state[el.dataset.closeCalc] = el.value; draw(); });

  on(root, 'change', '[data-action="close-check-toggle"]', (e, el) => {
    const val = el.value;
    if (!Array.isArray(state.closeChecks)) state.closeChecks = [];
    if (el.checked && !state.closeChecks.includes(val)) state.closeChecks.push(val);
    else if (!el.checked) state.closeChecks = state.closeChecks.filter((c) => c !== val);
    draw();
  });

  on(root, 'change', '[data-action="prep-check"]', async (e, el) => {
    const nextStatus = el.checked ? 'Done' : 'Not started';
    try { await api.post('/api/prep/status', { id: Number(el.dataset.id), status: nextStatus }); await loadScreen('/prep'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prep-status"]', async (e, el) => {
    try { await api.post('/api/prep/status', { id: Number(el.dataset.id), status: el.dataset.status }); await loadScreen('/prep'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-prep"]', () => {
    const open = state.prep.filter((p) => p.status !== 'Done');
    const lines = open.map((p) => `[${p.station}] ${p.prep_item} — ${p.quantity_needed} ${p.unit} (Due ${p.due_by}) · ${p.status}`);
    copyText(`PassMaster Prep Brief (${today()})\n${lines.join('\n') || 'All prep complete!'}`, { title: 'Prep brief' });
  });

  const prepFields = (p = {}) => html`
    <label class="k-field"><span class="k-field__label">Prep item</span><input class="k-input" name="prep_item" value="${p.prep_item || ''}" placeholder="e.g. Portion market fish" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Station</span><select class="k-input" name="station">${PREP_STATIONS.map((s) => html`<option value="${s}" ${s === p.station ? 'selected' : ''}>${s}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Qty needed</span><input class="k-input" type="number" step="0.5" min="0" name="quantity_needed" value="${p.quantity_needed ?? 10}"></label>
      <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${PREP_UNITS.map((u) => html`<option value="${u}" ${u === p.unit ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Due by</span><input class="k-input" type="time" name="due_by" value="${p.due_by || '16:30'}"></label>
      <label class="k-field"><span class="k-field__label">Assigned to</span>
        <select class="k-input" name="assigned_to_id">
          <option value="">Unassigned</option>
          ${state.staff.map((st) => html`<option value="${st.id}" ${String(st.id) === String(p.assigned_to_id) ? 'selected' : ''}>${st.name}</option>`)}
        </select>
      </label>
    </div>`;

  on(root, 'click', '[data-action="prep-new"]', async () => {
    const made = await formDialog({ title: 'Add Prep Task', submitLabel: 'Add task', fields: prepFields(), onSubmit: (v) => api.post('/api/prep', v) });
    if (made) { toast.success('Prep task added.'); await loadScreen('/prep'); }
  });

  on(root, 'click', '[data-action="prep-edit"]', async (e, el) => {
    const item = state.prep.find((x) => String(x.id) === el.dataset.id);
    if (!item) return;
    const saved = await formDialog({ title: 'Edit Prep Task', submitLabel: 'Save', fields: prepFields(item), onSubmit: (v) => api.put('/api/prep', { ...v, id: item.id }) });
    if (saved) { toast.success('Prep task updated.'); await loadScreen('/prep'); }
  });

  const staffFields = (m = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Full name</span><input class="k-input" name="name" value="${m.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Role</span><select class="k-input" name="role">${STAFF_ROLES.map((r) => html`<option value="${r}" ${r === m.role ? 'selected' : ''}>${r}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Section or Station</span><select class="k-input" name="station">${STAFF_STATIONS.map((s) => html`<option value="${s}" ${s === m.station ? 'selected' : ''}>${s}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${m.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${m.active !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${m.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>`;

  on(root, 'click', '[data-action="staff-new"]', async () => {
    const made = await formDialog({ title: 'Add Brigade Member', submitLabel: 'Save', fields: staffFields(), onSubmit: (v) => api.post('/api/staff', v) });
    if (made) { toast.success('Staff member added.'); await loadScreen('/roster'); }
  });

  on(root, 'click', '[data-action="staff-edit"]', async (e, el) => {
    const m = state.staff.find((x) => String(x.id) === el.dataset.id);
    if (!m) return;
    const saved = await formDialog({ title: `Edit ${m.name}`, submitLabel: 'Save', fields: staffFields(m), onSubmit: (v) => api.put('/api/staff', { ...v, id: m.id }) });
    if (saved) { toast.success('Staff member updated.'); await loadScreen('/roster'); }
  });

  on(root, 'click', '[data-action="staff-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove staff member?', message: 'Delete this member from the brigade roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/staff', { id: Number(el.dataset.id) }); toast.success('Removed.'); await loadScreen('/roster'); }
    catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="add-close"]', async (e, form) => {
    e.preventDefault();
    try {
      const vals = readForm(form);
      await api.post('/api/closes', { ...vals, cleaning: Array.isArray(vals.cleaning) ? vals.cleaning : [] });
      state.closeSales = '';
      state.closeVoids = '0.00';
      state.closeChecks = [];
      toast.success('Shift close recorded.');
      await loadScreen('/close');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-close"]', (e, el) => {
    const cl = state.closes.find((x) => String(x.id) === el.dataset.id);
    if (!cl) return;
    const cur = state.session.settings.currency || 'AUD';
    const avg = cl.covers_served > 0 ? Math.round(cl.sales_cents / cl.covers_served) : 0;
    const netSales = Number(cl.sales_cents) - Number(cl.voids_comps_cents);
    downloadHtmlDoc(`passmaster-shift-close-${cl.close_date}.html`, {
      title: `Nightly Shift Close · ${cl.close_date}`,
      businessName: state.session.settings.business_name,
      subtitle: `Signed off by ${cl.manager_signoff || 'Manager'}`,
      accent: '#8c1d37',
      bodyHtml: `<table>
        <tr><th>Covers Served</th><td class="num">${cl.covers_served}</td></tr>
        <tr><th>Gross Sales Total</th><td class="num">${money(cl.sales_cents, { currency: cur })}</td></tr>
        <tr><th>Voids &amp; Comps</th><td class="num">-${money(cl.voids_comps_cents, { currency: cur })}</td></tr>
        <tr class="total-row"><td>Net Service Revenue</td><td class="num">${money(netSales, { currency: cur })}</td></tr>
        <tr><th>Average Spend / Cover</th><td class="num">${money(avg, { currency: cur })}</td></tr>
      </table>
      <div class="box"><strong>Closing Cleaning Checklist (${(cl.cleaning || []).length}/${CLEANING_CHECKS.length}):</strong> ${(cl.cleaning || []).join(', ') || 'None ticked'}</div>
      ${cl.incidents ? `<div class="box"><strong>Service Incidents &amp; Handover:</strong> ${cl.incidents}</div>` : ''}`,
    });
  });
}
