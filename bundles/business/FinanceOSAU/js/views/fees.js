// Fee Disclosure Statement (FDS) calculator, Unified Masthead with Consent Rate Ring,
// Fee Consent & FDS Cards, 1-click consent capture & printable HTML FDS summary.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderFdsOptInPill } from '../au_ui.js';

function previewAuFee(draft) {
  const port = Math.max(0, Number(draft.portfolio_value || 0));
  const portCents = Math.round(port * 100);
  const customRate = Number(draft.percentage_rate || 0);
  const defaultRate = port <= 500000 ? 1.1 : port <= 1000000 ? 0.88 : 0.77;
  const effRate = customRate > 0 ? customRate : defaultRate;
  const fixedCents = Math.round(Math.max(0, Number(draft.fixed_fee || 0)) * 100);
  let annualCents = 0;
  if (draft.fee_type === 'fixed') annualCents = fixedCents;
  else if (draft.fee_type === 'combination') annualCents = Math.round(portCents * (effRate / 100)) + fixedCents;
  else annualCents = Math.round(portCents * (effRate / 100));
  const div = draft.billing_frequency === 'monthly' ? 12 : draft.billing_frequency === 'quarterly' ? 4 : 1;
  const perPeriodCents = Math.round(annualCents / div);
  const gstCents = Math.round(annualCents / 11);
  return { annualCents, perPeriodCents, gstCents, effRate: draft.fee_type === 'fixed' ? 0 : effRate, defaultRate };
}

