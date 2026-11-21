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

final class FleetController
{
    private const VEH_STATUSES = ['Available', 'In use', 'Maintenance', 'Out of service'];
    private const LICENCE_CLASSES = ['Car', 'Light rigid', 'Medium rigid', 'Heavy rigid'];
    private const PURPOSES = ['Delivery', 'Site visit', 'Client transport', 'Maintenance run', 'Other'];
    private const USAGE = ['Business', 'Personal'];
    private const MAINT_TYPES = ['Service', 'Tyres', 'Brakes', 'Repair', 'Inspection', 'Registration check'];
    private const MAINT_STATUSES = ['Scheduled', 'Booked', 'Due', 'In Workshop', 'Completed'];
    private const INC_TYPES = ['Collision', 'Near miss', 'Damage', 'Breakdown', 'Fine or infringement'];
    private const SEVERITIES = ['Low', 'Medium', 'High'];
    private const INC_STATUSES = ['Reported', 'Under review', 'Resolved'];

    private static function enrichVehicle(?array $v, string $todayDay): ?array
    {
        if ($v === null) {
            return null;
        }
        $v['id'] = (int) $v['id'];
        $v['year'] = (int) $v['year'];
        $v['odometer_km'] = (int) $v['odometer_km'];
        $v['is_sample'] = (int) $v['is_sample'];
        $v['created_at'] = (int) $v['created_at'];
        $v['updated_at'] = (int) $v['updated_at'];
        if (array_key_exists('trip_count', $v)) {
            $v['trip_count'] = (int) $v['trip_count'];
        }
        if (array_key_exists('logged_km', $v)) {
            $v['logged_km'] = (int) $v['logged_km'];
        }
        if (array_key_exists('fuel_cents', $v)) {
            $v['fuel_cents'] = (int) $v['fuel_cents'];
        }
        $regoExp = (string) ($v['rego_expiry'] ?? '');
        $insExp = (string) ($v['insurance_expiry'] ?? '');
        $v['rego_days_left'] = $regoExp !== '' ? WorkspaceController::daysBetween($todayDay, $regoExp) : null;
        $v['insurance_days_left'] = $insExp !== '' ? WorkspaceController::daysBetween($todayDay, $insExp) : null;
        return $v;
    }

    private static function enrichDriver(?array $d, string $todayDay): ?array
    {
        if ($d === null) {
            return null;
        }
        $d['id'] = (int) $d['id'];
        $d['is_sample'] = (int) $d['is_sample'];
        $d['created_at'] = (int) $d['created_at'];
        if (array_key_exists('trip_count', $d)) {
            $d['trip_count'] = (int) $d['trip_count'];
        }
        if (array_key_exists('driven_km', $d)) {
            $d['driven_km'] = (int) $d['driven_km'];
        }
        $licExp = (string) ($d['licence_expiry'] ?? '');
        $d['licence_days_left'] = $licExp !== '' ? WorkspaceController::daysBetween($todayDay, $licExp) : null;
        return $d;
    }

    private static function enrichTrip(?array $tr): ?array
    {
        if ($tr === null) {
            return null;
        }
        $tr['id'] = (int) $tr['id'];
        $tr['vehicle_id'] = (int) $tr['vehicle_id'];
        $tr['driver_id'] = (int) $tr['driver_id'];
        $tr['start_odometer'] = (int) $tr['start_odometer'];
        $tr['end_odometer'] = (int) $tr['end_odometer'];
        $tr['distance_km'] = (int) $tr['distance_km'];
        $tr['fuel_cost_cents'] = (int) $tr['fuel_cost_cents'];
        $tr['is_sample'] = (int) $tr['is_sample'];
        $tr['created_at'] = (int) $tr['created_at'];
        $dist = $tr['distance_km'];
        $fuel = $tr['fuel_cost_cents'];
        $tr['fuel_cents_per_km'] = $dist > 0 ? round(($fuel / $dist) * 10.0) / 10.0 : 0;
        return $tr;
    }

