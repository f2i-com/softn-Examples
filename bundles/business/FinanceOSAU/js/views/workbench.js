// AFSL Advisory Workbench: Private Bank Forest-Emerald & Sovereign Gold Masthead with Compliance Ring,
// Two-Column Command Split (5-Stage Advice Pipeline + Pending FDS/Vault Dockets on left;
// Sticky Operational Rail for Annual Reviews, Fee Consents & Super/CHESS Transfers on right).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { fmtDay, fmtDayNear } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';
import {
  renderClientClassPill,
  renderRiskBandMeter,
  renderFsgPill,
  renderFdsOptInPill,
  deadlineMeta,
  renderStatusPill,
} from '../au_ui.js';

const STAGES = ['Prospect', 'Fact Find', 'SOA Prep', 'Active', 'Review Due'];

function computeComplianceHealth(clients, counts) {
  const totalClients = clients.length;
  const fsgSigned = clients.filter((c) => c.fsg_acknowledged).length;
  const pendingFds = Number(counts.pendingConsents || 0);
  const dueReviews = Number(counts.reviewsDue || 0);
  const expiringItems = Number(counts.docsExpiring || 0) + Number(counts.bdbnExpiring || 0);
  if (!totalClients) {
    return { pct: 100, color: '#34d399', label: 'Audit Ready', sub: 'No open items', fsgSigned: 0 };
  }
  const checks = totalClients * 3;
  const issues = (totalClients - fsgSigned) + pendingFds + dueReviews + expiringItems;
  const pct = Math.max(0, Math.min(100, Math.round(((checks - Math.min(checks, issues)) / Math.max(1, checks)) * 100)));
  const color = pct >= 85 ? '#34d399' : pct >= 65 ? '#e8c26f' : '#f87171';
  const label = pct >= 85 ? 'Strong' : pct >= 65 ? 'Attention' : 'Action Due';
  const sub = `${fsgSigned}/${totalClients} FSG · ${pendingFds} FDS`;
  return { pct, color, label, sub, fsgSigned };
}

