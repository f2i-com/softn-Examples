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
    private const PROP_TYPES = ['Apartment', 'House', 'Townhouse', 'Studio', 'Cabin'];
    private const PROP_STATUSES = ['Live', 'Paused', 'Offboarding'];
    private const SR_AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];
    private const SR_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    private const ACTIVE_OPT = ['Active', 'Inactive'];
    private const PLATFORMS = ['Airbnb', 'Booking.com', 'VRBO', 'Direct', 'Other'];
    private const BOOKING_STATUSES = ['Confirmed', 'Checked in', 'Checked out', 'Cancelled'];
    private const TURNOVER_STATUSES = ['Scheduled', 'Cleaning', 'Linen Changed', 'Inspected', 'Guest-Ready', 'Issue'];
    private const TURNOVER_PIPELINE = ['Scheduled', 'Cleaning', 'Linen Changed', 'Inspected', 'Guest-Ready'];
    private const YES_NO = ['Yes', 'No'];
    private const SUPPLY_UNITS = ['Units', 'Packs', 'Bottles', 'Sets'];

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

    /** @return array<string, mixed>|null */
    private static function normalizeProperty(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'bedrooms', 'is_sample', 'created_at', 'low_supply_count', 'booking_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('bathrooms', $row) && $row['bathrooms'] !== null) {
            $row['bathrooms'] = (float) $row['bathrooms'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeCleaner(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'today_turnovers'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['service_areas'] = V::parseJson($row['service_areas_json'] ?? '', []);
        $row['availability'] = V::parseJson($row['availability_json'] ?? '', []);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeBooking(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'guest_count', 'is_sample', 'created_at', 'turnover_id', 'same_day_next'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTurnover(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'booking_id', 'cleaner_id', 'is_sample', 'created_at', 'updated_at', 'bedrooms', 'guest_count', 'arriving_guests'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('bathrooms', $row) && $row['bathrooms'] !== null) {
            $row['bathrooms'] = (float) $row['bathrooms'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeInspection(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'turnover_id', 'condition_rating', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSupply(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'is_sample', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        foreach (['current_stock', 'reorder_point'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (float) $row[$col];
            }
        }
        return $row;
    }

    // ---- Turnover Command Today (Same-day Urgent Windows + Dispatch Pipeline) ----

    public function getTurnoverCommand(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $targetDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $sameDayWindows = WorkspaceController::findSameDayWindows($db, $targetDay);
            $urgentPropMap = [];
            foreach ($sameDayWindows as $w) {
                $urgentPropMap[(string) $w['property_id']] = $w;
            }
            $turns = $db->query(
                'SELECT t.*, p.property_name, p.address AS property_address, p.access_instructions, p.bedrooms, p.bathrooms, '
                . 'c.name AS cleaner_name, c.phone AS cleaner_phone, b.guest_name, b.platform, b.guest_count '
                . 'FROM turnovers t '
                . 'LEFT JOIN properties p ON p.id = t.property_id '
                . 'LEFT JOIN cleaners c ON c.id = t.cleaner_id '
                . 'LEFT JOIN bookings b ON b.id = t.booking_id '
                . 'WHERE t.turnover_date = ? '
                . 'ORDER BY t.start_time ASC, t.id ASC',
                [$targetDay]
            );
            foreach ($turns as &$t) {
                $t = self::normalizeTurnover($t);
                $win = $urgentPropMap[(string) $t['property_id']] ?? null;
                $t['is_same_day'] = $win !== null;
                $t['arriving_guest'] = $win ? (string) $win['arriving_guest'] : '';
                $t['arriving_guests'] = $win ? (int) $win['arriving_guests'] : 0;
            }
            unset($t);

            $checkOutsToday = array_map(
                [self::class, 'normalizeBooking'],
                $db->query(
                    "SELECT b.*, p.property_name FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.check_out = ? AND b.status != 'Cancelled' ORDER BY p.property_name ASC",
                    [$targetDay]
                )
            );
            $checkInsToday = array_map(
                [self::class, 'normalizeBooking'],
                $db->query(
                    "SELECT b.*, p.property_name FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.check_in = ? AND b.status != 'Cancelled' ORDER BY p.property_name ASC",
                    [$targetDay]
                )
            );
            return [
                'day' => $targetDay,
                'sameDayWindows' => $sameDayWindows,
                'turnovers' => $turns,
                'checkOutsToday' => $checkOutsToday,
                'checkInsToday' => $checkInsToday,
            ];
        });
    }

    // ---- Properties ----

    public function listProperties(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeProperty'],
                $db->query(
                    'SELECT p.*, '
                    . "(SELECT COUNT(*) FROM property_supplies s WHERE s.property_id = p.id AND s.status IN ('Low', 'Out')) AS low_supply_count, "
                    . "(SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id AND b.status != 'Cancelled') AS booking_count "
                    . "FROM properties p ORDER BY CASE p.status WHEN 'Live' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END, p.property_name ASC"
                )
            );
            return ['properties' => $rows];
        });
    }

    public function addProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['property_name'] ?? null, 'property_name', ['max' => 120, 'label' => 'Property name']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $ptype = V::oneOf($input['property_type'] ?? null, self::PROP_TYPES, 'property_type', ['fallback' => 'Apartment']);
            $beds = V::int($input['bedrooms'] ?? null, 'bedrooms', ['required' => false, 'min' => 0, 'max' => 30, 'fallback' => 2]) ?? 2;
            $baths = V::numVal($input['bathrooms'] ?? null, 'bathrooms', ['required' => false, 'min' => 0, 'max' => 20, 'fallback' => 1]);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1200]);
            $owner = V::text($input['owner'] ?? null, 'owner', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::PROP_STATUSES, 'status', ['fallback' => 'Live']);

            $created = $db->execute(
                'INSERT INTO properties(property_name, address, property_type, bedrooms, bathrooms, access_instructions, owner, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $address, $ptype, $beds, $baths, $access, $owner, $status, V::now()]
            );
            $row = self::normalizeProperty($db->first('SELECT * FROM properties WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['property' => $row]];
        }, write: true);
    }

    public function saveProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM properties WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Property not found.');
            }
            $name = V::text($input['property_name'] ?? null, 'property_name', ['max' => 120, 'label' => 'Property name']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $ptype = V::oneOf($input['property_type'] ?? null, self::PROP_TYPES, 'property_type', ['fallback' => $cur['property_type']]);
            $beds = V::int($input['bedrooms'] ?? null, 'bedrooms', ['required' => false, 'min' => 0, 'max' => 30, 'fallback' => (int) $cur['bedrooms']]) ?? (int) $cur['bedrooms'];
            $baths = V::numVal($input['bathrooms'] ?? null, 'bathrooms', ['required' => false, 'min' => 0, 'max' => 20, 'fallback' => (float) $cur['bathrooms']]);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1200]);
            $owner = V::text($input['owner'] ?? null, 'owner', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::PROP_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE properties SET property_name = ?, address = ?, property_type = ?, bedrooms = ?, bathrooms = ?, access_instructions = ?, owner = ?, status = ? WHERE id = ?',
                [$name, $address, $ptype, $beds, $baths, $access, $owner, $status, $id]
            );
            return ['property' => self::normalizeProperty($db->first('SELECT * FROM properties WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM properties WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Property not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM bookings WHERE property_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'property_has_bookings', 'Remove linked bookings before deleting this property.');
            }
            $db->execute('DELETE FROM property_supplies WHERE property_id = ?', [$id]);
            $db->execute('DELETE FROM inspections WHERE property_id = ?', [$id]);
            $db->execute('DELETE FROM turnovers WHERE property_id = ?', [$id]);
            $db->execute('DELETE FROM properties WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Cleaners Roster ----

    public function listCleaners(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $refDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                [self::class, 'normalizeCleaner'],
                $db->query(
                    'SELECT c.*, (SELECT COUNT(*) FROM turnovers t WHERE t.cleaner_id = c.id AND t.turnover_date = ?) AS today_turnovers '
                    . "FROM cleaners c ORDER BY CASE c.active WHEN 'Active' THEN 0 ELSE 1 END, c.name ASC",
                    [$refDay]
                )
            );
            return ['cleaners' => $rows];
        });
    }

    public function addCleaner(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Cleaner name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $areas = V::listOf($input['service_areas'] ?? null, 'service_areas', 10, static fn ($a) => V::oneOf($a, self::SR_AREAS, 'service_area'));
            $avail = V::listOf($input['availability'] ?? null, 'availability', 7, static fn ($d) => V::oneOf($d, self::SR_DAYS, 'day'));
            $active = V::oneOf($input['active'] ?? null, self::ACTIVE_OPT, 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO cleaners(name, phone, email, service_areas_json, availability_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $name,
                    $phone,
                    $em,
                    json_encode($areas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($avail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $active,
                    V::now(),
                ]
            );
            $row = self::normalizeCleaner($db->first('SELECT * FROM cleaners WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['cleaner' => $row]];
        }, write: true);
    }

    public function saveCleaner(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cleaners WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaner not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Cleaner name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $areas = is_array($input['service_areas'] ?? null)
                ? V::listOf($input['service_areas'], 'service_areas', 10, static fn ($a) => V::oneOf($a, self::SR_AREAS, 'service_area'))
                : V::parseJson($cur['service_areas_json'] ?? '', []);
            $avail = is_array($input['availability'] ?? null)
                ? V::listOf($input['availability'], 'availability', 7, static fn ($d) => V::oneOf($d, self::SR_DAYS, 'day'))
                : V::parseJson($cur['availability_json'] ?? '', []);
            $active = V::oneOf($input['active'] ?? null, self::ACTIVE_OPT, 'active', ['fallback' => $cur['active']]);

            $db->execute(
                'UPDATE cleaners SET name = ?, phone = ?, email = ?, service_areas_json = ?, availability_json = ?, active = ? WHERE id = ?',
                [
                    $name,
                    $phone,
                    $em,
                    json_encode($areas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($avail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $active,
                    $id,
                ]
            );
            return ['cleaner' => self::normalizeCleaner($db->first('SELECT * FROM cleaners WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteCleaner(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM cleaners WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Cleaner not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM turnovers WHERE cleaner_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'cleaner_has_turnovers', 'Reassign turnovers before removing this cleaner.');
            }
            $db->execute('DELETE FROM cleaners WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Bookings ----

    public function listBookings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $platform = V::text($input['platform'] ?? null, 'platform', ['required' => false, 'max' => 40]);
            $sql =
                'SELECT b.*, p.property_name, p.address AS property_address, '
                . '(SELECT t.id FROM turnovers t WHERE t.booking_id = b.id LIMIT 1) AS turnover_id, '
                . '(SELECT t.status FROM turnovers t WHERE t.booking_id = b.id LIMIT 1) AS turnover_status, '
                . "(SELECT COUNT(*) FROM bookings b2 WHERE b2.property_id = b.property_id AND b2.check_in = b.check_out AND b2.status != 'Cancelled' AND b2.id != b.id) AS same_day_next "
                . 'FROM bookings b LEFT JOIN properties p ON p.id = b.property_id WHERE 1=1';
            $params = [];
            if ($platform !== '' && $platform !== 'All') {
                $sql .= ' AND b.platform = ?';
                $params[] = $platform;
            }
            $sql .= ' ORDER BY b.check_out ASC, b.check_in ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeBooking'], $db->query($sql, $params));
            return ['bookings' => $rows];
        });
    }

    public function addBooking(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $guest = V::text($input['guest_name'] ?? null, 'guest_name', ['max' => 120, 'label' => 'Guest name']);
            $checkIn = V::day($input['check_in'] ?? null, 'check_in', ['label' => 'Check-in date']);
            $checkOut = V::day($input['check_out'] ?? null, 'check_out', ['label' => 'Check-out date']);
            if ($checkOut < $checkIn) {
                HttpException::fail(422, 'date_order', 'Check-out date must be on or after check-in date.');
            }
            $guests = V::int($input['guest_count'] ?? null, 'guest_count', ['required' => false, 'min' => 1, 'max' => 40, 'fallback' => 2]) ?? 2;
            $platform = V::oneOf($input['platform'] ?? null, self::PLATFORMS, 'platform', ['fallback' => 'Airbnb']);
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status', ['fallback' => 'Confirmed']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO bookings(property_id, guest_name, check_in, check_out, guest_count, platform, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$propId, $guest, $checkIn, $checkOut, $guests, $platform, $status, $notes, V::now()]
            );
            $row = self::normalizeBooking(
                $db->first('SELECT b.*, p.property_name FROM bookings b LEFT JOIN properties p ON p.id = b.property_id WHERE b.id = ?', [$created['lastInsertRowid']])
            );
            return ['__status' => 201, '__body' => ['booking' => $row]];
        }, write: true);
    }

    public function saveBooking(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM bookings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Booking not found.');
            }
            $propId = V::rowId(!empty($input['property_id']) ? $input['property_id'] : $cur['property_id'], 'property_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $guest = V::text($input['guest_name'] ?? null, 'guest_name', ['max' => 120, 'label' => 'Guest name']);
            $checkIn = V::day($input['check_in'] ?? null, 'check_in', ['required' => false, 'fallback' => (string) $cur['check_in'], 'label' => 'Check-in date']);
            $checkOut = V::day($input['check_out'] ?? null, 'check_out', ['required' => false, 'fallback' => (string) $cur['check_out'], 'label' => 'Check-out date']);
            if ($checkOut < $checkIn) {
                HttpException::fail(422, 'date_order', 'Check-out date must be on or after check-in date.');
            }
            $guests = V::int($input['guest_count'] ?? null, 'guest_count', ['required' => false, 'min' => 1, 'max' => 40, 'fallback' => (int) $cur['guest_count']]) ?? (int) $cur['guest_count'];
            $platform = V::oneOf($input['platform'] ?? null, self::PLATFORMS, 'platform', ['fallback' => $cur['platform']]);
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE bookings SET property_id = ?, guest_name = ?, check_in = ?, check_out = ?, guest_count = ?, platform = ?, status = ?, notes = ? WHERE id = ?',
                [$propId, $guest, $checkIn, $checkOut, $guests, $platform, $status, $notes, $id]
            );
            $row = self::normalizeBooking(
                $db->first('SELECT b.*, p.property_name FROM bookings b LEFT JOIN properties p ON p.id = b.property_id WHERE b.id = ?', [$id])
            );
            return ['booking' => $row];
        }, write: true);
    }

    public function setBookingStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM bookings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Booking not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status');
            $db->execute('UPDATE bookings SET status = ? WHERE id = ?', [$status, $id]);
            $row = self::normalizeBooking(
                $db->first('SELECT b.*, p.property_name FROM bookings b LEFT JOIN properties p ON p.id = b.property_id WHERE b.id = ?', [$id])
            );
            return ['booking' => $row];
        }, write: true);
    }

    public function deleteBooking(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM bookings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Booking not found.');
            }
            $db->execute('UPDATE turnovers SET booking_id = NULL WHERE booking_id = ?', [$id]);
            $db->execute('DELETE FROM bookings WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Turnovers ----

    /** @return array<string, mixed>|null */
    private static function hydrateTurnover(Database $db, int $id): ?array
    {
        return self::normalizeTurnover($db->first(
            'SELECT t.*, p.property_name, p.address AS property_address, p.access_instructions, '
            . 'c.name AS cleaner_name, c.phone AS cleaner_phone, b.guest_name, b.platform '
            . 'FROM turnovers t '
            . 'LEFT JOIN properties p ON p.id = t.property_id '
            . 'LEFT JOIN cleaners c ON c.id = t.cleaner_id '
            . 'LEFT JOIN bookings b ON b.id = t.booking_id '
            . 'WHERE t.id = ?',
            [$id]
        ));
    }

    public function listTurnovers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $tDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $sql =
                'SELECT t.*, p.property_name, p.address AS property_address, p.access_instructions, '
                . 'c.name AS cleaner_name, b.guest_name, b.platform '
                . 'FROM turnovers t '
                . 'LEFT JOIN properties p ON p.id = t.property_id '
                . 'LEFT JOIN cleaners c ON c.id = t.cleaner_id '
                . 'LEFT JOIN bookings b ON b.id = t.booking_id '
                . 'WHERE 1=1';
            $params = [];
            if ($tDay !== '') {
                $sql .= ' AND t.turnover_date = ?';
                $params[] = $tDay;
            }
            $sql .= ' ORDER BY t.turnover_date DESC, t.start_time ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeTurnover'], $db->query($sql, $params));
            return ['turnovers' => $rows];
        });
    }

    public function addTurnover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            $cleanerId = V::rowId($input['cleaner_id'] ?? null, 'cleaner_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            if (!$db->first('SELECT id FROM cleaners WHERE id = ?', [$cleanerId])) {
                HttpException::fail(404, 'cleaner_not_found', 'Cleaner not found.');
            }
            $bookingId = V::int($input['booking_id'] ?? null, 'booking_id', ['required' => false, 'min' => 1]);
            if ($bookingId !== null && !$db->first('SELECT id FROM bookings WHERE id = ?', [$bookingId])) {
                HttpException::fail(404, 'booking_not_found', 'Linked booking not found.');
            }
            $tDate = V::day($input['turnover_date'] ?? null, 'turnover_date', ['label' => 'Turnover date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['required' => false, 'fallback' => '10:30']);
            $status = V::oneOf($input['status'] ?? null, self::TURNOVER_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $linen = V::oneOf($input['linen_required'] ?? null, self::YES_NO, 'linen_required', ['fallback' => 'Yes']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO turnovers(property_id, booking_id, cleaner_id, turnover_date, start_time, status, linen_required, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$propId, $bookingId, $cleanerId, $tDate, $startTime, $status, $linen, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'turnover' => self::hydrateTurnover($db, $created['lastInsertRowid']),
                    'counts' => WorkspaceController::readCounts($db, $tDate),
                ],
            ];
        }, write: true);
    }

    public function saveTurnover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM turnovers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Turnover not found.');
            }
            $propId = V::rowId(!empty($input['property_id']) ? $input['property_id'] : $cur['property_id'], 'property_id');
            $cleanerId = V::rowId(!empty($input['cleaner_id']) ? $input['cleaner_id'] : $cur['cleaner_id'], 'cleaner_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            if (!$db->first('SELECT id FROM cleaners WHERE id = ?', [$cleanerId])) {
                HttpException::fail(404, 'cleaner_not_found', 'Cleaner not found.');
            }
            $tDate = V::day($input['turnover_date'] ?? null, 'turnover_date', ['required' => false, 'fallback' => (string) $cur['turnover_date']]);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['required' => false, 'fallback' => (string) $cur['start_time']]);
            $status = V::oneOf($input['status'] ?? null, self::TURNOVER_STATUSES, 'status', ['fallback' => $cur['status']]);
            $linen = V::oneOf($input['linen_required'] ?? null, self::YES_NO, 'linen_required', ['fallback' => $cur['linen_required']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE turnovers SET property_id = ?, cleaner_id = ?, turnover_date = ?, start_time = ?, status = ?, linen_required = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$propId, $cleanerId, $tDate, $startTime, $status, $linen, $notes, V::now(), $id]
            );
            return [
                'turnover' => self::hydrateTurnover($db, $id),
                'counts' => WorkspaceController::readCounts($db, $tDate),
            ];
        }, write: true);
    }

    public function advanceTurnoverStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM turnovers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Turnover not found.');
            }
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::TURNOVER_STATUSES, 'status');
            } else {
                $idx = array_search((string) $cur['status'], self::TURNOVER_PIPELINE, true);
                $nextStatus = ($idx !== false && $idx < count(self::TURNOVER_PIPELINE) - 1)
                    ? self::TURNOVER_PIPELINE[$idx + 1]
                    : 'Guest-Ready';
            }
            $db->execute('UPDATE turnovers SET status = ?, updated_at = ? WHERE id = ?', [$nextStatus, V::now(), $id]);
            return [
                'turnover' => self::hydrateTurnover($db, $id),
                'counts' => WorkspaceController::readCounts($db, (string) $cur['turnover_date']),
            ];
        }, write: true);
    }

    public function deleteTurnover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM turnovers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Turnover not found.');
            }
            $db->execute('UPDATE inspections SET turnover_id = NULL WHERE turnover_id = ?', [$id]);
            $db->execute('DELETE FROM turnovers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Inspections & Damage Log ----

    public function listInspections(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeInspection'],
                $db->query(
                    'SELECT i.*, p.property_name, p.owner FROM inspections i '
                    . 'LEFT JOIN properties p ON p.id = i.property_id '
                    . "ORDER BY CASE i.follow_up_required WHEN 'Yes' THEN 0 ELSE 1 END, i.inspection_date DESC, i.created_at DESC LIMIT 120"
                )
            );
            return ['inspections' => $rows];
        });
    }

    public function addInspection(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $turnId = V::int($input['turnover_id'] ?? null, 'turnover_id', ['required' => false, 'min' => 1]);
            $inspDate = V::day($input['inspection_date'] ?? null, 'inspection_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Inspection date']);
            $rating = V::int($input['condition_rating'] ?? null, 'condition_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => 5, 'label' => 'Condition rating']) ?? 5;
            $missing = V::text($input['missing_items'] ?? null, 'missing_items', ['required' => false, 'max' => 800]);
            $damage = V::text($input['damage_notes'] ?? null, 'damage_notes', ['required' => false, 'max' => 1200]);
            $followUp = V::oneOf($input['follow_up_required'] ?? null, self::YES_NO, 'follow_up_required', [
                'fallback' => ($missing !== '' || $damage !== '' || $rating <= 3) ? 'Yes' : 'No',
            ]);
            $inspector = V::text($input['inspector_name'] ?? null, 'inspector_name', ['required' => false, 'max' => 80])
                ?: (string) ($ctx['member']['display_name'] ?? '');
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO inspections(property_id, turnover_id, inspection_date, condition_rating, missing_items, damage_notes, follow_up_required, inspector_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$propId, $turnId, $inspDate, $rating, $missing, $damage, $followUp, $inspector, $ts]
            );
            if ($turnId !== null && V::bool($input['mark_guest_ready'] ?? false)) {
                $db->execute("UPDATE turnovers SET status = 'Guest-Ready', updated_at = ? WHERE id = ?", [$ts, $turnId]);
            } elseif ($turnId !== null) {
                $db->execute(
                    "UPDATE turnovers SET status = 'Inspected', updated_at = ? WHERE id = ? AND status IN ('Scheduled', 'Cleaning', 'Linen Changed')",
                    [$ts, $turnId]
                );
            }
            $row = self::normalizeInspection(
                $db->first('SELECT i.*, p.property_name, p.owner FROM inspections i LEFT JOIN properties p ON p.id = i.property_id WHERE i.id = ?', [$created['lastInsertRowid']])
            );
            return ['__status' => 201, '__body' => ['inspection' => $row]];
        }, write: true);
    }

    public function toggleInspectionFollowUp(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM inspections WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Inspection not found.');
            }
            $nextVal = !empty($input['follow_up_required'])
                ? V::oneOf($input['follow_up_required'], self::YES_NO, 'follow_up_required')
                : (((string) $cur['follow_up_required'] === 'Yes') ? 'No' : 'Yes');
            $db->execute('UPDATE inspections SET follow_up_required = ? WHERE id = ?', [$nextVal, $id]);
            $row = self::normalizeInspection(
                $db->first('SELECT i.*, p.property_name, p.owner FROM inspections i LEFT JOIN properties p ON p.id = i.property_id WHERE i.id = ?', [$id])
            );
            return ['inspection' => $row];
        }, write: true);
    }

    public function deleteInspection(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM inspections WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Inspection not found.');
            }
            $db->execute('DELETE FROM inspections WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Per-Property Supply Stock ----

    public function listSupplies(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::int($input['property_id'] ?? null, 'property_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT s.*, p.property_name FROM property_supplies s LEFT JOIN properties p ON p.id = s.property_id WHERE 1=1';
            $params = [];
            if ($propId !== null) {
                $sql .= ' AND s.property_id = ?';
                $params[] = $propId;
            }
            $sql .= " ORDER BY CASE s.status WHEN 'Out' THEN 0 WHEN 'Low' THEN 1 ELSE 2 END, p.property_name ASC, s.supply_item ASC";
            $rows = array_map([self::class, 'normalizeSupply'], $db->query($sql, $params));
            return ['supplies' => $rows];
        });
    }

    public function addSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $item = V::text($input['supply_item'] ?? null, 'supply_item', ['max' => 120, 'label' => 'Supply item']);
            $stock = V::numVal($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 10000, 'fallback' => 0]);
            $reorder = V::numVal($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0.5, 'max' => 10000, 'fallback' => 3]);
            $unit = V::oneOf($input['unit'] ?? null, self::SUPPLY_UNITS, 'unit', ['fallback' => 'Sets']);
            $st = self::supplyStatus($stock, $reorder);

            $created = $db->execute(
                'INSERT INTO property_supplies(property_id, supply_item, current_stock, reorder_point, unit, status, is_sample, updated_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$propId, $item, $stock, $reorder, $unit, $st, V::now()]
            );
            $row = self::normalizeSupply(
                $db->first('SELECT s.*, p.property_name FROM property_supplies s LEFT JOIN properties p ON p.id = s.property_id WHERE s.id = ?', [$created['lastInsertRowid']])
            );
            return ['__status' => 201, '__body' => ['supply' => $row]];
        }, write: true);
    }

    public function saveSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM property_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            $propId = V::rowId(!empty($input['property_id']) ? $input['property_id'] : $cur['property_id'], 'property_id');
            if (!$db->first('SELECT id FROM properties WHERE id = ?', [$propId])) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $item = V::text($input['supply_item'] ?? null, 'supply_item', ['max' => 120, 'label' => 'Supply item']);
            $stock = V::numVal($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 10000, 'fallback' => (float) $cur['current_stock']]);
            $reorder = V::numVal($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0.5, 'max' => 10000, 'fallback' => (float) $cur['reorder_point']]);
            $unit = V::oneOf($input['unit'] ?? null, self::SUPPLY_UNITS, 'unit', ['fallback' => $cur['unit']]);
            $st = self::supplyStatus($stock, $reorder);

            $db->execute(
                'UPDATE property_supplies SET property_id = ?, supply_item = ?, current_stock = ?, reorder_point = ?, unit = ?, status = ?, updated_at = ? WHERE id = ?',
                [$propId, $item, $stock, $reorder, $unit, $st, V::now(), $id]
            );
            $row = self::normalizeSupply(
                $db->first('SELECT s.*, p.property_name FROM property_supplies s LEFT JOIN properties p ON p.id = s.property_id WHERE s.id = ?', [$id])
            );
            return ['supply' => $row];
        }, write: true);
    }

    public function adjustSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM property_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            if (V::bool($input['restockToPar'] ?? false)) {
                $nextQty = max((float) $cur['current_stock'], ceil((float) $cur['reorder_point'] * 1.5));
            } else {
                $delta = V::numVal($input['delta'] ?? null, 'delta', ['min' => -1000, 'max' => 1000]);
                $nextQty = max(0.0, round(((float) $cur['current_stock'] + $delta) * 100.0) / 100.0);
            }
            $st = self::supplyStatus($nextQty, (float) $cur['reorder_point']);
            $db->execute(
                'UPDATE property_supplies SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?',
                [$nextQty, $st, V::now(), $id]
            );
            $row = self::normalizeSupply(
                $db->first('SELECT s.*, p.property_name FROM property_supplies s LEFT JOIN properties p ON p.id = s.property_id WHERE s.id = ?', [$id])
            );
            return ['supply' => $row];
        }, write: true);
    }

    public function deleteSupply(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM property_supplies WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Supply item not found.');
            }
            $db->execute('DELETE FROM property_supplies WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
