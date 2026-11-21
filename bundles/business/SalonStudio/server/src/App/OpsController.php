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
    private const SVC_CATS = ['Cut', 'Colour', 'Treatment', 'Nails', 'Beauty', 'Hair', 'Skin', 'Massage', 'Other'];
    private const STYLIST_ROLES = ['Senior Stylist', 'Stylist', 'Colour Specialist', 'Nail Technician', 'Beauty Therapist', 'Apprentice'];
    private const APPT_STATUSES = ['Booked', 'Confirmed', 'In Chair', 'Completed', 'Paid', 'No-show', 'Cancelled'];
    private const APPT_PIPELINE = ['Booked', 'Confirmed', 'In Chair', 'Completed', 'Paid'];

    /** @return array<string, mixed>|null */
    private static function normalizeClient(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'visit_count', 'service_spend_cents', 'retail_spend_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeService(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'duration_minutes', 'price_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeStylist(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'active', 'is_sample', 'created_at', 'today_appts', 'today_minutes'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeAppointment(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'service_id', 'stylist_id', 'duration_minutes', 'price_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSale(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'quantity', 'amount_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    private static function minutesOf(string $hhmm): int
    {
        $parts = explode(':', $hhmm !== '' ? $hhmm : '09:00');
        return ((int) ($parts[0] ?? 0)) * 60 + ((int) ($parts[1] ?? 0));
    }

    private static function checkStylistConflict(
        Database $db,
        int $stylistId,
        string $apptDate,
        string $apptTime,
        int $durationMins,
        ?int $ignoreId = null
    ): void {
        $startA = self::minutesOf($apptTime);
        $endA = $startA + ($durationMins > 0 ? $durationMins : 45);
        $existing = $db->query(
            "SELECT a.id, a.appt_time, a.duration_minutes, c.name AS client_name "
            . 'FROM appointments a LEFT JOIN clients c ON c.id = a.client_id '
            . "WHERE a.stylist_id = ? AND a.appt_date = ? AND a.status NOT IN ('Cancelled', 'No-show')",
            [$stylistId, $apptDate]
        );
        foreach ($existing as $row) {
            if ($ignoreId !== null && (int) $row['id'] === $ignoreId) {
                continue;
            }
            $startB = self::minutesOf((string) $row['appt_time']);
            $durB = (int) ($row['duration_minutes'] ?? 45);
            $endB = $startB + ($durB > 0 ? $durB : 45);
            if ($startA < $endB && $startB < $endA) {
                $clientName = !empty($row['client_name']) ? (string) $row['client_name'] : 'another client';
                HttpException::fail(
                    409,
                    'stylist_conflict',
                    'Stylist already has an appointment with ' . $clientName . ' at ' . $row['appt_time'] . '.'
                );
            }
        }
    }

    /** @return array<string, mixed>|null */
    private static function hydrateAppointment(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.notes AS client_notes, '
            . 's.name AS service_name, s.category AS service_category, st.name AS stylist_name, st.role AS stylist_role '
            . 'FROM appointments a '
            . 'LEFT JOIN clients c ON c.id = a.client_id '
            . 'LEFT JOIN services s ON s.id = a.service_id '
            . 'LEFT JOIN stylists st ON st.id = a.stylist_id WHERE a.id = ?',
            [$id]
        );
        return self::normalizeAppointment($row);
    }

    // ---- Clients & Complete History ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeClient'],
                $db->query(
                    'SELECT c.*, '
                    . "(SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status NOT IN ('Cancelled', 'No-show')) AS visit_count, "
                    . "(SELECT COALESCE(SUM(a.price_cents), 0) FROM appointments a WHERE a.client_id = c.id AND a.status IN ('Completed', 'Paid')) AS service_spend_cents, "
                    . '(SELECT COALESCE(SUM(p.amount_cents), 0) FROM product_sales p WHERE p.client_id = c.id) AS retail_spend_cents '
                    . 'FROM clients c ORDER BY c.name ASC'
                )
            );
            return ['clients' => $rows];
        });
    }

    public function getClientHistory(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $client = self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$id]));
            if (!$client) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $appts = array_map(
                [self::class, 'normalizeAppointment'],
                $db->query(
                    'SELECT a.*, s.name AS service_name, s.category AS service_category, st.name AS stylist_name '
                    . 'FROM appointments a '
                    . 'LEFT JOIN services s ON s.id = a.service_id '
                    . 'LEFT JOIN stylists st ON st.id = a.stylist_id '
                    . 'WHERE a.client_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 80',
                    [$id]
                )
            );
            $sales = array_map(
                [self::class, 'normalizeSale'],
                $db->query(
                    'SELECT * FROM product_sales WHERE client_id = ? ORDER BY sale_date DESC, created_at DESC LIMIT 80',
                    [$id]
                )
            );
            return ['client' => $client, 'appointments' => $appts, 'sales' => $sales];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $since = V::day($input['client_since'] ?? null, 'client_since', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1500]);

            $created = $db->execute(
                'INSERT INTO clients(name, phone, email, client_since, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, $phone, $em, $since, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $since = V::day($input['client_since'] ?? null, 'client_since', ['required' => false, 'fallback' => (string) $cur['client_since']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1500]);

            $db->execute(
                'UPDATE clients SET name = ?, phone = ?, email = ?, client_since = ?, notes = ? WHERE id = ?',
                [$name, $phone, $em, $since, $notes, $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM appointments WHERE client_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'client_has_appts', "Delete this client's appointments before removing their card.");
            }
            $db->execute('DELETE FROM product_sales WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Service Menu ----

    public function listServices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeService'],
                $db->query('SELECT * FROM services ORDER BY category ASC, name ASC')
            );
            return ['services' => $rows];
        });
    }

    public function addService(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Service name']);
            $cat = V::oneOf($input['category'] ?? null, self::SVC_CATS, 'category', ['fallback' => 'Cut']);
            $dur = V::int($input['duration_minutes'] ?? null, 'duration_minutes', [
                'required' => false,
                'min' => 5,
                'max' => 480,
                'fallback' => 45,
                'label' => 'Duration (minutes)',
            ]) ?? 45;
            $price = V::moneyCents($input['price'] ?? null, 'price', ['min' => 0, 'max' => 1000000, 'label' => 'Price']);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO services(name, category, duration_minutes, price_cents, description, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $dur, $price, $desc, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['service' => self::normalizeService($db->first('SELECT * FROM services WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveService(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM services WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Service not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Service name']);
            $cat = V::oneOf($input['category'] ?? null, self::SVC_CATS, 'category', ['fallback' => $cur['category']]);
            $dur = V::int($input['duration_minutes'] ?? null, 'duration_minutes', [
                'required' => false,
                'min' => 5,
                'max' => 480,
                'fallback' => (int) $cur['duration_minutes'],
            ]) ?? (int) $cur['duration_minutes'];
            $price = V::moneyCents($input['price'] ?? null, 'price', ['min' => 0, 'max' => 1000000, 'label' => 'Price']);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE services SET name = ?, category = ?, duration_minutes = ?, price_cents = ?, description = ? WHERE id = ?',
                [$name, $cat, $dur, $price, $desc, $id]
            );
            return ['service' => self::normalizeService($db->first('SELECT * FROM services WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteService(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM services WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Service not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM appointments WHERE service_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'service_in_use', 'This service is linked to booked appointments.');
            }
            $db->execute('DELETE FROM services WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Stylist Roster ----

    public function listStylists(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $refDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                [self::class, 'normalizeStylist'],
                $db->query(
                    'SELECT st.*, '
                    . "(SELECT COUNT(*) FROM appointments a WHERE a.stylist_id = st.id AND a.appt_date = ? AND a.status NOT IN ('Cancelled', 'No-show')) AS today_appts, "
                    . "(SELECT COALESCE(SUM(a.duration_minutes), 0) FROM appointments a WHERE a.stylist_id = st.id AND a.appt_date = ? AND a.status NOT IN ('Cancelled', 'No-show')) AS today_minutes "
                    . 'FROM stylists st ORDER BY st.active DESC, st.name ASC',
                    [$refDay, $refDay]
                )
            );
            return ['stylists' => $rows];
        });
    }

    public function addStylist(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Stylist name']);
            $role = V::oneOf($input['role'] ?? null, self::STYLIST_ROLES, 'role', ['fallback' => 'Stylist']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $active = array_key_exists('active', $input) ? (V::bool($input['active']) ? 1 : 0) : 1;

            $created = $db->execute(
                'INSERT INTO stylists(name, role, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, 0, ?)',
                [$name, $role, $phone, $active, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['stylist' => self::normalizeStylist($db->first('SELECT * FROM stylists WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveStylist(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM stylists WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Stylist not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Stylist name']);
            $role = V::oneOf($input['role'] ?? null, self::STYLIST_ROLES, 'role', ['fallback' => $cur['role']]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $active = array_key_exists('active', $input) ? (V::bool($input['active']) ? 1 : 0) : (int) $cur['active'];

            $db->execute(
                'UPDATE stylists SET name = ?, role = ?, phone = ?, active = ? WHERE id = ?',
                [$name, $role, $phone, $active, $id]
            );
            return ['stylist' => self::normalizeStylist($db->first('SELECT * FROM stylists WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function toggleStylistActive(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM stylists WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Stylist not found.');
            }
            $nextActive = ((int) $cur['active']) !== 0 ? 0 : 1;
            $db->execute('UPDATE stylists SET active = ? WHERE id = ?', [$nextActive, $id]);
            return ['stylist' => self::normalizeStylist($db->first('SELECT * FROM stylists WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteStylist(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM stylists WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Stylist not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM appointments WHERE stylist_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'stylist_has_appts', 'Reassign appointments before removing this stylist.');
            }
            $db->execute('DELETE FROM stylists WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Daily Appointment Book ----

    public function listAppointments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $apptDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $stylistId = V::int($input['stylist_id'] ?? null, 'stylist_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.notes AS client_notes, '
                . 's.name AS service_name, s.category AS service_category, st.name AS stylist_name, st.role AS stylist_role '
                . 'FROM appointments a '
                . 'LEFT JOIN clients c ON c.id = a.client_id '
                . 'LEFT JOIN services s ON s.id = a.service_id '
                . 'LEFT JOIN stylists st ON st.id = a.stylist_id WHERE 1=1';
            $params = [];
            if ($apptDay !== '') {
                $sql .= ' AND a.appt_date = ?';
                $params[] = $apptDay;
            }
            if ($stylistId !== null) {
                $sql .= ' AND a.stylist_id = ?';
                $params[] = $stylistId;
            }
            $sql .= ' ORDER BY a.appt_date ASC, a.appt_time ASC, a.id ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeAppointment'], $db->query($sql, $params));
            return ['appointments' => $rows];
        });
    }

    public function addAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $serviceId = V::rowId($input['service_id'] ?? null, 'service_id');
            $stylistId = V::rowId($input['stylist_id'] ?? null, 'stylist_id');

            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            $svc = $db->first('SELECT * FROM services WHERE id = ?', [$serviceId]);
            if (!$svc) {
                HttpException::fail(404, 'service_not_found', 'Selected service not found.');
            }
            if (!$db->first('SELECT id FROM stylists WHERE id = ?', [$stylistId])) {
                HttpException::fail(404, 'stylist_not_found', 'Selected stylist not found.');
            }

            $apptDate = V::day($input['appt_date'] ?? null, 'appt_date', ['label' => 'Appointment date']);
            $apptTime = V::timeStr($input['appt_time'] ?? null, 'appt_time', ['label' => 'Appointment time']);
            $duration = V::int($input['duration_minutes'] ?? null, 'duration_minutes', [
                'required' => false,
                'min' => 5,
                'max' => 480,
                'fallback' => (int) $svc['duration_minutes'],
            ]) ?? (int) $svc['duration_minutes'];
            $priceCents = (array_key_exists('price', $input) && $input['price'] !== null && $input['price'] !== '')
                ? V::moneyCents($input['price'], 'price', ['min' => 0, 'max' => 1000000])
                : (int) $svc['price_cents'];
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['fallback' => 'Booked']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            if ($status !== 'Cancelled' && $status !== 'No-show' && !V::bool($input['allow_overlap'] ?? false)) {
                self::checkStylistConflict($db, $stylistId, $apptDate, $apptTime, $duration, null);
            }

            $ts = V::now();
            $created = $db->execute(
                'INSERT INTO appointments(client_id, service_id, stylist_id, appt_date, appt_time, duration_minutes, status, price_cents, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$clientId, $serviceId, $stylistId, $apptDate, $apptTime, $duration, $status, $priceCents, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'appointment' => self::hydrateAppointment($db, $created['lastInsertRowid']),
                    'counts' => WorkspaceController::readBadgeCounts($db, $apptDate),
                ],
            ];
        }, write: true);
    }

    public function saveAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM appointments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Appointment not found.');
            }
            $clientId = V::rowId(!empty($input['client_id']) ? $input['client_id'] : $cur['client_id'], 'client_id');
            $serviceId = V::rowId(!empty($input['service_id']) ? $input['service_id'] : $cur['service_id'], 'service_id');
            $stylistId = V::rowId(!empty($input['stylist_id']) ? $input['stylist_id'] : $cur['stylist_id'], 'stylist_id');

            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            if (!$db->first('SELECT id FROM services WHERE id = ?', [$serviceId])) {
                HttpException::fail(404, 'service_not_found', 'Selected service not found.');
            }
            if (!$db->first('SELECT id FROM stylists WHERE id = ?', [$stylistId])) {
                HttpException::fail(404, 'stylist_not_found', 'Selected stylist not found.');
            }

            $apptDate = V::day($input['appt_date'] ?? null, 'appt_date', ['required' => false, 'fallback' => (string) $cur['appt_date']]);
            $apptTime = V::timeStr($input['appt_time'] ?? null, 'appt_time', ['required' => false, 'fallback' => (string) $cur['appt_time']]);
            $duration = V::int($input['duration_minutes'] ?? null, 'duration_minutes', [
                'required' => false,
                'min' => 5,
                'max' => 480,
                'fallback' => (int) $cur['duration_minutes'],
            ]) ?? (int) $cur['duration_minutes'];
            $priceCents = (array_key_exists('price', $input) && $input['price'] !== null && $input['price'] !== '')
                ? V::moneyCents($input['price'], 'price', ['min' => 0, 'max' => 1000000])
                : (int) $cur['price_cents'];
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['fallback' => (string) $cur['status']]);
            $notes = array_key_exists('notes', $input)
                ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 1000])
                : (string) $cur['notes'];

            if ($status !== 'Cancelled' && $status !== 'No-show' && !V::bool($input['allow_overlap'] ?? false)) {
                self::checkStylistConflict($db, $stylistId, $apptDate, $apptTime, $duration, $id);
            }

            $db->execute(
                'UPDATE appointments SET client_id = ?, service_id = ?, stylist_id = ?, appt_date = ?, appt_time = ?, duration_minutes = ?, status = ?, price_cents = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$clientId, $serviceId, $stylistId, $apptDate, $apptTime, $duration, $status, $priceCents, $notes, V::now(), $id]
            );
            return [
                'appointment' => self::hydrateAppointment($db, $id),
                'counts' => WorkspaceController::readBadgeCounts($db, $apptDate),
            ];
        }, write: true);
    }

    public function advanceAppointmentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM appointments WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Appointment not found.');
            }
            if (!empty($input['status'])) {
                $nextStatus = V::oneOf($input['status'], self::APPT_STATUSES, 'status');
            } else {
                $idx = array_search((string) $cur['status'], self::APPT_PIPELINE, true);
                $nextStatus = ($idx !== false && $idx < count(self::APPT_PIPELINE) - 1)
                    ? self::APPT_PIPELINE[$idx + 1]
                    : 'Paid';
            }
            $db->execute('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?', [$nextStatus, V::now(), $id]);
            return [
                'appointment' => self::hydrateAppointment($db, $id),
                'counts' => WorkspaceController::readBadgeCounts($db, (string) $cur['appt_date']),
            ];
        }, write: true);
    }

    public function deleteAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM appointments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Appointment not found.');
            }
            $db->execute('DELETE FROM appointments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Retail Product Sales ----

    public function listSales(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $saleDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $sql = 'SELECT p.*, c.name AS client_name, c.phone AS client_phone '
                . 'FROM product_sales p LEFT JOIN clients c ON c.id = p.client_id WHERE 1=1';
            $params = [];
            if ($saleDay !== '') {
                $sql .= ' AND p.sale_date = ?';
                $params[] = $saleDay;
            }
            $sql .= ' ORDER BY p.sale_date DESC, p.created_at DESC LIMIT 160';

            $sales = array_map([self::class, 'normalizeSale'], $db->query($sql, $params));
            $todaySum = $db->first(
                'SELECT COALESCE(SUM(amount_cents), 0) AS rev, COALESCE(SUM(quantity), 0) AS qty, COUNT(*) AS cnt FROM product_sales WHERE sale_date = ?',
                [$todayDay]
            );
            $allSum = $db->first(
                'SELECT COALESCE(SUM(amount_cents), 0) AS rev, COALESCE(SUM(quantity), 0) AS qty FROM product_sales'
            );

            return [
                'sales' => $sales,
                'summary' => [
                    'todayDay' => $todayDay,
                    'todayRevenueCents' => $todaySum ? (int) $todaySum['rev'] : 0,
                    'todayUnits' => $todaySum ? (int) $todaySum['qty'] : 0,
                    'todayCount' => $todaySum ? (int) $todaySum['cnt'] : 0,
                    'totalRevenueCents' => $allSum ? (int) $allSum['rev'] : 0,
                    'totalUnits' => $allSum ? (int) $allSum['qty'] : 0,
                ],
            ];
        });
    }

    public function addSale(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$clientId])) {
                HttpException::fail(404, 'client_not_found', 'Selected client not found.');
            }
            $prod = V::text($input['product_name'] ?? null, 'product_name', ['max' => 140, 'label' => 'Product name']);
            $qty = V::int($input['quantity'] ?? null, 'quantity', [
                'required' => false,
                'min' => 1,
                'max' => 100,
                'fallback' => 1,
                'label' => 'Quantity',
            ]) ?? 1;
            $amount = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 0, 'max' => 1000000, 'label' => 'Amount']);
            $saleDate = V::day($input['sale_date'] ?? null, 'sale_date', [
                'required' => false,
                'fallback' => V::utcDay(0),
                'label' => 'Sale date',
            ]);

            $created = $db->execute(
                'INSERT INTO product_sales(client_id, product_name, quantity, amount_cents, sale_date, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $prod, $qty, $amount, $saleDate, V::now()]
            );
            $row = $db->first(
                'SELECT p.*, c.name AS client_name, c.phone AS client_phone '
                . 'FROM product_sales p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?',
                [$created['lastInsertRowid']]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'sale' => self::normalizeSale($row),
                    'counts' => WorkspaceController::readBadgeCounts($db, $saleDate),
                ],
            ];
        }, write: true);
    }

    public function deleteSale(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM product_sales WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Product sale not found.');
            }
            $db->execute('DELETE FROM product_sales WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
