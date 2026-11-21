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

final class MaintenanceController
{
    private const PROP_TYPES = ['House', 'Apartment', 'Commercial', 'Strata / Body Corporate'];
    private const REQ_CATS = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Garden / Grounds', 'Other'];
    private const REQ_PRIOS = ['Urgent', 'High', 'Normal', 'Low'];
    private const REQ_STATUSES = ['New', 'Triaged', 'Work Order Assigned', 'In Progress', 'Resolved'];
    private const WO_STATUSES = ['Scheduled', 'In Progress', 'On Hold', 'Completed', 'Invoiced'];
    private const INSP_TYPES = ['Entry', 'Routine', 'Exit', 'Safety / Compliance', 'Final'];

    /** @return array<string, mixed>|null */
    private static function normalizeProperty(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'tenant_count', 'open_requests', 'latest_condition'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTenant(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeRequest(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'tenant_id', 'is_sample', 'created_at', 'updated_at', 'wo_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeWorkOrder(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'request_id', 'property_id', 'cost_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('hours', $row) && $row['hours'] !== null) {
            $row['hours'] = (float) $row['hours'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeInspection(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'property_id', 'condition_rating', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function fetchRequestRow(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT r.*, p.address AS property_address, p.property_type, p.access_notes, '
            . 't.name AS tenant_name, t.phone AS tenant_phone, t.unit AS tenant_unit, '
            . '(SELECT COUNT(*) FROM work_orders w WHERE w.request_id = r.id) AS wo_count, '
            . '(SELECT w.wo_number FROM work_orders w WHERE w.request_id = r.id ORDER BY w.id DESC LIMIT 1) AS latest_wo_number, '
            . '(SELECT w.assigned_to FROM work_orders w WHERE w.request_id = r.id ORDER BY w.id DESC LIMIT 1) AS latest_assignee '
            . 'FROM maintenance_requests r '
            . 'LEFT JOIN properties p ON p.id = r.property_id '
            . 'LEFT JOIN tenants t ON t.id = r.tenant_id '
            . 'WHERE r.id = ?',
            [$id]
        );
        return self::normalizeRequest($row);
    }

    // ---- Properties ----

    public function listProperties(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $type = V::text($input['property_type'] ?? null, 'property_type', ['required' => false, 'max' => 40]);
            $sql = 'SELECT p.*, '
                . '(SELECT COUNT(*) FROM tenants t WHERE t.property_id = p.id) AS tenant_count, '
                . "(SELECT COUNT(*) FROM maintenance_requests r WHERE r.property_id = p.id AND r.status != 'Resolved') AS open_requests, "
                . '(SELECT i.condition_rating FROM inspections i WHERE i.property_id = p.id ORDER BY i.inspection_date DESC, i.id DESC LIMIT 1) AS latest_condition '
                . 'FROM properties p WHERE 1=1';
            $params = [];
            if ($type !== '' && $type !== 'All') {
                $sql .= ' AND p.property_type = ?';
                $params[] = $type;
            }
            $sql .= ' ORDER BY p.address ASC LIMIT 250';
            $rows = array_map([self::class, 'normalizeProperty'], $db->query($sql, $params));
            return ['properties' => $rows];
        });
    }

    public function addProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $address = V::text($input['address'] ?? null, 'address', ['max' => 260, 'label' => 'Property address']);
            $type = V::oneOf($input['property_type'] ?? null, self::PROP_TYPES, 'property_type', ['fallback' => 'House']);
            $ownerMgr = V::text($input['owner_manager'] ?? null, 'owner_manager', ['max' => 120, 'label' => 'Owner / Manager']);
            $phone = V::text($input['manager_phone'] ?? null, 'manager_phone', ['required' => false, 'max' => 40]);
            $access = V::text($input['access_notes'] ?? null, 'access_notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO properties(address, property_type, owner_manager, manager_phone, access_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$address, $type, $ownerMgr, $phone, $access, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['property' => self::normalizeProperty($db->first('SELECT * FROM properties WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM properties WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Property not found.');
            }
            $address = V::text($input['address'] ?? null, 'address', ['max' => 260, 'label' => 'Property address']);
            $type = V::oneOf($input['property_type'] ?? null, self::PROP_TYPES, 'property_type', ['fallback' => $cur['property_type']]);
            $ownerMgr = V::text($input['owner_manager'] ?? null, 'owner_manager', ['max' => 120, 'label' => 'Owner / Manager']);
            $phone = V::text($input['manager_phone'] ?? null, 'manager_phone', ['required' => false, 'max' => 40]);
            $access = V::text($input['access_notes'] ?? null, 'access_notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE properties SET address = ?, property_type = ?, owner_manager = ?, manager_phone = ?, access_notes = ? WHERE id = ?',
                [$address, $type, $ownerMgr, $phone, $access, $id]
            );
            return ['property' => self::normalizeProperty($db->first('SELECT * FROM properties WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteProperty(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM properties WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Property not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM maintenance_requests WHERE property_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'property_has_requests', 'Remove linked maintenance requests before deleting this property.');
            }
            $db->execute('DELETE FROM tenants WHERE property_id = ?', [$id]);
            $db->execute('DELETE FROM inspections WHERE property_id = ?', [$id]);
            $db->execute('DELETE FROM properties WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Tenants ----

    public function listTenants(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::int($input['property_id'] ?? null, 'property_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT t.*, p.address AS property_address, p.property_type '
                . 'FROM tenants t LEFT JOIN properties p ON p.id = t.property_id WHERE 1=1';
            $params = [];
            if ($propId !== null) {
                $sql .= ' AND t.property_id = ?';
                $params[] = $propId;
            }
            $sql .= ' ORDER BY t.name ASC LIMIT 250';
            $rows = array_map([self::class, 'normalizeTenant'], $db->query($sql, $params));
            return ['tenants' => $rows];
        });
    }

    public function addTenant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            $prop = $db->first('SELECT * FROM properties WHERE id = ?', [$propId]);
            if (!$prop) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Tenant name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $unit = V::text($input['unit'] ?? null, 'unit', ['required' => false, 'max' => 40]);
            $lease = V::day($input['lease_start'] ?? null, 'lease_start', ['required' => false, 'fallback' => '']);

            $created = $db->execute(
                'INSERT INTO tenants(property_id, name, phone, email, unit, lease_start, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$propId, $name, $phone, $em, $unit, $lease, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['tenant' => self::normalizeTenant($db->first('SELECT * FROM tenants WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveTenant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM tenants WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Tenant not found.');
            }
            $propId = array_key_exists('property_id', $input)
                ? V::rowId($input['property_id'], 'property_id')
                : (int) $cur['property_id'];
            $prop = $db->first('SELECT id FROM properties WHERE id = ?', [$propId]);
            if (!$prop) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Tenant name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $unit = V::text($input['unit'] ?? null, 'unit', ['required' => false, 'max' => 40]);
            $lease = V::day($input['lease_start'] ?? null, 'lease_start', ['required' => false, 'fallback' => '']);

            $db->execute(
                'UPDATE tenants SET property_id = ?, name = ?, phone = ?, email = ?, unit = ?, lease_start = ? WHERE id = ?',
                [$propId, $name, $phone, $em, $unit, $lease, $id]
            );
            return ['tenant' => self::normalizeTenant($db->first('SELECT * FROM tenants WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTenant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM tenants WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Tenant not found.');
            }
            $db->execute('UPDATE maintenance_requests SET tenant_id = NULL WHERE tenant_id = ?', [$id]);
            $db->execute('DELETE FROM tenants WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Maintenance Requests Triage Board ----

    public function listRequests(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $priority = V::text($input['priority'] ?? null, 'priority', ['required' => false, 'max' => 20]);
            $sql = 'SELECT r.*, p.address AS property_address, p.property_type, p.access_notes, '
                . 't.name AS tenant_name, t.phone AS tenant_phone, t.unit AS tenant_unit, '
                . '(SELECT COUNT(*) FROM work_orders w WHERE w.request_id = r.id) AS wo_count, '
                . '(SELECT w.wo_number FROM work_orders w WHERE w.request_id = r.id ORDER BY w.id DESC LIMIT 1) AS latest_wo_number, '
                . '(SELECT w.assigned_to FROM work_orders w WHERE w.request_id = r.id ORDER BY w.id DESC LIMIT 1) AS latest_assignee '
                . 'FROM maintenance_requests r '
                . 'LEFT JOIN properties p ON p.id = r.property_id '
                . 'LEFT JOIN tenants t ON t.id = r.tenant_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND r.status = ?';
                $params[] = $status;
            }
            if ($priority !== '' && $priority !== 'All') {
                $sql .= ' AND r.priority = ?';
                $params[] = $priority;
            }
            $sql .= " ORDER BY CASE r.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, r.reported_date DESC, r.id DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeRequest'], $db->query($sql, $params));
            return ['requests' => $rows];
        });
    }

    public function addRequest(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            $prop = $db->first('SELECT * FROM properties WHERE id = ?', [$propId]);
            if (!$prop) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $tenantId = V::int($input['tenant_id'] ?? null, 'tenant_id', ['required' => false, 'min' => 1]);
            if ($tenantId !== null) {
                $ten = $db->first('SELECT id FROM tenants WHERE id = ?', [$tenantId]);
                if (!$ten) {
                    HttpException::fail(404, 'tenant_not_found', 'Tenant not found.');
                }
            }
            $cat = V::oneOf($input['category'] ?? null, self::REQ_CATS, 'category', ['fallback' => 'Plumbing']);
            $prio = V::oneOf($input['priority'] ?? null, self::REQ_PRIOS, 'priority', ['fallback' => 'Normal']);
            $status = V::oneOf($input['status'] ?? null, self::REQ_STATUSES, 'status', ['fallback' => 'New']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $repDate = V::day($input['reported_date'] ?? null, 'reported_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $nextSeq = (int) ($ctx['settings']['req_seq'] ?? 3000) + 1;
            $db->execute('UPDATE business_settings SET req_seq = ? WHERE id = 1', [$nextSeq]);
            $reqNum = 'REQ-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO maintenance_requests(request_number, property_id, tenant_id, category, priority, status, description, reported_date, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$reqNum, $propId, $tenantId, $cat, $prio, $status, $desc, $repDate, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['request' => self::fetchRequestRow($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function saveRequest(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Maintenance request not found.');
            }
            $cat = V::oneOf($input['category'] ?? null, self::REQ_CATS, 'category', ['fallback' => $cur['category']]);
            $prio = V::oneOf($input['priority'] ?? null, self::REQ_PRIOS, 'priority', ['fallback' => $cur['priority']]);
            $status = V::oneOf($input['status'] ?? null, self::REQ_STATUSES, 'status', ['fallback' => $cur['status']]);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $repDate = V::day($input['reported_date'] ?? null, 'reported_date', ['required' => false, 'fallback' => (string) $cur['reported_date']]);

            $db->execute(
                'UPDATE maintenance_requests SET category = ?, priority = ?, status = ?, description = ?, reported_date = ?, updated_at = ? WHERE id = ?',
                [$cat, $prio, $status, $desc, $repDate, V::now(), $id]
            );
            return ['request' => self::fetchRequestRow($db, $id)];
        }, write: true);
    }

    public function setRequestStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Maintenance request not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::REQ_STATUSES, 'status');
            $db->execute('UPDATE maintenance_requests SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['request' => self::fetchRequestRow($db, $id)];
        }, write: true);
    }

    public function deleteRequest(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM maintenance_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Maintenance request not found.');
            }
            $db->execute('DELETE FROM work_orders WHERE request_id = ?', [$id]);
            $db->execute('DELETE FROM maintenance_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Work Orders & Handyman Schedule ----

    public function listWorkOrders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT w.*, r.request_number, r.category, r.priority, r.description AS request_description, r.status AS request_status, '
                . 'p.address AS property_address, p.access_notes, t.name AS tenant_name, t.phone AS tenant_phone '
                . 'FROM work_orders w '
                . 'LEFT JOIN maintenance_requests r ON r.id = w.request_id '
                . 'LEFT JOIN properties p ON p.id = w.property_id '
                . 'LEFT JOIN tenants t ON t.id = r.tenant_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND w.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE w.status WHEN 'In Progress' THEN 0 WHEN 'Scheduled' THEN 1 WHEN 'On Hold' THEN 2 WHEN 'Completed' THEN 3 ELSE 4 END, w.scheduled_date ASC, w.id DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeWorkOrder'], $db->query($sql, $params));
            return ['workOrders' => $rows];
        });
    }

    public function addWorkOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $reqId = V::rowId($input['request_id'] ?? null, 'request_id');
            $mreq = $db->first('SELECT * FROM maintenance_requests WHERE id = ?', [$reqId]);
            if (!$mreq) {
                HttpException::fail(404, 'request_not_found', 'Maintenance request not found.');
            }
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['max' => 120, 'label' => 'Assigned tradesperson']);
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Scheduled date']);
            $hours = V::numVal($input['hours'] ?? null, 'hours', ['required' => false, 'min' => 0, 'max' => 500, 'fallback' => 0]);
            $cost = V::moneyCents($input['cost'] ?? null, 'cost', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0]);
            $status = V::oneOf($input['status'] ?? null, self::WO_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $workDone = V::text($input['work_done'] ?? null, 'work_done', ['required' => false, 'max' => 1200]);

            $nextSeq = (int) ($ctx['settings']['wo_seq'] ?? 4000) + 1;
            $db->execute('UPDATE business_settings SET wo_seq = ? WHERE id = 1', [$nextSeq]);
            $woNum = 'WO-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO work_orders(wo_number, request_id, property_id, assigned_to, scheduled_date, hours, cost_cents, status, work_done, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$woNum, $reqId, (int) $mreq['property_id'], $assigned, $schedDate, $hours, $cost, $status, $workDone, $ts, $ts]
            );

            // Automatically advance linked maintenance request status
            if ($status === 'Completed' || $status === 'Invoiced') {
                $db->execute("UPDATE maintenance_requests SET status = 'Resolved', updated_at = ? WHERE id = ?", [$ts, $reqId]);
            } elseif ($status === 'In Progress') {
                $db->execute("UPDATE maintenance_requests SET status = 'In Progress', updated_at = ? WHERE id = ? AND status != 'Resolved'", [$ts, $reqId]);
            } elseif ($mreq['status'] === 'New' || $mreq['status'] === 'Triaged') {
                $db->execute("UPDATE maintenance_requests SET status = 'Work Order Assigned', updated_at = ? WHERE id = ?", [$ts, $reqId]);
            }

            return [
                '__status' => 201,
                '__body' => ['workOrder' => self::normalizeWorkOrder($db->first('SELECT * FROM work_orders WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveWorkOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM work_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Work order not found.');
            }
            $assigned = array_key_exists('assigned_to', $input)
                ? V::text($input['assigned_to'], 'assigned_to', ['max' => 120])
                : (string) $cur['assigned_to'];
            $schedDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'fallback' => (string) $cur['scheduled_date']]);
            $hours = array_key_exists('hours', $input)
                ? V::numVal($input['hours'], 'hours', ['min' => 0, 'max' => 500])
                : (float) $cur['hours'];
            $cost = array_key_exists('cost', $input)
                ? V::moneyCents($input['cost'], 'cost', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0])
                : (int) $cur['cost_cents'];
            $status = V::oneOf($input['status'] ?? null, self::WO_STATUSES, 'status', ['fallback' => $cur['status']]);
            $workDone = array_key_exists('work_done', $input)
                ? V::text($input['work_done'], 'work_done', ['required' => false, 'max' => 1200])
                : (string) $cur['work_done'];
            $ts = V::now();

            $db->execute(
                'UPDATE work_orders SET assigned_to = ?, scheduled_date = ?, hours = ?, cost_cents = ?, status = ?, work_done = ?, updated_at = ? WHERE id = ?',
                [$assigned, $schedDate, $hours, $cost, $status, $workDone, $ts, $id]
            );
            if ($status === 'In Progress') {
                $db->execute("UPDATE maintenance_requests SET status = 'In Progress', updated_at = ? WHERE id = ? AND status != 'Resolved'", [$ts, (int) $cur['request_id']]);
            } elseif ($status === 'Completed' || $status === 'Invoiced') {
                $db->execute("UPDATE maintenance_requests SET status = 'Resolved', updated_at = ? WHERE id = ?", [$ts, (int) $cur['request_id']]);
            }
            return ['workOrder' => self::normalizeWorkOrder($db->first('SELECT * FROM work_orders WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function completeWorkOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM work_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Work order not found.');
            }
            $hours = array_key_exists('hours', $input)
                ? V::numVal($input['hours'], 'hours', ['min' => 0, 'max' => 500])
                : (float) $cur['hours'];
            $cost = array_key_exists('cost', $input)
                ? V::moneyCents($input['cost'], 'cost', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0])
                : (int) $cur['cost_cents'];
            $workDone = V::text($input['work_done'] ?? null, 'work_done', ['required' => false, 'max' => 1200])
                ?: ((string) $cur['work_done'] ?: 'Completed as scheduled.');
            $ts = V::now();

            $db->execute(
                "UPDATE work_orders SET status = 'Completed', hours = ?, cost_cents = ?, work_done = ?, updated_at = ? WHERE id = ?",
                [$hours, $cost, $workDone, $ts, $id]
            );
            // Automatically resolve the linked maintenance request
            $db->execute("UPDATE maintenance_requests SET status = 'Resolved', updated_at = ? WHERE id = ?", [$ts, (int) $cur['request_id']]);
            return [
                'workOrder' => self::normalizeWorkOrder($db->first('SELECT * FROM work_orders WHERE id = ?', [$id])),
                'request' => self::fetchRequestRow($db, (int) $cur['request_id']),
            ];
        }, write: true);
    }

    public function deleteWorkOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM work_orders WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Work order not found.');
            }
            $db->execute('DELETE FROM work_orders WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Property Inspections ----

    public function listInspections(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $type = V::text($input['inspection_type'] ?? null, 'inspection_type', ['required' => false, 'max' => 40]);
            $sql = 'SELECT i.*, p.address AS property_address, p.property_type, p.owner_manager, p.manager_phone '
                . 'FROM inspections i LEFT JOIN properties p ON p.id = i.property_id WHERE 1=1';
            $params = [];
            if ($type !== '' && $type !== 'All') {
                $sql .= ' AND i.inspection_type = ?';
                $params[] = $type;
            }
            $sql .= ' ORDER BY i.inspection_date DESC, i.id DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeInspection'], $db->query($sql, $params));
            return ['inspections' => $rows];
        });
    }

    public function addInspection(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $propId = V::rowId($input['property_id'] ?? null, 'property_id');
            $prop = $db->first('SELECT * FROM properties WHERE id = ?', [$propId]);
            if (!$prop) {
                HttpException::fail(404, 'property_not_found', 'Property not found.');
            }
            $type = V::oneOf($input['inspection_type'] ?? null, self::INSP_TYPES, 'inspection_type', ['fallback' => 'Routine']);
            $inspDate = V::day($input['inspection_date'] ?? null, 'inspection_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Inspection date']);
            $rating = V::int($input['condition_rating'] ?? null, 'condition_rating', ['min' => 1, 'max' => 5, 'label' => 'Condition rating']);
            $inspector = V::text($input['inspector'] ?? null, 'inspector', ['required' => false, 'max' => 100]) ?: (string) $ctx['member']['display_name'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 2000]);

            $created = $db->execute(
                'INSERT INTO inspections(property_id, inspection_type, inspection_date, condition_rating, inspector, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$propId, $type, $inspDate, $rating, $inspector, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['inspection' => self::normalizeInspection($db->first('SELECT * FROM inspections WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveInspection(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM inspections WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Inspection not found.');
            }
            $type = V::oneOf($input['inspection_type'] ?? null, self::INSP_TYPES, 'inspection_type', ['fallback' => $cur['inspection_type']]);
            $inspDate = V::day($input['inspection_date'] ?? null, 'inspection_date', ['required' => false, 'fallback' => (string) $cur['inspection_date']]);
            $rating = V::int($input['condition_rating'] ?? null, 'condition_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => (int) $cur['condition_rating']]) ?? (int) $cur['condition_rating'];
            $inspector = array_key_exists('inspector', $input)
                ? V::text($input['inspector'], 'inspector', ['required' => false, 'max' => 100])
                : (string) $cur['inspector'];
            $notes = array_key_exists('notes', $input)
                ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 2000])
                : (string) $cur['notes'];

            $db->execute(
                'UPDATE inspections SET inspection_type = ?, inspection_date = ?, condition_rating = ?, inspector = ?, notes = ? WHERE id = ?',
                [$type, $inspDate, $rating, $inspector, $notes, $id]
            );
            return ['inspection' => self::normalizeInspection($db->first('SELECT * FROM inspections WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteInspection(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM inspections WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Inspection not found.');
            }
            $db->execute('DELETE FROM inspections WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
