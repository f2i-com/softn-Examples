// Risk Profile Assessment Scorer (AU): Unified Forest & Gold Masthead, live Best Interest Duty scoring
// with 4-factor point breakdown, 5-band visual meter, band-colored assessment cards & printable report.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { AU_RISK_BANDS, bandForScore, renderRiskBandMeter, renderClientClassPill } from '../au_ui.js';

const BANDS = AU_RISK_BANDS.map((b) => b.name);

function previewRisk(draft) {
  const h = Number(draft.time_horizon || 10);
  const l = Number(draft.loss_capacity || 5);
  const hPts = Math.round((Math.min(30, Math.max(1, h)) / 30) * 25);
  const lPts = Math.round(Math.min(10, Math.max(1, l)) * 3.5);
  const mPts = draft.market_reaction === 'buy' ? 25 : draft.market_reaction === 'hold' ? 12 : 0;
  const ePts = draft.investment_experience === 'extensive' ? 15 : draft.investment_experience === 'moderate' ? 10 : draft.investment_experience === 'limited' ? 5 : 0;
  const score = Math.min(100, Math.max(0, hPts + lPts + mPts + ePts));
  const bandObj = bandForScore(score);
  return { score, band: bandObj.name, bandObj, hPts, lPts, mPts, ePts };
}

