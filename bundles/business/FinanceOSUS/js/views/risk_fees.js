// US IPS Risk Tolerance Scorer (SEC Reg BI suitability) + Tiered AUM Fee Agreement Calculator:
// Unified Oxford Navy & Champagne Brass Mastheads, 4-factor score chips, band-colored IPS Risk Cards
// and monogrammed ADV Fee Schedule Cards with live filters & printable Fee Schedule HTML.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import {
  US_RISK_BANDS,
  usBandForScore,
  renderUsRiskMeter,
  computeTieredAumFee,
  renderTieredFeeCard,
} from '../us_ui.js';

const BANDS = US_RISK_BANDS.map((b) => b.name);

function previewUsRisk(d) {
  const h = Number(d.time_horizon || 12);
  const l = Number(d.loss_capacity || 6);
  const hPts = Math.round((Math.min(30, Math.max(1, h)) / 30) * 25);
  const lPts = Math.round(Math.min(10, Math.max(1, l)) * 3.5);
  const mPts = d.market_reaction === 'buy_more' ? 25 : d.market_reaction === 'hold' ? 16 : d.market_reaction === 'sell_some' ? 8 : 0;
  const ePts = d.investment_experience === 'extensive' ? 15 : d.investment_experience === 'moderate' ? 10 : d.investment_experience === 'limited' ? 5 : 0;
  const score = Math.min(100, Math.max(0, hPts + lPts + mPts + ePts));
  const b = usBandForScore(score);
  const port = d.portfolio_type || 'Moderate';
  let regBi = 'Suitable';
  if (score >= 70 && port === 'Conservative') regBi = 'Review needed';
  if (score < 35 && (port === 'Aggressive' || port === 'Speculative')) regBi = 'Review needed';
  return { score, band: b.name, bandObj: b, alloc: b.alloc, allocStr: b.alloc.join('/'), regBi, hPts, lPts, mPts, ePts };
}

function parseAlloc(str) {
  const parts = String(str || '').split('/').map((n) => Number(n));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : null;
}

