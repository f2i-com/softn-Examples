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
    private const PAY_TERMS = ['Prepaid', 'COD', 'Net 7', 'Net 30', 'Net 60'];
    private const CATEGORIES = ['Apparel', 'Homewares', 'Gifts', 'Stationery', 'Jewellery', 'Seasonal'];
    private const PROD_STATUSES = ['Active', 'Low stock', 'Discontinued'];
    private const MOVE_TYPES = ['Sale adjustment', 'Delivery', 'Return', 'Damage', 'Stock count'];
    private const TASK_ROUTINES = ['Opening', 'Merchandising', 'Stocktake', 'Closing'];
    private const TASK_AREAS = ['Floor', 'Stockroom', 'Display', 'Admin', 'Online'];
    private const PRIORITIES = ['Low', 'Medium', 'High'];
    private const TASK_STATUSES = ['To do', 'Doing', 'Done', 'Blocked'];
    private const STAFF_ROLES = ['Store manager', 'Sales assistant', 'Visual merchandiser', 'Online orders'];
    private const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    private const ISSUE_TYPES = ['Return', 'Exchange', 'Fault', 'Complaint'];
    private const RES_TYPES = ['Refund', 'Exchange', 'Store credit', 'Pending'];
    private const RET_STATUSES = ['Open', 'Processing', 'Resolved', 'Declined'];

    private static function computeProductStatus(int $currentStock, int $reorderPoint, string $requestedStatus): string
    {
        if ($requestedStatus === 'Discontinued') {
            return 'Discontinued';
        }
        return $currentStock <= $reorderPoint ? 'Low stock' : 'Active';
    }

    /** @return array<string, mixed>|null */
    private static function enrichProduct(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $cost = (int) ($row['cost_cents'] ?? 0);
        $retail = (int) ($row['retail_cents'] ?? 0);
        $stock = (int) ($row['current_stock'] ?? 0);
        $reorder = (int) ($row['reorder_point'] ?? 0);

        $row['id'] = (int) $row['id'];
        $row['supplier_id'] = isset($row['supplier_id']) && $row['supplier_id'] !== null && $row['supplier_id'] !== ''
            ? (int) $row['supplier_id']
            : null;
        $row['cost_cents'] = $cost;
        $row['retail_cents'] = $retail;
        $row['current_stock'] = $stock;
        $row['reorder_point'] = $reorder;
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        if (array_key_exists('supplier_lead_days', $row) && $row['supplier_lead_days'] !== null && $row['supplier_lead_days'] !== '') {
            $row['supplier_lead_days'] = (int) $row['supplier_lead_days'];
        }

        $row['margin_cents'] = $retail - $cost;
        $row['margin_pct'] = $retail > 0 ? round((($retail - $cost) / $retail) * 1000.0) / 10.0 : 0.0;
        $row['stock_cost_cents'] = $stock * $cost;
        $row['stock_retail_cents'] = $stock * $retail;
        $row['is_low'] = ($row['status'] ?? '') !== 'Discontinued' && $stock <= $reorder;
        $row['suggested_reorder'] = $row['is_low'] ? max(1, max($reorder * 2, $reorder + 4) - $stock) : 0;
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSupplier(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['lead_time_days'] = (int) ($row['lead_time_days'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        if (array_key_exists('sku_count', $row)) {
            $row['sku_count'] = (int) $row['sku_count'];
        }
        if (array_key_exists('low_sku_count', $row)) {
            $row['low_sku_count'] = (int) $row['low_sku_count'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeMovement(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['product_id'] = (int) $row['product_id'];
        $row['quantity_change'] = (int) ($row['quantity_change'] ?? 0);
        $row['stock_after'] = (int) ($row['stock_after'] ?? 0);
        $row['staff_id'] = isset($row['staff_id']) && $row['staff_id'] !== null && $row['staff_id'] !== ''
            ? (int) $row['staff_id']
            : null;
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTask(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['assigned_staff_id'] = isset($row['assigned_staff_id']) && $row['assigned_staff_id'] !== null && $row['assigned_staff_id'] !== ''
            ? (int) $row['assigned_staff_id']
            : null;
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeStaff(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $days = V::parseJson($row['usual_days_json'] ?? '', []);
        $row['usual_days'] = is_array($days) ? $days : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeReturn(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['product_id'] = isset($row['product_id']) && $row['product_id'] !== null && $row['product_id'] !== ''
            ? (int) $row['product_id']
            : null;
        $row['amount_cents'] = (int) ($row['amount_cents'] ?? 0);
        $row['restocked'] = (int) ($row['restocked'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    // ---- Store Ops Command Overview ----

    public function getOverview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $counts = WorkspaceController::readBadgeCounts($db, $todayDay);

            $lowStock = $db->query(
                "SELECT p.*, s.contact_person AS supplier_contact, s.email AS supplier_email, s.phone AS supplier_phone, s.lead_time_days AS supplier_lead_days "
                . "FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id "
                . "WHERE p.status != 'Discontinued' AND p.current_stock <= p.reorder_point "
                . "ORDER BY p.current_stock ASC, p.product_name ASC LIMIT 30"
            );
            foreach ($lowStock as &$item) {
                $item = self::enrichProduct($item);
            }
            unset($item);

            $tasks = $db->query(
                "SELECT * FROM store_tasks WHERE status != 'Done' "
                . "ORDER BY CASE WHEN due_date != '' AND due_date < ? THEN 0 WHEN due_date = ? THEN 1 ELSE 2 END, "
                . "CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, due_date ASC LIMIT 20",
                [$todayDay, $todayDay]
            );
            foreach ($tasks as &$tk) {
                $tk = self::normalizeTask($tk);
            }
            unset($tk);

            $openReturns = $db->query(
                "SELECT * FROM returns_issues WHERE status IN ('Open', 'Processing') ORDER BY issue_date DESC, created_at DESC LIMIT 15"
            );
            foreach ($openReturns as &$rt) {
                $rt = self::normalizeReturn($rt);
            }
            unset($rt);

            $recentMovements = $db->query(
                'SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 12'
            );
            foreach ($recentMovements as &$mv) {
                $mv = self::normalizeMovement($mv);
            }
            unset($mv);

            $catBreakdown = $db->query(
                "SELECT category, COUNT(*) AS skus, COALESCE(SUM(current_stock), 0) AS units, "
                . "COALESCE(SUM(current_stock * cost_cents), 0) AS cost_cents, COALESCE(SUM(current_stock * retail_cents), 0) AS retail_cents "
                . "FROM products WHERE status != 'Discontinued' GROUP BY category ORDER BY retail_cents DESC"
            );
            foreach ($catBreakdown as &$cat) {
                $rVal = (int) ($cat['retail_cents'] ?? 0);
                $cVal = (int) ($cat['cost_cents'] ?? 0);
                $cat['skus'] = (int) ($cat['skus'] ?? 0);
                $cat['units'] = (int) ($cat['units'] ?? 0);
                $cat['cost_cents'] = $cVal;
                $cat['retail_cents'] = $rVal;
                $cat['margin_pct'] = $rVal > 0 ? round((($rVal - $cVal) / $rVal) * 1000.0) / 10.0 : 0.0;
            }
            unset($cat);

            return [
                'today' => $todayDay,
                'counts' => $counts,
                'lowStock' => $lowStock,
                'tasks' => $tasks,
                'openReturns' => $openReturns,
                'recentMovements' => $recentMovements,
                'categoryValuation' => $catBreakdown,
            ];
        });
    }

    // ---- Suppliers ----

    public function listSuppliers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT s.*, "
                . "(SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status != 'Discontinued') AS sku_count, "
                . "(SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status != 'Discontinued' AND p.current_stock <= p.reorder_point) AS low_sku_count "
                . "FROM suppliers s ORDER BY s.supplier_name ASC"
            );
            foreach ($rows as &$r) {
                $r = self::normalizeSupplier($r);
            }
            return ['suppliers' => $rows];
        });
    }

    public function addSupplier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['supplier_name'] ?? null, 'supplier_name', ['max' => 140, 'label' => 'Supplier name']);
            $contact = V::text($input['contact_person'] ?? null, 'contact_person', ['required' => false, 'max' => 100]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $website = V::text($input['website'] ?? null, 'website', ['required' => false, 'max' => 200]);
            $lead = V::int($input['lead_time_days'] ?? null, 'lead_time_days', ['required' => false, 'min' => 0, 'max' => 365, 'fallback' => 7]) ?? 7;
            $terms = V::oneOf($input['payment_terms'] ?? null, self::PAY_TERMS, 'payment_terms', ['fallback' => 'Net 30']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $created = $db->execute(
                'INSERT INTO suppliers(supplier_name, contact_person, email, phone, website, lead_time_days, payment_terms, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $contact, $em, $phone, $website, $lead, $terms, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'supplier' => self::normalizeSupplier($db->first('SELECT * FROM suppliers WHERE id = ?', [$created['lastInsertRowid']])),
                ],
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
            $name = V::text($input['supplier_name'] ?? null, 'supplier_name', ['max' => 140, 'label' => 'Supplier name']);
            $contact = V::text($input['contact_person'] ?? null, 'contact_person', ['required' => false, 'max' => 100]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $website = V::text($input['website'] ?? null, 'website', ['required' => false, 'max' => 200]);
            $lead = V::int($input['lead_time_days'] ?? null, 'lead_time_days', ['required' => false, 'min' => 0, 'max' => 365, 'fallback' => (int) $cur['lead_time_days']]) ?? (int) $cur['lead_time_days'];
            $terms = V::oneOf($input['payment_terms'] ?? null, self::PAY_TERMS, 'payment_terms', ['fallback' => $cur['payment_terms']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE suppliers SET supplier_name = ?, contact_person = ?, email = ?, phone = ?, website = ?, lead_time_days = ?, payment_terms = ?, notes = ? WHERE id = ?',
                [$name, $contact, $em, $phone, $website, $lead, $terms, $notes, $id]
            );
            $db->execute('UPDATE products SET supplier_name = ? WHERE supplier_id = ?', [$name, $id]);
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
            $db->execute('UPDATE products SET supplier_id = NULL WHERE supplier_id = ?', [$id]);
            $db->execute('DELETE FROM suppliers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Products & Atomic Quick Stock Adjustment ----

    public function listProducts(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cat = V::text($input['category'] ?? null, 'category', ['required' => false, 'max' => 40]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 100]);

            $sql = 'SELECT * FROM products WHERE 1=1';
            $params = [];
            if ($cat !== '' && $cat !== 'All') {
                $sql .= ' AND category = ?';
                $params[] = $cat;
            }
            if ($status === 'Low stock') {
                $sql .= " AND status != 'Discontinued' AND current_stock <= reorder_point";
            } elseif ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            if ($supId !== null) {
                $sql .= ' AND supplier_id = ?';
                $params[] = $supId;
            }
            if ($q !== '') {
                $sql .= " AND (sku LIKE ? ESCAPE '\\' OR product_name LIKE ? ESCAPE '\\' OR supplier_name LIKE ? ESCAPE '\\')";
                $lt = V::likeTerm($q);
                $params[] = $lt;
                $params[] = $lt;
                $params[] = $lt;
            }
            $sql .= " ORDER BY CASE WHEN status = 'Discontinued' THEN 2 WHEN current_stock <= reorder_point THEN 0 ELSE 1 END, product_name ASC";
            $rows = $db->query($sql, $params);

            $costTotal = 0;
            $retailTotal = 0;
            $unitsTotal = 0;
            foreach ($rows as &$r) {
                $r = self::enrichProduct($r);
                if (($r['status'] ?? '') !== 'Discontinued') {
                    $costTotal += $r['stock_cost_cents'];
                    $retailTotal += $r['stock_retail_cents'];
                    $unitsTotal += $r['current_stock'];
                }
            }
            unset($r);

            $avgMargin = $retailTotal > 0 ? round((($retailTotal - $costTotal) / $retailTotal) * 1000.0) / 10.0 : 0.0;
            return [
                'products' => $rows,
                'valuation' => [
                    'units' => $unitsTotal,
                    'cost_cents' => $costTotal,
                    'retail_cents' => $retailTotal,
                    'margin_pct' => $avgMargin,
                ],
            ];
        });
    }

    public function addProduct(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $sku = strtoupper(V::text($input['sku'] ?? null, 'sku', ['max' => 40, 'label' => 'SKU']));
            $dup = $db->first('SELECT id FROM products WHERE UPPER(sku) = ?', [$sku]);
            if ($dup) {
                HttpException::fail(409, 'duplicate_sku', "A product with SKU {$sku} already exists.", 'sku');
            }

            $name = V::text($input['product_name'] ?? null, 'product_name', ['max' => 160, 'label' => 'Product name']);
            $cat = V::oneOf($input['category'] ?? null, self::CATEGORIES, 'category', ['fallback' => 'Homewares']);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $supName = V::text($input['supplier_name'] ?? null, 'supplier_name', ['required' => false, 'max' => 140]);
            if ($supId !== null) {
                $sup = $db->first('SELECT id, supplier_name FROM suppliers WHERE id = ?', [$supId]);
                if (!$sup) {
                    HttpException::fail(422, 'supplier_invalid', 'Selected supplier does not exist.', 'supplier_id');
                }
                $supName = (string) $sup['supplier_name'];
            }
            $costCents = V::moneyCents($input['cost_price'] ?? null, 'cost_price', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0, 'label' => 'Cost price']);
            $retailCents = V::moneyCents($input['retail_price'] ?? null, 'retail_price', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0, 'label' => 'Retail price']);
            $stock = V::int($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => 0]) ?? 0;
            $reorder = V::int($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => 5]) ?? 5;
            $reqStatus = V::oneOf($input['status'] ?? null, self::PROD_STATUSES, 'status', ['fallback' => 'Active']);
            $finalStatus = self::computeProductStatus($stock, $reorder, $reqStatus);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO products(sku, product_name, category, supplier_id, supplier_name, cost_cents, retail_cents, current_stock, reorder_point, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$sku, $name, $cat, $supId, $supName, $costCents, $retailCents, $stock, $reorder, $finalStatus, $notes, $ts, $ts]
            );
            $prodId = $created['lastInsertRowid'];

            if ($stock > 0) {
                $db->execute(
                    "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, 'Stock count', ?, ?, 'Opening stock on product creation', ?, NULL, ?, 'INIT', 0, ?)",
                    [$prodId, $sku, $name, $stock, $stock, V::utcDay(0), $ctx['member']['display_name'], $ts]
                );
            }

            $row = self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$prodId]));
            return ['__status' => 201, '__body' => ['product' => $row]];
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

            $name = V::text($input['product_name'] ?? null, 'product_name', ['max' => 160, 'label' => 'Product name']);
            $cat = V::oneOf($input['category'] ?? null, self::CATEGORIES, 'category', ['fallback' => $cur['category']]);
            $supId = V::int($input['supplier_id'] ?? null, 'supplier_id', ['required' => false, 'min' => 1]);
            $supName = V::text($input['supplier_name'] ?? null, 'supplier_name', ['required' => false, 'max' => 140]);
            if ($supId !== null) {
                $sup = $db->first('SELECT id, supplier_name FROM suppliers WHERE id = ?', [$supId]);
                if (!$sup) {
                    HttpException::fail(422, 'supplier_invalid', 'Selected supplier does not exist.', 'supplier_id');
                }
                $supName = (string) $sup['supplier_name'];
            } elseif ($supName === '') {
                $supName = '';
            }
            $costCents = (array_key_exists('cost_price', $input) && $input['cost_price'] !== null && $input['cost_price'] !== '')
                ? V::moneyCents($input['cost_price'], 'cost_price', ['min' => 0, 'max' => 50000000, 'label' => 'Cost price'])
                : (int) $cur['cost_cents'];
            $retailCents = (array_key_exists('retail_price', $input) && $input['retail_price'] !== null && $input['retail_price'] !== '')
                ? V::moneyCents($input['retail_price'], 'retail_price', ['min' => 0, 'max' => 50000000, 'label' => 'Retail price'])
                : (int) $cur['retail_cents'];
            $stock = V::int($input['current_stock'] ?? null, 'current_stock', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => (int) $cur['current_stock']]) ?? (int) $cur['current_stock'];
            $reorder = V::int($input['reorder_point'] ?? null, 'reorder_point', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => (int) $cur['reorder_point']]) ?? (int) $cur['reorder_point'];
            $reqStatus = V::oneOf($input['status'] ?? null, self::PROD_STATUSES, 'status', ['fallback' => $cur['status']]);
            $finalStatus = self::computeProductStatus($stock, $reorder, $reqStatus);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE products SET sku = ?, product_name = ?, category = ?, supplier_id = ?, supplier_name = ?, cost_cents = ?, retail_cents = ?, current_stock = ?, reorder_point = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$sku, $name, $cat, $supId, $supName, $costCents, $retailCents, $stock, $reorder, $finalStatus, $notes, V::now(), $id]
            );
            return ['product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function adjustProductStock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $prod = $db->first('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$prod) {
                HttpException::fail(404, 'product_not_found', 'Product not found.');
            }

            $moveType = V::oneOf($input['movement_type'] ?? null, self::MOVE_TYPES, 'movement_type', ['fallback' => 'Sale adjustment']);
            $moveDate = V::day($input['move_date'] ?? null, 'move_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $reason = V::text($input['reason'] ?? null, 'reason', ['required' => false, 'max' => 400]);
            $reference = V::text($input['reference'] ?? null, 'reference', ['required' => false, 'max' => 80]);
            $staffId = V::int($input['staff_id'] ?? null, 'staff_id', ['required' => false, 'min' => 1]);
            $staffName = (string) $ctx['member']['display_name'];
            if ($staffId !== null) {
                $stf = $db->first('SELECT name FROM staff_roster WHERE id = ?', [$staffId]);
                if ($stf) {
                    $staffName = (string) $stf['name'];
                }
            }

            $current = (int) $prod['current_stock'];
            if (array_key_exists('set_stock', $input) && $input['set_stock'] !== null && $input['set_stock'] !== '') {
                $nextStock = V::int($input['set_stock'], 'set_stock', ['min' => 0, 'max' => 1000000, 'label' => 'Counted stock']) ?? 0;
                $delta = $nextStock - $current;
                $moveType = 'Stock count';
            } else {
                $delta = V::int($input['quantity_change'] ?? null, 'quantity_change', ['min' => -100000, 'max' => 100000, 'label' => 'Quantity change']) ?? 0;
                if ($delta === 0) {
                    HttpException::fail(422, 'zero_delta', 'Quantity change cannot be zero.', 'quantity_change');
                }
                $nextStock = $current + $delta;
                if ($nextStock < 0) {
                    HttpException::fail(422, 'insufficient_stock', "Cannot reduce stock below 0 (only {$current} on hand).", 'quantity_change');
                }
            }

            $nextStatus = self::computeProductStatus($nextStock, (int) $prod['reorder_point'], (string) $prod['status']);
            $ts = V::now();

            // Atomic update of product stock + audit ledger entry in the same write transaction
            $db->execute(
                'UPDATE products SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?',
                [$nextStock, $nextStatus, $ts, $id]
            );
            $mvRes = $db->execute(
                'INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$id, $prod['sku'], $prod['product_name'], $moveType, $delta, $nextStock, $reason, $moveDate, $staffId, $staffName, $reference, $ts]
            );

            return [
                'product' => self::enrichProduct($db->first('SELECT * FROM products WHERE id = ?', [$id])),
                'movement' => self::normalizeMovement($db->first('SELECT * FROM stock_movements WHERE id = ?', [$mvRes['lastInsertRowid']])),
                'counts' => WorkspaceController::readBadgeCounts($db, $moveDate),
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

    // ---- Stock Movements Ledger ----

    public function listMovements(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $moveType = V::text($input['movement_type'] ?? null, 'movement_type', ['required' => false, 'max' => 40]);
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
                $sql .= " AND (sku LIKE ? ESCAPE '\\' OR product_name LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR reason LIKE ? ESCAPE '\\')";
                $lt = V::likeTerm($q);
                $params[] = $lt;
                $params[] = $lt;
                $params[] = $lt;
                $params[] = $lt;
            }
            $sql .= ' ORDER BY move_date DESC, created_at DESC LIMIT 200';
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r = self::normalizeMovement($r);
            }
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

            $moveType = V::oneOf($input['movement_type'] ?? null, self::MOVE_TYPES, 'movement_type', ['fallback' => 'Delivery']);
            $delta = V::int($input['quantity_change'] ?? null, 'quantity_change', ['min' => -100000, 'max' => 100000, 'label' => 'Quantity change']) ?? 0;
            if ($delta === 0) {
                HttpException::fail(422, 'zero_delta', 'Quantity change cannot be zero.', 'quantity_change');
            }
            $moveDate = V::day($input['move_date'] ?? null, 'move_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Date']);
            $reason = V::text($input['reason'] ?? null, 'reason', ['required' => false, 'max' => 400]);
            $reference = V::text($input['reference'] ?? null, 'reference', ['required' => false, 'max' => 80]);
            $staffId = V::int($input['staff_id'] ?? null, 'staff_id', ['required' => false, 'min' => 1]);
            $staffName = (string) $ctx['member']['display_name'];
            if ($staffId !== null) {
                $stf = $db->first('SELECT name FROM staff_roster WHERE id = ?', [$staffId]);
                if ($stf) {
                    $staffName = (string) $stf['name'];
                }
            }

            $current = (int) $prod['current_stock'];
            $nextStock = $current + $delta;
            if ($nextStock < 0) {
                HttpException::fail(422, 'insufficient_stock', "Cannot reduce stock below 0 (currently {$current}).", 'quantity_change');
            }

            $nextStatus = self::computeProductStatus($nextStock, (int) $prod['reorder_point'], (string) $prod['status']);
            $ts = V::now();
            $db->execute('UPDATE products SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?', [$nextStock, $nextStatus, $ts, $prodId]);
            $created = $db->execute(
                'INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$prodId, $prod['sku'], $prod['product_name'], $moveType, $delta, $nextStock, $reason, $moveDate, $staffId, $staffName, $reference, $ts]
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

    public function deleteMovement(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM stock_movements WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'movement_not_found', 'Movement entry not found.');
            }
            $db->execute('DELETE FROM stock_movements WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Store Floor Tasks ----

    public function listTasks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $routine = V::text($input['routine'] ?? null, 'routine', ['required' => false, 'max' => 30]);
            $area = V::text($input['area'] ?? null, 'area', ['required' => false, 'max' => 30]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);

            $sql = 'SELECT * FROM store_tasks WHERE 1=1';
            $params = [];
            if ($routine !== '' && $routine !== 'All') {
                $sql .= ' AND routine = ?';
                $params[] = $routine;
            }
            if ($area !== '' && $area !== 'All') {
                $sql .= ' AND area = ?';
                $params[] = $area;
            }
            if ($status === 'Open') {
                $sql .= " AND status != 'Done'";
            } elseif ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE status WHEN 'Done' THEN 2 WHEN 'Blocked' THEN 0 ELSE 1 END, CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, due_date ASC, created_at DESC";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r = self::normalizeTask($r);
            }
            return ['tasks' => $rows];
        });
    }

    public function addTask(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $title = V::text($input['task_title'] ?? null, 'task_title', ['max' => 180, 'label' => 'Task title']);
            $routine = V::oneOf($input['routine'] ?? null, self::TASK_ROUTINES, 'routine', ['fallback' => 'Merchandising']);
            $area = V::oneOf($input['area'] ?? null, self::TASK_AREAS, 'area', ['fallback' => 'Floor']);
            $prio = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => 'Medium']);
            $staffId = V::int($input['assigned_staff_id'] ?? null, 'assigned_staff_id', ['required' => false, 'min' => 1]);
            $assignedName = V::text($input['assigned_name'] ?? null, 'assigned_name', ['required' => false, 'max' => 100]);
            if ($staffId !== null) {
                $stf = $db->first('SELECT name FROM staff_roster WHERE id = ?', [$staffId]);
                if ($stf) {
                    $assignedName = (string) $stf['name'];
                }
            }
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $status = V::oneOf($input['status'] ?? null, self::TASK_STATUSES, 'status', ['fallback' => 'To do']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO store_tasks(task_title, routine, area, priority, assigned_staff_id, assigned_name, due_date, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$title, $routine, $area, $prio, $staffId, $assignedName, $dueDate, $status, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['task' => self::normalizeTask($db->first('SELECT * FROM store_tasks WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveTask(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM store_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'task_not_found', 'Store task not found.');
            }
            $title = V::text($input['task_title'] ?? null, 'task_title', ['max' => 180, 'label' => 'Task title']);
            $routine = V::oneOf($input['routine'] ?? null, self::TASK_ROUTINES, 'routine', ['fallback' => $cur['routine']]);
            $area = V::oneOf($input['area'] ?? null, self::TASK_AREAS, 'area', ['fallback' => $cur['area']]);
            $prio = V::oneOf($input['priority'] ?? null, self::PRIORITIES, 'priority', ['fallback' => $cur['priority']]);
            $staffId = V::int($input['assigned_staff_id'] ?? null, 'assigned_staff_id', ['required' => false, 'min' => 1]);
            $assignedName = V::text($input['assigned_name'] ?? null, 'assigned_name', ['required' => false, 'max' => 100]);
            if ($staffId !== null) {
                $stf = $db->first('SELECT name FROM staff_roster WHERE id = ?', [$staffId]);
                if ($stf) {
                    $assignedName = (string) $stf['name'];
                }
            }
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $status = V::oneOf($input['status'] ?? null, self::TASK_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE store_tasks SET task_title = ?, routine = ?, area = ?, priority = ?, assigned_staff_id = ?, assigned_name = ?, due_date = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$title, $routine, $area, $prio, $staffId, $assignedName, $dueDate, $status, $notes, V::now(), $id]
            );
            return ['task' => self::normalizeTask($db->first('SELECT * FROM store_tasks WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setTaskStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM store_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'task_not_found', 'Store task not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::TASK_STATUSES, 'status');
            $db->execute('UPDATE store_tasks SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['task' => self::normalizeTask($db->first('SELECT * FROM store_tasks WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTask(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM store_tasks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'task_not_found', 'Store task not found.');
            }
            $db->execute('DELETE FROM store_tasks WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Staff Roster ----

    public function listStaff(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query("SELECT * FROM staff_roster ORDER BY CASE active WHEN 'Active' THEN 0 ELSE 1 END, name ASC");
            foreach ($rows as &$r) {
                $r = self::normalizeStaff($r);
            }
            return ['staff' => $rows];
        });
    }

    public function addStaffMember(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Name']);
            $role = V::oneOf($input['role'] ?? null, self::STAFF_ROLES, 'role', ['fallback' => 'Sales assistant']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $days = V::listOf($input['usual_days'] ?? null, 'usual_days', 7, fn ($d) => V::oneOf($d, self::WEEKDAYS, 'usual_days'));
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => 'Active']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $created = $db->execute(
                'INSERT INTO staff_roster(name, role, phone, email, usual_days_json, active, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $role, $phone, $em, json_encode($days, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $active, $notes, V::now()]
            );
            $row = self::normalizeStaff($db->first('SELECT * FROM staff_roster WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['staff' => $row]];
        }, write: true);
    }

    public function saveStaffMember(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM staff_roster WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'staff_not_found', 'Staff member not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Name']);
            $role = V::oneOf($input['role'] ?? null, self::STAFF_ROLES, 'role', ['fallback' => $cur['role']]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $days = is_array($input['usual_days'] ?? null)
                ? V::listOf($input['usual_days'], 'usual_days', 7, fn ($d) => V::oneOf($d, self::WEEKDAYS, 'usual_days'))
                : V::parseJson($cur['usual_days_json'] ?? '', []);
            $active = V::oneOf($input['active'] ?? null, ['Active', 'Inactive'], 'active', ['fallback' => $cur['active']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 400]);

            $db->execute(
                'UPDATE staff_roster SET name = ?, role = ?, phone = ?, email = ?, usual_days_json = ?, active = ?, notes = ? WHERE id = ?',
                [$name, $role, $phone, $em, json_encode($days, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $active, $notes, $id]
            );
            return ['staff' => self::normalizeStaff($db->first('SELECT * FROM staff_roster WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteStaffMember(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM staff_roster WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'staff_not_found', 'Staff member not found.');
            }
            $db->execute('DELETE FROM staff_roster WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Returns & Exchanges Desk ----

    public function listReturns(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $issueType = V::text($input['issue_type'] ?? null, 'issue_type', ['required' => false, 'max' => 30]);

            $sql = 'SELECT * FROM returns_issues WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $status;
            }
            if ($issueType !== '' && $issueType !== 'All') {
                $sql .= ' AND issue_type = ?';
                $params[] = $issueType;
            }
            $sql .= " ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'Processing' THEN 1 WHEN 'Resolved' THEN 2 ELSE 3 END, issue_date DESC, created_at DESC LIMIT 150";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $r = self::normalizeReturn($r);
            }
            return ['returns' => $rows];
        });
    }

    public function addReturn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $prodId = V::int($input['product_id'] ?? null, 'product_id', ['required' => false, 'min' => 1]);
            $sku = '';
            $prodName = V::text($input['product_name'] ?? null, 'product_name', ['required' => false, 'max' => 160]);
            $prod = null;
            if ($prodId !== null) {
                $prod = $db->first('SELECT * FROM products WHERE id = ?', [$prodId]);
                if (!$prod) {
                    HttpException::fail(422, 'product_invalid', 'Selected product does not exist.', 'product_id');
                }
                $sku = (string) $prod['sku'];
                $prodName = (string) $prod['product_name'];
            }
            if ($prodName === '') {
                HttpException::fail(422, 'product_required', 'Select a product for this return or issue.', 'product_id');
            }

            $customer = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 120]) ?: 'Walk-in customer';
            $issueType = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => 'Return']);
            $resType = V::oneOf($input['resolution_type'] ?? null, self::RES_TYPES, 'resolution_type', [
                'fallback' => $issueType === 'Exchange' ? 'Exchange' : 'Refund',
            ]);
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Date']);
            $defaultAmount = $prod !== null ? (int) $prod['retail_cents'] : 0;
            $amountCents = (array_key_exists('amount', $input) && $input['amount'] !== null && $input['amount'] !== '')
                ? V::moneyCents($input['amount'], 'amount', ['min' => 0, 'max' => 50000000, 'label' => 'Amount'])
                : $defaultAmount;
            $status = V::oneOf($input['status'] ?? null, self::RET_STATUSES, 'status', ['fallback' => 'Open']);
            $restock = (V::bool($input['restock'] ?? false) && $prod !== null) ? 1 : 0;
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO returns_issues(product_id, sku, product_name, customer_name, issue_type, resolution_type, issue_date, amount_cents, restocked, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$prodId, $sku, $prodName, $customer, $issueType, $resType, $issueDate, $amountCents, $restock, $status, $notes, $ts, $ts]
            );
            $retId = $created['lastInsertRowid'];

            if ($restock === 1 && $prod !== null) {
                $nextStock = (int) $prod['current_stock'] + 1;
                $nextStatus = self::computeProductStatus($nextStock, (int) $prod['reorder_point'], (string) $prod['status']);
                $db->execute('UPDATE products SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?', [$nextStock, $nextStatus, $ts, (int) $prod['id']]);
                $db->execute(
                    "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, 'Return', 1, ?, ?, ?, NULL, ?, ?, 0, ?)",
                    [(int) $prod['id'], $prod['sku'], $prod['product_name'], $nextStock, "{$issueType} restocked from {$customer}", $issueDate, $ctx['member']['display_name'], "RET-{$retId}", $ts]
                );
            }

            return [
                '__status' => 201,
                '__body' => ['returnItem' => self::normalizeReturn($db->first('SELECT * FROM returns_issues WHERE id = ?', [$retId]))],
            ];
        }, write: true);
    }

    public function saveReturn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM returns_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'return_not_found', 'Return case not found.');
            }
            $customer = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 120]) ?: (string) $cur['customer_name'];
            $issueType = V::oneOf($input['issue_type'] ?? null, self::ISSUE_TYPES, 'issue_type', ['fallback' => $cur['issue_type']]);
            $resType = V::oneOf($input['resolution_type'] ?? null, self::RES_TYPES, 'resolution_type', ['fallback' => $cur['resolution_type']]);
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => (string) $cur['issue_date']]);
            $amountCents = (array_key_exists('amount', $input) && $input['amount'] !== null && $input['amount'] !== '')
                ? V::moneyCents($input['amount'], 'amount', ['min' => 0, 'max' => 50000000, 'label' => 'Amount'])
                : (int) $cur['amount_cents'];
            $status = V::oneOf($input['status'] ?? null, self::RET_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE returns_issues SET customer_name = ?, issue_type = ?, resolution_type = ?, issue_date = ?, amount_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$customer, $issueType, $resType, $issueDate, $amountCents, $status, $notes, V::now(), $id]
            );
            return ['returnItem' => self::normalizeReturn($db->first('SELECT * FROM returns_issues WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setReturnStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM returns_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'return_not_found', 'Return case not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::RET_STATUSES, 'status');
            $resType = !empty($input['resolution_type'])
                ? V::oneOf($input['resolution_type'], self::RES_TYPES, 'resolution_type')
                : (string) $cur['resolution_type'];
            $restockNow = V::bool($input['restock'] ?? false) && empty($cur['restocked']) && !empty($cur['product_id']);
            $ts = V::now();

            $db->execute(
                'UPDATE returns_issues SET status = ?, resolution_type = ?, restocked = ?, updated_at = ? WHERE id = ?',
                [$status, $resType, $restockNow ? 1 : (int) $cur['restocked'], $ts, $id]
            );
            if ($restockNow) {
                $prod = $db->first('SELECT * FROM products WHERE id = ?', [(int) $cur['product_id']]);
                if ($prod) {
                    $nextStock = (int) $prod['current_stock'] + 1;
                    $nextStatus = self::computeProductStatus($nextStock, (int) $prod['reorder_point'], (string) $prod['status']);
                    $db->execute('UPDATE products SET current_stock = ?, status = ?, updated_at = ? WHERE id = ?', [$nextStock, $nextStatus, $ts, (int) $prod['id']]);
                    $db->execute(
                        "INSERT INTO stock_movements(product_id, sku, product_name, movement_type, quantity_change, stock_after, reason, move_date, staff_id, staff_name, reference, is_sample, created_at) VALUES(?, ?, ?, 'Return', 1, ?, ?, ?, NULL, ?, ?, 0, ?)",
                        [(int) $prod['id'], $prod['sku'], $prod['product_name'], $nextStock, 'Restocked on resolution (' . $cur['customer_name'] . ')', V::utcDay(0), $ctx['member']['display_name'], "RET-{$id}", $ts]
                    );
                }
            }
            return ['returnItem' => self::normalizeReturn($db->first('SELECT * FROM returns_issues WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteReturn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM returns_issues WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'return_not_found', 'Return case not found.');
            }
            $db->execute('DELETE FROM returns_issues WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
