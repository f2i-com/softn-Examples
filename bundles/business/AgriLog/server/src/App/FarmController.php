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

final class FarmController
{
    private const IRRIGATIONS = ['Drip', 'Sprinkler', 'Flood', 'Dryland'];
    private const PADDOCK_STATUSES = ['In crop', 'Fallow', 'Being prepared', 'Grazing'];
    private const JOB_TYPES = ['Planting', 'Spraying', 'Irrigation', 'Fertiliser', 'Harvest', 'Maintenance'];
    private const JOB_STATUSES = ['Planned', 'In progress', 'Done', 'Rained off'];
    private const HARVEST_UNITS = ['Tonnes', 'kg', 'Bins', 'Bales'];
    private const HARVEST_GRADES = ['Premium', 'Grade 1', 'Grade 2', 'Juice or feed'];
    private const MACHINE_TYPES = ['Tractor', 'Harvester', 'Sprayer', 'Ute', 'Implement', 'Pump'];
    private const MACHINE_STATUSES = ['Running', 'Due for service', 'In workshop', 'Retired'];
    private const MAINT_TYPES = ['Scheduled service', 'Repair', 'Tyres or tracks', 'Electrical', 'Hydraulics'];

    private static function optionalRowId(mixed $value, string $name): ?int
    {
        if ($value === null || $value === '' || $value === 0 || $value === false) {
            return null;
        }
        return V::rowId($value, $name);
    }

    // ---- Paddocks ----

