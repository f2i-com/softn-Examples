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
    private const WORKSHOP_ROLES = ['owner', 'manager', 'service_advisor', 'mechanic'];
    private const JOIN_ROLES = ['manager', 'service_advisor', 'mechanic'];
    private const PRESETS = ['safety-orange', 'workshop-red', 'hydraulic-blue', 'gunmetal-steel'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['customers', 'vehicles', 'job_cards', 'parts_used', 'invoices'];
    private const CLEAR_TABLES = ['invoices', 'parts_used', 'job_cards', 'vehicles', 'customers'];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'workshop_rate_cents', 'card_seq', 'invoice_seq', 'updated_at'] as $intCol) {
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

    /** @return array<string, int|string> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $inShop = $db->first("SELECT COUNT(*) AS c FROM job_cards WHERE status != 'Collected'");
        $onHoist = $db->first("SELECT COUNT(*) AS c FROM job_cards WHERE status = 'On Hoist'");
        $waitingParts = $db->first("SELECT COUNT(*) AS c FROM job_cards WHERE status = 'Waiting Parts'");
        $readyPickup = $db->first("SELECT COUNT(*) AS c FROM job_cards WHERE status = 'Ready for Pickup'");
        $unpaid = $db->first("SELECT COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS s FROM invoices WHERE status IN ('Draft', 'Sent', 'Overdue')");
        $vehicles = $db->first('SELECT COUNT(*) AS c FROM vehicles');
        return [
            'inShop' => $inShop ? (int) $inShop['c'] : 0,
            'onHoist' => $onHoist ? (int) $onHoist['c'] : 0,
            'waitingParts' => $waitingParts ? (int) $waitingParts['c'] : 0,
            'readyPickup' => $readyPickup ? (int) $readyPickup['c'] : 0,
            'unpaidInvoices' => $unpaid ? (int) $unpaid['c'] : 0,
            'unpaidCents' => $unpaid ? (int) $unpaid['s'] : 0,
            'vehicleCount' => $vehicles ? (int) $vehicles['c'] : 0,
            'todayDay' => $todayDay,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedWorkshopSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $yesterday = V::utcDay(-1);

        $c1 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Daniel Morales', '0408 312 904', 'dan.morales@example.com', '19 Oakridge Rd, Penrith NSW 2750', 'Private / Retail', 'Prefers SMS before extra work over $400.', $ts - 90000]
        )['lastInsertRowid'];
        $c2 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['WestLink Courier Fleet', '02 9671 5500', 'fleet@westlink.example.com', '44 Industrial Dr, Seven Hills NSW 2147', 'Fleet', '14-day fleet account; PO required on invoice.', $ts - 85000]
        )['lastInsertRowid'];
        $c3 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Priya Krishnan', '0433 604 118', 'priya.k@example.com', '8B Acacia Ave, Parramatta NSW 2150', 'Private / Retail', 'Needs loaner or pickup before 5:00pm.', $ts - 80000]
        )['lastInsertRowid'];
        $c4 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Ridgeway Landscapes', '0417 902 331', 'admin@ridgeway.example.com', '302 Windsor Rd, Baulkham Hills NSW 2153', 'Business', 'Heavy trailer towing — inspect brakes every 10,000km.', $ts - 75000]
        )['lastInsertRowid'];

        $v1 = $db->execute(
            'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$c1, 'Toyota', 'HiLux SR5', 2021, 'EJK-42R', 84620, 'Diesel', 'MR0HA3CD400984122', $ts - 88000, $ts - 3600]
        )['lastInsertRowid'];
        $v2 = $db->execute(
            'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$c2, 'Ford', 'Transit Custom', 2020, 'FLT-88V', 142310, 'Diesel', 'WF0YXXTTGYLA51209', $ts - 84000, $ts - 7200]
        )['lastInsertRowid'];
        $v3 = $db->execute(
            'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$c3, 'Mazda', 'CX-5 Touring', 2022, 'CXM-219', 41200, 'Petrol', 'JM0KF4WLA00634190', $ts - 79000, $ts - 1800]
        )['lastInsertRowid'];
        $v4 = $db->execute(
            'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$c4, 'Isuzu', 'D-MAX X-Terrain', 2023, 'RDG-701', 61850, 'Diesel', 'MPATFS40JPT018432', $ts - 74000, $ts - 5400]
        )['lastInsertRowid'];
        $v5 = $db->execute(
            'INSERT INTO vehicles(customer_id, make, model, year, registration, odometer, fuel, vin, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$c3, 'Toyota', 'Corolla Hybrid', 2023, 'HYB-505', 29800, 'Hybrid', 'JTDKBRFU903192844', $ts - 70000, $ts - 70000]
        )['lastInsertRowid'];

        $jc1 = $db->execute(
            'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JC-2001', $v2, $c2, 'Hoist 1', 'Heavy shudder under braking & ABS warning light on dash. Urgent courier van.', 'Front rotors warped below minimum thickness; front right wheel speed sensor open circuit.', 'On Hoist', 'Shane Kelly', 3.0, 142310, 'Urgent', $todayDay, $ts - 14000, $ts - 1200]
        )['lastInsertRowid'];
        $jc2 = $db->execute(
            'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JC-2002', $v4, $c4, 'Bay 2', 'Loss of boost under towing load; check engine light P0299.', 'Split intercooler hot-side silicone hose; replacement OEM hose on express courier.', 'Waiting Parts', 'Alex Nguyen', 1.5, 61850, 'High', $todayDay, $ts - 36000, $ts - 4000]
        )['lastInsertRowid'];
        $jc3 = $db->execute(
            'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JC-2003', $v1, $c1, 'Diag Bay', 'Intermittent cold-start rattle and 90,000km logbook inspection.', 'Scanning injector feedback values & checking timing chain tensioner.', 'Diagnosing', 'Riley Brooks', 1.0, 84620, 'Normal', $todayDay, $ts - 7200, $ts - 2400]
        )['lastInsertRowid'];
        $db->execute(
            'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JC-2004', $v5, $c3, '', '30,000km scheduled logbook service, wiper blades & tyre rotation.', '', 'Booked In', 'Unassigned', 0, 29800, 'Normal', $todayDay, $ts - 3600, $ts - 3600]
        );
        $jc5 = $db->execute(
            'INSERT INTO job_cards(card_number, vehicle_id, customer_id, bay_number, complaint, diagnosis, status, technician, labour_hours, odometer_in, priority, date_in, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JC-2005', $v3, $c3, 'Hoist 2', '40,000km major service, brake fluid flush and cabin filter.', 'Completed service, flushed DOT4 brake fluid, road tested OK.', 'Ready for Pickup', 'Shane Kelly', 2.0, 41200, 'Normal', $yesterday, $ts - 90000, $ts - 18000]
        )['lastInsertRowid'];

        // Parts Used
        $parts = [
            [$jc1, 'DBA Street Series Front Rotors (Pair)', 'DBA-2488S', 1, 24500, 'Burson Auto Parts', $ts - 10000],
            [$jc1, 'Bendix Heavy Duty Front Brake Pads', 'DB2314-HD', 1, 11800, 'Burson Auto Parts', $ts - 9900],
            [$jc1, 'OEM Front Right ABS Wheel Speed Sensor', 'BK21-2B372-AC', 1, 9600, 'Ford Trade Parts', $ts - 9800],
            [$jc2, 'Intercooler Hot-Side Hose & Clamps', '8-98392140-0', 1, 16500, 'Isuzu Trade', $ts - 30000],
            [$jc5, 'Penrite Enviro+ 0W-20 Full Synthetic (5L)', 'EPLUS0W20005', 1, 7800, 'Repco Trade', $ts - 82000],
            [$jc5, 'Ryco Oil & Cabin Filter Kit', 'R2675P-RCA220', 1, 5400, 'Repco Trade', $ts - 81900],
            [$jc5, 'DOT4 Brake Fluid (1L)', 'PEN-DOT4-1L', 1, 2200, 'Repco Trade', $ts - 81800],
        ];
        foreach ($parts as $p) {
            $db->execute(
                'INSERT INTO parts_used(job_card_id, part_name, part_number, quantity, unit_cost_cents, supplier, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                $p
            );
        }

        // Sample Invoice for JC-2005 (2.0h * $135 = $270 labour + $154 parts = $424 + $42.40 tax = $466.40)
        $db->execute(
            'INSERT INTO invoices(invoice_number, job_card_id, customer_id, vehicle_id, issue_date, labour_hours, labour_rate_cents, labour_cents, parts_cents, subtotal_cents, tax_rate, tax_cents, total_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['WINV-1001', $jc5, $c3, $v3, $yesterday, 2.0, 13500, 27000, 15400, 42400, 10, 4240, 46640, 'Sent', '40,000km service & brake fluid flush completed. Next service due at 50,000km.', $ts - 18000, $ts - 18000]
        );

        $db->execute('UPDATE business_settings SET card_seq = MAX(card_seq, 2005), invoice_seq = MAX(invoice_seq, 1001) WHERE id = 1');
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
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Workshop name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Auto Mechanical & Bay Ops';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'safety-orange']);
            $rateCents = V::moneyCents($input['workshop_rate'] ?? null, 'workshop_rate', [
                'required' => false,
                'min' => 0,
                'max' => 500000,
                'fallback' => 13500,
                'label' => 'Workshop hourly rate',
            ]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, workshop_rate_cents = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $rateCents, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, workshop_rate_cents, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $rateCents, $ts]
                );
            }

            $member = Context::getTeamMember($db, (string) $me['userId']);
            if (!$member) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, 'owner', 1, 'active', ?)",
                    [$me['userId'], $ownerName, $ts]
                );
            } else {
                $db->execute("UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?", [$ownerName, $me['userId']]);
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedWorkshopSample($db, $todayDay);
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
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));
            $businessName = array_key_exists('business_name', $input)
                ? V::text($input['business_name'], 'business_name', ['max' => 120, 'label' => 'Workshop name'])
                : (string) $cur['business_name'];
            $tagline = array_key_exists('tagline', $input)
                ? V::text($input['tagline'], 'tagline', ['required' => false, 'max' => 140])
                : (string) $cur['tagline'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40])
                : (string) $cur['phone'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false])
                : (string) $cur['email'];
            $address = array_key_exists('address', $input)
                ? V::text($input['address'], 'address', ['required' => false, 'max' => 240])
                : (string) $cur['address'];
            $taxId = array_key_exists('tax_id', $input)
                ? V::text($input['tax_id'], 'tax_id', ['required' => false, 'max' => 60])
                : (string) $cur['tax_id'];
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);
            $rateCents = array_key_exists('workshop_rate', $input)
                ? V::moneyCents($input['workshop_rate'], 'workshop_rate', ['min' => 0, 'max' => 500000, 'label' => 'Workshop hourly rate'])
                : (int) $cur['workshop_rate_cents'];

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, workshop_rate_cents = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, $rateCents, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This workshop is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'mechanic']);
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
                HttpException::fail(403, 'cannot_remove_owner', 'The workshop owner cannot be removed.');
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
            $loaded = self::seedWorkshopSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
