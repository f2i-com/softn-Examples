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
    private const TEAM_ROLES = ['manager', 'driver', 'workshop'];
    private const PRESETS = ['highway-blue', 'signal-amber', 'fleet-charcoal', 'emerald-eco'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['vehicles', 'drivers', 'trips', 'maintenance_jobs', 'incidents'];

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $r = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $r ? (int) $r['c'] : 0;
        }
        return $total;
    }

    public static function dayNum(?string $isoDay): ?int
    {
        if ($isoDay === null || $isoDay === '') {
            return null;
        }
        $parts = explode('-', $isoDay);
        if (count($parts) !== 3) {
            return null;
        }
        if (!is_numeric($parts[0]) || !is_numeric($parts[1]) || !is_numeric($parts[2])) {
            return null;
        }
        $y = (int) $parts[0];
        $m = (int) $parts[1];
        $d = (int) $parts[2];
        if ($m <= 2) {
            $y--;
        }
        $era = (int) floor(($y >= 0 ? $y : $y - 399) / 400);
        $yoe = $y - $era * 400;
        $doy = (int) floor((153 * ($m + ($m > 2 ? -3 : 9)) + 2) / 5) + $d - 1;
        $doe = $yoe * 365 + (int) floor($yoe / 4) - (int) floor($yoe / 100) + $doy;
        return $era * 146097 + $doe - 719468;
    }

    public static function daysBetween(?string $fromIso, ?string $toIso): ?int
    {
        $a = self::dayNum($fromIso);
        $b = self::dayNum($toIso);
        if ($a === null || $b === null) {
            return null;
        }
        return $b - $a;
    }

    public static function shiftDay(?string $isoDay, int $deltaDays): string
    {
        $base = self::dayNum($isoDay !== null && $isoDay !== '' ? $isoDay : V::utcDay(0));
        if ($base === null) {
            $base = self::dayNum(V::utcDay(0)) ?? 0;
        }
        $z = $base + $deltaDays + 719468;
        $era = (int) floor(($z >= 0 ? $z : $z - 146096) / 146097);
        $doe = $z - $era * 146097;
        $yoe = (int) floor(($doe - (int) floor($doe / 1460) + (int) floor($doe / 36524) - (int) floor($doe / 146096)) / 365);
        $y = $yoe + $era * 400;
        $doy = $doe - (365 * $yoe + (int) floor($yoe / 4) - (int) floor($yoe / 100));
        $mp = (int) floor((5 * $doy + 2) / 153);
        $d = $doy - (int) floor((153 * $mp + 2) / 5) + 1;
        $m = $mp + ($mp < 10 ? 3 : -9);
        if ($m <= 2) {
            $y++;
        }
        $ms = $m < 10 ? '0' . $m : (string) $m;
        $ds = $d < 10 ? '0' . $d : (string) $d;
        return $y . '-' . $ms . '-' . $ds;
    }

    /** @return list<array<string, mixed>> */
    public static function scanComplianceAlerts(Database $db, string $todayDay): array
    {
        $alerts = [];
        $vehicles = $db->query('SELECT * FROM vehicles ORDER BY vehicle_name ASC');
        foreach ($vehicles as $v) {
            $vid = (int) $v['id'];
            $vName = (string) $v['vehicle_name'];
            $badge = ((string) ($v['registration'] ?? '')) !== '' ? (string) $v['registration'] : 'No plate';

            $regoExp = (string) ($v['rego_expiry'] ?? '');
            if ($regoExp !== '') {
                $rGap = self::daysBetween($todayDay, $regoExp);
                if ($rGap !== null && $rGap <= 30) {
                    $alerts[] = [
                        'key' => 'rego-' . $vid,
                        'kind' => 'rego',
                        'entity_type' => 'Vehicle',
                        'entity_id' => $vid,
                        'title' => $vName . ' — Registration',
                        'badge' => $badge,
                        'expiry_date' => $regoExp,
                        'days_left' => $rGap,
                        'severity' => $rGap < 0 ? 'expired' : 'soon',
                    ];
                }
            }

            $insExp = (string) ($v['insurance_expiry'] ?? '');
            if ($insExp !== '') {
                $iGap = self::daysBetween($todayDay, $insExp);
                if ($iGap !== null && $iGap <= 30) {
                    $alerts[] = [
                        'key' => 'ins-' . $vid,
                        'kind' => 'insurance',
                        'entity_type' => 'Vehicle',
                        'entity_id' => $vid,
                        'title' => $vName . ' — Insurance',
                        'badge' => $badge,
                        'expiry_date' => $insExp,
                        'days_left' => $iGap,
                        'severity' => $iGap < 0 ? 'expired' : 'soon',
                    ];
                }
            }
        }

        $drivers = $db->query("SELECT * FROM drivers WHERE active = 'Active' ORDER BY driver_name ASC");
        foreach ($drivers as $d) {
            $did = (int) $d['id'];
            $licExp = (string) ($d['licence_expiry'] ?? '');
            if ($licExp !== '') {
                $lGap = self::daysBetween($todayDay, $licExp);
                if ($lGap !== null && $lGap <= 30) {
                    $alerts[] = [
                        'key' => 'lic-' . $did,
                        'kind' => 'licence',
                        'entity_type' => 'Driver',
                        'entity_id' => $did,
                        'title' => (string) $d['driver_name'] . ' — Driver Licence',
                        'badge' => (string) $d['licence_class'],
                        'expiry_date' => $licExp,
                        'days_left' => $lGap,
                        'severity' => $lGap < 0 ? 'expired' : 'soon',
                    ];
                }
            }
        }

        usort($alerts, static fn (array $a, array $b): int => $a['days_left'] <=> $b['days_left']);
        return $alerts;
    }

    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $alerts = self::scanComplianceAlerts($db, $todayDay);
        $expiredCount = 0;
        foreach ($alerts as $a) {
            if ($a['severity'] === 'expired') {
                $expiredCount++;
            }
        }

        $vehs = $db->first(
            "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END), 0) AS avail, COALESCE(SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END), 0) AS workshop FROM vehicles"
        );
        $maint = $db->first("SELECT COUNT(*) AS c FROM maintenance_jobs WHERE status != 'Completed'");
        $inc = $db->first("SELECT COUNT(*) AS c FROM incidents WHERE status != 'Resolved'");
        $tripAgg = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(distance_km), 0) AS km, COALESCE(SUM(CASE WHEN usage_class = 'Business' THEN distance_km ELSE 0 END), 0) AS biz_km, COALESCE(SUM(fuel_cost_cents), 0) AS fuel FROM trips"
        );

        $totalKm = $tripAgg ? (int) $tripAgg['km'] : 0;
        $bizKm = $tripAgg ? (int) $tripAgg['biz_km'] : 0;
        $fuelCents = $tripAgg ? (int) $tripAgg['fuel'] : 0;

        return [
            'complianceAlerts' => count($alerts),
            'expiredCount' => $expiredCount,
            'totalVehicles' => $vehs ? (int) $vehs['total'] : 0,
            'availableVehicles' => $vehs ? (int) $vehs['avail'] : 0,
            'workshopVehicles' => $vehs ? (int) $vehs['workshop'] : 0,
            'openMaintenance' => $maint ? (int) $maint['c'] : 0,
            'openIncidents' => $inc ? (int) $inc['c'] : 0,
            'totalTrips' => $tripAgg ? (int) $tripAgg['c'] : 0,
            'totalKm' => $totalKm,
            'businessKm' => $bizKm,
            'businessPct' => $totalKm > 0 ? round(($bizKm / $totalKm) * 1000.0) / 10.0 : 100,
            'totalFuelCents' => $fuelCents,
            'fuelCentsPerKm' => $totalKm > 0 ? round(($fuelCents / $totalKm) * 10.0) / 10.0 : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedFleetSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        // 1. Vehicles — intentionally includes 1 expired rego, 1 insurance expiring in 12d, 1 rego expiring in 24d!
        $vehRows = [
            ['Van 1 — Metro Express', '1AB 2CD', 'Toyota HiAce LWB', 2022, 84520, 'Available', self::shiftDay($todayDay, 24), self::shiftDay($todayDay, 145), 'Tail-lift fitted, metro courier workhorse'],
            ['Van 2 — Cold Chain', '4XY 8KM', 'Ford Transit Custom', 2021, 112340, 'In use', self::shiftDay($todayDay, -5), self::shiftDay($todayDay, 12), 'Refrigerated cargo bay — rego renewal urgent!'],
            ['Ute 3 — Field Crew', '7TR 3PQ', 'Isuzu D-Max Crew Cab', 2023, 41890, 'Available', self::shiftDay($todayDay, 210), self::shiftDay($todayDay, 195), 'Tow pack + ladder racks'],
            ['Truck 4 — Bulk Freight', '9HR 5LN', 'Hino 300 Series 616', 2020, 168400, 'Maintenance', self::shiftDay($todayDay, 95), self::shiftDay($todayDay, 62), 'Light rigid box truck; currently in workshop for brakes'],
            ['Pool Car 5 — Sales', '2EV 9AZ', 'Hyundai Kona Electric', 2024, 15280, 'Available', self::shiftDay($todayDay, 310), self::shiftDay($todayDay, 290), 'Client site visits & metro errands'],
        ];
        $vehIds = [];
        foreach ($vehRows as $v => $vr) {
            $resV = $db->execute(
                'INSERT INTO vehicles(vehicle_name, registration, make_model, year, odometer_km, status, rego_expiry, insurance_expiry, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$vr[0], $vr[1], $vr[2], $vr[3], $vr[4], $vr[5], $vr[6], $vr[7], $vr[8], $ts - (5 - $v) * 3600, $ts - 1800]
            );
            $vehIds[] = $resV['lastInsertRowid'];
        }

        // 2. Drivers — intentionally includes 1 active driver licence expiring in 9 days!
        $drvRows = [
            ["Liam O'Connor", '0412 880 144', 'liam@fleet.example', 'Light rigid', self::shiftDay($todayDay, 9), 'Active', 'Lead freight driver — licence renewal booked'],
            ['Ananya Krishnan', '0422 519 730', 'ananya@fleet.example', 'Car', self::shiftDay($todayDay, 420), 'Active', 'Metro delivery & client transport'],
            ['Tarek Mansour', '0409 341 688', 'tarek@fleet.example', 'Medium rigid', self::shiftDay($todayDay, 185), 'Active', 'Heavy & pallet runs'],
            ['Gemma Holloway', '0431 992 015', 'gemma@fleet.example', 'Car', self::shiftDay($todayDay, 610), 'Active', 'Site visits & regional sales'],
        ];
        $drvIds = [];
        foreach ($drvRows as $d => $dr) {
            $resD = $db->execute(
                'INSERT INTO drivers(driver_name, phone, email, licence_class, licence_expiry, active, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$dr[0], $dr[1], $dr[2], $dr[3], $dr[4], $dr[5], $dr[6], $ts - (4 - $d) * 1800]
            );
            $drvIds[] = $resD['lastInsertRowid'];
        }

        // 3. Trips & Fuel Logbook
        $tripRows = [
            [0, 1, self::shiftDay($todayDay, -3), 84110, 84295, 'Delivery', 'Business', 'Alexandria Industrial Park & Botany', 4850, '14 parcel drops completed ahead of cutoff'],
            [0, 1, self::shiftDay($todayDay, -1), 84295, 84520, 'Delivery', 'Business', 'Parramatta & Seven Hills Loop', 5420, 'Refuelled 31L diesel at BP Silverwater'],
            [1, 0, self::shiftDay($todayDay, -2), 112120, 112340, 'Delivery', 'Business', 'North Sydney Cold Storage Route', 5900, 'Chiller held 3C throughout route'],
            [2, 3, self::shiftDay($todayDay, -1), 41740, 41890, 'Site visit', 'Business', 'Wollongong Depot Inspection', 3980, 'Delivered replacement conduit fittings'],
            [4, 3, $todayDay, 15210, 15280, 'Client transport', 'Business', 'CBD Client Briefing & Airport', 0, 'Charged overnight on depot wallbox'],
            [2, 2, self::shiftDay($todayDay, -4), 41690, 41740, 'Other', 'Personal', 'After-hours personal errand (FBT logged)', 0, 'Approved personal use — logged for FBT'],
        ];
        foreach ($tripRows as $t => $tr) {
            $vInfo = $vehRows[$tr[0]];
            $dInfo = $drvRows[$tr[1]];
            $dist = $tr[4] - $tr[3];
            $db->execute(
                'INSERT INTO trips(vehicle_id, vehicle_name, registration, driver_id, driver_name, trip_date, start_odometer, end_odometer, distance_km, purpose, usage_class, destination, fuel_cost_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$vehIds[$tr[0]], $vInfo[0], $vInfo[1], $drvIds[$tr[1]], $dInfo[0], $tr[2], $tr[3], $tr[4], $dist, $tr[5], $tr[6], $tr[7], $tr[8], $tr[9], $ts - (6 - $t) * 7200]
            );
        }

        // 4. Maintenance Schedule
        $maintRows = [
            [3, 'Brakes', self::shiftDay($todayDay, 0), '', 148000, 'In Workshop', 'City Commercial Auto', 'Front & rear brake pads + rotors replacement'],
            [1, 'Registration check', self::shiftDay($todayDay, 1), '', 12500, 'Scheduled', 'QuickCheck Pink Slips', 'Annual roadworthy safety inspection for rego renewal'],
            [0, 'Service', self::shiftDay($todayDay, 10), '', 64000, 'Scheduled', 'Toyota Fleet Service', '85,000 km logbook service + oil & filters'],
            [2, 'Tyres', self::shiftDay($todayDay, -9), self::shiftDay($todayDay, -8), 96000, 'Completed', 'QuickFit Tyres', '4x All-Terrain tyres fitted and balanced'],
        ];
        foreach ($maintRows as $m => $mr) {
            $mv = $vehRows[$mr[0]];
            $db->execute(
                'INSERT INTO maintenance_jobs(vehicle_id, vehicle_name, registration, maintenance_type, due_date, completed_date, cost_cents, status, supplier, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$vehIds[$mr[0]], $mv[0], $mv[1], $mr[1], $mr[2], $mr[3], $mr[4], $mr[5], $mr[6], $mr[7], $ts - (4 - $m) * 14400, $ts - 1800]
            );
        }

        // 5. Incident Reports
        $incRows = [
            [1, 0, self::shiftDay($todayDay, -2), 'Damage', 'Medium', 'Minor scrape on rear left bumper reversing into tight loading dock bay 4.', 'Under review', 'Quote requested from Metro Panel Works ($680).'],
            [3, 2, self::shiftDay($todayDay, -5), 'Breakdown', 'High', 'Brake warning light illuminated on M4 exit ramp; towed safely to City Commercial Auto.', 'Reported', 'Vehicle placed in workshop for full brake overhaul.'],
            [0, 1, self::shiftDay($todayDay, -11), 'Near miss', 'Low', 'Forklift reversed across pedestrian lane at customer warehouse without horn.', 'Resolved', 'Logged hazard with customer site safety officer.'],
        ];
        foreach ($incRows as $ic => $ir) {
            $iv = $vehRows[$ir[0]];
            $idrv = $drvRows[$ir[1]];
            $db->execute(
                'INSERT INTO incidents(vehicle_id, vehicle_name, registration, driver_id, driver_name, incident_date, incident_type, severity, description, status, resolution_notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$vehIds[$ir[0]], $iv[0], $iv[1], $drvIds[$ir[1]], $idrv[0], $ir[2], $ir[3], $ir[4], $ir[5], $ir[6], $ir[7], $ts - (3 - $ic) * 28800, $ts - 3600]
            );
        }

        return self::sampleCount($db);
    }

    private static function normalizeSettings(?array $s): ?array
    {
        if ($s === null) {
            return null;
        }
        if (isset($s['id'])) {
            $s['id'] = (int) $s['id'];
        }
        if (isset($s['setup_done'])) {
            $s['setup_done'] = (int) $s['setup_done'];
        }
        if (isset($s['tax_rate'])) {
            $s['tax_rate'] = (float) $s['tax_rate'];
        }
        if (isset($s['updated_at'])) {
            $s['updated_at'] = (int) $s['updated_at'];
        }
        return $s;
    }

    private static function normalizeMember(?array $m): ?array
    {
        if ($m === null) {
            return null;
        }
        if (isset($m['is_owner'])) {
            $m['is_owner'] = (int) $m['is_owner'];
        }
        if (isset($m['created_at'])) {
            $m['created_at'] = (int) $m['created_at'];
        }
        return $m;
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
            $member = self::normalizeMember(Context::getTeamMember($db, $me['userId']));
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
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Fleet / business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Vehicle Fleet & Driver Logbook';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'highway-blue']);
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

            $member = Context::getTeamMember($db, $me['userId']);
            if (!$member) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, 'owner', 1, 'active', ?)",
                    [$me['userId'], $ownerName, $ts]
                );
            } else {
                $db->execute("UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?", [$ownerName, $me['userId']]);
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedFleetSample($db, $todayDay);
            }
            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::readBadgeCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = Context::getBusinessSettings($db);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
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
            $members = $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC');
            foreach ($members as &$m) {
                $m = self::normalizeMember($m);
            }
            unset($m);
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This fleet workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::TEAM_ROLES, 'requested_role', ['fallback' => 'driver']);
            $existing = self::normalizeMember(Context::getTeamMember($db, $me['userId']));
            if ($existing) {
                return ['member' => $existing];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return ['__status' => 201, '__body' => ['member' => self::normalizeMember(Context::getTeamMember($db, $me['userId']))]];
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
            $role = V::oneOf($input['role'] ?? null, self::TEAM_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedFleetSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['incidents', 'maintenance_jobs', 'trips', 'drivers', 'vehicles'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
