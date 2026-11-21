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
    private const PKG_CATS = ['Breakfast', 'Lunch', 'Dinner', 'Grazing', 'Drinks'];
    private const PKG_STATUSES = ['Active', 'Seasonal', 'Retired'];
    private const SERVICE_TYPES = ['Drop-off', 'Staffed buffet', 'Plated', 'Grazing table'];
    private const JOB_STATUSES = ['Enquiry', 'Quoted', 'Confirmed', 'In Prep', 'Dispatched', 'Completed'];
    private const PROD_STATIONS = ['Hot Kitchen', 'Cold Larder', 'Pastry', 'Packing'];
    private const PROD_STATUSES = ['Not started', 'In progress', 'Done', 'Blocked'];
    private const RUN_STATUSES = ['Scheduled', 'Loaded', 'En Route', 'Delivered', 'Issue'];
    private const DIET_TYPES = ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal', 'Kosher', 'Other'];
    private const DIET_CONFIRMED = ['Confirmed', 'Pending'];

    // ---- Clients Directory ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $clients = $db->query('SELECT * FROM clients ORDER BY client_name ASC');
            $stats = $db->query(
                'SELECT client_id, COUNT(*) AS jobs, COALESCE(SUM(estimated_value_cents), 0) AS total_cents FROM catering_jobs WHERE client_id IS NOT NULL GROUP BY client_id'
            );
            $byId = [];
            foreach ($stats as $st) {
                $byId[(int) $st['client_id']] = $st;
            }
            foreach ($clients as &$client) {
                $st = $byId[(int) $client['id']] ?? null;
                $client['jobs_count'] = $st ? (int) $st['jobs'] : 0;
                $client['lifetime_cents'] = $st ? (int) $st['total_cents'] : 0;
            }
            unset($client);
            return ['clients' => $clients];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['client_name'] ?? null, 'client_name', ['max' => 120, 'label' => 'Client name']);
            $org = V::text($input['organisation'] ?? null, 'organisation', ['required' => false, 'max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $addr = V::text($input['billing_address'] ?? null, 'billing_address', ['required' => false, 'max' => 240]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $created = $db->execute(
                'INSERT INTO clients(client_name, organisation, email, phone, billing_address, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $org, $em, $phone, $addr, $notes, V::now()]
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
            $org = V::text($input['organisation'] ?? null, 'organisation', ['required' => false, 'max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $addr = V::text($input['billing_address'] ?? null, 'billing_address', ['required' => false, 'max' => 240]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $db->execute(
                'UPDATE clients SET client_name = ?, organisation = ?, email = ?, phone = ?, billing_address = ?, notes = ? WHERE id = ?',
                [$name, $org, $em, $phone, $addr, $notes, $id]
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
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Menu Packages Catalogue ----

    public function listPackages(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM menu_packages ORDER BY CASE active_status WHEN 'Active' THEN 0 WHEN 'Seasonal' THEN 1 ELSE 2 END, category ASC, package_name ASC"
            );
            foreach ($rows as &$r) {
                $r['dietary_support'] = V::parseJson($r['dietary_support_json'] ?? '', []);
            }
            unset($r);
            return ['packages' => $rows];
        });
    }

    public function addPackage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['package_name'] ?? null, 'package_name', ['max' => 140, 'label' => 'Package name']);
            $cat = V::oneOf($input['category'] ?? null, self::PKG_CATS, 'category', ['fallback' => 'Lunch']);
            $ppp = V::moneyCents($input['price_per_person'] ?? null, 'price_per_person', ['min' => 0, 'max' => 500000, 'label' => 'Price per person']);
            $minGuests = V::int($input['min_guests'] ?? null, 'min_guests', ['required' => false, 'min' => 1, 'max' => 2000, 'fallback' => 10]) ?? 10;
            $diets = V::listOf($input['dietary_support'] ?? null, 'dietary_support', 10, fn ($v) => V::text($v, 'diet', ['max' => 40]));
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 800]);
            $active = V::oneOf($input['active_status'] ?? null, self::PKG_STATUSES, 'active_status', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO menu_packages(package_name, category, price_per_person_cents, min_guests, dietary_support_json, description, active_status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $ppp, $minGuests, json_encode($diets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $desc, $active, V::now()]
            );

            $row = $db->first('SELECT * FROM menu_packages WHERE id = ?', [$created['lastInsertRowid']]);
            $row['dietary_support'] = V::parseJson($row['dietary_support_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['pkg' => $row]];
        }, write: true);
    }

    public function savePackage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM menu_packages WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Menu package not found.');
            }
            $name = V::text($input['package_name'] ?? null, 'package_name', ['max' => 140, 'label' => 'Package name']);
            $cat = V::oneOf($input['category'] ?? null, self::PKG_CATS, 'category', ['fallback' => $cur['category']]);
            $ppp = V::moneyCents($input['price_per_person'] ?? null, 'price_per_person', ['min' => 0, 'max' => 500000, 'label' => 'Price per person']);
            $minGuests = V::int($input['min_guests'] ?? null, 'min_guests', ['required' => false, 'min' => 1, 'max' => 2000, 'fallback' => (int) $cur['min_guests']]) ?? (int) $cur['min_guests'];
            $diets = is_array($input['dietary_support'] ?? null)
                ? V::listOf($input['dietary_support'], 'dietary_support', 10, fn ($v) => V::text($v, 'diet', ['max' => 40]))
                : V::parseJson($cur['dietary_support_json'] ?? '', []);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 800]);
            $active = V::oneOf($input['active_status'] ?? null, self::PKG_STATUSES, 'active_status', ['fallback' => $cur['active_status']]);

            $db->execute(
                'UPDATE menu_packages SET package_name = ?, category = ?, price_per_person_cents = ?, min_guests = ?, dietary_support_json = ?, description = ?, active_status = ? WHERE id = ?',
                [$name, $cat, $ppp, $minGuests, json_encode($diets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $desc, $active, $id]
            );

            $row = $db->first('SELECT * FROM menu_packages WHERE id = ?', [$id]);
            $row['dietary_support'] = V::parseJson($row['dietary_support_json'] ?? '', []);
            return ['pkg' => $row];
        }, write: true);
    }

    public function deletePackage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM menu_packages WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Menu package not found.');
            }
            $db->execute('DELETE FROM menu_packages WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Event Pipeline Jobs (auto-calculates quote = guest_count * package.price_per_person) ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $jobs = $db->query('SELECT * FROM catering_jobs ORDER BY event_date ASC, delivery_time ASC');
            $dietCounts = $db->query(
                "SELECT job_id, SUM(guest_count) AS diet_guests, SUM(CASE WHEN kitchen_confirmed != 'Confirmed' THEN 1 ELSE 0 END) AS unconfirmed FROM dietary_requirements WHERE job_id IS NOT NULL GROUP BY job_id"
            );
            $taskCounts = $db->query(
                "SELECT job_id, COUNT(*) AS total, SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS done FROM production_tasks WHERE job_id IS NOT NULL GROUP BY job_id"
            );

            $dMap = [];
            foreach ($dietCounts as $dc) {
                $dMap[(int) $dc['job_id']] = $dc;
            }
            $tMap = [];
            foreach ($taskCounts as $tc) {
                $tMap[(int) $tc['job_id']] = $tc;
            }

            foreach ($jobs as &$job) {
                $jid = (int) $job['id'];
                $dm = $dMap[$jid] ?? null;
                $tm = $tMap[$jid] ?? null;
                $job['diet_guests'] = $dm ? (int) $dm['diet_guests'] : 0;
                $job['diet_unconfirmed'] = $dm ? (int) $dm['unconfirmed'] : 0;
                $job['tasks_total'] = $tm ? (int) $tm['total'] : 0;
                $job['tasks_done'] = $tm ? (int) $tm['done'] : 0;
            }
            unset($job);
            return ['jobs' => $jobs];
        });
    }

    public function getJobRunSheet(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $job = $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$id]);
            if (!$job) {
                HttpException::fail(404, 'not_found', 'Catering job not found.');
            }
            $client = !empty($job['client_id']) ? $db->first('SELECT * FROM clients WHERE id = ?', [$job['client_id']]) : null;
            $pkg = !empty($job['package_id']) ? $db->first('SELECT * FROM menu_packages WHERE id = ?', [$job['package_id']]) : null;
            $tasks = $db->query('SELECT * FROM production_tasks WHERE job_id = ? ORDER BY due_date ASC, due_time ASC', [$id]);
            $runs = $db->query('SELECT * FROM delivery_runs WHERE job_id = ? ORDER BY pickup_time ASC', [$id]);
            $dietary = $db->query('SELECT * FROM dietary_requirements WHERE job_id = ? ORDER BY requirement_type ASC', [$id]);
            return [
                'job' => $job,
                'client' => $client,
                'pkg' => $pkg,
                'tasks' => $tasks,
                'runs' => $runs,
                'dietary' => $dietary,
            ];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $eventName = V::text($input['event_name'] ?? null, 'event_name', ['max' => 140, 'label' => 'Event name']);
            $eventDate = V::day($input['event_date'] ?? null, 'event_date', ['label' => 'Event date']);
            $deliveryTime = V::timeStr($input['delivery_time'] ?? null, 'delivery_time', ['required' => false, 'fallback' => '12:00']);
            $guestCount = V::int($input['guest_count'] ?? null, 'guest_count', ['required' => false, 'min' => 1, 'max' => 5000, 'fallback' => 25, 'label' => 'Guest count']) ?? 25;
            $serviceType = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => 'Drop-off']);
            $venue = V::text($input['venue_address'] ?? null, 'venue_address', ['required' => false, 'max' => 240]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => 'Enquiry']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $clientName = V::text($input['client_name'] ?? null, 'client_name', ['required' => false, 'max' => 120]);
            $org = '';
            if ($clientId !== null) {
                $cRow = $db->first('SELECT * FROM clients WHERE id = ?', [$clientId]);
                if ($cRow) {
                    $clientName = (string) $cRow['client_name'];
                    $org = (string) ($cRow['organisation'] ?? '');
                }
            }

            $pkgId = V::int($input['package_id'] ?? null, 'package_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $pkgName = '';
            $pppCents = 0;
            $estCents = 0;
            if ($pkgId !== null) {
                $pRow = $db->first('SELECT * FROM menu_packages WHERE id = ?', [$pkgId]);
                if (!$pRow) {
                    HttpException::fail(404, 'package_not_found', 'Selected menu package not found.');
                }
                $pkgName = (string) $pRow['package_name'];
                $pppCents = (int) $pRow['price_per_person_cents'];
                $estCents = $guestCount * $pppCents;
            } elseif (array_key_exists('estimated_value', $input) && $input['estimated_value'] !== '' && $input['estimated_value'] !== null) {
                $estCents = V::moneyCents($input['estimated_value'], 'estimated_value', ['min' => 0, 'max' => 100000000]);
            }

            $nextSeq = (int) ($ctx['settings']['job_seq'] ?? 200) + 1;
            $db->execute('UPDATE business_settings SET job_seq = ? WHERE id = 1', [$nextSeq]);
            $jobNum = 'EV-' . $nextSeq;

            $created = $db->execute(
                'INSERT INTO catering_jobs(job_number, client_id, client_name, organisation, package_id, package_name, price_per_person_cents, event_name, event_date, delivery_time, guest_count, service_type, venue_address, status, estimated_value_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobNum, $clientId, $clientName, $org, $pkgId, $pkgName, $pppCents, $eventName, $eventDate, $deliveryTime, $guestCount, $serviceType, $venue, $status, $estCents, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['job' => $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Catering job not found.');
            }

            $eventName = V::text($input['event_name'] ?? null, 'event_name', ['max' => 140, 'label' => 'Event name']);
            $eventDate = V::day($input['event_date'] ?? null, 'event_date', ['label' => 'Event date']);
            $deliveryTime = V::timeStr($input['delivery_time'] ?? null, 'delivery_time', ['required' => false, 'fallback' => (string) $cur['delivery_time']]);
            $guestCount = V::int($input['guest_count'] ?? null, 'guest_count', ['required' => false, 'min' => 1, 'max' => 5000, 'fallback' => (int) $cur['guest_count']]) ?? (int) $cur['guest_count'];
            $serviceType = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => $cur['service_type']]);
            $venue = V::text($input['venue_address'] ?? null, 'venue_address', ['required' => false, 'max' => 240]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $clientId = array_key_exists('client_id', $input)
                ? V::int($input['client_id'], 'client_id', ['required' => false, 'min' => 1, 'fallback' => null])
                : ($cur['client_id'] !== null ? (int) $cur['client_id'] : null);
            $clientName = (string) $cur['client_name'];
            $org = (string) $cur['organisation'];
            if ($clientId !== null) {
                $cRow = $db->first('SELECT * FROM clients WHERE id = ?', [$clientId]);
                if ($cRow) {
                    $clientName = (string) $cRow['client_name'];
                    $org = (string) ($cRow['organisation'] ?? '');
                }
            }

            $pkgId = array_key_exists('package_id', $input)
                ? V::int($input['package_id'], 'package_id', ['required' => false, 'min' => 1, 'fallback' => null])
                : ($cur['package_id'] !== null ? (int) $cur['package_id'] : null);
            $pkgName = (string) $cur['package_name'];
            $pppCents = (int) $cur['price_per_person_cents'];
            $estCents = (int) $cur['estimated_value_cents'];
            if ($pkgId !== null) {
                $pRow = $db->first('SELECT * FROM menu_packages WHERE id = ?', [$pkgId]);
                if ($pRow) {
                    $pkgName = (string) $pRow['package_name'];
                    $pppCents = (int) $pRow['price_per_person_cents'];
                    $estCents = $guestCount * $pppCents;
                }
            } elseif (array_key_exists('estimated_value', $input) && $input['estimated_value'] !== '' && $input['estimated_value'] !== null) {
                $pkgName = '';
                $pppCents = 0;
                $estCents = V::moneyCents($input['estimated_value'], 'estimated_value', ['min' => 0, 'max' => 100000000]);
            }

            $db->execute(
                'UPDATE catering_jobs SET client_id = ?, client_name = ?, organisation = ?, package_id = ?, package_name = ?, price_per_person_cents = ?, event_name = ?, event_date = ?, delivery_time = ?, guest_count = ?, service_type = ?, venue_address = ?, status = ?, estimated_value_cents = ?, notes = ? WHERE id = ?',
                [$clientId, $clientName, $org, $pkgId, $pkgName, $pppCents, $eventName, $eventDate, $deliveryTime, $guestCount, $serviceType, $venue, $status, $estCents, $notes, $id]
            );

            return ['job' => $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function setJobStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Catering job not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status');
            $db->execute('UPDATE catering_jobs SET status = ? WHERE id = ?', [$status, $id]);
            return ['job' => $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM catering_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Catering job not found.');
            }
            $db->execute('DELETE FROM production_tasks WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM delivery_runs WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM dietary_requirements WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM catering_jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Kitchen Production Board ----

    public function listProduction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $station = V::text($input['station'] ?? null, 'station', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM production_tasks WHERE 1=1';
            $params = [];
            if ($station !== '' && $station !== 'All') {
                $sql .= ' AND station = ?';
                $params[] = $station;
            }
            $sql .= " ORDER BY CASE status WHEN 'Blocked' THEN 0 WHEN 'In progress' THEN 1 WHEN 'Not started' THEN 2 ELSE 3 END, due_date ASC, due_time ASC";
            return ['tasks' => $db->query($sql, $params)];
        });
    }

    public function addProduction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::int($input['job_id'] ?? null, 'job_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $job = $jobId !== null ? $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$jobId]) : null;
            $eventName = $job
                ? (string) $job['event_name']
                : (V::text($input['event_name'] ?? null, 'event_name', ['required' => false, 'max' => 140]) ?: 'General Prep');
            $eventDate = $job
                ? (string) $job['event_date']
                : V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $task = V::text($input['task'] ?? null, 'task', ['max' => 200, 'label' => 'Task']);
            $station = V::oneOf($input['station'] ?? null, self::PROD_STATIONS, 'station', ['fallback' => 'Hot Kitchen']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => $eventDate]);
            $dueTime = V::timeStr($input['due_time'] ?? null, 'due_time', ['required' => false, 'fallback' => '10:00']);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 80]);
            $status = V::oneOf($input['status'] ?? null, self::PROD_STATUSES, 'status', ['fallback' => 'Not started']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                'INSERT INTO production_tasks(job_id, event_name, event_date, task, station, due_date, due_time, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, $eventName, $eventDate, $task, $station, $dueDate, $dueTime, $assigned, $status, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['task' => $db->first('SELECT * FROM production_tasks WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveProduction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM production_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Production task not found.');
            }
            $task = V::text($input['task'] ?? null, 'task', ['max' => 200, 'label' => 'Task']);
            $station = V::oneOf($input['station'] ?? null, self::PROD_STATIONS, 'station', ['fallback' => $cur['station']]);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => (string) $cur['due_date']]);
            $dueTime = V::timeStr($input['due_time'] ?? null, 'due_time', ['required' => false, 'fallback' => (string) $cur['due_time']]);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 80]);
            $status = V::oneOf($input['status'] ?? null, self::PROD_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $db->execute(
                'UPDATE production_tasks SET task = ?, station = ?, due_date = ?, due_time = ?, assigned_to = ?, status = ?, notes = ? WHERE id = ?',
                [$task, $station, $dueDate, $dueTime, $assigned, $status, $notes, $id]
            );

            return ['task' => $db->first('SELECT * FROM production_tasks WHERE id = ?', [$id])];
        }, write: true);
    }

    public function setProductionStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM production_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Production task not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PROD_STATUSES, 'status');
            $db->execute('UPDATE production_tasks SET status = ? WHERE id = ?', [$status, $id]);

            if (!empty($cur['job_id']) && $status === 'In progress') {
                $db->execute(
                    "UPDATE catering_jobs SET status = 'In Prep' WHERE id = ? AND status = 'Confirmed'",
                    [$cur['job_id']]
                );
            }

            return ['task' => $db->first('SELECT * FROM production_tasks WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteProduction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM production_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Production task not found.');
            }
            $db->execute('DELETE FROM production_tasks WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Delivery Dispatch Runs ----

    public function listDeliveries(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $runs = $db->query(
                "SELECT * FROM delivery_runs ORDER BY CASE status WHEN 'Issue' THEN 0 WHEN 'En Route' THEN 1 WHEN 'Loaded' THEN 2 WHEN 'Scheduled' THEN 3 ELSE 4 END, event_date ASC, pickup_time ASC"
            );
            return ['runs' => $runs];
        });
    }

    public function addDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Catering job not found.');
            }
            $driver = V::text($input['driver'] ?? null, 'driver', ['max' => 100, 'label' => 'Driver']);
            $vehicle = V::text($input['vehicle'] ?? null, 'vehicle', ['required' => false, 'max' => 100]);
            $pickup = V::timeStr($input['pickup_time'] ?? null, 'pickup_time', ['required' => false, 'fallback' => '10:30']);
            $deliv = V::timeStr($input['delivery_time'] ?? null, 'delivery_time', ['required' => false, 'fallback' => (string) ($job['delivery_time'] ?: '11:30')]);
            $status = V::oneOf($input['status'] ?? null, self::RUN_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $notes = V::text($input['delivery_notes'] ?? null, 'delivery_notes', ['required' => false, 'max' => 500]);

            $created = $db->execute(
                'INSERT INTO delivery_runs(job_id, event_name, event_date, venue_address, driver, vehicle, pickup_time, delivery_time, status, delivery_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, $job['event_name'], $job['event_date'], $job['venue_address'], $driver, $vehicle, $pickup, $deliv, $status, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['run' => $db->first('SELECT * FROM delivery_runs WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM delivery_runs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Delivery run not found.');
            }
            $driver = V::text($input['driver'] ?? null, 'driver', ['max' => 100, 'label' => 'Driver']);
            $vehicle = V::text($input['vehicle'] ?? null, 'vehicle', ['required' => false, 'max' => 100]);
            $pickup = V::timeStr($input['pickup_time'] ?? null, 'pickup_time', ['required' => false, 'fallback' => (string) $cur['pickup_time']]);
            $deliv = V::timeStr($input['delivery_time'] ?? null, 'delivery_time', ['required' => false, 'fallback' => (string) $cur['delivery_time']]);
            $status = V::oneOf($input['status'] ?? null, self::RUN_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['delivery_notes'] ?? null, 'delivery_notes', ['required' => false, 'max' => 500]);

            $db->execute(
                'UPDATE delivery_runs SET driver = ?, vehicle = ?, pickup_time = ?, delivery_time = ?, status = ?, delivery_notes = ? WHERE id = ?',
                [$driver, $vehicle, $pickup, $deliv, $status, $notes, $id]
            );

            return ['run' => $db->first('SELECT * FROM delivery_runs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function setDeliveryStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM delivery_runs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Delivery run not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::RUN_STATUSES, 'status');
            $db->execute('UPDATE delivery_runs SET status = ? WHERE id = ?', [$status, $id]);

            if (!empty($cur['job_id'])) {
                if ($status === 'En Route') {
                    $db->execute(
                        "UPDATE catering_jobs SET status = 'Dispatched' WHERE id = ? AND status IN ('Confirmed', 'In Prep')",
                        [$cur['job_id']]
                    );
                } elseif ($status === 'Delivered') {
                    $db->execute(
                        "UPDATE catering_jobs SET status = 'Completed' WHERE id = ? AND status IN ('In Prep', 'Dispatched')",
                        [$cur['job_id']]
                    );
                }
            }

            return ['run' => $db->first('SELECT * FROM delivery_runs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM delivery_runs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Delivery run not found.');
            }
            $db->execute('DELETE FROM delivery_runs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Dietary Requirements Matrix & 1-Click Kitchen Sign-Off ----

    public function listDietary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM dietary_requirements ORDER BY CASE kitchen_confirmed WHEN 'Pending' THEN 0 ELSE 1 END, event_date ASC, event_name ASC"
            );
            return ['items' => $rows];
        });
    }

    public function addDietary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM catering_jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Catering job not found.');
            }
            $reqType = V::oneOf($input['requirement_type'] ?? null, self::DIET_TYPES, 'requirement_type', ['fallback' => 'Vegan']);
            $count = V::int($input['guest_count'] ?? null, 'guest_count', ['required' => false, 'min' => 1, 'max' => 1000, 'fallback' => 1, 'label' => 'Guest count']) ?? 1;
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);
            $confirmed = V::oneOf($input['kitchen_confirmed'] ?? null, self::DIET_CONFIRMED, 'kitchen_confirmed', ['fallback' => 'Pending']);

            $created = $db->execute(
                "INSERT INTO dietary_requirements(job_id, event_name, event_date, requirement_type, guest_count, notes, kitchen_confirmed, confirmed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, '', 0, ?)",
                [$jobId, $job['event_name'], $job['event_date'], $reqType, $count, $notes, $confirmed, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['item' => $db->first('SELECT * FROM dietary_requirements WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function confirmDietary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM dietary_requirements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Dietary requirement not found.');
            }
            $nextStatus = !empty($input['kitchen_confirmed'])
                ? V::oneOf($input['kitchen_confirmed'], self::DIET_CONFIRMED, 'kitchen_confirmed')
                : (($cur['kitchen_confirmed'] ?? '') === 'Confirmed' ? 'Pending' : 'Confirmed');
            $by = $nextStatus === 'Confirmed' ? (string) $ctx['member']['display_name'] : '';

            $db->execute(
                'UPDATE dietary_requirements SET kitchen_confirmed = ?, confirmed_by = ? WHERE id = ?',
                [$nextStatus, $by, $id]
            );

            return ['item' => $db->first('SELECT * FROM dietary_requirements WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteDietary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM dietary_requirements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Dietary requirement not found.');
            }
            $db->execute('DELETE FROM dietary_requirements WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
