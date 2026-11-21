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

final class OpsController
{
    private const MENU_CATS = ['Burger', 'Side', 'Drink', 'Dessert', 'Combo'];
    private const PREP_STATIONS = ['Grill', 'Fryer', 'Cold station', 'Drinks'];
    private const KDS_STATIONS = ['Grill', 'Fryer', 'Assembly', 'Drinks'];
    private const MENU_ACTIVE = ['Active', 'Off menu'];
    private const ORDER_TYPES = ['Dine-in', 'Takeaway', 'Delivery'];
    private const ORDER_STATUSES = ['New', 'Preparing', 'Ready', 'Collected', 'Cancelled'];
    private const PRIORITIES = ['Normal', 'Rush'];
    private const TICKET_STATUSES = ['Pending', 'Cooking', 'Plated', 'Ready', 'Held'];
    private const STOCK_CATS = ['Bun', 'Patty', 'Sauce', 'Salad', 'Packaging', 'Drink'];
    private const STOCK_UNITS = ['Units', 'kg', 'Litres', 'Boxes'];
    private const SHIFT_ROLES = ['Grill', 'Front counter', 'Runner', 'Manager'];
    private const BREAK_STATES = ['Yes', 'Not yet'];
    private const CLOSE_STATUSES = ['Draft', 'Submitted', 'Reviewed'];

    private static function computeStockStatus(float $currentQty, float $parLevel): string
    {
        if ($currentQty <= 0.0) {
            return 'Out';
        }
        if ($currentQty < $parLevel) {
            return 'Low';
        }
        return 'OK';
    }

    private static function encodeJson(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }

    // ---- Menu & Ingredient Builds ----

