// Daily Appointment Book: Unified Velvet Espresso & Champagne Masthead with Settlement Ring,
// Two-Column Stylist Chair Book / Timeline + Sticky Walk-In, Front Desk & Retail Pulse Rail,
// 1-Click Check In -> In Chair -> Paid, Rose-Gold Colour Formulas & Quick-Rebook (+4w/+6w/+8w).
import { html, on, cls, qs } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, addDays, fmtDay, fmtDayNear, fmtDuration } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const STATUS_TAG = {
  Booked: '',
  Confirmed: 'tk-tag--info',
  'In Chair': 'tk-tag--warn',
  Completed: 'tk-tag--accent',
  Paid: 'tk-tag--ok',
  'No-show': 'tk-tag--bad',
  Cancelled: 'tk-tag--bad',
};

const STATUS_DISPLAY = {
  Booked: 'Booked',
  Confirmed: 'Checked In',
  'In Chair': 'In Chair',
  Completed: 'Completed',
  Paid: 'Paid',
  'No-show': 'No-show',
  Cancelled: 'Cancelled',
};

export function serviceCatClass(cat) {
  if (cat === 'Cut' || cat === 'Hair') return 'sl-cat-cut';
  if (cat === 'Colour') return 'sl-cat-colour';
  if (cat === 'Treatment') return 'sl-cat-treatment';
  if (cat === 'Nails') return 'sl-cat-nails';
  return 'sl-cat-beauty';
}

function slotEnd(timeStr, mins) {
  const [h, m] = String(timeStr || '09:00').split(':').map(Number);
  const start = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
  const end = start + (Number(mins) || 45);
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function cardClass(status) {
  if (status === 'Confirmed') return 'sl-appt-card sl-appt-card--confirmed';
  if (status === 'In Chair') return 'sl-appt-card sl-appt-card--chair';
  if (status === 'Completed') return 'sl-appt-card sl-appt-card--done';
  if (status === 'Paid') return 'sl-appt-card sl-appt-card--paid';
  if (status === 'Cancelled' || status === 'No-show') return 'sl-appt-card sl-appt-card--off';
  return 'sl-appt-card';
}

function renderStatusButtons(a) {
  if (a.status === 'Booked') {
    return html`
      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Confirmed">
        ${icon('check', { size: 13 })} Check In
      </button>`;
  }
  if (a.status === 'Confirmed') {
    return html`
      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="In Chair">
        ${icon('scissors', { size: 13 })} In Chair
      </button>`;
  }
  if (a.status === 'In Chair') {
    return html`
      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Paid">
        ${icon('dollar', { size: 13 })} Mark Paid
      </button>
      <button type="button" class="k-btn k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Completed">Finish</button>`;
  }
  if (a.status === 'Completed') {
    return html`
      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Paid">
        ${icon('dollar', { size: 13 })} Mark Paid
      </button>`;
  }
  return '';
}

export async function printClientReceipt(clientId, refDate, state) {
  const hist = await api.get('/api/clients/history', { id: clientId });
  const client = hist.client;
  const settings = state.session.settings;
  const cur = settings.currency || 'AUD';
  const taxRate = Number(settings.tax_rate || 0);
  const appts = refDate
    ? (hist.appointments || []).filter((a) => a.appt_date === refDate && a.status !== 'Cancelled' && a.status !== 'No-show')
    : (hist.appointments || []).slice(0, 6);
  const sales = refDate
    ? (hist.sales || []).filter((s) => s.sale_date === refDate)
    : (hist.sales || []).slice(0, 6);

  const lines = [];
  for (const a of appts) {
    lines.push({ desc: `${a.service_name} (${a.stylist_name || 'Stylist'}) — ${fmtDay(a.appt_date)}`, qty: 1, cents: Number(a.price_cents || 0) });
  }
  for (const s of sales) {
    lines.push({ desc: `Retail: ${s.product_name} — ${fmtDay(s.sale_date)}`, qty: s.quantity, cents: Number(s.amount_cents || 0) });
  }
  const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);
  const taxIncluded = taxRate > 0 ? Math.round(totalCents - totalCents / (1 + taxRate / 100)) : 0;

  const rowsHtml = lines.map((l) => `<tr><td>${l.desc}</td><td class="num">${l.qty}</td><td class="num">${money(l.cents, { currency: cur })}</td></tr>`).join('');
  downloadHtmlDoc(`salon-receipt-${client.name.toLowerCase().replaceAll(' ', '-')}-${refDate || today()}.html`, {
    title: 'Client Receipt',
    businessName: settings.business_name,
    subtitle: [settings.address, settings.phone, settings.tax_id ? 'Tax ID: ' + settings.tax_id : ''].filter(Boolean).join(' · ') || (settings.tagline || 'Hair Salon & Beauty Studio'),
    accent: '#922649',
    bodyHtml: `
      <div class="box">
        <strong>Client:</strong> ${client.name}${client.phone ? ' · ' + client.phone : ''}${client.email ? ' · ' + client.email : ''}<br>
        <strong>Date:</strong> ${fmtDay(refDate || today())}
      </div>
      <table>
        <thead><tr><th>Service / Retail Product</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="3">No billable services or retail items found for this date.</td></tr>'}
          ${taxRate > 0 ? `<tr><td colspan="2">Includes Tax (${taxRate}%)</td><td class="num">${money(taxIncluded, { currency: cur })}</td></tr>` : ''}
          <tr class="total-row"><td colspan="2">Total</td><td class="num">${money(totalCents, { currency: cur })}</td></tr>
        </tbody>
      </table>
      <p style="margin-top:20px;font-size:13px;color:#6f5260">Thank you for visiting ${settings.business_name}! We look forward to welcoming you again.</p>`,
  });
}

