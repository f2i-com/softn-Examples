// Prep & Par Stock Trays, Visual 10:00->22:00 Crew Shift & Break Timeline, and Daily Close w/ Channel Mix Bar & Checklist Tiles.
import { html, on, cls, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const STOCK_CATS = ['Bun', 'Patty', 'Sauce', 'Salad', 'Packaging', 'Drink'];
const STOCK_UNITS = ['Units', 'kg', 'Litres', 'Boxes'];
const SHIFT_ROLES = ['Grill', 'Front counter', 'Runner', 'Manager'];
const CLEANING_CHECKS = [
  'Grill scraped',
  'Fryer oil filtered',
  'Benches sanitised',
  'Cool room checked',
  'Floors done',
  'Bins out',
];
const RULER_START_MIN = 10 * 60; // 10:00
const RULER_SPAN_MIN = 12 * 60;  // 10:00 -> 22:00 (12 hours)

function parseTimeMinutes(t) {
  const parts = String(t || '0:0').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function hoursBetweenNum(start, end) {
  const mins = parseTimeMinutes(end) - parseTimeMinutes(start);
  return mins > 0 ? mins / 60 : 0;
}

function hoursBetween(start, end) {
  const h = hoursBetweenNum(start, end);
  return h > 0 ? h.toFixed(1) + ' h' : '';
}

function shiftRoleClass(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('grill')) return 'gs-shift-bar--grill';
  if (r.includes('counter') || r.includes('front')) return 'gs-shift-bar--counter';
  if (r.includes('runner')) return 'gs-shift-bar--runner';
  return 'gs-shift-bar--manager';
}

function shiftBarGeometry(start, end) {
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  const left = Math.max(0, Math.min(92, ((s - RULER_START_MIN) / RULER_SPAN_MIN) * 100));
  const width = Math.max(8, Math.min(100 - left, ((Math.max(e, s + 30) - s) / RULER_SPAN_MIN) * 100));
  return { left: left.toFixed(2), width: width.toFixed(2) };
}

export function renderStockView(state) {
  const lowItems = state.stock.filter((s) => s.status !== 'OK');
  const outCount = state.stock.filter((s) => s.status === 'Out').length;
  const okCount = state.stock.length - lowItems.length;
  const healthPct = state.stock.length ? Math.round((okCount / state.stock.length) * 100) : 100;
  const ringColor = healthPct >= 75 ? '#22c55e' : healthPct >= 45 ? '#f59e0b' : '#ef4444';

  const q = (state.stockSearch || '').trim().toLowerCase();
  const rows = state.stock.filter((s) => {
    if (state.stockFilter === 'Low' && s.status === 'OK') return false;
    if (state.stockFilter !== 'All' && state.stockFilter !== 'Low' && s.category !== state.stockFilter) return false;
    if (q && !s.ingredient.toLowerCase().includes(q) && !String(s.category || '').toLowerCase().includes(q)) return false;
    return true;
  });

  return html`
    <section class="gs-masthead" aria-label="Prep & Par Command">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          ${icon('box', { size: 12 })} BUNS, PATTIES, SAUCES &amp; PACKAGING
        </div>
        <h1 class="gs-masthead__title">Prep &amp; Par Stock</h1>
        <div class="gs-masthead__meta">
          <span>Opening vs live line tray counts with visual PAR threshold markers</span>
          <span>·</span>
          <span>Tap +/- during service or restock to par</span>
        </div>
      </div>

      <div class="gs-masthead__pods" style="align-items:center">
        <div class="gs-pod" style="display:flex;align-items:center;gap:12px;padding:9px 14px">
          <div class="tk-ring" style="--p:${healthPct}%;--ring-color:${ringColor};--ring-size:48px;--ring-track:rgba(255,255,255,.16)">
            <span class="tk-ring__val">${healthPct}%</span>
          </div>
          <div style="display:grid;gap:2px">
            <span class="gs-pod__lbl">Par Health</span>
            <span style="font-size:13.5px;font-weight:800;color:#ffffff">${okCount}/${state.stock.length} at par</span>
            <span class="gs-pod__sub">${outCount > 0 ? `${outCount} OUT · ${lowItems.length - outCount} low` : lowItems.length > 0 ? `${lowItems.length} below par` : 'Fully stocked'}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${lowItems.length ? html`<button type="button" class="k-btn k-btn--glass" data-action="copy-reorder">${icon('copy', { size: 15 })} Copy Reorder (${lowItems.length})</button>` : ''}
          <button type="button" class="k-btn k-btn--primary" data-action="stock-new">${icon('plus', { size: 16 })} Add Prep Line</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 16 })}<input type="search" data-action="stock-search" value="${state.stockSearch || ''}" placeholder="Search buns, patties, sauces…"></label>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === 'All' })}" data-action="stock-filter" data-filter="All">All (${state.stock.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === 'Low' })}" data-action="stock-filter" data-filter="Low">Low / Out (${lowItems.length})</button>
        ${STOCK_CATS.slice(0, 5).map((cat) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === cat })}" data-action="stock-filter" data-filter="${cat}">${cat}</button>`)}
      </div>
    </div>

    ${state.loading && !state.stock.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="gs-stock-grid">
        ${rows.map((st) => {
          const cur = Number(st.current_count || 0);
          const open = Number(st.opening_count || 0);
          const par = Math.max(0.1, Number(st.par_level || 1));
          const maxScale = Math.max(open, par * 1.35, cur, 1);
          const fillPct = Math.min(100, Math.round((cur / maxScale) * 100));
          const parNotchPct = Math.min(96, Math.max(10, Math.round((par / maxScale) * 100)));
          const used = Math.max(0, Math.round((open - cur) * 10) / 10);
          const shortfall = Math.max(0, Math.round((par - cur) * 10) / 10);
          const fillColor = st.status === 'Out' ? '#dc2626' : st.status === 'Low' ? '#f59e0b' : '#16a34a';
          const tagTone = st.status === 'Out' ? 'tk-tag--bad' : st.status === 'Low' ? 'tk-tag--warn' : 'tk-tag--ok';

          return html`
            <article class="${cls('gs-stock-card', { 'gs-stock-card--out': st.status === 'Out', 'gs-stock-card--low': st.status === 'Low' })}" data-key="st-${st.id}">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                <div style="min-width:0">
                  <div style="font-family:var(--k-font-display);font-weight:800;font-size:16px;line-height:1.2">${st.ingredient}</div>
                  <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
                    <span class="tk-tag ${tagTone}">${st.status}</span>
                    <span class="tk-tag">${st.category}</span>
                    ${st.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                </div>
                <div style="text-align:right;font-variant-numeric:tabular-nums">
                  <div style="font-size:22px;font-weight:800;line-height:1;color:${st.status === 'Out' ? '#dc2626' : st.status === 'Low' ? '#b45309' : 'var(--k-text)'}">${num(cur, { decimals: 1 })}</div>
                  <div style="font-size:11px;font-weight:700;color:var(--k-muted)">${st.unit} on line</div>
                </div>
              </div>

              <div style="display:grid;gap:5px">
                <div class="gs-par-track" title="Notch marks PAR level (${num(par, { decimals: 1 })} ${st.unit})">
                  <div class="gs-par-fill" style="width:${fillPct}%;background:${fillColor}"></div>
                  <span class="gs-par-notch" style="left:${parNotchPct}%"></span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--k-muted);font-variant-numeric:tabular-nums">
                  <span>Open ${num(open, { decimals: 1 })} · Burned <strong style="color:var(--k-text)">${num(used, { decimals: 1 })}</strong></span>
                  <span>Par <strong style="color:var(--k-text)">${num(par, { decimals: 1 })} ${st.unit}</strong></span>
                </div>
                ${shortfall > 0 ? html`
                  <div style="font-size:11.5px;font-weight:750;color:${st.status === 'Out' ? '#b91c1c' : '#b45309'}">
                    Need +${num(shortfall, { decimals: 1 })} ${st.unit} to reach par${st.last_checked ? ` · Checked ${ago(st.last_checked)}` : ''}
                  </div>` : html`
                  <div style="font-size:11.5px;color:var(--k-muted)">
                    Healthy buffer above par${st.last_checked ? ` · Checked ${ago(st.last_checked)}` : ''}
                  </div>`}
              </div>

              <div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px dashed var(--k-border);align-items:center">
                <button type="button" class="k-btn k-btn--sm" data-action="stock-adj" data-id="${st.id}" data-delta="-5">−5</button>
                <button type="button" class="k-btn k-btn--sm" data-action="stock-adj" data-id="${st.id}" data-delta="-1">−1</button>
                <button type="button" class="k-btn k-btn--sm" data-action="stock-adj" data-id="${st.id}" data-delta="5">+5</button>
                ${st.status !== 'OK' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" style="margin-left:auto" data-action="stock-par" data-id="${st.id}">Restock to Par</button>` : ''}
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="${st.status === 'OK' ? 'margin-left:auto' : ''}" data-action="stock-edit" data-id="${st.id}">Edit</button>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'box', title: 'No prep lines match this filter', text: 'Track buns, patties, chicken fillets, sauces and boxes against par levels.' })}</section>`}`;
}

