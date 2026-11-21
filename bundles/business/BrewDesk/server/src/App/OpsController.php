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
    private const MENU_CATS = ['Coffee', 'Tea', 'Cold drink', 'Food', 'Retail beans'];
    private const STATIONS = ['Espresso', 'Kitchen', 'Cold bar', 'Retail'];
    private const MENU_ACTIVE = ['Active', 'Seasonal', 'Retired'];
    private const ORDER_TYPES = ['Dine-in', 'Takeaway', 'Delivery'];
    private const ORDER_STATUSES = ['New', 'Making', 'Ready', 'Served', 'Cancelled'];
    private const TICKET_STATUSES = ['Queued', 'Pulling shots', 'Pouring', 'Ready'];
    private const MILKS = ['Full cream', 'Skim', 'Oat', 'Almond', 'Soy', 'Lactose-free', 'Black / None'];
    private const SIZES = ['Small', 'Regular', 'Large'];
    private const STOCK_CATS = ['Beans', 'Milk', 'Syrup', 'Cups', 'Food prep', 'Packaging'];
    private const STOCK_UNITS = ['kg', 'Litres', 'Units', 'Boxes'];
    private const SHIFT_ROLES = ['Barista', 'Kitchen', 'Front counter', 'Manager'];
    private const SHIFT_STATIONS = ['Espresso', 'Kitchen', 'Cold bar', 'Floor'];

    private static function computeStockStatus(float $qty, float $par): string
    {
        if ($qty <= 0.0) {
            return 'Out';
        }
        if ($qty < $par) {
            return 'Low';
        }
        return 'OK';
    }

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
                $sql .= " AND active != 'Retired'";
            }
            $sql .= ' ORDER BY category ASC, item_name ASC';
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r['dietary_tags'] = V::parseJson($r['dietary_tags'] ?? '', []);
            }
            return ['items' => $rows];
        });
    }

    public function addMenuItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Item name']);
            $cat = V::oneOf($input['category'] ?? null, self::MENU_CATS, 'category', ['fallback' => 'Coffee']);
            $price = V::moneyCents($input['price'] ?? null, 'price', ['min' => 0, 'max' => 500000, 'label' => 'Price']);
            $station = V::oneOf($input['station'] ?? null, self::STATIONS, 'station', ['fallback' => 'Espresso']);
            $active = V::oneOf($input['active'] ?? null, self::MENU_ACTIVE, 'active', ['fallback' => 'Active']);
            $tags = V::listOf($input['dietary_tags'] ?? null, 'dietary_tags', 8, fn ($v) => V::text($v, 'tag', ['max' => 40]));
            $created = $db->execute(
                'INSERT INTO menu_items(item_name, category, price_cents, station, active, dietary_tags, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $price, $station, $active, json_encode($tags), V::now()]
            );
            $row = $db->first('SELECT * FROM menu_items WHERE id = ?', [$created['lastInsertRowid']]);
            $row['dietary_tags'] = V::parseJson($row['dietary_tags'] ?? '', []);
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
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Item name']);
            $cat = V::oneOf($input['category'] ?? null, self::MENU_CATS, 'category', ['fallback' => $cur['category']]);
            $price = V::moneyCents($input['price'] ?? null, 'price', ['min' => 0, 'max' => 500000, 'label' => 'Price']);
            $station = V::oneOf($input['station'] ?? null, self::STATIONS, 'station', ['fallback' => $cur['station']]);
            $active = V::oneOf($input['active'] ?? null, self::MENU_ACTIVE, 'active', ['fallback' => $cur['active']]);
            $tags = is_array($input['dietary_tags'] ?? null)
                ? V::listOf($input['dietary_tags'], 'dietary_tags', 8, fn ($v) => V::text($v, 'tag', ['max' => 40]))
                : V::parseJson($cur['dietary_tags'] ?? '', []);
            $db->execute(
                'UPDATE menu_items SET item_name = ?, category = ?, price_cents = ?, station = ?, active = ?, dietary_tags = ? WHERE id = ?',
                [$name, $cat, $price, $station, $active, json_encode($tags), $id]
            );
            $row = $db->first('SELECT * FROM menu_items WHERE id = ?', [$id]);
            $row['dietary_tags'] = V::parseJson($row['dietary_tags'] ?? '', []);
            return ['item' => $row];
        }, write: true);
    }

    public function deleteMenuItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM menu_items WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listOrders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $orderDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM cafe_orders WHERE 1=1';
            $params = [];
            if ($orderDay !== '') {
                $sql .= ' AND order_day = ?';
                $params[] = $orderDay;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY created_at DESC LIMIT 120';
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
            $tableNumber = V::text($input['table_number'] ?? null, 'table_number', ['required' => false, 'max' => 20]);
            $customerName = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 100])
                ?: ($tableNumber !== '' ? 'Table ' . $tableNumber : 'Walk-in');
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);
            $orderDay = V::day($input['order_day'] ?? null, 'order_day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $lines = V::listOf($input['items'] ?? null, 'items', 40, function ($line): array {
                $arr = is_array($line) ? $line : [];
                $nm = V::text($arr['name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Item']);
                $qty = V::int($arr['qty'] ?? 1, 'qty', ['min' => 1, 'max' => 50, 'fallback' => 1]) ?? 1;
                $unitCents = V::int($arr['price_cents'] ?? 0, 'price_cents', ['min' => 0, 'max' => 500000, 'fallback' => 0]) ?? 0;
                $station = V::text($arr['station'] ?? null, 'station', ['required' => false, 'max' => 30]) ?: 'Espresso';
                $milk = V::text($arr['milk'] ?? null, 'milk', ['required' => false, 'max' => 30]) ?: 'Full cream';
                $size = V::text($arr['size'] ?? null, 'size', ['required' => false, 'max' => 20]) ?: 'Regular';
                $shots = V::int($arr['shots'] ?? null, 'shots', ['required' => false, 'min' => 0, 'max' => 6, 'fallback' => 2]) ?? 2;
                $extras = is_array($arr['extras'] ?? null) ? array_map('strval', array_slice($arr['extras'], 0, 6)) : [];
                return [
                    'name' => $nm,
                    'qty' => $qty,
                    'price_cents' => $unitCents,
                    'station' => $station,
                    'milk' => $milk,
                    'size' => $size,
                    'shots' => $shots,
                    'extras' => $extras,
                ];
            });
            if (count($lines) === 0) {
                HttpException::fail(422, 'items_required', 'Add at least one item to the order.');
            }

            $totalCents = 0;
            $summaryParts = [];
            foreach ($lines as $l) {
                $totalCents += $l['price_cents'] * $l['qty'];
                $summaryParts[] = $l['qty'] . 'x ' . $l['name'];
            }

            $nextSeq = (int) ($ctx['settings']['order_seq'] ?? 100) + 1;
            $db->execute('UPDATE business_settings SET order_seq = ? WHERE id = 1', [$nextSeq]);
            $orderNum = 'B-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO cafe_orders(order_number, order_day, table_number, order_type, customer_name, items_json, items_summary, status, total_cents, notes, created_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, 0, ?)",
                [$orderNum, $orderDay, $tableNumber, $orderType, $customerName, json_encode($lines), implode(', ', $summaryParts), $totalCents, $notes, $ctx['member']['display_name'], $ts]
            );
            $orderId = $created['lastInsertRowid'];

            $spawned = 0;
            foreach ($lines as $l) {
                if ($l['station'] === 'Espresso' || $l['station'] === 'Cold bar') {
                    for ($q = 0; $q < $l['qty']; $q++) {
                        $db->execute(
                            "INSERT INTO barista_tickets(order_id, order_number, customer_name, drink_type, milk, size, shots, extras_json, status, barista_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Queued', '', ?, 0, ?, ?)",
                            [$orderId, $orderNum, $customerName, $l['name'], $l['milk'], $l['size'], $l['shots'], json_encode($l['extras']), $notes !== '' ? $notes : ($tableNumber !== '' ? 'Table ' . $tableNumber : ''), $ts, $ts]
                        );
                        $spawned++;
                    }
                }
            }

            $row = $db->first('SELECT * FROM cafe_orders WHERE id = ?', [$orderId]);
            $row['items'] = V::parseJson($row['items_json'] ?? '', []);
            return [
                '__status' => 201,
                '__body' => ['order' => $row, 'ticketsSpawned' => $spawned, 'counts' => WorkspaceController::readBadgeCounts($db, $orderDay)],
            ];
        }, write: true);
    }

    public function setOrderStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM cafe_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Order not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ORDER_STATUSES, 'status');
            $db->execute('UPDATE cafe_orders SET status = ? WHERE id = ?', [$status, $id]);
            if (in_array($status, ['Ready', 'Served', 'Cancelled'], true)) {
                $db->execute("UPDATE barista_tickets SET status = 'Ready', updated_at = ? WHERE order_id = ? AND status != 'Ready'", [V::now(), $id]);
            }
            $row = $db->first('SELECT * FROM cafe_orders WHERE id = ?', [$id]);
            $row['items'] = V::parseJson($row['items_json'] ?? '', []);
            return ['order' => $row, 'counts' => WorkspaceController::readBadgeCounts($db, (string) $cur['order_day'])];
        }, write: true);
    }

    public function deleteOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $db->execute('DELETE FROM barista_tickets WHERE order_id = ?', [$id]);
            $db->execute('DELETE FROM cafe_orders WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listTickets(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $includeReady = V::bool($input['includeReady'] ?? false);
            $sql = $includeReady
                ? 'SELECT * FROM barista_tickets ORDER BY created_at DESC LIMIT 80'
                : "SELECT * FROM barista_tickets WHERE status != 'Ready' ORDER BY created_at ASC LIMIT 80";
            $rows = $db->query($sql);
            foreach ($rows as &$r) {
                $r['extras'] = V::parseJson($r['extras_json'] ?? '', []);
            }
            return ['tickets' => $rows];
        });
    }

    public function addTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $drink = V::text($input['drink_type'] ?? null, 'drink_type', ['max' => 80, 'label' => 'Drink']);
            $milk = V::oneOf($input['milk'] ?? null, self::MILKS, 'milk', ['fallback' => 'Full cream']);
            $size = V::oneOf($input['size'] ?? null, self::SIZES, 'size', ['fallback' => 'Regular']);
            $shots = V::int($input['shots'] ?? null, 'shots', ['required' => false, 'min' => 0, 'max' => 6, 'fallback' => 2]) ?? 2;
            $extras = V::listOf($input['extras'] ?? null, 'extras', 8, fn ($v) => V::text($v, 'extra', ['max' => 40]));
            $cust = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 80]) ?: 'Counter';
            $orderNum = V::text($input['order_number'] ?? null, 'order_number', ['required' => false, 'max' => 20]) ?: 'MAN';
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 240]);
            $ts = V::now();
            $created = $db->execute(
                "INSERT INTO barista_tickets(order_id, order_number, customer_name, drink_type, milk, size, shots, extras_json, status, barista_name, notes, is_sample, created_at, updated_at) VALUES(NULL, ?, ?, ?, ?, ?, ?, ?, 'Queued', ?, ?, 0, ?, ?)",
                [$orderNum, $cust, $drink, $milk, $size, $shots, json_encode($extras), $ctx['member']['display_name'], $notes, $ts, $ts]
            );
            $row = $db->first('SELECT * FROM barista_tickets WHERE id = ?', [$created['lastInsertRowid']]);
            $row['extras'] = V::parseJson($row['extras_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['ticket' => $row]];
        }, write: true);
    }

    public function advanceTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM barista_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Barista ticket not found.');
            }
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::TICKET_STATUSES, 'status');
            } else {
                $idx = array_search($cur['status'], self::TICKET_STATUSES, true);
                $nextIdx = min(($idx === false ? 0 : $idx) + 1, count(self::TICKET_STATUSES) - 1);
                $nextStatus = self::TICKET_STATUSES[$nextIdx];
            }
            $barista = V::text($input['barista_name'] ?? null, 'barista_name', ['required' => false, 'max' => 80])
                ?: ($cur['barista_name'] ?: $ctx['member']['display_name']);
            $db->execute('UPDATE barista_tickets SET status = ?, barista_name = ?, updated_at = ? WHERE id = ?', [$nextStatus, $barista, V::now(), $id]);

            if (!empty($cur['order_id'])) {
                if ($nextStatus === 'Pulling shots' || $nextStatus === 'Pouring') {
                    $db->execute("UPDATE cafe_orders SET status = 'Making' WHERE id = ? AND status = 'New'", [$cur['order_id']]);
                } elseif ($nextStatus === 'Ready') {
                    $remaining = $db->first("SELECT COUNT(*) AS c FROM barista_tickets WHERE order_id = ? AND status != 'Ready'", [$cur['order_id']]);
                    if ($remaining && (int) $remaining['c'] === 0) {
                        $db->execute("UPDATE cafe_orders SET status = 'Ready' WHERE id = ? AND status IN ('New', 'Making')", [$cur['order_id']]);
                    }
                }
            }
            $row = $db->first('SELECT * FROM barista_tickets WHERE id = ?', [$id]);
            $row['extras'] = V::parseJson($row['extras_json'] ?? '', []);
            return ['ticket' => $row];
        }, write: true);
    }

    public function deleteTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM barista_tickets WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query("SELECT * FROM stock_items ORDER BY CASE status WHEN 'Out' THEN 0 WHEN 'Low' THEN 1 ELSE 2 END, category ASC, item_name ASC");
            return ['items' => $rows];
        });
    }

    public function addStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Stock item']);
            $cat = V::oneOf($input['category'] ?? null, self::STOCK_CATS, 'category', ['fallback' => 'Beans']);
            $qty = V::numVal($input['current_qty'] ?? null, 'current_qty', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => 0]);
            $par = V::numVal($input['par_level'] ?? null, 'par_level', ['required' => false, 'min' => 0.1, 'max' => 100000, 'fallback' => 5]);
            $unit = V::oneOf($input['unit'] ?? null, self::STOCK_UNITS, 'unit', ['fallback' => 'kg']);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $st = self::computeStockStatus($qty, $par);
            $created = $db->execute(
                'INSERT INTO stock_items(item_name, category, current_qty, par_level, unit, status, supplier, last_checked, is_sample) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)',
                [$name, $cat, $qty, $par, $unit, $st, $supplier, V::now()]
            );
            return ['__status' => 201, '__body' => ['item' => $db->first('SELECT * FROM stock_items WHERE id = ?', [$created['lastInsertRowid']])]];
        }, write: true);
    }

    public function saveStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM stock_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Stock item not found.');
            }
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 120, 'label' => 'Stock item']);
            $cat = V::oneOf($input['category'] ?? null, self::STOCK_CATS, 'category', ['fallback' => $cur['category']]);
            $qty = V::numVal($input['current_qty'] ?? null, 'current_qty', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $cur['current_qty']]);
            $par = V::numVal($input['par_level'] ?? null, 'par_level', ['required' => false, 'min' => 0.1, 'max' => 100000, 'fallback' => $cur['par_level']]);
            $unit = V::oneOf($input['unit'] ?? null, self::STOCK_UNITS, 'unit', ['fallback' => $cur['unit']]);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $st = self::computeStockStatus($qty, $par);
            $db->execute(
                'UPDATE stock_items SET item_name = ?, category = ?, current_qty = ?, par_level = ?, unit = ?, status = ?, supplier = ?, last_checked = ? WHERE id = ?',
                [$name, $cat, $qty, $par, $unit, $st, $supplier, V::now(), $id]
            );
            return ['item' => $db->first('SELECT * FROM stock_items WHERE id = ?', [$id])];
        }, write: true);
    }

    public function adjustStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM stock_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Stock item not found.');
            }
            if (V::bool($input['restockToPar'] ?? false)) {
                $nextQty = max((float) $cur['current_qty'], (float) $cur['par_level']);
            } else {
                $delta = V::numVal($input['delta'] ?? null, 'delta', ['min' => -10000, 'max' => 10000]);
                $nextQty = max(0.0, round(((float) $cur['current_qty'] + $delta) * 100.0) / 100.0);
            }
            $st = self::computeStockStatus($nextQty, (float) $cur['par_level']);
            $db->execute('UPDATE stock_items SET current_qty = ?, status = ?, last_checked = ? WHERE id = ?', [$nextQty, $st, V::now(), $id]);
            return ['item' => $db->first('SELECT * FROM stock_items WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteStockItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM stock_items WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

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
            $staffName = V::text($input['staff_name'] ?? null, 'staff_name', ['max' => 100, 'label' => 'Staff name']);
            $role = V::oneOf($input['role'] ?? null, self::SHIFT_ROLES, 'role', ['fallback' => 'Barista']);
            $shiftDate = V::day($input['shift_date'] ?? null, 'shift_date', ['label' => 'Shift date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $station = V::oneOf($input['station'] ?? null, self::SHIFT_STATIONS, 'station', ['fallback' => 'Espresso']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $created = $db->execute(
                'INSERT INTO staff_shifts(staff_name, role, shift_date, start_time, end_time, station, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$staffName, $role, $shiftDate, $startTime, $endTime, $station, $notes, V::now()]
            );
            return ['__status' => 201, '__body' => ['shift' => $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$created['lastInsertRowid']])]];
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
            $staffName = V::text($input['staff_name'] ?? null, 'staff_name', ['max' => 100, 'label' => 'Staff name']);
            $role = V::oneOf($input['role'] ?? null, self::SHIFT_ROLES, 'role', ['fallback' => $cur['role']]);
            $shiftDate = V::day($input['shift_date'] ?? null, 'shift_date', ['label' => 'Shift date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['label' => 'Start time']);
            $endTime = V::timeStr($input['end_time'] ?? null, 'end_time', ['label' => 'End time']);
            $station = V::oneOf($input['station'] ?? null, self::SHIFT_STATIONS, 'station', ['fallback' => $cur['station']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 300]);
            $db->execute(
                'UPDATE staff_shifts SET staff_name = ?, role = ?, shift_date = ?, start_time = ?, end_time = ?, station = ?, notes = ? WHERE id = ?',
                [$staffName, $role, $shiftDate, $startTime, $endTime, $station, $notes, $id]
            );
            return ['shift' => $db->first('SELECT * FROM staff_shifts WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteShift(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM staff_shifts WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listCloses(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query('SELECT * FROM daily_closes ORDER BY close_date DESC, created_at DESC LIMIT 60');
            foreach ($rows as &$r) {
                $r['cleaning'] = V::parseJson($r['cleaning_json'] ?? '', []);
            }
            $todayPos = $db->first(
                "SELECT COALESCE(SUM(total_cents), 0) AS total, COUNT(*) AS orders FROM cafe_orders WHERE order_day = ? AND status != 'Cancelled'",
                [$todayDay]
            );
            return [
                'closes' => $rows,
                'todaySummary' => [
                    'day' => $todayDay,
                    'posCents' => $todayPos ? (int) $todayPos['total'] : 0,
                    'orderCount' => $todayPos ? (int) $todayPos['orders'] : 0,
                ],
            ];
        });
    }

    public function addClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $closeDate = V::day($input['close_date'] ?? null, 'close_date', ['label' => 'Close date']);
            $registerCents = V::moneyCents($input['register_total'] ?? null, 'register_total', ['min' => 0, 'max' => 100000000, 'label' => 'Register total']);
            $tipsCents = V::moneyCents($input['tips'] ?? null, 'tips', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 0, 'label' => 'Tips']);
            $beansUsed = V::numVal($input['beans_used'] ?? null, 'beans_used', ['required' => false, 'min' => 0, 'max' => 5000, 'fallback' => 0]);
            $milkUsed = V::numVal($input['milk_used'] ?? null, 'milk_used', ['required' => false, 'min' => 0, 'max' => 5000, 'fallback' => 0]);
            $waste = V::text($input['waste'] ?? null, 'waste', ['required' => false, 'max' => 600]);
            $notes = V::text($input['manager_notes'] ?? null, 'manager_notes', ['required' => false, 'max' => 1000]);
            $cleaning = V::listOf($input['cleaning'] ?? null, 'cleaning', 20, fn ($v) => V::text($v, 'check', ['max' => 100]));
            $posRow = $db->first("SELECT COALESCE(SUM(total_cents), 0) AS total FROM cafe_orders WHERE order_day = ? AND status != 'Cancelled'", [$closeDate]);
            $posCents = $posRow ? (int) $posRow['total'] : 0;

            $created = $db->execute(
                'INSERT INTO daily_closes(close_date, register_cents, pos_cents, tips_cents, beans_used, milk_used, waste, cleaning_json, manager_notes, closed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$closeDate, $registerCents, $posCents, $tipsCents, $beansUsed, $milkUsed, $waste, json_encode($cleaning), $notes, $ctx['member']['display_name'], V::now()]
            );
            $row = $db->first('SELECT * FROM daily_closes WHERE id = ?', [$created['lastInsertRowid']]);
            $row['cleaning'] = V::parseJson($row['cleaning_json'] ?? '', []);
            return ['__status' => 201, '__body' => ['close' => $row]];
        }, write: true);
    }

    public function deleteClose(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $db->execute('DELETE FROM daily_closes WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }
}