function renderApptCard(a, currency, showStylist = false) {
  const isFinished = a.status === 'Completed' || a.status === 'Paid';
  return html`
    <article class="${cardClass(a.status)}" data-key="appt-${a.id}">
      <div class="tk-ticket__top">
        <span>${a.client_name || 'Client #' + a.client_id}</span>
        <span class="sl-price">${money(a.price_cents, { currency })}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
        <span class="sl-slot">${icon('clock', { size: 12 })} ${a.appt_time}–${slotEnd(a.appt_time, a.duration_minutes)} · ${fmtDuration(a.duration_minutes)}</span>
        ${a.service_category ? html`<span class="tk-tag ${serviceCatClass(a.service_category)}">${a.service_category}</span>` : ''}
        <span class="tk-tag ${STATUS_TAG[a.status] || ''}">${STATUS_DISPLAY[a.status] || a.status}</span>
        ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
      </div>
      <div class="tk-ticket__meta">
        <div><strong>${a.service_name || 'Service'}</strong>${showStylist ? ' · ' + (a.stylist_name || 'Stylist') : ''}</div>
        ${a.notes ? html`<div>${a.notes}</div>` : ''}
      </div>
      ${a.client_notes ? (() => {
        const cleanNote = String(a.client_notes).trim().replace(/^formula:\s*/i, '');
        return html`
        <div class="sl-mini-formula">
          <span><strong>Formula:</strong> ${cleanNote.slice(0, 90)}${cleanNote.length > 90 ? '…' : ''}</span>
          <button type="button" class="formula-box__copy" data-action="appt-copy-formula" data-id="${a.id}" title="Copy client formula">${icon('copy', { size: 11 })}</button>
        </div>`;
      })() : ''}
      <div class="tk-ticket__foot">
        <div class="tk-btn-row">
          ${renderStatusButtons(a)}
          ${isFinished ? html`
            <button type="button" class="k-btn k-btn--sm" data-action="appt-receipt" data-client="${a.client_id}" data-day="${a.appt_date}">
              ${icon('receipt', { size: 13 })} Receipt
            </button>` : ''}
        </div>
        <div class="tk-btn-row">
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="appt-edit" data-id="${a.id}">Edit</button>
        </div>
      </div>
      ${isFinished ? html`
        <div class="sl-rebook-strip">
          <span class="sl-rebook-strip__lbl">${icon('calendar', { size: 11 })} Rebook:</span>
          <button type="button" class="sl-rebook-pill" data-action="appt-rebook" data-id="${a.id}" data-weeks="4">+4w</button>
          <button type="button" class="sl-rebook-pill" data-action="appt-rebook" data-id="${a.id}" data-weeks="6">+6w</button>
          <button type="button" class="sl-rebook-pill" data-action="appt-rebook" data-id="${a.id}" data-weeks="8">+8w</button>
        </div>` : ''}
    </article>`;
}

