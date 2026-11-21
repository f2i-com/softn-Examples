// Annual Client Reviews & Document Vault (AU): Unified Forest & Gold Masthead with Vault Standing Ring,
// monogrammed Annual Review Cards with Goal Progress bars & SOA triggers, and Document Vault Cards.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay, addMonths } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { deadlineMeta, renderStatusPill } from '../au_ui.js';

const LIFE_CHANGES = ['Marriage', 'Divorce', 'New Child', 'Retirement', 'Job Change', 'Inheritance', 'Superannuation Event', 'None'];
const DOC_TYPES = [
  'Statement of Advice',
  'Financial Services Guide',
  'Product Disclosure Statement',
  'ID Verification (AUSTRAC)',
  'TFN Declaration',
  'Tax Return',
  'Insurance Policy',
  'Superannuation Statement',
  'Other',
];

export function renderReviewsVaultView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const docs = state.docTypeFilter === 'All'
    ? state.documents
    : state.docTypeFilter === 'Expiring'
      ? state.documents.filter((d) => d.doc_status === 'Expired' || d.doc_status === 'Expiring Soon')
      : state.documents.filter((d) => d.document_type === state.docTypeFilter);
  const loadingReviews = state.loading && !state.reviews.length;
  const loadingDocs = state.loading && !state.documents.length;

  const reviewsDueCount = state.reviews.filter((r) => {
    const dm = deadlineMeta(r.next_review_date, { warnDays: 30 });
    return dm.state === 'overdue' || dm.state === 'due' || dm.state === 'soon';
  }).length;
  const expiringDocsCount = state.documents.filter((d) => d.doc_status === 'Expired' || d.doc_status === 'Expiring Soon').length;
  const currentDocs = Math.max(0, state.documents.length - expiringDocsCount);
  const vaultPct = state.documents.length ? Math.round((currentDocs / state.documents.length) * 100) : 100;

  return html`
    <section class="au-masthead" aria-label="Annual Reviews and Compliance Document Vault">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('folder', { size: 12 })} 7-YEAR AFSL RECORD-KEEPING · ONGOING ADVICE
        </div>
        <h1 class="au-masthead__title">Reviews &amp; Document Vault</h1>
        <div class="au-masthead__meta">
          <span>Annual reviews with automatic SOA triggers</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>AUSTRAC KYC, SOA, FSG &amp; TFN expiry monitoring</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--ring au-pod--gold" aria-label="Vault standing ${vaultPct}%">
          <div class="tk-ring" style="--p:${vaultPct}%;--ring-color:${vaultPct >= 80 ? '#34d399' : '#e8c26f'};--ring-size:48px">
            <span class="tk-ring__val">${vaultPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="au-pod__lbl">Vault Health</span>
            <span class="au-pod__val" style="font-size:16px">${currentDocs}/${state.documents.length}</span>
            <span class="au-pod__sub">Current records</span>
          </div>
        </div>

        <div class="${cls('au-pod', { 'au-pod--alert': reviewsDueCount > 0 })}">
          <span class="au-pod__lbl">${icon('calendar', { size: 12 })} Reviews 30d</span>
          <span class="au-pod__val">${reviewsDueCount}</span>
          <span class="au-pod__sub">${state.reviews.length} total logged</span>
        </div>

        <div class="${cls('au-pod', { 'au-pod--alert': expiringDocsCount > 0 })}">
          <span class="au-pod__lbl">${icon('alert', { size: 12 })} Expiring Docs</span>
          <span class="au-pod__val">${expiringDocsCount}</span>
          <span class="au-pod__sub">${expiringDocsCount > 0 ? 'Renewal needed' : 'All current'}</span>
        </div>

        <div class="au-masthead__cta-group">
          <button type="button" class="k-btn au-btn-ghost-dark" data-action="doc-new">${icon('plus', { size: 15 })} Vault Doc</button>
          <button type="button" class="k-btn au-btn-gold" data-action="review-new">${icon('calendar', { size: 15 })} Log Review</button>
        </div>
      </div>
    </section>

    <div class="au-tabs">
      <div class="tk-segmented" role="tablist" aria-label="Reviews and vault tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.reviewsTab === 'reviews' })}" data-action="rv-tab" data-tab="reviews">Annual Client Reviews (${state.reviews.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.reviewsTab === 'vault' })}" data-action="rv-tab" data-tab="vault">Document Vault (${state.documents.length})</button>
      </div>
    </div>

    ${state.reviewsTab === 'reviews' ? html`
      ${loadingReviews ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.reviews.length ? html`
        <div class="au-card-list">
          ${state.reviews.map((r) => {
            const dm = deadlineMeta(r.next_review_date, { warnDays: 30, prefix: 'Next' });
            const goalPct = Math.min(100, Math.max(0, Number(r.goal_progress || 0) * 10));
            const cardTone = r.soa_required ? 'au-rec-card--warn' : 'au-rec-card--ok';
            return html`
              <article class="au-rec-card ${cardTone}" data-key="rev-${r.id}">
                <div class="au-rec-card__top">
                  <div class="au-rec-card__id">
                    <span class="au-monogram au-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${r.first_name} ${r.last_name}</strong>
                        ${renderStatusPill(dm.tone, dm.label)}
                        <span class="tk-tag ${r.soa_required ? 'tk-tag--warn' : 'tk-tag--ok'}">${r.soa_required ? 'SOA Required' : 'ROA / Completed'}</span>
                        ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="au-rec-card__meta">
                        <span>Reviewed: <strong>${fmtDay(r.review_date)}</strong></span>
                        <span>Next Due: <strong style="color:var(--k-text)">${fmtDay(r.next_review_date)}</strong></span>
                        <span>Portfolio: <strong style="color:var(--au-forest)">${money(r.current_portfolio_value_cents, { currency })}</strong></span>
                        <span>Est. Fee: ${money(r.current_annual_fee_cents, { currency })}</span>
                      </div>
                    </div>
                  </div>
                  <div class="au-rec-card__aside">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="review-delete" data-id="${r.id}">Delete</button>
                  </div>
                </div>
                <div style="display:grid;gap:4px;max-width:340px">
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--k-muted)">
                    <span>Client Goal Progress</span>
                    <span style="color:var(--au-forest)">${r.goal_progress} / 10</span>
                  </div>
                  <div class="tk-bar"><div class="tk-bar__fill ${goalPct >= 70 ? 'tk-bar__fill--ok' : 'tk-bar__fill--warn'}" style="width:${goalPct}%"></div></div>
                </div>
                ${(r.life_changes || []).filter((x) => x !== 'None').length ? html`
                  <div class="au-bdbn-chips">
                    ${(r.life_changes || []).filter((x) => x !== 'None').map((lc) => html`<span class="tk-tag tk-tag--warn">Life Event: ${lc}</span>`)}
                  </div>` : ''}
                ${r.advisor_notes ? html`<div class="tk-muted" style="font-size:13px;line-height:1.45">${r.advisor_notes}</div>` : ''}
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'calendar', title: 'No annual reviews yet', text: 'Log a client portfolio review to track goals, life changes and next review date.' })}` : html`
      <div class="tk-toolbar">
        <div class="tk-segmented" role="tablist" aria-label="Filter vault documents">
          ${[
            ['All', `All (${state.documents.length})`],
            ['Expiring', `Expiring (${expiringDocsCount})`],
            ['ID Verification (AUSTRAC)', 'AUSTRAC KYC'],
            ['Statement of Advice', 'SOA'],
            ['Financial Services Guide', 'FSG'],
            ['Tax Return', 'Tax'],
            ['Superannuation Statement', 'Super'],
          ].map(([f, lbl]) => html`
            <button type="button" class="${cls('tk-pill', { 'is-on': state.docTypeFilter === f })}" data-action="doc-filter" data-filter="${f}">${lbl}</button>`)}
        </div>
      </div>

      ${loadingDocs ? html`<section class="tk-sheet">${skeleton(3)}</section>` : docs.length ? html`
        <div class="au-card-list">
          ${docs.map((d) => {
            const dm = d.expiry_date ? deadlineMeta(d.expiry_date, { warnDays: 30 }) : { state: 'current', tone: 'au-status-pill--ok', label: 'Current · Permanent' };
            const tone = dm.state === 'overdue' || dm.state === 'due' ? 'au-rec-card--bad' : dm.state === 'soon' ? 'au-rec-card--warn' : 'au-rec-card--ok';
            return html`
              <article class="au-rec-card ${tone}" data-key="doc-${d.id}">
                <div class="au-rec-card__top">
                  <div class="au-rec-card__id">
                    <span class="au-monogram au-monogram--sm">${initials(`${d.first_name} ${d.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15px">${d.document_name}</strong>
                        ${renderStatusPill(dm.tone, dm.label)}
                        <span class="tk-tag">${d.document_type}</span>
                        ${d.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="au-rec-card__meta">
                        <span>Client: <strong style="color:var(--k-text)">${d.first_name} ${d.last_name}</strong></span>
                        ${d.reference_code ? html`<span class="au-ref">${d.reference_code}</span>` : ''}
                        <span>Expiry: <strong>${d.expiry_date ? fmtDay(d.expiry_date) : 'No expiry'}</strong></span>
                      </div>
                    </div>
                  </div>
                  <div class="au-rec-card__aside">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="doc-delete" data-id="${d.id}">Delete</button>
                  </div>
                </div>
                ${d.notes ? html`<div class="tk-muted" style="font-size:13px">${d.notes}</div>` : ''}
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'folder', title: 'No documents match filter', text: 'Store SOA, FSG, KYC ID, TFN and tax document metadata with expiry reminders.' })}`}`;
}

export function wireReviewsVaultActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="rv-tab"]', (e, el) => { state.reviewsTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="doc-filter"]', (e, el) => { state.docTypeFilter = el.dataset.filter; draw(); });

  on(root, 'click', '[data-action="review-new"]', async () => {
    const made = await formDialog({
      title: 'Log Annual Client Review',
      submitLabel: 'Save Review',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span>
            <select class="k-input" name="client_id" required>
              ${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Review Date</span><input class="k-input" type="date" name="review_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Next Review Date</span><input class="k-input" type="date" name="next_review_date" value="${addMonths(today(), 12)}" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Current Portfolio Value (AUD)</span><input class="k-input" type="number" step="1000" min="0" name="current_portfolio_value" required></label>
          <label class="k-field"><span class="k-field__label">Goal Progress (1–10)</span><input class="k-input" type="number" min="1" max="10" name="goal_progress" value="8"></label>
          <label class="k-field"><span class="k-field__label">Updated Risk Tolerance (1–10)</span><input class="k-input" type="number" min="1" max="10" name="updated_risk_tolerance" value="6"></label>
        </div>
        <div class="k-field">
          <span class="k-field__label">Life Changes Since Last Review (triggers SOA requirement if material)</span>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px">
            ${LIFE_CHANGES.map((lc) => html`<label class="k-check"><input type="checkbox" name="life_changes" value="${lc}"><span>${lc}</span></label>`)}
          </div>
        </div>
        <label class="k-field"><span class="k-field__label">Adviser Notes</span><textarea class="k-input" name="advisor_notes" rows="2"></textarea></label>`,
      onSubmit: (v) => api.post('/api/reviews', { ...v, client_id: Number(v.client_id), life_changes: Array.isArray(v.life_changes) ? v.life_changes : [] }),
    });
    if (made) { state.reviewsTab = 'reviews'; toast.success(made.review.soa_required ? 'Annual review saved — SOA Required flagged.' : 'Annual review saved.'); await loadScreen('/reviews'); }
  });

  on(root, 'click', '[data-action="review-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete review?', message: 'Remove this annual review record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/reviews', { id: Number(el.dataset.id) }); toast.success('Review deleted.'); await loadScreen('/reviews'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="doc-new"]', async () => {
    const made = await formDialog({
      title: 'Add Document to Vault',
      submitLabel: 'Save Document',
      fields: html`
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>
            ${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Document Type</span>
            <select class="k-input" name="document_type">${DOC_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Reference Code</span><input class="k-input" name="reference_code" placeholder="e.g. SOA-2026-019"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Document Name</span><input class="k-input" name="document_name" required></label>
        <label class="k-field"><span class="k-field__label">Expiry Date <span class="k-field__optional">optional</span></span><input class="k-input" type="date" name="expiry_date"></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/documents', { ...v, client_id: Number(v.client_id), today: today() }),
    });
    if (made) { state.reviewsTab = 'vault'; toast.success('Document added to vault.'); await loadScreen('/reviews'); }
  });

  on(root, 'click', '[data-action="doc-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove vault document?', message: 'Delete this document vault record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/documents', { id: Number(el.dataset.id) }); toast.success('Document removed.'); await loadScreen('/reviews'); }
    catch (err) { toastError(err); }
  });
}
