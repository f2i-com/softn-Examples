// RIA Advisory & Transition Desk: Institutional Oxford Navy & Champagne Brass Masthead with Compliance Ring,
// Two-Column Command Split (5-Stage Household Pipeline + Active ACATS/Rollover/1035 Transitions on left;
// Sticky Operational Rail for Form CRS, Annual Reviews, Vault Expiries & ADV Fee Run-Rate on right).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';
import {
  renderTransferStatusPill,
  renderUsDeadlinePill,
  renderInvestorTierPill,
  renderUsRiskMeter,
} from '../us_ui.js';

const STAGES = ['Prospect', 'Discovery', 'ACAT & Paperwork', 'Active', 'Review Due'];

function parseAllocStr(str) {
  const parts = String(str || '').split('/').map((n) => Number(n));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? parts : null;
}

function computeRiaCompliance(clients, counts) {
  const total = clients.length;
  const crsSigned = clients.filter((c) => c.crs_acknowledged).length;
  const w9Done = clients.filter((c) => c.w9_certified_date).length;
  const dueReviews = Number(counts.reviewsDue || 0);
  const expDocs = Number(counts.docsExpiring || 0);
  if (!total) {
    return { pct: 100, color: '#34d399', label: 'Audit Ready', sub: 'CRS & Reg BI clear', crsSigned: 0, w9Done: 0 };
  }
  const checks = total * 3;
  const issues = (total - crsSigned) + (total - w9Done) + dueReviews + expDocs;
  const pct = Math.max(0, Math.min(100, Math.round(((checks - Math.min(checks, issues)) / Math.max(1, checks)) * 100)));
  const color = pct >= 85 ? '#34d399' : pct >= 65 ? '#e4be7e' : '#f87171';
  const label = pct >= 85 ? 'Strong' : pct >= 65 ? 'Attention' : 'Action Due';
  const sub = `${crsSigned}/${total} CRS · ${w9Done}/${total} W-9`;
  return { pct, color, label, sub, crsSigned, w9Done };
}

