// Billing Desk Command & Clients Directory views (Pass 3 Midnight Navy & Emerald-Mint Ledger).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

const CLIENT_TYPES = ['Residential', 'Commercial', 'Government', 'Non-Profit'];
const STAGE_ORDER = ['Lead', 'Quoted', 'In Progress', 'Completed', 'Invoiced'];

/** Overdue / due-soon aging pill computed from daysBetween(today(), due_date). */
export function renderAgingPill(inv, { showSettled = false } = {}) {
  const bal = Math.max(0, Number(inv.amount_cents || 0) - Number(inv.amount_paid_cents || 0));
  if (bal <= 0 || inv.status === 'Paid') {
    return showSettled ? html`<span class="aging-pill aging-pill--settled">Settled</span>` : '';
  }
  if (!inv.due_date) return '';
  const delta = daysBetween(today(), inv.due_date);
  if (delta < 0) return html`<span class="aging-pill aging-pill--overdue">${Math.abs(delta)}d overdue</span>`;
  if (delta === 0) return html`<span class="aging-pill aging-pill--urgent">Due today</span>`;
  if (delta <= 7) return html`<span class="aging-pill aging-pill--urgent">Due in ${delta}d</span>`;
  return html`<span class="aging-pill aging-pill--upcoming">Due in ${delta}d</span>`;
}

/** Crisp bookkeeper payment progress bar ($X paid of $Y · Z%). */
export function renderPaymentProgress(inv, cur) {
  const total = Math.max(0, Number(inv.amount_cents || 0));
  const paid = Math.max(0, Number(inv.amount_paid_cents || 0));
  const bal = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const isPaid = bal <= 0 && total > 0;
  const isPart = paid > 0 && bal > 0;
  const isOver = inv.status === 'Overdue' || (bal > 0 && inv.due_date && daysBetween(today(), inv.due_date) < 0);
  const fillClass = isPaid ? 'pay-prog__fill--ok' : isPart ? 'pay-prog__fill--part' : isOver ? 'pay-prog__fill--over' : '';
  const pctClass = isPaid ? 'pay-prog__pct--ok' : isPart ? 'pay-prog__pct--part' : isOver ? 'pay-prog__pct--over' : '';

  return html`
    <div class="pay-prog">
      <div class="pay-prog__top">
        <span class="pay-prog__summary">${money(paid, { currency: cur })} paid of ${money(total, { currency: cur })}</span>
        <span class="pay-prog__pct ${pctClass}">${pct}%</span>
      </div>
      <div class="pay-prog__bar">
        <div class="pay-prog__fill ${fillClass}" style="width:${pct}%"></div>
      </div>
      <div class="pay-prog__foot">
        <span>${isPaid ? 'Paid in full' : isPart ? 'Part-paid' : 'Balance due'}</span>
        <strong class="ledger-amount ${bal > 0 ? (isOver ? 'ledger-amount--due' : '') : 'ledger-amount--paid'}">${bal > 0 ? money(bal, { currency: cur }) + ' due' : money(total, { currency: cur })}</strong>
      </div>
    </div>`;
}

