// Transfers Hub: Unified Oxford Navy & Champagne Brass Masthead,
// 4-Stage ACATS Transfer Stepper Cards, 3-Stage IRA / 401(k) Rollover Stepper Cards & 4-Stage 1035 Exchange Cards.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderTransferStatusPill, renderUsDeadlinePill } from '../us_ui.js';

const CUSTODIANS = ['Schwab', 'Fidelity', 'Vanguard', 'E*TRADE', 'BNY Pershing', 'LPL Financial', 'Other'];
const ACAT_STATUSES = ['Initiated', 'Custodian Pending', 'In Transit', 'Settled', 'Rejected'];
const ACAT_FLOW = ['Initiated', 'Custodian Pending', 'In Transit', 'Settled'];
const ACAT_NEXT = { Initiated: 'Custodian Pending', 'Custodian Pending': 'In Transit', 'In Transit': 'Settled' };

const ROLL_TYPES = ['Traditional to Traditional', 'Traditional to Roth', '401k to IRA', '403b to IRA'];
const DIRECT_MODES = ['Direct (trustee-to-trustee)', 'Indirect (60-day rollover)'];
const ROLL_STATUSES = ['Initiated', 'Custodian Pending', 'Funded', 'Cancelled'];
const ROLL_FLOW = ['Initiated', 'Custodian Pending', 'Funded'];
const ROLL_NEXT = { Initiated: 'Custodian Pending', 'Custodian Pending': 'Funded' };

const OLD_CARRIERS = ['Prudential', 'MetLife', 'Lincoln Financial', 'Nationwide', 'Pacific Life', 'John Hancock', 'Allianz Life', 'Other'];
const NEW_CARRIERS = ['Athene', 'Jackson National', 'Transamerica', 'Brighthouse Financial', 'Corebridge Financial', 'Equitable', 'Other'];
const EXCH_STATUSES = ['Reviewing', 'Submitted', 'Carrier Transfer', 'Completed', 'Cancelled'];
const EXCH_FLOW = ['Reviewing', 'Submitted', 'Carrier Transfer', 'Completed'];
const EXCH_NEXT = { Reviewing: 'Submitted', Submitted: 'Carrier Transfer', 'Carrier Transfer': 'Completed' };

