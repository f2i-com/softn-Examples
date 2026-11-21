// Client Onboarding & Master Advice File (AU): Unified Forest & Gold Masthead,
// Monogrammed Household Client Cards, s761G Wholesale Check, FSG Ack, TFN Decl & linked records.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import {
  renderClientClassPill,
  renderRiskBandMeter,
  renderFsgPill,
  renderFdsOptInPill,
  deadlineMeta,
  renderStatusPill,
} from '../au_ui.js';

const RESIDENCY_LABELS = {
  au_citizen: 'Australian Citizen',
  permanent_resident: 'Permanent Resident',
  temporary_visa: 'Temporary Visa Holder',
  non_resident: 'Non-Resident',
};
const OBJ_LABELS = {
  growth: 'Growth',
  income: 'Income',
  capital_preservation: 'Capital Preservation',
  balanced: 'Balanced',
};
const STAGES = ['Prospect', 'Fact Find', 'SOA Prep', 'Active', 'Review Due'];
const TFN_EXEMPTS = [
  ['none', 'None (TFN provided)'],
  ['under_18', 'Under 18'],
  ['pensioner', 'Pensioner'],
  ['not_quoted', 'Not Quoted (47% withholding warning)'],
];
const TAX_RES = [
  ['au_resident', 'Australian Resident'],
  ['foreign_resident', 'Foreign Resident'],
  ['working_holiday', 'Working Holiday Maker'],
];

function maskTfn(tfn, reveal) {
  if (!tfn) return 'Not supplied';
  if (reveal) return tfn;
  return '•••-•••-' + tfn.slice(-3);
}