export function renderDeskView(state) {
  const d = state.desk;
  const settings = state.session.settings || {};
  const cur = settings.currency || 'USD';
  const counts = (d && d.counts) || state.session.counts || {};
  const clients = (d && d.clients) || [];
  const crsPending = clients.filter((c) => !c.crs_acknowledged);
  const qpCount = clients.filter((c) => Number(c.liquid_net_worth_cents || 0) >= 500000000 || Number(c.net_worth_cents || 0) >= 500000000).length;
  const acats = (d && d.acats) || [];
  const rollovers = (d && d.rollovers) || [];
  const exchanges = (d && d.exchanges) || [];
  const reviewsDue = (d && d.reviewsDue) || [];
  const expiringDocs = (d && d.expiringDocs) || [];
  const deskFees = state.deskFees || [];
  const totalInFlight = [...acats, ...rollovers, ...exchanges].reduce((acc, x) => acc + Number(x.estimated_value_cents || 0), 0);
  const initialLoad = state.loading && !d;
  const compliance = computeRiaCompliance(clients, counts);
  const totalAlerts = (counts.crsPending || 0) + (counts.reviewsDue || 0) + (counts.docsExpiring || 0);
  const annualFeeRunRate = deskFees.reduce((acc, f) => acc + Number(f.annual_fee_cents || 0), 0);
  const qtrFeeRunRate = deskFees.reduce((acc, f) => acc + Number(f.quarterly_fee_cents || 0), 0);

  return html`
    ${renderSampleBanner(counts.sampleCount || 0)}

    <section class="us-masthead" aria-label="RIA Advisory Desk Command">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${compliance.color}"></span>
          ${settings.crd_number || 'SEC RIA'} · FIDUCIARY DESK
        </div>
        <h1 class="us-masthead__title">RIA Advisory Desk</h1>
        <div class="us-masthead__meta">
          <span><strong style="color:#f2d29e">${counts.clients || 0} household${counts.clients === 1 ? '' : 's'}</strong> (${qpCount} QP · ${counts.accreditedClients || 0} 501a)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>SEC Form CRS, Reg BI &amp; ACATS transitions</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${acats.length + rollovers.length + exchanges.length} active transfer${acats.length + rollovers.length + exchanges.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--ring us-pod--brass" aria-label="Compliance standing ${compliance.pct}%">
          <div class="tk-ring" style="--p:${initialLoad ? 0 : compliance.pct}%;--ring-color:${compliance.color};--ring-size:48px">
            <span class="tk-ring__val">${initialLoad ? '…' : `${compliance.pct}%`}</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="us-pod__lbl">Reg BI &amp; CRS</span>
            <span class="us-pod__val" style="font-size:16px">${initialLoad ? 'Checking…' : compliance.label}</span>
            <span class="us-pod__sub">${initialLoad ? 'RIA ledger' : compliance.sub}</span>
          </div>
        </div>

        <a href="#/fees" class="us-pod us-pod--brass us-pod--wide">
          <span class="us-pod__lbl">${icon('trending', { size: 12 })} Managed AUM</span>
          <span class="us-pod__val us-pod__val--serif">${initialLoad ? '—' : money(counts.totalAumCents || 0, { currency: cur })}</span>
          <span class="us-pod__sub">${money(annualFeeRunRate, { currency: cur })}/yr ADV fees →</span>
        </a>

        <a href="#/transfers" class="us-pod">
          <span class="us-pod__lbl">${icon('us-acat', { size: 12 })} In-Flight</span>
          <span class="us-pod__val">${money(totalInFlight, { currency: cur })}</span>
          <span class="us-pod__sub">${counts.activeTransfers || 0} transition${counts.activeTransfers === 1 ? '' : 's'} →</span>
        </a>

        <a href="#/vault" class="${cls('us-pod', { 'us-pod--alert': totalAlerts > 0 })}">
          <span class="us-pod__lbl">${icon(totalAlerts > 0 ? 'alert' : 'shield-check', { size: 12 })} Compliance</span>
          <span class="us-pod__val">${totalAlerts}</span>
          <span class="us-pod__sub">${counts.crsPending || 0} CRS · ${(counts.reviewsDue || 0) + (counts.docsExpiring || 0)} due →</span>
        </a>

        <button type="button" class="k-btn us-btn-brass" data-action="desk-new-client">${icon('plus', { size: 15 })} New Household</button>
      </div>
    </section>

    ${initialLoad ? html`
      <section class="tk-sheet" style="margin-bottom:18px">${skeleton(4)}</section>
      <div class="us-cmd-split">
        <section class="tk-sheet">${skeleton(4)}</section>
        <section class="tk-sheet">${skeleton(4)}</section>
      </div>` : html`
      <section class="tk-sheet" style="margin-bottom:18px">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Household Onboarding &amp; Transition Pipeline</h2>
          <span class="tk-sheet__count">${clients.length} household${clients.length === 1 ? '' : 's'}</span>
          <div class="tk-sheet__actions">
            <a href="#/risk" class="k-btn k-btn--ghost k-btn--sm">${icon('scale', { size: 14 })} IPS Scorer</a>
            <a href="#/clients" class="k-btn k-btn--sm">All Files →</a>
          </div>
        </div>
        <div class="tk-sheet__body">
          <div class="us-pipeline-wrap">
            <div class="us-pipeline">
              ${STAGES.map((stage, idx) => {
                const list = clients.filter((c) => c.onboarding_stage === stage);
                const nextStage = idx + 1 < STAGES.length ? STAGES[idx + 1] : null;
                return html`
                  <div class="us-stage-col us-stage-col--${idx + 1}" data-key="ustage-${stage}">
                    <div class="us-stage-col__head">
                      <span>${stage}</span>
                      <span class="tk-tag">${list.length}</span>
                    </div>
                    ${list.length ? list.map((c) => html`
                      <div class="tk-ticket ${c.crs_acknowledged ? '' : 'tk-ticket--warn'}" data-key="upipe-${c.id}">
                        <div class="tk-ticket__top">
                          <span class="us-monogram us-monogram--sm ${c.accredited_investor === 'Yes' ? 'us-monogram--brass' : ''}">${initials(`${c.first_name} ${c.last_name}`)}</span>
                          <a href="#/clients?client=${c.id}" class="us-ticket-name">${c.first_name} ${c.last_name}</a>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
                          ${renderInvestorTierPill(c, { compact: true })}
                          <span class="us-status-pill ${c.crs_acknowledged ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>${c.crs_acknowledged ? 'CRS Signed' : 'CRS Pending'}</span>
                        </div>
                        ${renderUsRiskMeter(c.risk_score, { alloc: parseAllocStr(c.portfolio_allocation), compact: true })}
                        <div class="tk-ticket__foot">
                          <a href="#/clients?client=${c.id}" class="k-btn k-btn--ghost k-btn--sm">File</a>
                          ${nextStage ? html`<button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="desk-advance-stage" data-id="${c.id}" data-stage="${nextStage}">→ ${nextStage === 'ACAT & Paperwork' ? 'ACAT' : nextStage}</button>` : ''}
                        </div>
                      </div>`) : html`<div class="tk-muted" style="font-size:12px;padding:6px 2px">No households</div>`}
                  </div>`;
              })}
            </div>
          </div>
        </div>
      </section>

      <div class="us-cmd-split">
        <div class="tk-stack">
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('us-acat', { size: 17 })} Active Asset Transitions (ACATS · Rollover · 1035)</h2>
              <span class="tk-sheet__count">${acats.length + rollovers.length + exchanges.length}</span>
              <div class="tk-sheet__actions"><a href="#/transfers" class="k-btn k-btn--ghost k-btn--sm">Transfers Hub →</a></div>
            </div>
            <div>
              ${acats.map((a) => html`
                <div class="tk-row" data-key="da-${a.id}">
                  <div class="tk-row__main" style="gap:5px">
                    <div class="tk-row__title">
                      <span class="us-monogram us-monogram--sm">${initials(`${a.first_name} ${a.last_name}`)}</span>
                      <span class="tk-tag tk-tag--accent">ACATS</span>
                      <span>${a.first_name} ${a.last_name} — ${a.custodian}</span>
                      ${renderTransferStatusPill(a.status)}
                    </div>
                    <div class="tk-row__meta">
                      <span class="us-ref">${a.account_number}</span>
                      <span>${a.transfer_type}</span>
                      <span>Est: <strong style="color:var(--k-text)">${money(a.estimated_value_cents, { currency: cur })}</strong></span>
                    </div>
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="desk-acat-settle" data-id="${a.id}">Mark Settled ✓</button>
                  </div>
                </div>`)}
              ${rollovers.map((r) => html`
                <div class="tk-row" data-key="dr-${r.id}">
                  <div class="tk-row__main" style="gap:5px">
                    <div class="tk-row__title">
                      <span class="us-monogram us-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                      <span class="tk-tag tk-tag--info">Rollover</span>
                      <span>${r.first_name} ${r.last_name} — ${r.rollover_type}</span>
                      ${renderTransferStatusPill(r.status)}
                    </div>
                    <div class="tk-row__meta">
                      <span>${r.current_custodian} → <strong>${r.receiving_custodian}</strong></span>
                      <span>Est: <strong style="color:var(--k-text)">${money(r.estimated_value_cents, { currency: cur })}</strong></span>
                    </div>
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="k-btn k-btn--sm" data-action="desk-roll-fund" data-id="${r.id}">Mark Funded ✓</button>
                  </div>
                </div>`)}
              ${exchanges.map((e) => html`
                <div class="tk-row" data-key="de-${e.id}">
                  <div class="tk-row__main" style="gap:5px">
                    <div class="tk-row__title">
                      <span class="us-monogram us-monogram--sm">${initials(`${e.first_name} ${e.last_name}`)}</span>
                      <span class="us-bronze-badge">1035 Exchange</span>
                      <span>${e.first_name} ${e.last_name} — ${e.existing_carrier} → ${e.new_carrier}</span>
                      ${renderTransferStatusPill(e.status)}
                      ${e.has_surrender_charges === 'Yes' ? html`<span class="tk-tag tk-tag--bad">Surrender ${money(e.surrender_charges_cents, { currency: cur })}</span>` : ''}
                    </div>
                    <div class="tk-row__meta">
                      <span>${e.exchange_type}</span>
                      <span>Value: <strong style="color:var(--k-text)">${money(e.estimated_value_cents, { currency: cur })}</strong></span>
                    </div>
                  </div>
                </div>`)}
              ${(acats.length + rollovers.length + exchanges.length) === 0 ? emptyState({ iconName: 'us-acat', title: 'No active transitions', text: 'Initiate an ACAT, IRA/401(k) Rollover, or 1035 Exchange from the Transfers Hub.' }) : ''}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('calendar', { size: 17 })} Upcoming Annual Reviews (30 Days)</h2>
              <span class="tk-sheet__count">${reviewsDue.length}</span>
              <div class="tk-sheet__actions"><a href="#/vault" class="k-btn k-btn--ghost k-btn--sm">All Reviews →</a></div>
            </div>
            <div>
              ${reviewsDue.length ? reviewsDue.map((r) => html`
                <div class="tk-row" data-key="urv-${r.id}">
                  <div class="tk-row__main" style="gap:5px">
                    <div class="tk-row__title">
                      <span class="us-monogram us-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                      <a href="#/clients?client=${r.client_id}" style="text-decoration:none">${r.first_name} ${r.last_name}</a>
                      ${renderUsDeadlinePill(r.next_review_date, { warnDays: 30 })}
                    </div>
                    <div class="tk-row__meta">
                      <span>AUM: <strong style="color:var(--k-text)">${money(r.current_aum_cents, { currency: cur })}</strong></span>
                      <span>Annual Fee: <strong style="color:var(--us-oxford)">${money(r.current_annual_fee_cents, { currency: cur })}</strong></span>
                      <span>Due: <strong>${fmtDayNear(r.next_review_date)}</strong> (${fmtDay(r.next_review_date)})</span>
                    </div>
                  </div>
                  <div class="tk-row__aside">
                    <a href="#/clients?client=${r.client_id}" class="k-btn k-btn--sm">Open File →</a>
                  </div>
                </div>`) : emptyState({ iconName: 'calendar', title: 'No reviews overdue', text: 'All annual household reviews are scheduled more than 30 days ahead.' })}
            </div>
          </section>
        </div>

        <aside class="us-rail-panel" aria-label="Pending Form CRS, Vault Expiries and ADV Fee Rail">
          <section class="us-rail-card">
            <div class="us-rail-card__head">
              <span class="us-rail-card__title">${icon('shield', { size: 14 })} SEC Form CRS Queue</span>
              <span class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">${compliance.crsSigned}/${clients.length} Signed</span>
            </div>
            ${crsPending.length ? html`
              <div class="us-rail-list">
                ${crsPending.map((c) => html`
                  <div class="us-rail-item" data-key="crs-${c.id}">
                    <div class="us-rail-item__top">
                      <div>
                        <div class="us-rail-item__name">${c.first_name} ${c.last_name}</div>
                        <div class="us-rail-item__sub">${c.onboarding_stage} · ${c.advisor_name || 'Advisor'}</div>
                      </div>
                      <span class="us-status-pill us-status-pill--bad"><span class="us-status-pill__dot"></span>Pending</span>
                    </div>
                    <div class="us-rail-item__foot">
                      ${renderInvestorTierPill(c, { compact: true })}
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="desk-sign-crs" data-id="${c.id}" data-signer="${c.first_name} ${c.last_name}">Record CRS ✓</button>
                    </div>
                  </div>`)}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">100% of households have signed Form CRS ✓</div>`}
          </section>

          <section class="us-rail-card">
            <div class="us-rail-card__head">
              <span class="us-rail-card__title">${icon('alert', { size: 14 })} Rule 204-2 Vault Expiries</span>
              <a href="#/vault" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Vault (${expiringDocs.length})</a>
            </div>
            ${expiringDocs.length ? html`
              <div class="us-rail-list">
                ${expiringDocs.slice(0, 4).map((doc) => html`
                  <div class="us-rail-item" data-key="udoc-${doc.id}">
                    <div class="us-rail-item__top">
                      <div>
                        <div class="us-rail-item__name">${doc.document_name}</div>
                        <div class="us-rail-item__sub">${doc.first_name} ${doc.last_name} · ${doc.document_type}</div>
                      </div>
                      ${renderUsDeadlinePill(doc.expiry_date, { warnDays: 30 })}
                    </div>
                    <div class="us-rail-item__foot">
                      <span class="tk-muted" style="font-size:11.5px">Exp: ${fmtDay(doc.expiry_date)}</span>
                      <a href="#/vault" class="k-btn k-btn--ghost k-btn--sm">Vault →</a>
                    </div>
                  </div>`)}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No vault documents expiring in 30 days ✓</div>`}
          </section>

          <section class="us-rail-card">
            <div class="us-rail-card__head">
              <span class="us-rail-card__title">${icon('dollar', { size: 14 })} ADV Fee Run-Rate</span>
              <a href="#/fees" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Calc</a>
            </div>
            <div>
              <div class="us-pulse-row">
                <div class="us-pulse-row__top">
                  <span>Annualized Advisory Fees</span>
                  <strong style="color:var(--us-oxford)">${money(annualFeeRunRate, { currency: cur })}</strong>
                </div>
                <div class="us-rail-item__sub">Quarterly billing: <strong>${money(qtrFeeRunRate, { currency: cur })}</strong> (${deskFees.length} schedule${deskFees.length === 1 ? '' : 's'})</div>
              </div>
              ${deskFees.slice(0, 3).map((f) => html`
                <div class="us-pulse-row">
                  <div class="us-pulse-row__top">
                    <span>${f.first_name} ${f.last_name}</span>
                    <strong>${money(f.quarterly_fee_cents, { currency: cur })}/qtr</strong>
                  </div>
                  <div class="us-rail-item__sub">${f.fee_tier} · ${f.effective_bps} bps on ${money(f.account_value_cents, { currency: cur })}</div>
                </div>`)}
            </div>
          </section>
        </aside>
      </div>`}`;
}