export function renderWorkbenchView(state) {
  const wb = state.workbench;
  const settings = state.session.settings || {};
  const currency = settings.currency || 'AUD';
  const counts = (wb && wb.counts) || state.session.counts || {};
  const clients = (wb && wb.clients) || [];
  const reviewsDue = (wb && wb.reviewsDue) || [];
  const pendingFees = (wb && wb.pendingFees) || [];
  const expiringDocs = (wb && wb.expiringDocs) || [];
  const expiringBdbns = (wb && wb.expiringBdbns) || [];
  const openTransfers = (wb && wb.openTransfers) || [];
  const activeRollovers = (state.wbRollovers || []).filter((r) => r.status === 'Initiated' || r.status === 'Awaiting Fund');
  const initialLoad = state.loading && !wb;
  const health = computeComplianceHealth(clients, counts);
  const statutoryDue = (counts.reviewsDue || 0) + (counts.docsExpiring || 0) + (counts.bdbnExpiring || 0);
  const fsgPct = clients.length ? Math.round((health.fsgSigned / clients.length) * 100) : 100;
  const inFlightValue = openTransfers.reduce((a, t) => a + Number(t.estimated_value_cents || 0), 0)
    + activeRollovers.reduce((a, r) => a + Number(r.estimated_balance_cents || 0), 0);

  return html`
    ${renderSampleBanner(counts.sampleCount || 0)}

    <section class="au-masthead" aria-label="AFSL Advisory Workbench">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${health.color}"></span>
          ${settings.afsl_number || 'AUSTRALIAN AFSL'} · PRIVATE WEALTH
        </div>
        <h1 class="au-masthead__title">AFSL Advisory Workbench</h1>
        <div class="au-masthead__meta">
          <span><strong style="color:#f6dc9c">${counts.clients || 0} client${counts.clients === 1 ? '' : 's'}</strong> (${counts.wholesaleClients || 0} s761G)</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>FSG, FDS Opt-In &amp; SIS Act oversight</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${openTransfers.length + activeRollovers.length} in-flight transition${openTransfers.length + activeRollovers.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--ring au-pod--gold" aria-label="Compliance standing ${health.pct}%">
          <div class="tk-ring" style="--p:${initialLoad ? 0 : health.pct}%;--ring-color:${health.color};--ring-size:48px">
            <span class="tk-ring__val">${initialLoad ? '…' : `${health.pct}%`}</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="au-pod__lbl">Compliance</span>
            <span class="au-pod__val" style="font-size:16px">${initialLoad ? 'Checking…' : health.label}</span>
            <span class="au-pod__sub">${initialLoad ? 'AFSL ledger' : health.sub}</span>
          </div>
        </div>

        <a href="#/fees" class="au-pod au-pod--gold au-pod--wide">
          <span class="au-pod__lbl">${icon('trending', { size: 12 })} Active FUM</span>
          <span class="au-pod__val au-pod__val--serif">${initialLoad ? '—' : money(counts.totalFumCents || 0, { currency })}</span>
          <span class="au-pod__sub">${counts.wholesaleClients || 0} Wholesale s761G →</span>
        </a>

        <a href="#/fees" class="${cls('au-pod', { 'au-pod--alert': (counts.pendingConsents || 0) > 0 })}">
          <span class="au-pod__lbl">${icon('receipt', { size: 12 })} FDS Opt-In</span>
          <span class="au-pod__val">${counts.pendingConsents || 0}</span>
          <span class="au-pod__sub">${(counts.pendingConsents || 0) > 0 ? 'Pending consent →' : 'All signed →'}</span>
        </a>

        <a href="#/reviews" class="${cls('au-pod', { 'au-pod--alert': statutoryDue > 0 })}">
          <span class="au-pod__lbl">${icon(statutoryDue > 0 ? 'alert' : 'shield-check', { size: 12 })} 30d Statutory</span>
          <span class="au-pod__val">${statutoryDue}</span>
          <span class="au-pod__sub">${counts.reviewsDue || 0} rev · ${(counts.docsExpiring || 0) + (counts.bdbnExpiring || 0)} exp →</span>
        </a>

        <button type="button" class="k-btn au-btn-gold" data-action="wb-new-client">${icon('plus', { size: 15 })} Onboard Client</button>
      </div>
    </section>

    ${initialLoad ? html`
      <section class="tk-sheet" style="margin-bottom:18px">${skeleton(4)}</section>
      <div class="au-cmd-split">
        <section class="tk-sheet">${skeleton(4)}</section>
        <section class="tk-sheet">${skeleton(4)}</section>
      </div>` : html`
      <section class="tk-sheet" style="margin-bottom:18px">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('layers', { size: 17 })} Client Onboarding &amp; Advice Pipeline</h2>
          <span class="tk-sheet__count">${clients.length} household${clients.length === 1 ? '' : 's'}</span>
          <div class="tk-sheet__actions">
            <a href="#/risk" class="k-btn k-btn--ghost k-btn--sm">${icon('scale', { size: 14 })} Risk Scorer</a>
            <a href="#/clients" class="k-btn k-btn--sm">All Files →</a>
          </div>
        </div>
        <div class="tk-sheet__body">
          <div class="au-pipeline-wrap">
            <div class="au-pipeline-mini">
              ${STAGES.map((stage, idx) => {
                const list = clients.filter((c) => c.onboarding_stage === stage);
                const nextStage = idx + 1 < STAGES.length ? STAGES[idx + 1] : null;
                return html`
                  <div class="au-stage-card au-stage-card--${idx + 1}" data-key="stage-${stage}">
                    <div class="au-stage-card__head">
                      <span>${stage}</span>
                      <span class="tk-tag">${list.length}</span>
                    </div>
                    ${list.length ? list.map((c) => html`
                      <div class="tk-ticket ${c.fsg_acknowledged ? '' : 'tk-ticket--warn'}" data-key="pipe-${c.id}">
                        <div class="tk-ticket__top">
                          <span class="au-monogram au-monogram--sm ${c.wholesale_status === 'Yes' ? 'au-monogram--gold' : ''}">${initials(`${c.first_name} ${c.last_name}`)}</span>
                          <a href="#/clients?client=${c.id}" class="au-ticket-name">${c.first_name} ${c.last_name}</a>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
                          ${renderClientClassPill(c.wholesale_status, { compact: true })}
                          ${renderFsgPill(c)}
                        </div>
                        ${renderRiskBandMeter(c.risk_score, { compact: true })}
                        <div class="tk-ticket__foot">
                          <a href="#/clients?client=${c.id}" class="k-btn k-btn--ghost k-btn--sm">File</a>
                          ${nextStage ? html`<button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="wb-advance-stage" data-id="${c.id}" data-stage="${nextStage}">→ ${nextStage}</button>` : ''}
                        </div>
                      </div>`) : html`<div class="tk-muted" style="font-size:12px;padding:6px 2px">No households</div>`}
                  </div>`;
              })}
            </div>
          </div>
        </div>
      </section>

      <div class="au-cmd-split">
        <div class="tk-stack">
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('receipt', { size: 17 })} Pending Ongoing Fee Consents (FDS)</h2>
              <span class="tk-sheet__count">${pendingFees.length}</span>
              <div class="tk-sheet__actions"><a href="#/fees" class="k-btn k-btn--ghost k-btn--sm">FDS Register →</a></div>
            </div>
            <div>
              ${pendingFees.length ? pendingFees.map((f) => html`
                <div class="tk-row" data-key="pf-${f.id}">
                  <div class="tk-row__main" style="gap:5px">
                    <div class="tk-row__title">
                      <span class="au-monogram au-monogram--sm">${initials(`${f.first_name} ${f.last_name}`)}</span>
                      <a href="#/clients?client=${f.client_id}" style="text-decoration:none">${f.first_name} ${f.last_name}</a>
                      ${renderFdsOptInPill(f)}
                    </div>
                    <div class="tk-row__meta">
                      <span>FUA: <strong style="color:var(--k-text)">${money(f.portfolio_value_cents, { currency })}</strong></span>
                      <span>Annual Fee: <strong style="color:var(--au-forest)">${money(f.calculated_annual_fee_cents, { currency })}</strong></span>
                      ${f.renewal_due_date ? html`<span>Renewal: <strong>${fmtDay(f.renewal_due_date)}</strong></span>` : ''}
                    </div>
                  </div>
                  <div class="tk-row__aside">
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="wb-approve-consent" data-id="${f.id}" data-signer="${f.first_name} ${f.last_name}">Record Consent ✓</button>
                  </div>
                </div>`) : emptyState({ iconName: 'check-circle', title: 'All FDS consents current', text: 'Every ongoing fee arrangement has active client opt-in consent.' })}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('alert', { size: 17 })} Expiring Document Vault &amp; AUSTRAC KYC</h2>
              <span class="tk-sheet__count">${expiringDocs.length}</span>
              <div class="tk-sheet__actions"><a href="#/reviews" class="k-btn k-btn--ghost k-btn--sm">Open Vault →</a></div>
            </div>
            <div>
              ${expiringDocs.length ? expiringDocs.map((d) => {
                const dm = deadlineMeta(d.expiry_date, { warnDays: 30 });
                return html`
                  <div class="tk-row" data-key="ed-${d.id}">
                    <div class="tk-row__main">
                      <div class="tk-row__title">
                        <span>${d.document_name}</span>
                        ${renderStatusPill(dm.tone, dm.label)}
                        <span class="tk-tag">${d.document_type}</span>
                      </div>
                      <div class="tk-row__meta">
                        <span><strong>${d.first_name} ${d.last_name}</strong></span>
                        ${d.reference_code ? html`<span class="au-ref">${d.reference_code}</span>` : ''}
                        <span>Expiry: <strong>${fmtDay(d.expiry_date)}</strong></span>
                      </div>
                    </div>
                  </div>`;
              }) : emptyState({ iconName: 'shield-check', title: 'Document Vault clear', text: 'No KYC IDs, SOAs, FSGs or tax records expiring within 30 days.' })}
            </div>
          </section>
        </div>

        <aside class="au-rail-panel" aria-label="Operational Review, Consent and Super Transfer Rail">
          <section class="au-rail-card">
            <div class="au-rail-card__head">
              <span class="au-rail-card__title">${icon('calendar', { size: 14 })} Reviews &amp; BDBN Renewals</span>
              <a href="#/reviews" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${reviewsDue.length + expiringBdbns.length})</a>
            </div>
            ${(reviewsDue.length || expiringBdbns.length) ? html`
              <div class="au-rail-list">
                ${reviewsDue.slice(0, 3).map((r) => {
                  const dm = deadlineMeta(r.next_review_date, { warnDays: 30, prefix: 'Review' });
                  return html`
                    <div class="au-rail-item" data-key="rail-rv-${r.id}">
                      <div class="au-rail-item__top">
                        <div>
                          <div class="au-rail-item__name">${r.first_name} ${r.last_name}</div>
                          <div class="au-rail-item__sub">Due ${fmtDayNear(r.next_review_date)} · ${money(r.current_portfolio_value_cents, { currency })}</div>
                        </div>
                        ${renderStatusPill(dm.tone, dm.label)}
                      </div>
                      <div class="au-rail-item__foot">
                        ${r.soa_required ? html`<span class="tk-tag tk-tag--warn">SOA Required</span>` : html`<span class="tk-tag tk-tag--ok">ROA Ready</span>`}
                        <a href="#/clients?client=${r.client_id}" class="k-btn k-btn--ghost k-btn--sm">Open File →</a>
                      </div>
                    </div>`;
                })}
                ${expiringBdbns.slice(0, 2).map((b) => {
                  const dm = deadlineMeta(b.expiry_date, { warnDays: 30, prefix: 'BDBN' });
                  return html`
                    <div class="au-rail-item" data-key="rail-bd-${b.id}">
                      <div class="au-rail-item__top">
                        <div>
                          <div class="au-rail-item__name">${b.first_name} ${b.last_name}</div>
                          <div class="au-rail-item__sub">${b.super_fund_name} · #${b.member_number}</div>
                        </div>
                        ${renderStatusPill(dm.tone, dm.label)}
                      </div>
                      <div class="au-rail-item__foot">
                        <span class="tk-muted" style="font-size:11.5px">3-yr SIS Reg 6.17A witness</span>
                        <a href="#/super" class="k-btn k-btn--sm">Renew BDBN</a>
                      </div>
                    </div>`;
                })}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No reviews or BDBNs due in 30 days ✓</div>`}
          </section>

          <section class="au-rail-card">
            <div class="au-rail-card__head">
              <span class="au-rail-card__title">${icon('au-transfer', { size: 14 })} Super &amp; CHESS Queue</span>
              <a href="#/transfers" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">${money(inFlightValue, { currency })}</a>
            </div>
            ${(openTransfers.length || activeRollovers.length) ? html`
              <div class="au-rail-list">
                ${openTransfers.slice(0, 3).map((t) => html`
                  <div class="au-rail-item" data-key="rail-omt-${t.id}">
                    <div class="au-rail-item__top">
                      <div>
                        <div class="au-rail-item__name">${t.first_name} ${t.last_name}</div>
                        <div class="au-rail-item__sub">${t.delivering_platform} · <span class="tk-mono">${t.hin_or_srn}</span></div>
                      </div>
                      <strong style="font-size:13.5px;font-variant-numeric:tabular-nums">${money(t.estimated_value_cents, { currency })}</strong>
                    </div>
                    <div class="au-rail-item__foot">
                      <span class="tk-tag tk-tag--info">${t.status}</span>
                      <button type="button" class="k-btn k-btn--sm" data-action="wb-omt-complete" data-id="${t.id}">Complete ✓</button>
                    </div>
                  </div>`)}
                ${activeRollovers.slice(0, 2).map((r) => html`
                  <div class="au-rail-item" data-key="rail-rl-${r.id}">
                    <div class="au-rail-item__top">
                      <div>
                        <div class="au-rail-item__name">${r.first_name} ${r.last_name}</div>
                        <div class="au-rail-item__sub">${r.from_fund_name} → ${r.to_fund_name}</div>
                      </div>
                      <strong style="font-size:13.5px;font-variant-numeric:tabular-nums">${money(r.estimated_balance_cents, { currency })}</strong>
                    </div>
                    <div class="au-rail-item__foot">
                      <span class="tk-tag tk-tag--warn">${r.status}</span>
                      <button type="button" class="k-btn k-btn--sm" data-action="wb-roll-complete" data-id="${r.id}">Mark Settled ✓</button>
                    </div>
                  </div>`)}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">No active super rollovers or CHESS transfers.</div>`}
          </section>

          <section class="au-rail-card">
            <div class="au-rail-card__head">
              <span class="au-rail-card__title">${icon('au-crest', { size: 14 })} AFSL Standing Pulse</span>
              <a href="#/clients" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Book</a>
            </div>
            <div>
              <div class="au-pulse-row">
                <div class="au-pulse-row__top">
                  <span>FSG Acknowledgements (s941A)</span>
                  <strong>${health.fsgSigned}/${clients.length} (${fsgPct}%)</strong>
                </div>
                <div class="tk-bar"><div class="tk-bar__fill ${fsgPct === 100 ? 'tk-bar__fill--ok' : 'tk-bar__fill--warn'}" style="width:${fsgPct}%"></div></div>
              </div>
              <div class="au-pulse-row">
                <div class="au-pulse-row__top">
                  <span>Wholesale s761G Book Share</span>
                  <strong>${counts.wholesaleClients || 0}/${counts.clients || 0}</strong>
                </div>
                <div class="tk-bar"><div class="tk-bar__fill" style="width:${clients.length ? Math.round(((counts.wholesaleClients || 0) / clients.length) * 100) : 0}%"></div></div>
              </div>
              <div class="au-pulse-row">
                <div class="au-pulse-row__top">
                  <span>Open Compliance Actions</span>
                  <strong class="${(counts.pendingConsents || 0) + statutoryDue > 0 ? 'tk-danger' : 'tk-ok'}">${(counts.pendingConsents || 0) + statutoryDue}</strong>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>`}`;
}

