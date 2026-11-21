// Managed Estate Properties Cards, Monogrammed Tenants Directory & Condition-Banded Inspections
import { html, on, cls, esc, qs, qsa } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { reqFormFields, renderKeySafeChip } from './triage.js';

const PROP_TYPES = ['House', 'Apartment', 'Commercial', 'Strata / Body Corporate'];
const INSP_TYPES = ['Entry', 'Routine', 'Exit', 'Safety / Compliance', 'Final'];

function renderStars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating || 0)));
  return html`<span class="stars" aria-label="${n} out of 5 stars">${Array.from({ length: 5 }, (_, i) => html`<span class="${i < n ? '' : 'stars__empty'}">★</span>`)}</span>`;
}

function conditionLabel(n) {
  return ['', 'Poor — Urgent Work', 'Below Average', 'Fair — Attention Needed', 'Good Condition', 'Excellent Condition'][n] || '';
}

function propTypeMod(tp) {
  if (tp === 'Apartment') return 'pm-prop--apartment';
  if (tp === 'Commercial') return 'pm-prop--commercial';
  if (String(tp || '').includes('Strata')) return 'pm-prop--strata';
  return '';
}

function renderScoreBar(rating) {
  const n = Math.max(0, Math.min(5, Number(rating || 0)));
  const tone = n >= 4 ? 'is-on--good' : n === 3 ? 'is-on--mid' : 'is-on--bad';
  const tagTone = n >= 4 ? 'tk-tag--ok' : n <= 2 ? 'tk-tag--bad' : 'tk-tag--warn';
  return html`
    <div class="score-bar-box">
      <div class="score-bar-head">
        <span style="display:inline-flex;align-items:center;gap:8px">
          ${renderStars(n)}
          <span class="score-bar-label">${conditionLabel(n)}</span>
        </span>
        <span class="tk-tag ${tagTone}">${n} / 5</span>
      </div>
      <div class="score-bar-track" aria-hidden="true">
        ${Array.from({ length: 5 }, (_, i) => html`<span class="${cls('score-bar-seg', { [tone]: i < n })}"></span>`)}
      </div>
    </div>`;
}

