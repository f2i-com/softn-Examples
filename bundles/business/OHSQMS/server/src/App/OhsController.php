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

final class OhsController
{
    private const INC_TYPES = ['Near Miss', 'Injury', 'Property Damage', 'Environmental', 'Security', 'Other'];
    private const INC_SEVS = ['Low', 'Medium', 'High', 'Critical'];
    private const INC_STATUSES = ['Reported', 'Investigating', 'Actions Assigned', 'Closed'];
    private const INJ_TYPES = ['Strain / Sprain', 'Laceration / Cut', 'Fracture', 'Burn', 'Contusion / Bruise', 'Eye Injury', 'Hearing Damage', 'Respiratory', 'Other'];
    private const HAZ_TYPES = ['Physical', 'Chemical', 'Biological', 'Ergonomic', 'Psychosocial', 'Environmental', 'Other'];
    private const CTRL_TYPES = ['Elimination', 'Substitution', 'Engineering Controls', 'Administrative Controls', 'PPE'];
    private const HAZ_STATUSES = ['Open', 'Controlled', 'Closed'];
    private const ACT_SOURCES = ['Incident', 'Hazard', 'Audit', 'Corrective Action Request', 'Non-Conformance', 'Complaint', 'Other'];
    private const ACT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
    private const ACT_STATUSES = ['Open', 'In Progress', 'Verified Closed'];
    private const AUD_TYPES = ['Internal', 'External', 'ISO Certification', 'Regulatory', 'Supplier', 'Other'];
    private const AUD_SEVS = ['Observation', 'Minor Non-Conformance', 'Major Non-Conformance', 'Critical Non-Conformance', 'Opportunity for Improvement'];
    private const CAR_SOURCES = ['Audit', 'Incident', 'Complaint', 'Non-Conformance Report', 'Other'];
    private const NCR_TYPES = ['Product', 'Process', 'System', 'Supplier', 'Other'];
    private const NCR_SEVS = ['Minor', 'Major', 'Critical'];
    private const NCR_SOURCES = ['Audit', 'Inspection', 'Customer', 'Internal', 'Supplier', 'Other'];
    private const NCR_DISPS = ['Rework', 'Scrap', 'Accept as Is', 'Return to Supplier', 'Other'];
    private const NCR_STATUSES = ['Open', 'Contained', 'Closed'];
    private const CMP_TYPES = ['Safety', 'Environmental', 'Quality', 'Service', 'Conduct', 'Other'];
    private const CMP_SOURCES = ['Customer', 'Employee', 'Contractor', 'Public', 'Regulator', 'Other'];
    private const CMP_STATUSES = ['Open', 'Investigating', 'Resolved'];
    private const MTG_TYPES = ['Toolbox Talk', 'Safety Committee', 'Incident Review', 'Training Session', 'Management Review', 'Other'];
    private const PLANT_CATS = ['Vehicle', 'Forklift', 'Crane / Lifting', 'Scaffold', 'Power Tool', 'Pressure Vessel', 'Electrical Equipment', 'Other'];
    private const PLANT_FREQS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'];

    /** @return array{score: int, rating: string, residual: int} */
    private static function computeRiskMatrix(int $likelihood, int $consequence, string $controlType): array
    {
        $score = $likelihood * $consequence;
        $rating = 'Low';
        if ($score >= 16) {
            $rating = 'Extreme';
        } elseif ($score >= 10) {
            $rating = 'High';
        } elseif ($score >= 5) {
            $rating = 'Medium';
        }

        $factor = 0.8;
        if ($controlType === 'Elimination') {
            $factor = 0.0;
        } elseif ($controlType === 'Substitution') {
            $factor = 0.3;
        } elseif ($controlType === 'Engineering Controls') {
            $factor = 0.4;
        } elseif ($controlType === 'Administrative Controls') {
            $factor = 0.6;
        }

        $residual = (int) round($score * $factor);
        return ['score' => $score, 'rating' => $rating, 'residual' => $residual];
    }

    private static function computeExpiryBadge(string $expiryDate, string $todayDay): string
    {
        if ($expiryDate === '') {
            return 'Current';
        }
        if ($expiryDate < $todayDay) {
            return 'Expired';
        }
        if ($expiryDate <= WorkspaceController::addDays($todayDay, 30)) {
            return 'Expiring Soon';
        }
        return 'Current';
    }

