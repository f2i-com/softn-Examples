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
    private const JOIN_ROLES = ['manager', 'technician', 'front_counter'];
    private const SHOP_PRESETS = ['circuit-cyan', 'solder-amber', 'lab-indigo', 'matrix-emerald'];
    private const SHOP_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['customers', 'technicians', 'devices', 'repair_jobs', 'parts_orders', 'quality_checks'];
    private const CLEAR_SAMPLE_TABLES = ['quality_checks', 'parts_orders', 'repair_jobs', 'devices', 'customers', 'technicians'];

    public static function bumpIsoDay(?string $isoDay, int $deltaDays = 0): string
    {
        $base = ($isoDay !== null && $isoDay !== '') ? $isoDay : V::utcDay(0);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $base, $m)) {
            return V::utcDay($deltaDays);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $y -= ($mo <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($mo + ($mo > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $deltaDays;
        return gmdate('Y-m-d', $z * 86400);
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'ticket_seq', 'updated_at'] as $intCol) {
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

    public static function benchSampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function benchBadgeCounts(Database $db, string $todayDay): array
    {
        $activeJobs = $db->first("SELECT COUNT(*) AS c FROM repair_jobs WHERE status != 'Collected'");
        $overdueJobs = $db->first(
            "SELECT COUNT(*) AS c FROM repair_jobs WHERE status != 'Collected' AND due_date != '' AND due_date < ?",
            [$todayDay]
        );
        $waitingParts = $db->first("SELECT COUNT(*) AS c FROM parts_orders WHERE status IN ('Ordered', 'Shipped', 'Backordered')");
        $qaPending = $db->first("SELECT COUNT(*) AS c FROM repair_jobs WHERE status = 'QA Check'");
        $readyPickup = $db->first("SELECT COUNT(*) AS c FROM repair_jobs WHERE status = 'Ready for Pickup'");
        $toNotify = $db->first("SELECT COUNT(*) AS c FROM repair_jobs WHERE status = 'Ready for Pickup' AND customer_notified = 0");
        $quotedOpen = $db->first("SELECT COALESCE(SUM(quote_amount_cents), 0) AS s FROM repair_jobs WHERE status != 'Collected'");

        return [
            'activeJobs' => $activeJobs ? (int) $activeJobs['c'] : 0,
            'overdueJobs' => $overdueJobs ? (int) $overdueJobs['c'] : 0,
            'waitingParts' => $waitingParts ? (int) $waitingParts['c'] : 0,
            'qaPending' => $qaPending ? (int) $qaPending['c'] : 0,
            'readyPickup' => $readyPickup ? (int) $readyPickup['c'] : 0,
            'toNotify' => $toNotify ? (int) $toNotify['c'] : 0,
            'quotedOpenCents' => $quotedOpen ? (int) $quotedOpen['s'] : 0,
            'sampleCount' => self::benchSampleCount($db),
        ];
    }

    public static function seedBenchSample(Database $db, string $todayDay): int
    {
        if (self::benchSampleCount($db) > 0) {
            return self::benchSampleCount($db);
        }
        $ts = V::now();

        $techSeeds = [
            ['Darius Cole', ['Phones', 'Micro-soldering', 'Water damage'], 'darius@voltcraft.example', '0414 550 101', 'Active'],
            ['Mei-Ling Zhou', ['Laptops', 'Data recovery', 'Micro-soldering'], 'meiling@voltcraft.example', '0414 550 102', 'Active'],
            ['Samir Haddad', ['Consoles', 'Phones', 'Water damage'], 'samir@voltcraft.example', '0414 550 103', 'Active'],
        ];
        $techIds = [];
        foreach ($techSeeds as $t => $tr) {
            $r = $db->execute(
                'INSERT INTO technicians(name, skills_json, email, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$tr[0], json_encode($tr[1]), $tr[2], $tr[3], $tr[4], $ts - (3 - $t) * 3600]
            );
            $techIds[] = $r['lastInsertRowid'];
        }

        $custSeeds = [
            ['Hannah Sinclair', 'hannah.sinclair@example.com', '0420 118 409', 'Text message', 'Repeat customer — business MacBook & iPhone'],
            ['Tariq Al-Khatib', 'tariq.k@example.com', '0435 771 220', 'Phone call', 'Needs invoice with serial number for insurance'],
            ['Phoebe Walsh', 'phoebe.walsh@example.com', '0411 603 884', 'Text message', 'Walk-in express repair'],
            ["Gavin O'Shea", 'gavin.oshea@example.com', '0404 992 145', 'Email', 'Student discount 10% on parts'],
            ['Kendra Morales', 'kendra.m@example.com', '0451 224 790', 'Text message', 'Gaming console HDMI replacement'],
        ];
        $cIds = [];
        foreach ($custSeeds as $c => $cu) {
            $cr = $db->execute(
                'INSERT INTO customers(name, email, phone, preferred_contact, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$cu[0], $cu[1], $cu[2], $cu[3], $cu[4], $ts - (5 - $c) * 86400]
            );
            $cIds[] = $cr['lastInsertRowid'];
        }

        $devSeeds = [
            [$cIds[0], 'Phone', 'Apple', 'iPhone 15 Pro', 'IMEI 354892104481209', 'Shattered front OLED, frame corner scuff; FaceID sensor intact.'],
            [$cIds[1], 'Laptop', 'Apple', 'MacBook Pro 14 M3', 'C02ZN41QMD6R', 'No power after coffee spill near USB-C ports; clean chassis.'],
            [$cIds[2], 'Phone', 'Samsung', 'Galaxy S24 Ultra', 'IMEI 359021884102938', 'Battery swollen slightly lifting rear glass; display intact.'],
            [$cIds[3], 'Tablet', 'Apple', 'iPad Air (5th Gen)', 'DLX849201Q8K', 'USB-C port loose, charges only at steep angle.'],
            [$cIds[4], 'Console', 'Sony', 'PlayStation 5 Slim', 'S01-E43298104-F', 'No HDMI signal on TV; bent inner HDMI pin visible under scope.'],
        ];
        $dIds = [];
        foreach ($devSeeds as $d => $dv) {
            $dr = $db->execute(
                'INSERT INTO devices(customer_id, device_type, brand, model, serial, condition_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$dv[0], $dv[1], $dv[2], $dv[3], $dv[4], $dv[5], $ts - (5 - $d) * 43200]
            );
            $dIds[] = $dr['lastInsertRowid'];
        }

        $j1 = $db->execute(
            "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES('RB-1001', ?, ?, ?, 'Screen', 'Ready for Pickup', 'Express', 42900, ?, 'OEM OLED swap + TrueTone transfer completed.', 0, 1, ?, ?)",
            [$dIds[0], $cIds[0], $techIds[0], $todayDay, $ts - 18000, $ts - 1800]
        )['lastInsertRowid'];

        $j2 = $db->execute(
            "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES('RB-1002', ?, ?, ?, 'Water damage', 'Awaiting Parts', 'Express', 64000, ?, 'Ultrasonic clean done; CD3217 power IC shorted, awaiting replacement chip.', 0, 1, ?, ?)",
            [$dIds[1], $cIds[1], $techIds[1], self::bumpIsoDay($todayDay, -1), $ts - 90000, $ts - 7200]
        )['lastInsertRowid'];

        $j3 = $db->execute(
            "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES('RB-1003', ?, ?, ?, 'Battery', 'QA Check', 'Standard', 16500, ?, 'New genuine battery fitted & adhesive resealed; ready for final QA.', 0, 1, ?, ?)",
            [$dIds[2], $cIds[2], $techIds[0], $todayDay, $ts - 36000, $ts - 3600]
        )['lastInsertRowid'];

        $j4 = $db->execute(
            "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES('RB-1004', ?, ?, ?, 'Charging', 'Repairing', 'Standard', 19500, ?, 'Micro-soldering USB-C daughterboard replacement.', 0, 1, ?, ?)",
            [$dIds[3], $cIds[3], $techIds[1], self::bumpIsoDay($todayDay, 1), $ts - 28000, $ts - 2400]
        )['lastInsertRowid'];

        $db->execute(
            "INSERT INTO repair_jobs(ticket_code, device_id, customer_id, technician_id, issue_type, status, priority, quote_amount_cents, due_date, notes, customer_notified, is_sample, created_at, updated_at) VALUES('RB-1005', ?, ?, ?, 'Other', 'Diagnosing', 'Standard', 22000, ?, 'Inspecting HDMI port pads and retimer IC continuity.', 0, 1, ?, ?)",
            [$dIds[4], $cIds[4], $techIds[2], self::bumpIsoDay($todayDay, 2), $ts - 12000, $ts - 1200]
        );

        // Parts Orders
        $db->execute(
            "INSERT INTO parts_orders(repair_job_id, part_name, supplier, cost_cents, tracking, eta, status, is_sample, created_at) VALUES(?, 'MacBook Pro M3 CD3217B12 USB-C Controller IC', 'MicroParts AU', 6800, 'AUSP-99284102', ?, 'Shipped', 1, ?)",
            [$j2, $todayDay, $ts - 50000]
        );
        $db->execute(
            "INSERT INTO parts_orders(repair_job_id, part_name, supplier, cost_cents, tracking, eta, status, is_sample, created_at) VALUES(?, 'iPad Air 5 USB-C Charging Flex Assembly', 'MobileParts Wholesale', 4200, 'TNT-4410291', ?, 'Arrived', 1, ?)",
            [$j4, self::bumpIsoDay($todayDay, -1), $ts - 80000]
        );
        $db->execute(
            "INSERT INTO parts_orders(repair_job_id, part_name, supplier, cost_cents, tracking, eta, status, is_sample, created_at) VALUES(?, 'iPhone 15 Pro Service Pack OLED Display', 'PartsDirect Pro', 26500, 'STL-8841203', ?, 'Installed', 1, ?)",
            [$j1, self::bumpIsoDay($todayDay, -2), $ts - 140000]
        );

        // Quality Check for RB-1001 (passed, not yet notified so Pickup Desk shows instant action!)
        $db->execute(
            "INSERT INTO quality_checks(repair_job_id, checked_by_id, checklist_json, result, notes, notified, is_sample, created_at) VALUES(?, ?, ?, 'Pass', 'TrueTone verified, 120Hz ProMotion smooth, FaceID & charging tested at 20W.', 'Not yet', 1, ?)",
            [
                $j1,
                $techIds[0],
                json_encode(['Power', 'Display', 'Touch', 'Charging', 'Audio', 'Cameras', 'Buttons & Ports', 'Wi-Fi & Cellular']),
                $ts - 1800,
            ]
        );

        if ($j3 < 0) {
            return 0;
        }
        $db->execute('UPDATE business_settings SET ticket_seq = 1005 WHERE id = 1 AND ticket_seq < 1005');
        return self::benchSampleCount($db);
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
                'counts' => self::benchBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Shop name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Precision Electronics & Bench Ops';
            $currency = V::oneOf($input['currency'] ?? null, self::SHOP_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::SHOP_PRESETS, 'brand_preset', ['fallback' => 'circuit-cyan']);
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
                self::seedBenchSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::benchBadgeCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Shop name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::SHOP_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::SHOP_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This repair shop is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'technician']);
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
                HttpException::fail(403, 'cannot_remove_owner', 'The owner cannot be removed.');
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
            $loaded = self::seedBenchSample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::benchBadgeCounts($db, $todayDay),
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
                'counts' => self::benchBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }
}
