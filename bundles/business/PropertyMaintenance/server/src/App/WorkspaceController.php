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
    private const JOIN_ROLES = ['manager', 'handyman', 'landlord'];
    private const PRESETS = ['brick-terracotta', 'deep-spruce', 'slate-manor', 'harbour-blue'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['properties', 'tenants', 'maintenance_requests', 'work_orders', 'inspections'];
    private const CLEAR_SAMPLE_TABLES = ['inspections', 'work_orders', 'maintenance_requests', 'tenants', 'properties'];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'req_seq', 'wo_seq', 'updated_at'] as $intCol) {
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

    /** @return array<string, int|float|string> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $openReqs = $db->first("SELECT COUNT(*) AS c FROM maintenance_requests WHERE status != 'Resolved'");
        $urgentReqs = $db->first("SELECT COUNT(*) AS c FROM maintenance_requests WHERE priority = 'Urgent' AND status != 'Resolved'");
        $openWos = $db->first("SELECT COUNT(*) AS c FROM work_orders WHERE status NOT IN ('Completed', 'Invoiced')");
        $totalSpend = $db->first('SELECT COALESCE(SUM(cost_cents), 0) AS s FROM work_orders');
        $props = $db->first('SELECT COUNT(*) AS c FROM properties');
        $avgCond = $db->first('SELECT COALESCE(AVG(condition_rating), 0) AS a, COUNT(*) AS c FROM inspections');

        return [
            'openRequests' => $openReqs ? (int) $openReqs['c'] : 0,
            'urgentRequests' => $urgentReqs ? (int) $urgentReqs['c'] : 0,
            'openWorkOrders' => $openWos ? (int) $openWos['c'] : 0,
            'totalSpendCents' => $totalSpend ? (int) $totalSpend['s'] : 0,
            'propertyCount' => $props ? (int) $props['c'] : 0,
            'avgCondition' => ($avgCond && (int) $avgCond['c'] > 0) ? round(((float) $avgCond['a']) * 10.0) / 10.0 : 0,
            'todayDay' => $todayDay,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedMaintenanceSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $p1 = $db->execute(
            'INSERT INTO properties(address, property_type, owner_manager, manager_phone, access_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            ['14 Cedar Court, Balmain NSW 2041', 'House', 'Margaret Whitfield', '0418 220 914', 'Key safe behind front porch pillar: code 7392. Side alley unlocked.', $ts - 95000]
        )['lastInsertRowid'];
        $p2 = $db->execute(
            'INSERT INTO properties(address, property_type, owner_manager, manager_phone, access_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            ['88 Military Rd, Neutral Bay NSW 2089', 'Apartment', 'Harbourside Realty (Chloe)', '02 9908 4410', 'Fob #14 at agency desk; intercom buzzer 204; visitor parking bay B2.', $ts - 90000]
        )['lastInsertRowid'];
        $p3 = $db->execute(
            'INSERT INTO properties(address, property_type, owner_manager, manager_phone, access_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            ['210 King St, Newtown NSW 2042', 'Commercial', 'Sterling Trust Properties', '02 9519 8820', 'Rear lane roller door code *5540#; main switchboard in storeroom.', $ts - 86000]
        )['lastInsertRowid'];
        $p4 = $db->execute(
            'INSERT INTO properties(address, property_type, owner_manager, manager_phone, access_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            ['5-9 Parkview Terrace, Marrickville NSW 2204', 'Strata / Body Corporate', 'StrataPlus Desk', '02 8294 3100', 'Common-area meter cupboard key on master ring #3; notify building caretaker.', $ts - 82000]
        )['lastInsertRowid'];

        $t1 = $db->execute(
            'INSERT INTO tenants(property_id, name, phone, email, unit, lease_start, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p1, 'Hannah & Tom Gallagher', '0421 670 338', 'hannah.g@example.com', 'Whole House', '2025-04-01', $ts - 88000]
        )['lastInsertRowid'];
        $t2 = $db->execute(
            'INSERT INTO tenants(property_id, name, phone, email, unit, lease_start, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p2, 'Devon Lin', '0434 119 802', 'devon.lin@example.com', 'Unit 204', '2026-01-15', $ts - 84000]
        )['lastInsertRowid'];
        $t3 = $db->execute(
            'INSERT INTO tenants(property_id, name, phone, email, unit, lease_start, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p3, 'Roast & Press Booksellers', '02 9557 1209', 'shop@roastpress.example.com', 'Ground Suite', '2024-09-01', $ts - 80000]
        )['lastInsertRowid'];
        $t4 = $db->execute(
            'INSERT INTO tenants(property_id, name, phone, email, unit, lease_start, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p4, 'Elena Petrova', '0409 845 129', 'elena.p@example.com', 'Apt 6', '2025-07-20', $ts - 76000]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['REQ-3001', $p1, $t1, 'Plumbing', 'Urgent', 'New', 'Hot water unit pilot keeps cutting out and water pooling in laundry tray.', $todayDay, $ts - 5400, $ts - 5400]
        );
        $db->execute(
            'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['REQ-3002', $p2, $t2, 'Appliance', 'High', 'Triaged', 'Dishwasher stopping mid-cycle with E15 drainage fault code.', $todayDay, $ts - 14400, $ts - 7200]
        );
        $r3 = $db->execute(
            'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['REQ-3003', $p3, $t3, 'Electrical', 'High', 'Work Order Assigned', 'Two LED track fittings flickering above front retail counter; safety switch tripped once.', V::utcDay(-1), $ts - 45000, $ts - 22000]
        )['lastInsertRowid'];
        $r4 = $db->execute(
            'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['REQ-3004', $p4, $t4, 'Structural', 'Normal', 'In Progress', 'Balcony sliding glass door rollers binding and lock latch misaligned.', V::utcDay(-2), $ts - 120000, $ts - 18000]
        )['lastInsertRowid'];
        $r5 = $db->execute(
            'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['REQ-3005', $p1, $t1, 'Garden / Grounds', 'Low', 'Resolved', 'Side timber fence paling loose after wind storm; gate latch sticking.', V::utcDay(-5), $ts - 430000, $ts - 250000]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO work_orders(wo_number, request_id, property_id, assigned_to, scheduled_date, hours, cost_cents, status, work_done, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['WO-4001', $r3, $p3, 'Sparks & Co Electrical (Ben)', $todayDay, 0, 0, 'Scheduled', 'Test RCD circuit and replace 2x track drivers.', $ts - 22000, $ts - 22000]
        );
        $db->execute(
            'INSERT INTO work_orders(wo_number, request_id, property_id, assigned_to, scheduled_date, hours, cost_cents, status, work_done, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['WO-4002', $r4, $p4, 'Greg Miller (Handyman)', $todayDay, 1.5, 21500, 'In Progress', 'Removed sliding door panel; fitting stainless carriage rollers and adjusting striker plate.', $ts - 90000, $ts - 18000]
        );
        $db->execute(
            'INSERT INTO work_orders(wo_number, request_id, property_id, assigned_to, scheduled_date, hours, cost_cents, status, work_done, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['WO-4003', $r5, $p1, 'Greg Miller (Handyman)', V::utcDay(-4), 2.0, 26000, 'Completed', 'Replaced 4 treated pine palings, re-screwed rails and fitted heavy-duty D-latch.', $ts - 350000, $ts - 250000]
        );

        $db->execute(
            'INSERT INTO inspections(property_id, inspection_type, inspection_date, condition_rating, inspector, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p1, 'Routine', V::utcDay(-12), 4, 'Sarah Jenkins', 'House well kept. Recommend checking laundry hot water valve and trimming rear hedging before winter.', $ts - 1030000]
        );
        $db->execute(
            'INSERT INTO inspections(property_id, inspection_type, inspection_date, condition_rating, inspector, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p2, 'Entry', V::utcDay(-30), 5, 'Chloe Park', 'Fresh paint throughout, carpets steam cleaned, smoke alarms tested compliant, 2 key sets handed over.', $ts - 2590000]
        );
        $db->execute(
            'INSERT INTO inspections(property_id, inspection_type, inspection_date, condition_rating, inspector, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [$p4, 'Safety / Compliance', V::utcDay(-7), 3, 'Greg Miller', 'Common hallway emergency exit light battery low (scheduled replacement); balcony door tracks need servicing.', $ts - 604000]
        );

        $db->execute('UPDATE business_settings SET req_seq = 3005 WHERE id = 1 AND req_seq < 3005');
        $db->execute('UPDATE business_settings SET wo_seq = 4003 WHERE id = 1 AND wo_seq < 4003');
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Maintenance & Handyman Desk';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'brick-terracotta']);
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
                self::seedMaintenanceSample($db, $todayDay);
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
                ? V::text($input['business_name'], 'business_name', ['max' => 120, 'label' => 'Business name'])
                : (string) $cur['business_name'];
            $tagline = array_key_exists('tagline', $input)
                ? V::text($input['tagline'], 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline'])
                : (string) $cur['tagline'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone'])
                : (string) $cur['phone'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $address = array_key_exists('address', $input)
                ? V::text($input['address'], 'address', ['required' => false, 'max' => 240, 'label' => 'Address'])
                : (string) $cur['address'];
            $taxId = array_key_exists('tax_id', $input)
                ? V::text($input['tax_id'], 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID'])
                : (string) $cur['tax_id'];
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
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
                HttpException::fail(409, 'setup_required', 'This maintenance workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'handyman']);
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
            $loaded = self::seedMaintenanceSample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::readBadgeCounts($db, $todayDay),
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
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }
}
