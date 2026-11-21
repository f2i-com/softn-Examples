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

final class BenchController
{
    private const CONTACT_PREFS = ['Phone call', 'Text message', 'Email'];
    private const TECH_SKILLS = ['Phones', 'Laptops', 'Consoles', 'Micro-soldering', 'Data recovery', 'Water damage'];
    private const DEVICE_TYPES = ['Phone', 'Laptop', 'Tablet', 'Console', 'Desktop', 'Other'];
    private const ISSUE_TYPES = ['Screen', 'Battery', 'Charging', 'Water damage', 'Software', 'Data recovery', 'Other'];
    private const JOB_STAGES = ['Intake', 'Diagnosing', 'Awaiting Parts', 'Repairing', 'QA Check', 'Ready for Pickup', 'Collected'];
    private const PRIORITIES = ['Standard', 'Express'];
    private const PART_STATUSES = ['Ordered', 'Shipped', 'Arrived', 'Installed', 'Backordered', 'Cancelled'];
    private const QA_RESULTS = ['Pass', 'Fail'];
    private const QA_ITEMS = ['Power', 'Display', 'Touch', 'Charging', 'Audio', 'Cameras', 'Buttons & Ports', 'Wi-Fi & Cellular'];

    /** @return array<string, mixed>|null */
    private static function normalizeCustomer(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'device_count', 'job_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTechnician(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'active_jobs'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $skills = V::parseJson($row['skills_json'] ?? '', []);
        $row['skills'] = is_array($skills) ? array_values($skills) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeDevice(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'customer_id', 'is_sample', 'created_at', 'repair_count'] as $col) {
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
        foreach (['id', 'device_id', 'customer_id', 'technician_id', 'quote_amount_cents', 'customer_notified', 'is_sample', 'created_at', 'updated_at', 'open_parts_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePart(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'repair_job_id', 'cost_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeQa(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'repair_job_id', 'checked_by_id', 'is_sample', 'created_at', 'quote_amount_cents', 'customer_notified'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $checklist = V::parseJson($row['checklist_json'] ?? '', []);
        $row['checklist'] = is_array($checklist) ? array_values($checklist) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function fetchJobRow(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.preferred_contact, '
            . 'd.device_type, d.brand, d.model, d.serial, d.condition_notes, t.name AS technician_name, '
            . "(SELECT COUNT(*) FROM parts_orders po WHERE po.repair_job_id = j.id AND po.status IN ('Ordered', 'Shipped', 'Backordered')) AS open_parts_count, "
            . '(SELECT qa.result FROM quality_checks qa WHERE qa.repair_job_id = j.id ORDER BY qa.id DESC LIMIT 1) AS latest_qa_result '
            . 'FROM repair_jobs j '
            . 'LEFT JOIN customers c ON c.id = j.customer_id '
            . 'LEFT JOIN devices d ON d.id = j.device_id '
            . 'LEFT JOIN technicians t ON t.id = j.technician_id WHERE j.id = ?',
            [$id]
        );
        return self::normalizeJob($row);
    }

    private static function nextTicketCode(Database $db, array $settings): string
    {
        $nextSeq = (int) ($settings['ticket_seq'] ?? 1000) + 1;
        $db->execute('UPDATE business_settings SET ticket_seq = ? WHERE id = 1', [$nextSeq]);
        return 'RB-' . $nextSeq;
    }

    // ---- Customers ----

    public function listCustomers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeCustomer'],
                $db->query(
                    'SELECT c.*, '
                    . '(SELECT COUNT(*) FROM devices d WHERE d.customer_id = c.id) AS device_count, '
                    . '(SELECT COUNT(*) FROM repair_jobs j WHERE j.customer_id = c.id) AS job_count '
                    . 'FROM customers c ORDER BY c.name ASC LIMIT 250'
                )
            );
            return ['customers' => $rows];
        });
    }

    public function addCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Customer name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $pref = V::oneOf($input['preferred_contact'] ?? null, self::CONTACT_PREFS, 'preferred_contact', ['fallback' => 'Text message']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO customers(name, email, phone, preferred_contact, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, $em, $phone, $pref, $notes, V::now()]
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
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Customer name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $pref = V::oneOf($input['preferred_contact'] ?? null, self::CONTACT_PREFS, 'preferred_contact', ['fallback' => $cur['preferred_contact']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE customers SET name = ?, email = ?, phone = ?, preferred_contact = ?, notes = ? WHERE id = ?',
                [$name, $em, $phone, $pref, $notes, $id]
            );
            return ['customer' => self::normalizeCustomer($db->first('SELECT * FROM customers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM customers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $hasJobs = $db->first('SELECT COUNT(*) AS c FROM repair_jobs WHERE customer_id = ?', [$id]);
            if ($hasJobs && (int) $hasJobs['c'] > 0) {
                HttpException::fail(409, 'customer_has_jobs', 'Cannot delete a customer with existing repair jobs.');
            }
            $db->execute('DELETE FROM devices WHERE customer_id = ?', [$id]);
            $db->execute('DELETE FROM customers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Bench Technicians ----

    public function listTechnicians(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeTechnician'],
                $db->query(
                    "SELECT t.*, (SELECT COUNT(*) FROM repair_jobs j WHERE j.technician_id = t.id AND j.status != 'Collected') AS active_jobs "
                    . "FROM technicians t ORDER BY CASE t.active WHEN 'Active' THEN 0 ELSE 1 END, t.name ASC"
                )
            );
            return ['technicians' => $rows];
        });
    }

    public function addTechnician(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Technician name']);
            $skills = V::listOf($input['skills'] ?? null, 'skills', 10, static fn ($v) => V::oneOf($v, self::TECH_SKILLS, 'skill'));
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO technicians(name, skills_json, email, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, json_encode($skills), $em, $phone, $active, V::now()]
            );
            $row = $db->first('SELECT * FROM technicians WHERE id = ?', [$created['lastInsertRowid']]);
            return [
                '__status' => 201,
                '__body' => ['technician' => self::normalizeTechnician($row)],
            ];
        }, write: true);
    }

    public function saveTechnician(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM technicians WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'tech_not_found', 'Technician not found.');
            }
            $name = array_key_exists('name', $input)
                ? V::text($input['name'], 'name', ['max' => 120, 'label' => 'Technician name'])
                : (string) $cur['name'];
            $skills = is_array($input['skills'] ?? null)
                ? V::listOf($input['skills'], 'skills', 10, static fn ($v) => V::oneOf($v, self::TECH_SKILLS, 'skill'))
                : V::parseJson($cur['skills_json'] ?? '', []);
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40])
                : (string) $cur['phone'];
            $active = array_key_exists('active', $input)
                ? V::oneOf($input['active'], ['Active', 'Inactive'], 'active', ['fallback' => $cur['active']])
                : (string) $cur['active'];

            $db->execute(
                'UPDATE technicians SET name = ?, skills_json = ?, email = ?, phone = ?, active = ? WHERE id = ?',
                [$name, json_encode(is_array($skills) ? $skills : []), $em, $phone, $active, $id]
            );
            $row = $db->first('SELECT * FROM technicians WHERE id = ?', [$id]);
            return ['technician' => self::normalizeTechnician($row)];
        }, write: true);
    }

    public function deleteTechnician(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM technicians WHERE id = ?', [$id])) {
                HttpException::fail(404, 'tech_not_found', 'Technician not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM repair_jobs WHERE technician_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'tech_has_jobs', 'Technician has repair jobs assigned. Set them Inactive instead.');
            }
            $db->execute('DELETE FROM technicians WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Devices ----

    public function listDevices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeDevice'],
                $db->query(
                    'SELECT d.*, c.name AS customer_name, c.phone AS customer_phone, '
                    . '(SELECT COUNT(*) FROM repair_jobs j WHERE j.device_id = d.id) AS repair_count '
                    . 'FROM devices d LEFT JOIN customers c ON c.id = d.customer_id ORDER BY d.created_at DESC LIMIT 250'
                )
            );
            return ['devices' => $rows];
        });
    }

    public function addDevice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $customerId = V::rowId($input['customer_id'] ?? null, 'customer_id');
            if (!$db->first('SELECT id FROM customers WHERE id = ?', [$customerId])) {
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $dType = V::oneOf($input['device_type'] ?? null, self::DEVICE_TYPES, 'device_type', ['fallback' => 'Phone']);
            $brand = V::text($input['brand'] ?? null, 'brand', ['max' => 80, 'label' => 'Brand']);
            $model = V::text($input['model'] ?? null, 'model', ['max' => 120, 'label' => 'Model']);
            $serial = V::text($input['serial'] ?? null, 'serial', ['required' => false, 'max' => 100]);
            $cond = V::text($input['condition_notes'] ?? null, 'condition_notes', ['required' => false, 'max' => 800]);

            $created = $db->execute(
                'INSERT INTO devices(customer_id, device_type, brand, model, serial, condition_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$customerId, $dType, $brand, $model, $serial, $cond, V::now()]
            );
            $row = $db->first(
                'SELECT d.*, c.name AS customer_name FROM devices d LEFT JOIN customers c ON c.id = d.customer_id WHERE d.id = ?',
                [$created['lastInsertRowid']]
            );
            return [
                '__status' => 201,
                '__body' => ['device' => self::normalizeDevice($row)],
            ];
        }, write: true);
    }

    public function saveDevice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM devices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'device_not_found', 'Device not found.');
            }
            $customerId = array_key_exists('customer_id', $input)
                ? V::rowId($input['customer_id'], 'customer_id')
                : (int) $cur['customer_id'];
            if (!$db->first('SELECT id FROM customers WHERE id = ?', [$customerId])) {
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $dType = V::oneOf($input['device_type'] ?? null, self::DEVICE_TYPES, 'device_type', ['fallback' => $cur['device_type']]);
            $brand = V::text($input['brand'] ?? null, 'brand', ['max' => 80, 'label' => 'Brand']);
            $model = V::text($input['model'] ?? null, 'model', ['max' => 120, 'label' => 'Model']);
            $serial = V::text($input['serial'] ?? null, 'serial', ['required' => false, 'max' => 100]);
            $cond = V::text($input['condition_notes'] ?? null, 'condition_notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE devices SET customer_id = ?, device_type = ?, brand = ?, model = ?, serial = ?, condition_notes = ? WHERE id = ?',
                [$customerId, $dType, $brand, $model, $serial, $cond, $id]
            );
            return ['device' => self::normalizeDevice($db->first('SELECT * FROM devices WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteDevice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM devices WHERE id = ?', [$id])) {
                HttpException::fail(404, 'device_not_found', 'Device not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM repair_jobs WHERE device_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'device_has_jobs', 'Cannot delete a device with linked repair jobs.');
            }
            $db->execute('DELETE FROM devices WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Repair Pipeline Jobs ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $includeCollected = V::bool($input['includeCollected'] ?? false);
            $sql = 'SELECT j.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.preferred_contact, '
                . 'd.device_type, d.brand, d.model, d.serial, d.condition_notes, t.name AS technician_name, '
                . "(SELECT COUNT(*) FROM parts_orders po WHERE po.repair_job_id = j.id AND po.status IN ('Ordered', 'Shipped', 'Backordered')) AS open_parts_count, "
                . '(SELECT qa.result FROM quality_checks qa WHERE qa.repair_job_id = j.id ORDER BY qa.id DESC LIMIT 1) AS latest_qa_result '
                . 'FROM repair_jobs j '
                . 'LEFT JOIN customers c ON c.id = j.customer_id '
                . 'LEFT JOIN devices d ON d.id = j.device_id '
                . 'LEFT JOIN technicians t ON t.id = j.technician_id WHERE 1=1';
            if (!$includeCollected) {
                $sql .= " AND j.status != 'Collected'";
            }
            $sql .= " ORDER BY CASE j.priority WHEN 'Express' THEN 0 ELSE 1 END, j.due_date ASC, j.created_at DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeJob'], $db->query($sql));
            return ['jobs' => $rows];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $deviceId = V::rowId($input['device_id'] ?? null, 'device_id');
            $device = $db->first('SELECT * FROM devices WHERE id = ?', [$deviceId]);
            if (!$device) {
                HttpException::fail(404, 'device_not_found', 'Selected device not found.');
            }
            $customerId = !empty($input['customer_id'])
                ? V::rowId($input['customer_id'], 'customer_id')
                : (int) $device['customer_id'];
            $techId = V::rowId($input['technician_id'] ?? null, 'technician_id');
            if (!$db->first('SELECT id FROM technicians WHERE id = ?', [$techId])) {
                HttpException::fail(404, 'tech_not_found', 'Selected technician not found.');
            }

            $issue = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => 'Screen']);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STAGES, 'status', ['fallback' => 'Intake']);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Standard']);
            $quoteCents = V::moneyCents($input['quote_amount'] ?? null, 'quote_amount', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0, 'label' => 'Quote amount']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $code = self::nextTicketCode($db, $ctx['settings']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)',
                [$code, $deviceId, $customerId, $techId, $issue, $status, $priority, $quoteCents, $dueDate, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['job' => self::fetchJobRow($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function quickIntakeDeviceJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $customerId = V::rowId($input['customer_id'] ?? null, 'customer_id');
            if (!$db->first('SELECT id FROM customers WHERE id = ?', [$customerId])) {
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $techId = V::rowId($input['technician_id'] ?? null, 'technician_id');
            if (!$db->first('SELECT id FROM technicians WHERE id = ?', [$techId])) {
                HttpException::fail(404, 'tech_not_found', 'Technician not found.');
            }

            $dType = V::oneOf($input['device_type'] ?? null, self::DEVICE_TYPES, 'device_type', ['fallback' => 'Phone']);
            $brand = V::text($input['brand'] ?? null, 'brand', ['max' => 80, 'label' => 'Brand']);
            $model = V::text($input['model'] ?? null, 'model', ['max' => 120, 'label' => 'Model']);
            $serial = V::text($input['serial'] ?? null, 'serial', ['required' => false, 'max' => 100]);
            $cond = V::text($input['condition_notes'] ?? null, 'condition_notes', ['required' => false, 'max' => 800]);

            $issue = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => 'Screen']);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Standard']);
            $quoteCents = V::moneyCents($input['quote_amount'] ?? null, 'quote_amount', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0, 'label' => 'Quote amount']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $devRes = $db->execute(
                'INSERT INTO devices(customer_id, device_type, brand, model, serial, condition_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$customerId, $dType, $brand, $model, $serial, $cond, $ts]
            );
            $code = self::nextTicketCode($db, $ctx['settings']);
            $jobRes = $db->execute(
                "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 'Intake', ?, ?, ?, ?, 0, 0, ?, ?)",
                [$code, $devRes['lastInsertRowid'], $customerId, $techId, $issue, $priority, $quoteCents, $dueDate, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'device' => self::normalizeDevice($db->first('SELECT * FROM devices WHERE id = ?', [$devRes['lastInsertRowid']])),
                    'job' => self::fetchJobRow($db, $jobRes['lastInsertRowid']),
                ],
            ];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM repair_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Repair job not found.');
            }
            $techId = array_key_exists('technician_id', $input)
                ? V::rowId($input['technician_id'], 'technician_id')
                : (int) $cur['technician_id'];
            if (!$db->first('SELECT id FROM technicians WHERE id = ?', [$techId])) {
                HttpException::fail(404, 'tech_not_found', 'Selected technician not found.');
            }
            $issue = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => $cur['issue_type']]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STAGES, 'status', ['fallback' => $cur['status']]);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => $cur['priority']]);
            $quoteCents = array_key_exists('quote_amount', $input)
                ? V::moneyCents($input['quote_amount'], 'quote_amount', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => (int) $cur['quote_amount_cents']])
                : (int) $cur['quote_amount_cents'];
            $dueDate = array_key_exists('due_date', $input)
                ? V::day($input['due_date'], 'due_date', ['required' => false, 'fallback' => ''])
                : (string) $cur['due_date'];
            $notes = array_key_exists('notes', $input)
                ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 1000])
                : (string) $cur['notes'];

            $db->execute(
                'UPDATE repair_jobs SET technician_id = ?, issue_type = ?, status = ?, priority = ?, quote_amount_cents = ?, due_date = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$techId, $issue, $status, $priority, $quoteCents, $dueDate, $notes, V::now(), $id]
            );
            return ['job' => self::fetchJobRow($db, $id)];
        }, write: true);
    }

    public function advanceJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM repair_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Repair job not found.');
            }
            if (!empty($input['status'])) {
                $nextStage = V::oneOf($input['status'], self::JOB_STAGES, 'status');
            } else {
                $idx = array_search($cur['status'], self::JOB_STAGES, true);
                $nextIdx = min(($idx === false ? 0 : $idx) + 1, count(self::JOB_STAGES) - 1);
                $nextStage = self::JOB_STAGES[$nextIdx];
            }
            $db->execute('UPDATE repair_jobs SET status = ?, updated_at = ? WHERE id = ?', [$nextStage, V::now(), $id]);
            return ['job' => self::fetchJobRow($db, $id)];
        }, write: true);
    }

    public function markJobNotified(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM repair_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Repair job not found.');
            }
            $db->execute('UPDATE repair_jobs SET customer_notified = 1, updated_at = ? WHERE id = ?', [V::now(), $id]);
            $db->execute("UPDATE quality_checks SET notified = 'Yes' WHERE repair_job_id = ?", [$id]);
            return ['job' => self::fetchJobRow($db, $id)];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM repair_jobs WHERE id = ?', [$id])) {
                HttpException::fail(404, 'job_not_found', 'Repair job not found.');
            }
            $db->execute('DELETE FROM quality_checks WHERE repair_job_id = ?', [$id]);
            $db->execute('DELETE FROM parts_orders WHERE repair_job_id = ?', [$id]);
            $db->execute('DELETE FROM repair_jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Parts Orders ----

    public function listParts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizePart'],
                $db->query(
                    'SELECT po.*, j.ticket_code, j.status AS job_status, c.name AS customer_name, d.brand, d.model '
                    . 'FROM parts_orders po '
                    . 'LEFT JOIN repair_jobs j ON j.id = po.repair_job_id '
                    . 'LEFT JOIN customers c ON c.id = j.customer_id '
                    . 'LEFT JOIN devices d ON d.id = j.device_id '
                    . "ORDER BY CASE po.status WHEN 'Ordered' THEN 0 WHEN 'Shipped' THEN 1 WHEN 'Backordered' THEN 2 WHEN 'Arrived' THEN 3 ELSE 4 END, po.eta ASC, po.id DESC LIMIT 200"
                )
            );
            $totalCost = 0;
            foreach ($rows as $r) {
                if (($r['status'] ?? '') !== 'Cancelled') {
                    $totalCost += (int) ($r['cost_cents'] ?? 0);
                }
            }
            return ['parts' => $rows, 'totalCostCents' => $totalCost];
        });
    }

    public function addPartOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['repair_job_id'] ?? null, 'repair_job_id');
            $job = $db->first('SELECT * FROM repair_jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Linked repair job not found.');
            }
            $partName = V::text($input['part_name'] ?? null, 'part_name', ['max' => 160, 'label' => 'Part name']);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $costCents = V::moneyCents($input['cost'] ?? null, 'cost', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0, 'label' => 'Part cost']);
            $tracking = V::text($input['tracking'] ?? null, 'tracking', ['required' => false, 'max' => 100]);
            $eta = V::day($input['eta'] ?? null, 'eta', ['required' => false, 'fallback' => '']);
            $status = V::oneOf($input['status'] ?? null, self::PART_STATUSES, 'status', ['fallback' => 'Ordered']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO parts_orders(repair_job_id, part_name, supplier, cost_cents, tracking, eta, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, $partName, $supplier, $costCents, $tracking, $eta, $status, $ts]
            );
            if (in_array($status, ['Ordered', 'Shipped', 'Backordered'], true) && in_array($job['status'], ['Intake', 'Diagnosing'], true)) {
                $db->execute("UPDATE repair_jobs SET status = 'Awaiting Parts', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            }
            return [
                '__status' => 201,
                '__body' => ['part' => self::normalizePart($db->first('SELECT * FROM parts_orders WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setPartStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM parts_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'part_not_found', 'Parts order not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PART_STATUSES, 'status', ['label' => 'Status']);
            $db->execute('UPDATE parts_orders SET status = ? WHERE id = ?', [$status, $id]);

            // If all non-cancelled parts for this job have arrived/installed and the job was Awaiting Parts, move it to Repairing!
            $jobAdvanced = false;
            if ($status === 'Arrived' || $status === 'Installed') {
                $remaining = $db->first(
                    "SELECT COUNT(*) AS c FROM parts_orders WHERE repair_job_id = ? AND status IN ('Ordered', 'Shipped', 'Backordered')",
                    [(int) $cur['repair_job_id']]
                );
                if ($remaining && (int) $remaining['c'] === 0) {
                    $job = $db->first('SELECT status FROM repair_jobs WHERE id = ?', [(int) $cur['repair_job_id']]);
                    if ($job && $job['status'] === 'Awaiting Parts') {
                        $db->execute("UPDATE repair_jobs SET status = 'Repairing', updated_at = ? WHERE id = ?", [V::now(), (int) $cur['repair_job_id']]);
                        $jobAdvanced = true;
                    }
                }
            }
            return [
                'part' => self::normalizePart($db->first('SELECT * FROM parts_orders WHERE id = ?', [$id])),
                'jobAdvanced' => $jobAdvanced,
            ];
        }, write: true);
    }

    public function deletePartOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM parts_orders WHERE id = ?', [$id])) {
                HttpException::fail(404, 'part_not_found', 'Parts order not found.');
            }
            $db->execute('DELETE FROM parts_orders WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Quality Check & Pickup Desk ----

    public function listQualityChecks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeQa'],
                $db->query(
                    'SELECT qa.*, j.ticket_code, j.status AS job_status, j.quote_amount_cents, j.customer_notified, '
                    . 'c.name AS customer_name, c.phone AS customer_phone, c.preferred_contact, '
                    . 'd.brand, d.model, d.serial, t.name AS checked_by_name '
                    . 'FROM quality_checks qa '
                    . 'LEFT JOIN repair_jobs j ON j.id = qa.repair_job_id '
                    . 'LEFT JOIN customers c ON c.id = j.customer_id '
                    . 'LEFT JOIN devices d ON d.id = j.device_id '
                    . 'LEFT JOIN technicians t ON t.id = qa.checked_by_id '
                    . 'ORDER BY qa.created_at DESC LIMIT 120'
                )
            );
            return ['checks' => $rows];
        });
    }

    public function addQualityCheck(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['repair_job_id'] ?? null, 'repair_job_id');
            $job = $db->first('SELECT * FROM repair_jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Repair job not found.');
            }
            $techId = V::rowId($input['checked_by_id'] ?? null, 'checked_by_id');
            if (!$db->first('SELECT id FROM technicians WHERE id = ?', [$techId])) {
                HttpException::fail(404, 'tech_not_found', 'Technician not found.');
            }

            $checklist = V::listOf($input['checklist'] ?? null, 'checklist', 12, static fn ($v) => V::oneOf($v, self::QA_ITEMS, 'check_item'));
            $result = V::oneOf($input['result'] ?? null, self::QA_RESULTS, 'result', ['fallback' => 'Pass']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $notified = V::oneOf($input['notified'] ?? null, ['Yes', 'Not yet'], 'notified', ['fallback' => 'Not yet']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO quality_checks(repair_job_id, checked_by_id, checklist_json, result, notes, notified, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$jobId, $techId, json_encode($checklist), $result, $notes, $notified, $ts]
            );

            // Automatically route the repair job based on QA Pass / Fail!
            $nextJobStatus = (string) $job['status'];
            if ($result === 'Pass' && $job['status'] !== 'Collected') {
                $nextJobStatus = 'Ready for Pickup';
            } elseif ($result === 'Fail' && $job['status'] !== 'Collected') {
                $nextJobStatus = 'Repairing';
            }
            $notifFlag = ($notified === 'Yes') ? 1 : (int) $job['customer_notified'];
            $db->execute(
                'UPDATE repair_jobs SET status = ?, customer_notified = ?, updated_at = ? WHERE id = ?',
                [$nextJobStatus, $notifFlag, $ts, $jobId]
            );

            $row = $db->first('SELECT * FROM quality_checks WHERE id = ?', [$created['lastInsertRowid']]);
            return [
                '__status' => 201,
                '__body' => [
                    'check' => self::normalizeQa($row),
                    'job' => self::fetchJobRow($db, $jobId),
                ],
            ];
        }, write: true);
    }

    public function markQaNotified(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM quality_checks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'qa_not_found', 'Quality check not found.');
            }
            $db->execute("UPDATE quality_checks SET notified = 'Yes' WHERE id = ?", [$id]);
            $db->execute('UPDATE repair_jobs SET customer_notified = 1, updated_at = ? WHERE id = ?', [V::now(), (int) $cur['repair_job_id']]);
            $row = $db->first('SELECT * FROM quality_checks WHERE id = ?', [$id]);
            return [
                'check' => self::normalizeQa($row),
                'job' => self::fetchJobRow($db, (int) $cur['repair_job_id']),
            ];
        }, write: true);
    }
}
