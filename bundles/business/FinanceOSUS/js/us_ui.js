// Shared UI components for Finance OS (US): Accredited / QP / Retail pills,
// 5-Band Reg BI Risk Profile Meter, Tiered AUM Fee Breakdown Card & ACAT/Transfer status pills.
import { html, cls } from '../kit/dom.js';
import { money } from '../kit/format.js';
import { today, daysBetween, fmtDay } from '../kit/time.js';

export const US_RISK_BANDS = [
  { idx: 1, name: 'Conservative', short: 'Cons.', alloc: [25, 60, 15], tone: 'tk-tag--info', cardTone: 'us-rec-card--band1' },
  { idx: 2, name: 'Moderate Conservative', short: 'Mod. Cons.', alloc: [40, 45, 15], tone: 'tk-tag--info', cardTone: 'us-rec-card--band2' },
  { idx: 3, name: 'Moderate', short: 'Moderate', alloc: [60, 30, 10], tone: 'tk-tag--accent', cardTone: 'us-rec-card--band3' },
  { idx: 4, name: 'Growth', short: 'Growth', alloc: [75, 20, 5], tone: 'tk-tag--warn', cardTone: 'us-rec-card--band4' },
  { idx: 5, name: 'Aggressive', short: 'Aggressive', alloc: [90, 5, 5], tone: 'tk-tag--bad', cardTone: 'us-rec-card--band5' },
];

export function usBandForScore(score, explicitBand = '') {
  if (explicitBand) {
    const found = US_RISK_BANDS.find((b) => b.name === explicitBand);
    if (found) return found;
  }
  const n = Number(score || 0);
  if (n >= 82) return US_RISK_BANDS[4];
  if (n >= 65) return US_RISK_BANDS[3];
  if (n >= 45) return US_RISK_BANDS[2];
  if (n >= 25) return US_RISK_BANDS[1];
  return US_RISK_BANDS[0];
}

/** Crisp non-wrapping investor tier pill: Qualified Purchaser (QP), Accredited, or Retail. */
export function renderInvestorTierPill(client, { compact = false } = {}) {
  const nw = Number(client?.net_worth_cents || 0);
  const liq = Number(client?.liquid_net_worth_cents || 0);
  const isQp = liq >= 500000000 || nw >= 500000000;
  if (isQp) {
    return html`<span class="us-qp-badge" title="Qualified Purchaser — Investment Company Act §2(a)(51) ($5M+ investments)"><span class="us-badge-dot"></span>${compact ? 'QP' : 'Qualified Purchaser (QP)'}</span>`;
  }
  if (client?.accredited_investor === 'Yes') {
    return html`<span class="us-bronze-badge" title="Accredited Investor — SEC Rule 501(a)"><span class="us-badge-dot"></span>${compact ? 'Accredited' : 'Accredited · 501(a)'}</span>`;
  }
  return html`<span class="us-retail-badge">${compact ? 'Retail' : 'Retail Investor'}</span>`;
}

