// Safety & Quality Command: Industrial Safety Slate, High-Vis Amber & Certified Emerald Masthead
// with Audit/Compliance Readiness Ring, Two-Column Workspace (5x5 Risk Heat Map, Severity-Banded Hazard & Incident Cards)
// and Sticky Operational Rail (Open CAPA 1-click Verify, Expiring Training/Contractors & ISO Quality Pulse).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, emptyState, skeleton } from '../../kit/ui.js';
import { renderSampleBanner } from '../../kit/turnkey.js';
import {
  renderRiskMatrix,
  renderIncidentBadges,
  renderWorkflowStepper,
  renderCapaDuePill,
  trainingTrafficMeta,
  renderTrafficPill,
} from '../ohs_ui.js';

const INC_STAGES = ['Reported', 'Investigating', 'Actions Assigned', 'Closed'];

function computeReadiness(training, hazards, counts) {
  const list = training || [];
  const metas = list.map((r) => trainingTrafficMeta(r.expiry_date));
  const expiredCerts = metas.filter((m) => m.light === 'red').length;
  const validCerts = list.length - expiredCerts;
  const certPct = list.length ? (validCerts / list.length) * 100 : 100;

  const hazList = hazards || [];
  const openHigh = Number(counts.highHazards || 0);
  const hazPct = hazList.length ? Math.max(0, ((hazList.length - openHigh) / hazList.length) * 100) : 100;

  const overdue = Number(counts.overdueCapas || 0);
  const openCapas = Number(counts.openCapas || 0);
  const capaPct = openCapas > 0 ? Math.max(0, ((openCapas - overdue) / openCapas) * 100) : 100;

  const pct = Math.round(certPct * 0.45 + capaPct * 0.35 + hazPct * 0.2);
  const color = pct >= 85 && overdue === 0 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
  const label = pct >= 85 && overdue === 0 ? 'Audit Ready' : overdue > 0 ? 'Action Needed' : 'Monitor';
  const sub = `${validCerts}/${list.length} certs · ${overdue} overdue`;
  return { pct, color, label, sub, validCerts, totalCerts: list.length };
}

function severityBand(sev, isLti) {
  if (isLti || sev === 'Critical') return 'ohs-band--critical';
  if (sev === 'High') return 'ohs-band--high';
  if (sev === 'Medium') return 'ohs-band--medium';
  return 'ohs-band--low';
}

function hazardBand(rating) {
  const r = String(rating || 'Low').toLowerCase();
  if (r === 'extreme') return 'ohs-band--extreme';
  if (r === 'high') return 'ohs-band--high';
  if (r === 'medium') return 'ohs-band--medium';
  return 'ohs-band--low';
}

