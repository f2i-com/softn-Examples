// Event Production Command (Pass 3 Stage Obsidian & Champagne Spotlight Masthead, Two-Column Run-of-Show Timeline +
// Sticky Budget/Readiness/Vendor/Arrivals Rail) and 1-Tap Check-In Desk views.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const TICKET_TYPES = ['General Admission', 'VIP', 'Early Bird', 'Student', 'Speaker', 'Press'];
const DIETARY_OPTS = ['Vegetarian', 'Vegan', 'Gluten Free', 'Halal', 'Kosher', 'Nut Free', 'None'];
const CUE_FILTERS = [
  { id: 'All', label: 'All' },
  { id: 'stage', label: 'Stage' },
  { id: 'vendor', label: 'Booths' },
  { id: 'crew', label: 'Crew' },
  { id: 'alert', label: 'Alerts' },
];

function dietaryAlerts(list) {
  return (list || []).filter((d) => d && d !== 'None');
}

function dietBadgeClass(d) {
  if (d === 'Nut Free' || d === 'Gluten Free') return 'diet-badge diet-badge--allergy';
  if (d === 'Vegan' || d === 'Vegetarian') return 'diet-badge diet-badge--plant';
  if (d === 'Halal' || d === 'Kosher') return 'diet-badge diet-badge--faith';
  return 'diet-badge';
}

function extractTimeInfo(text, fallbackTime = 'TBD', fallbackMin = 9999) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(text || ''));
  if (!m) return { label: fallbackTime, sortMin: fallbackMin };
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const pad = (n) => String(n).padStart(2, '0');
  return { label: `${pad(hh)}:${pad(mm)}`, sortMin: hh * 60 + mm };
}

function buildRunSheet(state) {
  const items = [];
  const vendors = (state.vendors || []).filter((v) => v.status === 'Booth Assigned');
  for (const v of vendors) {
    const t = extractTimeInfo(v.special_requests, '07:00', 420);
    items.push({
      id: `rs-v-${v.id}`,
      time: t.label,
      sortMin: t.sortMin,
      kind: 'vendor',
      kindLabel: 'Exhibitor Load-In',
      title: `${v.company_name} — Booth ${v.booth_number || 'TBD'}`,
      owner: v.contact_name || v.company_name,
      detail: [v.booth_size, (v.power || []).join(', '), v.special_requests].filter(Boolean).join(' · '),
    });
  }
  for (const vol of (state.volunteers || [])) {
    if (!vol.assigned_shift) continue;
    const t = extractTimeInfo(vol.assigned_shift, '08:00', 480);
    items.push({
      id: `rs-c-${vol.id}`,
      time: t.label,
      sortMin: t.sortMin,
      kind: 'crew',
      kindLabel: 'Crew Shift',
      title: vol.assigned_shift,
      owner: vol.volunteer_name,
      detail: (vol.skills || []).join(', '),
    });
  }
  for (const sp of (state.command?.scheduledSpeakers || [])) {
    const t = extractTimeInfo(sp.session_slot, 'TBD', 900);
    items.push({
      id: `rs-s-${sp.id}`,
      time: t.label,
      sortMin: t.sortMin,
      kind: 'stage',
      kindLabel: sp.presentation_type || 'Session',
      title: sp.topic_title,
      owner: sp.speaker_name,
      detail: [sp.session_slot || 'Slot TBD', (sp.equipment || []).length ? 'AV: ' + sp.equipment.join(', ') : ''].filter(Boolean).join(' · '),
    });
  }
  for (const inc of (state.command?.openIncidents || [])) {
    const t = extractTimeInfo(inc.incident_time, inc.incident_time || 'Now', 850);
    items.push({
      id: `rs-i-${inc.id}`,
      time: t.label,
      sortMin: t.sortMin,
      kind: 'alert',
      kindLabel: `${inc.severity} Incident`,
      title: `${inc.incident_type} — ${inc.location}`,
      owner: inc.reporter_name || 'Floor Ops',
      detail: inc.description,
    });
  }
  items.sort((a, b) => a.sortMin - b.sortMin);
  return items;
}

