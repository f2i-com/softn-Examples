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
    private const TEAM_ROLES = ['manager', 'sales_assistant', 'visual_merchandiser', 'online_orders'];
    private const PRESETS = ['terracotta', 'ink-slate', 'olive-linen', 'cobalt-shop'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'suppliers',
        'products',
        'staff_roster',
        'stock_movements',
        'store_tasks',
        'returns_issues',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        if (array_key_exists('id', $row)) {
            $row['id'] = (int) $row['id'];
        }
        if (array_key_exists('setup_done', $row)) {
            $row['setup_done'] = (int) $row['setup_done'];
        }
        if (array_key_exists('tax_rate', $row)) {
            $row['tax_rate'] = (float) $row['tax_rate'];
        }
        if (array_key_exists('updated_at', $row)) {
            $row['updated_at'] = (int) $row['updated_at'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeMember(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        if (array_key_exists('is_owner', $row)) {
            $row['is_owner'] = (int) $row['is_owner'];
        }
        if (array_key_exists('created_at', $row)) {
            $row['created_at'] = (int) $row['created_at'];
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

    /** @return array<string, mixed> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $low = $db->first(
            "SELECT COUNT(*) AS c FROM products WHERE status != 'Discontinued' AND current_stock <= reorder_point"
        );
        $openTasks = $db->first("SELECT COUNT(*) AS c FROM store_tasks WHERE status != 'Done'");
        $overdueTasks = $db->first(
            "SELECT COUNT(*) AS c FROM store_tasks WHERE status != 'Done' AND due_date != '' AND due_date < ?",
            [$todayDay]
        );
        $openReturns = $db->first(
            "SELECT COUNT(*) AS c FROM returns_issues WHERE status IN ('Open', 'Processing')"
        );
        $vals = $db->first(
            "SELECT COALESCE(SUM(current_stock), 0) AS units, COALESCE(SUM(current_stock * cost_cents), 0) AS cost_val, COALESCE(SUM(current_stock * retail_cents), 0) AS retail_val FROM products WHERE status != 'Discontinued'"
        );
        $retailVal = $vals ? (int) $vals['retail_val'] : 0;
        $costVal = $vals ? (int) $vals['cost_val'] : 0;
        $marginPct = $retailVal > 0 ? round((($retailVal - $costVal) / $retailVal) * 1000.0) / 10.0 : 0.0;

        return [
            'lowStock' => $low ? (int) $low['c'] : 0,
            'openTasks' => $openTasks ? (int) $openTasks['c'] : 0,
            'overdueTasks' => $overdueTasks ? (int) $overdueTasks['c'] : 0,
            'openReturns' => $openReturns ? (int) $openReturns['c'] : 0,
            'totalUnits' => $vals ? (int) $vals['units'] : 0,
            'costValueCents' => $costVal,
            'retailValueCents' => $retailVal,
            'marginPct' => $marginPct,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function shiftDay(string $isoDay, int $deltaDays): string
    {
        $parts = explode('-', $isoDay !== '' ? $isoDay : V::utcDay(0));
        $y = (int) ($parts[0] ?? 1970);
        $m = (int) ($parts[1] ?? 1);
        $d = (int) ($parts[2] ?? 1);
        $y -= ($m <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $days = $era * 146097 + $doe - 719468;
        return gmdate('Y-m-d', ($days + $deltaDays) * 86400);
    }

    public static function seedCounterflowSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        // 1. Suppliers
        $supRows = [
            ['Harbour Lane Wholesale', 'Tessa Gallagher', 'orders@harbourlanewholesale.com.au', '02 9380 4110', 'https://harbourlane.example', 5, 'Net 30', 'Free freight over $650. Linen restocks ship every Tuesday.'],
            ['Clay & Kiln Studio', 'Kenji Takahashi', 'wholesale@clayandkiln.com.au', '03 9417 2290', 'https://clayandkiln.example', 10, 'Net 7', 'Hand-thrown ceramics; 12-unit carton minimums.'],
            ['Paperbark Press', 'Miriam Solis', 'trade@paperbarkpress.com.au', '02 8011 7742', 'https://paperbark.example', 4, 'Prepaid', 'Greeting cards & notebooks; quick metro courier.'],
            ['Solstice Fine Jewellery', 'Clara Byrne', 'stockists@solsticejewellery.com.au', '0418 552 904', 'https://solstice.example', 14, 'Net 30', 'Sterling & vermeil pieces; seasonal capsule drops.'],
        ];
        $supIds = [];
        foreach ($supRows as $s => $sr) {
            $resS = $db->execute(
                'INSERT INTO suppliers(supplier_name, contact_person, email, phone, website, lead_time_days, payment_terms, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$sr[0], $sr[1], $sr[2], $sr[3], $sr[4], $sr[5], $sr[6], $sr[7], $ts - (4 - $s) * 3600]
            );
            $supIds[] = $resS['lastInsertRowid'];
        }

        // 2. Staff Roster
        $staffRows = [
            ['Freya Lindqvist', 'Store manager', '0412 310 882', 'freya@store.example', ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], 'Active', 'Keyholder, visual direction & supplier orders'],
            ['Devon Patel', 'Sales assistant', '0421 904 117', 'devon@store.example', ['Monday', 'Wednesday', 'Friday', 'Saturday', 'Sunday'], 'Active', 'POS lead & customer returns desk'],
            ['Mina Cho', 'Visual merchandiser', '0433 618 205', 'mina@store.example', ['Monday', 'Tuesday', 'Thursday', 'Friday'], 'Active', 'Window displays, lighting & floor tables'],
            ['Lachlan Reid', 'Online orders', '0408 773 419', 'lachlan@store.example', ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], 'Active', 'Click & collect packing + stocktake audits'],
        ];
        $staffIds = [];
        foreach ($staffRows as $st => $stf) {
            $resSt = $db->execute(
                'INSERT INTO staff_roster(name, role, phone, email, usual_days_json, active, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$stf[0], $stf[1], $stf[2], $stf[3], json_encode($stf[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $stf[5], $stf[6], $ts - (4 - $st) * 1800]
            );
            $staffIds[] = $resSt['lastInsertRowid'];
        }

        // 3. Products (with realistic cost/retail margins and several low-stock SKUs)
        $prodRows = [
            ['HOM-104', 'Stonewashed Linen Throw (Sage)', 'Homewares', 0, 5200, 12900, 3, 6, 'Low stock', 'Bestseller on front table'],
            ['HOM-118', 'Speckled Stoneware Pour-Over Mug', 'Homewares', 1, 1450, 3800, 18, 8, 'Active', 'Display shelf B'],
            ['APP-203', 'Merino Ribbed Crew Cardigan (Oat)', 'Apparel', 0, 6800, 16500, 2, 5, 'Low stock', 'Sizes S/M nearly sold out'],
            ['GFT-309', 'Cedarwood & Fig Soy Candle (320g)', 'Gifts', 1, 1600, 4400, 4, 10, 'Low stock', 'High margin gift staple'],
            ['STA-412', 'Lay-Flat Linen Notebook (A5 Terracotta)', 'Stationery', 2, 1100, 3200, 24, 10, 'Active', 'Countertop impulse bay'],
            ['JWL-501', 'Hammered Gold Vermeil Hoop Earrings', 'Jewellery', 3, 4200, 11500, 7, 4, 'Active', 'Glass cabinet tray 1'],
            ['SEA-604', 'Woven Market Basket (Natural Palm)', 'Seasonal', 0, 2600, 6800, 0, 4, 'Low stock', 'Window hero prop — out of stock'],
            ['STA-429', 'Letterpress Botanical Greeting Card Set', 'Stationery', 2, 750, 2200, 31, 12, 'Active', 'Spinning card rack'],
            ['JWL-514', 'Freshwater Pearl Drop Pendant', 'Jewellery', 3, 5400, 14800, 5, 3, 'Active', 'Gift boxed'],
            ['GFT-322', 'Brass Taper Candle Holders (Pair)', 'Gifts', 1, 2200, 5800, 3, 5, 'Low stock', 'Dining edit display'],
        ];
        $prodIds = [];
        foreach ($prodRows as $p => $pr) {
            $supIdx = $pr[3];
            $resP = $db->execute(
                'INSERT INTO products(sku, product_name, category, supplier_id, supplier_name, cost_cents, retail_cents, current_stock, reorder_point, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$pr[0], $pr[1], $pr[2], $supIds[$supIdx], $supRows[$supIdx][0], $pr[4], $pr[5], $pr[6], $pr[7], $pr[8], $pr[9], $ts - (10 - $p) * 1200, $ts - 600]
            );
            $prodIds[] = $resP['lastInsertRowid'];
        }

        // 4. Stock Movements Ledger
        $moves = [
            [0, 'Delivery', 12, 12, 'Weekly linen carton arrival', self::shiftDay($todayDay, -4), 0, 'DN-8841'],
            [0, 'Sale adjustment', -9, 3, 'Weekend POS sales reconciliation', self::shiftDay($todayDay, -1), 1, 'POS-EOD'],
            [1, 'Delivery', 24, 24, 'Kiln batch #14 restock', self::shiftDay($todayDay, -3), 3, 'CK-209'],
            [1, 'Damage', -1, 23, 'Hairline crack spotted during unboxing', self::shiftDay($todayDay, -3), 3, 'DMG-014'],
            [3, 'Sale adjustment', -6, 4, 'Gift table surge — needs reorder', $todayDay, 1, 'POS-MID'],
            [4, 'Stock count', 2, 24, 'Found 2 extra units in back drawer', self::shiftDay($todayDay, -2), 3, 'CNT-NOV'],
            [2, 'Return', 1, 2, 'Customer exchanged size M for L', $todayDay, 1, 'RET-102'],
        ];
        foreach ($moves as $mv => $m) {
            $prRef = $prodRows[$m[0]];
            $stRef = $staffRows[$m[6]];
            $db->execute(
                'INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$prodIds[$m[0]], $prRef[0], $prRef[1], $m[1], $m[2], $m[3], $m[4], $m[5], $staffIds[$m[6]], $stRef[0], $m[7], $ts - (7 - $mv) * 2400]
            );
        }

        // 5. Store Floor Tasks (Opening / Merchandising / Stocktake / Closing)
        $tasks = [
            ['Count till float & steam front rail', 'Opening', 'Floor', 'High', 0, $todayDay, 'Done', 'Completed before 9am doors open'],
            ['Refresh window plinth with terracotta homewares', 'Merchandising', 'Display', 'High', 2, self::shiftDay($todayDay, -1), 'Doing', 'Swap out palm baskets while awaiting delivery'],
            ['Cycle count candle & stationery bays', 'Stocktake', 'Stockroom', 'Medium', 3, $todayDay, 'To do', 'Verify Cedarwood candles before calling Clay & Kiln'],
            ['Send Harbour Lane linen & knitwear reorder', 'Stocktake', 'Admin', 'High', 0, $todayDay, 'To do', 'Include Sage Linen Throws and Oat Cardigans'],
            ['Pack afternoon click-and-collect parcels', 'Closing', 'Online', 'Medium', 3, $todayDay, 'To do', 'Courier pickup at 4:30pm sharp'],
            ['Reconcile EFTPOS terminal & lock safe', 'Closing', 'Floor', 'Low', 1, self::shiftDay($todayDay, 1), 'To do', 'Standard closeout procedure'],
        ];
        foreach ($tasks as $tk => $t) {
            $sIdx = $t[4];
            $db->execute(
                'INSERT INTO store_tasks(task_title, routine, area, priority, assigned_staff_id, assigned_name, due_date, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$t[0], $t[1], $t[2], $t[3], $staffIds[$sIdx], $staffRows[$sIdx][0], $t[5], $t[6], $t[7], $ts - (6 - $tk) * 1800, $ts - 300]
            );
        }

        // 6. Customer Returns & Exchanges
        $rets = [
            [2, 'Hannah Kowalski', 'Exchange', 'Exchange', $todayDay, 16500, 1, 'Open', 'Swapped size M for size L; returned M inspected and restocked.'],
            [1, 'David Mercer', 'Fault', 'Refund', self::shiftDay($todayDay, -1), 3800, 0, 'Processing', 'Glaze chip on handle — hold for Clay & Kiln credit claim.'],
            [3, 'Sienna Wallace', 'Return', 'Store credit', self::shiftDay($todayDay, -2), 4400, 1, 'Resolved', 'Unopened duplicate gift — issued $44 store credit voucher #SC-408.'],
        ];
        foreach ($rets as $r => $rt) {
            $pInfo = $prodRows[$rt[0]];
            $db->execute(
                'INSERT INTO returns_issues(product_id, sku, product_name, customer_name, issue_type, resolution_type, issue_date, amount_cents, restocked, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$prodIds[$rt[0]], $pInfo[0], $pInfo[1], $rt[1], $rt[2], $rt[3], $rt[4], $rt[5], $rt[6], $rt[7], $rt[8], $ts - (3 - $r) * 3600, $ts - 900]
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
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => $me['isOwner'],
                        'role' => $me['isOwner'] ? 'owner' : '',
                    ],
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
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => false,
                        'role' => '',
                    ],
                    'settings' => [
                        'business_name' => $settings['business_name'],
                        'brand_preset' => $settings['brand_preset'],
                    ],
                    'counts' => null,
                ];
            }

            if (($member['status'] ?? '') !== 'active') {
                return [
                    'setupDone' => true,
                    'isOwner' => false,
                    'access' => 'pending',
                    'businessName' => $settings['business_name'],
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => false,
                        'role' => $member['role'],
                        'displayName' => $member['display_name'],
                    ],
                    'settings' => [
                        'business_name' => $settings['business_name'],
                        'brand_preset' => $settings['brand_preset'],
                    ],
                    'counts' => null,
                ];
            }

            return [
                'setupDone' => true,
                'isOwner' => $me['isOwner'],
                'access' => 'granted',
                'me' => [
                    'userId' => $me['userId'],
                    'isOwner' => $me['isOwner'],
                    'role' => $member['role'],
                    'displayName' => $member['display_name'],
                ],
                'settings' => $settings,
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Store name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline'])
                ?: 'Boutique & Specialty Retail Operations';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60])
                ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'terracotta']);
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
                $db->execute(
                    "UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?",
                    [$ownerName, $me['userId']]
                );
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedCounterflowSample($db, $todayDay);
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
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This store workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::TEAM_ROLES, 'requested_role', ['fallback' => 'sales_assistant']);
            $existing = Context::getTeamMember($db, $me['userId']);
            if ($existing) {
                return ['member' => self::normalizeMember($existing)];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['member' => self::normalizeMember(Context::getTeamMember($db, $me['userId']))],
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
            $loaded = self::seedCounterflowSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['returns_issues', 'store_tasks', 'stock_movements', 'products', 'staff_roster', 'suppliers'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