export function renderShiftsView(state) {
  const byDay = new Map();
  for (const sh of state.shifts) {
    if (!byDay.has(sh.shift_date)) byDay.set(sh.shift_date, []);
    byDay.get(sh.shift_date).push(sh);
  }
  const days = [...byDay.keys()].sort().reverse();
  const todayShifts = state.shifts.filter((s) => s.shift_date === today());
  const todayCrew = todayShifts.length;
  const todayHours = todayShifts.reduce((acc, s) => acc + hoursBetweenNum(s.start_time, s.end_time), 0);
  const breaksTaken = todayShifts.filter((s) => s.break_taken === 'Yes').length;
  const breaksDue = todayCrew - breaksTaken;
  const breakPct = todayCrew > 0 ? Math.round((breaksTaken / todayCrew) * 100) : 100;
  const breakRingColor = breaksDue === 0 ? '#22c55e' : '#f59e0b';

  return html`
    <section class="gs-masthead" aria-label="Crew Roster & Break Command">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          ${icon('users', { size: 12 })} CREW ROSTER &amp; BREAK TIMELINE
        </div>
        <h1 class="gs-masthead__title">Staff Shifts</h1>
        <div class="gs-masthead__meta">
          <span>Visual 10:00 → 22:00 floor coverage by role</span>
          <span>·</span>
          <span>Tap Break pills live during service</span>
        </div>
      </div>

      <div class="gs-masthead__pods" style="align-items:center">
        <div class="gs-pod">
          <span class="gs-pod__lbl">${icon('users', { size: 12 })} Today's Crew</span>
          <span class="gs-pod__val">${todayCrew}</span>
          <span class="gs-pod__sub">on roster</span>
        </div>
        <div class="gs-pod gs-pod--gold">
          <span class="gs-pod__lbl">${icon('clock', { size: 12 })} Scheduled</span>
          <span class="gs-pod__val">${todayHours.toFixed(1)}h</span>
          <span class="gs-pod__sub">total floor hours</span>
        </div>
        <div class="gs-pod" style="display:flex;align-items:center;gap:12px;padding:9px 14px">
          <div class="tk-ring" style="--p:${breakPct}%;--ring-color:${breakRingColor};--ring-size:48px;--ring-track:rgba(255,255,255,.16)">
            <span class="tk-ring__val">${breaksTaken}/${todayCrew}</span>
          </div>
          <div style="display:grid;gap:2px">
            <span class="gs-pod__lbl">Meal Breaks</span>
            <span style="font-size:13.5px;font-weight:800;color:#ffffff">${breaksDue > 0 ? `${breaksDue} still due` : 'All taken'}</span>
            <span class="gs-pod__sub">Today's shift</span>
          </div>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="shift-new">${icon('plus', { size: 16 })} Add Shift</button>
      </div>
    </section>

    <div class="tk-stack">
      ${state.loading && !state.shifts.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : days.length ? days.map((d) => {
        const dayShifts = byDay.get(d);
        const dayHrs = dayShifts.reduce((a, s) => a + hoursBetweenNum(s.start_time, s.end_time), 0);
        return html`
          <section class="tk-sheet" data-key="day-${d}">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('calendar', { size: 17 })} ${fmtDay(d)} ${d === today() ? html`<span class="tk-tag tk-tag--accent">Today</span>` : ''}</h2>
              <span class="tk-sheet__count">${dayShifts.length} crew · ${dayHrs.toFixed(1)} h</span>
            </div>
            <div class="gs-timeline-ruler" aria-hidden="true">
              <span>Crew Member &amp; Role</span>
              <div class="gs-ruler-hours">
                <span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span>
              </div>
              <span style="text-align:right">Break &amp; Actions</span>
            </div>
            <div>
              ${dayShifts.map((sh) => {
                const geo = shiftBarGeometry(sh.start_time, sh.end_time);
                const roleCls = shiftRoleClass(sh.role);
                return html`
                  <div class="gs-shift-row" data-key="sh-${sh.id}">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0">
                      <span class="tk-avatar" style="width:32px;height:32px;font-size:12px;background:#14161b;color:#fde68a">${initials(sh.staff_member)}</span>
                      <div style="min-width:0">
                        <div style="font-weight:750;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sh.staff_member}</div>
                        <div style="display:flex;align-items:center;gap:5px;margin-top:2px;flex-wrap:wrap">
                          <span class="tk-tag tk-tag--accent">${sh.role}</span>
                          ${sh.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                      </div>
                    </div>

                    <div style="display:grid;gap:4px">
                      <div class="gs-shift-track">
                        <div class="gs-shift-bar ${roleCls}" style="left:${geo.left}%;width:${geo.width}%">
                          <span>${sh.start_time} – ${sh.end_time}</span>
                          <span style="opacity:.85;font-size:11px">${hoursBetween(sh.start_time, sh.end_time)}</span>
                        </div>
                      </div>
                      ${sh.notes ? html`<div style="font-size:11.5px;color:var(--k-muted)">${sh.notes}</div>` : ''}
                    </div>

                    <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap">
                      <button type="button" class="${cls('k-btn k-btn--sm', sh.break_taken === 'Yes' ? '' : 'k-btn--primary')}" data-action="shift-break" data-id="${sh.id}">
                        ${sh.break_taken === 'Yes' ? 'Break Taken ✓' : 'Mark Break'}
                      </button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="shift-edit" data-id="${sh.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="shift-del" data-id="${sh.id}">Remove</button>
                    </div>
                  </div>`;
              })}
            </div>
          </section>`;
      }) : emptyState({ iconName: 'users', title: 'No shifts rostered yet', text: 'Put your grill crew, counter staff and runners on the shift board.' })}
    </div>`;
}

