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
    public const INV_TEAM_ROLES = ['manager', 'purchasing_officer', 'warehouse_staff'];
    public const INV_PRESETS = ['crate-amber', 'warehouse-steel', 'freight-blue', 'logistics-emerald'];
    public const INV_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];

    private const SAMPLE_TABLES = [
        'suppliers',
        'products',
        'purchase_orders',
        'po_line_items',
        'stock_movements',
    ];

    private const CLEAR_TABLES = [
        'stock_movements',
        'po_line_items',
        'purchase_orders',
        'products',
        'suppliers',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'po_seq', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('tax_rate', $row)) {
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
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    public static function shiftDay(string $isoDay, int $deltaDays): string
    {
        $src = $isoDay !== '' ? $isoDay : V::utcDay(0);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $src, $m)) {
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

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $r = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $r ? (int) $r['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function readBadgeCounts(Database $db): array
    {
        $low = $db->first('SELECT COUNT(*) AS c FROM products WHERE stock_on_hand <= reorder_point');
        $openPOs = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS val FROM purchase_orders WHERE status IN ('Draft', 'Ordered', 'Part Received')"
        );
        $vals = $db->first(
            'SELECT COUNT(*) AS skus, COALESCE(SUM(stock_on_hand), 0) AS units, COALESCE(SUM(stock_on_hand * unit_cost_cents), 0) AS cost_val, COALESCE(SUM(stock_on_hand * sell_price_cents), 0) AS sell_val FROM products'
        );
        return [
            'skuCount' => $vals ? (int) $vals['skus'] : 0,
            'totalUnits' => $vals ? (int) $vals['units'] : 0,
            'costValueCents' => $vals ? (int) $vals['cost_val'] : 0,
            'sellValueCents' => $vals ? (int) $vals['sell_val'] : 0,
            'lowStock' => $low ? (int) $low['c'] : 0,
            'openPOs' => $openPOs ? (int) $openPOs['c'] : 0,
            'openPOValueCents' => $openPOs ? (int) $openPOs['val'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedInventorySample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        // 1. Suppliers
        $supRows = [
            ['Pacific Fasteners & Hardware', 'Owen Driscoll', 'sales@pacificfasteners.example', '02 9740 3100', 'Net 30', 5, 'Account #PF-8840. Pallet freight free over $1,200.'],
            ['Redline Industrial Packaging', 'Priya Sharma', 'orders@redlinepack.example', '03 8542 1900', 'Net 15', 3, 'Next-day metro dispatch for cartons ordered before 2pm.'],
            ['Vanguard Electro Components', 'Marcus Weber', 'trade@vanguard-electro.example', '07 3190 8820', 'Net 30', 10, 'Reel & tray minimums apply on relays and harnesses.'],
            ['Tasman Raw Alloys', 'Claire Bennett', 'dispatch@tasmanalloys.example', '03 6231 4409', 'Net 60', 14, 'Mill certificates emailed with every steel & aluminium batch.'],
        ];
        $supIds = [];
        foreach ($supRows as $s => $sr) {
            $resS = $db->execute(
                'INSERT INTO suppliers(name, contact_name, email, phone, payment_terms, lead_time_days, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $sr[5], $sr[6], $ts - (4 - $s) * 3600]
            );
            $supIds[] = $resS['lastInsertRowid'];
        }

        // 2. Products with bin locations, costs, sell prices & several low-stock SKUs
        $prodRows = [
            ['CMP-1042', '24V Brushless Cooling Fan Assembly', 'Components', 2, 1850, 3900, 14, 25, 'Aisle 2, Bay A3'],
            ['CMP-1088', 'DIN-Rail 12V Power Supply (60W)', 'Components', 2, 3400, 7200, 8, 15, 'Aisle 2, Bay B1'],
            ['RAW-2010', '6061 Aluminium Extrusion Bar (2m)', 'Raw Materials', 3, 2100, 4400, 62, 30, 'Rack R1, Level 1'],
            ['PKG-3005', 'Heavy-Duty Twin-Wall Shipping Carton (450x350)', 'Packaging', 1, 240, 0, 45, 120, 'Aisle 5, Pallet P2'],
            ['PKG-3019', 'Biodegradable Void-Fill Kraft Roll (50m)', 'Packaging', 1, 1950, 0, 6, 12, 'Aisle 5, Bay C4'],
            ['CON-4012', 'M6 Stainless Hex Flange Bolts (Box 100)', 'Consumables', 0, 1420, 2900, 9, 20, 'Aisle 1, Bin D2'],
            ['FIN-5001', 'ProDrive Controller Unit Mk-IV', 'Finished Goods', 2, 14500, 28900, 22, 10, 'Cage C1, Shelf 2'],
            ['ACC-6014', 'Braided Shielded Sensor Cable (3m)', 'Accessories', 0, 890, 2200, 48, 20, 'Aisle 3, Bin A6'],
            ['CON-4055', 'High-Temp Threadlocker Adhesive (50ml)', 'Consumables', 0, 1180, 2400, 3, 10, 'Hazmat Locker H1'],
        ];
        $prodIds = [];
        foreach ($prodRows as $p => $pr) {
            $supIdx = $pr[3];
            $resP = $db->execute(
                'INSERT INTO products(sku, name, category, supplier_id, supplier_name, unit_cost_cents, sell_price_cents, stock_on_hand, reorder_point, location, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$pr[0], $pr[1], $pr[2], $supIds[$supIdx], $supRows[$supIdx][0], $pr[4], $pr[5], $pr[6], $pr[7], $pr[8], $ts - (9 - $p) * 1800, $ts - 600]
            );
            $prodIds[] = $resP['lastInsertRowid'];
        }

        // 3. Purchase Orders (1 Ordered arriving soon, 1 Draft ready to send, 1 Received historical)
        $po1 = $db->execute(
            "INSERT INTO purchase_orders(po_number, supplier_id, supplier_name, order_date, expected_date, received_date, status, total_cents, notes, created_by, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, '', 'Ordered', ?, ?, 'Purchasing Desk', 1, ?, ?)",
            [
                'PO-1001',
                $supIds[2],
                $supRows[2][0],
                self::shiftDay($todayDay, -4),
                self::shiftDay($todayDay, 2),
                1850 * 40 + 3400 * 20,
                'Deliver to Dock 2. Include packing slip with SKU barcodes.',
                $ts - 345600,
                $ts - 345600,
            ]
        );
        $po1Id = $po1['lastInsertRowid'];
        $db->execute(
            'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, 40, 0, 1850, 74000, 1)',
            [$po1Id, $prodIds[0], $prodRows[0][0], $prodRows[0][1]]
        );
        $db->execute(
            'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, 20, 0, 3400, 68000, 1)',
            [$po1Id, $prodIds[1], $prodRows[1][0], $prodRows[1][1]]
        );

        $po2 = $db->execute(
            "INSERT INTO purchase_orders(po_number, supplier_id, supplier_name, order_date, expected_date, received_date, status, total_cents, notes, created_by, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, '', 'Draft', ?, ?, 'Purchasing Desk', 1, ?, ?)",
            [
                'PO-1002',
                $supIds[1],
                $supRows[1][0],
                $todayDay,
                self::shiftDay($todayDay, 3),
                240 * 200 + 1950 * 15,
                'Monthly dispatch carton & kraft fill replenishment.',
                $ts - 7200,
                $ts - 7200,
            ]
        );
        $po2Id = $po2['lastInsertRowid'];
        $db->execute(
            'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, 200, 0, 240, 48000, 1)',
            [$po2Id, $prodIds[3], $prodRows[3][0], $prodRows[3][1]]
        );
        $db->execute(
            'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, 15, 0, 1950, 29250, 1)',
            [$po2Id, $prodIds[4], $prodRows[4][0], $prodRows[4][1]]
        );

        $po3 = $db->execute(
            "INSERT INTO purchase_orders(po_number, supplier_id, supplier_name, order_date, expected_date, received_date, status, total_cents, notes, created_by, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 'Received', ?, ?, 'Purchasing Desk', 1, ?, ?)",
            [
                'PO-1003',
                $supIds[3],
                $supRows[3][0],
                self::shiftDay($todayDay, -12),
                self::shiftDay($todayDay, -2),
                self::shiftDay($todayDay, -2),
                2100 * 40,
                'Mill cert #MC-7741 verified on arrival.',
                $ts - 900000,
                $ts - 172800,
            ]
        );
        $po3Id = $po3['lastInsertRowid'];
        $db->execute(
            'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, 40, 40, 2100, 84000, 1)',
            [$po3Id, $prodIds[2], $prodRows[2][0], $prodRows[2][1]]
        );

        // 4. Stock Movements Audit Ledger
        $moves = [
            [2, 'Received', 40, 62, 'Purchase Order Received (PO-1003)', self::shiftDay($todayDay, -2), $po3Id, 'PO-1003', 'Warehouse Dock'],
            [0, 'Sold', -12, 14, 'Production build order #WO-412', self::shiftDay($todayDay, -1), null, '', 'Assembly Floor'],
            [3, 'Sold', -55, 45, 'Weekly customer dispatch shipments', self::shiftDay($todayDay, -1), null, '', 'Dispatch Bay'],
            [5, 'Damaged', -2, 9, 'Water-damaged cartons on lower shelf', $todayDay, null, '', 'Warehouse Staff'],
            [6, 'Adjustment', 2, 22, 'Cycle count verification in Cage C1', $todayDay, null, '', 'Inventory Manager'],
        ];
        foreach ($moves as $m => $mv) {
            $pRef = $prodRows[$mv[0]];
            $db->execute(
                'INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity, stock_after, reason, move_date, po_id, po_number, actor_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$prodIds[$mv[0]], $pRef[0], $pRef[1], $mv[1], $mv[2], $mv[3], $mv[4], $mv[5], $mv[6], $mv[7], $mv[8], $ts - (5 - $m) * 7200]
            );
        }

        $db->execute('UPDATE business_settings SET po_seq = 1003 WHERE id = 1 AND po_seq < 1003');
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
                'counts' => self::readBadgeCounts($db),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Stock Control & Purchasing Hub';
            $currency = V::oneOf($input['currency'] ?? null, self::INV_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::INV_PRESETS, 'brand_preset', ['fallback' => 'crate-amber']);
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
                $db->execute("UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?", [$ownerName, $me['userId']]);
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedInventorySample($db, $todayDay);
            }
            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::readBadgeCounts($db),
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
            $currency = V::oneOf($input['currency'] ?? null, self::INV_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::INV_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This warehouse workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::INV_TEAM_ROLES, 'requested_role', ['fallback' => 'warehouse_staff']);
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
            $role = V::oneOf($input['role'] ?? null, self::INV_TEAM_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedInventorySample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db)];
        }, write: true);
    }
}
