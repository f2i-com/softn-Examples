// Live AI Receptionist Desk: Midnight-Violet, Electric Cyan & Warm Coral Masthead with Call-Answer Resolution Ring,
// Two-Column Command Workspace (Call Folio Queue + Glass Active Call Stage + Chat-Bubble Transcript Viewer)
// and Sticky Operational Rail (Live Escalations 1-click Complete, Pending SMS/AI Drafts & Dongle Hardware Health).
import { html, on, cls, esc, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { today, fmtTime, fmtDateTime, fmtDay, ago } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';
import { renderSampleBanner } from '../../kit/turnkey.js';

function fmtSecs(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function statusTagTone(st) {
  if (st === 'Active') return 'tk-tag--ok';
  if (st === 'Ringing') return 'tk-tag--warn';
  if (st === 'Missed' || st === 'Voicemail') return 'tk-tag--bad';
  return 'tk-tag--info';
}

function sentimentTone(sent) {
  if (sent === 'Positive') return 'ak-sent-pill--pos';
  if (sent === 'Negative') return 'ak-sent-pill--neg';
  return 'ak-sent-pill--neu';
}

function renderWave(extraCls = '') {
  return html`<span class="ak-wave ${extraCls}" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>`;
}

export function renderConsoleView(state) {
  const counts = state.session.counts || {};
  const settings = state.session.settings || {};
  const detail = state.callDetail;
  const activeCall = detail && detail.call;
  const turns = (detail && detail.turns) || [];
  const loadingCalls = state.loading && !state.calls.length;
  const loadingDetail = state.loading && !activeCall;

  const liveCount = Math.max(
    Number(counts.liveCalls || 0),
    state.calls.filter((c) => c.status === 'Active' || c.status === 'Ringing').length
  );
  const pendingSms = (counts.unreadSms || 0) + (counts.pendingDrafts || 0);
  const answeredCount = state.calls.filter((c) => c.status === 'Active' || c.status === 'Completed').length;
  const handledPct = state.calls.length ? Math.round((answeredCount / state.calls.length) * 100) : 100;
  const handledColor = handledPct >= 80 ? '#22d3ee' : handledPct >= 55 ? '#a78bfa' : '#fb7185';
  const activeIsLive = activeCall && (activeCall.status === 'Active' || activeCall.status === 'Ringing');

  const q = (state.callSearch || '').trim().toLowerCase();
  const visibleCalls = state.calls.filter((c) => {
    if (!q) return true;
    const hay = `${c.call_code} ${c.caller_name} ${c.caller_phone} ${c.intent || ''} ${c.summary || ''}`.toLowerCase();
    return hay.includes(q);
  });

  const openTasks = (state.tasks || []).filter((t) => t.status === 'Open' || t.status === 'In progress');
  const attentionSms = (state.smsThreads || []).filter((t) => Number(t.unread_count || 0) > 0 || Number(t.draft_count || 0) > 0);
  const unackHw = (state.hardwareEvents || []).filter((e) => !e.acknowledged && (e.severity === 'Error' || e.severity === 'Warning'));

  return html`
    ${renderSampleBanner(counts.sampleCount || 0)}

    <section class="ak-masthead" aria-label="AI Receptionist Desk">
      <div class="ak-masthead__copy">
        <div class="ak-masthead__eyebrow-row">
          <span class="ak-masthead__eyebrow">
            <span class="tk-pulse-dot" style="--dot:${liveCount > 0 ? '#22d3ee' : '#10b981'}"></span>
            VOICE BRIDGE ONLINE · ${liveCount} LIVE
          </span>
          ${liveCount > 0 ? renderWave() : ''}
        </div>
        <h1 class="ak-masthead__title">AI Receptionist Desk</h1>
        <div class="ak-masthead__meta">
          <span class="ak-phone" style="color:#a5f3fc">${settings.phone || 'Aokie BT Bridge'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${state.calls.length} call${state.calls.length === 1 ? '' : 's'}</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>${counts.pendingDrafts || 0} AI draft${Number(counts.pendingDrafts || 0) === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="ak-pod ak-pod--ring ak-pod--cyan" aria-label="AI answer resolution rate ${handledPct}%">
          <div class="tk-ring" style="--p:${loadingCalls ? 0 : handledPct}%;--ring-color:${handledColor};--ring-size:48px">
            <span class="tk-ring__val">${loadingCalls ? '…' : `${handledPct}%`}</span>
          </div>
          <div style="display:grid;gap:1px;min-width:0">
            <span class="ak-pod__lbl">Answer Rate</span>
            <span class="ak-pod__val" style="font-size:16px">${loadingCalls ? 'Syncing…' : `${answeredCount}/${state.calls.length}`}</span>
            <span class="ak-pod__sub">Handled calls</span>
          </div>
        </div>

        <a href="#/sms" class="${cls('ak-pod', { 'ak-pod--coral': pendingSms > 0 })}">
          <span class="ak-pod__lbl">${icon('chat', { size: 12 })} SMS Queue</span>
          <span class="ak-pod__val">${pendingSms}</span>
          <span class="ak-pod__sub">${counts.pendingDrafts || 0} draft${Number(counts.pendingDrafts || 0) === 1 ? '' : 's'} →</span>
        </a>

        <a href="#/tasks" class="${cls('ak-pod', { 'ak-pod--coral': (counts.openTasks || 0) > 0 })}">
          <span class="ak-pod__lbl">${icon('check-square', { size: 12 })} Escalations</span>
          <span class="ak-pod__val">${counts.openTasks || 0}</span>
          <span class="ak-pod__sub">Callbacks →</span>
        </a>

        <a href="#/hardware" class="${cls('ak-pod ak-pod--banner-sm', { 'ak-pod--alert': (counts.hwAlerts || 0) > 0, 'ak-pod--cyan': (counts.hwAlerts || 0) === 0 })}">
          <span class="ak-pod__lbl">${icon('bt-bridge', { size: 12 })} Bridge</span>
          <span class="ak-pod__val">${(counts.hwAlerts || 0) > 0 ? `${counts.hwAlerts} Alert${Number(counts.hwAlerts) === 1 ? '' : 's'}` : 'Online'}</span>
          <span class="ak-pod__sub">Dongle health →</span>
        </a>

        <div class="ak-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn ak-btn-cyan" data-action="call-new">${icon('phone-call', { size: 15 })} Simulate Call</button>
        </div>
      </div>
    </section>

    <div class="tk-toolbar">
      <div class="tk-segmented ak-filter-track" role="tablist" aria-label="Filter calls by status">
        ${['All', 'Live', 'Completed', 'Missed', 'Voicemail'].map((f) => html`
          <button type="button" class="${cls('tk-pill', { 'is-on': state.callFilter === f })}" data-action="call-filter" data-filter="${f}">${f}</button>`)}
      </div>
      <label class="tk-search" style="min-height:35px;max-width:280px">
        ${icon('search', { size: 14 })}
        <input type="search" data-action="call-search" value="${state.callSearch || ''}" placeholder="Find caller, phone or intent…">
      </label>
    </div>

    <div class="ak-desk-split">
      <div class="ak-console">
        <section class="tk-sheet">
          <div class="tk-sheet__head">
            <h2 class="tk-sheet__title">${icon('voice-wave', { size: 17 })} Call Folios</h2>
            <span class="tk-sheet__count">${loadingCalls ? '…' : visibleCalls.length}</span>
          </div>
          <div>
            ${loadingCalls ? skeleton(4) : visibleCalls.length ? visibleCalls.map((c) => {
              const isLive = c.status === 'Active' || c.status === 'Ringing';
              const isMissed = c.status === 'Missed' || c.status === 'Voicemail';
              const avCls = c.customer_tier === 'VIP' ? 'ak-queue-avatar--vip' : isLive ? 'ak-queue-avatar--cyan' : '';
              return html`
                <div class="${cls('ak-queue-item', { 'is-selected': c.id === state.selectedCallId, 'ak-queue-item--live': isLive && c.id !== state.selectedCallId, 'ak-queue-item--coral': isMissed && c.id !== state.selectedCallId })}" data-key="call-${c.id}" data-action="call-select" data-id="${c.id}">
                  <span class="ak-queue-avatar ${avCls}">${initials(c.caller_name || 'U')}</span>
                  <div style="min-width:0;flex:1;display:grid;gap:4px">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-weight:750;font-size:13.5px">
                      ${isLive ? html`<span class="${cls('live-dot', { 'live-dot--ring': c.status === 'Ringing' })}" title="${c.status}"></span>` : ''}
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.caller_name || 'Unknown Caller'}</span>
                      ${c.customer_tier === 'VIP' ? html`<span class="tk-tag tk-tag--bad">VIP</span>` : ''}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px;color:var(--k-muted)">
                      <span class="ak-code">${c.call_code}</span>
                      <span class="tk-tag ${statusTagTone(c.status)}">${c.status}</span>
                      ${c.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px">
                      <span class="ak-ts">${ago(c.started_at)} · ${fmtSecs(c.duration_seconds)}</span>
                      ${c.intent ? html`<span class="ak-intent-pill">${c.intent}</span>` : ''}
                    </div>
                  </div>
                </div>`;
            }) : emptyState({ iconName: 'phone', title: 'No calls match', text: 'Log an incoming or outbound call to view live structured transcripts.' })}
          </div>
        </section>

        <div class="tk-stack" style="gap:14px">
          ${loadingDetail ? html`<section class="tk-sheet">${skeleton(4)}</section>` : activeCall ? html`
            <div class="ak-stage">
              <div class="ak-stage__top">
                <div>
                  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:6px">
                    ${activeIsLive
                      ? html`<span class="ak-live-pill ak-live-pill--dark"><span class="${cls('live-dot', { 'live-dot--ring': activeCall.status === 'Ringing' })}"></span> ${activeCall.status === 'Ringing' ? 'RINGING' : 'LIVE VOICE'}</span>${renderWave()}`
                      : html`<span class="tk-tag ${statusTagTone(activeCall.status)}">${activeCall.status}</span>`}
                    <span class="ak-code">${activeCall.call_code}</span>
                    <span class="ak-phone" style="color:#c4b5fd">${activeCall.direction}</span>
                    ${activeCall.customer_tier === 'VIP' ? html`<span class="tk-tag tk-tag--warn">VIP</span>` : ''}
                    ${activeCall.sms_capable === 'No' ? html`<span class="tk-tag tk-tag--bad">Landline</span>` : ''}
                  </div>
                  <div class="ak-stage__caller">${activeCall.caller_name}</div>
                  <div class="ak-stage__sub">${activeCall.caller_phone} · ${fmtDateTime(activeCall.started_at)} · ${fmtSecs(activeCall.duration_seconds)}</div>
                </div>
                <div class="tk-btn-row">
                  ${activeCall.status === 'Ringing' ? html`<button type="button" class="k-btn k-btn--glass ak-glass-ok k-btn--sm" data-action="call-status" data-id="${activeCall.id}" data-status="Active">${icon('phone-call', { size: 14 })} Answer</button>` : ''}
                  ${activeIsLive ? html`<button type="button" class="k-btn k-btn--glass ak-glass-accent k-btn--sm" data-action="call-status" data-id="${activeCall.id}" data-status="Completed">${icon('check', { size: 14 })} Complete</button>` : ''}
                  ${activeCall.status === 'Ringing' ? html`<button type="button" class="k-btn k-btn--glass ak-glass-danger k-btn--sm" data-action="call-status" data-id="${activeCall.id}" data-status="Missed">Missed</button>` : ''}
                  <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="print-call">${icon('printer', { size: 14 })} HTML</button>
                  <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="copy-call">${icon('copy', { size: 14 })} Copy</button>
                </div>
              </div>
              <div class="ak-stage__bar">
                <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="call-to-booking">${icon('calendar', { size: 13 })} Booking</button>
                <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="call-to-order">${icon('receipt', { size: 13 })} Order</button>
                <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="call-to-task">${icon('check-square', { size: 13 })} Task</button>
                <button type="button" class="k-btn k-btn--glass k-btn--sm" data-action="call-to-sms">${icon('chat', { size: 13 })} Draft SMS</button>
                <button type="button" class="k-btn k-btn--glass ak-stage-del k-btn--sm" data-action="call-delete" data-id="${activeCall.id}">${icon('trash', { size: 13 })} Delete</button>
              </div>
            </div>

            <div class="ak-summary-card">
              <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px">
                <strong style="display:inline-flex;align-items:center;gap:6px;color:var(--ak-violet)">${icon('sparkle', { size: 15 })} AI Call Summary</strong>
                <div class="tk-btn-row">
                  <span class="ak-intent-pill">${activeCall.intent || 'General'}</span>
                  <span class="ak-sent-pill ${sentimentTone(activeCall.sentiment)}">${activeCall.sentiment || 'Neutral'}</span>
                  <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="edit-summary">Edit</button>
                </div>
              </div>
              <div>${activeCall.summary || 'No AI summary recorded yet. Add transcript turns or edit summary.'}</div>
              ${activeCall.customer_notes ? html`<div class="tk-muted" style="font-size:12.5px"><strong>CRM Context:</strong> ${activeCall.customer_notes}</div>` : ''}
            </div>

            <section class="tk-sheet">
              <div class="tk-sheet__head">
                <h2 class="tk-sheet__title">${icon('chat', { size: 17 })} Live Transcript</h2>
                <span class="tk-sheet__count">${turns.length} turn${turns.length === 1 ? '' : 's'}</span>
              </div>
              <div class="ak-transcript">
                ${turns.length ? turns.map((tr) => {
                  const sp = String(tr.speaker || 'Caller').toLowerCase();
                  if (sp === 'system') {
                    return html`<div class="ak-chat-row ak-chat-row--system" data-key="trn-${tr.id}"><div class="ak-turn ak-turn--system">${tr.text} · ${fmtTime(tr.created_at)}</div></div>`;
                  }
                  const isAi = sp === 'aokie';
                  const isOp = sp === 'operator';
                  const rowKind = isAi ? 'aokie' : isOp ? 'operator' : 'caller';
                  const speakerName = isAi ? 'Aokie AI' : isOp ? 'Operator' : (activeCall.caller_name || 'Caller');
                  return html`
                    <div class="ak-chat-row ak-chat-row--${rowKind}" data-key="trn-${tr.id}">
                      <span class="ak-chat-avatar ak-chat-avatar--${rowKind}" title="${speakerName}">
                        ${isAi ? icon('sparkle', { size: 13 }) : isOp ? 'OP' : initials(activeCall.caller_name || 'C')}
                      </span>
                      <div class="ak-turn ak-turn--${rowKind}">
                        <div class="ak-turn__head">
                          <span>${speakerName}${tr.source === 'audio_model' ? ' · audio verified' : ''}</span>
                          <span class="ak-ts" style="color:inherit">${fmtTime(tr.created_at)}</span>
                        </div>
                        <div>${tr.text}</div>
                      </div>
                    </div>`;
                }) : html`<div class="tk-muted" style="text-align:center;padding:26px">No transcript turns recorded for this call yet.</div>`}
              </div>
              <div class="ak-composer-bar">
                <form class="ak-composer-row" data-form="add-turn" novalidate>
                  <select class="k-input" name="speaker" style="width:124px;flex:none">
                    <option value="Caller" ${state.turnSpeaker === 'Caller' ? 'selected' : ''}>Caller</option>
                    <option value="Aokie" ${state.turnSpeaker === 'Aokie' ? 'selected' : ''}>Aokie AI</option>
                    <option value="Operator" ${state.turnSpeaker === 'Operator' ? 'selected' : ''}>Operator</option>
                  </select>
                  <input class="k-input" name="text" placeholder="Append transcript turn…" required>
                  <button type="submit" class="k-btn k-btn--primary">Add Turn</button>
                </form>
              </div>
            </section>` : emptyState({ iconName: 'phone-call', title: 'Select a call folio', text: 'Inspect live Caller vs AI Receptionist turns or log a new incoming call.' })}
        </div>
      </div>

      <aside class="ak-rail-panel" aria-label="Escalations, SMS Drafts & Bridge Health">
        <section class="ak-rail-card">
          <div class="ak-rail-card__head">
            <span class="ak-rail-card__title">${icon('check-square', { size: 14 })} Live Escalations</span>
            <a href="#/tasks" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">All (${openTasks.length})</a>
          </div>
          ${openTasks.length ? html`
            <div class="ak-rail-list">
              ${openTasks.slice(0, 4).map((t) => html`
                <div class="ak-rail-item ${t.priority === 'Urgent' || t.priority === 'High' ? 'ak-rail-item--coral' : 'ak-rail-item--violet'}" data-key="rtk-${t.id}">
                  <div class="ak-rail-item__top">
                    <div class="ak-rail-item__name">${t.summary}</div>
                    <span class="tk-tag ${t.priority === 'Urgent' ? 'tk-tag--bad' : t.priority === 'High' ? 'tk-tag--warn' : 'tk-tag--info'}">${t.priority}</span>
                  </div>
                  <div class="ak-rail-item__sub">${t.phone || t.assignee || 'Front Desk'} · Due ${t.due_at ? fmtDay(t.due_at) : 'Today'}</div>
                  <div class="ak-rail-item__foot">
                    ${t.callback_state && t.callback_state !== 'None' ? html`<span class="tk-tag tk-tag--warn">Callback</span>` : html`<span class="tk-muted" style="font-size:11px">${t.assignee || 'Front Desk'}</span>`}
                    <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="rail-task-done" data-id="${t.id}">Done ✓</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:13px;font-size:12.5px;color:var(--k-muted)">No pending escalations or callbacks ✓</div>`}
        </section>

        <section class="ak-rail-card">
          <div class="ak-rail-card__head">
            <span class="ak-rail-card__title">${icon('chat', { size: 14 })} SMS &amp; AI Drafts</span>
            <a href="#/sms" class="tk-pill" style="min-height:24px;padding:0 9px;font-size:11px">Inbox</a>
          </div>
          ${attentionSms.length ? html`
            <div class="ak-rail-list">
              ${attentionSms.slice(0, 3).map((th) => html`
                <div class="ak-rail-item ak-rail-item--cyan" data-key="rth-${th.id}">
                  <div class="ak-rail-item__top">
                    <div class="ak-rail-item__name">${th.display_name || th.phone}</div>
                    ${Number(th.draft_count) > 0 ? html`<span class="ak-draft-pill">${icon('sparkle', { size: 10 })} ${th.draft_count} Draft</span>` : html`<span class="ak-unread-dot">${th.unread_count}</span>`}
                  </div>
                  <div class="ak-rail-item__sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${th.last_preview || 'New message'}</div>
                  <div class="ak-rail-item__foot">
                    <span class="ak-phone tk-muted">${th.phone}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-sms-open" data-id="${th.id}">Review →</button>
                  </div>
                </div>`)}
            </div>` : html`<div style="padding:13px;font-size:12.5px;color:var(--k-muted)">All SMS threads &amp; AI drafts reviewed ✓</div>`}
        </section>

        <section class="ak-rail-card">
          <div class="ak-rail-card__head">
            <span class="ak-rail-card__title">${icon('bt-bridge', { size: 14 })} Hardware &amp; Desk</span>
            <span class="ak-live-pill" style="padding:2px 8px;font-size:10.5px"><span class="live-dot"></span> Online</span>
          </div>
          ${unackHw.length ? html`
            <div class="ak-rail-list">
              ${unackHw.slice(0, 2).map((e) => html`
                <div class="ak-rail-item ak-rail-item--coral" data-key="rhw-${e.id}">
                  <div class="ak-rail-item__top">
                    <div class="ak-rail-item__name ak-phone">${e.event_name}</div>
                    <span class="tk-tag ${e.severity === 'Error' ? 'tk-tag--bad' : 'tk-tag--warn'}">${e.severity}</span>
                  </div>
                  <div class="ak-rail-item__sub">${e.message}</div>
                  <div class="ak-rail-item__foot">
                    <span class="tk-tag">${e.dongle_id}</span>
                    <button type="button" class="k-btn k-btn--sm" data-action="rail-hw-ack" data-id="${e.id}">Ack ✓</button>
                  </div>
                </div>`)}
            </div>` : ''}
          <div>
            <a href="#/customers" class="ak-pulse-link">
              <span style="display:inline-flex;align-items:center;gap:7px">${icon('users', { size: 14 })} Callers CRM</span>
              <span class="tk-muted">Directory →</span>
            </a>
            <a href="#/ai-settings" class="ak-pulse-link">
              <span style="display:inline-flex;align-items:center;gap:7px">${icon('ai-prompt', { size: 14 })} AI Persona &amp; Routing</span>
              <span class="tk-muted">Config →</span>
            </a>
            <a href="#/hardware" class="ak-pulse-link">
              <span style="display:inline-flex;align-items:center;gap:7px">${icon('bt-bridge', { size: 14 })} Dongle AOKIE-BT-01</span>
              <span class="tk-tag ${unackHw.length > 0 ? 'tk-tag--warn' : 'tk-tag--ok'}">${unackHw.length > 0 ? `${unackHw.length} alert${unackHw.length === 1 ? '' : 's'}` : 'Healthy'}</span>
            </a>
          </div>
        </section>
      </aside>
    </div>`;
}

export function wireConsoleActions(root, state, { draw, loadScreen, loadCallDetail, go }) {
  on(root, 'click', '[data-action="call-filter"]', (e, el) => { state.callFilter = el.dataset.filter; loadScreen('/'); });
  on(root, 'input', '[data-action="call-search"]', (e, el) => { state.callSearch = el.value; draw(); });
  on(root, 'click', '[data-action="call-select"]', async (e, el) => {
    try { await loadCallDetail(Number(el.dataset.id)); draw(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="rail-task-done"]', async (e, el) => {
    try { await api.post('/api/tasks/status', { id: Number(el.dataset.id), status: 'Done' }); toast.success('Escalation task completed!'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-action="rail-sms-open"]', (e, el) => {
    go('/sms', { thread: Number(el.dataset.id) });
  });
  on(root, 'click', '[data-action="rail-hw-ack"]', async (e, el) => {
    try { await api.post('/api/hardware/ack', { id: Number(el.dataset.id) }); toast.success('Bridge alert acknowledged.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="call-new"]', async () => {
    const made = await formDialog({
      title: 'Log / Simulate Phone Call',
      submitLabel: 'Start Call Record',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Caller Phone</span><input class="k-input" name="caller_phone" placeholder="+61 414 820 391" required></label>
          <label class="k-field"><span class="k-field__label">Caller Name <span class="k-field__optional">auto-looked up</span></span><input class="k-input" name="caller_name" placeholder="Leave blank for CRM lookup"></label>
        </div>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Direction</span><select class="k-input" name="direction"><option value="Inbound">Inbound</option><option value="Outbound">Outbound</option></select></label>
          <label class="k-field"><span class="k-field__label">Initial Status</span><select class="k-input" name="status"><option value="Active">Active</option><option value="Ringing">Ringing</option><option value="Completed">Completed</option><option value="Missed">Missed</option><option value="Voicemail">Voicemail</option></select></label>
          <label class="k-field"><span class="k-field__label">Intent</span><select class="k-input" name="intent"><option value="Booking">Booking</option><option value="Order">Order</option><option value="Question">Question</option><option value="Message">Message</option><option value="Other">Other</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Opening Caller Line <span class="k-field__optional">optional</span></span><input class="k-input" name="opening_turn" placeholder="Hi, I would like to book an appointment…"></label>
        <label class="k-field"><span class="k-field__label">Call Summary</span><input class="k-input" name="summary"></label>`,
      onSubmit: (v) => api.post('/api/calls', v),
    });
    if (made && made.call) {
      state.selectedCallId = made.call.id;
      toast.success(made.matchedCustomer ? `Call logged — matched CRM caller ${made.matchedCustomer.name}.` : `Call ${made.call.call_code} logged.`);
      await loadScreen('/');
    }
  });

  on(root, 'click', '[data-action="call-status"]', async (e, el) => {
    try {
      await api.post('/api/calls/status', { id: Number(el.dataset.id), status: el.dataset.status });
      toast.success(`Call marked ${el.dataset.status}.`);
      await loadScreen('/');
    } catch (err) { toastError(err); }
  });

  on(root, 'submit', 'form[data-form="add-turn"]', async (e, form) => {
    e.preventDefault();
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    try {
      const vals = readForm(form);
      state.turnSpeaker = vals.speaker;
      await api.post('/api/calls/turn', { call_id: call.id, speaker: vals.speaker, text: vals.text });
      const inp = form.querySelector('input[name="text"]');
      if (inp) inp.value = '';
      await loadCallDetail(call.id);
      draw();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="edit-summary"]', async () => {
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    const saved = await formDialog({
      title: `Update Call Summary (${call.call_code})`,
      submitLabel: 'Save Summary',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Intent</span><select class="k-input" name="intent">${['Booking', 'Order', 'Question', 'Message', 'Other'].map((i) => html`<option value="${i}" ${i === call.intent ? 'selected' : ''}>${i}</option>`)}</select></label>
          <label class="k-field"><span class="k-field__label">Sentiment</span><select class="k-input" name="sentiment">${['Positive', 'Neutral', 'Negative'].map((s) => html`<option value="${s}" ${s === call.sentiment ? 'selected' : ''}>${s}</option>`)}</select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Summary</span><textarea class="k-input" name="summary" rows="3">${call.summary || ''}</textarea></label>`,
      onSubmit: (v) => api.post('/api/calls/status', { id: call.id, ...v }),
    });
    if (saved) { toast.success('Summary updated.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="call-to-booking"]', async () => {
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    const made = await formDialog({
      title: `Create Booking from ${call.call_code}`,
      submitLabel: 'Create Booking',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Caller Name</span><input class="k-input" name="caller_name" value="${call.caller_name}" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${call.caller_phone}"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Service</span><input class="k-input" name="service" value="${call.preferred_service || ''}" placeholder="e.g. Check-up & Clean" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="appt_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="appt_time" value="10:00"></label>
          <label class="k-field"><span class="k-field__label">Status</span><select class="k-input" name="status"><option value="Requested">Requested</option><option value="Confirmed">Confirmed</option></select></label>
        </div>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" value="${call.summary || ''}"></label>`,
      onSubmit: (v) => api.post('/api/appointments', { ...v, call_id: call.id, customer_id: call.customer_id, source: 'Call' }),
    });
    if (made) { toast.success('Booking created from call.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="call-to-order"]', async () => {
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    const made = await formDialog({
      title: `Create Order from ${call.call_code}`,
      submitLabel: 'Save Order',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Customer Name</span><input class="k-input" name="customer_name" value="${call.caller_name}" required></label>
          <label class="k-field"><span class="k-field__label">Phone</span><input class="k-input" name="phone" value="${call.caller_phone}"></label>
          <label class="k-field"><span class="k-field__label">Total</span><input class="k-input" type="number" step="0.01" min="0" name="total" value="0.00"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Order Details</span><textarea class="k-input" name="notes" rows="2" required>${call.summary || ''}</textarea></label>`,
      onSubmit: (v) => api.post('/api/orders', { ...v, call_id: call.id, customer_id: call.customer_id, source: 'Call' }),
    });
    if (made) { toast.success('Order captured from call.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="call-to-task"]', async () => {
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    const made = await formDialog({
      title: `Add Follow-Up Task for ${call.caller_name}`,
      submitLabel: 'Add Task',
      fields: html`
        <label class="k-field"><span class="k-field__label">Task Summary</span><input class="k-input" name="summary" value="Follow up with ${call.caller_name} (${call.call_code})" required></label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Due Date</span><input class="k-input" type="date" name="due_at" value="${today()}"></label>
          <label class="k-field"><span class="k-field__label">Priority</span><select class="k-input" name="priority"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High" selected>High</option><option value="Urgent">Urgent</option></select></label>
          <label class="k-field"><span class="k-field__label">Assignee</span><input class="k-input" name="assignee" value="Front Desk"></label>
        </div>`,
      onSubmit: (v) => api.post('/api/tasks', { ...v, call_id: call.id, customer_id: call.customer_id, phone: call.caller_phone }),
    });
    if (made) { toast.success('Follow-up task added.'); await loadScreen('/'); }
  });

  on(root, 'click', '[data-action="call-to-sms"]', async () => {
    const call = state.callDetail && state.callDetail.call;
    if (!call) return;
    const made = await formDialog({
      title: `Draft SMS Follow-Up to ${call.caller_name}`,
      submitLabel: 'Create SMS Draft',
      fields: html`
        <label class="k-field"><span class="k-field__label">To Phone</span><input class="k-input" name="phone" value="${call.caller_phone}" required></label>
        <label class="k-field"><span class="k-field__label">Message</span><textarea class="k-input" name="body" rows="3" required>Hi ${call.caller_name}, thanks for calling ${state.session.settings.business_name}! Following up on your call — please reply if you need anything else.</textarea></label>
        <label class="k-check"><input type="checkbox" name="is_ai_reply" checked><span>Save as <strong>AI Draft</strong> (requires approval in SMS Inbox before sending)</span></label>`,
      onSubmit: (v) => api.post('/api/sms/send', { ...v, display_name: call.caller_name, customer_id: call.customer_id, direction: 'Outbound' }),
    });
    if (made && made.thread) {
      toast.success('SMS follow-up queued in inbox.');
      go('/sms', { thread: made.thread.id });
    }
  });

  on(root, 'click', '[data-action="call-delete"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete call record?', message: 'Deletes this call and all its transcript turns.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/calls', { id: Number(el.dataset.id) }); state.selectedCallId = null; toast.success('Call deleted.'); await loadScreen('/'); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-call"]', () => {
    const d = state.callDetail;
    if (!d || !d.call) return;
    const lines = (d.turns || []).map((t) => `[${t.speaker}] ${t.text}`);
    copyText(`${d.call.call_code} — ${d.call.caller_name} (${d.call.caller_phone})\nSummary: ${d.call.summary || 'N/A'}\n\n${lines.join('\n')}`, { title: 'Call Transcript' });
  });

  on(root, 'click', '[data-action="print-call"]', () => {
    const d = state.callDetail;
    if (!d || !d.call) return;
    const c = d.call;
    const rows = (d.turns || []).map((t) => `<tr><td><strong>${esc(t.speaker)}</strong></td><td>${esc(t.text)}</td></tr>`).join('');
    downloadHtmlDoc(`${c.call_code.toLowerCase()}-transcript.html`, {
      title: `Call Transcript · ${c.call_code}`,
      businessName: state.session.settings.business_name,
      subtitle: `${c.caller_name} (${c.caller_phone}) · ${c.direction} · ${c.status}`,
      accent: '#5b3df5',
      bodyHtml: `
        <div class="box"><strong>AI Summary (${esc(c.intent)} · ${esc(c.sentiment)}):</strong><br>${esc(c.summary || 'None')}</div>
        <table><thead><tr><th style="width:130px">Speaker</th><th>Transcript</th></tr></thead><tbody>${rows}</tbody></table>`,
    });
  });
}
