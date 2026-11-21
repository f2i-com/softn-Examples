// Estate Continuity (Beneficiary Designations & Power of Attorney) + Annual Reviews & SEC Rule 204-2 Document Vault:
// Unified Oxford Navy & Champagne Brass Mastheads, 100%-validated Beneficiary Cards, Notarized POA Cards,
// Monogrammed Annual Review Cards with Goal Progress bars & Document Vault Cards.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, addMonths, daysBetween } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { renderUsDeadlinePill } from '../us_ui.js';

const BEN_RELS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Trust', 'Estate', 'Charity', 'Other'];
const POA_POWERS = ['Financial', 'Healthcare', 'Real Estate', 'Legal', 'All'];
const LIFE_CHANGES = ['Marriage', 'Divorce', 'New Child', 'Retirement', 'Job Change', 'Inheritance', 'None'];
const DOC_TYPES = ['Tax Return', 'Legal Document', 'Statement', 'Insurance', 'Form CRS', 'W-9 Certification', 'ID Verification', 'Other'];

export function renderEstateView(state) {
  const d = state.benDraft;
  const sum = Math.round(d.primaries.reduce((acc, b) => acc + (Number(b.percentage) || 0), 0) * 100) / 100;
  const sumOk = Math.abs(sum - 100) < 0.001;
  const sumOver = sum > 100.001;
  const sumTone = sumOk ? 'us-alloc-meter--ok' : (sum > 0 && !sumOver) ? 'us-alloc-meter--warn' : 'us-alloc-meter--bad';
  const diff = Math.round(Math.abs(100 - sum) * 100) / 100;
  const loadingBen = state.loading && !state.beneficiaries.length;
  const loadingPoa = state.loading && !state.poas.length;

  const activePoas = state.poas.filter((p) => p.status === 'Active').length;
  const notarizedPoas = state.poas.filter((p) => p.notarized).length;

  return html`
    <section class="us-masthead" aria-label="Beneficiary Designations and Power of Attorney">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('us-trust', { size: 12 })} ESTATE CONTINUITY · FIDUCIARY AUTHORITY
        </div>
        <h1 class="us-masthead__title">Estate &amp; Power of Attorney</h1>
        <div class="us-masthead__meta">
          <span>Strict 100% retirement &amp; TOD beneficiary splits</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Notarized durable financial &amp; legal POAs</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--brass">
          <span class="us-pod__lbl">${icon('shield-check', { size: 12 })} Designations</span>
          <span class="us-pod__val">${state.beneficiaries.length}</span>
          <span class="us-pod__sub">100% validated</span>
        </div>

        <div class="us-pod">
          <span class="us-pod__lbl">${icon('file', { size: 12 })} Active POAs</span>
          <span class="us-pod__val">${activePoas}</span>
          <span class="us-pod__sub">${notarizedPoas} notarized</span>
        </div>

        <button type="button" class="k-btn us-btn-brass" data-action="us-poa-new">${icon('plus', { size: 15 })} Record POA</button>
      </div>
    </section>

    <div class="us-tabs">
      <div class="tk-segmented" role="tablist" aria-label="Estate tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.estateTab === 'beneficiaries' })}" data-action="us-est-tab" data-tab="beneficiaries">Beneficiaries (${state.beneficiaries.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.estateTab === 'poas' })}" data-action="us-est-tab" data-tab="poas">Power of Attorney (${state.poas.length})</button>
      </div>
    </div>

    ${state.estateTab === 'beneficiaries' ? html`
      <div class="tk-grid-2">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('us-trust', { size: 17 })} New Beneficiary Designation</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="us-save-ben" novalidate>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Client Household</span>
                  <select class="k-input" data-usben="client_id">
                    ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`)}
                  </select>
                </label>
                <label class="k-field"><span class="k-field__label">Account Name / Number</span>
                  <input class="k-input" value="${d.account_label}" placeholder="e.g. Schwab Roth IRA #..." data-usben="account_label" required>
                </label>
              </div>
              <div class="k-field">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                  <span class="k-field__label">Primary Beneficiaries</span>
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="us-ben-split">${d.primaries.length > 1 ? 'Split Evenly' : 'Set 100%'}</button>
                    <button type="button" class="k-btn k-btn--sm" data-action="us-ben-add">${icon('plus', { size: 14 })} Add Beneficiary</button>
                  </div>
                </div>
                <div class="tk-stack" style="gap:8px;margin-top:6px">
                  ${d.primaries.map((b, idx) => html`
                    <div class="us-ben-row" data-key="uben-${idx}">
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">Name</span><input class="k-input" value="${b.name}" data-uben-idx="${idx}" data-uben-key="name" placeholder="Full name"></label>
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">Relationship</span>
                        <select class="k-input" data-uben-idx="${idx}" data-uben-key="relationship">
                          ${BEN_RELS.map((r) => html`<option value="${r}" ${r === b.relationship ? 'selected' : ''}>${r}</option>`)}
                        </select>
                      </label>
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">Share %</span><input class="k-input" type="number" step="1" min="0" max="100" value="${b.percentage}" data-uben-idx="${idx}" data-uben-key="percentage"></label>
                      ${d.primaries.length > 1 ? html`<button type="button" class="k-icon-btn tk-danger" data-action="us-ben-rm" data-idx="${idx}" aria-label="Remove">${icon('trash', { size: 16 })}</button>` : html`<span></span>`}
                    </div>`)}
                </div>
              </div>

              <div class="us-alloc-meter ${sumTone}">
                <div class="us-alloc-meter__top">
                  <span>Primary Beneficiary Allocation Meter</span>
                  <span class="us-alloc-meter__pct">${sum}% / 100%</span>
                </div>
                <div class="us-alloc-meter__track" role="progressbar" aria-valuenow="${Math.min(100, Math.max(0, sum))}" aria-valuemin="0" aria-valuemax="100">
                  ${d.primaries.map((b) => {
                    const pct = Math.max(0, Number(b.percentage) || 0);
                    const width = sum > 100 ? (pct / sum) * 100 : Math.min(100, pct);
                    return pct > 0 ? html`<div class="us-alloc-meter__seg" style="width:${width}%" title="${b.name || 'Beneficiary'}: ${pct}%"></div>` : '';
                  })}
                </div>
                <div class="us-alloc-meter__foot">
                  <span>
                    ${sumOk
                      ? '✓ Exactly 100% allocated — ready for custodian submission.'
                      : sumOver
                        ? `Over-allocated by ${diff}% — reduce shares so total equals 100%.`
                        : `${diff}% unallocated — assign remaining percentage to reach 100%.`}
                  </span>
                  <span>${d.primaries.length} beneficiar${d.primaries.length === 1 ? 'y' : 'ies'}</span>
                </div>
              </div>

              <div class="k-form__actions">
                <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Record Beneficiary Designation</button>
              </div>
            </form>
          </div>
        </section>

        <div class="us-card-list">
          ${loadingBen ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.beneficiaries.length ? state.beneficiaries.map((b) => html`
            <article class="us-rec-card us-rec-card--ok" data-key="bn-${b.id}">
              <div class="us-rec-card__top">
                <div class="us-rec-card__id">
                  <span class="us-monogram us-monogram--sm">${initials(`${b.first_name} ${b.last_name}`)}</span>
                  <div style="min-width:0;display:grid;gap:4px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                      <strong style="font-size:15px">${b.first_name} ${b.last_name}</strong>
                      <span class="us-status-pill us-status-pill--ok"><span class="us-status-pill__dot"></span>100% Validated</span>
                      ${b.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-muted" style="font-size:12.5px"><strong>${b.account_label}</strong> · Effective ${fmtDay(b.effective_date)}</div>
                  </div>
                </div>
                <div class="us-rec-card__aside">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-ben-del" data-id="${b.id}">Delete</button>
                </div>
              </div>
              <div class="us-ben-chips">
                ${(b.primary_beneficiaries || []).map((p) => html`
                  <span class="us-ben-chip">${p.name} (${p.relationship}) <strong>${p.percentage}%</strong></span>`)}
              </div>
              ${b.notes ? html`<div class="tk-muted" style="font-size:12.5px">${b.notes}</div>` : ''}
            </article>`) : emptyState({ iconName: 'us-trust', title: 'No designations yet', text: 'Create a 100%-validated beneficiary designation on the left.' })}
        </div>
      </div>` : html`
      ${loadingPoa ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.poas.length ? html`
        <div class="us-card-list">
          ${state.poas.map((p) => html`
            <article class="us-rec-card ${p.status === 'Active' ? 'us-rec-card--ok' : p.status === 'Revoked' ? 'us-rec-card--muted' : 'us-rec-card--warn'}" data-key="poa-${p.id}">
              <div class="us-rec-card__top">
                <div class="us-rec-card__id">
                  <span class="us-monogram us-monogram--sm ${p.notarized ? 'us-monogram--brass' : ''}">${initials(p.principal_name)}</span>
                  <div style="min-width:0;display:grid;gap:5px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                      <span class="us-status-pill ${p.status === 'Active' ? 'us-status-pill--ok' : p.status === 'Revoked' ? 'us-status-pill--bad' : 'us-status-pill--warn'}"><span class="us-status-pill__dot"></span>${p.status}</span>
                      ${p.notarized ? html`<span class="us-bronze-badge">Notarized Seal</span>` : ''}
                      ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="us-route-pill">
                      <span>Principal: <strong>${p.principal_name}</strong></span>
                      ${icon('arrow-right', { size: 13 })}
                      <span>Agent: <strong>${p.agent_name}</strong></span>
                    </div>
                  </div>
                </div>
                <div class="us-rec-card__aside">
                  <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="us-poa-status" data-id="${p.id}" aria-label="POA status">
                    ${['Active', 'Pending Notary', 'Revoked'].map((st) => html`<option value="${st}" ${st === p.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-poa-del" data-id="${p.id}">Delete</button>
                </div>
              </div>
              <div class="us-ben-chips">
                ${(p.powers_granted || []).map((pw) => html`<span class="tk-tag tk-tag--accent">${pw}</span>`)}
              </div>
              <div class="us-rec-card__meta">
                <span>Witnesses: <strong>${p.witness_1_name}</strong> &amp; <strong>${p.witness_2_name}</strong></span>
                <span>Effective: ${fmtDay(p.effective_date)}</span>
              </div>
            </article>`)}
        </div>` : emptyState({ iconName: 'file', title: 'No POA records', text: 'Record durable financial or legal Powers of Attorney with witness & notary status.' })}`}`;
}

export function renderVaultView(state) {
  const cur = state.session.settings.currency || 'USD';
  const docs = state.docFilter === 'All'
    ? state.documents
    : state.docFilter === 'Expiring'
      ? state.documents.filter((d) => d.doc_status === 'Expired' || d.doc_status === 'Expiring Soon')
      : state.documents.filter((d) => d.document_type === state.docFilter);
  const loadingRev = state.loading && !state.reviews.length;
  const loadingDoc = state.loading && !state.documents.length;

  const reviewsDueCount = state.reviews.filter((r) => r.next_review_date && daysBetween(today(), r.next_review_date) <= 30).length;
  const expiringDocsCount = state.documents.filter((d) => d.doc_status === 'Expired' || d.doc_status === 'Expiring Soon').length;
  const currentDocs = Math.max(0, state.documents.length - expiringDocsCount);
  const vaultPct = state.documents.length ? Math.round((currentDocs / state.documents.length) * 100) : 100;

  return html`
    <section class="us-masthead" aria-label="Annual Reviews and SEC Rule 204-2 Document Vault">
      <div class="us-masthead__copy">
        <div class="us-masthead__eyebrow">
          ${icon('folder', { size: 12 })} SEC BOOKS &amp; RECORDS · RULE 204-2
        </div>
        <h1 class="us-masthead__title">Reviews &amp; Document Vault</h1>
        <div class="us-masthead__meta">
          <span>Annual household reviews &amp; goal tracking</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>CIP IDs, Form CRS receipts, W-9s &amp; tax filings</span>
        </div>
      </div>

      <div class="us-masthead__pods" style="align-items:center">
        <div class="us-pod us-pod--ring us-pod--brass" aria-label="Vault standing ${vaultPct}%">
          <div class="tk-ring" style="--p:${vaultPct}%;--ring-color:${vaultPct >= 80 ? '#34d399' : '#e4be7e'};--ring-size:48px">
            <span class="tk-ring__val">${vaultPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="us-pod__lbl">Vault Standing</span>
            <span class="us-pod__val" style="font-size:16px">${currentDocs}/${state.documents.length}</span>
            <span class="us-pod__sub">Current records</span>
          </div>
        </div>

        <div class="${cls('us-pod', { 'us-pod--alert': reviewsDueCount > 0 })}">
          <span class="us-pod__lbl">${icon('calendar', { size: 12 })} Reviews 30d</span>
          <span class="us-pod__val">${reviewsDueCount}</span>
          <span class="us-pod__sub">${state.reviews.length} total logged</span>
        </div>

        <div class="${cls('us-pod', { 'us-pod--alert': expiringDocsCount > 0 })}">
          <span class="us-pod__lbl">${icon('alert', { size: 12 })} Expiring Docs</span>
          <span class="us-pod__val">${expiringDocsCount}</span>
          <span class="us-pod__sub">${expiringDocsCount > 0 ? 'Refresh required' : 'All current'}</span>
        </div>

        <div class="us-masthead__cta-group">
          <button type="button" class="k-btn us-btn-ghost-dark" data-action="us-doc-new">${icon('plus', { size: 15 })} Vault Doc</button>
          <button type="button" class="k-btn us-btn-brass" data-action="us-rev-new">${icon('calendar', { size: 15 })} Log Review</button>
        </div>
      </div>
    </section>

    <div class="us-tabs">
      <div class="tk-segmented" role="tablist" aria-label="Reviews and vault tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.vaultTab === 'reviews' })}" data-action="us-vlt-tab" data-tab="reviews">Annual Client Reviews (${state.reviews.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.vaultTab === 'docs' })}" data-action="us-vlt-tab" data-tab="docs">Document Vault (${state.documents.length})</button>
      </div>
    </div>

    ${state.vaultTab === 'reviews' ? html`
      ${loadingRev ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.reviews.length ? html`
        <div class="us-card-list">
          ${state.reviews.map((r) => {
            const goalPct = Math.min(100, Math.max(0, Number(r.goal_progress || 0) * 10));
            const isDueSoon = r.next_review_date && daysBetween(today(), r.next_review_date) <= 30;
            return html`
              <article class="us-rec-card ${isDueSoon ? 'us-rec-card--warn' : 'us-rec-card--ok'}" data-key="ur-${r.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${r.first_name} ${r.last_name}</strong>
                        ${renderUsDeadlinePill(r.next_review_date, { warnDays: 30, prefix: 'Next' })}
                        <span class="tk-tag tk-tag--ok">Goal ${r.goal_progress}/10</span>
                        ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="us-rec-card__meta">
                        <span>Reviewed: <strong>${fmtDay(r.review_date)}</strong></span>
                        <span>Next Due: <strong style="color:var(--k-text)">${fmtDay(r.next_review_date)}</strong></span>
                        <span>AUM: <strong style="color:var(--us-oxford)">${money(r.current_aum_cents, { currency: cur })}</strong></span>
                        <span>Est. Fee: ${money(r.current_annual_fee_cents, { currency: cur })}</span>
                      </div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-rev-del" data-id="${r.id}">Delete</button>
                  </div>
                </div>
                <div style="display:grid;gap:4px;max-width:340px">
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--k-muted)">
                    <span>Household Plan Progress</span>
                    <span style="color:var(--us-oxford)">${r.goal_progress} / 10</span>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${goalPct >= 70 ? 'tk-bar__fill--ok' : 'tk-bar__fill--warn'}" style="width:${goalPct}%"></div></div>
                </div>
                ${r.advisor_notes ? html`<div class="tk-muted" style="font-size:13px;line-height:1.45">${r.advisor_notes}</div>` : ''}
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'calendar', title: 'No annual reviews yet', text: 'Log your first household review.' })}` : html`
      <div class="tk-toolbar">
        <div class="tk-segmented" role="tablist" aria-label="Filter vault documents">
          ${[
            ['All', `All (${state.documents.length})`],
            ['Expiring', `Expiring (${expiringDocsCount})`],
            ['Form CRS', 'Form CRS'],
            ['W-9 Certification', 'W-9'],
            ['ID Verification', 'CIP ID'],
            ['Tax Return', 'Tax'],
            ['Legal Document', 'Legal'],
          ].map(([f, lbl]) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.docFilter === f })}" data-action="us-doc-filter" data-filter="${f}">${lbl}</button>`)}
        </div>
      </div>

      ${loadingDoc ? html`<section class="tk-sheet">${skeleton(3)}</section>` : docs.length ? html`
        <div class="us-card-list">
          ${docs.map((d) => {
            const tone = d.doc_status === 'Expired' ? 'us-rec-card--bad' : d.doc_status === 'Expiring Soon' ? 'us-rec-card--warn' : 'us-rec-card--ok';
            return html`
              <article class="us-rec-card ${tone}" data-key="ud-${d.id}">
                <div class="us-rec-card__top">
                  <div class="us-rec-card__id">
                    <span class="us-monogram us-monogram--sm">${initials(`${d.first_name} ${d.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15px">${d.document_name}</strong>
                        ${renderUsDeadlinePill(d.expiry_date, { warnDays: 30 })}
                        <span class="tk-tag">${d.document_type}</span>
                        ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="us-rec-card__meta">
                        <span>Household: <strong style="color:var(--k-text)">${d.first_name} ${d.last_name}</strong></span>
                        ${d.reference_code ? html`<span class="us-ref">${d.reference_code}</span>` : ''}
                        <span>Expiry: <strong>${d.expiry_date ? fmtDay(d.expiry_date) : 'No expiry'}</strong></span>
                      </div>
                    </div>
                  </div>
                  <div class="us-rec-card__aside">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="us-doc-del" data-id="${d.id}">Delete</button>
                  </div>
                </div>
                ${d.notes ? html`<div class="tk-muted" style="font-size:13px">${d.notes}</div>` : ''}
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'folder', title: 'No vault documents match', text: 'Store compliance documents with expiry date reminders.' })}`}`;
}

export function wireEstateVaultActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="us-est-tab"]', (e, el) => { state.estateTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="us-vlt-tab"]', (e, el) => { state.vaultTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="us-doc-filter"]', (e, el) => { state.docFilter = el.dataset.filter; draw(); });

  on(root, 'input', '[data-usben]', (e, el) => { state.benDraft[el.dataset.usben] = el.value; });
  on(root, 'change', '[data-usben]', (e, el) => { state.benDraft[el.dataset.usben] = el.value; draw(); });
  on(root, 'input', '[data-uben-idx]', (e, el) => {
    const idx = Number(el.dataset.ubenIdx), key = el.dataset.ubenKey;
    if (state.benDraft.primaries[idx]) {
      state.benDraft.primaries[idx][key] = key === 'percentage' ? Number(el.value) : el.value;
      if (key === 'percentage') draw();
    }
  });
  on(root, 'change', '[data-uben-idx]', (e, el) => {
    const idx = Number(el.dataset.ubenIdx), key = el.dataset.ubenKey;
    if (state.benDraft.primaries[idx]) state.benDraft.primaries[idx][key] = key === 'percentage' ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'click', '[data-action="us-ben-add"]', () => {
    const currentSum = state.benDraft.primaries.reduce((acc, b) => acc + (Number(b.percentage) || 0), 0);
    const rem = Math.max(0, Math.round((100 - currentSum) * 100) / 100);
    state.benDraft.primaries.push({ name: '', relationship: 'Child', percentage: rem });
    draw();
  });
  on(root, 'click', '[data-action="us-ben-split"]', () => {
    const list = state.benDraft.primaries;
    if (!list.length) return;
    const base = Math.floor(100 / list.length);
    const rem = 100 - base * list.length;
    list.forEach((b, i) => { b.percentage = base + (i === 0 ? rem : 0); });
    draw();
  });
  on(root, 'click', '[data-action="us-ben-rm"]', (e, el) => { state.benDraft.primaries.splice(Number(el.dataset.idx), 1); draw(); });

  on(root, 'submit', 'form[data-form="us-save-ben"]', async (e) => {
    e.preventDefault();
    try {
      const d = state.benDraft;
      await api.post('/api/beneficiaries', {
        client_id: Number(d.client_id),
        account_label: d.account_label,
        primary_beneficiaries: d.primaries,
        effective_date: d.effective_date || today(),
      });
      toast.success('Beneficiary designation recorded (100% validated).');
      state.benDraft.account_label = '';
      state.benDraft.primaries = [{ name: '', relationship: 'Spouse', percentage: 100 }];
      await loadScreen('/estate');
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-ben-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete designation?', message: 'Remove this beneficiary record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/beneficiaries', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/estate'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-poa-new"]', async () => {
    const made = await formDialog({
      title: 'Record Power of Attorney',
      submitLabel: 'Save POA',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Principal Name</span><input class="k-input" name="principal_name" required></label>
          <label class="k-field"><span class="k-field__label">Agent / Attorney-in-Fact</span><input class="k-input" name="agent_name" required></label>
        </div>
        <div class="k-field">
          <span class="k-field__label">Powers Granted</span>
          <div style="display:flex;flex-wrap:wrap;gap:10px">${POA_POWERS.map((p) => html`<label class="k-check"><input type="checkbox" name="powers_granted" value="${p}" ${p === 'Financial' ? 'checked' : ''}><span>${p}</span></label>`)}</div>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Witness 1</span><input class="k-input" name="witness_1_name" required></label>
          <label class="k-field"><span class="k-field__label">Witness 2</span><input class="k-input" name="witness_2_name" required></label>
        </div>
        <label class="k-check"><input type="checkbox" name="notarized" checked><span>Notarized document verified on file</span></label>`,
      onSubmit: (v) => api.post('/api/poas', { ...v, client_id: Number(v.client_id), powers_granted: Array.isArray(v.powers_granted) ? v.powers_granted : [], effective_date: today() }),
    });
    if (made) { state.estateTab = 'poas'; toast.success('Power of Attorney recorded.'); await loadScreen('/estate'); }
  });
  on(root, 'change', '[data-action="us-poa-status"]', async (e, el) => {
    try { await api.post('/api/poas/status', { id: Number(el.dataset.id), status: el.value }); toast.success('POA status updated.'); await loadScreen('/estate'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="us-poa-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete POA?', message: 'Remove this Power of Attorney?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/poas', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/estate'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-rev-new"]', async () => {
    const made = await formDialog({
      title: 'Log Annual Household Review',
      submitLabel: 'Save Review',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Review Date</span><input class="k-input" type="date" name="review_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Next Review Date</span><input class="k-input" type="date" name="next_review_date" value="${addMonths(today(), 12)}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Current AUM (USD)</span><input class="k-input" type="number" step="5000" min="0" name="current_aum" required></label>
          <label class="k-field"><span class="k-field__label">Goal Progress (1–10)</span><input class="k-input" type="number" min="1" max="10" name="goal_progress" value="8"></label>
          <label class="k-field"><span class="k-field__label">Updated Risk Tolerance</span><input class="k-input" type="number" min="1" max="10" name="updated_risk_tolerance" value="6"></label>
        </div>
        <div class="k-field"><span class="k-field__label">Life Changes</span>
          <div style="display:flex;flex-wrap:wrap;gap:10px">${LIFE_CHANGES.map((lc) => html`<label class="k-check"><input type="checkbox" name="life_changes" value="${lc}"><span>${lc}</span></label>`)}</div>
        </div>
        <label class="k-field"><span class="k-field__label">Advisor Notes</span><textarea class="k-input" name="advisor_notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/reviews', { ...v, client_id: Number(v.client_id), life_changes: Array.isArray(v.life_changes) ? v.life_changes : [] }),
    });
    if (made) { state.vaultTab = 'reviews'; toast.success('Annual review recorded.'); await loadScreen('/vault'); }
  });
  on(root, 'click', '[data-action="us-rev-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete review?', message: 'Remove this annual review?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/reviews', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/vault'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="us-doc-new"]', async () => {
    const made = await formDialog({
      title: 'Add Document to Vault',
      submitLabel: 'Save Document',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span><select class="k-input" name="client_id" required>${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}</select></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Document Type</span><select class="k-input" name="document_type">${DOC_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Ref Code</span><input class="k-input" name="reference_code"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Document Name</span><input class="k-input" name="document_name" required></label>
        <label class="k-field"><span class="k-field__label">Expiry Date</span><input class="k-input" type="date" name="expiry_date"></label>`,
      onSubmit: (v) => api.post('/api/documents', { ...v, client_id: Number(v.client_id), today: today() }),
    });
    if (made) { state.vaultTab = 'docs'; toast.success('Document added.'); await loadScreen('/vault'); }
  });
  on(root, 'click', '[data-action="us-doc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete document?', message: 'Remove this vault document?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/documents', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/vault'); }
    catch (err) { toastError(err); }
  });
}
