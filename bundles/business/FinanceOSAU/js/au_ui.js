// Shared UI components for Finance OS (AU): 5-Band Risk Meter, non-wrapping s761G/Retail pills,
// and FSG / FDS / Opt-in / BDBN compliance countdown pills.
import { html, cls } from '../kit/dom.js';
import { today, daysBetween, fmtDay } from '../kit/time.js';

export const AU_RISK_BANDS = [
  { idx: 1, name: 'Conservative', short: 'Cons.', split: '20% Growth / 80% Def.', tone: 'tk-tag--info', cardTone: 'au-rec-card--band1', desc: 'Capital preservation priority; minimal short-term drawdown tolerance.' },
  { idx: 2, name: 'Moderately Conservative', short: 'Mod. Cons.', split: '35% Growth / 65% Def.', tone: 'tk-tag--info', cardTone: 'au-rec-card--band2', desc: 'Steady income with modest capital appreciation over 3–5+ years.' },
  { idx: 3, name: 'Balanced', short: 'Balanced', split: '55% Growth / 45% Def.', tone: 'tk-tag--accent', cardTone: 'au-rec-card--band3', desc: 'Balanced long-term wealth creation and downside cushioning.' },
  { idx: 4, name: 'Growth', short: 'Growth', split: '75% Growth / 25% Def.', tone: 'tk-tag--warn', cardTone: 'au-rec-card--band4', desc: 'Strong capital growth focus; comfortable with periodic 15–20% pullbacks.' },
  { idx: 5, name: 'High Growth', short: 'High Gr.', split: '90% Growth / 10% Def.', tone: 'tk-tag--bad', cardTone: 'au-rec-card--band5', desc: 'Maximum long-term equity compounding over 10+ year horizons.' },
];

export function bandForScore(score, explicitBand = '') {
  if (explicitBand) {
    const found = AU_RISK_BANDS.find((b) => b.name === explicitBand);
    if (found) return found;
  }
  const n = Number(score || 0);
  if (n >= 83) return AU_RISK_BANDS[4];
  if (n >= 65) return AU_RISK_BANDS[3];
  if (n >= 45) return AU_RISK_BANDS[2];
  if (n >= 25) return AU_RISK_BANDS[1];
  return AU_RISK_BANDS[0];
}

/** Crisp horizontal non-wrapping Wholesale (s761G) or Retail classification pill. */
export function renderClientClassPill(wholesaleStatus, { compact = false } = {}) {
  if (wholesaleStatus === 'Yes') {
    return html`<span class="au-gold-badge" title="Wholesale Client under Corporations Act s761G"><span class="au-gold-badge__dot"></span>${compact ? 's761G' : 'Wholesale · s761G'}</span>`;
  }
  return compact
    ? html`<span class="au-retail-badge">Retail</span>`
    : html`<span class="au-retail-badge">Retail Client</span>`;
}

/** 5-Band Risk Profile Meter: compact (for list/cards) or full (for client detail & risk scorer). */
export function renderRiskBandMeter(score, { band = '', compact = false, showDesc = false, label = 'Risk Profile Band' } = {}) {
  const n = Math.min(100, Math.max(0, Number(score || 0)));
  const b = bandForScore(n, band);
  if (compact) {
    return html`
      <div class="au-risk-mini" title="${b.name} (${n}/100) · ${b.split}">
        <div class="au-risk-mini__head">
          <span class="au-risk-mini__band">${b.name}</span>
          <span class="au-risk-mini__score">${n}/100</span>
        </div>
        <div class="au-scale-bar">
          ${AU_RISK_BANDS.map((seg) => html`<div class="${cls('au-scale-seg', `au-scale-seg--${seg.idx}`, { 'is-on': seg.idx <= b.idx })}"></div>`)}
        </div>
      </div>`;
  }
  return html`
    <div class="au-meter">
      <div class="au-meter__top">
        <div>
          <div class="tk-kv__k">${label}</div>
          <div class="au-meter__band">${b.name} <span class="tk-tag ${b.tone}">${b.split}</span></div>
        </div>
        <div class="au-meter__score">${n}<span class="au-meter__score-den">/100</span></div>
      </div>
      <div class="au-scale-bar">
        ${AU_RISK_BANDS.map((seg) => html`<div class="${cls('au-scale-seg', `au-scale-seg--${seg.idx}`, { 'is-on': seg.idx <= b.idx, 'is-current': seg.idx === b.idx })}"></div>`)}
      </div>
      <div class="au-scale-labels">
        ${AU_RISK_BANDS.map((seg) => html`<span class="${cls({ 'is-current': seg.idx === b.idx })}">${seg.short}</span>`)}
      </div>
      ${showDesc ? html`<div class="tk-muted" style="font-size:13px">${b.desc}</div>` : ''}
    </div>`;
}

