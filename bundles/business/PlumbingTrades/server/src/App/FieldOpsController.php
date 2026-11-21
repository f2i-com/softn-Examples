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

final class FieldOpsController
{
    private const CUST_TYPES = ['Residential', 'Commercial', 'Property Manager', 'Strata / Body Corporate', 'Real Estate Agency'];
    private const JOB_TYPES = ['Repair', 'Installation', 'Maintenance', 'Emergency Call-out', 'Quote'];
    private const JOB_STATUSES = ['Scheduled', 'En Route', 'On Site', 'Awaiting Parts', 'Completed', 'Invoiced'];
    private const JOB_PRIORITIES = ['Emergency', 'High', 'Normal', 'Low'];
    private const PART_STATUSES = ['Requested', 'Ordered', 'Received', 'Fitted'];
    private const INV_STATUSES = ['Draft', 'Sent', 'Paid', 'Overdue'];

    /** @return array<string, mixed>|null */
    private static function normalizeCustomer(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'job_count', 'open_jobs'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeJob(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'customer_id', 'estimated_cents', 'is_sample', 'created_at', 'updated_at',
            'visit_count', 'follow_up_count', 'parts_total_cents', 'parts_count', 'invoice_count',
        ] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('logged_hours', $row) && $row['logged_hours'] !== null) {
            $row['logged_hours'] = (float) $row['logged_hours'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeVisit(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'job_id', 'follow_up_required', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('hours_on_site', $row) && $row['hours_on_site'] !== null) {
            $row['hours_on_site'] = (float) $row['hours_on_site'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePart(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'job_id', 'quantity', 'unit_cost_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeInvoice(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'job_id', 'customer_id', 'hourly_rate_cents', 'labour_cents', 'parts_cents',
            'subtotal_cents', 'tax_cents', 'total_cents', 'is_sample', 'created_at', 'updated_at',
        ] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        foreach (['labour_hours', 'tax_rate'] as $fCol) {
            if (array_key_exists($fCol, $row) && $row[$fCol] !== null) {
                $row[$fCol] = (float) $row[$fCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function fetchJobSummaryRow(Database $db, int $id): ?array
    {
        $row = $db->first(
            "SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.customer_type AS customer_type, "
            . "(SELECT COALESCE(SUM(v.hours_on_site), 0) FROM site_visits v WHERE v.job_id = j.id) AS logged_hours, "
            . "(SELECT COUNT(*) FROM site_visits v WHERE v.job_id = j.id) AS visit_count, "
            . "(SELECT COUNT(*) FROM site_visits v WHERE v.job_id = j.id AND v.follow_up_required = 1) AS follow_up_count, "
            . "(SELECT COALESCE(SUM(p.quantity * p.unit_cost_cents), 0) FROM parts_requests p WHERE p.job_id = j.id) AS parts_total_cents, "
            . "(SELECT COUNT(*) FROM parts_requests p WHERE p.job_id = j.id) AS parts_count, "
            . "(SELECT COUNT(*) FROM invoices i WHERE i.job_id = j.id) AS invoice_count "
            . "FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE j.id = ?",
            [$id]
        );
        return self::normalizeJob($row);
    }

    // ---- Customers ----

    public function listCustomers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $type = V::text($input['customer_type'] ?? null, 'customer_type', ['required' => false, 'max' => 40]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 80]);
            $sql = "SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id) AS job_count, "
                . "(SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id AND j.status NOT IN ('Completed', 'Invoiced')) AS open_jobs "
                . "FROM customers c WHERE 1=1";
            $params = [];
            if ($type !== '' && $type !== 'All') {
                $sql .= ' AND c.customer_type = ?';
                $params[] = $type;
            }
            if ($q !== '') {
                $pat = V::likeTerm($q);
                $sql .= " AND (c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.address LIKE ? ESCAPE '\\')";
                $params[] = $pat;
                $params[] = $pat;
                $params[] = $pat;
            }
            $sql .= ' ORDER BY c.name ASC LIMIT 250';
            $rows = array_map([self::class, 'normalizeCustomer'], $db->query($sql, $params));
            return ['customers' => $rows];
        });
    }

    public function addCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Customer name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['max' => 260, 'label' => 'Service address']);
            $type = V::oneOf($input['customer_type'] ?? null, self::CUST_TYPES, 'customer_type', ['fallback' => 'Residential']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $phone, $em, $address, $type, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['customer' => self::normalizeCustomer($db->first('SELECT * FROM customers WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM customers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Customer not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Customer name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['max' => 260, 'label' => 'Service address']);
            $type = V::oneOf($input['customer_type'] ?? null, self::CUST_TYPES, 'customer_type', ['fallback' => $cur['customer_type']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, customer_type = ?, notes = ? WHERE id = ?',
                [$name, $phone, $em, $address, $type, $notes, $id]
            );
            return ['customer' => self::normalizeCustomer($db->first('SELECT * FROM customers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM customers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Customer not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM jobs WHERE customer_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'customer_has_jobs', 'Cannot delete a customer with existing jobs. Remove their jobs first.');
            }
            $db->execute('DELETE FROM customers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Jobs & Dispatch Board ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $priority = V::text($input['priority'] ?? null, 'priority', ['required' => false, 'max' => 30]);
            $tech = V::text($input['tech'] ?? null, 'tech', ['required' => false, 'max' => 80]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 80]);

            $sql = "SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.customer_type AS customer_type, "
                . "(SELECT COALESCE(SUM(v.hours_on_site), 0) FROM site_visits v WHERE v.job_id = j.id) AS logged_hours, "
                . "(SELECT COUNT(*) FROM site_visits v WHERE v.job_id = j.id) AS visit_count, "
                . "(SELECT COUNT(*) FROM site_visits v WHERE v.job_id = j.id AND v.follow_up_required = 1) AS follow_up_count, "
                . "(SELECT COALESCE(SUM(p.quantity * p.unit_cost_cents), 0) FROM parts_requests p WHERE p.job_id = j.id) AS parts_total_cents, "
                . "(SELECT COUNT(*) FROM parts_requests p WHERE p.job_id = j.id) AS parts_count, "
                . "(SELECT COUNT(*) FROM invoices i WHERE i.job_id = j.id) AS invoice_count "
                . "FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE 1=1";
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND j.status = ?';
                $params[] = $status;
            }
            if ($priority !== '' && $priority !== 'All') {
                $sql .= ' AND j.priority = ?';
                $params[] = $priority;
            }
            if ($tech !== '' && $tech !== 'All') {
                $sql .= ' AND j.assigned_tech = ?';
                $params[] = $tech;
            }
            if ($q !== '') {
                $pat = V::likeTerm($q);
                $sql .= " AND (j.job_number LIKE ? ESCAPE '\\' OR j.site_address LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')";
                $params[] = $pat;
                $params[] = $pat;
                $params[] = $pat;
                $params[] = $pat;
            }
            $sql .= " ORDER BY CASE j.priority WHEN 'Emergency' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, j.scheduled_date ASC, j.id DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeJob'], $db->query($sql, $params));
            return ['jobs' => $rows];
        });
    }

    public function getJobDetail(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $job = self::fetchJobSummaryRow($db, $id);
            if (!$job) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $customer = self::normalizeCustomer($db->first('SELECT * FROM customers WHERE id = ?', [$job['customer_id']]));
            $visits = array_map(
                [self::class, 'normalizeVisit'],
                $db->query('SELECT * FROM site_visits WHERE job_id = ? ORDER BY visit_date DESC, id DESC', [$id])
            );
            $parts = array_map(
                [self::class, 'normalizePart'],
                $db->query('SELECT * FROM parts_requests WHERE job_id = ? ORDER BY created_at DESC', [$id])
            );
            $invoices = array_map(
                [self::class, 'normalizeInvoice'],
                $db->query('SELECT * FROM invoices WHERE job_id = ? ORDER BY created_at DESC', [$id])
            );
            return [
                'job' => $job,
                'customer' => $customer,
                'visits' => $visits,
                'parts' => $parts,
                'invoices' => $invoices,
            ];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $custId = V::rowId($input['customer_id'] ?? null, 'customer_id');
            $cust = $db->first('SELECT * FROM customers WHERE id = ?', [$custId]);
            if (!$cust) {
                HttpException::fail(404, 'customer_not_found', 'Selected customer does not exist.');
            }
            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => 'Repair']);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $priority = V::oneOf($input['priority'] ?? null, self::JOB_PRIORITIES, 'priority', ['fallback' => $jobType === 'Emergency Call-out' ? 'Emergency' : 'Normal']);
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'label' => 'Scheduled date', 'fallback' => V::utcDay(0)]);
            $schedTime = V::timeStr($input['scheduled_time'] ?? null, 'scheduled_time', ['required' => false, 'fallback' => '']);
            $tech = V::text($input['assigned_tech'] ?? null, 'assigned_tech', ['required' => false, 'max' => 80]);
            $siteAddr = V::text($input['site_address'] ?? null, 'site_address', ['required' => false, 'max' => 260]) ?: (string) $cust['address'];
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1000, 'label' => 'Job description']);
            $est = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0]);

            $nextSeq = (int) ($ctx['settings']['job_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET job_seq = ? WHERE id = 1', [$nextSeq]);
            $jobNum = 'JOB-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$jobNum, $custId, $jobType, $status, $priority, $schedDate, $schedTime, $tech, $siteAddr, $desc, $est, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['job' => self::fetchJobSummaryRow($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $custId = array_key_exists('customer_id', $input)
                ? V::rowId($input['customer_id'], 'customer_id')
                : (int) $cur['customer_id'];
            $cust = $db->first('SELECT * FROM customers WHERE id = ?', [$custId]);
            if (!$cust) {
                HttpException::fail(404, 'customer_not_found', 'Selected customer does not exist.');
            }
            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => $cur['job_type']]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => $cur['status']]);
            $priority = V::oneOf($input['priority'] ?? null, self::JOB_PRIORITIES, 'priority', ['fallback' => $cur['priority']]);
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'fallback' => (string) $cur['scheduled_date']]);
            $schedTime = array_key_exists('scheduled_time', $input)
                ? V::timeStr($input['scheduled_time'], 'scheduled_time', ['required' => false, 'fallback' => ''])
                : (string) $cur['scheduled_time'];
            $tech = array_key_exists('assigned_tech', $input)
                ? V::text($input['assigned_tech'], 'assigned_tech', ['required' => false, 'max' => 80])
                : (string) $cur['assigned_tech'];
            $siteAddr = array_key_exists('site_address', $input)
                ? (V::text($input['site_address'], 'site_address', ['required' => false, 'max' => 260, 'label' => 'Site address']) ?: (string) $cust['address'])
                : (string) $cur['site_address'];
            $desc = array_key_exists('description', $input)
                ? V::text($input['description'], 'description', ['max' => 1000, 'label' => 'Job description'])
                : (string) $cur['description'];
            $est = array_key_exists('estimated_value', $input)
                ? V::moneyCents($input['estimated_value'], 'estimated_value', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0])
                : (int) $cur['estimated_cents'];

            $db->execute(
                'UPDATE jobs SET customer_id = ?, job_type = ?, status = ?, priority = ?, scheduled_date = ?, scheduled_time = ?, assigned_tech = ?, site_address = ?, description = ?, estimated_cents = ?, updated_at = ? WHERE id = ?',
                [$custId, $jobType, $status, $priority, $schedDate, $schedTime, $tech, $siteAddr, $desc, $est, V::now(), $id]
            );
            return ['job' => self::fetchJobSummaryRow($db, $id)];
        }, write: true);
    }

    public function setJobStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status');
            $tech = array_key_exists('assigned_tech', $input)
                ? V::text($input['assigned_tech'], 'assigned_tech', ['required' => false, 'max' => 80])
                : (string) $cur['assigned_tech'];
            $db->execute('UPDATE jobs SET status = ?, assigned_tech = ?, updated_at = ? WHERE id = ?', [$status, $tech, V::now(), $id]);
            return ['job' => self::fetchJobSummaryRow($db, $id)];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $db->execute('DELETE FROM site_visits WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM parts_requests WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM invoices WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Site Visits / On-Site Work Orders ----

    public function listVisits(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::int($input['job_id'] ?? null, 'job_id', ['required' => false, 'min' => 1]);
            $onlyFollowUp = V::bool($input['follow_up'] ?? false);
            $sql = 'SELECT v.*, j.job_number, j.site_address, j.status AS job_status, c.name AS customer_name '
                . 'FROM site_visits v LEFT JOIN jobs j ON j.id = v.job_id LEFT JOIN customers c ON c.id = j.customer_id WHERE 1=1';
            $params = [];
            if ($jobId !== null) {
                $sql .= ' AND v.job_id = ?';
                $params[] = $jobId;
            }
            if ($onlyFollowUp) {
                $sql .= ' AND v.follow_up_required = 1';
            }
            $sql .= ' ORDER BY v.visit_date DESC, v.id DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeVisit'], $db->query($sql, $params));
            return ['visits' => $rows];
        });
    }

    public function addVisit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Job not found.');
            }
            $tech = V::text($input['technician_name'] ?? null, 'technician_name', ['required' => false, 'max' => 80])
                ?: ((string) $job['assigned_tech'] ?: (string) $ctx['member']['display_name']);
            $visitDate = V::day($input['visit_date'] ?? null, 'visit_date', ['required' => false, 'label' => 'Visit date', 'fallback' => V::utcDay(0)]);
            $hours = V::numVal($input['hours_on_site'] ?? null, 'hours_on_site', ['min' => 0.25, 'max' => 100, 'label' => 'Hours on site']);
            $work = V::text($input['work_performed'] ?? null, 'work_performed', ['max' => 1200, 'label' => 'Work performed']);
            $mats = V::text($input['materials_used'] ?? null, 'materials_used', ['required' => false, 'max' => 600]);
            $followUp = V::bool($input['follow_up_required'] ?? false) ? 1 : 0;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO site_visits(job_id, technician_name, visit_date, hours_on_site, work_performed, materials_used, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, $tech, $visitDate, $hours, $work, $mats, $followUp, $ts]
            );
            // If job was Scheduled or En Route, bump it to On Site automatically
            if ($job['status'] === 'Scheduled' || $job['status'] === 'En Route') {
                $db->execute("UPDATE jobs SET status = 'On Site', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            }
            return [
                '__status' => 201,
                '__body' => ['visit' => self::normalizeVisit($db->first('SELECT * FROM site_visits WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveVisit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM site_visits WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Site visit not found.');
            }
            $tech = V::text($input['technician_name'] ?? null, 'technician_name', ['max' => 80, 'label' => 'Technician']);
            $visitDate = V::day($input['visit_date'] ?? null, 'visit_date', ['required' => false, 'fallback' => (string) $cur['visit_date']]);
            $hours = V::numVal($input['hours_on_site'] ?? null, 'hours_on_site', ['min' => 0.25, 'max' => 100, 'label' => 'Hours on site']);
            $work = V::text($input['work_performed'] ?? null, 'work_performed', ['max' => 1200, 'label' => 'Work performed']);
            $mats = V::text($input['materials_used'] ?? null, 'materials_used', ['required' => false, 'max' => 600]);
            $followUp = V::bool($input['follow_up_required'] ?? false) ? 1 : 0;

            $db->execute(
                'UPDATE site_visits SET technician_name = ?, visit_date = ?, hours_on_site = ?, work_performed = ?, materials_used = ?, follow_up_required = ? WHERE id = ?',
                [$tech, $visitDate, $hours, $work, $mats, $followUp, $id]
            );
            return ['visit' => self::normalizeVisit($db->first('SELECT * FROM site_visits WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteVisit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM site_visits WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Site visit not found.');
            }
            $db->execute('DELETE FROM site_visits WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Parts & Materials Requests ----

    public function listParts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $jobId = V::int($input['job_id'] ?? null, 'job_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT p.*, j.job_number, j.site_address, c.name AS customer_name '
                . 'FROM parts_requests p LEFT JOIN jobs j ON j.id = p.job_id LEFT JOIN customers c ON c.id = j.customer_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND p.status = ?';
                $params[] = $status;
            }
            if ($jobId !== null) {
                $sql .= ' AND p.job_id = ?';
                $params[] = $jobId;
            }
            $sql .= " ORDER BY CASE p.status WHEN 'Requested' THEN 0 WHEN 'Ordered' THEN 1 WHEN 'Received' THEN 2 ELSE 3 END, p.created_at DESC LIMIT 250";
            $rows = array_map([self::class, 'normalizePart'], $db->query($sql, $params));
            return ['parts' => $rows];
        });
    }

    public function addPart(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Job not found.');
            }
            $item = V::text($input['item'] ?? null, 'item', ['max' => 160, 'label' => 'Part / Material']);
            $qty = V::int($input['quantity'] ?? null, 'quantity', ['required' => false, 'min' => 1, 'max' => 9999, 'fallback' => 1]) ?? 1;
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $unitCost = V::moneyCents($input['unit_cost'] ?? null, 'unit_cost', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 0]);
            $status = V::oneOf($input['status'] ?? null, self::PART_STATUSES, 'status', ['fallback' => 'Requested']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$jobId, $item, $qty, $supplier, $unitCost, $status, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['part' => self::normalizePart($db->first('SELECT * FROM parts_requests WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function savePart(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM parts_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Part request not found.');
            }
            $item = V::text($input['item'] ?? null, 'item', ['max' => 160, 'label' => 'Part / Material']);
            $qty = V::int($input['quantity'] ?? null, 'quantity', ['required' => false, 'min' => 1, 'max' => 9999, 'fallback' => (int) $cur['quantity']]) ?? (int) $cur['quantity'];
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $unitCost = V::moneyCents($input['unit_cost'] ?? null, 'unit_cost', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => (int) $cur['unit_cost_cents']]);
            $status = V::oneOf($input['status'] ?? null, self::PART_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);

            $db->execute(
                'UPDATE parts_requests SET item = ?, quantity = ?, supplier = ?, unit_cost_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$item, $qty, $supplier, $unitCost, $status, $notes, V::now(), $id]
            );
            return ['part' => self::normalizePart($db->first('SELECT * FROM parts_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setPartStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM parts_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Part request not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PART_STATUSES, 'status');
            $db->execute('UPDATE parts_requests SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['part' => self::normalizePart($db->first('SELECT * FROM parts_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deletePart(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM parts_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Part request not found.');
            }
            $db->execute('DELETE FROM parts_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Job Invoices (including 1-Click Raise Invoice from Job!) ----

    public function listInvoices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT i.*, j.job_number, j.site_address, j.description AS job_description, '
                . 'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address '
                . 'FROM invoices i LEFT JOIN jobs j ON j.id = i.job_id LEFT JOIN customers c ON c.id = i.customer_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND i.status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY i.issue_date DESC, i.id DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeInvoice'], $db->query($sql, $params));
            return ['invoices' => $rows];
        });
    }

    public function raiseInvoiceFromJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Job not found.');
            }

            $visitAgg = $db->first('SELECT COALESCE(SUM(hours_on_site), 0) AS hrs FROM site_visits WHERE job_id = ?', [$jobId]);
            $partsAgg = $db->first('SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) AS pts FROM parts_requests WHERE job_id = ?', [$jobId]);
            $loggedHours = $visitAgg ? round(((float) $visitAgg['hrs']) * 100.0) / 100.0 : 0.0;
            $rateCents = (array_key_exists('hourly_rate', $input) && $input['hourly_rate'] !== '' && $input['hourly_rate'] !== null)
                ? V::moneyCents($input['hourly_rate'], 'hourly_rate', ['min' => 0, 'max' => 500000])
                : (int) ($ctx['settings']['hourly_rate_cents'] ?? 12500);
            $includeCallout = V::bool($input['include_callout'] ?? false);
            $calloutCents = $includeCallout ? (int) ($ctx['settings']['callout_fee_cents'] ?? 0) : 0;

            $labourCents = (int) round($loggedHours * $rateCents) + $calloutCents;
            $partsCents = $partsAgg ? (int) $partsAgg['pts'] : 0;
            $subtotalCents = $labourCents + $partsCents;
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            $taxCents = (int) round($subtotalCents * ($taxRate / 100.0));
            $totalCents = $subtotalCents + $taxCents;

            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => V::utcDay(14)]);
            $defaultNote = 'Labour (' . $loggedHours . 'h)' . ($includeCallout ? ' + Call-out fee' : '') . ' & parts for ' . $job['job_number'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]) ?: $defaultNote;

            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = 'INV-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO invoices(invoice_number, job_id, customer_id, issue_date, due_date, labour_hours, hourly_rate_cents, labour_cents, parts_cents, subtotal_cents, tax_rate, tax_cents, total_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent', ?, 0, ?, ?)",
                [$invNum, $jobId, (int) $job['customer_id'], $issueDate, $dueDate, $loggedHours, $rateCents, $labourCents, $partsCents, $subtotalCents, $taxRate, $taxCents, $totalCents, $notes, $ts, $ts]
            );
            $db->execute("UPDATE jobs SET status = 'Invoiced', updated_at = ? WHERE id = ?", [$ts, $jobId]);

            $inv = self::normalizeInvoice($db->first(
                'SELECT i.*, j.job_number, j.site_address, j.description AS job_description, '
                . 'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address '
                . 'FROM invoices i LEFT JOIN jobs j ON j.id = i.job_id LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['invoice' => $inv]];
        }, write: true);
    }

    public function addInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Job not found.');
            }
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => V::utcDay(14)]);
            $labourCents = V::moneyCents($input['labour_amount'] ?? null, 'labour_amount', ['min' => 0, 'max' => 100000000, 'label' => 'Labour amount']);
            $partsCents = V::moneyCents($input['parts_amount'] ?? null, 'parts_amount', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'Parts amount']);
            $subtotalCents = $labourCents + $partsCents;
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            $taxCents = (int) round($subtotalCents * ($taxRate / 100.0));
            $totalCents = $subtotalCents + $taxCents;
            $status = V::oneOf($input['status'] ?? null, self::INV_STATUSES, 'status', ['fallback' => 'Draft']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = V::text($input['invoice_number'] ?? null, 'invoice_number', ['required' => false, 'max' => 40]) ?: ('INV-' . $nextSeq);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO invoices(invoice_number, job_id, customer_id, issue_date, due_date, labour_hours, hourly_rate_cents, labour_cents, parts_cents, subtotal_cents, tax_rate, tax_cents, total_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$invNum, $jobId, (int) $job['customer_id'], $issueDate, $dueDate, (int) ($ctx['settings']['hourly_rate_cents'] ?? 12500), $labourCents, $partsCents, $subtotalCents, $taxRate, $taxCents, $totalCents, $status, $notes, $ts, $ts]
            );
            $db->execute("UPDATE jobs SET status = 'Invoiced', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            $inv = self::normalizeInvoice($db->first('SELECT * FROM invoices WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['invoice' => $inv]];
        }, write: true);
    }

    public function setInvoiceStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM invoices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Invoice not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::INV_STATUSES, 'status');
            $db->execute('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['invoice' => self::normalizeInvoice($db->first('SELECT * FROM invoices WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM invoices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Invoice not found.');
            }
            $db->execute('DELETE FROM invoices WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