export function renderRiskView(state) {
  const d = state.riskDraft;
  const calc = previewUsRisk(d);
  const rows = state.riskFilter === 'All'
    ? state.riskAssessments
    : state.riskAssessments.filter((a) => a.risk_band === state.riskFilter);
  const loadingRows = state.loading && !state.riskAssessments.length;

  const total = state.riskAssessments.length;
  const suitableCount = state.riskAssessments.filter((r) => r.reg_bi_check === 'Suitable').length;
  const reviewCount = Math.max(0, total - suitableCount);
  const suitablePct = total ? Math.round((suitableCount / total) * 100) : 100;
  const countByBand = (b) => state.riskAssessments.filter((a) => a.risk_band === b).length;

  return html`
    <section class="us-masthead" aria-label="IPS Risk Tolerance and Reg BI Suitability">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('scale', { size: 12 })} SEC REG BI · INVESTMENT POLICY STATEMENT
        </div>
        <h1 class="us-masthead__title">IPS Risk Tolerance Scorer</h1>
        <div class="us-masthead__meta">
          <span>5-band suitability &amp; Equity/Bond/Cash allocation</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Automatic Reg BI mismatch detection</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--ring us-pod--brass" aria-label="Reg BI suitable ${suitablePct}%">
          <div class="tk-ring" style="--p:${suitablePct}%;--ring-color:${suitablePct >= 85 ? '#34d399' : '#e4be7e'};--ring-size:48px">
            <span class="tk-ring__val">${suitablePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="us-pod__lbl">Reg BI Aligned</span>
            <span class="us-pod__val" style="font-size:16px">${suitableCount} of ${total}</span>
            <span class="us-pod__sub">IPS verified</span>
          </div>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('chart', { size: 12 })} Draft Score</span>
          <span class="us-pod__val">${calc.score}/100</span>
          <span class="us-pod__sub">${calc.band} (${calc.allocStr})</span>
        </div>

        <div class="${cls('us-pod', { 'us-pod--alert': reviewCount > 0 })}">
          <span class="us-pod__lbl">${icon(reviewCount > 0 ? 'alert' : 'shield-check', { size: 12 })} Exceptions</span>
          <span class="us-pod__val">${reviewCount}</span>
          <span class="us-pod__sub">${reviewCount > 0 ? 'Reg BI review' : 'Zero exceptions'}</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('scale', { size: 17 })} Run Risk Tolerance Questionnaire</h2></div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="us-save-risk" novalidate>
            <label class="k-field"><span class="k-field__label">Client Household</span>
              <select class="k-input" data-usrisk="client_id">
                ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`)}
              </select>
            </label>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Time Horizon: <strong>${d.time_horizon} yrs</strong></span>
                <input type="range" min="1" max="30" value="${d.time_horizon}" data-usrisk="time_horizon">
              </label>
              <label class="k-field"><span class="k-field__label">Loss Capacity: <strong>${d.loss_capacity}/10</strong></span>
                <input type="range" min="1" max="10" value="${d.loss_capacity}" data-usrisk="loss_capacity">
              </label>
            </div>
            <div class="k-field">
              <span class="k-field__label">Reaction to a -20% Market Drop</span>
              <div class="tk-pills">
                ${[['sell', 'Sell all'], ['sell_some', 'Sell some'], ['hold', 'Hold & wait'], ['buy_more', 'Buy more']].map(([v, l]) => html`
                  <button type="button" class="${cls('tk-pill', { 'is-on': d.market_reaction === v })}" data-action="us-risk-react" data-val="${v}">${l}</button>`)}
              </div>
            </div>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Investment Experience</span>
                <select class="k-input" data-usrisk="investment_experience">
                  <option value="none" ${d.investment_experience === 'none' ? 'selected' : ''}>None (0 yrs)</option>
                  <option value="limited" ${d.investment_experience === 'limited' ? 'selected' : ''}>Limited (1–3 yrs)</option>
                  <option value="moderate" ${d.investment_experience === 'moderate' ? 'selected' : ''}>Moderate (3–10 yrs)</option>
                  <option value="extensive" ${d.investment_experience === 'extensive' ? 'selected' : ''}>Extensive (10+ yrs)</option>
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Proposed Portfolio Type</span>
                <select class="k-input" data-usrisk="portfolio_type">
                  ${['Conservative', 'Moderate', 'Aggressive', 'Speculative'].map((p) => html`<option value="${p}" ${p === d.portfolio_type ? 'selected' : ''}>${p}</option>`)}
                </select>
              </label>
            </div>

            <div class="us-pts-row" aria-label="Score breakdown">
              <div class="us-pt-chip"><span class="us-pt-chip__k">Horizon</span><span class="us-pt-chip__v">${calc.hPts}/25</span></div>
              <div class="us-pt-chip"><span class="us-pt-chip__k">Loss Cap</span><span class="us-pt-chip__v">${calc.lPts}/35</span></div>
              <div class="us-pt-chip"><span class="us-pt-chip__k">-20% Drop</span><span class="us-pt-chip__v">${calc.mPts}/25</span></div>
              <div class="us-pt-chip"><span class="us-pt-chip__k">Experience</span><span class="us-pt-chip__v">${calc.ePts}/15</span></div>
            </div>

            ${renderUsRiskMeter(calc.score, { band: calc.band, alloc: calc.alloc, regBi: calc.regBi, label: 'Calculated 5-Band Reg BI Risk Profile' })}

            <label class="k-field"><span class="k-field__label">Suitability Rationale</span>
              <textarea class="k-input" rows="2" placeholder="Document Reg BI alignment or reason for variance…" data-usrisk="rationale">${d.rationale || ''}</textarea>
            </label>
            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Save Suitability Assessment</button>
            </div>
          </form>
        </div>
      </section>

      <div class="tk-stack">
        <div class="tk-toolbar" style="margin-bottom:0">
          <div class="tk-segmented" role="tablist" aria-label="Filter IPS assessments by risk band">
            <button type="button" class="${cls('tk-pill', { 'is-on': state.riskFilter === 'All' })}" data-action="us-risk-filter" data-band="All">All (${total})</button>
            ${BANDS.map((b) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.riskFilter === b })}" data-action="us-risk-filter" data-band="${b}">${b} (${countByBand(b)})</button>`)}
          </div>
        </div>

        ${loadingRows ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
          <div class="us-card-list">
            ${rows.map((r) => {
              const bm = usBandForScore(r.risk_score, r.risk_band);
              return html`
                <article class="us-rec-card ${bm.cardTone}" data-key="urk-${r.id}">
                  <div class="us-rec-card__top">
                    <div class="us-rec-card__id">
                      <span class="us-monogram us-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                      <div style="min-width:0;flex:1;display:grid;gap:5px">
                        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                          <strong style="font-size:15px">${r.first_name} ${r.last_name}</strong>
                          <span class="us-status-pill ${r.reg_bi_check === 'Suitable' ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>Reg BI: ${r.reg_bi_check}</span>
                          <span class="tk-tag">${r.portfolio_type}</span>
                          ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                        ${renderUsRiskMeter(r.risk_score, { band: r.risk_band, alloc: parseAlloc(r.suggested_allocation), compact: true })}
                      </div>
                    </div>
                    <div class="us-rec-card__aside">
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-del-risk" data-id="${r.id}">Delete</button>
                    </div>
                  </div>
                  <div class="us-rec-card__meta">
                    <span>Horizon: <strong>${r.time_horizon}y</strong></span>
                    <span>Loss Cap: <strong>${r.loss_capacity}/10</strong></span>
                    <span>Target Mix: <strong class="tk-mono">${r.suggested_allocation}</strong></span>
                    <span>Assessed: ${fmtDay(r.assessed_date)}</span>
                  </div>
                  ${r.rationale ? html`<div class="tk-muted" style="font-size:13px;line-height:1.45">${r.rationale}</div>` : ''}
                </article>`;
            })}
          </div>` : emptyState({ iconName: 'scale', title: 'No risk assessments match', text: 'Complete the scorer on the left to record a Reg BI suitability assessment.' })}
      </div>
    </div>`;
}

