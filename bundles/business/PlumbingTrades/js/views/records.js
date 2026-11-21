// Work Orders Log, 4-Stage Parts Procurement Pipeline, Monogrammed Customers Directory & Accounting Invoices
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, num, initials } from '../../kit/format.js';
import { today, fmtDay, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, openDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { PART_STATUSES, jobFormFields } from './dispatch.js';

const CUST_TYPES = ['Residential', 'Commercial', 'Property Manager', 'Strata / Body Corporate', 'Real Estate Agency'];
const INV_STATUSES = ['Draft', 'Sent', 'Paid', 'Overdue'];
const NEXT_PART = { Requested: 'Ordered', Ordered: 'Received', Received: 'Fitted' };

function partTone(s) {
  if (s === 'Fitted') return 'tk-tag--ok';
  if (s === 'Received') return 'tk-tag--info';
  if (s === 'Ordered') return 'tk-tag--accent';
  return 'tk-tag--warn';
}

function partCardMod(s) {
  if (s === 'Fitted') return 'pl-part-card--fitted';
  if (s === 'Received') return 'pl-part-card--received';
  if (s === 'Ordered') return 'pl-part-card--ordered';
  return '';
}

function invTone(s) {
  if (s === 'Paid') return 'tk-tag--ok';
  if (s === 'Overdue') return 'tk-tag--bad';
  if (s === 'Sent') return 'tk-tag--info';
  return '';
}

function invCardModifier(s) {
  if (s === 'Paid') return 'inv-card--paid';
  if (s === 'Overdue') return 'inv-card--overdue';
  if (s === 'Draft') return 'inv-card--draft';
  return '';
}

function renderInvoiceHtmlDoc(inv, settings, parts = []) {
  const cur = settings.currency || 'AUD';
  const isPaid = inv.status === 'Paid';
  const docLabel = isPaid ? 'PAYMENT RECEIPT' : 'TAX INVOICE';
  const partsRows = parts.length
    ? parts.map((p) => `<tr><td style="padding-left:24px;color:#52525b">• ${p.quantity}× ${esc(p.item)}${p.supplier ? ' (' + esc(p.supplier) + ')' : ''}</td><td class="num" style="color:#52525b">${money(p.quantity * p.unit_cost_cents, { currency: cur })}</td></tr>`).join('')
    : '';
  downloadHtmlDoc(`${isPaid ? 'receipt' : 'tax-invoice'}-${inv.invoice_number}.html`, {
    title: `${docLabel} · ${inv.invoice_number}`,
    businessName: settings.business_name,
    subtitle: [settings.address, settings.phone, settings.email, settings.tax_id ? `Tax ID: ${settings.tax_id}` : ''].filter(Boolean).join(' · '),
    accent: isPaid ? '#0f766e' : '#1d4ed8',
    bodyHtml: `
      <div class="box">
        <strong>Bill To:</strong> ${esc(inv.customer_name || '')}<br>
        ${inv.customer_address ? esc(inv.customer_address) + '<br>' : ''}
        ${inv.customer_phone ? 'Phone: ' + esc(inv.customer_phone) + ' ' : ''}${inv.customer_email ? '· ' + esc(inv.customer_email) : ''}<br>
        <strong>Job Ref:</strong> ${esc(inv.job_number || '')}${inv.site_address ? ' — ' + esc(inv.site_address) : ''}<br>
        <strong>Issue Date:</strong> ${esc(fmtDay(inv.issue_date))} &nbsp; <strong>Due Date:</strong> ${esc(inv.due_date ? fmtDay(inv.due_date) : 'On receipt')} &nbsp; <strong>Status:</strong> <strong>${esc(inv.status.toUpperCase())}</strong>
      </div>
      <table>
        <thead><tr><th>Itemized Description</th><th class="num">Amount (${esc(cur)})</th></tr></thead>
        <tbody>
          <tr><td>Field Service Labour${inv.labour_hours ? ` (${num(inv.labour_hours, { decimals: 2 })} hrs @ ${money(inv.hourly_rate_cents, { currency: cur })}/hr)` : ''}</td><td class="num">${money(inv.labour_cents, { currency: cur })}</td></tr>
          <tr><td>Parts &amp; Materials Supplied</td><td class="num">${money(inv.parts_cents, { currency: cur })}</td></tr>
          ${partsRows}
          <tr><td><strong>Subtotal</strong></td><td class="num"><strong>${money(inv.subtotal_cents, { currency: cur })}</strong></td></tr>
          <tr><td>Tax (${inv.tax_rate}%)</td><td class="num">${money(inv.tax_cents, { currency: cur })}</td></tr>
          <tr class="total-row"><td>${isPaid ? 'Total Paid' : 'Total Due'}</td><td class="num">${money(inv.total_cents, { currency: cur })}</td></tr>
        </tbody>
      </table>
      ${inv.notes ? `<div class="box"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ''}
      ${isPaid ? '<div class="box" style="border-color:#86efac;background:#f0fdf4;color:#166534"><strong>PAID IN FULL</strong> — Thank you for your prompt payment.</div>' : ''}`,
  });
}

function buildInvoiceSmsText(inv, settings) {
  const cur = settings.currency || 'AUD';
  const biz = settings.business_name || 'Our Plumbing Team';
  const contact = settings.phone ? ` Questions? Call ${settings.phone}.` : '';
  const phoneLine = inv.customer_phone ? `\n[To: ${inv.customer_phone}]` : '';
  if (inv.status === 'Paid') {
    return `Hi ${inv.customer_name || 'there'}, thanks for your payment! Receipt ${inv.invoice_number} (${money(inv.total_cents, { currency: cur })}) for ${inv.job_number || 'your plumbing job'} at ${inv.site_address || 'your property'} is paid in full. — ${biz}.${contact}${phoneLine}`;
  }
  const duePart = inv.due_date ? ` Due ${fmtDay(inv.due_date)}.` : '';
  return `Hi ${inv.customer_name || 'there'}, update from ${biz}: Invoice ${inv.invoice_number} for ${inv.job_number || 'your job'} (${inv.site_address || 'site'}) is ready — Labour ${money(inv.labour_cents, { currency: cur })} + Parts ${money(inv.parts_cents, { currency: cur })} + Tax ${money(inv.tax_cents, { currency: cur })} = Total ${money(inv.total_cents, { currency: cur })}.${duePart}${contact}${phoneLine}`;
}

export function renderVisitsView(state) {
  const rows = state.visitsFollowUpOnly ? state.visits.filter((v) => v.follow_up_required) : state.visits;
  const totalHours = state.visits.reduce((sum, v) => sum + Number(v.hours_on_site || 0), 0);
  const followUpCount = state.visits.filter((v) => v.follow_up_required).length;

  return html`
    <section class="pl-masthead" aria-label="Work Orders Header">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">FIELD ATTENDANCE LOGS</div>
        <h1 class="pl-masthead__title">Work Orders &amp; Visits</h1>
        <div class="pl-masthead__meta">
          <span>On-site plumber attendance</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Billable hours &amp; return flags</span>
        </div>
      </div>
      <div class="pl-masthead__pods" style="align-items:center">
        <div class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('clock', { size: 11 })} Logged Hours</span>
          <span class="pl-pod__val">${num(totalHours, { decimals: 2 })}h</span>
          <span class="pl-pod__sub">${state.visits.length} site visit${state.visits.length === 1 ? '' : 's'}</span>
        </div>
        <div class="${cls('pl-pod', { 'pl-pod--alert': followUpCount > 0 })}">
          <span class="pl-pod__lbl">${icon('alert', { size: 11 })} Follow-ups</span>
          <span class="pl-pod__val">${followUpCount}</span>
          <span class="pl-pod__sub">${followUpCount > 0 ? 'Return needed' : 'All resolved'}</span>
        </div>
        <div class="pl-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="visit-new-pick">${icon('plus', { size: 16 })} Log Site Visit</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter visits">
        <button type="button" class="${cls('tk-pill', { 'is-on': !state.visitsFollowUpOnly })}" data-action="visits-filter" data-val="0">All Visits (${state.visits.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.visitsFollowUpOnly })}" data-action="visits-filter" data-val="1">Follow-up Needed (${followUpCount})</button>
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.visits.length ? skeleton(3) : rows.length ? rows.map((v) => html`
        <div class="${cls('pl-visit-card', { 'pl-visit-card--followup': v.follow_up_required })}" data-key="vlist-${v.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span class="job-code">${v.job_number || '#' + v.job_id}</span>
              <span class="pl-tech-chip"><span class="pl-tech-chip__av">${initials(v.technician_name || 'T')}</span>${v.technician_name}</span>
              <span class="tk-tag tk-tag--accent">${num(v.hours_on_site, { decimals: 2 })} hrs</span>
              ${v.follow_up_required ? html`<span class="tk-tag tk-tag--warn">Follow-up Required</span>` : ''}
              ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div style="font-size:14px">${v.work_performed}</div>
            <div class="tk-row__meta">
              <span class="pl-meta-ico">${icon('calendar', { size: 12 })} ${fmtDay(v.visit_date)}</span>
              <span>${v.customer_name || ''} · ${v.site_address || ''}</span>
              ${v.materials_used ? html`<span>Materials: ${v.materials_used}</span>` : ''}
            </div>
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--sm" data-action="open-job" data-id="${v.job_id}">Open Job</button>
          </div>
        </div>`) : emptyState({ iconName: 'clipboard', title: 'No site visits recorded', text: 'Log technician hours and work performed from any job card or right here.' })}
    </section>`;
}

export function renderPartsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const rows = state.partsStatus === 'All' ? state.parts : state.parts.filter((p) => p.status === state.partsStatus);
  const toOrder = state.parts.filter((p) => p.status === 'Requested' || p.status === 'Ordered');
  const fittedOrRec = state.parts.filter((p) => p.status === 'Received' || p.status === 'Fitted').length;
  const readyPct = state.parts.length ? Math.round((fittedOrRec / state.parts.length) * 100) : 100;
  const totalPartsVal = state.parts.reduce((s, p) => s + Number(p.quantity || 1) * Number(p.unit_cost_cents || 0), 0);

  return html`
    <section class="pl-masthead" aria-label="Parts Supply Header">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">TRADE SUPPLY &amp; VAN STOCK</div>
        <h1 class="pl-masthead__title">Parts &amp; Materials</h1>
        <div class="pl-masthead__meta">
          <span>Trade fittings from request to install</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap order copy</span>
        </div>
      </div>

      <div class="pl-masthead__pods" style="align-items:center">
        <div class="pl-pod pl-pod--ring">
          <div class="tk-ring" style="--p:${readyPct}%;--ring-color:#e6ad54;--ring-size:48px">
            <span class="tk-ring__val">${readyPct}%</span>
          </div>
          <div>
            <span class="pl-pod__lbl">On Hand / Fitted</span>
            <div class="pl-pod__val" style="font-size:15px">${fittedOrRec}/${state.parts.length} Lines</div>
            <div class="pl-pod__sub">${toOrder.length} pending</div>
          </div>
        </div>
        <div class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('dollar', { size: 11 })} Parts Value</span>
          <span class="pl-pod__val">${money(totalPartsVal, { currency })}</span>
          <span class="pl-pod__sub">Across all jobs</span>
        </div>
        <div class="pl-pod ${toOrder.length > 0 ? 'pl-pod--alert' : ''}">
          <span class="pl-pod__lbl">${icon('valve-gauge', { size: 11 })} Pending</span>
          <span class="pl-pod__val">${toOrder.length}</span>
          <span class="pl-pod__sub">Req / Ordered</span>
        </div>
        <div class="pl-masthead__cta">
          ${toOrder.length ? html`<button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-parts-order">${icon('copy', { size: 14 })} Copy Order (${toOrder.length})</button>` : ''}
          <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="part-new-pick">${icon('plus', { size: 15 })} Request Part</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter parts by status">
        ${['All', ...PART_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.partsStatus === st })}" data-action="parts-filter" data-status="${st}">
            ${st} (${st === 'All' ? state.parts.length : state.parts.filter((p) => p.status === st).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.parts.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="pl-parts-list">
        ${rows.map((p) => {
          const stepIdx = PART_STATUSES.indexOf(p.status);
          return html`
            <article class="pl-part-card ${partCardMod(p.status)}" data-key="pr-${p.id}">
              <div class="pl-part-card__top">
                <div class="tk-stack" style="gap:5px">
                  <div class="tk-row__title">
                    <span class="job-code">${p.job_number || '#' + p.job_id}</span>
                    <span>${p.quantity}× ${p.item}</span>
                    <span class="tk-tag ${partTone(p.status)}">${p.status}</span>
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span><strong style="color:var(--k-text)">${money(p.quantity * p.unit_cost_cents, { currency })}</strong> (${money(p.unit_cost_cents, { currency })} ea)</span>
                    ${p.supplier ? html`<span>Supplier: ${p.supplier}</span>` : ''}
                    <span>${p.customer_name || ''}${p.site_address ? ' · ' + p.site_address : ''}</span>
                    ${p.notes ? html`<span>Note: ${p.notes}</span>` : ''}
                  </div>
                </div>
                <div class="tk-btn-row">
                  ${NEXT_PART[p.status] ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="part-status" data-id="${p.id}" data-status="${NEXT_PART[p.status]}">Mark ${NEXT_PART[p.status]}</button>` : ''}
                  <button type="button" class="k-btn k-btn--sm" data-action="open-job" data-id="${p.job_id}">Job</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="part-del" data-id="${p.id}">Delete</button>
                </div>
              </div>
              <div class="pl-part-steps" aria-label="Part progress">
                ${PART_STATUSES.map((st, idx) => html`
                  <div class="${cls('pl-part-step', { 'is-done': idx < stepIdx || p.status === 'Fitted', 'is-now': idx === stepIdx && p.status !== 'Fitted' })}">
                    ${idx < stepIdx || p.status === 'Fitted' ? icon('check', { size: 12 }) : ''} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'valve-gauge', title: 'No parts requests here', text: 'Technicians can request fittings or fixtures against any active job.' })}</section>`}`;
}

export function renderCustomersView(state) {
  const q = (state.custSearch || '').trim().toLowerCase();
  const rows = state.customers.filter((c) => {
    if (state.custType !== 'All' && c.customer_type !== state.custType) return false;
    if (q) {
      const hay = `${c.name} ${c.phone} ${c.address} ${c.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const openJobsTotal = state.customers.reduce((s, c) => s + Number(c.open_jobs || 0), 0);
  const commercialCount = state.customers.filter((c) => c.customer_type !== 'Residential').length;

  return html`
    <section class="pl-masthead" aria-label="Customers Header">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">CLIENT ACCOUNTS &amp; SITES</div>
        <h1 class="pl-masthead__title">Customers Directory</h1>
        <div class="pl-masthead__meta">
          <span>Residential, strata &amp; commercial</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap address &amp; phone</span>
        </div>
      </div>
      <div class="pl-masthead__pods" style="align-items:center">
        <div class="pl-pod">
          <span class="pl-pod__lbl">${icon('users', { size: 11 })} Clients</span>
          <span class="pl-pod__val">${state.customers.length}</span>
          <span class="pl-pod__sub">${commercialCount} commercial/strata</span>
        </div>
        <div class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('pipe-wrench', { size: 11 })} Open Jobs</span>
          <span class="pl-pod__val">${openJobsTotal}</span>
          <span class="pl-pod__sub">Active accounts</span>
        </div>
        <div class="pl-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="cust-new">${icon('plus', { size: 16 })} Add Customer</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search name, phone or address…" value="${state.custSearch}" data-action="cust-search">
      </div>
      <div class="tk-segmented" role="group" aria-label="Filter customers by type">
        ${['All', ...CUST_TYPES].map((tp) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.custType === tp })}" data-action="cust-type" data-type="${tp}">${tp}</button>`)}
      </div>
    </div>

    ${state.loading && !state.customers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="pl-client-grid">
        ${rows.length ? rows.map((c) => {
          const cardCls = c.customer_type === 'Commercial'
            ? 'pl-client-card--commercial'
            : (c.customer_type.includes('Strata') || c.customer_type.includes('Property'))
              ? 'pl-client-card--strata'
              : '';
          return html`
            <article class="pl-client-card ${cardCls}" data-key="cust-${c.id}">
              <div class="pl-client-card__head">
                <div class="pl-client-avatar">${initials(c.name || 'C')}</div>
                <div style="min-width:0;flex:1">
                  <h3 class="tk-card__title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</h3>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px">
                    <span class="tk-tag tk-tag--accent">${c.customer_type}</span>
                    ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                </div>
              </div>

              <div class="pl-client-stats">
                <div>
                  <div class="pl-client-stat__lbl">Total Jobs</div>
                  <div class="pl-client-stat__val">${c.job_count || 0}</div>
                </div>
                <div>
                  <div class="pl-client-stat__lbl">Open Jobs</div>
                  <div class="pl-client-stat__val" style="${Number(c.open_jobs) > 0 ? 'color:var(--pl-copper)' : ''}">${c.open_jobs || 0}</div>
                </div>
              </div>

              <div class="van-copy-row">
                <button type="button" class="copy-chip copy-chip--phone" data-action="copy-val" data-label="Phone" data-val="${c.phone}"><span class="copy-chip__icon">${icon('phone', { size: 11 })}</span><span>${c.phone}</span><span class="copy-chip__copy-hint">${icon('copy', { size: 11 })}</span></button>
                <button type="button" class="copy-chip" data-action="copy-val" data-label="Address" data-val="${c.address}"><span class="copy-chip__icon">${icon('pin', { size: 11 })}</span><span>Copy Address</span><span class="copy-chip__copy-hint">${icon('copy', { size: 11 })}</span></button>
              </div>
              <div class="tk-muted" style="font-size:13px">${c.address}</div>
              ${c.notes ? html`<div style="font-size:12.5px;padding:8px 10px;border-radius:8px;background:var(--k-surface-2)">${c.notes}</div>` : ''}
              <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cust-book-job" data-id="${c.id}">${icon('pipe-wrench', { size: 14 })} Book Job</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="cust-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cust-del" data-id="${c.id}">Delete</button>
              </div>
            </article>`;
        }) : emptyState({ iconName: 'users', title: 'No customers found', text: 'Add your residential, commercial or strata clients to book jobs and raise invoices.' })}
      </div>`}`;
}

export function renderInvoicesView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = (state.invSearch || '').trim().toLowerCase();
  const rows = state.invoices.filter((i) => {
    if (state.invStatus !== 'All' && i.status !== state.invStatus) return false;
    if (q) {
      const hay = `${i.invoice_number} ${i.job_number || ''} ${i.customer_name || ''} ${i.site_address || ''} ${i.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const paidTotal = state.invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + Number(i.total_cents || 0), 0);
  const unpaidTotal = state.invoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + Number(i.total_cents || 0), 0);
  const grandTotal = paidTotal + unpaidTotal;
  const collectedPct = grandTotal > 0 ? Math.round((paidTotal / grandTotal) * 100) : 100;
  const overdueCount = state.invoices.filter((i) => i.status === 'Overdue').length;
  const todayStr = today();

  return html`
    <section class="pl-masthead" aria-label="Invoices Header">
      <div class="pl-masthead__copy">
        <div class="pl-masthead__eyebrow">ACCOUNTS RECEIVABLE</div>
        <h1 class="pl-masthead__title">Job Invoices &amp; Receipts</h1>
        <div class="pl-masthead__meta">
          <span>Itemized labour, parts &amp; tax</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>HTML sheets &amp; SMS</span>
        </div>
      </div>

      <div class="pl-masthead__pods pl-masthead__pods--ring3" style="align-items:center">
        <div class="pl-pod pl-pod--ring">
          <div class="tk-ring" style="--p:${collectedPct}%;--ring-color:#2dd4bf;--ring-size:48px">
            <span class="tk-ring__val">${collectedPct}%</span>
          </div>
          <div>
            <span class="pl-pod__lbl">Collected</span>
            <div class="pl-pod__val" style="font-size:15px">${money(paidTotal, { currency })}</div>
            <div class="pl-pod__sub">${state.invoices.length} invoice${state.invoices.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div class="pl-pod pl-pod--copper">
          <span class="pl-pod__lbl">${icon('dollar', { size: 11 })} Outstanding</span>
          <span class="pl-pod__val">${money(unpaidTotal, { currency })}</span>
          <span class="pl-pod__sub">Unpaid balance</span>
        </div>
        <div class="${cls('pl-pod', { 'pl-pod--alert': overdueCount > 0 })}">
          <span class="pl-pod__lbl">${icon('alert', { size: 11 })} Overdue</span>
          <span class="pl-pod__val">${overdueCount}</span>
          <span class="pl-pod__sub">${overdueCount > 0 ? 'Chase now' : 'None overdue'}</span>
        </div>
        <div class="pl-pod">
          <span class="pl-pod__lbl">${icon('receipt', { size: 11 })} Total Billed</span>
          <span class="pl-pod__val">${money(grandTotal, { currency })}</span>
          <span class="pl-pod__sub">Gross ledger</span>
        </div>
        <div class="pl-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="inv-from-job-pick">${icon('receipt', { size: 16 })} Raise Invoice from Job</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search invoice #, job #, customer…" value="${state.invSearch || ''}" data-action="inv-search">
      </div>
      <div class="tk-segmented" role="group" aria-label="Filter invoices by status">
        ${['All', ...INV_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.invStatus === st })}" data-action="inv-filter" data-status="${st}">
            ${st} (${st === 'All' ? state.invoices.length : state.invoices.filter((x) => x.status === st).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.invoices.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="inv-list">
        ${rows.map((inv) => {
          const dueGap = inv.due_date && inv.status !== 'Paid' ? daysBetween(todayStr, inv.due_date) : null;
          return html`
            <article class="inv-card ${invCardModifier(inv.status)}" data-key="inv-${inv.id}">
              <div class="inv-card__top">
                <div class="tk-stack" style="gap:4px">
                  <div class="inv-card__id">
                    <span class="job-code">${inv.invoice_number}</span>
                    <span class="inv-card__customer">${inv.customer_name || 'Customer'}</span>
                    <span class="tk-tag ${invTone(inv.status)}">${inv.status}</span>
                    <span class="job-code">${inv.job_number || '#' + inv.job_id}</span>
                    ${inv.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="tk-row__meta">
                    <span>Issued ${fmtDay(inv.issue_date)}</span>
                    ${inv.due_date ? html`<span>Due ${fmtDay(inv.due_date)}</span>` : ''}
                    ${dueGap !== null && dueGap < 0 ? html`<span class="tk-tag tk-tag--bad">${Math.abs(dueGap)}d overdue</span>` : ''}
                    ${dueGap !== null && dueGap >= 0 && dueGap <= 3 ? html`<span class="tk-tag tk-tag--warn">Due in ${dueGap}d</span>` : ''}
                    ${inv.site_address ? html`<span class="pl-meta-ico">${icon('pin', { size: 12 })} ${inv.site_address}</span>` : ''}
                  </div>
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--sm" data-action="preview-invoice" data-id="${inv.id}">${icon('eye', { size: 14 })} Preview</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="copy-inv-sms-eta" data-id="${inv.id}">${icon('chat', { size: 14 })} SMS</button>
                  <button type="button" class="k-btn k-btn--sm" data-action="print-invoice" data-id="${inv.id}">${icon('printer', { size: 14 })} ${inv.status === 'Paid' ? 'Receipt' : 'Tax Invoice'}</button>
                </div>
              </div>

              <div class="inv-card__ledger-wrap">
                <div class="inv-breakdown">
                  <div class="inv-breakdown__cell">
                    <span class="inv-breakdown__k">Labour</span>
                    <span class="inv-breakdown__v">${money(inv.labour_cents, { currency })}</span>
                    <span class="inv-breakdown__sub">${inv.labour_hours ? `${num(inv.labour_hours, { decimals: 2 })}h @ ${money(inv.hourly_rate_cents, { currency })}/h` : 'Fixed / Call-out'}</span>
                  </div>
                  <div class="inv-breakdown__cell">
                    <span class="inv-breakdown__k">Parts &amp; Materials</span>
                    <span class="inv-breakdown__v">${money(inv.parts_cents, { currency })}</span>
                    <span class="inv-breakdown__sub">Trade fittings &amp; stock</span>
                  </div>
                  <div class="inv-breakdown__cell">
                    <span class="inv-breakdown__k">Tax (${inv.tax_rate}%)</span>
                    <span class="inv-breakdown__v">${money(inv.tax_cents, { currency })}</span>
                    <span class="inv-breakdown__sub">Subtotal ${money(inv.subtotal_cents, { currency })}</span>
                  </div>
                  <div class="inv-breakdown__cell inv-breakdown__cell--total">
                    <span class="inv-breakdown__k">${inv.status === 'Paid' ? 'Total Paid' : 'Total Due'}</span>
                    <span class="inv-breakdown__v">${money(inv.total_cents, { currency })}</span>
                    <span class="inv-breakdown__sub">${inv.status}</span>
                  </div>
                </div>
              </div>

              <div class="inv-card__foot">
                <div class="tk-muted" style="font-size:13px">${inv.notes || inv.job_description || 'Standard trade invoice'}</div>
                <div class="tk-btn-row">
                  ${inv.status !== 'Paid' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="inv-status" data-id="${inv.id}" data-status="Paid">${icon('check', { size: 14 })} Mark Paid</button>` : ''}
                  ${inv.status === 'Draft' ? html`<button type="button" class="k-btn k-btn--sm" data-action="inv-status" data-id="${inv.id}" data-status="Sent">Mark Sent</button>` : ''}
                  ${inv.status === 'Sent' ? html`<button type="button" class="k-btn k-btn--sm" data-action="inv-status" data-id="${inv.id}" data-status="Overdue">Mark Overdue</button>` : ''}
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'receipt', title: 'No invoices match filter', text: 'Complete a job and click Raise Invoice from Job to auto-calculate labour and parts.' })}</section>`}`;
}

export function wireRecordActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="visits-filter"]', (e, el) => { state.visitsFollowUpOnly = el.dataset.val === '1'; draw(); });
  on(root, 'click', '[data-action="parts-filter"]', (e, el) => { state.partsStatus = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="cust-type"]', (e, el) => { state.custType = el.dataset.type; draw(); });
  on(root, 'input', '[data-action="cust-search"]', (e, el) => { state.custSearch = el.value; draw(); });
  on(root, 'click', '[data-action="inv-filter"]', (e, el) => { state.invStatus = el.dataset.status; draw(); });
  on(root, 'input', '[data-action="inv-search"]', (e, el) => { state.invSearch = el.value; draw(); });

  const custFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Customer Type</span>
        <select class="k-input" name="customer_type">${CUST_TYPES.map((t) => html`<option value="${t}" ${t === c.customer_type ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Email <span class="k-field__optional">optional</span></span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Service Address</span><input class="k-input" name="address" value="${c.address || ''}" required></label>
    <label class="k-field"><span class="k-field__label">Access / Site Notes <span class="k-field__optional">optional</span></span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="cust-new"]', async () => {
    const made = await formDialog({ title: 'Add Customer', submitLabel: 'Save Customer', fields: custFields(), onSubmit: (v) => api.post('/api/customers', v) });
    if (made) { toast.success('Customer saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="cust-edit"]', async (e, el) => {
    const c = state.customers.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save', fields: custFields(c), onSubmit: (v) => api.put('/api/customers', { ...v, id: c.id }) });
    if (saved) { toast.success('Customer updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="cust-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete customer?', message: 'Delete this customer record? Customers with active jobs cannot be deleted.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/customers', { id: Number(el.dataset.id) }); toast.success('Customer deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cust-book-job"]', async (e, el) => {
    const c = state.customers.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const made = await formDialog({
      title: `Book Job for ${c.name}`,
      submitLabel: 'Book Job',
      size: 'lg',
      fields: jobFormFields(state.customers, { customer_id: c.id, site_address: c.address }, c.id),
      onSubmit: (v) => api.post('/api/jobs', v),
    });
    if (made) { toast.success(`Job ${made.job.job_number} booked.`); await loadScreen(); }
  });

  async function ensureJobs() {
    if (!state.jobs.length) {
      const r = await api.get('/api/jobs');
      state.jobs = r.jobs || [];
    }
    return state.jobs;
  }

  on(root, 'click', '[data-action="visit-new-pick"]', async () => {
    const jobs = await ensureJobs();
    if (!jobs.length) { toast.error('Book a job first.'); return; }
    const made = await formDialog({
      title: 'Log On-Site Visit',
      submitLabel: 'Save Visit',
      fields: html`
        <label class="k-field"><span class="k-field__label">Job</span>
          <select class="k-input" name="job_id">${jobs.map((j) => html`<option value="${j.id}">${j.job_number} — ${j.customer_name} (${j.site_address})</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Technician</span><input class="k-input" name="technician_name" value="${state.session.me?.displayName || ''}" required></label>
          <label class="k-field"><span class="k-field__label">Visit Date</span><input class="k-input" type="date" name="visit_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Hours on Site</span><input class="k-input" type="number" step="0.25" min="0.25" name="hours_on_site" value="1.5" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Work Performed</span><textarea class="k-input" name="work_performed" rows="3" required></textarea></label>
        <label class="k-field"><span class="k-field__label">Materials Used</span><input class="k-input" name="materials_used"></label>
        <label class="k-check"><input type="checkbox" name="follow_up_required"><span>Follow-up visit required</span></label>`,
      onSubmit: (v) => api.post('/api/visits', v),
    });
    if (made) { toast.success('Site visit logged.'); await loadScreen(); }
  });

  const partFields = (jobs, lockedJobId = null) => html`
    ${lockedJobId ? html`<input type="hidden" name="job_id" value="${lockedJobId}">` : html`
      <label class="k-field"><span class="k-field__label">Job</span>
        <select class="k-input" name="job_id">${jobs.map((j) => html`<option value="${j.id}">${j.job_number} — ${j.customer_name}</option>`)}</select>
      </label>`}
    <label class="k-field"><span class="k-field__label">Part / Material</span><input class="k-input" name="item" placeholder="e.g. 20mm Copper Press Elbow" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Quantity</span><input class="k-input" type="number" min="1" name="quantity" value="1" required></label>
      <label class="k-field"><span class="k-field__label">Unit Cost</span><input class="k-input" type="number" step="0.01" min="0" name="unit_cost" value="0.00"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${PART_STATUSES.map((s) => html`<option value="${s}">${s}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Supplier</span><input class="k-input" name="supplier" placeholder="Reece, Tradelink…"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Trade counter ref, size spec…"></label>`;

  on(root, 'click', '[data-action="part-new"]', async (e, el) => {
    const made = await formDialog({ title: 'Request Part for Job', submitLabel: 'Add Part', fields: partFields([], el.dataset.job), onSubmit: (v) => api.post('/api/parts', v) });
    if (made) { toast.success('Part request added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="part-new-pick"]', async () => {
    const jobs = await ensureJobs();
    if (!jobs.length) { toast.error('Book a job first.'); return; }
    const made = await formDialog({ title: 'New Parts & Materials Request', submitLabel: 'Save Request', fields: partFields(jobs), onSubmit: (v) => api.post('/api/parts', v) });
    if (made) { toast.success('Part request saved.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="part-status"]', async (e, el) => {
    try { await api.post('/api/parts/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Part marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="part-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete part request?', message: 'Remove this part line item?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/parts', { id: Number(el.dataset.id) }); toast.success('Part request deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-parts-order"]', () => {
    const list = state.parts.filter((p) => p.status === 'Requested' || p.status === 'Ordered');
    const lines = list.map((p) => `- ${p.quantity}x ${p.item} [${p.job_number}] (${p.supplier || 'TBD'}) — ${p.status}`);
    copyText(`Trade Parts Order (${today()})\n${lines.join('\n')}`, { title: 'Trade parts order' });
  });

  on(root, 'click', '[data-action="inv-from-job-pick"]', async () => {
    const jobs = await ensureJobs();
    if (!jobs.length) { toast.error('No jobs available to invoice.'); return; }
    const s = state.session.settings;
    const rate = (Number(s.hourly_rate_cents || 12500) / 100).toFixed(2);
    const made = await formDialog({
      title: 'Raise Tax Invoice from Job',
      submitLabel: 'Generate Invoice',
      fields: html`
        <label class="k-field"><span class="k-field__label">Select Job</span>
          <select class="k-input" name="job_id">${jobs.map((j) => html`<option value="${j.id}">${j.job_number} — ${j.customer_name} (${j.status} · ${num(j.logged_hours || 0, { decimals: 2 })}h)</option>`)}</select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Hourly Rate</span><input class="k-input" type="number" step="0.01" min="0" name="hourly_rate" value="${rate}" required></label>
          <label class="k-field"><span class="k-field__label">Issue Date</span><input class="k-input" type="date" name="issue_date" value="${today()}" required></label>
        </div>
        <label class="k-check"><input type="checkbox" name="include_callout" checked><span>Include call-out fee (${money(s.callout_fee_cents || 0, { currency: s.currency })})</span></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Payment terms, EFT details…"></label>`,
      onSubmit: (v) => api.post('/api/invoices/from-job', v),
    });
    if (made) { toast.success(`Invoice ${made.invoice.invoice_number} created.`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="inv-status"]', async (e, el) => {
    try { await api.post('/api/invoices/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Invoice marked ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-inv-sms-eta"]', (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    const msg = buildInvoiceSmsText(inv, state.session.settings);
    copyText(msg, { title: `Customer SMS · ${inv.invoice_number}`, done: `Customer SMS copied for ${inv.customer_name || inv.invoice_number}.` });
  });

  on(root, 'click', '[data-action="preview-invoice"]', async (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    let parts = [];
    if (inv.job_id) {
      try {
        const det = await api.get('/api/jobs/detail', { id: inv.job_id });
        parts = det.parts || [];
      } catch {
        parts = [];
      }
    }
    const isPaid = inv.status === 'Paid';
    openDialog({
      title: `${isPaid ? 'Receipt' : 'Invoice Preview'} · ${inv.invoice_number}`,
      size: 'lg',
      body: html`
        <div class="inv-preview-meta">
          <div><div class="tk-kv__k">Bill To</div><div class="tk-kv__v">${inv.customer_name || 'Customer'}</div><div class="tk-muted" style="font-size:12.5px">${inv.customer_phone || ''}</div></div>
          <div><div class="tk-kv__k">Job / Site</div><div class="tk-kv__v">${inv.job_number || '#' + inv.job_id}</div><div class="tk-muted" style="font-size:12.5px">${inv.site_address || ''}</div></div>
          <div><div class="tk-kv__k">Issued / Due</div><div class="tk-kv__v">${fmtDay(inv.issue_date)}</div><div class="tk-muted" style="font-size:12.5px">Due: ${inv.due_date ? fmtDay(inv.due_date) : 'On receipt'}</div></div>
          <div><div class="tk-kv__k">Status</div><div style="margin-top:3px"><span class="tk-tag ${invTone(inv.status)}">${inv.status}</span></div></div>
        </div>
        <div class="tk-table-wrap">
          <table class="tk-table">
            <thead><tr><th>Itemized Charge</th><th class="tk-num">Amount</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Field Service Labour</strong>${inv.labour_hours ? html`<div class="tk-muted" style="font-size:12.5px">${num(inv.labour_hours, { decimals: 2 })} hrs @ ${money(inv.hourly_rate_cents, { currency: cur })}/hr</div>` : ''}</td>
                <td class="tk-num"><strong>${money(inv.labour_cents, { currency: cur })}</strong></td>
              </tr>
              <tr>
                <td><strong>Parts &amp; Materials</strong>${parts.length ? html`<div class="tk-muted" style="font-size:12.5px">${parts.map((p) => `${p.quantity}× ${p.item}`).join(' · ')}</div>` : ''}</td>
                <td class="tk-num"><strong>${money(inv.parts_cents, { currency: cur })}</strong></td>
              </tr>
              <tr><td class="tk-muted">Subtotal</td><td class="tk-num">${money(inv.subtotal_cents, { currency: cur })}</td></tr>
              <tr><td class="tk-muted">Tax (${inv.tax_rate}%)</td><td class="tk-num">${money(inv.tax_cents, { currency: cur })}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="invoice-calc-box">
          <div class="invoice-calc-row invoice-calc-row--total">
            <span>${isPaid ? 'Total Paid' : 'Total Due'}</span>
            <span>${money(inv.total_cents, { currency: cur })}</span>
          </div>
        </div>
        ${inv.notes ? html`<p class="tk-muted" style="font-size:13px"><strong>Notes:</strong> ${inv.notes}</p>` : ''}`,
      actions: [
        { label: 'Close', kind: 'ghost' },
        { label: 'Copy SMS ETA', run: () => { copyText(buildInvoiceSmsText(inv, s), { title: `Customer SMS · ${inv.invoice_number}`, done: 'Customer SMS copied.' }); return false; } },
        { label: isPaid ? 'Download Receipt HTML' : 'Download Tax Invoice HTML', kind: 'primary', run: () => { renderInvoiceHtmlDoc(inv, s, parts); return false; } },
      ],
    });
  });

  on(root, 'click', '[data-action="print-invoice"]', async (e, el) => {
    const inv = state.invoices.find((x) => String(x.id) === el.dataset.id);
    if (!inv) return;
    let parts = [];
    if (inv.job_id) {
      try {
        const det = await api.get('/api/jobs/detail', { id: inv.job_id });
        parts = det.parts || [];
      } catch {
        parts = [];
      }
    }
    renderInvoiceHtmlDoc(inv, state.session.settings, parts);
  });
}