/** 5-Band Reg BI Risk Profile Meter: compact (client cards/lists) or full (detail & scorer). */
export function renderUsRiskMeter(score, { band = '', alloc = null, regBi = '', compact = false, label = '5-Band Reg BI Risk Profile' } = {}) {
  const n = Math.min(100, Math.max(0, Number(score || 0)));
  const b = usBandForScore(n, band);
  const mix = Array.isArray(alloc) && alloc.length === 3 ? alloc : b.alloc;
  if (compact) {
    return html`
      <div class="us-risk-mini" title="${b.name} (${n}/100) · Mix ${mix.join('/')}">
        <div class="us-risk-mini__head">
          <span class="us-risk-mini__band">${b.name}</span>
          <span class="us-risk-mini__score">${n}/100 · ${mix.join('/')}</span>
        </div>
        <div class="us-scale-bar">
          ${US_RISK_BANDS.map((seg) => html`<div class="${cls('us-scale-seg', `us-scale-seg--${seg.idx}`, { 'is-on': seg.idx <= b.idx })}"></div>`)}
        </div>
      </div>`;
  }
  return html`
    <div class="us-risk-panel">
      <div class="us-risk-panel__head">
        <div>
          <div class="tk-kv__k">${label}</div>
          <div style="font-size:16px;font-weight:750;display:flex;flex-wrap:wrap;align-items:center;gap:7px">
            <span>${b.name}</span>
            ${regBi ? html`<span class="us-status-pill ${regBi === 'Suitable' ? 'us-status-pill--ok' : 'us-status-pill--bad'}"><span class="us-status-pill__dot"></span>Reg BI: ${regBi}</span>` : ''}
          </div>
        </div>
        <div class="us-risk-panel__score">${n}<span style="font-size:14px;color:var(--k-muted)">/100</span></div>
      </div>
      <div class="us-scale-bar">
        ${US_RISK_BANDS.map((seg) => html`<div class="${cls('us-scale-seg', `us-scale-seg--${seg.idx}`, { 'is-on': seg.idx <= b.idx, 'is-current': seg.idx === b.idx })}"></div>`)}
      </div>
      <div class="us-scale-labels">
        ${US_RISK_BANDS.map((seg) => html`<span class="${cls({ 'is-current': seg.idx === b.idx })}">${seg.short}</span>`)}
      </div>
      <div class="us-alloc-bar">
        <div class="us-alloc-eq" style="width:${mix[0]}%" title="Equity ${mix[0]}%"></div>
        <div class="us-alloc-bd" style="width:${mix[1]}%" title="Fixed Income ${mix[1]}%"></div>
        <div class="us-alloc-cs" style="width:${mix[2]}%" title="Cash ${mix[2]}%"></div>
      </div>
      <div class="tk-muted" style="font-size:12.5px">Target Equity / Bond / Cash: <strong>${mix.join('/')}</strong> (${mix[0]}% Equity · ${mix[1]}% Fixed Income · ${mix[2]}% Cash)</div>
    </div>`;
}

/** Calculate progressive marginal AUM fees across Standard, Premium, or Institutional tiers. */
export function computeTieredAumFee(accountValueDollars, feeTier = 'Standard') {
  const aumCents = Math.round(Math.max(0, Number(accountValueDollars || 0)) * 100);
  const tier = feeTier || 'Standard';
  const brackets = tier === 'Institutional'
    ? [
      { cap: 100000000, rate: 0.0055, bps: 55, label: 'First $1,000,000 @ 0.55% (55 bps)' },
      { cap: Infinity, rate: 0.0040, bps: 40, label: 'Above $1,000,000 @ 0.40% (40 bps)' },
    ]
    : tier === 'Premium'
      ? [
        { cap: 50000000, rate: 0.0085, bps: 85, label: 'First $500,000 @ 0.85% (85 bps)' },
        { cap: 100000000, rate: 0.0070, bps: 70, label: 'Next $500,000 @ 0.70% (70 bps)' },
        { cap: Infinity, rate: 0.0055, bps: 55, label: 'Above $1,000,000 @ 0.55% (55 bps)' },
      ]
      : [
        { cap: 50000000, rate: 0.0100, bps: 100, label: 'First $500,000 @ 1.00% (100 bps)' },
        { cap: 100000000, rate: 0.0085, bps: 85, label: 'Next $500,000 @ 0.85% (85 bps)' },
        { cap: Infinity, rate: 0.0070, bps: 70, label: 'Above $1,000,000 @ 0.70% (70 bps)' },
      ];
  let prev = 0;
  let annual = 0;
  const breakdown = [];
  for (const b of brackets) {
    if (aumCents <= prev) break;
    const slice = b.cap === Infinity ? (aumCents - prev) : Math.min(aumCents, b.cap) - prev;
    if (slice > 0) {
      const fee = Math.round(slice * b.rate);
      annual += fee;
      breakdown.push({
        bracket: b.label,
        bps: b.bps,
        slice_cents: slice,
        share_pct: aumCents > 0 ? Math.round((slice / aumCents) * 100) : 0,
        fee_cents: fee,
        quarterly_cents: Math.round(fee / 4),
      });
    }
    prev = b.cap;
  }
  const topRateAnnual = Math.round(aumCents * brackets[0].rate);
  const tierSavings = Math.max(0, topRateAnnual - annual);
  const effBps = aumCents > 0 ? Math.round((annual / aumCents) * 100000) / 10 : 0;
  return {
    aumCents,
    tier,
    annual,
    quarterly: Math.round(annual / 4),
    monthly: Math.round(annual / 12),
    effBps,
    tierSavings,
    breakdown,
  };
}

