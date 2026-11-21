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

final class CoachingController
{
    private const FITNESS_GOALS = ['Fat loss', 'Strength', 'Muscle gain', 'Endurance', 'Mobility', 'Rehab'];
    private const CLIENT_STATUSES = ['Active', 'Trial', 'Paused', 'Finished'];
    private const TRAINER_ROLES = ['Personal trainer', 'Group instructor', 'Physio', 'Nutrition coach'];
    private const TRAINER_SPECS = ['Strength', 'HIIT', 'Pilates', 'Yoga', 'Boxing', 'Rehab', 'Nutrition'];
    private const SESSION_TYPES = ['1-on-1', 'Small Group', 'Assessment', 'Rehab', 'Nutrition'];
    private const SESSION_STATUSES = ['Scheduled', 'Checked In', 'Completed', 'Cancelled', 'No-Show'];
    private const PROGRAM_STATUSES = ['Draft', 'Active', 'Completed', 'Abandoned'];
    private const PAYMENT_TYPES = ['Session pack', 'Membership', 'Casual visit', 'Program fee'];
    private const PAYMENT_STATUSES = ['Paid', 'Pending', 'Failed'];

    private static function round1(float $v): float
    {
        $r = round($v * 10.0) / 10.0;
        return $r == 0.0 ? 0.0 : $r;
    }

    private static function computeClientProgressDelta(Database $db, int $clientId): array
    {
        $rows = $db->query(
            'SELECT id, assessment_date, weight_kg, body_fat_pct, mobility_score FROM assessments WHERE client_id = ? ORDER BY assessment_date DESC, id DESC LIMIT 2',
            [$clientId]
        );
        if (count($rows) === 0) {
            return [
                'count' => 0,
                'latest_date' => '',
                'latest_weight_kg' => null,
                'prev_weight_kg' => null,
                'weight_delta_kg' => null,
                'latest_body_fat_pct' => null,
                'prev_body_fat_pct' => null,
                'body_fat_delta_pct' => null,
                'latest_mobility_score' => null,
                'mobility_delta' => null,
            ];
        }

        $latest = $rows[0];
        $prev = count($rows) > 1 ? $rows[1] : null;

        $wDelta = ($latest['weight_kg'] !== null && $prev !== null && $prev['weight_kg'] !== null)
            ? self::round1((float) $latest['weight_kg'] - (float) $prev['weight_kg'])
            : null;
        $bfDelta = ($latest['body_fat_pct'] !== null && $prev !== null && $prev['body_fat_pct'] !== null)
            ? self::round1((float) $latest['body_fat_pct'] - (float) $prev['body_fat_pct'])
            : null;
        $mobDelta = ($latest['mobility_score'] !== null && $prev !== null && $prev['mobility_score'] !== null)
            ? ((int) $latest['mobility_score'] - (int) $prev['mobility_score'])
            : null;

        return [
            'count' => count($rows),
            'latest_date' => (string) $latest['assessment_date'],
            'latest_weight_kg' => $latest['weight_kg'] !== null ? (float) $latest['weight_kg'] : null,
            'prev_weight_kg' => ($prev !== null && $prev['weight_kg'] !== null) ? (float) $prev['weight_kg'] : null,
            'weight_delta_kg' => $wDelta,
            'latest_body_fat_pct' => $latest['body_fat_pct'] !== null ? (float) $latest['body_fat_pct'] : null,
            'prev_body_fat_pct' => ($prev !== null && $prev['body_fat_pct'] !== null) ? (float) $prev['body_fat_pct'] : null,
            'body_fat_delta_pct' => $bfDelta,
            'latest_mobility_score' => (int) ($latest['mobility_score'] ?? 0),
            'mobility_delta' => $mobDelta,
        ];
    }

    private static function cleanWorkoutBlocks(mixed $rawBlocks): array
    {
        return V::listOf($rawBlocks, 'blocks', 14, static function ($blk): array {
            $arr = is_array($blk) ? $blk : [];
            $d = V::text($arr['day'] ?? null, 'block_day', ['max' => 100, 'label' => 'Workout day / title']);
            $ex = V::text($arr['exercises'] ?? null, 'block_exercises', ['required' => false, 'max' => 1500]);
            return ['day' => $d, 'exercises' => $ex];
        });
    }