export function renderBookView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const counts = state.session.counts || {};
  const activeAppts = state.appointments.filter((a) => a.status !== 'Cancelled' && a.status !== 'No-show');
  const statusFilter = state.bookStatusFilter || 'All';
  const filteredAppts = statusFilter === 'All'
    ? state.appointments
    : state.appointments.filter((a) => a.status === statusFilter);

  const dayRev = activeAppts.reduce((s, a) => s + Number(a.price_cents || 0), 0);
  const paidRev = activeAppts.filter((a) => a.status === 'Paid').reduce((s, a) => s + Number(a.price_cents || 0), 0);
  const paidPct = dayRev > 0 ? Math.round((paidRev / dayRev) * 100) : 0;
  const inChair = activeAppts.filter((a) => a.status === 'In Chair').length;
  const activeStylists = state.stylists.filter((s) => Number(s.active) === 1);
  const chairStylists = activeStylists.length ? activeStylists : state.stylists;

  const frontDeskQueue = activeAppts.filter((a) => a.status === 'Booked' || a.status === 'Confirmed' || a.status === 'In Chair' || a.status === 'Completed');
  const todayRetailCents = state.salesSummary ? state.salesSummary.todayRevenueCents : (counts.todayRetailCents || 0);
  const todayRetailUnits = state.salesSummary ? state.salesSummary.todayUnits : (counts.todayRetailUnits || 0);

  return html`
    ${renderSampleBanner(counts.sampleCount)}

    <section class="sl-masthead" aria-label="Salon Appointment Book Command">
      <div class="sl-masthead__copy">
        <div class="sl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${inChair > 0 ? '#edd2ab' : '#f472b6'}"></span>
          ATELIER FRONT DESK · ${fmtDayNear(state.bookDate).toUpperCase()}
        </div>
        <h1 class="sl-masthead__title">Daily Chair Book</h1>
        <div class="sl-masthead__meta">
          <span><strong style="color:#f6dec0">${activeAppts.length} appointment${activeAppts.length === 1 ? '' : 's'}</strong> booked</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${inChair} guest${inChair === 1 ? '' : 's'} currently in chair</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Rose-gold formulas &amp; 1-click rebook</span>
        </div>
      </div>

      <div class="sl-masthead__pods sl-masthead__pods--3" style="align-items:center">
        <div class="sl-pod sl-pod--ring sl-pod--champagne">
          <div class="tk-ring" style="--p:${paidPct}%;--ring-color:#edd2ab;--ring-size:48px">
            <span class="tk-ring__val">${paidPct}%</span>
          </div>
          <div>
            <span class="sl-pod__lbl">Settled</span>
            <span class="sl-pod__val">${money(paidRev, { currency })}</span>
            <span class="sl-pod__sub">of ${money(dayRev, { currency })}</span>
          </div>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('salon-chair', { size: 12 })} Active Chairs</span>
          <span class="sl-pod__val">${inChair}/${chairStylists.length}</span>
          <span class="sl-pod__sub">Stylists on floor</span>
        </div>

        <a href="#/retail" class="sl-pod">
          <span class="sl-pod__lbl">${icon('serum-bottle', { size: 12 })} Retail</span>
          <span class="sl-pod__val">${money(todayRetailCents, { currency })}</span>
          <span class="sl-pod__sub">${todayRetailUnits} item${todayRetailUnits === 1 ? '' : 's'} →</span>
        </a>

        <a href="#/clients" class="sl-pod">
          <span class="sl-pod__lbl">${icon('colour-bowl', { size: 12 })} Clientele</span>
          <span class="sl-pod__val">${counts.totalClients || state.clients.length}</span>
          <span class="sl-pod__sub">Formula cards →</span>
        </a>

        <div class="sl-masthead__actions">
          <button type="button" class="k-btn sl-cta-gold" data-action="appt-new">${icon('plus', { size: 15 })} Book Chair</button>
          <a href="#/clients" class="k-btn sl-cta-glass k-btn--sm">${icon('colour-bowl', { size: 14 })} Formulas</a>
        </div>
      </div>
    </section>

    <div class="sl-split">
      <div class="tk-stack" style="gap:14px">
        <div class="sl-daybar">
          <div class="sl-daybar__row">
            <button type="button" class="k-btn k-btn--sm" data-action="book-day-shift" data-delta="-1" aria-label="Previous day">${icon('chevron-left', { size: 15 })}</button>
            <button type="button" class="k-btn k-btn--sm" data-action="book-day-today">Today</button>
            <button type="button" class="k-btn k-btn--sm" data-action="book-day-shift" data-delta="1" aria-label="Next day">${icon('chevron-right', { size: 15 })}</button>
            <input class="k-input" type="date" style="width:auto;min-height:32px;padding:3px 9px;font-size:13px" data-action="book-day-pick" value="${state.bookDate}">
            <strong style="font-size:13.5px;white-space:nowrap">${fmtDay(state.bookDate, { weekday: 'short' })}</strong>
            <div class="sl-daybar__spacer"></div>
            <div class="tk-segmented" role="group" aria-label="Schedule view">
              <button type="button" class="${cls('tk-pill', { 'is-on': state.bookMode === 'stylist' })}" data-action="book-mode" data-mode="stylist">${icon('grid', { size: 13 })} Chairs</button>
              <button type="button" class="${cls('tk-pill', { 'is-on': state.bookMode === 'chrono' })}" data-action="book-mode" data-mode="chrono">${icon('list', { size: 13 })} Timeline</button>
            </div>
          </div>
          <div class="sl-daybar__row">
            <div class="tk-segmented" role="group" aria-label="Filter appointments by status">
              ${['All', 'Booked', 'Confirmed', 'In Chair', 'Paid'].map((st) => {
                const n = st === 'All' ? state.appointments.length : state.appointments.filter((a) => a.status === st).length;
                return html`<button type="button" class="${cls('tk-pill', { 'is-on': statusFilter === st })}" data-action="book-status-filter" data-status="${st}">${STATUS_DISPLAY[st] || st}${n ? ` (${n})` : ''}</button>`;
              })}
            </div>
          </div>
        </div>

        ${state.loading && !state.appointments.length ? html`
          <section class="tk-sheet">${skeleton(4)}</section>
        ` : filteredAppts.length ? (
          state.bookMode === 'stylist' ? html`
            <div class="sl-chairs">
              ${chairStylists.map((st) => {
                const chairAppts = filteredAppts
                  .filter((a) => a.stylist_id === st.id)
                  .slice()
                  .sort((x, y) => String(x.appt_time || '').localeCompare(String(y.appt_time || '')));
                const billable = chairAppts.filter((a) => a.status !== 'Cancelled' && a.status !== 'No-show');
                const chairRevCents = billable.reduce((sum, a) => sum + Number(a.price_cents || 0), 0);
                const chairPaidCents = billable.filter((a) => a.status === 'Paid').reduce((sum, a) => sum + Number(a.price_cents || 0), 0);
                const mins = billable.reduce((s, a) => s + Number(a.duration_minutes || 0), 0);
                return html`
                  <section class="sl-chair" data-key="chair-${st.id}">
                    <div class="sl-chair__head">
                      <div class="sl-chair__top">
                        <div class="sl-chair__who">
                          <span class="sl-chair__avatar">${initials(st.name || 'S')}</span>
                          <div>
                            <div class="sl-chair__name">${st.name}</div>
                            <div class="sl-chair__role">${st.role}</div>
                          </div>
                        </div>
                        <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="chair-book" data-stylist="${st.id}">
                          ${icon('plus', { size: 12 })} Book
                        </button>
                      </div>
                      <div class="sl-chair__rev">
                        <span class="sl-chair__rev-pill">${money(chairRevCents, { currency })}</span>
                        <div style="display:flex;align-items:center;gap:5px">
                          <span class="sl-chair__rev-meta">${billable.length} · ${fmtDuration(mins)}</span>
                          ${chairPaidCents > 0 ? html`<span class="sl-chair__paid">${money(chairPaidCents, { currency })} paid</span>` : ''}
                        </div>
                      </div>
                    </div>
                    <div class="sl-chair__body">
                      ${chairAppts.length ? chairAppts.map((a) => renderApptCard(a, currency, false)) : html`<p class="tk-muted" style="font-size:13px;padding:10px 4px">Chair open for walk-ins</p>`}
                    </div>
                  </section>`;
              })}
            </div>` : html`
            <div class="tk-stack" style="gap:12px">
              ${filteredAppts.map((a) => renderApptCard(a, currency, true))}
            </div>`
        ) : emptyState({
          iconName: 'scissors',
          title: `No appointments match on ${fmtDay(state.bookDate)}`,
          text: 'Clear your status filter or book a cut, colour, treatment, nails or beauty session.',
          action: html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-new">Book Appointment</button>`,
        })}
      </div>

      <aside class="sl-rail-panel" aria-label="Walk-In, Stylist & Retail Pulse">
        <section class="sl-rail-card">
          <div class="sl-rail-card__head">
            <span class="sl-rail-card__title">${icon('salon-chair', { size: 14 })} Walk-In &amp; Chair Pulse</span>
            <a href="#/stylists" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Roster</a>
          </div>
          <div class="sl-rail-list">
            ${chairStylists.map((st) => {
              const myAppts = activeAppts.filter((a) => a.stylist_id === st.id);
              const busyNow = myAppts.some((a) => a.status === 'In Chair');
              const myRev = myAppts.reduce((s, a) => s + Number(a.price_cents || 0), 0);
              return html`
                <div class="sl-rail-item" data-key="rail-st-${st.id}">
                  <div class="sl-rail-item__top">
                    <div style="min-width:0">
                      <div class="sl-rail-item__name" style="display:flex;align-items:center;gap:7px">
                        <span class="${cls('sl-status-dot', { 'sl-status-dot--busy': busyNow })}"></span>
                        <span>${st.name}</span>
                      </div>
                      <div class="sl-rail-item__sub">${busyNow ? 'Currently In Chair' : 'Open for Walk-In'} · ${myAppts.length} appt${myAppts.length === 1 ? '' : 's'}</div>
                    </div>
                    <strong style="font-size:13px;font-variant-numeric:tabular-nums;color:var(--k-accent)">${money(myRev, { currency })}</strong>
                  </div>
                  <div class="sl-rail-item__foot">
                    <span style="font-size:11.5px;color:var(--k-muted)">${st.role}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="chair-book" data-stylist="${st.id}">+ Walk-In</button>
                  </div>
                </div>`;
            })}
          </div>
        </section>

        <section class="sl-rail-card">
          <div class="sl-rail-card__head">
            <span class="sl-rail-card__title">${icon('check-circle', { size: 14 })} Front Desk Flow</span>
            <span class="tk-tag tk-tag--accent">${frontDeskQueue.length}</span>
          </div>
          ${frontDeskQueue.length ? html`
            <div class="sl-rail-list">
              ${frontDeskQueue.slice(0, 4).map((a) => html`
                <div class="sl-rail-item" data-key="rail-fd-${a.id}">
                  <div class="sl-rail-item__top">
                    <div>
                      <div class="sl-rail-item__name">${a.client_name} · ${a.appt_time}</div>
                      <div class="sl-rail-item__sub">${a.service_name} (${a.stylist_name})</div>
                    </div>
                    <span class="tk-tag ${STATUS_TAG[a.status] || ''}">${STATUS_DISPLAY[a.status] || a.status}</span>
                  </div>
                  <div class="sl-rail-item__foot">
                    <span class="sl-price" style="font-size:12.5px">${money(a.price_cents, { currency })}</span>
                    ${a.status === 'Booked'
                      ? html`<button type="button" class="k-btn k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Confirmed">Check In ✓</button>`
                      : a.status === 'Confirmed'
                        ? html`<button type="button" class="k-btn k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="In Chair">Seat ✓</button>`
                        : html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="appt-bump" data-id="${a.id}" data-status="Paid">Mark Paid ✓</button>`}
                  </div>
                </div>`)}
            </div>
          ` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All appointments settled for this date ✓</div>`}
        </section>

        <section class="sl-rail-card">
          <div class="sl-rail-card__head">
            <span class="sl-rail-card__title">${icon('serum-bottle', { size: 14 })} Retail Counter</span>
            <a href="#/retail" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Log</a>
          </div>
          <div class="sl-rail-list">
            <div class="sl-rail-item">
              <div class="sl-rail-item__top">
                <div>
                  <div class="sl-rail-item__name">${money(todayRetailCents, { currency })} today</div>
                  <div class="sl-rail-item__sub">${todayRetailUnits} take-home product${todayRetailUnits === 1 ? '' : 's'} sold</div>
                </div>
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sale-new-quick">+ Retail</button>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  `;
}

