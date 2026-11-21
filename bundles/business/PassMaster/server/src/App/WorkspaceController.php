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
    private const PM_ROLES = ['manager', 'server', 'kitchen', 'bartender'];
    private const PM_PRESETS = ['burgundy', 'olive', 'navy', 'slate'];
    private const PM_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'brigade_staff',
        'dining_tables',
        'reservations',
        'kitchen_tickets',
        'prep_items',
        'shift_closes',
    ];
    private const CLEAR_SAMPLE_TABLES = [
        'kitchen_tickets',
        'reservations',
        'dining_tables',
        'prep_items',
        'brigade_staff',
        'shift_closes',
    ];

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

    /** @return array<string, int> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $seatedTables = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(current_party_size), 0) AS covers FROM dining_tables WHERE status IN ('Seated', 'Mains Firing', 'Check Dropped')"
        );
        $totalTables = $db->first('SELECT COUNT(*) AS c FROM dining_tables');
        $bookedToday = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(party_size), 0) AS covers FROM reservations WHERE res_date = ? AND status = 'Booked'",
            [$todayDay]
        );
        $openTickets = $db->first("SELECT COUNT(*) AS c FROM kitchen_tickets WHERE status != 'Served'");
        $allergyTickets = $db->first("SELECT COUNT(*) AS c FROM kitchen_tickets WHERE status != 'Served' AND allergy_notes != ''");
        $pendingPrep = $db->first("SELECT COUNT(*) AS c FROM prep_items WHERE status IN ('Not started', 'In progress')");

        return [
            'seatedTables' => $seatedTables ? (int) $seatedTables['c'] : 0,
            'seatedCovers' => $seatedTables ? (int) $seatedTables['covers'] : 0,
            'totalTables' => $totalTables ? (int) $totalTables['c'] : 0,
            'bookedToday' => $bookedToday ? (int) $bookedToday['c'] : 0,
            'expectedCovers' => $bookedToday ? (int) $bookedToday['covers'] : 0,
            'openTickets' => $openTickets ? (int) $openTickets['c'] : 0,
            'allergyTickets' => $allergyTickets ? (int) $allergyTickets['c'] : 0,
            'pendingPrep' => $pendingPrep ? (int) $pendingPrep['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedPassMasterSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $staffIds = [];
        $staffRows = [
            ['Camille Laurent', 'Server', 'Main', '0412 555 019', 'Active'],
            ['Julian Ross', 'Server', 'Patio', '0412 555 042', 'Active'],
            ['Mateo Rossi', 'Chef', 'Hot line', '0412 555 077', 'Active'],
            ['Nadia Kim', 'Chef', 'Cold larder', '0412 555 088', 'Active'],
            ['Theo Grant', 'Bartender', 'Bar', '0412 555 093', 'Active'],
            ['Claire Beaumont', 'Manager', 'Private', '0412 555 011', 'Active'],
        ];
        $staffLen = count($staffRows);
        foreach ($staffRows as $i => $sr) {
            $ins = $db->execute(
                'INSERT INTO brigade_staff(name, role, station, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $ts - ($staffLen - $i) * 60]
            );
            $staffIds[$sr[0]] = $ins['lastInsertRowid'];
        }

        $tableIds = [];
        $tables = [
            ['M1', 'Main', 2, 'Available', $staffIds['Camille Laurent'], 'Camille Laurent', '', 0, 0, 'Window two-top'],
            ['M2', 'Main', 4, 'Mains Firing', $staffIds['Camille Laurent'], 'Camille Laurent', 'Harriet & Guests', 4, $ts - 2400, 'Anniversary table · Pinot Noir opened'],
            ['M3', 'Main', 4, 'Seated', $staffIds['Camille Laurent'], 'Camille Laurent', 'Sato Party', 3, $ts - 900, 'Nut allergy at seat 2'],
            ['M4', 'Main', 6, 'Check Dropped', $staffIds['Camille Laurent'], 'Camille Laurent', 'Dr. Alvarez', 5, $ts - 4800, 'Split bill requested'],
            ['P1', 'Patio', 4, 'Available', $staffIds['Julian Ross'], 'Julian Ross', '', 0, 0, 'Under courtyard olive tree'],
            ['P2', 'Patio', 4, 'Seated', $staffIds['Julian Ross'], 'Julian Ross', 'Owen & Sam', 2, $ts - 1200, 'Sparkling water'],
            ['P3', 'Patio', 2, 'Needs Cleaning', $staffIds['Julian Ross'], 'Julian Ross', '', 0, 0, 'Reset cutlery & candle'],
            ['B1', 'Bar', 2, 'Seated', $staffIds['Theo Grant'], 'Theo Grant', 'Walk-in · Alex', 2, $ts - 600, 'Cocktails + oysters'],
            ['B2', 'Bar', 2, 'Available', $staffIds['Theo Grant'], 'Theo Grant', '', 0, 0, 'High bar seats'],
            ['PR1', 'Private', 10, 'Available', $staffIds['Claire Beaumont'], 'Claire Beaumont', '', 0, 0, 'Cellar dining room — 7:30pm booking'],
        ];
        foreach ($tables as $tb) {
            $tIns = $db->execute(
                'INSERT INTO dining_tables(table_number, section, capacity, status, server_id, server_name, current_guest, current_party_size, current_reservation_id, seated_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?)',
                [$tb[0], $tb[1], $tb[2], $tb[3], $tb[4], $tb[5], $tb[6], $tb[7], $tb[8], $tb[9], $ts]
            );
            $tableIds[$tb[0]] = $tIns['lastInsertRowid'];
        }

        $reservations = [
            ['Evelyn Brooks', '0418 220 911', 'evelyn@example.com', $todayDay, '18:30', 2, 'Window', 'Booked', null, '', 'Birthday dessert plate'],
            ['Marcus Thorne', '0409 811 402', 'marcus@example.com', $todayDay, '19:00', 4, 'Outside', 'Booked', null, '', 'Prefers heated patio table'],
            ['Aurelia Law Group', '0421 300 884', 'events@aurelialaw.example', $todayDay, '19:30', 8, 'Private', 'Booked', null, '', 'Cellar tasting menu · 1 coeliac guest'],
            ['Harriet & Guests', '0433 114 205', 'harriet@example.com', $todayDay, '18:00', 4, 'Booth', 'Seated', $tableIds['M2'], 'M2', 'Anniversary dinner'],
            ['Sato Party', '0411 908 712', '', $todayDay, '18:15', 3, 'No preference', 'Seated', $tableIds['M3'], 'M3', 'Severe peanut allergy'],
        ];
        foreach ($reservations as $r => $rv) {
            $db->execute(
                'INSERT INTO reservations(guest_name, phone, email, res_date, res_time, party_size, table_pref, status, assigned_table_id, assigned_table_number, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$rv[0], $rv[1], $rv[2], $rv[3], $rv[4], $rv[5], $rv[6], $rv[7], $rv[8], $rv[9], $rv[10], $ts - (5 - $r) * 120]
            );
        }

        $tickets = [
            [$tableIds['M2'], 'M2', 'Mains', "2x Duck Confit\n1x Market Snapper\n1x Dry-Aged Ribeye (Med-Rare)", 'Cooking', 'Normal', '', $staffIds['Camille Laurent'], 'Camille Laurent'],
            [$tableIds['M3'], 'M3', 'Entree', "1x Burrata & Heirloom Tomato\n2x Kingfish Crudo", 'Fire', 'Priority', 'SEVERE PEANUT & TREE NUT ALLERGY — clean board & utensils!', $staffIds['Camille Laurent'], 'Camille Laurent'],
            [$tableIds['P2'], 'P2', 'Drinks', "2x Negroni Sbagliato\n1x Bottle Chablis", 'Pass', 'Normal', '', $staffIds['Julian Ross'], 'Julian Ross'],
            [$tableIds['B1'], 'B1', 'Entree', "12x Sydney Rock Oysters\n1x Sourdough & Cultured Butter", 'Pass', 'Normal', 'Coeliac — GF bread on separate plate', $staffIds['Theo Grant'], 'Theo Grant'],
        ];
        foreach ($tickets as $k => $tk) {
            $db->execute(
                'INSERT INTO kitchen_tickets(table_id, table_number, course, items, status, priority, allergy_notes, server_id, server_name, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$tk[0], $tk[1], $tk[2], $tk[3], $tk[4], $tk[5], $tk[6], $tk[7], $tk[8], $ts - (4 - $k) * 240, $ts - 60]
            );
        }

        $preps = [
            ['Portion Market Snapper (180g)', 'Hot', 24, 'portions', '16:30', 'Done', $staffIds['Mateo Rossi'], 'Mateo Rossi'],
            ['Reduce Red Wine Jus', 'Hot', 4, 'litres', '16:45', 'In progress', $staffIds['Mateo Rossi'], 'Mateo Rossi'],
            ['Cure & Slice Kingfish Crudo', 'Cold', 18, 'portions', '16:30', 'Done', $staffIds['Nadia Kim'], 'Nadia Kim'],
            ['Pick Herbs & Dressings Mise', 'Cold', 3, 'trays', '17:00', 'Not started', $staffIds['Nadia Kim'], 'Nadia Kim'],
            ['Set Crème Brûlée Ramekins', 'Pastry', 20, 'portions', '16:00', 'Done', $staffIds['Nadia Kim'], 'Nadia Kim'],
            ['Batch Citrus & Clarified Lime', 'Bar', 2.5, 'litres', '16:30', 'In progress', $staffIds['Theo Grant'], 'Theo Grant'],
        ];
        foreach ($preps as $pr) {
            $db->execute(
                'INSERT INTO prep_items(prep_item, station, quantity_needed, unit, due_by, status, assigned_to_id, assigned_to_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$pr[0], $pr[1], $pr[2], $pr[3], $pr[4], $pr[5], $pr[6], $pr[7], $ts]
            );
        }

        $db->execute(
            'INSERT INTO shift_closes(close_date, covers_served, sales_cents, voids_comps_cents, incidents, cleaning_json, manager_signoff, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                V::utcDay(-1),
                84,
                742000,
                9500,
                "Comp'd 1 dessert on M4 for slow wait during 8pm rush. All tables cleared by 10:45pm.",
                json_encode(
                    ['Pass wiped down', 'Line degreased', 'Fridges temped', 'Floors done', 'Bar restocked', 'Bins out'],
                    JSON_UNESCAPED_UNICODE
                ),
                'Claire Beaumont',
                $ts - 86400,
            ]
        );

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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Restaurant name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Floor Service & Kitchen Pass';
            $currency = V::oneOf($input['currency'] ?? null, self::PM_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PM_PRESETS, 'brand_preset', ['fallback' => 'burgundy']);
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
                self::seedPassMasterSample($db, $todayDay);
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Restaurant name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::PM_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PM_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This restaurant workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::PM_ROLES, 'requested_role', ['fallback' => 'server']);
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
            $role = V::oneOf($input['role'] ?? null, self::PM_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedPassMasterSample($db, $todayDay);
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