    // ---- Clients & Progress Dossier ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = "SELECT c.*, "
                . "(SELECT COUNT(*) FROM sessions s WHERE s.client_id = c.id AND s.status = 'Completed') AS completed_sessions, "
                . "(SELECT p.program_name FROM programs p WHERE p.client_id = c.id AND p.status = 'Active' ORDER BY p.id DESC LIMIT 1) AS active_program "
                . 'FROM clients c WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND c.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE c.status WHEN 'Active' THEN 0 WHEN 'Trial' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, c.name ASC";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['progress'] = self::computeClientProgressDelta($db, (int) $r['id']);
            }
            unset($r);
            return ['clients' => $rows];
        });
    }

    public function getClientDossier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null, 'id');
            $client = $db->first('SELECT * FROM clients WHERE id = ?', [$id]);
            if (!$client) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $progress = self::computeClientProgressDelta($db, $id);
            $assessments = $db->query(
                'SELECT * FROM assessments WHERE client_id = ? ORDER BY assessment_date DESC, id DESC LIMIT 30',
                [$id]
            );
            $programs = $db->query(
                "SELECT * FROM programs WHERE client_id = ? ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 ELSE 2 END, id DESC LIMIT 20",
                [$id]
            );
            foreach ($programs as &$p) {
                $p['blocks'] = V::parseJson($p['blocks_json'] ?? '', []);
            }
            unset($p);
            $sessions = $db->query(
                'SELECT s.*, tr.name AS trainer_name FROM sessions s LEFT JOIN trainers tr ON tr.id = s.trainer_id WHERE s.client_id = ? ORDER BY s.session_date DESC, s.session_time DESC LIMIT 30',
                [$id]
            );
            $payments = $db->query(
                'SELECT * FROM payments WHERE client_id = ? ORDER BY payment_date DESC, id DESC LIMIT 30',
                [$id]
            );
            return [
                'client' => $client,
                'progress' => $progress,
                'assessments' => $assessments,
                'programs' => $programs,
                'sessions' => $sessions,
                'payments' => $payments,
            ];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $goal = V::oneOf($input['goal'] ?? null, self::FITNESS_GOALS, 'goal', ['fallback' => 'Strength']);
            $med = V::text($input['medical_notes'] ?? null, 'medical_notes', ['required' => false, 'max' => 1000]);
            $ec = V::text($input['emergency_contact'] ?? null, 'emergency_contact', ['required' => false, 'max' => 160]);
            $status = V::oneOf($input['status'] ?? null, self::CLIENT_STATUSES, 'status', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO clients(name, email, phone, goal, medical_notes, emergency_contact, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $em, $phone, $goal, $med, $ec, $status, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['client' => $db->first('SELECT * FROM clients WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $goal = V::oneOf($input['goal'] ?? null, self::FITNESS_GOALS, 'goal', ['fallback' => $cur['goal']]);
            $med = V::text($input['medical_notes'] ?? null, 'medical_notes', ['required' => false, 'max' => 1000]);
            $ec = V::text($input['emergency_contact'] ?? null, 'emergency_contact', ['required' => false, 'max' => 160]);
            $status = V::oneOf($input['status'] ?? null, self::CLIENT_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE clients SET name = ?, email = ?, phone = ?, goal = ?, medical_notes = ?, emergency_contact = ?, status = ? WHERE id = ?',
                [$name, $em, $phone, $goal, $med, $ec, $status, $id]
            );
            return ['client' => $db->first('SELECT * FROM clients WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $db->execute('DELETE FROM payments WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM programs WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM assessments WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM sessions WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Trainers ----

    public function listTrainers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query(
                "SELECT tr.*, "
                . "(SELECT COUNT(*) FROM sessions s WHERE s.trainer_id = tr.id AND s.session_date >= ? AND s.status IN ('Scheduled', 'Checked In')) AS upcoming_count "
                . "FROM trainers tr ORDER BY CASE tr.active WHEN 'Active' THEN 0 ELSE 1 END, tr.name ASC",
                [$todayDay]
            );
            foreach ($rows as &$r) {
                $r['specialties'] = V::parseJson($r['specialties_json'] ?? '', []);
            }
            unset($r);
            return ['trainers' => $rows];
        });
    }

    public function addTrainer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Trainer name']);
            $role = V::oneOf($input['role'] ?? null, self::TRAINER_ROLES, 'role', ['fallback' => 'Personal trainer']);
            $specs = V::listOf(
                $input['specialties'] ?? null,
                'specialties',
                10,
                static fn ($v) => V::oneOf($v, self::TRAINER_SPECS, 'specialty')
            );
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO trainers(name, role, specialties_json, phone, email, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $role, json_encode($specs, JSON_UNESCAPED_UNICODE), $phone, $em, $active, V::now()]
            );
            $row = $db->first('SELECT * FROM trainers WHERE id = ?', [$created['lastInsertRowid']]);
            $row['specialties'] = V::parseJson($row['specialties_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['trainer' => $row]];
        }, write: true);
    }

    public function saveTrainer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM trainers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'trainer_not_found', 'Trainer not found.');
            }
            $name = array_key_exists('name', $input)
                ? V::text($input['name'], 'name', ['max' => 120, 'label' => 'Trainer name'])
                : (string) $cur['name'];
            $role = array_key_exists('role', $input)
                ? V::oneOf($input['role'], self::TRAINER_ROLES, 'role', ['fallback' => $cur['role']])
                : (string) $cur['role'];
            $specs = is_array($input['specialties'] ?? null)
                ? V::listOf($input['specialties'], 'specialties', 10, static fn ($v) => V::oneOf($v, self::TRAINER_SPECS, 'specialty'))
                : V::parseJson($cur['specialties_json'] ?? '', []);
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40])
                : (string) $cur['phone'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $active = array_key_exists('active', $input)
                ? V::oneOf($input['active'], ['Active', 'Inactive'], 'active', ['fallback' => $cur['active']])
                : (string) $cur['active'];

            $db->execute(
                'UPDATE trainers SET name = ?, role = ?, specialties_json = ?, phone = ?, email = ?, active = ? WHERE id = ?',
                [$name, $role, json_encode($specs, JSON_UNESCAPED_UNICODE), $phone, $em, $active, $id]
            );
            $row = $db->first('SELECT * FROM trainers WHERE id = ?', [$id]);
            $row['specialties'] = V::parseJson($row['specialties_json'] ?? '', []);
            return ['trainer' => $row];
        }, write: true);
    }

    public function deleteTrainer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM trainers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'trainer_not_found', 'Trainer not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM sessions WHERE trainer_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'trainer_has_sessions', 'This trainer has sessions on record. Set them Inactive instead.');
            }
            $db->execute('DELETE FROM trainers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Sessions ----

    public function listSessions(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $fromDay = V::day($input['from'] ?? null, 'from', ['required' => false, 'fallback' => '']);
            $trainerId = V::int($input['trainer_id'] ?? null, 'trainer_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT s.*, c.name AS client_name, c.goal AS client_goal, c.medical_notes AS client_medical_notes, '
                . 'tr.name AS trainer_name, tr.role AS trainer_role '
                . 'FROM sessions s '
                . 'LEFT JOIN clients c ON c.id = s.client_id '
                . 'LEFT JOIN trainers tr ON tr.id = s.trainer_id WHERE 1=1';
            $params = [];
            if ($fromDay !== '') {
                $sql .= ' AND s.session_date >= ?';
                $params[] = $fromDay;
            }
            if ($trainerId !== null) {
                $sql .= ' AND s.trainer_id = ?';
                $params[] = $trainerId;
            }
            $sql .= $fromDay !== ''
                ? ' ORDER BY s.session_date ASC, s.session_time ASC LIMIT 160'
                : ' ORDER BY s.session_date DESC, s.session_time ASC LIMIT 160';
            return ['sessions' => $db->query($sql, $params)];
        });
    }

    public function addSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $trainerId = V::rowId($input['trainer_id'] ?? null, 'trainer_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            if (!$db->first('SELECT id FROM trainers WHERE id = ?', [$trainerId])) {
                HttpException::fail(404, 'trainer_not_found', 'Trainer not found.');
            }
            $sDate = V::day($input['session_date'] ?? null, 'session_date', ['label' => 'Session date']);
            $sTime = V::timeStr($input['session_time'] ?? null, 'session_time', ['required' => false, 'fallback' => '08:00']);
            $sType = V::oneOf($input['session_type'] ?? null, self::SESSION_TYPES, 'session_type', ['fallback' => '1-on-1']);
            $status = V::oneOf($input['status'] ?? null, self::SESSION_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $feeCents = V::moneyCents($input['fee'] ?? null, 'fee', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => 0, 'label' => 'Session fee']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO sessions(client_id, trainer_id, session_date, session_time, session_type, status, fee_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $trainerId, $sDate, $sTime, $sType, $status, $feeCents, $notes, V::now()]
            );
            $row = $db->first(
                'SELECT s.*, c.name AS client_name, tr.name AS trainer_name FROM sessions s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN trainers tr ON tr.id = s.trainer_id WHERE s.id = ?',
                [$created['lastInsertRowid']]
            );
            return ['__status' => 201, '__body' => ['session' => $row]];
        }, write: true);
    }

    public function saveSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM sessions WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'session_not_found', 'Session not found.');
            }
            $clientId = array_key_exists('client_id', $input) ? V::rowId($input['client_id'], 'client_id') : (int) $cur['client_id'];
            $trainerId = array_key_exists('trainer_id', $input) ? V::rowId($input['trainer_id'], 'trainer_id') : (int) $cur['trainer_id'];
            $sDate = array_key_exists('session_date', $input) ? V::day($input['session_date'], 'session_date', ['label' => 'Session date']) : (string) $cur['session_date'];
            $sTime = array_key_exists('session_time', $input) ? V::timeStr($input['session_time'], 'session_time', ['fallback' => (string) $cur['session_time']]) : (string) $cur['session_time'];
            $sType = V::oneOf($input['session_type'] ?? null, self::SESSION_TYPES, 'session_type', ['fallback' => $cur['session_type']]);
            $status = V::oneOf($input['status'] ?? null, self::SESSION_STATUSES, 'status', ['fallback' => $cur['status']]);
            $feeCents = array_key_exists('fee', $input)
                ? V::moneyCents($input['fee'], 'fee', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => (int) $cur['fee_cents']])
                : (int) $cur['fee_cents'];
            $notes = array_key_exists('notes', $input) ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 600]) : (string) $cur['notes'];

            $db->execute(
                'UPDATE sessions SET client_id = ?, trainer_id = ?, session_date = ?, session_time = ?, session_type = ?, status = ?, fee_cents = ?, notes = ? WHERE id = ?',
                [$clientId, $trainerId, $sDate, $sTime, $sType, $status, $feeCents, $notes, $id]
            );
            return ['session' => $db->first('SELECT * FROM sessions WHERE id = ?', [$id])];
        }, write: true);
    }

    public function setSessionStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM sessions WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'session_not_found', 'Session not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::SESSION_STATUSES, 'status', ['label' => 'Status']);
            $db->execute('UPDATE sessions SET status = ? WHERE id = ?', [$status, $id]);
            return ['session' => $db->first('SELECT * FROM sessions WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM sessions WHERE id = ?', [$id])) {
                HttpException::fail(404, 'session_not_found', 'Session not found.');
            }
            $db->execute('DELETE FROM sessions WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Assessments ----

    public function listAssessments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT a.*, c.name AS client_name, c.goal AS client_goal FROM assessments a LEFT JOIN clients c ON c.id = a.client_id WHERE 1=1';
            $params = [];
            if ($clientId !== null) {
                $sql .= ' AND a.client_id = ?';
                $params[] = $clientId;
            }
            $sql .= ' ORDER BY a.assessment_date DESC, a.id DESC LIMIT 150';
            $rows = $db->query($sql, $params);

            // Attach delta vs chronologically previous check-in for the same client
            $byClient = [];
            for ($i = count($rows) - 1; $i >= 0; $i--) {
                $cid = (int) $rows[$i]['client_id'];
                $prev = $byClient[$cid] ?? null;
                $rows[$i]['weight_delta_kg'] = ($prev !== null && $prev['weight_kg'] !== null && $rows[$i]['weight_kg'] !== null)
                    ? self::round1((float) $rows[$i]['weight_kg'] - (float) $prev['weight_kg'])
                    : null;
                $rows[$i]['body_fat_delta_pct'] = ($prev !== null && $prev['body_fat_pct'] !== null && $rows[$i]['body_fat_pct'] !== null)
                    ? self::round1((float) $rows[$i]['body_fat_pct'] - (float) $prev['body_fat_pct'])
                    : null;
                $byClient[$cid] = $rows[$i];
            }
            return ['assessments' => $rows];
        });
    }

    public function addAssessment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $aDate = V::day($input['assessment_date'] ?? null, 'assessment_date', ['label' => 'Assessment date']);
            $weightKg = (array_key_exists('weight_kg', $input) && $input['weight_kg'] !== null && $input['weight_kg'] !== '')
                ? V::numVal($input['weight_kg'], 'weight_kg', ['min' => 20, 'max' => 350, 'label' => 'Weight (kg)'])
                : null;
            $bfPct = (array_key_exists('body_fat_pct', $input) && $input['body_fat_pct'] !== null && $input['body_fat_pct'] !== '')
                ? V::numVal($input['body_fat_pct'], 'body_fat_pct', ['min' => 2, 'max' => 70, 'label' => 'Body fat (%)'])
                : null;
            $mobility = V::int($input['mobility_score'] ?? null, 'mobility_score', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => 3, 'label' => 'Mobility score']) ?? 3;
            $strengthNotes = V::text($input['strength_notes'] ?? null, 'strength_notes', ['required' => false, 'max' => 1000]);
            $coachNotes = V::text($input['coach_notes'] ?? null, 'coach_notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO assessments(client_id, assessment_date, weight_kg, body_fat_pct, mobility_score, strength_notes, coach_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $aDate, $weightKg, $bfPct, $mobility, $strengthNotes, $coachNotes, V::now()]
            );
            $row = $db->first(
                'SELECT a.*, c.name AS client_name FROM assessments a LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = ?',
                [$created['lastInsertRowid']]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'assessment' => $row,
                    'progress' => self::computeClientProgressDelta($db, $clientId),
                ],
            ];
        }, write: true);
    }

    public function deleteAssessment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM assessments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'assessment_not_found', 'Assessment not found.');
            }
            $db->execute('DELETE FROM assessments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Training Programs ----

    public function listPrograms(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT p.*, c.name AS client_name, c.goal AS client_goal FROM programs p LEFT JOIN clients c ON c.id = p.client_id WHERE 1=1';
            $params = [];
            if ($clientId !== null) {
                $sql .= ' AND p.client_id = ?';
                $params[] = $clientId;
            }
            $sql .= " ORDER BY CASE p.status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 ELSE 2 END, p.created_at DESC";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['blocks'] = V::parseJson($r['blocks_json'] ?? '', []);
            }
            unset($r);
            return ['programs' => $rows];
        });
    }

    public function addProgram(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $name = V::text($input['program_name'] ?? null, 'program_name', ['max' => 140, 'label' => 'Program name']);
            $goal = V::oneOf($input['goal'] ?? null, self::FITNESS_GOALS, 'goal', ['fallback' => 'Strength']);
            $startDate = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => '']);
            $endDate = V::day($input['end_date'] ?? null, 'end_date', ['required' => false, 'fallback' => '']);
            $status = V::oneOf($input['status'] ?? null, self::PROGRAM_STATUSES, 'status', ['fallback' => 'Active']);
            $blocks = self::cleanWorkoutBlocks($input['blocks'] ?? []);
            $notes = V::text($input['program_notes'] ?? null, 'program_notes', ['required' => false, 'max' => 1500]);

            $created = $db->execute(
                'INSERT INTO programs(client_id, program_name, goal, start_date, end_date, status, blocks_json, program_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $name, $goal, $startDate, $endDate, $status, json_encode($blocks, JSON_UNESCAPED_UNICODE), $notes, V::now()]
            );
            $row = $db->first(
                'SELECT p.*, c.name AS client_name FROM programs p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?',
                [$created['lastInsertRowid']]
            );
            $row['blocks'] = V::parseJson($row['blocks_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['program' => $row]];
        }, write: true);
    }

    public function saveProgram(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM programs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'program_not_found', 'Training program not found.');
            }
            $clientId = array_key_exists('client_id', $input) ? V::rowId($input['client_id'], 'client_id') : (int) $cur['client_id'];
            $name = array_key_exists('program_name', $input)
                ? V::text($input['program_name'], 'program_name', ['max' => 140, 'label' => 'Program name'])
                : (string) $cur['program_name'];
            $goal = V::oneOf($input['goal'] ?? null, self::FITNESS_GOALS, 'goal', ['fallback' => $cur['goal']]);
            $startDate = array_key_exists('start_date', $input)
                ? V::day($input['start_date'], 'start_date', ['required' => false, 'fallback' => ''])
                : (string) $cur['start_date'];
            $endDate = array_key_exists('end_date', $input)
                ? V::day($input['end_date'], 'end_date', ['required' => false, 'fallback' => ''])
                : (string) $cur['end_date'];
            $status = V::oneOf($input['status'] ?? null, self::PROGRAM_STATUSES, 'status', ['fallback' => $cur['status']]);
            $blocks = is_array($input['blocks'] ?? null)
                ? self::cleanWorkoutBlocks($input['blocks'])
                : V::parseJson($cur['blocks_json'] ?? '', []);
            $notes = array_key_exists('program_notes', $input)
                ? V::text($input['program_notes'], 'program_notes', ['required' => false, 'max' => 1500])
                : (string) $cur['program_notes'];

            $db->execute(
                'UPDATE programs SET client_id = ?, program_name = ?, goal = ?, start_date = ?, end_date = ?, status = ?, blocks_json = ?, program_notes = ? WHERE id = ?',
                [$clientId, $name, $goal, $startDate, $endDate, $status, json_encode($blocks, JSON_UNESCAPED_UNICODE), $notes, $id]
            );
            $row = $db->first(
                'SELECT p.*, c.name AS client_name FROM programs p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?',
                [$id]
            );
            $row['blocks'] = V::parseJson($row['blocks_json'] ?? '', []);
            return ['program' => $row];
        }, write: true);
    }

    public function deleteProgram(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM programs WHERE id = ?', [$id])) {
                HttpException::fail(404, 'program_not_found', 'Training program not found.');
            }
            $db->execute('DELETE FROM programs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Payments & Packs Ledger ----

    public function listPayments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $monthPrefix = substr($todayDay, 0, 7);
            $rows = $db->query(
                'SELECT py.*, c.name AS client_name, c.email AS client_email FROM payments py LEFT JOIN clients c ON c.id = py.client_id ORDER BY py.payment_date DESC, py.id DESC LIMIT 200'
            );

            $paidMonth = 0;
            $paidTotal = 0;
            $pendingTotal = 0;
            $failedCount = 0;
            foreach ($rows as $r) {
                $amt = (int) $r['amount_cents'];
                if ($r['status'] === 'Paid') {
                    $paidTotal += $amt;
                    if (substr((string) ($r['payment_date'] ?? ''), 0, 7) === $monthPrefix) {
                        $paidMonth += $amt;
                    }
                } elseif ($r['status'] === 'Pending') {
                    $pendingTotal += $amt;
                } elseif ($r['status'] === 'Failed') {
                    $failedCount++;
                }
            }

            return [
                'payments' => $rows,
                'summary' => [
                    'month' => $monthPrefix,
                    'paidMonthCents' => $paidMonth,
                    'paidTotalCents' => $paidTotal,
                    'pendingTotalCents' => $pendingTotal,
                    'failedCount' => $failedCount,
                ],
            ];
        });
    }

    public function addPayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $amountCents = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 50000000, 'label' => 'Amount']);
            $pType = V::oneOf($input['payment_type'] ?? null, self::PAYMENT_TYPES, 'payment_type', ['fallback' => 'Session pack']);
            $pDate = V::day($input['payment_date'] ?? null, 'payment_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::oneOf($input['status'] ?? null, self::PAYMENT_STATUSES, 'status', ['fallback' => 'Paid']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                'INSERT INTO payments(client_id, amount_cents, payment_type, payment_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $amountCents, $pType, $pDate, $status, $notes, V::now()]
            );
            $row = $db->first(
                'SELECT py.*, c.name AS client_name FROM payments py LEFT JOIN clients c ON c.id = py.client_id WHERE py.id = ?',
                [$created['lastInsertRowid']]
            );
            return ['__status' => 201, '__body' => ['payment' => $row]];
        }, write: true);
    }

    public function setPaymentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM payments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'payment_not_found', 'Payment record not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PAYMENT_STATUSES, 'status', ['label' => 'Status']);
            $db->execute('UPDATE payments SET status = ? WHERE id = ?', [$status, $id]);
            return ['payment' => $db->first('SELECT * FROM payments WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deletePayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM payments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'payment_not_found', 'Payment record not found.');
            }
            $db->execute('DELETE FROM payments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