/** Transparent live Tiered AUM Fee Breakdown Card. */
export function renderTieredFeeCard(calc, { currency = 'USD', title = 'Progressive Tiered AUM Breakdown' } = {}) {
  return html`
    <div class="us-fee-card">
      <div class="us-fee-hero">
        <div class="us-fee-hero__kicker">
          <span>${calc.tier} Tier · Blended ${calc.effBps.toFixed(1)} bps (${(calc.effBps / 100).toFixed(3)}%)</span>
          <span>AUM ${money(calc.aumCents, { currency })}</span>
        </div>
        <div class="us-fee-hero__amt">${money(calc.annual, { currency })} <span style="font-size:15px;font-weight:500">/ year</span></div>
        <div class="us-fee-hero__meta">
          <span>Quarterly: <strong>${money(calc.quarterly, { currency })}</strong></span>
          <span>Monthly: <strong>${money(calc.monthly, { currency })}</strong></span>
          ${calc.tierSavings > 0 ? html`<span class="us-fee-savings-pill">Breakpoint Savings ${money(calc.tierSavings, { currency })}/yr</span>` : ''}
        </div>
      </div>
      <div class="us-tier-list">
        <div class="tk-kv__k">${title}</div>
        ${calc.breakdown.length ? calc.breakdown.map((b) => html`
          <div class="us-tier-item">
            <div class="us-tier-row">
              <span>${b.bracket} <span class="tk-muted">(${money(b.slice_cents, { currency })})</span></span>
              <span class="us-tier-row__vals">
                <strong>${money(b.fee_cents, { currency })}/yr</strong>
                <span class="tk-muted" style="font-size:12px">${money(b.quarterly_cents, { currency })}/qtr</span>
              </span>
            </div>
            <div class="us-tier-bar"><div class="us-tier-bar__fill" style="width:${Math.max(4, b.share_pct)}%"></div></div>
          </div>`) : html`<div class="tk-muted">Enter managed AUM above $0 to calculate progressive brackets.</div>`}
        <div class="us-tier-foot">
          <span>Blended advisory fee across ${calc.breakdown.length} active bracket${calc.breakdown.length === 1 ? '' : 's'}</span>
          <span><strong>${money(calc.quarterly, { currency })}</strong> billed quarterly</span>
        </div>
      </div>
    </div>`;
}

/** Crisp non-wrapping status pill for ACAT / Wire / Rollover / 1035 transfers. */
export function renderTransferStatusPill(status, prefix = '') {
  const s = String(status || '');
  let tone = 'us-status-pill--info';
  if (s === 'Settled' || s === 'Funded' || s === 'Completed') tone = 'us-status-pill--ok';
  else if (s === 'Rejected' || s === 'Cancelled') tone = 'us-status-pill--bad';
  else if (s === 'Custodian Pending' || s === 'Reviewing' || s === 'Carrier Transfer') tone = 'us-status-pill--warn';
  return html`<span class="us-status-pill ${tone}"><span class="us-status-pill__dot"></span>${prefix ? `${prefix} · ` : ''}${s}</span>`;
}

/** Countdown status pill for reviews, vault docs, and 60-day indirect rollovers. */
export function renderUsDeadlinePill(dateStr, { warnDays = 30, prefix = '' } = {}) {
  if (!dateStr) return html`<span class="us-status-pill us-status-pill--neutral">${prefix ? `${prefix} · ` : ''}No expiry</span>`;
  const diff = daysBetween(today(), dateStr);
  const head = prefix ? `${prefix} · ` : '';
  if (diff < 0) return html`<span class="us-status-pill us-status-pill--bad" title="${fmtDay(dateStr)}"><span class="us-status-pill__dot"></span>${head}Overdue ${Math.abs(diff)}d</span>`;
  if (diff === 0) return html`<span class="us-status-pill us-status-pill--bad" title="${fmtDay(dateStr)}"><span class="us-status-pill__dot"></span>${head}Due Today</span>`;
  if (diff <= warnDays) return html`<span class="us-status-pill us-status-pill--warn" title="${fmtDay(dateStr)}"><span class="us-status-pill__dot"></span>${head}Due ${diff}d</span>`;
  return html`<span class="us-status-pill us-status-pill--ok" title="${fmtDay(dateStr)}"><span class="us-status-pill__dot"></span>${head}Current · ${diff}d</span>`;
}