export function renderFeesView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const d = state.feeDraft;
  const calc = previewAuFee(d);
  const rows = state.feeFilter === 'All'
    ? state.fees
    : state.fees.filter((f) => f.ongoing_fee_consent === state.feeFilter);
  const loadingRows = state.loading && !state.fees.length;

  const totalFees = state.fees.length;
  const consentedList = state.fees.filter((f) => f.ongoing_fee_consent === 'yes');
  const pendingList = state.fees.filter((f) => f.ongoing_fee_consent === 'pending');
  const declinedList = state.fees.filter((f) => f.ongoing_fee_consent === 'no');
  const consentPct = totalFees ? Math.round((consentedList.length / totalFees) * 100) : 100;
  const totalFua = state.fees.reduce((acc, f) => acc + Number(f.portfolio_value_cents || 0), 0);
  const totalAnnualRev = state.fees.reduce((acc, f) => acc + Number(f.calculated_annual_fee_cents || 0), 0);

  return html`
    <section class="au-masthead" aria-label="Fee Disclosure Statements and Ongoing Fee Consent">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('receipt', { size: 12 })} CORPORATIONS ACT DIV 3 · ONGOING FEE ARRANGEMENTS
        </div>
        <h1 class="au-masthead__title">Fee Disclosure Statements</h1>
        <div class="au-masthead__meta">
          <span>Tiered FUA &amp; flat retainers (incl. GST)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Annual opt-in consent countdowns</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--ring au-pod--gold" aria-label="Consent rate ${consentPct}%">
          <div class="tk-ring" style="--p:${consentPct}%;--ring-color:${consentPct >= 80 ? '#34d399' : '#e8c26f'};--ring-size:48px">
            <span class="tk-ring__val">${consentPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="au-pod__lbl">Consented</span>
            <span class="au-pod__val" style="font-size:16px">${consentedList.length} of ${totalFees}</span>
            <span class="au-pod__sub">Written opt-in</span>
          </div>
        </div>

        <div class="au-pod au-pod--gold au-pod--wide">
          <span class="au-pod__lbl">${icon('trending', { size: 12 })} Annual Fee Book</span>
          <span class="au-pod__val au-pod__val--serif">${money(totalAnnualRev, { currency })}</span>
          <span class="au-pod__sub">On ${money(totalFua, { currency })} FUA</span>
        </div>

        <div class="${cls('au-pod', { 'au-pod--alert': pendingList.length > 0 })}">
          <span class="au-pod__lbl">${icon('clock', { size: 12 })} Pending</span>
          <span class="au-pod__val">${pendingList.length}</span>
          <span class="au-pod__sub">${pendingList.length > 0 ? 'Awaiting opt-in' : 'All signed'}</span>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('check-circle', { size: 12 })} Active FDS</span>
          <span class="au-pod__val">${totalFees}</span>
          <span class="au-pod__sub">${declinedList.length} declined</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('receipt', { size: 17 })} Issue Fee Disclosure Statement</h2></div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="save-fds" novalidate>
            <label class="k-field">
              <span class="k-field__label">Client Household</span>
              <select class="k-input" name="client_id" data-fee-input="client_id" required>
                ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`)}
              </select>
            </label>

            <div class="k-form__row">
              <label class="k-field">
                <span class="k-field__label">Portfolio / FUA Value (${currency})</span>
                <input class="k-input" type="number" step="5000" min="0" name="portfolio_value" value="${d.portfolio_value}" data-fee-input="portfolio_value" required>
              </label>
              <label class="k-field">
                <span class="k-field__label">Fee Structure</span>
                <select class="k-input" name="fee_type" data-fee-input="fee_type">
                  <option value="percentage" ${d.fee_type === 'percentage' ? 'selected' : ''}>Percentage of FUA (Tiered)</option>
                  <option value="fixed" ${d.fee_type === 'fixed' ? 'selected' : ''}>Fixed Annual Fee</option>
                  <option value="combination" ${d.fee_type === 'combination' ? 'selected' : ''}>Combination (% + Fixed)</option>
                </select>
              </label>
            </div>

            <div class="k-form__row">
              ${d.fee_type !== 'fixed' ? html`
                <label class="k-field">
                  <span class="k-field__label">Rate % <span class="k-field__optional">blank = tiered ${calc.defaultRate}%</span></span>
                  <input class="k-input" type="number" step="0.01" min="0" max="10" name="percentage_rate" value="${d.percentage_rate}" placeholder="${calc.defaultRate}" data-fee-input="percentage_rate">
                </label>` : ''}
              ${d.fee_type !== 'percentage' ? html`
                <label class="k-field">
                  <span class="k-field__label">Fixed Fee (${currency} p.a.)</span>
                  <input class="k-input" type="number" step="100" min="0" name="fixed_fee" value="${d.fixed_fee}" data-fee-input="fixed_fee">
                </label>` : ''}
              <label class="k-field">
                <span class="k-field__label">Billing Frequency</span>
                <select class="k-input" name="billing_frequency" data-fee-input="billing_frequency">
                  <option value="monthly" ${d.billing_frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                  <option value="quarterly" ${d.billing_frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                  <option value="annually" ${d.billing_frequency === 'annually' ? 'selected' : ''}>Annually</option>
                </select>
              </label>
            </div>

            <div class="au-fee-box">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.065em;color:#f6d58e;font-weight:760">Auto-Calculated Annual Advice Fee (Incl. GST)</div>
              <div class="au-fee-box__big">${money(calc.annualCents, { currency })} <span style="font-size:15px;font-weight:500">/ year</span></div>
              <div class="au-fee-box__sub">
                <span>Per ${d.billing_frequency}: <strong>${money(calc.perPeriodCents, { currency })}</strong></span>
                <span>Incl. GST (10%): <strong>${money(calc.gstCents, { currency })}</strong></span>
                ${calc.effRate > 0 ? html`<span>Effective Rate: <strong>${calc.effRate.toFixed(2)}%</strong></span>` : html`<span>Flat Retainer</span>`}
              </div>
            </div>

            <div class="k-form__row">
              <label class="k-field">
                <span class="k-field__label">Ongoing Fee Consent</span>
                <select class="k-input" name="ongoing_fee_consent" data-fee-input="ongoing_fee_consent">
                  <option value="pending" ${d.ongoing_fee_consent === 'pending' ? 'selected' : ''}>Pending Client Signature</option>
                  <option value="yes" ${d.ongoing_fee_consent === 'yes' ? 'selected' : ''}>Yes, Client Consented</option>
                  <option value="no" ${d.ongoing_fee_consent === 'no' ? 'selected' : ''}>No, Declined</option>
                </select>
              </label>
              <label class="k-field">
                <span class="k-field__label">Effective Date</span>
                <input class="k-input" type="date" name="effective_date" value="${d.effective_date || today()}" data-fee-input="effective_date">
              </label>
            </div>

            <label class="k-field">
              <span class="k-field__label">Disclosure Notes</span>
              <input class="k-input" name="notes" placeholder="Services entitled for the upcoming 12 months…">
            </label>

            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Record Fee Disclosure Statement</button>
            </div>
          </form>
        </div>
      </section>

      <div class="tk-stack">
        <div class="tk-toolbar" style="margin-bottom:0">
          <div class="tk-segmented" role="tablist" aria-label="Filter FDS records by consent">
            ${[
              ['All', `All (${totalFees})`],
              ['yes', `Consented (${consentedList.length})`],
              ['pending', `Pending (${pendingList.length})`],
              ['no', `Declined (${declinedList.length})`],
            ].map(([val, lbl]) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.feeFilter === val })}" data-action="fee-filter" data-filter="${val}">${lbl}</button>`)}
          </div>
        </div>

        ${loadingRows ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
          <div class="au-card-list">
            ${rows.map((f) => {
              const tone = f.ongoing_fee_consent === 'yes' ? 'au-rec-card--ok' : f.ongoing_fee_consent === 'no' ? 'au-rec-card--bad' : 'au-rec-card--warn';
              const div = f.billing_frequency === 'monthly' ? 12 : f.billing_frequency === 'quarterly' ? 4 : 1;
              const periodCents = Math.round(Number(f.calculated_annual_fee_cents || 0) / div);
              return html`
                <article class="au-rec-card ${tone}" data-key="fds-${f.id}">
                  <div class="au-rec-card__top">
                    <div class="au-rec-card__id">
                      <span class="au-monogram au-monogram--sm">${initials(`${f.first_name} ${f.last_name}`)}</span>
                      <div style="min-width:0;display:grid;gap:4px">
                        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                          <strong style="font-size:15px">${f.first_name} ${f.last_name}</strong>
                          ${renderFdsOptInPill(f)}
                          ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                        <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px">
                          <strong style="font-family:var(--k-font-display);font-size:19px;color:var(--au-forest);font-variant-numeric:tabular-nums">${money(f.calculated_annual_fee_cents, { currency })} <span style="font-family:var(--k-font);font-size:12px;font-weight:600;color:var(--k-muted)">p.a.</span></strong>
                          <span class="tk-muted" style="font-size:12.5px">(${money(periodCents, { currency })} / ${f.billing_frequency})</span>
                        </div>
                      </div>
                    </div>
                    <div class="au-rec-card__aside">
                      ${f.ongoing_fee_consent !== 'yes' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="fds-consent" data-id="${f.id}" data-signer="${f.first_name} ${f.last_name}">Record Consent ✓</button>` : ''}
                      <button type="button" class="k-btn k-btn--sm" data-action="print-fds" data-id="${f.id}">${icon('printer', { size: 14 })} FDS HTML</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="delete-fds" data-id="${f.id}">Delete</button>
                    </div>
                  </div>
                  <div class="au-rec-card__meta">
                    <span>FUA: <strong style="color:var(--k-text)">${money(f.portfolio_value_cents, { currency })}</strong></span>
                    <span class="tk-tag">${f.fee_type}${f.percentage_rate ? ` · ${f.percentage_rate}%` : ''}</span>
                    <span>Effective: ${fmtDay(f.effective_date)}</span>
                    <span>Renewal: <strong style="color:var(--k-text)">${fmtDay(f.renewal_due_date)}</strong></span>
                  </div>
                  ${f.notes ? html`<div class="tk-muted" style="font-size:13px">${f.notes}</div>` : ''}
                </article>`;
            })}
          </div>` : emptyState({ iconName: 'receipt', title: 'No Fee Disclosure Statements match', text: 'Use the calculator on the left to issue an FDS.' })}
      </div>
    </div>`;
}

export function wireFeesActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-fee-input]', (e, el) => {
    state.feeDraft[el.dataset.feeInput] = el.value;
    draw();
  });
  on(root, 'change', '[data-fee-input]', (e, el) => {
    state.feeDraft[el.dataset.feeInput] = el.value;
    draw();
  });
  on(root, 'click', '[data-action="fee-filter"]', (e, el) => {
    state.feeFilter = el.dataset.filter;
    draw();
  });

  on(root, 'submit', 'form[data-form="save-fds"]', async (e, form) => {
    e.preventDefault();
    try {
      const notesEl = form.querySelector('[name="notes"]');
      const d = state.feeDraft;
      const res = await api.post('/api/fees', {
        client_id: Number(d.client_id),
        portfolio_value: Number(d.portfolio_value),
        fee_type: d.fee_type,
        percentage_rate: d.percentage_rate === '' ? 0 : Number(d.percentage_rate),
        fixed_fee: d.fee_type === 'percentage' ? 0 : Number(d.fixed_fee || 0),
        billing_frequency: d.billing_frequency,
        ongoing_fee_consent: d.ongoing_fee_consent,
        effective_date: d.effective_date || today(),
        notes: notesEl ? notesEl.value : '',
      });
      toast.success(`FDS recorded — Annual fee: ${money(res.fee.calculated_annual_fee_cents, { currency: state.session.settings.currency || 'AUD' })}.`);
      if (notesEl) notesEl.value = '';
      await loadScreen('/fees');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="fds-consent"]', async (e, el) => {
    try {
      await api.post('/api/fees/consent', { id: Number(el.dataset.id), ongoing_fee_consent: 'yes', client_signer: el.dataset.signer });
      toast.success('Client ongoing fee consent recorded.');
      await loadScreen('/fees');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="delete-fds"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete FDS record?', message: 'Remove this Fee Disclosure Statement?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/fees', { id: Number(el.dataset.id) }); toast.success('FDS deleted.'); await loadScreen('/fees'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-fds"]', (e, el) => {
    const f = state.fees.find((x) => String(x.id) === el.dataset.id);
    if (!f) return;
    const s = state.session.settings;
    const cur = s.currency || 'AUD';
    const gstCents = Math.round(Number(f.calculated_annual_fee_cents) / 11);
    const div = f.billing_frequency === 'monthly' ? 12 : f.billing_frequency === 'quarterly' ? 4 : 1;
    const periodCents = Math.round(Number(f.calculated_annual_fee_cents) / div);
    downloadHtmlDoc(`fds-${f.last_name.toLowerCase()}-${f.effective_date || today()}.html`, {
      title: 'Fee Disclosure Statement (FDS)',
      businessName: s.business_name,
      subtitle: `${s.afsl_number || 'Australian AFSL'} · Corporations Act 2001 Part 7.7A`,
      accent: '#114237',
      bodyHtml: `
        <table>
          <tr><th>Client Name</th><td>${esc(f.first_name + ' ' + f.last_name)}</td><th>Effective Date</th><td>${esc(f.effective_date)}</td></tr>
          <tr><th>Funds Under Advice (FUA)</th><td class="num">${esc(money(f.portfolio_value_cents, { currency: cur }))}</td><th>Renewal Due</th><td>${esc(f.renewal_due_date)}</td></tr>
          <tr><th>Fee Structure</th><td>${esc(f.fee_type)}${f.percentage_rate ? ` (${esc(f.percentage_rate)}% p.a.)` : ''}</td><th>Billing Frequency</th><td>${esc(f.billing_frequency)}</td></tr>
          <tr><th>Per-Period Instalment</th><td class="num">${esc(money(periodCents, { currency: cur }))}</td><th>GST Included (10%)</th><td class="num">${esc(money(gstCents, { currency: cur }))}</td></tr>
          <tr class="total-row"><td colspan="3">Total Ongoing Annual Advisory Fee (Incl. GST)</td><td class="num">${esc(money(f.calculated_annual_fee_cents, { currency: cur }))}</td></tr>
        </table>
        <div class="box"><strong>Ongoing Fee Consent Status:</strong> ${esc(f.ongoing_fee_consent.toUpperCase())}${f.consent_signed_date ? ' · Signed on ' + esc(f.consent_signed_date) + ' by ' + esc(f.client_signer || f.first_name + ' ' + f.last_name) : ' · Awaiting written client opt-in consent.'}</div>
        ${f.notes ? `<div class="box"><strong>Services &amp; Notes:</strong><br>${esc(f.notes)}</div>` : ''}
        <p style="font-size:12.5px;color:#52525b;margin-top:20px">You have the right to terminate this ongoing fee arrangement at any time by written notice. No ongoing fees will be deducted without valid annual written consent.</p>`,
    });
  });
}