export function renderPropertiesView(state) {
  const rows = state.propType === 'All' ? state.properties : state.properties.filter((p) => p.property_type === state.propType);
  const openAcross = state.properties.reduce((s, p) => s + Number(p.open_requests || 0), 0);
  const scoredProps = state.properties.filter((p) => Number(p.latest_condition || 0) > 0);
  const avgCond = scoredProps.length ? (scoredProps.reduce((s, p) => s + Number(p.latest_condition), 0) / scoredProps.length).toFixed(1) : '—';

  return html`
    <section class="pm-masthead" aria-label="Managed Properties Header">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">MANAGED ESTATE ASSETS</div>
        <h1 class="pm-masthead__title">Properties Register</h1>
        <div class="pm-masthead__meta">
          <span>Landlords, ratings &amp; key safes</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap entry tags</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('building', { size: 11 })} Assets</span>
          <span class="pm-pod__val">${state.properties.length}</span>
          <span class="pm-pod__sub">Managed sites</span>
        </div>
        <div class="${cls('pm-pod', { 'pm-pod--alert': openAcross > 0 })}">
          <span class="pm-pod__lbl">${icon('alert', { size: 11 })} Open Issues</span>
          <span class="pm-pod__val">${openAcross}</span>
          <span class="pm-pod__sub">Active triage</span>
        </div>
        <div class="pm-pod pm-pod--brass pm-pod--wide-sm">
          <span class="pm-pod__lbl">${icon('star', { size: 11 })} Avg Score</span>
          <span class="pm-pod__val">${avgCond}/5</span>
          <span class="pm-pod__sub">Estate rating</span>
        </div>
        <div class="pm-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="prop-new">${icon('plus', { size: 16 })} Add Property</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter properties by type">
        ${['All', ...PROP_TYPES].map((tp) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.propType === tp })}" data-action="prop-type" data-type="${tp}">
            ${tp} (${tp === 'All' ? state.properties.length : state.properties.filter((x) => x.property_type === tp).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.properties.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-cards">
        ${rows.length ? rows.map((p) => html`
          <article class="tk-card pm-prop-card ${propTypeMod(p.property_type)}" data-key="prop-${p.id}">
            <div class="pm-prop-card__head">
              <div>
                <h3 class="tk-card__title">${p.address}</h3>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">
                  <span class="tk-tag tk-tag--accent">${p.property_type}</span>
                  ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
              </div>
              ${p.open_requests > 0 ? html`<span class="k-badge k-badge--danger">${p.open_requests} open</span>` : html`<span class="tk-tag tk-tag--ok">Clear</span>`}
            </div>
            <div class="pm-prop-card__body">
              <div class="tk-row__meta">
                <span>Owner / Mgr: <strong>${p.owner_manager}</strong></span>
                <span>${p.tenant_count || 0} tenant${Number(p.tenant_count) === 1 ? '' : 's'}</span>
              </div>
              ${p.latest_condition ? renderScoreBar(p.latest_condition) : ''}
              ${p.manager_phone ? html`
                <div class="tk-btn-row">
                  <button type="button" class="copy-pill" data-action="copy-val" data-label="Manager phone" data-val="${p.manager_phone}">${icon('phone', { size: 13 })} ${p.manager_phone} ${icon('copy', { size: 11 })}</button>
                </div>` : ''}
              ${renderKeySafeChip(p.access_notes, p.address)}
              <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="prop-log-req" data-id="${p.id}">Log Request</button>
                <button type="button" class="k-btn k-btn--sm" data-action="prop-inspect" data-id="${p.id}">Inspect</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="prop-edit" data-id="${p.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="prop-del" data-id="${p.id}">Del</button>
              </div>
            </div>
          </article>`) : emptyState({ iconName: 'building', title: 'No properties registered yet', text: 'Add houses, apartments, strata blocks or commercial tenancies.' })}
      </div>`}`;
}

export function renderTenantsView(state) {
  const q = (state.tenantSearch || '').trim().toLowerCase();
  const rows = state.tenants.filter((t) => {
    if (!q) return true;
    return `${t.name} ${t.phone} ${t.email || ''} ${t.unit || ''} ${t.property_address || ''}`.toLowerCase().includes(q);
  });
  const propCovered = new Set(state.tenants.map((t) => t.property_id)).size;

  return html`
    <section class="pm-masthead" aria-label="Tenants Directory Header">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">OCCUPANT CONTACTS</div>
        <h1 class="pm-masthead__title">Tenants Directory</h1>
        <div class="pm-masthead__meta">
          <span>Unit &amp; lease contacts</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click entry card copy</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod">
          <span class="pm-pod__lbl">${icon('users', { size: 11 })} Tenants</span>
          <span class="pm-pod__val">${state.tenants.length}</span>
          <span class="pm-pod__sub">Active leases</span>
        </div>
        <div class="pm-pod pm-pod--brass">
          <span class="pm-pod__lbl">${icon('building', { size: 11 })} Properties</span>
          <span class="pm-pod__val">${propCovered}</span>
          <span class="pm-pod__sub">Tenanted</span>
        </div>
        <div class="pm-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="tenant-new">${icon('plus', { size: 16 })} Add Tenant</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search tenant name, phone, unit or address…" value="${state.tenantSearch}" data-action="tenant-search">
      </div>
    </div>

    ${state.loading && !state.tenants.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="pm-tenant-grid">
        ${rows.map((t) => html`
          <article class="pm-tenant-card" data-key="ten-${t.id}">
            <div class="pm-tenant-head">
              <div class="pm-tenant-av">${initials(t.name || 'T')}</div>
              <div style="min-width:0;flex:1">
                <h3 class="tk-card__title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</h3>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:3px">
                  ${t.unit ? html`<span class="tk-tag tk-tag--accent">${t.unit}</span>` : ''}
                  ${t.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
              </div>
            </div>
            <div style="font-size:13.5px;font-weight:650">${t.property_address || 'Property'}</div>
            <div class="tk-row__meta">
              <button type="button" class="copy-pill" data-action="copy-val" data-label="Tenant phone" data-val="${t.phone}">${icon('phone', { size: 12 })} ${t.phone}</button>
              ${t.email ? html`<span>${t.email}</span>` : ''}
              ${t.lease_start ? html`<span>Lease from ${fmtDay(t.lease_start)}</span>` : ''}
            </div>
            <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="copy-val" data-label="Tenant contact" data-val="${t.name} (${t.unit || 'Tenant'})\n${t.property_address}\nPhone: ${t.phone}${t.email ? '\nEmail: ' + t.email : ''}">${icon('copy', { size: 13 })} Copy Entry Card</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="tenant-edit" data-id="${t.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="tenant-del" data-id="${t.id}">Del</button>
            </div>
          </article>`)}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No tenants found', text: 'Register tenants against managed properties to link their requests.' })}</section>`}`;
}

