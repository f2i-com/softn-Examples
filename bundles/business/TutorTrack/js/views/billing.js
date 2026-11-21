// Tutors Roster (Unified Oxford Navy & Gold Masthead & Banded Faculty Cards)
// + Billing & Tuition Invoices (Unified Masthead with Collection Rate Ring & Responsive Invoice Rows).
import { html, esc, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, addDays, fmtDay, daysBetween } from '../../kit/time.js';
import { money, initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { tutorColor, subjectBadgeClass } from './schedule.js';

const SUBJECTS = ['Mathematics', 'English', 'Science', 'Piano', 'Guitar', 'Violin', 'Spanish', 'French'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAYS = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const INV_STATUSES = ['Draft', 'Unpaid', 'Sent', 'Paid', 'Overdue'];

function tutorFields(t = {}) {
  const subs = t.subjects || [];
  const avail = t.availability || [];
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Tutor Name</span><input class="k-input" name="tutor_name" value="${t.tutor_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Hourly Rate</span><input class="k-input" type="number" step="1" min="0" name="hourly_rate" value="${t.hourly_rate_cents != null ? (t.hourly_rate_cents / 100).toFixed(2) : '75.00'}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${t.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${t.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${(t.active || 'Active') === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${t.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Subjects / Instruments Taught</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${SUBJECTS.map((sub) => html`<label class="k-check"><input type="checkbox" name="subjects" value="${sub}" ${subs.includes(sub) ? 'checked' : ''}><span>${sub}</span></label>`)}
      </div>
    </div>
    <div class="k-field">
      <span class="k-field__label">Weekly Availability</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${WEEKDAYS.map((d) => html`<label class="k-check"><input type="checkbox" name="availability" value="${d}" ${avail.includes(d) ? 'checked' : ''}><span>${SHORT_DAYS[d]}</span></label>`)}
      </div>
    </div>`;
}

export function renderTutorsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const activeCount = state.tutors.filter((t) => t.active === 'Active').length;
  const avgRate = state.tutors.length
    ? Math.round(state.tutors.reduce((s, t) => s + Number(t.hourly_rate_cents || 0), 0) / state.tutors.length)
    : 0;
  const totalLessons = state.tutors.reduce((s, t) => s + Number(t.lesson_count || 0), 0);

  return html`
    <section class="tt-masthead" aria-label="Teaching Faculty">
      <div class="tt-masthead__copy">
        <div class="tt-masthead__eyebrow">
          ${icon('award', { size: 12 })} TEACHING FACULTY &amp; AVAILABILITY
        </div>
        <h1 class="tt-masthead__title">Tutors Roster</h1>
        <div class="tt-masthead__meta">
          <span>Auto-calculated lesson fees</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Weekly availability</span>
        </div>
      </div>

      <div class="tt-masthead__pods" style="align-items:center">
        <div class="tt-pod tt-pod--gold">
          <span class="tt-pod__lbl">${icon('award', { size: 12 })} Active</span>
          <span class="tt-pod__val">${activeCount}/${state.tutors.length}</span>
          <span class="tt-pod__sub">Faculty roster</span>
        </div>
        <div class="tt-pod">
          <span class="tt-pod__lbl">${icon('dollar', { size: 12 })} Avg Rate</span>
          <span class="tt-pod__val">${money(avgRate, { currency })}</span>
          <span class="tt-pod__sub">Per hour</span>
        </div>
        <div class="tt-pod tt-pod--wide-sm">
          <span class="tt-pod__lbl">${icon('calendar', { size: 12 })} Lessons</span>
          <span class="tt-pod__val">${totalLessons}</span>
          <span class="tt-pod__sub">Scheduled/done</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="tutor-new">${icon('plus', { size: 15 })} Add Tutor</button>
      </div>
    </section>

    ${state.loading && !state.tutors.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.tutors.length ? html`
      <div class="tt-tutor-grid">
        ${state.tutors.map((t) => {
          const color = tutorColor(t.id, t.tutor_name);
          return html`
            <article class="tk-card tt-tutor-card" style="--tutor-stripe:${color}" data-key="tu-${t.id}">
              <div class="tt-tutor-card__head">
                <div style="display:flex;align-items:center;gap:11px;min-width:0">
                  <span class="tt-monogram">${initials(t.tutor_name)}</span>
                  <div style="min-width:0">
                    <div class="tk-card__title" style="display:flex;align-items:center;gap:7px">
                      <span class="tutor-dot" style="background:${color};color:${color}"></span>
                      <span style="overflow:hidden;text-overflow:ellipsis">${t.tutor_name}</span>
                    </div>
                    <div class="tk-card__sub">${money(t.hourly_rate_cents || 0, { currency })}/hr · ${t.lesson_count || 0} lessons</div>
                  </div>
                </div>
                <span class="tk-tag ${t.active === 'Active' ? 'tk-tag--ok' : ''}">${t.active}</span>
              </div>
              <div class="tt-tutor-card__body">
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(t.subjects || []).map((s) => html`<span class="${subjectBadgeClass(s)}">${s}</span>`)}
                </div>
                <div class="day-grid" aria-label="Weekly availability">
                  ${WEEKDAYS.map((d) => html`<span class="${cls('day-chip', { 'is-on': (t.availability || []).includes(d) })}">${SHORT_DAYS[d]}</span>`)}
                </div>
                <div style="display:grid;gap:4px;font-size:12.5px;color:var(--k-muted)">
                  ${t.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 13 })} <span style="overflow:hidden;text-overflow:ellipsis">${t.email}</span></div>` : ''}
                  ${t.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} <span>${t.phone}</span></div>` : ''}
                </div>
                <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
                  <button type="button" class="k-btn k-btn--sm" data-action="tutor-toggle" data-id="${t.id}" data-active="${t.active === 'Active' ? 'Inactive' : 'Active'}">
                    ${t.active === 'Active' ? 'Set Inactive' : 'Set Active'}
                  </button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="tutor-edit" data-id="${t.id}">Edit</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'award', title: 'No tutors added yet', text: 'Add tutors with their subjects and hourly rates.' })}</section>`}`;
}

