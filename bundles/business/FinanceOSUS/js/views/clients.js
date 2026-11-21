// US Client Onboarding & Household Portfolio Files: Unified Oxford Navy & Champagne Brass Masthead,
// Monogrammed Household Portfolio Cards, SEC Rule 501(a) / QP, Form CRS, IRS W-9, Reg BI Risk & Tiered AUM Card.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import {
  renderInvestorTierPill,
  renderUsRiskMeter,
  computeTieredAumFee,
  renderTieredFeeCard,
} from '../us_ui.js';

const CITIZENSHIPS = {
  us: 'U.S. Citizen',
  permanent_resident: 'U.S. Permanent Resident',
  non_resident_alien: 'Non-Resident Alien',
  dual: 'Dual Citizenship',
};
const OBJECTIVES = {
  growth: 'Growth',
  income: 'Income',
  capital_preservation: 'Capital Preservation',
  speculation: 'Speculation',
  balanced: 'Balanced',
};
const STAGES = ['Prospect', 'Discovery', 'ACAT & Paperwork', 'Active', 'Review Due'];
const W9_CLASSES = [
  ['individual', 'Individual / Sole Proprietor'],
  ['llc', 'Limited Liability Company (LLC)'],
  ['corporation', 'Corporation (C / S Corp)'],
  ['partnership', 'Partnership'],
  ['trust', 'Trust / Estate'],
  ['other', 'Other'],
];

function maskSsn(ssn, show) {
  if (!ssn) return 'Not on file';
  if (show) return ssn;
  return '•••-••-' + ssn.slice(-4);
}

function parseAllocStr(str) {
  const parts = String(str || '').split('/').map((n) => Number(n));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : null;
}