export function renderFeesView(state) {
  const cur = state.session.settings.currency || 'USD';
  const d = state.feeDraft;
  const calc = computeTieredAumFee(d.account_value, d.fee_tier);
  const rows = state.feeFilter === 'All'
    ? state.agreements
    : state.agreements.filter((f) => f.status === state.feeFilter);
  const loadingRows = state.loading && !state.agreements.length;

  const totalAum = state.agreements.reduce((acc, f) => acc + Number(f.account_value_cents || 0), 0);
  const totalAnnual = state.agreements.reduce((acc, f) => acc + Number(f.annual_fee_cents || 0), 0);
  const totalQuarterly = state.agreements.reduce((acc, f) => acc + Number(f.quarterly_fee_cents || 0), 0);
  const avgBps = totalAum > 0 ? ((totalAnnual / totalAum) * 10000).toFixed(1) : '0.0';
  const execCount = state.agreements.filter((f) => f.status === 'Executed').length;
  const draftCount = state.agreements.filter((f) => f.status === 'Draft').length;

  return html`
    <section class="us-masthead" aria-label="Progressive Tiered AUM Advisory Fee Calculator">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('dollar', { size: 12 })} FORM ADV PART 2A · PROGRESSIVE AUM BILLING
        </div>
        <h1 class="us-masthead__title">Advisory Fee Calculator</h1>
        <div class="us-masthead__meta">
          <span>Marginal breakpoint schedules (Standard, Premium, Institutional)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable client Fee Schedules</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--brass us-pod--wide">
          <span class="us-pod__lbl">${icon('trending', { size: 12 })} Annual Run-Rate</span>
          <span class="us-pod__val us-pod__val--serif">${money(totalAnnual, { currency: cur })}</span>
          <span class="us-pod__sub">On ${money(totalAum, { currency: cur })} billed AUM</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('dollar', { size: 12 })} Quarterly</span>
          <span class="us-pod__val">${money(totalQuarterly, { currency: cur })}</span>
          <span class="us-pod__sub">${state.agreements.length} schedule${state.agreements.length === 1 ? '' : 's'}</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('chart', { size: 12 })} Avg Blended</span>
          <span class="us-pod__val">${avgBps} bps</span>
          <span class="us-pod__sub">${execCount} Executed · ${draftCount} Draft</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('dollar', { size: 17 })} Calculate &amp; Execute Fee Agreement</h2></div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="us-save-fee" novalidate>
            <label class="k-field"><span class="k-field__label">Client Household</span>
              <select class="k-input" data-usfee="client_id">
                ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`)}
              </select>
            </label>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Managed AUM (${cur})</span>
                <input class="k-input" type="number" step="25000" min="100" value="${d.account_value}" data-usfee="account_value" required>
              </label>
              <label class="k-field"><span class="k-field__label">Fee Tier Schedule</span>
                <select class="k-input" data-usfee="fee_tier">
                  <option value="Standard" ${d.fee_tier === 'Standard' ? 'selected' : ''}>Standard (100 / 85 / 70 bps)</option>
                  <option value="Premium" ${d.fee_tier === 'Premium' ? 'selected' : ''}>Premium (85 / 70 / 55 bps)</option>
                  <option value="Institutional" ${d.fee_tier === 'Institutional' ? 'selected' : ''}>Institutional (55 / 40 bps)</option>
                </select>
              </label>
            </div>

            ${renderTieredFeeCard(calc, { currency: cur, title: 'Live Marginal AUM Tier Breakdown' })}

            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Billing Frequency</span>
                <select class="k-input" data-usfee="billing_frequency">
                  <option value="Quarterly" ${d.billing_frequency === 'Quarterly' ? 'selected' : ''}>Quarterly</option>
                  <option value="Monthly" ${d.billing_frequency === 'Monthly' ? 'selected' : ''}>Monthly</option>
                  <option value="Annually" ${d.billing_frequency === 'Annually' ? 'selected' : ''}>Annually</option>
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Status</span>
                <select class="k-input" data-usfee="status">
                  <option value="Executed" ${d.status === 'Executed' ? 'selected' : ''}>Executed</option>
                  <option value="Draft" ${d.status === 'Draft' ? 'selected' : ''}>Draft</option>
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Effective Date</span>
                <input class="k-input" type="date" value="${d.effective_date || today()}" data-usfee="effective_date">
              </label>
            </div>
            <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Direct custodian deduction authorization…"></label>
            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Save Advisory Fee Agreement</button>
            </div>
          </form>
        </div>
      </section>

      <div class="tk-stack">
        <div class="tk-toolbar" style="margin-bottom:0">
          <div class="tk-segmented" role="tablist" aria-label="Filter fee schedules">
            <button type="button" class="${cls('tk-pill', { 'is-on': state.feeFilter === 'All' })}" data-action="us-fee-filter" data-filter="All">All (${state.agreements.length})</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': state.feeFilter === 'Executed' })}" data-action="us-fee-filter" data-filter="Executed">Executed (${execCount})</button>
            <button type="button" class="${cls('tk-pill', { 'is-on': state.feeFilter === 'Draft' })}" data-action="us-fee-filter" data-filter="Draft">Draft (${draftCount})</button>
          </div>
        </div>

        ${loadingRows ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
          <div class="us-card-list">
            ${rows.map((f) => html`
              <article class="us-rec-card ${f.status === 'Executed' ? 'us-rec-card--ok' : 'us-rec-card--warn'}" data-key="usf-${f.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${f.first_name} ${f.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15px">${f.first_name} ${f.last_name}</strong>
                        <span class="us-bronze-badge">${f.fee_tier} · ${f.effective_bps} bps</span>
                        <span class="us-status-pill ${f.status === 'Executed' ? 'us-status-pill--ok' : 'us-status-pill--warn'}"><span class="us-status-pill__dot"></span>${f.status}</span>
                        ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="tk-muted" style="font-size:12.5px">Managed AUM: <strong style="color:var(--k-text)">${money(f.account_value_cents, { currency: cur })}</strong> · Effective ${fmtDay(f.effective_date)}</div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    <button type="button" class="k-btn k-btn--sm" data-action="us-print-fee" data-id="${f.id}">${icon('printer', { size: 14 })} Schedule HTML</button>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-del-fee" data-id="${f.id}">Delete</button>
                  </div>
                </div>
                <div class="us-fee-mini-grid">
                  <div>
                    <div class="us-fee-mini__k">Annual Fee</div>
                    <div class="us-fee-mini__v" style="color:var(--us-oxford)">${money(f.annual_fee_cents, { currency: cur })}</div>
                  </div>
                  <div>
                    <div class="us-fee-mini__k">Quarterly</div>
                    <div class="us-fee-mini__v">${money(f.quarterly_fee_cents, { currency: cur })}</div>
                  </div>
                  <div>
                    <div class="us-fee-mini__k">Billing Cycle</div>
                    <div class="us-fee-mini__v">${f.billing_frequency}</div>
                  </div>
                </div>
                ${f.notes ? html`<div class="tk-muted" style="font-size:12.5px">${f.notes}</div>` : ''}
              </article>`)}
          </div>` : emptyState({ iconName: 'dollar', title: 'No fee agreements match', text: 'Use the progressive tier calculator on the left to create a fee schedule.' })}
      </div>
    </div>`;
}

