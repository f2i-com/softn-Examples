// Spaces Catalogue (Architectural Masthead, type filters, capacity-banded cards with Today's Availability mini bar & 1-click Book Space)
// & Hirer Clients Directory (Monogrammed visual account cards).
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';

const SPACE_TYPES = ['Hall', 'Meeting room', 'Studio', 'Sports court', 'Outdoor area'];
const SPACE_STATUSES = ['Available', 'Maintenance', 'Retired'];
const FEATURES = ['AV system', 'Kitchen access', 'Stage', 'Parking', 'Wheelchair access', 'Wi-Fi'];

const TL_START = 8 * 60;
const TL_END = 22 * 60;
const TL_SPAN = TL_END - TL_START;

function clockMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function miniSeg(startTime, endTime) {
  const s = Math.max(TL_START, Math.min(TL_END, clockMin(startTime)));
  const e = Math.max(TL_START, Math.min(TL_END, clockMin(endTime)));
  if (e <= s) return null;
  const left = ((s - TL_START) / TL_SPAN) * 100;
  const width = Math.max(3, ((e - s) / TL_SPAN) * 100);
  return { left: left.toFixed(2), width: Math.min(100 - left, width).toFixed(2) };
}

function spaceThemeClass(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('studio')) return 'vo-space--studio';
  if (t.includes('meeting')) return 'vo-space--meeting';
  if (t.includes('court') || t.includes('sport')) return 'vo-space--court';
  if (t.includes('outdoor')) return 'vo-space--outdoor';
  return 'vo-space--hall';
}

