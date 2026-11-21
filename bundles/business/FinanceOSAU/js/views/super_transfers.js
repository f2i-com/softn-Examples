// Superannuation Rollovers, 100%-validated Binding Death Benefit Nominations (BDBN) & Off-Market CHESS Transfers:
// Unified Forest & Gold Mastheads, live 100% BDBN meter, Super Rollover 3-stage steppers & CHESS 4-stage transfer steppers.
import { html, on, cls, esc } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { deadlineMeta, renderStatusPill } from '../au_ui.js';

const SIS_RELS = ['Spouse', 'Child', 'Financial Dependent', 'Interdependency Relationship', 'Legal Personal Representative'];
const PLATFORMS = ['BT Panorama', 'Macquarie Wrap', 'Netwealth', 'CFS FirstChoice', 'HUB24', 'Other'];
const OMT_STATUSES = ['Draft', 'Submitted', 'In Transit', 'Completed', 'Cancelled'];
const OMT_FLOW = ['Draft', 'Submitted', 'In Transit', 'Completed'];
const OMT_NEXT = { Draft: 'Submitted', Submitted: 'In Transit', 'In Transit': 'Completed' };
const ROLL_STATUSES = ['Initiated', 'Awaiting Fund', 'Completed', 'Cancelled'];
const ROLL_FLOW = ['Initiated', 'Awaiting Fund', 'Completed'];
const ROLL_NEXT = { Initiated: 'Awaiting Fund', 'Awaiting Fund': 'Completed' };
const PRESERVATIONS = ['Preserved', 'Restricted Non-preserved', 'Unrestricted Non-preserved'];