export function renderCommandView(state) {
  const cmd = state.command;
  const settings = state.session.settings || {};
  const counts = (cmd && cmd.counts) || state.session.counts || {};
  const openInc = (cmd && cmd.openIncidents) || [];
  const highHaz = (cmd && cmd.extremeHazards) || [];
  const openCapas = (cmd && cmd.openCapas) || [];
  const expTrain = (cmd && cmd.expiringTraining) || [];
  const expCon = (cmd && cmd.expiringContractors) || [];
  const openNcrs = (cmd && cmd.openNcrs) || [];
  const openCars = (cmd && cmd.openCars) || [];
  const initialLoad = state.loading && !cmd;
  const todayDay = today();

  const openIncCount = Number(counts.openIncidents || 0);
  const ltiCount = Number(counts.ltiCount || 0);
  const isZeroHarm = openIncCount === 0 && ltiCount === 0;
  const eyebrowCls = isZeroHarm
    ? 'ohs-masthead__eyebrow ohs-masthead__eyebrow--ok'
    : ltiCount > 0
      ? 'ohs-masthead__eyebrow ohs-masthead__eyebrow--alert'
      : 'ohs-masthead__eyebrow';
  const statusDot = isZeroHarm ? '#10b981' : ltiCount > 0 ? '#ef4444' : '#f59e0b';
  const eyebrowText = initialLoad
    ? 'SYNCING TELEMETRY'
    : isZeroHarm
      ? 'ZERO-HARM ACTIVE'
      : ltiCount > 0
        ? `${openIncCount} OPEN · ${ltiCount} LTI ALERT`
        : `${openIncCount} OPEN INCIDENT${openIncCount === 1 ? '' : 'S'}`;

  const readiness = computeReadiness(state.training, state.hazards, counts);
  const expTotal = (counts.expiringTraining || 0) + (counts.expiringContractors || 0);

  return html`
    ${renderSampleBanner(counts.sampleCount || 0)}

    <section class="ohs-masthead" aria-label="Safety & Quality Command">
      <div class="ohs-masthead__copy">
        <div class="${eyebrowCls}">
          <span class="tk-pulse-dot" style="--dot:${statusDot}"></span>
          ${eyebrowText}
        </div>
        <h1 class="ohs-masthead__title">Safety &amp; Quality Command</h1>
        <div class="ohs-masthead__meta">
          <span><strong style="color:#fde68a">${settings.iso_cert_ref || 'ISO 45001 · ISO 9001'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${state.hazards.length} hazard${state.hazards.length === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${counts.openQuality || 0} CAR/NCR</span>
        </div>
      </div>

      <div class="ohs-masthead__pods" style="align-items:center">
        <div class="ohs-pod ohs-pod--ring ohs-pod--emerald" aria-label="Compliance readiness ${readiness.pct}%">
          <div class="tk-ring" style="--p:${initialLoad ? 0 : readiness.pct}%;--ring-color:${readiness.color};--ring-size:48px">
            <span class="tk-ring__val">${initialLoad ? '…' : `${readiness.pct}%`}</span>
          </div>
          <div style="display:grid;gap:1px;min-width:0">
            <span class="ohs-pod__lbl">Audit Readiness</span>
            <span class="ohs-pod__val" style="font-size:16px">${initialLoad ? 'Syncing…' : readiness.label}</span>
            <span class="ohs-pod__sub">${initialLoad ? 'Checking matrix' : readiness.sub}</span>
          </div>
        </div>

        <a href="#/incidents" class="${cls('ohs-pod', { 'ohs-pod--alert': openIncCount > 0 || ltiCount > 0 })}">
          <span class="ohs-pod__lbl">${icon('safety-beacon', { size: 12 })} Incidents</span>
          <span class="ohs-pod__val">${initialLoad ? '—' : openIncCount}</span>
          <span class="ohs-pod__sub">${ltiCount} LTI · Open →</span>
        </a>

        <a href="#/hazards" class="${cls('ohs-pod', { 'ohs-pod--amber': (counts.highHazards || 0) > 0 })}">
          <span class="ohs-pod__lbl">${icon('hazard-matrix', { size: 12 })} High Risk</span>
          <span class="ohs-pod__val">${initialLoad ? '—' : (counts.highHazards || 0)}</span>
          <span class="ohs-pod__sub">5×5 matrix →</span>
        </a>

        <a href="#/capa" class="${cls('ohs-pod ohs-pod--banner-sm', { 'ohs-pod--alert': (counts.overdueCapas || 0) > 0 })}">
          <span class="ohs-pod__lbl">${icon('check-square', { size: 12 })} CAPAs</span>
          <span class="ohs-pod__val">${initialLoad ? '—' : (counts.openCapas || 0)}</span>
          <span class="ohs-pod__sub">${counts.overdueCapas || 0} overdue →</span>
        </a>

        <div class="ohs-cta-group" style="display:flex;gap:8px;align-items:center">
          <a href="#/incidents" class="k-btn ohs-btn-amber">${icon('alert', { size: 15 })} Log Incident</a>
        </div>
      </div>
    </section>

    ${initialLoad ? html`
      <div class="ohs-split">
        <section class="tk-sheet">${skeleton(5)}</section>
        <section class="tk-sheet">${skeleton(4)}</section>
      </div>` : html`
      <div class="ohs-split">
        <div class="tk-stack" style="gap:16px">
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('hazard-matrix', { size: 18 })} Live 5×5 Risk Heat Map</h2>
              <span class="tk-sheet__count">${state.hazards.length} hazards</span>
              <div class="tk-sheet__actions"><a href="#/hazards" class="k-btn k-btn--ghost k-btn--sm">Full Register →</a></div>
            </div>
            <div class="tk-sheet__body">
              ${renderRiskMatrix(state.hazards, { compact: true, action: 'cmd-rm-jump' })}
              <div class="tk-muted" style="font-size:12px;margin-top:9px">Tap any Likelihood × Consequence cell to jump straight to filtered hazards.</div>
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('alert', { size: 18 })} Extreme &amp; High Risk Hazards</h2>
              <span class="tk-sheet__count">${highHaz.length}</span>
              <div class="tk-sheet__actions"><a href="#/hazards" class="k-btn k-btn--ghost k-btn--sm">Assess Hazard</a></div>
            </div>
            <div class="tk-sheet__body">
              ${highHaz.length ? html`
                <div class="ohs-card-list">
                  ${highHaz.map((h) => {
                    const residPct = h.risk_score > 0 ? Math.min(100, Math.round((Number(h.residual_risk || 0) / 25) * 100)) : 0;
                    const fillCls = h.residual_risk >= 10 ? 'tk-bar__fill--bad' : h.residual_risk >= 5 ? 'tk-bar__fill--warn' : 'tk-bar__fill--ok';
                    return html`
                      <article class="ohs-haz-card ${hazardBand(h.risk_rating)}" data-key="ch-${h.id}">
                        <div class="ohs-card__top">
                          <div class="ohs-card__head">
                            <div class="ohs-card__title">
                              <span>${h.hazard_title}</span>
                              <span class="tk-tag ${h.risk_rating === 'Extreme' ? 'ohs-risk-extreme' : 'ohs-risk-high'}">${h.risk_rating} · ${h.risk_score}</span>
                              <span class="tk-tag">${h.hazard_type}</span>
                            </div>
                            <div class="ohs-card__meta">
                              <span>Location: <strong>${h.location}</strong></span>
                              <span>L${h.likelihood} × C${h.consequence}</span>
                              <span>Control: <strong>${h.control_type}</strong></span>
                            </div>
                          </div>
                          <div class="ohs-card__actions">
                            <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cmd-control-hazard" data-id="${h.id}">${icon('shield-check', { size: 13 })} Mark Controlled</button>
                          </div>
                        </div>
                        <div class="ohs-risk-meter">
                          <div class="ohs-risk-meter__head">
                            <span>Inherent ${h.risk_score}/25 → Residual <strong style="color:var(--k-text)">${h.residual_risk}/25</strong></span>
                            <span>${h.control_description ? h.control_description.slice(0, 64) + (h.control_description.length > 64 ? '…' : '') : h.control_type}</span>
                          </div>
                          <div class="tk-bar"><div class="tk-bar__fill ${fillCls}" style="width:${residPct}%"></div></div>
                        </div>
                      </article>`;
                  })}
                </div>` : emptyState({ iconName: 'shield-check', title: 'Zero open Extreme/High hazards', text: 'All high-scoring site hazards are controlled.' })}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h2 class="tk-sheet__title">${icon('safety-beacon', { size: 18 })} Open Safety Incidents</h2>
              <span class="tk-sheet__count">${openInc.length}</span>
              <div class="tk-sheet__actions"><a href="#/incidents" class="k-btn k-btn--ghost k-btn--sm">Incident Register →</a></div>
            </div>
            <div class="tk-sheet__body">
              ${openInc.length ? html`
                <div class="ohs-card-list">
                  ${openInc.map((i) => html`
                    <article class="ohs-inc-card ${severityBand(i.severity, i.lost_time_injury)}" data-key="ci-${i.id}">
                      <div class="ohs-card__top">
                        <div class="ohs-card__head">
                          <div class="ohs-card__title">
                            <span class="ohs-code">${i.incident_code}</span>
                            <span>${i.incident_title}</span>
                            ${renderIncidentBadges(i)}
                          </div>
                          <div class="ohs-card__meta">
                            <span>${fmtDay(i.incident_date)} · ${i.incident_time}</span>
                            <span>Location: <strong>${i.location}</strong></span>
                            <span>Reported by ${i.reported_by}</span>
                          </div>
                        </div>
                        <div class="ohs-card__actions">
                          <a href="#/incidents" class="k-btn k-btn--sm">Investigate →</a>
                        </div>
                      </div>
                      ${renderWorkflowStepper(INC_STAGES, i.investigation_status)}
                    </article>`)}
                </div>` : emptyState({ iconName: 'shield-check', title: 'Zero open incidents', text: 'All workplace incident investigations are closed.' })}
            </div>
          </section>
        </div>

        <aside class="ohs-rail-panel" aria-label="CAPA, Expiring Credentials & Quality Pulse">
          <section class="ohs-rail-card">
            <div class="ohs-rail-card__head">
              <span class="ohs-rail-card__title">${icon('check-square', { size: 14 })} CAPA Action Queue</span>
              <a href="#/capa" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Board (${openCapas.length})</a>
            </div>
            ${openCapas.length ? html`
              <div class="ohs-rail-list">
                ${openCapas.slice(0, 5).map((a) => {
                  const isOver = a.due_date && a.due_date < todayDay;
                  return html`
                    <div class="ohs-rail-item ${isOver ? 'ohs-rail-item--red' : 'ohs-rail-item--amber'}" data-key="ca-${a.id}">
                      <div class="ohs-rail-item__top">
                        <div>
                          <div class="ohs-rail-item__name">${a.action_title}</div>
                          <div class="ohs-rail-item__sub">${a.assigned_to} · ${a.source_type} ${a.source_ref}</div>
                        </div>
                      </div>
                      <div class="ohs-rail-item__foot">
                        ${renderCapaDuePill(a.due_date, a.status)}
                        <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="cmd-verify-capa" data-id="${a.id}">Verify Closed ✓</button>
                      </div>
                    </div>`;
                })}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All CAPA actions verified closed ✓</div>`}
          </section>

          <section class="ohs-rail-card">
            <div class="ohs-rail-card__head">
              <span class="ohs-rail-card__title">${icon('award', { size: 14 })} Expiring Credentials</span>
              <a href="#/training" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Matrix (${expTotal})</a>
            </div>
            ${(expTrain.length + expCon.length) > 0 ? html`
              <div class="ohs-rail-list">
                ${expTrain.slice(0, 4).map((tr) => {
                  const tl = trainingTrafficMeta(tr.expiry_date);
                  return html`
                    <div class="ohs-rail-item ohs-rail-item--${tl.light}" data-key="ct-${tr.id}">
                      <div class="ohs-rail-item__top">
                        <div>
                          <div class="ohs-rail-item__name">${tr.employee_name}</div>
                          <div class="ohs-rail-item__sub">${tr.course_name}</div>
                        </div>
                        ${renderTrafficPill(tl)}
                      </div>
                      <div class="ohs-rail-item__sub">Expires ${fmtDay(tr.expiry_date)} · Mandatory: <strong>${tr.is_mandatory}</strong></div>
                    </div>`;
                })}
                ${expCon.slice(0, 3).map((c) => {
                  const tl = c.public_liability !== 'Yes'
                    ? { light: 'red', label: 'No Insurance' }
                    : trainingTrafficMeta(c.approval_expiry);
                  return html`
                    <div class="ohs-rail-item ohs-rail-item--${tl.light}" data-key="cc-${c.id}">
                      <div class="ohs-rail-item__top">
                        <div>
                          <div class="ohs-rail-item__name">${c.business_name}</div>
                          <div class="ohs-rail-item__sub">Contractor · ABN ${c.abn}</div>
                        </div>
                        ${renderTrafficPill(tl)}
                      </div>
                    </div>`;
                })}
              </div>` : html`<div style="padding:14px;font-size:13px;color:var(--k-muted)">All certifications &amp; contractor insurances current ✓</div>`}
          </section>

          <section class="ohs-rail-card">
            <div class="ohs-rail-card__head">
              <span class="ohs-rail-card__title">${icon('iso-seal', { size: 14 })} ISO Registers &amp; Site</span>
            </div>
            <div>
              <a href="#/quality" class="ohs-pulse-row">
                <span style="display:inline-flex;align-items:center;gap:8px;font-weight:650">${icon('clipboard', { size: 15 })} Open CARs &amp; NCRs</span>
                <span class="tk-tag ${(openCars.length + openNcrs.length) > 0 ? 'tk-tag--warn' : 'tk-tag--ok'}">${openCars.length + openNcrs.length} open</span>
              </a>
              <a href="#/training" class="ohs-pulse-row">
                <span style="display:inline-flex;align-items:center;gap:8px;font-weight:650">${icon('award', { size: 15 })} Training Matrix</span>
                <span class="tk-tag ${expTotal > 0 ? 'tk-tag--bad' : 'tk-tag--ok'}">${readiness.validCerts}/${readiness.totalCerts} valid</span>
              </a>
              <a href="#/site" class="ohs-pulse-row">
                <span style="display:inline-flex;align-items:center;gap:8px;font-weight:650">${icon('wrench', { size: 15 })} Plant &amp; Toolbox Talks</span>
                <span class="tk-tag ${(counts.plantDue || 0) > 0 ? 'tk-tag--warn' : 'tk-tag--ok'}">${counts.plantDue || 0} service due</span>
              </a>
            </div>
          </section>
        </aside>
      </div>`}`;
}

export function wireCommandActions(root, state, { loadScreen, go }) {
  on(root, 'click', '[data-action="cmd-rm-jump"]', (e, el) => {
    state.matrixCell = { l: Number(el.dataset.l), c: Number(el.dataset.c) };
    state.hazardRatingFilter = 'All';
    go('/hazards');
  });

  on(root, 'click', '[data-action="cmd-control-hazard"]', async (e, el) => {
    try { await api.post('/api/hazards/status', { id: Number(el.dataset.id), status: 'Controlled' }); toast.success('Hazard marked Controlled.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="cmd-verify-capa"]', async (e, el) => {
    try { await api.post('/api/actions/status', { id: Number(el.dataset.id), status: 'Verified Closed' }); toast.success('CAPA verified closed.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });
}