export function renderSpacesView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const todayStr = today();
  const todayBookings = (state.timelineBookings || []).filter((b) => b.booking_date === todayStr && b.status !== 'Cancelled');

  const bookable = state.spaces.filter((s) => s.status === 'Available');
  const totalCap = state.spaces.reduce((sum, s) => sum + Number(s.capacity || 0), 0);
  const avgRate = state.spaces.length
    ? Math.round(state.spaces.reduce((sum, s) => sum + Number(s.hourly_rate_cents || 0), 0) / state.spaces.length)
    : 0;

  const typeCounts = new Map();
  for (const s of state.spaces) typeCounts.set(s.space_type, (typeCounts.get(s.space_type) || 0) + 1);

  const visibleSpaces = state.spaceTypeFilter && state.spaceTypeFilter !== 'All'
    ? state.spaces.filter((s) => s.space_type === state.spaceTypeFilter)
    : state.spaces;

  return html`
    <section class="vo-masthead" aria-label="Spaces Portfolio">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          ${icon('building', { size: 12 })} HALLS, STUDIOS, COURTS &amp; MEETING ROOMS
        </div>
        <h1 class="vo-masthead__title">Spaces Catalogue</h1>
        <div class="vo-masthead__meta">
          <span>Hourly rates feed directly into the booking calculator</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live 08:00–22:00 today bars on every active space</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="vo-pod vo-pod--gold">
          <span class="vo-pod__lbl">${icon('arch-hall', { size: 12 })} Bookable</span>
          <span class="vo-pod__val">${bookable.length}/${state.spaces.length}</span>
          <span class="vo-pod__sub">${state.spaces.length - bookable.length} in maintenance</span>
        </div>
        <div class="vo-pod">
          <span class="vo-pod__lbl">${icon('users', { size: 12 })} Total Capacity</span>
          <span class="vo-pod__val">${totalCap}</span>
          <span class="vo-pod__sub">Combined guests</span>
        </div>
        <div class="vo-pod">
          <span class="vo-pod__lbl">${icon('dollar', { size: 12 })} Avg Rate</span>
          <span class="vo-pod__val">${money(avgRate, { currency })}</span>
          <span class="vo-pod__sub">Per hour</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="sp-new">${icon('plus', { size: 15 })} Add Space</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented" role="tablist" aria-label="Filter by space type">
        <button type="button" class="${cls('tk-pill', { 'is-on': (state.spaceTypeFilter || 'All') === 'All' })}" data-action="sp-type-filter" data-type="All">
          All <span style="opacity:.65;font-size:11px;margin-left:2px">${state.spaces.length}</span>
        </button>
        ${SPACE_TYPES.filter((t) => typeCounts.get(t)).map((t) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.spaceTypeFilter === t })}" data-action="sp-type-filter" data-type="${t}">
            ${t} <span style="opacity:.65;font-size:11px;margin-left:2px">${typeCounts.get(t)}</span>
          </button>`)}
      </div>
    </div>

    ${state.loading && !state.spaces.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : visibleSpaces.length ? html`
      <div class="vo-spaces-grid">
        ${visibleSpaces.map((sp) => {
          const spBks = todayBookings.filter((b) => Number(b.space_id) === Number(sp.id));
          return html`
            <article class="tk-card vo-space-card ${spaceThemeClass(sp.space_type)}" data-key="sp-${sp.id}">
              <div class="vo-space-card__head">
                <div>
                  <h3 class="tk-card__title">${sp.space_name}</h3>
                  <div class="tk-card__sub">${sp.space_type}</div>
                  <span class="vo-cap-badge">${icon('users', { size: 12 })} Capacity ${sp.capacity}</span>
                </div>
                <div class="vo-space-rate">${money(sp.hourly_rate_cents, { currency })}<span style="font-size:12px;font-weight:600;color:var(--k-muted)">/hr</span></div>
              </div>
              <div class="vo-space-card__body">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span class="tk-tag ${sp.status === 'Available' ? 'tk-tag--ok' : sp.status === 'Maintenance' ? 'tk-tag--warn' : 'tk-tag--bad'}">${sp.status}</span>
                  ${sp.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                ${sp.status === 'Available' ? html`
                  <div class="vo-mini-tl">
                    <div class="vo-mini-tl__head">
                      <span>Today 08:00–22:00</span>
                      <span>${spBks.length ? `${spBks.length} booking${spBks.length === 1 ? '' : 's'}` : 'Open all day'}</span>
                    </div>
                    <div class="vo-mini-tl__track">
                      ${spBks.map((b) => {
                        const seg = miniSeg(b.start_time, b.end_time);
                        if (!seg) return '';
                        return html`<span class="${cls('vo-mini-tl__seg', { 'vo-mini-tl__seg--tentative': b.status === 'Tentative' })}" style="left:${seg.left}%;width:${seg.width}%" title="${b.start_time}–${b.end_time} · ${b.client_name}"></span>`;
                      })}
                    </div>
                  </div>` : ''}
                ${sp.notes ? html`<p style="font-size:13px;color:var(--k-muted);line-height:1.45">${sp.notes}</p>` : ''}
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(sp.features || []).map((f) => html`<span class="vo-feature-pill">${f}</span>`)}
                </div>
                <div class="tk-btn-row" style="padding-top:10px;border-top:1px dashed var(--k-border)">
                  ${sp.status === 'Available' ? html`
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sp-book" data-space-id="${sp.id}" data-date="${todayStr}">${icon('plus', { size: 13 })} Book Space</button>` : ''}
                  <button type="button" class="k-btn k-btn--sm" data-action="sp-edit" data-id="${sp.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sp-del" data-id="${sp.id}">Delete</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'building', title: 'No spaces match', text: 'Add halls, studios, courts or meeting rooms to begin taking bookings.' })}
  `;
}

export function renderClientsView(state) {
  const currency = state.session.settings.currency || 'AUD';
  const q = state.clientSearch.trim().toLowerCase();
  const rows = q
    ? state.clients.filter((c) => c.client_name.toLowerCase().includes(q) || c.organisation.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : state.clients;

  const totalSpend = state.clients.reduce((s, c) => s + Number(c.total_hire_cents || 0), 0);
  const totalBookings = state.clients.reduce((s, c) => s + Number(c.bookings_count || 0), 0);

  return html`
    <section class="vo-masthead" aria-label="Hirer Clients Directory">
      <div class="vo-masthead__copy">
        <div class="vo-masthead__eyebrow">
          ${icon('users', { size: 12 })} CLUBS, COMMUNITY GROUPS &amp; CORPORATE HIRERS
        </div>
        <h1 class="vo-masthead__title">Hirer Clients</h1>
        <div class="vo-masthead__meta">
          <span>Keep regular hirer contacts, key-fob notes and lifetime spend linked to bookings</span>
        </div>
      </div>

      <div class="vo-masthead__pods" style="align-items:center">
        <div class="vo-pod vo-pod--gold">
          <span class="vo-pod__lbl">${icon('trending', { size: 12 })} Total Spend</span>
          <span class="vo-pod__val">${money(totalSpend, { currency })}</span>
          <span class="vo-pod__sub">Across all accounts</span>
        </div>
        <div class="vo-pod">
          <span class="vo-pod__lbl">${icon('users', { size: 12 })} Hirers</span>
          <span class="vo-pod__val">${state.clients.length}</span>
          <span class="vo-pod__sub">${totalBookings} booking${totalBookings === 1 ? '' : 's'} logged</span>
        </div>
        <button type="button" class="k-btn k-btn--primary" data-action="cl-new">${icon('plus', { size: 15 })} Add Hirer</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">${icon('search', { size: 16 })}<input type="search" data-action="cl-search" value="${state.clientSearch}" placeholder="Search hirers, clubs or emails…"></label>
    </div>

    ${state.loading && !state.clients.length ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="vo-client-grid">
        ${rows.map((c) => html`
          <article class="vo-client-card" data-key="cl-${c.id}">
            <div class="vo-client-card__head">
              <span class="vo-client-avatar">${initials(c.client_name || 'H')}</span>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <strong style="font-size:15.5px">${c.client_name}</strong>
                  ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="tk-muted" style="font-size:12.5px;margin-top:1px">${c.organisation || 'Private Hirer'}</div>
              </div>
            </div>

            <div class="vo-client-stats">
              <div>
                <div class="vo-client-stat__lbl">Bookings</div>
                <div class="vo-client-stat__val">${c.bookings_count || 0}</div>
              </div>
              <div>
                <div class="vo-client-stat__lbl">Total Hire</div>
                <div class="vo-client-stat__val" style="color:var(--k-accent)">${money(c.total_hire_cents || 0, { currency })}</div>
              </div>
            </div>

            <div style="display:grid;gap:4px;font-size:13px;color:var(--k-muted)">
              ${c.email ? html`<div style="display:flex;align-items:center;gap:6px">${icon('mail', { size: 13 })} <span style="overflow:hidden;text-overflow:ellipsis">${c.email}</span></div>` : ''}
              ${c.phone ? html`<div style="display:flex;align-items:center;gap:6px">${icon('phone', { size: 13 })} <span>${c.phone}</span></div>` : ''}
              ${c.notes ? html`<div style="margin-top:3px;font-size:12.5px;color:var(--k-text);background:var(--k-surface-2);padding:7px 9px;border-radius:7px">${c.notes}</div>` : ''}
            </div>

            <div class="tk-btn-row" style="padding-top:9px;border-top:1px dashed var(--k-border)">
              <button type="button" class="k-btn k-btn--sm" data-action="cl-edit" data-id="${c.id}">Edit Hirer</button>
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cl-del" data-id="${c.id}">Remove</button>
            </div>
          </article>`)}
      </div>` : emptyState({ iconName: 'users', title: 'No hirers match', text: 'Add clubs, community groups and corporate hirers.' })}`;
}

