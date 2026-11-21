// kit/turnkey.js: shared turnkey onboarding, live brand accent customization, team access doors,
// launch readiness checklist, and business settings helpers for all 29 FormLogic turnkey apps.
import { html, cls } from './dom.js';
import { icon } from './icons.js';
import { ZONES } from './time.js';

export const CURRENCIES = [
  ['AUD', 'AUD ($) — Australian Dollar'],
  ['USD', 'USD ($) — US Dollar'],
  ['NZD', 'NZD ($) — New Zealand Dollar'],
  ['GBP', 'GBP (£) — British Pound'],
  ['EUR', 'EUR (€) — Euro'],
  ['CAD', 'CAD ($) — Canadian Dollar'],
  ['SGD', 'SGD ($) — Singapore Dollar'],
];

/** Apply a user-selected brand accent preset onto CSS custom properties live. */
export function applyBrandPreset(presets, presetId) {
  const chosen = presets.find((p) => p.id === presetId) || presets[0];
  if (!chosen) return;
  const root = document.documentElement;
  root.style.setProperty('--k-accent', chosen.accent);
  root.style.setProperty('--k-accent-soft', chosen.soft);
  if (chosen.rail) root.style.setProperty('--t-rail', chosen.rail);
  if (chosen.accentText) root.style.setProperty('--k-accent-text', chosen.accentText);
}

