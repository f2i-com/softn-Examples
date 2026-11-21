// Client Cards Directory: Unified Editorial Espresso Masthead, Monogrammed Client Profiles,
// Rose-Gold Bordered Colour Formula Vaults & Complete Service + Retail History Modal.
import { html, on } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { money, initials } from '../../kit/format.js';
import { today, fmtDay } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, openDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { openAppointmentForm, printClientReceipt } from './book.js';

export function renderClientsView(state) {
  const cur = state.session.settings.currency || 'AUD';
  const q = (state.clientSearch || '').trim().toLowerCase();
  const list = state.clients.filter((c) => !q || `${c.name} ${c.phone} ${c.email} ${c.notes}`.toLowerCase().includes(q));

  const withFormula = state.clients.filter((c) => Boolean((c.notes || '').trim())).length;
  const lifetimeSpend = state.clients.reduce((s, c) => s + Number(c.service_spend_cents || 0) + Number(c.retail_spend_cents || 0), 0);
  const totalVisits = state.clients.reduce((s, c) => s + Number(c.visit_count || 0), 0);

  return html`
    <section class="sl-masthead" aria-label="Clientele & Colour Formula Directory">
      <div class="sl-masthead__copy">
        <div class="sl-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:#edd2ab"></span>
          CLIENTELE · COLOUR FORMULA VAULT
        </div>
        <h1 class="sl-masthead__title">Client Cards</h1>
        <div class="sl-masthead__meta">
          <span><strong style="color:#f6dec0">${state.clients.length} client${state.clients.length === 1 ? '' : 's'}</strong> on file</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>1-click colour formula copy</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Full service &amp; retail history</span>
        </div>
      </div>

      <div class="sl-masthead__pods" style="align-items:center">
        <div class="sl-pod sl-pod--champagne">
          <span class="sl-pod__lbl">${icon('colour-bowl', { size: 12 })} Formulas</span>
          <span class="sl-pod__val">${withFormula}/${state.clients.length}</span>
          <span class="sl-pod__sub">Saved on card</span>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('calendar', { size: 12 })} Visits</span>
          <span class="sl-pod__val">${totalVisits}</span>
          <span class="sl-pod__sub">Total bookings</span>
        </div>

        <div class="sl-pod">
          <span class="sl-pod__lbl">${icon('dollar', { size: 12 })} Lifetime</span>
          <span class="sl-pod__val">${money(lifetimeSpend, { currency: cur })}</span>
          <span class="sl-pod__sub">Services + retail</span>
        </div>

        <button type="button" class="k-btn sl-cta-gold" data-action="client-new">${icon('plus', { size: 15 })} Add Client</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <label class="tk-search">
        ${icon('search', { size: 15 })}
        <input placeholder="Search client, phone or colour formula…" value="${state.clientSearch}" data-action="client-search">
      </label>
    </div>

    ${state.loading && !state.clients.length ? html`
      <section class="tk-sheet">${skeleton(3)}</section>
    ` : list.length ? html`
      <div class="sl-cards-grid">
        ${list.map((c) => {
          const totalSpend = Number(c.service_spend_cents || 0) + Number(c.retail_spend_cents || 0);
          return html`
            <article class="tk-card" data-key="cl-${c.id}">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="sl-client-avatar">${initials(c.name || 'CL')}</div>
                <div style="min-width:0;flex:1">
                  <h2 class="tk-card__title">${c.name}</h2>
                  <div class="tk-card__sub">${c.client_since ? 'Client since ' + fmtDay(c.client_since) : 'Salon guest'}</div>
                </div>
                <span class="tk-tag tk-tag--accent">${c.visit_count || 0} visit${Number(c.visit_count) === 1 ? '' : 's'}</span>
              </div>
              <div class="tk-row__meta">
                ${c.phone ? html`<span>${icon('phone', { size: 13 })} ${c.phone}</span>` : ''}
                ${c.email ? html`<span>${icon('mail', { size: 13 })} ${c.email}</span>` : ''}
                ${totalSpend > 0 ? html`<span>Spend: <strong style="color:var(--k-accent)">${money(totalSpend, { currency: cur })}</strong></span>` : ''}
                ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
              </div>
              ${c.notes ? html`
                <div class="formula-box">
                  <div class="formula-box__head">
                    <span class="formula-box__label">${icon('colour-bowl', { size: 12 })} Colour Formula &amp; Notes</span>
                    <button type="button" class="formula-box__copy" data-action="client-copy-formula" data-id="${c.id}">
                      ${icon('copy', { size: 11 })} Copy
                    </button>
                  </div>
                  <div class="formula-box__body">${c.notes}</div>
                </div>` : html`<div class="tk-muted" style="font-size:12.5px">No colour formula or style notes yet.</div>`}
              <div class="tk-btn-row" style="margin-top:auto;padding-top:8px;border-top:1px solid var(--k-border)">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="client-book" data-id="${c.id}">${icon('calendar', { size: 13 })} Book</button>
                <button type="button" class="k-btn k-btn--sm" data-action="client-history" data-id="${c.id}">${icon('file', { size: 13 })} History</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-copy" data-id="${c.id}" title="Copy contact &amp; formula">${icon('copy', { size: 13 })}</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="client-edit" data-id="${c.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" style="margin-left:auto" data-action="client-del" data-id="${c.id}">Delete</button>
              </div>
            </article>`;
        })}
      </div>` : emptyState({ iconName: 'users', title: 'No client cards match your search', text: 'Create client cards to store colour formulas, preferences and appointment history.' })}
  `;
}

