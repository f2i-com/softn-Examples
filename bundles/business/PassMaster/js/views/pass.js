// Course Kitchen Pass Expediter — Burgundy & Brass Command Deck w/ Pass Pace Ring,
// clickable course ribbons + Allergy Only filter, All-Day Dish Callout Tally, parsed dish rows & pulsing crimson allergy strips.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { ago, toMs } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, emptyState, skeleton } from '../../kit/ui.js';

const COURSES = [
  { id: 'All', label: 'All Checks', slug: '' },
  { id: 'Entree', label: 'Starter / Entree', slug: 'entree' },
  { id: 'Mains', label: 'Main', slug: 'mains' },
  { id: 'Desserts', label: 'Dessert', slug: 'desserts' },
  { id: 'Drinks', label: 'Drinks', slug: 'drinks' },
];
const COLS = [
  { status: 'Fire', label: 'Fire / New', next: 'Cooking', nextLabel: 'On the Flame →' },
  { status: 'Cooking', label: 'Cooking on Line', next: 'Pass', nextLabel: 'Call to Pass →' },
  { status: 'Pass', label: 'Up at the Pass', next: 'Served', nextLabel: 'Run & Served ✓' },
];

function courseSlug(course) {
  if (course === 'Entree') return 'entree';
  if (course === 'Mains') return 'mains';
  if (course === 'Desserts') return 'desserts';
  return 'drinks';
}

function courseDisplayLabel(course) {
  if (course === 'Entree') return 'Starter · Entree';
  if (course === 'Mains') return 'Main';
  if (course === 'Desserts') return 'Dessert';
  return course || 'Drinks';
}