/** First-run turnkey setup wizard for the business owner. */
export function renderSetupDoor({
  appName,
  tagline,
  iconName,
  defaultBusiness,
  defaultCurrency = 'AUD',
  defaultZone = 'Australia/Sydney',
  presets = [],
  selectedPreset = '',
  extraFields = '',
  busy = false,
  error = '',
}) {
  const activePreset = selectedPreset || (presets[0] ? presets[0].id : '');
  return html`
    <div class="tk-door">
      <div class="tk-door__card">
        <div class="tk-door__head">
          <div class="tk-door__icon">${icon(iconName, { size: 26 })}</div>
          <div>
            <h1 class="tk-door__title">Set up ${appName}</h1>
            <p class="tk-door__sub">${tagline}</p>
          </div>
        </div>
        <form class="k-form" data-form="setup" novalidate>
          <label class="k-field">
            <span class="k-field__label">Your business name</span>
            <input class="k-input" name="business_name" value="${defaultBusiness}" placeholder="e.g. ${defaultBusiness}" required>
          </label>
          <div class="k-form__row">
            <label class="k-field">
              <span class="k-field__label">Your display name</span>
              <input class="k-input" name="owner_name" value="" placeholder="e.g. Alex Taylor" required>
            </label>
            <label class="k-field">
              <span class="k-field__label">Business tagline <span class="k-field__optional">optional</span></span>
              <input class="k-input" name="tagline" value="" placeholder="Shown in the sidebar">
            </label>
          </div>
          <div class="k-form__row">
            <label class="k-field">
              <span class="k-field__label">Currency</span>
              <select class="k-input" name="currency">
                ${CURRENCIES.map(([code, label]) => html`<option value="${code}" ${code === defaultCurrency ? 'selected' : ''}>${label}</option>`)}
              </select>
            </label>
            <label class="k-field">
              <span class="k-field__label">Time zone</span>
              <select class="k-input" name="timezone">
                ${ZONES.map(([z, label]) => html`<option value="${z}" ${z === defaultZone ? 'selected' : ''}>${label}</option>`)}
              </select>
            </label>
          </div>
          ${extraFields}
          ${presets.length ? html`
            <div class="k-field">
              <span class="k-field__label">Brand colour</span>
              <input type="hidden" name="brand_preset" value="${activePreset}">
              <div class="tk-swatches">
                ${presets.map((p) => html`
                  <button type="button" class="${cls('tk-swatch', { 'is-on': p.id === activePreset })}" data-action="pick-preset" data-preset="${p.id}">
                    <span class="tk-swatch__dot" style="background:${p.accent}"></span>${p.label}
                  </button>`)}
              </div>
            </div>` : ''}
          <label class="k-check">
            <input type="checkbox" name="load_sample" checked>
            <span><strong>Load realistic sample data</strong> so I can explore every screen right away (marked Sample and removable in one click).</span>
          </label>
          ${error ? html`<p class="k-form-error" role="alert">${error}</p>` : ''}
          <div class="k-form__actions">
            <button type="submit" class="${cls('k-btn k-btn--primary k-btn--block', { 'is-busy': busy })}" ${busy ? 'disabled' : ''}>
              Launch ${appName}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

/** Team member join/waiting door when a non-owner opens an already-set-up business app. */
export function renderJoinDoor({ businessName, appName, iconName, pending = false, roles = [], busy = false, error = '' }) {
  return html`
    <div class="tk-door">
      <div class="tk-door__card">
        <div class="tk-door__head">
          <div class="tk-door__icon">${icon(iconName, { size: 26 })}</div>
          <div>
            <h1 class="tk-door__title">${businessName || appName}</h1>
            <p class="tk-door__sub">${pending ? 'Your request to join is waiting for approval.' : 'Ask the business owner for access to this workspace.'}</p>
          </div>
        </div>
        ${pending ? html`
          <p class="tk-muted">The owner can approve your account and assign your role from <strong>Settings → Team</strong>. Once approved, click Check access.</p>
          <button type="button" class="k-btn k-btn--primary" data-action="refresh-session">${icon('refresh', { size: 17 })} Check access</button>
        ` : html`
          <form class="k-form" data-form="join-request" novalidate>
            <label class="k-field">
              <span class="k-field__label">Your name</span>
              <input class="k-input" name="display_name" placeholder="How your team knows you" required>
            </label>
            ${roles.length ? html`
              <label class="k-field">
                <span class="k-field__label">Requested role</span>
                <select class="k-input" name="requested_role">
                  ${roles.map((r) => html`<option value="${r.id}">${r.label}</option>`)}
                </select>
              </label>` : ''}
            ${error ? html`<p class="k-form-error" role="alert">${error}</p>` : ''}
            <button type="submit" class="${cls('k-btn k-btn--primary', { 'is-busy': busy })}" ${busy ? 'disabled' : ''}>Request to join</button>
          </form>
        `}
      </div>
    </div>`;
}

/** Ultra-slim pill notice bar shown while sample records exist. */
export function renderSampleBanner(sampleCount, { canClear = true } = {}) {
  if (!sampleCount) return '';
  return html`
    <div class="tk-sample-bar">
      <span style="display:inline-flex;align-items:center;gap:6px">
        ${icon('sparkle', { size: 13 })}
        <span><strong>Demo mode</strong> · ${sampleCount} sample records loaded</span>
      </span>
      ${canClear ? html`<button type="button" class="tk-sample-bar__btn" data-action="clear-sample">Clear sample data</button>` : ''}
    </div>`;
}

/** Reusable Business Profile, Branding, Launch Readiness, Team & Data Management Settings view. */
export function renderTurnkeySettings({
  settings,
  me,
  team = [],
  roles = [],
  presets = [],
  sampleCount = 0,
  extraSection = '',
  exports = [],
}) {
  const canManage = me && (me.isOwner || me.role === 'owner' || me.role === 'manager' || me.role === 'admin');
  const activeCount = team.filter((m) => m.status === 'active').length;
  const pendingCount = team.filter((m) => m.status === 'pending').length;
  const checks = [
    { done: !!(settings.business_name && settings.business_name.trim()), label: 'Business name & brand theme configured' },
    { done: !!(settings.phone || settings.email || settings.address), label: 'Contact details added for invoices & reports' },
    { done: activeCount > 1, label: 'Team members invited and approved' },
    { done: sampleCount === 0, label: 'Sample data cleared for live production launch' },
  ];
  const doneChecks = checks.filter((c) => c.done).length;
  const readyPct = Math.round((doneChecks / checks.length) * 100);

  return html`
    <section class="tk-settings-masthead">
      <div class="tk-settings-masthead__copy">
        <div class="tk-settings-eyebrow">${icon('sliders', { size: 12 })} Workspace Configuration</div>
        <h1 class="tk-settings-title">Business Settings</h1>
        <p class="tk-settings-sub">
          <span><strong>${settings.business_name || 'Your Workspace'}</strong></span>
          <span class="tk-meta-sep">·</span>
          <span>${settings.currency || 'AUD'} · ${settings.tax_rate ?? 10}% tax</span>
          <span class="tk-meta-sep">·</span>
          <span>${settings.timezone || 'UTC'}</span>
        </p>
      </div>
      <div class="tk-settings-pods">
        <div class="tk-settings-pod tk-settings-pod--ring">
          <div class="tk-ring" style="--p:${readyPct}%;--ring-color:${readyPct === 100 ? '#34d399' : '#fbbf24'};--ring-size:46px">
            <span class="tk-ring__val">${readyPct}%</span>
          </div>
          <div>
            <div class="tk-settings-pod__lbl">Launch Ready</div>
            <div class="tk-settings-pod__val">${doneChecks}/${checks.length}</div>
            <div class="tk-settings-pod__sub">${readyPct === 100 ? 'Ready for live use' : 'Setup checklist'}</div>
          </div>
        </div>
        <div class="tk-settings-pod">
          <span class="tk-settings-pod__lbl">Team Access</span>
          <span class="tk-settings-pod__val">${activeCount}</span>
          <span class="tk-settings-pod__sub">${pendingCount ? `${pendingCount} pending` : 'Active members'}</span>
        </div>
        <div class="tk-settings-pod">
          <span class="tk-settings-pod__lbl">Workspace Data</span>
          <span class="tk-settings-pod__val">${sampleCount ? `${sampleCount} Sample` : 'Live Mode'}</span>
          <span class="tk-settings-pod__sub">${sampleCount ? 'Demo records loaded' : 'Production clean'}</span>
        </div>
      </div>
    </section>
    <div class="tk-grid-2">
      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('sliders', { size: 17 })} Business Profile &amp; Branding</h2></div>
          <div class="tk-sheet__body">
            <form class="k-form" data-form="save-settings" novalidate>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Business name</span>
                  <input class="k-input" name="business_name" value="${settings.business_name || ''}" ${canManage ? '' : 'disabled'}>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Tagline / Location</span>
                  <input class="k-input" name="tagline" value="${settings.tagline || ''}" ${canManage ? '' : 'disabled'}>
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Phone</span>
                  <input class="k-input" name="phone" value="${settings.phone || ''}" placeholder="+61 2 9000 0000" ${canManage ? '' : 'disabled'}>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Email</span>
                  <input class="k-input" name="email" value="${settings.email || ''}" placeholder="hello@yourbusiness.com" ${canManage ? '' : 'disabled'}>
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Address</span>
                  <input class="k-input" name="address" value="${settings.address || ''}" placeholder="Street address, suburb" ${canManage ? '' : 'disabled'}>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Business / Tax ID (ABN, EIN, VAT)</span>
                  <input class="k-input" name="tax_id" value="${settings.tax_id || ''}" placeholder="e.g. ABN 12 345 678 901" ${canManage ? '' : 'disabled'}>
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field">
                  <span class="k-field__label">Currency</span>
                  <select class="k-input" name="currency" ${canManage ? '' : 'disabled'}>
                    ${CURRENCIES.map(([code, label]) => html`<option value="${code}" ${code === settings.currency ? 'selected' : ''}>${label}</option>`)}
                  </select>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Tax rate (%)</span>
                  <input class="k-input" type="number" step="0.1" min="0" max="50" name="tax_rate" value="${settings.tax_rate ?? 10}" ${canManage ? '' : 'disabled'}>
                </label>
                <label class="k-field">
                  <span class="k-field__label">Time zone</span>
                  <select class="k-input" name="timezone" ${canManage ? '' : 'disabled'}>
                    ${ZONES.map(([z, label]) => html`<option value="${z}" ${z === settings.timezone ? 'selected' : ''}>${label}</option>`)}
                  </select>
                </label>
              </div>
              ${presets.length ? html`
                <div class="k-field">
                  <span class="k-field__label">Brand colour preset</span>
                  <input type="hidden" name="brand_preset" value="${settings.brand_preset || presets[0].id}">
                  <div class="tk-swatches">
                    ${presets.map((p) => html`
                      <button type="button" class="${cls('tk-swatch', { 'is-on': p.id === (settings.brand_preset || presets[0].id) })}" data-action="pick-preset" data-preset="${p.id}" ${canManage ? '' : 'disabled'}>
                        <span class="tk-swatch__dot" style="background:${p.accent}"></span>${p.label}
                      </button>`)}
                  </div>
                </div>` : ''}
              ${canManage ? html`
                <div class="k-form__actions">
                  <button type="submit" class="k-btn k-btn--primary">Save business settings</button>
                </div>` : html`<p class="tk-muted">Only the business owner or manager can change workspace settings.</p>`}
            </form>
          </div>
        </section>
        ${extraSection}
      </div>

      <div class="tk-stack">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('check-circle', { size: 17 })} Launch Readiness</h2>
            <span class="tk-tag ${readyPct === 100 ? 'tk-tag--ok' : 'tk-tag--accent'}" style="margin-left:auto">${readyPct}% ready</span>
          </div>
          <div class="tk-sheet__body" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
            <div class="tk-ring" style="--p:${readyPct}%;--ring-color:${readyPct === 100 ? '#16a34a' : 'var(--k-accent)'};--ring-size:64px">
              <span class="tk-ring__val">${readyPct}%</span>
            </div>
            <div class="tk-readiness" style="flex:1;min-width:210px">
              ${checks.map((c) => html`
                <div class="${cls('tk-readiness__item', { 'is-done': c.done })}">
                  <span class="tk-readiness__dot">${c.done ? icon('check', { size: 12 }) : ''}</span>
                  <span>${c.label}</span>
                </div>`)}
            </div>
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Team &amp; Roles</h2>
            <span class="tk-sheet__count">${team.length}</span>
          </div>
          <div>
            ${team.map((m) => html`
              <div class="tk-row" data-key="member-${m.user_id}">
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    ${m.display_name}
                    ${m.is_owner ? html`<span class="tk-tag tk-tag--accent">Owner</span>` : ''}
                    ${m.status === 'pending' ? html`<span class="tk-tag tk-tag--warn">Pending approval</span>` : ''}
                  </div>
                  <div class="tk-row__meta"><span>Role: ${m.role}</span></div>
                </div>
                ${canManage && !m.is_owner ? html`
                  <div class="tk-row__aside">
                    ${m.status === 'pending'
                      ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="approve-member" data-id="${m.user_id}">Approve</button>`
                      : html`<select class="k-input" style="min-height:32px;padding:4px 8px;width:auto;font-size:13px" data-action="change-member-role" data-id="${m.user_id}">
                          ${roles.map((r) => html`<option value="${r.id}" ${r.id === m.role ? 'selected' : ''}>${r.label}</option>`)}
                        </select>`}
                    <button type="button" class="k-btn k-btn--sm" data-action="remove-member" data-id="${m.user_id}">Remove</button>
                  </div>` : ''}
              </div>`)}
          </div>
        </section>

        <section class="tk-sheet">
          <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('download', { size: 17 })} Sample Data &amp; Exports</h2></div>
          <div class="tk-sheet__body tk-stack" style="gap:12px">
            <div class="tk-btn-row">
              ${sampleCount
                ? html`<button type="button" class="k-btn k-btn--sm" data-action="clear-sample">Clear ${sampleCount} sample records</button>`
                : html`<button type="button" class="k-btn k-btn--sm" data-action="load-sample">Load sample data</button>`}
              ${exports.map((ex) => html`
                <button type="button" class="k-btn k-btn--sm" data-action="export-data" data-export="${ex.id}">${icon('download', { size: 14 })} ${ex.label}</button>`)}
            </div>
            <p class="tk-muted" style="font-size:13px">All data lives privately in your FormLogic SQLite database. Invite staff from FormLogic's <strong>Members</strong> screen so they can join with their own account.</p>
          </div>
        </section>
      </div>
    </div>`;
}
