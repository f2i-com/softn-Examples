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

final class OpsController
{
    private const CLIENT_TYPES = ['Residential', 'Commercial', 'Airbnb', 'Office'];
    private const BILLING_STATUSES = ['Up to date', 'Pending', 'Overdue'];
    private const SERVICE_AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];
    private const TEAM_ACTIVE = ['Active', 'Inactive'];
    private const JOB_TYPES = ['Regular clean', 'Deep clean', 'End-of-lease', 'Office', 'Airbnb turnover'];
    private const JOB_STATUSES = ['Scheduled', 'En Route', 'Cleaning', 'Inspected', 'Complete', 'Cancelled', 'Issue'];
    private const JOB_PIPELINE = ['Scheduled', 'En Route', 'Cleaning', 'Inspected', 'Complete'];
    private const QC_ITEMS = ['Kitchen', 'Bathrooms', 'Floors', 'Windows and glass', 'Dusting', 'Bins and consumables'];
    private const YES_NO = ['Yes', 'No'];
    private const SUPPLY_CATS = ['Chemicals', 'Cloths and pads', 'Equipment', 'Consumables'];
    private const SUPPLY_UNITS = ['bottles', 'packs', 'units', 'boxes'];
    private const ISSUE_TYPES = ['Complaint', 'Damage', 'Access issue', 'Missed item', 'Payment issue'];
    private const SEVERITIES = ['Low', 'Medium', 'High'];
    private const ISSUE_STATUSES = ['Open', 'Investigating', 'Resolved'];

    private static function supplyStatus(float $stock, float $reorder): string
    {
        if ($stock <= 0.0) {
            return 'Out';
        }
        if ($stock <= $reorder) {
            return 'Low';
        }
        return 'OK';
    }

    private static function hydrateJob(Database $db, int $id): ?array
    {
        return $db->first(
            'SELECT j.*, c.client_name, c.client_type, c.address AS client_address, c.access_instructions, c.phone AS client_phone, c.billing_status, t.team_name, t.lead_cleaner, t.vehicle, (SELECT MAX(q.rating) FROM quality_checks q WHERE q.job_id = j.id) AS qc_rating, (SELECT COUNT(*) FROM quality_checks q WHERE q.job_id = j.id) AS qc_count FROM cleaning_jobs j LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN cleaning_teams t ON t.id = j.team_id WHERE j.id = ?',
            [$id]
        );
    }

    private static function hydrateIssue(Database $db, int $id): ?array
    {
        return $db->first(
            'SELECT i.*, c.client_name, c.phone AS client_phone, j.scheduled_date, j.job_type FROM client_issues i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN cleaning_jobs j ON j.id = i.job_id WHERE i.id = ?',
            [$id]
        );
    }

    // ---- Clients ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $ctype = V::text($input['client_type'] ?? null, 'client_type', ['required' => false, 'max' => 40]);
            $billing = V::text($input['billing_status'] ?? null, 'billing_status', ['required' => false, 'max' => 40]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 120]);

            $sql = "SELECT c.*, (SELECT COUNT(*) FROM cleaning_jobs j WHERE j.client_id = c.id AND j.status != 'Cancelled') AS job_count FROM clients c WHERE 1=1";
            $params = [];
            if ($ctype !== '' && $ctype !== 'All') {
                $sql .= ' AND c.client_type = ?';
                $params[] = $ctype;
            }
            if ($billing !== '' && $billing !== 'All') {
                $sql .= ' AND c.billing_status = ?';
                $params[] = $billing;
            }
            if ($q !== '') {
                $like = V::likeTerm($q);
                $sql .= " AND (c.client_name LIKE ? ESCAPE '\\' OR c.address LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')";
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }
            $sql .= " ORDER BY CASE c.billing_status WHEN 'Overdue' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END, c.client_name ASC";

            return ['clients' => $db->query($sql, $params)];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['client_name'] ?? null, 'client_name', ['max' => 120, 'label' => 'Client name']);
            $ctype = V::oneOf($input['client_type'] ?? null, self::CLIENT_TYPES, 'client_type', ['fallback' => 'Residential']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1000, 'label' => 'Access instructions']);
            $billing = V::oneOf($input['billing_status'] ?? null, self::BILLING_STATUSES, 'billing_status', ['fallback' => 'Up to date']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO clients(client_name, client_type, email, phone, address, access_instructions, billing_status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $ctype, $em, $phone, $address, $access, $billing, $notes, V::now()]
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
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $name = V::text($input['client_name'] ?? null, 'client_name', ['max' => 120, 'label' => 'Client name']);
            $ctype = V::oneOf($input['client_type'] ?? null, self::CLIENT_TYPES, 'client_type', ['fallback' => $cur['client_type']]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1000, 'label' => 'Access instructions']);
            $billing = V::oneOf($input['billing_status'] ?? null, self::BILLING_STATUSES, 'billing_status', ['fallback' => $cur['billing_status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE clients SET client_name = ?, client_type = ?, email = ?, phone = ?, address = ?, access_instructions = ?, billing_status = ?, notes = ? WHERE id = ?',
                [$name, $ctype, $em, $phone, $address, $access, $billing, $notes, $id]
            );

            return ['client' => $db->first('SELECT * FROM clients WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM cleaning_jobs WHERE client_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'client_has_jobs', 'Cannot delete a client with scheduled cleaning jobs.');
            }
            $db->execute('DELETE FROM client_issues WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Cleaning Teams ----

    public function listTeams(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $refDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query(
                "SELECT t.*, (SELECT COUNT(*) FROM cleaning_jobs j WHERE j.team_id = t.id AND j.scheduled_date = ? AND j.status != 'Cancelled') AS today_jobs, (SELECT COALESCE(SUM(j.duration_hours), 0) FROM cleaning_jobs j WHERE j.team_id = t.id AND j.scheduled_date = ? AND j.status != 'Cancelled') AS today_hours FROM cleaning_teams t ORDER BY CASE t.active WHEN 'Active' THEN 0 ELSE 1 END, t.team_name ASC",
                [$refDay, $refDay]
            );
            foreach ($rows as &$r) {
                $r['service_areas'] = V::parseJson($r['service_areas_json'] ?? '', []);
            }
            unset($r);
            return ['teams' => $rows];
        });
    }

    public function addTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['team_name'] ?? null, 'team_name', ['max' => 100, 'label' => 'Team name']);
            $lead = V::text($input['lead_cleaner'] ?? null, 'lead_cleaner', ['required' => false, 'max' => 100]);
            $members = V::text($input['members'] ?? null, 'members', ['required' => false, 'max' => 500]);
            $vehicle = V::text($input['vehicle'] ?? null, 'vehicle', ['required' => false, 'max' => 80]);
            $areas = V::listOf(
                $input['service_areas'] ?? null,
                'service_areas',
                10,
                fn ($a) => V::oneOf($a, self::SERVICE_AREAS, 'service_area')
            );
            $active = V::oneOf($input['active'] ?? null, self::TEAM_ACTIVE, 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO cleaning_teams(team_name, lead_cleaner, members, vehicle, service_areas_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $lead, $members, $vehicle, json_encode($areas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $active, V::now()]
            );

            $row = $db->first('SELECT * FROM cleaning_teams WHERE id = ?', [$created['lastInsertRowid']]);
            $row['service_areas'] = V::parseJson($row['service_areas_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['team' => $row]];
        }, write: true);
    }

    public function saveTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaning_teams WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaning team not found.');
            }
            $name = V::text($input['team_name'] ?? null, 'team_name', ['max' => 100, 'label' => 'Team name']);
            $lead = V::text($input['lead_cleaner'] ?? null, 'lead_cleaner', ['required' => false, 'max' => 100]);
            $members = V::text($input['members'] ?? null, 'members', ['required' => false, 'max' => 500]);
            $vehicle = V::text($input['vehicle'] ?? null, 'vehicle', ['required' => false, 'max' => 80]);
            $areas = is_array($input['service_areas'] ?? null)
                ? V::listOf($input['service_areas'], 'service_areas', 10, fn ($a) => V::oneOf($a, self::SERVICE_AREAS, 'service_area'))
                : V::parseJson($cur['service_areas_json'] ?? '', []);
            $active = V::oneOf($input['active'] ?? null, self::TEAM_ACTIVE, 'active', ['fallback' => $cur['active']]);

            $db->execute(
                'UPDATE cleaning_teams SET team_name = ?, lead_cleaner = ?, members = ?, vehicle = ?, service_areas_json = ?, active = ? WHERE id = ?',
                [$name, $lead, $members, $vehicle, json_encode($areas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $active, $id]
            );

            $row = $db->first('SELECT * FROM cleaning_teams WHERE id = ?', [$id]);
            $row['service_areas'] = V::parseJson($row['service_areas_json'] ?? '', []);
            return ['team' => $row];
        }, write: true);
    }

    public function deleteTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM cleaning_teams WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaning team not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM cleaning_jobs WHERE team_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'team_has_jobs', 'Reassign jobs before removing this cleaning team.');
            }
            $db->execute('DELETE FROM cleaning_teams WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Crew Dispatch Jobs ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $schedDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $teamId = V::int($input['team_id'] ?? null, 'team_id', ['required' => false, 'min' => 1]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);

            $sql = 'SELECT j.*, c.client_name, c.client_type, c.address AS client_address, c.access_instructions, c.phone AS client_phone, c.billing_status, t.team_name, t.lead_cleaner, t.vehicle, (SELECT MAX(q.rating) FROM quality_checks q WHERE q.job_id = j.id) AS qc_rating, (SELECT COUNT(*) FROM quality_checks q WHERE q.job_id = j.id) AS qc_count FROM cleaning_jobs j LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN cleaning_teams t ON t.id = j.team_id WHERE 1=1';
            $params = [];
            if ($schedDay !== '') {
                $sql .= ' AND j.scheduled_date = ?';
                $params[] = $schedDay;
            }
            if ($teamId !== null) {
                $sql .= ' AND j.team_id = ?';
                $params[] = $teamId;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND j.status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY j.scheduled_date ASC, j.start_time ASC, j.id ASC LIMIT 160';

            return ['jobs' => $db->query($sql, $params)];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $teamId = V::rowId($input['team_id'] ?? null, 'team_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            if (!$db->first('SELECT id FROM cleaning_teams WHERE id = ?', [$teamId])) {
                HttpException::fail(404, 'team_not_found', 'Selected cleaning team not found.');
            }

            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => 'Regular clean']);
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['label' => 'Scheduled date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['required' => false, 'fallback' => '09:00', 'label' => 'Start time']);
            $duration = V::numVal($input['duration_hours'] ?? null, 'duration_hours', ['required' => false, 'min' => 0.5, 'max' => 24, 'fallback' => 2, 'label' => 'Duration']);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $priceCents = V::moneyCents($input['price'] ?? null, 'price', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 0, 'label' => 'Price']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO cleaning_jobs(client_id, team_id, job_type, scheduled_date, start_time, duration_hours, status, price_cents, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$clientId, $teamId, $jobType, $schedDate, $startTime, $duration, $status, $priceCents, $notes, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => [
                    'job' => self::hydrateJob($db, $created['lastInsertRowid']),
                    'counts' => WorkspaceController::readCounts($db, $schedDate),
                ],
            ];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaning_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaning job not found.');
            }
            $clientId = V::rowId(!empty($input['client_id']) ? $input['client_id'] : $cur['client_id'], 'client_id');
            $teamId = V::rowId(!empty($input['team_id']) ? $input['team_id'] : $cur['team_id'], 'team_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            if (!$db->first('SELECT id FROM cleaning_teams WHERE id = ?', [$teamId])) {
                HttpException::fail(404, 'team_not_found', 'Selected cleaning team not found.');
            }

            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => $cur['job_type']]);
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'fallback' => (string) $cur['scheduled_date'], 'label' => 'Scheduled date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['required' => false, 'fallback' => (string) $cur['start_time'], 'label' => 'Start time']);
            $duration = V::numVal($input['duration_hours'] ?? null, 'duration_hours', ['required' => false, 'min' => 0.5, 'max' => 24, 'fallback' => $cur['duration_hours']]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => $cur['status']]);
            $priceCents = (array_key_exists('price', $input) && $input['price'] !== '' && $input['price'] !== null)
                ? V::moneyCents($input['price'], 'price', ['min' => 0, 'max' => 10000000, 'label' => 'Price'])
                : (int) $cur['price_cents'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE cleaning_jobs SET client_id = ?, team_id = ?, job_type = ?, scheduled_date = ?, start_time = ?, duration_hours = ?, status = ?, price_cents = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$clientId, $teamId, $jobType, $schedDate, $startTime, $duration, $status, $priceCents, $notes, V::now(), $id]
            );

            return [
                'job' => self::hydrateJob($db, $id),
                'counts' => WorkspaceController::readCounts($db, $schedDate),
            ];
        }, write: true);
    }

    public function advanceJobStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaning_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaning job not found.');
            }
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::JOB_STATUSES, 'status');
            } else {
                $idx = array_search((string) $cur['status'], self::JOB_PIPELINE, true);
                $nextStatus = ($idx !== false && $idx < count(self::JOB_PIPELINE) - 1)
                    ? self::JOB_PIPELINE[$idx + 1]
                    : 'Complete';
            }

            $db->execute('UPDATE cleaning_jobs SET status = ?, updated_at = ? WHERE id = ?', [$nextStatus, V::now(), $id]);
            return [
                'job' => self::hydrateJob($db, $id),
                'counts' => WorkspaceController::readCounts($db, (string) $cur['scheduled_date']),
            ];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM cleaning_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaning job not found.');
            }
            $db->execute('DELETE FROM quality_checks WHERE job_id = ?', [$id]);
            $db->execute('UPDATE client_issues SET job_id = NULL WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM cleaning_jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Quality Checks ----

    public function listQualityChecks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                'SELECT q.*, j.scheduled_date, j.start_time, j.job_type, j.status AS job_status, c.client_name, t.team_name FROM quality_checks q LEFT JOIN cleaning_jobs j ON j.id = q.job_id LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN cleaning_teams t ON t.id = j.team_id ORDER BY q.created_at DESC LIMIT 100'
            );
            foreach ($rows as &$r) {
                $r['checklist'] = V::parseJson($r['checklist_json'] ?? '', []);
            }
            unset($r);
            return ['checks' => $rows];
        });
    }

    public function addQualityCheck(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM cleaning_jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Cleaning job not found.');
            }

            $checklist = V::listOf(
                $input['checklist'] ?? null,
                'checklist',
                12,
                fn ($v) => V::oneOf($v, self::QC_ITEMS, 'checklist_item')
            );
            $rating = V::int($input['rating'] ?? null, 'rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => 5, 'label' => 'Star rating']) ?? 5;
            $issues = V::text($input['issues_found'] ?? null, 'issues_found', ['required' => false, 'max' => 1000]);
            $followUp = V::oneOf($input['follow_up'] ?? null, self::YES_NO, 'follow_up', ['fallback' => $rating <= 3 ? 'Yes' : 'No']);
            $checkedBy = V::text($input['checked_by'] ?? null, 'checked_by', ['required' => false, 'max' => 80]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO quality_checks(job_id, checklist_json, rating, issues_found, follow_up, checked_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, json_encode($checklist, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $rating, $issues, $followUp, $checkedBy, $ts]
            );

            // Auto-advance a Cleaning/En Route job to Inspected (or Complete if requested)
            if ($job['status'] === 'Cleaning' || $job['status'] === 'En Route') {
                $targetStatus = V::bool($input['mark_complete'] ?? false) ? 'Complete' : 'Inspected';
                $db->execute('UPDATE cleaning_jobs SET status = ?, updated_at = ? WHERE id = ?', [$targetStatus, $ts, $jobId]);
            } elseif (V::bool($input['mark_complete'] ?? false) && $job['status'] === 'Inspected') {
                $db->execute("UPDATE cleaning_jobs SET status = 'Complete', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            }

            $row = $db->first(
                'SELECT q.*, j.scheduled_date, j.start_time, j.job_type, j.status AS job_status, c.client_name, t.team_name FROM quality_checks q LEFT JOIN cleaning_jobs j ON j.id = q.job_id LEFT JOIN clients c ON c.id = j.client_id LEFT JOIN cleaning_teams t ON t.id = j.team_id WHERE q.id = ?',
                [$created['lastInsertRowid']]
            );
            $row['checklist'] = V::parseJson($row['checklist_json'] ?? '', []);

            return [
                '__status' => 201,
                '__body' => ['check' => $row, 'job' => self::hydrateJob($db, $jobId)],
            ];
        }, write: true);
    }

    public function deleteQualityCheck(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM quality_checks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Quality check not found.');
            }
            $db->execute('DELETE FROM quality_checks WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Cleaning Supplies Par Stock ----

    public function listSupplies(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM cleaning_supplies ORDER BY CASE status WHEN 'Out' THEN 0 WHEN 'Low' THEN 1 ELSE 2 END, category ASC, supply_item ASC"
            );
            return ['supplies' => $rows];
        });
    }

    public function addSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['supply_item'] ?? null, 'supply_item', ['max' => 120, 'label' => 'Supply item']);
            $cat = V::oneOf($input['category'] ?? null, self::SUPPLY_CATS, 'category', ['fallback' => 'Chemicals']);
            $stock = V::numVal($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => 0]);
            $reorder = V::numVal($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0.5, 'max' => 100000, 'fallback' => 5]);
            $unit = V::oneOf($input['unit'] ?? null, self::SUPPLY_UNITS, 'unit', ['fallback' => 'bottles']);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $st = self::supplyStatus($stock, $reorder);

            $created = $db->execute(
                'INSERT INTO cleaning_supplies(supply_item, category, current_stock, reorder_point, unit, supplier, status, is_sample, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $stock, $reorder, $unit, $supplier, $st, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['supply' => $db->first('SELECT * FROM cleaning_supplies WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaning_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            $name = V::text($input['supply_item'] ?? null, 'supply_item', ['max' => 120, 'label' => 'Supply item']);
            $cat = V::oneOf($input['category'] ?? null, self::SUPPLY_CATS, 'category', ['fallback' => $cur['category']]);
            $stock = V::numVal($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $cur['current_stock']]);
            $reorder = V::numVal($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0.5, 'max' => 100000, 'fallback' => $cur['reorder_point']]);
            $unit = V::oneOf($input['unit'] ?? null, self::SUPPLY_UNITS, 'unit', ['fallback' => $cur['unit']]);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $st = self::supplyStatus($stock, $reorder);

            $db->execute(
                'UPDATE cleaning_supplies SET supply_item = ?, category = ?, current_stock = ?, reorder_point = ?, unit = ?, supplier = ?, status = ?, updated_at = ? WHERE id = ?',
                [$name, $cat, $stock, $reorder, $unit, $supplier, $st, V::now(), $id]
            );

            return ['supply' => $db->first('SELECT * FROM cleaning_supplies WHERE id = ?', [$id])];
        }, write: true);
    }

    public function adjustSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaning_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            if (V::bool($input['restockToPar'] ?? false)) {
                $nextQty = max((float) $cur['current_stock'], ceil((float) $cur['reorder_point'] * 1.5));
            } else {
                $delta = V::numVal($input['delta'] ?? null, 'delta', ['min' => -10000, 'max' => 10000]);
                $nextQty = max(0.0, round(((float) $cur['current_stock'] + $delta) * 100.0) / 100.0);
            }
            $st = self::supplyStatus($nextQty, (float) $cur['reorder_point']);

            $db->execute(
                'UPDATE cleaning_supplies SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?',
                [$nextQty, $st, V::now(), $id]
            );

            return ['supply' => $db->first('SELECT * FROM cleaning_supplies WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM cleaning_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            $db->execute('DELETE FROM cleaning_supplies WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Client Issues Desk ----

    public function listIssues(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT i.*, c.client_name, c.phone AS client_phone, j.scheduled_date, j.job_type FROM client_issues i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN cleaning_jobs j ON j.id = i.job_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND i.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE i.status WHEN 'Open' THEN 0 WHEN 'Investigating' THEN 1 ELSE 2 END, CASE i.severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 120";
            return ['issues' => $db->query($sql, $params)];
        });
    }

    public function addIssue(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            $jobId = V::int($input['job_id'] ?? null, 'job_id', ['required' => false, 'min' => 1]);
            if ($jobId !== null && !$db->first('SELECT id FROM cleaning_jobs WHERE id = ?', [$jobId])) {
                HttpException::fail(404, 'job_not_found', 'Selected job not found.');
            }
            $itype = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => 'Missed item']);
            $severity = V::oneOf($input['severity'] ?? null, self::SEVERITIES, 'severity', ['fallback' => 'Medium']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $resNote = V::text($input['resolution'] ?? null, 'resolution', ['required' => false, 'max' => 1200]);
            $status = V::oneOf($input['status'] ?? null, self::ISSUE_STATUSES, 'status', ['fallback' => 'Open']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO client_issues(client_id, job_id, issue_type, severity, description, resolution, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$clientId, $jobId, $itype, $severity, $desc, $resNote, $status, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => ['issue' => self::hydrateIssue($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function saveIssue(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM client_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client issue not found.');
            }
            $itype = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => $cur['issue_type']]);
            $severity = V::oneOf($input['severity'] ?? null, self::SEVERITIES, 'severity', ['fallback' => $cur['severity']]);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $resNote = V::text($input['resolution'] ?? null, 'resolution', ['required' => false, 'max' => 1200]);
            $status = V::oneOf($input['status'] ?? null, self::ISSUE_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE client_issues SET issue_type = ?, severity = ?, description = ?, resolution = ?, status = ?, updated_at = ? WHERE id = ?',
                [$itype, $severity, $desc, $resNote, $status, V::now(), $id]
            );

            return ['issue' => self::hydrateIssue($db, $id)];
        }, write: true);
    }

    public function setIssueStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM client_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client issue not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ISSUE_STATUSES, 'status');
            $resNote = (array_key_exists('resolution', $input) && $input['resolution'] !== null)
                ? V::text($input['resolution'], 'resolution', ['required' => false, 'max' => 1200])
                : (string) $cur['resolution'];

            $db->execute(
                'UPDATE client_issues SET status = ?, resolution = ?, updated_at = ? WHERE id = ?',
                [$status, $resNote, V::now(), $id]
            );

            return ['issue' => self::hydrateIssue($db, $id)];
        }, write: true);
    }

    public function deleteIssue(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM client_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client issue not found.');
            }
            $db->execute('DELETE FROM client_issues WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
