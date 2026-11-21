// Clients Directory (Unified Masthead + Monogrammed Access Vault Cards)
// + Cleaning Teams Roster (Unified Masthead + Colour-Coded Quality Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { openJobForm, crewPalette, crewStyle, teamQualityStats, renderStars } from './dispatch.js';

const CLIENT_TYPES = ['Residential', 'Commercial', 'Airbnb', 'Office'];
const BILLING = ['Up to date', 'Pending', 'Overdue'];
const SERVICE_AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];

const BILLING_TONE = { 'Up to date': 'tk-tag--ok', Pending: 'tk-tag--warn', Overdue: 'tk-tag--bad' };
const TYPE_CARD_CLS = {
  Commercial: 'cs-client-card--commercial',
  Airbnb: 'cs-client-card--airbnb',
  Office: 'cs-client-card--office',
};

export function renderClientsView(state) {
  const q = (state.clientSearch || '').trim().toLowerCase();
  const list = state.clients.filter((c) => {
    if (state.clientTypeFilter !== 'All' && c.client_type !== state.clientTypeFilter) return false;
    if (state.clientBillingFilter !== 'All' && c.billing_status !== state.clientBillingFilter) return false;
    if (q && !`${c.client_name} ${c.address} ${c.phone} ${c.access_instructions}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const overdueCount = state.clients.filter((c) => c.billing_status === 'Overdue').length;
  const withAccess = state.clients.filter((c) => Boolean((c.access_instructions || '').trim())).length;
  const totalJobs = state.clients.reduce((s, c) => s + Number(c.job_count || 0), 0);

  return html`
    <section class="cs-masthead" aria-label="Clients Directory Command">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#22d3ee"></span>
          SITE ACCESS VAULT · CLIENT DIRECTORY
        </div>
        <h1 class="cs-masthead__title">Clients &amp; Key Access</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${state.clients.length} client${state.clients.length === 1 ? '' : 's'}</strong> on file</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${withAccess} with key &amp; alarm codes</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap copy to crew phones</span>
        </div>
      </div>

      <div class="cs-masthead__pods" style="align-items:center">
        <div class="cs-pod cs-pod--aqua">
          <span class="cs-pod__lbl">${icon('users', { size: 12 })} Accounts</span>
          <span class="cs-pod__val">${state.clients.length}</span>
          <span class="cs-pod__sub">${totalJobs} linked cleans</span>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('key', { size: 12 })} Key Codes</span>
          <span class="cs-pod__val">${withAccess}/${state.clients.length}</span>
          <span class="cs-pod__sub">Access documented</span>
        </div>

        <div class="${cls('cs-pod', { 'cs-pod--alert': overdueCount > 0 })}">
          <span class="cs-pod__lbl">${icon(overdueCount > 0 ? 'alert' : 'check-circle', { size: 12 })} Billing</span>
          <span class="cs-pod__val">${overdueCount}</span>
          <span class="cs-pod__sub">${overdueCount > 0 ? 'Overdue account' : 'All current'}</span>
        </div>

        <button type="button" class="k-btn cs-cta-bright" data-action="client-new">${icon('plus', { size: 15 })} Add Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input placeholder="Search client, address, phone or code…" value="${state.clientSearch}" data-action="client-search">
      </label>
      <div class="tk-segmented">
        ${['All', ...CLIENT_TYPES].map((tp) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.clientTypeFilter === tp })}" data-action="client-type-filter" data-val="${tp}">${tp}</button>`)}
      </div>
      <div class="tk-segmented">
        ${['All', ...BILLING].map((b) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.clientBillingFilter === b })}" data-action="client-bill-filter" data-val="${b}">${b === 'All' ? 'Any Billing' : b}</button>`)}
      </div>
    </div>

    ${state.loading && !state.clients.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : list.length ? html`
      <div class="cs-client-grid">
        ${list.map((c) => html`
          <article class="cs-client-card ${TYPE_CARD_CLS[c.client_type] || ''}" data-key="client-${c.id}">
            <div class="cs-client-card__head">
              <div class="cs-client-avatar">${initials(c.client_name || 'CL')}</div>
              <div style="min-width:0;flex:1">
                <div style="font-weight:750;font-size:15px;line-height:1.25">${c.client_name}</div>
                <div class="tk-muted" style="font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.address || 'No street address'}</div>
              </div>
              <span class="tk-tag ${BILLING_TONE[c.billing_status] || ''}">${c.billing_status}</span>
            </div>
            <div class="cs-client-card__body">
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                <span class="tk-tag tk-tag--accent">${c.client_type}</span>
                <span class="tk-tag">${c.job_count || 0} clean${Number(c.job_count) === 1 ? '' : 's'}</span>
                ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              <div class="tk-row__meta">
                ${c.phone ? html`<span>${icon('phone', { size: 13 })} ${c.phone}</span>` : ''}
                ${c.email ? html`<span>${icon('mail', { size: 13 })} ${c.email}</span>` : ''}
              </div>
              ${c.access_instructions ? html`
                <button type="button" class="cs-access-chip" data-action="client-copy-access" data-id="${c.id}">
                  <span class="cs-access-chip__icon">${icon('key', { size: 13 })}</span>
                  <span class="cs-access-chip__body">
                    <span class="cs-access-chip__k">Key / Lockbox / Alarm</span>
                    <span class="cs-access-chip__v">${c.access_instructions}</span>
                  </span>
                  <span class="cs-access-chip__copy">${icon('copy', { size: 11 })} Copy</span>
                </button>` : html`
                <div class="cs-access-chip cs-access-chip--empty">${icon('key', { size: 13 })} <span>No access instructions saved yet</span></div>`}
              ${c.notes ? html`<div class="tk-muted" style="font-size:12.5px"><strong>Notes:</strong> ${c.notes}</div>` : ''}
            </div>
            <div class="cs-client-card__foot">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="client-book" data-id="${c.id}">${icon('calendar', { size: 13 })} Book Clean</button>
              <div class="tk-btn-row">
                <button type="button" class="k-btn k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="client-del" data-id="${c.id}">Delete</button>
              </div>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'users', title: 'No clients match your filter', text: 'Add a residential, commercial, office or Airbnb client to schedule cleaning crews.' })}
  `;
}

export function renderTeamsView(state) {
  const activeCount = state.teams.filter((tm) => tm.active === 'Active').length;
  const totalTodayJobs = state.teams.reduce((s, tm) => s + Number(tm.today_jobs || 0), 0);
  const totalTodayHrs = state.teams.reduce((s, tm) => s + Number(tm.today_hours || 0), 0);
  const avgScore = state.checks.length
    ? state.checks.reduce((s, q) => s + Number(q.rating || 0), 0) / state.checks.length
    : 0;
  const avgPct = Math.round((avgScore / 5) * 100);

  return html`
    <section class="cs-masthead" aria-label="Cleaning Teams Roster">
      <div class="cs-masthead__copy">
        <div class="cs-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          FLEET ROSTER · CREWS &amp; VANS
        </div>
        <h1 class="cs-masthead__title">Cleaning Teams</h1>
        <div class="cs-masthead__meta">
          <span><strong style="color:#a5f3fc">${activeCount} active crew${activeCount === 1 ? '' : 's'}</strong> deployed</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${totalTodayJobs} cleans (${totalTodayHrs}h) today</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live quality score per crew</span>
        </div>
      </div>

      <div class="cs-masthead__pods cs-masthead__pods--3" style="align-items:center">
        <div class="cs-pod cs-pod--ring cs-pod--aqua">
          <div class="tk-ring" style="--p:${avgPct}%;--ring-color:#34d399;--ring-size:48px">
            <span class="tk-ring__val">${avgScore ? avgScore.toFixed(1) : '—'}</span>
          </div>
          <div>
            <span class="cs-pod__lbl">Fleet Quality</span>
            <span class="cs-pod__val">${avgScore ? avgScore.toFixed(1) + ' ★' : 'No audits'}</span>
            <span class="cs-pod__sub">${state.checks.length} checks</span>
          </div>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('crew-van', { size: 12 })} Active</span>
          <span class="cs-pod__val">${activeCount}/${state.teams.length}</span>
          <span class="cs-pod__sub">Crews on duty</span>
        </div>

        <div class="cs-pod">
          <span class="cs-pod__lbl">${icon('clock', { size: 12 })} Load Today</span>
          <span class="cs-pod__val">${totalTodayHrs}h</span>
          <span class="cs-pod__sub">${totalTodayJobs} cleans</span>
        </div>

        <button type="button" class="k-btn cs-cta-bright" data-action="team-new">${icon('plus', { size: 15 })} Add Crew</button>
      </div>
    </section>

    ${state.loading && !state.teams.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : state.teams.length ? html`
      <div class="cs-crew-grid">
        ${state.teams.map((tm) => {
          const pal = crewPalette(tm.id, state.teams);
          const qStats = teamQualityStats(tm, state.checks, state.jobs);
          return html`
            <article class="tk-card cs-team-card" style="${crewStyle(pal)}" data-key="team-${tm.id}">
              <div class="cs-team-card__head">
                <div>
                  <h2 class="tk-card__title" style="display:flex;align-items:center;gap:8px">
                    <span class="cs-crew-pill__dot" style="width:10px;height:10px;background:${pal.color}"></span>
                    ${tm.team_name}
                  </h2>
                  <div class="tk-card__sub">Lead: <strong>${tm.lead_cleaner || 'Not assigned'}</strong></div>
                </div>
                <span class="tk-tag ${tm.active === 'Active' ? 'tk-tag--ok' : ''}">${tm.active}</span>
              </div>
              <div class="cs-team-card__body">
                <div class="cs-rating-block">
                  <div class="cs-rating-block__top">
                    <span style="display:inline-flex;align-items:center;gap:6px;color:var(--k-text)">
                      ${icon('star', { size: 14 })} Avg Quality Rating
                    </span>
                    <span class="cs-rating-pill cs-rating-pill--${qStats.tone}">
                      ${qStats.count ? `${qStats.avg} / 5.0 ★` : 'No audits yet'}
                    </span>
                  </div>
                  <div class="tk-bar">
                    <div class="tk-bar__fill ${qStats.barTone}" style="width:${qStats.pct}%"></div>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px" class="tk-muted">
                    <span>${qStats.count ? `${qStats.count} completed inspection${qStats.count === 1 ? '' : 's'}` : 'Complete a quality check to rate'}</span>
                    ${qStats.count ? renderStars(Math.round(Number(qStats.avg))) : ''}
                  </div>
                </div>

                <div class="tk-kv">
                  <div class="tk-kv__item">
                    <span class="tk-kv__k">Vehicle</span>
                    <span class="tk-kv__v">${tm.vehicle || '—'}</span>
                  </div>
                  <div class="tk-kv__item">
                    <span class="tk-kv__k">Today's Load</span>
                    <span class="tk-kv__v">${tm.today_jobs || 0} jobs · ${tm.today_hours || 0}h</span>
                  </div>
                </div>
                ${tm.members ? html`<div style="font-size:13px"><strong>Crew:</strong> ${tm.members}</div>` : ''}
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(tm.service_areas || []).map((a) => html`<span class="cs-crew-pill" style="${crewStyle(pal)}">${a}</span>`)}
                  ${tm.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                  <button type="button" class="k-btn k-btn--sm" data-action="team-edit" data-id="${tm.id}">Edit Crew</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="team-toggle" data-id="${tm.id}">${tm.active === 'Active' ? 'Set Inactive' : 'Activate'}</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="team-del" data-id="${tm.id}">Remove</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'crew-van', title: 'No cleaning teams yet', text: 'Create your first crew with a lead cleaner, vehicle and service zones.' })}
  `;
}

export function wireDirectoryActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });
  on(root, 'click', '[data-action="client-type-filter"]', (e, el) => { state.clientTypeFilter = el.dataset.val; draw(); });
  on(root, 'click', '[data-action="client-bill-filter"]', (e, el) => { state.clientBillingFilter = el.dataset.val; draw(); });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client Name</span><input class="k-input" name="client_name" value="${c.client_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Client Type</span>
        <select class="k-input" name="client_type">${CLIENT_TYPES.map((t) => html`<option value="${t}" ${t === c.client_type ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}"></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Billing Status</span>
        <select class="k-input" name="billing_status">${BILLING.map((b) => html`<option value="${b}" ${b === c.billing_status ? 'selected' : ''}>${b}</option>`)}</select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Site Address</span><input class="k-input" name="address" value="${c.address || ''}" placeholder="Street, suburb, unit #"></label>
    <label class="k-field"><span class="k-field__label">Access / Key / Alarm Instructions</span>
      <textarea class="k-input" name="access_instructions" rows="3" placeholder="Lockbox PIN, alarm disarm code, gate latch, parking, pets…">${c.access_instructions || ''}</textarea>
    </label>
    <label class="k-field"><span class="k-field__label">Cleaning Notes &amp; Preferences</span>
      <textarea class="k-input" name="notes" rows="2" placeholder="Product sensitivities, rooms to skip…">${c.notes || ''}</textarea>
    </label>`;

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({ title: 'Add Cleaning Client', submitLabel: 'Save client', fields: clientFields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (made) { toast.success('Client added.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.client_name}`, submitLabel: 'Save client', fields: clientFields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Client updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="client-copy-access"]', (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    copyText(`${c.client_name}\n${c.address || ''}\nPhone: ${c.phone || '—'}\nAccess Instructions:\n${c.access_instructions}`, { title: 'Access & Alarm Instructions' });
  });

  on(root, 'click', '[data-action="client-book"]', (e, el) => {
    openJobForm(state, { loadScreen }, { client_id: Number(el.dataset.id) });
  });

  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client?', message: 'Deletes this client account (only allowed if no cleaning jobs are linked).', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Client deleted.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });

  const teamFields = (tm = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Team Name</span><input class="k-input" name="team_name" value="${tm.team_name || ''}" placeholder="e.g. Aqua Crew A" required></label>
      <label class="k-field"><span class="k-field__label">Lead Cleaner</span><input class="k-input" name="lead_cleaner" value="${tm.lead_cleaner || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Vehicle</span><input class="k-input" name="vehicle" value="${tm.vehicle || ''}" placeholder="e.g. Van 2 · CLN-318"></label>
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="active">
          <option value="Active" ${tm.active !== 'Inactive' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${tm.active === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Crew Members</span><textarea class="k-input" name="members" rows="2" placeholder="Names of cleaners on this crew…">${tm.members || ''}</textarea></label>
    <div class="k-field">
      <span class="k-field__label">Service Areas</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${SERVICE_AREAS.map((a) => html`<label class="k-check"><input type="checkbox" name="service_areas" value="${a}" ${(tm.service_areas || []).includes(a) ? 'checked' : ''}><span>${a}</span></label>`)}
      </div>
    </div>`;

  on(root, 'click', '[data-action="team-new"]', async () => {
    const made = await formDialog({ title: 'Add Cleaning Team', submitLabel: 'Save team', fields: teamFields(), onSubmit: (v) => api.post('/api/teams', v) });
    if (made) { toast.success('Cleaning team added.'); await loadScreen('/teams'); }
  });

  on(root, 'click', '[data-action="team-edit"]', async (e, el) => {
    const tm = state.teams.find((x) => String(x.id) === el.dataset.id);
    if (!tm) return;
    const saved = await formDialog({ title: `Edit ${tm.team_name}`, submitLabel: 'Save team', fields: teamFields(tm), onSubmit: (v) => api.put('/api/teams', { ...v, id: tm.id }) });
    if (saved) { toast.success('Cleaning team updated.'); await loadScreen('/teams'); }
  });

  on(root, 'click', '[data-action="team-toggle"]', async (e, el) => {
    const tm = state.teams.find((x) => String(x.id) === el.dataset.id);
    if (!tm) return;
    try {
      await api.put('/api/teams', { ...tm, active: tm.active === 'Active' ? 'Inactive' : 'Active' });
      toast.success('Team status updated.');
      await loadScreen('/teams');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="team-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove cleaning team?', message: 'Remove this crew from the roster?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/teams', { id: Number(el.dataset.id) }); toast.success('Team removed.'); await loadScreen('/teams'); }
    catch (err) { toastError(err); }
  });
}