/** Build either a Polite or Firm payment reminder tailored with client, invoice #, balance & due date. */
export function buildPaymentReminder(inv, settings, tone = 'polite') {
  const cur = settings.currency || 'AUD';
  const total = Number(inv.amount_cents || 0);
  const paid = Number(inv.amount_paid_cents || 0);
  const bal = Math.max(0, total - paid);
  const delta = inv.due_date ? daysBetween(today(), inv.due_date) : 0;
  const overdueDays = delta < 0 ? Math.abs(delta) : 0;
  const recipient = inv.client_contact || inv.client_name || 'Accounts Team';
  const dueText = inv.due_date ? fmtDay(inv.due_date) : 'the due date';
  const jobLine = inv.job_title ? ` (${inv.job_title})` : '';
  const sig = `${settings.business_name}${settings.phone ? ' · ' + settings.phone : ''}${settings.email ? ' · ' + settings.email : ''}`;

  if (tone === 'firm') {
    const statusSentence = overdueDays > 0
      ? `is now ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue (original due date: ${dueText}).`
      : `was issued for payment by ${dueText} and remains unpaid.`;
    return [
      `Subject: OVERDUE PAYMENT NOTICE — Invoice ${inv.invoice_number} (${money(bal, { currency: cur })})`,
      '',
      `Dear ${recipient},`,
      '',
      `Our accounts ledger shows that Invoice ${inv.invoice_number}${jobLine} for ${inv.client_name || 'your account'} ${statusSentence}`,
      '',
      `Invoice Total: ${money(total, { currency: cur })}`,
      paid > 0 ? `Payments Received: ${money(paid, { currency: cur })}` : null,
      `Outstanding Balance Due: ${money(bal, { currency: cur })}`,
      '',
      `Please arrange settlement within 48 hours and send remittance advice so we can reconcile your account promptly.`,
      settings.bank_details ? `Remittance Details: ${settings.bank_details}` : null,
      `Payment Reference: ${inv.invoice_number}`,
      '',
      `If payment has already been dispatched or there is any query with this invoice, please contact our accounts desk immediately.`,
      '',
      `Regards,`,
      `Accounts Receivable — ${sig}`,
    ].filter((l) => l !== null).join('\n');
  }

  const timing = overdueDays > 0
    ? `was due on ${dueText} (${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue)`
    : delta === 0
      ? `is due today (${dueText})`
      : `is coming up due on ${dueText} (in ${delta} day${delta === 1 ? '' : 's'})`;

  return [
    `Subject: Friendly Reminder — Invoice ${inv.invoice_number} (${money(bal, { currency: cur })})`,
    '',
    `Hi ${recipient},`,
    '',
    `Hope you are having a great week! Just a quick friendly reminder regarding Invoice ${inv.invoice_number}${jobLine} for ${inv.client_name || 'your account'}, which ${timing}.`,
    '',
    `Invoice Total: ${money(total, { currency: cur })}`,
    paid > 0 ? `Paid to Date: ${money(paid, { currency: cur })}` : null,
    `Balance Due: ${money(bal, { currency: cur })}`,
    '',
    settings.bank_details ? `Payment details: ${settings.bank_details}` : null,
    `Please quote ${inv.invoice_number} as your reference. Let us know if you need another copy of the tax invoice or have any questions.`,
    '',
    `Warm regards,`,
    sig,
  ].filter((l) => l !== null).join('\n');
}

