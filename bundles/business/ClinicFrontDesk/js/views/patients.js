// Patient Directory & Dossier — Unified Clinical Slate-Teal Masthead, Auto-Calculated Age Pills,
// Clinical Allergy & Condition Alert Strips, Quick Contact Copy & Full Visit/Intake/Recall Timelines.
import { html, on, cls } from '../../kit/dom.js';
import { api } from '../../kit/api.js';
import { today, fmtDay, fmtDateTime } from '../../kit/time.js';
import { initials } from '../../kit/format.js';
import { icon } from '../../kit/icons.js';
import { toast, toastError, formDialog, confirmDialog, copyText, emptyState, skeleton } from '../../kit/ui.js';

function calcAge(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return '';
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today().split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age >= 0 && age < 130 ? `${age} yrs` : '';
}

function isNoneText(str) {
  const s = String(str || '').trim().toLowerCase();
  return !s || s === 'none' || s === 'none currently' || s === 'nil' || s === 'n/a' || s === 'no';
}

/** Extract crisp clinical alert pills (allergies, conditions/accessibility, active medications) from patient notes & intakes. */
function extractClinicalAlerts(patient, intakes = []) {
  const alerts = [];
  const seen = new Set();
  const pushAlert = (kind, label) => {
    const clean = String(label || '').trim();
    if (!clean) return;
    const key = `${kind}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push({ kind, label: clean });
  };

  const notesRaw = String(patient?.notes || '');
  if (notesRaw.trim()) {
    const parts = notesRaw.split(/[;|\n]+/).map((s) => s.trim()).filter(Boolean);
    for (const seg of parts) {
      const low = seg.toLowerCase();
      if (low.startsWith('allergy:') || low.startsWith('allergies:')) {
        const val = seg.slice(seg.indexOf(':') + 1).trim();
        for (const item of val.split(',').map((x) => x.trim()).filter(Boolean)) {
          pushAlert('allergy', `Allergy: ${item}`);
        }
      } else if (low.startsWith('condition:') || low.startsWith('alert:') || low.startsWith('medical:')) {
        const val = seg.slice(seg.indexOf(':') + 1).trim();
        for (const item of val.split(',').map((x) => x.trim()).filter(Boolean)) {
          pushAlert('condition', item);
        }
      } else if (/allerg|anaphylax|penicillin|latex|sulfa|peanut|epipen/.test(low)) {
        pushAlert('allergy', seg);
      } else if (/asthma|diabet|sprain|fracture|ground-floor|wheelchair|mobility|hypertension|blood pressure|pregnant|heart|epilep|hearing|vision|recovering/.test(low)) {
        pushAlert('condition', seg);
      }
    }
  }

  for (const f of intakes || []) {
    if (!isNoneText(f.current_medications)) {
      const meds = String(f.current_medications).split(/[,;\n]+/).map((x) => x.trim()).filter((x) => !isNoneText(x));
      for (const m of meds.slice(0, 4)) {
        pushAlert('med', `Rx: ${m}`);
      }
    }
  }

  return alerts;
}

function patientFields(p = {}) {
  return html`
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Full Name</span>
        <input class="k-input" name="full_name" value="${p.full_name || ''}" placeholder="First and last name" required>
      </label>
      <label class="k-field"><span class="k-field__label">Date of Birth</span>
        <input class="k-input" type="date" name="date_of_birth" value="${p.date_of_birth || ''}" required>
      </label>
    </div>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Phone Number</span>
        <input class="k-input" name="phone" value="${p.phone || ''}" placeholder="0412 345 678" required>
      </label>
      <label class="k-field"><span class="k-field__label">Email Address <span class="k-field__optional">optional</span></span>
        <input class="k-input" type="email" name="email" value="${p.email || ''}" placeholder="patient@example.com">
      </label>
    </div>
    <label class="k-field"><span class="k-field__label">Address <span class="k-field__optional">optional</span></span>
      <textarea class="k-input" name="address" rows="2" placeholder="Street, suburb, state, postcode">${p.address || ''}</textarea>
    </label>
    <div class="k-form__row">
      <label class="k-field"><span class="k-field__label">Emergency Contact Name</span>
        <input class="k-input" name="emergency_contact_name" value="${p.emergency_contact_name || ''}" placeholder="Full name">
      </label>
      <label class="k-field"><span class="k-field__label">Emergency Contact Phone</span>
        <input class="k-input" name="emergency_contact_phone" value="${p.emergency_contact_phone || ''}" placeholder="Phone number">
      </label>
    </div>
    <label class="k-field">
      <span class="k-field__label">Allergies, Conditions &amp; Reception Notes <span class="k-field__optional">optional</span></span>
      <input class="k-input" name="notes" value="${p.notes || ''}" placeholder="e.g. Allergy: Penicillin; Condition: Asthma; Requires ground-floor room">
      <span class="k-field__hint">Separate items with semicolons (;) to surface Allergy &amp; Condition alert pills automatically.</span>
    </label>`;
}

export function renderPatientsView(state) {
  const q = state.patientSearch.trim().toLowerCase();
  const filtered = q
    ? state.patients.filter((p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q))
    : state.patients;

  const intakeOnFile = state.patients.filter((p) => Number(p.intake_count) > 0).length;
  const intakePct = state.patients.length ? Math.round((intakeOnFile / state.patients.length) * 100) : 0;
  const flaggedCount = state.patients.filter((p) => extractClinicalAlerts(p, []).length > 0).length;

  const d = state.dossier;
  const pt = d ? d.patient : null;
  const ptAge = pt ? calcAge(pt.date_of_birth) : '';
  const ptAlerts = pt ? extractClinicalAlerts(pt, d.intakes || []) : [];
  const alertTone = ptAlerts.some((a) => a.kind === 'allergy')
    ? 'alert-strip--allergy'
    : ptAlerts.some((a) => a.kind === 'condition')
      ? 'alert-strip--condition'
      : 'alert-strip--clear';

  return html`
    <section class="cl-masthead" aria-label="Patient Directory">
      <div class="cl-masthead__copy">
        <div class="cl-masthead__eyebrow">
          ${icon('users', { size: 12 })} CLINICAL CHARTS &amp; DOSSIERS
        </div>
        <h1 class="cl-masthead__title">Patients</h1>
        <div class="cl-masthead__meta">
          <span>Age badges &amp; allergy flags</span>
          <span class="tk-meta-sep" aria-hidden="true">·</span>
          <span>Full visit timeline</span>
        </div>
      </div>

      <div class="cl-masthead__pods" style="align-items:center">
        <div class="cl-pod cl-pod--ring cl-pod--teal" aria-label="Intake coverage ${intakePct}%">
          <div class="tk-ring" style="--p:${intakePct}%;--ring-color:#2dd4bf;--ring-size:48px">
            <span class="tk-ring__val">${intakePct}%</span>
          </div>
          <div style="display:grid;gap:1px">
            <span class="cl-pod__lbl">Intake On File</span>
            <span class="cl-pod__val" style="font-size:16.5px">${intakeOnFile}/${state.patients.length}</span>
            <span class="cl-pod__sub">Signed consent</span>
          </div>
        </div>

        <div class="cl-pod">
          <span class="cl-pod__lbl">${icon('users', { size: 12 })} Registered</span>
          <span class="cl-pod__val">${state.patients.length}</span>
          <span class="cl-pod__sub">Active charts</span>
        </div>

        <div class="${cls('cl-pod', { 'cl-pod--alert': flaggedCount > 0 })}">
          <span class="cl-pod__lbl">${icon('alert', { size: 12 })} Flagged</span>
          <span class="cl-pod__val">${flaggedCount}</span>
          <span class="cl-pod__sub">Clinical alerts</span>
        </div>

        <button type="button" class="k-btn k-btn--primary" data-action="patient-new">${icon('plus', { size: 15 })} Register Patient</button>
      </div>
    </section>

    <div class="dossier-layout">
      <section class="tk-sheet">
        <div class="tk-sheet__head">
          <h2 class="tk-sheet__title">${icon('users', { size: 17 })} Directory</h2>
          <span class="tk-sheet__count">${filtered.length}</span>
        </div>
        <div style="padding:10px 12px;border-bottom:1px solid var(--k-border)">
          <label class="tk-search" style="max-width:none">${icon('search', { size: 15 })}
            <input type="search" data-action="patient-search" value="${state.patientSearch}" placeholder="Search name, phone, allergy or note…">
          </label>
        </div>
        <div class="patient-list-scroll">
          ${state.loading && !state.patients.length ? skeleton(4) : filtered.length ? filtered.map((p) => {
            const age = calcAge(p.date_of_birth);
            const rowAlerts = extractClinicalAlerts(p, []);
            const hasAllergy = rowAlerts.some((a) => a.kind === 'allergy');
            const hasCond = rowAlerts.some((a) => a.kind === 'condition');
            return html`
              <button type="button" class="${cls('patient-item', { 'is-on': state.selectedPatientId === p.id })}" data-key="pt-${p.id}" data-action="select-patient" data-id="${p.id}">
                <span class="tk-avatar">${initials(p.full_name)}</span>
                <span style="min-width:0;flex:1;display:grid;gap:3px">
                  <span style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-weight:700;font-size:14.5px">
                    <span>${p.full_name}</span>
                    ${age ? html`<span class="age-pill">${age}</span>` : ''}
                    ${p.is_sample ? html`<span class="tk-tag tk-tag--sample">Sample</span>` : ''}
                  </span>
                  <span class="tk-muted" style="display:block;font-size:12.5px">${p.phone} · DOB ${fmtDay(p.date_of_birth)}</span>
                  ${hasAllergy || hasCond ? html`
                    <span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:1px">
                      ${hasAllergy ? html`<span class="clinical-pill clinical-pill--allergy" style="padding:1px 7px;font-size:11px">${icon('alert', { size: 11 })} Allergy</span>` : ''}
                      ${hasCond ? html`<span class="clinical-pill clinical-pill--condition" style="padding:1px 7px;font-size:11px">${icon('info', { size: 11 })} Clinical Note</span>` : ''}
                    </span>` : ''}
                </span>
                ${Number(p.intake_count) > 0 ? html`<span class="tk-tag tk-tag--ok" title="Intake on file">${icon('check', { size: 12 })}</span>` : ''}
              </button>`;
          }) : emptyState({ iconName: 'users', title: 'No patients match', text: 'Register a new patient to start booking appointments.' })}
        </div>
      </section>

      <div class="tk-stack">
        ${state.loading && !pt ? html`<section class="tk-sheet">${skeleton(3)}</section>` : pt ? html`
          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <div class="dossier-head-id">
                <span class="dossier-avatar">${initials(pt.full_name)}</span>
                <h2 class="tk-sheet__title">
                  <span>${pt.full_name}</span>
                  ${ptAge ? html`<span class="age-pill">${ptAge}</span>` : ''}
                </h2>
              </div>
              <div class="tk-sheet__actions">
                <button type="button" class="k-btn k-btn--primary k-btn--sm" data-action="dossier-book" data-id="${pt.id}">${icon('calendar', { size: 14 })} Book Appt</button>
                <button type="button" class="k-btn k-btn--soft k-btn--sm" data-action="dossier-intake" data-id="${pt.id}">${icon('clipboard', { size: 14 })} New Intake</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-action="patient-edit" data-id="${pt.id}">Edit</button>
                <button type="button" class="k-btn k-btn--ghost k-btn--sm tk-danger" data-action="patient-del" data-id="${pt.id}">Delete</button>
              </div>
            </div>
            <div class="tk-sheet__body tk-stack">
              <div class="alert-strip ${alertTone}" role="region" aria-label="Clinical alerts">
                <span class="alert-strip__lbl">${icon(alertTone === 'alert-strip--clear' ? 'shield-check' : 'alert', { size: 13 })} Clinical Alerts</span>
                ${ptAlerts.length ? ptAlerts.map((al) => html`
                  <span class="${cls('clinical-pill', `clinical-pill--${al.kind}`)}">
                    ${icon(al.kind === 'allergy' ? 'alert' : al.kind === 'condition' ? 'shield' : 'info', { size: 12 })}
                    ${al.label}
                  </span>`) : html`<span class="clinical-pill clinical-pill--clear">${icon('check', { size: 12 })} No allergies or alerts flagged</span>`}
                <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="margin-left:auto" data-action="add-clinical-alert" data-id="${pt.id}">
                  ${icon('plus', { size: 13 })} Add Alert
                </button>
              </div>

              <div class="tk-kv">
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Date of Birth &amp; Age</span>
                  <span class="tk-kv__v" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                    <span>${fmtDay(pt.date_of_birth)}</span>
                    ${ptAge ? html`<span class="age-pill">${ptAge}</span>` : ''}
                  </span>
                </div>
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Phone</span>
                  <span class="tk-kv__v" style="display:flex;align-items:center;gap:6px">
                    ${pt.phone}
                    <button type="button" class="k-btn k-btn--ghost k-btn--sm" style="min-height:26px;padding:0 6px" data-action="copy-val" data-val="${pt.phone}" data-label="Phone">${icon('copy', { size: 13 })}</button>
                  </span>
                </div>
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Email</span>
                  <span class="tk-kv__v" style="display:flex;align-items:center;gap:6px">
                    ${pt.email || '—'}
                    ${pt.email ? html`<button type="button" class="k-btn k-btn--ghost k-btn--sm" style="min-height:26px;padding:0 6px" data-action="copy-val" data-val="${pt.email}" data-label="Email">${icon('copy', { size: 13 })}</button>` : ''}
                  </span>
                </div>
                <div class="tk-kv__item">
                  <span class="tk-kv__k">Address</span>
                  <span class="tk-kv__v">${pt.address || '—'}</span>
                </div>
              </div>

              ${(pt.emergency_contact_name || pt.emergency_contact_phone) ? html`
                <div class="emergency-box">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    ${icon('alert', { size: 15 })}
                    <strong>Emergency Contact:</strong>
                    <span>${pt.emergency_contact_name || 'Named contact'}${pt.emergency_contact_phone ? ' · ' + pt.emergency_contact_phone : ''}</span>
                  </div>
                  ${pt.emergency_contact_phone ? html`<button type="button" class="k-btn k-btn--sm" data-action="copy-val" data-val="${pt.emergency_contact_phone}" data-label="Emergency phone">${icon('copy', { size: 13 })} Copy</button>` : ''}
                </div>` : ''}

              ${pt.notes ? html`<div class="tk-muted" style="font-size:13.5px"><strong>Reception &amp; Clinical Notes:</strong> ${pt.notes}</div>` : ''}
            </div>
          </section>

          <section class="tk-sheet">
            <div class="tk-sheet__head">
              <h3 class="tk-sheet__title">${icon('calendar', { size: 17 })} Appointment History</h3>
              <span class="tk-sheet__count">${(d.appointments || []).length}</span>
            </div>
            <div>
              ${(d.appointments || []).length ? d.appointments.map((a) => html`
                <div class="timeline-item" data-key="da-${a.id}">
                  <div class="tk-row__title">
                    <span>${fmtDay(a.appt_date)} at ${a.appt_time}</span>
                    <span class="tk-tag tk-tag--accent">${a.appt_type}</span>
                    <span class="tk-tag ${a.status === 'Completed' ? 'tk-tag--ok' : a.status === 'No-Show' ? 'tk-tag--bad' : 'tk-tag--info'}">${a.status}</span>
                  </div>
                  <div class="tk-row__meta">
                    <span>${a.provider_name} (${a.provider_role})</span>
                    ${a.room ? html`<span>${a.room}</span>` : ''}
                    ${a.notes ? html`<span>${a.notes}</span>` : ''}
                  </div>
                </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No appointments recorded yet.</p>`}
            </div>
          </section>

          <div class="tk-grid-even">
            <section class="tk-sheet">
              <div class="tk-sheet__head">
                <h3 class="tk-sheet__title">${icon('clipboard', { size: 17 })} Intake &amp; Consent</h3>
                <span class="tk-sheet__count">${(d.intakes || []).length}</span>
              </div>
              <div>
                ${(d.intakes || []).length ? d.intakes.map((f) => html`
                  <div class="timeline-item" data-key="di-${f.id}">
                    <div class="tk-row__title">
                      <span>${f.reason_for_visit}</span>
                      <span class="tk-tag tk-tag--ok">Consent (${(f.consent || []).length})</span>
                    </div>
                    <div class="tk-row__meta">
                      <span>${fmtDateTime(f.created_at)}</span>
                      <span>Preferred: ${f.preferred_contact}</span>
                    </div>
                    ${f.symptoms ? html`<div class="tk-muted" style="font-size:13px;margin-top:4px"><strong>Symptoms:</strong> ${f.symptoms}</div>` : ''}
                    ${f.current_medications ? html`<div class="tk-muted" style="font-size:13px"><strong>Medications:</strong> ${f.current_medications}</div>` : ''}
                  </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No intake form on file yet.</p>`}
              </div>
            </section>

            <section class="tk-sheet">
              <div class="tk-sheet__head">
                <h3 class="tk-sheet__title">${icon('bell', { size: 17 })} Follow-Ups &amp; Recalls</h3>
                <span class="tk-sheet__count">${(d.followUps || []).length}</span>
              </div>
              <div>
                ${(d.followUps || []).length ? d.followUps.map((fu) => html`
                  <div class="timeline-item" data-key="df-${fu.id}">
                    <div class="tk-row__title">
                      <span>Due ${fmtDay(fu.followup_date)}</span>
                      <span class="tk-tag ${fu.status === 'Completed' ? 'tk-tag--ok' : fu.status === 'Scheduled' ? 'tk-tag--info' : 'tk-tag--warn'}">${fu.status}</span>
                    </div>
                    <div class="tk-muted" style="font-size:13.5px;margin-top:3px">${fu.action}</div>
                    <div class="tk-row__meta"><span>${fu.provider_name}</span></div>
                  </div>`) : html`<p class="tk-muted" style="padding:14px 16px">No follow-ups scheduled.</p>`}
              </div>
            </section>
          </div>` : emptyState({ iconName: 'user', title: 'Select a patient', text: 'Choose a patient from the directory to view their full administrative dossier.' })}
      </div>
    </div>`;
}

export function wirePatientsActions(root, state, { draw, loadScreen, loadDossier, router }) {
  on(root, 'input', '[data-action="patient-search"]', (e, el) => {
    state.patientSearch = el.value;
    draw();
  });

  on(root, 'click', '[data-action="select-patient"]', async (e, el) => {
    try {
      await loadDossier(Number(el.dataset.id));
      draw();
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="copy-val"]', (e, el) => {
    copyText(el.dataset.val || '', { title: el.dataset.label || 'Copy detail', done: `${el.dataset.label || 'Detail'} copied.` });
  });

  on(root, 'click', '[data-action="add-clinical-alert"]', async (e, el) => {
    const cur = state.dossier?.patient;
    if (!cur || String(cur.id) !== el.dataset.id) return;
    const saved = await formDialog({
      title: `Flag Allergy / Condition · ${cur.full_name}`,
      submitLabel: 'Add clinical alert',
      size: 'sm',
      fields: html`
        <label class="k-field"><span class="k-field__label">Alert Category</span>
          <select class="k-input" name="kind">
            <option value="Allergy">Allergy (High Priority Red Pill)</option>
            <option value="Condition">Medical Condition / Precaution</option>
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Details</span>
          <input class="k-input" name="detail" placeholder="e.g. Penicillin, Latex, Asthma, Wheelchair access" required>
        </label>`,
      onSubmit: (vals) => {
        const entry = `${vals.kind}: ${String(vals.detail || '').trim()}`;
        const existing = String(cur.notes || '').trim();
        const combined = existing ? `${existing}; ${entry}` : entry;
        return api.put('/api/patients', {
          id: cur.id,
          full_name: cur.full_name,
          date_of_birth: cur.date_of_birth,
          phone: cur.phone,
          email: cur.email,
          address: cur.address,
          emergency_contact_name: cur.emergency_contact_name,
          emergency_contact_phone: cur.emergency_contact_phone,
          notes: combined.slice(0, 600),
        });
      },
    });
    if (saved) { toast.success('Clinical alert added to patient chart.'); await loadScreen('/patients'); }
  });

  on(root, 'click', '[data-action="patient-new"]', async () => {
    const made = await formDialog({
      title: 'Register Patient',
      submitLabel: 'Register patient',
      size: 'lg',
      fields: patientFields(),
      onSubmit: (vals) => api.post('/api/patients', vals),
    });
    if (made) {
      state.selectedPatientId = made.patient.id;
      toast.success(`${made.patient.full_name} registered.`);
      await loadScreen('/patients');
    }
  });

  on(root, 'click', '[data-action="patient-edit"]', async (e, el) => {
    const cur = state.dossier?.patient;
    if (!cur || String(cur.id) !== el.dataset.id) return;
    const saved = await formDialog({
      title: `Edit ${cur.full_name}`,
      submitLabel: 'Save patient',
      size: 'lg',
      fields: patientFields(cur),
      onSubmit: (vals) => api.put('/api/patients', { ...vals, id: cur.id }),
    });
    if (saved) { toast.success('Patient updated.'); await loadScreen('/patients'); }
  });

  on(root, 'click', '[data-action="patient-del"]', async (e, el) => {
    const ok = await confirmDialog({
      title: 'Delete patient record?',
      message: 'This also removes their appointments, intake forms and follow-ups from this workspace.',
      confirmLabel: 'Delete patient',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete('/api/patients', { id: Number(el.dataset.id) });
      state.selectedPatientId = null;
      toast.success('Patient deleted.');
      await loadScreen('/patients');
    } catch (err) { toastError(err); }
  });

  on(root, 'click', '[data-action="dossier-intake"]', (e, el) => {
    state.intakePatientId = el.dataset.id;
    state.intakeApptId = '';
    state.intakePatientName = state.dossier?.patient?.full_name || '';
    router.go('/intake');
  });

  on(root, 'click', '[data-action="dossier-book"]', async (e, el) => {
    const ptId = Number(el.dataset.id);
    const activeProviders = state.providers.filter((p) => p.active);
    if (!activeProviders.length) { toast.error('Add an active provider first.'); return; }
    const made = await formDialog({
      title: 'Book Appointment',
      submitLabel: 'Book slot',
      fields: html`
        <label class="k-field"><span class="k-field__label">Provider</span>
          <select class="k-input" name="provider_id" required>
            ${activeProviders.map((pr) => html`<option value="${pr.id}">${pr.full_name} · ${pr.role}</option>`)}
          </select>
        </label>
        <div class="k-form__row">
          <label class="k-field"><span class="k-field__label">Date</span><input class="k-input" type="date" name="appt_date" value="${today()}" required></label>
          <label class="k-field"><span class="k-field__label">Time</span><input class="k-input" type="time" name="appt_time" value="10:00" required></label>
        </div>
        <label class="k-field"><span class="k-field__label">Type</span>
          <select class="k-input" name="appt_type">
            ${['Consultation', 'New Patient', 'Follow-up', 'Procedure', 'Telehealth'].map((tp) => html`<option value="${tp}">${tp}</option>`)}
          </select>
        </label>
        <label class="k-field"><span class="k-field__label">Notes</span><input class="k-input" name="notes" placeholder="Scheduling note…"></label>`,
      onSubmit: (vals) => api.post('/api/appointments', { ...vals, patient_id: ptId }),
    });
    if (made) { toast.success('Appointment booked.'); await loadScreen('/patients'); }
  });
}
