// Daily Walk & Visit Run-Sheet: Unified Meadow Forest & Terracotta Masthead with Conic Walk Ring,
// Two-Column Morning/Midday/Afternoon Run-Sheet + Sticky Pack Safety, Medication & Walker Pulse Rail,
// 1-Tap Start/Complete Walk, Temperament Safety Pills, Care Chips & Copy Walk Report.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, addDays, fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

export const SERVICE_TYPES = ['Solo Walk', 'Group Walk', 'Drop-in Visit', 'Pet Sitting', 'Pet Taxi'];
export const DURATIONS = ['15 minutes', '30 minutes', '45 minutes', '60 minutes'];
export const WEATHERS = ['Sunny', 'Overcast', 'Rain', 'Windy', 'Hot'];
export const WALK_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'No Access'];

const STATUS_TAG = {
  Scheduled: '',
  'In Progress': 'tk-tag--warn',
  Completed: 'tk-tag--ok',
  Cancelled: 'tk-tag--bad',
  'No Access': 'tk-tag--bad',
};

const PERIODS = [
  { id: 'morning', label: 'Morning Walks', sub: 'Before 12:00 pm', icon: 'sun', mod: 'pr-period--morning' },
  { id: 'midday', label: 'Midday Walks', sub: '12:00 pm – 3:00 pm', icon: 'clock', mod: 'pr-period--midday' },
  { id: 'afternoon', label: 'Afternoon & Evening', sub: '3:00 pm onwards', icon: 'paw', mod: 'pr-period--afternoon' },
];

export function temperamentClass(tag) {
  const lower = String(tag || '').toLowerCase();
  if (lower === 'reactive' || lower === 'solo only') return 'pr-temp pr-temp--danger';
  if (lower.includes('pull') || lower === 'anxious' || lower === 'nervous' || lower === 'shy') return 'pr-temp pr-temp--warn';
  if (lower.includes('friendly') || lower === 'pack safe') return 'pr-temp pr-temp--good';
  return 'pr-temp pr-temp--soft';
}

export function isReactivePet(temperament) {
  return (temperament || []).some((t) => String(t).toLowerCase() === 'reactive');
}

export function renderTemperamentPills(temperament) {
  const list = temperament || [];
  if (!list.length) return '';
  const reactive = isReactivePet(list);
  const packSafe = !reactive && list.some((t) => t === 'Dog-friendly');
  return html`
    <div class="pr-temp-row">
      ${list.map((t) => html`
        <span class="${temperamentClass(t)}">
          ${t === 'Reactive' ? icon('alert', { size: 11 }) : (t === 'Friendly' || t === 'Dog-friendly') ? icon('check', { size: 11 }) : ''}
          ${t}
        </span>`)}
      ${reactive ? html`<span class="pr-temp pr-temp--danger-soft">${icon('shield', { size: 11 })} Solo Only</span>` : ''}
      ${packSafe ? html`<span class="pr-temp pr-temp--good">${icon('paw', { size: 11 })} Pack Safe</span>` : ''}
    </div>`;
}

export function renderCareChips({ medical_notes, vet_contact, feeding_instructions, pet_name }) {
  if (!medical_notes && !vet_contact && !feeding_instructions) return '';
  return html`
    <div class="pr-care-chips">
      ${medical_notes ? html`
        <span class="pr-care-chip pr-care-chip--med">
          ${icon('med-cross', { size: 12 })} <span class="pr-care-chip__k">Medical</span> <span>${medical_notes}</span>
        </span>` : ''}
      ${vet_contact ? html`
        <button type="button" class="pr-care-chip pr-care-chip--vet" data-action="copy-vet-chip" data-vet="${vet_contact}" data-pet="${pet_name || ''}" title="Click to copy vet contact">
          ${icon('stethoscope', { size: 12 })} <span class="pr-care-chip__k">Vet</span> <span>${vet_contact}</span> ${icon('copy', { size: 11 })}
        </button>` : ''}
      ${feeding_instructions ? html`
        <span class="pr-care-chip pr-care-chip--feed">
          ${icon('pet-bowl', { size: 12 })} <span class="pr-care-chip__k">Feeding</span> <span>${feeding_instructions}</span>
        </span>` : ''}
    </div>`;
}

