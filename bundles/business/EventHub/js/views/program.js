// Speakers Program (Stage Cards + 4-Stage Stepper), Vendor & Exhibitor Booth Cards, and Monogrammed Volunteer Roster.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

const PRES_TYPES = ['Keynote', 'Breakout Session', 'Workshop', 'Panel Discussion', 'Lightning Talk'];
const SPEAKER_STATUSES = ['Submitted', 'Under Review', 'Accepted', 'Scheduled', 'Declined'];
const SPEAKER_STEPS = ['Submitted', 'Under Review', 'Accepted', 'Scheduled'];
const EQUIP_OPTS = ['Projector', 'Microphone', 'Whiteboard', 'Laptop', 'High-Speed WiFi', 'Other'];
const BOOTH_SIZES = ['Small (6x6)', 'Medium (10x10)', 'Large (10x20)', 'Premium (20x20)'];
const POWER_OPTS = ['Standard Power (120V)', 'High Power (240V)', 'Multiple Outlets', 'None Required'];
const VENDOR_STATUSES = ['Applied', 'Approved', 'Booth Assigned', 'Declined'];
const AVAIL_OPTS = ['Setup (day before)', 'Event Day', 'Teardown (day after)', 'All Days'];
const SKILL_OPTS = ['Registration Desk', 'Tech / AV Support', 'Crowd Management', 'Hospitality / Catering', 'Photography / Video', 'First Aid'];
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function renderSpeakersView(state) {
  const rows = state.speakerFilter === 'All'
    ? state.speakers
    : state.speakers.filter((s) => s.status === state.speakerFilter);
  const scheduledCount = state.speakers.filter((s) => s.status === 'Scheduled').length;
  const reviewCount = state.speakers.filter((s) => s.status === 'Submitted' || s.status === 'Under Review').length;
  const countS = (st) => st === 'All' ? state.speakers.length : state.speakers.filter((s) => s.status === st).length;

  return html`
    <section class="ev-masthead" aria-label="Speakers Program">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f3c969"></span>
          STAGE LINEUP · ${state.speakers.length} SPEAKER${state.speakers.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ev-masthead__title">Speakers &amp; Program</h1>
        <div class="ev-masthead__meta">
          <span>Review abstracts, track AV equipment &amp; lock stage slots</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Scheduled speakers auto-publish to Run-of-Show</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--mint">
          <span class="ev-pod__lbl">Scheduled</span>
          <span class="ev-pod__val">${scheduledCount}</span>
          <span class="ev-pod__sub">On stage timeline</span>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">In Review</span>
          <span class="ev-pod__val">${reviewCount}</span>
          <span class="ev-pod__sub">Pending decision</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="spk-new">${icon('plus', { size: 15 })} Add Speaker</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...SPEAKER_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.speakerFilter === st })}" data-action="spk-filter" data-status="${st}">${st} (${countS(st)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.speakers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-stack">
        ${rows.length ? rows.map((s) => {
          const stIdx = SPEAKER_STEPS.indexOf(s.status);
          const cardTone = s.status === 'Scheduled' ? 'ev-banded-card--ok' : s.status === 'Declined' ? 'ev-banded-card--bad' : '';
          return html`
            <article class="ev-banded-card ${cardTone}" data-key="spk-${s.id}">
              <div class="tk-card__head" style="flex-wrap:wrap">
                <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1">
                  <div class="ev-avatar">${initials(s.speaker_name || 'SP')}</div>
                  <div style="min-width:0">
                    <div class="tk-row__title">
                      <span>${s.topic_title}</span>
                      <span class="tk-tag tk-tag--accent">${s.presentation_type}</span>
                      <span class="tk-tag ${s.status === 'Scheduled' ? 'tk-tag--ok' : s.status === 'Accepted' ? 'tk-tag--info' : s.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${s.status}</span>
                      ${s.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div class="tk-row__meta" style="margin-top:4px">
                      <span><strong>${s.speaker_name}</strong> (${s.email})</span>
                      ${s.session_slot ? html`<span class="booth-badge">${s.session_slot}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="tk-btn-row">
                  ${s.status === 'Submitted' ? html`<button type="button" class="k-btn k-btn--sm" data-action="spk-stage" data-id="${s.id}" data-status="Under Review">Review</button>` : ''}
                  ${(s.status === 'Submitted' || s.status === 'Under Review') ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="spk-stage" data-id="${s.id}" data-status="Accepted">Accept</button>` : ''}
                  ${s.status === 'Accepted' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="spk-schedule" data-id="${s.id}">Assign Slot</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="spk-edit" data-id="${s.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="spk-del" data-id="${s.id}">Delete</button>
                </div>
              </div>
              ${s.abstract ? html`<div style="font-size:13.75px"><strong>Abstract:</strong> ${s.abstract}</div>` : ''}
              ${s.bio ? html`<div class="tk-muted" style="font-size:13px"><strong>Bio:</strong> ${s.bio}</div>` : ''}
              ${(s.equipment || []).length ? html`<div class="tk-btn-row">${s.equipment.map((eq) => html`<span class="tk-tag">AV: ${eq}</span>`)}</div>` : ''}
              ${s.status !== 'Declined' ? html`
                <div class="ev-stepper">
                  ${SPEAKER_STEPS.map((st, idx) => html`
                    <div class="ev-step ${idx < stIdx || (st === 'Scheduled' && stIdx === 3) ? 'is-done' : idx === stIdx ? 'is-now' : ''}">${st}</div>`)}
                </div>` : ''}
            </article>`;
        }) : emptyState({ iconName: 'stage-mic', title: 'No speaker submissions', text: 'Add proposals or invite keynote speakers to build your program.' })}
      </div>`}`;
}

export function renderVendorsView(state) {
  const rows = state.vendorFilter === 'All'
    ? state.vendors
    : state.vendors.filter((v) => v.status === state.vendorFilter);
  const assignedCount = state.vendors.filter((v) => v.status === 'Booth Assigned').length;
  const insuredCount = state.vendors.filter((v) => v.insurance_verified).length;
  const countV = (st) => st === 'All' ? state.vendors.length : state.vendors.filter((v) => v.status === st).length;

  return html`
    <section class="ev-masthead" aria-label="Vendors and Exhibitors">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#f3c969"></span>
          EXPO FLOOR · ${state.vendors.length} EXHIBITOR${state.vendors.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ev-masthead__title">Vendors &amp; Booths</h1>
        <div class="ev-masthead__meta">
          <span>Approve sponsors &amp; exhibitors, verify COI &amp; power specs</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Assigned booths sync to load-in cues</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--mint">
          <span class="ev-pod__lbl">Booths Assigned</span>
          <span class="ev-pod__val">${assignedCount}</span>
          <span class="ev-pod__sub">Ready for load-in</span>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">COI Verified</span>
          <span class="ev-pod__val">${insuredCount} / ${state.vendors.length}</span>
          <span class="ev-pod__sub">Insurance clear</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="vnd-new">${icon('plus', { size: 15 })} Add Exhibitor</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented">
        ${['All', ...VENDOR_STATUSES].map((st) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.vendorFilter === st })}" data-action="vnd-filter" data-status="${st}">${st} (${countV(st)})</button>`)}
      </div>
    </div>

    ${state.loading && !state.vendors.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : rows.length ? html`
      <div class="ev-vendor-grid">
        ${rows.map((v) => html`
          <article class="${cls('ev-vendor-card', { 'ev-vendor-card--assigned': v.status === 'Booth Assigned' })}" data-key="vn-${v.id}">
            <div class="ev-vendor-card__head">
              <div style="min-width:0">
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
                  ${v.booth_number ? html`<span class="booth-badge">Booth ${v.booth_number}</span>` : ''}
                  <h2 class="tk-card__title" style="font-size:15.5px">${v.company_name}</h2>
                  ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-card__sub">${v.contact_name} · ${v.email}</div>
              </div>
              <span class="tk-tag ${v.status === 'Booth Assigned' ? 'tk-tag--ok' : v.status === 'Approved' ? 'tk-tag--info' : v.status === 'Declined' ? 'tk-tag--bad' : 'tk-tag--warn'}">${v.status}</span>
            </div>
            <div class="ev-vendor-card__body">
              <div class="tk-btn-row">
                <span class="tk-tag">${v.booth_size}</span>
                ${v.insurance_verified ? html`<span class="tk-tag tk-tag--ok">${icon('shield-check', { size: 12 })} Insured</span>` : html`<span class="tk-tag tk-tag--warn">COI Pending</span>`}
              </div>
              ${(v.power || []).length ? html`<div class="tk-btn-row">${v.power.map((p) => html`<span class="tk-tag tk-tag--info">${icon('zap', { size: 11 })} ${p}</span>`)}</div>` : ''}
              ${v.products_services ? html`<div style="font-size:13.5px">${v.products_services}</div>` : ''}
              ${v.special_requests ? html`<div class="tk-muted" style="font-size:12.5px">Notes: ${v.special_requests}</div>` : ''}
              <div class="tk-ticket__foot">
                <div class="tk-btn-row">
                  ${v.status === 'Applied' ? html`<button type="button" class="k-btn k-btn--sm" data-action="vnd-approve" data-id="${v.id}">Approve</button>` : ''}
                  ${v.status !== 'Declined' ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="vnd-assign" data-id="${v.id}">Assign Booth</button>` : ''}
                </div>
                <div class="tk-btn-row">
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="vnd-edit" data-id="${v.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="vnd-del" data-id="${v.id}">Delete</button>
                </div>
              </div>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'store', title: 'No exhibitor applications', text: 'Track booth requests, power requirements, and expo floor assignments.' })}`;
}

export function renderVolunteersView(state) {
  const shirts = state.shirtCounts || {};
  const staffedCount = state.volunteers.filter((v) => !!v.assigned_shift).length;

  return html`
    <section class="ev-masthead" aria-label="Volunteer Roster">
      <div class="ev-masthead__copy">
        <div class="ev-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#4ade80"></span>
          CREW &amp; SHIFTS · ${state.volunteers.length} VOLUNTEER${state.volunteers.length === 1 ? '' : 'S'}
        </div>
        <h1 class="ev-masthead__title">Volunteer Roster</h1>
        <div class="ev-masthead__meta">
          <span>Coordinate shifts, floor skills &amp; T-shirt sizing counts</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-tap emergency contact copy</span>
        </div>
      </div>

      <div class="ev-masthead__pods" style="align-items:center">
        <div class="ev-pod ev-pod--mint">
          <span class="ev-pod__lbl">Staffed Shifts</span>
          <span class="ev-pod__val">${staffedCount} / ${state.volunteers.length}</span>
          <span class="ev-pod__sub">Synced to Run Sheet</span>
        </div>
        <div class="ev-pod ev-pod--gold">
          <span class="ev-pod__lbl">Crew Sizes</span>
          <span class="ev-pod__val">${Object.keys(shirts).length}</span>
          <span class="ev-pod__sub">Shirt sizes tracked</span>
        </div>
        <button type="button" class="k-btn k-btn--primary ev-btn-stage" data-action="vol-new">${icon('plus', { size: 15 })} Add Volunteer</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <span class="tk-muted" style="font-size:12.5px;font-weight:750;text-transform:uppercase;letter-spacing:.04em">Crew T-Shirts:</span>
      <div class="shirt-chips">
        ${SHIRT_SIZES.filter((sz) => shirts[sz]).map((sz) => html`<span class="shirt-chip">${sz}: ${shirts[sz]}</span>`)}
        ${!Object.keys(shirts).length ? html`<span class="tk-muted" style="font-size:13px">None yet</span>` : ''}
      </div>
    </div>

    ${state.loading && !state.volunteers.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : html`
      <div class="tk-cards">
        ${state.volunteers.length ? state.volunteers.map((v) => html`
          <article class="tk-card" data-key="vl-${v.id}">
            <div class="tk-card__head">
              <div style="display:flex;align-items:center;gap:11px;min-width:0">
                <div class="ev-avatar">${initials(v.volunteer_name || 'VL')}</div>
                <div style="min-width:0">
                  <h2 class="tk-card__title">${v.volunteer_name}</h2>
                  <div class="tk-card__sub">${v.assigned_shift || 'Unassigned shift'}</div>
                </div>
              </div>
              <div class="tk-btn-row">
                <span class="tk-tag tk-tag--accent">${v.t_shirt_size}</span>
                ${v.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
            </div>
            <div class="tk-row__meta"><span>${v.email}</span>${v.phone ? html`<span>${v.phone}</span>` : ''}</div>
            ${(v.availability || []).length ? html`<div class="tk-btn-row">${v.availability.map((av) => html`<span class="tk-tag tk-tag--info">${av}</span>`)}</div>` : ''}
            ${(v.skills || []).length ? html`<div class="tk-btn-row">${v.skills.map((sk) => html`<span class="tk-tag">${sk}</span>`)}</div>` : ''}
            ${v.emergency_contact_name ? html`
              <div class="tk-muted" style="font-size:12.5px">
                ICE: <strong>${v.emergency_contact_name}</strong> (${v.emergency_contact_phone || 'no phone'})
                ${v.emergency_contact_phone ? html` <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="copy-ec" data-val="${v.emergency_contact_name}: ${v.emergency_contact_phone}">Copy</button>` : ''}
              </div>` : ''}
            <div class="tk-ticket__foot">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="vol-edit" data-id="${v.id}">Edit</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="vol-del" data-id="${v.id}">Remove</button>
            </div>
          </article>`) : emptyState({ iconName: 'users', title: 'No volunteers registered', text: 'Build your volunteer roster with shifts, skills, and emergency contacts.' })}
      </div>`}`;
}

export function wireProgramActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="spk-filter"]', (e, el) => { state.speakerFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="vnd-filter"]', (e, el) => { state.vendorFilter = el.dataset.status; draw(); });
  on(root, 'click', '[data-action="copy-ec"]', (e, el) => copyText(el.dataset.val, { title: 'Emergency Contact', done: 'Emergency contact copied' }));

  const spkFields = (s = {}) => {
    const eqSet = new Set(s.equipment || []);
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Speaker Name</span><input class="k-input" name="speaker_name" value="${s.speaker_name || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${s.email || ''}" required></label>
      </div>
      <label class="k-field"><span class="k-field__label">Topic / Session Title</span><input class="k-input" name="topic_title" value="${s.topic_title || ''}" required></label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Presentation Type</span><select class="k-input" name="presentation_type">${PRES_TYPES.map((p) => html`<option value="${p}" ${p === (s.presentation_type || 'Breakout Session') ? 'selected' : ''}>${p}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${SPEAKER_STATUSES.map((st) => html`<option value="${st}" ${st === (s.status || 'Submitted') ? 'selected' : ''}>${st}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Session Slot</span><input class="k-input" name="session_slot" value="${s.session_slot || ''}" placeholder="Day 1 · 10:00 · Main Stage"></label>
      </div>
      <label class="k-field"><span class="k-field__label">Abstract</span><textarea class="k-input" name="abstract" rows="3">${s.abstract || ''}</textarea></label>
      <label class="k-field"><span class="k-field__label">Speaker Bio</span><textarea class="k-input" name="bio" rows="2">${s.bio || ''}</textarea></label>
      <div class="k-field"><span class="k-field__label">Equipment Needs</span>
        <div class="tk-btn-row">${EQUIP_OPTS.map((eq) => html`<label class="k-check" style="margin-right:8px"><input type="checkbox" name="equipment" value="${eq}" ${eqSet.has(eq) ? 'checked' : ''}><span>${eq}</span></label>`)}</div>
      </div>`;
  };

  on(root, 'click', '[data-action="spk-new"]', async () => {
    const made = await formDialog({ title: 'Add Speaker Submission', submitLabel: 'Save Speaker', fields: spkFields(), onSubmit: (v) => api.post('/api/speakers', { ...v, equipment: Array.isArray(v.equipment) ? v.equipment : [] }) });
    if (made) { toast.success('Speaker added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="spk-edit"]', async (e, el) => {
    const s = state.speakers.find((x) => String(x.id) === el.dataset.id);
    if (!s) return;
    const saved = await formDialog({ title: `Edit ${s.speaker_name}`, submitLabel: 'Save Changes', fields: spkFields(s), onSubmit: (v) => api.put('/api/speakers', { ...v, id: s.id, equipment: Array.isArray(v.equipment) ? v.equipment : [] }) });
    if (saved) { toast.success('Speaker updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="spk-stage"]', async (e, el) => {
    try { await api.post('/api/speakers/status', { id: Number(el.dataset.id), status: el.dataset.status }); toast.success(`Speaker moved to ${el.dataset.status}.`); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="spk-schedule"]', async (e, el) => {
    const s = state.speakers.find((x) => String(x.id) === el.dataset.id);
    if (!s) return;
    const saved = await formDialog({
      title: `Schedule ${s.speaker_name}`,
      submitLabel: 'Confirm Slot',
      size: 'sm',
      fields: html`<label class="k-field"><span class="k-field__label">Stage &amp; Time Slot</span><input class="k-input" name="session_slot" value="${s.session_slot || ''}" placeholder="e.g. Day 1 · 14:00 · Main Stage" required></label>`,
      onSubmit: (v) => api.post('/api/speakers/status', { id: s.id, status: 'Scheduled', session_slot: v.session_slot }),
    });
    if (saved) { toast.success('Session scheduled!'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="spk-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete speaker?', message: 'Remove this speaker submission?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/speakers', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  const vndFields = (v = {}) => {
    const pwrSet = new Set(v.power || []);
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Company Name</span><input class="k-input" name="company_name" value="${v.company_name || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Contact Name</span><input class="k-input" name="contact_name" value="${v.contact_name || ''}" required></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${v.email || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${v.phone || ''}"></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Booth Size</span><select class="k-input" name="booth_size">${BOOTH_SIZES.map((b) => html`<option value="${b}" ${b === (v.booth_size || 'Medium (10x10)') ? 'selected' : ''}>${b}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Booth #</span><input class="k-input" name="booth_number" value="${v.booth_number || ''}" placeholder="e.g. A-08"></label>
        <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${VENDOR_STATUSES.map((st) => html`<option value="${st}" ${st === (v.status || 'Applied') ? 'selected' : ''}>${st}</option>`)}</select></label>
      </div>
      <label class="k-field"><span class="k-field__label">Products / Services</span><textarea class="k-input" name="products_services" rows="2">${v.products_services || ''}</textarea></label>
      <div class="k-field"><span class="k-field__label">Power Requirements</span>
        <div class="tk-btn-row">${POWER_OPTS.map((p) => html`<label class="k-check" style="margin-right:8px"><input type="checkbox" name="power" value="${p}" ${pwrSet.has(p) ? 'checked' : ''}><span>${p}</span></label>`)}</div>
      </div>
      <label class="k-check"><input type="checkbox" name="insurance_verified" ${v.insurance_verified ? 'checked' : ''}><span>Certificate of Insurance verified</span></label>
      <label class="k-field"><span class="k-field__label">Special Requests</span><input class="k-input" name="special_requests" value="${v.special_requests || ''}"></label>`;
  };

  on(root, 'click', '[data-action="vnd-new"]', async () => {
    const made = await formDialog({ title: 'Add Vendor / Exhibitor', submitLabel: 'Save Vendor', fields: vndFields(), onSubmit: (v) => api.post('/api/vendors', { ...v, power: Array.isArray(v.power) ? v.power : [] }) });
    if (made) { toast.success('Vendor application added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="vnd-edit"]', async (e, el) => {
    const v = state.vendors.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const saved = await formDialog({ title: `Edit ${v.company_name}`, submitLabel: 'Save', fields: vndFields(v), onSubmit: (vals) => api.put('/api/vendors', { ...vals, id: v.id, power: Array.isArray(vals.power) ? vals.power : [] }) });
    if (saved) { toast.success('Vendor updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="vnd-approve"]', async (e, el) => {
    try { await api.post('/api/vendors/status', { id: Number(el.dataset.id), status: 'Approved' }); toast.success('Vendor approved.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="vnd-assign"]', async (e, el) => {
    const v = state.vendors.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const saved = await formDialog({
      title: `Assign Booth — ${v.company_name}`,
      submitLabel: 'Assign Booth',
      size: 'sm',
      fields: html`<label class="k-field"><span class="k-field__label">Booth Number</span><input class="k-input" name="booth_number" value="${v.booth_number || ''}" placeholder="e.g. B-12" required></label>`,
      onSubmit: (vals) => api.post('/api/vendors/status', { id: v.id, status: 'Booth Assigned', booth_number: vals.booth_number }),
    });
    if (saved) { toast.success(`Booth ${saved.vendor.booth_number} assigned!`); await loadScreen(); }
  });

  on(root, 'click', '[data-action="vnd-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete vendor?', message: 'Remove this exhibitor permanently?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/vendors', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });

  const volFields = (v = {}) => {
    const avSet = new Set(v.availability || []);
    const skSet = new Set(v.skills || []);
    return html`
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Full Name</span><input class="k-input" name="volunteer_name" value="${v.volunteer_name || ''}" required></label>
        <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${v.email || ''}" required></label>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${v.phone || ''}"></label>
        <label class="k-field"><span class="k-field__label">T-Shirt Size</span><select class="k-input" name="t_shirt_size">${SHIRT_SIZES.map((sz) => html`<option value="${sz}" ${sz === (v.t_shirt_size || 'M') ? 'selected' : ''}>${sz}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Assigned Shift</span><input class="k-input" name="assigned_shift" value="${v.assigned_shift || ''}" placeholder="Desk · 08:00-13:00"></label>
      </div>
      <div class="k-field"><span class="k-field__label">Availability</span>
        <div class="tk-btn-row">${AVAIL_OPTS.map((a) => html`<label class="k-check" style="margin-right:8px"><input type="checkbox" name="availability" value="${a}" ${avSet.has(a) ? 'checked' : ''}><span>${a}</span></label>`)}</div>
      </div>
      <div class="k-field"><span class="k-field__label">Skills</span>
        <div class="tk-btn-row">${SKILL_OPTS.map((sk) => html`<label class="k-check" style="margin-right:8px"><input type="checkbox" name="skills" value="${sk}" ${skSet.has(sk) ? 'checked' : ''}><span>${sk}</span></label>`)}</div>
      </div>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Emergency Contact</span><input class="k-input" name="emergency_contact_name" value="${v.emergency_contact_name || ''}"></label>
        <label class="k-field"><span class="k-field__label">Emergency Phone</span><input class="k-input" name="emergency_contact_phone" value="${v.emergency_contact_phone || ''}"></label>
      </div>`;
  };

  on(root, 'click', '[data-action="vol-new"]', async () => {
    const made = await formDialog({ title: 'Add Volunteer', submitLabel: 'Save Volunteer', fields: volFields(), onSubmit: (v) => api.post('/api/volunteers', { ...v, availability: Array.isArray(v.availability) ? v.availability : [], skills: Array.isArray(v.skills) ? v.skills : [] }) });
    if (made) { toast.success('Volunteer added.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="vol-edit"]', async (e, el) => {
    const v = state.volunteers.find((x) => String(x.id) === el.dataset.id);
    if (!v) return;
    const saved = await formDialog({ title: `Edit ${v.volunteer_name}`, submitLabel: 'Save', fields: volFields(v), onSubmit: (vals) => api.put('/api/volunteers', { ...vals, id: v.id, availability: Array.isArray(vals.availability) ? vals.availability : [], skills: Array.isArray(vals.skills) ? vals.skills : [] }) });
    if (saved) { toast.success('Volunteer updated.'); await loadScreen(); }
  });

  on(root, 'click', '[data-action="vol-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove volunteer?', message: 'Delete this volunteer record?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/volunteers', { id: Number(el.dataset.id) }); toast.success('Removed.'); await loadScreen(); }
    catch (err) { toastError(err); }
  });
}