export function renderDeskView(state) {
  const settings = state.session.settings;
  const cur = settings.currency || 'AUD';
  const desk = state.desk;

  if (state.loading && !desk) {
    return html`
      <section class="ji-masthead">
        <div class="ji-masthead__copy">
          <div class="ji-masthead__eyebrow">
            <span class="tk-pulse-dot" style="--dot:#34d399"></span>
            BILLING DESK · ${fmtDay(today(), { weekday: 'short' })}
          </div>
          <h1 class="ji-masthead__title">${settings.business_name || 'Billing Desk'}</h1>
          <div class="ji-masthead__meta"><span>Loading receivables ledger, overdue queue &amp; active jobs…</span></div>
        </div>
      </section>
      <section class="tk-sheet">${skeleton(4)}</section>`;
  }

  const sum = desk?.summary || {
    totalOwedCents: 0, overdueCents: 0, overdueCount: 0,
    awaitingQuotesCount: 0, activeJobsCount: 0, pipelineCents: 0, collectedMonthCents: 0,
  };
  const overdue = desk?.overdueQueue || [];
  const dueSoon = desk?.dueSoon || [];
  const quotes = desk?.awaitingQuotes || [];
  const jobs = desk?.activeJobs || [];

  const lifetimeBilled = state.clients.reduce((acc, c) => acc + Number(c.billed_cents || 0), 0);
  const lifetimePaid = state.clients.reduce((acc, c) => acc + Number(c.paid_cents || 0), 0);
  const collectionPct = lifetimeBilled > 0
    ? Math.min(100, Math.round((lifetimePaid / lifetimeBilled) * 100))
    : (sum.collectedMonthCents > 0 ? 100 : 0);
  const ringColor = collectionPct >= 75 ? '#34d399' : collectionPct >= 45 ? '#fbbf24' : '#fb7185';

  const openNotOverdue = Math.max(0, sum.totalOwedCents - sum.overdueCents);
  const mixDenom = Math.max(1, lifetimePaid + openNotOverdue + sum.overdueCents);
  const paidShare = Math.round((lifetimePaid / mixDenom) * 100);
  const openShare = Math.round((openNotOverdue / mixDenom) * 100);
  const overShare = Math.max(0, 100 - paidShare - openShare);

  const topAccounts = [...state.clients]
    .sort((a, b) => Number(b.owed_cents || 0) - Number(a.owed_cents || 0) || Number(b.billed_cents || 0) - Number(a.billed_cents || 0))
    .slice(0, 4);

  return html`
    ${renderSampleBanner(state.session.counts?.sampleCount || 0, { canClear: state.session.me.isOwner || state.session.me.role === 'manager' })}

    <section class="ji-masthead" aria-label="Billing Desk Command">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${sum.overdueCount > 0 ? '#fbbf24' : '#34d399'}"></span>
          BILLING DESK · ${sum.overdueCount > 0 ? `${sum.overdueCount} OVERDUE` : 'LEDGER CURRENT'}
        </div>
        <h1 class="ji-masthead__title">${settings.business_name || 'Billing Desk'}</h1>
        <div class="ji-masthead__meta">
          <span><strong style="color:#6ee7b7">${sum.activeJobsCount} active</strong> (${money(sum.pipelineCents, { currency: cur })} pipeline)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${sum.awaitingQuotesCount} open quote${sum.awaitingQuotesCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--ring">
          <div class="tk-ring" style="--p:${collectionPct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${collectionPct}%</span>
          </div>
          <div>
            <span class="ji-pod__lbl">Collected</span>
            <div class="ji-pod__val" style="font-size:15px">${money(lifetimePaid, { currency: cur })}</div>
            <span class="ji-pod__sub">of ${money(lifetimeBilled, { currency: cur })} billed</span>
          </div>
        </div>

        <a href="#/payments" class="ji-pod ji-pod--mint">
          <span class="ji-pod__lbl">${icon('cash-flow', { size: 12 })} Collected MTD</span>
          <span class="ji-pod__val">${money(sum.collectedMonthCents, { currency: cur })}</span>
          <span class="ji-pod__sub">Payments ledger →</span>
        </a>

        <a href="#/invoices" class="${cls('ji-pod', { 'ji-pod--alert': sum.overdueCount > 0, 'ji-pod--gold': sum.overdueCount === 0 && sum.totalOwedCents > 0 })}">
          <span class="ji-pod__lbl">${icon(sum.overdueCount > 0 ? 'alert' : 'receipt', { size: 12 })} Receivables</span>
          <span class="ji-pod__val">${money(sum.totalOwedCents, { currency: cur })}</span>
          <span class="ji-pod__sub">${sum.overdueCount > 0 ? `${money(sum.overdueCents, { currency: cur })} overdue →` : 'Within terms →'}</span>
        </a>

        <div class="ji-masthead__cta-group">
          <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="quote-new">${icon('plus', { size: 14 })} Quote</button>
          <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="invoice-new">${icon('plus', { size: 15 })} New Invoice</button>
        </div>
      </div>
    </section>

    <div class="ji-split">
      <div class="tk-stack" style="gap:16px">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('alert', { size: 17 })} Overdue Invoice Chase Queue</h2>
            <span class="tk-sheet__count">${overdue.length}</span>
            <div class="tk-sheet__actions"><a href="#/invoices" class="k-btn k-btn--ghost k-btn--sm">Full ledger →</a></div>
          </div>
          <div>
            ${overdue.length ? overdue.map((inv) => html`
              <div class="ji-folio" data-key="ov-${inv.id}">
                <div class="ji-folio__head">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="doc-num">${inv.invoice_number}</span>
                      <span>${inv.client_name}</span>
                      ${renderAgingPill(inv)}
                      ${inv.status === 'Part-Paid' ? html`<span class="tk-tag inv-badge-part">Part-Paid</span>` : ''}
                      ${inv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      ${inv.job_title ? html`<span><strong>${inv.job_title}</strong></span>` : ''}
                      <span>Due ${fmtDay(inv.due_date)}</span>
                      ${inv.client_contact ? html`<span>Attn: ${inv.client_contact}</span>` : ''}
                    </div>
                    ${inv.amount_paid_cents > 0 ? html`<div style="margin-top:6px;max-width:340px">${renderPaymentProgress(inv, cur)}</div>` : ''}
                  </div>
                  <div class="ji-folio__amt">
                    <span class="ji-folio__amt-lbl">Balance Due</span>
                    <span class="ledger-amount ledger-amount--lg ledger-amount--due">${money(inv.balance_cents, { currency: cur })}</span>
                  </div>
                </div>
                <div class="ji-folio__actions">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inv-mark-paid" data-id="${inv.id}">${icon('stamp-paid', { size: 14 })} Mark Paid</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="pay-invoice" data-id="${inv.id}">Part Pay</button>
                  <button type="button" class="k-btn k-btn--sm btn-remind-polite" data-action="copy-reminder" data-tone="polite" data-id="${inv.id}">${icon('copy', { size: 13 })} Polite</button>
                  <button type="button" class="k-btn k-btn--sm btn-remind-firm" data-action="copy-reminder" data-tone="firm" data-id="${inv.id}">${icon('copy', { size: 13 })} Firm</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="inv-print" data-id="${inv.id}">${icon('printer', { size: 14 })} PDF</button>
                </div>
              </div>`) : emptyState({ iconName: 'check-circle', title: 'Zero overdue invoices', text: 'Every issued invoice is paid or comfortably within payment terms.' })}
          </div>
        </section>

        ${dueSoon.length ? html`
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('clock', { size: 17 })} Open &amp; Upcoming Receivables</h2>
              <span class="tk-sheet__count">${dueSoon.length}</span>
              <div class="tk-sheet__actions"><a href="#/invoices" class="k-btn k-btn--ghost k-btn--sm">All invoices</a></div>
            </div>
            <div>
              ${dueSoon.map((inv) => html`
                <div class="ji-folio ji-folio--soon" data-key="soon-${inv.id}">
                  <div class="ji-folio__head">
                    <div class="tk-row__main">
                      <div class="tk-row__title">
                        <span class="doc-num">${inv.invoice_number}</span>
                        <span>${inv.client_name}</span>
                        ${renderAgingPill(inv)}
                        ${inv.status === 'Part-Paid' ? html`<span class="tk-tag inv-badge-part">Part-Paid</span>` : ''}
                      </div>
                      <div class="tk-row__meta">
                        ${inv.job_title ? html`<span><strong>${inv.job_title}</strong></span>` : ''}
                        <span>Due ${fmtDay(inv.due_date)}</span>
                      </div>
                      ${inv.amount_paid_cents > 0 ? html`<div style="margin-top:6px;max-width:340px">${renderPaymentProgress(inv, cur)}</div>` : ''}
                    </div>
                    <div class="ji-folio__amt">
                      <span class="ji-folio__amt-lbl">Open Balance</span>
                      <span class="ledger-amount ledger-amount--lg">${money(inv.balance_cents, { currency: cur })}</span>
                    </div>
                  </div>
                  <div class="ji-folio__actions">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inv-mark-paid" data-id="${inv.id}">${icon('stamp-paid', { size: 14 })} Mark Paid</button>
                    <button type="button" class="k-btn k-btn--sm" data-action="pay-invoice" data-id="${inv.id}">Part Pay</button>
                    <button type="button" class="k-btn k-btn--sm btn-remind-polite" data-action="copy-reminder" data-tone="polite" data-id="${inv.id}">${icon('copy', { size: 13 })} Remind</button>
                  </div>
                </div>`)}
            </div>
          </section>` : ''}

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('file', { size: 17 })} Quotes Awaiting Reply or Billing</h2>
            <span class="tk-sheet__count">${quotes.length}</span>
            <div class="tk-sheet__actions"><a href="#/quotes" class="k-btn k-btn--ghost k-btn--sm">Quotes workbench</a></div>
          </div>
          <div>
            ${quotes.length ? quotes.map((q) => html`
              <div class="ji-folio ji-folio--quote ${q.status === 'Accepted' ? 'ji-folio--accepted' : ''}" data-key="dq-${q.id}">
                <div class="ji-folio__head">
                  <div class="tk-row__main">
                    <div class="tk-row__title">
                      <span class="doc-num">${q.quote_number}</span>
                      <span>${q.client_name}</span>
                      <span class="tk-tag ${q.status === 'Accepted' ? 'tk-tag--ok' : q.status === 'Sent' ? 'tk-tag--info' : ''}">${q.status}</span>
                    </div>
                    <div class="tk-row__meta">
                      <span><strong>${q.job_title}</strong></span>
                      <span>Valid until ${fmtDay(q.valid_until)}</span>
                    </div>
                  </div>
                  <div class="ji-folio__amt">
                    <span class="ji-folio__amt-lbl">Quote Total</span>
                    <span class="ledger-amount ledger-amount--lg">${money(q.total_cents, { currency: cur })}</span>
                  </div>
                </div>
                <div class="ji-folio__actions">
                  ${q.status === 'Draft' ? html`<button type="button" class="k-btn k-btn--sm" data-action="quote-status" data-id="${q.id}" data-status="Sent">Mark Sent</button>` : ''}
                  ${q.status === 'Sent' ? html`<button type="button" class="k-btn k-btn--sm" data-action="quote-status" data-id="${q.id}" data-status="Accepted">Accept</button>` : ''}
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="quote-convert" data-id="${q.id}">Convert to Invoice</button>
                </div>
              </div>`) : emptyState({ iconName: 'file', title: 'No open quotes', text: 'Create a quote from any job in the pipeline.' })}
          </div>
        </section>
      </div>

      <aside class="ji-rail-panel" aria-label="Active Jobs and Accounts Pulse">
        <section class="ji-rail-card">
          <div class="ji-rail-card__head">
            <span class="ji-rail-card__title">${icon('briefcase', { size: 14 })} Active Jobs (${jobs.length})</span>
            <a href="#/jobs" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Pipeline</a>
          </div>
          ${jobs.length ? html`
            <div class="ji-rail-list">
              ${jobs.slice(0, 5).map((j) => {
                const idx = Math.max(0, STAGE_ORDER.indexOf(j.status));
                return html`
                  <div class="ji-rail-item" data-key="dj-${j.id}">
                    <div class="ji-rail-item__top">
                      <div style="min-width:0">
                        <div class="ji-rail-item__name">${j.title}</div>
                        <div class="ji-rail-item__sub">${j.client_name} · ${j.service_type}</div>
                      </div>
                      <span class="tk-tag ${j.status === 'Completed' ? 'tk-tag--ok' : j.status === 'In Progress' ? 'tk-tag--accent' : ''}">${j.status}</span>
                    </div>
                    <div class="ji-stage-dots" aria-hidden="true">
                      ${STAGE_ORDER.map((s, i) => html`<span class="${cls('ji-stage-dot', { 'is-done': i < idx, 'is-now': i === idx })}"></span>`)}
                    </div>
                    <div class="ji-rail-item__foot">
                      <span class="ledger-amount ledger-amount--muted" style="font-size:12.5px">${j.estimated_cents ? money(j.estimated_cents, { currency: cur }) : 'No estimate'}</span>
                      <div class="tk-btn-row">
                        <button type="button" class="k-btn k-btn--sm" data-action="quote-new-for-job" data-id="${j.id}">+ Quote</button>
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-advance" data-id="${j.id}">Advance →</button>
                      </div>
                    </div>
                  </div>`;
              })}
            </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active jobs in flight.</div>`}
        </section>

        <section class="ji-rail-card">
          <div class="ji-rail-card__head">
            <span class="ji-rail-card__title">${icon('cash-flow', { size: 14 })} Receivables Mix</span>
            <span class="tk-mono" style="font-size:11.5px;font-weight:750;color:var(--k-accent)">${collectionPct}% settled</span>
          </div>
          <div style="padding:12px 14px;display:grid;gap:10px">
            <div class="ji-mix-bar">
              ${paidShare > 0 ? html`<span class="ji-mix-bar__seg ji-mix-bar__seg--paid" style="width:${paidShare}%"></span>` : ''}
              ${openShare > 0 ? html`<span class="ji-mix-bar__seg ji-mix-bar__seg--open" style="width:${openShare}%"></span>` : ''}
              ${overShare > 0 ? html`<span class="ji-mix-bar__seg ji-mix-bar__seg--over" style="width:${overShare}%"></span>` : ''}
            </div>
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;font-size:11.5px;color:var(--k-muted)">
              <span><strong style="color:#047857">Paid</strong> ${money(lifetimePaid, { currency: cur })}</span>
              <span><strong style="color:#b45309">Open</strong> ${money(openNotOverdue, { currency: cur })}</span>
              <span><strong style="color:#be123c">Overdue</strong> ${money(sum.overdueCents, { currency: cur })}</span>
            </div>
          </div>
          <div class="ji-quick-actions" style="border-top:1px solid color-mix(in srgb, var(--k-text) 6%, transparent)">
            <button type="button" class="k-btn k-btn--sm" data-action="job-new">${icon('briefcase', { size: 13 })} + Job</button>
            <button type="button" class="k-btn k-btn--sm" data-action="client-new">${icon('building', { size: 13 })} + Client</button>
            <button type="button" class="k-btn k-btn--sm" data-action="quote-new">${icon('file', { size: 13 })} + Quote</button>
            <button type="button" class="k-btn k-btn--sm" data-action="pay-new">${icon('dollar', { size: 13 })} + Payment</button>
          </div>
        </section>

        ${topAccounts.length ? html`
          <section class="ji-rail-card">
            <div class="ji-rail-card__head">
              <span class="ji-rail-card__title">${icon('building', { size: 14 })} Top Client Balances</span>
              <a href="#/clients" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Directory</a>
            </div>
            <div>
              ${topAccounts.map((c) => html`
                <div class="ji-acct-row">
                  <div style="min-width:0">
                    <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.business_name}</div>
                    <div style="font-size:11.5px;color:var(--k-muted)">Billed ${money(c.billed_cents || 0, { currency: cur })}</div>
                  </div>
                  <span class="ledger-amount ${(c.owed_cents || 0) > 0 ? 'ledger-amount--due' : 'ledger-amount--paid'}" style="font-size:12.5px">
                    ${(c.owed_cents || 0) > 0 ? money(c.owed_cents, { currency: cur }) + ' due' : 'Settled'}
                  </span>
                </div>`)}
            </div>
          </section>` : ''}
      </aside>
    </div>`;
}

