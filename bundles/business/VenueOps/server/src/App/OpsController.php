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
    private const SPACE_TYPES = ['Hall', 'Meeting room', 'Studio', 'Sports court', 'Outdoor area'];
    private const SPACE_STATUSES = ['Available', 'Maintenance', 'Retired'];
    private const PURPOSES = ['Party or celebration', 'Meeting', 'Class or workshop', 'Sport', 'Performance', 'Community event'];
    private const BOOKING_STATUSES = ['Enquiry', 'Tentative', 'Confirmed', 'Paid', 'Completed', 'Cancelled'];
    private const BLOCKING_STATUSES = ['Tentative', 'Confirmed', 'Paid'];
    private const LAYOUTS = ['Theatre', 'Banquet', 'Boardroom', 'Classroom', 'Empty', 'Custom'];
    private const PAY_METHODS = ['Card', 'Bank transfer', 'Cash', 'Invoice'];
    private const PAY_STATUSES = ['Paid', 'Deposit', 'Pending', 'Refunded'];
    private const INCIDENT_TYPES = ['Damage', 'Noise complaint', 'Overstay', 'Cleaning issue', 'Safety'];
    private const INCIDENT_STATUSES = ['Reported', 'Assessing', 'Invoiced', 'Closed'];
    private const YES_NO = ['Yes', 'No'];
    private const SETUP_COMPLETE_OPTS = ['Yes', 'Not yet'];

    private static function parseClockMinutes(string $hhmm): int
    {
        $parts = explode(':', $hhmm);
        return ((int) ($parts[0] ?? 0)) * 60 + ((int) ($parts[1] ?? 0));
    }

    private static function checkBookingOverlap(
        Database $db,
        int $spaceId,
        string $spaceName,
        string $bookingDate,
        string $startTime,
        string $endTime,
        ?int $excludeBookingId
    ): float {
        $newStart = self::parseClockMinutes($startTime);
        $newEnd = self::parseClockMinutes($endTime);
        if ($newEnd <= $newStart) {
            HttpException::fail(422, 'invalid_time_range', 'End time must be after start time.', 'end_time');
        }
        $existing = $db->query(
            "SELECT id, booking_ref, client_name, start_time, end_time, status FROM bookings WHERE space_id = ? AND booking_date = ? AND status IN ('Tentative', 'Confirmed', 'Paid')",
            [$spaceId, $bookingDate]
        );
        foreach ($existing as $b) {
            if ($excludeBookingId !== null && (int) $b['id'] === $excludeBookingId) {
                continue;
            }
            $exStart = self::parseClockMinutes((string) $b['start_time']);
            $exEnd = self::parseClockMinutes((string) $b['end_time']);
            if ($newStart < $exEnd && $exStart < $newEnd) {
                HttpException::fail(
                    409,
                    'booking_conflict',
                    'Booking conflict in ' . $spaceName . ' on ' . $bookingDate . ': overlaps with '
                    . (string) $b['booking_ref'] . ' (' . (string) $b['client_name'] . ', '
                    . (string) $b['start_time'] . '-' . (string) $b['end_time'] . ', ' . (string) $b['status'] . ').'
                );
            }
        }
        return round((($newEnd - $newStart) / 60.0) * 100.0) / 100.0;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSpace(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'capacity', 'hourly_rate_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $features = V::parseJson($row['features_json'] ?? '', []);
        $row['features'] = is_array($features) ? array_values($features) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeClient(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'bookings_count', 'total_hire_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeBooking(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'space_id', 'client_id', 'hourly_rate_cents', 'amount_cents', 'is_sample', 'created_at', 'paid_cents', 'balance_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('duration_hours', $row) && $row['duration_hours'] !== null) {
            $row['duration_hours'] = (float) $row['duration_hours'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSetup(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'booking_id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $equip = V::parseJson($row['equipment_json'] ?? '', []);
        $row['equipment'] = is_array($equip) ? array_values($equip) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePayment(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'booking_id', 'amount_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeIncident(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'booking_id', 'cost_estimate_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    private static function syncBookingPaidState(Database $db, int $bookingId): void
    {
        $bk = $db->first('SELECT * FROM bookings WHERE id = ?', [$bookingId]);
        if (!$bk || in_array((string) $bk['status'], ['Cancelled', 'Completed'], true)) {
            return;
        }
        $paid = $db->first(
            "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE booking_id = ? AND status IN ('Paid', 'Deposit')",
            [$bookingId]
        );
        $paidCents = $paid ? (int) $paid['s'] : 0;
        $amountCents = (int) $bk['amount_cents'];
        if ($paidCents >= $amountCents && $amountCents > 0) {
            $db->execute(
                "UPDATE bookings SET status = 'Paid' WHERE id = ? AND status IN ('Tentative', 'Confirmed')",
                [$bookingId]
            );
        }
    }

    // ---- Spaces Catalogue ----

    public function listSpaces(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeSpace'],
                $db->query("SELECT * FROM spaces ORDER BY CASE status WHEN 'Available' THEN 0 WHEN 'Maintenance' THEN 1 ELSE 2 END, space_name ASC")
            );
            return ['spaces' => $rows];
        });
    }

    public function addSpace(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['space_name'] ?? null, 'space_name', ['max' => 120, 'label' => 'Space name']);
            $cap = V::int($input['capacity'] ?? null, 'capacity', ['required' => false, 'min' => 1, 'max' => 5000, 'fallback' => 50]) ?? 50;
            $stype = V::oneOf($input['space_type'] ?? null, self::SPACE_TYPES, 'space_type', ['fallback' => 'Hall']);
            $rate = V::moneyCents($input['hourly_rate'] ?? null, 'hourly_rate', ['min' => 0, 'max' => 5000000, 'label' => 'Hourly rate']);
            $features = V::listOf($input['features'] ?? null, 'features', 12, static fn ($v) => V::text($v, 'feature', ['max' => 40]));
            $status = V::oneOf($input['status'] ?? null, self::SPACE_STATUSES, 'status', ['fallback' => 'Available']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $created = $db->execute(
                'INSERT INTO spaces(space_name, capacity, space_type, hourly_rate_cents, features_json, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $name,
                    $cap,
                    $stype,
                    $rate,
                    json_encode($features, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $status,
                    $notes,
                    V::now(),
                ]
            );
            $row = self::normalizeSpace($db->first('SELECT * FROM spaces WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['space' => $row]];
        }, write: true);
    }

    public function saveSpace(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM spaces WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Space not found.');
            }
            $name = V::text($input['space_name'] ?? null, 'space_name', ['max' => 120, 'label' => 'Space name']);
            $cap = V::int($input['capacity'] ?? null, 'capacity', ['required' => false, 'min' => 1, 'max' => 5000, 'fallback' => (int) $cur['capacity']]) ?? (int) $cur['capacity'];
            $stype = V::oneOf($input['space_type'] ?? null, self::SPACE_TYPES, 'space_type', ['fallback' => $cur['space_type']]);
            $rate = V::moneyCents($input['hourly_rate'] ?? null, 'hourly_rate', ['min' => 0, 'max' => 5000000, 'label' => 'Hourly rate']);
            $features = is_array($input['features'] ?? null)
                ? V::listOf($input['features'], 'features', 12, static fn ($v) => V::text($v, 'feature', ['max' => 40]))
                : V::parseJson($cur['features_json'] ?? '', []);
            $status = V::oneOf($input['status'] ?? null, self::SPACE_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $db->execute(
                'UPDATE spaces SET space_name = ?, capacity = ?, space_type = ?, hourly_rate_cents = ?, features_json = ?, status = ?, notes = ? WHERE id = ?',
                [
                    $name,
                    $cap,
                    $stype,
                    $rate,
                    json_encode($features, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $status,
                    $notes,
                    $id,
                ]
            );
            $row = self::normalizeSpace($db->first('SELECT * FROM spaces WHERE id = ?', [$id]));
            return ['space' => $row];
        }, write: true);
    }

    public function deleteSpace(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM spaces WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Space not found.');
            }
            $db->execute('DELETE FROM spaces WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Hirer Clients Directory ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $clients = $db->query('SELECT * FROM clients ORDER BY client_name ASC');
            $stats = $db->query(
                "SELECT client_id, COUNT(*) AS cnt, COALESCE(SUM(amount_cents), 0) AS total FROM bookings WHERE client_id IS NOT NULL AND status != 'Cancelled' GROUP BY client_id"
            );
            $map = [];
            foreach ($stats as $s) {
                $map[(string) $s['client_id']] = $s;
            }
            $out = [];
            foreach ($clients as $cl) {
                $cl = self::normalizeClient($cl);
                $st = $map[(string) $cl['id']] ?? null;
                $cl['bookings_count'] = $st ? (int) $st['cnt'] : 0;
                $cl['total_hire_cents'] = $st ? (int) $st['total'] : 0;
                $out[] = $cl;
            }
            return ['clients' => $out];
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
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $created = $db->execute(
                'INSERT INTO clients(client_name, organisation, email, phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, $org, $em, $phone, $notes, V::now()]
            );
            $row = self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['client' => $row]];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Hirer client not found.');
            }
            $name = V::text($input['client_name'] ?? null, 'client_name', ['max' => 120, 'label' => 'Client name']);
            $org = V::text($input['organisation'] ?? null, 'organisation', ['required' => false, 'max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $db->execute(
                'UPDATE clients SET client_name = ?, organisation = ?, email = ?, phone = ?, notes = ? WHERE id = ?',
                [$name, $org, $em, $phone, $notes, $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Hirer client not found.');
            }
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Space Schedule & Bookings (Overlap Detection & Hourly Fee Calc) ----

    public function listBookings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $spaceId = V::int($input['space_id'] ?? null, 'space_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $bookingDate = V::day($input['date'] ?? null, 'date', ['required' => false, 'fallback' => '']);

            $sql = 'SELECT * FROM bookings WHERE 1=1';
            $params = [];
            if ($spaceId !== null) {
                $sql .= ' AND space_id = ?';
                $params[] = $spaceId;
            }
            if ($bookingDate !== '') {
                $sql .= ' AND booking_date = ?';
                $params[] = $bookingDate;
            }
            $sql .= ' ORDER BY booking_date ASC, start_time ASC LIMIT 200';
            $bookings = $db->query($sql, $params);

            $payRows = $db->query(
                "SELECT booking_id, COALESCE(SUM(CASE WHEN status IN ('Paid', 'Deposit') THEN amount_cents ELSE 0 END), 0) AS paid_cents FROM payments GROUP BY booking_id"
            );
            $setupRows = $db->query('SELECT booking_id, setup_complete, layout FROM setup_requirements');

            $pMap = [];
            foreach ($payRows as $pr) {
                $pMap[(string) $pr['booking_id']] = (int) $pr['paid_cents'];
            }
            $sMap = [];
            foreach ($setupRows as $sr) {
                $sMap[(string) $sr['booking_id']] = $sr;
            }

            $out = [];
            foreach ($bookings as $bk) {
                $bk = self::normalizeBooking($bk);
                $bkKey = (string) $bk['id'];
                $paidCents = $pMap[$bkKey] ?? 0;
                $bk['paid_cents'] = $paidCents;
                $bk['balance_cents'] = max(0, (int) $bk['amount_cents'] - $paidCents);
                $su = $sMap[$bkKey] ?? null;
                $bk['setup_status'] = $su ? (string) $su['setup_complete'] : '';
                $bk['setup_layout'] = $su ? (string) $su['layout'] : '';
                $out[] = $bk;
            }
            return ['bookings' => $out];
        });
    }

    public function getBookingConfirmation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $booking = self::normalizeBooking($db->first('SELECT * FROM bookings WHERE id = ?', [$id]));
            if (!$booking) {
                HttpException::fail(404, 'not_found', 'Booking not found.');
            }
            $space = self::normalizeSpace($db->first('SELECT * FROM spaces WHERE id = ?', [$booking['space_id']]));
            $setups = array_map(
                [self::class, 'normalizeSetup'],
                $db->query('SELECT * FROM setup_requirements WHERE booking_id = ?', [$id])
            );
            $payments = array_map(
                [self::class, 'normalizePayment'],
                $db->query('SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_date ASC', [$id])
            );
            return [
                'booking' => $booking,
                'space' => $space,
                'setups' => $setups,
                'payments' => $payments,
            ];
        });
    }

    public function addBooking(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $spaceId = V::rowId($input['space_id'] ?? null, 'space_id');
            $space = $db->first('SELECT * FROM spaces WHERE id = ?', [$spaceId]);
            if (!$space) {
                HttpException::fail(404, 'space_not_found', 'Selected space not found.');
            }
            if ((string) $space['status'] !== 'Available') {
                HttpException::fail(
                    409,
                    'space_unavailable',
                    (string) $space['space_name'] . ' is currently marked ' . (string) $space['status'] . ' and cannot be booked.'
                );
            }

            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $clientName = V::text($input['client_name'] ?? null, 'client_name', ['required' => false, 'max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            if ($clientId !== null) {
                $cl = $db->first('SELECT * FROM clients WHERE id = ?', [$clientId]);
                if ($cl) {
                    if ($clientName === '') {
                        $clientName = (string) ($cl['client_name'] ?? '');
                    }
                    if ($em === '') {
                        $em = (string) ($cl['email'] ?? '');
                    }
                    if ($phone === '') {
                        $phone = (string) ($cl['phone'] ?? '');
                    }
                }
            }
            if ($clientName === '') {
                HttpException::fail(422, 'client_name_required', 'Client name is required.', 'client_name');
            }

            $bookingDate = V::day($input['booking_date'] ?? null, 'booking_date', ['label' => 'Booking date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $purpose = V::oneOf($input['purpose'] ?? null, self::PURPOSES, 'purpose', ['fallback' => 'Meeting']);
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status', ['fallback' => 'Confirmed']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            if (in_array($status, self::BLOCKING_STATUSES, true)) {
                $hours = self::checkBookingOverlap($db, $spaceId, (string) $space['space_name'], $bookingDate, $startTime, $endTime, null);
            } else {
                $stM = self::parseClockMinutes($startTime);
                $enM = self::parseClockMinutes($endTime);
                if ($enM <= $stM) {
                    HttpException::fail(422, 'invalid_time_range', 'End time must be after start time.', 'end_time');
                }
                $hours = round((($enM - $stM) / 60.0) * 100.0) / 100.0;
            }

            $rateCents = (int) $space['hourly_rate_cents'];
            $amountCents = (int) round($hours * $rateCents);

            $nextSeq = (int) ($ctx['settings']['booking_seq'] ?? 300) + 1;
            $db->execute('UPDATE business_settings SET booking_seq = ? WHERE id = 1', [$nextSeq]);
            $ref = 'VH-' . $nextSeq;

            $created = $db->execute(
                'INSERT INTO bookings(booking_ref, space_id, space_name, client_id, client_name, email, phone, booking_date, start_time, end_time, duration_hours, hourly_rate_cents, purpose, status, amount_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $ref, $spaceId, (string) $space['space_name'], $clientId, $clientName, $em, $phone,
                    $bookingDate, $startTime, $endTime, $hours, $rateCents, $purpose, $status, $amountCents, $notes, V::now(),
                ]
            );
            $row = self::normalizeBooking($db->first('SELECT * FROM bookings WHERE id = ?', [$created['lastInsertRowid']]));
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

            $spaceId = (array_key_exists('space_id', $input) && $input['space_id'] !== null && $input['space_id'] !== '')
                ? V::rowId($input['space_id'], 'space_id')
                : (int) $cur['space_id'];
            $space = $db->first('SELECT * FROM spaces WHERE id = ?', [$spaceId]);
            if (!$space) {
                HttpException::fail(404, 'space_not_found', 'Selected space not found.');
            }

            $clientName = V::text($input['client_name'] ?? null, 'client_name', ['max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $bookingDate = V::day($input['booking_date'] ?? null, 'booking_date', ['label' => 'Booking date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $purpose = V::oneOf($input['purpose'] ?? null, self::PURPOSES, 'purpose', ['fallback' => $cur['purpose']]);
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            if (in_array($status, self::BLOCKING_STATUSES, true)) {
                $hours = self::checkBookingOverlap($db, $spaceId, (string) $space['space_name'], $bookingDate, $startTime, $endTime, $id);
            } else {
                $stM = self::parseClockMinutes($startTime);
                $enM = self::parseClockMinutes($endTime);
                if ($enM <= $stM) {
                    HttpException::fail(422, 'invalid_time_range', 'End time must be after start time.', 'end_time');
                }
                $hours = round((($enM - $stM) / 60.0) * 100.0) / 100.0;
            }

            $rateCents = (int) $space['hourly_rate_cents'];
            $amountCents = (int) round($hours * $rateCents);

            $db->execute(
                'UPDATE bookings SET space_id = ?, space_name = ?, client_name = ?, email = ?, phone = ?, booking_date = ?, start_time = ?, end_time = ?, duration_hours = ?, hourly_rate_cents = ?, purpose = ?, status = ?, amount_cents = ?, notes = ? WHERE id = ?',
                [
                    $spaceId, (string) $space['space_name'], $clientName, $em, $phone,
                    $bookingDate, $startTime, $endTime, $hours, $rateCents, $purpose, $status, $amountCents, $notes, $id,
                ]
            );
            return ['booking' => self::normalizeBooking($db->first('SELECT * FROM bookings WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setBookingStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM bookings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Booking not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::BOOKING_STATUSES, 'status');
            if (in_array($status, self::BLOCKING_STATUSES, true)) {
                self::checkBookingOverlap(
                    $db,
                    (int) $cur['space_id'],
                    (string) $cur['space_name'],
                    (string) $cur['booking_date'],
                    (string) $cur['start_time'],
                    (string) $cur['end_time'],
                    $id
                );
            }
            $db->execute('UPDATE bookings SET status = ? WHERE id = ?', [$status, $id]);
            return ['booking' => self::normalizeBooking($db->first('SELECT * FROM bookings WHERE id = ?', [$id]))];
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
            $db->execute('DELETE FROM setup_requirements WHERE booking_id = ?', [$id]);
            $db->execute('DELETE FROM payments WHERE booking_id = ?', [$id]);
            $db->execute('DELETE FROM bookings WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Setup & Facilities Checklists ----

    public function listSetups(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeSetup'],
                $db->query("SELECT * FROM setup_requirements ORDER BY CASE setup_complete WHEN 'Not yet' THEN 0 ELSE 1 END, booking_date ASC, start_time ASC")
            );
            return ['setups' => $rows];
        });
    }

    public function addSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $bookingId = V::rowId($input['booking_id'] ?? null, 'booking_id');
            $bk = $db->first('SELECT * FROM bookings WHERE id = ?', [$bookingId]);
            if (!$bk) {
                HttpException::fail(404, 'booking_not_found', 'Booking not found.');
            }
            $layout = V::oneOf($input['layout'] ?? null, self::LAYOUTS, 'layout', ['fallback' => 'Theatre']);
            $equip = V::listOf($input['equipment'] ?? null, 'equipment', 16, static fn ($v) => V::text($v, 'equipment', ['max' => 50]));
            $catering = V::oneOf($input['catering_required'] ?? null, self::YES_NO, 'catering_required', ['fallback' => 'No']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $complete = V::oneOf($input['setup_complete'] ?? null, self::SETUP_COMPLETE_OPTS, 'setup_complete', ['fallback' => 'Not yet']);

            $created = $db->execute(
                "INSERT INTO setup_requirements(booking_id, booking_ref, space_name, booking_date, start_time, client_name, layout, equipment_json, catering_required, notes, setup_complete, completed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)",
                [
                    $bookingId,
                    (string) $bk['booking_ref'],
                    (string) $bk['space_name'],
                    (string) $bk['booking_date'],
                    (string) $bk['start_time'],
                    (string) $bk['client_name'],
                    $layout,
                    json_encode($equip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $catering,
                    $notes,
                    $complete,
                    V::now(),
                ]
            );
            $row = self::normalizeSetup($db->first('SELECT * FROM setup_requirements WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['setup' => $row]];
        }, write: true);
    }

    public function saveSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM setup_requirements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Setup checklist not found.');
            }
            $layout = V::oneOf($input['layout'] ?? null, self::LAYOUTS, 'layout', ['fallback' => $cur['layout']]);
            $equip = is_array($input['equipment'] ?? null)
                ? V::listOf($input['equipment'], 'equipment', 16, static fn ($v) => V::text($v, 'equipment', ['max' => 50]))
                : V::parseJson($cur['equipment_json'] ?? '', []);
            $catering = V::oneOf($input['catering_required'] ?? null, self::YES_NO, 'catering_required', ['fallback' => $cur['catering_required']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE setup_requirements SET layout = ?, equipment_json = ?, catering_required = ?, notes = ? WHERE id = ?',
                [
                    $layout,
                    json_encode($equip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $catering,
                    $notes,
                    $id,
                ]
            );
            $row = self::normalizeSetup($db->first('SELECT * FROM setup_requirements WHERE id = ?', [$id]));
            return ['setup' => $row];
        }, write: true);
    }

    public function toggleSetupComplete(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM setup_requirements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Setup checklist not found.');
            }
            $nextVal = !empty($input['setup_complete'])
                ? V::oneOf($input['setup_complete'], self::SETUP_COMPLETE_OPTS, 'setup_complete')
                : (((string) $cur['setup_complete'] === 'Yes') ? 'Not yet' : 'Yes');
            $by = ($nextVal === 'Yes') ? (string) ($ctx['member']['display_name'] ?? '') : '';

            $db->execute('UPDATE setup_requirements SET setup_complete = ?, completed_by = ? WHERE id = ?', [$nextVal, $by, $id]);
            $row = self::normalizeSetup($db->first('SELECT * FROM setup_requirements WHERE id = ?', [$id]));
            return ['setup' => $row];
        }, write: true);
    }

    public function deleteSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM setup_requirements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Setup checklist not found.');
            }
            $db->execute('DELETE FROM setup_requirements WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Payments & Deposits Ledger ----

    public function listPayments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizePayment'],
                $db->query("SELECT * FROM payments ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Deposit' THEN 1 WHEN 'Paid' THEN 2 ELSE 3 END, payment_date DESC, created_at DESC")
            );
            return ['payments' => $rows];
        });
    }

    public function addPayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $bookingId = V::rowId($input['booking_id'] ?? null, 'booking_id');
            $bk = $db->first('SELECT * FROM bookings WHERE id = ?', [$bookingId]);
            if (!$bk) {
                HttpException::fail(404, 'booking_not_found', 'Booking not found.');
            }
            $amt = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 100000000, 'label' => 'Amount']);
            $payDate = V::day($input['payment_date'] ?? null, 'payment_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $method = V::oneOf($input['method'] ?? null, self::PAY_METHODS, 'method', ['fallback' => 'Bank transfer']);
            $status = V::oneOf($input['status'] ?? null, self::PAY_STATUSES, 'status', ['fallback' => 'Paid']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                'INSERT INTO payments(booking_id, booking_ref, client_name, space_name, amount_cents, payment_date, method, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $bookingId,
                    (string) $bk['booking_ref'],
                    (string) $bk['client_name'],
                    (string) $bk['space_name'],
                    $amt,
                    $payDate,
                    $method,
                    $status,
                    $notes,
                    V::now(),
                ]
            );
            self::syncBookingPaidState($db, $bookingId);
            $row = self::normalizePayment($db->first('SELECT * FROM payments WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['payment' => $row]];
        }, write: true);
    }

    public function setPaymentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM payments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Payment not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::PAY_STATUSES, 'status');
            $db->execute('UPDATE payments SET status = ? WHERE id = ?', [$status, $id]);
            self::syncBookingPaidState($db, (int) $cur['booking_id']);
            return ['payment' => self::normalizePayment($db->first('SELECT * FROM payments WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deletePayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM payments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Payment not found.');
            }
            $db->execute('DELETE FROM payments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Incidents & Damage Reports ----

    public function listIncidents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeIncident'],
                $db->query("SELECT * FROM incidents ORDER BY CASE status WHEN 'Reported' THEN 0 WHEN 'Assessing' THEN 1 WHEN 'Invoiced' THEN 2 ELSE 3 END, created_at DESC")
            );
            return ['incidents' => $rows];
        });
    }

    public function addIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $bookingId = V::int($input['booking_id'] ?? null, 'booking_id', ['required' => false, 'min' => 1, 'fallback' => null]);
            $bk = $bookingId !== null ? $db->first('SELECT * FROM bookings WHERE id = ?', [$bookingId]) : null;
            $ref = $bk ? (string) $bk['booking_ref'] : '';
            $spaceName = $bk ? (string) $bk['space_name'] : V::text($input['space_name'] ?? null, 'space_name', ['required' => false, 'max' => 120]);
            $clientName = $bk ? (string) $bk['client_name'] : V::text($input['client_name'] ?? null, 'client_name', ['required' => false, 'max' => 120]);
            $incType = V::oneOf($input['incident_type'] ?? null, self::INCIDENT_TYPES, 'incident_type', ['fallback' => 'Damage']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1000, 'label' => 'Description']);
            $cost = V::moneyCents($input['cost_estimate'] ?? null, 'cost_estimate', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0]);
            $status = V::oneOf($input['status'] ?? null, self::INCIDENT_STATUSES, 'status', ['fallback' => 'Reported']);

            $created = $db->execute(
                'INSERT INTO incidents(booking_id, booking_ref, space_name, client_name, incident_type, description, cost_estimate_cents, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$bookingId, $ref, $spaceName, $clientName, $incType, $desc, $cost, $status, V::now()]
            );
            $row = self::normalizeIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['incident' => $row]];
        }, write: true);
    }

    public function setIncidentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident report not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::INCIDENT_STATUSES, 'status');
            $db->execute('UPDATE incidents SET status = ? WHERE id = ?', [$status, $id]);
            return ['incident' => self::normalizeIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident report not found.');
            }
            $db->execute('DELETE FROM incidents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