    private static function enrichMaintenance(?array $job): ?array
    {
        if ($job === null) {
            return null;
        }
        $job['id'] = (int) $job['id'];
        $job['vehicle_id'] = (int) $job['vehicle_id'];
        $job['cost_cents'] = (int) $job['cost_cents'];
        $job['is_sample'] = (int) $job['is_sample'];
        $job['created_at'] = (int) $job['created_at'];
        $job['updated_at'] = (int) $job['updated_at'];
        return $job;
    }

    private static function enrichIncident(?array $inc): ?array
    {
        if ($inc === null) {
            return null;
        }
        $inc['id'] = (int) $inc['id'];
        $inc['vehicle_id'] = (int) $inc['vehicle_id'];
        $inc['driver_id'] = (int) $inc['driver_id'];
        $inc['is_sample'] = (int) $inc['is_sample'];
        $inc['created_at'] = (int) $inc['created_at'];
        $inc['updated_at'] = (int) $inc['updated_at'];
        return $inc;
    }

    // ---- Compliance Command Overview & 1-Click Date Renewal ----

    public function getCompliance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $alerts = WorkspaceController::scanComplianceAlerts($db, $todayDay);
            $counts = WorkspaceController::readBadgeCounts($db, $todayDay);

            $openMaintenance = $db->query(
                "SELECT * FROM maintenance_jobs WHERE status != 'Completed' ORDER BY CASE status WHEN 'In Workshop' THEN 0 ELSE 1 END, due_date ASC LIMIT 15"
            );
            foreach ($openMaintenance as &$m) {
                $m = self::enrichMaintenance($m);
            }
            unset($m);

            $openIncidents = $db->query(
                "SELECT * FROM incidents WHERE status != 'Resolved' ORDER BY CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, incident_date DESC LIMIT 15"
            );
            foreach ($openIncidents as &$inc) {
                $inc = self::enrichIncident($inc);
            }
            unset($inc);

            $recentTrips = $db->query('SELECT * FROM trips ORDER BY trip_date DESC, created_at DESC LIMIT 8');
            foreach ($recentTrips as &$tr) {
                $tr = self::enrichTrip($tr);
            }
            unset($tr);