/** Compute status & countdown days for any statutory due/expiry date (FDS, BDBN, Review, Vault Doc). */
export function deadlineMeta(dateStr, { warnDays = 30, prefix = '' } = {}) {
  if (!dateStr) return { state: 'neutral', tone: 'au-status-pill--neutral', label: prefix ? `${prefix} · None` : 'No date', days: null };
  const diff = daysBetween(today(), dateStr);
  const head = prefix ? `${prefix} · ` : '';
  if (diff < 0) {
    return { state: 'overdue', tone: 'au-status-pill--bad', label: `${head}Overdue ${Math.abs(diff)}d`, days: diff };
  }
  if (diff === 0) {
    return { state: 'due', tone: 'au-status-pill--bad', label: `${head}Due Today`, days: 0 };
  }
  if (diff <= warnDays) {
    return { state: 'soon', tone: 'au-status-pill--warn', label: `${head}Due ${diff}d`, days: diff };
  }
  return { state: 'current', tone: 'au-status-pill--ok', label: `${head}Current · ${diff}d`, days: diff };
}

/** Render a crisp compliance status pill (FSG, FDS Opt-in, BDBN, Review). */
export function renderStatusPill(tone, text, title = '') {
  return html`<span class="au-status-pill ${tone}" title="${title}"><span class="au-status-pill__dot"></span>${text}</span>`;
}

/** FSG Compliance Status Pill for a client record. */
export function renderFsgPill(client) {
  if (client && client.fsg_acknowledged) {
    return renderStatusPill('au-status-pill--ok', 'FSG · Signed', client.fsg_ack_date ? `Signed ${fmtDay(client.fsg_ack_date)}` : 'FSG acknowledged');
  }
  return renderStatusPill('au-status-pill--bad', 'FSG · Pending', 'Financial Services Guide acknowledgement required prior to personal advice');
}

/** FDS / Annual Opt-in Compliance Status Pill with countdown days. */
export function renderFdsOptInPill(fee) {
  if (!fee) return renderStatusPill('au-status-pill--neutral', 'FDS · Not Issued');
  if (fee.ongoing_fee_consent === 'no') {
    return renderStatusPill('au-status-pill--bad', 'Opt-in · Declined');
  }
  if (fee.ongoing_fee_consent !== 'yes') {
    if (fee.renewal_due_date) {
      const d = daysBetween(today(), fee.renewal_due_date);
      if (d < 0) return renderStatusPill('au-status-pill--bad', `Opt-in Overdue · ${Math.abs(d)}d`, `Renewal due ${fmtDay(fee.renewal_due_date)}`);
      return renderStatusPill('au-status-pill--warn', `Opt-in Pending · ${d}d`, `Renewal due ${fmtDay(fee.renewal_due_date)}`);
    }
    return renderStatusPill('au-status-pill--warn', 'Opt-in · Pending');
  }
  const m = deadlineMeta(fee.renewal_due_date, { warnDays: 30, prefix: 'FDS' });
  return renderStatusPill(m.tone, m.label, fee.renewal_due_date ? `Renewal due ${fmtDay(fee.renewal_due_date)}` : '');
}
