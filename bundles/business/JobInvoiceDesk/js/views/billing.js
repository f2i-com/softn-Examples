// Quotes Workbench, Invoices Ledger (Bookkeeper's Styling, Aging Pills, 1-Click Mark Paid & Tax Invoice HTML), and Payments Ledger.
import { html, on, cls, qs, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money } from '../../kit/format.js';
import { today, fmtDay, addDays, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderAgingPill, renderPaymentProgress } from './desk.js';

const QUOTE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];
const INVOICE_FILTERS = ['All', 'Overdue', 'Unpaid', 'Part-Paid', 'Paid'];
const PAY_METHODS = ['Bank Transfer', 'Card', 'Cash', 'Cheque', 'Other'];

const PRESET_ACCENTS = {
  ledger: '#057a55',
  cobalt: '#1d4ed8',
  slate: '#0f6674',
  burgundy: '#9f1239',
};

function invBadgeClass(status) {
  if (status === 'Paid') return 'inv-badge-paid';
  if (status === 'Part-Paid') return 'inv-badge-part';
  if (status === 'Overdue') return 'inv-badge-over';
  return 'inv-badge-unpaid';
}

function invRowClass(inv) {
  if (inv.status === 'Paid') return 'ledger-row--paid';
  if (inv.status === 'Overdue' || (Number(inv.balance_cents) > 0 && inv.due_date && daysBetween(today(), inv.due_date) < 0)) return 'ledger-row--overdue';
  if (inv.status === 'Part-Paid') return 'ledger-row--part';
  return '';
}

