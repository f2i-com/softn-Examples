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
    private const PRESETS = ['coastal', 'coral', 'dune', 'indigo'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const JOIN_ROLES = ['manager', 'coordinator', 'cleaner'];
    private const SAMPLE_TABLES = ['properties', 'cleaners', 'bookings', 'turnovers', 'inspections', 'property_supplies'];
    private const CLEAR_SAMPLE_TABLES = ['inspections', 'turnovers', 'property_supplies', 'bookings', 'cleaners', 'properties'];

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
        foreach (['id', 'setup_done', 'updated_at'] as $intCol) {
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

    /** @return list<array<string, mixed>> */
    public static function findSameDayWindows(Database $db, string $targetDay): array
    {
        $checkOuts = $db->query(
            "SELECT b.*, p.property_name, p.address AS property_address, p.access_instructions, p.bedrooms, p.bathrooms "
            . "FROM bookings b JOIN properties p ON p.id = b.property_id "
            . "WHERE b.check_out = ? AND b.status != 'Cancelled' ORDER BY p.property_name ASC",
            [$targetDay]
        );
        $checkIns = $db->query(
            "SELECT b.* FROM bookings b WHERE b.check_in = ? AND b.status != 'Cancelled'",
            [$targetDay]
        );
        $inByProp = [];
        foreach ($checkIns as $ci) {
            $inByProp[(string) $ci['property_id']] = $ci;
        }
        $dayTurnovers = $db->query(
            'SELECT t.*, c.name AS cleaner_name FROM turnovers t LEFT JOIN cleaners c ON c.id = t.cleaner_id WHERE t.turnover_date = ?',
            [$targetDay]
        );
        $turnByProp = [];
        foreach ($dayTurnovers as $tv) {
            $turnByProp[(string) $tv['property_id']] = $tv;
        }

        $windows = [];
        foreach ($checkOuts as $outB) {
            $propKey = (string) $outB['property_id'];
            if (!isset($inByProp[$propKey])) {
                continue;
            }
            $inB = $inByProp[$propKey];
            $tv = $turnByProp[$propKey] ?? null;
            $windows[] = [
                'property_id' => (int) $outB['property_id'],
                'property_name' => (string) ($outB['property_name'] ?? ''),
                'property_address' => (string) ($outB['property_address'] ?? ''),
                'access_instructions' => (string) ($outB['access_instructions'] ?? ''),
                'bedrooms' => (int) ($outB['bedrooms'] ?? 0),
                'bathrooms' => (float) ($outB['bathrooms'] ?? 0),
                'checkout_booking_id' => (int) $outB['id'],
                'departing_guest' => (string) ($outB['guest_name'] ?? ''),
                'departing_platform' => (string) ($outB['platform'] ?? ''),
                'checkin_booking_id' => (int) $inB['id'],
                'arriving_guest' => (string) ($inB['guest_name'] ?? ''),
                'arriving_guests' => (int) ($inB['guest_count'] ?? 0),
                'arriving_platform' => (string) ($inB['platform'] ?? ''),
                'turnover_id' => $tv ? (int) $tv['id'] : null,
                'turnover_status' => $tv ? (string) $tv['status'] : 'Unscheduled',
                'cleaner_name' => $tv ? (string) ($tv['cleaner_name'] ?? '') : '',
                'start_time' => $tv ? (string) ($tv['start_time'] ?? '') : '',
                'ready' => $tv ? ((string) $tv['status'] === 'Guest-Ready') : false,
            ];
        }
        return $windows;
    }

    /** @return array<string, int> */
    public static function readCounts(Database $db, string $todayDay): array
    {
        $sameDay = self::findSameDayWindows($db, $todayDay);
        $urgentPending = 0;
        foreach ($sameDay as $w) {
            if (empty($w['ready'])) {
                $urgentPending++;
            }
        }
        $todayTurns = $db->first('SELECT COUNT(*) AS c FROM turnovers WHERE turnover_date = ?', [$todayDay]);
        $guestReady = $db->first("SELECT COUNT(*) AS c FROM turnovers WHERE turnover_date = ? AND status = 'Guest-Ready'", [$todayDay]);
        $followUps = $db->first("SELECT COUNT(*) AS c FROM inspections WHERE follow_up_required = 'Yes'");
        $lowSupplies = $db->first("SELECT COUNT(*) AS c FROM property_supplies WHERE status IN ('Low', 'Out')");
        $liveProps = $db->first("SELECT COUNT(*) AS c FROM properties WHERE status = 'Live'");
        return [
            'sameDayUrgent' => $urgentPending,
            'sameDayTotal' => count($sameDay),
            'todayTurnovers' => $todayTurns ? (int) $todayTurns['c'] : 0,
            'guestReadyToday' => $guestReady ? (int) $guestReady['c'] : 0,
            'followUps' => $followUps ? (int) $followUps['c'] : 0,
            'lowSupplies' => $lowSupplies ? (int) $lowSupplies['c'] : 0,
            'liveProperties' => $liveProps ? (int) $liveProps['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedStayReadySample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $pRows = [
            ['Seaview Apartment 4B', '4B / 18 Marine Parade, Manly', 'Apartment', 2, 2, 'Lockbox beside glass entry: 4829. WiFi: Seaview4B / CoastBreeze26. Linen cupboard code: 1104.', 'Rebecca & Owen Shaw', 'Live'],
            ['Lagoon Terrace House', '92 Campbell St, Bondi Beach', 'House', 3, 2.5, 'Smart keypad front door: 7741#. Cleaner master key in courtyard lockbox: 3390. WiFi: LagoonStay / SunSand99.', 'Daniel Mercer', 'Live'],
            ['Harbour Studio 12', '12 / 40 Kirribilli Ave, Kirribilli', 'Studio', 1, 1, 'Fob in matte black lockbox on bike rail: 6012. WiFi: Harbour12 / FerryView88.', 'Nadia Al-Mansoor', 'Live'],
            ['Eucalyptus Ridge Cabin', '14 Cliff Rd, Palm Beach', 'Cabin', 2, 1, 'Timber gate code 2255; lockbox under porch steps: 8140. WiFi: EucaCabin / BushSea42.', 'Graham & Jill Foster', 'Live'],
        ];
        $pIds = [];
        foreach ($pRows as $i => $p) {
            $pr = $db->execute(
                'INSERT INTO properties(property_name, address, property_type, bedrooms, bathrooms, access_instructions, owner, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$p[0], $p[1], $p[2], $p[3], $p[4], $p[5], $p[6], $p[7], $ts - (4 - $i) * 3600]
            );
            $pIds[] = $pr['lastInsertRowid'];
        }

        $clRows = [
            ['Mila Novak', '0418 550 201', 'mila.novak@example.com', ['North side', 'East side'], ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], 'Active'],
            ['Carlos Mendez', '0427 893 412', 'carlos.m@example.com', ['East side', 'Inner city'], ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], 'Active'],
            ['Ruby Chen', '0433 118 765', 'ruby.chen@example.com', ['North side', 'Inner city', 'West side'], ['Monday', 'Wednesday', 'Friday', 'Saturday', 'Sunday'], 'Active'],
        ];
        $clIds = [];
        foreach ($clRows as $j => $cl) {
            $clr = $db->execute(
                'INSERT INTO cleaners(name, phone, email, service_areas_json, availability_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $cl[0],
                    $cl[1],
                    $cl[2],
                    json_encode($cl[3], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($cl[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $cl[5],
                    $ts - (3 - $j) * 3600,
                ]
            );
            $clIds[] = $clr['lastInsertRowid'];
        }

        // Create TWO urgent same-day checkout/check-in pairs on $todayDay
        $dMinus3 = self::addIsoDays($todayDay, -3);
        $dMinus2 = self::addIsoDays($todayDay, -2);
        $dPlus1 = self::addIsoDays($todayDay, 1);
        $dPlus3 = self::addIsoDays($todayDay, 3);
        $dPlus4 = self::addIsoDays($todayDay, 4);

        $bRows = [
            [$pIds[0], 'Hannah & Luke Meyer', $dMinus3, $todayDay, 4, 'Airbnb', 'Checked out', '10am checkout confirmed via Airbnb app.'],
            [$pIds[0], 'Sora Takahashi', $todayDay, $dPlus3, 2, 'Booking.com', 'Confirmed', 'Early 2:30pm check-in requested — VIP honeymoon welcome bottle.'],
            [$pIds[1], 'Marcus & Chloe Bennett', $dMinus2, $todayDay, 6, 'VRBO', 'Checked in', 'Family with kids — expect extra towel laundry.'],
            [$pIds[1], 'Elena Rostova', $todayDay, $dPlus4, 4, 'Direct', 'Confirmed', '3pm check-in. Needs portacot set up in bedroom 3.'],
            [$pIds[2], 'Tariq Haddad', $dMinus2, $todayDay, 1, 'Airbnb', 'Checked out', 'Left keys in lockbox at 9:15am.'],
            [$pIds[3], 'Freya Lindqvist', $dPlus1, $dPlus4, 2, 'Airbnb', 'Confirmed', 'Arriving tomorrow afternoon.'],
        ];
        $bIds = [];
        foreach ($bRows as $k => $b) {
            $br = $db->execute(
                'INSERT INTO bookings(property_id, guest_name, check_in, check_out, guest_count, platform, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$b[0], $b[1], $b[2], $b[3], $b[4], $b[5], $b[6], $b[7], $ts - (6 - $k) * 1800]
            );
            $bIds[] = $br['lastInsertRowid'];
        }

        $tRows = [
            [$pIds[0], $bIds[0], $clIds[0], $todayDay, '10:15', 'Linen Changed', 'Yes', 'Same-day tight window! Set welcome prosecco & espresso pods.'],
            [$pIds[1], $bIds[2], $clIds[1], $todayDay, '10:30', 'Cleaning', 'Yes', 'Same-day 6-guest checkout -> 4-guest arrival + portacot.'],
            [$pIds[2], $bIds[4], $clIds[2], $todayDay, '11:00', 'Guest-Ready', 'Yes', 'Studio reset complete, photo-verified.'],
            [$pIds[3], $bIds[5], $clIds[0], $dPlus1, '09:30', 'Scheduled', 'No', 'Pre-arrival fresh air, patio sweep & welcome basket check.'],
        ];
        $tIds = [];
        foreach ($tRows as $m => $tv) {
            $tr = $db->execute(
                'INSERT INTO turnovers(property_id, booking_id, cleaner_id, turnover_date, start_time, status, linen_required, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$tv[0], $tv[1], $tv[2], $tv[3], $tv[4], $tv[5], $tv[6], $tv[7], $ts - (4 - $m) * 1200, $ts - 300]
            );
            $tIds[] = $tr['lastInsertRowid'];
        }

        $db->execute(
            'INSERT INTO inspections(property_id, turnover_id, inspection_date, condition_rating, missing_items, damage_notes, follow_up_required, inspector_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$pIds[1], $tIds[1], $todayDay, 3, '2 pool towels missing from laundry basket', 'Small wine stain on dining rug corner — spot-treated, needs steam extraction.', 'Yes', 'Carlos Mendez', $ts - 1500]
        );
        $db->execute(
            'INSERT INTO inspections(property_id, turnover_id, inspection_date, condition_rating, missing_items, damage_notes, follow_up_required, inspector_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$pIds[2], $tIds[2], $todayDay, 5, '', '', 'No', 'Ruby Chen', $ts - 900]
        );

        $supRows = [
            [$pIds[0], 'Queen Linen Sets', 2, 3, 'Sets', 'Low'],
            [$pIds[0], 'Guest Toiletries Kit', 8, 5, 'Packs', 'OK'],
            [$pIds[0], 'Welcome Coffee & Biscuits Kit', 1, 4, 'Packs', 'Low'],
            [$pIds[1], 'King Linen Sets', 0, 3, 'Sets', 'Out'],
            [$pIds[1], 'Bath & Pool Towel Packs', 5, 4, 'Packs', 'OK'],
            [$pIds[1], 'Dishwasher & Laundry Pods', 2, 4, 'Packs', 'Low'],
            [$pIds[2], 'Queen Linen Sets', 4, 2, 'Sets', 'OK'],
            [$pIds[2], 'Artisan Hand Wash & Shampoo', 3, 2, 'Bottles', 'OK'],
            [$pIds[3], 'Firewood & Welcome Kits', 5, 3, 'Units', 'OK'],
        ];
        foreach ($supRows as $sp) {
            $db->execute(
                'INSERT INTO property_supplies(property_id, supply_item, current_stock, reorder_point, unit, status, is_sample, updated_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$sp[0], $sp[1], $sp[2], $sp[3], $sp[4], $sp[5], $ts - 1800]
            );
        }

        return self::sampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = self::normalizeSettings(Context::getBusinessSettings($db));
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
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
                'counts' => self::readCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Short-Stay & Airbnb Turnovers';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'coastal']);
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
                self::seedStayReadySample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::readCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
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
                HttpException::fail(409, 'setup_required', 'This StayReady workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'cleaner']);
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
            $role = V::oneOf($input['role'] ?? null, self::JOIN_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedStayReadySample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::readCounts($db, $todayDay),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_SAMPLE_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return [
                'sampleCount' => 0,
                'counts' => self::readCounts($db, $todayDay),
            ];
        }, write: true);
    }
}
