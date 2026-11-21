// Pantry & Par Tank Levels, Visual 06:00-18:00 Shift Timeline Roster, and Tactile Daily Closeout views.
import { html, on, cls, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDate } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const STOCK_CATS = ['Beans', 'Milk', 'Syrup', 'Cups', 'Food prep', 'Packaging'];
const STOCK_UNITS = ['kg', 'Litres', 'Units', 'Boxes'];
const SHIFT_ROLES = ['Barista', 'Kitchen', 'Front counter', 'Manager'];
const SHIFT_STATIONS = ['Espresso', 'Kitchen', 'Cold bar', 'Floor'];
const CLEANING_CHECKS = [
  'Espresso machine backflushed',
  'Grinder cleaned',
  'Fridges wiped',
  'Floors mopped',
  'Bins out',
  'Milk fridge dated',
];

function minsOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function hoursNum(start, end) {
  const mins = minsOf(end) - minsOf(start);
  return mins > 0 ? mins / 60 : 0;
}

function hoursBetween(start, end) {
  const h = hoursNum(start, end);
  return h > 0 ? h.toFixed(1) + ' h' : '';
}

function shiftStationCls(station) {
  if (station === 'Espresso') return 'bd-shift-bar--espresso';
  if (station === 'Cold bar') return 'bd-shift-bar--cold';
  if (station === 'Kitchen') return 'bd-shift-bar--kitchen';
  return 'bd-shift-bar--floor';
}

