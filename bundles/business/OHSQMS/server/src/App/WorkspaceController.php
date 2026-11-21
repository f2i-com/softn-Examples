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
    private const OHS_ROLES = ['owner', 'manager', 'safety_officer', 'auditor', 'worker'];
    private const OHS_MEMBER_ROLES = ['manager', 'safety_officer', 'auditor', 'worker'];
    private const OHS_PRESETS = ['amber', 'navy', 'emerald', 'crimson'];
    private const OHS_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];

    private const SAMPLE_TABLES = [
        'ohs_injuries',
        'ohs_incidents',
        'ohs_hazards',
        'ohs_actions',
        'ohs_audits',
        'ohs_cars',
        'ohs_ncrs',
        'ohs_training',
        'ohs_contractors',
        'ohs_complaints',
        'ohs_meetings',
        'ohs_plant',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'seq_counter', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row) && $row[$intCol] !== null) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('tax_rate', $row) && $row['tax_rate'] !== null) {
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
            if (array_key_exists($intCol, $row) && $row[$intCol] !== null) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    public static function addDays(string $isoDay, int $delta): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $isoDay, $m)) {
            return V::utcDay($delta);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $y -= ($mo <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($mo + ($mo > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $delta;
        return gmdate('Y-m-d', $z * 86400);
    }

    public static function nextCode(Database $db, string $prefix): string
    {
        $row = Context::getBusinessSettings($db);
        $base = ($row && !empty($row['seq_counter'])) ? (int) $row['seq_counter'] : 100;
        $seq = $base + 1;
        $db->execute('UPDATE business_settings SET seq_counter = ? WHERE id = 1', [$seq]);
        return $prefix . '-' . $seq;
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

    /** @return array<string, int> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $in30 = self::addDays($todayDay, 30);
        $openInc = $db->first("SELECT COUNT(*) AS c FROM ohs_incidents WHERE investigation_status != 'Closed'");
        $ltiCount = $db->first('SELECT COUNT(*) AS c FROM ohs_incidents WHERE lost_time_injury = 1');
        $highHaz = $db->first("SELECT COUNT(*) AS c FROM ohs_hazards WHERE status = 'Open' AND risk_rating IN ('High', 'Extreme')");
        $overdueCapa = $db->first("SELECT COUNT(*) AS c FROM ohs_actions WHERE status != 'Verified Closed' AND due_date < ?", [$todayDay]);
        $openCapa = $db->first("SELECT COUNT(*) AS c FROM ohs_actions WHERE status != 'Verified Closed'");
        $openCars = $db->first("SELECT COUNT(*) AS c FROM ohs_cars WHERE status != 'Verified Closed'");
        $openNcrs = $db->first("SELECT COUNT(*) AS c FROM ohs_ncrs WHERE status != 'Closed'");
        $expTrain = $db->first("SELECT COUNT(*) AS c FROM ohs_training WHERE is_mandatory = 'Yes' AND expiry_date != '' AND expiry_date <= ?", [$in30]);
        $expCon = $db->first("SELECT COUNT(*) AS c FROM ohs_contractors WHERE approval_expiry <= ? OR public_liability != 'Yes'", [$in30]);
        $plantDue = $db->first("SELECT COUNT(*) AS c FROM ohs_plant WHERE next_service_date != '' AND next_service_date <= ?", [$in30]);

        return [
            'openIncidents' => $openInc ? (int) $openInc['c'] : 0,
            'ltiCount' => $ltiCount ? (int) $ltiCount['c'] : 0,
            'highHazards' => $highHaz ? (int) $highHaz['c'] : 0,
            'overdueCapas' => $overdueCapa ? (int) $overdueCapa['c'] : 0,
            'openCapas' => $openCapa ? (int) $openCapa['c'] : 0,
            'openQuality' => ($openCars ? (int) $openCars['c'] : 0) + ($openNcrs ? (int) $openNcrs['c'] : 0),
            'expiringTraining' => $expTrain ? (int) $expTrain['c'] : 0,
            'expiringContractors' => $expCon ? (int) $expCon['c'] : 0,
            'plantDue' => $plantDue ? (int) $plantDue['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedOhsSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        // Incidents & Injuries
        $db->execute(
            'INSERT INTO ohs_incidents(incident_code, incident_title, incident_date, incident_time, location, incident_type, severity, lost_time_injury, investigation_status, description, reported_by, witnesses, immediate_actions, root_cause, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'INC-101',
                'Forklift Pedestrian Near Miss — Loading Bay 2',
                self::addDays($todayDay, -4),
                '10:25',
                'Warehouse Bay 2',
                'Near Miss',
                'High',
                0,
                'Investigating',
                'Counterbalance forklift reversed out of aisle 4 while contractor crossed unmarked walkway.',
                'Darren Brooks',
                'Tessa Nguyen',
                'Halted bay traffic, erected temporary bollards and briefed forklift operators.',
                'Faded floor line markings and blind corner mirror misaligned.',
                $ts - 86400 * 4,
            ]
        );

        $inc2 = $db->execute(
            'INSERT INTO ohs_incidents(incident_code, incident_title, incident_date, incident_time, location, incident_type, severity, lost_time_injury, investigation_status, description, reported_by, witnesses, immediate_actions, root_cause, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'INC-102',
                'Manual Handling Lower Back Strain — Dispatch Dock',
                self::addDays($todayDay, -11),
                '14:10',
                'Dispatch Bay A',
                'Injury',
                'High',
                1,
                'Actions Assigned',
                'Operator lifted 32kg valve crate manually when scissor lift table was awaiting repair.',
                'Shane Carter',
                'Kylie Adams',
                'First aid administered; worker transported to occupational clinic; lift table tagged out.',
                'Scissor lift breakdown not escalated to maintenance; manual lift exceeded 20kg SOP limit.',
                $ts - 86400 * 11,
            ]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO ohs_incidents(incident_code, incident_title, incident_date, incident_time, location, incident_type, severity, lost_time_injury, investigation_status, description, reported_by, witnesses, immediate_actions, root_cause, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'INC-103',
                'Coolant Bund Overflow — CNC Machine #4',
                self::addDays($todayDay, -20),
                '08:40',
                'Machining Shop',
                'Environmental',
                'Medium',
                0,
                'Closed',
                '15L soluble cutting fluid overflowed secondary tray during sump flush.',
                'Priya Nair',
                '',
                'Spill kit deployed immediately; zero drain ingress; floor degreased.',
                'Float switch stuck open during automated refill.',
                $ts - 86400 * 20,
            ]
        );

        $db->execute(
            'INSERT INTO ohs_injuries(incident_id, employee_name, injury_date, injury_type, body_part, injury_description, treatment, lost_time, lost_time_start, lost_time_end, rtw_date, treatment_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $inc2,
                'Shane Carter',
                self::addDays($todayDay, -11),
                'Strain / Sprain',
                'Lower back (lumbar)',
                'Acute lumbar strain following manual lift of 32kg crate.',
                'Occupational GP review, anti-inflammatory plan, physiotherapy 2x/wk.',
                'Yes',
                self::addDays($todayDay, -10),
                self::addDays($todayDay, -5),
                self::addDays($todayDay, 4),
                'Cleared for suitable light duties (no lifting >5kg) until RTW review.',
                $ts - 86400 * 11,
            ]
        );

        // Hazards across 5x5 Matrix cells (Low 1-4, Medium 5-9, High 10-15, Extreme 16-25)
        $hazards = [
            ['Unmarked Pedestrian Crossing at Forklift Exit', 'Warehouse Bay 2', 'Physical', 'Shared pedestrian/forklift lane with blind racking corner.', 'Darren Brooks', 4, 5, 20, 'Extreme', 'Engineering Controls', 'Install physical Armco guardrails, convex mirror & flashing proximity gate.', 8, 'Open'],
            ['Frayed 3-Phase Welding Lead — Fab Bay 3', 'Fabrication Workshop', 'Physical', 'Exposed copper sheath near wet washdown zone.', 'Kylie Adams', 4, 4, 16, 'Extreme', 'Elimination', 'Lock out / tag out immediately and replace with certified heavy-duty lead.', 0, 'Open'],
            ['Solvent Fume Build-Up in Paint Booth', 'Finishing Line', 'Chemical', 'Extraction fan airflow dropped below 0.5 m/s during peak coat.', 'Priya Nair', 3, 4, 12, 'High', 'Engineering Controls', 'Replace intake filters and add differential pressure alarm.', 5, 'Open'],
            ['Manual Lifting of 25kg Resin Bags', 'Raw Materials Store', 'Ergonomic', 'Repetitive bending from floor pallets onto hopper platform.', 'Tessa Nguyen', 3, 3, 9, 'Medium', 'Substitution', 'Switch to vacuum bag lifter & elevated scissor palletizer.', 3, 'Controlled'],
            ['Glare on QA Inspection Bench', 'Quality Lab', 'Ergonomic', 'Afternoon sun glare reducing micro-defect detection accuracy.', 'Hannah Reid', 2, 2, 4, 'Low', 'Administrative Controls', 'Install anti-glare roller blinds and diffused LED task bars.', 2, 'Controlled'],
        ];
        $hazLen = count($hazards);
        foreach ($hazards as $h => $hz) {
            $db->execute(
                'INSERT INTO ohs_hazards(hazard_title, location, hazard_type, hazard_description, reported_by, likelihood, consequence, risk_score, risk_rating, control_type, control_description, residual_risk, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$hz[0], $hz[1], $hz[2], $hz[3], $hz[4], $hz[5], $hz[6], $hz[7], $hz[8], $hz[9], $hz[10], $hz[11], $hz[12], $ts - ($hazLen - $h) * 86400]
            );
        }

        // Action Items & CAPA Tracker (Open -> In Progress -> Verified Closed)
        $actions = [
            ['Install Armco guardrails & blue-spot lights in Bay 2', 'Physical pedestrian segregation following near-miss INC-101.', 'Incident', 'INC-101', 'Critical', 'Facilities Lead', self::addDays($todayDay, -2), 'Open', '', 0, 'Overdue — steel delivery confirmed for tomorrow morning.'],
            ['Service Dispatch Bay A hydraulic scissor lift', 'Repair pressure seal and return lift table to service.', 'Incident', 'INC-102', 'High', 'Maintenance Team', self::addDays($todayDay, 3), 'In Progress', '', 0, 'Seal kit fitted; awaiting load-test certification.'],
            ['Calibrate Paint Booth extraction airflow alarm', 'Add low-flow audible/visual lockout on Booth 1.', 'Hazard', 'HAZ-3', 'High', 'Darren Brooks', self::addDays($todayDay, 7), 'Open', '', 0, ''],
            ['Replace CNC #4 sump float switch', 'Prevent coolant bund overflow during night shift.', 'Incident', 'INC-103', 'Medium', 'Maintenance Team', self::addDays($todayDay, -12), 'Verified Closed', 'Quality Manager', $ts - 86400 * 10, 'Verified leak-free over 5 consecutive shifts.'],
        ];
        $actLen = count($actions);
        foreach ($actions as $a => $ac) {
            $db->execute(
                'INSERT INTO ohs_actions(action_title, action_description, source_type, source_ref, priority, assigned_to, due_date, status, verified_by, verified_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$ac[0], $ac[1], $ac[2], $ac[3], $ac[4], $ac[5], $ac[6], $ac[7], $ac[8], $ac[9], $ac[10], $ts - ($actLen - $a) * 43200]
            );
        }

        // Audits, CARs & NCRs
        $db->execute(
            'INSERT INTO ohs_audits(audit_code, audit_title, audit_type, audit_date, auditor_name, scope, summary, observations, findings, finding_severity, corrective_actions_required, follow_up_date, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'AUD-101',
                'Q4 ISO 45001 & 9001 Internal Surveillance Audit',
                'Internal',
                self::addDays($todayDay, -14),
                'Rachel Kim (Lead Auditor)',
                'Warehouse operations, CNC machining, calibration logs & contractor inductions.',
                'Strong safety culture on floor; two findings raised on gauge calibration traceability and Bay 2 traffic segregation.',
                'Toolbox talks consistently documented weekly.',
                '1 Major NC on expired micrometre calibration stickers; 1 Minor NC on pedestrian walkway markings.',
                'Major Non-Conformance',
                'Yes',
                self::addDays($todayDay, 21),
                'Follow-Up Due',
                $ts - 86400 * 14,
            ]
        );

        $db->execute(
            'INSERT INTO ohs_cars(car_code, car_title, car_description, source_type, source_reference, raised_by, raised_date, assigned_to, due_date, priority, root_cause, corrective_action, preventive_action, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'CAR-101',
                'Out-of-Calibration Micrometres on CNC Cell B',
                'Three digital micrometres found 18 days past annual NATA calibration date during ISO 9001 audit.',
                'Audit',
                'AUD-101',
                'Rachel Kim',
                self::addDays($todayDay, -13),
                'Quality Engineer',
                self::addDays($todayDay, 5),
                'High',
                'Manual spreadsheet reminder missed while QA coordinator was on leave.',
                'Quarantine gauges, send for urgent NATA calibration, re-inspect last 2 batches.',
                'Move all calibration due dates into automated monthly plant register checks.',
                'In Progress',
                $ts - 86400 * 13,
            ]
        );

        $db->execute(
            'INSERT INTO ohs_ncrs(ncr_code, ncr_title, ncr_type, ncr_description, severity, source_type, raised_by, raised_date, assigned_to, due_date, root_cause, disposition, corrective_action, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'NCR-101',
                'Anodising Batch #4428 Coating Thickness Under Spec',
                'Supplier',
                '14 of 50 precision housings measured 11 microns vs 18 micron drawing minimum.',
                'Major',
                'Inspection',
                'Priya Nair',
                self::addDays($todayDay, -6),
                'Procurement & QA',
                self::addDays($todayDay, 4),
                'Supplier anodising bath temperature drifted below specification.',
                'Return to Supplier',
                'Quarantined batch #4428; supplier issued 8D root cause & free strip/re-anodise.',
                'Open',
                $ts - 86400 * 6,
            ]
        );

        // Training & Competency Matrix
        $training = [
            ['Darren Brooks', 'High Risk Work — Forklift (LF)', 'SafeWork Accredited RTO', self::addDays($todayDay, -350), self::addDays($todayDay, 15), 'LF-882410', 'Yes', 'Passed', 'Renewal booked in 10 days.'],
            ['Shane Carter', 'First Aid & CPR (HLTAID011)', 'St John Ambulance', self::addDays($todayDay, -375), self::addDays($todayDay, -10), 'FA-29018', 'Yes', 'Passed', 'EXPIRED — refresher required before shift lead duty.'],
            ['Priya Nair', 'ISO 9001:2015 Internal Auditor', 'SAI Global', self::addDays($todayDay, -180), self::addDays($todayDay, 550), 'ISO-44910', 'Yes', 'Passed', 'Current.'],
            ['Tessa Nguyen', 'Working at Heights (RIIWHS204E)', 'HeightSafe Training', self::addDays($todayDay, -345), self::addDays($todayDay, 20), 'WAH-77102', 'Yes', 'Passed', 'Expiring within 30 days.'],
            ['Kylie Adams', 'Spill Response & HazMat Awareness', 'ChemSafe Australia', self::addDays($todayDay, -90), self::addDays($todayDay, 275), 'HZ-10294', 'No', 'Passed', 'Current.'],
        ];
        $trLen = count($training);
        foreach ($training as $tr => $r) {
            $db->execute(
                'INSERT INTO ohs_training(employee_name, course_name, provider, completion_date, expiry_date, certificate_number, is_mandatory, assessment_result, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$r[0], $r[1], $r[2], $r[3], $r[4], $r[5], $r[6], $r[7], $r[8], $ts - ($trLen - $tr) * 3600]
            );
        }

        // Contractors
        $db->execute(
            'INSERT INTO ohs_contractors(business_name, trading_name, abn, contact_name, contact_email, contact_phone, services, public_liability, workers_comp, licence_details, induction_completed, approval_expiry, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Southern Cross Electrical Pty Ltd',
                'SC Electrical',
                '51 824 753 556',
                'Brett Dawson',
                'brett@scelectrical.example.com',
                '0411 229 880',
                '3-Phase Industrial Electrical & Tag/Test',
                'Yes',
                'Yes',
                'EC-449201 · $20M Public Liability',
                'Yes',
                self::addDays($todayDay, 14),
                $ts - 86400 * 15,
            ]
        );
        $db->execute(
            'INSERT INTO ohs_contractors(business_name, trading_name, abn, contact_name, contact_email, contact_phone, services, public_liability, workers_comp, licence_details, induction_completed, approval_expiry, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Metro Forklift Hydraulics',
                'Metro Lift',
                '39 102 884 219',
                'Gina Rossi',
                'service@metrolift.example.com',
                '0422 901 445',
                'Forklift & Scissor Lift Preventive Maintenance',
                'Yes',
                'Yes',
                'Certified Plant Mechanic · $20M PL',
                'Yes',
                self::addDays($todayDay, 220),
                $ts - 86400 * 10,
            ]
        );

        // Complaints
        $db->execute(
            'INSERT INTO ohs_complaints(complaint_title, complaint_type, complaint_source, complainant_name, complainant_contact, received_date, complaint_description, priority, assigned_to, investigation, resolution, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Delayed QA Certificate Pack on Order #8841',
                'Quality',
                'Customer',
                'Pacific Rail Engineering',
                'qa@pacificrail.example.com',
                self::addDays($todayDay, -3),
                'Material test certificates were missing from pallet #3 upon goods receipt.',
                'High',
                'Quality Manager',
                'Traceability sheet was scanned into wrong job folder.',
                'Re-issued full certified mill & inspection pack within 4 hours.',
                'Investigating',
                $ts - 86400 * 3,
            ]
        );

        // Toolbox Talks / Meetings
        $db->execute(
            'INSERT INTO ohs_meetings(meeting_title, meeting_type, meeting_date, meeting_time, location, facilitator, attendees, agenda, minutes, action_items, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Weekly Warehouse Forklift & Pedestrian Segregation Talk',
                'Toolbox Talk',
                self::addDays($todayDay, -2),
                '07:00',
                'Warehouse Bay 2',
                'Darren Brooks',
                'Darren Brooks, Tessa Nguyen, Kylie Adams, Brett Dawson (SC Electrical)',
                'Review INC-101 near miss; temporary exclusion bollards; 5 km/h speed limit & horn at aisles.',
                'All 4 operators signed acknowledgement. Temporary cones confirmed effective until Armco barrier install.',
                'Verify Armco install by Friday; refresh high-vis vests for contractors.',
                $ts - 86400 * 2,
            ]
        );

        // Plant & Equipment Register
        $db->execute(
            'INSERT INTO ohs_plant(asset_name, category, manufacturer, model, serial_number, purchase_date, equipment_location, last_service_date, next_service_date, inspection_frequency, registration_number, registration_expiry, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Toyota 2.5T Electric Counterbalance Forklift',
                'Forklift',
                'Toyota',
                '8FBE25',
                'TY-884102',
                '2023-06-15',
                'Warehouse Bay 2',
                self::addDays($todayDay, -85),
                self::addDays($todayDay, 5),
                'Monthly',
                'FLT-02',
                self::addDays($todayDay, 190),
                'Quarterly brake & mast chain service due in 5 days.',
                $ts - 86400 * 8,
            ]
        );
        $db->execute(
            'INSERT INTO ohs_plant(asset_name, category, manufacturer, model, serial_number, purchase_date, equipment_location, last_service_date, next_service_date, inspection_frequency, registration_number, registration_expiry, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                '5-Tonne Overhead Bridge Crane #1',
                'Crane / Lifting',
                'Demag',
                'EKKE-5T',
                'DM-44901',
                '2021-11-01',
                'Fabrication Workshop',
                self::addDays($todayDay, -170),
                self::addDays($todayDay, 12),
                'Quarterly',
                'CRN-001',
                self::addDays($todayDay, 12),
                'Annual WorkSafe crane registration & NDT hook test due in 12 days.',
                $ts - 86400 * 6,
            ]
        );

        $db->execute('UPDATE business_settings SET seq_counter = 105 WHERE id = 1 AND seq_counter < 105');
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
                    'me' => ['userId' => $me['userId'], 'isOwner' => $me['isOwner'], 'role' => $me['isOwner'] ? 'owner' : ''],
                    'settings' => $settings,
                    'counts' => null,
                ];
            }
            $member = self::normalizeMember(Context::getTeamMember($db, (string) $me['userId']));
            if ($me['isOwner'] && !$member) {
                $member = [
                    'user_id' => $me['userId'],
                    'display_name' => $settings['owner_name'] ?: 'HSE Director',
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
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Organization name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'ISO 45001 Safety & ISO 9001 Quality';
            $currency = V::oneOf($input['currency'] ?? null, self::OHS_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::OHS_PRESETS, 'brand_preset', ['fallback' => 'amber']);
            $isoCert = V::text($input['iso_cert_ref'] ?? null, 'iso_cert_ref', ['required' => false, 'max' => 80]) ?: 'ISO 45001 / ISO 9001';
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, iso_cert_ref = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $isoCert, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, iso_cert_ref, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $isoCert, $ts]
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
                self::seedOhsSample($db, $todayDay);
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
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120]);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $isoCert = V::text($input['iso_cert_ref'] ?? null, 'iso_cert_ref', ['required' => false, 'max' => 80]) ?: (string) ($cur['iso_cert_ref'] ?? '');
            $currency = V::oneOf($input['currency'] ?? null, self::OHS_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::OHS_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, iso_cert_ref = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $isoCert, $currency, $taxRate, $timezone, $preset, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This OHS & QMS workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::OHS_MEMBER_ROLES, 'requested_role', ['fallback' => 'worker']);
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
            $role = V::oneOf($input['role'] ?? null, self::OHS_MEMBER_ROLES, 'role', ['fallback' => $target['role']]);
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
            return [
                'sampleCount' => self::seedOhsSample($db, $todayDay),
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::SAMPLE_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return [
                'sampleCount' => 0,
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }
}