export function renderClientsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const q = state.clientSearch.trim().toLowerCase();
  const filtered = state.clients.filter((c) => {
    if (state.clientTypeFilter !== 'All' && c.client_type !== state.clientTypeFilter) return false;
    if (!q) return true;
    return [c.business_name, c.contact_name, c.email, c.phone, c.billing_address].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const totalBilled = state.clients.reduce((s, c) => s + Number(c.billed_cents || 0), 0);
  const totalPaid = state.clients.reduce((s, c) => s + Number(c.paid_cents || 0), 0);
  const totalOwed = state.clients.reduce((s, c) => s + Number(c.owed_cents || 0), 0);
  const clientPct = totalBilled > 0 ? Math.min(100, Math.round((totalPaid / totalBilled) * 100)) : 100;
  const clientRingColor = clientPct >= 75 ? '#34d399' : clientPct >= 45 ? '#fbbf24' : '#fb7185';
  const typeCount = (t) => t === 'All' ? state.clients.length : state.clients.filter((c) => c.client_type === t).length;

  return html`
    <section class="ji-masthead" aria-label="Clients Directory">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          ACCOUNT DIRECTORY · ${state.clients.length} CLIENT${state.clients.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ji-masthead__title">Clients</h1>
        <div class="ji-masthead__meta">
          <span>1-tap contact &amp; address copy</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live lifetime billed vs owed ledger per account</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--ring">
          <div class="tk-ring" style="--p:${clientPct}%;--ring-color:${clientRingColor};--ring-size:46px">
            <span class="tk-ring__val">${clientPct}%</span>
          </div>
          <div>
            <span class="ji-pod__lbl">Paid to Date</span>
            <div class="ji-pod__val" style="font-size:15px">${money(totalPaid, { currency: cur })}</div>
            <span class="ji-pod__sub">across ${state.clients.length} accounts</span>
          </div>
        </div>
        <div class="ji-pod">
          <span class="ji-pod__lbl">Lifetime Billed</span>
          <span class="ji-pod__val">${money(totalBilled, { currency: cur })}</span>
          <span class="ji-pod__sub">Total invoiced</span>
        </div>
        <div class="${cls('ji-pod', { 'ji-pod--alert': totalOwed > 0 })}">
          <span class="ji-pod__lbl">Balance Owed</span>
          <span class="ji-pod__val">${money(totalOwed, { currency: cur })}</span>
          <span class="ji-pod__sub">${totalOwed > 0 ? 'Open receivables' : 'All accounts clear'}</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="client-new">${icon('plus', { size: 15 })} Add Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search business, contact, email…" value="${state.clientSearch}" data-input="client-search">
      </div>
      <div class="tk-segmented">
        ${['All', ...CLIENT_TYPES].map((t) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.clientTypeFilter === t })}" data-action="client-type-filter" data-type="${t}">${t} (${typeCount(t)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.clients.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : filtered.length ? html`
      <div class="tk-cards">
        ${filtered.map((c) => {
          const billed = Number(c.billed_cents || 0);
          const paid = Number(c.paid_cents || 0);
          const pct = billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : 100;
          return html`
            <article class="ji-client-card" data-key="cl-${c.id}">
              <div class="ji-client-card__head">
                <div class="ji-client-avatar">${initials(c.business_name || c.contact_name || 'CL')}</div>
                <div style="min-width:0;flex:1">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                    <h2 class="tk-card__title" style="font-size:15.5px">${c.business_name}</h2>
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-card__sub">${c.contact_name}${c.client_since ? ' · Since ' + fmtDay(c.client_since) : ''}</div>
                </div>
                <span class="tk-tag tk-tag--accent">${c.client_type}</span>
              </div>

              <div class="client-ledger-strip">
                <div class="client-ledger-cell">
                  <span class="client-ledger-cell__k">Billed</span>
                  <span class="client-ledger-cell__v">${money(billed, { currency: cur })}</span>
                </div>
                <div class="client-ledger-cell">
                  <span class="client-ledger-cell__k">Paid</span>
                  <span class="client-ledger-cell__v ledger-amount--paid">${money(paid, { currency: cur })}</span>
                </div>
                <div class="client-ledger-cell">
                  <span class="client-ledger-cell__k">Owed</span>
                  <span class="client-ledger-cell__v ${(c.owed_cents || 0) > 0 ? 'ledger-amount--due' : ''}">${money(c.owed_cents || 0, { currency: cur })}</span>
                </div>
              </div>

              ${billed > 0 ? html`
                <div class="tk-bar"><div class="tk-bar__fill ${pct === 100 ? 'tk-bar__fill--ok' : 'tk-bar__fill--warn'}" style="width:${pct}%"></div></div>` : ''}

              <div class="tk-btn-row">
                ${c.email ? html`<button type="button" class="copy-chip" data-action="copy-val" data-label="Email" data-val="${c.email}">${icon('mail', { size: 13 })} ${c.email}</button>` : ''}
                ${c.phone ? html`<button type="button" class="copy-chip" data-action="copy-val" data-label="Phone" data-val="${c.phone}">${icon('phone', { size: 13 })} ${c.phone}</button>` : ''}
                ${c.billing_address ? html`<button type="button" class="copy-chip" data-action="copy-val" data-label="Billing Address" data-val="${c.billing_address}">${icon('pin', { size: 13 })} Copy Address</button>` : ''}
              </div>

              ${c.billing_address ? html`<div class="tk-muted" style="font-size:12.5px">${c.billing_address}</div>` : ''}
              ${c.notes ? html`<div class="tk-muted" style="font-size:12.5px">${c.notes}</div>` : ''}

              <div class="tk-ticket__foot">
                <span class="tk-muted" style="font-size:12px">${c.job_count || 0} job${Number(c.job_count) === 1 ? '' : 's'}</span>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="job-new-for-client" data-id="${c.id}">+ Job</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="client-del" data-id="${c.id}">Delete</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'building', title: 'No clients match', text: 'Add a client so you can create jobs, quotes, and tax invoices against them.' })}`;
}

export function clientFormFields(c = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Business / Client Name</span>
        <input class="k-input" name="business_name" value="${c.business_name || ''}" placeholder="e.g. Acme Pty Ltd" required>
      </label>
      <label class="k-field"><span class="k-field__label">Primary Contact</span>
        <input class="k-input" name="contact_name" value="${c.contact_name || ''}" placeholder="Full name" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email Address</span>
        <input class="k-input" type="email" name="email" value="${c.email || ''}" placeholder="billing@example.com" required>
      </label>
      <label class="k-field"><span class="k-field__label">Phone Number</span>
        <input class="k-input" name="phone" value="${c.phone || ''}" placeholder="(02) 9555 0100">
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client Type</span>
        <select class="k-input" name="client_type">
          ${CLIENT_TYPES.map((t) => html`<option value="${t}" ${t === (c.client_type || 'Commercial') ? 'selected' : ''}>${t}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Client Since</span>
        <input class="k-input" type="date" name="client_since" value="${c.client_since || today()}">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Billing Address</span>
      <textarea class="k-input" name="billing_address" rows="2" placeholder="Street, suburb, state, postcode">${c.billing_address || ''}</textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Payment preferences, PO rules, site access…">${c.notes || ''}</textarea>
    </label>`;
}

export function wireDeskClientActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-input="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });
  on(root, 'click', '[data-action="client-type-filter"]', (e, el) => { state.clientTypeFilter = el.dataset.type; draw(); });

  on(root, 'click', '[data-action="copy-val"]', (e, el) => {
    copyText(el.dataset.val, { title: el.dataset.label || 'Copy', done: `${el.dataset.label || 'Value'} copied` });
  });

  on(root, 'click', '[data-action="copy-reminder"]', (e, el) => {
    const id = Number(el.dataset.id);
    const tone = el.dataset.tone === 'firm' ? 'firm' : 'polite';
    const list = [
      ...(state.desk?.overdueQueue || []),
      ...(state.desk?.dueSoon || []),
      ...(state.invoices || []),
    ];
    const inv = list.find((x) => Number(x.id) === id);
    if (!inv) return;
    const label = tone === 'firm' ? 'Firm Overdue Reminder' : 'Polite Payment Reminder';
    copyText(buildPaymentReminder(inv, state.session.settings, tone), {
      title: `${label} — ${inv.invoice_number}`,
      done: `${label} copied`,
    });
  });

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({
      title: 'Add Client',
      submitLabel: 'Save Client',
      fields: clientFormFields(),
      onSubmit: (v) => api.post('/api/clients', v),
    });
    if (made) { toast.success('Client added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({
      title: `Edit ${c.business_name}`,
      submitLabel: 'Save Changes',
      fields: clientFormFields(c),
      onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }),
    });
    if (saved) { toast.success('Client updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client?', message: 'Deletes this client and any unbilled jobs/quotes. Clients with invoices cannot be deleted.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Client deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