            return [
                'today' => $todayDay,
                'counts' => $counts,
                'alerts' => $alerts,
                'openMaintenance' => $openMaintenance,
                'openIncidents' => $openIncidents,
                'recentTrips' => $recentTrips,
            ];
        });
    }

    public function renewComplianceDate(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $kind = V::oneOf($input['kind'] ?? null, ['rego', 'insurance', 'licence'], 'kind');
            $id = V::rowId($input['id'] ?? null);
            $newExpiry = V::day($input['new_expiry'] ?? null, 'new_expiry', ['label' => 'New expiry date']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            if ($kind === 'rego' || $kind === 'insurance') {
                $v = $db->first('SELECT * FROM vehicles WHERE id = ?', [$id]);
                if (!$v) {
                    HttpException::fail(404, 'vehicle_not_found', 'Vehicle not found.');
                }
                if ($kind === 'rego') {
                    $db->execute('UPDATE vehicles SET rego_expiry = ?, updated_at = ? WHERE id = ?', [$newExpiry, V::now(), $id]);
                } else {
                    $db->execute('UPDATE vehicles SET insurance_expiry = ?, updated_at = ? WHERE id = ?', [$newExpiry, V::now(), $id]);
                }
                return [
                    'vehicle' => self::enrichVehicle($db->first('SELECT * FROM vehicles WHERE id = ?', [$id]), $todayDay),
                    'counts' => WorkspaceController::readBadgeCounts($db, $todayDay),
                ];
            }

            $d = $db->first('SELECT * FROM drivers WHERE id = ?', [$id]);
            if (!$d) {
                HttpException::fail(404, 'driver_not_found', 'Driver not found.');
            }
            $db->execute('UPDATE drivers SET licence_expiry = ? WHERE id = ?', [$newExpiry, $id]);
            return [
                'driver' => self::enrichDriver($db->first('SELECT * FROM drivers WHERE id = ?', [$id]), $todayDay),
                'counts' => WorkspaceController::readBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }

    // ---- Vehicles Register ----

    public function listVehicles(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT v.*, '
                . '(SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id) AS trip_count, '
                . '(SELECT COALESCE(SUM(t.distance_km), 0) FROM trips t WHERE t.vehicle_id = v.id) AS logged_km, '
                . '(SELECT COALESCE(SUM(t.fuel_cost_cents), 0) FROM trips t WHERE t.vehicle_id = v.id) AS fuel_cents '
                . 'FROM vehicles v WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND v.status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY v.vehicle_name ASC';
            $rows = $db->query($sql, $params);
            foreach ($rows as &$row) {
                $row = self::enrichVehicle($row, $todayDay);
            }
            unset($row);
            return ['vehicles' => $rows];
        });
    }

    public function addVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['vehicle_name'] ?? null, 'vehicle_name', ['max' => 120, 'label' => 'Vehicle name']);
            $rego = strtoupper(V::text($input['registration'] ?? null, 'registration', ['required' => false, 'max' => 30]));
            $makeModel = V::text($input['make_model'] ?? null, 'make_model', ['required' => false, 'max' => 120]);
            $year = V::int($input['year'] ?? null, 'year', ['required' => false, 'min' => 1980, 'max' => 2040, 'fallback' => 2023]) ?? 2023;
            $odo = V::int($input['odometer_km'] ?? null, 'odometer_km', ['required' => false, 'min' => 0, 'max' => 9999999, 'fallback' => 0]) ?? 0;
            $status = V::oneOf($input['status'] ?? null, self::VEH_STATUSES, 'status', ['fallback' => 'Available']);
            $regoExp = V::day($input['rego_expiry'] ?? null, 'rego_expiry', ['required' => false, 'fallback' => '']);
            $insExp = V::day($input['insurance_expiry'] ?? null, 'insurance_expiry', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO vehicles(vehicle_name, registration, make_model, year, odometer_km, status, rego_expiry, insurance_expiry, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$name, $rego, $makeModel, $year, $odo, $status, $regoExp, $insExp, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['vehicle' => self::enrichVehicle($db->first('SELECT * FROM vehicles WHERE id = ?', [$created['lastInsertRowid']]), V::utcDay(0))],
            ];
        }, write: true);
    }

    public function saveVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vehicles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'vehicle_not_found', 'Vehicle not found.');
            }
            $name = V::text($input['vehicle_name'] ?? null, 'vehicle_name', ['max' => 120, 'label' => 'Vehicle name']);
            $rego = strtoupper(V::text($input['registration'] ?? null, 'registration', ['required' => false, 'max' => 30]));
            $makeModel = V::text($input['make_model'] ?? null, 'make_model', ['required' => false, 'max' => 120]);
            $year = V::int($input['year'] ?? null, 'year', ['required' => false, 'min' => 1980, 'max' => 2040, 'fallback' => (int) $cur['year']]) ?? (int) $cur['year'];
            $odo = V::int($input['odometer_km'] ?? null, 'odometer_km', ['required' => false, 'min' => 0, 'max' => 9999999, 'fallback' => (int) $cur['odometer_km']]) ?? (int) $cur['odometer_km'];
            $status = V::oneOf($input['status'] ?? null, self::VEH_STATUSES, 'status', ['fallback' => $cur['status']]);
            $regoExp = V::day($input['rego_expiry'] ?? null, 'rego_expiry', ['required' => false, 'fallback' => '']);
            $insExp = V::day($input['insurance_expiry'] ?? null, 'insurance_expiry', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE vehicles SET vehicle_name = ?, registration = ?, make_model = ?, year = ?, odometer_km = ?, status = ?, rego_expiry = ?, insurance_expiry = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$name, $rego, $makeModel, $year, $odo, $status, $regoExp, $insExp, $notes, V::now(), $id]
            );
            $db->execute('UPDATE trips SET vehicle_name = ?, registration = ? WHERE vehicle_id = ?', [$name, $rego, $id]);
            $db->execute('UPDATE maintenance_jobs SET vehicle_name = ?, registration = ? WHERE vehicle_id = ?', [$name, $rego, $id]);
            $db->execute('UPDATE incidents SET vehicle_name = ?, registration = ? WHERE vehicle_id = ?', [$name, $rego, $id]);

            return ['vehicle' => self::enrichVehicle($db->first('SELECT * FROM vehicles WHERE id = ?', [$id]), V::utcDay(0))];
        }, write: true);
    }

    public function deleteVehicle(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vehicles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'vehicle_not_found', 'Vehicle not found.');
            }
            $db->execute('DELETE FROM vehicles WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Drivers Directory ----

    public function listDrivers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query(
                'SELECT d.*, '
                . '(SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id) AS trip_count, '
                . '(SELECT COALESCE(SUM(t.distance_km), 0) FROM trips t WHERE t.driver_id = d.id) AS driven_km '
                . "FROM drivers d ORDER BY CASE d.active WHEN 'Active' THEN 0 ELSE 1 END, d.driver_name ASC"
            );
            foreach ($rows as &$row) {
                $row = self::enrichDriver($row, $todayDay);
            }
            unset($row);
            return ['drivers' => $rows];
        });
    }

    public function addDriver(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['driver_name'] ?? null, 'driver_name', ['max' => 120, 'label' => 'Driver name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $licClass = V::oneOf($input['licence_class'] ?? null, self::LICENCE_CLASSES, 'licence_class', ['fallback' => 'Car']);
            $licExp = V::day($input['licence_expiry'] ?? null, 'licence_expiry', ['required' => false, 'fallback' => '']);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => 'Active']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                'INSERT INTO drivers(driver_name, phone, email, licence_class, licence_expiry, active, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $phone, $em, $licClass, $licExp, $active, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['driver' => self::enrichDriver($db->first('SELECT * FROM drivers WHERE id = ?', [$created['lastInsertRowid']]), V::utcDay(0))],
            ];
        }, write: true);
    }

    public function saveDriver(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM drivers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'driver_not_found', 'Driver not found.');
            }
            $name = V::text($input['driver_name'] ?? null, 'driver_name', ['max' => 120, 'label' => 'Driver name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $licClass = V::oneOf($input['licence_class'] ?? null, self::LICENCE_CLASSES, 'licence_class', ['fallback' => $cur['licence_class']]);
            $licExp = V::day($input['licence_expiry'] ?? null, 'licence_expiry', ['required' => false, 'fallback' => '']);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => $cur['active']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $db->execute(
                'UPDATE drivers SET driver_name = ?, phone = ?, email = ?, licence_class = ?, licence_expiry = ?, active = ?, notes = ? WHERE id = ?',
                [$name, $phone, $em, $licClass, $licExp, $active, $notes, $id]
            );
            $db->execute('UPDATE trips SET driver_name = ? WHERE driver_id = ?', [$name, $id]);
            $db->execute('UPDATE incidents SET driver_name = ? WHERE driver_id = ?', [$name, $id]);
            return ['driver' => self::enrichDriver($db->first('SELECT * FROM drivers WHERE id = ?', [$id]), V::utcDay(0))];
        }, write: true);
    }

    public function deleteDriver(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM drivers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'driver_not_found', 'Driver not found.');
            }
            $db->execute('DELETE FROM drivers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Trip & Fuel Logbook (Auto-Odometer Sync + FBT Business/Personal Metrics!) ----

    public function listTrips(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $vehicleId = V::int($input['vehicle_id'] ?? null, 'vehicle_id', ['required' => false, 'min' => 1]);
            $usage = V::text($input['usage_class'] ?? null, 'usage_class', ['required' => false, 'max' => 20]);
            $purpose = V::text($input['purpose'] ?? null, 'purpose', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM trips WHERE 1=1';
            $params = [];
            if ($vehicleId !== null) {
                $sql .= ' AND vehicle_id = ?';
                $params[] = $vehicleId;
            }
            if ($usage !== '' && $usage !== 'All') {
                $sql .= ' AND usage_class = ?';
                $params[] = $usage;
            }
            if ($purpose !== '' && $purpose !== 'All') {
                $sql .= ' AND purpose = ?';
                $params[] = $purpose;
            }
            $sql .= ' ORDER BY trip_date DESC, created_at DESC LIMIT 200';
            $rows = $db->query($sql, $params);
            $totalKm = 0;
            $bizKm = 0;
            $totalFuel = 0;
            foreach ($rows as &$row) {
                $row = self::enrichTrip($row);
                $totalKm += $row['distance_km'];
                if ($row['usage_class'] === 'Business') {
                    $bizKm += $row['distance_km'];
                }
                $totalFuel += $row['fuel_cost_cents'];
            }
            unset($row);

            return [
                'trips' => $rows,
                'summary' => [
                    'count' => count($rows),
                    'totalKm' => $totalKm,
                    'businessKm' => $bizKm,
                    'personalKm' => $totalKm - $bizKm,
                    'businessPct' => $totalKm > 0 ? round(($bizKm / $totalKm) * 1000.0) / 10.0 : 0,
                    'totalFuelCents' => $totalFuel,
                    'fuelCentsPerKm' => $totalKm > 0 ? round(($totalFuel / $totalKm) * 10.0) / 10.0 : 0,
                ],
            ];
        });
    }

    public function addTrip(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $vehId = V::rowId($input['vehicle_id'] ?? null, 'vehicle_id');
            $veh = $db->first('SELECT * FROM vehicles WHERE id = ?', [$vehId]);
            if (!$veh) {
                HttpException::fail(422, 'vehicle_invalid', 'Select a valid vehicle.', 'vehicle_id');
            }

            $drvId = V::rowId($input['driver_id'] ?? null, 'driver_id');
            $drv = $db->first('SELECT * FROM drivers WHERE id = ?', [$drvId]);
            if (!$drv) {
                HttpException::fail(422, 'driver_invalid', 'Select a valid driver.', 'driver_id');
            }

            $curVehOdo = (int) ($veh['odometer_km'] ?? 0);
            $tripDate = V::day($input['trip_date'] ?? null, 'trip_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Trip date']);
            $startOdo = V::int($input['start_odometer'] ?? null, 'start_odometer', ['required' => false, 'min' => 0, 'max' => 9999999, 'fallback' => $curVehOdo]) ?? $curVehOdo;
            $endOdo = V::int($input['end_odometer'] ?? null, 'end_odometer', ['min' => 0, 'max' => 9999999, 'label' => 'End odometer']) ?? 0;
            if ($endOdo < $startOdo) {
                HttpException::fail(422, 'odometer_order', "End odometer ({$endOdo}) cannot be less than start odometer ({$startOdo}).", 'end_odometer');
            }
            $distanceKm = $endOdo - $startOdo;
            $purpose = V::oneOf($input['purpose'] ?? null, self::PURPOSES, 'purpose', ['fallback' => 'Delivery']);
            $usage = V::oneOf($input['usage_class'] ?? null, self::USAGE, 'usage_class', ['fallback' => 'Business']);
            $dest = V::text($input['destination'] ?? null, 'destination', ['required' => false, 'max' => 200]);
            $fuelCents = V::moneyCents($input['fuel_cost'] ?? null, 'fuel_cost', ['required' => false, 'min' => 0, 'max' => 5000000, 'fallback' => 0, 'label' => 'Fuel cost']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO trips(vehicle_id, vehicle_name, registration, driver_id, driver_name, trip_date, start_odometer, end_odometer, distance_km, purpose, usage_class, destination, fuel_cost_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [(int) $veh['id'], $veh['vehicle_name'], $veh['registration'], (int) $drv['id'], $drv['driver_name'], $tripDate, $startOdo, $endOdo, $distanceKm, $purpose, $usage, $dest, $fuelCents, $notes, $ts]
            );

            // AUTOMATICALLY sync Vehicle odometer whenever Trip end_odometer is higher!
            $odoUpdated = false;
            if ($endOdo > $curVehOdo) {
                $db->execute('UPDATE vehicles SET odometer_km = ?, updated_at = ? WHERE id = ?', [$endOdo, $ts, (int) $veh['id']]);
                $odoUpdated = true;
            }

            $row = self::enrichTrip($db->first('SELECT * FROM trips WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => [
                    'trip' => $row,
                    'vehicleOdometerUpdated' => $odoUpdated,
                    'newVehicleOdometer' => $odoUpdated ? $endOdo : $curVehOdo,
                ],
            ];
        }, write: true);
    }

    public function saveTrip(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM trips WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'trip_not_found', 'Trip not found.');
            }

            $tripDate = V::day($input['trip_date'] ?? null, 'trip_date', ['required' => false, 'fallback' => (string) $cur['trip_date']]);
            $startOdo = V::int($input['start_odometer'] ?? null, 'start_odometer', ['required' => false, 'min' => 0, 'max' => 9999999, 'fallback' => (int) $cur['start_odometer']]) ?? (int) $cur['start_odometer'];
            $endOdo = V::int($input['end_odometer'] ?? null, 'end_odometer', ['required' => false, 'min' => 0, 'max' => 9999999, 'fallback' => (int) $cur['end_odometer']]) ?? (int) $cur['end_odometer'];
            if ($endOdo < $startOdo) {
                HttpException::fail(422, 'odometer_order', 'End odometer cannot be less than start odometer.', 'end_odometer');
            }
            $dist = $endOdo - $startOdo;
            $purpose = V::oneOf($input['purpose'] ?? null, self::PURPOSES, 'purpose', ['fallback' => $cur['purpose']]);
            $usage = V::oneOf($input['usage_class'] ?? null, self::USAGE, 'usage_class', ['fallback' => $cur['usage_class']]);
            $dest = V::text($input['destination'] ?? null, 'destination', ['required' => false, 'max' => 200]);
            $hasFuel = array_key_exists('fuel_cost', $input) && $input['fuel_cost'] !== null && $input['fuel_cost'] !== '';
            $fuelCents = $hasFuel
                ? V::moneyCents($input['fuel_cost'], 'fuel_cost', ['min' => 0, 'max' => 5000000])
                : (int) $cur['fuel_cost_cents'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE trips SET trip_date = ?, start_odometer = ?, end_odometer = ?, distance_km = ?, purpose = ?, usage_class = ?, destination = ?, fuel_cost_cents = ?, notes = ? WHERE id = ?',
                [$tripDate, $startOdo, $endOdo, $dist, $purpose, $usage, $dest, $fuelCents, $notes, $id]
            );
            $veh = $db->first('SELECT odometer_km FROM vehicles WHERE id = ?', [(int) $cur['vehicle_id']]);
            if ($veh && $endOdo > (int) ($veh['odometer_km'] ?? 0)) {
                $db->execute('UPDATE vehicles SET odometer_km = ?, updated_at = ? WHERE id = ?', [$endOdo, V::now(), (int) $cur['vehicle_id']]);
            }
            return ['trip' => self::enrichTrip($db->first('SELECT * FROM trips WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTrip(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM trips WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'trip_not_found', 'Trip not found.');
            }
            $db->execute('DELETE FROM trips WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Maintenance Schedule ----

    public function listMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM maintenance_jobs WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE status WHEN 'In Workshop' THEN 0 WHEN 'Scheduled' THEN 1 WHEN 'Booked' THEN 2 WHEN 'Due' THEN 3 ELSE 4 END, due_date ASC, created_at DESC LIMIT 150";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$row) {
                $row = self::enrichMaintenance($row);
            }
            unset($row);
            return ['jobs' => $rows];
        });
    }

    public function addMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $vehId = V::rowId($input['vehicle_id'] ?? null, 'vehicle_id');
            $veh = $db->first('SELECT * FROM vehicles WHERE id = ?', [$vehId]);
            if (!$veh) {
                HttpException::fail(422, 'vehicle_invalid', 'Select a valid vehicle.', 'vehicle_id');
            }
            $mType = V::oneOf($input['maintenance_type'] ?? null, self::MAINT_TYPES, 'maintenance_type', ['fallback' => 'Service']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $completedDate = V::day($input['completed_date'] ?? null, 'completed_date', ['required' => false, 'fallback' => '']);
            $costCents = V::moneyCents($input['cost'] ?? null, 'cost', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0]);
            $status = V::oneOf($input['status'] ?? null, self::MAINT_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 140]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            if ($status === 'Completed' && $completedDate === '') {
                $completedDate = V::utcDay(0);
            }
            $created = $db->execute(
                'INSERT INTO maintenance_jobs(vehicle_id, vehicle_name, registration, maintenance_type, due_date, completed_date, cost_cents, status, supplier, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [(int) $veh['id'], $veh['vehicle_name'], $veh['registration'], $mType, $dueDate, $completedDate, $costCents, $status, $supplier, $notes, $ts, $ts]
            );
            if ($status === 'In Workshop') {
                $db->execute("UPDATE vehicles SET status = 'Maintenance', updated_at = ? WHERE id = ?", [$ts, (int) $veh['id']]);
            }
            return [
                '__status' => 201,
                '__body' => ['job' => self::enrichMaintenance($db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Maintenance job not found.');
            }
            $mType = V::oneOf($input['maintenance_type'] ?? null, self::MAINT_TYPES, 'maintenance_type', ['fallback' => $cur['maintenance_type']]);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => (string) $cur['due_date']]);
            $completedDate = V::day($input['completed_date'] ?? null, 'completed_date', ['required' => false, 'fallback' => (string) $cur['completed_date']]);
            $hasCost = array_key_exists('cost', $input) && $input['cost'] !== null && $input['cost'] !== '';
            $costCents = $hasCost
                ? V::moneyCents($input['cost'], 'cost', ['min' => 0, 'max' => 50000000])
                : (int) $cur['cost_cents'];
            $status = V::oneOf($input['status'] ?? null, self::MAINT_STATUSES, 'status', ['fallback' => $cur['status']]);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 140]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE maintenance_jobs SET maintenance_type = ?, due_date = ?, completed_date = ?, cost_cents = ?, status = ?, supplier = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$mType, $dueDate, $completedDate, $costCents, $status, $supplier, $notes, V::now(), $id]
            );
            return ['job' => self::enrichMaintenance($db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setMaintenanceStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Maintenance job not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::MAINT_STATUSES, 'status');
            $compDate = $status === 'Completed'
                ? V::day($input['completed_date'] ?? null, 'completed_date', ['required' => false, 'fallback' => V::utcDay(0)])
                : (string) $cur['completed_date'];
            $ts = V::now();

            $db->execute(
                'UPDATE maintenance_jobs SET status = ?, completed_date = ?, updated_at = ? WHERE id = ?',
                [$status, $compDate, $ts, $id]
            );

            // Sync vehicle availability cleanly when moving into or out of Workshop
            if ($status === 'In Workshop') {
                $db->execute("UPDATE vehicles SET status = 'Maintenance', updated_at = ? WHERE id = ?", [$ts, (int) $cur['vehicle_id']]);
            } elseif ($status === 'Completed') {
                $otherOpen = $db->first(
                    "SELECT COUNT(*) AS c FROM maintenance_jobs WHERE vehicle_id = ? AND status = 'In Workshop' AND id != ?",
                    [(int) $cur['vehicle_id'], $id]
                );
                if (!$otherOpen || (int) $otherOpen['c'] === 0) {
                    $db->execute("UPDATE vehicles SET status = 'Available', updated_at = ? WHERE id = ? AND status = 'Maintenance'", [$ts, (int) $cur['vehicle_id']]);
                }
            }

            return ['job' => self::enrichMaintenance($db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'job_not_found', 'Maintenance job not found.');
            }
            $db->execute('DELETE FROM maintenance_jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Incident Reports ----

    public function listIncidents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sev = V::text($input['severity'] ?? null, 'severity', ['required' => false, 'max' => 20]);
            $sql = 'SELECT * FROM incidents WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            if ($sev !== '' && $sev !== 'All') {
                $sql .= ' AND severity = ?';
                $params[] = $sev;
            }
            $sql .= " ORDER BY CASE status WHEN 'Reported' THEN 0 WHEN 'Under review' THEN 1 ELSE 2 END, CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, incident_date DESC LIMIT 150";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$row) {
                $row = self::enrichIncident($row);
            }
            unset($row);
            return ['incidents' => $rows];
        });
    }

    public function addIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $vehId = V::rowId($input['vehicle_id'] ?? null, 'vehicle_id');
            $veh = $db->first('SELECT * FROM vehicles WHERE id = ?', [$vehId]);
            if (!$veh) {
                HttpException::fail(422, 'vehicle_invalid', 'Select a valid vehicle.', 'vehicle_id');
            }
            $drvId = V::rowId($input['driver_id'] ?? null, 'driver_id');
            $drv = $db->first('SELECT * FROM drivers WHERE id = ?', [$drvId]);
            if (!$drv) {
                HttpException::fail(422, 'driver_invalid', 'Select a valid driver.', 'driver_id');
            }

            $incDate = V::day($input['incident_date'] ?? null, 'incident_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Date']);
            $incType = V::oneOf($input['incident_type'] ?? null, self::INC_TYPES, 'incident_type', ['fallback' => 'Damage']);
            $sev = V::oneOf($input['severity'] ?? null, self::SEVERITIES, 'severity', ['fallback' => 'Medium']);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $status = V::oneOf($input['status'] ?? null, self::INC_STATUSES, 'status', ['fallback' => 'Reported']);
            $resNotes = V::text($input['resolution_notes'] ?? null, 'resolution_notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO incidents(vehicle_id, vehicle_name, registration, driver_id, driver_name, incident_date, incident_type, severity, description, status, resolution_notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [(int) $veh['id'], $veh['vehicle_name'], $veh['registration'], (int) $drv['id'], $drv['driver_name'], $incDate, $incType, $sev, $desc, $status, $resNotes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['incident' => self::enrichIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'incident_not_found', 'Incident report not found.');
            }
            $incDate = V::day($input['incident_date'] ?? null, 'incident_date', ['required' => false, 'fallback' => (string) $cur['incident_date']]);
            $incType = V::oneOf($input['incident_type'] ?? null, self::INC_TYPES, 'incident_type', ['fallback' => $cur['incident_type']]);
            $sev = V::oneOf($input['severity'] ?? null, self::SEVERITIES, 'severity', ['fallback' => $cur['severity']]);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $status = V::oneOf($input['status'] ?? null, self::INC_STATUSES, 'status', ['fallback' => $cur['status']]);
            $resNotes = V::text($input['resolution_notes'] ?? null, 'resolution_notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE incidents SET incident_date = ?, incident_type = ?, severity = ?, description = ?, status = ?, resolution_notes = ?, updated_at = ? WHERE id = ?',
                [$incDate, $incType, $sev, $desc, $status, $resNotes, V::now(), $id]
            );
            return ['incident' => self::enrichIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setIncidentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'incident_not_found', 'Incident report not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::INC_STATUSES, 'status');
            $resNotes = array_key_exists('resolution_notes', $input)
                ? V::text($input['resolution_notes'], 'resolution_notes', ['required' => false, 'max' => 800])
                : (string) $cur['resolution_notes'];
            $db->execute('UPDATE incidents SET status = ?, resolution_notes = ?, updated_at = ? WHERE id = ?', [$status, $resNotes, V::now(), $id]);
            return ['incident' => self::enrichIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'incident_not_found', 'Incident report not found.');
            }
            $db->execute('DELETE FROM incidents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
