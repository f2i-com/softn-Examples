// Callers / Customers CRM (Monogrammed Visual Caller Cards), Hardware & Bridge Diagnostics (Unified Masthead + Health Ring + Telemetry Cards),
// and AI Receptionist Persona Preview & Routing Settings (Unified Masthead + Live Spoken Prompt Preview).
import { html, on, cls, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { fmtDay, fmtDateTime } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

function extractHoursLine(businessInfo) {
  const lines = String(businessInfo || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const found = lines.find((l) => {
    const low = l.toLowerCase();
    return low.startsWith('hours:') || low.startsWith('open:') || low.includes('am -') || low.includes('am –');
  });
  return found || 'Hours defined in Business Info knowledge block';
}

function inferToneLabel(instructions) {
  const low = String(instructions || '').toLowerCase();
  const traits = [];
  if (low.includes('warm')) traits.push('Warm');
  if (low.includes('concise') || low.includes('brief')) traits.push('Concise');
  if (low.includes('natural')) traits.push('Natural');
  if (low.includes('formal') || low.includes('professional')) traits.push('Professional');
  if (!traits.length) traits.push('Helpful & Natural');
  return traits.join(' · ');
}

export function renderCustomersView(state) {
  const loadingCust = state.loading && !state.customers.length;
  const vipCount = state.customers.filter((c) => c.status === 'VIP').length;
  const smsCapCount = state.customers.filter((c) => c.sms_capable !== 'No').length;
  const smsPct = state.customers.length ? Math.round((smsCapCount / state.customers.length) * 100) : 100;

  const cf = state.customerFilter || 'All';
  const rows = state.customers.filter((c) => {
    if (cf === 'VIP') return c.status === 'VIP';
    if (cf === 'Landline') return c.sms_capable === 'No';
    return true;
  });

  return html`
    <section class="ak-masthead" aria-label="Callers CRM">
      <div class="ak-masthead__copy">
        <div class="ak-masthead__eyebrow">
          ${icon('users', { size: 12 })} CALLER RECOGNITION &amp; SMS ROUTING
        </div>
        <h1 class="ak-masthead__title">Callers CRM</h1>
        <div class="ak-masthead__meta">
          <span>Auto-matches caller phone numbers to greet VIPs by name</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Prevents texting landlines</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="ak-pod ak-pod--ring ak-pod--cyan" aria-label="SMS capable callers ${smsPct}%">
          <div class="tk-ring" style="--p:${smsPct}%;--ring-color:#22d3ee;--ring-size:48px">
            <span class="tk-ring__val">${smsPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ak-pod__lbl">SMS Reach</span>
            <span class="ak-pod__val" style="font-size:16px">${smsCapCount}/${state.customers.length}</span>
            <span class="ak-pod__sub">Mobile capable</span>
          </div>
        </div>

        <div class="${cls('ak-pod ak-pod--banner-sm', { 'ak-pod--coral': vipCount > 0 })}">
          <span class="ak-pod__lbl">${icon('star', { size: 12 })} VIP Callers</span>
          <span class="ak-pod__val">${vipCount}</span>
          <span class="ak-pod__sub">Priority greet</span>
        </div>

        <button type="button" class="k-btn ak-btn-cyan" data-action="cust-new">${icon('plus', { size: 15 })} Add Caller</button>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-search">
        ${icon('search', { size: 16 })}
        <input type="search" placeholder="Search caller name, phone or preferred service…" value="${state.customerSearch}" data-action="cust-search">
      </div>
      <div class="tk-segmented" role="tablist">
        ${[['All', `All (${state.customers.length})`], ['VIP', `VIP (${vipCount})`], ['Landline', 'Landline Only']].map(([v, lbl]) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': cf === v })}" data-action="cust-filter" data-filter="${v}">${lbl}</button>`)}
      </div>
    </div>

    ${loadingCust ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="ak-crm-grid">
        ${rows.map((c) => {
          const cardCls = c.status === 'VIP' ? 'ak-crm-card--vip' : c.status === 'Blocked' ? 'ak-crm-card--blocked' : '';
          return html`
            <article class="ak-crm-card ${cardCls}" data-key="cu-${c.id}">
              <div class="ak-crm-card__head">
                <div style="display:flex;align-items:center;gap:11px;min-width:0">
                  <span class="ak-queue-avatar ${c.status === 'VIP' ? 'ak-queue-avatar--vip' : 'ak-queue-avatar--cyan'}">${initials(c.name || 'C')}</span>
                  <div style="min-width:0">
                    <div style="font-weight:750;font-size:15px;line-height:1.22">${c.name}</div>
                    <div class="ak-phone tk-muted">${c.phone}</div>
                  </div>
                </div>
                <span class="tk-tag ${c.status === 'VIP' ? 'tk-tag--bad' : c.status === 'Blocked' ? 'tk-tag--bad' : 'tk-tag--ok'}">${c.status}</span>
              </div>
              <div class="ak-crm-card__body">
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  ${c.sms_capable === 'No' ? html`<span class="tk-tag tk-tag--warn">Landline · No SMS</span>` : html`<span class="tk-tag tk-tag--info">SMS Capable</span>`}
                  ${c.preferred_service ? html`<span class="ak-intent-pill">${c.preferred_service}</span>` : ''}
                  ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div class="ak-desk-card__meta">
                  ${c.email ? html`<span>${c.email}</span>` : ''}
                  ${c.last_call_at ? html`<span>Last call: <strong>${fmtDay(c.last_call_at)}</strong></span>` : ''}
                </div>
                ${c.notes ? html`<div style="font-size:12.5px;color:var(--k-muted);padding:8px 10px;border-radius:8px;background:var(--k-surface-2)">${c.notes}</div>` : ''}
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">
                  <button type="button" class="k-btn k-btn--sm" data-action="cust-edit" data-id="${c.id}">Edit</button>
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="cust-del" data-id="${c.id}">Delete</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'users', title: 'No callers saved', text: 'Add known callers so Aokie recognizes them by phone number.' })}</section>`}`;
}

export function renderHardwareView(state) {
  const loadingHw = state.loading && !state.hardwareEvents.length;
  const rows = state.hwFilter === 'All'
    ? state.hardwareEvents
    : state.hardwareEvents.filter((e) => e.severity === state.hwFilter);
  const errors = state.hardwareEvents.filter((e) => e.severity === 'Error' && !e.acknowledged).length;
  const warnings = state.hardwareEvents.filter((e) => e.severity === 'Warning' && !e.acknowledged).length;
  const acked = state.hardwareEvents.filter((e) => e.acknowledged || e.severity === 'Info').length;
  const healthPct = state.hardwareEvents.length ? Math.round((acked / state.hardwareEvents.length) * 100) : 100;

  return html`
    <section class="ak-masthead" aria-label="Hardware & Bridge Diagnostics">
      <div class="ak-masthead__copy">
        <div class="${cls('ak-masthead__eyebrow', { 'ak-masthead__eyebrow--coral': errors > 0 })}">
          <span class="tk-pulse-dot" style="--dot:${errors > 0 ? '#fb7185' : '#22d3ee'}"></span>
          BLUETOOTH HFP/MAP &amp; OAIY RELAY
        </div>
        <h1 class="ak-masthead__title">Hardware &amp; Bridge</h1>
        <div class="ak-masthead__meta">
          <span>Dongle AOKIE-BT-01 live telemetry</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Audio jitter, packet health &amp; alert acknowledgement</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="ak-pod ak-pod--ring ak-pod--cyan" aria-label="Bridge health ${healthPct}%">
          <div class="tk-ring" style="--p:${healthPct}%;--ring-color:${errors > 0 ? '#fb7185' : '#22d3ee'};--ring-size:48px">
            <span class="tk-ring__val">${healthPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="ak-pod__lbl">Bridge Health</span>
            <span class="ak-pod__val" style="font-size:16px">Online</span>
            <span class="ak-pod__sub">AOKIE-BT-01</span>
          </div>
        </div>

        <div class="${cls('ak-pod', { 'ak-pod--alert': errors > 0 })}">
          <span class="ak-pod__lbl">${icon('alert', { size: 12 })} Errors</span>
          <span class="ak-pod__val">${errors}</span>
          <span class="ak-pod__sub">Unack errors</span>
        </div>

        <div class="${cls('ak-pod', { 'ak-pod--coral': warnings > 0 })}">
          <span class="ak-pod__lbl">${icon('bt-bridge', { size: 12 })} Warnings</span>
          <span class="ak-pod__val">${warnings}</span>
          <span class="ak-pod__sub">Unack alerts</span>
        </div>

        <div class="ak-pod ak-pod--banner-sm">
          <span class="ak-pod__lbl">${icon('smartphone', { size: 12 })} Events</span>
          <span class="ak-pod__val">${loadingHw ? '…' : state.hardwareEvents.length}</span>
          <span class="ak-pod__sub">Total stream</span>
        </div>

        <div class="ak-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn ak-btn-cyan" data-action="hw-new">${icon('plus', { size: 15 })} Log Event</button>
        </div>
      </div>
    </section>

    <div class="ak-dongle-bar">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
        <span class="ak-live-pill"><span class="live-dot"></span> Dongle AOKIE-BT-01 Paired</span>
        <span class="ak-phone" style="color:var(--k-text);font-weight:700">HFP/MAP · mSBC Audio</span>
      </div>
      <div class="tk-segmented" role="tablist">
        ${['All', 'Error', 'Warning', 'Info'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.hwFilter === f })}" data-action="hw-filter" data-filter="${f}">${f}</button>`)}
      </div>
    </div>

    ${loadingHw ? html`<section class="tk-sheet">${skeleton(4)}</section>` : rows.length ? html`
      <div class="ak-card-list">
        ${rows.map((e) => {
          const tone = e.severity === 'Error' ? 'ak-desk-card--coral' : e.severity === 'Warning' ? 'ak-desk-card--warn' : 'ak-desk-card--cyan';
          return html`
            <article class="ak-desk-card ${tone}" data-key="hw-${e.id}">
              <div class="ak-desk-card__top">
                <div class="ak-desk-card__head">
                  <div class="ak-desk-card__title">
                    <span class="tk-tag ${e.severity === 'Error' ? 'tk-tag--bad' : e.severity === 'Warning' ? 'tk-tag--warn' : 'tk-tag--info'}">${e.severity}</span>
                    <span class="ak-code">${e.event_name}</span>
                    <span class="tk-tag">${e.dongle_id}</span>
                    ${e.acknowledged ? html`<span class="tk-tag tk-tag--ok">Acknowledged</span>` : ''}
                    ${e.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div class="ak-desk-card__meta">
                    <span class="ak-ts">${fmtDateTime(e.occurred_at)}</span>
                  </div>
                  <div style="font-size:13.5px;color:var(--k-text)">${e.message}</div>
                </div>
                <div class="ak-desk-card__actions">
                  ${!e.acknowledged ? html`<button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="hw-ack" data-id="${e.id}">${icon('check', { size: 13 })} Acknowledge</button>` : ''}
                  <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="hw-del" data-id="${e.id}">Delete</button>
                </div>
              </div>
            </article>`;
        })}
      </div>` : html`<section class="tk-sheet">${emptyState({ iconName: 'bt-bridge', title: 'No hardware events', text: 'Dongle telemetry and Bluetooth bridge events appear here.' })}</section>`}`;
}

export function renderAiSettingsView(state) {
  const cfg = state.aiConfig;
  const loadingCfg = state.loading && !cfg;
  const c = cfg || {};
  const isActive = c.active !== 'No';
  const bizName = state.session?.settings?.business_name || 'Your Business';
  const greetingText = c.greeting || `Good morning, thank you for calling ${bizName}, Aokie speaking. How can I help you today?`;
  const hoursLine = extractHoursLine(c.business_info);
  const toneLabel = inferToneLabel(c.instructions);

  return html`
    <section class="ak-masthead" aria-label="AI Receptionist Persona & Routing">
      <div class="ak-masthead__copy">
        <div class="ak-masthead__eyebrow">
          <span class="tk-pulse-dot" style="--dot:${isActive ? '#22d3ee' : '#fb7185'}"></span>
          AI VOICE PERSONA &amp; MODEL ROUTING
        </div>
        <h1 class="ak-masthead__title">AI Persona &amp; Routing</h1>
        <div class="ak-masthead__meta">
          <span>Live spoken greeting, knowledge block &amp; voice instructions</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Local LLM / STT / TTS endpoint routing</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="${cls('ak-pod', { 'ak-pod--cyan': isActive, 'ak-pod--coral': !isActive })}">
          <span class="ak-pod__lbl">${icon('voice-wave', { size: 12 })} Status</span>
          <span class="ak-pod__val">${isActive ? 'Active' : 'Standby'}</span>
          <span class="ak-pod__sub">${c.call_route || 'oaiy'} route</span>
        </div>

        <div class="ak-pod">
          <span class="ak-pod__lbl">${icon('ai-prompt', { size: 12 })} Voice</span>
          <span class="ak-pod__val" style="font-size:16px">${c.voice || 'aria-warm'}</span>
          <span class="ak-pod__sub">${c.sms_enabled !== 'No' ? 'SMS enabled' : 'SMS off'}</span>
        </div>

        <button type="button" class="k-btn k-btn--glass" data-action="copy-greeting">${icon('copy', { size: 15 })} Copy Greeting</button>
      </div>
    </section>

    ${loadingCfg ? html`<section class="tk-sheet">${skeleton(4)}</section>` : html`
      <section class="ak-persona-card" aria-label="AI Receptionist Persona Preview">
        <div class="ak-persona-top">
          <div class="ak-persona-id">
            <div class="ak-persona-orb">${icon('headset', { size: 22 })}</div>
            <div>
              <div class="ak-persona-name">Aokie AI Receptionist · ${bizName}</div>
              <div class="ak-persona-sub">${c.reply_mode || 'Built-in AI agent'} · Route: ${c.call_route || 'oaiy'} · ${c.model || 'Auto-detect LLM'}</div>
            </div>
          </div>
          <span class="ak-live-pill ak-live-pill--dark">
            <span class="${cls('live-dot', { 'live-dot--off': !isActive })}"></span>
            ${isActive ? 'Answering Calls' : 'Standby Mode'}
          </span>
        </div>

        <div class="ak-persona-script">
          <span class="ak-persona-script__lbl">Live Spoken Greeting Script</span>
          <div class="ak-persona-script__quote">“${greetingText}”</div>
        </div>

        <div class="ak-persona-chips">
          <span class="ak-persona-chip">${icon('sparkle', { size: 13 })} Voice: ${c.voice || 'aria-warm'}</span>
          <span class="ak-persona-chip">${icon('smile', { size: 13 })} Tone: ${toneLabel}</span>
          <span class="ak-persona-chip">${icon('chat', { size: 13 })} SMS Auto-Replies: ${c.sms_enabled !== 'No' ? 'Enabled' : 'Disabled'}</span>
          <span class="ak-persona-chip">${icon('shield', { size: 13 })} ${c.whitelist_only === 'Yes' ? 'Known Callers Only' : 'Open Inbound Line'}</span>
          <span class="ak-persona-chip">${icon('globe', { size: 13 })} Region: ${c.default_country_code || '+61'}</span>
        </div>

        <div class="ak-persona-hours">
          <span style="display:inline-flex;align-items:center;gap:7px">${icon('clock', { size: 14 })} <strong>Hours &amp; Knowledge:</strong> ${hoursLine}</span>
          <span class="ak-phone" style="color:#a5f3fc">${state.session?.settings?.phone || 'Line Connected'}</span>
        </div>
      </section>

      <form class="k-form" data-form="save-ai-config" novalidate>
        <div class="tk-grid-2">
          <section class="tk-sheet">
            <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('ai-prompt', { size: 18 })} Spoken Greeting, Persona &amp; Knowledge</h2></div>
            <div class="tk-sheet__body tk-stack">
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">AI Receptionist Active</span>
                  <select class="k-input" name="active" data-ai-live="active">
                    <option value="Yes" ${c.active !== 'No' ? 'selected' : ''}>Yes — Answering calls</option>
                    <option value="No" ${c.active === 'No' ? 'selected' : ''}>No — Standby / Manual</option>
                  </select>
                </label>
                <label class="k-field"><span class="k-field__label">Reply Mode</span>
                  <select class="k-input" name="reply_mode" data-ai-live="reply_mode">
                    <option value="Built-in AI agent" ${c.reply_mode !== 'Custom flow' ? 'selected' : ''}>Built-in AI agent (fast, in-app)</option>
                    <option value="Custom flow" ${c.reply_mode === 'Custom flow' ? 'selected' : ''}>Custom flow (Live Reply flow)</option>
                  </select>
                </label>
              </div>
              <label class="k-field">
                <span class="k-field__label">Spoken Greeting (first line when answering)</span>
                <input class="k-input" name="greeting" value="${c.greeting || ''}" placeholder="Good morning, thank you for calling…" data-ai-live="greeting">
              </label>
              <label class="k-field">
                <span class="k-field__label">How should the receptionist talk &amp; behave? (Persona Instructions)</span>
                <textarea class="k-input" name="instructions" rows="4" data-ai-live="instructions">${c.instructions || ''}</textarea>
              </label>
              <label class="k-field">
                <span class="k-field__label">Business Info &amp; Hours Knowledge Block (facts the AI may share)</span>
                <textarea class="k-input" name="business_info" rows="5" data-ai-live="business_info">${c.business_info || ''}</textarea>
              </label>
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head"><h2 class="tk-sheet__title">${icon('sliders', { size: 18 })} Routing, SMS &amp; Model Endpoints</h2></div>
            <div class="tk-sheet__body tk-stack">
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Send Text Messages (SMS)</span>
                  <select class="k-input" name="sms_enabled" data-ai-live="sms_enabled">
                    <option value="Yes" ${c.sms_enabled !== 'No' ? 'selected' : ''}>Yes (confirmations &amp; follow-ups)</option>
                    <option value="No" ${c.sms_enabled === 'No' ? 'selected' : ''}>No (never send SMS)</option>
                  </select>
                </label>
                <label class="k-field"><span class="k-field__label">Whitelist Mode</span>
                  <select class="k-input" name="whitelist_only" data-ai-live="whitelist_only">
                    <option value="No" ${c.whitelist_only !== 'Yes' ? 'selected' : ''}>No (allow everyone)</option>
                    <option value="Yes" ${c.whitelist_only === 'Yes' ? 'selected' : ''}>Yes (known CRM callers only)</option>
                  </select>
                </label>
              </div>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Default Country Code</span><input class="k-input" name="default_country_code" value="${c.default_country_code || '+61'}" data-ai-live="default_country_code"></label>
                <label class="k-field"><span class="k-field__label">Call Route (oaiy / aokie)</span><input class="k-input" name="call_route" value="${c.call_route || 'oaiy'}" data-ai-live="call_route"></label>
                <label class="k-field"><span class="k-field__label">Voice ID</span><input class="k-input" name="voice" value="${c.voice || ''}" data-ai-live="voice"></label>
              </div>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">LLM Model</span><input class="k-input" name="model" value="${c.model || ''}" placeholder="blank = auto-detect" data-ai-live="model"></label>
                <label class="k-field"><span class="k-field__label">LLM Source</span><input class="k-input" name="llm_source" value="${c.llm_source || ''}"></label>
              </div>
              <label class="k-field"><span class="k-field__label">LLM Endpoint URL</span><input class="k-input ak-phone" name="llm_endpoint" value="${c.llm_endpoint || ''}" placeholder="http://127.0.0.1:8080/v1"></label>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">STT Endpoint</span><input class="k-input ak-phone" name="stt_endpoint" value="${c.stt_endpoint || ''}" placeholder="built-in engine"></label>
                <label class="k-field"><span class="k-field__label">TTS Endpoint</span><input class="k-input ak-phone" name="tts_endpoint" value="${c.tts_endpoint || ''}" placeholder="built-in engine"></label>
              </div>
              <div class="k-form__row">
                <label class="k-field"><span class="k-field__label">Transcript Correction Source</span><input class="k-input" name="correction_source" value="${c.correction_source || ''}"></label>
                <label class="k-field"><span class="k-field__label">Background AI Model</span><input class="k-input" name="background_ai_model" value="${c.background_ai_model || ''}"></label>
              </div>
              <div class="k-form__actions">
                <button type="submit" class="k-btn k-btn--primary">Save AI Persona &amp; Routing Settings</button>
              </div>
            </div>
          </section>
        </div>
      </form>`}`;
}

export function wireCrmHardwareActions(root, state, { draw, loadScreen }) {
  on(root, 'input', '[data-action="cust-search"]', (e, el) => { state.customerSearch = el.value; loadScreen('/customers'); });
  on(root, 'click', '[data-action="cust-filter"]', (e, el) => { state.customerFilter = el.dataset.filter; draw(); });
  on(root, 'click', '[data-action="hw-filter"]', (e, el) => { state.hwFilter = el.dataset.filter; draw(); });

  // Live Persona Preview updates as the user edits fields
  on(root, 'input', '[data-ai-live]', (e, el) => {
    if (!state.aiConfig) state.aiConfig = {};
    state.aiConfig[el.dataset.aiLive] = el.value;
    draw();
  });
  on(root, 'change', '[data-ai-live]', (e, el) => {
    if (!state.aiConfig) state.aiConfig = {};
    state.aiConfig[el.dataset.aiLive] = el.value;
    draw();
  });
  on(root, 'click', '[data-action="copy-greeting"]', () => {
    const g = (state.aiConfig && state.aiConfig.greeting) || `Good morning, thank you for calling ${state.session?.settings?.business_name || 'us'}, Aokie speaking.`;
    copyText(g, { title: 'Spoken Greeting Script', done: 'Greeting copied' });
  });

  const custFields = (c = {}) => html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Full Name</span><input class="k-input" name="name" value="${c.name || ''}" required></label>
      <label class="k-field"><span class="k-field__label">Phone Number</span><input class="k-input" name="phone" value="${c.phone || ''}" placeholder="+61 4..." required></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Email</span><input class="k-input" type="email" name="email" value="${c.email || ''}"></label>
      <label class="k-field"><span class="k-field__label">Preferred Service</span><input class="k-input" name="preferred_service" value="${c.preferred_service || ''}"></label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Status</span>
        <select class="k-input" name="status">${['Active', 'VIP', 'Inactive', 'Blocked'].map((s) => html`<option value="${s}" ${s === (c.status || 'Active') ? 'selected' : ''}>${s}</option>`)}</select>
      </label>
      <label class="k-field"><span class="k-field__label">Can Receive SMS?</span>
        <select class="k-input" name="sms_capable"><option value="Yes" ${c.sms_capable !== 'No' ? 'selected' : ''}>Yes</option><option value="No" ${c.sms_capable === 'No' ? 'selected' : ''}>No (Landline)</option></select>
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Receptionist Context Notes</span><textarea class="k-input" name="notes" rows="2">${c.notes || ''}</textarea></label>`;

  on(root, 'click', '[data-action="cust-new"]', async () => {
    const made = await formDialog({ title: 'Add Recognized Caller', submitLabel: 'Save Caller', fields: custFields(), onSubmit: (v) => api.post('/api/customers', v) });
    if (made) { toast.success('Caller added to CRM.'); await loadScreen('/customers'); }
  });
  on(root, 'click', '[data-action="cust-edit"]', async (e, el) => {
    const c = state.customers.find((x) => String(x.id) === el.dataset.id);
    if (!c) return;
    const saved = await formDialog({ title: `Edit ${c.name}`, submitLabel: 'Save', fields: custFields(c), onSubmit: (v) => api.put('/api/customers', { ...v, id: c.id }) });
    if (saved) { toast.success('Caller updated.'); await loadScreen('/customers'); }
  });
  on(root, 'click', '[data-action="cust-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete caller?', message: 'Remove this caller from CRM?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/customers', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/customers'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="hw-new"]', async () => {
    const made = await formDialog({
      title: 'Log Bridge / Dongle Event',
      submitLabel: 'Record Event',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Event Name</span><input class="k-input" name="event_name" placeholder="aokie.hardware.disconnect" required></label>
          <label class="k-field"><span class="k-field__label">Severity</span><select class="k-input" name="severity"><option value="Info">Info</option><option value="Warning">Warning</option><option value="Error">Error</option></select></label>
          <label class="k-field"><span class="k-field__label">Dongle ID</span><input class="k-input" name="dongle_id" value="AOKIE-BT-01"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Diagnostic Message</span><textarea class="k-input" name="message" rows="2" required></textarea></label>`,
      onSubmit: (v) => api.post('/api/hardware', v),
    });
    if (made) { toast.success('Hardware event logged.'); await loadScreen('/hardware'); }
  });
  on(root, 'click', '[data-action="hw-ack"]', async (e, el) => {
    try { await api.post('/api/hardware/ack', { id: Number(el.dataset.id) }); toast.success('Event acknowledged.'); await loadScreen('/hardware'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="hw-del"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete hardware event?', message: 'Remove this diagnostic event?', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/hardware', { id: Number(el.dataset.id) }); toast.success('Deleted.'); await loadScreen('/hardware'); }
    catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="save-ai-config"]', async (e, form) => {
    e.preventDefault();
    try {
      const res = await api.put('/api/receptionist', readForm(form));
      state.aiConfig = res.config;
      toast.success('AI Receptionist persona & routing settings saved to SQLite.');
      draw();
    } catch (err) { toastError(err); }
  });
}
