<?php
declare(strict_types=1);

namespace App;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use SoftN\Kit\AppBootstrap;
use SoftN\Kit\Context;
use SoftN\Kit\Database;
use SoftN\Kit\HttpException;
use SoftN\Kit\Validator as V;

final class ClinicController
{
    private const PROVIDER_ROLES = [
        'General Practitioner',
        'Physiotherapist',
        'Dentist',
        'Nurse',
        'Allied Health',
        'Psychologist',
        'Specialist',
    ];
    private const APPT_TYPES = ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth'];
    private const APPT_STATUSES = ['Booked', 'Checked In', 'In Room', 'Completed', 'No-Show', 'Cancelled'];
    private const CONTACT_METHODS = ['Phone Call', 'Text Message', 'Email'];
    private const FOLLOWUP_STATUSES = ['Pending', 'Scheduled', 'Completed', 'Cancelled'];

    // ---- Patients ----

    public function listPatients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 100]);
            $sql = 'SELECT p.*, '
                . '(SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS appointment_count, '
                . '(SELECT COUNT(*) FROM intake_forms f WHERE f.patient_id = p.id) AS intake_count, '
                . '(SELECT MAX(a2.appt_date) FROM appointments a2 WHERE a2.patient_id = p.id) AS last_visit_date '
                . 'FROM patients p WHERE 1=1';
            $params = [];
            if ($q !== '') {
                $term = V::likeTerm($q);
                $sql .= " AND (p.full_name LIKE ? ESCAPE '\\' OR p.phone LIKE ? ESCAPE '\\' OR p.email LIKE ? ESCAPE '\\')";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }
            $sql .= ' ORDER BY p.full_name ASC LIMIT 250';
            return ['patients' => $db->query($sql, $params)];
        });
    }

    public function getPatientDossier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null, 'id');
            $patient = $db->first('SELECT * FROM patients WHERE id = ?', [$id]);
            if (!$patient) {
                HttpException::fail(404, 'patient_not_found', 'Patient record not found.');
            }
            $appointments = $db->query(
                'SELECT a.*, pr.full_name AS provider_name, pr.role AS provider_role '
                . 'FROM appointments a LEFT JOIN providers pr ON pr.id = a.provider_id '
                . 'WHERE a.patient_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 50',
                [$id]
            );
            $intakes = $db->query(
                'SELECT * FROM intake_forms WHERE patient_id = ? ORDER BY created_at DESC LIMIT 30',
                [$id]
            );
            foreach ($intakes as &$f) {
                $f['consent'] = V::parseJson($f['consent_json'] ?? '', []);
            }
            unset($f);
            $followUps = $db->query(
                'SELECT f.*, pr.full_name AS provider_name, a.appt_date AS source_appt_date '
                . 'FROM follow_ups f '
                . 'LEFT JOIN providers pr ON pr.id = f.provider_id '
                . 'LEFT JOIN appointments a ON a.id = f.appointment_id '
                . 'WHERE f.patient_id = ? ORDER BY f.followup_date DESC LIMIT 30',
                [$id]
            );
            return [
                'patient' => $patient,
                'appointments' => $appointments,
                'intakes' => $intakes,
                'followUps' => $followUps,
            ];
        });
    }

    public function addPatient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $fullName = V::text($input['full_name'] ?? null, 'full_name', ['max' => 120, 'label' => 'Full name']);
            $dob = V::day($input['date_of_birth'] ?? null, 'date_of_birth', ['label' => 'Date of birth']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300, 'label' => 'Address']);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 120]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO patients(full_name, date_of_birth, phone, email, address, emergency_contact_name, emergency_contact_phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$fullName, $dob, $phone, $em, $address, $ecName, $ecPhone, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['patient' => $db->first('SELECT * FROM patients WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function savePatient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM patients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'patient_not_found', 'Patient record not found.');
            }
            $fullName = V::text($input['full_name'] ?? null, 'full_name', ['max' => 120, 'label' => 'Full name']);
            $dob = V::day($input['date_of_birth'] ?? null, 'date_of_birth', ['label' => 'Date of birth']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 120]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE patients SET full_name = ?, date_of_birth = ?, phone = ?, email = ?, address = ?, emergency_contact_name = ?, emergency_contact_phone = ?, notes = ? WHERE id = ?',
                [$fullName, $dob, $phone, $em, $address, $ecName, $ecPhone, $notes, $id]
            );

            return ['patient' => $db->first('SELECT * FROM patients WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deletePatient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM patients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'patient_not_found', 'Patient record not found.');
            }
            $db->execute('DELETE FROM follow_ups WHERE patient_id = ?', [$id]);
            $db->execute('DELETE FROM intake_forms WHERE patient_id = ?', [$id]);
            $db->execute('DELETE FROM appointments WHERE patient_id = ?', [$id]);
            $db->execute('DELETE FROM patients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Providers ----

    public function listProviders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query(
                'SELECT pr.*, '
                . "(SELECT COUNT(*) FROM appointments a WHERE a.provider_id = pr.id AND a.appt_date = ? AND a.status != 'Cancelled') AS today_count "
                . 'FROM providers pr ORDER BY pr.active DESC, pr.full_name ASC',
                [$todayDay]
            );
            return ['providers' => $rows];
        });
    }

    public function addProvider(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $fullName = V::text($input['full_name'] ?? null, 'full_name', ['max' => 120, 'label' => 'Provider name']);
            $role = V::oneOf($input['role'] ?? null, self::PROVIDER_ROLES, 'role', ['fallback' => 'General Practitioner']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $room = V::text($input['room'] ?? null, 'room', ['required' => false, 'max' => 60]);
            $active = !array_key_exists('active', $input) ? 1 : (V::bool($input['active']) ? 1 : 0);

            $created = $db->execute(
                'INSERT INTO providers(full_name, role, email, phone, room, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$fullName, $role, $em, $phone, $room, $active, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['provider' => $db->first('SELECT * FROM providers WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveProvider(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM providers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'provider_not_found', 'Provider not found.');
            }
            $fullName = array_key_exists('full_name', $input)
                ? V::text($input['full_name'], 'full_name', ['max' => 120, 'label' => 'Provider name'])
                : (string) $cur['full_name'];
            $role = array_key_exists('role', $input)
                ? V::oneOf($input['role'], self::PROVIDER_ROLES, 'role', ['fallback' => $cur['role']])
                : (string) $cur['role'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40])
                : (string) $cur['phone'];
            $room = array_key_exists('room', $input)
                ? V::text($input['room'], 'room', ['required' => false, 'max' => 60])
                : (string) $cur['room'];
            $active = array_key_exists('active', $input)
                ? (V::bool($input['active']) ? 1 : 0)
                : (int) $cur['active'];

            $db->execute(
                'UPDATE providers SET full_name = ?, role = ?, email = ?, phone = ?, room = ?, active = ? WHERE id = ?',
                [$fullName, $role, $em, $phone, $room, $active, $id]
            );

            return ['provider' => $db->first('SELECT * FROM providers WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteProvider(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM providers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'provider_not_found', 'Provider not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM appointments WHERE provider_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'provider_has_appointments', 'This provider has appointments on record. Mark them Inactive instead.');
            }
            $db->execute('DELETE FROM providers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Appointments & Waiting Room ----

    /** @return array<string, mixed>|null */
    private static function fetchAppointmentRow(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT a.*, p.full_name AS patient_name, p.phone AS patient_phone, p.date_of_birth AS patient_dob, '
            . 'pr.full_name AS provider_name, pr.role AS provider_role, '
            . '(SELECT COUNT(*) FROM intake_forms f WHERE f.appointment_id = a.id OR f.patient_id = a.patient_id) AS intake_count, '
            . '(SELECT MAX(f2.id) FROM intake_forms f2 WHERE f2.appointment_id = a.id OR f2.patient_id = a.patient_id) AS latest_intake_id '
            . 'FROM appointments a '
            . 'LEFT JOIN patients p ON p.id = a.patient_id '
            . 'LEFT JOIN providers pr ON pr.id = a.provider_id '
            . 'WHERE a.id = ?',
            [$id]
        );
        if ($row !== null) {
            $row['intake_completed'] = ((int) ($row['intake_count'] ?? 0)) > 0;
        }
        return $row;
    }

    public function listAppointments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $apptDate = V::day($input['date'] ?? null, 'date', ['required' => false, 'fallback' => '']);
            $providerId = V::int($input['provider_id'] ?? null, 'provider_id', ['required' => false, 'min' => 1]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);

            $sql = 'SELECT a.*, p.full_name AS patient_name, p.phone AS patient_phone, p.date_of_birth AS patient_dob, '
                . 'pr.full_name AS provider_name, pr.role AS provider_role, '
                . '(SELECT COUNT(*) FROM intake_forms f WHERE f.appointment_id = a.id OR f.patient_id = a.patient_id) AS intake_count, '
                . '(SELECT MAX(f2.id) FROM intake_forms f2 WHERE f2.appointment_id = a.id OR f2.patient_id = a.patient_id) AS latest_intake_id '
                . 'FROM appointments a '
                . 'LEFT JOIN patients p ON p.id = a.patient_id '
                . 'LEFT JOIN providers pr ON pr.id = a.provider_id WHERE 1=1';
            $params = [];
            if ($apptDate !== '') {
                $sql .= ' AND a.appt_date = ?';
                $params[] = $apptDate;
            }
            if ($providerId !== null) {
                $sql .= ' AND a.provider_id = ?';
                $params[] = $providerId;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND a.status = ?';
                $params[] = $status;
            }
            $sql .= $apptDate !== '' ? ' ORDER BY a.appt_time ASC, a.id ASC' : ' ORDER BY a.appt_date DESC, a.appt_time ASC LIMIT 200';

            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['intake_completed'] = ((int) ($r['intake_count'] ?? 0)) > 0;
            }
            unset($r);
            return ['appointments' => $rows];
        });
    }

    public function addAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $patientId = V::rowId($input['patient_id'] ?? null, 'patient_id');
            $providerId = V::rowId($input['provider_id'] ?? null, 'provider_id');
            $patient = $db->first('SELECT id FROM patients WHERE id = ?', [$patientId]);
            if (!$patient) {
                HttpException::fail(404, 'patient_not_found', 'Selected patient was not found.');
            }
            $provider = $db->first('SELECT id, room FROM providers WHERE id = ?', [$providerId]);
            if (!$provider) {
                HttpException::fail(404, 'provider_not_found', 'Selected provider was not found.');
            }

            $apptDate = V::day($input['appt_date'] ?? null, 'appt_date', ['label' => 'Appointment date']);
            $apptTime = V::timeStr($input['appt_time'] ?? null, 'appt_time', ['label' => 'Appointment time']);
            $apptType = V::oneOf($input['appt_type'] ?? null, self::APPT_TYPES, 'appt_type', ['fallback' => 'Consultation']);
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['fallback' => 'Booked']);
            $room = V::text($input['room'] ?? null, 'room', ['required' => false, 'max' => 60]);
            if ($room === '') {
                $room = (string) ($provider['room'] ?? '');
            }
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            if (!V::bool($input['allow_overlap'] ?? false)) {
                $clash = $db->first(
                    "SELECT id FROM appointments WHERE provider_id = ? AND appt_date = ? AND appt_time = ? AND status NOT IN ('Cancelled', 'No-Show')",
                    [$providerId, $apptDate, $apptTime]
                );
                if ($clash) {
                    HttpException::fail(409, 'slot_conflict', 'That provider already has an appointment booked at ' . $apptTime . ' on ' . $apptDate . '.');
                }
            }

            $ts = V::now();
            $checkedInAt = ($status === 'Checked In' || $status === 'In Room') ? $ts : 0;
            $created = $db->execute(
                'INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$patientId, $providerId, $apptDate, $apptTime, $apptType, $status, $room, $notes, $checkedInAt, $ts]
            );
            $row = self::fetchAppointmentRow($db, $created['lastInsertRowid']);
            return [
                '__status' => 201,
                '__body' => [
                    'appointment' => $row,
                    'counts' => WorkspaceController::clinicBadgeCounts($db, $apptDate),
                ],
            ];
        }, write: true);
    }

    public function saveAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM appointments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'appointment_not_found', 'Appointment not found.');
            }
            $patientId = array_key_exists('patient_id', $input)
                ? V::rowId($input['patient_id'], 'patient_id')
                : (int) $cur['patient_id'];
            $providerId = array_key_exists('provider_id', $input)
                ? V::rowId($input['provider_id'], 'provider_id')
                : (int) $cur['provider_id'];
            $apptDate = array_key_exists('appt_date', $input)
                ? V::day($input['appt_date'], 'appt_date', ['label' => 'Appointment date'])
                : (string) $cur['appt_date'];
            $apptTime = array_key_exists('appt_time', $input)
                ? V::timeStr($input['appt_time'], 'appt_time', ['label' => 'Appointment time'])
                : (string) $cur['appt_time'];
            $apptType = V::oneOf($input['appt_type'] ?? null, self::APPT_TYPES, 'appt_type', ['fallback' => $cur['appt_type']]);
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['fallback' => $cur['status']]);
            $room = array_key_exists('room', $input)
                ? V::text($input['room'], 'room', ['required' => false, 'max' => 60])
                : (string) $cur['room'];
            $notes = array_key_exists('notes', $input)
                ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 600])
                : (string) $cur['notes'];

            $clash = $db->first(
                "SELECT id FROM appointments WHERE id != ? AND provider_id = ? AND appt_date = ? AND appt_time = ? AND status NOT IN ('Cancelled', 'No-Show')",
                [$id, $providerId, $apptDate, $apptTime]
            );
            if ($clash) {
                HttpException::fail(409, 'slot_conflict', 'That provider already has another booking at ' . $apptTime . '.');
            }

            $checkedInAt = (int) $cur['checked_in_at'];
            if (($status === 'Checked In' || $status === 'In Room') && !$checkedInAt) {
                $checkedInAt = V::now();
            }

            $db->execute(
                'UPDATE appointments SET patient_id = ?, provider_id = ?, appt_date = ?, appt_time = ?, appt_type = ?, status = ?, room = ?, notes = ?, checked_in_at = ? WHERE id = ?',
                [$patientId, $providerId, $apptDate, $apptTime, $apptType, $status, $room, $notes, $checkedInAt, $id]
            );

            return ['appointment' => self::fetchAppointmentRow($db, $id)];
        }, write: true);
    }

    public function setAppointmentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM appointments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'appointment_not_found', 'Appointment not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['label' => 'Status']);
            $checkedInAt = (int) $cur['checked_in_at'];
            if ($status === 'Checked In' && !$checkedInAt) {
                $checkedInAt = V::now();
            }
            if ($status === 'In Room' && !$checkedInAt) {
                $checkedInAt = V::now();
            }
            if ($status === 'Booked') {
                $checkedInAt = 0;
            }

            $db->execute('UPDATE appointments SET status = ?, checked_in_at = ? WHERE id = ?', [$status, $checkedInAt, $id]);

            return [
                'appointment' => self::fetchAppointmentRow($db, $id),
                'counts' => WorkspaceController::clinicBadgeCounts($db, (string) $cur['appt_date']),
            ];
        }, write: true);
    }

    public function deleteAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM appointments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'appointment_not_found', 'Appointment not found.');
            }
            $db->execute('DELETE FROM follow_ups WHERE appointment_id = ?', [$id]);
            $db->execute('UPDATE intake_forms SET appointment_id = NULL WHERE appointment_id = ?', [$id]);
            $db->execute('DELETE FROM appointments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Digital Intake & Consent ----

    public function listIntakes(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $patientId = V::int($input['patient_id'] ?? null, 'patient_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT f.*, p.full_name AS patient_name, p.date_of_birth AS patient_dob, p.phone AS patient_phone, p.email AS patient_email, '
                . 'a.appt_date, a.appt_time, pr.full_name AS provider_name '
                . 'FROM intake_forms f '
                . 'LEFT JOIN patients p ON p.id = f.patient_id '
                . 'LEFT JOIN appointments a ON a.id = f.appointment_id '
                . 'LEFT JOIN providers pr ON pr.id = a.provider_id WHERE 1=1';
            $params = [];
            if ($patientId !== null) {
                $sql .= ' AND f.patient_id = ?';
                $params[] = $patientId;
            }
            $sql .= ' ORDER BY f.created_at DESC LIMIT 120';
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['consent'] = V::parseJson($r['consent_json'] ?? '', []);
            }
            unset($r);
            return ['intakes' => $rows];
        });
    }

    public function addIntake(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $patientId = V::rowId($input['patient_id'] ?? null, 'patient_id');
            $patient = $db->first('SELECT id, full_name FROM patients WHERE id = ?', [$patientId]);
            if (!$patient) {
                HttpException::fail(404, 'patient_not_found', 'Patient not found.');
            }
            $apptId = V::int($input['appointment_id'] ?? null, 'appointment_id', ['required' => false, 'min' => 1]);
            if ($apptId !== null) {
                $appt = $db->first('SELECT id FROM appointments WHERE id = ?', [$apptId]);
                if (!$appt) {
                    HttpException::fail(404, 'appointment_not_found', 'Linked appointment not found.');
                }
            }
            $reason = V::text($input['reason_for_visit'] ?? null, 'reason_for_visit', ['max' => 800, 'label' => 'Reason for visit']);
            $symptoms = V::text($input['symptoms'] ?? null, 'symptoms', ['required' => false, 'max' => 1000]);
            $meds = V::text($input['current_medications'] ?? null, 'current_medications', ['required' => false, 'max' => 1000]);
            $preferred = V::oneOf($input['preferred_contact'] ?? null, self::CONTACT_METHODS, 'preferred_contact', ['fallback' => 'Phone Call']);
            $consent = V::listOf(
                $input['consent'] ?? null,
                'consent',
                10,
                static fn ($v): string => V::text($v, 'consent_item', ['max' => 200])
            );
            if (count($consent) === 0) {
                HttpException::fail(422, 'consent_required', 'At least one patient consent acknowledgement must be ticked.');
            }
            $signedBy = V::text($input['signed_by'] ?? null, 'signed_by', ['required' => false, 'max' => 120]) ?: (string) $patient['full_name'];

            $created = $db->execute(
                'INSERT INTO intake_forms(patient_id, appointment_id, reason_for_visit, symptoms, current_medications, preferred_contact, consent_json, signed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$patientId, $apptId, $reason, $symptoms, $meds, $preferred, json_encode($consent, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $signedBy, V::now()]
            );

            $row = $db->first(
                'SELECT f.*, p.full_name AS patient_name, p.date_of_birth AS patient_dob, p.phone AS patient_phone '
                . 'FROM intake_forms f LEFT JOIN patients p ON p.id = f.patient_id WHERE f.id = ?',
                [$created['lastInsertRowid']]
            );
            $row['consent'] = V::parseJson($row['consent_json'] ?? '', []);

            return ['__status' => 201, '__body' => ['intake' => $row]];
        }, write: true);
    }

    public function deleteIntake(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM intake_forms WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'intake_not_found', 'Intake form not found.');
            }
            $db->execute('DELETE FROM intake_forms WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Follow-Up & Recall Queue ----

    public function listFollowUps(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT f.*, p.full_name AS patient_name, p.phone AS patient_phone, p.email AS patient_email, '
                . 'pr.full_name AS provider_name, pr.role AS provider_role, a.appt_date AS source_appt_date, a.appt_type AS source_appt_type '
                . 'FROM follow_ups f '
                . 'LEFT JOIN patients p ON p.id = f.patient_id '
                . 'LEFT JOIN providers pr ON pr.id = f.provider_id '
                . 'LEFT JOIN appointments a ON a.id = f.appointment_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND f.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE f.status WHEN 'Pending' THEN 0 WHEN 'Scheduled' THEN 1 ELSE 2 END, f.followup_date ASC";
            return ['followUps' => $db->query($sql, $params)];
        });
    }

    public function addFollowUp(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $apptId = V::rowId($input['appointment_id'] ?? null, 'appointment_id');
            $appt = $db->first('SELECT * FROM appointments WHERE id = ?', [$apptId]);
            if (!$appt) {
                HttpException::fail(404, 'appointment_not_found', 'Linked appointment not found.');
            }
            $fuDate = V::day($input['followup_date'] ?? null, 'followup_date', ['label' => 'Follow-up date']);
            $actionText = V::text($input['action'] ?? null, 'action', ['max' => 600, 'label' => 'Next steps']);
            $status = V::oneOf($input['status'] ?? null, self::FOLLOWUP_STATUSES, 'status', ['fallback' => 'Pending']);

            $created = $db->execute(
                'INSERT INTO follow_ups(appointment_id, patient_id, provider_id, followup_date, action, status, booked_appointment_id, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, NULL, 0, ?)',
                [$apptId, (int) $appt['patient_id'], (int) $appt['provider_id'], $fuDate, $actionText, $status, V::now()]
            );

            $row = $db->first(
                'SELECT f.*, p.full_name AS patient_name, pr.full_name AS provider_name '
                . 'FROM follow_ups f LEFT JOIN patients p ON p.id = f.patient_id LEFT JOIN providers pr ON pr.id = f.provider_id '
                . 'WHERE f.id = ?',
                [$created['lastInsertRowid']]
            );

            return ['__status' => 201, '__body' => ['followUp' => $row]];
        }, write: true);
    }

    public function setFollowUpStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM follow_ups WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'followup_not_found', 'Follow-up item not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::FOLLOWUP_STATUSES, 'status', ['label' => 'Status']);
            $db->execute('UPDATE follow_ups SET status = ? WHERE id = ?', [$status, $id]);
            return ['followUp' => $db->first('SELECT * FROM follow_ups WHERE id = ?', [$id])];
        }, write: true);
    }

    public function bookFollowUpAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM follow_ups WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'followup_not_found', 'Follow-up item not found.');
            }
            $apptDate = V::day($input['appt_date'] ?? null, 'appt_date', ['required' => false, 'fallback' => (string) $cur['followup_date']]);
            $apptTime = V::timeStr($input['appt_time'] ?? null, 'appt_time', ['required' => false, 'fallback' => '10:00']);
            $providerId = (array_key_exists('provider_id', $input) && $input['provider_id'] !== '' && $input['provider_id'] !== null)
                ? V::rowId($input['provider_id'], 'provider_id')
                : (int) $cur['provider_id'];
            $provider = $db->first('SELECT id, room FROM providers WHERE id = ?', [$providerId]);
            if (!$provider) {
                HttpException::fail(404, 'provider_not_found', 'Provider not found.');
            }

            $clash = $db->first(
                "SELECT id FROM appointments WHERE provider_id = ? AND appt_date = ? AND appt_time = ? AND status NOT IN ('Cancelled', 'No-Show')",
                [$providerId, $apptDate, $apptTime]
            );
            if ($clash) {
                HttpException::fail(409, 'slot_conflict', 'Provider already has an appointment at ' . $apptTime . ' on ' . $apptDate . '.');
            }

            $ts = V::now();
            $created = $db->execute(
                "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, ?, 'Follow-up', 'Booked', ?, ?, 0, 0, ?)",
                [(int) $cur['patient_id'], $providerId, $apptDate, $apptTime, (string) ($provider['room'] ?? ''), 'Follow-up recall: ' . (string) $cur['action'], $ts]
            );
            $db->execute(
                "UPDATE follow_ups SET status = 'Scheduled', booked_appointment_id = ? WHERE id = ?",
                [$created['lastInsertRowid'], $id]
            );
            $apptRow = self::fetchAppointmentRow($db, $created['lastInsertRowid']);

            return [
                '__status' => 201,
                '__body' => [
                    'followUp' => $db->first('SELECT * FROM follow_ups WHERE id = ?', [$id]),
                    'appointment' => $apptRow,
                ],
            ];
        }, write: true);
    }

    public function deleteFollowUp(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM follow_ups WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'followup_not_found', 'Follow-up item not found.');
            }
            $db->execute('DELETE FROM follow_ups WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