export function renderRiskView(state) {
  const d = state.riskDraft;
  const calc = previewRisk(d);
  const rows = state.riskFilter === 'All'
    ? state.riskAssessments
    : state.riskAssessments.filter((a) => a.profile_band === state.riskFilter);
  const loadingRows = state.loading && !state.riskAssessments.length;

  const avgScore = state.riskAssessments.length
    ? Math.round(state.riskAssessments.reduce((acc, a) => acc + Number(a.risk_score || 0), 0) / state.riskAssessments.length)
    : calc.score;
  const avgBand = bandForScore(avgScore);
  const growthCount = state.riskAssessments.filter((a) => a.profile_band === 'Growth' || a.profile_band === 'High Growth').length;
  const countByBand = (b) => state.riskAssessments.filter((a) => a.profile_band === b).length;

  return html`
    <section class="au-masthead" aria-label="Best Interest Duty Risk Profile Scorer">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('scale', { size: 12 })} BEST INTEREST DUTY · CORPORATIONS ACT s961B
        </div>
        <h1 class="au-masthead__title">Risk Profile Scorer</h1>
        <div class="au-masthead__meta">
          <span>4-factor suitability calculation</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>5-band asset allocation mapping</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable s961B file notes</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--ring au-pod--gold" aria-label="Live draft risk score ${calc.score}%">
          <div class="tk-ring" style="--p:${calc.score}%;--ring-color:#e8c26f;--ring-size:48px">
            <span class="tk-ring__val">${calc.score}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="au-pod__lbl">Draft Band</span>
            <span class="au-pod__val" style="font-size:15.5px">${calc.band}</span>
            <span class="au-pod__sub">${calc.bandObj.split}</span>
          </div>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('clipboard', { size: 12 })} Assessed</span>
          <span class="au-pod__val">${state.riskAssessments.length}</span>
          <span class="au-pod__sub">${growthCount} Growth / High Gr.</span>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('chart', { size: 12 })} Book Avg</span>
          <span class="au-pod__val">${avgScore}/100</span>
          <span class="au-pod__sub">${avgBand.name}</span>
        </div>
      </div>
    </section>

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('scale', { size: 17 })} New Suitability Assessment</h2></div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="save-risk" novalidate>
            <label class="k-field">
              <span class="k-field__label">Client Household</span>
              <select class="k-input" name="client_id" data-risk-input="client_id" required>
                ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name} (${c.age} yrs · ${c.wholesale_status === 'Yes' ? 'Wholesale s761G' : 'Retail'})</option>`)}
              </select>
            </label>

            <div class="k-form__row">
              <label class="k-field">
                <span class="k-field__label">Investment Time Horizon: <strong>${d.time_horizon} years</strong></span>
                <input type="range" min="1" max="30" name="time_horizon" value="${d.time_horizon}" data-risk-input="time_horizon">
                <span class="k-field__hint">1 yr (short-term) to 30 yrs (long-term) · ${calc.hPts}/25 pts</span>
              </label>
              <label class="k-field">
                <span class="k-field__label">Loss Absorption Capacity: <strong>${d.loss_capacity} / 10</strong></span>
                <input type="range" min="1" max="10" name="loss_capacity" value="${d.loss_capacity}" data-risk-input="loss_capacity">
                <span class="k-field__hint">1 (&lt;5% tolerable loss) to 10 (&gt;40% tolerable) · ${calc.lPts}/35 pts</span>
              </label>
            </div>

            <div class="k-field">
              <span class="k-field__label">If the market dropped 20% tomorrow, what would the client do? (${calc.mPts}/25 pts)</span>
              <div class="tk-pills">
                ${[
                  ['sell', 'Sell everything (0 pts)'],
                  ['hold', 'Hold and wait (12 pts)'],
                  ['buy', 'Buy more at discount (25 pts)'],
                ].map(([val, lbl]) => html`
                  <button type="button" class="${cls('tk-pill', { 'is-on': d.market_reaction === val })}" data-action="risk-reaction" data-val="${val}">${lbl}</button>`)}
              </div>
              <input type="hidden" name="market_reaction" value="${d.market_reaction}">
            </div>

            <label class="k-field">
              <span class="k-field__label">Investment Experience (${calc.ePts}/15 pts)</span>
              <select class="k-input" name="investment_experience" data-risk-input="investment_experience">
                ${[
                  ['none', 'None (0 years) — 0 pts'],
                  ['limited', 'Limited (1–3 years) — 5 pts'],
                  ['moderate', 'Moderate (3–10 years) — 10 pts'],
                  ['extensive', 'Extensive (10+ years) — 15 pts'],
                ].map(([v, l]) => html`<option value="${v}" ${v === d.investment_experience ? 'selected' : ''}>${l}</option>`)}
              </select>
            </label>

            <div class="au-pts-row" aria-label="Factor score breakdown">
              <div class="au-pt-chip"><span class="au-pt-chip__k">Horizon</span><span class="au-pt-chip__v">${calc.hPts}/25</span></div>
              <div class="au-pt-chip"><span class="au-pt-chip__k">Loss Cap</span><span class="au-pt-chip__v">${calc.lPts}/35</span></div>
              <div class="au-pt-chip"><span class="au-pt-chip__k">-20% Drop</span><span class="au-pt-chip__v">${calc.mPts}/25</span></div>
              <div class="au-pt-chip"><span class="au-pt-chip__k">Experience</span><span class="au-pt-chip__v">${calc.ePts}/15</span></div>
            </div>

            ${renderRiskBandMeter(calc.score, { band: calc.band, showDesc: true, label: 'Calculated 5-Band Risk Score' })}

            <label class="k-field">
              <span class="k-field__label">Best Interest Duty Suitability Rationale</span>
              <textarea class="k-input" name="best_interest_notes" rows="2" placeholder="Document why this risk profile satisfies s961B Best Interest Duty…" data-risk-input="best_interest_notes">${d.best_interest_notes || ''}</textarea>
            </label>

            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Save Risk Profile Assessment</button>
            </div>
          </form>
        </div>
      </section>

      <div class="tk-stack">
        <div class="tk-toolbar" style="margin-bottom:0">
          <div class="tk-segmented" role="tablist" aria-label="Filter assessments by risk band">
            <button type="button" class="${cls('tk-pill', { 'is-on': state.riskFilter === 'All' })}" data-action="risk-filter" data-band="All">All (${state.riskAssessments.length})</button>
            ${BANDS.map((b) => html`
              <button type="button" class="${cls('tk-pill', { 'is-on': state.riskFilter === b })}" data-action="risk-filter" data-band="${b}">${b} (${countByBand(b)})</button>`)}
          </div>
        </div>

        ${loadingRows ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
          <div class="au-card-list">
            ${rows.map((r) => {
              const bm = bandForScore(r.risk_score, r.profile_band);
              return html`
                <article class="au-rec-card ${bm.cardTone}" data-key="rk-${r.id}">
                  <div class="au-rec-card__top">
                    <div class="au-rec-card__id">
                      <span class="au-monogram au-monogram--sm ${r.wholesale_status === 'Yes' ? 'au-monogram--gold' : ''}">${initials(`${r.first_name} ${r.last_name}`)}</span>
                      <div style="min-width:0;flex:1;display:grid;gap:5px">
                        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                          <strong style="font-size:15px">${r.first_name} ${r.last_name}</strong>
                          ${r.wholesale_status ? renderClientClassPill(r.wholesale_status, { compact: true }) : ''}
                          <span class="tk-tag ${bm.tone}">${bm.split}</span>
                          ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                        </div>
                        ${renderRiskBandMeter(r.risk_score, { band: r.profile_band, compact: true })}
                      </div>
                    </div>
                    <div class="au-rec-card__aside">
                      <button type="button" class="k-btn k-btn--sm" data-action="print-risk" data-id="${r.id}">${icon('printer', { size: 14 })} Report</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="delete-risk" data-id="${r.id}">Delete</button>
                    </div>
                  </div>
                  <div class="au-rec-card__meta">
                    <span>Horizon: <strong>${r.time_horizon}y</strong></span>
                    <span>Loss cap: <strong>${r.loss_capacity}/10</strong></span>
                    <span>Drop reaction: <strong>${r.market_reaction}</strong></span>
                    <span>Experience: <strong>${r.investment_experience}</strong></span>
                    <span>Assessed: ${fmtDay(r.assessed_date)}</span>
                  </div>
                  ${r.best_interest_notes ? html`<div class="tk-muted" style="font-size:13px;line-height:1.45">${r.best_interest_notes}</div>` : ''}
                </article>`;
            })}
          </div>` : emptyState({ iconName: 'scale', title: 'No risk assessments match', text: 'Complete the scorer on the left to record a Best Interest Duty risk profile.' })}
      </div>
    </div>`;
}

