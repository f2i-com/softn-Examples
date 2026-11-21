// Walkers & Sitters Roster + Safety Incidents & Care Notes Log (Unified Meadow Forest Mastheads).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { ago, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const ROLES = ['Walker', 'Sitter', 'Admin'];
const AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const INCIDENT_TYPES = ['Injury', 'Escape risk', 'Aggression', 'Illness', 'No access', 'Owner note'];
const SEVS = ['Urgent', 'High', 'Medium', 'Low'];

const SEV_CLASS = { Urgent: 'pr-sev-urgent', High: 'pr-sev-high', Medium: 'pr-sev-med', Low: 'pr-sev-low' };

export function renderWalkersView(state) {
  const activeCount = state.walkers.filter((w) => w.active === 'Active').length;
  const todayVisits = state.walkers.reduce((s, w) => s + Number(w.today_walks || 0), 0);
  const weekendCount = state.walkers.filter((w) => (w.availability || []).includes('Saturday') || (w.availability || []).includes('Sunday')).length;

  return html`
    <section class="pr-masthead" aria-label="Walkers & Sitters Roster">
      <div class="pr-masthead__copy">
        <div class="pr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          FIELD TEAM · NEIGHBOURHOOD ZONES
        </div>
        <h1 class="pr-masthead__title">Walkers &amp; Sitters</h1>
        <div class="pr-masthead__meta">
          <span><strong style="color:#fed7aa">${activeCount} active walker${activeCount === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${weekendCount} with weekend cover</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live daily visit load</span>
        </div>
      </div>

      <div class="pr-masthead__pods" style="align-items:center">
        <div class="pr-pod pr-pod--terra">
          <span class="pr-pod__lbl">${icon('users', { size: 12 })} Active</span>
          <span class="pr-pod__val">${activeCount}/${state.walkers.length}</span>
          <span class="pr-pod__sub">On roster</span>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('leash-route', { size: 12 })} Visits</span>
          <span class="pr-pod__val">${todayVisits}</span>
          <span class="pr-pod__sub">Assigned today</span>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('calendar', { size: 12 })} Weekend</span>
          <span class="pr-pod__val">${weekendCount}</span>
          <span class="pr-pod__sub">Sat/Sun ready</span>
        </div>

        <button type="button" class="k-btn pr-cta-terra" data-action="walker-new">${icon('plus', { size: 15 })} Add Walker</button>
      </div>
    </section>

    ${state.loading && !state.walkers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : state.walkers.length ? html`
      <div class="pr-cards-grid">
        ${state.walkers.map((w) => html`
          <article class="tk-card" data-key="wkr-${w.id}">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="pr-owner-avatar">${initials(w.name || 'W')}</div>
              <div style="min-width:0;flex:1">
                <h2 class="tk-card__title">${w.name}</h2>
                <div class="tk-card__sub">${w.role} · ${w.today_walks || 0} visit${Number(w.today_walks) === 1 ? '' : 's'} today</div>
              </div>
              <span class="tk-tag ${w.active === 'Active' ? 'tk-tag--ok' : ''}">${w.active}</span>
            </div>
            <div class="tk-row__meta">
              ${w.phone ? html`<span>${icon('phone', { size: 13 })} ${w.phone}</span>` : ''}
              ${w.email ? html`<span>${icon('mail', { size: 13 })} ${w.email}</span>` : ''}
            </div>
            <div>
              <div class="tk-kv__k" style="margin-bottom:5px">Weekly Availability</div>
              <div class="pr-week">
                ${DAYS.map((d) => html`<span class="${cls('pr-day-chip', { 'is-on': (w.availability || []).includes(d) })}">${d.slice(0, 3)}</span>`)}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${(w.service_areas || []).map((a) => html`<span class="tk-tag tk-tag--accent">${a}</span>`)}
              ${w.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--sm" data-action="walker-edit" data-id="${w.id}">Edit</button>
              ${w.phone ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="walker-copy" data-id="${w.id}">${icon('copy', { size: 13 })} Contact</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="walker-del" data-id="${w.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'users', title: 'No walkers on roster yet', text: 'Add walkers and sitters with their service areas and weekly days.' })}
  `;
}

export function renderIncidentsView(state) {
  const openCount = state.incidents.filter((i) => i.follow_up === 'Yes').length;
  const closedCount = state.incidents.filter((i) => i.follow_up !== 'Yes').length;
  const urgentCount = state.incidents.filter((i) => i.follow_up === 'Yes' && (i.severity === 'Urgent' || i.severity === 'High')).length;
  const shown = state.incidentFilter === 'FollowUp'
    ? state.incidents.filter((i) => i.follow_up === 'Yes')
    : state.incidents;

  return html`
    <section class="pr-masthead" aria-label="Safety & Care Notes Log">
      <div class="pr-masthead__copy">
        <div class="pr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${openCount > 0 ? '#f87171' : '#34d399'}"></span>
          SAFETY &amp; WELLBEING · INCIDENT LOG
        </div>
        <h1 class="pr-masthead__title">Safety &amp; Care Notes</h1>
        <div class="pr-masthead__meta">
          <span><strong style="color:#fed7aa">${openCount} open follow-up${openCount === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Reactivity, illness &amp; owner notes</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable vet/owner reports</span>
        </div>
      </div>

      <div class="pr-masthead__pods" style="align-items:center">
        <div class="${cls('pr-pod', { 'pr-pod--alert': openCount > 0 })}">
          <span class="pr-pod__lbl">${icon('med-cross', { size: 12 })} Follow-Up</span>
          <span class="pr-pod__val">${openCount}</span>
          <span class="pr-pod__sub">${urgentCount} high/urgent</span>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('check-circle', { size: 12 })} Closed</span>
          <span class="pr-pod__val">${closedCount}</span>
          <span class="pr-pod__sub">Resolved logs</span>
        </div>

        <button type="button" class="k-btn pr-cta-terra" data-action="inc-new">${icon('plus', { size: 15 })} Log Note</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        <button type="button" class="${cls('tk-pill', { 'is-on': state.incidentFilter === 'All' })}" data-action="inc-filter" data-val="All">All (${state.incidents.length})</button>
        <button type="button" class="${cls('tk-pill', { 'is-on': state.incidentFilter === 'FollowUp' })}" data-action="inc-filter" data-val="FollowUp">Follow-up Needed (${openCount})</button>
      </div>
    </div>

    <section class="tk-sheet">
      ${state.loading && !state.incidents.length ? skeleton(3) : shown.length ? shown.map((inc) => html`
        <div class="tk-row pr-inc-row ${inc.follow_up === 'Yes' ? 'pr-inc-row--open' : ''}" data-key="inc-${inc.id}">
          <div class="tk-row__main">
            <div class="tk-row__title">
              <span>${inc.pet_name || 'Pet #' + inc.pet_id}</span>
              <span class="tk-tag ${SEV_CLASS[inc.severity] || ''}">${inc.severity}</span>
              <span class="tk-tag">${inc.incident_type}</span>
              ${inc.follow_up === 'Yes' ? html`<span class="tk-tag tk-tag--bad">Follow-up Required</span>` : html`<span class="tk-tag tk-tag--ok">Closed</span>`}
              ${inc.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div style="font-size:14px">${inc.description}</div>
            ${inc.action_taken ? html`<div style="font-size:13px;color:var(--k-success)"><strong>Action taken:</strong> ${inc.action_taken}</div>` : ''}
            <div class="tk-row__meta">
              ${inc.owner_name ? html`<span>Owner: ${inc.owner_name}${inc.owner_phone ? ' (' + inc.owner_phone + ')' : ''}</span>` : ''}
              ${inc.reported_by_name ? html`<span>Reported by: ${inc.reported_by_name}</span>` : ''}
              ${inc.walk_date ? html`<span>Walk: ${fmtDay(inc.walk_date)}</span>` : ''}
              <span>${ago(inc.created_at)}</span>
            </div>
          </div>
          <div class="tk-row__aside">
            <button type="button" class="k-btn k-btn--sm" data-action="inc-toggle-fu" data-id="${inc.id}">
              ${inc.follow_up === 'Yes' ? 'Close Follow-up ✓' : 'Flag Follow-up'}
            </button>
            <button type="button" class="k-btn k-btn--sm" data-action="inc-print" data-id="${inc.id}">${icon('printer', { size: 13 })} Report</button>
            <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="inc-del" data-id="${inc.id}">Delete</button>
          </div>
        </div>`) : emptyState({ iconName: 'shield-check', title: 'No incidents logged', text: 'All walks smooth! Log any care notes or incidents here.' })}
    </section>
  `;
}

export function wireOpsActions(root, state, { draw, loadScreen }) {
  const walkerFields = (w = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Name</span><input class="k-input" name="name" value="${w.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Role</span><select class="k-input" name="role">${ROLES.map((r) => html`<option value="${r}" ${r === (w.role || 'Walker') ? 'selected' : ''}>${r}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Active</span>
        <select class="k-input" name="active">
          <option value="Active" ${w.active !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${w.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${w.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${w.email || ''}"></label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Service Areas</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${AREAS.map((a) => html`<label class="k-check"><input type="checkbox" name="service_areas" value="${a}" ${(w.service_areas || []).includes(a) ? 'checked' : ''}><span>${a}</span></label>`)}
      </div>
    </div>
    <div class="k-field">
      <span class="k-field__label">Weekly Availability</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${DAYS.map((d) => html`<label class="k-check"><input type="checkbox" name="availability" value="${d}" ${(w.availability || []).includes(d) ? 'checked' : ''}><span>${d.slice(0, 3)}</span></label>`)}
      </div>
    </div>`;

  on(root, 'click', '[data-action="walker-new"]', async () => {
    const made = await formDialog({ title: 'Add Walker / Sitter', submitLabel: 'Save', fields: walkerFields(), onSubmit: (v) => api.post('/api/walkers', v) });
    if (made) { toast.success('Walker added.'); await loadScreen('/walkers'); }
  });
  on(root, 'click', '[data-action="walker-edit"]', async (e, el) => {
    const w = state.walkers.find((x) => String(x.id) === el.dataset.id);
    if (!w) return;
    const saved = await formDialog({ title: `Edit ${w.name}`, submitLabel: 'Save', fields: walkerFields(w), onSubmit: (v) => api.put('/api/walkers', { ...v, id: w.id }) });
    if (saved) { toast.success('Walker updated.'); await loadScreen('/walkers'); }
  });
  on(root, 'click', '[data-action="walker-copy"]', (e, el) => {
    const w = state.walkers.find((x) => String(x.id) === el.dataset.id);
    if (w) copyText(`${w.name} (${w.role})\nPhone: ${w.phone}\nEmail: ${w.email || '—'}`, { title: 'Walker Contact' });
  });
  on(root, 'click', '[data-action="walker-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove walker?', message: 'Remove this walker from the roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/walkers', { id: Number(el.dataset.id) }); toast.success('Walker removed.'); await loadScreen('/walkers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-filter"]', (e, el) => { state.incidentFilter = el.dataset.val; draw(); });

  on(root, 'click', '[data-action="inc-new"]', async () => {
    if (!state.pets.length) { const p = await api.get('/api/pets'); state.pets = p.pets || []; }
    if (!state.pets.length) { toast.error('Add a pet profile first.'); return; }
    const made = await formDialog({
      title: 'Log Incident or Care Note',
      submitLabel: 'Save Log',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Pet</span><select class="k-input" name="pet_id" required>${state.pets.map((p) => html`<option value="${p.id}">${p.name} (${p.owner_name})</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Reported By</span>
            <select class="k-input" name="reported_by_id">
              <option value="">Studio team</option>
              ${state.walkers.map((w) => html`<option value="${w.id}">${w.name}</option>`)}
            </select>
          </label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Incident Type</span><select class="k-input" name="incident_type">${INCIDENT_TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity">${SEVS.map((s) => html`<option value="${s}" ${s === 'Medium' ? 'selected' : ''}>${s}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Follow-up Needed</span><select class="k-input" name="follow_up"><option value="Yes">Yes</option><option value="No">No</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Description</span><textarea class="k-input" name="description" rows="3" required placeholder="What happened?"></textarea></label>
        <label class="k-field"><span class="k-field__label">Action Taken</span><textarea class="k-input" name="action_taken" rows="2" placeholder="Immediate care steps, owner notified, vet contacted…"></textarea></label>`,
      onSubmit: (v) => api.post('/api/incidents', { ...v, reported_by_id: v.reported_by_id ? Number(v.reported_by_id) : null }),
    });
    if (made) { toast.success('Incident logged.'); await loadScreen('/incidents'); }
  });

  on(root, 'click', '[data-action="inc-toggle-fu"]', async (e, el) => {
    try { await api.post('/api/incidents/followup', { id: Number(el.dataset.id) }); toast.success('Follow-up updated.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="inc-print"]', (e, el) => {
    const inc = state.incidents.find((x) => String(x.id) === el.dataset.id);
    if (!inc) return;
    downloadHtmlDoc(`pawroute-incident-${inc.id}.html`, {
      title: `Pet Care Incident Report · ${inc.pet_name || ''}`,
      businessName: state.session.settings.business_name,
      subtitle: `${inc.incident_type} · Severity: ${inc.severity}`,
      accent: '#1b6a48',
      bodyHtml: `<table>
        <tr><th>Pet</th><td>${inc.pet_name || ''} (${inc.breed || ''})</td></tr>
        <tr><th>Owner</th><td>${inc.owner_name || '—'} ${inc.owner_phone || ''}</td></tr>
        <tr><th>Reported By</th><td>${inc.reported_by_name || 'Studio Team'}</td></tr>
        <tr><th>Follow-up Required</th><td>${inc.follow_up}</td></tr>
      </table>
      <div class="box"><strong>Description:</strong><br>${inc.description}</div>
      ${inc.action_taken ? `<div class="box"><strong>Action Taken:</strong><br>${inc.action_taken}</div>` : ''}`,
    });
  });

  on(root, 'click', '[data-action="inc-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete incident?', message: 'Delete this care note or incident record?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/incidents', { id: Number(el.dataset.id) }); toast.success('Incident deleted.'); await loadScreen('/incidents'); }
    catch (err) { toastError(err); }
  });
}