function formatRunSheetText(items, settings, counts) {
  const header = [
    `${(settings.event_title || 'EVENT RUN SHEET').toUpperCase()}`,
    `${settings.event_venue || settings.business_name} · ${settings.event_date ? fmtDay(settings.event_date) : fmtDay(today())}`,
    `Check-In: ${counts.checkedIn || 0}/${counts.totalRegistrations || 0} (${counts.checkInPct || 0}%) · Speakers: ${counts.confirmedSpeakers || 0} · Booths: ${counts.assignedBooths || 0} · Crew: ${counts.volunteers || 0}`,
    '--------------------------------------------------',
  ];
  const lines = items.length
    ? items.map((it) => `${it.time}  [${it.kindLabel}] ${it.title} — Owner: ${it.owner}${it.detail ? ' (' + it.detail + ')' : ''}`)
    : ['No scheduled sessions or crew shifts yet.'];
  return [...header, ...lines].join('\n');
}

export function renderCommandView(state) {
  const settings = state.session.settings;
  const cur = settings.currency || 'USD';
  const cmd = state.command;

  if (state.loading && !cmd) {
    return html`
      <section class="ev-masthead">
        <div class="ev-masthead__copy">
          <div class="ev-masthead__eyebrow">
            <span class="tk-pulse-dot" style="--dot:#f3c969"></span>
            SHOW FLOOR · ${settings.event_venue || 'PRODUCTION COMMAND'}
          </div>
          <h1 class="ev-masthead__title">${settings.event_title || 'Event Command'}</h1>
          <div class="ev-masthead__meta"><span>Loading run-of-show timeline, check-in feed, budget &amp; exhibitors…</span></div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const c = cmd?.counts || state.session.counts || {
    totalRegistrations: 0, checkedIn: 0, checkInPct: 0,
    confirmedSpeakers: 0, assignedBooths: 0, volunteers: 0, openIncidents: 0,
    budgetEstimatedCents: 0, budgetActualCents: 0, budgetVarianceCents: 0,
  };
  const variance = Number(c.budgetVarianceCents || 0);
  const budEst = Number(c.budgetEstimatedCents || 0);
  const budAct = Number(c.budgetActualCents || 0);
  const budPct = budEst > 0 ? Math.min(100, Math.round((budAct / budEst) * 100)) : 0;
  const runSheet = buildRunSheet(state);
  const filteredCues = state.cueFilter === 'All' ? runSheet : runSheet.filter((x) => x.kind === state.cueFilter);
  const cueCount = (id) => id === 'All' ? runSheet.length : runSheet.filter((x) => x.kind === id).length;

  const pct = c.checkInPct || 0;
  const ringColor = pct >= 75 ? '#34d399' : pct >= 35 ? '#f3c969' : '#ec4899';
  const pendingVendors = (state.vendors || []).filter((v) => v.status === 'Applied');

  const readiness = [
    { label: `Speakers confirmed (${c.confirmedSpeakers})`, done: c.confirmedSpeakers > 0 },
    { label: `Expo booths assigned (${c.assignedBooths})`, done: c.assignedBooths > 0 },
    { label: `Crew shifts staffed (${c.volunteers})`, done: c.volunteers > 0 },
    { label: `Budget ${variance >= 0 ? 'under ceiling' : 'over ceiling'}`, done: variance >= 0 },
    { label: c.openIncidents === 0 ? 'Floor safety clear' : `${c.openIncidents} open floor incident`, done: c.openIncidents === 0 },
  ];

  return html`
    ${renderSampleBanner(c.sampleCount || 0, { canClear: state.session.me.isOwner || state.session.me.role === 'manager' })}

    <section class="ev-masthead" aria-label="Event Production Command">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#4ade80"></span>
          DOORS OPEN · ${settings.event_date ? fmtDay(settings.event_date) : 'LIVE SHOW'}
        </div>
        <h1 class="ev-masthead__title">${settings.event_title || 'Event Command'}</h1>
        <div class="ev-masthead__meta">
          <span style="flex:1 1 100%;color:#fde68a;font-weight:650">${settings.event_venue || settings.business_name}</span>
          <span>${c.confirmedSpeakers} speaker${Number(c.confirmedSpeakers) === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.assignedBooths} booth${Number(c.assignedBooths) === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${c.volunteers} crew</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <a href="#/checkin" class="ev-pod ev-pod--ring">
          <div class="tk-ring" style="--p:${pct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${pct}%</span>
          </div>
          <div>
            <span class="ev-pod__lbl">Doors Arrived</span>
            <div class="ev-pod__val" style="font-size:15.5px">${c.checkedIn} / ${c.totalRegistrations}</div>
            <span class="ev-pod__sub">Check-In Desk →</span>
          </div>
        </a>

        <a href="#/budget" class="ev-pod ${variance < 0 ? 'ev-pod--alert' : 'ev-pod--gold'}">
          <span class="ev-pod__lbl">${icon('dollar', { size: 12 })} Budget</span>
          <span class="ev-pod__val">${variance >= 0 ? '+' : ''}${money(variance, { currency: cur })}</span>
          <span class="ev-pod__sub">${variance >= 0 ? 'Under plan →' : 'Over plan →'}</span>
        </a>

        <a href="#/incidents" class="ev-pod ${c.openIncidents > 0 ? 'ev-pod--alert' : 'ev-pod--mint'}">
          <span class="ev-pod__lbl">${icon(c.openIncidents > 0 ? 'alert' : 'shield-check', { size: 12 })} Safety</span>
          <span class="ev-pod__val">${c.openIncidents > 0 ? `${c.openIncidents} Open` : 'Clear'}</span>
          <span class="ev-pod__sub">${c.openIncidents > 0 ? 'Incident log →' : 'Venue clear →'}</span>
        </a>

        <div class="ev-masthead__cta-group">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-runsheet">${icon('copy', { size: 14 })} Run Sheet</button>
          <a href="#/checkin" class="k-btn k-btn--primary ev-btn-stage">${icon('ticket', { size: 15 })} Check-In Desk</a>
        </div>
      </div>

      <div class="ev-progress-strip" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="ev-progress-fill" style="width:${pct}%"></div>
      </div>
    </section>

    <div class="ev-split">
      <div class="tk-stack" style="gap:16px">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('cue-sheet', { size: 17 })} Run-of-Show Timeline</h2>
            <span class="tk-sheet__count">${filteredCues.length}</span>
            <div class="tk-sheet__actions">
              <button type="button" class="k-btn k-btn--sm" data-action="copy-runsheet">${icon('copy', { size: 13 })} Copy</button>
              <button type="button" class="k-btn k-btn--sm" data-action="print-runsheet">${icon('printer', { size: 13 })} Print</button>
            </div>
          </div>
          <div style="padding:10px 16px;border-bottom:1px solid color-mix(in srgb, var(--k-text) 6%, transparent)">
            <div class="tk-segmented ev-cue-pills">
              ${CUE_FILTERS.map((f) => html`
                <button type="button" class="${cls('tk-pill', { 'is-on': state.cueFilter === f.id })}" data-action="cue-filter" data-val="${f.id}">${f.label} ${cueCount(f.id)}</button>`)}
            </div>
          </div>
          ${filteredCues.length ? html`
            <div class="runsheet-timeline">
              ${filteredCues.map((it) => html`
                <div class="runsheet-item" data-key="${it.id}">
                  <span class="runsheet-dot runsheet-dot--${it.kind}" aria-hidden="true"></span>
                  <div class="runsheet-time">${it.time}</div>
                  <div class="runsheet-card">
                    <div class="tk-row__title">
                      <span>${it.title}</span>
                      <span class="tk-tag ${it.kind === 'alert' ? 'tk-tag--bad' : it.kind === 'stage' ? 'tk-tag--accent' : it.kind === 'crew' ? 'tk-tag--ok' : 'tk-tag--warn'}">${it.kindLabel}</span>
                    </div>
                    <div class="tk-row__meta">
                      <span class="runsheet-owner">${icon('user', { size: 12 })} ${it.owner}</span>
                      ${it.detail ? html`<span>${it.detail}</span>` : ''}
                    </div>
                  </div>
                </div>`)}
            </div>` : emptyState({ iconName: 'clock', title: 'No cues in this track', text: 'Schedule speakers, assign volunteer shifts, or confirm exhibitor load-ins to populate the timeline.' })}
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('alert', { size: 17 })} Open Floor Incidents</h2>
            <span class="tk-sheet__count">${(cmd?.openIncidents || []).length}</span>
            <div class="tk-sheet__actions"><a href="#/incidents" class="k-btn k-btn--ghost k-btn--sm">Incident log</a></div>
          </div>
          <div>
            ${(cmd?.openIncidents || []).length ? cmd.openIncidents.map((inc) => html`
              <div class="tk-row" data-key="ci-${inc.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="tk-tag ${inc.severity === 'Critical' || inc.severity === 'High' ? 'tk-tag--bad' : 'tk-tag--warn'}">${inc.severity}</span>
                    <span>${inc.incident_type} — ${inc.location}</span>
                  </div>
                  <div class="tk-row__meta"><span>${inc.incident_time} · Reported by ${inc.reporter_name}</span></div>
                  <div style="font-size:13.5px">${inc.description}</div>
                </div>
                <div class="tk-row__aside">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inc-resolve" data-id="${inc.id}">Resolve ✓</button>
                </div>
              </div>`) : emptyState({ iconName: 'shield-check', title: 'Venue clear', text: 'Zero open safety, medical, or logistics incidents.' })}
          </div>
        </section>
      </div>

      <aside class="ev-rail-panel" aria-label="Production Readiness, Budget and Arrivals">
        <section class="ev-rail-card">
          <div class="ev-rail-card__head">
            <span class="ev-rail-card__title">${icon('spotlight', { size: 14 })} Show Readiness</span>
            <a href="#/budget" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Budget</a>
          </div>
          <div style="padding:12px 14px;display:grid;gap:11px">
            <div style="display:grid;gap:5px">
              <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
                <span>Spend vs Plan</span>
                <span class="${variance < 0 ? 'var-over' : 'var-under'}">${budPct}% (${money(budAct, { currency: cur })})</span>
              </div>
              <div class="tk-bar"><div class="tk-bar__fill ${variance < 0 ? 'tk-bar__fill--bad' : 'tk-bar__fill--ok'}" style="width:${budPct}%"></div></div>
            </div>
            <div class="tk-readiness">
              ${readiness.map((r) => html`
                <div class="${cls('tk-readiness__item', { 'is-done': r.done })}">
                  <span class="tk-readiness__dot">${icon(r.done ? 'check' : 'clock', { size: 11 })}</span>
                  <span>${r.label}</span>
                </div>`)}
            </div>
          </div>
        </section>

        ${pendingVendors.length ? html`
          <section class="ev-rail-card">
            <div class="ev-rail-card__head">
              <span class="ev-rail-card__title">${icon('store', { size: 14 })} Pending Booths</span>
              <a href="#/vendors" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Expo</a>
            </div>
            <div>
              ${pendingVendors.slice(0, 3).map((v) => html`
                <div class="ev-rail-item" data-key="rv-${v.id}">
                  <div class="ev-rail-item__top">
                    <div>
                      <div class="ev-rail-item__name">${v.company_name}</div>
                      <div class="ev-rail-item__sub">${v.booth_size} · ${v.contact_name}</div>
                    </div>
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="vnd-approve" data-id="${v.id}">Approve</button>
                  </div>
                </div>`)}
            </div>
          </section>` : ''}

        <section class="ev-rail-card">
          <div class="ev-rail-card__head">
            <span class="ev-rail-card__title">${icon('check-circle', { size: 14 })} Recent Door Arrivals</span>
            <a href="#/checkin" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Desk</a>
          </div>
          <div>
            ${(cmd?.recentCheckIns || []).length ? cmd.recentCheckIns.slice(0, 5).map((a) => {
              const diets = dietaryAlerts(a.dietary);
              return html`
                <div class="ev-rail-item" data-key="arr-${a.id}">
                  <div class="ev-rail-item__top">
                    <div>
                      <div class="ev-rail-item__name">${a.attendee_name}</div>
                      <div class="ev-rail-item__sub">${a.organization || a.email} · ${ago(a.checked_in_at)}</div>
                    </div>
                    <span class="tk-tag ${a.ticket_type === 'VIP' ? 'tk-tag--bad' : 'tk-tag--accent'}">${a.ticket_type}</span>
                  </div>
                  ${(diets.length || a.accessibility_needs) ? html`
                    <div class="alert-chip-row" style="margin-top:2px">
                      ${diets.map((d) => html`<span class="${dietBadgeClass(d)}">${d}</span>`)}
                      ${a.accessibility_needs ? html`<span class="access-badge">${a.accessibility_needs}</span>` : ''}
                    </div>` : ''}
                </div>`;
            }) : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">Tap Check In on the Check-In Desk as guests arrive.</div>`}
          </div>
        </section>
      </aside>
    </div>`;
}

export function renderCheckInView(state) {
  const c = state.session.counts || { totalRegistrations: 0, checkedIn: 0, checkInPct: 0 };
  const pct = c.checkInPct || 0;
  const ringColor = pct >= 75 ? '#34d399' : pct >= 35 ? '#f3c969' : '#ec4899';
  const dietCount = state.attendees.filter((a) => dietaryAlerts(a.dietary).length > 0).length;
  const accessCount = state.attendees.filter((a) => !!a.accessibility_needs).length;
  const q = state.attSearch.trim().toLowerCase();
  const rows = state.attendees.filter((a) => {
    if (state.attTicket !== 'All' && a.ticket_type !== state.attTicket) return false;
    if (state.attCheckIn === 'Checked In' && !a.checked_in) return false;
    if (state.attCheckIn === 'Not Checked In' && a.checked_in) return false;
    if (state.attAlertsOnly && !dietaryAlerts(a.dietary).length && !a.accessibility_needs) return false;
    if (!q) return true;
    return [a.attendee_name, a.organization, a.email, a.ticket_type, a.accessibility_needs, ...(a.dietary || [])].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const countCi = (f) => f === 'All' ? state.attendees.length : f === 'Checked In' ? state.attendees.filter((a) => a.checked_in).length : state.attendees.filter((a) => !a.checked_in).length;

  return html`
    <section class="ev-masthead" aria-label="Registration and Check-In Desk">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#4ade80"></span>
          FRONT DOOR OPS · 1-TAP CHECK-IN
        </div>
        <h1 class="ev-masthead__title">Check-In Desk</h1>
        <div class="ev-masthead__meta">
          <span>Instant guest lookup with dietary &amp; accessibility alert chips</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap emerald check-in toggles</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--ring">
          <div class="tk-ring" style="--p:${pct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${pct}%</span>
          </div>
          <div>
            <span class="ev-pod__lbl">Checked In</span>
            <div class="ev-pod__val" style="font-size:15.5px">${c.checkedIn} / ${c.totalRegistrations}</div>
            <span class="ev-pod__sub">${Math.max(0, (c.totalRegistrations || 0) - (c.checkedIn || 0))} awaiting</span>
          </div>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">Dietary Notes</span>
          <span class="ev-pod__val">${dietCount}</span>
          <span class="ev-pod__sub">Flagged guests</span>
        </div>
        <div class="ev-pod">
          <span class="ev-pod__lbl">Accessibility</span>
          <span class="ev-pod__val">${accessCount}</span>
          <span class="ev-pod__sub">Special assistance</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="att-new">${icon('plus', { size: 15 })} Register Guest</button>
      </div>

      <div class="ev-progress-strip" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="ev-progress-fill" style="width:${pct}%"></div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Instant search by name, org, dietary, access…" value="${state.attSearch}" data-input="att-search">
      </div>
      <div class="tk-segmented">
        ${['All', 'Not Checked In', 'Checked In'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.attCheckIn === f })}" data-action="att-ci-filter" data-val="${f}">${f} (${countCi(f)})</button>`)}
      </div>
      <button type="button" class="${cls('tk-pill', { 'is-on': state.attAlertsOnly })}" data-action="att-alerts-toggle">${icon('alert', { size: 13 })} Alerts (${state.attendees.filter((a) => dietaryAlerts(a.dietary).length || a.accessibility_needs).length})</button>
      <select class="k-input" style="width:auto;min-height:36px;padding:4px 10px" data-change="att-ticket-filter" aria-label="Filter by ticket type">
        <option value="All" ${state.attTicket === 'All' ? 'selected' : ''}>All Ticket Types</option>
        ${TICKET_TYPES.map((t) => html`<option value="${t}" ${state.attTicket === t ? 'selected' : ''}>${t}</option>`)}
      </select>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.attendees.length ? skeleton(4) : rows.length ? rows.map((a) => {
        const diets = dietaryAlerts(a.dietary);
        const hasAlerts = diets.length > 0 || !!a.accessibility_needs;
        return html`
          <div class="${cls('tk-row att-row', { 'att-row--checked': !!a.checked_in, 'att-row--alert': hasAlerts })}" data-key="att-${a.id}">
            <div class="ev-avatar" style="width:38px;height:38px;font-size:13px">${initials(a.attendee_name || 'G')}</div>
            <div class="tk-row__main">
              <div class="tk-row__title">
                <span>${a.attendee_name}</span>
                <span class="tk-tag ${a.ticket_type === 'VIP' ? 'tk-tag--bad' : a.ticket_type === 'Speaker' ? 'tk-tag--accent' : 'tk-tag--info'}">${a.ticket_type}</span>
                ${a.checked_in ? html`<span class="tk-tag tk-tag--ok">Arrived ${ago(a.checked_in_at)}</span>` : ''}
                ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                ${a.organization ? html`<span><strong>${a.organization}</strong></span>` : ''}
                <span>${a.email}</span>
                ${a.phone ? html`<span>${a.phone}</span>` : ''}
              </div>
              ${hasAlerts ? html`
                <div class="alert-chip-row">
                  ${diets.map((d) => html`<span class="${dietBadgeClass(d)}">${icon('utensils', { size: 12 })} ${d}</span>`)}
                  ${a.accessibility_needs ? html`<span class="access-badge">${icon('alert', { size: 12 })} Access: ${a.accessibility_needs}</span>` : ''}
                </div>` : ''}
            </div>
            <div class="tk-row__aside">
              <button type="button" class="checkin-btn ${a.checked_in ? 'checkin-btn--in' : 'checkin-btn--out'}" data-action="att-toggle-ci" data-id="${a.id}" aria-pressed="${a.checked_in ? 'true' : 'false'}">
                ${icon(a.checked_in ? 'check-circle' : 'ticket', { size: 17 })}
                ${a.checked_in ? 'Checked In' : 'Tap to Check In'}
              </button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="att-edit" data-id="${a.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="att-del" data-id="${a.id}">Remove</button>
            </div>
          </div>`;
      }) : emptyState({ iconName: 'ticket', title: 'No attendees match', text: 'Register a walk-in or adjust the search and ticket filters.' })}
    </section>`;
}

export function wireCheckInActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="cue-filter"]', (e, el) => { state.cueFilter = el.dataset.val; draw(); });
  on(root, 'input', '[data-input="att-search"]', (e, el) => { state.attSearch = el.value; draw(); });
  on(root, 'click', '[data-action="att-ci-filter"]', (e, el) => { state.attCheckIn = el.dataset.val; draw(); });
  on(root, 'click', '[data-action="att-alerts-toggle"]', () => { state.attAlertsOnly = !state.attAlertsOnly; draw(); });
  on(root, 'change', '[data-change="att-ticket-filter"]', (e, el) => { state.attTicket = el.value; draw(); });

  on(root, 'click', '[data-action="att-toggle-ci"]', async (e, el) => {
    try {
      const res = await api.post('/api/attendees/checkin', { id: Number(el.dataset.id) });
      toast.success(res.attendee.checked_in ? `${res.attendee.attendee_name} checked in!` : `Check-in undone for ${res.attendee.attendee_name}.`);
      await loadScreen('/checkin');
    } catch (err) { toastError(err); }
  });

  const attFields = (a = {}) => {
    const picked = new Set(a.dietary || []);
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Full Name</span><input class="k-input" name="attendee_name" value="${a.attendee_name || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Organization</span><input class="k-input" name="organization" value="${a.organization || ''}"></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${a.email || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${a.phone || ''}"></label>
        <label class="k-field"><span class="k-field__label">Ticket Type</span><select class="k-input" name="ticket_type">${TICKET_TYPES.map((t) => html`<option value="${t}" ${t === (a.ticket_type || 'General Admission') ? 'selected' : ''}>${t}</option>`)}</select></label>
      </div>
      <div class="k-field">
        <span class="k-field__label">Dietary Requirements</span>
        <div class="tk-btn-row">
          ${DIETARY_OPTS.map((d) => html`<label class="k-check" style="margin-right:8px"><input type="checkbox" name="dietary" value="${d}" ${picked.has(d) ? 'checked' : ''}><span>${d}</span></label>`)}
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Accessibility Needs</span><input class="k-input" name="accessibility_needs" value="${a.accessibility_needs || ''}" placeholder="Wheelchair ramp, ASL, aisle seat…"></label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Emergency Contact Name</span><input class="k-input" name="emergency_contact_name" value="${a.emergency_contact_name || ''}"></label>
        <label class="k-field"><span class="k-field__label">Emergency Contact Phone</span><input class="k-input" name="emergency_contact_phone" value="${a.emergency_contact_phone || ''}"></label>
      </div>`;
  };

  on(root, 'click', '[data-action="att-new"]', async () => {
    const made = await formDialog({
      title: 'Register Attendee',
      submitLabel: 'Save Registration',
      fields: attFields(),
      onSubmit: (v) => api.post('/api/attendees', { ...v, dietary: Array.isArray(v.dietary) ? v.dietary : [] }),
    });
    if (made) { toast.success('Attendee registered.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="att-edit"]', async (e, el) => {
    const a = state.attendees.find((x) => String(x.id) === el.dataset.id);
    if (!a) return;
    const saved = await formDialog({
      title: `Edit ${a.attendee_name}`,
      submitLabel: 'Save Changes',
      fields: attFields(a),
      onSubmit: (v) => api.put('/api/attendees', { ...v, id: a.id, dietary: Array.isArray(v.dietary) ? v.dietary : [] }),
    });
    if (saved) { toast.success('Registration updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="att-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove attendee?', message: 'Delete this registration permanently?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/attendees', { id: Number(el.dataset.id) }); toast.success('Removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-runsheet"]', () => {
    const s = state.session.settings;
    const c = state.command?.counts || state.session.counts || {};
    const items = buildRunSheet(state);
    copyText(formatRunSheetText(items, s, c), {
      title: `${s.event_title || 'Event'} Run Sheet`,
      done: 'Run sheet copied!',
    });
  });

  on(root, 'click', '[data-action="print-runsheet"]', () => {
    const s = state.session.settings;
    const c = state.command?.counts || state.session.counts || {};
    const items = buildRunSheet(state);
    downloadHtmlDoc(`event-runsheet-${today()}.html`, {
      title: `${s.event_title || 'Event'} Run Sheet`,
      businessName: s.business_name,
      subtitle: `${s.event_venue || ''} · ${s.event_date ? fmtDay(s.event_date) : today()}`,
      accent: '#9b1cb8',
      bodyHtml: `
        <div class="box"><strong>Check-In:</strong> ${c.checkedIn || 0}/${c.totalRegistrations || 0} (${c.checkInPct || 0}%) · <strong>Speakers:</strong> ${c.confirmedSpeakers || 0} · <strong>Booths:</strong> ${c.assignedBooths || 0} · <strong>Volunteers:</strong> ${c.volunteers || 0}</div>
        <h3>Chronological Run Sheet</h3>
        <table><thead><tr><th>Time</th><th>Type</th><th>Item</th><th>Owner</th><th>Details</th></tr></thead><tbody>
          ${items.map((x) => `<tr><td><strong>${esc(x.time)}</strong></td><td>${esc(x.kindLabel)}</td><td><strong>${esc(x.title)}</strong></td><td>${esc(x.owner)}</td><td>${esc(x.detail || '—')}</td></tr>`).join('') || '<tr><td colspan="5">No scheduled items</td></tr>'}
        </tbody></table>`,
    });
  });
}
