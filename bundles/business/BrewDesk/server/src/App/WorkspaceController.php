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
    private const CAFE_ROLES = ['owner', 'manager', 'barista', 'kitchen', 'front_counter'];
    private const JOIN_ROLES = ['manager', 'barista', 'kitchen', 'front_counter'];
    private const PRESETS = ['espresso', 'matcha', 'midnight', 'terracotta'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        $tables = ['menu_items', 'cafe_orders', 'barista_tickets', 'stock_items', 'staff_shifts', 'daily_closes'];
        foreach ($tables as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $queued = $db->first("SELECT COUNT(*) AS c FROM barista_tickets WHERE status != 'Ready'");
        $activeOrders = $db->first("SELECT COUNT(*) AS c FROM cafe_orders WHERE status IN ('New', 'Making', 'Ready')");
        $lowStock = $db->first("SELECT COUNT(*) AS c FROM stock_items WHERE status IN ('Low', 'Out')");
        $todaySales = $db->first(
            "SELECT COALESCE(SUM(total_cents), 0) AS s, COUNT(*) AS c FROM cafe_orders WHERE order_day = ? AND status != 'Cancelled'",
            [$todayDay]
        );
        return [
            'queuedTickets' => $queued ? (int) $queued['c'] : 0,
            'activeOrders' => $activeOrders ? (int) $activeOrders['c'] : 0,
            'lowStock' => $lowStock ? (int) $lowStock['c'] : 0,
            'todaySalesCents' => $todaySales ? (int) $todaySales['s'] : 0,
            'todayOrdersCount' => $todaySales ? (int) $todaySales['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedCafeSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $menu = [
            ['Flat White', 'Coffee', 500, 'Espresso', 'Active', ['Gluten-free']],
            ['Oat Latte', 'Coffee', 580, 'Espresso', 'Active', ['Vegan', 'Dairy-free']],
            ['Cappuccino', 'Coffee', 500, 'Espresso', 'Active', ['Gluten-free']],
            ['Long Black', 'Coffee', 480, 'Espresso', 'Active', ['Vegan', 'Gluten-free', 'Dairy-free']],
            ['Batch Brew Filter', 'Coffee', 550, 'Espresso', 'Active', ['Vegan', 'Gluten-free', 'Dairy-free']],
            ['Iced Matcha Latte', 'Cold drink', 680, 'Cold bar', 'Active', ['Gluten-free']],
            ['House Spiced Chai', 'Tea', 580, 'Espresso', 'Active', ['Gluten-free']],
            ['Iced Cold Brew', 'Cold drink', 620, 'Cold bar', 'Active', ['Vegan', 'Dairy-free']],
            ['Sourdough Avocado Toast', 'Food', 1450, 'Kitchen', 'Active', ['Vegan']],
            ['Reuben Melt Toastie', 'Food', 1600, 'Kitchen', 'Active', []],
            ['Almond Croissant', 'Food', 750, 'Kitchen', 'Active', []],
            ['House Blend Beans (250g)', 'Retail beans', 1900, 'Retail', 'Active', ['Vegan', 'Gluten-free']],
        ];
        $menuLen = count($menu);
        foreach ($menu as $i => $m) {
            $db->execute(
                'INSERT INTO menu_items(item_name, category, price_cents, station, active, dietary_tags, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$m[0], $m[1], $m[2], $m[3], $m[4], json_encode($m[5]), $ts - ($menuLen - $i) * 60]
            );
        }

        $o1 = $db->execute(
            'INSERT INTO cafe_orders(order_number, order_day, table_number, order_type, customer_name, items_json, items_summary, status, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'B-101', $todayDay, '', 'Takeaway', 'Maya Chen',
                json_encode([
                    ['name' => 'Oat Latte', 'qty' => 1, 'price_cents' => 580, 'milk' => 'Oat', 'size' => 'Regular'],
                    ['name' => 'Almond Croissant', 'qty' => 1, 'price_cents' => 750],
                ]),
                '1x Oat Latte, 1x Almond Croissant', 'Making', 1330, 'Extra hot oat milk', 'Front Desk', $ts - 420,
            ]
        );
        $o2 = $db->execute(
            'INSERT INTO cafe_orders(order_number, order_day, table_number, order_type, customer_name, items_json, items_summary, status, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'B-102', $todayDay, 'T4', 'Dine-in', 'Liam & Priya',
                json_encode([
                    ['name' => 'Flat White', 'qty' => 2, 'price_cents' => 500, 'milk' => 'Full cream', 'size' => 'Regular'],
                    ['name' => 'Reuben Melt Toastie', 'qty' => 1, 'price_cents' => 1600],
                ]),
                '2x Flat White, 1x Reuben Melt Toastie', 'New', 2600, 'Toastie cut in half', 'Front Desk', $ts - 240,
            ]
        );
        $db->execute(
            'INSERT INTO cafe_orders(order_number, order_day, table_number, order_type, customer_name, items_json, items_summary, status, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'B-103', $todayDay, '', 'Takeaway', 'Samira Patel',
                json_encode([['name' => 'Iced Matcha Latte', 'qty' => 1, 'price_cents' => 680, 'milk' => 'Almond', 'size' => 'Large']]),
                '1x Iced Matcha Latte', 'Ready', 680, 'Light ice', 'Front Desk', $ts - 780,
            ]
        );
        $db->execute(
            'INSERT INTO cafe_orders(order_number, order_day, table_number, order_type, customer_name, items_json, items_summary, status, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'B-104', $todayDay, 'T2', 'Dine-in', 'Noah Brooks',
                json_encode([
                    ['name' => 'Long Black', 'qty' => 1, 'price_cents' => 480],
                    ['name' => 'Sourdough Avocado Toast', 'qty' => 1, 'price_cents' => 1450],
                ]),
                '1x Long Black, 1x Sourdough Avocado Toast', 'Served', 1930, '', 'Front Desk', $ts - 2200,
            ]
        );

        $tickets = [
            [$o1['lastInsertRowid'], 'B-101', 'Maya Chen', 'Latte', 'Oat', 'Regular', 2, ['Extra hot'], 'Pulling shots', 'Jordan', ''],
            [$o2['lastInsertRowid'], 'B-102', 'Liam & Priya', 'Flat white', 'Full cream', 'Regular', 2, [], 'Queued', '', 'Table 4'],
            [$o2['lastInsertRowid'], 'B-102', 'Liam & Priya', 'Flat white', 'Full cream', 'Large', 3, ['Extra shot'], 'Queued', '', 'Table 4'],
            [null, 'B-103', 'Samira Patel', 'Matcha', 'Almond', 'Large', 1, ['Iced'], 'Ready', 'Jordan', 'Light ice'],
        ];
        foreach ($tickets as $t => $tk) {
            $db->execute(
                'INSERT INTO barista_tickets(order_id, order_number, customer_name, drink_type, milk, size, shots, extras_json, status, barista_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$tk[0], $tk[1], $tk[2], $tk[3], $tk[4], $tk[5], $tk[6], json_encode($tk[7]), $tk[8], $tk[9], $tk[10], $ts - (4 - $t) * 180, $ts - 60]
            );
        }

        $stock = [
            ['House Espresso Blend', 'Beans', 11.5, 10, 'kg', 'OK', 'Roastworks Co.'],
            ['Single Origin Filter', 'Beans', 1.5, 4, 'kg', 'Low', 'Roastworks Co.'],
            ['Full Cream Milk', 'Milk', 28, 24, 'Litres', 'OK', 'Valley Dairy'],
            ['Barista Oat Milk', 'Milk', 6, 18, 'Litres', 'Low', 'OatCraft Wholesale'],
            ['Almond Barista Milk', 'Milk', 0, 8, 'Litres', 'Out', 'OatCraft Wholesale'],
            ['8oz Takeaway Cups', 'Cups', 3.5, 4, 'Boxes', 'Low', 'EcoPack Supplies'],
            ['House Chai Concentrate', 'Syrup', 5, 4, 'Litres', 'OK', 'Spice Merchant'],
            ['Sourdough Loaves', 'Food prep', 9, 8, 'Units', 'OK', 'Corner Bakehouse'],
        ];
        foreach ($stock as $st) {
            $db->execute(
                'INSERT INTO stock_items(item_name, category, current_qty, par_level, unit, status, supplier, last_checked, is_sample) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1)',
                [$st[0], $st[1], $st[2], $st[3], $st[4], $st[5], $st[6], $ts - 3600]
            );
        }

        $shifts = [
            ['Jordan Ellis', 'Barista', $todayDay, '06:30', '14:00', 'Espresso', 'Dial-in + morning rush'],
            ['Chloe Nguyen', 'Front counter', $todayDay, '07:00', '14:30', 'Floor', 'Counter + table service'],
            ['Marco Silva', 'Kitchen', $todayDay, '07:00', '15:00', 'Kitchen', 'All-day toasties and prep'],
            ['Hannah Reid', 'Barista', $todayDay, '10:00', '16:30', 'Cold bar', 'Lunch cover + closeout'],
        ];
        foreach ($shifts as $sr) {
            $db->execute(
                'INSERT INTO staff_shifts(staff_name, role, shift_date, start_time, end_time, station, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $sr[5], $sr[6], $ts]
            );
        }

        $db->execute(
            'INSERT INTO daily_closes(close_date, register_cents, pos_cents, tips_cents, beans_used, milk_used, waste, cleaning_json, manager_notes, closed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                V::utcDay(-1), 184250, 184000, 9450, 4.8, 42,
                '2 almond croissants, 1L skim milk',
                json_encode(['Espresso machine backflushed', 'Grinder cleaned', 'Fridges wiped', 'Floors mopped', 'Bins out', 'Milk fridge dated']),
                'Strong morning trade. Order extra oat milk before Friday.', 'Cafe Manager', $ts - 86400,
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Espresso & Counter Operations';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'espresso']);
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
                self::seedCafeSample($db, $todayDay);
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
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This cafe workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'barista']);
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
            $role = V::oneOf($input['role'] ?? null, self::JOIN_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedCafeSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['barista_tickets', 'cafe_orders', 'menu_items', 'stock_items', 'staff_shifts', 'daily_closes'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