export function wireDeskActions(root, state, { loadScreen }) {
  on(root, 'click', '[data-action="desk-new-client"]', async () => {
    const res = await formDialog({
      title: 'Onboard US Advisory Client',
      submitLabel: 'Create Advisory File',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">First Name</span><input class="k-input" name="first_name" required></label>
          <label class="k-field"><span class="k-field__label">Last Name</span><input class="k-input" name="last_name" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email"></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" placeholder="(212) 555-0100"></label>
          <label class="k-field"><span class="k-field__label">Onboarding Stage</span>
            <select class="k-input" name="onboarding_stage">${STAGES.map((st) => html`<option value="${st}">${st}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Annual Income (USD)</span><input class="k-input" type="number" step="5000" min="0" name="annual_income" value="350000"></label>
          <label class="k-field"><span class="k-field__label">Net Worth (USD)</span><input class="k-input" type="number" step="25000" min="0" name="net_worth" value="2500000"></label>
          <label class="k-field"><span class="k-field__label">Liquid Net Worth (USD)</span><input class="k-input" type="number" step="25000" min="0" name="liquid_net_worth" value="1500000"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Time Horizon (yrs)</span><input class="k-input" type="number" min="1" max="30" name="time_horizon" value="15"></label>
          <label class="k-field"><span class="k-field__label">Risk Tolerance (1–10)</span><input class="k-input" type="number" min="1" max="10" name="risk_tolerance" value="6"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Advisor Notes</span><textarea class="k-input" name="notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/clients', v),
    });
    if (res && res.client) {
      toast.success(`Onboarded ${res.client.first_name} ${res.client.last_name}.`);
      await loadScreen('/');
    }
  });

  on(root, 'click', '[data-action="desk-advance-stage"]', async (e, el) => {
    try {
      await api.post('/api/clients/stage', { id: Number(el.dataset.id), onboarding_stage: el.dataset.stage });
      toast.success(`Household moved to ${el.dataset.stage}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="desk-acat-settle"]', async (e, el) => {
    try { await api.post('/api/acats/status', { id: Number(el.dataset.id), status: 'Settled' }); toast.success('ACAT transfer marked Settled.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="desk-roll-fund"]', async (e, el) => {
    try { await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: 'Funded' }); toast.success('IRA / 401(k) rollover marked Funded.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="desk-sign-crs"]', async (e, el) => {
    try {
      await api.post('/api/clients/crs', { id: Number(el.dataset.id), client_signature: el.dataset.signer });
      toast.success('SEC Form CRS acknowledgement recorded.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
}