export function wireRiskActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-risk-input]', (e, el) => {
    const k = el.dataset.riskInput;
    state.riskDraft[k] = (k === 'time_horizon' || k === 'loss_capacity') ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'change', '[data-risk-input]', (e, el) => {
    const k = el.dataset.riskInput;
    state.riskDraft[k] = (k === 'time_horizon' || k === 'loss_capacity') ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'click', '[data-action="risk-reaction"]', (e, el) => {
    state.riskDraft.market_reaction = el.dataset.val;
    draw();
  });
  on(root, 'click', '[data-action="risk-filter"]', (e, el) => {
    state.riskFilter = el.dataset.band;
    draw();
  });

  on(root, 'submit', 'form[data-form="save-risk"]', async (e) => {
    e.preventDefault();
    try {
      const d = state.riskDraft;
      const res = await api.post('/api/risk', {
        client_id: Number(d.client_id),
        time_horizon: Number(d.time_horizon),
        market_reaction: d.market_reaction,
        loss_capacity: Number(d.loss_capacity),
        investment_experience: d.investment_experience,
        best_interest_notes: d.best_interest_notes,
        assessed_date: today(),
      });
      toast.success(`Risk profile saved: ${res.assessment.profile_band} (${res.assessment.risk_score}/100).`);
      state.riskDraft.best_interest_notes = '';
      await loadScreen('/risk');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="delete-risk"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete risk assessment?', message: 'Remove this risk profile record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/risk', { id: Number(el.dataset.id) }); toast.success('Assessment removed.'); await loadScreen('/risk'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-risk"]', (e, el) => {
    const r = state.riskAssessments.find((x) => String(x.id) === el.dataset.id);
    if (!r) return;
    const s = state.session.settings;
    const bm = bandForScore(r.risk_score, r.profile_band);
    downloadHtmlDoc(`risk-profile-${r.last_name.toLowerCase()}-${r.assessed_date || today()}.html`, {
      title: `Risk Profile Assessment · ${r.first_name} ${r.last_name}`,
      businessName: s.business_name,
      subtitle: `${s.afsl_number || 'Australian AFSL'} · Best Interest Duty Suitability Record`,
      accent: '#114237',
      bodyHtml: `
        <table>
          <tr><th>Client</th><td>${esc(r.first_name + ' ' + r.last_name)}</td><th>Assessed Date</th><td>${esc(r.assessed_date)}</td></tr>
          <tr><th>Calculated Score</th><td><strong>${esc(r.risk_score)} / 100</strong></td><th>Profile Band</th><td><strong>${esc(r.profile_band)}</strong> (${esc(bm.split)})</td></tr>
          <tr><th>Time Horizon</th><td>${esc(r.time_horizon)} years</td><th>Loss Capacity</th><td>${esc(r.loss_capacity)} / 10</td></tr>
          <tr><th>-20% Market Reaction</th><td>${esc(r.market_reaction)}</td><th>Investment Experience</th><td>${esc(r.investment_experience)}</td></tr>
        </table>
        <div class="box"><strong>Best Interest Duty Rationale (s961B):</strong><br>${esc(r.best_interest_notes || bm.desc)}</div>
        <div class="box"><strong>Assessed By:</strong> ${esc(r.assessed_by || 'Adviser')}</div>`,
    });
  });
}