    /** @return array<string, mixed>|null */
    private static function normalizeIncident(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'lost_time_injury', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeInjury(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'incident_id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeHazard(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'likelihood', 'consequence', 'risk_score', 'residual_risk', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeAction(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'verified_at', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeBasic(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    // ---- Safety & Quality Command ----

    public function getCommandSummary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $in30 = WorkspaceController::addDays($todayDay, 30);

            $openIncidents = array_map(
                [self::class, 'normalizeIncident'],
                $db->query("SELECT * FROM ohs_incidents WHERE investigation_status != 'Closed' ORDER BY incident_date DESC LIMIT 12")
            );
            $extremeHazards = array_map(
                [self::class, 'normalizeHazard'],
                $db->query("SELECT * FROM ohs_hazards WHERE status = 'Open' AND risk_rating IN ('Extreme', 'High') ORDER BY risk_score DESC LIMIT 12")
            );
            $openCapas = array_map(
                [self::class, 'normalizeAction'],
                $db->query("SELECT * FROM ohs_actions WHERE status != 'Verified Closed' ORDER BY due_date ASC LIMIT 12")
            );
            $expTraining = array_map(
                static function (array $row) use ($todayDay): array {
                    $row = self::normalizeBasic($row);
                    $row['expiry_status'] = self::computeExpiryBadge((string) ($row['expiry_date'] ?? ''), $todayDay);
                    return $row;
                },
                $db->query("SELECT * FROM ohs_training WHERE expiry_date != '' AND expiry_date <= ? ORDER BY expiry_date ASC LIMIT 12", [$in30])
            );
            $expContractors = array_map(
                static function (array $row) use ($todayDay): array {
                    $row = self::normalizeBasic($row);
                    $row['compliance_status'] = (($row['public_liability'] ?? '') !== 'Yes')
                        ? 'Insurance Missing'
                        : self::computeExpiryBadge((string) ($row['approval_expiry'] ?? ''), $todayDay);
                    return $row;
                },
                $db->query("SELECT * FROM ohs_contractors WHERE approval_expiry <= ? OR public_liability != 'Yes' ORDER BY approval_expiry ASC LIMIT 12", [$in30])
            );
            $openNcrs = array_map(
                [self::class, 'normalizeBasic'],
                $db->query("SELECT * FROM ohs_ncrs WHERE status != 'Closed' ORDER BY due_date ASC LIMIT 8")
            );
            $openCars = array_map(
                [self::class, 'normalizeBasic'],
                $db->query("SELECT * FROM ohs_cars WHERE status != 'Verified Closed' ORDER BY due_date ASC LIMIT 8")
            );

            return [
                'today' => $todayDay,
                'counts' => WorkspaceController::readBadgeCounts($db, $todayDay),
                'openIncidents' => $openIncidents,
                'extremeHazards' => $extremeHazards,
                'openCapas' => $openCapas,
                'expiringTraining' => $expTraining,
                'expiringContractors' => $expContractors,
                'openNcrs' => $openNcrs,
                'openCars' => $openCars,
            ];
        });
    }

    // ---- Incidents & Injuries ----

    public function listIncidents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeIncident'],
                $db->query('SELECT * FROM ohs_incidents ORDER BY incident_date DESC, id DESC LIMIT 150')
            );
            return ['incidents' => $rows];
        });
    }

    public function addIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['incident_title'] ?? null, 'incident_title', ['max' => 160, 'label' => 'Incident title']);
            $incDate = V::day($input['incident_date'] ?? null, 'incident_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $incTime = V::timeStr($input['incident_time'] ?? null, 'incident_time', ['required' => false, 'fallback' => '09:00']);
            $location = V::text($input['location'] ?? null, 'location', ['max' => 120, 'label' => 'Location']);
            $incType = V::oneOf($input['incident_type'] ?? null, self::INC_TYPES, 'incident_type', ['fallback' => 'Near Miss']);
            $severity = V::oneOf($input['severity'] ?? null, self::INC_SEVS, 'severity', ['fallback' => 'Medium']);
            $lti = V::bool($input['lost_time_injury'] ?? false) ? 1 : 0;
            $status = V::oneOf($input['investigation_status'] ?? null, self::INC_STATUSES, 'investigation_status', ['fallback' => 'Reported']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 2000, 'label' => 'Description']);
            $reportedBy = V::text($input['reported_by'] ?? null, 'reported_by', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $witnesses = V::text($input['witnesses'] ?? null, 'witnesses', ['required' => false, 'max' => 600]);
            $imm = V::text($input['immediate_actions'] ?? null, 'immediate_actions', ['required' => false, 'max' => 1000]);
            $rc = V::text($input['root_cause'] ?? null, 'root_cause', ['required' => false, 'max' => 1000]);
            $code = WorkspaceController::nextCode($db, 'INC');

            $inserted = $db->execute(
                'INSERT INTO ohs_incidents(incident_code, incident_title, incident_date, incident_time, location, incident_type, severity, lost_time_injury, investigation_status, description, reported_by, witnesses, immediate_actions, root_cause, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$code, $title, $incDate, $incTime, $location, $incType, $severity, $lti, $status, $desc, $reportedBy, $witnesses, $imm, $rc, V::now()]
            );
            $row = self::normalizeIncident($db->first('SELECT * FROM ohs_incidents WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['incident' => $row]];
        }, write: true);
    }

    public function setIncidentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_incidents WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $status = V::oneOf($input['investigation_status'] ?? null, self::INC_STATUSES, 'investigation_status');
            $db->execute('UPDATE ohs_incidents SET investigation_status = ? WHERE id = ?', [$status, $id]);
            return ['incident' => self::normalizeIncident($db->first('SELECT * FROM ohs_incidents WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_incidents WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $db->execute('DELETE FROM ohs_injuries WHERE incident_id = ?', [$id]);
            $db->execute('DELETE FROM ohs_incidents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listInjuries(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeInjury'],
                $db->query('SELECT j.*, i.incident_code, i.incident_title FROM ohs_injuries j LEFT JOIN ohs_incidents i ON i.id = j.incident_id ORDER BY j.injury_date DESC, j.id DESC LIMIT 150')
            );
            return ['injuries' => $rows];
        });
    }

    public function addInjury(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $rawIncId = $input['incident_id'] ?? null;
            $incId = ($rawIncId !== null && $rawIncId !== '' && $rawIncId !== 0 && $rawIncId !== '0')
                ? V::rowId($rawIncId, 'incident_id')
                : null;
            if ($incId !== null && !$db->first('SELECT id FROM ohs_incidents WHERE id = ?', [$incId])) {
                HttpException::fail(404, 'incident_not_found', 'Linked incident not found.');
            }
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $injDate = V::day($input['injury_date'] ?? null, 'injury_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $injType = V::oneOf($input['injury_type'] ?? null, self::INJ_TYPES, 'injury_type', ['fallback' => 'Strain / Sprain']);
            $bodyPart = V::text($input['body_part'] ?? null, 'body_part', ['max' => 100, 'label' => 'Body part']);
            $desc = V::text($input['injury_description'] ?? null, 'injury_description', ['required' => false, 'max' => 1500]);
            $treat = V::text($input['treatment'] ?? null, 'treatment', ['max' => 1000, 'label' => 'Treatment']);
            $lostTime = V::oneOf($input['lost_time'] ?? null, ['Yes', 'No'], 'lost_time', ['fallback' => 'No']);
            $ltStart = $lostTime === 'Yes' ? V::day($input['lost_time_start'] ?? null, 'lost_time_start', ['required' => false, 'fallback' => $injDate]) : '';
            $ltEnd = $lostTime === 'Yes' ? V::day($input['lost_time_end'] ?? null, 'lost_time_end', ['required' => false, 'fallback' => '']) : '';
            $rtw = $lostTime === 'Yes' ? V::day($input['rtw_date'] ?? null, 'rtw_date', ['required' => false, 'fallback' => '']) : '';
            $notes = V::text($input['treatment_notes'] ?? null, 'treatment_notes', ['required' => false, 'max' => 1000]);

            $inserted = $db->execute(
                'INSERT INTO ohs_injuries(incident_id, employee_name, injury_date, injury_type, body_part, injury_description, treatment, lost_time, lost_time_start, lost_time_end, rtw_date, treatment_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$incId, $emp, $injDate, $injType, $bodyPart, $desc, $treat, $lostTime, $ltStart, $ltEnd, $rtw, $notes, V::now()]
            );
            if ($incId !== null && $lostTime === 'Yes') {
                $db->execute('UPDATE ohs_incidents SET lost_time_injury = 1 WHERE id = ?', [$incId]);
            }
            $row = self::normalizeInjury($db->first('SELECT * FROM ohs_injuries WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['injury' => $row]];
        }, write: true);
    }

    public function deleteInjury(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_injuries WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Injury record not found.');
            }
            $db->execute('DELETE FROM ohs_injuries WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Hazards & 5x5 Risk Matrix ----

    public function listHazards(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeHazard'],
                $db->query("SELECT * FROM ohs_hazards ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'Controlled' THEN 1 ELSE 2 END, risk_score DESC, id DESC LIMIT 200")
            );
            return ['hazards' => $rows];
        });
    }

    public function addHazard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['hazard_title'] ?? null, 'hazard_title', ['max' => 160, 'label' => 'Hazard title']);
            $location = V::text($input['location'] ?? null, 'location', ['max' => 120, 'label' => 'Location']);
            $hazType = V::oneOf($input['hazard_type'] ?? null, self::HAZ_TYPES, 'hazard_type', ['fallback' => 'Physical']);
            $desc = V::text($input['hazard_description'] ?? null, 'hazard_description', ['required' => false, 'max' => 1500]);
            $reportedBy = V::text($input['reported_by'] ?? null, 'reported_by', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $likelihood = (int) V::int($input['likelihood'] ?? null, 'likelihood', ['min' => 1, 'max' => 5, 'label' => 'Likelihood (1-5)']);
            $consequence = (int) V::int($input['consequence'] ?? null, 'consequence', ['min' => 1, 'max' => 5, 'label' => 'Consequence (1-5)']);
            $ctrlType = V::oneOf($input['control_type'] ?? null, self::CTRL_TYPES, 'control_type', ['fallback' => 'Engineering Controls']);
            $ctrlDesc = V::text($input['control_description'] ?? null, 'control_description', ['required' => false, 'max' => 1500]);
            $status = V::oneOf($input['status'] ?? null, self::HAZ_STATUSES, 'status', ['fallback' => 'Open']);

            $calc = self::computeRiskMatrix($likelihood, $consequence, $ctrlType);
            $inserted = $db->execute(
                'INSERT INTO ohs_hazards(hazard_title, location, hazard_type, hazard_description, reported_by, likelihood, consequence, risk_score, risk_rating, control_type, control_description, residual_risk, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$title, $location, $hazType, $desc, $reportedBy, $likelihood, $consequence, $calc['score'], $calc['rating'], $ctrlType, $ctrlDesc, $calc['residual'], $status, V::now()]
            );
            $row = self::normalizeHazard($db->first('SELECT * FROM ohs_hazards WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['hazard' => $row]];
        }, write: true);
    }

    public function setHazardStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_hazards WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Hazard not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::HAZ_STATUSES, 'status');
            $db->execute('UPDATE ohs_hazards SET status = ? WHERE id = ?', [$status, $id]);
            return ['hazard' => self::normalizeHazard($db->first('SELECT * FROM ohs_hazards WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteHazard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_hazards WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Hazard not found.');
            }
            $db->execute('DELETE FROM ohs_hazards WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Action Items & CAPA Tracker ----

    public function listActions(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeAction'],
                $db->query("SELECT * FROM ohs_actions ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END, due_date ASC LIMIT 200")
            );
            return ['actions' => $rows];
        });
    }

    public function addAction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $title = V::text($input['action_title'] ?? null, 'action_title', ['max' => 160, 'label' => 'Action title']);
            $desc = V::text($input['action_description'] ?? null, 'action_description', ['required' => false, 'max' => 1500]);
            $srcType = V::oneOf($input['source_type'] ?? null, self::ACT_SOURCES, 'source_type', ['fallback' => 'Hazard']);
            $srcRef = V::text($input['source_ref'] ?? null, 'source_ref', ['required' => false, 'max' => 60]);
            $priority = V::oneOf($input['priority'] ?? null, self::ACT_PRIORITIES, 'priority', ['fallback' => 'Medium']);
            $assignee = V::text($input['assigned_to'] ?? null, 'assigned_to', ['max' => 100, 'label' => 'Assigned to']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => WorkspaceController::addDays(V::utcDay(0), 7)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $inserted = $db->execute(
                "INSERT INTO ohs_actions(action_title, action_description, source_type, source_ref, priority, assigned_to, due_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 'Open', ?, 0, ?)",
                [$title, $desc, $srcType, $srcRef, $priority, $assignee, $dueDate, $notes, V::now()]
            );
            $row = self::normalizeAction($db->first('SELECT * FROM ohs_actions WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['action' => $row]];
        }, write: true);
    }

    public function setActionStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_actions WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Action item not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ACT_STATUSES, 'status');
            $verifiedBy = $status === 'Verified Closed' ? (string) ($ctx['member']['display_name'] ?? '') : '';
            $verifiedAt = $status === 'Verified Closed' ? V::now() : 0;
            $db->execute('UPDATE ohs_actions SET status = ?, verified_by = ?, verified_at = ? WHERE id = ?', [$status, $verifiedBy, $verifiedAt, $id]);
            return ['action' => self::normalizeAction($db->first('SELECT * FROM ohs_actions WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteAction(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_actions WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Action item not found.');
            }
            $db->execute('DELETE FROM ohs_actions WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Audits, CARs & NCRs ----

    public function listAudits(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeBasic'],
                $db->query('SELECT * FROM ohs_audits ORDER BY audit_date DESC, id DESC LIMIT 120')
            );
            return ['audits' => $rows];
        });
    }

    public function addAudit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['audit_title'] ?? null, 'audit_title', ['max' => 160, 'label' => 'Audit title']);
            $audType = V::oneOf($input['audit_type'] ?? null, self::AUD_TYPES, 'audit_type', ['fallback' => 'Internal']);
            $audDate = V::day($input['audit_date'] ?? null, 'audit_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $auditor = V::text($input['auditor_name'] ?? null, 'auditor_name', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $scope = V::text($input['scope'] ?? null, 'scope', ['max' => 1200, 'label' => 'Audit scope']);
            $summary = V::text($input['summary'] ?? null, 'summary', ['required' => false, 'max' => 2000]);
            $obs = V::text($input['observations'] ?? null, 'observations', ['required' => false, 'max' => 1500]);
            $findings = V::text($input['findings'] ?? null, 'findings', ['required' => false, 'max' => 2000]);
            $sev = V::oneOf($input['finding_severity'] ?? null, self::AUD_SEVS, 'finding_severity', ['fallback' => 'Observation']);
            $carReq = V::oneOf($input['corrective_actions_required'] ?? null, ['Yes', 'No'], 'corrective_actions_required', ['fallback' => 'No']);
            $followUp = V::day($input['follow_up_date'] ?? null, 'follow_up_date', ['required' => false, 'fallback' => '']);
            $status = $carReq === 'Yes' ? 'Follow-Up Due' : 'Completed';
            $code = WorkspaceController::nextCode($db, 'AUD');

            $inserted = $db->execute(
                'INSERT INTO ohs_audits(audit_code, audit_title, audit_type, audit_date, auditor_name, scope, summary, observations, findings, finding_severity, corrective_actions_required, follow_up_date, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$code, $title, $audType, $audDate, $auditor, $scope, $summary, $obs, $findings, $sev, $carReq, $followUp, $status, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_audits WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['audit' => $row]];
        }, write: true);
    }

    public function deleteAudit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_audits WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Audit not found.');
            }
            $db->execute('DELETE FROM ohs_audits WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listCars(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeBasic'],
                $db->query('SELECT * FROM ohs_cars ORDER BY raised_date DESC, id DESC LIMIT 120')
            );
            return ['cars' => $rows];
        });
    }

    public function addCar(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['car_title'] ?? null, 'car_title', ['max' => 160, 'label' => 'CAR title']);
            $desc = V::text($input['car_description'] ?? null, 'car_description', ['required' => false, 'max' => 1500]);
            $src = V::oneOf($input['source_type'] ?? null, self::CAR_SOURCES, 'source_type', ['fallback' => 'Audit']);
            $srcRef = V::text($input['source_reference'] ?? null, 'source_reference', ['required' => false, 'max' => 60]);
            $raisedBy = V::text($input['raised_by'] ?? null, 'raised_by', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $raisedDate = V::day($input['raised_date'] ?? null, 'raised_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['max' => 100, 'label' => 'Assigned to']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => WorkspaceController::addDays($raisedDate, 14)]);
            $priority = V::oneOf($input['priority'] ?? null, self::ACT_PRIORITIES, 'priority', ['fallback' => 'High']);
            $rc = V::text($input['root_cause'] ?? null, 'root_cause', ['required' => false, 'max' => 1500]);
            $ca = V::text($input['corrective_action'] ?? null, 'corrective_action', ['required' => false, 'max' => 1500]);
            $pa = V::text($input['preventive_action'] ?? null, 'preventive_action', ['required' => false, 'max' => 1500]);
            $code = WorkspaceController::nextCode($db, 'CAR');

            $inserted = $db->execute(
                "INSERT INTO ohs_cars(car_code, car_title, car_description, source_type, source_reference, raised_by, raised_date, assigned_to, due_date, priority, root_cause, corrective_action, preventive_action, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 0, ?)",
                [$code, $title, $desc, $src, $srcRef, $raisedBy, $raisedDate, $assigned, $dueDate, $priority, $rc, $ca, $pa, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_cars WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['car' => $row]];
        }, write: true);
    }

    public function setCarStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_cars WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'CAR not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ACT_STATUSES, 'status');
            $db->execute('UPDATE ohs_cars SET status = ? WHERE id = ?', [$status, $id]);
            return ['car' => self::normalizeBasic($db->first('SELECT * FROM ohs_cars WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteCar(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_cars WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'CAR not found.');
            }
            $db->execute('DELETE FROM ohs_cars WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listNcrs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeBasic'],
                $db->query('SELECT * FROM ohs_ncrs ORDER BY raised_date DESC, id DESC LIMIT 120')
            );
            return ['ncrs' => $rows];
        });
    }

    public function addNcr(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['ncr_title'] ?? null, 'ncr_title', ['max' => 160, 'label' => 'NCR title']);
            $nType = V::oneOf($input['ncr_type'] ?? null, self::NCR_TYPES, 'ncr_type', ['fallback' => 'Process']);
            $desc = V::text($input['ncr_description'] ?? null, 'ncr_description', ['required' => false, 'max' => 1500]);
            $sev = V::oneOf($input['severity'] ?? null, self::NCR_SEVS, 'severity', ['fallback' => 'Minor']);
            $src = V::oneOf($input['source_type'] ?? null, self::NCR_SOURCES, 'source_type', ['fallback' => 'Inspection']);
            $raisedBy = V::text($input['raised_by'] ?? null, 'raised_by', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $raisedDate = V::day($input['raised_date'] ?? null, 'raised_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['max' => 100, 'label' => 'Assigned to']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => WorkspaceController::addDays($raisedDate, 10)]);
            $rc = V::text($input['root_cause'] ?? null, 'root_cause', ['required' => false, 'max' => 1500]);
            $disp = V::oneOf($input['disposition'] ?? null, self::NCR_DISPS, 'disposition', ['fallback' => 'Rework']);
            $ca = V::text($input['corrective_action'] ?? null, 'corrective_action', ['required' => false, 'max' => 1500]);
            $code = WorkspaceController::nextCode($db, 'NCR');

            $inserted = $db->execute(
                "INSERT INTO ohs_ncrs(ncr_code, ncr_title, ncr_type, ncr_description, severity, source_type, raised_by, raised_date, assigned_to, due_date, root_cause, disposition, corrective_action, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 0, ?)",
                [$code, $title, $nType, $desc, $sev, $src, $raisedBy, $raisedDate, $assigned, $dueDate, $rc, $disp, $ca, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_ncrs WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['ncr' => $row]];
        }, write: true);
    }

    public function setNcrStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_ncrs WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'NCR not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::NCR_STATUSES, 'status');
            $db->execute('UPDATE ohs_ncrs SET status = ? WHERE id = ?', [$status, $id]);
            return ['ncr' => self::normalizeBasic($db->first('SELECT * FROM ohs_ncrs WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteNcr(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_ncrs WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'NCR not found.');
            }
            $db->execute('DELETE FROM ohs_ncrs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Training & Competency Matrix ----

    public function listTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                static function (array $row) use ($todayDay): array {
                    $row = self::normalizeBasic($row);
                    $row['expiry_status'] = self::computeExpiryBadge((string) ($row['expiry_date'] ?? ''), $todayDay);
                    return $row;
                },
                $db->query("SELECT * FROM ohs_training ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date ASC, employee_name ASC LIMIT 200")
            );
            return ['training' => $rows];
        });
    }

    public function addTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $course = V::text($input['course_name'] ?? null, 'course_name', ['max' => 160, 'label' => 'Course name']);
            $provider = V::text($input['provider'] ?? null, 'provider', ['required' => false, 'max' => 120]);
            $compDate = V::day($input['completion_date'] ?? null, 'completion_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $expDate = V::day($input['expiry_date'] ?? null, 'expiry_date', ['required' => false, 'fallback' => '']);
            $certNo = V::text($input['certificate_number'] ?? null, 'certificate_number', ['required' => false, 'max' => 60]);
            $mandatory = V::oneOf($input['is_mandatory'] ?? null, ['Yes', 'No'], 'is_mandatory', ['fallback' => 'Yes']);
            $result = V::oneOf($input['assessment_result'] ?? null, ['Passed', 'Failed', 'N/A'], 'assessment_result', ['fallback' => 'Passed']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $inserted = $db->execute(
                'INSERT INTO ohs_training(employee_name, course_name, provider, completion_date, expiry_date, certificate_number, is_mandatory, assessment_result, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$emp, $course, $provider, $compDate, $expDate, $certNo, $mandatory, $result, $notes, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_training WHERE id = ?', [$inserted['lastInsertRowid']]));
            $row['expiry_status'] = self::computeExpiryBadge((string) ($row['expiry_date'] ?? ''), $todayDay);
            return ['__status' => 201, '__body' => ['record' => $row]];
        }, write: true);
    }

    public function deleteTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_training WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Training record not found.');
            }
            $db->execute('DELETE FROM ohs_training WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Contractor Approvals ----

    public function listContractors(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                static function (array $row) use ($todayDay): array {
                    $row = self::normalizeBasic($row);
                    $row['compliance_status'] = (($row['public_liability'] ?? '') !== 'Yes')
                        ? 'Insurance Missing'
                        : self::computeExpiryBadge((string) ($row['approval_expiry'] ?? ''), $todayDay);
                    return $row;
                },
                $db->query('SELECT * FROM ohs_contractors ORDER BY approval_expiry ASC LIMIT 150')
            );
            return ['contractors' => $rows];
        });
    }

    public function addContractor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $biz = V::text($input['business_name'] ?? null, 'business_name', ['max' => 140, 'label' => 'Business name']);
            $trading = V::text($input['trading_name'] ?? null, 'trading_name', ['required' => false, 'max' => 120]);
            $abn = V::text($input['abn'] ?? null, 'abn', ['max' => 30, 'label' => 'ABN']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['max' => 100, 'label' => 'Contact name']);
            $em = V::email($input['contact_email'] ?? null, 'contact_email', ['required' => false]);
            $phone = V::text($input['contact_phone'] ?? null, 'contact_phone', ['required' => false, 'max' => 40]);
            $services = V::text($input['services'] ?? null, 'services', ['max' => 600, 'label' => 'Services provided']);
            $pl = V::oneOf($input['public_liability'] ?? null, ['Yes', 'No'], 'public_liability', ['fallback' => 'Yes']);
            $wc = V::oneOf($input['workers_comp'] ?? null, ['Yes', 'No', 'Exempt (sole trader)'], 'workers_comp', ['fallback' => 'Yes']);
            $lic = V::text($input['licence_details'] ?? null, 'licence_details', ['required' => false, 'max' => 400]);
            $ind = V::oneOf($input['induction_completed'] ?? null, ['Yes', 'No', 'Pending'], 'induction_completed', ['fallback' => 'Yes']);
            $exp = V::day($input['approval_expiry'] ?? null, 'approval_expiry', ['label' => 'Approval / Insurance expiry']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $inserted = $db->execute(
                'INSERT INTO ohs_contractors(business_name, trading_name, abn, contact_name, contact_email, contact_phone, services, public_liability, workers_comp, licence_details, induction_completed, approval_expiry, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$biz, $trading, $abn, $contact, $em, $phone, $services, $pl, $wc, $lic, $ind, $exp, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_contractors WHERE id = ?', [$inserted['lastInsertRowid']]));
            $row['compliance_status'] = (($row['public_liability'] ?? '') !== 'Yes')
                ? 'Insurance Missing'
                : self::computeExpiryBadge((string) ($row['approval_expiry'] ?? ''), $todayDay);
            return ['__status' => 201, '__body' => ['contractor' => $row]];
        }, write: true);
    }

    public function deleteContractor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_contractors WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Contractor not found.');
            }
            $db->execute('DELETE FROM ohs_contractors WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Complaints, Toolbox Talks & Plant Register ----

    public function listComplaints(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeBasic'],
                $db->query('SELECT * FROM ohs_complaints ORDER BY received_date DESC, id DESC LIMIT 120')
            );
            return ['complaints' => $rows];
        });
    }

    public function addComplaint(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $title = V::text($input['complaint_title'] ?? null, 'complaint_title', ['max' => 160, 'label' => 'Complaint title']);
            $cType = V::oneOf($input['complaint_type'] ?? null, self::CMP_TYPES, 'complaint_type', ['fallback' => 'Quality']);
            $src = V::oneOf($input['complaint_source'] ?? null, self::CMP_SOURCES, 'complaint_source', ['fallback' => 'Customer']);
            $name = V::text($input['complainant_name'] ?? null, 'complainant_name', ['required' => false, 'max' => 120]);
            $contact = V::text($input['complainant_contact'] ?? null, 'complainant_contact', ['required' => false, 'max' => 120]);
            $recDate = V::day($input['received_date'] ?? null, 'received_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $desc = V::text($input['complaint_description'] ?? null, 'complaint_description', ['max' => 1500, 'label' => 'Description']);
            $priority = V::oneOf($input['priority'] ?? null, self::ACT_PRIORITIES, 'priority', ['fallback' => 'Medium']);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 100]);
            $inv = V::text($input['investigation'] ?? null, 'investigation', ['required' => false, 'max' => 1000]);
            $resText = V::text($input['resolution'] ?? null, 'resolution', ['required' => false, 'max' => 1000]);

            $inserted = $db->execute(
                "INSERT INTO ohs_complaints(complaint_title, complaint_type, complaint_source, complainant_name, complainant_contact, received_date, complaint_description, priority, assigned_to, investigation, resolution, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 0, ?)",
                [$title, $cType, $src, $name, $contact, $recDate, $desc, $priority, $assigned, $inv, $resText, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_complaints WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['complaint' => $row]];
        }, write: true);
    }

    public function setComplaintStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_complaints WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Complaint not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::CMP_STATUSES, 'status');
            $db->execute('UPDATE ohs_complaints SET status = ? WHERE id = ?', [$status, $id]);
            return ['complaint' => self::normalizeBasic($db->first('SELECT * FROM ohs_complaints WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteComplaint(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_complaints WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Complaint not found.');
            }
            $db->execute('DELETE FROM ohs_complaints WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listMeetings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeBasic'],
                $db->query('SELECT * FROM ohs_meetings ORDER BY meeting_date DESC, id DESC LIMIT 120')
            );
            return ['meetings' => $rows];
        });
    }

    public function addMeeting(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['meeting_title'] ?? null, 'meeting_title', ['max' => 160, 'label' => 'Meeting title']);
            $mType = V::oneOf($input['meeting_type'] ?? null, self::MTG_TYPES, 'meeting_type', ['fallback' => 'Toolbox Talk']);
            $mDate = V::day($input['meeting_date'] ?? null, 'meeting_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $mTime = V::timeStr($input['meeting_time'] ?? null, 'meeting_time', ['required' => false, 'fallback' => '07:00']);
            $loc = V::text($input['location'] ?? null, 'location', ['required' => false, 'max' => 120]);
            $fac = V::text($input['facilitator'] ?? null, 'facilitator', ['required' => false, 'max' => 100]) ?: (string) ($ctx['member']['display_name'] ?? '');
            $att = V::text($input['attendees'] ?? null, 'attendees', ['required' => false, 'max' => 1000]);
            $ag = V::text($input['agenda'] ?? null, 'agenda', ['required' => false, 'max' => 1200]);
            $min = V::text($input['minutes'] ?? null, 'minutes', ['required' => false, 'max' => 2000]);
            $acts = V::text($input['action_items'] ?? null, 'action_items', ['required' => false, 'max' => 1000]);

            $inserted = $db->execute(
                'INSERT INTO ohs_meetings(meeting_title, meeting_type, meeting_date, meeting_time, location, facilitator, attendees, agenda, minutes, action_items, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$title, $mType, $mDate, $mTime, $loc, $fac, $att, $ag, $min, $acts, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_meetings WHERE id = ?', [$inserted['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['meeting' => $row]];
        }, write: true);
    }

    public function deleteMeeting(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_meetings WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Meeting not found.');
            }
            $db->execute('DELETE FROM ohs_meetings WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listPlant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                static function (array $row) use ($todayDay): array {
                    $row = self::normalizeBasic($row);
                    $row['service_status'] = self::computeExpiryBadge((string) ($row['next_service_date'] ?? ''), $todayDay);
                    return $row;
                },
                $db->query("SELECT * FROM ohs_plant ORDER BY CASE WHEN next_service_date = '' THEN 1 ELSE 0 END, next_service_date ASC LIMIT 150")
            );
            return ['plant' => $rows];
        });
    }

    public function addPlant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['asset_name'] ?? null, 'asset_name', ['max' => 140, 'label' => 'Asset name']);
            $cat = V::oneOf($input['category'] ?? null, self::PLANT_CATS, 'category', ['fallback' => 'Forklift']);
            $mfr = V::text($input['manufacturer'] ?? null, 'manufacturer', ['required' => false, 'max' => 80]);
            $model = V::text($input['model'] ?? null, 'model', ['required' => false, 'max' => 80]);
            $sn = V::text($input['serial_number'] ?? null, 'serial_number', ['required' => false, 'max' => 80]);
            $pDate = V::day($input['purchase_date'] ?? null, 'purchase_date', ['required' => false, 'fallback' => '']);
            $loc = V::text($input['equipment_location'] ?? null, 'equipment_location', ['required' => false, 'max' => 120]);
            $lastSvc = V::day($input['last_service_date'] ?? null, 'last_service_date', ['required' => false, 'fallback' => '']);
            $nextSvc = V::day($input['next_service_date'] ?? null, 'next_service_date', ['required' => false, 'fallback' => '']);
            $freq = V::oneOf($input['inspection_frequency'] ?? null, self::PLANT_FREQS, 'inspection_frequency', ['fallback' => 'Monthly']);
            $regNo = V::text($input['registration_number'] ?? null, 'registration_number', ['required' => false, 'max' => 60]);
            $regExp = V::day($input['registration_expiry'] ?? null, 'registration_expiry', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $inserted = $db->execute(
                'INSERT INTO ohs_plant(asset_name, category, manufacturer, model, serial_number, purchase_date, equipment_location, last_service_date, next_service_date, inspection_frequency, registration_number, registration_expiry, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $cat, $mfr, $model, $sn, $pDate, $loc, $lastSvc, $nextSvc, $freq, $regNo, $regExp, $notes, V::now()]
            );
            $row = self::normalizeBasic($db->first('SELECT * FROM ohs_plant WHERE id = ?', [$inserted['lastInsertRowid']]));
            $row['service_status'] = self::computeExpiryBadge((string) ($row['next_service_date'] ?? ''), $todayDay);
            return ['__status' => 201, '__body' => ['asset' => $row]];
        }, write: true);
    }

    public function deletePlant(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ohs_plant WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Plant record not found.');
            }
            $db->execute('DELETE FROM ohs_plant WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