export function wireSpacesActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="sp-type-filter"]', (e, el) => { state.spaceTypeFilter = el.dataset.type; draw(); });
  on(root, 'input', '[data-action="cl-search"]', (e, el) => { state.clientSearch = el.value; draw(); });

  const spaceFields = (sp = {}) => {
    const feats = sp.features || [];
    return html`
      <label class="k-field"><span class="k-field__label">Space name</span><input class="k-input" name="space_name" value="${sp.space_name || ''}" placeholder="e.g. Grand Civic Hall, Studio 2" required></label>
      <div class="k-form__row">
        <label class="k-field"><span class="k-field__label">Space type</span><select class="k-input" name="space_type">${SPACE_TYPES.map((t) => html`<option value="${t}" ${t === sp.space_type ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label class="k-field"><span class="k-field__label">Capacity</span><input class="k-input" type="number" min="1" name="capacity" value="${sp.capacity ?? 60}" required></label>
        <label class="k-field"><span class="k-field__label">Hourly rate</span><input class="k-input" type="number" step="1" min="0" name="hourly_rate" value="${sp.hourly_rate_cents != null ? (sp.hourly_rate_cents / 100).toFixed(2) : '80.00'}" required></label>
      </div>
      <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status">${SPACE_STATUSES.map((s) => html`<option value="${s}" ${s === (sp.status || 'Available') ? 'selected' : ''}>${s}</option>`)}</select></label>
      <div class="k-field">
        <span class="k-field__label">Space features</span>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
          ${FEATURES.map((f) => html`<label class="k-check"><input type="checkbox" name="features" value="${f}" ${feats.includes(f) ? 'checked' : ''}><span>${f}</span></label>`)}
        </div>
      </div>
      <label class="k-field"><span class="k-field__label">Description / maintenance notes</span><input class="k-input" name="notes" value="${sp.notes || ''}"></label>`;
  };

  on(root, 'click', '[data-action="sp-new"]', async () => {
    const made = await formDialog({ title: 'Add Hireable Space', submitLabel: 'Save space', fields: spaceFields(), onSubmit: (v) => api.post('/api/spaces', v) });
    if (made) { toast.success('Space added.'); await loadScreen('/spaces'); }
  });

  on(root, 'click', '[data-action="sp-edit"]', async (e, el) => {
    const sp = state.spaces.find((x) => String(x.id) === el.dataset.id);
    if (!sp) return;
    const saved = await formDialog({ title: `Edit ${sp.space_name}`, submitLabel: 'Save', fields: spaceFields(sp), onSubmit: (v) => api.put('/api/spaces', { ...v, id: sp.id }) });
    if (saved) { toast.success('Space updated.'); await loadScreen('/spaces'); }
  });

  on(root, 'click', '[data-action="sp-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete space?', message: 'Remove this space from the catalogue?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/spaces', { id: Number(el.dataset.id) }); toast.success('Space removed.'); await loadScreen('/spaces'); }
    catch (err) { toastError(err); }
  });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client name</span><input class="k-input" name="client_name" value="${c.client_name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Organisation</span><input class="k-input" name="organisation" value="${c.organisation || ''}" placeholder="Club, company or community group"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${c.phone || ''}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${c.notes || ''}" placeholder="Regular nights, key fob, billing preferences…"></label>`;

  on(root, 'click', '[data-action="cl-new"]', async () => {
    const made = await formDialog({ title: 'Add Hirer Client', submitLabel: 'Save hirer', fields: clientFields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (made) { toast.success('Hirer added.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="cl-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.client_name}`, submitLabel: 'Save', fields: clientFields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Hirer updated.'); await loadScreen('/clients'); }
  });

  on(root, 'click', '[data-action="cl-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Remove hirer?', message: 'Delete this client from the directory?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Hirer removed.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });
}
