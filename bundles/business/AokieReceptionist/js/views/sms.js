// Two-Pane SMS Inbox: Unified Midnight-Violet & Electric Cyan Masthead, Monogrammed Thread Cards,
// Dashed-Violet AI Suggested Reply Review Cards (Send / Edit / Dismiss), and kit/composer.js message box.
import { html, on, cls, qs } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { initials } from '../../kit/format.js';
import { fmtStamp, fmtTime } from '../../kit/time.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, emptyState, skeleton } from '../../kit/ui.js';
import { composerOn } from '../../kit/composer.js';

export function renderSmsView(state) {
  const thread = state.smsThread;
  const msgs = state.smsMessages || [];
  const loadingThreads = state.loading && !state.smsThreads.length;
  const loadingThread = state.loading && !thread;
  const totalUnread = state.smsThreads.reduce((acc, t) => acc + Number(t.unread_count || 0), 0);
  const totalDrafts = state.smsThreads.reduce((acc, t) => acc + Number(t.draft_count || 0), 0);

  return html`
    <section class="ak-masthead" aria-label="SMS Inbox">
      <div class="ak-masthead__copy">
        <div class="ak-masthead__eyebrow">
          ${icon('chat', { size: 12 })} TWO-WAY SMS · AI DRAFT APPROVAL
        </div>
        <h1 class="ak-masthead__title">SMS Inbox</h1>
        <div class="ak-masthead__meta">
          <span>Approve, edit or dismiss AI Suggested Replies in one click</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Live delivery via Aokie Bluetooth MAP bridge</span>
        </div>
      </div>

      <div class="ak-masthead__pods" style="align-items:center">
        <div class="${cls('ak-pod', { 'ak-pod--cyan': totalUnread > 0 })}">
          <span class="ak-pod__lbl">${icon('inbox', { size: 12 })} Unread</span>
          <span class="ak-pod__val">${totalUnread}</span>
          <span class="ak-pod__sub">Inbound texts</span>
        </div>

        <div class="${cls('ak-pod', { 'ak-pod--coral': totalDrafts > 0 })}">
          <span class="ak-pod__lbl">${icon('sparkle', { size: 12 })} AI Drafts</span>
          <span class="ak-pod__val">${totalDrafts}</span>
          <span class="ak-pod__sub">Awaiting review</span>
        </div>

        <div class="ak-pod ak-pod--banner-sm">
          <span class="ak-pod__lbl">${icon('chat', { size: 12 })} Threads</span>
          <span class="ak-pod__val">${state.smsThreads.length}</span>
          <span class="ak-pod__sub">Active lines</span>
        </div>

        <div class="ak-cta-group" style="display:flex;gap:8px;align-items:center">
          <button type="button" class="k-btn k-btn--glass" data-action="sms-sim-in">${icon('inbox', { size: 15 })} Simulate SMS</button>
          <button type="button" class="k-btn ak-btn-cyan" data-action="sms-new-thread">${icon('plus', { size: 15 })} New Thread</button>
        </div>
      </div>
    </section>

    <div class="ak-sms-grid">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('chat', { size: 17 })} Conversations</h2>
          <span class="tk-sheet__count">${loadingThreads ? '…' : state.smsThreads.length}</span>
        </div>
        <div>
          ${loadingThreads ? skeleton(4) : state.smsThreads.length ? state.smsThreads.map((t) => html`
            <div class="${cls('ak-queue-item', { 'is-selected': t.id === state.selectedThreadId, 'ak-queue-item--live': Number(t.unread_count) > 0 && t.id !== state.selectedThreadId })}" data-key="thr-${t.id}" data-action="sms-select" data-id="${t.id}">
              <span class="ak-queue-avatar ${Number(t.draft_count) > 0 ? 'ak-queue-avatar--vip' : 'ak-queue-avatar--cyan'}">${initials(t.display_name || 'S')}</span>
              <div style="min-width:0;flex:1;display:grid;gap:4px">
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-weight:750;font-size:14px">
                  <span>${t.display_name || t.phone}</span>
                  ${Number(t.unread_count) > 0 ? html`<span class="ak-unread-dot" title="${t.unread_count} unread">${t.unread_count}</span>` : ''}
                  ${Number(t.draft_count) > 0 ? html`<span class="ak-draft-pill">${icon('sparkle', { size: 11 })} ${t.draft_count} Draft</span>` : ''}
                  ${t.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;font-size:12px;color:var(--k-muted)">
                  <span class="ak-phone">${t.phone}</span>
                  <span class="ak-ts">${fmtStamp(t.last_message_at)}</span>
                </div>
                <div class="tk-muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.last_preview || 'No messages yet'}</div>
              </div>
            </div>`) : emptyState({ iconName: 'chat', title: 'No SMS threads yet', text: 'Start a new customer text thread or simulate an inbound message.' })}
        </div>
      </section>

      <section class="tk-sheet ak-sms-pane">
        ${loadingThread ? skeleton(4) : thread ? html`
          <div class="tk-sheet__head">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
              <span class="ak-queue-avatar ak-queue-avatar--cyan">${initials(thread.display_name || 'C')}</span>
              <div style="min-width:0">
                <h2 class="tk-sheet__title">${thread.display_name || thread.phone}</h2>
                <div class="ak-phone tk-muted">${thread.phone}</div>
              </div>
            </div>
            <div class="tk-sheet__actions">
              <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sms-del-thread" data-id="${thread.id}">Delete Thread</button>
            </div>
          </div>

          <div class="ak-sms-feed">
            ${msgs.map((m) => {
              const isDraft = m.status === 'Draft' && m.approval_status === 'Pending approval';
              if (isDraft) {
                return html`
                  <div class="ak-draft-card" data-key="msg-${m.id}">
                    <div class="ak-draft-card__head">
                      <span class="ak-ai-badge">${icon('sparkle', { size: 12 })} AI Suggested Reply</span>
                      <span class="ak-ts" style="color:#6d28d9">${fmtTime(m.created_at)} · Pending Review</span>
                    </div>
                    <div class="ak-draft-card__body">${m.body}</div>
                    <div class="ak-draft-card__actions">
                      <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="sms-approve" data-id="${m.id}" data-decision="Approved">${icon('send', { size: 13 })} Send Now</button>
                      <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="sms-edit-draft" data-id="${m.id}">${icon('edit', { size: 13 })} Edit</button>
                      <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="sms-approve" data-id="${m.id}" data-decision="Rejected">${icon('x', { size: 13 })} Dismiss</button>
                    </div>
                  </div>`;
              }
              const bubbleCls = m.direction === 'Inbound' ? 'ak-bubble--in' : 'ak-bubble--out';
              return html`
                <div class="ak-bubble ${bubbleCls}" data-key="msg-${m.id}">
                  <div class="ak-bubble__meta">
                    <span>${m.direction === 'Inbound' ? (thread.display_name || 'Customer') : (m.is_ai_reply ? 'Aokie AI' : 'Front Desk')}</span>
                    <span class="ak-ts" style="color:inherit">${fmtTime(m.created_at)} · ${m.status}</span>
                  </div>
                  <div>${m.body}</div>
                </div>`;
            })}
          </div>

          <div class="ak-composer-bar">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <label class="k-check" style="font-size:13px">
                <input type="checkbox" ${state.smsAiDraftMode ? 'checked' : ''} data-action="sms-toggle-ai">
                <span><strong>AI Draft Reply</strong> mode (queues review card before sending)</span>
              </label>
              <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="sms-suggest">${icon('sparkle', { size: 14 })} Insert AI Suggestion</button>
            </div>
            <div class="ak-composer-row">
              <textarea class="k-input k-composer" data-composer rows="1" placeholder="${state.smsAiDraftMode ? 'Write AI suggested reply (Enter to queue review card)…' : 'Write SMS reply (Enter to send, Shift+Enter for new line)…'}"></textarea>
              <button type="button" class="k-btn k-btn--primary" data-action="sms-send-btn">${icon('send', { size: 15 })} ${state.smsAiDraftMode ? 'Queue Draft' : 'Send'}</button>
            </div>
          </div>` : emptyState({ iconName: 'chat', title: 'Select a conversation', text: 'Pick an SMS thread on the left to read messages and reply.' })}
      </section>
    </div>`;
}

export function wireSmsActions(root, state, { draw, loadScreen, loadSmsThread }) {
  const composer = composerOn(root, 'textarea[data-composer]', {
    onSend: async (text) => {
      if (!state.selectedThreadId) return;
      await api.post('/api/sms/send', {
        thread_id: state.selectedThreadId,
        direction: 'Outbound',
        body: text,
        is_ai_reply: state.smsAiDraftMode,
      });
      toast.success(state.smsAiDraftMode ? 'AI Draft queued for review.' : 'SMS sent.');
      await loadScreen('/sms');
    },
    onError: (err) => toastError(err),
  });

  on(root, 'click', '[data-action="sms-send-btn"]', () => {
    const field = qs('textarea[data-composer]', root);
    if (field) composer.sendFrom(field);
  });

  on(root, 'change', '[data-action="sms-toggle-ai"]', (e, el) => {
    state.smsAiDraftMode = el.checked;
    draw();
  });

  on(root, 'click', '[data-action="sms-suggest"]', () => {
    const field = qs('textarea[data-composer]', root);
    const t = state.smsThread;
    if (!field || !t) return;
    const suggestion = `Hi ${t.display_name || 'there'}, thanks for messaging ${state.session.settings.business_name}! We have updated your request and will see you soon.`;
    composer.setText(field, suggestion);
    field.focus();
  });

  on(root, 'click', '[data-action="sms-select"]', async (e, el) => {
    try { await loadSmsThread(Number(el.dataset.id), { markRead: true }); draw(); }
    catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sms-approve"]', async (e, el) => {
    try {
      await api.post('/api/sms/approve', { id: Number(el.dataset.id), decision: el.dataset.decision });
      toast.success(el.dataset.decision === 'Approved' ? 'AI reply sent.' : 'AI draft dismissed.');
      await loadScreen('/sms');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="sms-edit-draft"]', async (e, el) => {
    const msg = (state.smsMessages || []).find((m) => String(m.id) === el.dataset.id);
    if (!msg || !state.selectedThreadId) return;
    const edited = await formDialog({
      title: 'Edit AI Suggested Reply',
      submitLabel: 'Send Edited Reply',
      fields: html`
        <label class="k-field">
          <span class="k-field__label">Reply to ${state.smsThread ? (state.smsThread.display_name || state.smsThread.phone) : 'Customer'}</span>
          <textarea class="k-input" name="body" rows="4" required>${msg.body}</textarea>
        </label>`,
      onSubmit: async (v) => {
        await api.post('/api/sms/send', {
          thread_id: state.selectedThreadId,
          direction: 'Outbound',
          body: v.body,
          is_ai_reply: false,
        });
        await api.post('/api/sms/approve', { id: msg.id, decision: 'Rejected' });
        return true;
      },
    });
    if (edited) {
      toast.success('Edited reply sent.');
      await loadScreen('/sms');
    }
  });

  on(root, 'click', '[data-action="sms-new-thread"]', async () => {
    const made = await formDialog({
      title: 'Start New SMS Conversation',
      submitLabel: 'Send SMS',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Phone Number</span><input class="k-input" name="phone" placeholder="+61 400 111 222" required></label>
          <label class="k-field"><span class="k-field__label">Contact Name</span><input class="k-input" name="display_name"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Message</span><textarea class="k-input" name="body" rows="3" required></textarea></label>
        <label class="k-check"><input type="checkbox" name="is_ai_reply"><span>Save as AI Draft (requires review card approval)</span></label>`,
      onSubmit: (v) => api.post('/api/sms/send', { ...v, direction: 'Outbound' }),
    });
    if (made && made.thread) { state.selectedThreadId = made.thread.id; toast.success('SMS created.'); await loadScreen('/sms'); }
  });

  on(root, 'click', '[data-action="sms-sim-in"]', async () => {
    const made = await formDialog({
      title: 'Simulate Inbound Customer SMS',
      submitLabel: 'Receive SMS',
      fields: html`
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">From Phone</span><input class="k-input" name="phone" value="${state.smsThread ? state.smsThread.phone : '+61 414 820 391'}" required></label>
          <label class="k-field"><span class="k-field__label">Sender Name</span><input class="k-input" name="display_name" value="${state.smsThread ? state.smsThread.display_name : ''}"></label>
        </div>
        <label class="k-field"><span class="k-field__label">Inbound Message</span><textarea class="k-input" name="body" rows="2" required>Hi, just confirming my booking for tomorrow!</textarea></label>`,
      onSubmit: (v) => api.post('/api/sms/send', { ...v, direction: 'Inbound' }),
    });
    if (made && made.thread) { toast.success('Inbound SMS received (unread badge updated).'); await loadScreen('/sms'); }
  });

  on(root, 'click', '[data-action="sms-del-thread"]', async (e, el) => {
    const ok = await confirmDialog({ title: 'Delete SMS thread?', message: 'Deletes this conversation and all its messages.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await api.delete('/api/sms/threads', { id: Number(el.dataset.id) }); state.selectedThreadId = null; toast.success('Thread deleted.'); await loadScreen('/sms'); }
    catch (err) { toastError(err); }
  });
}
