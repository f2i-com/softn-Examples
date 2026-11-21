// Pet Profiles Directory (Unified Masthead + Temperament/Feeding/Med Cards)
// + Owners & Home Access Directory (Unified Masthead + Lockbox Vault Cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { openWalkForm, renderTemperamentPills, renderCareChips, isReactivePet } from './runsheet.js';

const SPECIES = ['Dog', 'Cat', 'Other'];
const SIZES = ['Small', 'Medium', 'Large', 'Giant'];
const TEMPERAMENTS = ['Dog-friendly', 'Friendly', 'Pulls on lead', 'Reactive', 'Anxious', 'Nervous', 'Senior', 'Puppy'];
const PET_ACTIVE = ['Active', 'Paused', 'Archived'];
const CONTACT_PREFS = ['Text message', 'Phone call', 'Email', 'App'];
const BILLING = ['Up to date', 'Pending', 'Overdue'];
const BILLING_TONE = { 'Up to date': 'tk-tag--ok', Pending: 'tk-tag--warn', Overdue: 'tk-tag--bad' };

export function renderPetsView(state) {
  const q = (state.petSearch || '').trim().toLowerCase();
  const list = state.pets.filter((p) => {
    if (state.petFilter === 'Reactive' && !(p.temperament || []).includes('Reactive')) return false;
    if (state.petFilter === 'Medical' && !p.medical_notes) return false;
    if ((state.petFilter === 'Dog' || state.petFilter === 'Cat') && p.species !== state.petFilter) return false;
    if (q && !`${p.name} ${p.breed} ${p.owner_name} ${p.medical_notes} ${p.feeding_instructions}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const activePets = state.pets.filter((p) => p.active === 'Active').length;
  const reactiveCount = state.pets.filter((p) => isReactivePet(p.temperament)).length;
  const medCount = state.pets.filter((p) => Boolean((p.medical_notes || '').trim())).length;

  return html`
    <section class="pr-masthead" aria-label="Pet Profiles Directory">
      <div class="pr-masthead__copy">
        <div class="pr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#34d399"></span>
          PACK PROFILES · TEMPERAMENT &amp; CARE
        </div>
        <h1 class="pr-masthead__title">Pet Profiles</h1>
        <div class="pr-masthead__meta">
          <span><strong style="color:#fed7aa">${activePets} active pet${activePets === 1 ? '' : 's'}</strong> in pack</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Solo-only, allergy &amp; feeding badges</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click vet contact copy</span>
        </div>
      </div>

      <div class="pr-masthead__pods" style="align-items:center">
        <div class="pr-pod pr-pod--terra">
          <span class="pr-pod__lbl">${icon('paw', { size: 12 })} Active</span>
          <span class="pr-pod__val">${activePets}/${state.pets.length}</span>
          <span class="pr-pod__sub">Enrolled pets</span>
        </div>

        <div class="${cls('pr-pod', { 'pr-pod--alert': reactiveCount > 0 })}">
          <span class="pr-pod__lbl">${icon('shield', { size: 12 })} Solo Only</span>
          <span class="pr-pod__val">${reactiveCount}</span>
          <span class="pr-pod__sub">Reactive flag</span>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('med-cross', { size: 12 })} Medical</span>
          <span class="pr-pod__val">${medCount}</span>
          <span class="pr-pod__sub">Care alerts</span>
        </div>

        <button type="button" class="k-btn pr-cta-terra" data-action="pet-new">${icon('plus', { size: 15 })} Add Pet</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input placeholder="Search pet name, breed or owner…" value="${state.petSearch}" data-action="pet-search">
      </label>
      <div class="tk-segmented">
        ${['All', 'Dog', 'Cat', 'Reactive', 'Medical'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.petFilter === f })}" data-action="pet-filter" data-val="${f}">${f === 'Medical' ? 'Medical Notes' : f}</button>`)}
      </div>
    </div>

    ${state.loading && !state.pets.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : list.length ? html`
      <div class="pr-cards-grid">
        ${list.map((p) => {
          const reactive = isReactivePet(p.temperament);
          return html`
            <article class="tk-card pr-pet-card ${reactive ? 'pr-pet-card--reactive' : 'pr-pet-card--safe'}" data-key="pet-${p.id}">
              <div class="pr-pet-card__head">
                <div class="pr-pet-card__id">
                  <span class="pr-pet-avatar">${initials(p.name || 'P')}</span>
                  <div style="min-width:0">
                    <h2 class="tk-card__title">${p.name}</h2>
                    <div class="tk-card__sub">${p.species} · ${p.breed || 'Mixed'} · ${p.size}</div>
                  </div>
                </div>
                <div style="display:flex;gap:5px;align-items:center">
                  ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  <span class="tk-tag ${p.active === 'Active' ? 'tk-tag--ok' : ''}">${p.active}</span>
                </div>
              </div>

              <div class="pr-pet-card__body">
                ${renderTemperamentPills(p.temperament)}

                <div class="tk-row__meta">
                  <span><strong>Owner:</strong> ${p.owner_name || '—'}${p.owner_phone ? ' · ' + p.owner_phone : ''}</span>
                  ${Number(p.completed_walks) > 0 ? html`<span class="tk-tag">${p.completed_walks} walks</span>` : ''}
                </div>

                ${renderCareChips({
                  medical_notes: p.medical_notes,
                  vet_contact: p.vet_contact,
                  feeding_instructions: p.feeding_instructions,
                  pet_name: p.name,
                })}

                ${!p.medical_notes && !p.vet_contact && !p.feeding_instructions ? html`
                  <div class="tk-muted" style="font-size:12.5px">No special medical, vet or feeding notes recorded.</div>` : ''}
              </div>

              <div class="pr-pet-card__foot">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="pet-book" data-id="${p.id}">${icon('paw', { size: 13 })} Book Walk</button>
                <button type="button" class="k-btn k-btn--sm" data-action="pet-edit" data-id="${p.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="pet-del" data-id="${p.id}">Delete</button>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'paw', title: 'No pets match your filter', text: 'Add pet profiles with temperament pills, feeding routines and vet contacts.' })}
  `;
}

export function renderClientsView(state) {
  const q = (state.clientSearch || '').trim().toLowerCase();
  const list = state.clients.filter((c) => !q || `${c.name} ${c.address} ${c.phone} ${c.access_instructions}`.toLowerCase().includes(q));
  const withAccess = state.clients.filter((c) => Boolean((c.access_instructions || '').trim())).length;
  const overdue = state.clients.filter((c) => c.billing_status === 'Overdue').length;

  return html`
    <section class="pr-masthead" aria-label="Pet Owners & Home Access">
      <div class="pr-masthead__copy">
        <div class="pr-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#e07a47"></span>
          PET PARENTS · HOME ACCESS VAULT
        </div>
        <h1 class="pr-masthead__title">Owners &amp; Home Access</h1>
        <div class="pr-masthead__meta">
          <span><strong style="color:#fed7aa">${state.clients.length} pet parent${state.clients.length === 1 ? '' : 's'}</strong></span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap copy lockbox &amp; alarm instructions</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Emergency vet numbers ready</span>
        </div>
      </div>

      <div class="pr-masthead__pods" style="align-items:center">
        <div class="pr-pod pr-pod--terra">
          <span class="pr-pod__lbl">${icon('users', { size: 12 })} Owners</span>
          <span class="pr-pod__val">${state.clients.length}</span>
          <span class="pr-pod__sub">Active households</span>
        </div>

        <div class="pr-pod">
          <span class="pr-pod__lbl">${icon('key', { size: 12 })} Access Vault</span>
          <span class="pr-pod__val">${withAccess}/${state.clients.length}</span>
          <span class="pr-pod__sub">Key/alarm saved</span>
        </div>

        <div class="${cls('pr-pod', { 'pr-pod--alert': overdue > 0 })}">
          <span class="pr-pod__lbl">${icon(overdue > 0 ? 'alert' : 'check-circle', { size: 12 })} Billing</span>
          <span class="pr-pod__val">${overdue}</span>
          <span class="pr-pod__sub">${overdue > 0 ? 'Overdue' : 'All current'}</span>
        </div>

        <button type="button" class="k-btn pr-cta-terra" data-action="client-new">${icon('plus', { size: 15 })} Add Owner</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input placeholder="Search owner, address, phone or access code…" value="${state.clientSearch}" data-action="client-search">
      </label>
    </div>

    ${state.loading && !state.clients.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : list.length ? html`
      <div class="pr-cards-grid">
        ${list.map((c) => html`
          <article class="tk-card" data-key="cl-${c.id}">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="pr-owner-avatar">${initials(c.name || 'CL')}</div>
              <div style="min-width:0;flex:1">
                <h2 class="tk-card__title">${c.name}</h2>
                <div class="tk-card__sub">${c.address || 'No street address'}</div>
              </div>
              <span class="tk-tag ${BILLING_TONE[c.billing_status] || ''}">${c.billing_status}</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              <span class="tk-tag tk-tag--accent">${c.pet_count || 0} active pet${Number(c.pet_count) === 1 ? '' : 's'}</span>
              <span class="tk-tag">Prefers: ${c.preferred_contact}</span>
              ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
            </div>
            <div class="tk-row__meta">
              ${c.phone ? html`<span>${icon('phone', { size: 13 })} ${c.phone}</span>` : ''}
              ${c.email ? html`<span>${icon('mail', { size: 13 })} ${c.email}</span>` : ''}
            </div>
            ${c.access_instructions ? html`
              <button type="button" class="pr-access-chip" data-action="client-copy-access" data-id="${c.id}">
                <span class="pr-access-chip__icon">${icon('key', { size: 13 })}</span>
                <span style="min-width:0;flex:1;display:grid;gap:1px">
                  <span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--k-accent)">Home Access &amp; Alarm</span>
                  <span class="tk-mono" style="font-size:11.5px;word-break:break-word">${c.access_instructions}</span>
                </span>
                <span class="tk-tag tk-tag--accent">${icon('copy', { size: 11 })} Copy</span>
              </button>` : ''}
            ${c.emergency_contact ? html`<div class="pr-med-box"><strong>Emergency / Vet:</strong> ${c.emergency_contact}</div>` : ''}
            ${c.notes ? html`<div class="tk-muted" style="font-size:12.5px">${c.notes}</div>` : ''}
            <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
              <button type="button" class="k-btn k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
              ${c.phone ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-copy-phone" data-id="${c.id}">${icon('copy', { size: 13 })} Phone</button>` : ''}
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="client-del" data-id="${c.id}">Delete</button>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'users', title: 'No owners found', text: 'Add pet parents with their home access instructions and emergency vet details.' })}
  `;
}

export function wirePetClientActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="pet-search"]', (e, el) => { state.petSearch = el.value; draw(); });
  on(root, 'click', '[data-action="pet-filter"]', (e, el) => { state.petFilter = el.dataset.val; draw(); });
  on(root, 'input', '[data-action="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });

  const petFields = (p = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Pet Name</span><input class="k-input" name="name" value="${p.name || ''}" placeholder="e.g. Biscuit" required></label>
      <label class="k-field"><span class="k-field__label">Owner</span>
        <select class="k-input" name="owner_id" required>
          ${state.clients.map((c) => html`<option value="${c.id}" ${String(c.id) === String(p.owner_id) ? 'selected' : ''}>${c.name}</option>`)}
        </select>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Species</span><select class="k-input" name="species">${SPECIES.map((s) => html`<option value="${s}" ${s === (p.species || 'Dog') ? 'selected' : ''}>${s}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Breed</span><input class="k-input" name="breed" value="${p.breed || ''}" placeholder="e.g. Border Collie"></label>
      <label class="k-field"><span class="k-field__label">Size</span><select class="k-input" name="size">${SIZES.map((s) => html`<option value="${s}" ${s === (p.size || 'Medium') ? 'selected' : ''}>${s}</option>`)}</select></label>
    </div>
    <div class="k-field">
      <span class="k-field__label">Temperament &amp; Handling Flags</span>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${TEMPERAMENTS.map((t) => html`<label class="k-check"><input type="checkbox" name="temperament" value="${t}" ${(p.temperament || []).includes(t) ? 'checked' : ''}><span>${t}</span></label>`)}
      </div>
    </div>
    <label class="k-field"><span class="k-field__label">Medical &amp; Safety Notes</span><textarea class="k-input" name="medical_notes" rows="2" placeholder="Allergies, medication, arthritis, muzzle rules…">${p.medical_notes || ''}</textarea></label>
    <label class="k-field"><span class="k-field__label">Feeding Instructions</span><textarea class="k-input" name="feeding_instructions" rows="2" placeholder="Portion, treats, water bowl rules…">${p.feeding_instructions || ''}</textarea></label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Vet Contact</span><input class="k-input" name="vet_contact" value="${p.vet_contact || ''}" placeholder="(02) 9810 4400"></label>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="active">${PET_ACTIVE.map((a) => html`<option value="${a}" ${a === (p.active || 'Active') ? 'selected' : ''}>${a}</option>`)}</select></label>
    </div>`;

  on(root, 'click', '[data-action="pet-new"]', async () => {
    if (!state.clients.length) { const c = await api.get('/api/clients'); state.clients = c.clients || []; }
    if (!state.clients.length) { toast.error('Add a pet owner client first.'); return; }
    const made = await formDialog({ title: 'Add Pet Profile', submitLabel: 'Save pet', fields: petFields(), onSubmit: (v) => api.post('/api/pets', v) });
    if (made) { toast.success('Pet profile saved.'); await loadScreen('/pets'); }
  });
  on(root, 'click', '[data-action="pet-edit"]', async (e, el) => {
    const p = state.pets.find((x) => String(x.id) === el.dataset.id);
    if (!p) return;
    if (!state.clients.length) { const c = await api.get('/api/clients'); state.clients = c.clients || []; }
    const saved = await formDialog({ title: `Edit ${p.name}`, submitLabel: 'Save pet', fields: petFields(p), onSubmit: (v) => api.put('/api/pets', { ...v, id: p.id }) });
    if (saved) { toast.success('Pet profile updated.'); await loadScreen('/pets'); }
  });
  on(root, 'click', '[data-action="pet-book"]', (e, el) => {
    openWalkForm(state, { loadScreen }, { pet_id: Number(el.dataset.id) });
  });
  on(root, 'click', '[data-action="pet-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete pet profile?', message: 'Delete this pet (only allowed if no walks are linked)?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/pets', { id: Number(el.dataset.id) }); toast.success('Pet deleted.'); await loadScreen('/pets'); }
    catch (err) { toastError(err); }
  });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Preferred Contact</span><select class="k-input" name="preferred_contact">${CONTACT_PREFS.map((p) => html`<option value="${p}" ${p === (c.preferred_contact || 'Text message') ? 'selected' : ''}>${p}</option>`)}</select></label>
      <label class="k-field"><span class="k-field__label">Billing Status</span><select class="k-input" name="billing_status">${BILLING.map((b) => html`<option value="${b}" ${b === (c.billing_status || 'Up to date') ? 'selected' : ''}>${b}</option>`)}</select></label>
    </div>
    <label class="k-field"><span class="k-field__label">Home Address</span><input class="k-input" name="address" value="${c.address || ''}"></label>
    <label class="k-field"><span class="k-field__label">Home Access &amp; Alarm Codes</span><textarea class="k-input" name="access_instructions" rows="2" placeholder="Key safe code, gate latch, alarm PIN, where the leash hangs…">${c.access_instructions || ''}</textarea></label>
    <label class="k-field"><span class="k-field__label">Emergency Contact &amp; Vet</span><input class="k-input" name="emergency_contact" value="${c.emergency_contact || ''}" placeholder="Secondary contact + vet clinic phone"></label>
    <label class="k-field"><span class="k-field__label">Notes</span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({ title: 'Add Pet Owner Client', submitLabel: 'Save client', fields: clientFields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (made) { toast.success('Client added.'); await loadScreen('/clients'); }
  });
  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save client', fields: clientFields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Client updated.'); await loadScreen('/clients'); }
  });
  on(root, 'click', '[data-action="client-copy-access"]', (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    copyText(`${c.name}\n${c.address || ''}\nHome Access & Alarm:\n${c.access_instructions}`, { title: 'Home Access & Alarm Codes' });
  });
  on(root, 'click', '[data-action="client-copy-phone"]', (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (c) copyText(c.phone, { title: `${c.name} Phone` });
  });
  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client?', message: 'Delete this client (only allowed if no pets are linked)?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Client deleted.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });
}
