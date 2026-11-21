// Digital Intake & Consent — Unified Clinical Masthead with Today Readiness Ring,
// Pre-Visit Capture Form & Signed Consent Archive with Printable HTML Summary.
import { html, esc, on, readForm } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { fmtDay, fmtDateTime } from '../../kit/time.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, emptyState, skeleton } from '../../kit/ui.js';
import { downloadHtmlDoc } from '../../kit/export.js';

const CONTACT_METHODS = ['Phone Call', 'Text Message', 'Email'];
const CONSENT_CLAUSES = [
  'I consent to be seen and treated by the clinic',
  'I acknowledge the clinic privacy and administrative policy',
  'I consent to appointment reminders via my preferred contact method',
];

export function renderIntakeView(state) {
  const activeToday = (state.appointments || []).filter((a) => a.status !== 'Cancelled' && a.status !== 'No-Show');
  const readyToday = activeToday.filter((a) => a.intake_completed).length;
  const readyPct = activeToday.length ? Math.round((readyToday / activeToday.length) * 100) : 100;

  return html`
    <section class="cl-masthead" aria-label="Digital Intake and Consent">
      <div class="cl-masthead__copy">
        <div class="cl-masthead__eyebrow">
          ${icon('clipboard', { size: 12 })} PRE-VISIT CLINICAL CONSENT
        </div>
        <h1 class="cl-masthead__title">Intake &amp; Consent</h1>
        <div class="cl-masthead__meta">
          <span>Clears Waiting Room intake badge</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Printable HTML summary</span>
        </div>
      </div>

      <div class="cl-masthead__pods" style="align-items:center">
        <div class="cl-pod cl-pod--ring cl-pod--teal" aria-label="Today intake readiness ${readyPct}%">
          <div class="tk-ring" style="--p:${readyPct}%;--ring-color:${readyPct >= 80 ? '#2dd4bf' : '#fbbf24'};--ring-size:48px">
            <span class="tk-ring__val">${readyPct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="cl-pod__lbl">Today Ready</span>
            <span class="cl-pod__val" style="font-size:16.5px">${readyToday}/${activeToday.length}</span>
            <span class="cl-pod__sub">Appointments cleared</span>
          </div>
        </div>

        <div class="cl-pod cl-pod--wide-sm">
          <span class="cl-pod__lbl">${icon('shield-check', { size: 12 })} Signed Archive</span>
          <span class="cl-pod__val">${state.intakes.length}</span>
          <span class="cl-pod__sub">Completed forms</span>
        </div>

        <a href="#/" class="k-btn k-btn--glass">${icon('heart-pulse', { size: 15 })} Waiting Room</a>
      </div>
    </section>

    ${state.intakePatientName ? html`
      <div class="intake-banner">
        <span style="display:inline-flex;align-items:center;gap:8px">
          ${icon('clipboard', { size: 16 })}
          <span>Pre-selected from Waiting Room for <strong>${state.intakePatientName}</strong>. Complete and submit below to clear the Intake Pending badge.</span>
        </span>
        <a href="#/" class="k-btn k-btn--sm">Back to Waiting Room</a>
      </div>` : ''}

    <div class="tk-grid-2">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('clipboard', { size: 18 })} Capture Patient Intake</h2>
        </div>
        <div class="tk-sheet__body">
          <form class="k-form" data-form="new-intake" novalidate>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Patient</span>
                <select class="k-input" name="patient_id" required>
                  <option value="">Select patient…</option>
                  ${state.patients.map((p) => html`<option value="${p.id}" ${String(state.intakePatientId) === String(p.id) ? 'selected' : ''}>${p.full_name} (${fmtDay(p.date_of_birth)})</option>`)}
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Link to Today\u2019s Appointment <span class="k-field__optional">optional</span></span>
                <select class="k-input" name="appointment_id">
                  <option value="">General patient intake</option>
                  ${state.appointments.map((a) => html`<option value="${a.id}" ${String(state.intakeApptId) === String(a.id) ? 'selected' : ''}>${a.appt_time} · ${a.patient_name} (${a.provider_name})</option>`)}
                </select>
              </label>
            </div>
            <label class="k-field"><span class="k-field__label">Reason for Visit</span>
              <textarea class="k-input" name="reason_for_visit" rows="2" placeholder="Why is the patient visiting today?" required></textarea>
            </label>
            <label class="k-field"><span class="k-field__label">Current Symptoms <span class="k-field__optional">optional</span></span>
              <textarea class="k-input" name="symptoms" rows="2" placeholder="Describe any current symptoms, onset or duration…"></textarea>
            </label>
            <label class="k-field"><span class="k-field__label">Current Medications <span class="k-field__optional">optional</span></span>
              <textarea class="k-input" name="current_medications" rows="2" placeholder="List prescriptions, over-the-counter medicines or supplements…"></textarea>
            </label>
            <div class="k-form__row">
              <label class="k-field"><span class="k-field__label">Preferred Contact Method</span>
                <select class="k-input" name="preferred_contact">
                  ${CONTACT_METHODS.map((c) => html`<option value="${c}">${c}</option>`)}
                </select>
              </label>
              <label class="k-field"><span class="k-field__label">Signed / Confirmed By</span>
                <input class="k-input" name="signed_by" placeholder="Patient or guardian full name">
              </label>
            </div>

            <div class="consent-box">
              <strong style="font-size:14px;display:inline-flex;align-items:center;gap:6px">${icon('shield-check', { size: 16 })} Explicit Patient Consent</strong>
              ${CONSENT_CLAUSES.map((clause, idx) => html`
                <label class="k-check">
                  <input type="checkbox" name="consent" value="${clause}" ${idx === 0 ? 'checked' : ''}>
                  <span style="font-size:14px">${clause}</span>
                </label>`)}
            </div>

            <div class="k-form__actions">
              <button type="submit" class="k-btn k-btn--primary">${icon('check-circle', { size: 17 })} Submit Intake &amp; Consent</button>
            </div>
          </form>
        </div>
      </section>

      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('file', { size: 18 })} Completed Intake Summaries</h2>
          <span class="tk-sheet__count">${state.intakes.length}</span>
        </div>
        <div>
          ${state.loading && !state.intakes.length ? skeleton(3) : state.intakes.length ? state.intakes.map((f) => html`
            <div class="tk-row" data-key="int-${f.id}">
              <div style="display:flex;align-items:flex-start;gap:11px;min-width:0;flex:1">
                <span class="tk-avatar">${initials(f.patient_name || 'P')}</span>
                <div class="tk-row__main">
                  <div class="tk-row__title">
                    <span>${f.patient_name}</span>
                    <span class="intake-badge intake-badge--ok">${icon('check', { size: 12 })} Consent (${(f.consent || []).length})</span>
                    ${f.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </div>
                  <div style="font-size:14px;font-weight:650;margin-top:1px">${f.reason_for_visit}</div>
                  <div class="tk-row__meta">
                    <span>${fmtDateTime(f.created_at)}</span>
                    <span>Contact: ${f.preferred_contact}</span>
                    ${f.signed_by ? html`<span>Signed: ${f.signed_by}</span>` : ''}
                  </div>
                  ${f.current_medications ? html`<div class="tk-muted" style="font-size:12.5px"><strong>Meds:</strong> ${f.current_medications}</div>` : ''}
                </div>
              </div>
              <div class="tk-row__aside">
                <button type="button" class="k-btn k-btn--sm" data-action="print-intake" data-id="${f.id}">${icon('printer', { size: 14 })} Summary</button>
              </div>
            </div>`) : emptyState({ iconName: 'clipboard', title: 'No intake forms captured yet', text: 'Complete the digital intake form on the left to record visit details and consent.' })}
        </div>
      </section>
    </div>`;
}

export function wireIntakeActions(root, state, { loadScreen }) {
  on(root, 'submit', 'form[data-form="new-intake"]', async (e, form) => {
    e.preventDefault();
    try {
      const vals = readForm(form);
      const consent = Array.isArray(vals.consent) ? vals.consent : [];
      await api.post('/api/intakes', {
        patient_id: vals.patient_id,
        appointment_id: vals.appointment_id || null,
        reason_for_visit: vals.reason_for_visit,
        symptoms: vals.symptoms,
        current_medications: vals.current_medications,
        preferred_contact: vals.preferred_contact,
        signed_by: vals.signed_by,
        consent,
      });
      state.intakePatientId = '';
      state.intakeApptId = '';
      state.intakePatientName = '';
      form.reset();
      toast.success('Digital intake & consent recorded.');
      await loadScreen('/intake');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="print-intake"]', (e, el) => {
    const f = state.intakes.find((x) => String(x.id) === el.dataset.id);
    if (!f) return;
    const consents = (f.consent || []).map((c) => `<li>&#10003; ${esc(c)}</li>`).join('');
    downloadHtmlDoc(`intake-${f.id}-${String(f.patient_name || 'patient').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, {
      title: 'Patient Intake & Consent Summary',
      businessName: state.session.settings.business_name,
      subtitle: `Captured ${fmtDateTime(f.created_at)}`,
      accent: '#0c7f85',
      bodyHtml: `
        <table>
          <tr><th style="width:210px">Patient Name</th><td><strong>${esc(f.patient_name)}</strong></td></tr>
          <tr><th>Date of Birth</th><td>${esc(fmtDay(f.patient_dob))}</td></tr>
          <tr><th>Phone / Email</th><td>${esc(f.patient_phone || '')}${f.patient_email ? ' · ' + esc(f.patient_email) : ''}</td></tr>
          <tr><th>Preferred Contact</th><td>${esc(f.preferred_contact)}</td></tr>
          ${f.provider_name ? `<tr><th>Linked Appointment</th><td>${esc(fmtDay(f.appt_date))} ${esc(f.appt_time || '')} · ${esc(f.provider_name)}</td></tr>` : ''}
        </table>
        <div class="box"><strong>Reason for Visit</strong><p>${esc(f.reason_for_visit)}</p></div>
        <div class="box"><strong>Current Symptoms</strong><p>${esc(f.symptoms || 'None reported')}</p></div>
        <div class="box"><strong>Current Medications</strong><p>${esc(f.current_medications || 'None reported')}</p></div>
        <div class="box">
          <strong>Consent Acknowledgements</strong>
          <ul style="padding-left:18px;margin:8px 0">${consents}</ul>
          <p style="margin-top:10px"><strong>Signed / Confirmed by:</strong> ${esc(f.signed_by || f.patient_name)}</p>
        </div>`,
    });
  });
}