function ticketAgeMinutes(createdAt) {
  const ms = toMs(createdAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function renderAgePill(ticket) {
  if (ticket.status === 'Served') {
    return html`<span class="pm-age pm-age--done">${icon('check', { size: 11 })} ${ago(ticket.updated_at || ticket.created_at)}</span>`;
  }
  const mins = ticketAgeMinutes(ticket.created_at);
  if (mins >= 12) {
    return html`<span class="pm-age pm-age--crit">${icon('clock', { size: 11 })} ${mins}m · LATE</span>`;
  }
  if (mins >= 6) {
    return html`<span class="pm-age pm-age--warn">${icon('clock', { size: 11 })} ${mins}m</span>`;
  }
  return html`<span class="pm-age pm-age--ok">${icon('clock', { size: 11 })} ${mins < 1 ? '<1m' : mins + 'm'}</span>`;
}

function parseDishLines(itemsText) {
  const lines = String(itemsText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.map((line) => {
    const mods = [];
    const main = line
      .replace(/\(([^)]+)\)/g, (_, inner) => {
        if (inner && inner.trim()) mods.push(inner.trim());
        return '';
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { main: main || line, mods };
  });
}

function buildAllDayDishes(tickets) {
  const active = tickets.filter((t) => t.status !== 'Served');
  const map = new Map();
  let totalDishes = 0;
  for (const tk of active) {
    const lines = String(tk.items || '').split('\n').map((s) => s.trim()).filter(Boolean);
    for (const rawLine of lines) {
      const match = /^(\d+)\s*[x×]\s+(.+)$/i.exec(rawLine);
      const qty = match ? Number(match[1]) : 1;
      const dish = (match ? match[2] : rawLine).replace(/\s*\([^)]*\)/g, '').trim();
      if (!dish) continue;
      const key = dish.toLowerCase();
      const cur = map.get(key) || { dish, qty: 0 };
      cur.qty += qty;
      map.set(key, cur);
      totalDishes += qty;
    }
  }
  const list = [...map.values()].sort((a, b) => b.qty - a.qty || a.dish.localeCompare(b.dish));
  return { list, totalDishes, activeCount: active.length };
}

export function renderPassView(state) {
  const allActive = state.tickets.filter((t) => t.status !== 'Served');
  const allAllergyCount = allActive.filter((t) => t.allergy_notes && t.allergy_notes.trim()).length;
  const onTimeCount = allActive.filter((t) => ticketAgeMinutes(t.created_at) < 12).length;
  const pacePct = allActive.length ? Math.round((onTimeCount / allActive.length) * 100) : 100;
  const paceColor = pacePct >= 85 ? '#22c55e' : pacePct >= 60 ? '#eab967' : '#ef4444';

  // Live course counts across all active tickets
  const courseCounts = { All: allActive.length, Entree: 0, Mains: 0, Desserts: 0, Drinks: 0 };
  for (const t of allActive) {
    if (courseCounts[t.course] != null) courseCounts[t.course] += 1;
  }

  // Client-side filtered tickets
  const filtered = state.tickets.filter((t) => {
    if (state.passCourse !== 'All' && t.course !== state.passCourse) return false;
    if (state.passAllergyOnly && !(t.allergy_notes && t.allergy_notes.trim())) return false;
    return true;
  });

  const tally = buildAllDayDishes(filtered);
  const columns = state.showServedTickets
    ? [...COLS, { status: 'Served', label: 'Served', next: null }]
    : COLS;

  return html`
    <section class="pm-masthead" aria-label="Kitchen Pass Expediter">
      <div class="pm-masthead__copy">
        <div class="pm-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${allAllergyCount > 0 ? '#ef4444' : '#eab967'}"></span>
          EXPEDITER &amp; HOT LINE KDS · ${allActive.length} ACTIVE CHECK${allActive.length === 1 ? '' : 'S'}
        </div>
        <h1 class="pm-masthead__title">Kitchen Pass</h1>
        <div class="pm-masthead__meta">
          <span>Call courses Fire → Cooking → Pass → Served</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Allergy alerts pulse in crimson across the line</span>
        </div>
      </div>

      <div class="pm-masthead__pods" style="align-items:center">
        <div class="pm-pod pm-pod--ring">
          <div class="tk-ring" style="--p:${pacePct}%;--ring-color:${paceColor};--ring-size:48px">
            <span class="tk-ring__val">${pacePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="pm-pod__lbl">Line Pace</span>
            <span class="pm-pod__val" style="font-size:16px">${onTimeCount}/${allActive.length} &lt;12m</span>
            <span class="pm-pod__sub">${allActive.length - onTimeCount > 0 ? `${allActive.length - onTimeCount} overdue` : 'On chef pace'}</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="${cls('k-btn', state.showServedTickets ? 'k-btn--primary' : 'k-btn--glass')}" data-action="toggle-served">
            ${icon('check-circle', { size: 15 })} ${state.showServedTickets ? 'Hide Served' : 'Show Served'}
          </button>
          <button type="button" class="k-btn k-btn--primary" data-action="pass-fire">${icon('flame', { size: 15 })} Fire Course Ticket</button>
        </div>
      </div>

      <div class="pm-pass-ribbons" role="tablist" aria-label="Filter pass by course">
        ${COURSES.map((c) => html`
          <button type="button" class="${cls('pm-ribbon-btn', c.slug ? `pm-ribbon-btn--${c.slug}` : '', { 'is-on': state.passCourse === c.id })}" data-action="pass-course" data-course="${c.id}">
            <span>${c.label}</span>
            <strong>${courseCounts[c.id] || 0}</strong>
          </button>`)}
        <button type="button" class="${cls('pm-ribbon-btn pm-ribbon-btn--allergy', { 'is-on': state.passAllergyOnly })}" data-action="toggle-pass-allergy" style="margin-left:auto">
          ${icon('alert', { size: 13 })}
          <span>Allergy Alerts</span>
          <strong>${allAllergyCount}</strong>
        </button>
      </div>

      <div class="pm-pass-tally" aria-label="All-Day Dish Callout">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#f8dfb0">
            ${icon('cloche', { size: 14 })} All-Day Dish Callout
          </span>
          <span style="font-size:12px;color:rgba(255,244,232,.66)">
            ${tally.list.length ? `${tally.totalDishes} dish${tally.totalDishes === 1 ? '' : 'es'} working across ${tally.activeCount} check${tally.activeCount === 1 ? '' : 's'}` : 'Pass is clear — standing by for orders'}
          </span>
        </div>
        ${tally.list.length ? html`
          <div class="pm-pass-tally__list">
            ${tally.list.map((d) => html`
              <span class="pm-pass-tally__chip">
                <span class="pm-pass-tally__qty">${d.qty}×</span>
                <span>${d.dish}</span>
              </span>`)}
          </div>` : ''}
      </div>
    </section>

    ${state.loading && !state.tickets.length ? html`<section class="tk-sheet">${skeleton(3)}</section>` : filtered.length ? html`
      <div class="tk-board">
        ${columns.map((col) => {
          const cards = filtered
            .filter((t) => t.status === col.status)
            .sort((a, b) => (b.priority === 'Priority' ? 1 : 0) - (a.priority === 'Priority' ? 1 : 0));
          return html`
            <div class="tk-col" data-key="col-${col.status}">
              <div class="tk-col__head">
                <span>${col.label}</span>
                <span class="k-badge">${cards.length}</span>
              </div>
              ${cards.length ? cards.map((t) => {
                const hasAllergy = Boolean(t.allergy_notes && t.allergy_notes.trim());
                const slug = courseSlug(t.course);
                const dishes = parseDishLines(t.items);
                return html`
                  <article class="${cls('tk-ticket pm-ticket', `pm-ticket--${slug}`, { 'pm-ticket-allergy': hasAllergy })}" data-key="tk-${t.id}">
                    <div class="pm-ticket__ribbon"></div>
                    <div class="pm-ticket__head">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <strong style="font-family:var(--k-font-display);font-size:17px">Table ${t.table_number}</strong>
                        <span class="pm-course-pill pm-course--${slug}">${courseDisplayLabel(t.course)}</span>
                        ${t.priority === 'Priority' ? html`<span class="tk-tag tk-tag--bad">VIP</span>` : ''}
                      </div>
                      ${renderAgePill(t)}
                    </div>
                    <div class="pm-ticket__body">
                      ${hasAllergy ? html`
                        <div class="pm-allergy-alert">${icon('alert', { size: 15 })} <span>ALLERGY: ${t.allergy_notes}</span></div>` : ''}
                      <div class="pm-dish-list">
                        ${dishes.map((d) => html`
                          <div class="pm-dish-line">
                            <div>${d.main}</div>
                            ${d.mods.length ? html`
                              <div style="display:flex;flex-wrap:wrap;gap:4px">
                                ${d.mods.map((m) => html`<span class="pm-dish-mod">★ ${m}</span>`)}
                              </div>` : ''}
                          </div>`)}
                      </div>
                      <div class="tk-ticket__meta">Server: <strong>${t.server_name || 'Floor'}</strong></div>
                      ${col.next ? html`
                        <div style="display:grid;gap:6px;padding-top:8px;border-top:1px dashed var(--k-border)">
                          <button type="button" class="k-btn k-btn--primary k-btn--block" style="min-height:35px;font-size:13px" data-action="pass-bump" data-id="${t.id}" data-status="${col.next}">${col.nextLabel}</button>
                          ${col.next !== 'Served' ? html`
                            <button type="button" class="k-btn k-btn--sm k-btn--block" data-action="pass-bump" data-id="${t.id}" data-status="Served">${icon('check', { size: 13 })} Fast Mark Served</button>` : ''}
                        </div>` : ''}
                    </div>
                  </article>`;
              }) : html`<p class="tk-muted" style="font-size:13px;padding:14px 4px;text-align:center">Clear</p>`}
            </div>`;
        })}
      </div>` : emptyState({
        iconName: 'cloche',
        title: state.passCourse !== 'All' || state.passAllergyOnly ? 'No checks match this filter' : 'The pass is clear',
        text: state.passCourse !== 'All' || state.passAllergyOnly ? 'Reset course or allergy filters to view all active checks.' : 'Fire course tickets directly from the Floor Map or click Fire Course Ticket above.',
        action: state.passCourse !== 'All' || state.passAllergyOnly
          ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="pass-reset-filters">Show All Checks</button>`
          : html`<a href="#/" class="k-btn k-btn--primary k-btn--sm">Open Floor Map</a>`,
      })}
  `;
}

export function wirePassActions(root, state, { draw, loadScreen }) {
  on(root, 'click', '[data-action="pass-course"]', (e, el) => { state.passCourse = el.dataset.course; draw(); });
  on(root, 'click', '[data-action="toggle-pass-allergy"]', () => { state.passAllergyOnly = !state.passAllergyOnly; draw(); });
  on(root, 'click', '[data-action="pass-reset-filters"]', () => { state.passCourse = 'All'; state.passAllergyOnly = false; draw(); });
  on(root, 'click', '[data-action="toggle-served"]', () => { state.showServedTickets = !state.showServedTickets; loadScreen('/pass'); });

  on(root, 'click', '[data-action="pass-bump"]', async (e, el) => {
    try { await api.post('/api/tickets/advance', { id: Number(el.dataset.id), status: el.dataset.status }); await loadScreen('/pass'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="pass-fire"]', async () => {
    const made = await formDialog({
      title: 'Fire Course Ticket',
      submitLabel: 'Fire to Kitchen',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Table</span>
            <select class="k-input" name="table_id" required>
              ${state.tables.map((t) => html`<option value="${t.id}">Table ${t.table_number} (${t.section} · ${t.status})</option>`)}
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Course</span>
            <select class="k-input" name="course">
              <option value="Entree">Starter / Entree</option>
              <option value="Mains" selected>Main</option>
              <option value="Desserts">Dessert</option>
              <option value="Drinks">Drinks</option>
            </select>
          </label>
          <label class="k-field"><span class="k-field__label">Priority</span>
            <select class="k-input" name="priority"><option value="Normal">Normal</option><option value="Priority">Priority</option></select>
          </label>
        </div>
        <label class="k-field"><span class="k-field__label">Dishes / Drinks</span>
          <textarea class="k-input" name="items" rows="3" placeholder="2x Duck Confit&#10;1x Market Fish (sauce on side)" required></textarea>
        </label>
        <label class="k-field"><span class="k-field__label" style="color:#b91c1c">Allergy alert (shows pulsing red banner)</span>
          <input class="k-input" name="allergy_notes" placeholder="e.g. Nut allergy, Shellfish, Coeliac">
        </label>`,
      onSubmit: (v) => api.post('/api/tickets', { ...v, table_id: Number(v.table_id) }),
    });
    if (made) { toast.success('Course ticket fired!'); await loadScreen('/pass'); }
  });
}