export function wireWorkbenchActions(root, state, { loadScreen }) {
  on(root, 'click', '[data-action="wb-new-client"]', async () => {
    const res = await formDialog({
      title: 'Onboard New Australian Advisory Client',
      submitLabel: 'Create Master Advice File',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">First Name</span><input class="k-input" name="first_name" required></label>
          <label class="k-field"><span class="k-field__label">Last Name</span><input class="k-input" name="last_name" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email"></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" placeholder="04XX XXX XXX"></label>
          <label class="k-field"><span class="k-field__label">Stage</span>
            <select class="k-input" name="onboarding_stage">${STAGES.map((st) => html`<option value="${st}">${st}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Annual Income (AUD)</span><input class="k-input" type="number" step="5000" min="0" name="annual_income" value="220000"></label>
          <label class="k-field"><span class="k-field__label">Net Assets (AUD)</span><input class="k-input" type="number" step="10000" min="0" name="net_assets" value="1450000"></label>
          <label class="k-field"><span class="k-field__label">Liquid Assets (AUD)</span><input class="k-input" type="number" step="10000" min="0" name="liquid_assets" value="600000"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Time Horizon (yrs)</span><input class="k-input" type="number" min="1" max="30" name="time_horizon" value="14"></label>
          <label class="k-field"><span class="k-field__label">Risk Tolerance (1–10)</span><input class="k-input" type="number" min="1" max="10" name="risk_tolerance" value="6"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Adviser Notes</span><textarea class="k-input" name="notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/clients', v),
    });
    if (res && res.client) {
      toast.success(`Onboarded ${res.client.first_name} ${res.client.last_name} (${res.client.wholesale_status === 'Yes' ? 'Wholesale s761G' : 'Retail'}).`);
      await loadScreen('/');
    }
  });

  on(root, 'click', '[data-action="wb-advance-stage"]', async (e, el) => {
    try {
      await api.post('/api/clients/stage', { id: Number(el.dataset.id), onboarding_stage: el.dataset.stage });
      toast.success(`Client moved to ${el.dataset.stage}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="wb-approve-consent"]', async (e, el) => {
    try {
      await api.post('/api/fees/consent', { id: Number(el.dataset.id), ongoing_fee_consent: 'yes', client_signer: el.dataset.signer });
      toast.success('Ongoing fee consent recorded.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="wb-omt-complete"]', async (e, el) => {
    try {
      await api.post('/api/transfers/status', { id: Number(el.dataset.id), status: 'Completed' });
      toast.success('CHESS off-market transfer marked Completed.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="wb-roll-complete"]', async (e, el) => {
    try {
      await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: 'Completed' });
      toast.success('Superannuation rollover marked Completed.');
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });
}