export function renderInspectionsView(state) {
  const rows = state.inspType === 'All' ? state.inspections : state.inspections.filter((i) => i.inspection_type === state.inspType);
  const avgNum = state.inspections.length
    ? state.inspections.reduce((s, i) => s + Number(i.condition_rating || 0), 0) / state.inspections.length
    : 0;
  const avg = state.inspections.length ? avgNum.toFixed(1) : '—';
  const healthPct = state.inspections.length ? Math.round((avgNum / 5) * 100) : 100;
  const attentionCount = state.inspections.filter((i) => Number(i.condition_rating || 0) <= 3).length;

  return html`
    <section class="pm-masthead" aria-label="Property Inspections Header">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">CONDITION &amp; COMPLIANCE REPORTS</div>
        <h1 class="pm-masthead__title">Property Inspections</h1>
        <div class="pm-masthead__meta">
          <span>1–5 star condition scores</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable landlord reports</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--ring">
          <div class="tk-ring" style="--p:${healthPct}%;--ring-color:#2dd4bf;--ring-size:48px">
            <span class="tk-ring__val">${healthPct}%</span>
          </div>
          <div>
            <span class="pm-pod__lbl">Portfolio Health</span>
            <div class="pm-pod__val" style="font-size:15px">${avg} / 5 Stars</div>
            <div class="pm-pod__sub">${state.inspections.length} report${state.inspections.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div class="${cls('pm-pod pm-pod--wide-sm', { 'pm-pod--alert': attentionCount > 0 })}">
          <span class="pm-pod__lbl">${icon('alert', { size: 11 })} Watch List</span>
          <span class="pm-pod__val">${attentionCount}</span>
          <span class="pm-pod__sub">Score 3★ or less</span>
        </div>
        <div class="pm-masthead__cta">
          <button type="button" class="k-btn k-btn--primary" data-action="insp-new">${icon('plus', { size: 16 })} Log Inspection</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="group" aria-label="Filter inspections by type">
        ${['All', ...INSP_TYPES].map((tp) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.inspType === tp })}" data-action="insp-type" data-type="${tp}">
            ${tp} (${tp === 'All' ? state.inspections.length : state.inspections.filter((x) => x.inspection_type === tp).length})
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.inspections.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="insp-grid">
        ${rows.map((i) => {
          const rating = Number(i.condition_rating || 0);
          const bandTone = rating >= 4 ? 'insp-card--good' : rating === 3 ? 'insp-card--mid' : 'insp-card--bad';
          return html`
            <article class="insp-card ${bandTone}" data-key="insp-${i.id}">
              <div class="insp-card__band">
                <div>
                  <h3 class="tk-card__title">${i.property_address || 'Property'}</h3>
                  <div class="tk-btn-row" style="margin-top:6px">
                    <span class="tk-tag tk-tag--accent">${i.inspection_type}</span>
                    ${i.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                </div>
                <span class="tk-tag" style="background:rgba(255,255,255,.85)">${fmtDay(i.inspection_date)}</span>
              </div>
              <div class="insp-card__body">
                ${renderScoreBar(i.condition_rating)}
                ${i.notes ? html`<p style="font-size:13.5px;color:var(--k-text);line-height:1.5">${i.notes}</p>` : ''}
                <div class="tk-row__meta">
                  <span>Inspector: <strong>${i.inspector || 'Staff'}</strong></span>
                  <span>Owner/Mgr: ${i.owner_manager || '—'}</span>
                </div>
              </div>
              <div class="insp-card__foot">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="print-insp" data-id="${i.id}">${icon('printer', { size: 15 })} Printable Report</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="insp-del" data-id="${i.id}">Delete</button>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'house-check', title: 'No inspections recorded', text: 'Log an Entry, Routine or Exit inspection with a 1–5 condition rating.' })}</section>`}`;
}

