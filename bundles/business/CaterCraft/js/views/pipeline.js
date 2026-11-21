// Event Pipeline Command — Botanical Dark-Sage & Champagne Masthead, Two-Column Chronological Agenda Deck + Sticky Dispatch Radar,
// Stage-Tinted Folio Cards w/ 6-Stage Progress Rail, Live Per-Head Quote Calculator, 1-Click Chef Dietary Sign-Off & Kanban Board toggle.
import { html, on, cls, qs, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay, daysBetween, isDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const STAGES = [
  { status: 'Enquiry', label: 'Enquiry', tone: 'cc-stage--enquiry', step: 1, next: 'Quoted', nextLabel: 'Send Quote' },
  { status: 'Quoted', label: 'Quoted', tone: 'cc-stage--quoted', step: 2, next: 'Confirmed', nextLabel: 'Confirm Event' },
  { status: 'Confirmed', label: 'Confirmed', tone: 'cc-stage--confirmed', step: 3, next: 'In Prep', nextLabel: 'Move to Prep' },
  { status: 'In Prep', label: 'In Prep', tone: 'cc-stage--prep', step: 4, next: 'Dispatched', nextLabel: 'Dispatch' },
  { status: 'Dispatched', label: 'Dispatched', tone: 'cc-stage--dispatched', step: 5, next: 'Completed', nextLabel: 'Complete' },
  { status: 'Completed', label: 'Completed', tone: 'cc-stage--completed', step: 6, next: null },
];
const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.status, s]));
const RUN_NEXT = { Scheduled: 'Loaded', Loaded: 'En Route', 'En Route': 'Delivered', Issue: 'En Route' };
const RUN_TAG = { Scheduled: 'tk-tag--warn', Loaded: 'tk-tag--info', 'En Route': 'tk-tag--accent', Delivered: 'tk-tag--ok', Issue: 'tk-tag--bad' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SERVICE_TYPES = ['Drop-off', 'Staffed buffet', 'Plated', 'Grazing table'];
const DEPOSIT_PCT = 30;

function dateParts(dayStr) {
  if (!isDay(dayStr)) return { mon: 'TBC', day: '--' };
  const [y, m, d] = dayStr.split('-').map(Number);
  return { mon: MONTHS[(m || 1) - 1] || 'TBC', day: String(d || '--').padStart(2, '0'), year: y };
}

function renderCountdownPill(eventDate, status) {
  if (!isDay(eventDate)) return '';
  const gap = daysBetween(today(), eventDate);
  if (status === 'Completed' && gap < 0) return html`<span class="cc-countdown cc-countdown--past">Past</span>`;
  if (gap === 0) return html`<span class="cc-countdown cc-countdown--today">${icon('clock', { size: 11 })} Today!</span>`;
  if (gap === 1) return html`<span class="cc-countdown cc-countdown--tomorrow">${icon('clock', { size: 11 })} Tomorrow</span>`;
  if (gap < 0) return html`<span class="cc-countdown cc-countdown--past">${Math.abs(gap)}d ago</span>`;
  if (gap <= 3) return html`<span class="cc-countdown cc-countdown--soon">In ${gap}d</span>`;
  return html`<span class="cc-countdown cc-countdown--upcoming">In ${gap}d</span>`;
}

function buildProposalText({
  businessName, phone, email, jobNumber, eventName, eventDate, deliveryTime,
  clientName, organisation, venueAddress, serviceType, guestCount, packageName,
  pppCents, subtotalCents, taxRate, currency, notes,
}) {
  const guests = Math.max(1, Number(guestCount || 1));
  const sub = Number(subtotalCents || 0);
  const rate = Number(taxRate || 0);
  const taxCents = Math.round(sub * (rate / 100));
  const totalCents = sub + taxCents;
  const depositCents = Math.round(totalCents * (DEPOSIT_PCT / 100));
  const balanceCents = Math.max(0, totalCents - depositCents);
  const perHead = pppCents > 0 ? pppCents : Math.round(sub / guests);

  const lines = [
    `${businessName || 'CaterCraft'} — CATERING PROPOSAL${jobNumber ? ' (' + jobNumber + ')' : ''}`,
    '========================================',
    `Event:         ${eventName || 'Private Event'}`,
    `Client:        ${clientName || 'Valued Client'}${organisation ? ' (' + organisation + ')' : ''}`,
    `Date & Time:   ${isDay(eventDate) ? fmtDay(eventDate, { weekday: 'short' }) : (eventDate || 'TBC')} at ${deliveryTime || '12:00'}`,
    `Venue:         ${venueAddress || 'TBC'}`,
    `Service Style: ${serviceType || 'Drop-off'} · ${guests} guests`,
    '',
    'MENU & PRICING',
    '----------------------------------------',
    `Menu Package:  ${packageName || 'Custom Seasonal Catering'}`,
    `Per-Head Rate: ${money(perHead, { currency })} / guest`,
    `Subtotal:      ${money(sub, { currency })} (${guests} guests)`,
  ];
  if (rate > 0) lines.push(`Tax (${rate}%):    ${money(taxCents, { currency })}`);
  lines.push(
    `TOTAL QUOTE:   ${money(totalCents, { currency })} (${currency})`,
    `Deposit (${DEPOSIT_PCT}%): ${money(depositCents, { currency })} to secure booking`,
    `Balance Due:   ${money(balanceCents, { currency })} prior to event`,
  );
  if (notes) lines.push('', `Notes: ${notes}`);
  const contact = [phone, email].filter(Boolean).join(' · ');
  if (contact) lines.push('', `Questions or dietary updates? Contact ${businessName || 'us'}: ${contact}`);
  return lines.join('\n');
}

export function renderPipelineView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const todayStr = today();

  // Stage counts across all jobs
  const stageCounts = new Map();
  for (const j of state.jobs) stageCounts.set(j.status, (stageCounts.get(j.status) || 0) + 1);

  const q = state.pipelineSearch.trim().toLowerCase();
  const stageFilter = state.pipelineStage || 'All';
  const visibleJobs = state.jobs
    .filter((j) => {
      if (stageFilter !== 'All' && j.status !== stageFilter) return false;
      if (q) {
        const hay = `${j.event_name} ${j.client_name} ${j.organisation} ${j.job_number} ${j.package_name || ''} ${j.venue_address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => String(a.event_date || '9999').localeCompare(String(b.event_date || '9999')) || String(a.delivery_time || '').localeCompare(String(b.delivery_time || '')));

  // Roll up detailed dietary breakdown per job_id
  const dietByJob = new Map();
  for (const d of state.dietary || []) {
    if (!d.job_id) continue;
    if (!dietByJob.has(d.job_id)) dietByJob.set(d.job_id, []);
    dietByJob.get(d.job_id).push(d);
  }

  const upcomingJobs = state.jobs.filter((j) => j.status !== 'Completed' && isDay(j.event_date) && daysBetween(todayStr, j.event_date) >= 0);
  const next7DaysCount = upcomingJobs.filter((j) => daysBetween(todayStr, j.event_date) <= 7).length;
  const confirmedCents = state.jobs
    .filter((j) => j.status === 'Confirmed' || j.status === 'In Prep' || j.status === 'Dispatched')
    .reduce((s, j) => s + Number(j.estimated_value_cents || 0), 0);
  const quotedCents = state.jobs
    .filter((j) => j.status === 'Enquiry' || j.status === 'Quoted')
    .reduce((s, j) => s + Number(j.estimated_value_cents || 0), 0);

  const activeRuns = (state.runs || [])
    .filter((r) => r.status !== 'Delivered')
    .sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')) || String(a.pickup_time || '').localeCompare(String(b.pickup_time || '')))
    .slice(0, 2);

  const pendingDiets = (state.dietary || [])
    .filter((d) => d.kitchen_confirmed !== 'Confirmed')
    .sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')))
    .slice(0, 3);

  const mode = state.pipelineViewMode || 'deck';

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="cc-masthead" aria-label="Catering Events Command">
      <div class="cc-masthead__copy">
        <div class="cc-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#e2bc63"></span>
          CULINARY EVENTS &amp; CATERING · ${fmtDay(todayStr)}
        </div>
        <h1 class="cc-masthead__title">Event Pipeline</h1>
        <div class="cc-masthead__meta">
          <span><strong style="color:#f4dca0">${counts.pipelineGuests || 0} booked guests</strong> across ${counts.activeJobs || 0} active events</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${next7DaysCount} firing in next 7 days</span>
        </div>
      </div>

      <div class="cc-masthead__pods" style="align-items:center">
        <div class="cc-pod cc-pod--gold">
          <span class="cc-pod__lbl">${icon('trending', { size: 12 })} Pipeline Value</span>
          <span class="cc-pod__val">${money(counts.pipelineValueCents || 0, { currency })}</span>
          <span class="cc-pod__sub">${money(confirmedCents, { currency })} confirmed</span>
        </div>

        <a href="#/dietary" class="${cls('cc-pod', counts.pendingDietary > 0 ? 'cc-pod--alert' : '')}">
          <span class="cc-pod__lbl">${icon(counts.pendingDietary > 0 ? 'alert' : 'shield-check', { size: 12 })} Dietary Sign-Off</span>
          <span class="cc-pod__val">${counts.pendingDietary || 0}</span>
          <span class="cc-pod__sub">${counts.pendingDietary > 0 ? 'Awaiting chef →' : 'All confirmed ✓'}</span>
        </a>

        <a href="#/production" class="cc-pod">
          <span class="cc-pod__lbl">${icon('chef', { size: 12 })} Commissary</span>
          <span class="cc-pod__val">${counts.openTasks || 0}</span>
          <span class="cc-pod__sub">Prep tasks open →</span>
        </a>

        <a href="#/deliveries" class="cc-pod">
          <span class="cc-pod__lbl">${icon('truck', { size: 12 })} Dispatch Vans</span>
          <span class="cc-pod__val">${counts.openRuns || 0}</span>
          <span class="cc-pod__sub">Runs scheduled →</span>
        </a>

        <button type="button" class="k-btn k-btn--primary" data-action="job-new">${icon('plus', { size: 15 })} New Event</button>
      </div>
    </section>

    <div class="cc-pipe-bar" style="margin-bottom:14px">
      <div class="tk-segmented" role="tablist" aria-label="Filter by pipeline stage">
        <button type="button" class="${cls('tk-pill', { 'is-on': stageFilter === 'All' })}" data-action="pipe-stage" data-stage="All">
          All <span style="opacity:.65;font-size:11px;margin-left:2px">${state.jobs.length}</span>
        </button>
        ${STAGES.slice(0, 5).map((st) => {
          const n = stageCounts.get(st.status) || 0;
          return html`
            <button type="button" class="${cls('tk-pill', { 'is-on': stageFilter === st.status })}" data-action="pipe-stage" data-stage="${st.status}">
              ${st.label} <span style="opacity:.65;font-size:11px;margin-left:2px">${n}</span>
            </button>`;
        })}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto">
        <label class="cc-search-pill">
          ${icon('search', { size: 14 })}
          <input type="search" data-action="pipe-search" value="${state.pipelineSearch}" placeholder="Search event or client…">
        </label>
        <div class="tk-segmented" aria-label="Pipeline layout">
          <button type="button" class="${cls('tk-pill', { 'is-on': mode === 'deck' })}" data-action="pipe-mode" data-mode="deck" style="display:inline-flex;align-items:center;gap:4px">${icon('list', { size: 13 })} Deck</button>
          <button type="button" class="${cls('tk-pill', { 'is-on': mode === 'board' })}" data-action="pipe-mode" data-mode="board" style="display:inline-flex;align-items:center;gap:4px">${icon('grid', { size: 13 })} Board</button>
        </div>
      </div>
    </div>

    ${state.loading && !state.jobs.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : mode === 'board' ? html`
      ${visibleJobs.length ? html`
        <div class="cc-board">
          ${STAGES.map((st) => {
            const cards = visibleJobs.filter((j) => j.status === st.status);
            const colTotal = cards.reduce((s, j) => s + Number(j.estimated_value_cents || 0), 0);
            return html`
              <div class="tk-col" data-key="stage-${st.status}">
                <div class="tk-col__head">
                  <span>${st.label} <span class="tk-muted" style="font-weight:500">(${cards.length})</span></span>
                  <span class="tk-muted" style="font-size:12px;font-variant-numeric:tabular-nums">${money(colTotal, { currency })}</span>
                </div>
                ${cards.length ? cards.map((j) => {
                  const jobDiets = dietByJob.get(j.id) || [];
                  const totalDietGuests = j.diet_guests || jobDiets.reduce((s, d) => s + Number(d.guest_count || 0), 0);
                  const pendingDiet = j.diet_unconfirmed || jobDiets.filter((d) => d.kitchen_confirmed !== 'Confirmed').length;
                  const guests = Math.max(1, Number(j.guest_count || 1));
                  const perHeadCents = j.price_per_person_cents > 0 ? j.price_per_person_cents : Math.round(Number(j.estimated_value_cents || 0) / guests);
                  return html`
                    <article class="tk-ticket cc-job-card ${st.tone}" data-key="job-${j.id}">
                      <div class="cc-job-card__head">
                        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                          <span class="cc-job-code">${j.job_number}</span>
                          ${renderCountdownPill(j.event_date, j.status)}
                        </div>
                        <span class="cc-job-val">${money(j.estimated_value_cents, { currency })}</span>
                      </div>
                      <div class="cc-job-card__body">
                        <div class="cc-job-title">${j.event_name}</div>
                        <div class="tk-ticket__meta">
                          <div><strong>${fmtDay(j.event_date)}</strong> · ${j.delivery_time} · ${j.guest_count} guests</div>
                          <div>${j.client_name}${j.organisation ? ' · ' + j.organisation : ''}</div>
                        </div>
                        <div class="cc-per-head-bar">
                          <span>${j.package_name || j.service_type}</span>
                          <span class="cc-per-head-val">${money(perHeadCents, { currency })}/pp</span>
                        </div>
                        ${totalDietGuests > 0 ? html`
                          <div class="cc-diet-alert ${pendingDiet > 0 ? 'cc-diet-alert--pending' : 'cc-diet-alert--confirmed'}">
                            ${icon(pendingDiet > 0 ? 'alert' : 'shield-check', { size: 13 })}
                            <div style="min-width:0">
                              <div>${totalDietGuests} Dietary · ${pendingDiet > 0 ? `${pendingDiet} pending` : 'Confirmed'}</div>
                            </div>
                          </div>` : ''}
                        <div class="tk-ticket__foot">
                          ${st.next ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-stage" data-id="${j.id}" data-status="${st.next}">${st.nextLabel}</button>` : html`<span class="tk-tag tk-tag--ok">Done</span>`}
                          <div class="tk-btn-row">
                            <button type="button" class="k-btn k-btn--sm" data-action="job-proposal" data-id="${j.id}">${icon('copy', { size: 12 })} Quote</button>
                            <button type="button" class="k-btn k-btn--sm" data-action="job-runsheet" data-id="${j.id}">${icon('printer', { size: 12 })} Sheet</button>
                            <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
                          </div>
                        </div>
                      </div>
                    </article>`;
                }) : html`<p class="tk-muted" style="font-size:13px;padding:12px 4px;text-align:center">Clear</p>`}
              </div>`;
          })}
        </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'banquet', title: 'No catering events match', text: 'Create a catering enquiry or clear your filter.' })}</section>`}
    ` : html`
      <div class="cc-split">
        <div class="cc-folio-list">
          ${visibleJobs.length ? visibleJobs.map((j) => {
            const st = STAGE_MAP[j.status] || STAGES[0];
            const dp = dateParts(j.event_date);
            const jobDiets = dietByJob.get(j.id) || [];
            const totalDietGuests = j.diet_guests || jobDiets.reduce((s, d) => s + Number(d.guest_count || 0), 0);
            const pendingDiet = j.diet_unconfirmed || jobDiets.filter((d) => d.kitchen_confirmed !== 'Confirmed').length;
            const guests = Math.max(1, Number(j.guest_count || 1));
            const perHeadCents = j.price_per_person_cents > 0 ? j.price_per_person_cents : Math.round(Number(j.estimated_value_cents || 0) / guests);
            return html`
              <article class="cc-folio ${st.tone}" data-key="folio-${j.id}">
                <div class="cc-folio__date">
                  <span class="cc-folio__mon">${dp.mon}</span>
                  <span class="cc-folio__day">${dp.day}</span>
                  <span class="cc-folio__time">${j.delivery_time || '12:00'}</span>
                  ${renderCountdownPill(j.event_date, j.status)}
                </div>

                <div class="cc-folio__body">
                  <div class="cc-folio__top">
                    <div style="min-width:0;flex:1">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
                        <span class="cc-job-code">${j.job_number}</span>
                        <span class="tk-tag tk-tag--accent">${j.status}</span>
                        <span class="tk-tag">${j.service_type}</span>
                        ${j.tasks_total > 0 ? html`<a href="#/production" class="tk-tag tk-tag--info" style="text-decoration:none">Prep ${j.tasks_done}/${j.tasks_total}</a>` : ''}
                        ${j.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="cc-job-title">${j.event_name}</div>
                      <div style="font-size:12.5px;color:var(--k-muted);margin-top:2px">
                        <strong style="color:var(--k-text)">${j.client_name}</strong>${j.organisation ? ' · ' + j.organisation : ''}${j.venue_address ? ' · ' + j.venue_address : ''}
                      </div>
                    </div>

                    <div class="cc-folio__price-box">
                      <div class="cc-folio__total">${money(j.estimated_value_cents, { currency })}</div>
                      <div class="cc-folio__perhead">${j.guest_count} guests × ${money(perHeadCents, { currency })}/pp</div>
                      <div style="font-size:11px;color:var(--k-muted)">${j.package_name || 'Custom Menu'}</div>
                    </div>
                  </div>

                  <div class="cc-stage-rail" title="Pipeline stage: ${j.status} (${st.step}/6)">
                    ${STAGES.map((pip) => html`<span class="${cls('cc-stage-pip', { 'is-done': pip.step < st.step, 'is-now': pip.step === st.step })}"></span>`)}
                  </div>

                  ${totalDietGuests > 0 ? html`
                    <div class="cc-diet-alert ${pendingDiet > 0 ? 'cc-diet-alert--pending' : 'cc-diet-alert--confirmed'}">
                      ${icon(pendingDiet > 0 ? 'alert' : 'shield-check', { size: 14 })}
                      <div style="min-width:0;flex:1">
                        <div>${totalDietGuests} Dietary Cover${totalDietGuests === 1 ? '' : 's'} · ${pendingDiet > 0 ? `${pendingDiet} awaiting chef sign-off` : 'Kitchen confirmed'}</div>
                        ${jobDiets.length ? html`
                          <div class="cc-diet-alert__chips">
                            ${jobDiets.map((d) => html`<span class="cc-diet-mini">${d.guest_count}× ${d.requirement_type}</span>`)}
                          </div>` : ''}
                      </div>
                    </div>` : ''}

                  <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px dashed var(--k-border)">
                    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                      ${st.next ? html`
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-stage" data-id="${j.id}" data-status="${st.next}">${st.nextLabel} →</button>` : html`<span class="tk-tag tk-tag--ok">Completed ✓</span>`}
                      <button type="button" class="k-btn k-btn--sm" data-action="job-proposal" data-id="${j.id}" title="Copy Client Proposal">${icon('copy', { size: 13 })} Proposal</button>
                      <button type="button" class="k-btn k-btn--sm" data-action="job-runsheet" data-id="${j.id}" title="Download HTML Run Sheet">${icon('printer', { size: 13 })} Run Sheet</button>
                    </div>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="job-edit" data-id="${j.id}">Edit</button>
                  </div>
                </div>
              </article>`;
          }) : html`<section class="tk-sheet">${emptyState({ iconName: 'banquet', title: 'No catering events match', text: 'Create a catering enquiry and select a Menu Package to auto-calculate the quote total.' })}</section>`}
        </div>

        <aside class="tk-sheet cc-radar" aria-label="Commissary & Dispatch Radar">
          <div class="cc-radar__head">
            <div style="display:flex;align-items:center;gap:8px">
              ${icon('truck', { size: 16 })}
              <div>
                <div style="font-family:var(--k-font-display);font-size:16px;font-weight:700;line-height:1.1">Dispatch Radar</div>
                <div style="font-size:11px;color:rgba(242,246,238,.72)">Live vans &amp; chef allergen sign-off</div>
              </div>
            </div>
            <a href="#/deliveries" class="k-btn k-btn--glass k-btn--sm">Runs →</a>
          </div>

          <div class="cc-radar__body">
            <div class="cc-radar__sec-title">
              <span>Next Dispatch Vans</span>
              <span>${counts.openRuns || 0} open</span>
            </div>
            ${activeRuns.length ? activeRuns.map((rn) => html`
              <div class="cc-radar-card" data-key="rad-run-${rn.id}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                  <span class="cc-route-badge">${rn.pickup_time} → ${rn.delivery_time}</span>
                  <span class="tk-tag ${RUN_TAG[rn.status] || ''}">${rn.status}</span>
                </div>
                <div style="font-weight:750;font-size:13px;line-height:1.25">${rn.event_name}</div>
                <div style="font-size:11.5px;color:var(--k-muted)">${rn.driver}${rn.vehicle ? ' · ' + rn.vehicle : ''}</div>
                ${RUN_NEXT[rn.status] ? html`
                  <button type="button" class="k-btn k-btn--sm k-btn--block" style="margin-top:2px" data-action="radar-run-status" data-id="${rn.id}" data-status="${RUN_NEXT[rn.status]}">
                    Mark ${RUN_NEXT[rn.status]} →
                  </button>` : ''}
              </div>`) : html`<div class="tk-muted" style="font-size:12px">No active delivery runs queued.</div>`}

            <div class="cc-radar__sec-title" style="padding-top:8px;border-top:1px dashed var(--k-border)">
              <span>Dietary Awaiting Chef</span>
              <a href="#/dietary" style="color:var(--k-accent);text-decoration:none;text-transform:none;letter-spacing:0;font-weight:700">Matrix →</a>
            </div>
            ${pendingDiets.length ? pendingDiets.map((d) => html`
              <div class="cc-radar-card cc-radar-card--alert" data-key="rad-dt-${d.id}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                  <span style="font-size:12px;font-weight:800;color:#991b1b">${d.guest_count}× ${d.requirement_type}</span>
                  <span style="font-size:11px;color:var(--k-muted)">${fmtDay(d.event_date)}</span>
                </div>
                <div style="font-size:12px;font-weight:700;color:var(--k-text)">${d.event_name}</div>
                ${d.notes ? html`<div style="font-size:11px;color:#7f1d1d;line-height:1.3">${d.notes}</div>` : ''}
                <button type="button" class="k-btn k-btn--primary k-btn--sm k-btn--block" style="margin-top:2px" data-action="radar-diet-confirm" data-id="${d.id}">
                  ${icon('shield-check', { size: 12 })} Chef Sign Off ✓
                </button>
              </div>`) : html`
              <div style="padding:10px;border-radius:9px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px">
                ${icon('shield-check', { size: 14 })} All dietary alerts chef-confirmed!
              </div>`}

            <div class="cc-radar-summary">
              <div class="cc-radar-stat">
                <div class="cc-radar-stat__lbl">Confirmed</div>
                <div class="cc-radar-stat__val" style="color:var(--k-accent)">${money(confirmedCents, { currency })}</div>
              </div>
              <div class="cc-radar-stat">
                <div class="cc-radar-stat__lbl">Pending Quote</div>
                <div class="cc-radar-stat__val">${money(quotedCents, { currency })}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>`}
  `;
}

export function wirePipelineActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="pipe-search"]', (e, el) => { state.pipelineSearch = el.value; draw(); });
  on(root, 'click', '[data-action="pipe-stage"]', (e, el) => { state.pipelineStage = el.dataset.stage; draw(); });
  on(root, 'click', '[data-action="pipe-mode"]', (e, el) => { state.pipelineViewMode = el.dataset.mode; draw(); });

  on(root, 'click', '[data-action="radar-run-status"]', async (e, el) => {
    try {
      await api.post('/api/deliveries/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Delivery run marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="radar-diet-confirm"]', async (e, el) => {
    try {
      await api.post('/api/dietary/confirm', { id: Number(el.dataset.id), kitchen_confirmed: 'Confirmed' });
      toast.success('Dietary requirement signed off by kitchen!');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  const openJobDialog = async (job = null, presetPkgId = null) => {
    const settings = state.session.settings || {};
    const currency = settings.currency || 'AUD';
    const taxRate = Number(settings.tax_rate ?? 10);
    const activePkgs = state.packages.filter((p) => p.active_status !== 'Retired');
    const initialPkg = activePkgs.find((p) => String(p.id) === String(presetPkgId || job?.package_id)) || activePkgs[0] || null;
    const initGuests = job?.guest_count ?? (initialPkg?.min_guests ? Math.max(30, initialPkg.min_guests) : 40);
    const initPpp = job ? (job.price_per_person_cents || 0) : (initialPkg ? initialPkg.price_per_person_cents : 0);
    const initSub = job ? job.estimated_value_cents : (initPpp * initGuests);
    const initTax = Math.round(initSub * (taxRate / 100));
    const initTotal = initSub + initTax;
    const initDep = Math.round(initTotal * (DEPOSIT_PCT / 100));

    const saved = await formDialog({
      title: job ? `Edit ${job.job_number} · ${job.event_name}` : 'New Catering Event & Quote',
      submitLabel: job ? 'Save Event' : 'Create Event & Quote',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Event name</span>
            <input class="k-input" name="event_name" value="${job?.event_name || ''}" placeholder="e.g. Hartley Wedding Reception" required>
          </label>
          <label class="k-field"><span class="k-field__label">Client</span>
            <select class="k-input" name="client_id">
              <option value="">— Select client —</option>
              ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(job?.client_id) ? 'selected' : ''}>${c.client_name}${c.organisation ? ' (' + c.organisation + ')' : ''}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Event date</span><input class="k-input" type="date" name="event_date" value="${job?.event_date || today()}" required></label>
          <label class="k-field"><span class="k-field__label">Delivery time</span><input class="k-input" type="time" name="delivery_time" value="${job?.delivery_time || '12:00'}"></label>
          <label class="k-field"><span class="k-field__label">Service type</span>
            <select class="k-input" name="service_type">${SERVICE_TYPES.map((t) => html`<option value="${t}" ${t === (job?.service_type || 'Drop-off') ? 'selected' : ''}>${t}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Menu package (live per-head quote)</span>
            <select class="k-input" name="package_id" data-quote-calc>
              <option value="">Custom quote (manual)</option>
              ${activePkgs.map((p) => html`<option value="${p.id}" data-ppp="${p.price_per_person_cents}" data-name="${p.package_name}" ${String(p.id) === String(presetPkgId || (job ? job.package_id : initialPkg?.id)) ? 'selected' : ''}>${p.package_name} — ${money(p.price_per_person_cents, { currency })}/pp</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Guest count</span>
            <input class="k-input" type="number" min="1" max="5000" name="guest_count" data-quote-calc value="${initGuests}" required>
          </label>
          <label class="k-field"><span class="k-field__label">Pipeline status</span>
            <select class="k-input" name="status">
              ${STAGES.map((st) => html`<option value="${st.status}" ${st.status === (job?.status || 'Quoted') ? 'selected' : ''}>${st.label}</option>`)}
            </select>
          </label>
        </div>
        <div class="cc-quote-calc">
          <div class="cc-quote-calc__head">
            <span class="cc-quote-calc__title">Live Per-Head Quote Calculator</span>
            <button type="button" class="k-btn k-btn--sm" data-action="dialog-copy-proposal">${icon('copy', { size: 13 })} Copy Client Proposal</button>
          </div>
          <div class="cc-quote-calc__grid">
            <div class="cc-quote-calc__cell">
              <span class="cc-quote-calc__k">Per Head</span>
              <span class="cc-quote-calc__v" data-quote-ppp>${initPpp > 0 ? money(initPpp, { currency }) + '/pp' : 'Custom'}</span>
            </div>
            <div class="cc-quote-calc__cell">
              <span class="cc-quote-calc__k">Subtotal</span>
              <span class="cc-quote-calc__v" data-quote-sub>${money(initSub, { currency })}</span>
            </div>
            <div class="cc-quote-calc__cell">
              <span class="cc-quote-calc__k">Total${taxRate > 0 ? ` (inc ${taxRate}% tax)` : ''}</span>
              <span class="cc-quote-calc__v cc-quote-calc__v--accent" data-quote-total>${money(initTotal, { currency })}</span>
            </div>
            <div class="cc-quote-calc__cell">
              <span class="cc-quote-calc__k">${DEPOSIT_PCT}% Deposit</span>
              <span class="cc-quote-calc__v" data-quote-deposit>${money(initDep, { currency })}</span>
            </div>
          </div>
        </div>
        <label class="k-field"><span class="k-field__label">Venue address</span>
          <input class="k-input" name="venue_address" value="${job?.venue_address || ''}" placeholder="Address, room or loading dock">
        </label>
        <label class="k-field"><span class="k-field__label">Event &amp; setup notes</span>
          <input class="k-input" name="notes" value="${job?.notes || ''}" placeholder="Access codes, linen colours, bump-in time…">
        </label>`,
      onOpen: ({ form }) => {
        const readLive = () => {
          const sel = qs('select[name="package_id"]', form);
          const opt = sel && sel.options[sel.selectedIndex];
          const ppp = opt ? Number(opt.dataset.ppp || 0) : 0;
          const pkgName = opt ? (opt.dataset.name || '') : '';
          const guests = Math.max(1, Number(qs('input[name="guest_count"]', form)?.value || 1));
          const sub = ppp > 0 ? ppp * guests : (job ? Number(job.estimated_value_cents || 0) : 0);
          const tax = Math.round(sub * (taxRate / 100));
          const total = sub + tax;
          const deposit = Math.round(total * (DEPOSIT_PCT / 100));
          return { ppp, pkgName, guests, sub, tax, total, deposit };
        };
        const recalc = () => {
          const calc = readLive();
          const elPpp = qs('[data-quote-ppp]', form);
          const elSub = qs('[data-quote-sub]', form);
          const elTot = qs('[data-quote-total]', form);
          const elDep = qs('[data-quote-deposit]', form);
          if (elPpp) elPpp.textContent = calc.ppp > 0 ? `${money(calc.ppp, { currency })}/pp` : 'Custom';
          if (elSub) elSub.textContent = money(calc.sub, { currency });
          if (elTot) elTot.textContent = money(calc.total, { currency });
          if (elDep) elDep.textContent = money(calc.deposit, { currency });
        };
        form.addEventListener('input', recalc);
        form.addEventListener('change', recalc);
        const copyBtn = qs('[data-action="dialog-copy-proposal"]', form);
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            const calc = readLive();
            const clientSel = qs('select[name="client_id"]', form);
            const clObj = state.clients.find((c) => String(c.id) === String(clientSel?.value));
            const proposal = buildProposalText({
              businessName: settings.business_name,
              phone: settings.phone,
              email: settings.email,
              jobNumber: job?.job_number || '',
              eventName: qs('input[name="event_name"]', form)?.value || 'Catering Event',
              eventDate: qs('input[name="event_date"]', form)?.value || today(),
              deliveryTime: qs('input[name="delivery_time"]', form)?.value || '12:00',
              clientName: clObj ? clObj.client_name : (job?.client_name || 'Valued Client'),
              organisation: clObj ? clObj.organisation : (job?.organisation || ''),
              venueAddress: qs('input[name="venue_address"]', form)?.value || '',
              serviceType: qs('select[name="service_type"]', form)?.value || 'Drop-off',
              guestCount: calc.guests,
              packageName: calc.pkgName || job?.package_name || 'Custom Catering Package',
              pppCents: calc.ppp,
              subtotalCents: calc.sub,
              taxRate,
              currency,
              notes: qs('input[name="notes"]', form)?.value || '',
            });
            copyText(proposal, { title: 'Client Catering Proposal', done: 'Client proposal copied!' });
          });
        }
      },
      onSubmit: (v) => (job ? api.put('/api/jobs', { ...v, id: job.id }) : api.post('/api/jobs', v)),
    });
    if (saved) {
      toast.success(job ? 'Catering event updated.' : `Event ${saved.job.job_number} created — Quote ${money(saved.job.estimated_value_cents, { currency })}.`);
      await loadScreen(state.route);
    }
  };

  on(root, 'click', '[data-action="job-new"]', () => openJobDialog(null));
  on(root, 'click', '[data-action="pkg-quote"]', (e, el) => openJobDialog(null, el.dataset.id));
  on(root, 'click', '[data-action="job-edit"]', (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (job) openJobDialog(job);
  });

  on(root, 'click', '[data-action="job-proposal"]', (e, el) => {
    const job = state.jobs.find((x) => String(x.id) === el.dataset.id);
    if (!job) return;
    const settings = state.session.settings || {};
    const text = buildProposalText({
      businessName: settings.business_name,
      phone: settings.phone,
      email: settings.email,
      jobNumber: job.job_number,
      eventName: job.event_name,
      eventDate: job.event_date,
      deliveryTime: job.delivery_time,
      clientName: job.client_name,
      organisation: job.organisation,
      venueAddress: job.venue_address,
      serviceType: job.service_type,
      guestCount: job.guest_count,
      packageName: job.package_name,
      pppCents: job.price_per_person_cents,
      subtotalCents: job.estimated_value_cents,
      taxRate: settings.tax_rate ?? 10,
      currency: settings.currency || 'AUD',
      notes: job.notes,
    });
    copyText(text, { title: `Client Proposal · ${job.job_number}`, done: 'Client proposal copied!' });
  });

  on(root, 'click', '[data-action="job-stage"]', async (e, el) => {
    try {
      await api.post('/api/jobs/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Event moved to ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="job-runsheet"]', async (e, el) => {
    try {
      const data = await api.get('/api/jobs/runsheet', { id: Number(el.dataset.id) });
      const { job, client, tasks, runs, dietary } = data;
      const cur = state.session.settings.currency || 'AUD';
      const taxRate = Number(state.session.settings.tax_rate || 0);
      const subtotal = Number(job.estimated_value_cents || 0);
      const taxCents = Math.round(subtotal * (taxRate / 100));
      const grandTotal = subtotal + taxCents;
      const depositCents = Math.round(grandTotal * (DEPOSIT_PCT / 100));

      const dietRows = (dietary || []).map((d) => `<tr><td><strong>${esc(d.requirement_type)}</strong></td><td class="num">${d.guest_count}</td><td>${esc(d.kitchen_confirmed)}</td><td>${esc(d.notes || '—')}</td></tr>`).join('');
      const taskRows = (tasks || []).map((tk) => `<tr><td><strong>${esc(tk.station)}</strong></td><td>${esc(tk.task)}</td><td>${esc(tk.due_date)} ${esc(tk.due_time)}</td><td>${esc(tk.assigned_to || '—')}</td><td>${esc(tk.status)}</td></tr>`).join('');
      const runRows = (runs || []).map((rn) => `<tr><td><strong>${esc(rn.driver)}</strong></td><td>${esc(rn.vehicle || '—')}</td><td>${esc(rn.pickup_time)} → ${esc(rn.delivery_time)}</td><td>${esc(rn.status)}</td><td>${esc(rn.delivery_notes || '—')}</td></tr>`).join('');

      downloadHtmlDoc(`catercraft-runsheet-${job.job_number}-${job.event_date}.html`, {
        title: `Kitchen Prep & Delivery Run Sheet · ${job.job_number}`,
        businessName: state.session.settings.business_name,
        subtitle: `${job.event_name} · ${fmtDay(job.event_date)} at ${job.delivery_time} · Status: ${job.status}`,
        accent: '#3f5f1e',
        bodyHtml: `
          <div class="box">
            <strong>Client:</strong> ${esc(job.client_name)}${job.organisation ? ' (' + esc(job.organisation) + ')' : ''}${client && client.phone ? ' · ' + esc(client.phone) : ''}${client && client.email ? ' · ' + esc(client.email) : ''}<br>
            <strong>Venue:</strong> ${esc(job.venue_address || 'TBC')} · <strong>Service:</strong> ${esc(job.service_type)} · <strong>Guests:</strong> ${job.guest_count}
            ${job.notes ? '<br><strong>Setup Notes:</strong> ' + esc(job.notes) : ''}
          </div>
          <h3>Quote &amp; Deposit Summary</h3>
          <table>
            <thead><tr><th>Menu Package</th><th class="num">Guests</th><th class="num">Per Head</th><th class="num">Line Total</th></tr></thead>
            <tbody>
              <tr><td>${esc(job.package_name || 'Custom Catering Package')}</td><td class="num">${job.guest_count}</td><td class="num">${money(job.price_per_person_cents, { currency: cur })}</td><td class="num">${money(subtotal, { currency: cur })}</td></tr>
              ${taxRate > 0 ? `<tr><td colspan="3">Tax (${taxRate}%)</td><td class="num">${money(taxCents, { currency: cur })}</td></tr>` : ''}
              <tr class="total-row"><td colspan="3">Total Quote (${cur})</td><td class="num">${money(grandTotal, { currency: cur })}</td></tr>
              <tr><td colspan="3">Deposit (${DEPOSIT_PCT}%)</td><td class="num">${money(depositCents, { currency: cur })}</td></tr>
            </tbody>
          </table>
          <h3>Dietary &amp; Allergen Sign-Off (${(dietary || []).length})</h3>
          ${dietRows ? `<table><thead><tr><th>Requirement</th><th class="num">Guests</th><th>Kitchen Sign-off</th><th>Labelling / Safety Notes</th></tr></thead><tbody>${dietRows}</tbody></table>` : '<p>No special dietary requirements logged.</p>'}
          <h3>Kitchen Prep Schedule (${(tasks || []).length})</h3>
          ${taskRows ? `<table><thead><tr><th>Station</th><th>Task</th><th>Due</th><th>Assigned</th><th>Status</th></tr></thead><tbody>${taskRows}</tbody></table>` : '<p>No production tasks scheduled yet.</p>'}
          <h3>Delivery Dispatch Run (${(runs || []).length})</h3>
          ${runRows ? `<table><thead><tr><th>Driver</th><th>Vehicle</th><th>Pickup → Drop</th><th>Status</th><th>Access Notes</th></tr></thead><tbody>${runRows}</tbody></table>` : '<p>No delivery runs scheduled yet.</p>'}`,
      });
    } catch (err) { toastError(err); }
  });
}
