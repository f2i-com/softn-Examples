// Harvest Log (WHP-Guarded Yield Masthead), Chemical Application Register & Machinery Shed Maintenance views.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num } from '../../kit/format.js';
import { today, fmtDate, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const HARVEST_UNITS = ['Tonnes', 'kg', 'Bins', 'Bales'];
const HARVEST_GRADES = ['Premium', 'Grade 1', 'Grade 2', 'Juice or feed'];
const MACHINE_TYPES = ['Tractor', 'Harvester', 'Sprayer', 'Ute', 'Implement', 'Pump'];
const MACHINE_STATUSES = ['Running', 'Due for service', 'In workshop', 'Retired'];
const MAINT_TYPES = ['Scheduled service', 'Repair', 'Tyres or tracks', 'Electrical', 'Hydraulics'];

function serviceCountdown(serviceDue, status) {
  if (status === 'Retired' || !serviceDue) return null;
  const diff = daysBetween(today(), serviceDue);
  if (diff < 0) return { label: `Overdue ${Math.abs(diff)}d`, tone: 'tk-tag--bad' };
  if (diff === 0) return { label: 'Due today', tone: 'tk-tag--bad' };
  if (diff <= 14) return { label: `Due in ${diff}d`, tone: 'tk-tag--warn' };
  return { label: `In ${diff}d`, tone: 'tk-tag--ok' };
}

export function renderHarvestsView(state) {
  const c = state.session.counts || {};
  const totalsByUnit = new Map();
  for (const h of state.harvests) {
    const u = h.unit || 'Tonnes';
    totalsByUnit.set(u, (totalsByUnit.get(u) || 0) + (Number(h.quantity) || 0));
  }
  const unitTotals = [...totalsByUnit.entries()];

  return html`
    <section class="ag-masthead" aria-label="Harvest Yield & Dispatch">
      <div class="ag-masthead__copy">
        <div class="ag-masthead__eyebrow">
          ${icon('wheat-sheaf', { size: 12 })} YIELD &amp; DISPATCH LOGBOOK
        </div>
        <h1 class="ag-masthead__title">Harvest Log</h1>
        <div class="ag-masthead__meta">
          <span>Active chemical WHP locks automatically guard every paddock harvest</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Track yield, grade &amp; buyer dispatch</span>
        </div>
      </div>

      <div class="ag-masthead__pods" style="align-items:center">
        <div class="ag-pod">
          <span class="ag-pod__lbl">Harvests</span>
          <span class="ag-pod__val">${state.harvests.length}</span>
          <span class="ag-pod__sub">Season runs</span>
        </div>
        ${unitTotals.slice(0, 2).map(([u, total]) => html`
          <div class="ag-pod ag-pod--gold">
            <span class="ag-pod__lbl">${u}</span>
            <span class="ag-pod__val">${num(total, { decimals: 1 })}</span>
            <span class="ag-pod__sub">Harvested</span>
          </div>`)}
        <div class="${cls('ag-pod', { 'ag-pod--alert': c.whpLocked > 0, 'ag-pod--good': !c.whpLocked })}">
          <span class="ag-pod__lbl">WHP Guard</span>
          <span class="ag-pod__val">${c.whpLocked || 0}</span>
          <span class="ag-pod__sub">${c.whpLocked > 0 ? 'Locked blocks' : 'All clear'}</span>
        </div>
        <div class="ag-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="harvest-new">${icon('plus', { size: 15 })} Log Harvest</button>
        </div>
      </div>
    </section>

    <section class="tk-sheet">
      ${state.loading && !state.harvests.length ? html`<div class="tk-sheet__body">${skeleton(3)}</div>` : state.harvests.length ? html`
        <div class="tk-table-wrap"><table class="tk-table">
          <thead><tr><th>Date</th><th>Paddock</th><th>Crop</th><th class="tk-num">Yield</th><th>Grade</th><th>Buyer</th></tr></thead>
          <tbody>
            ${state.harvests.map((h) => html`
              <tr data-key="harv-${h.id}">
                <td style="white-space:nowrap">${fmtDate(h.harvest_date)}</td>
                <td>${h.block_name ? html`<span class="tk-tag tk-tag--accent">${h.block_name}</span>` : '—'}</td>
                <td><strong>${h.crop}</strong> ${h.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                <td class="tk-num"><strong>${num(h.quantity, { decimals: 1 })} ${h.unit}</strong></td>
                <td><span class="tk-tag ${h.grade === 'Premium' ? 'tk-tag--ok' : 'tk-tag--info'}">${h.grade}</span></td>
                <td>${h.buyer || '—'}</td>
              </tr>`)}
          </tbody>
        </table></div>` : emptyState({ iconName: 'wheat-sheaf', title: 'No harvests logged yet', text: 'Record yields by block, grade and buyer.' })}
    </section>`;
}

export function renderChemicalsView(state) {
  const nowDay = today();
  const allChems = state.chemicals || [];
  const activeCount = allChems.filter((c) => c.whp_end && c.whp_end >= nowDay).length;
  const clearedCount = Math.max(0, allChems.length - activeCount);

  return html`
    <section class="ag-masthead" aria-label="Chemical Application Register">
      <div class="ag-masthead__copy">
        <div class="ag-masthead__eyebrow">
          ${icon('spray-boom', { size: 12 })} QA &amp; SPRAY COMPLIANCE DIARY
        </div>
        <h1 class="ag-masthead__title">Chemical Register</h1>
        <div class="ag-masthead__meta">
          <span>Audit-ready spray logs with rates, weather conditions &amp; WHP locks</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable QA compliance register</span>
        </div>
      </div>

      <div class="ag-masthead__pods" style="align-items:center">
        <div class="${cls('ag-pod', { 'ag-pod--alert': activeCount > 0, 'ag-pod--good': !activeCount })}">
          <span class="ag-pod__lbl">Active WHP</span>
          <span class="ag-pod__val">${activeCount}</span>
          <span class="ag-pod__sub">${activeCount ? 'Harvest held' : 'All cleared'}</span>
        </div>
        <div class="ag-pod">
          <span class="ag-pod__lbl">Applications</span>
          <span class="ag-pod__val">${allChems.length}</span>
          <span class="ag-pod__sub">Logged sprays</span>
        </div>
        <div class="ag-pod ag-pod--good">
          <span class="ag-pod__lbl">Cleared</span>
          <span class="ag-pod__val">${clearedCount}</span>
          <span class="ag-pod__sub">Past WHP</span>
        </div>
        <div class="ag-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="copy-chem-summary">${icon('copy', { size: 14 })} Copy</button>
          <button type="button" class="k-btn k-btn--glass" data-action="print-chem-register">${icon('printer', { size: 14 })} Print</button>
          <button type="button" class="k-btn k-btn--primary" data-action="chem-new">${icon('plus', { size: 15 })} Log Spray</button>
        </div>
      </div>
    </section>

    ${state.loading && !allChems.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : allChems.length ? html`
      <div class="ag-chem-list">
        ${allChems.map((c) => {
          const active = c.whp_end && c.whp_end >= nowDay;
          const left = active ? daysBetween(nowDay, c.whp_end) : 0;
          return html`
            <article class="${cls('ag-chem-card', { 'ag-chem-card--locked': active })}" data-key="chem-${c.id}">
              <div class="ag-chem-card__top">
                <div style="display:grid;gap:5px;min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:15px;font-weight:750">
                    <span>${c.product_used}</span>
                    ${c.block_name ? html`<span class="tk-tag tk-tag--accent">${c.block_name}</span>` : ''}
                    ${c.rate ? html`<span class="tk-tag">${c.rate}</span>` : ''}
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>${icon('calendar', { size: 12 })} Applied ${fmtDate(c.application_date)}</span>
                    ${c.operator ? html`<span>${icon('user', { size: 12 })} ${c.operator}</span>` : ''}
                    ${c.weather ? html`<span class="ag-weather-chip">${icon('sun', { size: 11 })} ${c.weather}</span>` : ''}
                  </div>
                  ${c.notes ? html`<div class="tk-muted" style="font-size:12.5px">${c.notes}</div>` : ''}
                </div>
                <div>
                  ${active
                    ? html`<span class="whp-countdown">WHP Locked · ${left === 0 ? 'clears today' : `${left}d left`} (${fmtDate(c.whp_end)})</span>`
                    : c.whp_end ? html`<span class="tk-tag tk-tag--ok">WHP Cleared (${fmtDate(c.whp_end)})</span>` : html`<span class="tk-tag">No WHP</span>`}
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'spray-boom', title: 'Chemical register is empty', text: 'Log sprays with operator, weather conditions and WHP end dates.' })}</section>`}`;
}

export function renderMachineryView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const nowDay = today();
  const machines = state.machines || [];
  const dueCount = machines.filter((m) => m.status === 'Due for service' || (m.service_due && m.service_due <= nowDay && m.status !== 'Retired')).length;
  const runningCount = machines.filter((m) => m.status === 'Running' && !(m.service_due && m.service_due <= nowDay)).length;
  const runPct = machines.length ? Math.round((runningCount / machines.length) * 100) : 100;
  const totalHrs = machines.reduce((s, m) => s + Number(m.hours || 0), 0);
  const totalMaintCost = machines.reduce((s, m) => s + Number(m.total_cost_cents || 0), 0);

  return html`
    <section class="ag-masthead" aria-label="Machinery & Shed Maintenance">
      <div class="ag-masthead__copy">
        <div class="ag-masthead__eyebrow">
          ${icon('tractor', { size: 12 })} SHED FLEET &amp; SERVICE HOURS
        </div>
        <h1 class="ag-masthead__title">Machinery &amp; Shed</h1>
        <div class="ag-masthead__meta">
          <span>Tractors, sprayers, pumps &amp; service interval countdowns</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Logging a scheduled service resets due date automatically</span>
        </div>
      </div>

      <div class="ag-masthead__pods ag-masthead__pods--3" style="align-items:center">
        <div class="ag-pod ag-pod--ring">
          <div class="tk-ring" style="--p:${runPct}%;--ring-color:${dueCount > 0 ? '#eab308' : '#4ade80'};--ring-size:48px">
            <span class="tk-ring__val">${runPct}%</span>
          </div>
          <div>
            <span class="ag-pod__lbl">Shed Ready</span>
            <span class="ag-pod__val">${runningCount}/${machines.length}</span>
            <span class="ag-pod__sub">Running</span>
          </div>
        </div>
        <div class="${cls('ag-pod', { 'ag-pod--alert': dueCount > 0, 'ag-pod--good': !dueCount })}">
          <span class="ag-pod__lbl">Service Due</span>
          <span class="ag-pod__val">${dueCount}</span>
          <span class="ag-pod__sub">${dueCount ? 'Needs service' : 'Up to date'}</span>
        </div>
        <div class="ag-pod">
          <span class="ag-pod__lbl">Engine Hrs</span>
          <span class="ag-pod__val">${num(totalHrs)}</span>
          <span class="ag-pod__sub">Combined hours</span>
        </div>
        <div class="ag-pod ag-pod--gold">
          <span class="ag-pod__lbl">Maint Spend</span>
          <span class="ag-pod__val">${money(totalMaintCost, { currency: cur })}</span>
          <span class="ag-pod__sub">Lifetime logs</span>
        </div>
        <div class="ag-masthead__cta">
          <button type="button" class="k-btn k-btn--glass" data-action="maint-new">${icon('wrench', { size: 14 })} Log Service</button>
          <button type="button" class="k-btn k-btn--primary" data-action="machine-new">${icon('plus', { size: 15 })} Add Machine</button>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <div class="tk-stack" style="gap:14px">
        ${state.loading && !machines.length ? html`<section class="tk-sheet"><div class="tk-sheet__body">${skeleton(3)}</div></section>` : machines.length ? html`
          <div class="ag-mach-grid">
            ${machines.map((m) => {
              const overdue = m.service_due && m.service_due <= nowDay && m.status !== 'Retired';
              const cd = serviceCountdown(m.service_due, m.status);
              const cardMod = overdue || m.status === 'Due for service' ? 'ag-mach-card--due' : m.status === 'In workshop' ? 'ag-mach-card--shop' : '';
              return html`
                <article class="ag-mach-card ${cardMod}" data-key="mac-${m.id}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                    <div style="min-width:0">
                      <h2 class="tk-card__title" style="font-size:15.5px">${m.machine_name}</h2>
                      <div class="tk-card__sub">${m.machine_type}</div>
                    </div>
                    <span class="ag-hours-pill">${num(m.hours)} hrs</span>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                    <span class="tk-tag ${overdue || m.status === 'Due for service' ? 'tk-tag--bad' : m.status === 'Running' ? 'tk-tag--ok' : 'tk-tag--warn'}">${overdue ? 'Service Overdue' : m.status}</span>
                    ${cd ? html`<span class="tk-tag ${cd.tone}">${cd.label}</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    ${m.service_due ? html`<span>Due: <strong>${fmtDate(m.service_due)}</strong></span>` : ''}
                    <span>Maint: <strong>${money(m.total_cost_cents, { currency: cur })}</strong></span>
                  </div>
                  ${m.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:0">${m.notes}</p>` : ''}
                  <div class="tk-btn-row" style="padding-top:8px;border-top:1px solid var(--k-border)">
                    <button type="button" class="k-btn k-btn--sm" data-action="machine-edit" data-id="${m.id}">Edit</button>
                  </div>
                </article>`;
            })}
          </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'tractor', title: 'No machinery added', text: 'Track tractors, sprayers, pumps and service intervals.' })}</section>`}
      </div>

      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('wrench', { size: 17 })} Maintenance History</h2><span class="tk-sheet__count">${state.maintenance.length}</span></div>
        <div>
          ${state.maintenance.length ? state.maintenance.map((l) => html`
            <div class="tk-row" data-key="ml-${l.id}">
              <div class="tk-row__main">
                <div class="tk-row__title"><span>${l.machine_name || 'Machine'}</span><span class="tk-tag tk-tag--accent">${l.maintenance_type}</span></div>
                <div class="tk-row__meta"><span>${fmtDate(l.log_date)}</span><strong>${money(l.cost_cents, { currency: cur })}</strong></div>
                ${l.notes ? html`<p class="tk-muted" style="font-size:12.5px;margin:2px 0 0">${l.notes}</p>` : ''}
              </div>
            </div>`) : emptyState({ iconName: 'clipboard', title: 'No service logs yet', text: 'Record services and repairs against your machinery.' })}
        </div>
      </section>
    </div>`;
}

export function wireFarmOpsActions(root, state, { loadScreen }) {
  on(root, 'click', '[data-action="harvest-new"]', async () => {
    const made = await formDialog({
      title: 'Log Harvest',
      submitLabel: 'Record harvest',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Paddock</span><select class="k-input" name="paddock_id"><option value="">Select block…</option>${state.paddocks.map((p) => html`<option value="${p.id}">${p.block_name}${p.active_whp ? ' [WHP LOCKED]' : ''}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Harvest date</span><input class="k-input" type="date" name="harvest_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Crop</span><input class="k-input" name="crop" placeholder="e.g. Sweet Corn" required></label>
          <label class="k-field"><span class="k-field__label">Quantity</span><input class="k-input" type="number" step="0.1" min="0.1" name="quantity" required></label>
          <label class="k-field"><span class="k-field__label">Unit</span><select class="k-input" name="unit">${HARVEST_UNITS.map((u) => html`<option value="${u}">${u}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Grade</span><select class="k-input" name="grade">${HARVEST_GRADES.map((g) => html`<option value="${g}">${g}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Buyer / Destination</span><input class="k-input" name="buyer" placeholder="e.g. FreshCo Market"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/harvests', v),
    });
    if (made) { toast.success('Harvest logged.'); await loadScreen('/harvests'); }
  });

  on(root, 'click', '[data-action="chem-new"]', async () => {
    const made = await formDialog({
      title: 'Log Chemical Application',
      submitLabel: 'Save to register',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Paddock</span><select class="k-input" name="paddock_id"><option value="">Select block…</option>${state.paddocks.map((p) => html`<option value="${p.id}">${p.block_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Product used</span><input class="k-input" name="product_used" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Application date</span><input class="k-input" type="date" name="application_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">WHP end date</span><input class="k-input" type="date" name="whp_end"></label>
          <label class="k-field"><span class="k-field__label">Rate</span><input class="k-input" name="rate" placeholder="e.g. 2.5 L/ha"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Operator</span><input class="k-input" name="operator"></label>
          <label class="k-field"><span class="k-field__label">Weather conditions</span><input class="k-input" name="weather" placeholder="Temp, wind, dry/wet"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/chemicals', v),
    });
    if (made) { toast.success('Chemical application recorded.'); await loadScreen('/chemicals'); }
  });

  on(root, 'click', '[data-action="copy-chem-summary"]', () => {
    const nowDay = today();
    const locked = state.chemicals.filter((c) => c.whp_end && c.whp_end >= nowDay);
    const lines = [
      `${state.session.settings.business_name} — Spray Compliance Summary (${fmtDate(nowDay)})`,
      `Active WHP Locks: ${locked.length}`,
      ...locked.map((c) => `- ${c.block_name || 'Block'}: ${c.product_used} (applied ${fmtDate(c.application_date)}, WHP until ${fmtDate(c.whp_end)})`),
      '',
      `Recent Applications (${state.chemicals.length} total):`,
      ...state.chemicals.slice(0, 8).map((c) => `- ${fmtDate(c.application_date)} | ${c.block_name || 'General'} | ${c.product_used} ${c.rate ? '(' + c.rate + ')' : ''} | Op: ${c.operator || '—'}`),
    ];
    copyText(lines.join('\n'), { title: 'Spray Compliance Summary' });
  });

  on(root, 'click', '[data-action="print-chem-register"]', () => {
    const rows = state.chemicals.map((c) => `<tr><td>${c.application_date}</td><td>${c.block_name || ''}</td><td>${c.product_used}</td><td>${c.rate}</td><td>${c.operator}</td><td>${c.weather}</td><td>${c.whp_end || '—'}</td></tr>`).join('');
    downloadHtmlDoc(`chemical-register-${today()}.html`, {
      title: 'Chemical Application Register',
      businessName: state.session.settings.business_name,
      subtitle: `Exported ${today()}`,
      accent: '#1b5e36',
      bodyHtml: `<table><thead><tr><th>Date</th><th>Paddock</th><th>Product</th><th>Rate</th><th>Operator</th><th>Weather</th><th>WHP End</th></tr></thead><tbody>${rows}</tbody></table>`,
    });
  });

  const machineFields = (m = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Machine name</span><input class="k-input" name="machine_name" value="${m.machine_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Type</span><select class="k-input" name="machine_type">${MACHINE_TYPES.map((x) => html`<option value="${x}" ${x === m.machine_type ? 'selected' : ''}>${x}</option>`)}</select></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Hours</span><input class="k-input" type="number" step="1" min="0" name="hours" value="${m.hours ?? 0}"></label>
      <label class="k-field"><span class="k-field__label">Service due</span><input class="k-input" type="date" name="service_due" value="${m.service_due || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${MACHINE_STATUSES.map((x) => html`<option value="${x}" ${x === (m.status || 'Running') ? 'selected' : ''}>${x}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${m.notes || ''}"></label>`;

  on(root, 'click', '[data-action="machine-new"]', async () => {
    const made = await formDialog({ title: 'Add Machinery', submitLabel: 'Save', fields: machineFields(), onSubmit: (v) => api.post('/api/machinery', v) });
    if (made) { toast.success('Machine added.'); await loadScreen('/machinery'); }
  });
  on(root, 'click', '[data-action="machine-edit"]', async (e, el) => {
    const m = state.machines.find((x) => String(x.id) === el.dataset.id);
    if (!m) return;
    const saved = await formDialog({ title: `Edit ${m.machine_name}`, submitLabel: 'Save', fields: machineFields(m), onSubmit: (v) => api.put('/api/machinery', { ...v, id: m.id }) });
    if (saved) { toast.success('Machine updated.'); await loadScreen('/machinery'); }
  });
  on(root, 'click', '[data-action="maint-new"]', async () => {
    const made = await formDialog({
      title: 'Log Maintenance / Service',
      submitLabel: 'Save log',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Machine</span><select class="k-input" name="machine_id">${state.machines.map((m) => html`<option value="${m.id}">${m.machine_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Maintenance type</span><select class="k-input" name="maintenance_type">${MAINT_TYPES.map((x) => html`<option value="${x}">${x}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="log_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Cost</span><input class="k-input" type="number" step="0.01" min="0" name="cost" value="0.00"></label>
          <label class="k-field"><span class="k-field__label">Next service due</span><input class="k-input" type="date" name="next_service_due"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/maintenance', v),
    });
    if (made) { toast.success('Maintenance logged.'); await loadScreen('/machinery'); }
  });
}