export function renderSuperView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const d = state.bdbnDraft;
  const primarySum = Math.round(d.primaries.reduce((acc, b) => acc + (Number(b.percentage) || 0), 0) * 100) / 100;
  const sumOk = Math.abs(primarySum - 100) < 0.001;
  const sumOver = primarySum > 100.001;
  const sumTone = sumOk ? 'au-alloc-meter--ok' : (primarySum > 0 && !sumOver) ? 'au-alloc-meter--warn' : 'au-alloc-meter--bad';
  const diff = Math.round(Math.abs(100 - primarySum) * 100) / 100;
  const loadingBdbns = state.loading && !state.bdbns.length;
  const loadingRollovers = state.loading && !state.rollovers.length;

  const activeBdbns = state.bdbns.filter((b) => b.status === 'Active');
  const expiringBdbns = activeBdbns.filter((b) => {
    const m = deadlineMeta(b.expiry_date, { warnDays: 45 });
    return m.state === 'overdue' || m.state === 'due' || m.state === 'soon';
  });
  const activeRollovers = state.rollovers.filter((r) => r.status === 'Initiated' || r.status === 'Awaiting Fund');
  const rollTotal = state.rollovers.reduce((acc, r) => acc + Number(r.estimated_balance_cents || 0), 0);

  return html`
    <section class="au-masthead" aria-label="Superannuation and BDBN Desk">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('au-super', { size: 12 })} SIS ACT 1993 · REG 6.17A SUPER &amp; BDBN
        </div>
        <h1 class="au-masthead__title">Superannuation &amp; BDBN Desk</h1>
        <div class="au-masthead__meta">
          <span>100%-validated Binding Death Benefit Nominations</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>3-year statutory witnessing &amp; fund rollovers</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--gold">
          <span class="au-pod__lbl">${icon('award', { size: 12 })} Active BDBNs</span>
          <span class="au-pod__val">${activeBdbns.length}</span>
          <span class="au-pod__sub">${state.bdbns.length} recorded</span>
        </div>

        <div class="${cls('au-pod', { 'au-pod--alert': expiringBdbns.length > 0 })}">
          <span class="au-pod__lbl">${icon('clock', { size: 12 })} Renewals (45d)</span>
          <span class="au-pod__val">${expiringBdbns.length}</span>
          <span class="au-pod__sub">${expiringBdbns.length > 0 ? 'Re-witness due' : 'All valid'}</span>
        </div>

        <div class="au-pod au-pod--wide">
          <span class="au-pod__lbl">${icon('au-transfer', { size: 12 })} Rollover Book</span>
          <span class="au-pod__val au-pod__val--serif">${money(rollTotal, { currency })}</span>
          <span class="au-pod__sub">${activeRollovers.length} in-flight · ${state.rollovers.length} total</span>
        </div>

        <button type="button" class="k-btn au-btn-gold" data-action="rollover-new">${icon('plus', { size: 15 })} Super Rollover</button>
      </div>
    </section>

    <div class="au-tabs">
      <div class="tk-segmented" role="tablist" aria-label="Superannuation desk tabs">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.superTab === 'bdbn' })}" data-action="super-tab" data-tab="bdbn">BDBN Register (${state.bdbns.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.superTab === 'rollovers' })}" data-action="super-tab" data-tab="rollovers">Super Rollovers (${state.rollovers.length})</button>
      </div>
    </div>

    ${state.superTab === 'bdbn' ? html`
      <div class="tk-grid-2">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('award', { size: 17 })} New Binding Death Benefit Nomination</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-bdbn" novalidate>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Member / Client</span>
                  <select class="k-input" data-bdbn-field="client_id">
                    ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(d.client_id) ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`)}
                  </select>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Nomination Date</span>
                  <input class="k-input" type="date" value="${d.nomination_date || today()}" data-bdbn-field="nomination_date">
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Superannuation Fund Name</span>
                  <input class="k-input" value="${d.super_fund_name}" placeholder="e.g. HUB24 Super" data-bdbn-field="super_fund_name" required>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Member Number</span>
                  <input class="k-input" value="${d.member_number}" placeholder="e.g. H24-110842" data-bdbn-field="member_number" required>
                </label>
              </div>

              <div class="k-field">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                  <span class="k-field__label">Primary Beneficiaries (SIS Act Dependants / LPR)</span>
                  <div class="tk-btn-row">
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="bdbn-split-even">${d.primaries.length > 1 ? 'Split Evenly' : 'Set 100%'}</button>
                    <button type="button" class="k-btn k-btn--sm" data-action="bdbn-add-primary">${icon('plus', { size: 14 })} Add Beneficiary</button>
                  </div>
                </div>
                <div class="tk-stack" style="gap:8px;margin-top:6px">
                  ${d.primaries.map((b, idx) => html`
                    <div class="au-ben-row" data-key="ben-${idx}">
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">Full Name</span>
                        <input class="k-input" value="${b.name}" placeholder="Beneficiary name" data-ben-idx="${idx}" data-ben-key="name">
                      </label>
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">SIS Relationship</span>
                        <select class="k-input" data-ben-idx="${idx}" data-ben-key="relationship">
                          ${SIS_RELS.map((rel) => html`<option value="${rel}" ${rel === b.relationship ? 'selected' : ''}>${rel}</option>`)}
                        </select>
                      </label>
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">DOB</span>
                        <input class="k-input" type="date" value="${b.dob || ''}" data-ben-idx="${idx}" data-ben-key="dob">
                      </label>
                      <label class="k-field"><span class="k-field__label" style="font-size:12px">Share %</span>
                        <input class="k-input" type="number" step="1" min="0" max="100" value="${b.percentage}" data-ben-idx="${idx}" data-ben-key="percentage">
                      </label>
                      ${d.primaries.length > 1 ? html`<button type="button" class="k-icon-btn tk-danger" data-action="bdbn-rm-primary" data-idx="${idx}" aria-label="Remove">${icon('trash', { size: 16 })}</button>` : html`<span></span>`}
                    </div>`)}
                </div>
              </div>

              <div class="au-alloc-meter ${sumTone}">
                <div class="au-alloc-meter__top">
                  <span>BDBN Primary Allocation Meter</span>
                  <span class="au-alloc-meter__pct">${primarySum}% / 100%</span>
                </div>
                <div class="au-alloc-meter__track" role="progressbar" aria-valuenow="${Math.min(100, Math.max(0, primarySum))}" aria-valuemin="0" aria-valuemax="100">
                  ${d.primaries.map((b) => {
                    const pct = Math.max(0, Number(b.percentage) || 0);
                    const width = primarySum > 100 ? (pct / primarySum) * 100 : Math.min(100, pct);
                    return pct > 0 ? html`<div class="au-alloc-meter__seg" style="width:${width}%" title="${b.name || 'Beneficiary'}: ${pct}%"></div>` : '';
                  })}
                </div>
                <div class="au-alloc-meter__foot">
                  <span>
                    ${sumOk
                      ? '✓ Exactly 100% allocated — compliant with SIS Reg 6.17A.'
                      : sumOver
                        ? `Over-allocated by ${diff}% — reduce beneficiary shares to equal exactly 100%.`
                        : `${diff}% remaining — assign remaining percentage to reach 100%.`}
                  </span>
                  <span>${d.primaries.length} beneficiar${d.primaries.length === 1 ? 'y' : 'ies'}</span>
                </div>
              </div>

              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Witness 1 Full Name</span><input class="k-input" value="${d.witness_1_name}" placeholder="Independent adult witness" data-bdbn-field="witness_1_name" required></label>
                <label class="k-field"><span class="k-field__label">Witness 2 Full Name</span><input class="k-input" value="${d.witness_2_name}" placeholder="Independent adult witness" data-bdbn-field="witness_2_name" required></label>
              </div>
              <div class="k-form__row">
                <label class="k-check"><input type="checkbox" ${d.witness_1_over_18 ? 'checked' : ''} data-bdbn-check="witness_1_over_18"><span>Witness 1 confirmed over 18 &amp; not a beneficiary</span></label>
                <label class="k-check"><input type="checkbox" ${d.witness_2_over_18 ? 'checked' : ''} data-bdbn-check="witness_2_over_18"><span>Witness 2 confirmed over 18 &amp; not a beneficiary</span></label>
              </div>

              <div class="k-form__actions">
                <button type="submit" class="k-btn k-btn--primary" ${state.clients.length ? '' : 'disabled'}>Execute Binding Nomination (3-Yr Validity)</button>
              </div>
            </form>
          </div>
        </section>

        <div class="au-card-list">
          ${loadingBdbns ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.bdbns.length ? state.bdbns.map((b) => {
            const dm = b.status === 'Active' ? deadlineMeta(b.expiry_date, { warnDays: 45 }) : null;
            const tone = b.status === 'Revoked' ? 'au-rec-card--muted' : (dm && (dm.state === 'overdue' || dm.state === 'due')) ? 'au-rec-card--bad' : (dm && dm.state === 'soon') ? 'au-rec-card--warn' : 'au-rec-card--ok';
            return html`
              <article class="au-rec-card ${tone}" data-key="bdbn-${b.id}">
                <div class="au-rec-card__top">
                  <div class="au-rec-card__id">
                    <span class="au-monogram au-monogram--sm">${initials(`${b.first_name} ${b.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:4px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15px">${b.first_name} ${b.last_name}</strong>
                        <span class="au-ref">${b.member_number}</span>
                        ${b.status === 'Active' && dm
                          ? renderStatusPill(dm.tone, dm.label)
                          : html`<span class="tk-tag ${b.status === 'Revoked' ? 'tk-tag--bad' : 'tk-tag--warn'}">${b.status}</span>`}
                        ${b.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="tk-muted" style="font-size:12.5px"><strong>${b.super_fund_name}</strong> · Signed ${fmtDay(b.nomination_date)} · Expires <strong style="color:var(--k-text)">${fmtDay(b.expiry_date)}</strong></div>
                    </div>
                  </div>
                  <div class="au-rec-card__aside">
                    <button type="button" class="k-btn k-btn--sm" data-action="print-bdbn" data-id="${b.id}">${icon('printer', { size: 14 })} Schedule</button>
                    ${b.status === 'Active' ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="bdbn-revoke" data-id="${b.id}">Revoke</button>` : ''}
                  </div>
                </div>
                <div class="au-bdbn-chips">
                  ${(b.primary_beneficiaries || []).map((p) => html`
                    <span class="au-bdbn-chip">${p.name} (${p.relationship}) <strong>${p.percentage}%</strong></span>`)}
                </div>
                <div class="au-rec-card__meta">
                  <span>Witnesses (18+): <strong>${b.witness_1_name}</strong> &amp; <strong>${b.witness_2_name}</strong></span>
                </div>
              </article>`;
          }) : emptyState({ iconName: 'award', title: 'No BDBNs recorded', text: 'Create a Binding Death Benefit Nomination on the left.' })}
        </div>
      </div>` : html`
      ${loadingRollovers ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.rollovers.length ? html`
        <div class="au-card-list">
          ${state.rollovers.map((r) => {
            const isCancelled = r.status === 'Cancelled';
            const stepIdx = ROLL_FLOW.indexOf(r.status);
            const nextSt = ROLL_NEXT[r.status];
            const cardTone = r.status === 'Completed' ? 'au-rec-card--ok' : isCancelled ? 'au-rec-card--muted' : 'au-rec-card--gold';
            return html`
              <article class="au-rec-card ${cardTone}" data-key="roll-${r.id}">
                <div class="au-rec-card__top">
                  <div class="au-rec-card__id">
                    <span class="au-monogram au-monogram--sm">${initials(`${r.first_name} ${r.last_name}`)}</span>
                    <div style="min-width:0;display:grid;gap:5px">
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                        <strong style="font-size:15.5px">${r.first_name} ${r.last_name}</strong>
                        <span class="tk-tag ${r.status === 'Completed' ? 'tk-tag--ok' : isCancelled ? 'tk-tag--bad' : 'tk-tag--info'}">${r.status}</span>
                        <span class="tk-tag tk-tag--accent">${r.rollover_type}</span>
                        ${r.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                      </div>
                      <div class="au-route-pill">
                        <span>${r.from_fund_name}</span>
                        ${icon('arrow-right', { size: 13 })}
                        <strong>${r.to_fund_name}</strong>
                      </div>
                    </div>
                  </div>
                  <div class="au-rec-card__aside">
                    ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="rollover-advance" data-id="${r.id}" data-status="${nextSt}">Move to ${nextSt} →</button>` : ''}
                    <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="rollover-status" data-id="${r.id}" aria-label="Rollover status">
                      ${ROLL_STATUSES.map((st) => html`<option value="${st}" ${st === r.status ? 'selected' : ''}>${st}</option>`)}
                    </select>
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="rollover-delete" data-id="${r.id}">Delete</button>
                  </div>
                </div>
                <div class="au-rec-card__meta">
                  <span>Est. Balance: <strong style="color:var(--k-text)">${money(r.estimated_balance_cents, { currency })}</strong></span>
                  ${r.rollover_type === 'Partial Rollover' ? html`<span>Partial Amount: <strong>${money(r.partial_amount_cents, { currency })}</strong></span>` : ''}
                  <span>Preservation: <strong>${r.preservation_status}</strong></span>
                  <span class="au-status-pill ${r.insurance_checked ? 'au-status-pill--ok' : 'au-status-pill--bad'}"><span class="au-status-pill__dot"></span>Insurance Check: ${r.insurance_checked ? 'Verified' : 'Pending'}</span>
                </div>
                ${r.notes ? html`<div class="tk-muted" style="font-size:13px">${r.notes}</div>` : ''}
                <div class="au-steps au-steps--3" aria-label="Superannuation rollover stage">
                  ${ROLL_FLOW.map((st, idx) => html`
                    <div class="${cls('au-step', {
                      'is-cancel': isCancelled,
                      'is-done': !isCancelled && (idx < stepIdx || (r.status === 'Completed' && idx === 2)),
                      'is-now': !isCancelled && idx === stepIdx && r.status !== 'Completed',
                    })}">
                      ${!isCancelled && (idx < stepIdx || (r.status === 'Completed' && idx === 2)) ? '✓' : `${idx + 1}.`} ${st}
                    </div>`)}
                </div>
              </article>`;
          })}
        </div>` : emptyState({ iconName: 'au-super', title: 'No super rollovers yet', text: 'Click Super Rollover to record a fund consolidation.' })}`}`;
}

export function renderTransfersView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const rows = state.transferFilter === 'All'
    ? state.transfers
    : state.transfers.filter((t) => t.status === state.transferFilter);
  const activeList = state.transfers.filter((t) => t.status === 'Draft' || t.status === 'Submitted' || t.status === 'In Transit');
  const completedList = state.transfers.filter((t) => t.status === 'Completed');
  const activeValue = activeList.reduce((acc, t) => acc + Number(t.estimated_value_cents || 0), 0);
  const completedValue = completedList.reduce((acc, t) => acc + Number(t.estimated_value_cents || 0), 0);
  const countBy = (st) => state.transfers.filter((t) => t.status === st).length;
  const loadingRows = state.loading && !state.transfers.length;

  return html`
    <section class="au-masthead" aria-label="Off-Market CHESS Security Transfers">
      <div class="au-masthead__copy">
        <div class="au-masthead__eyebrow">
          ${icon('au-transfer', { size: 12 })} CHESS &amp; WRAP PLATFORM TRANSITIONS
        </div>
        <h1 class="au-masthead__title">Off-Market Transfers</h1>
        <div class="au-masthead__meta">
          <span>HIN/SRN security transfers across AU wrap platforms</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>4-stage CHESS settlement stepper &amp; $54.50 fee tracking</span>
        </div>
      </div>

      <div class="au-masthead__pods" style="align-items:center">
        <div class="au-pod au-pod--gold au-pod--wide">
          <span class="au-pod__lbl">${icon('trending', { size: 12 })} Active Pipeline</span>
          <span class="au-pod__val au-pod__val--serif">${money(activeValue, { currency })}</span>
          <span class="au-pod__sub">${activeList.length} transfer${activeList.length === 1 ? '' : 's'} in-flight</span>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('check-circle', { size: 12 })} Settled</span>
          <span class="au-pod__val">${money(completedValue, { currency })}</span>
          <span class="au-pod__sub">${completedList.length} completed</span>
        </div>

        <div class="au-pod">
          <span class="au-pod__lbl">${icon('layers', { size: 12 })} Total</span>
          <span class="au-pod__val">${state.transfers.length}</span>
          <span class="au-pod__sub">CHESS &amp; SRN</span>
        </div>

        <button type="button" class="k-btn au-btn-gold" data-action="omt-new">${icon('plus', { size: 15 })} New Transfer</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter off-market transfers">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.transferFilter === 'All' })}" data-action="omt-filter" data-filter="All">All (${state.transfers.length})</button>
        ${OMT_STATUSES.map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.transferFilter === st })}" data-action="omt-filter" data-filter="${st}">${st} (${countBy(st)})</button>`)}
      </div>
    </div>

    ${loadingRows ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="au-card-list">
        ${rows.map((t) => {
          const isCancelled = t.status === 'Cancelled';
          const stepIdx = OMT_FLOW.indexOf(t.status);
          const nextSt = OMT_NEXT[t.status];
          const tone = t.status === 'Completed' ? 'au-rec-card--ok' : isCancelled ? 'au-rec-card--muted' : t.status === 'In Transit' ? 'au-rec-card--gold' : '';
          return html`
            <article class="au-rec-card ${tone}" data-key="omt-${t.id}">
              <div class="au-rec-card__top">
                <div class="au-rec-card__id">
                  <span class="au-monogram au-monogram--sm">${initials(`${t.first_name} ${t.last_name}`)}</span>
                  <div style="min-width:0;display:grid;gap:5px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                      <strong style="font-size:15.5px">${t.first_name} ${t.last_name}</strong>
                      <span class="au-ref">${t.hin_or_srn}</span>
                      <span class="tk-tag tk-tag--accent">${t.delivering_platform}</span>
                      <span class="tk-tag">${t.transfer_type} · ${t.chess_sponsorship}</span>
                      ${t.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px">
                      <strong style="font-family:var(--k-font-display);font-size:19px;color:var(--au-forest);font-variant-numeric:tabular-nums">${money(t.estimated_value_cents, { currency })}</strong>
                      <span class="tk-muted" style="font-size:12.5px">Ref: <span class="tk-mono">${t.account_reference}</span> · Fee: ${money(t.transfer_fee_cents, { currency })} · Lodged ${fmtDay(t.submitted_date)}</span>
                    </div>
                  </div>
                </div>
                <div class="au-rec-card__aside">
                  ${nextSt ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="omt-advance" data-id="${t.id}" data-status="${nextSt}">Move to ${nextSt} →</button>` : ''}
                  <select class="k-input" style="min-height:32px;padding:3px 8px;width:auto;font-size:12.5px" data-action="omt-status" data-id="${t.id}" aria-label="Transfer status">
                    ${OMT_STATUSES.map((st) => html`<option value="${st}" ${st === t.status ? 'selected' : ''}>${st}</option>`)}
                  </select>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="omt-delete" data-id="${t.id}">Delete</button>
                </div>
              </div>
              ${t.assets_to_transfer ? html`<div style="font-size:13px;color:var(--k-text);line-height:1.45"><strong>Holdings:</strong> ${t.assets_to_transfer}</div>` : ''}
              ${t.notes ? html`<div class="tk-muted" style="font-size:12.5px">${t.notes}</div>` : ''}
              <div class="au-steps" aria-label="Off-market transfer stage">
                ${OMT_FLOW.map((st, idx) => html`
                  <div class="${cls('au-step', {
                    'is-cancel': isCancelled,
                    'is-done': !isCancelled && (idx < stepIdx || (t.status === 'Completed' && idx === 3)),
                    'is-now': !isCancelled && idx === stepIdx && t.status !== 'Completed',
                  })}">
                    ${!isCancelled && (idx < stepIdx || (t.status === 'Completed' && idx === 3)) ? '✓' : `${idx + 1}.`} ${st}
                  </div>`)}
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'au-transfer', title: 'No off-market transfers match', text: 'Create a CHESS or Issuer-Sponsored off-market transfer instruction.' })}`;
}

export function wireSuperTransferActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="super-tab"]', (e, el) => { state.superTab = el.dataset.tab; draw(); });
  on(root, 'click', '[data-action="omt-filter"]', (e, el) => { state.transferFilter = el.dataset.filter; draw(); });

  // BDBN form state
  on(root, 'input', '[data-bdbn-field]', (e, el) => { state.bdbnDraft[el.dataset.bdbnField] = el.value; });
  on(root, 'change', '[data-bdbn-field]', (e, el) => { state.bdbnDraft[el.dataset.bdbnField] = el.value; draw(); });
  on(root, 'change', '[data-bdbn-check]', (e, el) => { state.bdbnDraft[el.dataset.bdbnCheck] = el.checked; draw(); });
  on(root, 'input', '[data-ben-idx]', (e, el) => {
    const idx = Number(el.dataset.benIdx);
    const key = el.dataset.benKey;
    if (state.bdbnDraft.primaries[idx]) {
      state.bdbnDraft.primaries[idx][key] = key === 'percentage' ? Number(el.value) : el.value;
      if (key === 'percentage') draw();
    }
  });
  on(root, 'change', '[data-ben-idx]', (e, el) => {
    const idx = Number(el.dataset.benIdx);
    const key = el.dataset.benKey;
    if (state.bdbnDraft.primaries[idx]) state.bdbnDraft.primaries[idx][key] = key === 'percentage' ? Number(el.value) : el.value;
    draw();
  });
  on(root, 'click', '[data-action="bdbn-add-primary"]', () => {
    const currentSum = state.bdbnDraft.primaries.reduce((acc, b) => acc + (Number(b.percentage) || 0), 0);
    const rem = Math.max(0, Math.round((100 - currentSum) * 100) / 100);
    state.bdbnDraft.primaries.push({ name: '', relationship: 'Child', dob: '', percentage: rem });
    draw();
  });
  on(root, 'click', '[data-action="bdbn-split-even"]', () => {
    const list = state.bdbnDraft.primaries;
    if (!list.length) return;
    const base = Math.floor(100 / list.length);
    const remainder = 100 - base * list.length;
    list.forEach((b, i) => { b.percentage = base + (i === 0 ? remainder : 0); });
    draw();
  });
  on(root, 'click', '[data-action="bdbn-rm-primary"]', (e, el) => {
    state.bdbnDraft.primaries.splice(Number(el.dataset.idx), 1);
    draw();
  });

  on(root, 'submit', 'form[data-form="save-bdbn"]', async (e) => {
    e.preventDefault();
    try {
      const d = state.bdbnDraft;
      await api.post('/api/bdbns', {
        client_id: Number(d.client_id),
        super_fund_name: d.super_fund_name,
        member_number: d.member_number,
        nomination_date: d.nomination_date || today(),
        primary_beneficiaries: d.primaries,
        contingent_beneficiaries: d.contingents,
        witness_1_name: d.witness_1_name,
        witness_1_over_18: d.witness_1_over_18,
        witness_2_name: d.witness_2_name,
        witness_2_over_18: d.witness_2_over_18,
        notes: d.notes,
      });
      toast.success('Binding Death Benefit Nomination recorded (100% validated).');
      state.bdbnDraft.super_fund_name = '';
      state.bdbnDraft.member_number = '';
      state.bdbnDraft.witness_1_name = '';
      state.bdbnDraft.witness_2_name = '';
      state.bdbnDraft.primaries = [{ name: '', relationship: 'Spouse', dob: '', percentage: 100 }];
      await loadScreen('/super');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="bdbn-revoke"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Revoke BDBN?', message: 'Mark this Binding Death Benefit Nomination as Revoked?', confirmLabel: 'Revoke', danger: true });
    if (!ok) return;
    try { await api.post('/api/bdbns/status', { id: Number(el.dataset.id), status: 'Revoked' }); toast.success('BDBN revoked.'); await loadScreen('/super'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-bdbn"]', (e, el) => {
    const b = state.bdbns.find((x) => String(x.id) === el.dataset.id);
    if (!b) return;
    const s = state.session.settings;
    const rowsHtml = (b.primary_beneficiaries || []).map((p) =>
      `<tr><td>${esc(p.name)}</td><td>${esc(p.relationship)}</td><td>${esc(p.dob || '—')}</td><td class="num"><strong>${esc(p.percentage)}%</strong></td></tr>`
    ).join('');
    downloadHtmlDoc(`bdbn-${b.last_name.toLowerCase()}-${b.nomination_date || today()}.html`, {
      title: 'Binding Death Benefit Nomination Schedule',
      businessName: s.business_name,
      subtitle: `${s.afsl_number || 'Australian AFSL'} · SIS Act 1993 Reg 6.17A`,
      accent: '#114237',
      bodyHtml: `
        <table>
          <tr><th>Member</th><td>${esc(b.first_name + ' ' + b.last_name)}</td><th>Super Fund</th><td>${esc(b.super_fund_name)} (${esc(b.member_number)})</td></tr>
          <tr><th>Nomination Date</th><td>${esc(b.nomination_date)}</td><th>3-Year Statutory Expiry</th><td><strong>${esc(b.expiry_date)}</strong></td></tr>
        </table>
        <h3>Primary Beneficiaries (Total = 100%)</h3>
        <table><thead><tr><th>Beneficiary</th><th>SIS Relationship</th><th>DOB</th><th class="num">Share</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        <div class="box"><strong>Independent Adult Witnesses (Over 18):</strong> ${esc(b.witness_1_name)} &amp; ${esc(b.witness_2_name)}</div>`,
    });
  });

  // Super Rollovers
  on(root, 'click', '[data-action="rollover-new"]', async () => {
    const made = await formDialog({
      title: 'Initiate Superannuation Rollover',
      submitLabel: 'Record Rollover',
      size: 'lg',
      fields: html`
        <div class="au-warning-box">${icon('alert', { size: 18 })}<span><strong>Insurance Warning:</strong> Rolling over a full superannuation balance may cancel existing Death, TPD or Income Protection cover held inside the delivering fund.</span></div>
        <label class="k-field"><span class="k-field__label">Client</span>
          <select class="k-input" name="client_id" required>
            ${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">From Fund Name</span><input class="k-input" name="from_fund_name" placeholder="e.g. AustralianSuper" required></label>
          <label class="k-field"><span class="k-field__label">From Fund ABN</span><input class="k-input" name="from_fund_abn" placeholder="65 714 394 898"></label>
          <label class="k-field"><span class="k-field__label">From Member #</span><input class="k-input" name="from_member_number" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">To Fund Name</span><input class="k-input" name="to_fund_name" placeholder="e.g. HUB24 Super" required></label>
          <label class="k-field"><span class="k-field__label">To Fund ABN</span><input class="k-input" name="to_fund_abn"></label>
          <label class="k-field"><span class="k-field__label">To Member #</span><input class="k-input" name="to_member_number" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Rollover Type</span>
            <select class="k-input" name="rollover_type">
              <option value="Full Rollover">Full Rollover</option>
              <option value="Partial Rollover">Partial Rollover</option>
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Est. Balance (AUD)</span><input class="k-input" type="number" step="100" min="0" name="estimated_balance" required></label>
          <label class="k-field"><span class="k-field__label">Partial Amount (if partial)</span><input class="k-input" type="number" step="100" min="0" name="partial_amount" value="0"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Preservation Status</span>
          <select class="k-input" name="preservation_status">${PRESERVATIONS.map((p) => html`<option value="${p}">${p}</option>`)}</select>
        </label>
        <label class="k-check"><input type="checkbox" name="insurance_checked" checked><span>Client advised of insurance impact prior to rollover</span></label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes"></label>`,
      onSubmit: (v) => api.post('/api/rollovers', { ...v, client_id: Number(v.client_id), requested_date: today() }),
    });
    if (made) { state.superTab = 'rollovers'; toast.success('Superannuation rollover initiated.'); await loadScreen('/super'); }
  });

  on(root, 'change', '[data-action="rollover-status"]', async (e, el) => {
    try { await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Rollover status updated.'); await loadScreen('/super'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="rollover-advance"]', async (e, el) => {
    try { await api.post('/api/rollovers/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Rollover moved to ${el.dataset.status}.`); await loadScreen('/super'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="rollover-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete rollover?', message: 'Remove this rollover record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/rollovers', { id: Number(el.dataset.id) }); toast.success('Rollover deleted.'); await loadScreen('/super'); }
    catch (err) { toastError(err); }
  });

  // Off-Market Transfers
  on(root, 'click', '[data-action="omt-new"]', async () => {
    const made = await formDialog({
      title: 'New Off-Market Security Transfer',
      submitLabel: 'Submit Transfer',
      size: 'lg',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Client</span>
            <select class="k-input" name="client_id" required>
              ${state.clients.map((c) => html`<option value="${c.id}">${c.first_name} ${c.last_name}</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Delivering Platform</span>
            <select class="k-input" name="delivering_platform">${PLATFORMS.map((p) => html`<option value="${p}">${p}</option>`)}</select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">HIN or SRN</span><input class="k-input" name="hin_or_srn" placeholder="X0012345678 / I00..." required></label>
          <label class="k-field"><span class="k-field__label">Account Reference</span><input class="k-input" name="account_reference" required></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Transfer Type</span>
            <select class="k-input" name="transfer_type"><option value="Full">Full</option><option value="Partial">Partial</option></select>
          </label>
          <label class="k-field"><span class="k-field__label">CHESS Sponsorship</span>
            <select class="k-input" name="chess_sponsorship"><option value="Broker-Sponsored">Broker-Sponsored</option><option value="Issuer-Sponsored">Issuer-Sponsored</option></select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Estimated Value (AUD)</span><input class="k-input" type="number" step="100" min="0" name="estimated_value" required></label>
          <label class="k-field"><span class="k-field__label">Transfer Fee (AUD)</span><input class="k-input" type="number" step="0.50" min="0" name="transfer_fee" value="54.50"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Assets to Transfer</span><textarea class="k-input" name="assets_to_transfer" rows="2" placeholder="ASX tickers &amp; units…"></textarea></label>`,
      onSubmit: (v) => api.post('/api/transfers', { ...v, client_id: Number(v.client_id), submitted_date: today() }),
    });
    if (made) { toast.success('Off-market transfer lodged.'); await loadScreen('/transfers'); }
  });

  on(root, 'change', '[data-action="omt-status"]', async (e, el) => {
    try { await api.post('/api/transfers/status', { id: Number(el.dataset.id), status: el.value }); toast.success('Transfer status updated.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="omt-advance"]', async (e, el) => {
    try { await api.post('/api/transfers/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Transfer moved to ${el.dataset.status}.`); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="omt-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete transfer?', message: 'Remove this off-market transfer?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/transfers', { id: Number(el.dataset.id) }); toast.success('Transfer deleted.'); await loadScreen('/transfers'); }
    catch (err) { toastError(err); }
  });
}