export function renderStockView(state) {
  const lowItems = state.stock.filter((s) => s.status !== 'OK');
  const okCount = state.stock.length - lowItems.length;
  const healthPct = state.stock.length ? Math.round((okCount / state.stock.length) * 100) : 100;

  const q = (state.stockSearch || '').trim().toLowerCase();
  const rows = state.stock.filter((s) => {
    if (state.stockFilter === 'Low' && s.status === 'OK') return false;
    if (state.stockFilter !== 'All' && state.stockFilter !== 'Low' && s.category !== state.stockFilter) return false;
    if (!q) return true;
    return s.item_name.toLowerCase().includes(q) || String(s.supplier || '').toLowerCase().includes(q);
  });

  // Group low items by supplier for 1-click text/email copy
  const lowBySupplier = new Map();
  for (const it of lowItems) {
    const sup = it.supplier || 'General Supplier';
    if (!lowBySupplier.has(sup)) lowBySupplier.set(sup, []);
    lowBySupplier.get(sup).push(it);
  }
  const supplierEntries = [...lowBySupplier.entries()];

  return html`
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow">Beans, Milk &amp; Pantry Control</span>
        <h1 class="bd-masthead__title">Stock &amp; Par Levels</h1>
        <div class="bd-masthead__meta">
          <span><strong>${okCount}/${state.stock.length}</strong> lines at par · Tap steppers during service or copy supplier orders in one click.</span>
        </div>
      </div>
      <div class="tk-hero__actions">
        <div class="tk-ring" style="--p:${healthPct}%;--ring-color:${healthPct >= 80 ? '#4ade80' : healthPct >= 50 ? '#f59e0b' : '#f87171'};--ring-size:54px" title="Pantry Par Health">
          <span class="tk-ring__val">${healthPct}%</span>
        </div>
        ${lowItems.length ? html`<button type="button" class="k-btn k-btn--glass" data-action="copy-reorder">${icon('copy', { size: 15 })} Copy All Low (${lowItems.length})</button>` : ''}
        <button type="button" class="k-btn k-btn--primary" data-action="stock-new">${icon('plus', { size: 16 })} Add Stock Item</button>
      </div>
    </section>

    ${supplierEntries.length ? html`
      <div class="bd-supplier-bar">
        <span style="font-size:12px;font-weight:750;color:#92400e;display:inline-flex;align-items:center;gap:6px">${icon('truck', { size: 15 })} Quick Supplier Reorders:</span>
        ${supplierEntries.map(([sup, items]) => html`
          <button type="button" class="k-btn k-btn--sm" data-action="copy-supplier-reorder" data-supplier="${sup}">
            ${icon('copy', { size: 13 })} ${sup} (${items.length})
          </button>`)}
      </div>` : ''}

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}<input type="search" data-action="stock-search" value="${state.stockSearch || ''}" placeholder="Search beans, milk, supplier…"></label>
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === 'All' })}" data-action="stock-filter" data-filter="All">All (${state.stock.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === 'Low' })}" data-action="stock-filter" data-filter="Low">Low / Out (${lowItems.length})</button>
        ${['Beans', 'Milk', 'Cups', 'Food prep'].map((c) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.stockFilter === c })}" data-action="stock-filter" data-filter="${c}">${c}</button>`)}
      </div>
    </div>

    ${state.loading && !state.stock.length ? skeleton(4) : rows.length ? html`
      <div class="bd-stock-grid">
        ${rows.map((st) => {
          const par = Math.max(0.1, Number(st.par_level));
          const curQty = Number(st.current_qty);
          const pctOfScale = Math.min(100, Math.round((curQty / (par * 1.25)) * 100));
          const need = Math.max(0, Math.round((par - curQty) * 10) / 10);
          const barColor = st.status === 'Out' ? '#dc2626' : st.status === 'Low' ? '#d97706' : '#16a34a';
          const tagTone = st.status === 'Out' ? 'tk-tag--bad' : st.status === 'Low' ? 'tk-tag--warn' : 'tk-tag--ok';
          return html`
            <article class="${cls('bd-stock-card', { 'bd-stock-card--out': st.status === 'Out', 'bd-stock-card--low': st.status === 'Low' })}" data-key="st-${st.id}">
              <div class="tk-card__head">
                <div>
                  <div class="tk-card__title">${st.item_name} ${st.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</div>
                  <div class="tk-card__sub">${st.category}${st.supplier ? ' · ' + st.supplier : ''}</div>
                </div>
                <span class="tk-tag ${tagTone}">${st.status}</span>
              </div>
              <div style="display:grid;gap:6px">
                <div style="display:flex;justify-content:space-between;align-items:baseline;font-variant-numeric:tabular-nums">
                  <span style="font-size:21px;font-weight:800">${num(curQty, { decimals: 1 })} <span style="font-size:13px;font-weight:600;color:var(--k-muted)">${st.unit}</span></span>
                  <span style="font-size:12px;color:var(--k-muted)">Par: <strong>${num(par, { decimals: 1 })} ${st.unit}</strong>${need > 0 ? html` · <strong style="color:${barColor}">Need ${need}</strong>` : ''}</span>
                </div>
                <div class="bd-par-track" title="Notch marks Par Level (${par} ${st.unit})">
                  <div class="bd-par-fill" style="width:${pctOfScale}%;background:${barColor}"></div>
                  <span class="bd-par-notch" style="left:80%"></span>
                </div>
              </div>
              <div class="tk-ticket__foot">
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="stock-adj" data-id="${st.id}" data-delta="-1">-1</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="stock-adj" data-id="${st.id}" data-delta="1">+1</button>
                  ${st.status !== 'OK' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="stock-par" data-id="${st.id}">Restock to Par</button>` : ''}
                </div>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="stock-edit" data-id="${st.id}">Edit</button>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'box', title: 'No stock items matching filter', text: 'Add beans, milks, syrups and cups with par levels to monitor reorder alerts.' })}</section>`}`;
}

export function renderRosterView(state) {
  const byDay = new Map();
  for (const sh of state.shifts) {
    if (!byDay.has(sh.shift_date)) byDay.set(sh.shift_date, []);
    byDay.get(sh.shift_date).push(sh);
  }
  const days = [...byDay.keys()].sort().reverse();
  const todayShifts = byDay.get(today()) || [];
  const totalTodayHrs = todayShifts.reduce((s, sh) => s + hoursNum(sh.start_time, sh.end_time), 0);
  const coveredStations = [...new Set(todayShifts.map((sh) => sh.station))];

  const START_MIN = 6 * 60;
  const SPAN_MIN = 12 * 60; // 06:00 -> 18:00

  return html`
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow">Crew Coverage &amp; Stations</span>
        <h1 class="bd-masthead__title">Shift Roster</h1>
        <div class="bd-masthead__meta">
          <span>Visual 6am–6pm coverage timeline across Espresso, Cold bar, Kitchen and Floor.</span>
        </div>
      </div>
      <div class="bd-masthead__pods">
        <div class="bd-pod bd-pod--crema">
          <span class="bd-pod__lbl">Today's Crew</span>
          <span class="bd-pod__val">${todayShifts.length}</span>
          <span class="bd-pod__sub">${totalTodayHrs.toFixed(1)} hrs scheduled</span>
        </div>
        <div class="bd-pod">
          <span class="bd-pod__lbl">Stations Covered</span>
          <span class="bd-pod__val">${coveredStations.length} / 4</span>
          <span class="bd-pod__sub">${coveredStations.join(', ') || 'None yet'}</span>
        </div>
      </div>
      <div class="tk-hero__actions">
        <button type="button" class="k-btn k-btn--primary" data-action="shift-new">${icon('plus', { size: 16 })} Add Shift</button>
      </div>
    </section>

    <div class="tk-stack">
      ${state.loading && !state.shifts.length ? skeleton(3) : days.length ? days.map((d) => {
        const list = byDay.get(d);
        const dayHrs = list.reduce((s, sh) => s + hoursNum(sh.start_time, sh.end_time), 0);
        return html`
          <section class="tk-sheet" data-key="day-${d}">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('calendar', { size: 17 })} ${fmtDate(d, { weekday: 'short' })} ${d === today() ? html`<span class="tk-tag tk-tag--accent">Today</span>` : ''}</h2>
              <span class="tk-sheet__count">${list.length} shift${list.length === 1 ? '' : 's'} · ${dayHrs.toFixed(1)} h</span>
            </div>
            <div class="bd-timeline-ruler">
              <span>Staff &amp; Role</span>
              <div class="bd-ruler-hours"><span>6am</span><span>8am</span><span>10am</span><span>12pm</span><span>2pm</span><span>4pm</span></div>
              <span style="text-align:right">Actions</span>
            </div>
            <div>
              ${list.map((sh) => {
                const sMin = Math.max(START_MIN, Math.min(START_MIN + SPAN_MIN - 30, minsOf(sh.start_time)));
                const eMin = Math.max(sMin + 30, Math.min(START_MIN + SPAN_MIN, minsOf(sh.end_time)));
                const leftPct = ((sMin - START_MIN) / SPAN_MIN) * 100;
                const widthPct = Math.max(12, ((eMin - sMin) / SPAN_MIN) * 100);
                return html`
                  <div class="bd-shift-row" data-key="sh-${sh.id}">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0">
                      <span class="tk-avatar" style="width:30px;height:30px;font-size:11px">${initials(sh.staff_name)}</span>
                      <div style="min-width:0">
                        <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sh.staff_name}</div>
                        <div class="tk-muted" style="font-size:11.5px">${sh.role} ${sh.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</div>
                      </div>
                    </div>
                    <div>
                      <div class="bd-shift-track">
                        <div class="bd-shift-bar ${shiftStationCls(sh.station)}" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%" title="${sh.station}: ${sh.start_time}–${sh.end_time}${sh.notes ? ' · ' + sh.notes : ''}">
                          <span>${sh.station} · ${sh.start_time}–${sh.end_time}</span>
                          <span style="opacity:.85">${hoursBetween(sh.start_time, sh.end_time)}</span>
                        </div>
                      </div>
                      ${sh.notes ? html`<div class="tk-muted" style="font-size:11.5px;margin-top:4px">${sh.notes}</div>` : ''}
                    </div>
                    <div class="tk-btn-row" style="justify-content:flex-end">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="shift-edit" data-id="${sh.id}">Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="shift-del" data-id="${sh.id}">Del</button>
                    </div>
                  </div>`;
              })}
            </div>
          </section>`;
      }) : html`<section class="tk-sheet">${emptyState({ iconName: 'calendar', title: 'No shifts rostered yet', text: 'Schedule your baristas and kitchen crew for the week ahead.' })}</section>`}
    </div>`;
}

export function renderCloseView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const sum = state.todayCloseSummary || { day: today(), posCents: 0, orderCount: 0 };
  const draftRegVal = state.closeDraftRegister != null ? state.closeDraftRegister : (sum.posCents / 100).toFixed(2);
  const regCents = Math.round((Number(draftRegVal) || 0) * 100);
  const previewDiff = regCents - Number(sum.posCents || 0);
  const checkedList = state.closeChecks || [];
  const checkPct = Math.round((checkedList.length / CLEANING_CHECKS.length) * 100);

  return html`
    <section class="bd-masthead">
      <div class="bd-masthead__copy">
        <span class="bd-masthead__eyebrow">End-of-Day Closing Ritual · ${fmtDate(sum.day)}</span>
        <h1 class="bd-masthead__title">Daily Close</h1>
        <div class="bd-masthead__meta">
          <span>Reconcile Cash &amp; EFTPOS against today's POS orders, tick off espresso machine cleaning, and hand over to tomorrow's opener.</span>
        </div>
      </div>
      <div class="bd-masthead__pods">
        <div class="bd-pod bd-pod--crema">
          <span class="bd-pod__lbl">Today's POS</span>
          <span class="bd-pod__val">${money(sum.posCents, { currency })}</span>
          <span class="bd-pod__sub">${sum.orderCount} order${sum.orderCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="tk-hero__actions">
        <div class="tk-ring" style="--p:${checkPct}%;--ring-color:${checkPct === 100 ? '#4ade80' : '#f59e0b'};--ring-size:54px" title="Closing checklist progress">
          <span class="tk-ring__val">${checkedList.length}/${CLEANING_CHECKS.length}</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('clipboard', { size: 17 })} Ring Off Today (${fmtDate(sum.day)})</h2>
          <span class="tk-tag tk-tag--accent">POS: ${money(sum.posCents, { currency })}</span>
        </div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="add-close" novalidate>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Cash drawer <span class="k-field__optional">helper</span></span>
                <input class="k-input" type="number" step="0.01" min="0" data-action="close-split" data-part="closeCash" value="${state.closeCash || ''}" placeholder="0.00">
              </label>
              <label class="k-field"><span class="k-field__label">EFTPOS terminal <span class="k-field__optional">helper</span></span>
                <input class="k-input" type="number" step="0.01" min="0" data-action="close-split" data-part="closeEftpos" value="${state.closeEftpos || ''}" placeholder="0.00">
              </label>
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Close date</span>
                <input class="k-input" type="date" name="close_date" value="${sum.day}" required>
              </label>
              <label class="k-field"><span class="k-field__label">Register total</span>
                <input class="k-input" type="number" step="0.01" min="0" name="register_total" data-action="close-reg-input" value="${draftRegVal}" required>
              </label>
              <label class="k-field"><span class="k-field__label">Tips jar</span>
                <input class="k-input" type="number" step="0.01" min="0" name="tips" value="0.00">
              </label>
            </div>
            <div class="close-preview">
              <span>Live Till Check vs POS (${money(sum.posCents, { currency })})</span>
              ${previewDiff === 0
                ? html`<span class="tk-tag tk-tag--ok">Balanced (${money(0, { currency })})</span>`
                : html`<span class="tk-tag ${Math.abs(previewDiff) > 1000 ? 'tk-tag--bad' : 'tk-tag--warn'}">Variance ${previewDiff > 0 ? '+' : ''}${money(previewDiff, { currency })}</span>`}
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Beans used (kg)</span>
                <input class="k-input" type="number" step="0.1" min="0" name="beans_used" placeholder="e.g. 4.5">
              </label>
              <label class="k-field"><span class="k-field__label">Milk used (Litres)</span>
                <input class="k-input" type="number" step="1" min="0" name="milk_used" placeholder="e.g. 38">
              </label>
            </div>
            <div class="k-field">
              <span class="k-field__label">Closing &amp; Cleaning Checklist (${checkedList.length}/${CLEANING_CHECKS.length})</span>
              <div class="bd-check-grid">
                ${CLEANING_CHECKS.map((ck) => {
                  const isOn = checkedList.includes(ck);
                  return html`
                    <label class="${cls('bd-check-tile', { 'is-checked': isOn })}">
                      <input type="checkbox" name="cleaning" value="${ck}" data-action="close-check-toggle" ${isOn ? 'checked' : ''}>
                      <span>${ck}</span>
                    </label>`;
                })}
              </div>
            </div>
            <label class="k-field"><span class="k-field__label">Waste notes <span class="k-field__optional">optional</span></span>
              <input class="k-input" name="waste" placeholder="e.g. 2 pastries, 0.5L oat milk">
            </label>
            <label class="k-field"><span class="k-field__label">Manager handover notes <span class="k-field__optional">optional</span></span>
              <textarea class="k-input" name="manager_notes" rows="2" placeholder="Notes for tomorrow's opening barista…"></textarea>
            </label>
            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary">Submit Daily Close</button>
            </div>
          </form>
        </div>
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('file', { size: 17 })} Past Closeouts</h2><span class="tk-sheet__count">${state.closes.length}</span></div>
        <div>
          ${state.closes.length ? state.closes.map((cl) => {
            const diff = Number(cl.register_cents) - Number(cl.pos_cents);
            const ckCount = (cl.cleaning || []).length;
            return html`
              <div class="tk-row" data-key="cl-${cl.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${fmtDate(cl.close_date, { weekday: 'short' })}</span>
                    <strong>${money(cl.register_cents, { currency })}</strong>
                    ${diff !== 0 ? html`<span class="tk-tag ${Math.abs(diff) > 1000 ? 'tk-tag--warn' : 'tk-tag--info'}">Var ${diff > 0 ? '+' : ''}${money(diff, { currency })}</span>` : html`<span class="tk-tag tk-tag--ok">Balanced</span>`}
                    ${cl.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Tips: ${money(cl.tips_cents, { currency })}</span>
                    <span>Beans: ${cl.beans_used} kg</span>
                    <span>Milk: ${cl.milk_used} L</span>
                    <span>Checklist: ${ckCount}/${CLEANING_CHECKS.length}</span>
                  </div>
                  ${cl.manager_notes ? html`<div class="tk-muted" style="font-size:13px">${cl.manager_notes}</div>` : ''}
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--sm" data-action="print-close" data-id="${cl.id}">${icon('printer', { size: 14 })} Sheet</button>
                </div>
              </div>`;
          }) : emptyState({ iconName: 'clipboard', title: 'No closeouts recorded yet', text: 'Submit your first end-of-day closeout on the left.' })}
        </div>
      </section>
    </div>`;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="stock-filter"]', (e, el) => { state.stockFilter = el.dataset.filter; draw(); });
  on(root, 'input', '[data-action="stock-search"]', (e, el) => { state.stockSearch = el.value; draw(); });
  on(root, 'input', '[data-action="close-reg-input"]', (e, el) => { state.closeDraftRegister = el.value; draw(); });
  on(root, 'input', '[data-action="close-split"]', (e, el) => {
    state[el.dataset.part] = el.value;
    const sum = (Number(state.closeCash) || 0) + (Number(state.closeEftpos) || 0);
    if (sum > 0) state.closeDraftRegister = sum.toFixed(2);
    draw();
  });
  on(root, 'change', '[data-action="close-check-toggle"]', (e, el) => {
    const val = el.value;
    if (!Array.isArray(state.closeChecks)) state.closeChecks = [];
    if (el.checked) { if (!state.closeChecks.includes(val)) state.closeChecks.push(val); }
    else state.closeChecks = state.closeChecks.filter((c) => c !== val);
    draw();
  });

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
    const lines = low.map((s) => `- ${s.item_name}: have ${s.current_qty} ${s.unit}, order ${Math.max(0, Math.round((s.par_level - s.current_qty) * 10) / 10)} ${s.unit}${s.supplier ? ' (' + s.supplier + ')' : ''}`);
    copyText(`${state.session.settings.business_name} Stock Reorder (${fmtDate(today())})\n${lines.join('\n')}`, { title: 'Reorder list' });
  });

  on(root, 'click', '[data-action="copy-supplier-reorder"]', (e, el) => {
    const sup = el.dataset.supplier;
    const items = state.stock.filter((s) => s.status !== 'OK' && (s.supplier || 'General Supplier') === sup);
    const lines = items.map((s) => `- ${s.item_name}: ${Math.max(0, Math.round((s.par_level - s.current_qty) * 10) / 10)} ${s.unit} (currently ${s.current_qty} / par ${s.par_level})`);
    copyText(`Hi ${sup},\nCould we please order for ${state.session.settings.business_name} (${fmtDate(today())}):\n${lines.join('\n')}\nThanks!`, { title: `Order for ${sup}` });
  });

  const stockFields = (s = {}) => html`
    <label class="k-field"><span class="k-field__label">Stock item</span><input class="k-input" name="item_name" value="${s.item_name || ''}" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Category</span><select class="k-input" name="category">${STOCK_CATS.map((c) => html`<option value="${c}" ${c === s.category ? 'selected' : ''}>${c}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${STOCK_UNITS.map((u) => html`<option value="${u}" ${u === s.unit ? 'selected' : ''}>${u}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Current qty</span><input class="k-input" type="number" step="0.5" min="0" name="current_qty" value="${s.current_qty ?? 0}" required></label>
      <label class="k-field"><span class="k-field__label">Par level</span><input class="k-input" type="number" step="0.5" min="0.5" name="par_level" value="${s.par_level ?? 5}" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" value="${s.supplier || ''}"></label>`;

  on(root, 'click', '[data-action="stock-new"]', async () => {
    const made = await formDialog({ title: 'Add Stock Item', submitLabel: 'Save', fields: stockFields(), onSubmit: (v) => api.post('/api/stock', v) });
    if (made) { toast.success('Stock item added.'); await loadScreen('/stock'); }
  });

  on(root, 'click', '[data-action="stock-edit"]', async (e, el) => {
    const item = state.stock.find((x) => String(x.id) === el.dataset.id);
    if (!item) return;
    const saved = await formDialog({ title: `Edit ${item.item_name}`, submitLabel: 'Save', fields: stockFields(item), onSubmit: (v) => api.put('/api/stock', { ...v, id: item.id }) });
    if (saved) { toast.success('Stock item updated.'); await loadScreen('/stock'); }
  });

  const shiftFields = (sh = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Staff member</span><input class="k-input" name="staff_name" value="${sh.staff_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Role</span><select class="k-input" name="role">${SHIFT_ROLES.map((r) => html`<option value="${r}" ${r === sh.role ? 'selected' : ''}>${r}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="shift_date" value="${sh.shift_date || today()}" required></label>
      <label class="k-field"><span class="k-field__label">Start</span><input class="k-input" type="time" name="start_time" value="${sh.start_time || '07:00'}" required></label>
      <label class="k-field"><span class="k-field__label">End</span><input class="k-input" type="time" name="end_time" value="${sh.end_time || '14:30'}" required></label>
    </div>
    <label class="k-field"><span class="k-field__label">Station</span><select class="k-input" name="station">${SHIFT_STATIONS.map((s) => html`<option value="${s}" ${s === sh.station ? 'selected' : ''}>${s}</option>`)}</select></label>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${sh.notes || ''}"></label>`;

  on(root, 'click', '[data-action="shift-new"]', async () => {
    const made = await formDialog({ title: 'Add Shift', submitLabel: 'Save shift', fields: shiftFields(), onSubmit: (v) => api.post('/api/shifts', v) });
    if (made) { toast.success('Shift added to roster.'); await loadScreen('/roster'); }
  });

  on(root, 'click', '[data-action="shift-edit"]', async (e, el) => {
    const sh = state.shifts.find((x) => String(x.id) === el.dataset.id);
    if (!sh) return;
    const saved = await formDialog({ title: 'Edit Shift', submitLabel: 'Save shift', fields: shiftFields(sh), onSubmit: (v) => api.put('/api/shifts', { ...v, id: sh.id }) });
    if (saved) { toast.success('Shift updated.'); await loadScreen('/roster'); }
  });

  on(root, 'click', '[data-action="shift-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove shift?', message: 'Delete this rostered shift?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/shifts', { id: Number(el.dataset.id) }); toast.success('Shift removed.'); await loadScreen('/roster'); }
    catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="add-close"]', async (e, form) => {
    e.preventDefault();
    try {
      const vals = readForm(form);
      await api.post('/api/closes', { ...vals, cleaning: Array.isArray(vals.cleaning) ? vals.cleaning : [] });
      state.closeChecks = [];
      state.closeCash = '';
      state.closeEftpos = '';
      state.closeDraftRegister = null;
      toast.success('Daily closeout recorded.');
      await loadScreen('/close');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-close"]', (e, el) => {
    const cl = state.closes.find((x) => String(x.id) === el.dataset.id);
    if (!cl) return;
    const cur = state.session.settings.currency || 'AUD';
    const diff = Number(cl.register_cents) - Number(cl.pos_cents);
    downloadHtmlDoc(`closeout-${cl.close_date}.html`, {
      title: `Daily Closeout · ${fmtDate(cl.close_date)}`,
      businessName: state.session.settings.business_name,
      subtitle: `Closed by ${cl.closed_by || 'Manager'}`,
      accent: '#8c3413',
      bodyHtml: `<table>
        <tr><th>Register Total</th><td class="num">${money(cl.register_cents, { currency: cur })}</td></tr>
        <tr><th>POS Orders Total</th><td class="num">${money(cl.pos_cents, { currency: cur })}</td></tr>
        <tr><th>Variance</th><td class="num">${money(diff, { currency: cur })}</td></tr>
        <tr><th>Tips</th><td class="num">${money(cl.tips_cents, { currency: cur })}</td></tr>
        <tr><th>Beans Used</th><td class="num">${cl.beans_used} kg</td></tr>
        <tr><th>Milk Used</th><td class="num">${cl.milk_used} L</td></tr>
      </table>
      <div class="box"><strong>Checklist (${(cl.cleaning || []).length}/${CLEANING_CHECKS.length}):</strong> ${(cl.cleaning || []).join(', ') || 'None ticked'}</div>
      ${cl.waste ? `<div class="box"><strong>Waste:</strong> ${cl.waste}</div>` : ''}
      ${cl.manager_notes ? `<div class="box"><strong>Handover Notes:</strong> ${cl.manager_notes}</div>` : ''}`,
    });
  });
}