export function renderTransfersView(state) {
  const cur = state.session.settings.currency || 'USD';
  const acatTotal = state.acats.reduce((a, x) => a + Number(x.estimated_value_cents || 0), 0);
  const rollTotal = state.rollovers.reduce((a, x) => a + Number(x.estimated_value_cents || 0), 0);
  const exchTotal = state.exchanges.reduce((a, x) => a + Number(x.estimated_value_cents || 0), 0);
  const combinedTotal = acatTotal + rollTotal + exchTotal;
  const loadingAny = state.loading && !state.acats.length && !state.rollovers.length && !state.exchanges.length;

  return html`
    <section class="us-masthead" aria-label="Asset Transfers Hub">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('us-acat', { size: 12 })} CUSTODIAN TRANSITIONS · ACATS · ROLLOVERS · 1035
        </div>
        <h1 class="us-masthead__title">Asset Transfers Hub</h1>
        <div class="us-masthead__meta">
          <span>ACATS ($75 fee tracking) &amp; 60-day IRA rollovers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>IRC §1035 exchange surrender-charge alerts</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--brass us-pod--wide">
          <span class="us-pod__lbl">${icon('trending', { size: 12 })} Total Transitions</span>
          <span class="us-pod__val us-pod__val--serif">${money(combinedTotal, { currency: cur })}</span>
          <span class="us-pod__sub">${state.acats.length} ACAT · ${state.rollovers.length} Rollover · ${state.exchanges.length} 1035</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('us-acat', { size: 12 })} ACATS</span>
          <span class="us-pod__val">${money(acatTotal, { currency: cur })}</span>
          <span class="us-pod__sub">${state.acats.length} instruction${state.acats.length === 1 ? '' : 's'}</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('shield', { size: 12 })} Roll &amp; 1035</span>
          <span class="us-pod__val">${money(rollTotal + exchTotal, { currency: cur })}</span>
          <span class="us-pod__sub">${state.rollovers.length + state.exchanges.length} tax-qualified</span>
        </div>

        <div class="us-masthead__cta-group">
          <button type="button" class="k-btn us-btn-ghost-dark" data-action="us-roll-new">${icon('plus', { size: 14 })} Rollover</button>
          <button type="button" class="k-btn us-btn-ghost-dark" data-action="us-1035-new">${icon('plus', { size: 14 })} 1035</button>
          <button type="button" class="k-btn us-btn-brass" data-action="us-acat-new">${icon('plus', { size: 15 })} New ACAT</button>
        </div>
      </div>
    </section>

    <div class="us-tabs">
      <div class="tk-segmented" role="tablist" aria-label="Transfer category tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.transferTab === 'acat' })}" data-action="us-tr-tab" data-tab="acat">ACATS Transfers (${state.acats.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.transferTab === 'rollover' })}" data-action="us-tr-tab" data-tab="rollover">IRA / 401(k) Rollovers (${state.rollovers.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.transferTab === '1035' })}" data-action="us-tr-tab" data-tab="1035">1035 Exchanges (${state.exchanges.length})</button>
      </div>
    </div>

    ${state.transferTab === 'acat' ? html`
      ${loadingAny ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.acats.length ? html`
        <div class="us-card-list">
          ${state.acats.map((a) => {
            const isBad = a.status === 'Rejected';
            const stepIdx = ACAT_FLOW.indexOf(a.status);
            const nextSt = ACAT_NEXT[a.status];
            const tone = a.status === 'Settled' ? 'us-rec-card--ok' : isBad ? 'us-rec-card--bad' : a.status === 'In Transit' ? 'us-rec-card--brass' : '';
            return html`
              <article class="us-rec-card ${tone}" data-key="ac-${a.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${a.first_name} ${a.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:5px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${a.first_name} ${a.last_name}</strong>
                        <span class="us-ref">${a.account_number}</span>
                        <span class="tk-tag tk-tag--accent">${a.custodian}</span>
                        ${renderTransferStatusPill(a.status, 'ACAT')}
                        <span class="tk-tag">${a.transfer_type}</span>
                        ${a.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px">
                        <strong style="font-family:var(--k-font-display);font-size:19px;color:var(--us-oxford);font-variant-numeric:tabular-nums">${money(a.estimated_value_cents, { currency: cur })}</strong>
                        <span class="tk-muted" style="font-size:12.5px">Transfer Fee: ${money(a.transfer_fee_cents, { currency: cur })} · Initiated ${fmtDay(a.initiated_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="us-acat-advance" data-id="${a.id}" data-status="${nextSt}">Move to ${nextSt} →</button>` : ''}
                    <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="us-acat-status" data-id="${a.id}" aria-label="ACAT status">
                      ${ACAT_STATUSES.map((st) => html`<option value="${st}" ${st === a.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-acat-del" data-id="${a.id}">Delete</button>
                  </div>
                </div>
                ${a.assets_to_transfer ? html`<div style="font-size:13px;color:var(--k-text);line-height:1.45"><strong>Positions:</strong> ${a.assets_to_transfer}</div>` : ''}
                ${a.notes ? html`<div class="tk-muted" style="font-size:12.5px">${a.notes}</div>` : ''}
                <div class="us-steps" aria-label="ACATS settlement stage">
                  ${ACAT_FLOW.map((st, idx) => html`
                    <div class="${cls('us-step', {
                      'is-cancel': isBad,
                      'is-done': !isBad && (idx < stepIdx || (a.status === 'Settled' && idx === 3)),
                      'is-now': !isBad && idx === stepIdx && a.status !== 'Settled',
                    })}">
                      ${!isBad && (idx < stepIdx || (a.status === 'Settled' && idx === 3)) ? '✓' : `${idx + 1}.`} ${st}
                    </div>`)}
                </div>
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'us-acat', title: 'No ACAT transfers', text: 'Initiate an Automated Customer Account Transfer from Schwab, Fidelity, Vanguard, or Pershing.' })}` : ''}

    ${state.transferTab === 'rollover' ? html`
      ${loadingAny ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.rollovers.length ? html`
        <div class="us-card-list">
          ${state.rollovers.map((r) => {
            const isCancel = r.status === 'Cancelled';
            const stepIdx = ROLL_FLOW.indexOf(r.status);
            const nextSt = ROLL_NEXT[r.status];
            const tone = r.status === 'Funded' ? 'us-rec-card--ok' : isCancel ? 'us-rec-card--muted' : 'us-rec-card--brass';
            return html`
              <article class="us-rec-card ${tone}" data-key="rl-${r.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:5px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${r.first_name} ${r.last_name}</strong>
                        <span class="tk-tag tk-tag--info">${r.rollover_type}</span>
                        ${renderTransferStatusPill(r.status)}
                        ${r.sixty_day_deadline
                          ? renderUsDeadlinePill(r.sixty_day_deadline, { warnDays: 15, prefix: '60-Day' })
                          : html`<span class="us-status-pill us-status-pill--ok"><span class="us-status-pill__dot"></span>Direct Trustee</span>`}
                        ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="us-route-pill">
                        <span>${r.current_custodian} (<span class="tk-mono">${r.current_account_number}</span>)</span>
                        ${icon('arrow-right', { size: 13 })}
                        <strong>${r.receiving_custodian}</strong>
                      </div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="us-roll-advance" data-id="${r.id}" data-status="${nextSt}">Move to ${nextSt} →</button>` : ''}
                    <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="us-roll-status" data-id="${r.id}" aria-label="Rollover status">
                      ${ROLL_STATUSES.map((st) => html`<option value="${st}" ${st === r.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-roll-del" data-id="${r.id}">Delete</button>
                  </div>
                </div>
                <div class="us-rec-card__meta">
                  <span>Est. Value: <strong style="color:var(--us-oxford)">${money(r.estimated_value_cents, { currency: cur })}</strong></span>
                  ${r.sixty_day_deadline ? html`<span>60-Day Cutoff: <strong style="color:var(--k-danger)">${fmtDay(r.sixty_day_deadline)}</strong></span>` : html`<span>Zero mandatory withholding</span>`}
                </div>
                ${r.notes ? html`<div class="tk-muted" style="font-size:13px">${r.notes}</div>` : ''}
                <div class="us-steps us-steps--3" aria-label="Rollover stage">
                  ${ROLL_FLOW.map((st, idx) => html`
                    <div class="${cls('us-step', {
                      'is-cancel': isCancel,
                      'is-done': !isCancel && (idx < stepIdx || (r.status === 'Funded' && idx === 2)),
                      'is-now': !isCancel && idx === stepIdx && r.status !== 'Funded',
                    })}">
                      ${!isCancel && (idx < stepIdx || (r.status === 'Funded' && idx === 2)) ? '✓' : `${idx + 1}.`} ${st}
                    </div>`)}
                </div>
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'us-acat', title: 'No retirement rollovers', text: 'Track Direct trustee-to-trustee or 60-day Indirect IRA/401(k) rollovers.' })}` : ''}

    ${state.transferTab === '1035' ? html`
      ${loadingAny ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.exchanges.length ? html`
        <div class="us-card-list">
          ${state.exchanges.map((e) => {
            const isCancel = e.status === 'Cancelled';
            const stepIdx = EXCH_FLOW.indexOf(e.status);
            const nextSt = EXCH_NEXT[e.status];
            const tone = e.status === 'Completed' ? 'us-rec-card--ok' : e.has_surrender_charges === 'Yes' ? 'us-rec-card--bad' : 'us-rec-card--brass';
            return html`
              <article class="us-rec-card ${tone}" data-key="ex-${e.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${e.first_name} ${e.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:5px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${e.first_name} ${e.last_name}</strong>
                        <span class="us-ref">${e.existing_policy_number}</span>
                        ${renderTransferStatusPill(e.status, '1035')}
                        <span class="tk-tag tk-tag--accent">${e.exchange_type}</span>
                        ${e.has_surrender_charges === 'Yes'
                          ? html`<span class="us-status-pill us-status-pill--bad"><span class="us-status-pill__dot"></span>Surrender: ${money(e.surrender_charges_cents, { currency: cur })}</span>`
                          : html`<span class="us-status-pill us-status-pill--ok"><span class="us-status-pill__dot"></span>No Surrender Fee</span>`}
                        ${e.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="us-route-pill">
                        <span>${e.existing_carrier}</span>
                        ${icon('arrow-right', { size: 13 })}
                        <strong>${e.new_carrier}</strong>
                        <span class="tk-muted">(${e.new_policy_type})</span>
                      </div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="us-1035-advance" data-id="${e.id}" data-status="${nextSt}">Move to ${nextSt} →</button>` : ''}
                    <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="us-1035-status" data-id="${e.id}" aria-label="1035 exchange status">
                      ${EXCH_STATUSES.map((st) => html`<option value="${st}" ${st === e.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-1035-del" data-id="${e.id}">Delete</button>
                  </div>
                </div>
                <div class="us-rec-card__meta">
                  <span>Contract Value: <strong style="color:var(--us-oxford)">${money(e.estimated_value_cents, { currency: cur })}</strong></span>
                </div>
                ${e.notes ? html`<div class="tk-muted" style="font-size:13px">${e.notes}</div>` : ''}
                <div class="us-steps" aria-label="1035 exchange stage">
                  ${EXCH_FLOW.map((st, idx) => html`
                    <div class="${cls('us-step', {
                      'is-cancel': isCancel,
                      'is-done': !isCancel && (idx < stepIdx || (e.status === 'Completed' && idx === 3)),
                      'is-now': !isCancel && idx === stepIdx && e.status !== 'Completed',
                    })}">
                      ${!isCancel && (idx < stepIdx || (e.status === 'Completed' && idx === 3)) ? '✓' : `${idx + 1}.`} ${st}
                    </div>`)}
                </div>
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'shield', title: 'No 1035 exchanges', text: 'Track tax-free Section 1035 life insurance or annuity contract exchanges.' })}` : ''}`;
}

export function wireTransferActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="us-tr-tab"]', (e, el) => { state.transferTab = el.dataset.tab; draw(); });

  on(root, 'click', '[data-action="us-acat-new"]', async () => {
    const made = await formDialog({
      title: 'Initiate ACAT Transfer',
      submitLabel: 'Submit ACAT',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Delivering Custodian</span><select class="k-input" name="custodian">${CUSTODIANS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Account Number</span><input class="k-input" name="account_number" required></label>
          <label class="k-field"><span class="k-field__label">Transfer Type</span><select class="k-input" name="transfer_type"><option value="Full">Full</option><option value="Partial">Partial</option></select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Estimated Value (USD)</span><input class="k-input" type="number" step="100" min="0" name="estimated_value" required></label>
          <label class="k-field"><span class="k-field__label">Est. Transfer Fee (USD)</span><input class="k-input" type="number" step="5" min="0" name="transfer_fee" value="75"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Assets to Transfer</span><textarea class="k-input" name="assets_to_transfer" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/acats', { ...v, client_id: Number(v.client_id), initiated_date: today() }),
    });
    if (made) { state.transferTab = 'acat'; toast.success('ACAT transfer created.'); await loadScreen('/transfers'); }
  });
  on(root, 'change', '[data-action="us-acat-status"]', async (e, el) => {
    try { await api.post('/api/acats/status', { id: Number(el.dataset.id), status: el.value }); toast.success('ACAT status updated.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-acat-advance"]', async (e, el) => {
    try { await api.post('/api/acats/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`ACAT moved to ${el.dataset.status}.`); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-acat-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete ACAT?', message: 'Remove this ACAT transfer?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/acats', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-roll-new"]', async () => {
    const made = await formDialog({
      title: 'Initiate IRA / 401(k) Rollover',
      submitLabel: 'Save Rollover',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Rollover Type</span><select class="k-input" name="rollover_type">${ROLL_TYPES.map((r) => html`<option value="${r}">${r}</option>`)}</select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Current Custodian / Plan</span><input class="k-input" name="current_custodian" required></label>
          <label class="k-field"><span class="k-field__label">Current Account #</span><input class="k-input" name="current_account_number" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Receiving Custodian</span><input class="k-input" name="receiving_custodian" value="Charles Schwab" required></label>
          <label class="k-field"><span class="k-field__label">Receiving Account #</span><input class="k-input" name="receiving_account_number"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Estimated Value (USD)</span><input class="k-input" type="number" step="100" min="0" name="estimated_value" required></label>
          <label class="k-field"><span class="k-field__label">Direct or Indirect</span><select class="k-input" name="direct_or_indirect">${DIRECT_MODES.map((m) => html`<option value="${m}">${m}</option>`)}</select></label>
        </div>
        <label class="k-check"><input type="checkbox" name="roth_tax_acknowledged"><span>Roth conversion tax / 60-day deadline disclosures reviewed with client</span></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/rollovers', { ...v, client_id: Number(v.client_id), initiated_date: today() }),
    });
    if (made) { state.transferTab = 'rollover'; toast.success('Rollover recorded.'); await loadScreen('/transfers'); }
  });
  on(root, 'change', '[data-action="us-roll-status"]', async (e, el) => {
    try { await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Rollover status updated.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-roll-advance"]', async (e, el) => {
    try { await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Rollover moved to ${el.dataset.status}.`); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-roll-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete rollover?', message: 'Remove this rollover record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/rollovers', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-1035-new"]', async () => {
    const made = await formDialog({
      title: 'Initiate IRC 1035 Exchange',
      submitLabel: 'Save 1035 Exchange',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Exchange Type</span><select class="k-input" name="exchange_type"><option value="Annuity">Annuity</option><option value="Life Insurance">Life Insurance</option></select></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Existing Carrier</span><select class="k-input" name="existing_carrier">${OLD_CARRIERS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Existing Policy #</span><input class="k-input" name="existing_policy_number" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">New Carrier</span><select class="k-input" name="new_carrier">${NEW_CARRIERS.map((c) => html`<option value="${c}">${c}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">New Policy / Contract Type</span><input class="k-input" name="new_policy_type" placeholder="e.g. Fee-Based FIA" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Est. Contract Value (USD)</span><input class="k-input" type="number" step="100" min="0" name="estimated_value" required></label>
          <label class="k-field"><span class="k-field__label">Surrender Charges?</span><select class="k-input" name="has_surrender_charges"><option value="No">No</option><option value="Yes">Yes</option><option value="Unknown">Unknown</option></select></label>
          <label class="k-field"><span class="k-field__label">Surrender Charge ($)</span><input class="k-input" type="number" step="100" min="0" name="surrender_charges" value="0"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Suitability Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/exchanges', { ...v, client_id: Number(v.client_id), initiated_date: today() }),
    });
    if (made) { state.transferTab = '1035'; toast.success('1035 Exchange recorded.'); await loadScreen('/transfers'); }
  });
  on(root, 'change', '[data-action="us-1035-status"]', async (e, el) => {
    try { await api.post('/api/exchanges/status', { id: Number(el.dataset.id), status: el.value }); toast.success('1035 status updated.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-1035-advance"]', async (e, el) => {
    try { await api.post('/api/exchanges/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`1035 exchange moved to ${el.dataset.status}.`); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-1035-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete 1035 exchange?', message: 'Remove this 1035 exchange?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/exchanges', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
}