function downloadTaxInvoiceHtml(inv, settings) {
  const cur = settings.currency || 'AUD';
  const total = Number(inv.amount_cents || 0);
  const paid = Number(inv.amount_paid_cents || 0);
  const bal = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const taxRate = Number(settings.tax_rate || 0);
  const accent = PRESET_ACCENTS[settings.brand_preset] || '#057a55';
  const delta = inv.due_date ? daysBetween(today(), inv.due_date) : null;
  const agingNote = bal <= 0
    ? 'PAID IN FULL'
    : delta !== null && delta < 0
      ? `OVERDUE (${Math.abs(delta)} DAYS)`
      : delta === 0
        ? 'DUE TODAY'
        : delta !== null && delta > 0
          ? `DUE IN ${delta} DAYS`
          : inv.status;
  const subtitleParts = [
    settings.address,
    settings.phone,
    settings.email,
    settings.tax_id ? `Tax ID: ${settings.tax_id}` : '',
  ].filter(Boolean);

  downloadHtmlDoc(`${inv.invoice_number}.html`, {
    title: `TAX INVOICE ${inv.invoice_number}`,
    businessName: settings.business_name,
    subtitle: subtitleParts.join(' · '),
    accent,
    bodyHtml: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px">
        <div class="box" style="margin:0">
          <div style="font-size:11px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:.05em;margin-bottom:4px">Bill To</div>
          <div style="font-weight:700;font-size:16px">${esc(inv.client_name || '')}</div>
          ${inv.client_contact ? `<div>Attn: ${esc(inv.client_contact)}</div>` : ''}
          ${inv.client_address ? `<div style="white-space:pre-line;color:#334155">${esc(inv.client_address)}</div>` : ''}
          ${inv.client_email ? `<div style="color:#475569">${esc(inv.client_email)}</div>` : ''}
        </div>
        <div class="box" style="margin:0">
          <table style="margin:0">
            <tr><th style="background:transparent;padding:4px 0">Invoice #</th><td class="num" style="padding:4px 0"><strong>${esc(inv.invoice_number)}</strong></td></tr>
            <tr><th style="background:transparent;padding:4px 0">Issue Date</th><td class="num" style="padding:4px 0">${esc(fmtDay(inv.issue_date))}</td></tr>
            <tr><th style="background:transparent;padding:4px 0">Due Date</th><td class="num" style="padding:4px 0"><strong>${esc(fmtDay(inv.due_date))}</strong></td></tr>
            <tr><th style="background:transparent;padding:4px 0">Status</th><td class="num" style="padding:4px 0"><strong>${esc(agingNote)}</strong></td></tr>
          </table>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Description</th><th class="num">Amount (${esc(cur)})</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${esc(inv.job_title || 'Professional Services')}</strong>
              ${inv.notes ? `<div style="color:#52525b;font-size:13px;margin-top:4px">${esc(inv.notes)}</div>` : ''}
            </td>
            <td class="num">${esc(money(inv.subtotal_cents || total, { currency: cur }))}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#52525b">Tax (${esc(String(taxRate))}%)</td>
            <td class="num">${esc(money(inv.tax_cents || 0, { currency: cur }))}</td>
          </tr>
          <tr class="total-row">
            <td style="text-align:right">Invoice Total</td>
            <td class="num">${esc(money(total, { currency: cur }))}</td>
          </tr>
          <tr>
            <td style="text-align:right;color:#157347">Less Payments Received (${esc(String(pct))}%)</td>
            <td class="num" style="color:#157347">-${esc(money(paid, { currency: cur }))}</td>
          </tr>
          <tr class="total-row">
            <td style="text-align:right">Balance Due</td>
            <td class="num" style="${bal > 0 ? 'color:#be1e2d' : 'color:#157347'}">${esc(money(bal, { currency: cur }))}</td>
          </tr>
        </tbody>
      </table>

      <div class="box">
        <strong>Payment &amp; Remittance Instructions</strong>
        <div style="margin-top:4px;white-space:pre-line">${esc(settings.bank_details || `Please quote ${inv.invoice_number} when remitting payment.`)}</div>
      </div>`,
  });
}

function downloadQuoteHtml(q, settings) {
  const cur = settings.currency || 'AUD';
  const accent = PRESET_ACCENTS[settings.brand_preset] || '#057a55';
  downloadHtmlDoc(`${q.quote_number}.html`, {
    title: `QUOTE ${q.quote_number}`,
    businessName: settings.business_name,
    subtitle: [settings.address, settings.phone, settings.email, settings.tax_id ? `Tax ID: ${settings.tax_id}` : ''].filter(Boolean).join(' · '),
    accent,
    bodyHtml: `
      <div class="box">
        <strong>Prepared For:</strong> ${esc(q.client_name || '')}${q.client_contact ? ' (' + esc(q.client_contact) + ')' : ''}<br>
        <strong>Job:</strong> ${esc(q.job_title || '')}<br>
        <strong>Issued:</strong> ${esc(fmtDay(q.issue_date))} · <strong>Valid Until:</strong> ${esc(fmtDay(q.valid_until))}
      </div>
      <table>
        <thead><tr><th>Scope</th><th class="num">Amount (${esc(cur)})</th></tr></thead>
        <tbody>
          <tr><td><strong>${esc(q.job_title || '')}</strong>${q.notes ? `<div style="margin-top:4px;color:#52525b">${esc(q.notes)}</div>` : ''}</td><td class="num">${esc(money(q.subtotal_cents, { currency: cur }))}</td></tr>
          <tr><td style="text-align:right;color:#52525b">Tax (${esc(String(settings.tax_rate || 0))}%)</td><td class="num">${esc(money(q.tax_cents, { currency: cur }))}</td></tr>
          <tr class="total-row"><td style="text-align:right">Quote Total</td><td class="num">${esc(money(q.total_cents, { currency: cur }))}</td></tr>
        </tbody>
      </table>`,
  });
}

export function renderQuotesView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const query = (state.quoteSearch || '').trim().toLowerCase();
  const rows = state.quotes.filter((q) => {
    if (state.quoteFilter !== 'All' && q.status !== state.quoteFilter) return false;
    if (!query) return true;
    return [q.quote_number, q.client_name, q.job_title, q.notes].some((v) => String(v || '').toLowerCase().includes(query));
  });
  const totalQuoted = rows.reduce((a, b) => a + Number(b.total_cents || 0), 0);
  const openQuotes = state.quotes.filter((q) => (q.status === 'Draft' || q.status === 'Sent') && !q.converted_invoice_id);
  const openQuotedVal = openQuotes.reduce((s, q) => s + Number(q.total_cents || 0), 0);
  const acceptedCount = state.quotes.filter((q) => q.status === 'Accepted' || q.converted_invoice_id).length;
  const countQ = (st) => st === 'All' ? state.quotes.length : state.quotes.filter((q) => q.status === st).length;

  return html`
    <section class="ji-masthead" aria-label="Quotes Workbench">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          PROPOSALS &amp; ESTIMATES · ${state.session.settings.tax_rate || 0}% TAX
        </div>
        <h1 class="ji-masthead__title">Quotes Workbench</h1>
        <div class="ji-masthead__meta">
          <span>Auto-numbered Q-series proposals</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click conversion into linked Tax Invoices</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--gold">
          <span class="ji-pod__lbl">Open Pipeline</span>
          <span class="ji-pod__val">${money(openQuotedVal, { currency: cur })}</span>
          <span class="ji-pod__sub">${openQuotes.length} awaiting reply</span>
        </div>
        <div class="ji-pod ji-pod--mint">
          <span class="ji-pod__lbl">Accepted / Billed</span>
          <span class="ji-pod__val">${acceptedCount}</span>
          <span class="ji-pod__sub">of ${state.quotes.length} total quotes</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="quote-new">${icon('plus', { size: 15 })} New Quote</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search quote #, client, job…" value="${state.quoteSearch || ''}" data-input="quote-search">
      </div>
      <div class="tk-segmented">
        ${['All', ...QUOTE_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.quoteFilter === st })}" data-action="quote-filter" data-status="${st}">${st} (${countQ(st)})</button>`)}
      </div>
    </div>

    <section class="ledger-sheet">
      ${state.loading && !state.quotes.length ? skeleton(3) : rows.length ? html`
        <div>
          ${rows.map((q) => html`
            <div class="ji-folio ji-folio--quote ${q.status === 'Accepted' ? 'ji-folio--accepted' : q.status === 'Declined' || q.status === 'Expired' ? 'ji-folio--declined' : ''}" data-key="qt-${q.id}">
              <div class="ji-folio__head">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span class="doc-num">${q.quote_number}</span>
                    <span>${q.client_name}</span>
                    <span class="tk-tag ${q.status === 'Accepted' ? 'tk-tag--ok' : q.status === 'Declined' || q.status === 'Expired' ? 'tk-tag--bad' : q.status === 'Sent' ? 'tk-tag--info' : ''}">${q.status}</span>
                    ${q.converted_invoice_number ? html`<span class="tk-tag inv-badge-paid">Invoiced ${q.converted_invoice_number}</span>` : ''}
                    ${q.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span><strong>${q.job_title}</strong></span>
                    <span>Issued ${fmtDay(q.issue_date)}</span>
                    ${q.valid_until ? html`<span>Valid until ${fmtDay(q.valid_until)}</span>` : ''}
                    <span class="ledger-amount ledger-amount--muted">Sub ${money(q.subtotal_cents, { currency: cur })} + Tax ${money(q.tax_cents, { currency: cur })}</span>
                  </div>
                  ${q.notes ? html`<div class="tk-muted" style="font-size:13px">${q.notes}</div>` : ''}
                </div>
                <div class="ji-folio__amt">
                  <span class="ji-folio__amt-lbl">Quote Total</span>
                  <span class="ledger-amount ledger-amount--lg">${money(q.total_cents, { currency: cur })}</span>
                </div>
              </div>
              <div class="ji-folio__actions">
                ${q.status === 'Draft' ? html`<button type="button" class="k-btn k-btn--sm" data-action="quote-status" data-id="${q.id}" data-status="Sent">Mark Sent</button>` : ''}
                ${q.status === 'Sent' ? html`
                  <button type="button" class="k-btn k-btn--sm" data-action="quote-status" data-id="${q.id}" data-status="Accepted">Accept</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="quote-status" data-id="${q.id}" data-status="Declined">Decline</button>` : ''}
                ${!q.converted_invoice_id && q.status !== 'Declined' ? html`
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="quote-convert" data-id="${q.id}">${icon('receipt', { size: 14 })} Convert to Invoice</button>` : ''}
                <button type="button" class="k-btn k-btn--sm" data-action="quote-print" data-id="${q.id}">${icon('printer', { size: 14 })} Sheet</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="quote-del" data-id="${q.id}">Delete</button>
              </div>
            </div>`)}
        </div>
        <div class="ledger-totals">
          <span class="ledger-totals__label">Quotes Ledger Total (${rows.length})</span>
          <div class="ledger-totals__cols">
            <div class="ledger-total-cell">
              <span class="ledger-total-cell__k">Combined Quoted Value</span>
              <span class="ledger-total-cell__v">${money(totalQuoted, { currency: cur })}</span>
            </div>
          </div>
        </div>` : emptyState({ iconName: 'file', title: 'No quotes found', text: 'Create a priced quote against any job to auto-calculate tax and convert straight to an invoice.' })}
    </section>`;
}

export function renderInvoicesView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const query = (state.invoiceSearch || '').trim().toLowerCase();
  const rows = state.invoices.filter((inv) => {
    if (state.invoiceFilter !== 'All' && inv.status !== state.invoiceFilter) return false;
    if (!query) return true;
    return [inv.invoice_number, inv.client_name, inv.job_title, inv.notes].some((v) => String(v || '').toLowerCase().includes(query));
  });

  const totalBilled = state.invoices.reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const totalPaid = state.invoices.reduce((a, b) => a + Number(b.amount_paid_cents || 0), 0);
  const totalOwed = Math.max(0, totalBilled - totalPaid);
  const overdueCount = state.invoices.filter((i) => i.status === 'Overdue' || (Number(i.balance_cents) > 0 && i.due_date && daysBetween(today(), i.due_date) < 0)).length;
  const pct = totalBilled > 0 ? Math.min(100, Math.round((totalPaid / totalBilled) * 100)) : 0;
  const ringColor = pct >= 75 ? '#34d399' : pct >= 45 ? '#fbbf24' : '#fb7185';

  const shownBilled = rows.reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const shownPaid = rows.reduce((a, b) => a + Number(b.amount_paid_cents || 0), 0);
  const shownOwed = Math.max(0, shownBilled - shownPaid);

  const countByStatus = (st) => st === 'All' ? state.invoices.length : state.invoices.filter((i) => i.status === st).length;

  return html`
    <section class="ji-masthead" aria-label="Invoices Receivables Ledger">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${overdueCount > 0 ? '#fbbf24' : '#34d399'}"></span>
          ACCOUNTS RECEIVABLE · ${state.invoices.length} INVOICE${state.invoices.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ji-masthead__title">Invoices &amp; Ledger</h1>
        <div class="ji-masthead__meta">
          <span>1-click Mark Paid &amp; partial settlements</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Overdue aging &amp; printable HTML tax invoices</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--ring">
          <div class="tk-ring" style="--p:${pct}%;--ring-color:${ringColor};--ring-size:48px">
            <span class="tk-ring__val">${pct}%</span>
          </div>
          <div>
            <span class="ji-pod__lbl">Collected</span>
            <div class="ji-pod__val" style="font-size:15px">${money(totalPaid, { currency: cur })}</div>
            <span class="ji-pod__sub">of ${money(totalBilled, { currency: cur })}</span>
          </div>
        </div>
        <div class="${cls('ji-pod', { 'ji-pod--alert': overdueCount > 0 })}">
          <span class="ji-pod__lbl">Outstanding</span>
          <span class="ji-pod__val">${money(totalOwed, { currency: cur })}</span>
          <span class="ji-pod__sub">${overdueCount > 0 ? `${overdueCount} overdue` : 'Within terms'}</span>
        </div>
        <div class="ji-pod ji-pod--mint">
          <span class="ji-pod__lbl">Total Invoiced</span>
          <span class="ji-pod__val">${money(totalBilled, { currency: cur })}</span>
          <span class="ji-pod__sub">${state.invoices.length} issued</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="invoice-new">${icon('plus', { size: 15 })} New Invoice</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search invoice #, client, job…" value="${state.invoiceSearch || ''}" data-input="invoice-search">
      </div>
      <div class="tk-segmented">
        ${INVOICE_FILTERS.map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.invoiceFilter === st })}" data-action="inv-filter" data-status="${st}">${st} (${countByStatus(st)})</button>`)}
      </div>
    </div>

    <section class="ledger-sheet">
      <div class="ledger-sheet__head">
        <span class="tk-sheet__title">${icon('receipt', { size: 17 })} Receivables Register</span>
        <span class="tk-muted" style="font-size:12.5px">Showing ${rows.length} of ${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}</span>
      </div>
      ${state.loading && !state.invoices.length ? skeleton(4) : rows.length ? html`
        <div>
          ${rows.map((inv) => html`
            <div class="ledger-row ${invRowClass(inv)}" data-key="inv-${inv.id}">
              <div class="tk-row__main">
                <div class="tk-row__title">
                  <span class="doc-num">${inv.invoice_number}</span>
                  <span>${inv.client_name}</span>
                  <span class="tk-tag ${invBadgeClass(inv.status)}">${inv.status}</span>
                  ${renderAgingPill(inv, { showSettled: true })}
                  ${inv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-row__meta">
                  ${inv.job_title ? html`<span><strong>${inv.job_title}</strong></span>` : ''}
                  <span>Issued ${fmtDay(inv.issue_date)}</span>
                  <span>Due ${fmtDay(inv.due_date)}</span>
                </div>
              </div>

              ${renderPaymentProgress(inv, cur)}

              <div class="tk-row__aside">
                ${inv.balance_cents > 0 ? html`
                  <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inv-mark-paid" data-id="${inv.id}">${icon('stamp-paid', { size: 14 })} Mark Paid</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="pay-invoice" data-id="${inv.id}">Part Pay</button>
                  <button type="button" class="k-btn k-btn--sm btn-remind-polite" data-action="copy-reminder" data-tone="polite" data-id="${inv.id}">${icon('copy', { size: 13 })} Polite</button>
                  <button type="button" class="k-btn k-btn--sm btn-remind-firm" data-action="copy-reminder" data-tone="firm" data-id="${inv.id}">${icon('copy', { size: 13 })} Firm</button>` : ''}
                <button type="button" class="k-btn k-btn--sm" data-action="inv-print" data-id="${inv.id}">${icon('printer', { size: 14 })} Tax Invoice</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="inv-del" data-id="${inv.id}">Delete</button>
              </div>
            </div>`)}
        </div>
        <div class="ledger-totals">
          <span class="ledger-totals__label">Ledger Summary (${rows.length} ${state.invoiceFilter === 'All' ? 'Invoices' : state.invoiceFilter})</span>
          <div class="ledger-totals__cols">
            <div class="ledger-total-cell">
              <span class="ledger-total-cell__k">Total Billed</span>
              <span class="ledger-total-cell__v">${money(shownBilled, { currency: cur })}</span>
            </div>
            <div class="ledger-total-cell">
              <span class="ledger-total-cell__k">Total Collected</span>
              <span class="ledger-total-cell__v ledger-total-cell__v--ok">${money(shownPaid, { currency: cur })}</span>
            </div>
            <div class="ledger-total-cell">
              <span class="ledger-total-cell__k">Balance Outstanding</span>
              <span class="ledger-total-cell__v ${shownOwed > 0 ? 'ledger-total-cell__v--due' : 'ledger-total-cell__v--ok'}">${money(shownOwed, { currency: cur })}</span>
            </div>
          </div>
        </div>` : emptyState({ iconName: 'receipt', title: 'No invoices matching filter', text: 'Create a new invoice or convert an accepted quote from the Quotes Workbench.' })}
    </section>`;
}

export function renderPaymentsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const rows = state.paymentMethodFilter === 'All'
    ? state.payments
    : state.payments.filter((p) => p.method === state.paymentMethodFilter);
  const totalReceived = rows.reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const allTotal = state.payments.reduce((a, b) => a + Number(b.amount_cents || 0), 0);
  const openInvCount = (state.invoices || []).filter((i) => Number(i.balance_cents || 0) > 0).length;
  const countMethod = (m) => m === 'All' ? state.payments.length : state.payments.filter((p) => p.method === m).length;

  return html`
    <section class="ji-masthead" aria-label="Payments Ledger">
      <div class="ji-masthead__copy">
        <div class="ji-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          CASH &amp; BANK RECEIPTS · ${state.payments.length} RECORDED
        </div>
        <h1 class="ji-masthead__title">Payments Ledger</h1>
        <div class="ji-masthead__meta">
          <span>Every receipt atomically reconciles its linked invoice</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Double-ruled audit totals</span>
        </div>
      </div>

      <div class="ji-masthead__pods" style="align-items:center">
        <div class="ji-pod ji-pod--mint">
          <span class="ji-pod__lbl">Total Received</span>
          <span class="ji-pod__val">${money(allTotal, { currency: cur })}</span>
          <span class="ji-pod__sub">${state.payments.length} receipt${state.payments.length === 1 ? '' : 's'}</span>
        </div>
        <a href="#/invoices" class="ji-pod">
          <span class="ji-pod__lbl">Open Invoices</span>
          <span class="ji-pod__val">${openInvCount}</span>
          <span class="ji-pod__sub">Awaiting payment →</span>
        </a>
        <button type="button" class="k-btn k-btn--primary ji-btn-mint" data-action="pay-new">${icon('plus', { size: 15 })} Record Payment</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...PAY_METHODS].map((m) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.paymentMethodFilter === m })}" data-action="pay-method-filter" data-method="${m}">${m} (${countMethod(m)})</button>`)}
      </div>
    </div>

    <section class="ledger-sheet">
      ${state.loading && !state.payments.length ? skeleton(4) : rows.length ? html`
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead>
              <tr><th>Date</th><th>Invoice #</th><th>Client</th><th>Method</th><th>Reference</th><th class="tk-num">Amount</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((p) => html`
                <tr data-key="pay-${p.id}">
                  <td>${fmtDay(p.payment_date)}</td>
                  <td><span class="doc-num">${p.invoice_number}</span></td>
                  <td><strong>${p.client_name}</strong>${p.is_sample ? html` <span class="tk-tag tk-tag--sample">Sample</span>` : ''}</td>
                  <td><span class="tk-tag">${p.method}</span></td>
                  <td class="tk-mono">${p.reference || '—'}</td>
                  <td class="tk-num ledger-amount ledger-amount--paid">${money(p.amount_cents, { currency: cur })}</td>
                  <td>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="pay-del" data-id="${p.id}">Void</button>
                  </td>
                </tr>`)}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5">LEDGER TOTAL — ${rows.length} RECEIPT${rows.length === 1 ? '' : 'S'}</td>
                <td class="tk-num ledger-amount ledger-amount--lg ledger-amount--paid">${money(totalReceived, { currency: cur })}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>` : emptyState({ iconName: 'dollar', title: 'No payments recorded yet', text: 'Record a full or partial payment against any unpaid invoice.' })}
    </section>`;
}

export function wireBillingActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-input="quote-search"]', (e, el) => { state.quoteSearch = el.value; draw(); });
  on(root, 'input', '[data-input="invoice-search"]', (e, el) => { state.invoiceSearch = el.value; draw(); });
  on(root, 'click', '[data-action="quote-filter"]', (e, el) => { state.quoteFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="inv-filter"]', (e, el) => { state.invoiceFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="pay-method-filter"]', (e, el) => { state.paymentMethodFilter = el.dataset.method; draw(); });

  async function openNewQuote(presetJobId = null) {
    let jobs = state.jobs;
    if (!jobs.length) { const r = await api.get('/api/jobs'); jobs = r.jobs || []; state.jobs = jobs; }
    if (!jobs.length) { toast.error('Create a job first before raising a quote.'); return; }
    const taxRate = Number(state.session.settings.tax_rate || 0);
    const cur = state.session.settings.currency || 'AUD';
    const pickedJob = jobs.find((j) => Number(j.id) === Number(presetJobId)) || jobs[0];
    const defaultSub = pickedJob?.estimated_cents ? (pickedJob.estimated_cents / 100).toFixed(2) : '';

    const made = await formDialog({
      title: 'New Quote',
      submitLabel: 'Issue Quote',
      fields: html`
        <label class="k-field"><span class="k-field__label">Job</span>
          <select class="k-input" name="job_id" required>
            ${jobs.map((j) => html`<option value="${j.id}" ${String(j.id) === String(pickedJob.id) ? 'selected' : ''}>${j.title} — ${j.client_name}</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Valid Until</span><input class="k-input" type="date" name="valid_until" value="${addDays(today(), 30)}"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Subtotal (excl. tax)</span><input class="k-input" type="number" step="0.01" min="0" name="subtotal" value="${defaultSub}" placeholder="0.00" required></label>
          <label class="k-field"><span class="k-field__label">Status</span>
            <select class="k-input" name="status">
              ${QUOTE_STATUSES.map((st) => html`<option value="${st}" ${st === 'Sent' ? 'selected' : ''}>${st}</option>`)}
            </select>
          </label>
        </div>
        <div class="calc-preview" data-calc-preview>
          <span>Tax (${taxRate}%): <strong data-calc-tax>$0.00</strong></span>
          <span>Quote Total: <strong data-calc-total>$0.00</strong></span>
        </div>
        <label class="k-field"><span class="k-field__label">Scope / Terms Notes</span><textarea class="k-input" name="notes" rows="2" placeholder="Inclusions, exclusions, validity terms…"></textarea></label>`,
      onOpen: ({ form }) => {
        const subInput = qs('input[name="subtotal"]', form);
        const taxOut = qs('[data-calc-tax]', form);
        const totOut = qs('[data-calc-total]', form);
        const update = () => {
          const sub = Math.round(Number(subInput.value || 0) * 100);
          const tax = Math.round(sub * taxRate / 100);
          taxOut.textContent = money(tax, { currency: cur });
          totOut.textContent = money(sub + tax, { currency: cur });
        };
        subInput.addEventListener('input', update);
        update();
      },
      onSubmit: (v) => api.post('/api/quotes', v),
    });
    if (made) { toast.success(`Quote ${made.quote.quote_number} created.`); await loadScreen(); }
  }

  on(root, 'click', '[data-action="quote-new"]', () => openNewQuote(null));
  on(root, 'click', '[data-action="quote-new-for-job"]', (e, el) => openNewQuote(Number(el.dataset.id)));

  on(root, 'click', '[data-action="quote-status"]', async (e, el) => {
    try {
      await api.post('/api/quotes/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Quote marked ${el.dataset.status}.`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="quote-convert"]', async (e, el) => {
    try {
      const res = await api.post('/api/quotes/convert', { id: Number(el.dataset.id), issue_date: today() });
      toast.success(`Converted to Tax Invoice ${res.invoice.invoice_number}!`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="quote-print"]', (e, el) => {
    const q = state.quotes.find((x) => String(x.id) === el.dataset.id);
    if (q) downloadQuoteHtml(q, state.session.settings);
  });

  on(root, 'click', '[data-action="quote-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete quote?', message: 'Remove this quote permanently?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/quotes', { id: Number(el.dataset.id) }); toast.success('Quote deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="invoice-new"]', async () => {
    let clients = state.clients;
    let jobs = state.jobs;
    if (!clients.length) { const r = await api.get('/api/clients'); clients = r.clients || []; state.clients = clients; }
    if (!jobs.length) { const r = await api.get('/api/jobs'); jobs = r.jobs || []; state.jobs = jobs; }
    if (!clients.length) { toast.error('Add a client first.'); return; }
    const taxRate = Number(state.session.settings.tax_rate || 0);
    const terms = Number(state.session.settings.payment_terms_days || 14);
    const cur = state.session.settings.currency || 'AUD';

    const made = await formDialog({
      title: 'New Tax Invoice',
      submitLabel: 'Create Invoice',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>
            ${clients.map((c) => html`<option value="${c.id}">${c.business_name}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Linked Job <span class="k-field__optional">optional</span></span>
          <select class="k-input" name="job_id">
            <option value="">No linked job</option>
            ${jobs.map((j) => html`<option value="${j.id}">${j.title} (${j.client_name})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_date" value="${addDays(today(), terms)}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Subtotal (excl. tax)</span>
          <input class="k-input" type="number" step="0.01" min="0.01" name="subtotal" placeholder="0.00" required>
        </label>
        <div class="calc-preview">
          <span>Tax (${taxRate}%): <strong data-inv-tax>$0.00</strong></span>
          <span>Invoice Total: <strong data-inv-total>$0.00</strong></span>
        </div>
        <label class="k-field"><span class="k-field__label">Line / Work Summary</span><textarea class="k-input" name="notes" rows="2" placeholder="Description printed on the tax invoice…"></textarea></label>`,
      onOpen: ({ form }) => {
        const subInput = qs('input[name="subtotal"]', form);
        const taxOut = qs('[data-inv-tax]', form);
        const totOut = qs('[data-inv-total]', form);
        const update = () => {
          const sub = Math.round(Number(subInput.value || 0) * 100);
          const tax = Math.round(sub * taxRate / 100);
          taxOut.textContent = money(tax, { currency: cur });
          totOut.textContent = money(sub + tax, { currency: cur });
        };
        subInput.addEventListener('input', update);
        update();
      },
      onSubmit: (v) => api.post('/api/invoices', { ...v, today: today() }),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} issued.`); await loadScreen(); }
  });

  // 1-Click Mark Paid (settles full remaining balance via Bank Transfer)
  on(root, 'click', '[data-action="inv-mark-paid"]', async (e, el) => {
    const id = Number(el.dataset.id);
    const pool = [
      ...(state.invoices || []),
      ...(state.desk?.overdueQueue || []),
      ...(state.desk?.dueSoon || []),
    ];
    const inv = pool.find((x) => Number(x.id) === id);
    if (!inv) return;
    const bal = Math.max(0, Number(inv.balance_cents != null ? inv.balance_cents : (Number(inv.amount_cents || 0) - Number(inv.amount_paid_cents || 0))));
    if (bal <= 0) { toast.success(`${inv.invoice_number} is already paid.`); return; }
    const cur = state.session.settings.currency || 'AUD';
    try {
      await api.post('/api/payments', {
        invoice_id: inv.id,
        amount: (bal / 100).toFixed(2),
        payment_date: today(),
        method: 'Bank Transfer',
        reference: 'Quick Settle',
        today: today(),
      });
      toast.success(`${inv.invoice_number} marked Paid (${money(bal, { currency: cur })})!`);
      await loadScreen();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inv-print"]', (e, el) => {
    const all = [
      ...(state.invoices || []),
      ...(state.desk?.overdueQueue || []),
      ...(state.desk?.dueSoon || []),
    ];
    const inv = all.find((x) => String(x.id) === el.dataset.id);
    if (inv) downloadTaxInvoiceHtml(inv, state.session.settings);
  });

  on(root, 'click', '[data-action="inv-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete invoice?', message: 'Deletes this invoice and any payments logged against it.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/invoices', { id: Number(el.dataset.id) }); toast.success('Invoice deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  async function openRecordPayment(presetInvId = null) {
    let invs = state.invoices;
    if (!invs.length) {
      const r = await api.get('/api/invoices', { today: today() });
      invs = r.invoices || [];
      state.invoices = invs;
    }
    const openInvs = invs.filter((i) => i.balance_cents > 0);
    const list = presetInvId ? invs : (openInvs.length ? openInvs : invs);
    if (!list.length) { toast.error('Create an invoice first.'); return; }
    const picked = list.find((i) => Number(i.id) === Number(presetInvId)) || list[0];
    const cur = state.session.settings.currency || 'AUD';
    const defaultAmt = ((picked.balance_cents || picked.amount_cents) / 100).toFixed(2);

    const made = await formDialog({
      title: 'Record Payment',
      submitLabel: 'Apply Payment',
      fields: html`
        <label class="k-field"><span class="k-field__label">Invoice</span>
          <select class="k-input" name="invoice_id" required>
            ${list.map((i) => html`<option value="${i.id}" ${String(i.id) === String(picked.id) ? 'selected' : ''}>${i.invoice_number} — ${i.client_name} (Due ${money(i.balance_cents, { currency: cur })})</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Amount Received</span><input class="k-input" type="number" step="0.01" min="0.01" name="amount" value="${defaultAmt}" required></label>
          <label class="k-field"><span class="k-field__label">Payment Date</span><input class="k-input" type="date" name="payment_date" value="${today()}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Method</span>
            <select class="k-input" name="method">
              ${PAY_METHODS.map((m) => html`<option value="${m}">${m}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Reference</span><input class="k-input" name="reference" placeholder="EFT / Receipt #"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes <span class="k-field__optional">optional</span></span><input class="k-input" name="notes" placeholder="Progress payment, final settlement…"></label>`,
      onSubmit: (v) => api.post('/api/payments', { ...v, today: today() }),
    });
    if (made) {
      toast.success(`Payment applied — invoice is now ${made.invoice.status}.`);
      await loadScreen();
    }
  }

  on(root, 'click', '[data-action="pay-invoice"]', (e, el) => openRecordPayment(Number(el.dataset.id)));
  on(root, 'click', '[data-action="pay-new"]', () => openRecordPayment(null));

  on(root, 'click', '[data-action="pay-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Void payment?', message: 'Removes this payment and recalculates the parent invoice balance and status.', confirmLabel: 'Void payment', danger: true });
    if (!ok) return;
    try { await api.delete('/api/payments', { id: Number(el.dataset.id), today: today() }); toast.success('Payment voided.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