export function wireClientActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="client-search"]', (e, el) => { state.clientSearch = el.value; draw(); });

  const clientFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Client Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Phone Number</span><input class="k-input" name="phone" value="${c.phone || ''}" required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email Address</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Client Since</span><input class="k-input" type="date" name="client_since" value="${c.client_since || today()}"></label>
    </div>
    <label class="k-field"><span class="k-field__label">Colour Formula, Allergies &amp; Style Preferences</span>
      <textarea class="k-input" name="notes" rows="4" placeholder="Roots formula, toner ratio, developer vol, scalp sensitivities, favourite drink…">${c.notes || ''}</textarea>
    </label>`;

  on(root, 'click', '[data-action="client-new"]', async () => {
    const made = await formDialog({ title: 'Add Client Card', submitLabel: 'Save Client', fields: clientFields(), onSubmit: (v) => api.post('/api/clients', v) });
    if (made) { toast.success('Client card created.'); await loadScreen('/clients'); }
  });
  on(root, 'click', '[data-action="client-edit"]', async (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save Client', fields: clientFields(c), onSubmit: (v) => api.put('/api/clients', { ...v, id: c.id }) });
    if (saved) { toast.success('Client card updated.'); await loadScreen('/clients'); }
  });
  on(root, 'click', '[data-action="client-copy-formula"]', (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (!c || !c.notes) return;
    copyText(`${c.name} — Colour Formula & Preferences:\n${c.notes}`, {
      title: `Colour Formula · ${c.name}`,
      done: `Formula copied for ${c.name}!`,
    });
  });
  on(root, 'click', '[data-action="client-copy"]', (e, el) => {
    const c = state.clients.find((x) => String(x.id) === el.dataset.id);
    if (c) copyText(`${c.name}\nPhone: ${c.phone}\nEmail: ${c.email || '—'}${c.notes ? '\nColour Formula & Notes: ' + c.notes : ''}`, { title: 'Client Contact & Formula' });
  });
  on(root, 'click', '[data-action="client-book"]', (e, el) => {
    openAppointmentForm(state, { loadScreen }, { client_id: Number(el.dataset.id) });
  });
  on(root, 'click', '[data-action="client-history"]', async (e, el) => {
    try {
      const hist = await api.get('/api/clients/history', { id: Number(el.dataset.id) });
      const c = hist.client;
      const cur = state.session.settings.currency || 'AUD';
      await openDialog({
        title: `Client History · ${c.name}`,
        size: 'lg',
        body: html`
          <div class="tk-stack">
            ${c.notes ? html`
              <div class="formula-box">
                <div class="formula-box__head">
                  <span class="formula-box__label">${icon('colour-bowl', { size: 12 })} Colour Formula &amp; Style Notes</span>
                  <button type="button" class="formula-box__copy" data-dialog-copy-formula>${icon('copy', { size: 11 })} Copy Formula</button>
                </div>
                <div class="formula-box__body">${c.notes}</div>
              </div>` : ''}
            <div>
              <h3 style="margin-bottom:8px;font-size:15px">Appointments (${hist.appointments.length})</h3>
              ${hist.appointments.length ? html`
                <div class="tk-sheet">
                  ${hist.appointments.map((a) => html`
                    <div class="tk-row">
                      <div class="tk-row__main">
                        <div class="tk-row__title"><span>${a.service_name}</span><span class="tk-tag">${a.status}</span></div>
                        <div class="tk-row__meta"><span>${fmtDay(a.appt_date)} at ${a.appt_time}</span><span>Stylist: ${a.stylist_name}</span>${a.notes ? html`<span>${a.notes}</span>` : ''}</div>
                      </div>
                      <strong>${money(a.price_cents, { currency: cur })}</strong>
                    </div>`)}
                </div>` : html`<p class="tk-muted">No appointments yet.</p>`}
            </div>
            <div>
              <h3 style="margin-bottom:8px;font-size:15px">Retail Purchases (${hist.sales.length})</h3>
              ${hist.sales.length ? html`
                <div class="tk-sheet">
                  ${hist.sales.map((s) => html`
                    <div class="tk-row">
                      <div class="tk-row__main">
                        <div class="tk-row__title"><span>${s.product_name}</span><span class="tk-tag">×${s.quantity}</span></div>
                        <div class="tk-row__meta"><span>${fmtDay(s.sale_date)}</span></div>
                      </div>
                      <strong>${money(s.amount_cents, { currency: cur })}</strong>
                    </div>`)}
                </div>` : html`<p class="tk-muted">No retail purchases yet.</p>`}
            </div>
          </div>`,
        onOpen: ({ body }) => {
          on(body, 'click', '[data-dialog-copy-formula]', () => {
            copyText(`${c.name} — Colour Formula & Preferences:\n${c.notes}`, {
              title: `Colour Formula · ${c.name}`,
              done: `Formula copied for ${c.name}!`,
            });
          });
        },
        actions: [
          { label: 'Print Client Receipt', kind: 'primary', run: async () => { await printClientReceipt(c.id, '', state); return false; } },
          { label: 'Close', value: true, kind: 'ghost' },
        ],
      });
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="client-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete client card?', message: 'Delete this client (only allowed if no appointments are linked)?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/clients', { id: Number(el.dataset.id) }); toast.success('Client deleted.'); await loadScreen('/clients'); }
    catch (err) { toastError(err); }
  });
}
