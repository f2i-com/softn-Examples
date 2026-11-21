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

final class TalentController
{
    public const POSITIONS = [
        'Software Engineer',
        'Product Designer',
        'Marketing Specialist',
        'Account Executive',
        'Operations Manager',
        'Finance Analyst',
        'HR Generalist',
        'Other',
    ];

    public const REF_SOURCES = [
        'Job Board',
        'LinkedIn',
        'Employee Referral',
        'Company Website',
        'Other',
    ];

    public const CAND_STAGES = [
        'Applied',
        'Screening',
        'Interview',
        'Offer',
        'Hired',
        'Declined',
    ];

    public const INT_TYPES = [
        'Phone Screen',
        'Technical',
        'Behavioral',
        'Panel',
        'Final',
    ];

    public const INT_RECS = [
        'Strong Hire',
        'Hire',
        'Mixed',
        'No Hire',
        'Strong No Hire',
    ];

    public const DEPARTMENTS = [
        'Engineering',
        'Design',
        'Marketing',
        'Sales',
        'Operations',
        'Finance',
        'Human Resources',
        'Other',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeCandidate(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'salary_expectations_cents', 'is_sample', 'created_at', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeScorecard(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'candidate_id', 'technical_skills', 'communication', 'culture_fit', 'problem_solving', 'is_sample', 'created_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('overall_score', $row)) {
            $row['overall_score'] = (float) $row['overall_score'];
        }
        return $row;
    }

    // ---- People Ops Today (Approvals Inbox) ----

    public function getPeopleToday(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);

            $pendingLeave = array_map(
                [PeopleOpsController::class, 'normalizeLeave'],
                $db->query("SELECT * FROM leave_requests WHERE status = 'Pending' ORDER BY start_date ASC")
            );
            $pendingExpenses = array_map(
                [PeopleOpsController::class, 'normalizeExpense'],
                $db->query("SELECT * FROM expense_claims WHERE status = 'Pending' ORDER BY expense_date DESC")
            );
            $pendingTraining = array_map(
                [PeopleOpsController::class, 'normalizeTraining'],
                $db->query("SELECT * FROM training_requests WHERE status = 'Pending' ORDER BY start_date ASC")
            );
            $activeCandidates = array_map(
                [self::class, 'normalizeCandidate'],
                $db->query("SELECT * FROM candidates WHERE stage IN ('Applied', 'Screening', 'Interview', 'Offer') ORDER BY updated_at DESC LIMIT 12")
            );
            $onbs = $db->query('SELECT * FROM onboardings ORDER BY start_date DESC LIMIT 12');
            $inProgressOnb = [];
            foreach ($onbs as $row) {
                $ob = WorkspaceController::hydrateOnboarding($row);
                if ($ob !== null && (int) $ob['completion_pct'] < 100) {
                    $inProgressOnb[] = $ob;
                }
            }

            return [
                'counts' => WorkspaceController::readBadgeCounts($db),
                'pendingLeave' => $pendingLeave,
                'pendingExpenses' => $pendingExpenses,
                'pendingTraining' => $pendingTraining,
                'activeCandidates' => $activeCandidates,
                'inProgressOnboardings' => $inProgressOnb,
            ];
        });
    }

    // ---- Recruitment Pipeline & Linked Interview Scorecards ----

    public function listCandidates(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $cands = $db->query('SELECT * FROM candidates ORDER BY updated_at DESC, id DESC');
            $scores = $db->query('SELECT * FROM interview_scorecards ORDER BY interview_date DESC, created_at DESC');

            $byCand = [];
            foreach ($scores as $sc) {
                $norm = self::normalizeScorecard($sc);
                $cid = (string) $norm['candidate_id'];
                if (!isset($byCand[$cid])) {
                    $byCand[$cid] = [];
                }
                $byCand[$cid][] = $norm;
            }

            $out = [];
            foreach ($cands as $c) {
                $norm = self::normalizeCandidate($c);
                $list = $byCand[(string) $norm['id']] ?? [];
                $norm['scorecards'] = $list;
                if (count($list) > 0) {
                    $sum = 0.0;
                    foreach ($list as $sc) {
                        $sum += (float) ($sc['overall_score'] ?? 0);
                    }
                    $norm['avg_score'] = round(($sum / count($list)) * 10.0) / 10.0;
                } else {
                    $norm['avg_score'] = null;
                }
                $out[] = $norm;
            }

            return ['candidates' => $out];
        });
    }

    public function addCandidate(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $first = V::text($input['first_name'] ?? null, 'first_name', ['max' => 80, 'label' => 'First name']);
            $last = V::text($input['last_name'] ?? null, 'last_name', ['max' => 80, 'label' => 'Last name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $pos = V::oneOf($input['position'] ?? null, self::POSITIONS, 'position', ['fallback' => 'Software Engineer']);
            $cover = V::text($input['cover_letter'] ?? null, 'cover_letter', ['required' => false, 'max' => 2000]);
            $avail = V::day($input['availability_date'] ?? null, 'availability_date', ['required' => false, 'fallback' => V::utcDay(14)]);
            $sal = V::moneyCents($input['salary_expectations'] ?? null, 'salary_expectations', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0]);
            $ref = V::oneOf($input['referral_source'] ?? null, self::REF_SOURCES, 'referral_source', ['fallback' => 'LinkedIn']);
            $stage = V::oneOf($input['stage'] ?? null, self::CAND_STAGES, 'stage', ['fallback' => 'Applied']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO candidates(first_name, last_name, email, phone, position, cover_letter, availability_date, salary_expectations_cents, referral_source, stage, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$first, $last, $em, $phone, $pos, $cover, $avail, $sal, $ref, $stage, $ts, $ts]
            );
            $row = self::normalizeCandidate($db->first('SELECT * FROM candidates WHERE id = ?', [$created['lastInsertRowid']]));
            $row['scorecards'] = [];
            $row['avg_score'] = null;
            return ['__status' => 201, '__body' => ['candidate' => $row]];
        }, write: true);
    }

    public function saveCandidate(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::normalizeCandidate($db->first('SELECT * FROM candidates WHERE id = ?', [$id]));
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Candidate not found.');
            }
            $first = V::text($input['first_name'] ?? null, 'first_name', ['max' => 80]);
            $last = V::text($input['last_name'] ?? null, 'last_name', ['max' => 80]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $pos = V::oneOf($input['position'] ?? null, self::POSITIONS, 'position', ['fallback' => $cur['position']]);
            $cover = V::text($input['cover_letter'] ?? null, 'cover_letter', ['required' => false, 'max' => 2000]);
            $avail = V::day($input['availability_date'] ?? null, 'availability_date', ['required' => false, 'fallback' => $cur['availability_date']]);
            $sal = array_key_exists('salary_expectations', $input)
                ? V::moneyCents($input['salary_expectations'], 'salary_expectations', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                : (int) $cur['salary_expectations_cents'];
            $ref = V::oneOf($input['referral_source'] ?? null, self::REF_SOURCES, 'referral_source', ['fallback' => $cur['referral_source']]);
            $stage = V::oneOf($input['stage'] ?? null, self::CAND_STAGES, 'stage', ['fallback' => $cur['stage']]);

            $db->execute(
                'UPDATE candidates SET first_name = ?, last_name = ?, email = ?, phone = ?, position = ?, cover_letter = ?, availability_date = ?, salary_expectations_cents = ?, referral_source = ?, stage = ?, updated_at = ? WHERE id = ?',
                [$first, $last, $em, $phone, $pos, $cover, $avail, $sal, $ref, $stage, V::now(), $id]
            );
            return ['candidate' => self::normalizeCandidate($db->first('SELECT * FROM candidates WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setCandidateStage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM candidates WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Candidate not found.');
            }
            if (!empty($input['stage'])) {
                $nextStage = V::oneOf($input['stage'], self::CAND_STAGES, 'stage');
            } else {
                $idx = array_search($cur['stage'], self::CAND_STAGES, true);
                $nextIdx = min(($idx === false ? -1 : $idx) + 1, 4);
                $nextStage = self::CAND_STAGES[$nextIdx];
            }
            $db->execute('UPDATE candidates SET stage = ?, updated_at = ? WHERE id = ?', [$nextStage, V::now(), $id]);
            return ['candidate' => self::normalizeCandidate($db->first('SELECT * FROM candidates WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteCandidate(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM candidates WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Candidate not found.');
            }
            $db->execute('DELETE FROM interview_scorecards WHERE candidate_id = ?', [$id]);
            $db->execute('DELETE FROM candidates WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function addScorecard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $candId = V::rowId($input['candidate_id'] ?? null, 'candidate_id');
            $cand = $db->first('SELECT * FROM candidates WHERE id = ?', [$candId]);
            if (!$cand) {
                HttpException::fail(404, 'candidate_not_found', 'Candidate not found.');
            }
            $interviewer = V::text($input['interviewer_name'] ?? null, 'interviewer_name', ['required' => false, 'max' => 100])
                ?: (string) ($ctx['member']['display_name'] ?? 'Owner');
            $iDate = V::day($input['interview_date'] ?? null, 'interview_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $iType = V::oneOf($input['interview_type'] ?? null, self::INT_TYPES, 'interview_type', ['fallback' => 'Technical']);
            $tech = (int) V::int($input['technical_skills'] ?? null, 'technical_skills', ['min' => 1, 'max' => 5, 'label' => 'Technical skills (1-5)']);
            $comm = (int) V::int($input['communication'] ?? null, 'communication', ['min' => 1, 'max' => 5, 'label' => 'Communication (1-5)']);
            $cult = (int) V::int($input['culture_fit'] ?? null, 'culture_fit', ['min' => 1, 'max' => 5, 'label' => 'Culture fit (1-5)']);
            $prob = (int) V::int($input['problem_solving'] ?? null, 'problem_solving', ['min' => 1, 'max' => 5, 'label' => 'Problem solving (1-5)']);
            $overall = round((($tech + $comm + $cult + $prob) / 4.0) * 10.0) / 10.0;
            $fallbackRec = $overall >= 4.0 ? 'Strong Hire' : ($overall >= 3.0 ? 'Hire' : 'No Hire');
            $rec = V::oneOf($input['overall_recommendation'] ?? null, self::INT_RECS, 'overall_recommendation', ['fallback' => $fallbackRec]);
            $str = V::text($input['strengths'] ?? null, 'strengths', ['required' => false, 'max' => 1000]);
            $con = V::text($input['concerns'] ?? null, 'concerns', ['required' => false, 'max' => 1000]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO interview_scorecards(candidate_id, interviewer_name, interview_date, interview_type, technical_skills, communication, culture_fit, problem_solving, overall_score, overall_recommendation, strengths, concerns, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$candId, $interviewer, $iDate, $iType, $tech, $comm, $cult, $prob, $overall, $rec, $str, $con, $notes, $ts]
            );
            if ($cand['stage'] === 'Applied' || $cand['stage'] === 'Screening') {
                $db->execute("UPDATE candidates SET stage = 'Interview', updated_at = ? WHERE id = ?", [$ts, $candId]);
            }
            return [
                '__status' => 201,
                '__body' => [
                    'scorecard' => self::normalizeScorecard($db->first('SELECT * FROM interview_scorecards WHERE id = ?', [$created['lastInsertRowid']])),
                ],
            ];
        }, write: true);
    }

    public function deleteScorecard(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM interview_scorecards WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Scorecard not found.');
            }
            $db->execute('DELETE FROM interview_scorecards WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Employee Onboarding Checklists ----

    public function listOnboardings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query('SELECT * FROM onboardings ORDER BY start_date DESC, created_at DESC');
            $out = [];
            foreach ($rows as $r) {
                $out[] = WorkspaceController::hydrateOnboarding($r);
            }
            return [
                'onboardings' => $out,
                'itItems' => WorkspaceController::IT_SETUP_ITEMS,
                'policyItems' => WorkspaceController::POLICY_ITEMS,
            ];
        });
    }

    public function addOnboarding(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $dept = V::oneOf($input['department'] ?? null, self::DEPARTMENTS, 'department', ['fallback' => 'Engineering']);
            $mgr = V::text($input['manager'] ?? null, 'manager', ['required' => false, 'max' => 100]);
            $it = V::listOf($input['it_setup'] ?? null, 'it_setup', 10, static fn ($v) => V::text($v, 'it', ['max' => 60]));
            $pol = V::listOf($input['policy_acknowledgement'] ?? null, 'policy_acknowledgement', 10, static fn ($v) => V::text($v, 'pol', ['max' => 60]));
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $ecRel = V::text($input['emergency_contact_relationship'] ?? null, 'emergency_contact_relationship', ['required' => false, 'max' => 60]);
            $bank = V::text($input['bank_account'] ?? null, 'bank_account', ['required' => false, 'max' => 80]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $created = $db->execute(
                'INSERT INTO onboardings(employee_name, email, start_date, department, manager, it_setup_json, policy_json, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_account, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$emp, $em, $start, $dept, $mgr, json_encode($it, $jsonFlags), json_encode($pol, $jsonFlags), $ecName, $ecPhone, $ecRel, $bank, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'onboarding' => WorkspaceController::hydrateOnboarding($db->first('SELECT * FROM onboardings WHERE id = ?', [$created['lastInsertRowid']])),
                ],
            ];
        }, write: true);
    }

    public function saveOnboarding(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM onboardings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Onboarding record not found.');
            }
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => $cur['start_date']]);
            $dept = V::oneOf($input['department'] ?? null, self::DEPARTMENTS, 'department', ['fallback' => $cur['department']]);
            $mgr = V::text($input['manager'] ?? null, 'manager', ['required' => false, 'max' => 100]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $ecRel = V::text($input['emergency_contact_relationship'] ?? null, 'emergency_contact_relationship', ['required' => false, 'max' => 60]);
            $bank = V::text($input['bank_account'] ?? null, 'bank_account', ['required' => false, 'max' => 80]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE onboardings SET employee_name = ?, email = ?, start_date = ?, department = ?, manager = ?, emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relationship = ?, bank_account = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$emp, $em, $start, $dept, $mgr, $ecName, $ecPhone, $ecRel, $bank, $notes, V::now(), $id]
            );
            return ['onboarding' => WorkspaceController::hydrateOnboarding($db->first('SELECT * FROM onboardings WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function toggleOnboardingItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM onboardings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Onboarding record not found.');
            }
            $kind = V::oneOf($input['kind'] ?? null, ['it', 'policy'], 'kind');
            $item = V::text($input['item'] ?? null, 'item', ['max' => 80]);
            $allowed = $kind === 'it' ? WorkspaceController::IT_SETUP_ITEMS : WorkspaceController::POLICY_ITEMS;
            if (!in_array($item, $allowed, true)) {
                HttpException::fail(422, 'invalid_item', 'Invalid checklist item.');
            }

            $col = $kind === 'it' ? 'it_setup_json' : 'policy_json';
            $parsed = V::parseJson($cur[$col] ?? '', []);
            $list = is_array($parsed) ? array_values($parsed) : [];
            $idx = array_search($item, $list, true);
            if ($idx !== false) {
                array_splice($list, (int) $idx, 1);
            } else {
                $list[] = $item;
            }
            $list = array_values($list);
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $db->execute("UPDATE onboardings SET {$col} = ?, updated_at = ? WHERE id = ?", [json_encode($list, $jsonFlags), V::now(), $id]);
            return ['onboarding' => WorkspaceController::hydrateOnboarding($db->first('SELECT * FROM onboardings WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteOnboarding(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM onboardings WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Onboarding record not found.');
            }
            $db->execute('DELETE FROM onboardings WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
