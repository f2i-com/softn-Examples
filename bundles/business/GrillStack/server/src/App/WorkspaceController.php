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
    private const GS_ROLES = ['manager', 'grill_crew', 'front_counter', 'runner'];
    private const GS_PRESETS = ['flame', 'mustard', 'charcoal', 'emerald'];
    private const GS_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        $tables = ['menu_items', 'shop_orders', 'kitchen_tickets', 'prep_stock', 'staff_shifts', 'daily_closes'];
        foreach ($tables as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $openTickets = $db->first("SELECT COUNT(*) AS c FROM kitchen_tickets WHERE status != 'Ready'");
        $rushTickets = $db->first("SELECT COUNT(*) AS c FROM kitchen_tickets WHERE status != 'Ready' AND priority = 'Rush'");
        $activeOrders = $db->first("SELECT COUNT(*) AS c FROM shop_orders WHERE status IN ('New', 'Preparing', 'Ready')");
        $lowStock = $db->first("SELECT COUNT(*) AS c FROM prep_stock WHERE status IN ('Low', 'Out')");
        $todaySales = $db->first(
            "SELECT COALESCE(SUM(total_cents), 0) AS s, COUNT(*) AS c FROM shop_orders WHERE order_day = ? AND status != 'Cancelled'",
            [$todayDay]
        );
        return [
            'openTickets' => $openTickets ? (int) $openTickets['c'] : 0,
            'rushTickets' => $rushTickets ? (int) $rushTickets['c'] : 0,
            'activeOrders' => $activeOrders ? (int) $activeOrders['c'] : 0,
            'lowStock' => $lowStock ? (int) $lowStock['c'] : 0,
            'todaySalesCents' => $todaySales ? (int) $todaySales['s'] : 0,
            'todayOrdersCount' => $todaySales ? (int) $todaySales['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedGrillStackSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $enc = static fn (mixed $v): string => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';

        $menu = [
            ['Double Smash Stack', 'Burger', 1650, 'Grill', ['Beef patty', 'Cheese', 'Pickles', 'Special sauce'], 'Active'],
            ['Smoky Bacon Deluxe', 'Burger', 1850, 'Grill', ['Beef patty', 'Cheese', 'Bacon', 'Lettuce', 'Tomato', 'Special sauce'], 'Active'],
            ['Nashville Hot Chicken', 'Burger', 1700, 'Fryer', ['Chicken', 'Pickles', 'Lettuce', 'Special sauce'], 'Active'],
            ['Greenhouse Plant Smash', 'Burger', 1600, 'Grill', ['Plant patty', 'Cheese', 'Lettuce', 'Tomato', 'Pickles'], 'Active'],
            ['Classic Cheeseburger', 'Burger', 1250, 'Grill', ['Beef patty', 'Cheese', 'Pickles', 'Special sauce'], 'Active'],
            ['Smash Combo (Burger + Fries + Drink)', 'Combo', 2350, 'Grill', ['Beef patty', 'Cheese', 'Pickles', 'Special sauce'], 'Active'],
            ['Loaded Truffle Fries', 'Side', 950, 'Fryer', ['Cheese', 'Special sauce'], 'Active'],
            ['Seasoned Shoestring Fries', 'Side', 650, 'Fryer', [], 'Active'],
            ['Crispy Onion Rings', 'Side', 750, 'Fryer', [], 'Active'],
            ['House Slaw Pot', 'Side', 550, 'Cold station', ['Lettuce'], 'Active'],
            ['Thick Vanilla Malt Shake', 'Drink', 800, 'Drinks', [], 'Active'],
            ['Salted Caramel Shake', 'Drink', 850, 'Drinks', [], 'Active'],
            ['Craft Cola Can', 'Drink', 450, 'Drinks', [], 'Active'],
            ['Choc Fudge Brownie Sundae', 'Dessert', 900, 'Cold station', [], 'Active'],
        ];
        $menuLen = count($menu);
        foreach ($menu as $i => $m) {
            $db->execute(
                'INSERT INTO menu_items(item_name, category, price_cents, prep_station, ingredients_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$m[0], $m[1], $m[2], $m[3], $enc($m[4]), $m[5], $ts - ($menuLen - $i) * 60]
            );
        }

        $o1 = $db->execute(
            'INSERT INTO shop_orders(order_number, order_day, order_type, customer_name, items_json, items_summary, status, priority, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'G-101', $todayDay, 'Takeaway', 'Tessa',
                $enc([
                    ['name' => 'Double Smash Stack', 'qty' => 2, 'price_cents' => 1650, 'category' => 'Burger', 'prep_station' => 'Grill', 'mods' => ['No pickles']],
                    ['name' => 'Loaded Truffle Fries', 'qty' => 1, 'price_cents' => 950, 'category' => 'Side', 'prep_station' => 'Fryer', 'mods' => []],
                    ['name' => 'Salted Caramel Shake', 'qty' => 1, 'price_cents' => 850, 'category' => 'Drink', 'prep_station' => 'Drinks', 'mods' => []],
                ]),
                '2x Double Smash Stack, 1x Loaded Truffle Fries, 1x Salted Caramel Shake',
                'Preparing', 'Rush', 5100, 'Customer on short lunch break — fire fast!', 'Counter', $ts - 360,
            ]
        );

        $o2 = $db->execute(
            'INSERT INTO shop_orders(order_number, order_day, order_type, customer_name, items_json, items_summary, status, priority, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'G-102', $todayDay, 'Dine-in', 'Table 6 · Ben',
                $enc([
                    ['name' => 'Nashville Hot Chicken', 'qty' => 1, 'price_cents' => 1700, 'category' => 'Burger', 'prep_station' => 'Fryer', 'mods' => ['Extra sauce']],
                    ['name' => 'Greenhouse Plant Smash', 'qty' => 1, 'price_cents' => 1600, 'category' => 'Burger', 'prep_station' => 'Grill', 'mods' => ['GF bun']],
                    ['name' => 'Crispy Onion Rings', 'qty' => 1, 'price_cents' => 750, 'category' => 'Side', 'prep_station' => 'Fryer', 'mods' => []],
                ]),
                '1x Nashville Hot Chicken, 1x Greenhouse Plant Smash, 1x Crispy Onion Rings',
                'New', 'Normal', 4050, 'Separate tongs for plant patty', 'Counter', $ts - 180,
            ]
        );

        $o3 = $db->execute(
            'INSERT INTO shop_orders(order_number, order_day, order_type, customer_name, items_json, items_summary, status, priority, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'G-103', $todayDay, 'Delivery', 'UberEats #482',
                $enc([
                    ['name' => 'Smoky Bacon Deluxe', 'qty' => 2, 'price_cents' => 1850, 'category' => 'Burger', 'prep_station' => 'Grill', 'mods' => []],
                    ['name' => 'Seasoned Shoestring Fries', 'qty' => 2, 'price_cents' => 650, 'category' => 'Side', 'prep_station' => 'Fryer', 'mods' => []],
                ]),
                '2x Smoky Bacon Deluxe, 2x Seasoned Shoestring Fries',
                'Ready', 'Normal', 5000, 'Seal bag with tampering stickers', 'Counter', $ts - 840,
            ]
        );

        $db->execute(
            'INSERT INTO shop_orders(order_number, order_day, order_type, customer_name, items_json, items_summary, status, priority, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'G-104', $todayDay, 'Takeaway', 'Dev Patel',
                $enc([
                    ['name' => 'Classic Cheeseburger', 'qty' => 1, 'price_cents' => 1250, 'category' => 'Burger', 'prep_station' => 'Grill', 'mods' => []],
                ]),
                '1x Classic Cheeseburger',
                'Collected', 'Normal', 1250, '', 'Counter', $ts - 1900,
            ]
        );

        $tickets = [
            [$o1['lastInsertRowid'], 'G-101', 'Tessa', 'Takeaway', 'Rush', 'Grill', '2x Double Smash Stack (No pickles)', 'Cooking', 'Rico', $ts - 300, 0, 'RUSH order'],
            [$o1['lastInsertRowid'], 'G-101', 'Tessa', 'Takeaway', 'Rush', 'Fryer', '1x Loaded Truffle Fries', 'Plated', 'Sam', $ts - 280, 0, ''],
            [$o1['lastInsertRowid'], 'G-101', 'Tessa', 'Takeaway', 'Rush', 'Assembly', 'Assemble 2x Double Smash Stack (No pickles)', 'Pending', '', 0, 0, 'Hold pickles'],
            [$o2['lastInsertRowid'], 'G-102', 'Table 6 · Ben', 'Dine-in', 'Normal', 'Grill', '1x Greenhouse Plant Smash (GF bun)', 'Pending', '', 0, 0, 'Separate tongs'],
            [$o2['lastInsertRowid'], 'G-102', 'Table 6 · Ben', 'Dine-in', 'Normal', 'Fryer', "1x Nashville Hot Chicken (Extra sauce)\n1x Crispy Onion Rings", 'Pending', '', 0, 0, ''],
            [$o3['lastInsertRowid'], 'G-103', 'UberEats #482', 'Delivery', 'Normal', 'Assembly', 'Bag 2x Smoky Bacon Deluxe + 2x Fries', 'Ready', 'Maya', $ts - 700, $ts - 500, 'Sealed'],
        ];
        foreach ($tickets as $t => $tk) {
            $db->execute(
                'INSERT INTO kitchen_tickets(order_id, order_number, customer_name, order_type, priority, station, ticket_items, status, staff_member, started_at, completed_at, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$tk[0], $tk[1], $tk[2], $tk[3], $tk[4], $tk[5], $tk[6], $tk[7], $tk[8], $tk[9], $tk[10], $tk[11], $ts - (6 - $t) * 120, $ts - 45]
            );
        }

        $stock = [
            ['Brioche Burger Buns', 'Bun', 96, 32, 48, 'Units', 'Low'],
            ['Wagyu Smash Patties (100g)', 'Patty', 140, 88, 80, 'Units', 'OK'],
            ['Plant-Based Patties', 'Patty', 24, 6, 18, 'Units', 'Low'],
            ['Buttermilk Chicken Fillets', 'Patty', 48, 30, 30, 'Units', 'OK'],
            ['House Special Burger Sauce', 'Sauce', 8, 2.5, 5, 'Litres', 'Low'],
            ['American Cheddar Slices', 'Salad', 6, 4.5, 4, 'kg', 'OK'],
            ['Dill Pickles Sliced', 'Salad', 4, 0, 3, 'kg', 'Out'],
            ['Clamshell Burger Boxes', 'Packaging', 6, 4, 3, 'Boxes', 'OK'],
            ['Vanilla Soft-Serve Mix', 'Drink', 16, 12, 10, 'Litres', 'OK'],
        ];
        foreach ($stock as $st) {
            $db->execute(
                'INSERT INTO prep_stock(ingredient, category, opening_count, current_count, par_level, unit, status, last_checked, is_sample) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1)',
                [$st[0], $st[1], $st[2], $st[3], $st[4], $st[5], $st[6], $ts - 2400]
            );
        }

        $shifts = [
            ['Rico Morales', 'Grill', $todayDay, '10:30', '19:00', 'Yes', 'Lead smash flat-top'],
            ['Samira Haddad', 'Grill', $todayDay, '11:00', '19:30', 'Not yet', 'Fryer + hot chicken'],
            ['Maya Chen', 'Front counter', $todayDay, '11:00', '18:30', 'Not yet', 'Counter POS & shakes'],
            ["Liam O'Connor", 'Runner', $todayDay, '12:00', '20:00', 'Not yet', 'Assembly pass & delivery handoff'],
            ['Dana Vance', 'Manager', $todayDay, '10:00', '21:00', 'Yes', 'Shift manager & closeout'],
        ];
        foreach ($shifts as $sr) {
            $db->execute(
                'INSERT INTO staff_shifts(staff_member, role, shift_date, start_time, end_time, break_taken, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $sr[5], $sr[6], $ts]
            );
        }

        $db->execute(
            'INSERT INTO daily_closes(close_date, cash_cents, eftpos_cents, delivery_cents, pos_cents, waste_notes, cleaning_json, manager, issues, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                V::utcDay(-1), 64500, 218400, 81200, 364100,
                '3 split brioche buns, 1 dropped fry basket',
                $enc(['Grill scraped', 'Fryer oil filtered', 'Benches sanitised', 'Cool room checked', 'Floors done', 'Bins out']),
                'Dana Vance',
                'Right fryer basket clip slightly loose — tighten before Friday night rush.',
                'Reviewed', $ts - 86400,
            ]
        );

        $db->execute('UPDATE business_settings SET order_seq = 104 WHERE id = 1 AND order_seq < 104');
        return self::sampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
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
            $member = Context::getTeamMember($db, $me['userId']);
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Smash Burgers & Kitchen Pass';
            $currency = V::oneOf($input['currency'] ?? null, self::GS_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::GS_PRESETS, 'brand_preset', ['fallback' => 'flame']);
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
                self::seedGrillStackSample($db, $todayDay);
            }
            return [
                '__status' => 201,
                '__body' => ['settings' => Context::getBusinessSettings($db), 'counts' => self::readBadgeCounts($db, $todayDay)],
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
            $currency = V::oneOf($input['currency'] ?? null, self::GS_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::GS_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, V::now()]
            );
            return ['settings' => Context::getBusinessSettings($db)];
        }, write: true);
    }

    public function listTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $members = $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC');
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This burger shop workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::GS_ROLES, 'requested_role', ['fallback' => 'grill_crew']);
            $existing = Context::getTeamMember($db, $me['userId']);
            if ($existing) {
                return ['member' => $existing];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return ['__status' => 201, '__body' => ['member' => Context::getTeamMember($db, $me['userId'])]];
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
            $role = V::oneOf($input['role'] ?? null, self::GS_ROLES, 'role', ['fallback' => $target['role']]);
            $status = V::oneOf($input['status'] ?? null, ['active', 'pending'], 'status', ['fallback' => $target['status']]);
            $db->execute('UPDATE team_members SET role = ?, status = ? WHERE user_id = ?', [$role, $status, $targetId]);
            return ['member' => Context::getTeamMember($db, $targetId)];
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
            $loaded = self::seedGrillStackSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['kitchen_tickets', 'shop_orders', 'menu_items', 'prep_stock', 'staff_shifts', 'daily_closes'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
