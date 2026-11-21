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

final class WorkshopController
{
    private const CUST_TYPES = ['Private / Retail', 'Fleet', 'Business', 'Dealer / Trade', 'Insurance'];
    private const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'LPG'];
    private const CARD_STATUSES = ['Booked In', 'Diagnosing', 'Waiting Parts', 'On Hoist', 'Ready for Pickup', 'Collected'];
    private const CARD_PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
    private const INV_STATUSES = ['Draft', 'Sent', 'Paid', 'Overdue'];

    private static function upper(string $s): string
    {
        return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s);
    }

    /** @return array<string, mixed>|null */
    private static function normalizeCustomer(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'vehicle_count', 'card_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeVehicle(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'customer_id', 'year', 'odometer', 'is_sample', 'created_at', 'updated_at', 'card_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeCard(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'vehicle_id', 'customer_id', 'odometer_in', 'vehicle_odometer', 'year', 'is_sample', 'created_at', 'updated_at', 'parts_total_cents', 'parts_count', 'invoice_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('labour_hours', $row) && $row['labour_hours'] !== null) {
            $row['labour_hours'] = (float) $row['labour_hours'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePart(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'job_card_id', 'quantity', 'unit_cost_cents', 'is_sample', 'created_at'] as $col) {
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
        foreach (['id', 'job_card_id', 'customer_id', 'vehicle_id', 'labour_rate_cents', 'labour_cents', 'parts_cents', 'subtotal_cents', 'tax_cents', 'total_cents', 'is_sample', 'created_at', 'updated_at', 'odometer_in', 'year'] as $col) {
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
    private static function fetchCardRow(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT j.*, v.make, v.model, v.year, v.registration, v.odometer AS vehicle_odometer, v.fuel, v.vin, ' .
            'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.customer_type, ' .
            '(SELECT COALESCE(SUM(p.quantity * p.unit_cost_cents), 0) FROM parts_used p WHERE p.job_card_id = j.id) AS parts_total_cents, ' .
            '(SELECT COUNT(*) FROM parts_used p WHERE p.job_card_id = j.id) AS parts_count, ' .
            '(SELECT COUNT(*) FROM invoices i WHERE i.job_card_id = j.id) AS invoice_count ' .
            'FROM job_cards j LEFT JOIN vehicles v ON v.id = j.vehicle_id LEFT JOIN customers c ON c.id = j.customer_id WHERE j.id = ?',
            [$id]
        );
        return self::normalizeCard($row);
    }

    private static function syncVehicleOdometer(Database $db, int $vehicleId, int $odoIn): void
    {
        if ($odoIn <= 0) {
            return;
        }
        $veh = $db->first('SELECT odometer FROM vehicles WHERE id = ?', [$vehicleId]);
        if ($veh && $odoIn > (int) ($veh['odometer'] ?? 0)) {
            $db->execute('UPDATE vehicles SET odometer = ?, updated_at = ? WHERE id = ?', [$odoIn, V::now(), $vehicleId]);
        }
    }

    // ---- Customers ----

    public function listCustomers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $type = V::text($input['customer_type'] ?? null, 'customer_type', ['required' => false, 'max' => 40]);
            $sql = 'SELECT c.*, ' .
                '(SELECT COUNT(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count, ' .
                '(SELECT COUNT(*) FROM job_cards j WHERE j.customer_id = c.id) AS card_count ' .
                'FROM customers c WHERE 1=1';
            $params = [];
            if ($type !== '' && $type !== 'All') {
                $sql .= ' AND c.customer_type = ?';
                $params[] = $type;
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
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $type = V::oneOf($input['customer_type'] ?? null, self::CUST_TYPES, 'customer_type', ['fallback' => 'Private / Retail']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $created = $db->execute(
                'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $phone, $em, $address, $type, $notes, V::now()]
            );
            $row = self::normalizeCustomer($db->first('SELECT * FROM customers WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['customer' => $row]];
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
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
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
            $hasVeh = $db->first('SELECT COUNT(*) AS c FROM vehicles WHERE customer_id = ?', [$id]);
            if ($hasVeh && (int) $hasVeh['c'] > 0) {
                HttpException::fail(409, 'customer_has_vehicles', "Remove this customer's vehicles before deleting the customer.");
            }
            $db->execute('DELETE FROM customers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Vehicles Garage ----

    public function listVehicles(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $custId = V::int($input['customer_id'] ?? null, 'customer_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT v.*, c.name AS customer_name, c.phone AS customer_phone, c.customer_type, ' .
                '(SELECT COUNT(*) FROM job_cards j WHERE j.vehicle_id = v.id) AS card_count ' .
                'FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id WHERE 1=1';
            $params = [];
            if ($custId !== null) {
                $sql .= ' AND v.customer_id = ?';
                $params[] = $custId;
            }
            $sql .= ' ORDER BY v.updated_at DESC, v.id DESC LIMIT 250';
            $rows = array_map([self::class, 'normalizeVehicle'], $db->query($sql, $params));
            return ['vehicles' => $rows];
        });
    }

    public function addVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $custId = V::rowId($input['customer_id'] ?? null, 'customer_id');
            $cust = $db->first('SELECT * FROM customers WHERE id = ?', [$custId]);
            if (!$cust) {
                HttpException::fail(404, 'customer_not_found', 'Customer not found.');
            }
            $make = V::text($input['make'] ?? null, 'make', ['max' => 60, 'label' => 'Make']);
            $model = V::text($input['model'] ?? null, 'model', ['max' => 80, 'label' => 'Model']);
            $year = V::int($input['year'] ?? null, 'year', ['min' => 1950, 'max' => 2028, 'label' => 'Year']);
            $rego = self::upper(V::text($input['registration'] ?? null, 'registration', ['max' => 24, 'label' => 'Registration plate']));
            $odo = V::int($input['odometer'] ?? null, 'odometer', ['required' => false, 'min' => 0, 'max' => 5000000, 'fallback' => 0]) ?? 0;
            $fuel = V::oneOf($input['fuel'] ?? null, self::FUEL_TYPES, 'fuel', ['fallback' => 'Petrol']);
            $vin = self::upper(V::text($input['vin'] ?? null, 'vin', ['required' => false, 'max' => 40]));
            $ts = V::now();
            $created = $db->execute(
                'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$custId, $make, $model, $year, $rego, $odo, $fuel, $vin, $ts, $ts]
            );
            $row = self::normalizeVehicle($db->first('SELECT * FROM vehicles WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['vehicle' => $row]];
        }, write: true);
    }

    public function saveVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vehicles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Vehicle not found.');
            }
            $custId = array_key_exists('customer_id', $input)
                ? V::rowId($input['customer_id'], 'customer_id')
                : (int) $cur['customer_id'];
            if ($custId !== (int) $cur['customer_id']) {
                $cust = $db->first('SELECT id FROM customers WHERE id = ?', [$custId]);
                if (!$cust) {
                    HttpException::fail(404, 'customer_not_found', 'Customer not found.');
                }
            }
            $make = V::text($input['make'] ?? null, 'make', ['max' => 60, 'label' => 'Make']);
            $model = V::text($input['model'] ?? null, 'model', ['max' => 80, 'label' => 'Model']);
            $year = V::int($input['year'] ?? null, 'year', ['min' => 1950, 'max' => 2028, 'label' => 'Year']);
            $rego = self::upper(V::text($input['registration'] ?? null, 'registration', ['max' => 24, 'label' => 'Registration plate']));
            $odo = V::int($input['odometer'] ?? null, 'odometer', ['required' => false, 'min' => 0, 'max' => 5000000, 'fallback' => (int) $cur['odometer']]) ?? (int) $cur['odometer'];
            $fuel = V::oneOf($input['fuel'] ?? null, self::FUEL_TYPES, 'fuel', ['fallback' => $cur['fuel']]);
            $vin = self::upper(V::text($input['vin'] ?? null, 'vin', ['required' => false, 'max' => 40]));
            $db->execute(
                'UPDATE vehicles SET customer_id = ?, make = ?, model = ?, year = ?, registration = ?, odometer = ?, fuel = ?, vin = ?, updated_at = ? WHERE id = ?',
                [$custId, $make, $model, $year, $rego, $odo, $fuel, $vin, V::now(), $id]
            );
            return ['vehicle' => self::normalizeVehicle($db->first('SELECT * FROM vehicles WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vehicles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Vehicle not found.');
            }
            $hasCards = $db->first('SELECT COUNT(*) AS c FROM job_cards WHERE vehicle_id = ?', [$id]);
            if ($hasCards && (int) $hasCards['c'] > 0) {
                HttpException::fail(409, 'vehicle_has_cards', 'Cannot delete a vehicle with existing job cards.');
            }
            $db->execute('DELETE FROM vehicles WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Job Cards & Bay Pipeline ----

    public function listCards(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $priority = V::text($input['priority'] ?? null, 'priority', ['required' => false, 'max' => 20]);
            $sql = 'SELECT j.*, v.make, v.model, v.year, v.registration, v.odometer AS vehicle_odometer, v.fuel, v.vin, ' .
                'c.name AS customer_name, c.phone AS customer_phone, c.customer_type, ' .
                '(SELECT COALESCE(SUM(p.quantity * p.unit_cost_cents), 0) FROM parts_used p WHERE p.job_card_id = j.id) AS parts_total_cents, ' .
                '(SELECT COUNT(*) FROM parts_used p WHERE p.job_card_id = j.id) AS parts_count, ' .
                '(SELECT COUNT(*) FROM invoices i WHERE i.job_card_id = j.id) AS invoice_count ' .
                'FROM job_cards j LEFT JOIN vehicles v ON v.id = j.vehicle_id LEFT JOIN customers c ON c.id = j.customer_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND j.status = ?';
                $params[] = $status;
            }
            if ($priority !== '' && $priority !== 'All') {
                $sql .= ' AND j.priority = ?';
                $params[] = $priority;
            }
            $sql .= " ORDER BY CASE j.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, j.date_in DESC, j.id DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeCard'], $db->query($sql, $params));
            return ['cards' => $rows];
        });
    }

    public function getCardDetail(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $card = self::fetchCardRow($db, $id);
            if (!$card) {
                HttpException::fail(404, 'not_found', 'Job card not found.');
            }
            $parts = array_map(
                [self::class, 'normalizePart'],
                $db->query('SELECT * FROM parts_used WHERE job_card_id = ? ORDER BY created_at ASC', [$id])
            );
            $invoices = array_map(
                [self::class, 'normalizeInvoice'],
                $db->query('SELECT * FROM invoices WHERE job_card_id = ? ORDER BY created_at DESC', [$id])
            );
            return ['card' => $card, 'parts' => $parts, 'invoices' => $invoices];
        });
    }

    public function addCard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $vehId = V::rowId($input['vehicle_id'] ?? null, 'vehicle_id');
            $veh = $db->first('SELECT * FROM vehicles WHERE id = ?', [$vehId]);
            if (!$veh) {
                HttpException::fail(404, 'vehicle_not_found', 'Vehicle not found.');
            }
            $bay = V::text($input['bay_number'] ?? null, 'bay_number', ['required' => false, 'max' => 30]);
            $complaint = V::text($input['complaint'] ?? null, 'complaint', ['max' => 1200, 'label' => 'Complaint / Work Requested']);
            $diagnosis = V::text($input['diagnosis'] ?? null, 'diagnosis', ['required' => false, 'max' => 1200]);
            $status = V::oneOf($input['status'] ?? null, self::CARD_STATUSES, 'status', ['fallback' => 'Booked In']);
            $tech = V::text($input['technician'] ?? null, 'technician', ['required' => false, 'max' => 80]);
            $hrs = V::numVal($input['labour_hours'] ?? null, 'labour_hours', ['required' => false, 'min' => 0, 'max' => 500, 'fallback' => 0]);
            $vehOdo = (int) ($veh['odometer'] ?? 0);
            $odoIn = V::int($input['odometer_in'] ?? null, 'odometer_in', ['required' => false, 'min' => 0, 'max' => 5000000, 'fallback' => $vehOdo]) ?? $vehOdo;
            $prio = V::oneOf($input['priority'] ?? null, self::CARD_PRIORITIES, 'priority', ['fallback' => 'Normal']);
            $dateIn = V::day($input['date_in'] ?? null, 'date_in', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Date in']);

            $nextSeq = (int) ($ctx['settings']['card_seq'] ?? 2000) + 1;
            $db->execute('UPDATE business_settings SET card_seq = ? WHERE id = 1', [$nextSeq]);
            $cardNum = 'JC-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$cardNum, $vehId, (int) $veh['customer_id'], $bay, $complaint, $diagnosis, $status, $tech, $hrs, $odoIn, $prio, $dateIn, $ts, $ts]
            );
            self::syncVehicleOdometer($db, $vehId, $odoIn);
            return ['__status' => 201, '__body' => ['card' => self::fetchCardRow($db, $created['lastInsertRowid'])]];
        }, write: true);
    }

    public function saveCard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM job_cards WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job card not found.');
            }
            $bay = array_key_exists('bay_number', $input)
                ? V::text($input['bay_number'], 'bay_number', ['required' => false, 'max' => 30])
                : (string) $cur['bay_number'];
            $complaint = array_key_exists('complaint', $input)
                ? V::text($input['complaint'], 'complaint', ['max' => 1200, 'label' => 'Complaint'])
                : (string) $cur['complaint'];
            $diagnosis = array_key_exists('diagnosis', $input)
                ? V::text($input['diagnosis'], 'diagnosis', ['required' => false, 'max' => 1200])
                : (string) $cur['diagnosis'];
            $status = V::oneOf($input['status'] ?? null, self::CARD_STATUSES, 'status', ['fallback' => $cur['status']]);
            $tech = array_key_exists('technician', $input)
                ? V::text($input['technician'], 'technician', ['required' => false, 'max' => 80])
                : (string) $cur['technician'];
            $hrs = array_key_exists('labour_hours', $input)
                ? V::numVal($input['labour_hours'], 'labour_hours', ['min' => 0, 'max' => 500])
                : (float) $cur['labour_hours'];
            $odoIn = array_key_exists('odometer_in', $input)
                ? (V::int($input['odometer_in'], 'odometer_in', ['required' => false, 'min' => 0, 'max' => 5000000, 'fallback' => (int) $cur['odometer_in']]) ?? (int) $cur['odometer_in'])
                : (int) $cur['odometer_in'];
            $prio = V::oneOf($input['priority'] ?? null, self::CARD_PRIORITIES, 'priority', ['fallback' => $cur['priority']]);
            $dateIn = V::day($input['date_in'] ?? null, 'date_in', ['required' => false, 'fallback' => (string) $cur['date_in']]);

            $db->execute(
                'UPDATE job_cards SET bay_number = ?, complaint = ?, diagnosis = ?, status = ?, technician = ?, labour_hours = ?, odometer_in = ?, priority = ?, date_in = ?, updated_at = ? WHERE id = ?',
                [$bay, $complaint, $diagnosis, $status, $tech, $hrs, $odoIn, $prio, $dateIn, V::now(), $id]
            );
            self::syncVehicleOdometer($db, (int) $cur['vehicle_id'], $odoIn);
            return ['card' => self::fetchCardRow($db, $id)];
        }, write: true);
    }

    public function setCardStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM job_cards WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job card not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::CARD_STATUSES, 'status');
            $db->execute('UPDATE job_cards SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['card' => self::fetchCardRow($db, $id)];
        }, write: true);
    }

    public function deleteCard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM job_cards WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job card not found.');
            }
            $db->execute('DELETE FROM parts_used WHERE job_card_id = ?', [$id]);
            $db->execute('DELETE FROM invoices WHERE job_card_id = ?', [$id]);
            $db->execute('DELETE FROM job_cards WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Parts Used Log ----

    public function listParts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cardId = V::int($input['job_card_id'] ?? null, 'job_card_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT p.*, j.card_number, v.registration, v.make, v.model, c.name AS customer_name ' .
                'FROM parts_used p LEFT JOIN job_cards j ON j.id = p.job_card_id ' .
                'LEFT JOIN vehicles v ON v.id = j.vehicle_id LEFT JOIN customers c ON c.id = j.customer_id WHERE 1=1';
            $params = [];
            if ($cardId !== null) {
                $sql .= ' AND p.job_card_id = ?';
                $params[] = $cardId;
            }
            $sql .= ' ORDER BY p.created_at DESC LIMIT 250';
            $rows = array_map([self::class, 'normalizePart'], $db->query($sql, $params));
            return ['parts' => $rows];
        });
    }

    public function addPart(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cardId = V::rowId($input['job_card_id'] ?? null, 'job_card_id');
            $card = $db->first('SELECT * FROM job_cards WHERE id = ?', [$cardId]);
            if (!$card) {
                HttpException::fail(404, 'card_not_found', 'Job card not found.');
            }
            $partName = V::text($input['part_name'] ?? null, 'part_name', ['max' => 140, 'label' => 'Part name']);
            $partNumber = self::upper(V::text($input['part_number'] ?? null, 'part_number', ['required' => false, 'max' => 60]));
            $qty = V::int($input['quantity'] ?? null, 'quantity', ['required' => false, 'min' => 1, 'max' => 999, 'fallback' => 1]) ?? 1;
            $unitCost = V::moneyCents($input['unit_cost'] ?? null, 'unit_cost', ['min' => 0, 'max' => 50000000, 'label' => 'Unit cost']);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $created = $db->execute(
                'INSERT INTO parts_used(job_card_id, part_name, part_number, quantity, unit_cost_cents, supplier, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$cardId, $partName, $partNumber, $qty, $unitCost, $supplier, V::now()]
            );
            $row = self::normalizePart($db->first('SELECT * FROM parts_used WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['part' => $row]];
        }, write: true);
    }

    public function deletePart(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM parts_used WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Part record not found.');
            }
            $db->execute('DELETE FROM parts_used WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Workshop Invoices ----

    public function listInvoices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT i.*, j.card_number, j.complaint, j.diagnosis, j.technician, j.odometer_in, ' .
                'v.make, v.model, v.year, v.registration, v.vin, ' .
                'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address ' .
                'FROM invoices i LEFT JOIN job_cards j ON j.id = i.job_card_id ' .
                'LEFT JOIN vehicles v ON v.id = i.vehicle_id LEFT JOIN customers c ON c.id = i.customer_id WHERE 1=1';
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

    public function getInvoiceDetail(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $inv = self::normalizeInvoice($db->first(
                'SELECT i.*, j.card_number, j.complaint, j.diagnosis, j.technician, j.odometer_in, ' .
                'v.make, v.model, v.year, v.registration, v.vin, v.fuel, ' .
                'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address ' .
                'FROM invoices i LEFT JOIN job_cards j ON j.id = i.job_card_id ' .
                'LEFT JOIN vehicles v ON v.id = i.vehicle_id LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?',
                [$id]
            ));
            if (!$inv) {
                HttpException::fail(404, 'not_found', 'Invoice not found.');
            }
            $parts = array_map(
                [self::class, 'normalizePart'],
                $db->query('SELECT * FROM parts_used WHERE job_card_id = ? ORDER BY created_at ASC', [(int) $inv['job_card_id']])
            );
            return ['invoice' => $inv, 'parts' => $parts];
        });
    }

    public function generateInvoiceFromCard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $cardId = V::rowId($input['job_card_id'] ?? null, 'job_card_id');
            $card = $db->first('SELECT * FROM job_cards WHERE id = ?', [$cardId]);
            if (!$card) {
                HttpException::fail(404, 'card_not_found', 'Job card not found.');
            }

            $partsAgg = $db->first('SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) AS pts FROM parts_used WHERE job_card_id = ?', [$cardId]);
            $hrs = (array_key_exists('labour_hours', $input) && $input['labour_hours'] !== '' && $input['labour_hours'] !== null)
                ? V::numVal($input['labour_hours'], 'labour_hours', ['min' => 0, 'max' => 500])
                : (float) ($card['labour_hours'] ?? 0);
            $rateCents = (array_key_exists('labour_rate', $input) && $input['labour_rate'] !== '' && $input['labour_rate'] !== null)
                ? V::moneyCents($input['labour_rate'], 'labour_rate', ['min' => 0, 'max' => 500000])
                : (int) ($ctx['settings']['workshop_rate_cents'] ?? 13500);

            $labourCents = (int) round($hrs * $rateCents);
            $partsCents = $partsAgg ? (int) $partsAgg['pts'] : 0;
            $subtotalCents = $labourCents + $partsCents;
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            $taxCents = (int) round($subtotalCents * ($taxRate / 100.0));
            $totalCents = $subtotalCents + $taxCents;

            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600])
                ?: (string) ($card['diagnosis'] ?: $card['complaint']);

            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = 'WINV-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO invoices(invoice_number, job_card_id, customer_id, vehicle_id, issue_date, labour_hours, labour_rate_cents, labour_cents, parts_cents, subtotal_cents, tax_rate, tax_cents, total_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent', ?, 0, ?, ?)",
                [$invNum, $cardId, (int) $card['customer_id'], (int) $card['vehicle_id'], $issueDate, $hrs, $rateCents, $labourCents, $partsCents, $subtotalCents, $taxRate, $taxCents, $totalCents, $notes, $ts, $ts]
            );
            if (($card['status'] ?? '') !== 'Collected') {
                $db->execute("UPDATE job_cards SET status = 'Ready for Pickup', labour_hours = ?, updated_at = ? WHERE id = ?", [$hrs, $ts, $cardId]);
            }
            $inv = self::normalizeInvoice($db->first(
                'SELECT i.*, j.card_number, v.registration, v.make, v.model, c.name AS customer_name ' .
                'FROM invoices i LEFT JOIN job_cards j ON j.id = i.job_card_id ' .
                'LEFT JOIN vehicles v ON v.id = i.vehicle_id LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?',
                [$created['lastInsertRowid']]
            ));
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
            $ts = V::now();
            $db->execute('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?', [$status, $ts, $id]);
            if ($status === 'Paid') {
                $db->execute("UPDATE job_cards SET status = 'Collected', updated_at = ? WHERE id = ? AND status = 'Ready for Pickup'", [$ts, (int) $cur['job_card_id']]);
            }
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