function daysOverdueOf(inv, todayStr) {
  if (inv.status === 'Paid' || inv.status === 'Draft') return 0;
  if (!inv.due_date) return inv.status === 'Overdue' ? 1 : 0;
  const gap = daysBetween(inv.due_date, todayStr);
  return gap > 0 ? gap : 0;
}

export function renderBillingView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const todayStr = today();
  const sum = state.invoiceSummary || { collectedCents: 0, outstandingCents: 0, overdueCount: 0 };
  const totalVol = Number(sum.collectedCents || 0) + Number(sum.outstandingCents || 0);
  const colPct = totalVol > 0 ? Math.round((Number(sum.collectedCents || 0) / totalVol) * 100) : 100;
  const q = (state.invoiceSearch || '').trim().toLowerCase();

  const rows = state.invoices.filter((inv) => {
    const overdueDays = daysOverdueOf(inv, todayStr);
    const isOverdue = inv.status === 'Overdue' || overdueDays > 0;
    if (state.invoiceFilter === 'Overdue') {
      if (!isOverdue) return false;
    } else if (state.invoiceFilter !== 'All' && inv.status !== state.invoiceFilter) {
      return false;
    }
    if (q) {
      const hay = `${inv.invoice_number || ''} ${inv.student_name || ''} ${inv.guardian_name || ''} ${inv.billing_period || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return html`
    <section class="tt-masthead" aria-label="Family Tuition Billing">
      <div class="tt-masthead__copy">
        <div class="tt-masthead__eyebrow">
          ${icon('receipt', { size: 12 })} FAMILY TUITION BILLING
        </div>
        <h1 class="tt-masthead__title">Billing &amp; Invoices</h1>
        <div class="tt-masthead__meta">
          <span>Overdue alerts &amp; reminders</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable HTML statements</span>
        </div>
      </div>

      <div class="tt-masthead__pods" style="align-items:center">
        <div class="tt-pod tt-pod--ring tt-pod--gold" aria-label="Collection rate ${colPct}%">
          <div class="tk-ring" style="--p:${colPct}%;--ring-color:${colPct >= 80 ? '#34d399' : '#ebc05a'};--ring-size:48px">
            <span class="tk-ring__val">${colPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="tt-pod__lbl">Collected</span>
            <span class="tt-pod__val" style="font-size:16.5px">${money(sum.collectedCents, { currency })}</span>
            <span class="tt-pod__sub">${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div class="tt-pod">
          <span class="tt-pod__lbl">${icon('clock', { size: 12 })} Outstanding</span>
          <span class="tt-pod__val">${money(sum.outstandingCents, { currency })}</span>
          <span class="tt-pod__sub">Open tuition</span>
        </div>

        <div class="${cls('tt-pod', { 'tt-pod--alert': sum.overdueCount > 0 })}">
          <span class="tt-pod__lbl">${icon('alert', { size: 12 })} Overdue</span>
          <span class="tt-pod__val">${sum.overdueCount}</span>
          <span class="tt-pod__sub">${sum.overdueCount ? 'Action needed' : 'None overdue'}</span>
        </div>

        <div class="tt-pod tt-pod--wide-sm">
          <span class="tt-pod__lbl">${icon('receipt', { size: 12 })} Total</span>
          <span class="tt-pod__val">${state.invoices.length}</span>
          <span class="tt-pod__sub">Issued</span>
        </div>

        <button type="button" class="k-btn k-btn--primary" data-action="invoice-new">${icon('plus', { size: 15 })} Raise Invoice</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 15 })}
        <input type="search" data-action="invoice-search" value="${state.invoiceSearch}" placeholder="Search invoice #, student or guardian…">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter invoices">
        ${['All', 'Unpaid', 'Sent', 'Overdue', 'Paid', 'Draft'].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.invoiceFilter === st })}" data-action="invoice-filter" data-status="${st}">${st}${st === 'Overdue' && sum.overdueCount > 0 ? ` (${sum.overdueCount})` : ''}</button>`)}
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.invoices.length ? skeleton(3) : rows.length ? html`
        <div>
          ${rows.map((inv) => {
            const overdueDays = daysOverdueOf(inv, todayStr);
            const isOverdue = inv.status === 'Overdue' || overdueDays > 0;
            const dueGap = inv.due_date ? daysBetween(todayStr, inv.due_date) : null;
            const rowTone = inv.status === 'Paid' ? 'tt-inv-row--paid' : isOverdue ? 'tt-inv-row--overdue' : 'tt-inv-row--unpaid';
            return html`
              <div class="tt-inv-row ${rowTone}" data-key="inv-${inv.id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="inv-code">${inv.invoice_number}</span>
                    <strong>${inv.student_name}</strong>
                    <strong style="font-variant-numeric:tabular-nums;color:var(--k-accent)">${money(inv.amount_cents, { currency })}</strong>
                    <span class="tk-tag ${inv.status === 'Paid' ? 'tk-tag--ok' : isOverdue ? 'tk-tag--bad' : inv.status === 'Unpaid' || inv.status === 'Sent' ? 'tk-tag--warn' : ''}">
                      ${isOverdue ? 'Overdue' : inv.status}
                    </span>
                    ${isOverdue
                      ? html`<span class="overdue-tuition-badge">${icon('alert', { size: 11 })} ${overdueDays > 0 ? `Overdue ${overdueDays}d` : 'Overdue Tuition'}</span>`
                      : (inv.status !== 'Paid' && inv.status !== 'Draft' && dueGap !== null && dueGap >= 0 && dueGap <= 7
                          ? html`<span class="tk-tag tk-tag--warn">Due in ${dueGap}d</span>`
                          : '')}
                    ${inv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span><strong>${inv.billing_period}</strong></span>
                    ${inv.guardian_name ? html`<span>Guardian: ${inv.guardian_name}</span>` : ''}
                    <span>Due: ${inv.due_date ? fmtDay(inv.due_date) : 'On receipt'}</span>
                  </div>
                  ${inv.notes ? html`<div class="tk-muted" style="font-size:12.5px">${inv.notes}</div>` : ''}
                </div>
                <div class="tk-row__aside">
                  ${inv.status !== 'Paid' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="invoice-status" data-id="${inv.id}" data-status="Paid">Mark Paid ✓</button>
                    <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="copy-payment-reminder" data-id="${inv.id}">${icon('copy', { size: 13 })} Reminder</button>` : ''}
                  <button type="button" class="k-btn k-btn--sm" data-action="invoice-print" data-id="${inv.id}">${icon('printer', { size: 13 })} Invoice</button>
                </div>
              </div>`;
          })}
        </div>` : emptyState({ iconName: 'receipt', title: 'No invoices match this filter', text: 'Raise a tuition invoice for a student and period above.' })}
    </section>`;
}