export function wirePortfolioActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="prop-type"]', (e, el) => { state.propType = el.dataset.type; draw(); });
  on(root, 'input', '[data-action="tenant-search"]', (e, el) => { state.tenantSearch = el.value; draw(); });
  on(root, 'click', '[data-action="insp-type"]', (e, el) => { state.inspType = el.dataset.type; draw(); });

  const propFields = (p = {}) => html`
    <label class="k-field"><span class="k-field__label">Property Address</span><input class="k-input" name="address" value="${p.address || ''}" placeholder="Street, suburb, postcode" required></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Property Type</span>
        <select class="k-input" name="property_type">${PROP_TYPES.map((t) => html`<option value="${t}" ${t === p.property_type ? 'selected' : ''}>${t}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Owner / Managing Agent</span><input class="k-input" name="owner_manager" value="${p.owner_manager || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Manager Phone</span><input class="k-input" name="manager_phone" value="${p.manager_phone || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Access &amp; Key Safe Notes</span><textarea class="k-input" name="access_notes" rows="2" placeholder="Lockbox code, gate access, parking, pets…">${p.access_notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="prop-new"]', async () => {
    const made = await formDialog({ title: 'Add Managed Property', submitLabel: 'Save Property', size: 'lg', fields: propFields(), onSubmit: (v) => api.post('/api/properties', v) });
    if (made) { toast.success('Property added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="prop-edit"]', async (e, el) => {
    const p = state.properties.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    const saved = await formDialog({ title: 'Edit Property', submitLabel: 'Save', size: 'lg', fields: propFields(p), onSubmit: (v) => api.put('/api/properties', { ...v, id: p.id }) });
    if (saved) { toast.success('Property updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="prop-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete property?', message: 'Delete this property? Properties with maintenance requests cannot be deleted.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/properties', { id: Number(el.dataset.id) }); toast.success('Property deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="prop-log-req"]', async (e, el) => {
    const tRes = await api.get('/api/tenants');
    state.tenants = tRes.tenants || [];
    const made = await formDialog({
      title: 'Log Maintenance Request',
      submitLabel: 'Submit Request',
      size: 'lg',
      fields: reqFormFields(state.properties, state.tenants, el.dataset.id),
      onSubmit: (v) => api.post('/api/requests', v),
    });
    if (made) { toast.success(`Request ${made.request.request_number} logged.`); await loadScreen(); }
  });

  async function openNewInspection(defaultPropId = '') {
    if (!state.properties.length) {
      const r = await api.get('/api/properties');
      state.properties = r.properties || [];
    }
    if (!state.properties.length) { toast.error('Add a property first.'); return; }
    const chosen = defaultPropId || state.properties[0].id;
    const made = await formDialog({
      title: 'Log Property Inspection',
      submitLabel: 'Save Inspection',
      size: 'lg',
      fields: html`
        <label class="k-field"><span class="k-field__label">Property</span>
          <select class="k-input" name="property_id" required>
            ${state.properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(chosen) ? 'selected' : ''}>${p.address}</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Inspection Type</span>
            <select class="k-input" name="inspection_type">${INSP_TYPES.map((t) => html`<option value="${t}" ${t === 'Routine' ? 'selected' : ''}>${t}</option>`)}</select>
          </label>
          <label class="k-field"><span class="k-field__label">Inspection Date</span><input class="k-input" type="date" name="inspection_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Inspector</span><input class="k-input" name="inspector" value="${state.session.me?.displayName || ''}"></label>
        </div>
        <div class="k-field">
          <span class="k-field__label">Overall Condition Rating (1–5 Stars)</span>
          <input type="hidden" name="condition_rating" value="4">
          <div class="star-picker">
            ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class="${cls('star-pick', { 'is-on': n === 4 })}" data-star-val="${n}">${'★'.repeat(n)} ${n}/5</button>`)}
          </div>
        </div>
        <label class="k-field"><span class="k-field__label">Inspector Findings &amp; Follow-up Notes</span><textarea class="k-input" name="notes" rows="4" placeholder="Room-by-room observations, smoke alarms, defects, tenant care…"></textarea></label>`,
      onOpen: ({ form }) => {
        const hidden = qs('input[name="condition_rating"]', form);
        for (const btn of qsa('[data-star-val]', form)) {
          btn.addEventListener('click', () => {
            hidden.value = btn.dataset.starVal;
            for (const b of qsa('[data-star-val]', form)) b.classList.toggle('is-on', b === btn);
          });
        }
      },
      onSubmit: (v) => api.post('/api/inspections', v),
    });
    if (made) { toast.success('Inspection logged.'); await loadScreen(); }
  }

  on(root, 'click', '[data-action="insp-new"]', () => openNewInspection());
  on(root, 'click', '[data-action="prop-inspect"]', (e, el) => openNewInspection(el.dataset.id));

  on(root, 'click', '[data-action="insp-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete inspection?', message: 'Delete this inspection report?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/inspections', { id: Number(el.dataset.id) }); toast.success('Inspection deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-insp"]', (e, el) => {
    const i = state.inspections.find((x) => String(x.id) === el.dataset.id);
    if (!i) return;
    const s = state.session.settings;
    const stars = '★'.repeat(i.condition_rating) + '☆'.repeat(5 - i.condition_rating);
    downloadHtmlDoc(`inspection-report-${i.inspection_date}-${i.id}.html`, {
      title: `PROPERTY INSPECTION REPORT · ${i.inspection_type}`,
      businessName: s.business_name,
      subtitle: [s.address, s.phone, s.email].filter(Boolean).join(' · '),
      accent: '#0d6e6e',
      bodyHtml: `
        <div class="box">
          <strong>Property Address:</strong> ${esc(i.property_address || '')} (${esc(i.property_type || '')})<br>
          <strong>Owner / Managing Agent:</strong> ${esc(i.owner_manager || '—')} ${i.manager_phone ? '· ' + esc(i.manager_phone) : ''}<br>
          <strong>Inspection Type:</strong> ${esc(i.inspection_type)} &nbsp; <strong>Date:</strong> ${esc(fmtDay(i.inspection_date))}<br>
          <strong>Inspector:</strong> ${esc(i.inspector || 'Property Manager')}
        </div>
        <div class="box">
          <strong>Overall Condition Score:</strong> <span style="color:#d97706;font-size:18px">${stars}</span> &nbsp; <strong>${i.condition_rating} / 5</strong> (${esc(conditionLabel(i.condition_rating))})
        </div>
        <div class="box"><strong>Inspection Findings &amp; Follow-up Actions:</strong><br><br>${esc(i.notes || 'No defects noted.')}</div>`,
    });
  });

  const tenantFields = (properties, t = {}) => html`
    <label class="k-field"><span class="k-field__label">Property</span>
      <select class="k-input" name="property_id" required>
        ${properties.map((p) => html`<option value="${p.id}" ${String(p.id) === String(t.property_id) ? 'selected' : ''}>${p.address}</option>`)}
      </select>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Tenant Name</span><input class="k-input" name="name" value="${t.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Unit / Room</span><input class="k-input" name="unit" value="${t.unit || ''}" placeholder="e.g. Apt 4"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${t.phone || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${t.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Lease Start</span><input class="k-input" type="date" name="lease_start" value="${t.lease_start || ''}"></label>
    </div>`;

  on(root, 'click', '[data-action="tenant-new"]', async () => {
    if (!state.properties.length) {
      const r = await api.get('/api/properties');
      state.properties = r.properties || [];
    }
    if (!state.properties.length) { toast.error('Add a property first.'); return; }
    const made = await formDialog({ title: 'Add Tenant', submitLabel: 'Save Tenant', size: 'lg', fields: tenantFields(state.properties), onSubmit: (v) => api.post('/api/tenants', v) });
    if (made) { toast.success('Tenant added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="tenant-edit"]', async (e, el) => {
    const t = state.tenants.find((x) => String(x.id) === el.dataset.id);
    if (!t) return;
    if (!state.properties.length) {
      const r = await api.get('/api/properties');
      state.properties = r.properties || [];
    }
    const saved = await formDialog({ title: `Edit ${t.name}`, submitLabel: 'Save', size: 'lg', fields: tenantFields(state.properties, t), onSubmit: (v) => api.put('/api/tenants', { ...v, id: t.id }) });
    if (saved) { toast.success('Tenant updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="tenant-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete tenant?', message: 'Remove this tenant from the directory?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/tenants', { id: Number(el.dataset.id) }); toast.success('Tenant removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
