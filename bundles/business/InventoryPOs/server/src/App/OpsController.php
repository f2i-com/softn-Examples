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
    public const INV_CATS = ['Raw Materials', 'Components', 'Finished Goods', 'Packaging', 'Consumables', 'Accessories'];
    public const INV_TERMS = ['Prepaid', 'Cash on Delivery', 'Net 7', 'Net 15', 'Net 30', 'Net 60'];
    public const INV_PO_STATUSES = ['Draft', 'Ordered', 'Part Received', 'Received', 'Cancelled'];
    public const INV_MOVE_TYPES = ['Received', 'Sold', 'Adjustment', 'Return', 'Damaged'];

    /** @return array<string, mixed>|null */
    public static function enrichProduct(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'unit_cost_cents', 'sell_price_cents', 'stock_on_hand', 'reorder_point', 'is_sample', 'created_at', 'updated_at', 'on_order_qty'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        foreach (['supplier_id', 'supplier_lead_days'] as $nullableInt) {
            if (array_key_exists($nullableInt, $row)) {
                $row[$nullableInt] = ($row[$nullableInt] === null || $row[$nullableInt] === '') ? null : (int) $row[$nullableInt];
            }
        }
        $stock = (int) ($row['stock_on_hand'] ?? 0);
        $reorder = (int) ($row['reorder_point'] ?? 0);
        $cost = (int) ($row['unit_cost_cents'] ?? 0);
        $sell = (int) ($row['sell_price_cents'] ?? 0);
        $row['is_low'] = $stock <= $reorder;
        $row['stock_cost_cents'] = $stock * $cost;
        $row['stock_sell_cents'] = $stock * $sell;
        $row['suggested_order_qty'] = $row['is_low']
            ? max(1, max($reorder * 2, $reorder + 10) - $stock)
            : max(1, $reorder);
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSupplier(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'lead_time_days', 'is_sample', 'created_at', 'sku_count', 'open_po_count', 'total_spend_cents'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizePoLine(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'po_id', 'product_id', 'quantity', 'received_qty', 'unit_cost_cents', 'line_total_cents', 'is_sample'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('current_stock', $row)) {
            $row['current_stock'] = ($row['current_stock'] === null || $row['current_stock'] === '') ? null : (int) $row['current_stock'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizePo(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'supplier_id', 'total_cents', 'is_sample', 'created_at', 'updated_at', 'line_count', 'total_qty', 'received_qty'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('supplier_lead_days', $row)) {
            $row['supplier_lead_days'] = ($row['supplier_lead_days'] === null || $row['supplier_lead_days'] === '') ? null : (int) $row['supplier_lead_days'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeMovement(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'product_id', 'quantity', 'stock_after', 'is_sample', 'created_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('po_id', $row)) {
            $row['po_id'] = ($row['po_id'] === null || $row['po_id'] === '') ? null : (int) $row['po_id'];
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private static function normalizeCategory(array $row): array
    {
        foreach (['skus', 'units', 'cost_cents', 'sell_cents'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function loadPoWithLines(Database $db, int $poId): ?array
    {
        $po = self::normalizePo($db->first(
            'SELECT po.*, s.contact_name AS supplier_contact, s.email AS supplier_email, s.phone AS supplier_phone, s.payment_terms AS supplier_terms, s.lead_time_days AS supplier_lead_days '
            . 'FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?',
            [$poId]
        ));
        if ($po === null) {
            return null;
        }
        $lines = array_map(
            [self::class, 'normalizePoLine'],
            $db->query(
                'SELECT l.*, p.location AS bin_location, p.stock_on_hand AS current_stock '
                . 'FROM po_line_items l LEFT JOIN products p ON p.id = l.product_id WHERE l.po_id = ? ORDER BY l.id ASC',
                [$poId]
            )
        );
        $totalQty = 0;
        $receivedQty = 0;
        foreach ($lines as $ln) {
            $totalQty += (int) ($ln['quantity'] ?? 0);
            $receivedQty += (int) ($ln['received_qty'] ?? 0);
        }
        $po['lines'] = $lines;
        $po['total_qty'] = $totalQty;
        $po['received_qty'] = $receivedQty;
        $po['line_count'] = count($lines);
        return $po;
    }

    /** @return list<array<string, mixed>> */
    private static function validateLines(Database $db, mixed $rawLines): array
    {
        $validated = V::listOf($rawLines, 'lines', 60, function ($line) use ($db): array {
            $arr = is_array($line) ? $line : [];
            $prodId = V::rowId($arr['product_id'] ?? null, 'product_id');
            $prod = $db->first('SELECT id, sku, name, unit_cost_cents FROM products WHERE id = ?', [$prodId]);
            if (!$prod) {
                HttpException::fail(422, 'product_invalid', 'Line item references an unknown product.', 'lines');
            }
            $qty = V::int($arr['quantity'] ?? null, 'quantity', ['min' => 1, 'max' => 1000000, 'label' => 'Line quantity']) ?? 1;
            if (array_key_exists('unit_cost', $arr) && $arr['unit_cost'] !== null && $arr['unit_cost'] !== '') {
                $costCents = V::moneyCents($arr['unit_cost'], 'unit_cost', ['min' => 0, 'max' => 100000000, 'label' => 'Unit cost']);
            } elseif (array_key_exists('unit_cost_cents', $arr) && $arr['unit_cost_cents'] !== null && $arr['unit_cost_cents'] !== '') {
                $costCents = V::int($arr['unit_cost_cents'], 'unit_cost_cents', ['min' => 0, 'max' => 100000000]) ?? 0;
            } else {
                $costCents = (int) $prod['unit_cost_cents'];
            }
            return [
                'product_id' => (int) $prod['id'],
                'sku' => (string) $prod['sku'],
                'product_name' => (string) $prod['name'],
                'quantity' => $qty,
                'unit_cost_cents' => $costCents,
                'line_total_cents' => $qty * $costCents,
            ];
        });
        if (count($validated) === 0) {
            HttpException::fail(422, 'lines_required', 'Add at least one product line item to the purchase order.', 'lines');
        }
        return $validated;
    }

    // ---- Warehouse Command Today ----

    public function getOverview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $counts = WorkspaceController::readBadgeCounts($db);

            $lowStock = array_map(
                [self::class, 'enrichProduct'],
                $db->query(
                    'SELECT p.*, s.lead_time_days AS supplier_lead_days, s.payment_terms AS supplier_terms, '
                    . "(SELECT COALESCE(SUM(l.quantity - l.received_qty), 0) FROM po_line_items l INNER JOIN purchase_orders po ON po.id = l.po_id WHERE l.product_id = p.id AND po.status IN ('Draft', 'Ordered', 'Part Received')) AS on_order_qty "
                    . 'FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id '
                    . 'WHERE p.stock_on_hand <= p.reorder_point ORDER BY (p.stock_on_hand - p.reorder_point) ASC, p.sku ASC LIMIT 40'
                )
            );

            $openPOs = array_map(
                [self::class, 'normalizePo'],
                $db->query(
                    'SELECT po.*, (SELECT COUNT(*) FROM po_line_items l WHERE l.po_id = po.id) AS line_count, '
                    . '(SELECT COALESCE(SUM(l.quantity), 0) FROM po_line_items l WHERE l.po_id = po.id) AS total_qty, '
                    . '(SELECT COALESCE(SUM(l.received_qty), 0) FROM po_line_items l WHERE l.po_id = po.id) AS received_qty '
                    . "FROM purchase_orders po WHERE po.status IN ('Draft', 'Ordered', 'Part Received') "
                    . "ORDER BY CASE po.status WHEN 'Part Received' THEN 0 WHEN 'Ordered' THEN 1 ELSE 2 END, po.expected_date ASC LIMIT 20"
                )
            );

            $recentMovements = array_map(
                [self::class, 'normalizeMovement'],
                $db->query('SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 12')
            );

            $byCategory = array_map(
                [self::class, 'normalizeCategory'],
                $db->query(
                    'SELECT category, COUNT(*) AS skus, COALESCE(SUM(stock_on_hand), 0) AS units, '
                    . 'COALESCE(SUM(stock_on_hand * unit_cost_cents), 0) AS cost_cents, '
                    . 'COALESCE(SUM(stock_on_hand * sell_price_cents), 0) AS sell_cents '
                    . 'FROM products GROUP BY category ORDER BY cost_cents DESC'
                )
            );

            return [
                'today' => $todayDay,
                'counts' => $counts,
                'lowStock' => $lowStock,
                'openPOs' => $openPOs,
                'recentMovements' => $recentMovements,
                'byCategory' => $byCategory,
            ];
        });
    }

    // ---- Products & Stock-on-Hand ----

    public function listProducts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cat = V::text($input['category'] ?? null, 'category', ['required' => false, 'max' => 40]);
            $onlyLow = V::bool($input['low'] ?? false);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 100]);

            $sql = 'SELECT * FROM products WHERE 1=1';
            $params = [];
            if ($cat !== '' && $cat !== 'All') {
                $sql .= ' AND category = ?';
                $params[] = $cat;
            }
            if ($onlyLow) {
                $sql .= ' AND stock_on_hand <= reorder_point';
            }
            if ($supId !== null) {
                $sql .= ' AND supplier_id = ?';
                $params[] = $supId;
            }
            if ($q !== '') {
                $sql .= " AND (sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR supplier_name LIKE ? ESCAPE '\\')";
                $lt = V::likeTerm($q);
                array_push($params, $lt, $lt, $lt, $lt);
            }
            $sql .= ' ORDER BY CASE WHEN stock_on_hand <= reorder_point THEN 0 ELSE 1 END, sku ASC';
            $rows = array_map([self::class, 'enrichProduct'], $db->query($sql, $params));
            return ['products' => $rows, 'counts' => WorkspaceController::readBadgeCounts($db)];
        });
    }

    public function addProduct(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $sku = strtoupper(V::text($input['sku'] ?? null, 'sku', ['max' => 40, 'label' => 'SKU']));
            $dup = $db->first('SELECT id FROM products WHERE UPPER(sku) = ?', [$sku]);
            if ($dup) {
                HttpException::fail(409, 'duplicate_sku', "SKU {$sku} already exists.", 'sku');
            }

            $name = V::text($input['name'] ?? null, 'name', ['max' => 160, 'label' => 'Product name']);
            $cat = V::oneOf($input['category'] ?? null, self::INV_CATS, 'category', ['fallback' => 'Components']);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $supName = '';
            if ($supId !== null) {
                $sup = $db->first('SELECT id, name FROM suppliers WHERE id = ?', [$supId]);
                if (!$sup) {
                    HttpException::fail(422, 'supplier_invalid', 'Selected supplier not found.', 'supplier_id');
                }
                $supName = (string) $sup['name'];
            }
            $unitCost = V::moneyCents($input['unit_cost'] ?? null, 'unit_cost', ['min' => 0, 'max' => 100000000, 'label' => 'Unit cost']);
            $sellPrice = V::moneyCents($input['sell_price'] ?? null, 'sell_price', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0, 'label' => 'Sell price']);
            $stock = V::int($input['stock_on_hand'] ?? null, 'stock_on_hand', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 0]) ?? 0;
            $reorder = V::int($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => 10]) ?? 10;
            $location = V::text($input['location'] ?? null, 'location', ['required' => false, 'max' => 100]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO products(sku, name, category, supplier_id, supplier_name, unit_cost_cents, sell_price_cents, stock_on_hand, reorder_point, location, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$sku, $name, $cat, $supId, $supName, $unitCost, $sellPrice, $stock, $reorder, $location, $ts, $ts]
            );
            $prodId = $created['lastInsertRowid'];

            if ($stock > 0) {
                $db->execute(
                    "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity, stock_after, reason, move_date, po_id, po_number, actor_name, is_sample, created_at) VALUES(?, ?, ?, 'Adjustment', ?, ?, 'Initial stock on SKU creation', ?, NULL, '', ?, 0, ?)",
                    [$prodId, $sku, $name, $stock, $stock, V::utcDay(0), $ctx['member']['display_name'], $ts]
                );
            }
            return [
                '__status' => 201,
                '__body' => ['product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$prodId]))],
            ];
        }, write: true);
    }

    public function saveProduct(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'product_not_found', 'Product not found.');
            }

            $sku = strtoupper(V::text($input['sku'] ?? null, 'sku', ['max' => 40, 'label' => 'SKU']));
            $dup = $db->first('SELECT id FROM products WHERE UPPER(sku) = ? AND id != ?', [$sku, $id]);
            if ($dup) {
                HttpException::fail(409, 'duplicate_sku', "Another product already uses SKU {$sku}.", 'sku');
            }

            $name = V::text($input['name'] ?? null, 'name', ['max' => 160, 'label' => 'Product name']);
            $cat = V::oneOf($input['category'] ?? null, self::INV_CATS, 'category', ['fallback' => $cur['category']]);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $supName = '';
            if ($supId !== null) {
                $sup = $db->first('SELECT id, name FROM suppliers WHERE id = ?', [$supId]);
                if (!$sup) {
                    HttpException::fail(422, 'supplier_invalid', 'Selected supplier not found.', 'supplier_id');
                }
                $supName = (string) $sup['name'];
            }
            $unitCost = (array_key_exists('unit_cost', $input) && $input['unit_cost'] !== null && $input['unit_cost'] !== '')
                ? V::moneyCents($input['unit_cost'], 'unit_cost', ['min' => 0, 'max' => 100000000, 'label' => 'Unit cost'])
                : (int) $cur['unit_cost_cents'];
            $sellPrice = (array_key_exists('sell_price', $input) && $input['sell_price'] !== null && $input['sell_price'] !== '')
                ? V::moneyCents($input['sell_price'], 'sell_price', ['min' => 0, 'max' => 100000000, 'label' => 'Sell price'])
                : (int) $cur['sell_price_cents'];
            $stock = V::int($input['stock_on_hand'] ?? null, 'stock_on_hand', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => (int) $cur['stock_on_hand']]) ?? (int) $cur['stock_on_hand'];
            $reorder = V::int($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0, 'max' => 10000000, 'fallback' => (int) $cur['reorder_point']]) ?? (int) $cur['reorder_point'];
            $location = V::text($input['location'] ?? null, 'location', ['required' => false, 'max' => 100]);

            $db->execute(
                'UPDATE products SET sku = ?, name = ?, category = ?, supplier_id = ?, supplier_name = ?, unit_cost_cents = ?, sell_price_cents = ?, stock_on_hand = ?, reorder_point = ?, location = ?, updated_at = ? WHERE id = ?',
                [$sku, $name, $cat, $supId, $supName, $unitCost, $sellPrice, $stock, $reorder, $location, V::now(), $id]
            );
            return ['product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function adjustStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $prod = $db->first('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$prod) {
                HttpException::fail(404, 'product_not_found', 'Product not found.');
            }

            $moveType = V::oneOf($input['movement_type'] ?? null, self::INV_MOVE_TYPES, 'movement_type', ['fallback' => 'Adjustment']);
            $delta = V::int($input['quantity'] ?? null, 'quantity', ['min' => -1000000, 'max' => 1000000, 'label' => 'Quantity']) ?? 0;
            if ($delta === 0) {
                HttpException::fail(422, 'zero_qty', 'Quantity adjustment cannot be zero.', 'quantity');
            }
            $reason = V::text($input['reason'] ?? null, 'reason', ['required' => false, 'max' => 300]);
            $moveDate = V::day($input['move_date'] ?? null, 'move_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $currentStock = (int) $prod['stock_on_hand'];
            $nextStock = $currentStock + $delta;
            if ($nextStock < 0) {
                HttpException::fail(422, 'insufficient_stock', "Stock cannot drop below 0 (only {$currentStock} on hand).", 'quantity');
            }

            $ts = V::now();
            $db->execute('UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?', [$nextStock, $ts, $id]);
            $mv = $db->execute(
                "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity, stock_after, reason, move_date, po_id, po_number, actor_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, 0, ?)",
                [$id, $prod['sku'], $prod['name'], $moveType, $delta, $nextStock, $reason, $moveDate, $ctx['member']['display_name'], $ts]
            );
            return [
                'product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$id])),
                'movement' => self::normalizeMovement($db->first('SELECT * FROM stock_movements WHERE id = ?', [$mv['lastInsertRowid']])),
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        }, write: true);
    }

    public function deleteProduct(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'product_not_found', 'Product not found.');
            }
            $db->execute('DELETE FROM products WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Suppliers Directory ----

    public function listSuppliers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeSupplier'],
                $db->query(
                    'SELECT s.*, '
                    . '(SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS sku_count, '
                    . "(SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status IN ('Draft', 'Ordered', 'Part Received')) AS open_po_count, "
                    . "(SELECT COALESCE(SUM(po.total_cents), 0) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status != 'Cancelled') AS total_spend_cents "
                    . 'FROM suppliers s ORDER BY s.name ASC'
                )
            );
            return ['suppliers' => $rows];
        });
    }

    public function addSupplier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 140, 'label' => 'Supplier name']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['required' => false, 'max' => 100]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $terms = V::oneOf($input['payment_terms'] ?? null, self::INV_TERMS, 'payment_terms', ['fallback' => 'Net 30']);
            $lead = V::int($input['lead_time_days'] ?? null, 'lead_time_days', ['required' => false, 'min' => 0, 'max' => 365, 'fallback' => 7]) ?? 7;
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $created = $db->execute(
                'INSERT INTO suppliers(name, contact_name, email, phone, payment_terms, lead_time_days, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $contact, $em, $phone, $terms, $lead, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['supplier' => self::normalizeSupplier($db->first('SELECT * FROM suppliers WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveSupplier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM suppliers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'supplier_not_found', 'Supplier not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 140, 'label' => 'Supplier name']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['required' => false, 'max' => 100]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $terms = V::oneOf($input['payment_terms'] ?? null, self::INV_TERMS, 'payment_terms', ['fallback' => $cur['payment_terms']]);
            $lead = V::int($input['lead_time_days'] ?? null, 'lead_time_days', ['required' => false, 'min' => 0, 'max' => 365, 'fallback' => (int) $cur['lead_time_days']]) ?? (int) $cur['lead_time_days'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, payment_terms = ?, lead_time_days = ?, notes = ? WHERE id = ?',
                [$name, $contact, $em, $phone, $terms, $lead, $notes, $id]
            );
            $db->execute('UPDATE products SET supplier_name = ? WHERE supplier_id = ?', [$name, $id]);
            $db->execute('UPDATE purchase_orders SET supplier_name = ? WHERE supplier_id = ?', [$name, $id]);
            return ['supplier' => self::normalizeSupplier($db->first('SELECT * FROM suppliers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteSupplier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM suppliers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'supplier_not_found', 'Supplier not found.');
            }
            $hasPos = $db->first('SELECT COUNT(*) AS c FROM purchase_orders WHERE supplier_id = ?', [$id]);
            if ($hasPos && (int) $hasPos['c'] > 0) {
                HttpException::fail(409, 'supplier_in_use', 'Cannot remove a supplier that has purchase orders on record.');
            }
            $db->execute("UPDATE products SET supplier_id = NULL, supplier_name = '' WHERE supplier_id = ?", [$id]);
            $db->execute('DELETE FROM suppliers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Multi-Line Purchase Orders & Atomic Receiving ----

    public function listPurchaseOrders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $sql =
                'SELECT po.*, (SELECT COUNT(*) FROM po_line_items l WHERE l.po_id = po.id) AS line_count, '
                . '(SELECT COALESCE(SUM(l.quantity), 0) FROM po_line_items l WHERE l.po_id = po.id) AS total_qty, '
                . '(SELECT COALESCE(SUM(l.received_qty), 0) FROM po_line_items l WHERE l.po_id = po.id) AS received_qty '
                . 'FROM purchase_orders po WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND po.status = ?';
                $params[] = $status;
            }
            if ($supId !== null) {
                $sql .= ' AND po.supplier_id = ?';
                $params[] = $supId;
            }
            $sql .= " ORDER BY CASE po.status WHEN 'Part Received' THEN 0 WHEN 'Ordered' THEN 1 WHEN 'Draft' THEN 2 WHEN 'Received' THEN 3 ELSE 4 END, po.order_date DESC, po.id DESC LIMIT 120";
            $rows = array_map([self::class, 'normalizePo'], $db->query($sql, $params));
            return ['orders' => $rows];
        });
    }

    public function getPurchaseOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $po = self::loadPoWithLines($db, $id);
            if ($po === null) {
                HttpException::fail(404, 'po_not_found', 'Purchase order not found.');
            }
            return ['order' => $po];
        });
    }

    public function createPurchaseOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $supId = V::rowId($input['supplier_id'] ?? null, 'supplier_id');
            $sup = $db->first('SELECT * FROM suppliers WHERE id = ?', [$supId]);
            if (!$sup) {
                HttpException::fail(422, 'supplier_invalid', 'Select a valid supplier.', 'supplier_id');
            }

            $orderDate = V::day($input['order_date'] ?? null, 'order_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Order date']);
            $leadDays = ((int) ($sup['lead_time_days'] ?? 0)) ?: 7;
            $expectedDate = V::day($input['expected_date'] ?? null, 'expected_date', [
                'required' => false,
                'fallback' => WorkspaceController::shiftDay($orderDate, $leadDays),
            ]);
            $status = V::oneOf($input['status'] ?? null, ['Draft', 'Ordered'], 'status', ['fallback' => 'Draft']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $lines = self::validateLines($db, $input['lines'] ?? null);

            $poNumber = V::text($input['po_number'] ?? null, 'po_number', ['required' => false, 'max' => 40]);
            if ($poNumber === '') {
                $nextSeq = (int) ($ctx['settings']['po_seq'] ?? 1000) + 1;
                $db->execute('UPDATE business_settings SET po_seq = ? WHERE id = 1', [$nextSeq]);
                $poNumber = 'PO-' . $nextSeq;
            } else {
                $poNumber = strtoupper($poNumber);
                $dup = $db->first('SELECT id FROM purchase_orders WHERE UPPER(po_number) = ?', [$poNumber]);
                if ($dup) {
                    HttpException::fail(409, 'duplicate_po_number', "PO number {$poNumber} already exists.", 'po_number');
                }
            }

            $totalCents = 0;
            foreach ($lines as $ln) {
                $totalCents += $ln['line_total_cents'];
            }
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO purchase_orders(po_number, supplier_id, supplier_name, order_date, expected_date, received_date, status, total_cents, notes, created_by, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, '', ?, ?, ?, ?, 0, ?, ?)",
                [$poNumber, (int) $sup['id'], $sup['name'], $orderDate, $expectedDate, $status, $totalCents, $notes, $ctx['member']['display_name'], $ts, $ts]
            );
            $poId = $created['lastInsertRowid'];

            foreach ($lines as $ln) {
                $db->execute(
                    'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, ?, 0, ?, ?, 0)',
                    [$poId, $ln['product_id'], $ln['sku'], $ln['product_name'], $ln['quantity'], $ln['unit_cost_cents'], $ln['line_total_cents']]
                );
            }

            return [
                '__status' => 201,
                '__body' => [
                    'order' => self::loadPoWithLines($db, $poId),
                    'counts' => WorkspaceController::readBadgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function updatePurchaseOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM purchase_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'po_not_found', 'Purchase order not found.');
            }
            if ($cur['status'] === 'Received' || $cur['status'] === 'Cancelled') {
                HttpException::fail(409, 'po_locked', 'Received or cancelled purchase orders cannot be edited.');
            }

            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]) ?? (int) $cur['supplier_id'];
            $sup = $db->first('SELECT * FROM suppliers WHERE id = ?', [$supId]);
            if (!$sup) {
                HttpException::fail(422, 'supplier_invalid', 'Select a valid supplier.', 'supplier_id');
            }

            $orderDate = V::day($input['order_date'] ?? null, 'order_date', ['required' => false, 'fallback' => (string) $cur['order_date']]);
            $expectedDate = V::day($input['expected_date'] ?? null, 'expected_date', ['required' => false, 'fallback' => (string) $cur['expected_date']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $lines = is_array($input['lines'] ?? null) ? self::validateLines($db, $input['lines']) : null;

            $totalCents = (int) $cur['total_cents'];
            if ($lines !== null) {
                if ($cur['status'] === 'Part Received') {
                    HttpException::fail(409, 'po_part_received', 'Line items cannot be replaced after partial receiving has started.');
                }
                $totalCents = 0;
                $db->execute('DELETE FROM po_line_items WHERE po_id = ?', [$id]);
                foreach ($lines as $ln) {
                    $totalCents += $ln['line_total_cents'];
                    $db->execute(
                        'INSERT INTO po_line_items(po_id, product_id, sku, product_name, quantity, received_qty, unit_cost_cents, line_total_cents, is_sample) VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?)',
                        [$id, $ln['product_id'], $ln['sku'], $ln['product_name'], $ln['quantity'], $ln['unit_cost_cents'], $ln['line_total_cents'], (int) $cur['is_sample']]
                    );
                }
            }

            $db->execute(
                'UPDATE purchase_orders SET supplier_id = ?, supplier_name = ?, order_date = ?, expected_date = ?, total_cents = ?, notes = ?, updated_at = ? WHERE id = ?',
                [(int) $sup['id'], $sup['name'], $orderDate, $expectedDate, $totalCents, $notes, V::now(), $id]
            );
            return ['order' => self::loadPoWithLines($db, $id)];
        }, write: true);
    }

    public function setPurchaseOrderStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM purchase_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'po_not_found', 'Purchase order not found.');
            }
            $next = V::oneOf($input['status'] ?? null, ['Draft', 'Ordered', 'Cancelled'], 'status');
            if ($cur['status'] === 'Received') {
                HttpException::fail(409, 'po_already_received', 'Cannot change status of an already received PO.');
            }
            $db->execute('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?', [$next, V::now(), $id]);
            return [
                'order' => self::loadPoWithLines($db, $id),
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        }, write: true);
    }

    public function receivePurchaseOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $po = $db->first('SELECT * FROM purchase_orders WHERE id = ?', [$id]);
            if (!$po) {
                HttpException::fail(404, 'po_not_found', 'Purchase order not found.');
            }
            if ($po['status'] === 'Received') {
                HttpException::fail(409, 'po_already_received', $po['po_number'] . ' has already been received in full.');
            }
            if ($po['status'] === 'Cancelled') {
                HttpException::fail(409, 'po_cancelled', 'Cancelled purchase orders cannot be received.');
            }

            $lines = $db->query('SELECT * FROM po_line_items WHERE po_id = ? ORDER BY id ASC', [$id]);
            if (count($lines) === 0) {
                HttpException::fail(422, 'po_no_lines', 'This purchase order has no line items to receive.');
            }

            $receiveDate = V::day($input['receive_date'] ?? null, 'receive_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $customMap = null;
            if (is_array($input['lines'] ?? null) && count($input['lines']) > 0) {
                $customMap = [];
                foreach ($input['lines'] as $entry) {
                    $arr = is_array($entry) ? $entry : [];
                    $lid = V::rowId($arr['line_id'] ?? null, 'line_id');
                    $rqty = V::int($arr['receive_qty'] ?? null, 'receive_qty', ['min' => 0, 'max' => 1000000]) ?? 0;
                    $customMap[(string) $lid] = $rqty;
                }
            }

            $ts = V::now();
            $totalUnitsReceivedNow = 0;
            $movementsCreated = [];

            foreach ($lines as $ln) {
                $remaining = max(0, (int) $ln['quantity'] - (int) $ln['received_qty']);
                $lineKey = (string) $ln['id'];
                $qtyNow = $customMap !== null
                    ? (array_key_exists($lineKey, $customMap) ? $customMap[$lineKey] : 0)
                    : $remaining;
                if ($qtyNow > $remaining) {
                    HttpException::fail(
                        422,
                        'over_receive',
                        "Cannot receive {$qtyNow} of {$ln['sku']} — only {$remaining} remaining on {$po['po_number']}."
                    );
                }
                if ($qtyNow <= 0) {
                    continue;
                }

                $newLineRec = (int) $ln['received_qty'] + $qtyNow;
                $db->execute('UPDATE po_line_items SET received_qty = ? WHERE id = ?', [$newLineRec, (int) $ln['id']]);

                // Atomically increment product stock_on_hand + write Purchase Order Received audit entry!
                $prod = $db->first('SELECT * FROM products WHERE id = ?', [(int) $ln['product_id']]);
                $nextStock = $qtyNow;
                if ($prod) {
                    $nextStock = (int) $prod['stock_on_hand'] + $qtyNow;
                    $db->execute('UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?', [$nextStock, $ts, (int) $prod['id']]);
                }
                $mv = $db->execute(
                    "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity, stock_after, reason, move_date, po_id, po_number, actor_name, is_sample, created_at) VALUES(?, ?, ?, 'Received', ?, ?, ?, ?, ?, ?, ?, 0, ?)",
                    [
                        (int) $ln['product_id'],
                        $ln['sku'],
                        $ln['product_name'],
                        $qtyNow,
                        $nextStock,
                        'Purchase Order Received (' . $po['po_number'] . ')',
                        $receiveDate,
                        (int) $po['id'],
                        $po['po_number'],
                        $ctx['member']['display_name'],
                        $ts,
                    ]
                );
                $movementsCreated[] = $mv['lastInsertRowid'];
                $totalUnitsReceivedNow += $qtyNow;
            }

            if ($totalUnitsReceivedNow === 0) {
                HttpException::fail(422, 'nothing_received', 'Specify at least 1 unit to receive.');
            }

            $checkLines = $db->query('SELECT quantity, received_qty FROM po_line_items WHERE po_id = ?', [$id]);
            $allDone = true;
            foreach ($checkLines as $cl) {
                if ((int) $cl['received_qty'] < (int) $cl['quantity']) {
                    $allDone = false;
                    break;
                }
            }
            $finalStatus = $allDone ? 'Received' : 'Part Received';
            $db->execute(
                'UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = ? WHERE id = ?',
                [$finalStatus, $allDone ? $receiveDate : $po['received_date'], $ts, $id]
            );

            return [
                'order' => self::loadPoWithLines($db, $id),
                'unitsReceived' => $totalUnitsReceivedNow,
                'movementsCreated' => count($movementsCreated),
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        }, write: true);
    }

    public function deletePurchaseOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM purchase_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'po_not_found', 'Purchase order not found.');
            }
            if ($cur['status'] === 'Received' || $cur['status'] === 'Part Received') {
                HttpException::fail(409, 'po_received_delete', 'Received purchase orders are part of the stock audit trail and cannot be deleted.');
            }
            $db->execute('DELETE FROM po_line_items WHERE po_id = ?', [$id]);
            $db->execute('DELETE FROM purchase_orders WHERE id = ?', [$id]);
            return ['deleted' => true, 'counts' => WorkspaceController::readBadgeCounts($db)];
        }, write: true);
    }

    // ---- Stock Movements Audit Ledger ----

    public function listMovements(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $moveType = V::text($input['movement_type'] ?? null, 'movement_type', ['required' => false, 'max' => 30]);
            $prodId = V::int($input['product_id'] ?? null, 'product_id', ['required' => false, 'min' => 1]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 100]);
            $sql = 'SELECT * FROM stock_movements WHERE 1=1';
            $params = [];
            if ($moveType !== '' && $moveType !== 'All') {
                $sql .= ' AND movement_type = ?';
                $params[] = $moveType;
            }
            if ($prodId !== null) {
                $sql .= ' AND product_id = ?';
                $params[] = $prodId;
            }
            if ($q !== '') {
                $sql .= " AND (sku LIKE ? ESCAPE '\\' OR product_name LIKE ? ESCAPE '\\' OR reason LIKE ? ESCAPE '\\' OR po_number LIKE ? ESCAPE '\\')";
                $lt = V::likeTerm($q);
                array_push($params, $lt, $lt, $lt, $lt);
            }
            $sql .= ' ORDER BY move_date DESC, created_at DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeMovement'], $db->query($sql, $params));
            return ['movements' => $rows];
        });
    }

    public function addMovement(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $prodId = V::rowId($input['product_id'] ?? null, 'product_id');
            $prod = $db->first('SELECT * FROM products WHERE id = ?', [$prodId]);
            if (!$prod) {
                HttpException::fail(404, 'product_not_found', 'Product not found.');
            }

            $moveType = V::oneOf($input['movement_type'] ?? null, self::INV_MOVE_TYPES, 'movement_type', ['fallback' => 'Adjustment']);
            $qty = V::int($input['quantity'] ?? null, 'quantity', ['min' => -1000000, 'max' => 1000000, 'label' => 'Quantity']) ?? 0;
            if ($qty === 0) {
                HttpException::fail(422, 'zero_qty', 'Quantity cannot be zero.', 'quantity');
            }
            $reason = V::text($input['reason'] ?? null, 'reason', ['required' => false, 'max' => 300]);
            $moveDate = V::day($input['move_date'] ?? null, 'move_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $currentStock = (int) $prod['stock_on_hand'];
            $nextStock = $currentStock + $qty;
            if ($nextStock < 0) {
                HttpException::fail(422, 'insufficient_stock', "Cannot reduce stock below 0 (currently {$currentStock}).", 'quantity');
            }

            $ts = V::now();
            $db->execute('UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?', [$nextStock, $ts, $prodId]);
            $created = $db->execute(
                "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity, stock_after, reason, move_date, po_id, po_number, actor_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, 0, ?)",
                [$prodId, $prod['sku'], $prod['name'], $moveType, $qty, $nextStock, $reason, $moveDate, $ctx['member']['display_name'], $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'movement' => self::normalizeMovement($db->first('SELECT * FROM stock_movements WHERE id = ?', [$created['lastInsertRowid']])),
                    'product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$prodId])),
                ],
            ];
        }, write: true);
    }
}