function periodOfTime(hhmm) {
  const hour = Number(String(hhmm || '09:00').split(':')[0]);
  if (!Number.isFinite(hour) || hour < 12) return 'morning';
  if (hour < 15) return 'midday';
  return 'afternoon';
}

function buildWalkReport(wk, settings) {
  const bizName = settings.business_name || 'PawRoute Pet Care';
  const bizPhone = settings.phone ? ` · ${settings.phone}` : '';
  const serviceLower = String(wk.service_type || 'Walk').toLowerCase();
  const isVisit = wk.service_type === 'Drop-in Visit' || wk.service_type === 'Pet Sitting';
  const intro = isVisit
    ? `Hi ${wk.client_name || 'there'}! ${wk.walker_name || 'Your carer'} just wrapped up ${wk.pet_name}'s ${wk.duration} ${serviceLower}.`
    : `Hi ${wk.client_name || 'there'}! ${wk.pet_name} is back home safe and happy after a ${wk.duration} ${serviceLower} with ${wk.walker_name || 'your walker'}!`;
  const lines = [
    `🐾 Walk Report — ${wk.pet_name}`,
    intro,
    '',
    `Date & Time: ${fmtDay(wk.walk_date, { weekday: 'short' })} at ${wk.walk_time}`,
    `Duration:    ${wk.duration} (${wk.service_type})`,
    `Weather:     ${wk.weather || 'Clear'}`,
  ];
  if (wk.walk_notes) {
    lines.push(`Walk Notes:  ${wk.walk_notes}`);
  } else {
    lines.push(`Walk Notes:  Great energy on the lead, good sniff time, fresh water topped up and settled comfortably at home.`);
  }
  lines.push('', `Thanks for trusting us with ${wk.pet_name}!`, `— ${bizName}${bizPhone}`);
  return lines.join('\n');
}

function renderWalkCard(wk, currency) {
  const reactive = isReactivePet(wk.temperament);
  const cardMod = wk.status === 'In Progress'
    ? 'pr-walk-card--progress'
    : wk.status === 'Completed'
      ? 'pr-walk-card--done'
      : reactive ? 'pr-walk-card--alert' : '';

  return html`
    <article class="pr-walk-card ${cardMod}" data-key="wk-${wk.id}">
      <div class="pr-walk-head">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
          <span class="pr-time-badge">${icon('clock', { size: 13 })} ${wk.walk_time} · ${wk.duration}</span>
          <strong style="font-size:16.5px">${wk.pet_name || 'Pet #' + wk.pet_id}</strong>
          <span class="tk-muted" style="font-size:12.5px">${wk.breed || wk.species} · ${wk.size}</span>
          <span class="tk-tag tk-tag--accent">${wk.service_type}</span>
          <span class="tk-tag ${STATUS_TAG[wk.status] || ''}">${wk.status}</span>
          ${wk.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:7px">
          <span class="tk-tag">${wk.weather}</span>
          <strong style="font-variant-numeric:tabular-nums">${money(wk.charge_cents, { currency })}</strong>
        </div>
      </div>

      ${renderTemperamentPills(wk.temperament)}

      <div class="tk-row__meta">
        <span><strong>Walker:</strong> ${wk.walker_name || 'Unassigned'}</span>
        <span><strong>Owner:</strong> ${wk.client_name || '—'}${wk.client_phone ? ' (' + wk.client_phone + ')' : ''}</span>
        ${wk.client_address ? html`<span>${icon('pin', { size: 12 })} ${wk.client_address}</span>` : ''}
      </div>

      ${renderCareChips({
        medical_notes: wk.medical_notes,
        vet_contact: wk.vet_contact,
        feeding_instructions: wk.feeding_instructions,
        pet_name: wk.pet_name,
      })}

      ${wk.walk_notes ? html`<div style="font-size:13.5px"><strong>Walk Notes:</strong> ${wk.walk_notes}</div>` : ''}

      <div class="pr-walk-foot">
        <div class="tk-btn-row" style="gap:7px">
          ${wk.status === 'Scheduled' ? html`
            <button type="button" class="pr-tap-btn pr-tap-btn--start" data-action="walk-start" data-id="${wk.id}">
              ${icon('play', { size: 14 })} Start Walk
            </button>` : ''}
          ${wk.status === 'In Progress' ? html`
            <button type="button" class="pr-tap-btn pr-tap-btn--complete" data-action="walk-complete" data-id="${wk.id}">
              ${icon('check-circle', { size: 15 })} Complete Walk
            </button>` : ''}
          <button type="button" class="pr-tap-btn pr-tap-btn--report" data-action="walk-copy-update" data-id="${wk.id}">
            ${icon('copy', { size: 13 })} Walk Report
          </button>
          ${wk.access_instructions ? html`
            <button type="button" class="k-btn k-btn--sm" data-action="walk-copy-access" data-id="${wk.id}">
              ${icon('key', { size: 13 })} Access
            </button>` : ''}
        </div>
        <div class="tk-btn-row">
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="walk-edit" data-id="${wk.id}">Edit</button>
          <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="walk-del" data-id="${wk.id}">Delete</button>
        </div>
      </div>
    </article>`;
}