export function wireRiskFeeActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-usrisk]', (e, el) => {
    const k = el.dataset.usrisk;
    state.riskDraft[k] = (k === 'time_horizon' || k === 'loss_capacity') ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'change', '[data-usrisk]', (e, el) => {
    const k = el.dataset.usrisk;
    state.riskDraft[k] = (k === 'time_horizon' || k === 'loss_capacity') ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'click', '[data-action="us-risk-react"]', (e, el) => { state.riskDraft.market_reaction = el.dataset.val; draw(); });
  on(root, 'click', '[data-action="us-risk-filter"]', (e, el) => { state.riskFilter = el.dataset.band; draw(); });
  on(root, 'click', '[data-action="us-fee-filter"]', (e, el) => { state.feeFilter = el.dataset.filter; draw(); });

  on(root, 'submit', 'form[data-form="us-save-risk"]', async (e) => {
    e.preventDefault();
    try {
      const d = state.riskDraft;
      const res = await api.post('/api/risk', {
        client_id: Number(d.client_id),
        time_horizon: Number(d.time_horizon),
        market_reaction: d.market_reaction,
        loss_capacity: Number(d.loss_capacity),
        investment_experience: d.investment_experience,
        portfolio_type: d.portfolio_type,
        rationale: d.rationale,
        assessed_date: today(),
      });
      toast.success(`Risk assessment saved: ${res.assessment.risk_band} (${res.assessment.risk_score}/100 · Reg BI: ${res.assessment.reg_bi_check}).`);
      state.riskDraft.rationale = '';
      await loadScreen('/risk');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-del-risk"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete assessment?', message: 'Remove this suitability assessment?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/risk', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/risk'); }
    catch (err) { toastError(err); }
  });

  on(root, 'input', '[data-usfee]', (e, el) => { state.feeDraft[el.dataset.usfee] = el.value; draw(); });
  on(root, 'change', '[data-usfee]', (e, el) => { state.feeDraft[el.dataset.usfee] = el.value; draw(); });

  on(root, 'submit', 'form[data-form="us-save-fee"]', async (e, form) => {
    e.preventDefault();
    try {
      const notesEl = form.querySelector('[name="notes"]');
      const d = state.feeDraft;
      const res = await api.post('/api/fees', {
        client_id: Number(d.client_id),
        account_value: Number(d.account_value),
        fee_tier: d.fee_tier,
        billing_frequency: d.billing_frequency,
        status: d.status,
        effective_date: d.effective_date || today(),
        notes: notesEl ? notesEl.value : '',
      });
      toast.success(`Fee schedule saved (${res.agreement.effective_bps} bps effective).`);
      if (notesEl) notesEl.value = '';
      await loadScreen('/fees');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-del-fee"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete fee agreement?', message: 'Remove this advisory fee agreement?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/fees', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/fees'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-print-fee"]', (e, el) => {
    const f = state.agreements.find((x) => String(x.id) === el.dataset.id);
    if (!f) return;
    const s = state.session.settings;
    const cur = s.currency || 'USD';
    const rowsHtml = (f.tier_breakdown || []).map((b) =>
      `<tr><td>${esc(b.bracket)}</td><td class="num">${esc(money(b.fee_cents, { currency: cur }))}</td></tr>`
    ).join('');
    downloadHtmlDoc(`fee-schedule-${f.last_name.toLowerCase()}-${f.effective_date || today()}.html`, {
      title: 'Investment Advisory Fee Schedule',
      businessName: s.business_name,
      subtitle: `${s.crd_number || 'SEC Registered Investment Adviser'} · Tier: ${f.fee_tier}`,
      accent: '#162a4c',
      bodyHtml: `
        <table>
          <tr><th>Client Household</th><td>${esc(f.first_name + ' ' + f.last_name)}</td><th>Effective Date</th><td>${esc(f.effective_date)}</td></tr>
          <tr><th>Assets Under Management (AUM)</th><td class="num"><strong>${esc(money(f.account_value_cents, { currency: cur }))}</strong></td><th>Blended Rate</th><td class="num"><strong>${esc(f.effective_bps)} bps</strong></td></tr>
          <tr><th>Billing Frequency</th><td>${esc(f.billing_frequency)}</td><th>Status</th><td>${esc(f.status)}</td></tr>
        </table>
        <h3>Progressive Tier Breakdown</h3>
        <table>
          <thead><tr><th>AUM Tier Bracket</th><th class="num">Annual Fee</th></tr></thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row"><td>Total Annual Advisory Fee</td><td class="num">${esc(money(f.annual_fee_cents, { currency: cur }))}</td></tr>
            <tr><td>Quarterly Billing Instalment (÷ 4)</td><td class="num"><strong>${esc(money(f.quarterly_fee_cents, { currency: cur }))}</strong></td></tr>
            <tr><td>Monthly Equivalent (÷ 12)</td><td class="num">${esc(money(f.monthly_fee_cents, { currency: cur }))}</td></tr>
          </tbody>
        </table>
        ${f.notes ? `<div class="box"><strong>Agreement Notes:</strong> ${esc(f.notes)}</div>` : ''}`,
    });
  });
}