export function renderClientsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const detail = state.clientDetail;
  const c = detail && detail.client;
  const latestRisk = detail && detail.risks && detail.risks[0];
  const latestFee = detail && detail.fees && detail.fees[0];
  const latestReview = detail && detail.reviews && detail.reviews[0];
  const activeBdbn = detail && (detail.bdbns || []).find((b) => b.status === 'Active');
  const reviewMeta = latestReview ? deadlineMeta(latestReview.next_review_date, { warnDays: 30, prefix: 'Review' }) : null;
  const bdbnMeta = activeBdbn ? deadlineMeta(activeBdbn.expiry_date, { warnDays: 30, prefix: 'BDBN' }) : null;
  const loadingList = state.loading && !state.clients.length;

  const totalShown = state.clients.length;
  const fsgSigned = state.clients.filter((x) => x.fsg_acknowledged).length;
  const fsgPct = totalShown ? Math.round((fsgSigned / totalShown) * 100) : 100;
  const wholesaleCount = state.clients.filter((x) => x.wholesale_status === 'Yes').length;
  const totalNetAssets = state.clients.reduce((acc, x) => acc + Number(x.net_assets_cents || 0), 0);

  return html`
    <section class="au-masthead" aria-label="Clients and Master Advice Files">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('users', { size: 12 })} CORPORATIONS ACT s761G · MASTER ADVICE FILES
        </div>
        <h1 class="au-masthead__title">Clients &amp; Household Files</h1>
        <div class="au-masthead__meta">
          <span>Personal fact-find &amp; Wholesale s761G verification</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>FSG s941A &amp; ATO TFN Declarations</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--ring au-pod--gold" aria-label="FSG readiness ${fsgPct}%">
          <div class="tk-ring" style="--p:${fsgPct}%;--ring-color:${fsgPct === 100 ? '#34d399' : '#e8c26f'};--ring-size:48px">
            <span class="tk-ring__val">${fsgPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="au-pod__lbl">FSG Signed</span>
            <span class="au-pod__val" style="font-size:16px">${fsgSigned} of ${totalShown}</span>
            <span class="au-pod__sub">s941A compliance</span>
          </div>
        </div>

        <div class="au-pod au-pod--gold">
          <span class="au-pod__lbl">${icon('award', { size: 12 })} Wholesale</span>
          <span class="au-pod__val">${wholesaleCount}</span>
          <span class="au-pod__sub">${Math.max(0, totalShown - wholesaleCount)} Retail</span>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('trending', { size: 12 })} Net Assets</span>
          <span class="au-pod__val">${money(totalNetAssets, { currency })}</span>
          <span class="au-pod__sub">${totalShown} household${totalShown === 1 ? '' : 's'}</span>
        </div>

        <button type="button" class="k-btn au-btn-gold" data-action="client-new">${icon('plus', { size: 15 })} Onboard Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input type="search" placeholder="Search household, email or adviser…" value="${state.clientSearch}" data-action="client-search">
      </label>
      <div class="tk-segmented" role="tablist" aria-label="Filter households">
        ${['All', 'Active', 'SOA Prep', 'Review Due', 'Wholesale', 'FSG Pending'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.clientFilter === f })}" data-action="client-filter" data-filter="${f}">${f}</button>`)}
      </div>
    </div>

    <div class="au-split">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Household Register</h2>
          <span class="tk-sheet__count">${state.clients.length}</span>
        </div>
        <div>
          ${loadingList ? skeleton(4) : state.clients.length ? state.clients.map((item) => html`
            <div class="${cls('au-client-card', { 'is-selected': item.id === state.selectedClientId })}" data-key="cl-${item.id}" data-action="select-client" data-id="${item.id}">
              <div class="au-client-card__head">
                <span class="au-monogram ${item.wholesale_status === 'Yes' ? 'au-monogram--gold' : ''}">${initials(`${item.first_name} ${item.last_name}`)}</span>
                <div class="au-client-card__id">
                  <div class="au-client-card__name">
                    <span>${item.first_name} ${item.last_name}</span>
                    ${renderClientClassPill(item.wholesale_status, { compact: true })}
                    ${item.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="au-client-card__sub">${item.occupation || 'Private Client'} · Net ${money(item.net_assets_cents, { currency })}</div>
                </div>
              </div>
              ${renderRiskBandMeter(item.risk_score, { compact: true })}
              <div class="au-client-card__foot">
                <span class="tk-tag ${item.onboarding_stage === 'Active' ? 'tk-tag--ok' : item.onboarding_stage === 'Review Due' ? 'tk-tag--warn' : 'tk-tag--info'}">${item.onboarding_stage}</span>
                ${renderFsgPill(item)}
              </div>
            </div>`) : emptyState({ iconName: 'users', title: 'No households found', text: 'Onboard your first client or adjust your filter.' })}
        </div>
      </section>

      <div class="tk-stack">
        ${loadingList ? html`<section class="tk-sheet">${skeleton(4)}</section>` : c ? html`
          <section class="tk-sheet">
            <div class="au-detail-banner">
              <div class="au-detail-banner__id">
                <span class="au-monogram au-monogram--lg ${c.wholesale_status === 'Yes' ? 'au-monogram--gold' : ''}">${initials(`${c.first_name} ${c.last_name}`)}</span>
                <div style="min-width:0;display:grid;gap:4px">
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px">
                    <h2 style="font-size:20px;line-height:1.15">${c.first_name} ${c.last_name}</h2>
                    ${renderClientClassPill(c.wholesale_status)}
                    <span class="tk-tag tk-tag--accent">${c.onboarding_stage}</span>
                  </div>
                  <div class="tk-muted" style="font-size:12.5px">
                    ${c.occupation || 'Private Client'}${c.employer ? ` · ${c.employer}` : ''} · Adviser: <strong>${c.adviser_name || 'Unassigned'}</strong>
                  </div>
                </div>
              </div>
              <div class="tk-btn-row">
                <button type="button" class="k-btn k-btn--sm" data-action="print-client-file">${icon('printer', { size: 14 })} Master File HTML</button>
                <button type="button" class="k-btn k-btn--sm" data-action="copy-client-checklist">${icon('copy', { size: 14 })} Copy</button>
                <button type="button" class="k-btn k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="client-delete" data-id="${c.id}">Delete</button>
              </div>
            </div>

            <div class="tk-sheet__body tk-stack">
              <div class="au-compliance-strip">
                <div class="au-compliance-tile">
                  <span class="au-compliance-tile__k">FSG (s941A)</span>
                  <div>${renderFsgPill(c)}</div>
                  <span class="au-compliance-tile__sub">${c.fsg_acknowledged ? `Signed ${fmtDay(c.fsg_ack_date)}` : 'Required before advice'}</span>
                </div>
                <div class="au-compliance-tile">
                  <span class="au-compliance-tile__k">FDS / Opt-In</span>
                  <div>${renderFdsOptInPill(latestFee)}</div>
                  <span class="au-compliance-tile__sub">${latestFee ? `${money(latestFee.calculated_annual_fee_cents, { currency })} p.a.` : 'No active fee schedule'}</span>
                </div>
                <div class="au-compliance-tile">
                  <span class="au-compliance-tile__k">Annual Review</span>
                  <div>${reviewMeta ? renderStatusPill(reviewMeta.tone, reviewMeta.label) : renderStatusPill('au-status-pill--neutral', 'Unscheduled')}</div>
                  <span class="au-compliance-tile__sub">${latestReview ? `Next ${fmtDay(latestReview.next_review_date)}` : 'Log first annual review'}</span>
                </div>
                <div class="au-compliance-tile">
                  <span class="au-compliance-tile__k">SIS BDBN (3-Yr)</span>
                  <div>${bdbnMeta ? renderStatusPill(bdbnMeta.tone, bdbnMeta.label) : renderStatusPill('au-status-pill--neutral', 'None Active')}</div>
                  <span class="au-compliance-tile__sub">${activeBdbn ? `${activeBdbn.super_fund_name}` : 'No active nomination'}</span>
                </div>
              </div>

              ${renderRiskBandMeter(
                latestRisk ? latestRisk.risk_score : c.risk_score,
                {
                  band: latestRisk ? latestRisk.profile_band : '',
                  showDesc: true,
                  label: latestRisk ? `5-Band Risk Profile · Assessed ${fmtDay(latestRisk.assessed_date)}` : '5-Band Risk Profile · Indicative Onboarding Score',
                }
              )}

              <div class="tk-kv">
                <div class="tk-kv__item"><span class="tk-kv__k">Email &amp; Phone</span><span class="tk-kv__v">${c.email || '—'} · ${c.phone || '—'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">DOB / Age</span><span class="tk-kv__v">${c.dob ? fmtDay(c.dob) : '—'} (${c.age} yrs)</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Residency</span><span class="tk-kv__v">${RESIDENCY_LABELS[c.residency_status] || c.residency_status}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">TFN</span><span class="tk-kv__v tk-mono">${maskTfn(c.tfn, state.revealTfn)} <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="padding:0 6px;min-height:24px" data-action="toggle-tfn">${state.revealTfn ? 'Hide' : 'Show'}</button></span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Annual Income</span><span class="tk-kv__v">${money(c.annual_income_cents, { currency })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Net Assets</span><span class="tk-kv__v">${money(c.net_assets_cents, { currency })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Liquid Assets</span><span class="tk-kv__v">${money(c.liquid_assets_cents, { currency })}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Objective &amp; Horizon</span><span class="tk-kv__v">${OBJ_LABELS[c.investment_objectives] || c.investment_objectives} · ${c.time_horizon} yrs</span></div>
              </div>
              ${c.address ? html`<div class="tk-muted" style="font-size:13px"><strong>Address:</strong> ${c.address}</div>` : ''}
              ${c.notes ? html`<div class="tk-muted" style="font-size:13px"><strong>Adviser Notes:</strong> ${c.notes}</div>` : ''}

              <div class="tk-grid-even">
                <div class="tk-card">
                  <div class="tk-card__head">
                    <div>
                      <div class="tk-card__title">FSG Acknowledgement</div>
                      <div class="tk-card__sub">Corporations Act 2001 s941A disclosure</div>
                    </div>
                    ${renderFsgPill(c)}
                  </div>
                  <div class="tk-muted" style="font-size:13px">
                    ${c.fsg_acknowledged
                      ? `Signed by ${c.fsg_signer || c.first_name + ' ' + c.last_name} on ${fmtDay(c.fsg_ack_date)}.`
                      : 'Financial Services Guide must be provided & acknowledged prior to personal advice.'}
                  </div>
                  <div>
                    <button type="button" class="k-btn k-btn--sm ${c.fsg_acknowledged ? '' : 'k-btn--primary'}" data-action="record-fsg" data-id="${c.id}">${c.fsg_acknowledged ? 'Update FSG Record' : 'Record FSG Acknowledgement'}</button>
                  </div>
                </div>

                <div class="tk-card">
                  <div class="tk-card__head">
                    <div>
                      <div class="tk-card__title">TFN Declaration</div>
                      <div class="tk-card__sub">ATO superannuation &amp; investment declaration</div>
                    </div>
                    <span class="tk-tag ${c.tfn_exemption === 'not_quoted' ? 'tk-tag--bad' : c.tfn_declared_date ? 'tk-tag--ok' : 'tk-tag--warn'}">${c.tfn_exemption === 'not_quoted' ? 'Withholding Risk' : c.tfn_declared_date ? 'Declared' : 'Not Declared'}</span>
                  </div>
                  <div class="tk-muted" style="font-size:13px">
                    Tax Residency: <strong>${c.residency_for_tax}</strong> · Threshold: <strong>${c.tax_free_threshold === 'yes' ? 'Claimed' : 'No'}</strong> · HECS/HELP: <strong>${c.has_hecs_help === 'yes' ? 'Yes' : 'No'}</strong>
                    ${c.tfn_declared_date ? ` · Signed ${fmtDay(c.tfn_declared_date)}` : ''}
                  </div>
                  <div>
                    <button type="button" class="k-btn k-btn--sm" data-action="edit-tfn" data-id="${c.id}">Update TFN Declaration</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('clipboard', { size: 17 })} Linked Compliance &amp; Advice Records</h2>
            </div>
            <div class="tk-sheet__body tk-stack">
              <div class="tk-kv">
                <div class="tk-kv__item"><span class="tk-kv__k">Latest Risk Profile</span><span class="tk-kv__v">${latestRisk ? `${latestRisk.profile_band} (${latestRisk.risk_score}/100)` : 'Not assessed'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Latest FDS Annual Fee</span><span class="tk-kv__v">${latestFee ? `${money(latestFee.calculated_annual_fee_cents, { currency })} (${latestFee.ongoing_fee_consent})` : 'None recorded'}</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Transfers &amp; Rollovers</span><span class="tk-kv__v">${detail.transfers.length} OMT · ${detail.rollovers.length} Super Rollover</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Active BDBNs</span><span class="tk-kv__v">${detail.bdbns.filter((b) => b.status === 'Active').length} active (${detail.bdbns.length} total)</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Annual Reviews</span><span class="tk-kv__v">${detail.reviews.length} recorded</span></div>
                <div class="tk-kv__item"><span class="tk-kv__k">Vault Documents</span><span class="tk-kv__v">${detail.documents.length} stored</span></div>
              </div>
              <div class="tk-btn-row">
                <a href="#/risk" class="k-btn k-btn--sm">${icon('scale', { size: 14 })} Assess Risk</a>
                <a href="#/fees" class="k-btn k-btn--sm">${icon('receipt', { size: 14 })} Issue FDS</a>
                <a href="#/super" class="k-btn k-btn--sm">${icon('au-super', { size: 14 })} BDBN / Rollover</a>
                <a href="#/transfers" class="k-btn k-btn--sm">${icon('au-transfer', { size: 14 })} CHESS Transfer</a>
                <a href="#/reviews" class="k-btn k-btn--sm">${icon('folder', { size: 14 })} Reviews &amp; Vault</a>
              </div>
            </div>
          </section>` : emptyState({ iconName: 'users', title: 'Select a household', text: 'Pick a client from the register on the left or onboard a new advisory client.' })}
      </div>
    </div>`;
}

export function wireClientsActions(root, state, { draw, loadScreen, loadClientDetail }) {
  on(root, 'click', '[data-action="client-filter"]', (e, el) => {
    state.clientFilter = el.dataset.filter;
    loadScreen('/clients');
  });

  on(root, 'input', '[data-action="client-search"]', (e, el) => {
    state.clientSearch = el.value;
    loadScreen('/clients');
  });

  on(root, 'click', '[data-action="select-client"]', async (e, el) => {
    try { await loadClientDetail(Number(el.dataset.id)); draw(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="toggle-tfn"]', () => {
    state.revealTfn = !state.revealTfn;
    draw();
  });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">First Name</span><input class="k-input" name="first_name" value="${c.first_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Last Name</span><input class="k-input" name="last_name" value="${c.last_name || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" placeholder="04XX XXX XXX"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Date of Birth</span><input class="k-input" type="date" name="dob" value="${c.dob || ''}"></label>
      <label class="k-field"><span class="k-field__label">Age</span><input class="k-input" type="number" min="18" max="120" name="age" value="${c.age ?? 45}"></label>
      <label class="k-field"><span class="k-field__label">TFN (###-###-###)</span><input class="k-input" name="tfn" value="${c.tfn || ''}" placeholder="123-456-789"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Residency Status</span>
        <select class="k-input" name="residency_status">
          ${Object.entries(RESIDENCY_LABELS).map(([k, lbl]) => html`<option value="${k}" ${k === (c.residency_status || 'au_citizen') ? 'selected' : ''}>${lbl}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Onboarding Stage</span>
        <select class="k-input" name="onboarding_stage">
          ${STAGES.map((st) => html`<option value="${st}" ${st === (c.onboarding_stage || 'Prospect') ? 'selected' : ''}>${st}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Annual Income (AUD)</span><input class="k-input" type="number" step="1000" min="0" name="annual_income" value="${c.annual_income_cents ? Math.round(c.annual_income_cents / 100) : 180000}"></label>
      <label class="k-field"><span class="k-field__label">Net Assets (AUD)</span><input class="k-input" type="number" step="1000" min="0" name="net_assets" value="${c.net_assets_cents ? Math.round(c.net_assets_cents / 100) : 950000}"></label>
      <label class="k-field"><span class="k-field__label">Liquid Assets (AUD)</span><input class="k-input" type="number" step="1000" min="0" name="liquid_assets" value="${c.liquid_assets_cents ? Math.round(c.liquid_assets_cents / 100) : 350000}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Investment Objective</span>
        <select class="k-input" name="investment_objectives">
          ${Object.entries(OBJ_LABELS).map(([k, lbl]) => html`<option value="${k}" ${k === (c.investment_objectives || 'balanced') ? 'selected' : ''}>${lbl}</option>`)}
        </select>
      </label>
      <label class="k-field"><span class="k-field__label">Time Horizon (yrs)</span><input class="k-input" type="number" min="1" max="30" name="time_horizon" value="${c.time_horizon ?? 12}"></label>
      <label class="k-field"><span class="k-field__label">Risk Tolerance (1–10)</span><input class="k-input" type="number" min="1" max="10" name="risk_tolerance" value="${c.risk_tolerance ?? 6}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Occupation</span><input class="k-input" name="occupation" value="${c.occupation || ''}"></label>
      <label class="k-field"><span class="k-field__label">Employer</span><input class="k-input" name="employer" value="${c.employer || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Residential Address</span><input class="k-input" name="address" value="${c.address || ''}"></label>
    <label class="k-field"><span class="k-field__label">Adviser Notes</span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="client-new"]', async () => {
    const res = await formDialog({
      title: 'Onboard New Australian Advisory Client',
      submitLabel: 'Create Master Advice File',
      size: 'lg',
      fields: clientFields(),
      onSubmit: (v) => api.post('/api/clients', v),
    });
    if (res && res.client) {
      state.selectedClientId = res.client.id;
      toast.success(`Onboarded ${res.client.first_name} ${res.client.last_name} (${res.client.wholesale_status === 'Yes' ? 'Wholesale s761G' : 'Retail'}).`);
      await loadScreen('/clients');
    }
  });

  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c || String(c.id) !== el.dataset.id) return;
    const saved = await formDialog({
      title: `Edit ${c.first_name} ${c.last_name}`,
      submitLabel: 'Save Client',
      size: 'lg',
      fields: clientFields(c),
      onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }),
    });
    if (saved) { toast.success('Client file updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client file?', message: 'Deletes this client and all linked risk profiles, FDS records, BDBNs, transfers, reviews and vault docs.', confirmLabel: 'Delete Client', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); state.selectedClientId = null; toast.success('Client removed.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="record-fsg"]', async () => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c) return;
    const saved = await formDialog({
      title: 'Record FSG Acknowledgement',
      submitLabel: 'Confirm FSG Signed',
      fields: html`
        <div class="au-warning-box">${icon('info', { size: 18 })}<span>Corporations Act 2001 s941A: Client acknowledges receipt of the Financial Services Guide (services, fees, conflicts, AFCA complaints &amp; privacy policy).</span></div>
        <label class="k-field"><span class="k-field__label">Acknowledgement Date</span><input class="k-input" type="date" name="acknowledgement_date" value="${c.fsg_ack_date || today()}" required></label>
        <label class="k-field"><span class="k-field__label">Client Signature / Signer Name</span><input class="k-input" name="client_signature" value="${c.fsg_signer || (c.first_name + ' ' + c.last_name)}" required></label>`,
      onSubmit: (v) => api.post('/api/clients/fsg', { ...v, id: c.id }),
    });
    if (saved) { toast.success('FSG Acknowledgement recorded.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="edit-tfn"]', async () => {
    const c = state.clientDetail && state.clientDetail.client;
    if (!c) return;
    const saved = await formDialog({
      title: 'TFN Declaration (ATO)',
      submitLabel: 'Save Declaration',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">TFN Exemption</span>
            <select class="k-input" name="tfn_exemption">
              ${TFN_EXEMPTS.map(([v, l]) => html`<option value="${v}" ${v === (c.tfn_exemption || 'none') ? 'selected' : ''}>${l}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Tax File Number</span><input class="k-input" name="tfn" value="${c.tfn || ''}" placeholder="123-456-789"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Residency for Tax</span>
            <select class="k-input" name="residency_for_tax">
              ${TAX_RES.map(([v, l]) => html`<option value="${v}" ${v === (c.residency_for_tax || 'au_resident') ? 'selected' : ''}>${l}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Declaration Date</span><input class="k-input" type="date" name="declaration_date" value="${c.tfn_declared_date || today()}"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Claim Tax-Free Threshold?</span>
            <select class="k-input" name="tax_free_threshold">
              <option value="yes" ${c.tax_free_threshold !== 'no' ? 'selected' : ''}>Yes</option>
              <option value="no" ${c.tax_free_threshold === 'no' ? 'selected' : ''}>No</option>
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">HECS-HELP / Study Loan?</span>
            <select class="k-input" name="has_hecs_help">
              <option value="no" ${c.has_hecs_help !== 'yes' ? 'selected' : ''}>No</option>
              <option value="yes" ${c.has_hecs_help === 'yes' ? 'selected' : ''}>Yes</option>
            </select>
          </label>
        </div>`,
      onSubmit: (v) => api.post('/api/clients/tfn', { ...v, id: c.id }),
    });
    if (saved) {
      toast.success(saved.withholdingWarning ? 'TFN Declaration saved — Note: 47% top marginal withholding tax applies.' : 'TFN Declaration saved.');
      await loadScreen('/clients');
    }
  });

  on(root, 'click', '[data-action="copy-client-checklist"]', () => {
    const d = state.clientDetail;
    if (!d || !d.client) return;
    const c = d.client;
    const cur = state.session.settings.currency || 'AUD';
    const text = [
      `AFSL Master Advice File — ${c.first_name} ${c.last_name}`,
      `Classification: ${c.wholesale_status === 'Yes' ? 'Wholesale (s761G)' : 'Retail'} | Stage: ${c.onboarding_stage}`,
      `Annual Income: ${money(c.annual_income_cents, { currency: cur })} | Net Assets: ${money(c.net_assets_cents, { currency: cur })}`,
      `FSG Acknowledged: ${c.fsg_acknowledged ? 'Yes (' + c.fsg_ack_date + ')' : 'PENDING'}`,
      `Latest Risk Band: ${d.risks[0] ? d.risks[0].profile_band + ' (' + d.risks[0].risk_score + '/100)' : 'Not assessed'}`,
      `Latest FDS Fee: ${d.fees[0] ? money(d.fees[0].calculated_annual_fee_cents, { currency: cur }) + ' p.a. (' + d.fees[0].ongoing_fee_consent + ')' : 'None'}`,
      `Active BDBNs: ${d.bdbns.filter((b) => b.status === 'Active').length} | Vault Docs: ${d.documents.length}`,
    ].join('\n');
    copyText(text, { title: 'Master Advice File Summary' });
  });

  on(root, 'click', '[data-action="print-client-file"]', () => {
    const d = state.clientDetail;
    if (!d || !d.client) return;
    const c = d.client;
    const cur = state.session.settings.currency || 'AUD';
    const s = state.session.settings;
    downloadHtmlDoc(`advice-file-${c.last_name.toLowerCase()}-${today()}.html`, {
      title: `Master Advice File · ${c.first_name} ${c.last_name}`,
      businessName: s.business_name,
      subtitle: `${s.afsl_number || 'Australian AFSL'} · Generated ${today()}`,
      accent: '#114237',
      bodyHtml: `
        <table>
          <tr><th>Client Name</th><td>${esc(c.first_name + ' ' + c.last_name)}</td><th>Classification</th><td>${esc(c.wholesale_status === 'Yes' ? 'Wholesale Client (s761G)' : 'Retail Client')}</td></tr>
          <tr><th>Residency</th><td>${esc(RESIDENCY_LABELS[c.residency_status] || c.residency_status)}</td><th>Onboarding Stage</th><td>${esc(c.onboarding_stage)}</td></tr>
          <tr><th>Annual Income</th><td class="num">${esc(money(c.annual_income_cents, { currency: cur }))}</td><th>Net Assets</th><td class="num">${esc(money(c.net_assets_cents, { currency: cur }))}</td></tr>
          <tr><th>FSG Acknowledged</th><td>${c.fsg_acknowledged ? 'Yes (' + esc(c.fsg_ack_date) + ')' : 'Pending'}</td><th>Adviser</th><td>${esc(c.adviser_name || '—')}</td></tr>
        </table>
        <div class="box"><strong>Risk Profile:</strong> ${d.risks[0] ? esc(d.risks[0].profile_band + ' — Score ' + d.risks[0].risk_score + '/100 (Assessed ' + d.risks[0].assessed_date + ')') : 'Not yet assessed'}</div>
        <div class="box"><strong>Fee Disclosure (FDS):</strong> ${d.fees[0] ? esc(money(d.fees[0].calculated_annual_fee_cents, { currency: cur }) + ' p.a. on ' + money(d.fees[0].portfolio_value_cents, { currency: cur }) + ' — Consent: ' + d.fees[0].ongoing_fee_consent) : 'No FDS recorded'}</div>
        <div class="box"><strong>Binding Death Benefit Nominations:</strong> ${d.bdbns.length ? d.bdbns.map((b) => esc(b.super_fund_name + ' (' + b.status + ', exp ' + b.expiry_date + ')')).join('; ') : 'None recorded'}</div>`,
    });
  });
}