export function renderRunsheetView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const walkerScoped = state.walkWalkerFilter === 'All'
    ? state.walks
    : state.walks.filter((w) => String(w.walker_id) === String(state.walkWalkerFilter));
  const statusFilter = state.walkStatusFilter || 'All';
  const visible = statusFilter === 'All'
    ? walkerScoped
    : walkerScoped.filter((w) => w.status === statusFilter);

  const nonCancelled = walkerScoped.filter((w) => w.status !== 'Cancelled');
  const activeCount = walkerScoped.filter((w) => w.status === 'In Progress').length;
  const doneCount = walkerScoped.filter((w) => w.status === 'Completed').length;
  const completedPct = nonCancelled.length ? Math.round((doneCount / nonCancelled.length) * 100) : 0;
  const ringColor = completedPct === 100 && nonCancelled.length ? '#34d399' : '#fbbf24';
  const dayRev = nonCancelled.reduce((s, w) => s + Number(w.charge_cents || 0), 0);

  const grouped = { morning: [], midday: [], afternoon: [] };
  for (const wk of visible) grouped[periodOfTime(wk.walk_time)].push(wk);

  // Safety & Med alerts for today's scheduled/active pets
  const safetyAlerts = state.walks.filter((w) => w.status !== 'Cancelled' && (isReactivePet(w.temperament) || Boolean((w.medical_notes || '').trim())));
  const openFollowUps = (state.incidents || []).filter((i) => i.follow_up === 'Yes');

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="pr-masthead" aria-label="Daily Walk Run-Sheet Command">
      <div class="pr-masthead__copy">
        <div class="pr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${activeCount > 0 ? '#fbbf24' : '#34d399'}"></span>
          PACK RUN-SHEET · ${fmtDayNear(state.walkDate).toUpperCase()}
        </div>
        <h1 class="pr-masthead__title">Daily Walks &amp; Visits</h1>
        <div class="pr-masthead__meta">
          <span><strong style="color:#fed7aa">${nonCancelled.length} visit${nonCancelled.length === 1 ? '' : 's'}</strong> today</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${activeCount} out walking now</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live temperament &amp; medication alerts</span>
        </div>
      </div>

      <div class="pr-masthead__pods pr-masthead__pods--3" style="align-items:center">
        <div class="pr-pod pr-pod--ring pr-pod--terra">
          <div class="tk-ring" style="--p:${completedPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${completedPct}%</span>
          </div>
          <div>
            <span class="pr-pod__lbl">Completed</span>
            <span class="pr-pod__val">${doneCount}/${nonCancelled.length}</span>
            <span class="pr-pod__sub">Safe returns</span>
          </div>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('dollar', { size: 12 })} Day Value</span>
          <span class="pr-pod__val">${money(dayRev, { currency })}</span>
          <span class="pr-pod__sub">${activeCount} in progress</span>
        </div>

        <a href="#/pets" class="pr-pod">
          <span class="pr-pod__lbl">${icon('paw', { size: 12 })} Active Pack</span>
          <span class="pr-pod__val">${counts.activePets || state.pets.length}</span>
          <span class="pr-pod__sub">Profiles →</span>
        </a>

        <a href="#/incidents" class="${cls('pr-pod', { 'pr-pod--alert': counts.openIncidents > 0 })}">
          <span class="pr-pod__lbl">${icon('med-cross', { size: 12 })} Safety FU</span>
          <span class="pr-pod__val">${counts.openIncidents || 0}</span>
          <span class="pr-pod__sub">${counts.openIncidents > 0 ? 'Follow-up →' : 'All clear →'}</span>
        </a>

        <div class="pr-masthead__actions">
          <button type="button" class="k-btn pr-cta-terra" data-action="walk-new">${icon('plus', { size: 15 })} Schedule Walk</button>
          <button type="button" class="k-btn pr-cta-glass k-btn--sm" data-action="print-runsheet">${icon('printer', { size: 14 })} Print Sheet</button>
        </div>
      </div>
    </section>

    <div class="pr-split">
      <div class="tk-stack" style="gap:14px">
        <div class="pr-daybar">
          <div class="pr-daybar__row">
            <button type="button" class="k-btn k-btn--sm" data-action="walk-day-shift" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 15 })}</button>
            <button type="button" class="k-btn k-btn--sm" data-action="walk-day-today">Today</button>
            <button type="button" class="k-btn k-btn--sm" data-action="walk-day-shift" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 15 })}</button>
            <input class="k-input" type="date" style="width:auto;min-height:32px;padding:3px 9px;font-size:13px" data-action="walk-day-pick" value="${state.walkDate}">
            <strong style="font-size:13.5px;white-space:nowrap">${fmtDay(state.walkDate, { weekday: 'short' })}</strong>
            <div class="pr-daybar__spacer"></div>
            <select class="k-input" style="width:auto;min-height:32px;padding:3px 9px;font-size:13px" data-action="walk-walker-filter">
              <option value="All" ${state.walkWalkerFilter === 'All' ? 'selected' : ''}>All Walkers</option>
              ${state.walkers.map((w) => html`<option value="${w.id}" ${String(state.walkWalkerFilter) === String(w.id) ? 'selected' : ''}>${w.name} (${w.role})</option>`)}
            </select>
          </div>
          <div class="pr-daybar__row">
            <div class="tk-segmented" role="group" aria-label="Filter walks by status">
              ${['All', 'Scheduled', 'In Progress', 'Completed'].map((st) => {
                const n = st === 'All' ? walkerScoped.length : walkerScoped.filter((w) => w.status === st).length;
                return html`<button type="button" class="${cls('tk-pill', { 'is-on': statusFilter === st })}" data-action="walk-status-filter" data-status="${st}">${st}${n ? ` (${n})` : ''}</button>`;
              })}
            </div>
          </div>
        </div>

        ${state.loading && !state.walks.length ? html`
          <section class="tk-sheet">${skeleton(4)}</section>
        ` : visible.length ? html`
          <div>
            ${PERIODS.map((period) => {
              const list = grouped[period.id];
              if (!list.length) return '';
              const pDone = list.filter((w) => w.status === 'Completed').length;
              return html`
                <section class="pr-period ${period.mod}" data-key="period-${period.id}">
                  <div class="pr-period__head">
                    <div class="pr-period__title">
                      <span class="pr-period__icon">${icon(period.icon, { size: 16 })}</span>
                      <span>${period.label}</span>
                      <span class="pr-period__sub">${period.sub}</span>
                    </div>
                    <span class="tk-tag ${pDone === list.length ? 'tk-tag--ok' : 'tk-tag--accent'}">${pDone}/${list.length} done</span>
                  </div>
                  <div class="tk-stack" style="gap:12px">
                    ${list.map((wk) => renderWalkCard(wk, currency))}
                  </div>
                </section>`;
            })}
          </div>` : emptyState({
            iconName: 'paw',
            title: `No walks or visits match on ${fmtDay(state.walkDate)}`,
            text: 'Adjust your walker/status filter or book a walk, drop-in visit or pet sitting session.',
            action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="walk-new">Schedule Walk</button>`,
          })}
      </div>

      <aside class="pr-rail-panel" aria-label="Pack Safety, Medication & Walker Pulse">
        <section class="pr-rail-card">
          <div class="pr-rail-card__head">
            <span class="pr-rail-card__title">${icon('med-cross', { size: 14 })} Pack Safety &amp; Meds</span>
            <span class="tk-tag ${safetyAlerts.length ? 'tk-tag--bad' : 'tk-tag--ok'}">${safetyAlerts.length}</span>
          </div>
          ${safetyAlerts.length ? html`
            <div class="pr-rail-list">
              ${safetyAlerts.map((wk) => {
                const reactive = isReactivePet(wk.temperament);
                return html`
                  <div class="${cls('pr-rail-item', { 'pr-rail-item--alert': reactive })}" data-key="rail-safe-${wk.id}">
                    <div class="pr-rail-item__top">
                      <div>
                        <div class="pr-rail-item__name">${wk.pet_name} · ${wk.walk_time}</div>
                        <div class="pr-rail-item__sub">${wk.medical_notes || 'Reactive / Solo Walk Protocol'}</div>
                      </div>
                      ${reactive ? html`<span class="pr-temp pr-temp--danger">Solo</span>` : html`<span class="tk-tag tk-tag--warn">Med</span>`}
                    </div>
                    ${wk.vet_contact ? html`
                      <div class="pr-rail-item__foot">
                        <span style="font-size:11.5px;color:var(--k-muted)">Vet: ${wk.vet_contact}</span>
                        <button type="button" class="k-btn k-btn--sm" data-action="copy-vet-chip" data-vet="${wk.vet_contact}" data-pet="${wk.pet_name}">${icon('copy', { size: 11 })} Vet</button>
                      </div>` : ''}
                  </div>`;
              })}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No special reactivity or medication alerts on today's walks ✓</div>`}
        </section>

        <section class="pr-rail-card">
          <div class="pr-rail-card__head">
            <span class="pr-rail-card__title">${icon('alert', { size: 14 })} Care Follow-Ups</span>
            <a href="#/incidents" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${state.incidents.length})</a>
          </div>
          ${openFollowUps.length ? html`
            <div class="pr-rail-list">
              ${openFollowUps.slice(0, 3).map((inc) => html`
                <div class="pr-rail-item" data-key="rail-inc-${inc.id}">
                  <div class="pr-rail-item__top">
                    <div>
                      <div class="pr-rail-item__name">${inc.pet_name} · ${inc.incident_type}</div>
                      <div class="pr-rail-item__sub">${inc.description}</div>
                    </div>
                    <span class="tk-tag tk-tag--bad">${inc.severity}</span>
                  </div>
                  <div class="pr-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${inc.owner_name || ''}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-close-inc" data-id="${inc.id}">Close ✓</button>
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Zero open care follow-ups ✓</div>`}
        </section>

        <section class="pr-rail-card">
          <div class="pr-rail-card__head">
            <span class="pr-rail-card__title">${icon('users', { size: 14 })} Walkers On Duty</span>
            <a href="#/walkers" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Roster</a>
          </div>
          <div class="pr-rail-list">
            ${state.walkers.length ? state.walkers.map((w) => {
              const myWalks = state.walks.filter((wk) => String(wk.walker_id) === String(w.id) && wk.status !== 'Cancelled');
              const myDone = myWalks.filter((wk) => wk.status === 'Completed').length;
              const pct = myWalks.length ? Math.round((myDone / myWalks.length) * 100) : 0;
              return html`
                <div class="pr-rail-item">
                  <div class="pr-rail-item__top">
                    <div>
                      <div class="pr-rail-item__name">${w.name}</div>
                      <div class="pr-rail-item__sub">${w.role} · ${myDone}/${myWalks.length} visits done</div>
                    </div>
                    <button type="button" class="tk-pill ${String(state.walkWalkerFilter) === String(w.id) ? 'is-on' : ''}" style="min-height:24px;padding:0 9px;font-size:11px" data-action="rail-pick-walker" data-id="${w.id}">Filter</button>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill tk-bar__fill--ok" style="width:${pct}%"></div></div>
                </div>`;
            }) : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No walkers added yet.</div>`}
          </div>
        </section>
      </aside>
    </div>
  `;
}

export async function openWalkForm(state, { loadScreen }, preset = {}) {
  if (!state.pets.length || !state.walkers.length) {
    const [p, w] = await Promise.all([api.get('/api/pets'), api.get('/api/walkers', { day: today() })]);
    state.pets = p.pets || [];
    state.walkers = w.walkers || [];
  }
  if (!state.pets.length) { toast.error('Add a pet profile first.'); return; }
  if (!state.walkers.length) { toast.error('Add a walker to the roster first.'); return; }
  const isEdit = Boolean(preset.id);

  const saved = await formDialog({
    title: isEdit ? 'Edit Walk / Visit' : 'Book Walk or Pet Care Visit',
    submitLabel: isEdit ? 'Save Visit' : 'Schedule Visit',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Pet</span>
          <select class="k-input" name="pet_id" required>
            ${state.pets.map((p) => html`<option value="${p.id}" ${String(p.id) === String(preset.pet_id) ? 'selected' : ''}>${p.name} (${p.breed || p.species} — ${p.owner_name})</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Assigned Walker / Sitter</span>
          <select class="k-input" name="walker_id" required>
            ${state.walkers.map((w) => html`<option value="${w.id}" ${String(w.id) === String(preset.walker_id) ? 'selected' : ''}>${w.name} (${w.role})</option>`)}
          </select>
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Service Type</span>
          <select class="k-input" name="service_type">${SERVICE_TYPES.map((s) => html`<option value="${s}" ${s === (preset.service_type || 'Solo Walk') ? 'selected' : ''}>${s}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Duration</span>
          <select class="k-input" name="duration">${DURATIONS.map((d) => html`<option value="${d}" ${d === (preset.duration || '45 minutes') ? 'selected' : ''}>${d}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Charge</span>
          <input class="k-input" type="number" step="0.01" min="0" name="charge_amount" value="${preset.charge_cents !== undefined ? (preset.charge_cents / 100).toFixed(2) : '45.00'}">
        </label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="walk_date" value="${preset.walk_date || state.walkDate || today()}" required></label>
        <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="walk_time" value="${preset.walk_time || '09:00'}" required></label>
        <label class="k-field"><span class="k-field__label">Weather</span>
          <select class="k-input" name="weather">${WEATHERS.map((w) => html`<option value="${w}" ${w === (preset.weather || 'Sunny') ? 'selected' : ''}>${w}</option>`)}</select>
        </label>
      </div>
      ${isEdit ? html`
        <label class="k-field"><span class="k-field__label">Status</span>
          <select class="k-input" name="status">${WALK_STATUSES.map((st) => html`<option value="${st}" ${st === preset.status ? 'selected' : ''}>${st}</option>`)}</select>
        </label>` : ''}
      <label class="k-field"><span class="k-field__label">Walk / Visit Notes</span>
        <textarea class="k-input" name="walk_notes" rows="2" placeholder="Route, playmates, toilet break, feeding check…">${preset.walk_notes || ''}</textarea>
      </label>`,
    onSubmit: (v) => isEdit ? api.put('/api/walks', { ...v, id: preset.id }) : api.post('/api/walks', v),
  });
  if (saved) { toast.success(isEdit ? 'Visit updated.' : 'Walk scheduled.'); await loadScreen(); }
}

export function wireRunsheetActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="walk-day-shift"]', (e, el) => {
    state.walkDate = addDays(state.walkDate, Number(el.dataset.delta));
    loadScreen('/');
  });
  on(root, 'click', '[data-action="walk-day-today"]', () => { state.walkDate = today(); loadScreen('/'); });
  on(root, 'change', '[data-action="walk-day-pick"]', (e, el) => { if (el.value) { state.walkDate = el.value; loadScreen('/'); } });
  on(root, 'change', '[data-action="walk-walker-filter"]', (e, el) => { state.walkWalkerFilter = el.value; draw(); });
  on(root, 'click', '[data-action="walk-status-filter"]', (e, el) => { state.walkStatusFilter = el.dataset.status || 'All'; draw(); });
  on(root, 'click', '[data-action="rail-pick-walker"]', (e, el) => {
    const id = el.dataset.id;
    state.walkWalkerFilter = String(state.walkWalkerFilter) === String(id) ? 'All' : id;
    draw();
  });
  on(root, 'click', '[data-action="rail-close-inc"]', async (e, el) => {
    try {
      await api.post('/api/incidents/followup', { id: Number(el.dataset.id), follow_up: 'No' });
      toast.success('Care follow-up closed.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-vet-chip"]', (e, el) => {
    const vet = el.dataset.vet;
    const pet = el.dataset.pet;
    if (!vet) return;
    copyText(pet ? `${pet} — Vet Contact: ${vet}` : vet, {
      title: 'Vet Contact',
      done: `Copied vet contact${pet ? ' for ' + pet : ''}`,
    });
  });

  on(root, 'click', '[data-action="walk-new"]', () => openWalkForm(state, { loadScreen }));
  on(root, 'click', '[data-action="walk-edit"]', (e, el) => {
    const wk = state.walks.find((x) => String(x.id) === el.dataset.id);
    if (wk) openWalkForm(state, { loadScreen }, wk);
  });

  on(root, 'click', '[data-action="walk-start"]', async (e, el) => {
    try {
      await api.post('/api/walks/status', { id: Number(el.dataset.id), status: 'In Progress' });
      toast.success('Walk started!');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="walk-complete"]', async (e, el) => {
    const wk = state.walks.find((x) => String(x.id) === el.dataset.id);
    if (!wk) return;
    const saved = await formDialog({
      title: `Complete Walk · ${wk.pet_name}`,
      submitLabel: 'Complete Walk',
      fields: html`
        <label class="k-field"><span class="k-field__label">Weather</span>
          <select class="k-input" name="weather">${WEATHERS.map((w) => html`<option value="${w}" ${w === wk.weather ? 'selected' : ''}>${w}</option>`)}</select>
        </label>
        <label class="k-field"><span class="k-field__label">Walk Notes (included in Pet Parent Walk Report)</span>
          <textarea class="k-input" name="walk_notes" rows="3" placeholder="How did ${wk.pet_name} go? Toilet breaks, playmates, energy level, water topped up…">${wk.walk_notes || ''}</textarea>
        </label>`,
      onSubmit: (v) => api.post('/api/walks/status', { id: wk.id, status: 'Completed', weather: v.weather, walk_notes: v.walk_notes }),
    });
    if (saved) {
      const doneWalk = saved.walk || wk;
      toast.success(`${wk.pet_name}'s walk marked Completed!`, {
        action: {
          label: 'Copy Walk Report',
          run: () => copyText(buildWalkReport(doneWalk, state.session.settings), {
            title: `Walk Report for ${doneWalk.client_name || doneWalk.pet_name}`,
            done: 'Walk Report copied for pet parent!',
          }),
        },
      });
      await loadScreen('/');
    }
  });

  on(root, 'click', '[data-action="walk-copy-update"]', (e, el) => {
    const wk = state.walks.find((x) => String(x.id) === el.dataset.id);
    if (!wk) return;
    const msg = buildWalkReport(wk, state.session.settings);
    copyText(msg, {
      title: `Walk Report for ${wk.client_name || wk.pet_name}`,
      done: `Walk Report copied for ${wk.pet_name}'s owner!`,
    });
  });

  on(root, 'click', '[data-action="walk-copy-access"]', (e, el) => {
    const wk = state.walks.find((x) => String(x.id) === el.dataset.id);
    if (!wk) return;
    copyText(`${wk.pet_name} (${wk.client_name})\n${wk.client_address || ''}\nHome Access & Alarm:\n${wk.access_instructions}`, {
      title: 'Home Access & Alarm Code',
      done: `Home access copied for ${wk.pet_name}`,
    });
  });

  on(root, 'click', '[data-action="walk-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete walk?', message: 'Delete this scheduled walk or visit?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/walks', { id: Number(el.dataset.id) }); toast.success('Walk deleted.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-runsheet"]', () => {
    const rowsHtml = state.walks.map((wk) => `
      <tr>
        <td><strong>${wk.walk_time}</strong><br>${wk.duration}</td>
        <td><strong>${wk.pet_name}</strong> (${wk.breed || wk.species})<br>${(wk.temperament || []).join(', ')}</td>
        <td>${wk.service_type}</td>
        <td>${wk.walker_name || '—'}</td>
        <td>${wk.client_address || ''}<br>${wk.access_instructions || ''}</td>
        <td>${wk.medical_notes || '—'}</td>
        <td>${wk.status}</td>
      </tr>`).join('');
    downloadHtmlDoc(`pawroute-runsheet-${state.walkDate}.html`, {
      title: `Daily Walk Run-Sheet · ${fmtDay(state.walkDate)}`,
      businessName: state.session.settings.business_name,
      subtitle: `${state.walks.length} scheduled visit(s)`,
      accent: '#1b6a48',
      bodyHtml: `<table>
        <thead><tr><th>Time</th><th>Pet &amp; Temperament</th><th>Service</th><th>Walker</th><th>Address &amp; Access</th><th>Medical Alert</th><th>Status</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="7">No walks scheduled.</td></tr>'}</tbody>
      </table>`,
    });
  });
}