export async function openAppointmentForm(state, { loadScreen }, preset = {}) {
  if (!state.clients.length || !state.services.length || !state.stylists.length) {
    const [c, sv, st] = await Promise.all([api.get('/api/clients'), api.get('/api/services'), api.get('/api/stylists', { day: today() })]);
    state.clients = c.clients || [];
    state.services = sv.services || [];
    state.stylists = st.stylists || [];
  }
  if (!state.clients.length) { toast.error('Add a client card first.'); return; }
  if (!state.services.length) { toast.error('Add a service to the menu first.'); return; }
  if (!state.stylists.length) { toast.error('Add a stylist to the roster first.'); return; }

  const isEdit = Boolean(preset.id);
  const initialSvc = state.services.find((s) => String(s.id) === String(preset.service_id)) || state.services[0];
  const initDur = preset.duration_minutes || initialSvc.duration_minutes || 45;
  const initPrice = preset.price_cents !== undefined ? (preset.price_cents / 100).toFixed(2) : (initialSvc.price_cents / 100).toFixed(2);
  const activeStylists = state.stylists.filter((s) => Number(s.active) === 1 || String(s.id) === String(preset.stylist_id));

  const saved = await formDialog({
    title: isEdit ? 'Edit Appointment' : (preset.rebookTitle || 'Book Salon Appointment'),
    submitLabel: isEdit ? 'Save changes' : 'Book Appointment',
    fields: html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>
            ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(preset.client_id) ? 'selected' : ''}>${c.name}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Stylist</span>
          <select class="k-input" name="stylist_id" required>
            ${(activeStylists.length ? activeStylists : state.stylists).map((st) => html`<option value="${st.id}" ${String(st.id) === String(preset.stylist_id) ? 'selected' : ''}>${st.name} (${st.role})</option>`)}
          </select>
        </label>
      </div>
      <label class="k-field"><span class="k-field__label">Service (auto-fills duration &amp; price)</span>
        <select class="k-input" name="service_id" data-svc-select required>
          ${state.services.map((sv) => html`<option value="${sv.id}" ${String(sv.id) === String(initialSvc.id) ? 'selected' : ''}>${sv.name} · ${sv.duration_minutes}m · ${(sv.price_cents / 100).toFixed(2)}</option>`)}
        </select>
      </label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="appt_date" value="${preset.appt_date || state.bookDate || today()}" required></label>
        <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="appt_time" value="${preset.appt_time || '10:00'}" required></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Duration (mins)</span><input class="k-input" type="number" min="5" max="480" step="5" name="duration_minutes" value="${initDur}" required></label>
        <label class="k-field"><span class="k-field__label">Price</span><input class="k-input" type="number" step="0.01" min="0" name="price" value="${initPrice}" required></label>
        ${isEdit ? html`
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">
              ${['Booked', 'Confirmed', 'In Chair', 'Completed', 'Paid', 'No-show', 'Cancelled'].map((st) => html`<option value="${st}" ${st === preset.status ? 'selected' : ''}>${st}</option>`)}
            </select>
          </label>` : ''}
      </div>
      <label class="k-field"><span class="k-field__label">Appointment Notes</span><textarea class="k-input" name="notes" rows="2" placeholder="Toner mix, fringe trim, celebration…">${preset.notes || ''}</textarea></label>`,
    onOpen: ({ form }) => {
      on(form, 'change', '[data-svc-select]', (ev, sel) => {
        const svc = state.services.find((s) => String(s.id) === String(sel.value));
        if (!svc) return;
        const durEl = qs('input[name="duration_minutes"]', form);
        const priceEl = qs('input[name="price"]', form);
        if (durEl) durEl.value = String(svc.duration_minutes);
        if (priceEl) priceEl.value = (svc.price_cents / 100).toFixed(2);
      });
    },
    onSubmit: (v) => isEdit ? api.put('/api/appointments', { ...v, id: preset.id }) : api.post('/api/appointments', v),
  });
  if (saved) { toast.success(isEdit ? 'Appointment updated.' : 'Appointment booked.'); await loadScreen(); }
}

export function wireBookActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="book-day-shift"]', (e, el) => {
    state.bookDate = addDays(state.bookDate, Number(el.dataset.delta));
    loadScreen('/');
  });
  on(root, 'click', '[data-action="book-day-today"]', () => { state.bookDate = today(); loadScreen('/'); });
  on(root, 'change', '[data-action="book-day-pick"]', (e, el) => { if (el.value) { state.bookDate = el.value; loadScreen('/'); } });
  on(root, 'click', '[data-action="book-mode"]', (e, el) => { state.bookMode = el.dataset.mode; draw(); });
  on(root, 'click', '[data-action="book-status-filter"]', (e, el) => { state.bookStatusFilter = el.dataset.status || 'All'; draw(); });

  on(root, 'click', '[data-action="appt-new"]', () => openAppointmentForm(state, { loadScreen }));
  on(root, 'click', '[data-action="chair-book"]', (e, el) => {
    openAppointmentForm(state, { loadScreen }, { stylist_id: Number(el.dataset.stylist) });
  });
  on(root, 'click', '[data-action="appt-edit"]', (e, el) => {
    const a = state.appointments.find((x) => String(x.id) === el.dataset.id);
    if (a) openAppointmentForm(state, { loadScreen }, a);
  });
  on(root, 'click', '[data-action="appt-bump"]', async (e, el) => {
    try {
      await api.post('/api/appointments/status', { id: Number(el.dataset.id), status: el.dataset.status });
      const label = STATUS_DISPLAY[el.dataset.status] || el.dataset.status;
      toast.success(`Appointment marked ${label}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="sale-new-quick"]', async () => {
    if (!state.clients.length) { const c = await api.get('/api/clients'); state.clients = c.clients || []; }
    if (!state.clients.length) { toast.error('Add a client card first.'); return; }
    const made = await formDialog({
      title: 'Quick Retail Sale',
      submitLabel: 'Record Sale',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Product Name</span><input class="k-input" name="product_name" placeholder="e.g. Peptide Bond Leave-In Serum" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Quantity</span><input class="k-input" type="number" min="1" max="100" name="quantity" value="1" required></label>
          <label class="k-field"><span class="k-field__label">Total Amount</span><input class="k-input" type="number" step="0.01" min="0" name="amount" value="48.00" required></label>
          <label class="k-field"><span class="k-field__label">Sale Date</span><input class="k-input" type="date" name="sale_date" value="${state.bookDate || today()}" required></label>
        </div>`,
      onSubmit: (v) => api.post('/api/sales', v),
    });
    if (made) { toast.success('Retail sale recorded.'); await loadScreen('/'); }
  });
  on(root, 'click', '[data-action="appt-copy-formula"]', (e, el) => {
    const a = state.appointments.find((x) => String(x.id) === el.dataset.id);
    if (!a || !a.client_notes) return;
    copyText(`${a.client_name} — Colour Formula & Preferences:\n${a.client_notes}`, {
      title: `Colour Formula · ${a.client_name}`,
      done: `Copied formula for ${a.client_name}!`,
    });
  });
  on(root, 'click', '[data-action="appt-rebook"]', (e, el) => {
    const a = state.appointments.find((x) => String(x.id) === el.dataset.id);
    if (!a) return;
    const weeks = Number(el.dataset.weeks) || 6;
    openAppointmentForm(state, { loadScreen }, {
      rebookTitle: `Quick Rebook (+${weeks} weeks) · ${a.client_name}`,
      client_id: a.client_id,
      service_id: a.service_id,
      stylist_id: a.stylist_id,
      appt_date: addDays(a.appt_date, weeks * 7),
      appt_time: a.appt_time,
      duration_minutes: a.duration_minutes,
      price_cents: a.price_cents,
      notes: a.notes,
    });
  });
  on(root, 'click', '[data-action="appt-receipt"]', async (e, el) => {
    try { await printClientReceipt(Number(el.dataset.client), el.dataset.day, state); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="appt-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete appointment?', message: 'Delete this booked appointment?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/appointments', { id: Number(el.dataset.id) }); toast.success('Appointment deleted.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });
}