    public function listMenu(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cat = V::text($input['category'] ?? null, 'category', ['required' => false, 'max' => 40]);
            $onlyActive = V::bool($input['onlyActive'] ?? false);
            $sql = 'SELECT * FROM menu_items WHERE 1=1';
            $params = [];
            if ($cat !== '' && $cat !== 'All') {
                $sql .= ' AND category = ?';
                $params[] = $cat;
            }
            if ($onlyActive) {
                $sql .= " AND active = 'Active'";
            }
            $sql .= " ORDER BY CASE category WHEN 'Burger' THEN 0 WHEN 'Combo' THEN 1 WHEN 'Side' THEN 2 WHEN 'Drink' THEN 3 ELSE 4 END, item_name ASC";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['ingredients'] = V::parseJson($r['ingredients_json'] ?? '', []);
            }
            return ['items' => $rows];
        });
    }

    public function addMenuItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Item name']);
            $cat = V::oneOf($input['category'] ?? null, self::MENU_CATS, 'category', ['fallback' => 'Burger']);
            $rawPrice = array_key_exists('base_price', $input) ? $input['base_price'] : ($input['price'] ?? null);
            $price = V::moneyCents($rawPrice, 'base_price', ['min' => 0, 'max' => 500000, 'label' => 'Base price']);
            $station = V::oneOf($input['prep_station'] ?? null, self::PREP_STATIONS, 'prep_station', ['fallback' => 'Grill']);
            $active = V::oneOf($input['active'] ?? null, self::MENU_ACTIVE, 'active', ['fallback' => 'Active']);
            $ingredients = V::listOf($input['ingredients'] ?? null, 'ingredients', 16, fn ($v) => V::text($v, 'ingredient', ['max' => 50]));
            $created = $db->execute(
                'INSERT INTO menu_items(item_name, category, price_cents, prep_station, ingredients_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $price, $station, self::encodeJson($ingredients), $active, V::now()]
            );
            $row = $db->first('SELECT * FROM menu_items WHERE id = ?', [$created['lastInsertRowid']]);
            $row['ingredients'] = V::parseJson($row['ingredients_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['item' => $row]];
        }, write: true);
    }

    public function saveMenuItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM menu_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Menu item not found.');
            }
            $name = array_key_exists('item_name', $input)
                ? V::text($input['item_name'], 'item_name', ['max' => 120, 'label' => 'Item name'])
                : (string) $cur['item_name'];
            $cat = array_key_exists('category', $input)
                ? V::oneOf($input['category'], self::MENU_CATS, 'category', ['fallback' => $cur['category']])
                : (string) $cur['category'];
            $price = (array_key_exists('base_price', $input) || array_key_exists('price', $input))
                ? V::moneyCents(array_key_exists('base_price', $input) ? $input['base_price'] : $input['price'], 'base_price', ['min' => 0, 'max' => 500000, 'label' => 'Base price'])
                : (int) $cur['price_cents'];
            $station = array_key_exists('prep_station', $input)
                ? V::oneOf($input['prep_station'], self::PREP_STATIONS, 'prep_station', ['fallback' => $cur['prep_station']])
                : (string) $cur['prep_station'];
            $active = array_key_exists('active', $input)
                ? V::oneOf($input['active'], self::MENU_ACTIVE, 'active', ['fallback' => $cur['active']])
                : (string) $cur['active'];
            $ingredients = is_array($input['ingredients'] ?? null)
                ? V::listOf($input['ingredients'], 'ingredients', 16, fn ($v) => V::text($v, 'ingredient', ['max' => 50]))
                : V::parseJson($cur['ingredients_json'] ?? '', []);

            $db->execute(
                'UPDATE menu_items SET item_name = ?, category = ?, price_cents = ?, prep_station = ?, ingredients_json = ?, active = ? WHERE id = ?',
                [$name, $cat, $price, $station, self::encodeJson($ingredients), $active, $id]
            );
            $row = $db->first('SELECT * FROM menu_items WHERE id = ?', [$id]);
            $row['ingredients'] = V::parseJson($row['ingredients_json'] ?? '', []);
            return ['item' => $row];
        }, write: true);
    }

    public function deleteMenuItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM menu_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Menu item not found.');
            }
            $db->execute('DELETE FROM menu_items WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Counter Orders (auto-fires multi-station KDS tickets for Grill, Fryer, Assembly & Drinks) ----

    public function listOrders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $orderDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM shop_orders WHERE 1=1';
            $params = [];
            if ($orderDay !== '') {
                $sql .= ' AND order_day = ?';
                $params[] = $orderDay;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE WHEN priority = 'Rush' AND status IN ('New', 'Preparing') THEN 0 ELSE 1 END, created_at DESC LIMIT 120";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['items'] = V::parseJson($r['items_json'] ?? '', []);
            }
            return ['orders' => $rows];
        });
    }

    public function createOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $orderType = V::oneOf($input['order_type'] ?? null, self::ORDER_TYPES, 'order_type', ['fallback' => 'Takeaway']);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Normal']);
            $customerName = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 100]) ?: 'Walk-in';
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);
            $orderDay = V::day($input['order_day'] ?? null, 'order_day', ['required' => false, 'fallback' => V::utcDay(0)]);

            $lines = V::listOf($input['items'] ?? null, 'items', 40, function ($line): array {
                $arr = is_array($line) ? $line : [];
                $nm = V::text($arr['name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Item']);
                $qty = V::int($arr['qty'] ?? 1, 'qty', ['required' => false, 'min' => 1, 'max' => 50, 'fallback' => 1]) ?? 1;
                $unitCents = V::int($arr['price_cents'] ?? 0, 'price_cents', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => 0]) ?? 0;
                $category = V::text($arr['category'] ?? null, 'category', ['required' => false, 'max' => 30]) ?: 'Burger';
                $prepStation = V::text($arr['prep_station'] ?? null, 'prep_station', ['required' => false, 'max' => 30]) ?: 'Grill';
                $rawMods = is_array($arr['mods'] ?? null) ? array_slice($arr['mods'], 0, 8) : [];
                $mods = [];
                foreach ($rawMods as $m) {
                    $trimmed = trim((string) $m);
                    if ($trimmed !== '') {
                        $mods[] = $trimmed;
                    }
                }
                return [
                    'name' => $nm,
                    'qty' => $qty,
                    'price_cents' => $unitCents,
                    'category' => $category,
                    'prep_station' => $prepStation,
                    'mods' => $mods,
                ];
            });
            if (count($lines) === 0) {
                HttpException::fail(422, 'items_required', 'Add at least one item to the order.');
            }

            $totalCents = 0;
            $summaryParts = [];
            $buckets = ['Grill' => [], 'Fryer' => [], 'Assembly' => [], 'Drinks' => []];

            foreach ($lines as $l) {
                $totalCents += $l['price_cents'] * $l['qty'];
                $modStr = count($l['mods']) > 0 ? ' (' . implode(', ', $l['mods']) . ')' : '';
                $lineLabel = $l['qty'] . 'x ' . $l['name'] . $modStr;
                $summaryParts[] = $lineLabel;

                if ($l['category'] === 'Combo') {
                    $buckets['Grill'][] = $lineLabel . ' [Patty]';
                    $buckets['Fryer'][] = $l['qty'] . 'x Combo Fries';
                    $buckets['Assembly'][] = 'Build & bag ' . $lineLabel;
                    $buckets['Drinks'][] = $l['qty'] . 'x Combo Drink';
                } elseif ($l['prep_station'] === 'Grill') {
                    $buckets['Grill'][] = $lineLabel;
                    if ($l['category'] === 'Burger') {
                        $buckets['Assembly'][] = 'Dress & wrap ' . $lineLabel;
                    }
                } elseif ($l['prep_station'] === 'Fryer') {
                    $buckets['Fryer'][] = $lineLabel;
                    if ($l['category'] === 'Burger') {
                        $buckets['Assembly'][] = 'Dress & wrap ' . $lineLabel;
                    }
                } elseif ($l['prep_station'] === 'Cold station') {
                    $buckets['Assembly'][] = $lineLabel;
                } elseif ($l['prep_station'] === 'Drinks') {
                    $buckets['Drinks'][] = $lineLabel;
                } else {
                    $buckets['Assembly'][] = $lineLabel;
                }
            }

            $nextSeq = (int) ($ctx['settings']['order_seq'] ?? 100) + 1;
            $db->execute('UPDATE business_settings SET order_seq = ? WHERE id = 1', [$nextSeq]);
            $orderNum = 'G-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO shop_orders(order_number, order_day, order_type, customer_name, items_json, items_summary, status, priority, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, 0, ?)",
                [$orderNum, $orderDay, $orderType, $customerName, self::encodeJson($lines), implode(', ', $summaryParts), $priority, $totalCents, $notes, $ctx['member']['display_name'], $ts]
            );
            $orderId = $created['lastInsertRowid'];

            $spawnedStations = [];
            foreach (self::KDS_STATIONS as $st) {
                if (count($buckets[$st]) > 0) {
                    $db->execute(
                        "INSERT INTO kitchen_tickets(order_id, order_number, customer_name, order_type, priority, station, ticket_items, status, staff_member, started_at, completed_at, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 'Pending', '', 0, 0, ?, 0, ?, ?)",
                        [$orderId, $orderNum, $customerName, $orderType, $priority, $st, implode("\n", $buckets[$st]), $notes, $ts, $ts]
                    );
                    $spawnedStations[] = $st;
                }
            }

            $row = $db->first('SELECT * FROM shop_orders WHERE id = ?', [$orderId]);
            $row['items'] = V::parseJson($row['items_json'] ?? '', []);
            return [
                '__status' => 201,
                '__body' => [
                    'order' => $row,
                    'ticketsSpawned' => count($spawnedStations),
                    'stations' => $spawnedStations,
                    'counts' => WorkspaceController::readBadgeCounts($db, $orderDay),
                ],
            ];
        }, write: true);
    }

    public function setOrderStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM shop_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Order not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ORDER_STATUSES, 'status');
            $db->execute('UPDATE shop_orders SET status = ? WHERE id = ?', [$status, $id]);
            $ts = V::now();
            if (in_array($status, ['Ready', 'Collected', 'Cancelled'], true)) {
                $db->execute(
                    "UPDATE kitchen_tickets SET status = 'Ready', completed_at = CASE WHEN completed_at = 0 THEN ? ELSE completed_at END, updated_at = ? WHERE order_id = ? AND status != 'Ready'",
                    [$ts, $ts, $id]
                );
            }
            $row = $db->first('SELECT * FROM shop_orders WHERE id = ?', [$id]);
            $row['items'] = V::parseJson($row['items_json'] ?? '', []);
            return ['order' => $row, 'counts' => WorkspaceController::readBadgeCounts($db, (string) $cur['order_day'])];
        }, write: true);
    }

    public function deleteOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM shop_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Order not found.');
            }
            $db->execute('DELETE FROM kitchen_tickets WHERE order_id = ?', [$id]);
            $db->execute('DELETE FROM shop_orders WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Kitchen Pass KDS Board ----

    public function listTickets(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $station = V::text($input['station'] ?? null, 'station', ['required' => false, 'max' => 30]);
            $includeReady = V::bool($input['includeReady'] ?? false);
            $sql = 'SELECT * FROM kitchen_tickets WHERE 1=1';
            $params = [];
            if ($station !== '' && $station !== 'All') {
                $sql .= ' AND station = ?';
                $params[] = $station;
            }
            if (!$includeReady) {
                $sql .= " AND status != 'Ready'";
            }
            $sql .= " ORDER BY CASE priority WHEN 'Rush' THEN 0 ELSE 1 END, created_at ASC LIMIT 120";
            return ['tickets' => $db->query($sql, $params)];
        });
    }

    public function addTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $station = V::oneOf($input['station'] ?? null, self::KDS_STATIONS, 'station', ['fallback' => 'Grill']);
            $ticketItems = V::text($input['ticket_items'] ?? null, 'ticket_items', ['max' => 500, 'label' => 'Ticket items']);
            $priority = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Normal']);
            $orderNum = V::text($input['order_number'] ?? null, 'order_number', ['required' => false, 'max' => 20]) ?: 'PASS';
            $customerName = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 80]) ?: 'Refire / Pass';
            $orderType = V::oneOf($input['order_type'] ?? null, self::ORDER_TYPES, 'order_type', ['fallback' => 'Takeaway']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $ts = V::now();
            $created = $db->execute(
                "INSERT INTO kitchen_tickets(order_id, order_number, customer_name, order_type, priority, station, ticket_items, status, staff_member, started_at, completed_at, notes, is_sample, created_at, updated_at) VALUES(NULL, ?, ?, ?, ?, ?, ?, 'Pending', ?, 0, 0, ?, 0, ?, ?)",
                [$orderNum, $customerName, $orderType, $priority, $station, $ticketItems, $ctx['member']['display_name'], $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['ticket' => $db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function advanceTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Kitchen ticket not found.');
            }
            $flow = ['Pending', 'Cooking', 'Plated', 'Ready'];
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::TICKET_STATUSES, 'status');
            } else {
                $idx = array_search($cur['status'], $flow, true);
                $nextStatus = $idx === false ? 'Cooking' : $flow[min($idx + 1, count($flow) - 1)];
            }
            $staff = V::text($input['staff_member'] ?? null, 'staff_member', ['required' => false, 'max' => 80])
                ?: ($cur['staff_member'] ?: $ctx['member']['display_name']);
            $ts = V::now();
            $curStarted = (int) ($cur['started_at'] ?? 0);
            $curCompleted = (int) ($cur['completed_at'] ?? 0);
            $startedAt = $curStarted !== 0 ? $curStarted : (in_array($nextStatus, ['Cooking', 'Plated', 'Ready'], true) ? $ts : 0);
            $completedAt = $nextStatus === 'Ready' ? ($curCompleted !== 0 ? $curCompleted : $ts) : 0;

            $db->execute(
                'UPDATE kitchen_tickets SET status = ?, staff_member = ?, started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?',
                [$nextStatus, $staff, $startedAt, $completedAt, $ts, $id]
            );

            // Sync parent order automatically
            $parentStatus = null;
            if (!empty($cur['order_id'])) {
                if ($nextStatus === 'Cooking' || $nextStatus === 'Plated') {
                    $db->execute("UPDATE shop_orders SET status = 'Preparing' WHERE id = ? AND status = 'New'", [$cur['order_id']]);
                } elseif ($nextStatus === 'Ready') {
                    $remaining = $db->first("SELECT COUNT(*) AS c FROM kitchen_tickets WHERE order_id = ? AND status != 'Ready'", [$cur['order_id']]);
                    if ($remaining && (int) $remaining['c'] === 0) {
                        $db->execute("UPDATE shop_orders SET status = 'Ready' WHERE id = ? AND status IN ('New', 'Preparing')", [$cur['order_id']]);
                    }
                }
                $p = $db->first('SELECT status FROM shop_orders WHERE id = ?', [$cur['order_id']]);
                if ($p) {
                    $parentStatus = $p['status'];
                }
            }

            return [
                'ticket' => $db->first('SELECT * FROM kitchen_tickets WHERE id = ?', [$id]),
                'parentOrderStatus' => $parentStatus,
            ];
        }, write: true);
    }

    public function deleteTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM kitchen_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Kitchen ticket not found.');
            }
            $db->execute('DELETE FROM kitchen_tickets WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Prep & Par Stock ----

    public function listStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query("SELECT * FROM prep_stock ORDER BY CASE status WHEN 'Out' THEN 0 WHEN 'Low' THEN 1 ELSE 2 END, category ASC, ingredient ASC");
            return ['items' => $rows];
        });
    }

    public function addStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $ingredient = V::text($input['ingredient'] ?? null, 'ingredient', ['max' => 120, 'label' => 'Ingredient']);
            $cat = V::oneOf($input['category'] ?? null, self::STOCK_CATS, 'category', ['fallback' => 'Patty']);
            $opening = V::numVal($input['opening_count'] ?? null, 'opening_count', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => 0]);
            $current = V::numVal($input['current_count'] ?? null, 'current_count', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $opening]);
            $par = V::numVal($input['par_level'] ?? null, 'par_level', ['required' => false, 'min' => 0.1, 'max' => 100000, 'fallback' => 10]);
            $unit = V::oneOf($input['unit'] ?? null, self::STOCK_UNITS, 'unit', ['fallback' => 'Units']);
            $st = self::computeStockStatus($current, $par);
            $created = $db->execute(
                'INSERT INTO prep_stock(ingredient, category, opening_count, current_count, par_level, unit, status, last_checked, is_sample) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)',
                [$ingredient, $cat, $opening, $current, $par, $unit, $st, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['item' => $db->first('SELECT * FROM prep_stock WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM prep_stock WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep stock item not found.');
            }
            $ingredient = V::text($input['ingredient'] ?? null, 'ingredient', ['max' => 120, 'label' => 'Ingredient']);
            $cat = V::oneOf($input['category'] ?? null, self::STOCK_CATS, 'category', ['fallback' => $cur['category']]);
            $opening = V::numVal($input['opening_count'] ?? null, 'opening_count', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $cur['opening_count']]);
            $current = V::numVal($input['current_count'] ?? null, 'current_count', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $cur['current_count']]);
            $par = V::numVal($input['par_level'] ?? null, 'par_level', ['required' => false, 'min' => 0.1, 'max' => 100000, 'fallback' => $cur['par_level']]);
            $unit = V::oneOf($input['unit'] ?? null, self::STOCK_UNITS, 'unit', ['fallback' => $cur['unit']]);
            $st = self::computeStockStatus($current, $par);
            $db->execute(
                'UPDATE prep_stock SET ingredient = ?, category = ?, opening_count = ?, current_count = ?, par_level = ?, unit = ?, status = ?, last_checked = ? WHERE id = ?',
                [$ingredient, $cat, $opening, $current, $par, $unit, $st, V::now(), $id]
            );
            return ['item' => $db->first('SELECT * FROM prep_stock WHERE id = ?', [$id])];
        }, write: true);
    }

    public function adjustStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM prep_stock WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep stock item not found.');
            }
            if (V::bool($input['restockToPar'] ?? false)) {
                $nextQty = max((float) $cur['current_count'], (float) $cur['par_level']);
            } else {
                $delta = V::numVal($input['delta'] ?? null, 'delta', ['min' => -10000, 'max' => 10000]);
                $nextQty = max(0.0, round(((float) $cur['current_count'] + $delta) * 100.0) / 100.0);
            }
            $st = self::computeStockStatus($nextQty, (float) $cur['par_level']);
            $db->execute('UPDATE prep_stock SET current_count = ?, status = ?, last_checked = ? WHERE id = ?', [$nextQty, $st, V::now(), $id]);
            return ['item' => $db->first('SELECT * FROM prep_stock WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM prep_stock WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Prep stock item not found.');
            }
            $db->execute('DELETE FROM prep_stock WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Staff Shifts & Break Tracking ----

    public function listShifts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $fromDay = V::day($input['from'] ?? null, 'from', ['required' => false, 'fallback' => '']);
            $sql = $fromDay !== ''
                ? 'SELECT * FROM staff_shifts WHERE shift_date >= ? ORDER BY shift_date ASC, start_time ASC LIMIT 120'
                : 'SELECT * FROM staff_shifts ORDER BY shift_date DESC, start_time ASC LIMIT 120';
            return ['shifts' => $db->query($sql, $fromDay !== '' ? [$fromDay] : [])];
        });
    }

    public function addShift(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $staffMember = V::text($input['staff_member'] ?? null, 'staff_member', ['max' => 100, 'label' => 'Staff member']);
            $role = V::oneOf($input['role'] ?? null, self::SHIFT_ROLES, 'role', ['fallback' => 'Grill']);
            $shiftDate = V::day($input['shift_date'] ?? null, 'shift_date', ['label' => 'Shift date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $breakTaken = V::oneOf($input['break_taken'] ?? null, self::BREAK_STATES, 'break_taken', ['fallback' => 'Not yet']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $created = $db->execute(
                'INSERT INTO staff_shifts(staff_member, role, shift_date, start_time, end_time, break_taken, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$staffMember, $role, $shiftDate, $startTime, $endTime, $breakTaken, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['shift' => $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveShift(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Shift not found.');
            }
            $staffMember = V::text($input['staff_member'] ?? null, 'staff_member', ['max' => 100, 'label' => 'Staff member']);
            $role = V::oneOf($input['role'] ?? null, self::SHIFT_ROLES, 'role', ['fallback' => $cur['role']]);
            $shiftDate = V::day($input['shift_date'] ?? null, 'shift_date', ['label' => 'Shift date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $breakTaken = V::oneOf($input['break_taken'] ?? null, self::BREAK_STATES, 'break_taken', ['fallback' => $cur['break_taken']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $db->execute(
                'UPDATE staff_shifts SET staff_member = ?, role = ?, shift_date = ?, start_time = ?, end_time = ?, break_taken = ?, notes = ? WHERE id = ?',
                [$staffMember, $role, $shiftDate, $startTime, $endTime, $breakTaken, $notes, $id]
            );
            return ['shift' => $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$id])];
        }, write: true);
    }

    public function toggleShiftBreak(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Shift not found.');
            }
            $nextBreak = ($cur['break_taken'] ?? '') === 'Yes' ? 'Not yet' : 'Yes';
            $db->execute('UPDATE staff_shifts SET break_taken = ? WHERE id = ?', [$nextBreak, $id]);
            return ['shift' => $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteShift(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM staff_shifts WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Shift not found.');
            }
            $db->execute('DELETE FROM staff_shifts WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Daily Close & Till Reconciliation (Cash + EFTPOS + Delivery vs POS Orders) ----

    public function listCloses(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query('SELECT * FROM daily_closes ORDER BY close_date DESC, created_at DESC LIMIT 60');
            foreach ($rows as &$r) {
                $r['cleaning_completed'] = V::parseJson($r['cleaning_json'] ?? '', []);
            }
            $todayPos = $db->first(
                "SELECT COALESCE(SUM(total_cents), 0) AS total, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN order_type = 'Delivery' THEN total_cents ELSE 0 END), 0) AS delivery_total FROM shop_orders WHERE order_day = ? AND status != 'Cancelled'",
                [$todayDay]
            );
            return [
                'closes' => $rows,
                'todaySummary' => [
                    'day' => $todayDay,
                    'posCents' => $todayPos ? (int) $todayPos['total'] : 0,
                    'orderCount' => $todayPos ? (int) $todayPos['orders'] : 0,
                    'deliveryPosCents' => $todayPos ? (int) $todayPos['delivery_total'] : 0,
                ],
            ];
        });
    }

    public function addClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $closeDate = V::day($input['close_date'] ?? null, 'close_date', ['label' => 'Close date']);
            $cashCents = V::moneyCents($input['cash_total'] ?? null, 'cash_total', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'Cash total']);
            $eftposCents = V::moneyCents($input['eftpos_total'] ?? null, 'eftpos_total', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'EFTPOS total']);
            $deliveryCents = V::moneyCents($input['delivery_total'] ?? null, 'delivery_total', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'Delivery total']);
            $wasteNotes = V::text($input['waste_notes'] ?? null, 'waste_notes', ['required' => false, 'max' => 800]);
            $cleaning = V::listOf($input['cleaning_completed'] ?? null, 'cleaning_completed', 20, fn ($v) => V::text($v, 'check', ['max' => 100]));
            $manager = V::text($input['manager'] ?? null, 'manager', ['required' => false, 'max' => 100]) ?: (string) $ctx['member']['display_name'];
            $issues = V::text($input['issues'] ?? null, 'issues', ['required' => false, 'max' => 1000]);
            $status = V::oneOf($input['status'] ?? null, self::CLOSE_STATUSES, 'status', ['fallback' => 'Submitted']);

            $posRow = $db->first("SELECT COALESCE(SUM(total_cents), 0) AS total FROM shop_orders WHERE order_day = ? AND status != 'Cancelled'", [$closeDate]);
            $posCents = $posRow ? (int) $posRow['total'] : 0;

            $created = $db->execute(
                'INSERT INTO daily_closes(close_date, cash_cents, eftpos_cents, delivery_cents, pos_cents, waste_notes, cleaning_json, manager, issues, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$closeDate, $cashCents, $eftposCents, $deliveryCents, $posCents, $wasteNotes, self::encodeJson($cleaning), $manager, $issues, $status, V::now()]
            );
            $row = $db->first('SELECT * FROM daily_closes WHERE id = ?', [$created['lastInsertRowid']]);
            $row['cleaning_completed'] = V::parseJson($row['cleaning_json'] ?? '', []);
            $row['takings_total_cents'] = (int) $row['cash_cents'] + (int) $row['eftpos_cents'] + (int) $row['delivery_cents'];
            $row['variance_cents'] = $row['takings_total_cents'] - (int) $row['pos_cents'];
            return ['__status' => 201, '__body' => ['close' => $row]];
        }, write: true);
    }

    public function setCloseStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM daily_closes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Daily close not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::CLOSE_STATUSES, 'status');
            $db->execute('UPDATE daily_closes SET status = ? WHERE id = ?', [$status, $id]);
            $row = $db->first('SELECT * FROM daily_closes WHERE id = ?', [$id]);
            $row['cleaning_completed'] = V::parseJson($row['cleaning_json'] ?? '', []);
            return ['close' => $row];
        }, write: true);
    }

    public function deleteClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM daily_closes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Daily close not found.');
            }
            $db->execute('DELETE FROM daily_closes WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