export function wireBillingActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="invoice-search"]', (e, el) => { state.invoiceSearch = el.value; draw(); });
  on(root, 'click', '[data-action="invoice-filter"]', (e, el) => { state.invoiceFilter = el.dataset.status; draw(); });

  on(root, 'click', '[data-action="copy-payment-reminder"]', (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    const settings = state.session.settings;
    const cur = settings.currency || 'AUD';
    const amountText = money(inv.amount_cents, { currency: cur });
    const overdueDays = daysOverdueOf(inv, today());
    const greeting = inv.guardian_name ? `Hi ${inv.guardian_name},` : 'Hello,';
    const duePhrase = overdueDays > 0
      ? `is now ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue (was due ${fmtDay(inv.due_date)})`
      : inv.due_date
        ? `is due on ${fmtDay(inv.due_date)}`
        : 'is currently open for payment';
    const contact = [settings.phone, settings.email].filter(Boolean).join(' or ');
    const lines = [
      `Subject: Tuition Payment Reminder — ${inv.invoice_number} (${inv.student_name})`,
      '',
      greeting,
      '',
      `Just a friendly reminder that tuition invoice ${inv.invoice_number} for ${inv.student_name} (${inv.billing_period}) in the amount of ${amountText} ${duePhrase}.`,
      '',
      `Please quote ${inv.invoice_number} when making payment.${contact ? ' If you have already paid or have any questions, feel free to contact us at ' + contact + '.' : ''}`,
      '',
      `Warm regards,\n${settings.business_name}`,
    ];
    copyText(lines.join('\n'), { title: `Payment Reminder · ${inv.invoice_number}`, done: 'Payment reminder copied!' });
  });

  on(root, 'click', '[data-action="tutor-new"]', async () => {
    const made = await formDialog({
      title: 'Add Tutor',
      submitLabel: 'Add tutor',
      size: 'lg',
      fields: tutorFields(),
      onSubmit: (vals) => api.post('/api/tutors', {
        ...vals,
        subjects: Array.isArray(vals.subjects) ? vals.subjects : [],
        availability: Array.isArray(vals.availability) ? vals.availability : [],
      }),
    });
    if (made) { toast.success('Tutor added.'); await loadScreen('/tutors'); }
  });

  on(root, 'click', '[data-action="tutor-edit"]', async (e, el) => {
    const t = state.tutors.find((x) => String(x.id) === el.dataset.id);
    if (!t) return;
    const saved = await formDialog({
      title: `Edit ${t.tutor_name}`,
      submitLabel: 'Save tutor',
      size: 'lg',
      fields: tutorFields(t),
      onSubmit: (vals) => api.put('/api/tutors', {
        ...vals,
        id: t.id,
        subjects: Array.isArray(vals.subjects) ? vals.subjects : [],
        availability: Array.isArray(vals.availability) ? vals.availability : [],
      }),
    });
    if (saved) { toast.success('Tutor updated.'); await loadScreen('/tutors'); }
  });

  on(root, 'click', '[data-action="tutor-toggle"]', async (e, el) => {
    try { await api.put('/api/tutors', { id: Number(el.dataset.id), active: el.dataset.active }); toast.success('Tutor status updated.'); await loadScreen('/tutors'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="invoice-new"]', async () => {
    if (!state.students.length) { toast.error('Enrol a student first.'); return; }
    const made = await formDialog({
      title: 'Raise Tuition Invoice',
      submitLabel: 'Create invoice',
      fields: html`
        <label class="k-field"><span class="k-field__label">Student</span>
          <select class="k-input" name="student_id" required>${state.students.map((s) => html`<option value="${s.id}">${s.student_name} (${s.subject})</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Billing Period</span><input class="k-input" name="billing_period" placeholder="e.g. Term 4 · Nov 2026" required></label>
          <label class="k-field"><span class="k-field__label">Amount</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" placeholder="320.00" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), 14)}"></label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">${INV_STATUSES.map((s) => html`<option value="${s}" ${s === 'Unpaid' ? 'selected' : ''}>${s}</option>`)}</select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes / Line Description</span>
          <textarea class="k-input" name="notes" rows="2" placeholder="e.g. 4 x 60 min Mathematics lessons, bank transfer details…"></textarea>
        </label>`,
      onSubmit: (vals) => api.post('/api/invoices', vals),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} raised.`); await loadScreen('/billing'); }
  });

  on(root, 'click', '[data-action="invoice-status"]', async (e, el) => {
    try { await api.post('/api/invoices/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Invoice marked ${el.dataset.status}.`); await loadScreen('/billing'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="invoice-print"]', (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    const settings = state.session.settings;
    const cur = settings.currency || 'AUD';
    const taxRate = Number(settings.tax_rate || 0);
    const total = Number(inv.amount_cents || 0);
    const taxPart = taxRate > 0 ? Math.round(total - total / (1 + taxRate / 100)) : 0;

    downloadHtmlDoc(`${inv.invoice_number}-${String(inv.student_name || 'tuition').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, {
      title: `Tuition Invoice ${inv.invoice_number}`,
      businessName: settings.business_name,
      subtitle: [settings.address, settings.phone, settings.email, settings.tax_id ? `Tax ID: ${settings.tax_id}` : ''].filter(Boolean).join(' · '),
      accent: '#1d356b',
      bodyHtml: `
        <table>
          <tr><th style="width:180px">Bill To (Guardian)</th><td><strong>${esc(inv.guardian_name || inv.student_name)}</strong>${inv.guardian_email ? '<br>' + esc(inv.guardian_email) : ''}${inv.student_phone ? '<br>' + esc(inv.student_phone) : ''}</td></tr>
          <tr><th>Student</th><td>${esc(inv.student_name)} (${esc(inv.student_subject || 'Tuition')})</td></tr>
          <tr><th>Billing Period</th><td>${esc(inv.billing_period)}</td></tr>
          <tr><th>Due Date</th><td>${inv.due_date ? esc(fmtDay(inv.due_date)) : 'Due on receipt'}</td></tr>
          <tr><th>Status</th><td><strong>${esc(inv.status)}</strong></td></tr>
        </table>
        <table>
          <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody>
            <tr><td>Tuition — ${esc(inv.billing_period)}${inv.notes ? `<br><small>${esc(inv.notes)}</small>` : ''}</td><td class="num">${esc(money(total, { currency: cur }))}</td></tr>
            ${taxPart > 0 ? `<tr><td>Includes Tax (${taxRate}%)</td><td class="num">${esc(money(taxPart, { currency: cur }))}</td></tr>` : ''}
            <tr class="total-row"><td>Total ${inv.status === 'Paid' ? 'Paid' : 'Due'}</td><td class="num">${esc(money(total, { currency: cur }))}</td></tr>
          </tbody>
        </table>
        <div class="box">Thank you for learning with ${esc(settings.business_name)}. Please quote <strong>${esc(inv.invoice_number)}</strong> on payment.</div>`,
    });
  });
}