export function renderClientsView(state) {
  const cur = state.session.settings.currency || 'USD';
  const detail = state.clientDetail;
  const c = detail && detail.client;
  const latestRisk = detail && detail.risks && detail.risks[0];
  const latestFee = detail && detail.fees && detail.fees[0];
  const loadingList = state.loading && !state.clients.length;

  const totalShown = state.clients.length;
  const crsSigned = state.clients.filter((x) => x.crs_acknowledged).length;
  const crsPct = totalShown ? Math.round((crsSigned / totalShown) * 100) : 100;
  const accreditedCount = state.clients.filter((x) => x.accredited_investor === 'Yes').length;
  const totalNetWorth = state.clients.reduce((acc, x) => acc + Number(x.net_worth_cents || 0), 0);

  return html`
    <section class="us-masthead" aria-label="Household Portfolios and Advisory Files">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('users', { size: 12 })} SEC RULE 501(a) · FORM CRS · IRS W-9
        </div>
        <h1 class="us-masthead__title">Household Portfolios</h1>
        <div class="us-masthead__meta">
          <span>Accredited &amp; Qualified Purchaser verification</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Form CRS delivery, W-9 tax class &amp; IPS files</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--ring us-pod--brass" aria-label="Form CRS completion ${crsPct}%">
          <div class="tk-ring" style="--p:${crsPct}%;--ring-color:${crsPct === 100 ? '#34d399' : '#e4be7e'};--ring-size:48px">
            <span class="tk-ring__val">${crsPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="us-pod__lbl">Form CRS</span>
            <span class="us-pod__val" style="font-size:16px">${crsSigned} of ${totalShown}</span>
            <span class="us-pod__sub">Delivery signed</span>
          </div>
        </div>

        <div class="us-pod us-pod--brass">
          <span class="us-pod__lbl">${icon('award', { size: 12 })} Accredited</span>
          <span class="us-pod__val">${accreditedCount}</span>
          <span class="us-pod__sub">${Math.max(0, totalShown - accreditedCount)} Retail</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('trending', { size: 12 })} Net Worth</span>
          <span class="us-pod__val">${money(totalNetWorth, { currency: cur })}</span>
          <span class="us-pod__sub">${totalShown} household${totalShown === 1 ? '' : 's'}</span>
        </div>

        <button type="button" class="k-btn us-btn-brass" data-action="us-client-new">${icon('plus', { size: 15 })} Onboard Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input type="search" placeholder="Search household, email or advisor…" value="${state.clientSearch}" data-action="us-client-search">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter households">
        ${['All', 'Active', 'ACAT & Paperwork', 'Review Due', 'Accredited', 'CRS Pending'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.clientFilter === f })}" data-action="us-client-filter" data-filter="${f}">${f}</button>`)}
      </div>
    </div>

    <div class="us-split">
      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('users', { size: 17 })} Households</h2><span class="tk-sheet__count">${state.clients.length}</span></div>
        <div>
          ${loadingList ? skeleton(4) : state.clients.length ? state.clients.map((item) => html`
            <div class="${cls('us-client-card', { 'is-selected': item.id === state.selectedClientId })}" data-key="usc-${item.id}" data-action="us-select-client" data-id="${item.id}">
              <div class="us-client-card__head">
                <span class="us-monogram ${item.accredited_investor === 'Yes' ? 'us-monogram--brass' : ''}">${initials(`${item.first_name} ${item.last_name}`)}</span>
                <div class="us-client-card__id">
                  <div class="us-client-card__name">
                    <span>${item.first_name} ${item.last_name}</span>
                    ${renderInvestorTierPill(item, { compact: true })}
                    ${item.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="us-client-card__sub">${item.occupation || 'Private Household'} · NW ${money(item.net_worth_cents, { currency: cur })}</div>
                </div>
              </div>
              ${renderUsRiskMeter(item.risk_score, { alloc: parseAllocStr(item.portfolio_allocation), compact: true })}
              <div class="us-client-card__foot">
                <span class="tk-tag ${item.onboarding_stage === 'Active' ? 'tk-tag--ok' : item.onboarding_stage === 'Review Due' ? 'tk-tag--warn' : 'tk-tag--info'}">${item.onboarding_stage}</span>
                <span class="us-status-pill ${item.crs_acknowledged ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>${item.crs_acknowledged ? 'CRS Signed' : 'CRS Pending'}</span>
              </div>
            </div>`) : emptyState({ iconName: 'users', title: 'No households found', text: 'Onboard your first US advisory client.' })}
        </div>
      </section>

      <div class="tk-stack">
        ${loadingList ? html`<section class="tk-sheet">${skeleton(4)}</section>` : c ? html`
          <section class="tk-sheet">
            <div class="us-detail-banner">
              <div class="us-detail-banner__id">
                <span class="us-monogram us-monogram--lg ${c.accredited_investor === 'Yes' ? 'us-monogram--brass' : ''}">${initials(`${c.first_name} ${c.last_name}`)}</span>
                <div style="min-width:0;display:grid;gap:4px">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                    <h2 style="font-size:20px;line-height:1.15">${c.first_name} ${c.last_name}</h2>
                    ${renderInvestorTierPill(c)}
                    <span class="tk-tag tk-tag--accent">${c.onboarding_stage}</span>
                  </div>
                  <div class="tk-muted" style="font-size:12.5px">
                    ${c.occupation || 'Private Household'}${c.employer ? ` · ${c.employer}` : ''} · Advisor: <strong>${c.advisor_name || 'Unassigned'}</strong>
                  </div>
                </div>
              </div>
              <div class="tk-btn-row">
                <button type="button" class="k-btn k-btn--sm" data-action="us-print-file">${icon('printer', { size: 14 })} File HTML</button>
                <button type="button" class="k-btn k-btn--sm" data-action="us-copy-summary">${icon('copy', { size: 14 })} Copy</button>
                <button type="button" class="k-btn k-btn--sm" data-action="us-client-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-client-del" data-id="${c.id}">Delete</button>
              </div>
            </div>

            <div class="tk-sheet__body tk-stack">
              <div class="us-compliance-strip">
                <div class="us-compliance-tile">
                  <span class="us-compliance-tile__k">SEC Form CRS</span>
                  <div><span class="us-status-pill ${c.crs_acknowledged ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>${c.crs_acknowledged ? 'Signed' : 'Pending'}</span></div>
                  <span class="us-compliance-tile__sub">${c.crs_acknowledged ? `Delivered ${fmtDay(c.crs_ack_date)}` : 'Required at opening'}</span>
                </div>
                <div class="us-compliance-tile">
                  <span class="us-compliance-tile__k">IRS Form W-9</span>
                  <div><span class="us-status-pill ${c.w9_certified_date ? 'us-status-pill--ok' : 'us-status-pill--warn'}"><span class="us-status-pill__dot"></span>${c.w9_certified_date ? 'Certified' : 'Pending'}</span></div>
                  <span class="us-compliance-tile__sub">Class: ${c.w9_tax_classification || 'individual'}</span>
                </div>
                <div class="us-compliance-tile">
                  <span class="us-compliance-tile__k">Reg BI IPS</span>
                  <div><span class="us-status-pill ${latestRisk && latestRisk.reg_bi_check !== 'Suitable' ? 'us-status-pill--bad' : 'us-status-pill--ok'}"><span class="us-status-pill__dot"></span>${latestRisk ? latestRisk.reg_bi_check : 'Model'}</span></div>
                  <span class="us-compliance-tile__sub">${latestRisk ? `${latestRisk.risk_band} (${latestRisk.risk_score}/100)` : `Target ${c.portfolio_allocation}`}</span>
                </div>
                <div class="us-compliance-tile">
                  <span class="us-compliance-tile__k">ADV Fee Schedule</span>
                  <div><span class="us-status-pill ${latestFee ? 'us-status-pill--ok' : 'us-status-pill--neutral'}"><span class="us-status-pill__dot"></span>${latestFee ? `${latestFee.effective_bps} bps` : 'None'}</span></div>
                  <span class="us-compliance-tile__sub">${latestFee ? `${money(latestFee.annual_fee_cents, { currency: cur })}/yr` : 'No fee agreement'}</span>
                </div>
              </div>

              ${renderUsRiskMeter(
                latestRisk ? latestRisk.risk_score : c.risk_score,
                {
                  band: latestRisk ? latestRisk.risk_band : '',
                  alloc: parseAllocStr(latestRisk ? latestRisk.suggested_allocation : c.portfolio_allocation),
                  regBi: latestRisk ? latestRisk.reg_bi_check : 'Suitable',
                  label: latestRisk ? `5-Band Reg BI Risk Profile · Assessed ${fmtDay(latestRisk.assessed_date)}` : '5-Band Reg BI Risk Profile · Onboarding Model',
                }
              )}

              <div class="tk-kv">
                <div class="tk-kv__item"><span class="tk-kv__k">Contact</span><span class="tk-kv__v">${c.email || '—'} · ${c.phone || '—'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">DOB / Age</span><span class="tk-kv__v">${c.dob ? fmtDay(c.dob) : '—'} (${c.age} yrs)</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Citizenship</span><span class="tk-kv__v">${CITIZENSHIPS[c.citizenship] || c.citizenship}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">SSN</span><span class="tk-kv__v tk-mono">${maskSsn(c.ssn, state.revealSsn)} <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="padding:0 6px;min-height:24px" data-action="us-toggle-ssn">${state.revealSsn ? 'Hide' : 'Show'}</button></span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Annual Income</span><span class="tk-kv__v">${money(c.annual_income_cents, { currency: cur })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Net Worth</span><span class="tk-kv__v">${money(c.net_worth_cents, { currency: cur })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Liquid Net Worth</span><span class="tk-kv__v">${money(c.liquid_net_worth_cents, { currency: cur })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Target Mix &amp; Horizon</span><span class="tk-kv__v">${c.portfolio_allocation} (Eq/Bd/Cash) · ${c.time_horizon} yrs</span></div>
              </div>
              ${c.address ? html`<div class="tk-muted" style="font-size:13px"><strong>Mailing Address:</strong> ${c.address}</div>` : ''}
              ${c.notes ? html`<div class="tk-muted" style="font-size:13px"><strong>Advisor Notes:</strong> ${c.notes}</div>` : ''}

              <div class="tk-grid-even">
                <div class="tk-card">
                  <div class="tk-card__head">
                    <div>
                      <div class="tk-card__title">SEC Form CRS Acknowledgement</div>
                      <div class="tk-card__sub">Client Relationship Summary delivery</div>
                    </div>
                    <span class="us-status-pill ${c.crs_acknowledged ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>${c.crs_acknowledged ? 'Acknowledged' : 'Pending'}</span>
                  </div>
                  <div class="tk-muted" style="font-size:13px">
                    ${c.crs_acknowledged
                      ? `Signed by ${c.crs_signer || c.first_name + ' ' + c.last_name} on ${fmtDay(c.crs_ack_date)} (Advisor: ${c.crs_advisor_name || c.advisor_name}).`
                      : 'Form CRS must be delivered & acknowledged before or at account opening.'}
                  </div>
                  <div>
                    <button type="button" class="k-btn k-btn--sm ${c.crs_acknowledged ? '' : 'k-btn--primary'}" data-action="us-record-crs" data-id="${c.id}">${c.crs_acknowledged ? 'Update Form CRS' : 'Record Form CRS Delivery'}</button>
                  </div>
                </div>

                <div class="tk-card">
                  <div class="tk-card__head">
                    <div>
                      <div class="tk-card__title">IRS Form W-9 Certification</div>
                      <div class="tk-card__sub">Taxpayer ID &amp; Federal Classification</div>
                    </div>
                    <span class="us-status-pill ${c.w9_certified_date ? 'us-status-pill--ok' : 'us-status-pill--warn'}"><span class="us-status-pill__dot"></span>${c.w9_certified_date ? 'Certified' : 'Pending'}</span>
                  </div>
                  <div class="tk-muted" style="font-size:13px">
                    Legal: <strong>${c.w9_legal_name || (c.first_name + ' ' + c.last_name)}</strong> · Class: <strong>${c.w9_tax_classification}</strong>
                    ${c.w9_certified_date ? ` · Signed ${fmtDay(c.w9_certified_date)}` : ''}
                  </div>
                  <div>
                    <button type="button" class="k-btn k-btn--sm" data-action="us-edit-w9" data-id="${c.id}">Update Form W-9</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          ${latestFee ? renderTieredFeeCard(
            computeTieredAumFee(Number(latestFee.account_value_cents || 0) / 100, latestFee.fee_tier),
            { currency: cur, title: `Active ${latestFee.fee_tier} Schedule · Effective ${fmtDay(latestFee.effective_date)}` }
          ) : ''}

          <section class="tk-sheet">
            <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('clipboard', { size: 17 })} Linked RIA File Summary</h2></div>
            <div class="tk-sheet__body tk-stack">
              <div class="tk-kv">
                <div class="tk-kv__item"><span class="tk-kv__k">Risk Assessment</span><span class="tk-kv__v">${latestRisk ? `${latestRisk.risk_band} (${latestRisk.risk_score}/100 · ${latestRisk.reg_bi_check})` : 'Not assessed'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Active Fee Agreement</span><span class="tk-kv__v">${latestFee ? `${money(latestFee.annual_fee_cents, { currency: cur })}/yr (${latestFee.effective_bps} bps)` : 'None'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Transitions</span><span class="tk-kv__v">${detail.acats.length} ACAT · ${detail.rollovers.length} Rollover · ${detail.exchanges.length} 1035</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Beneficiaries &amp; POA</span><span class="tk-kv__v">${detail.beneficiaries.length} Designation · ${detail.poas.length} POA</span></div>
              </div>
              <div class="tk-btn-row">
                <a href="#/risk" class="k-btn k-btn--sm">${icon('scale', { size: 14 })} Reg BI Scorer</a>
                <a href="#/fees" class="k-btn k-btn--sm">${icon('dollar', { size: 14 })} Tiered AUM Calc</a>
                <a href="#/transfers" class="k-btn k-btn--sm">${icon('us-acat', { size: 14 })} Transfers Hub</a>
                <a href="#/estate" class="k-btn k-btn--sm">${icon('us-trust', { size: 14 })} Estate &amp; POA</a>
              </div>
            </div>
          </section>` : emptyState({ iconName: 'users', title: 'Select a household', text: 'Choose a client on the left or onboard a new US advisory household.' })}
      </div>
    </div>`;
}

export function wireClientsActions(root, state, { draw, loadScreen, loadClientDetail }) {
  on(root, 'click', '[data-action="us-client-filter"]', (e, el) => { state.clientFilter = el.dataset.filter; loadScreen('/clients'); });
  on(root, 'input', '[data-action="us-client-search"]', (e, el) => { state.clientSearch = el.value; loadScreen('/clients'); });
  on(root, 'click', '[data-action="us-select-client"]', async (e, el) => { try { await loadClientDetail(Number(el.dataset.id)); draw(); } catch (err) { toastError(err); } });
  on(root, 'click', '[data-action="us-toggle-ssn"]', () => { state.revealSsn = !state.revealSsn; draw(); });

  const fields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">First Name</span><input class="k-input" name="first_name" value="${c.first_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Last Name</span><input class="k-input" name="last_name" value="${c.last_name || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" placeholder="(212) 555-0100"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date of Birth</span><input class="k-input" type="date" name="dob" value="${c.dob || ''}"></label>
      <label class="k-field"><span class="k-field__label">Age</span><input class="k-input" type="number" min="18" max="120" name="age" value="${c.age ?? 45}"></label>
      <label class="k-field"><span class="k-field__label">SSN (###-##-####)</span><input class="k-input" name="ssn" value="${c.ssn || ''}" placeholder="123-45-6789"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Citizenship</span>
        <select class="k-input" name="citizenship">${Object.entries(CITIZENSHIPS).map(([k, l]) => html`<option value="${k}" ${k === (c.citizenship || 'us') ? 'selected' : ''}>${l}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Onboarding Stage</span>
        <select class="k-input" name="onboarding_stage">${STAGES.map((st) => html`<option value="${st}" ${st === (c.onboarding_stage || 'Prospect') ? 'selected' : ''}>${st}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Annual Income (USD)</span><input class="k-input" type="number" step="1000" min="0" name="annual_income" value="${c.annual_income_cents ? Math.round(c.annual_income_cents / 100) : 250000}"></label>
      <label class="k-field"><span class="k-field__label">Net Worth (USD)</span><input class="k-input" type="number" step="5000" min="0" name="net_worth" value="${c.net_worth_cents ? Math.round(c.net_worth_cents / 100) : 1200000}"></label>
      <label class="k-field"><span class="k-field__label">Liquid Net Worth (USD)</span><input class="k-input" type="number" step="5000" min="0" name="liquid_net_worth" value="${c.liquid_net_worth_cents ? Math.round(c.liquid_net_worth_cents / 100) : 500000}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Objective</span>
        <select class="k-input" name="investment_objectives">${Object.entries(OBJECTIVES).map(([k, l]) => html`<option value="${k}" ${k === (c.investment_objectives || 'balanced') ? 'selected' : ''}>${l}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Horizon (yrs)</span><input class="k-input" type="number" min="1" max="30" name="time_horizon" value="${c.time_horizon ?? 15}"></label>
      <label class="k-field"><span class="k-field__label">Risk Tolerance (1–10)</span><input class="k-input" type="number" min="1" max="10" name="risk_tolerance" value="${c.risk_tolerance ?? 6}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Mailing Address</span><input class="k-input" name="address" value="${c.address || ''}"></label>
    <label class="k-field"><span class="k-field__label">Advisor Notes</span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="us-client-new"]', async () => {
    const res = await formDialog({ title: 'Onboard US Advisory Client', submitLabel: 'Create Advisory File', size: 'lg', fields: fields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (res && res.client) {
      state.selectedClientId = res.client.id;
      toast.success(`Onboarded ${res.client.first_name} ${res.client.last_name} (${res.client.accredited_investor === 'Yes' ? 'Accredited 501a' : 'Retail'}).`);
      await loadScreen('/clients');
    }
  });

  on(root, 'click', '[data-action="us-client-edit"]', async (e, el) => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c || String(c.id) !== el.dataset.id) return;
    const saved = await formDialog({ title: `Edit ${c.first_name} ${c.last_name}`, submitLabel: 'Save', size: 'lg', fields: fields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Client updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="us-client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client?', message: 'Deletes this household and all linked RIA records.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); state.selectedClientId = null; toast.success('Client deleted.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-record-crs"]', async () => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c) return;
    const saved = await formDialog({
      title: 'Record SEC Form CRS Delivery',
      submitLabel: 'Confirm Form CRS Signed',
      fields: html`
        <div class="us-alert-box">${icon('info', { size: 18 })}<span>SEC Form CRS Relationship Summary: confirms client received disclosures on investment services, fees, fiduciary standard, conflicts and disciplinary history.</span></div>
        <label class="k-field"><span class="k-field__label">Acknowledgement Date</span><input class="k-input" type="date" name="acknowledgement_date" value="${c.crs_ack_date || today()}" required></label>
        <label class="k-field"><span class="k-field__label">Client Signature / Name</span><input class="k-input" name="client_signature" value="${c.crs_signer || (c.first_name + ' ' + c.last_name)}" required></label>
        <label class="k-field"><span class="k-field__label">Delivering Advisor Name</span><input class="k-input" name="advisor_name" value="${c.crs_advisor_name || c.advisor_name || ''}"></label>`,
      onSubmit: (v) => api.post('/api/clients/crs', { ...v, id: c.id }),
    });
    if (saved) { toast.success('SEC Form CRS acknowledgement saved.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="us-edit-w9"]', async () => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c) return;
    const saved = await formDialog({
      title: 'IRS Form W-9 Certification',
      submitLabel: 'Certify W-9',
      fields: html`
        <label class="k-field"><span class="k-field__label">Legal Name (as shown on tax return)</span><input class="k-input" name="legal_name" value="${c.w9_legal_name || (c.first_name + ' ' + c.last_name)}" required></label>
        <label class="k-field"><span class="k-field__label">Business / Disregarded Entity Name</span><input class="k-input" name="business_name" value="${c.w9_business_name || ''}"></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Federal Tax Classification</span>
            <select class="k-input" name="tax_classification">${W9_CLASSES.map(([k, l]) => html`<option value="${k}" ${k === (c.w9_tax_classification || 'individual') ? 'selected' : ''}>${l}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">SSN or EIN</span><input class="k-input" name="ssn_ein" value="${c.w9_ssn_ein || c.ssn || ''}" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Certification Date</span><input class="k-input" type="date" name="date" value="${c.w9_certified_date || today()}"></label>`,
      onSubmit: (v) => api.post('/api/clients/w9', { ...v, id: c.id }),
    });
    if (saved) { toast.success('IRS Form W-9 record certified.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="us-copy-summary"]', () => {
    const d = state.clientDetail;
    if (!d || !d.client) return;
    const c = d.client;
    const cur = state.session.settings.currency || 'USD';
    copyText([
      `RIA Client Compliance Summary — ${c.first_name} ${c.last_name}`,
      `Accredited (Rule 501a): ${c.accredited_investor} | Stage: ${c.onboarding_stage}`,
      `Income: ${money(c.annual_income_cents, { currency: cur })} | Net Worth: ${money(c.net_worth_cents, { currency: cur })}`,
      `Form CRS: ${c.crs_acknowledged ? 'Signed ' + c.crs_ack_date : 'PENDING'} | W-9: ${c.w9_tax_classification} (${c.w9_certified_date || 'Pending'})`,
      `Target Allocation: ${c.portfolio_allocation} | Risk Score: ${c.risk_score}/100`,
    ].join('\n'), { title: 'RIA Client Summary' });
  });

  on(root, 'click', '[data-action="us-print-file"]', () => {
    const d = state.clientDetail;
    if (!d || !d.client) return;
    const c = d.client;
    const s = state.session.settings;
    const cur = s.currency || 'USD';
    downloadHtmlDoc(`ria-file-${c.last_name.toLowerCase()}-${today()}.html`, {
      title: `Advisory Compliance File · ${c.first_name} ${c.last_name}`,
      businessName: s.business_name,
      subtitle: `${s.crd_number || 'SEC Registered Investment Adviser'} · Generated ${today()}`,
      accent: '#162a4c',
      bodyHtml: `
        <table>
          <tr><th>Legal Name</th><td>${esc(c.w9_legal_name || c.first_name + ' ' + c.last_name)}</td><th>Accredited (501a)</th><td>${esc(c.accredited_investor)}</td></tr>
          <tr><th>Citizenship</th><td>${esc(CITIZENSHIPS[c.citizenship] || c.citizenship)}</td><th>W-9 Tax Class</th><td>${esc(c.w9_tax_classification)}</td></tr>
          <tr><th>Annual Income</th><td class="num">${esc(money(c.annual_income_cents, { currency: cur }))}</td><th>Net Worth</th><td class="num">${esc(money(c.net_worth_cents, { currency: cur }))}</td></tr>
          <tr><th>Form CRS Status</th><td>${c.crs_acknowledged ? 'Signed ' + esc(c.crs_ack_date) : 'Pending'}</td><th>Target Allocation</th><td>${esc(c.portfolio_allocation)}</td></tr>
        </table>
        <div class="box"><strong>Active Fee Agreement:</strong> ${d.fees[0] ? esc(money(d.fees[0].annual_fee_cents, { currency: cur }) + '/yr (' + d.fees[0].fee_tier + ' · ' + d.fees[0].effective_bps + ' bps)') : 'None'}</div>
        <div class="box"><strong>Transfers &amp; Estate:</strong> ${d.acats.length} ACAT, ${d.rollovers.length} Rollover, ${d.exchanges.length} 1035 Exchange, ${d.beneficiaries.length} Beneficiary Designation(s), ${d.poas.length} POA(s).</div>`,
    });
  });
}