export function renderCloseView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const sum = state.todayCloseSummary || { day: today(), posCents: 0, orderCount: 0, deliveryPosCents: 0 };
  const cCents = Math.round((Number(state.closeCash) || 0) * 100);
  const eCents = Math.round((Number(state.closeEftpos) || 0) * 100);
  const dCents = Math.round((Number(state.closeDelivery) || 0) * 100);
  const liveTakings = cCents + eCents + dCents;
  const liveVar = liveTakings - (sum.posCents || 0);

  const cashPct = liveTakings > 0 ? Math.round((cCents / liveTakings) * 100) : 0;
  const eftposPct = liveTakings > 0 ? Math.round((eCents / liveTakings) * 100) : 0;
  const delivPct = liveTakings > 0 ? Math.max(0, 100 - cashPct - eftposPct) : 0;

  const checkedList = Array.isArray(state.closeChecks) ? state.closeChecks : [];
  const checkPct = Math.round((checkedList.length / CLEANING_CHECKS.length) * 100);
  const checkColor = checkedList.length === CLEANING_CHECKS.length ? '#22c55e' : '#f59e0b';

  return html`
    <section class="gs-masthead" aria-label="Nightly Closeout Command">
      <div class="gs-masthead__copy">
        <div class="gs-masthead__eyebrow">
          ${icon('clipboard', { size: 12 })} NIGHTLY TILL RECONCILIATION · ${fmtDay(sum.day)}
        </div>
        <h1 class="gs-masthead__title">Daily Close</h1>
        <div class="gs-masthead__meta">
          <span>Balance Cash, EFTPOS &amp; Delivery against live POS</span>
          <span>·</span>
          <span>Complete grill &amp; fryer closeout checklist</span>
        </div>
      </div>

      <div class="gs-masthead__pods" style="align-items:center">
        <div class="gs-pod gs-pod--gold">
          <span class="gs-pod__lbl">${icon('receipt', { size: 12 })} Today's POS</span>
          <span class="gs-pod__val">${money(sum.posCents, { currency })}</span>
          <span class="gs-pod__sub">${sum.orderCount} completed orders</span>
        </div>
        <div class="${cls('gs-pod', Math.abs(liveVar) > 1000 ? 'gs-pod--rush' : liveVar === 0 ? '' : 'gs-pod--alert')}">
          <span class="gs-pod__lbl">${icon('scale', { size: 12 })} Till Variance</span>
          <span class="gs-pod__val">${liveVar > 0 ? '+' : ''}${money(liveVar, { currency })}</span>
          <span class="gs-pod__sub">${liveVar === 0 ? 'Balanced to cent ✓' : liveVar > 0 ? 'Till over POS' : 'Till under POS'}</span>
        </div>
        <div class="gs-pod" style="display:flex;align-items:center;gap:12px;padding:9px 14px">
          <div class="tk-ring" style="--p:${checkPct}%;--ring-color:${checkColor};--ring-size:48px;--ring-track:rgba(255,255,255,.16)">
            <span class="tk-ring__val">${checkedList.length}/${CLEANING_CHECKS.length}</span>
          </div>
          <div style="display:grid;gap:2px">
            <span class="gs-pod__lbl">Closeout</span>
            <span style="font-size:13.5px;font-weight:800;color:#ffffff">${checkedList.length === CLEANING_CHECKS.length ? 'Ready to lock' : 'Cleaning open'}</span>
            <span class="gs-pod__sub">Checklist tasks</span>
          </div>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('clipboard', { size: 18 })} Close Out ${fmtDay(sum.day)}</h2>
          <span class="tk-tag tk-tag--accent">${sum.orderCount} POS orders</span>
        </div>
        <div class="tk-sheet__body tk-stack">
          <div class="gs-reconcile">
            <div>
              <div class="gs-reconcile__lbl">Counted Takings</div>
              <div class="gs-reconcile__val">${money(liveTakings, { currency })}</div>
            </div>
            <div>
              <div class="gs-reconcile__lbl">POS Orders Total</div>
              <div class="gs-reconcile__val">${money(sum.posCents, { currency })}</div>
            </div>
            <div>
              <div class="gs-reconcile__lbl">Till Variance</div>
              <div class="gs-reconcile__val ${liveVar === 0 ? 'tk-ok' : Math.abs(liveVar) > 1000 ? 'tk-danger' : ''}">${liveVar > 0 ? '+' : ''}${money(liveVar, { currency })}</div>
            </div>
          </div>

          <div style="display:grid;gap:7px">
            <div class="gs-channel-bar" aria-label="Payment channel split">
              <div class="gs-channel-bar__cash" style="width:${cashPct}%"></div>
              <div class="gs-channel-bar__eftpos" style="width:${eftposPct}%"></div>
              <div class="gs-channel-bar__delivery" style="width:${delivPct}%"></div>
            </div>
            <div class="gs-channel-legend">
              <span><strong style="color:#16a34a">●</strong> Cash ${cashPct}%</span>
              <span><strong style="color:#2563eb">●</strong> EFTPOS ${eftposPct}%</span>
              <span><strong style="color:#d97706">●</strong> Delivery ${delivPct}%</span>
            </div>
          </div>

          <form class="k-form" data-form="add-close" novalidate>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Close date</span>
                <input class="k-input" type="date" name="close_date" value="${sum.day}" required>
              </label>
              <label class="k-field"><span class="k-field__label">Signed off by</span>
                <input class="k-input" name="manager" value="${state.session.me.displayName || ''}" placeholder="Shift Manager">
              </label>
              <label class="k-field"><span class="k-field__label">Status</span>
                <select class="k-input" name="status">
                  <option value="Submitted">Submitted</option>
                  <option value="Draft">Draft</option>
                  <option value="Reviewed">Reviewed</option>
                </select>
              </label>
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Cash total</span>
                <input class="k-input" type="number" step="0.01" min="0" name="cash_total" data-close-calc="closeCash" value="${state.closeCash}">
              </label>
              <label class="k-field"><span class="k-field__label">EFTPOS total</span>
                <input class="k-input" type="number" step="0.01" min="0" name="eftpos_total" data-close-calc="closeEftpos" value="${state.closeEftpos}">
              </label>
              <label class="k-field"><span class="k-field__label">Delivery total</span>
                <input class="k-input" type="number" step="0.01" min="0" name="delivery_total" data-close-calc="closeDelivery" value="${state.closeDelivery}">
              </label>
            </div>
            <div class="k-field">
              <span class="k-field__label">Kitchen &amp; Closing Cleaning Checklist (${checkedList.length}/${CLEANING_CHECKS.length})</span>
              <div class="gs-check-grid">
                ${CLEANING_CHECKS.map((ck) => {
                  const isOn = checkedList.includes(ck);
                  return html`
                    <label class="${cls('gs-check-tile', { 'is-checked': isOn })}">
                      <input type="checkbox" name="cleaning_completed" value="${ck}" data-action="close-check-toggle" ${isOn ? 'checked' : ''}>
                      <span>${ck}</span>
                    </label>`;
                })}
              </div>
            </div>
            <label class="k-field"><span class="k-field__label">Waste notes <span class="k-field__optional">optional</span></span>
              <input class="k-input" name="waste_notes" placeholder="e.g. 2 burnt buns, 1 dropped fry basket">
            </label>
            <label class="k-field"><span class="k-field__label">Equipment / shift issues <span class="k-field__optional">optional</span></span>
              <textarea class="k-input" name="issues" rows="2" placeholder="Till discrepancies, equipment faults, complaints…"></textarea>
            </label>
            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary">${icon('check-circle', { size: 16 })} Submit Daily Close</button>
            </div>
          </form>
        </div>
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('file', { size: 18 })} Past Closeouts</h2><span class="tk-sheet__count">${state.closes.length}</span></div>
        <div>
          ${state.loading && !state.closes.length ? skeleton(3) : state.closes.length ? state.closes.map((cl) => {
            const totalTakings = Number(cl.cash_cents) + Number(cl.eftpos_cents) + Number(cl.delivery_cents);
            const diff = totalTakings - Number(cl.pos_cents);
            return html`
              <div class="tk-row" data-key="cl-${cl.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${fmtDay(cl.close_date)}</span>
                    <strong>${money(totalTakings, { currency })}</strong>
                    <span class="tk-tag ${cl.status === 'Reviewed' ? 'tk-tag--ok' : cl.status === 'Submitted' ? 'tk-tag--info' : 'tk-tag--warn'}">${cl.status}</span>
                    ${diff !== 0 ? html`<span class="tk-tag ${Math.abs(diff) > 1000 ? 'tk-tag--bad' : 'tk-tag--warn'}">Var ${diff > 0 ? '+' : ''}${money(diff, { currency })}</span>` : html`<span class="tk-tag tk-tag--ok">Balanced</span>`}
                    ${cl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Cash: ${money(cl.cash_cents, { currency })}</span>
                    <span>EFTPOS: ${money(cl.eftpos_cents, { currency })}</span>
                    <span>Delivery: ${money(cl.delivery_cents, { currency })}</span>
                    <span>Clean: ${(cl.cleaning_completed || []).length}/${CLEANING_CHECKS.length}</span>
                  </div>
                  ${cl.issues ? html`<div class="tk-muted" style="font-size:12.5px;margin-top:2px">Handover: ${cl.issues}</div>` : ''}
                </div>
                <div class="tk-row__aside">
                  ${cl.status !== 'Reviewed' ? html`<button type="button" class="k-btn k-btn--sm" data-action="close-review" data-id="${cl.id}">Mark Reviewed</button>` : ''}
                  <button type="button" class="k-btn k-btn--sm" data-action="print-close" data-id="${cl.id}">${icon('printer', { size: 14 })} Sheet</button>
                </div>
              </div>`;
          }) : emptyState({ iconName: 'clipboard', title: 'No daily closes recorded yet', text: 'Reconcile cash, EFTPOS and delivery takings on the left.' })}
        </div>
      </section>
    </div>`;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="stock-filter"]', (e, el) => { state.stockFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="stock-search"]', (e, el) => { state.stockSearch = el.value; draw(); });

  on(root, 'click', '[data-action="stock-adj"]', async (e, el) => {
    try { await api.post('/api/stock/adjust', { id: Number(el.dataset.id), delta: Number(el.dataset.delta) }); await loadScreen('/stock'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="stock-par"]', async (e, el) => {
    try { await api.post('/api/stock/adjust', { id: Number(el.dataset.id), restockToPar: true }); toast.success('Restocked to par level.'); await loadScreen('/stock'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-reorder"]', () => {
    const low = state.stock.filter((s) => s.status !== 'OK');
    const lines = low.map((s) => `- ${s.ingredient} (${s.category}): have ${s.current_count} ${s.unit}, need ${Math.max(0, Math.round((s.par_level - s.current_count) * 10) / 10)} ${s.unit} to reach par ${s.par_level}`);
    copyText(`GrillStack Prep & Stock Reorder (${today()})\n${lines.join('\n')}`, { title: 'Reorder list' });
  });

  const stockFields = (s = {}) => html`
    <label class="k-field"><span class="k-field__label">Ingredient</span><input class="k-input" name="ingredient" value="${s.ingredient || ''}" placeholder="e.g. Brioche buns" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${STOCK_CATS.map((c) => html`<option value="${c}" ${c === s.category ? 'selected' : ''}>${c}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${STOCK_UNITS.map((u) => html`<option value="${u}" ${u === s.unit ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Opening count</span><input class="k-input" type="number" step="0.5" min="0" name="opening_count" value="${s.opening_count ?? 48}" required></label>
      <label class="k-field"><span class="k-field__label">Current count</span><input class="k-input" type="number" step="0.5" min="0" name="current_count" value="${s.current_count ?? 48}" required></label>
      <label class="k-field"><span class="k-field__label">Par level</span><input class="k-input" type="number" step="0.5" min="0.5" name="par_level" value="${s.par_level ?? 36}" required></label>
    </div>`;

  on(root, 'click', '[data-action="stock-new"]', async () => {
    const made = await formDialog({ title: 'Add Prep & Stock Line', submitLabel: 'Save', fields: stockFields(), onSubmit: (v) => api.post('/api/stock', v) });
    if (made) { toast.success('Prep stock item added.'); await loadScreen('/stock'); }
  });

  on(root, 'click', '[data-action="stock-edit"]', async (e, el) => {
    const item = state.stock.find((x) => String(x.id) === el.dataset.id);
    if (!item) return;
    const saved = await formDialog({ title: `Edit ${item.ingredient}`, submitLabel: 'Save', fields: stockFields(item), onSubmit: (v) => api.put('/api/stock', { ...v, id: item.id }) });
    if (saved) { toast.success('Prep stock updated.'); await loadScreen('/stock'); }
  });

  const shiftFields = (sh = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Staff member</span><input class="k-input" name="staff_member" value="${sh.staff_member || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Role</span><select class="k-input" name="role">${SHIFT_ROLES.map((r) => html`<option value="${r}" ${r === sh.role ? 'selected' : ''}>${r}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Shift date</span><input class="k-input" type="date" name="shift_date" value="${sh.shift_date || today()}" required></label>
      <label class="k-field"><span class="k-field__label">Start</span><input class="k-input" type="time" name="start_time" value="${sh.start_time || '11:00'}" required></label>
      <label class="k-field"><span class="k-field__label">End</span><input class="k-input" type="time" name="end_time" value="${sh.end_time || '19:30'}" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Break taken</span>
      <select class="k-input" name="break_taken">
        <option value="Not yet" ${sh.break_taken !== 'Yes' ? 'selected' : ''}>Not yet</option>
        <option value="Yes" ${sh.break_taken === 'Yes' ? 'selected' : ''}>Yes</option>
      </select>
    </label>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${sh.notes || ''}" placeholder="Cover, training, fryer lead…"></label>`;

  on(root, 'click', '[data-action="shift-new"]', async () => {
    const made = await formDialog({ title: 'Add Crew Shift', submitLabel: 'Save shift', fields: shiftFields(), onSubmit: (v) => api.post('/api/shifts', v) });
    if (made) { toast.success('Shift added.'); await loadScreen('/shifts'); }
  });

  on(root, 'click', '[data-action="shift-edit"]', async (e, el) => {
    const sh = state.shifts.find((x) => String(x.id) === el.dataset.id);
    if (!sh) return;
    const saved = await formDialog({ title: 'Edit Shift', submitLabel: 'Save shift', fields: shiftFields(sh), onSubmit: (v) => api.put('/api/shifts', { ...v, id: sh.id }) });
    if (saved) { toast.success('Shift updated.'); await loadScreen('/shifts'); }
  });

  on(root, 'click', '[data-action="shift-break"]', async (e, el) => {
    try { await api.post('/api/shifts/break', { id: Number(el.dataset.id) }); await loadScreen('/shifts'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="shift-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove shift?', message: 'Delete this rostered shift?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/shifts', { id: Number(el.dataset.id) }); toast.success('Shift removed.'); await loadScreen('/shifts'); }
    catch (err) { toastError(err); }
  });

  on(root, 'input', '[data-close-calc]', (e, el) => { state[el.dataset.closeCalc] = el.value; draw(); });

  on(root, 'change', '[data-action="close-check-toggle"]', (e, el) => {
    const val = el.value;
    if (!Array.isArray(state.closeChecks)) state.closeChecks = [];
    if (el.checked && !state.closeChecks.includes(val)) state.closeChecks.push(val);
    else if (!el.checked) state.closeChecks = state.closeChecks.filter((c) => c !== val);
    draw();
  });

  on(root, 'submit', 'form[data-form="add-close"]', async (e, form) => {
    e.preventDefault();
    try {
      const vals = readForm(form);
      await api.post('/api/closes', { ...vals, cleaning_completed: Array.isArray(vals.cleaning_completed) ? vals.cleaning_completed : [] });
      state.closeChecks = [];
      toast.success('Daily close submitted.');
      await loadScreen('/close');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="close-review"]', async (e, el) => {
    try { await api.post('/api/closes/status', { id: Number(el.dataset.id), status: 'Reviewed' }); toast.success('Close marked Reviewed.'); await loadScreen('/close'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-close"]', (e, el) => {
    const cl = state.closes.find((x) => String(x.id) === el.dataset.id);
    if (!cl) return;
    const cur = state.session.settings.currency || 'AUD';
    const totalTakings = Number(cl.cash_cents) + Number(cl.eftpos_cents) + Number(cl.delivery_cents);
    const diff = totalTakings - Number(cl.pos_cents);
    downloadHtmlDoc(`grillstack-close-${cl.close_date}.html`, {
      title: `Nightly Till Reconciliation · ${cl.close_date}`,
      businessName: state.session.settings.business_name,
      subtitle: `Signed off by ${cl.manager || 'Manager'} · Status: ${cl.status}`,
      accent: '#c8231a',
      bodyHtml: `<table>
        <tr><th>Cash Total</th><td class="num">${money(cl.cash_cents, { currency: cur })}</td></tr>
        <tr><th>EFTPOS Total</th><td class="num">${money(cl.eftpos_cents, { currency: cur })}</td></tr>
        <tr><th>Delivery Platforms Total</th><td class="num">${money(cl.delivery_cents, { currency: cur })}</td></tr>
        <tr class="total-row"><td>Counted Takings Total</td><td class="num">${money(totalTakings, { currency: cur })}</td></tr>
        <tr><th>POS Orders Total</th><td class="num">${money(cl.pos_cents, { currency: cur })}</td></tr>
        <tr><th>Till Variance</th><td class="num">${diff > 0 ? '+' : ''}${money(diff, { currency: cur })}</td></tr>
      </table>
      <div class="box"><strong>Cleaning Checklist (${(cl.cleaning_completed || []).length}/${CLEANING_CHECKS.length}):</strong> ${(cl.cleaning_completed || []).join(', ') || 'None ticked'}</div>
      ${cl.waste_notes ? `<div class="box"><strong>Waste Notes:</strong> ${cl.waste_notes}</div>` : ''}
      ${cl.issues ? `<div class="box"><strong>Shift Issues &amp; Handover:</strong> ${cl.issues}</div>` : ''}`,
    });
  });
}
