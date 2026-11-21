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
    private const STAFF_ROLES = ['Server', 'Chef', 'Kitchen hand', 'Bartender', 'Manager'];
    private const STATIONS = ['Main', 'Patio', 'Bar', 'Private', 'Hot line', 'Cold larder', 'Pastry'];
    private const SECTIONS = ['Main', 'Patio', 'Bar', 'Private'];
    private const TABLE_STATUSES = ['Available', 'Seated', 'Mains Firing', 'Check Dropped', 'Needs Cleaning'];
    private const TABLE_PREFS = ['Window', 'Booth', 'Bar', 'Outside', 'Private', 'No preference'];
    private const RES_STATUSES = ['Booked', 'Seated', 'No-show', 'Cancelled'];
    private const COURSES = ['Entree', 'Mains', 'Desserts', 'Drinks'];
    private const TICKET_STATUSES = ['Fire', 'Cooking', 'Pass', 'Served'];
    private const PRIORITIES = ['Normal', 'Priority'];
    private const PREP_STATIONS = ['Cold', 'Hot', 'Pastry', 'Bar'];
    private const PREP_UNITS = ['portions', 'kg', 'litres', 'trays'];
    private const PREP_STATUSES = ['Not started', 'In progress', 'Done', 'Eighty-sixed'];

    private static function lookupStaffName(Database $db, ?int $staffId, string $fallbackName = ''): string
    {
        if (!$staffId) {
            return $fallbackName;
        }
        $row = $db->first('SELECT name FROM brigade_staff WHERE id = ?', [$staffId]);
        return $row ? (string) $row['name'] : $fallbackName;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeStaff(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTable(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'capacity', 'current_party_size', 'seated_at', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        foreach (['server_id', 'current_reservation_id'] as $nullIntCol) {
            if (array_key_exists($nullIntCol, $row)) {
                $row[$nullIntCol] = ($row[$nullIntCol] !== null && $row[$nullIntCol] !== '') ? (int) $row[$nullIntCol] : null;
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeReservation(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'party_size', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('assigned_table_id', $row)) {
            $row['assigned_table_id'] = ($row['assigned_table_id'] !== null && $row['assigned_table_id'] !== '') ? (int) $row['assigned_table_id'] : null;
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTicket(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        foreach (['table_id', 'server_id'] as $nullIntCol) {
            if (array_key_exists($nullIntCol, $row)) {
                $row[$nullIntCol] = ($row[$nullIntCol] !== null && $row[$nullIntCol] !== '') ? (int) $row[$nullIntCol] : null;
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePrep(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('assigned_to_id', $row)) {
            $row['assigned_to_id'] = ($row['assigned_to_id'] !== null && $row['assigned_to_id'] !== '') ? (int) $row['assigned_to_id'] : null;
        }
        if (array_key_exists('quantity_needed', $row) && $row['quantity_needed'] !== null) {
            $row['quantity_needed'] = (float) $row['quantity_needed'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeClose(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'covers_served', 'sales_cents', 'voids_comps_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['cleaning'] = V::parseJson($row['cleaning_json'] ?? '', []);
        return $row;
    }

    // ---- Brigade Staff ----

    public function listStaff(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeStaff'],
                $db->query("SELECT * FROM brigade_staff ORDER BY CASE active WHEN 'Active' THEN 0 ELSE 1 END, role ASC, name ASC")
            );
            return ['staff' => $rows];
        });
    }

    public function addStaff(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Name']);
            $role = V::oneOf($input['role'] ?? null, self::STAFF_ROLES, 'role', ['fallback' => 'Server']);
            $station = V::oneOf($input['station'] ?? null, self::STATIONS, 'station', ['fallback' => 'Main']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO brigade_staff(name, role, station, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, $role, $station, $phone, $active, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['member' => self::normalizeStaff($db->first('SELECT * FROM brigade_staff WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveStaff(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM brigade_staff WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Staff member not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Name']);
            $role = V::oneOf($input['role'] ?? null, self::STAFF_ROLES, 'role', ['fallback' => $cur['role']]);
            $station = V::oneOf($input['station'] ?? null, self::STATIONS, 'station', ['fallback' => $cur['station']]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => $cur['active']]);

            $db->execute(
                'UPDATE brigade_staff SET name = ?, role = ?, station = ?, phone = ?, active = ? WHERE id = ?',
                [$name, $role, $station, $phone, $active, $id]
            );
            return ['member' => self::normalizeStaff($db->first('SELECT * FROM brigade_staff WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteStaff(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM brigade_staff WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Staff member not found.');
            }
            $db->execute('DELETE FROM brigade_staff WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Floor & Table Map ----

    public function listTables(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $section = V::text($input['section'] ?? null, 'section', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM dining_tables WHERE 1=1';
            $params = [];
            if ($section !== '' && $section !== 'All') {
                $sql .= ' AND section = ?';
                $params[] = $section;
            }
            $sql .= " ORDER BY CASE section WHEN 'Main' THEN 0 WHEN 'Patio' THEN 1 WHEN 'Bar' THEN 2 ELSE 3 END, table_number ASC";
            $tables = array_map([self::class, 'normalizeTable'], $db->query($sql, $params));

            // Attach active ticket count & allergy flag per table for live floor visibility
            $activeTickets = $db->query(
                "SELECT table_id, COUNT(*) AS cnt, MAX(CASE WHEN allergy_notes != '' THEN 1 ELSE 0 END) AS has_allergy FROM kitchen_tickets WHERE status != 'Served' AND table_id IS NOT NULL GROUP BY table_id"
            );
            $byTable = [];
            foreach ($activeTickets as $tk) {
                $byTable[(int) $tk['table_id']] = $tk;
            }
            foreach ($tables as &$tb) {
                $info = $byTable[$tb['id']] ?? null;
                $tb['open_tickets'] = $info ? (int) $info['cnt'] : 0;
                $tb['has_allergy'] = $info ? ((int) $info['has_allergy'] === 1) : false;
            }
            unset($tb);

            return ['tables' => $tables];
        });
    }

    public function addTable(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $numStr = V::text($input['table_number'] ?? null, 'table_number', ['max' => 30, 'label' => 'Table number']);
            $section = V::oneOf($input['section'] ?? null, self::SECTIONS, 'section', ['fallback' => 'Main']);
            $cap = V::int($input['capacity'] ?? null, 'capacity', ['min' => 1, 'max' => 40, 'fallback' => 4]) ?? 4;
            $status = V::oneOf($input['status'] ?? null, self::TABLE_STATUSES, 'status', ['fallback' => 'Available']);
            $serverId = V::int($input['server_id'] ?? null, 'server_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $serverName = self::lookupStaffName($db, $serverId, V::text($input['server_name'] ?? null, 'server_name', ['required' => false, 'max' => 80]));
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);

            $created = $db->execute(
                "INSERT INTO dining_tables(table_number, section, capacity, status, server_id, server_name, current_guest, current_party_size, current_reservation_id, seated_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, '', 0, NULL, 0, ?, 0, ?)",
                [$numStr, $section, $cap, $status, $serverId, $serverName, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['table' => self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveTable(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM dining_tables WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Table not found.');
            }
            $numStr = V::text($input['table_number'] ?? null, 'table_number', ['max' => 30, 'label' => 'Table number']);
            $section = V::oneOf($input['section'] ?? null, self::SECTIONS, 'section', ['fallback' => $cur['section']]);
            $cap = V::int($input['capacity'] ?? null, 'capacity', ['min' => 1, 'max' => 40, 'fallback' => (int) $cur['capacity']]) ?? (int) $cur['capacity'];
            $status = V::oneOf($input['status'] ?? null, self::TABLE_STATUSES, 'status', ['fallback' => $cur['status']]);

            $hasServerId = array_key_exists('server_id', $input);
            $serverId = $hasServerId
                ? V::int($input['server_id'], 'server_id', ['required' => false, 'min' => 1, 'fallback' => null])
                : (($cur['server_id'] !== null && $cur['server_id'] !== '') ? (int) $cur['server_id'] : null);
            $explicitServerName = V::text($input['server_name'] ?? null, 'server_name', ['required' => false, 'max' => 80]);
            $fallbackServerName = $explicitServerName !== ''
                ? $explicitServerName
                : (($hasServerId && $serverId === null) ? '' : (string) $cur['server_name']);
            $serverName = self::lookupStaffName($db, $serverId, $fallbackServerName);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);

            $db->execute(
                'UPDATE dining_tables SET table_number = ?, section = ?, capacity = ?, status = ?, server_id = ?, server_name = ?, notes = ? WHERE id = ?',
                [$numStr, $section, $cap, $status, $serverId, $serverName, $notes, $id]
            );
            return ['table' => self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setTableStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$id]));
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Table not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::TABLE_STATUSES, 'status');
            $guest = (string) $cur['current_guest'];
            $partySize = (int) $cur['current_party_size'];
            $resId = $cur['current_reservation_id'];
            $seatedAt = (int) $cur['seated_at'];

            if ($status === 'Available' || $status === 'Needs Cleaning') {
                $guest = '';
                $partySize = 0;
                $resId = null;
                $seatedAt = 0;
            } elseif ($status === 'Seated') {
                $guest = V::text($input['guest_name'] ?? null, 'guest_name', ['required' => false, 'max' => 100])
                    ?: ($cur['current_guest'] !== '' ? (string) $cur['current_guest'] : 'Walk-in');
                $defaultParty = ((int) $cur['current_party_size']) > 0 ? (int) $cur['current_party_size'] : (int) $cur['capacity'];
                $partySize = V::int($input['party_size'] ?? null, 'party_size', ['required' => false, 'min' => 1, 'max' => 40, 'fallback' => $defaultParty]) ?? $defaultParty;
                $seatedAt = $cur['seated_at'] > 0 ? (int) $cur['seated_at'] : V::now();
            }

            $db->execute(
                'UPDATE dining_tables SET status = ?, current_guest = ?, current_party_size = ?, current_reservation_id = ?, seated_at = ? WHERE id = ?',
                [$status, $guest, $partySize, $resId, $seatedAt, $id]
            );
            return ['table' => self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTable(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM dining_tables WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Table not found.');
            }
            $db->execute('DELETE FROM dining_tables WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Reservations Book & 1-Click Seat at Table ----

    public function listReservations(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $resDate = V::day($input['date'] ?? null, 'date', ['required' => false, 'fallback' => '']);
            $sql = 'SELECT * FROM reservations WHERE 1=1';
            $params = [];
            if ($resDate !== '') {
                $sql .= ' AND res_date = ?';
                $params[] = $resDate;
            }
            $sql .= ' ORDER BY res_date ASC, res_time ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeReservation'], $db->query($sql, $params));
            return ['reservations' => $rows];
        });
    }

    public function addReservation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $guestName = V::text($input['guest_name'] ?? null, 'guest_name', ['max' => 100, 'label' => 'Guest name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $resDate = V::day($input['res_date'] ?? null, 'res_date', ['label' => 'Date']);
            $resTime = V::timeStr($input['res_time'] ?? null, 'res_time', ['label' => 'Time']);
            $partySize = V::int($input['party_size'] ?? null, 'party_size', ['min' => 1, 'max' => 60, 'fallback' => 2]) ?? 2;
            $pref = V::oneOf($input['table_pref'] ?? null, self::TABLE_PREFS, 'table_pref', ['fallback' => 'No preference']);
            $status = V::oneOf($input['status'] ?? null, self::RES_STATUSES, 'status', ['fallback' => 'Booked']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                "INSERT INTO reservations(guest_name, phone, email, res_date, res_time, party_size, table_pref, status, assigned_table_id, assigned_table_number, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, 0, ?)",
                [$guestName, $phone, $em, $resDate, $resTime, $partySize, $pref, $status, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['reservation' => self::normalizeReservation($db->first('SELECT * FROM reservations WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveReservation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM reservations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Reservation not found.');
            }
            $guestName = V::text($input['guest_name'] ?? null, 'guest_name', ['max' => 100, 'label' => 'Guest name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $resDate = V::day($input['res_date'] ?? null, 'res_date', ['label' => 'Date']);
            $resTime = V::timeStr($input['res_time'] ?? null, 'res_time', ['label' => 'Time']);
            $partySize = V::int($input['party_size'] ?? null, 'party_size', ['min' => 1, 'max' => 60, 'fallback' => (int) $cur['party_size']]) ?? (int) $cur['party_size'];
            $pref = V::oneOf($input['table_pref'] ?? null, self::TABLE_PREFS, 'table_pref', ['fallback' => $cur['table_pref']]);
            $status = V::oneOf($input['status'] ?? null, self::RES_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $db->execute(
                'UPDATE reservations SET guest_name = ?, phone = ?, email = ?, res_date = ?, res_time = ?, party_size = ?, table_pref = ?, status = ?, notes = ? WHERE id = ?',
                [$guestName, $phone, $em, $resDate, $resTime, $partySize, $pref, $status, $notes, $id]
            );
            return ['reservation' => self::normalizeReservation($db->first('SELECT * FROM reservations WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function seatReservation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $resId = V::rowId($input['reservation_id'] ?? null, 'reservation_id');
            $resRow = self::normalizeReservation($db->first('SELECT * FROM reservations WHERE id = ?', [$resId]));
            if (!$resRow) {
                HttpException::fail(404, 'not_found', 'Reservation not found.');
            }
            if ($resRow['status'] === 'Cancelled') {
                HttpException::fail(409, 'reservation_cancelled', 'Cannot seat a cancelled reservation.');
            }

            $tableId = V::int($input['table_id'] ?? null, 'table_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $tableRow = null;
            if ($tableId !== null) {
                $tableRow = self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$tableId]));
                if (!$tableRow) {
                    HttpException::fail(404, 'table_not_found', 'Selected table not found.');
                }
                if ($tableRow['status'] !== 'Available') {
                    HttpException::fail(
                        409,
                        'table_occupied',
                        'Table ' . $tableRow['table_number'] . ' is currently ' . $tableRow['status'] . '. Pick an Available table.'
                    );
                }
            } else {
                $tableRow = self::normalizeTable($db->first(
                    "SELECT * FROM dining_tables WHERE status = 'Available' AND capacity >= ? ORDER BY capacity ASC, table_number ASC LIMIT 1",
                    [(int) $resRow['party_size']]
                ));
                if (!$tableRow) {
                    $tableRow = self::normalizeTable($db->first(
                        "SELECT * FROM dining_tables WHERE status = 'Available' ORDER BY capacity DESC LIMIT 1"
                    ));
                }
                if (!$tableRow) {
                    HttpException::fail(409, 'no_available_table', 'No available tables right now. Clear a table on the Floor Map first.');
                }
            }

            $ts = V::now();
            $db->execute(
                "UPDATE reservations SET status = 'Seated', assigned_table_id = ?, assigned_table_number = ? WHERE id = ?",
                [$tableRow['id'], $tableRow['table_number'], $resId]
            );
            $db->execute(
                "UPDATE dining_tables SET status = 'Seated', current_guest = ?, current_party_size = ?, current_reservation_id = ?, seated_at = ? WHERE id = ?",
                [$resRow['guest_name'], $resRow['party_size'], $resId, $ts, $tableRow['id']]
            );

            return [
                'reservation' => self::normalizeReservation($db->first('SELECT * FROM reservations WHERE id = ?', [$resId])),
                'table' => self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$tableRow['id']])),
            ];
        }, write: true);
    }

    public function setReservationStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM reservations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Reservation not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::RES_STATUSES, 'status');
            $db->execute('UPDATE reservations SET status = ? WHERE id = ?', [$status, $id]);
            return ['reservation' => self::normalizeReservation($db->first('SELECT * FROM reservations WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteReservation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM reservations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Reservation not found.');
            }
            $db->execute('DELETE FROM reservations WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Course Kitchen Pass ----

    public function listTickets(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $course = V::text($input['course'] ?? null, 'course', ['required' => false, 'max' => 30]);
            $includeServed = V::bool($input['includeServed'] ?? false);
            $sql = 'SELECT * FROM kitchen_tickets WHERE 1=1';
            $params = [];
            if ($course !== '' && $course !== 'All') {
                $sql .= ' AND course = ?';
                $params[] = $course;
            }
            if (!$includeServed) {
                $sql .= " AND status != 'Served'";
            }
            $sql .= " ORDER BY CASE WHEN allergy_notes != '' THEN 0 ELSE 1 END, CASE priority WHEN 'Priority' THEN 0 ELSE 1 END, created_at ASC LIMIT 120";
            $rows = array_map([self::class, 'normalizeTicket'], $db->query($sql, $params));
            return ['tickets' => $rows];
        });
    }

    public function fireTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $tableId = V::int($input['table_id'] ?? null, 'table_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $tableNum = V::text($input['table_number'] ?? null, 'table_number', ['required' => false, 'max' => 30]);
            $tableRow = null;
            if ($tableId !== null) {
                $tableRow = self::normalizeTable($db->first('SELECT * FROM dining_tables WHERE id = ?', [$tableId]));
                if (!$tableRow) {
                    HttpException::fail(404, 'table_not_found', 'Table not found.');
                }
                $tableNum = (string) $tableRow['table_number'];
            }
            if ($tableNum === '') {
                HttpException::fail(422, 'table_required', 'Select a table for this kitchen ticket.');
            }

            $course = V::oneOf($input['course'] ?? null, self::COURSES, 'course', ['fallback' => 'Mains']);
            $items = V::text($input['items'] ?? null, 'items', ['max' => 800, 'label' => 'Items']);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Normal']);
            $allergy = V::text($input['allergy_notes'] ?? null, 'allergy_notes', ['required' => false, 'max' => 400]);
            $defaultServerId = ($tableRow && $tableRow['server_id'] !== null) ? (int) $tableRow['server_id'] : null;
            $serverId = V::int($input['server_id'] ?? null, 'server_id', ['required' => false, 'min' => 1, 'fallback' => $defaultServerId]);
            $fallbackServerName = ($tableRow && !empty($tableRow['server_name']))
                ? (string) $tableRow['server_name']
                : (string) $ctx['member']['display_name'];
            $serverName = self::lookupStaffName($db, $serverId, $fallbackServerName);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO kitchen_tickets(table_id, table_number, course, items, status, priority, allergy_notes, server_id, server_name, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, 'Fire', ?, ?, ?, ?, 0, ?, ?)",
                [$tableId, $tableNum, $course, $items, $priority, $allergy, $serverId, $serverName, $ts, $ts]
            );

            // Sync table stage automatically when firing Mains or on an Available table
            if ($tableRow) {
                if ($course === 'Mains' && ($tableRow['status'] === 'Seated' || $tableRow['status'] === 'Available')) {
                    $db->execute(
                        "UPDATE dining_tables SET status = 'Mains Firing', seated_at = CASE WHEN seated_at = 0 THEN ? ELSE seated_at END WHERE id = ?",
                        [$ts, $tableRow['id']]
                    );
                } elseif ($tableRow['status'] === 'Available') {
                    $db->execute(
                        "UPDATE dining_tables SET status = 'Seated', current_guest = 'Walk-in', seated_at = ? WHERE id = ?",
                        [$ts, $tableRow['id']]
                    );
                }
            }

            return [
                '__status' => 201,
                '__body' => ['ticket' => self::normalizeTicket($db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function advanceTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Kitchen ticket not found.');
            }
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::TICKET_STATUSES, 'status');
            } else {
                $idx = array_search($cur['status'], self::TICKET_STATUSES, true);
                $nextIdx = min(($idx === false ? 0 : $idx) + 1, count(self::TICKET_STATUSES) - 1);
                $nextStatus = self::TICKET_STATUSES[$nextIdx];
            }
            $db->execute('UPDATE kitchen_tickets SET status = ?, updated_at = ? WHERE id = ?', [$nextStatus, V::now(), $id]);
            return ['ticket' => self::normalizeTicket($db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM kitchen_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Kitchen ticket not found.');
            }
            $db->execute('DELETE FROM kitchen_tickets WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Station Prep List ----

    public function listPrep(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $station = V::text($input['station'] ?? null, 'station', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM prep_items WHERE 1=1';
            $params = [];
            if ($station !== '' && $station !== 'All') {
                $sql .= ' AND station = ?';
                $params[] = $station;
            }
            $sql .= " ORDER BY CASE station WHEN 'Hot' THEN 0 WHEN 'Cold' THEN 1 WHEN 'Pastry' THEN 2 ELSE 3 END, CASE status WHEN 'In progress' THEN 0 WHEN 'Not started' THEN 1 WHEN 'Eighty-sixed' THEN 2 ELSE 3 END, due_by ASC";
            $rows = array_map([self::class, 'normalizePrep'], $db->query($sql, $params));
            return ['items' => $rows];
        });
    }

    public function addPrepItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $item = V::text($input['prep_item'] ?? null, 'prep_item', ['max' => 140, 'label' => 'Prep item']);
            $station = V::oneOf($input['station'] ?? null, self::PREP_STATIONS, 'station', ['fallback' => 'Hot']);
            $qty = V::numVal($input['quantity_needed'] ?? null, 'quantity_needed', ['required' => false, 'min' => 0, 'max' => 10000, 'fallback' => 1]);
            $unit = V::oneOf($input['unit'] ?? null, self::PREP_UNITS, 'unit', ['fallback' => 'portions']);
            $dueBy = V::timeStr($input['due_by'] ?? null, 'due_by', ['required' => false, 'fallback' => '16:30']);
            $status = V::oneOf($input['status'] ?? null, self::PREP_STATUSES, 'status', ['fallback' => 'Not started']);
            $assignedId = V::int($input['assigned_to_id'] ?? null, 'assigned_to_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $assignedName = self::lookupStaffName($db, $assignedId, V::text($input['assigned_to_name'] ?? null, 'assigned_to_name', ['required' => false, 'max' => 80]));

            $created = $db->execute(
                'INSERT INTO prep_items(prep_item, station, quantity_needed, unit, due_by, status, assigned_to_id, assigned_to_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$item, $station, $qty, $unit, $dueBy, $status, $assignedId, $assignedName, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['item' => self::normalizePrep($db->first('SELECT * FROM prep_items WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function savePrepItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM prep_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep item not found.');
            }
            $item = V::text($input['prep_item'] ?? null, 'prep_item', ['max' => 140, 'label' => 'Prep item']);
            $station = V::oneOf($input['station'] ?? null, self::PREP_STATIONS, 'station', ['fallback' => $cur['station']]);
            $qty = V::numVal($input['quantity_needed'] ?? null, 'quantity_needed', ['required' => false, 'min' => 0, 'max' => 10000, 'fallback' => (float) $cur['quantity_needed']]);
            $unit = V::oneOf($input['unit'] ?? null, self::PREP_UNITS, 'unit', ['fallback' => $cur['unit']]);
            $dueBy = V::timeStr($input['due_by'] ?? null, 'due_by', ['required' => false, 'fallback' => $cur['due_by']]);
            $status = V::oneOf($input['status'] ?? null, self::PREP_STATUSES, 'status', ['fallback' => $cur['status']]);

            $hasAssignedId = array_key_exists('assigned_to_id', $input);
            $assignedId = $hasAssignedId
                ? V::int($input['assigned_to_id'], 'assigned_to_id', ['required' => false, 'min' => 1, 'fallback' => null])
                : (($cur['assigned_to_id'] !== null && $cur['assigned_to_id'] !== '') ? (int) $cur['assigned_to_id'] : null);
            $explicitAssignedName = V::text($input['assigned_to_name'] ?? null, 'assigned_to_name', ['required' => false, 'max' => 80]);
            $fallbackAssignedName = $explicitAssignedName !== ''
                ? $explicitAssignedName
                : (($hasAssignedId && $assignedId === null) ? '' : (string) $cur['assigned_to_name']);
            $assignedName = self::lookupStaffName($db, $assignedId, $fallbackAssignedName);

            $db->execute(
                'UPDATE prep_items SET prep_item = ?, station = ?, quantity_needed = ?, unit = ?, due_by = ?, status = ?, assigned_to_id = ?, assigned_to_name = ? WHERE id = ?',
                [$item, $station, $qty, $unit, $dueBy, $status, $assignedId, $assignedName, $id]
            );
            return ['item' => self::normalizePrep($db->first('SELECT * FROM prep_items WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setPrepStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM prep_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep item not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PREP_STATUSES, 'status');
            $db->execute('UPDATE prep_items SET status = ? WHERE id = ?', [$status, $id]);
            return ['item' => self::normalizePrep($db->first('SELECT * FROM prep_items WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deletePrepItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM prep_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep item not found.');
            }
            $db->execute('DELETE FROM prep_items WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Shift Close ----

    public function listCloses(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                [self::class, 'normalizeClose'],
                $db->query('SELECT * FROM shift_closes ORDER BY close_date DESC, created_at DESC LIMIT 60')
            );
            $resCovers = $db->first(
                "SELECT COALESCE(SUM(party_size), 0) AS c FROM reservations WHERE res_date = ? AND status = 'Seated'",
                [$todayDay]
            );
            $floorCovers = $db->first(
                "SELECT COALESCE(SUM(current_party_size), 0) AS c FROM dining_tables WHERE status IN ('Seated', 'Mains Firing', 'Check Dropped')"
            );
            $suggestedCovers = max(
                $resCovers ? (int) $resCovers['c'] : 0,
                $floorCovers ? (int) $floorCovers['c'] : 0
            );
            return [
                'closes' => $rows,
                'todaySummary' => [
                    'day' => $todayDay,
                    'suggestedCovers' => $suggestedCovers,
                ],
            ];
        });
    }

    public function addClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $closeDate = V::day($input['close_date'] ?? null, 'close_date', ['label' => 'Date']);
            $covers = V::int($input['covers_served'] ?? null, 'covers_served', ['min' => 0, 'max' => 5000, 'fallback' => 0, 'label' => 'Covers served']) ?? 0;
            $salesCents = V::moneyCents($input['sales_total'] ?? null, 'sales_total', ['min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'Sales total']);
            $voidsCents = V::moneyCents($input['voids_comps'] ?? null, 'voids_comps', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 0, 'label' => 'Voids and comps']);
            $incidents = V::text($input['incidents'] ?? null, 'incidents', ['required' => false, 'max' => 1000]);
            $cleaning = V::listOf($input['cleaning'] ?? null, 'cleaning', 20, fn ($v) => V::text($v, 'check', ['max' => 100]));
            $signoff = V::text($input['manager_signoff'] ?? null, 'manager_signoff', ['required' => false, 'max' => 100])
                ?: (string) $ctx['member']['display_name'];

            $created = $db->execute(
                'INSERT INTO shift_closes(close_date, covers_served, sales_cents, voids_comps_cents, incidents, cleaning_json, manager_signoff, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$closeDate, $covers, $salesCents, $voidsCents, $incidents, json_encode($cleaning, JSON_UNESCAPED_UNICODE), $signoff, V::now()]
            );
            $row = self::normalizeClose($db->first('SELECT * FROM shift_closes WHERE id = ?', [$created['lastInsertRowid']]));
            $row['avg_spend_cents'] = $covers > 0 ? (int) round($salesCents / $covers) : 0;
            return ['__status' => 201, '__body' => ['close' => $row]];
        }, write: true);
    }

    public function deleteClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM shift_closes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Shift close not found.');
            }
            $db->execute('DELETE FROM shift_closes WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
