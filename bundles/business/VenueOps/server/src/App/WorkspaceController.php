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

final class WorkspaceController
{
    private const ROLES = ['manager', 'coordinator', 'facilities'];
    private const PRESETS = ['indigo', 'burgundy', 'emerald', 'brass'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['spaces', 'clients', 'bookings', 'setup_requirements', 'payments', 'incidents'];
    private const CLEAR_SAMPLE_TABLES = ['incidents', 'payments', 'setup_requirements', 'bookings', 'clients', 'spaces'];

    /** Pure-integer Gregorian civil date -> days since 1970-01-01 (Hinnant algorithm, zipp-php.wasm safe). */
    public static function daysFromCivil(int $y, int $m, int $d): int
    {
        $y -= ($m <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        return $era * 146097 + $doe - 719468;
    }

    /** Pure-integer days since 1970-01-01 -> ISO YYYY-MM-DD (Hinnant algorithm, zipp-php.wasm safe). */
    public static function civilFromDays(int $z): string
    {
        $z += 719468;
        $era = intdiv($z >= 0 ? $z : $z - 146096, 146097);
        $doe = $z - $era * 146097;
        $yoe = intdiv($doe - intdiv($doe, 1460) + intdiv($doe, 36524) - intdiv($doe, 146096), 365);
        $y = $yoe + $era * 400;
        $doy = $doe - (365 * $yoe + intdiv($yoe, 4) - intdiv($yoe, 100));
        $mp = intdiv(5 * $doy + 2, 153);
        $d = $doy - intdiv(153 * $mp + 2, 5) + 1;
        $m = $mp + ($mp < 10 ? 3 : -9);
        $y += ($m <= 2) ? 1 : 0;
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    /** Add delta days to an ISO YYYY-MM-DD string using pure-integer Hinnant math. */
    public static function addIsoDays(string $baseDay, int $delta): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($baseDay), $m)) {
            return V::utcDay($delta);
        }
        return self::civilFromDays(self::daysFromCivil((int) $m[1], (int) $m[2], (int) $m[3]) + $delta);
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'booking_seq', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row) && $row[$intCol] !== null) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('tax_rate', $row) && $row['tax_rate'] !== null) {
            $row['tax_rate'] = (float) $row['tax_rate'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeMember(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['is_owner', 'created_at'] as $intCol) {
            if (array_key_exists($intCol, $row) && $row[$intCol] !== null) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function badgeCounts(Database $db): array
    {
        $activeBookings = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS val FROM bookings WHERE status IN ('Enquiry', 'Tentative', 'Confirmed', 'Paid')"
        );
        $pendingSetups = $db->first("SELECT COUNT(*) AS c FROM setup_requirements WHERE setup_complete != 'Yes'");
        $collected = $db->first("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE status IN ('Paid', 'Deposit')");
        $pendingPay = $db->first("SELECT COALESCE(SUM(amount_cents), 0) AS s, COUNT(*) AS c FROM payments WHERE status = 'Pending'");
        $openIncidents = $db->first("SELECT COUNT(*) AS c FROM incidents WHERE status != 'Closed'");

        return [
            'activeBookings' => $activeBookings ? (int) $activeBookings['c'] : 0,
            'bookedValueCents' => $activeBookings ? (int) $activeBookings['val'] : 0,
            'pendingSetups' => $pendingSetups ? (int) $pendingSetups['c'] : 0,
            'collectedCents' => $collected ? (int) $collected['s'] : 0,
            'pendingPaymentsCents' => $pendingPay ? (int) $pendingPay['s'] : 0,
            'pendingPaymentsCount' => $pendingPay ? (int) $pendingPay['c'] : 0,
            'openIncidents' => $openIncidents ? (int) $openIncidents['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedVenueOpsSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $spaceIds = [];
        $spaces = [
            ['Grand Civic Hall', 220, 'Hall', 18000, ['AV system', 'Kitchen access', 'Stage', 'Parking', 'Wheelchair access', 'Wi-Fi'], 'Available', 'Heritage timber hall with acoustic panelling and commercial prep kitchen'],
            ['Atrium Boardroom', 24, 'Meeting room', 7500, ['AV system', 'Wi-Fi', 'Wheelchair access'], 'Available', '4K conference display, video bar and natural north light'],
            ['Dance & Rehearsal Studio A', 45, 'Studio', 6500, ['AV system', 'Parking', 'Wi-Fi'], 'Available', 'Sprung hardwood floor and full wall mirrors'],
            ['Indoor Sports Court 1', 80, 'Sports court', 9000, ['Parking', 'Wheelchair access'], 'Available', 'Multi-use futsal, basketball and netball markings'],
            ['Courtyard Amphitheatre', 120, 'Outdoor area', 11000, ['Stage', 'Parking', 'Wheelchair access'], 'Maintenance', 'Festoon lighting upgrade underway until Friday'],
        ];
        $spaceCount = count($spaces);
        foreach ($spaces as $i => $sp) {
            $si = $db->execute(
                'INSERT INTO spaces(space_name, capacity, space_type, hourly_rate_cents, features_json, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $sp[0],
                    $sp[1],
                    $sp[2],
                    $sp[3],
                    json_encode($sp[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $sp[5],
                    $sp[6],
                    $ts - ($spaceCount - $i) * 60,
                ]
            );
            $spaceIds[$sp[0]] = $si['lastInsertRowid'];
        }

        $clientIds = [];
        $clients = [
            ['Natalie Byrne', 'Harbour Choral Society', 'natalie@harbourchoral.example', '0417 204 881', 'Regular Thursday rehearsals + quarterly concerts'],
            ['Kenji Takahashi', 'Northside Tech Collective', 'kenji@northsidetech.example', '0402 991 334', 'Monthly workshops; needs projector & fast Wi-Fi'],
            ['Amara Osei', 'Bayside Futsal League', 'amara@baysidefutsal.example', '0431 700 419', 'Weekly Tuesday & Saturday court bookings'],
            ['Rebecca Hollis', 'Private Celebration', 'rebecca.hollis@example.com', '0422 518 092', '50th birthday banquet with external caterer'],
        ];
        $clientCount = count($clients);
        foreach ($clients as $c => $cl) {
            $ci = $db->execute(
                'INSERT INTO clients(client_name, organisation, email, phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$cl[0], $cl[1], $cl[2], $cl[3], $cl[4], $ts - ($clientCount - $c) * 60]
            );
            $clientIds[$cl[0]] = $ci['lastInsertRowid'];
        }

        $dayPlus1 = self::addIsoDays($todayDay, 1);
        $dayPlus3 = self::addIsoDays($todayDay, 3);
        $dayMinus2 = self::addIsoDays($todayDay, -2);

        $bookingIds = [];
        $bookings = [
            ['VH-301', $spaceIds['Atrium Boardroom'], 'Atrium Boardroom', $clientIds['Kenji Takahashi'], 'Kenji Takahashi', 'kenji@northsidetech.example', '0402 991 334', $todayDay, '09:00', '13:00', 4, 7500, 'Class or workshop', 'Paid', 30000, 'AI product workshop — coffee urn at 08:45'],
            ['VH-302', $spaceIds['Grand Civic Hall'], 'Grand Civic Hall', $clientIds['Natalie Byrne'], 'Natalie Byrne', 'natalie@harbourchoral.example', '0417 204 881', $todayDay, '18:00', '21:30', 3.5, 18000, 'Performance', 'Confirmed', 63000, 'Choir dress rehearsal + risers'],
            ['VH-303', $spaceIds['Indoor Sports Court 1'], 'Indoor Sports Court 1', $clientIds['Amara Osei'], 'Amara Osei', 'amara@baysidefutsal.example', '0431 700 419', $dayPlus1, '17:00', '20:00', 3, 9000, 'Sport', 'Confirmed', 27000, 'Junior tournament finals'],
            ['VH-304', $spaceIds['Grand Civic Hall'], 'Grand Civic Hall', $clientIds['Rebecca Hollis'], 'Rebecca Hollis', 'rebecca.hollis@example.com', '0422 518 092', $dayPlus3, '17:00', '23:00', 6, 18000, 'Party or celebration', 'Tentative', 108000, 'Deposit invoiced; banquet for 120 guests'],
        ];
        $bookingCount = count($bookings);
        foreach ($bookings as $b => $bk) {
            $bi = $db->execute(
                'INSERT INTO bookings(booking_ref, space_id, space_name, client_id, client_name, email, phone, booking_date, start_time, end_time, duration_hours, hourly_rate_cents, purpose, status, amount_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $bk[0], $bk[1], $bk[2], $bk[3], $bk[4], $bk[5], $bk[6],
                    $bk[7], $bk[8], $bk[9], $bk[10], $bk[11], $bk[12], $bk[13],
                    $bk[14], $bk[15], $ts - ($bookingCount - $b) * 180,
                ]
            );
            $bookingIds[$bk[0]] = $bi['lastInsertRowid'];
        }

        $setups = [
            [$bookingIds['VH-301'], 'VH-301', 'Atrium Boardroom', $todayDay, '09:00', 'Kenji Takahashi', 'Boardroom', ['Chairs', 'Tables', 'Projector', 'Whiteboard'], 'Yes', 'HDMI adapter on table + morning tea station', 'Yes', 'Facilities Lead'],
            [$bookingIds['VH-302'], 'VH-302', 'Grand Civic Hall', $todayDay, '18:00', 'Natalie Byrne', 'Theatre', ['Chairs', 'PA system', 'Stage risers'], 'No', '120 chairs in 10 rows with centre aisle; 3 choir risers upstage', 'Not yet', ''],
            [$bookingIds['VH-304'], 'VH-304', 'Grand Civic Hall', $dayPlus3, '17:00', 'Rebecca Hollis', 'Banquet', ['Chairs', 'Tables', 'PA system'], 'Yes', '12 round banquet tables + cake table near kitchen doors', 'Not yet', ''],
        ];
        foreach ($setups as $sr) {
            $db->execute(
                'INSERT INTO setup_requirements(booking_id, booking_ref, space_name, booking_date, start_time, client_name, layout, equipment_json, catering_required, notes, setup_complete, completed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $sr[5], $sr[6],
                    json_encode($sr[7], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $sr[8], $sr[9], $sr[10], $sr[11], $ts,
                ]
            );
        }

        $payments = [
            [$bookingIds['VH-301'], 'VH-301', 'Kenji Takahashi', 'Atrium Boardroom', 30000, $todayDay, 'Card', 'Paid', 'Full room hire paid upfront'],
            [$bookingIds['VH-302'], 'VH-302', 'Natalie Byrne', 'Grand Civic Hall', 25000, $dayMinus2, 'Bank transfer', 'Deposit', 'Booking deposit received; balance due after event'],
            [$bookingIds['VH-304'], 'VH-304', 'Rebecca Hollis', 'Grand Civic Hall', 35000, $todayDay, 'Invoice', 'Pending', '30% deposit invoice sent'],
        ];
        foreach ($payments as $pr) {
            $db->execute(
                'INSERT INTO payments(booking_id, booking_ref, client_name, space_name, amount_cents, payment_date, method, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$pr[0], $pr[1], $pr[2], $pr[3], $pr[4], $pr[5], $pr[6], $pr[7], $pr[8], $ts]
            );
        }

        $db->execute(
            'INSERT INTO incidents(booking_id, booking_ref, space_name, client_name, incident_type, description, cost_estimate_cents, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$bookingIds['VH-303'], 'VH-303', 'Indoor Sports Court 1', 'Amara Osei', 'Damage', 'Scuff marks and minor crack on east baseline timber kickboard during previous match.', 18500, 'Assessing', $ts - 43200]
        );

        $db->execute('UPDATE business_settings SET booking_seq = 304 WHERE id = 1 AND booking_seq < 304');
        return self::sampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            $settings = self::normalizeSettings(Context::getBusinessSettings($db));
            if (!$settings || empty($settings['setup_done'])) {
                return [
                    'setupDone' => false,
                    'isOwner' => $me['isOwner'],
                    'access' => $me['isOwner'] ? 'setup' : 'not_ready',
                    'me' => ['userId' => $me['userId'], 'isOwner' => $me['isOwner'], 'role' => $me['isOwner'] ? 'owner' : ''],
                    'settings' => $settings,
                    'counts' => null,
                ];
            }
            $member = self::normalizeMember(Context::getTeamMember($db, (string) $me['userId']));
            if ($me['isOwner'] && !$member) {
                $member = [
                    'user_id' => $me['userId'],
                    'display_name' => $settings['owner_name'] ?: 'Owner',
                    'role' => 'owner',
                    'is_owner' => 1,
                    'status' => 'active',
                ];
            }
            if (!$member) {
                return [
                    'setupDone' => true,
                    'isOwner' => false,
                    'access' => 'join',
                    'businessName' => $settings['business_name'],
                    'me' => ['userId' => $me['userId'], 'isOwner' => false, 'role' => ''],
                    'settings' => ['business_name' => $settings['business_name'], 'brand_preset' => $settings['brand_preset']],
                    'counts' => null,
                ];
            }
            if (($member['status'] ?? '') !== 'active') {
                return [
                    'setupDone' => true,
                    'isOwner' => false,
                    'access' => 'pending',
                    'businessName' => $settings['business_name'],
                    'me' => ['userId' => $me['userId'], 'isOwner' => false, 'role' => $member['role'], 'displayName' => $member['display_name']],
                    'settings' => ['business_name' => $settings['business_name'], 'brand_preset' => $settings['brand_preset']],
                    'counts' => null,
                ];
            }
            return [
                'setupDone' => true,
                'isOwner' => $me['isOwner'],
                'access' => 'granted',
                'me' => ['userId' => $me['userId'], 'isOwner' => $me['isOwner'], 'role' => $member['role'], 'displayName' => $member['display_name']],
                'settings' => $settings,
                'counts' => self::badgeCounts($db),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Venue name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Venue Hire & Space Scheduling';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'indigo']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $ts]
                );
            }

            $member = Context::getTeamMember($db, (string) $me['userId']);
            if (!$member) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, 'owner', 1, 'active', ?)",
                    [$me['userId'], $ownerName, $ts]
                );
            } else {
                $db->execute(
                    "UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?",
                    [$ownerName, $me['userId']]
                );
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedVenueOpsSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Venue name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, V::now()]
            );
            return ['settings' => self::normalizeSettings(Context::getBusinessSettings($db))];
        }, write: true);
    }

    public function listTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $members = array_map(
                [self::class, 'normalizeMember'],
                $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC')
            );
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This venue workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::ROLES, 'requested_role', ['fallback' => 'coordinator']);
            $existing = Context::getTeamMember($db, (string) $me['userId']);
            if ($existing) {
                return ['member' => self::normalizeMember($existing)];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['member' => self::normalizeMember(Context::getTeamMember($db, (string) $me['userId']))],
            ];
        }, write: true);
    }

    public function updateMember(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $targetId = V::text($input['user_id'] ?? null, 'user_id', ['max' => 120]);
            $target = Context::getTeamMember($db, $targetId);
            if (!$target) {
                HttpException::fail(404, 'member_not_found', 'Team member not found.');
            }
            if (!empty($target['is_owner'])) {
                HttpException::fail(403, 'cannot_edit_owner', 'The owner role cannot be changed.');
            }
            $role = V::oneOf($input['role'] ?? null, self::ROLES, 'role', ['fallback' => $target['role']]);
            $status = V::oneOf($input['status'] ?? null, ['active', 'pending'], 'status', ['fallback' => $target['status']]);
            $db->execute('UPDATE team_members SET role = ?, status = ? WHERE user_id = ?', [$role, $status, $targetId]);
            return ['member' => self::normalizeMember(Context::getTeamMember($db, $targetId))];
        }, write: true);
    }

    public function removeMember(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $targetId = V::text($input['user_id'] ?? null, 'user_id', ['max' => 120]);
            $target = Context::getTeamMember($db, $targetId);
            if (!$target) {
                HttpException::fail(404, 'member_not_found', 'Team member not found.');
            }
            if (!empty($target['is_owner'])) {
                HttpException::fail(403, 'cannot_remove_owner', 'The business owner cannot be removed.');
            }
            $db->execute('DELETE FROM team_members WHERE user_id = ?', [$targetId]);
            return ['removed' => true];
        }, write: true);
    }

    public function loadSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $loaded = self::seedVenueOpsSample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::badgeCounts($db),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_SAMPLE_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            return [
                'sampleCount' => 0,
                'counts' => self::badgeCounts($db),
            ];
        }, write: true);
    }
}