    public function listPaddocks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = $db->query('SELECT * FROM paddocks ORDER BY block_name ASC');
            foreach ($rows as &$row) {
                $whp = $db->first(
                    "SELECT product_used, whp_end FROM chemical_applications WHERE paddock_id = ? AND whp_end >= ? AND whp_end != '' ORDER BY whp_end DESC LIMIT 1",
                    [$row['id'], $todayDay]
                );
                $openJobs = $db->first(
                    "SELECT COUNT(*) AS c FROM farm_jobs WHERE paddock_id = ? AND status IN ('Planned', 'In progress')",
                    [$row['id']]
                );
                $lastHarv = $db->first(
                    'SELECT harvest_date, quantity, unit FROM harvest_logs WHERE paddock_id = ? ORDER BY harvest_date DESC LIMIT 1',
                    [$row['id']]
                );
                $row['active_whp'] = $whp;
                $row['open_jobs'] = $openJobs ? (int) $openJobs['c'] : 0;
                $row['last_harvest'] = $lastHarv;
            }
            unset($row);
            return ['paddocks' => $rows];
        });
    }

    public function addPaddock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $blockName = V::text($input['block_name'] ?? null, 'block_name', ['max' => 120, 'label' => 'Block name']);
            $crop = V::text($input['crop'] ?? null, 'crop', ['required' => false, 'max' => 100]);
            $areaHa = V::numVal($input['area_ha'] ?? null, 'area_ha', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => 0]);
            $soilNotes = V::text($input['soil_notes'] ?? null, 'soil_notes', ['required' => false, 'max' => 600]);
            $irrigation = V::oneOf($input['irrigation'] ?? null, self::IRRIGATIONS, 'irrigation', ['fallback' => 'Dryland']);
            $status = V::oneOf($input['status'] ?? null, self::PADDOCK_STATUSES, 'status', ['fallback' => 'In crop']);

            $created = $db->execute(
                'INSERT INTO paddocks(block_name, crop, area_ha, soil_notes, irrigation, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$blockName, $crop, $areaHa, $soilNotes, $irrigation, $status, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['paddock' => $db->first('SELECT * FROM paddocks WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function savePaddock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM paddocks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Paddock not found.');
            }
            $blockName = V::text($input['block_name'] ?? null, 'block_name', ['max' => 120, 'label' => 'Block name']);
            $crop = V::text($input['crop'] ?? null, 'crop', ['required' => false, 'max' => 100]);
            $areaHa = V::numVal($input['area_ha'] ?? null, 'area_ha', ['required' => false, 'min' => 0, 'max' => 100000, 'fallback' => $cur['area_ha']]);
            $soilNotes = V::text($input['soil_notes'] ?? null, 'soil_notes', ['required' => false, 'max' => 600]);
            $irrigation = V::oneOf($input['irrigation'] ?? null, self::IRRIGATIONS, 'irrigation', ['fallback' => $cur['irrigation']]);
            $status = V::oneOf($input['status'] ?? null, self::PADDOCK_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE paddocks SET block_name = ?, crop = ?, area_ha = ?, soil_notes = ?, irrigation = ?, status = ? WHERE id = ?',
                [$blockName, $crop, $areaHa, $soilNotes, $irrigation, $status, $id]
            );

            return ['paddock' => $db->first('SELECT * FROM paddocks WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deletePaddock(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM paddocks WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Farm Jobs ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT j.*, p.block_name, p.crop AS paddock_crop FROM farm_jobs j LEFT JOIN paddocks p ON p.id = j.paddock_id ORDER BY CASE j.status WHEN 'In progress' THEN 0 WHEN 'Planned' THEN 1 WHEN 'Rained off' THEN 2 ELSE 3 END, j.scheduled_date ASC LIMIT 150"
            );
            return ['jobs' => $rows];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $pid = self::optionalRowId($input['paddock_id'] ?? null, 'paddock_id');
            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => 'Planting']);
            $scheduledDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['label' => 'Scheduled date']);
            $assignedTo = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 100]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => 'Planned']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $created = $db->execute(
                "INSERT INTO farm_jobs(paddock_id, job_type, scheduled_date, completed_date, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, '', ?, ?, ?, 0, ?)",
                [$pid, $jobType, $scheduledDate, $assignedTo, $status, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['job' => $db->first('SELECT * FROM farm_jobs WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM farm_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Farm job not found.');
            }
            $pid = self::optionalRowId($input['paddock_id'] ?? null, 'paddock_id');
            $st = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status', ['fallback' => $cur['status']]);
            $doneDate = $st === 'Done'
                ? (V::day($input['completed_date'] ?? null, 'completed_date', ['required' => false]) ?: ((string) ($cur['completed_date'] ?? '') ?: V::utcDay(0)))
                : '';
            $jobType = V::oneOf($input['job_type'] ?? null, self::JOB_TYPES, 'job_type', ['fallback' => $cur['job_type']]);
            $scheduledDate = V::day($input['scheduled_date'] ?? null, 'scheduled_date', ['required' => false, 'fallback' => (string) $cur['scheduled_date']]);
            $assignedTo = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 100]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE farm_jobs SET paddock_id = ?, job_type = ?, scheduled_date = ?, completed_date = ?, assigned_to = ?, status = ?, notes = ? WHERE id = ?',
                [$pid, $jobType, $scheduledDate, $doneDate, $assignedTo, $st, $notes, $id]
            );

            return ['job' => $db->first('SELECT * FROM farm_jobs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function setJobStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM farm_jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Farm job not found.');
            }
            $st = V::oneOf($input['status'] ?? null, self::JOB_STATUSES, 'status');
            $doneDate = $st === 'Done'
                ? (V::day($input['today'] ?? null, 'today', ['required' => false]) ?: V::utcDay(0))
                : '';

            $db->execute('UPDATE farm_jobs SET status = ?, completed_date = ? WHERE id = ?', [$st, $doneDate, $id]);

            return ['job' => $db->first('SELECT * FROM farm_jobs WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM farm_jobs WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Harvest Logs (WHP-guarded) ----

    public function listHarvests(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                'SELECT h.*, p.block_name FROM harvest_logs h LEFT JOIN paddocks p ON p.id = h.paddock_id ORDER BY h.harvest_date DESC, h.created_at DESC LIMIT 150'
            );
            return ['harvests' => $rows];
        });
    }

    public function addHarvest(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $pid = self::optionalRowId($input['paddock_id'] ?? null, 'paddock_id');
            $hDate = V::day($input['harvest_date'] ?? null, 'harvest_date', ['label' => 'Harvest date']);

            // Safety Compliance Check: block harvest during active Chemical Withholding Period unless override confirmed
            if ($pid !== null && !V::bool($input['override_whp'] ?? false)) {
                $lock = $db->first(
                    'SELECT product_used, whp_end FROM chemical_applications WHERE paddock_id = ? AND application_date <= ? AND whp_end >= ? ORDER BY whp_end DESC LIMIT 1',
                    [$pid, $hDate, $hDate]
                );
                if ($lock) {
                    HttpException::fail(
                        409,
                        'whp_active',
                        'Withholding period active for ' . $lock['product_used'] . ' until ' . $lock['whp_end'] . '. Cannot log harvest on ' . $hDate . '.'
                    );
                }
            }

            $crop = V::text($input['crop'] ?? null, 'crop', ['max' => 100, 'label' => 'Crop']);
            $quantity = V::numVal($input['quantity'] ?? null, 'quantity', ['min' => 0.01, 'max' => 1000000, 'label' => 'Quantity']);
            $unit = V::oneOf($input['unit'] ?? null, self::HARVEST_UNITS, 'unit', ['fallback' => 'Tonnes']);
            $grade = V::oneOf($input['grade'] ?? null, self::HARVEST_GRADES, 'grade', ['fallback' => 'Grade 1']);
            $buyer = V::text($input['buyer'] ?? null, 'buyer', ['required' => false, 'max' => 140]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO harvest_logs(paddock_id, harvest_date, crop, quantity, unit, grade, buyer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$pid, $hDate, $crop, $quantity, $unit, $grade, $buyer, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['harvest' => $db->first('SELECT * FROM harvest_logs WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function deleteHarvest(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM harvest_logs WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Chemical Application Register ----

    public function listChemicals(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                'SELECT c.*, p.block_name FROM chemical_applications c LEFT JOIN paddocks p ON p.id = c.paddock_id ORDER BY c.application_date DESC, c.created_at DESC LIMIT 150'
            );
            return ['applications' => $rows];
        });
    }

    public function addChemical(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $pid = self::optionalRowId($input['paddock_id'] ?? null, 'paddock_id');
            $productUsed = V::text($input['product_used'] ?? null, 'product_used', ['max' => 140, 'label' => 'Product used']);
            $rate = V::text($input['rate'] ?? null, 'rate', ['required' => false, 'max' => 60]);
            $appDate = V::day($input['application_date'] ?? null, 'application_date', ['label' => 'Application date']);
            $operator = V::text($input['operator'] ?? null, 'operator', ['required' => false, 'max' => 100]);
            $weather = V::text($input['weather'] ?? null, 'weather', ['required' => false, 'max' => 200]);
            $whpEnd = V::day($input['whp_end'] ?? null, 'whp_end', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO chemical_applications(paddock_id, product_used, rate, application_date, operator, weather, whp_end, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$pid, $productUsed, $rate, $appDate, $operator, $weather, $whpEnd, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['application' => $db->first('SELECT * FROM chemical_applications WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function deleteChemical(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM chemical_applications WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Machinery & Maintenance ----

    public function listMachinery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM machinery ORDER BY CASE status WHEN 'Due for service' THEN 0 WHEN 'In workshop' THEN 1 WHEN 'Running' THEN 2 ELSE 3 END, machine_name ASC"
            );
            foreach ($rows as &$row) {
                $s = $db->first(
                    'SELECT COUNT(*) AS c, COALESCE(SUM(cost_cents), 0) AS cost FROM maintenance_logs WHERE machine_id = ?',
                    [$row['id']]
                );
                $row['service_count'] = $s ? (int) $s['c'] : 0;
                $row['total_cost_cents'] = $s ? (int) $s['cost'] : 0;
            }
            unset($row);
            return ['machines' => $rows];
        });
    }

    public function addMachine(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['machine_name'] ?? null, 'machine_name', ['max' => 120, 'label' => 'Machine name']);
            $type = V::oneOf($input['machine_type'] ?? null, self::MACHINE_TYPES, 'machine_type', ['fallback' => 'Tractor']);
            $serviceDue = V::day($input['service_due'] ?? null, 'service_due', ['required' => false, 'fallback' => '']);
            $hours = V::numVal($input['hours'] ?? null, 'hours', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => 0]);
            $status = V::oneOf($input['status'] ?? null, self::MACHINE_STATUSES, 'status', ['fallback' => 'Running']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO machinery(machine_name, machine_type, service_due, hours, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $type, $serviceDue, $hours, $status, $notes, V::now()]
            );

            return [
                '__status' => 201,
                '__body' => ['machine' => $db->first('SELECT * FROM machinery WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveMachine(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM machinery WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Machine not found.');
            }
            $name = V::text($input['machine_name'] ?? null, 'machine_name', ['max' => 120, 'label' => 'Machine name']);
            $type = V::oneOf($input['machine_type'] ?? null, self::MACHINE_TYPES, 'machine_type', ['fallback' => $cur['machine_type']]);
            $serviceDue = V::day($input['service_due'] ?? null, 'service_due', ['required' => false, 'fallback' => '']);
            $hours = V::numVal($input['hours'] ?? null, 'hours', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => $cur['hours']]);
            $status = V::oneOf($input['status'] ?? null, self::MACHINE_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE machinery SET machine_name = ?, machine_type = ?, service_due = ?, hours = ?, status = ?, notes = ? WHERE id = ?',
                [$name, $type, $serviceDue, $hours, $status, $notes, $id]
            );

            return ['machine' => $db->first('SELECT * FROM machinery WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteMachine(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $db->execute('DELETE FROM maintenance_logs WHERE machine_id = ?', [$id]);
            $db->execute('DELETE FROM machinery WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                'SELECT m.*, ma.machine_name FROM maintenance_logs m LEFT JOIN machinery ma ON ma.id = m.machine_id ORDER BY m.log_date DESC, m.created_at DESC LIMIT 120'
            );
            return ['logs' => $rows];
        });
    }

    public function addMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $mid = V::rowId($input['machine_id'] ?? null, 'machine_id');
            $m = $db->first('SELECT * FROM machinery WHERE id = ?', [$mid]);
            if (!$m) {
                HttpException::fail(404, 'not_found', 'Machine not found.');
            }
            $mType = V::oneOf($input['maintenance_type'] ?? null, self::MAINT_TYPES, 'maintenance_type', ['fallback' => 'Scheduled service']);
            $logDate = V::day($input['log_date'] ?? null, 'log_date', ['label' => 'Date']);
            $costCents = V::moneyCents($input['cost'] ?? null, 'cost', ['required' => false, 'min' => 0, 'max' => 50000000, 'fallback' => 0]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $created = $db->execute(
                'INSERT INTO maintenance_logs(machine_id, log_date, maintenance_type, cost_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, ?)',
                [$mid, $logDate, $mType, $costCents, $notes, V::now()]
            );

            if ($mType === 'Scheduled service' && !empty($input['next_service_due'])) {
                $nextDue = V::day($input['next_service_due'], 'next_service_due');
                $db->execute(
                    "UPDATE machinery SET status = 'Running', service_due = ? WHERE id = ?",
                    [$nextDue, $mid]
                );
            }

            return [
                '__status' => 201,
                '__body' => ['log' => $db->first('SELECT * FROM maintenance_logs WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function deleteMaintenance(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $db->execute('DELETE FROM maintenance_logs WHERE id = ?', [V::rowId($input['id'] ?? null)]);
            return ['deleted' => true];
        }, write: true);
    }
}
