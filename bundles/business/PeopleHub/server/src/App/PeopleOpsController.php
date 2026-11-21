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

final class PeopleOpsController
{
    private const LEAVE_TYPES = [
        'Annual Leave',
        'Sick Leave',
        'Personal Leave',
        'Parental Leave',
        'Bereavement',
        'Unpaid Leave',
    ];

    private const REVIEW_PERIODS = [
        'Q1 (Jan-Mar)',
        'Q2 (Apr-Jun)',
        'Q3 (Jul-Sep)',
        'Q4 (Oct-Dec)',
        'Annual',
        'Probation',
    ];

    private const GOALS_MET = [
        'Exceeded All Goals',
        'Met All Goals',
        'Partially Met Goals',
        'Did Not Meet Goals',
    ];

    private const EXP_CATS = [
        'Travel',
        'Meals & Entertainment',
        'Accommodation',
        'Office Supplies',
        'Training & Development',
        'Technology / Software',
        'Client Entertainment',
        'Other',
    ];

    private const TRAIN_TYPES = [
        'Online Course',
        'Certification',
        'Conference',
        'Workshop',
        'Degree Program',
        'Other',
    ];

    private const EXIT_REASONS = [
        'New Opportunity',
        'Compensation',
        'Career Growth',
        'Work-Life Balance',
        'Management',
        'Relocation',
        'Retirement',
        'Personal Reasons',
        'Other',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeLeave(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('total_days', $row)) {
            $row['total_days'] = (float) $row['total_days'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeReview(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'job_knowledge', 'quality_of_work', 'productivity', 'teamwork', 'initiative', 'is_sample', 'created_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('onboarding_id', $row) && $row['onboarding_id'] !== null && $row['onboarding_id'] !== '') {
            $row['onboarding_id'] = (int) $row['onboarding_id'];
        } else {
            $row['onboarding_id'] = null;
        }
        if (array_key_exists('overall_rating', $row)) {
            $row['overall_rating'] = (float) $row['overall_rating'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeExpense(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'amount_cents', 'is_sample', 'created_at', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeTraining(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'cost_cents', 'is_sample', 'created_at', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeExit(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'overall_satisfaction', 'management_rating', 'culture_rating', 'is_sample', 'created_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('tenure_years', $row)) {
            $row['tenure_years'] = (float) $row['tenure_years'];
        }
        return $row;
    }

    // ---- Leave Requests ----

    public function listLeave(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM leave_requests ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, start_date DESC"
            );
            return ['leave' => array_map([self::class, 'normalizeLeave'], $rows)];
        });
    }

    public function addLeave(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $em = V::email($input['employee_email'] ?? null, 'employee_email', ['required' => false]);
            $ltype = V::oneOf($input['leave_type'] ?? null, self::LEAVE_TYPES, 'leave_type', ['fallback' => 'Annual Leave']);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['label' => 'Start date']);
            $end = V::day($input['end_date'] ?? null, 'end_date', ['label' => 'End date']);
            if ($end < $start) {
                HttpException::fail(422, 'date_order', 'End date cannot be before start date.');
            }
            $days = V::numVal($input['total_days'] ?? null, 'total_days', ['min' => 0.5, 'max' => 365, 'label' => 'Total days']);
            $reason = V::text($input['reason'] ?? null, 'reason', ['required' => false, 'max' => 800]);
            $mgr = V::text($input['manager_name'] ?? null, 'manager_name', ['required' => false, 'max' => 100]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO leave_requests(employee_name, employee_email, leave_type, start_date, end_date, total_days, reason, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)",
                [$emp, $em, $ltype, $start, $end, $days, $reason, $mgr, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['request' => self::normalizeLeave($db->first('SELECT * FROM leave_requests WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setLeaveStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM leave_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Leave request not found.');
            }
            $st = V::oneOf($input['status'] ?? null, ['Pending', 'Approved', 'Declined'], 'status');
            $db->execute('UPDATE leave_requests SET status = ?, updated_at = ? WHERE id = ?', [$st, V::now(), $id]);
            return ['request' => self::normalizeLeave($db->first('SELECT * FROM leave_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteLeave(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM leave_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Leave request not found.');
            }
            $db->execute('DELETE FROM leave_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Performance Reviews ----

    public function listReviews(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query('SELECT * FROM performance_reviews ORDER BY review_date DESC, created_at DESC');
            return ['reviews' => array_map([self::class, 'normalizeReview'], $rows)];
        });
    }

    public function addReview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $obId = V::int($input['onboarding_id'] ?? null, 'onboarding_id', ['required' => false, 'min' => 1]);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $period = V::oneOf($input['review_period'] ?? null, self::REVIEW_PERIODS, 'review_period', ['fallback' => 'Annual']);
            $reviewer = V::text($input['reviewer_name'] ?? null, 'reviewer_name', ['required' => false, 'max' => 100])
                ?: (string) ($ctx['member']['display_name'] ?? 'Owner');
            $rDate = V::day($input['review_date'] ?? null, 'review_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $jk = (int) V::int($input['job_knowledge'] ?? null, 'job_knowledge', ['min' => 1, 'max' => 5]);
            $qw = (int) V::int($input['quality_of_work'] ?? null, 'quality_of_work', ['min' => 1, 'max' => 5]);
            $pr = (int) V::int($input['productivity'] ?? null, 'productivity', ['min' => 1, 'max' => 5]);
            $tw = (int) V::int($input['teamwork'] ?? null, 'teamwork', ['min' => 1, 'max' => 5]);
            $ini = (int) V::int($input['initiative'] ?? null, 'initiative', ['min' => 1, 'max' => 5]);
            $overall = round((($jk + $qw + $pr + $tw + $ini) / 5.0) * 10.0) / 10.0;
            $goals = V::oneOf($input['goals_met'] ?? null, self::GOALS_MET, 'goals_met', ['fallback' => 'Met All Goals']);
            $str = V::text($input['strengths'] ?? null, 'strengths', ['required' => false, 'max' => 1200]);
            $imp = V::text($input['areas_for_improvement'] ?? null, 'areas_for_improvement', ['required' => false, 'max' => 1200]);
            $nxt = V::text($input['goals_next_period'] ?? null, 'goals_next_period', ['required' => false, 'max' => 1200]);

            $created = $db->execute(
                'INSERT INTO performance_reviews(onboarding_id, employee_name, review_period, reviewer_name, review_date, job_knowledge, quality_of_work, productivity, teamwork, initiative, overall_rating, goals_met, strengths, areas_for_improvement, goals_next_period, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$obId, $emp, $period, $reviewer, $rDate, $jk, $qw, $pr, $tw, $ini, $overall, $goals, $str, $imp, $nxt, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['review' => self::normalizeReview($db->first('SELECT * FROM performance_reviews WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function deleteReview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM performance_reviews WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Review not found.');
            }
            $db->execute('DELETE FROM performance_reviews WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Expense Claims ----

    public function listExpenses(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeExpense'],
                $db->query("SELECT * FROM expense_claims ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, expense_date DESC")
            );
            $pendCents = 0;
            $appCents = 0;
            $reimCents = 0;
            foreach ($rows as $r) {
                if ($r['status'] === 'Pending') {
                    $pendCents += (int) $r['amount_cents'];
                } elseif ($r['status'] === 'Approved') {
                    $appCents += (int) $r['amount_cents'];
                } elseif ($r['status'] === 'Reimbursed') {
                    $reimCents += (int) $r['amount_cents'];
                }
            }
            return [
                'expenses' => $rows,
                'summary' => [
                    'pendingCents' => $pendCents,
                    'approvedCents' => $appCents,
                    'reimbursedCents' => $reimCents,
                ],
            ];
        });
    }

    public function addExpense(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $em = V::email($input['employee_email'] ?? null, 'employee_email', ['required' => false]);
            $eDate = V::day($input['expense_date'] ?? null, 'expense_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $cat = V::oneOf($input['category'] ?? null, self::EXP_CATS, 'category', ['fallback' => 'Travel']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 300, 'label' => 'Description']);
            $amt = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 100000000, 'label' => 'Amount']);
            $code = V::text($input['project_code'] ?? null, 'project_code', ['required' => false, 'max' => 60]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO expense_claims(employee_name, employee_email, expense_date, category, description, amount_cents, project_code, notes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)",
                [$emp, $em, $eDate, $cat, $desc, $amt, $code, $notes, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['claim' => self::normalizeExpense($db->first('SELECT * FROM expense_claims WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setExpenseStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM expense_claims WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Expense claim not found.');
            }
            $st = V::oneOf($input['status'] ?? null, ['Pending', 'Approved', 'Declined', 'Reimbursed'], 'status');
            $db->execute('UPDATE expense_claims SET status = ?, updated_at = ? WHERE id = ?', [$st, V::now(), $id]);
            return ['claim' => self::normalizeExpense($db->first('SELECT * FROM expense_claims WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteExpense(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM expense_claims WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Expense claim not found.');
            }
            $db->execute('DELETE FROM expense_claims WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Training Requests & Budget ----

    public function listTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeTraining'],
                $db->query("SELECT * FROM training_requests ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, start_date DESC")
            );
            $pendCents = 0;
            $commCents = 0;
            foreach ($rows as $r) {
                if ($r['status'] === 'Pending') {
                    $pendCents += (int) $r['cost_cents'];
                } elseif ($r['status'] === 'Approved' || $r['status'] === 'Completed') {
                    $commCents += (int) $r['cost_cents'];
                }
            }
            return [
                'training' => $rows,
                'summary' => [
                    'pendingCents' => $pendCents,
                    'committedCents' => $commCents,
                ],
            ];
        });
    }

    public function addTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $em = V::email($input['employee_email'] ?? null, 'employee_email', ['required' => false]);
            $ttype = V::oneOf($input['training_type'] ?? null, self::TRAIN_TYPES, 'training_type', ['fallback' => 'Online Course']);
            $course = V::text($input['course_name'] ?? null, 'course_name', ['max' => 200, 'label' => 'Course name']);
            $prov = V::text($input['provider'] ?? null, 'provider', ['required' => false, 'max' => 120]);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => V::utcDay(7)]);
            $end = V::day($input['end_date'] ?? null, 'end_date', ['required' => false, 'fallback' => $start]);
            $cost = V::moneyCents($input['cost'] ?? null, 'cost', ['min' => 0, 'max' => 100000000, 'label' => 'Estimated cost']);
            $just = V::text($input['justification'] ?? null, 'justification', ['required' => false, 'max' => 1000]);
            $mgr = V::text($input['manager_name'] ?? null, 'manager_name', ['required' => false, 'max' => 100]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO training_requests(employee_name, employee_email, training_type, course_name, provider, start_date, end_date, cost_cents, justification, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)",
                [$emp, $em, $ttype, $course, $prov, $start, $end, $cost, $just, $mgr, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['request' => self::normalizeTraining($db->first('SELECT * FROM training_requests WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setTrainingStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM training_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Training request not found.');
            }
            $st = V::oneOf($input['status'] ?? null, ['Pending', 'Approved', 'Declined', 'Completed'], 'status');
            $db->execute('UPDATE training_requests SET status = ?, updated_at = ? WHERE id = ?', [$st, V::now(), $id]);
            return ['request' => self::normalizeTraining($db->first('SELECT * FROM training_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteTraining(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM training_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Training request not found.');
            }
            $db->execute('DELETE FROM training_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Exit Interviews ----

    public function listExits(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeExit'],
                $db->query('SELECT * FROM exit_interviews ORDER BY last_day DESC, created_at DESC')
            );
            $n = count($rows);
            $ten = 0.0;
            $sat = 0.0;
            $mgr = 0.0;
            $cult = 0.0;
            $rec = 0;
            foreach ($rows as $r) {
                $ten += (float) ($r['tenure_years'] ?? 0);
                $sat += (float) ($r['overall_satisfaction'] ?? 0);
                $mgr += (float) ($r['management_rating'] ?? 0);
                $cult += (float) ($r['culture_rating'] ?? 0);
                if (($r['would_recommend'] ?? '') === 'Yes') {
                    $rec++;
                }
            }
            return [
                'exits' => $rows,
                'summary' => [
                    'total' => $n,
                    'avgTenure' => $n > 0 ? round(($ten / $n) * 10.0) / 10.0 : 0,
                    'avgSatisfaction' => $n > 0 ? round(($sat / $n) * 10.0) / 10.0 : 0,
                    'avgManagement' => $n > 0 ? round(($mgr / $n) * 10.0) / 10.0 : 0,
                    'avgCulture' => $n > 0 ? round(($cult / $n) * 10.0) / 10.0 : 0,
                    'recommendPct' => $n > 0 ? (int) round(($rec / $n) * 100.0) : 0,
                ],
            ];
        });
    }

    public function addExit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $emp = V::text($input['employee_name'] ?? null, 'employee_name', ['max' => 120, 'label' => 'Employee name']);
            $dept = V::oneOf($input['department'] ?? null, TalentController::DEPARTMENTS, 'department', ['fallback' => 'Engineering']);
            $lastDay = V::day($input['last_day'] ?? null, 'last_day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $tenure = V::numVal($input['tenure_years'] ?? null, 'tenure_years', ['min' => 0, 'max' => 60, 'label' => 'Years of service']);
            $reason = V::oneOf($input['reason_for_leaving'] ?? null, self::EXIT_REASONS, 'reason_for_leaving', ['fallback' => 'New Opportunity']);
            $sat = (int) V::int($input['overall_satisfaction'] ?? null, 'overall_satisfaction', ['min' => 1, 'max' => 5]);
            $mgr = (int) (V::int($input['management_rating'] ?? null, 'management_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $sat]) ?? $sat);
            $cult = (int) (V::int($input['culture_rating'] ?? null, 'culture_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $sat]) ?? $sat);
            $enjoyed = V::text($input['what_enjoyed'] ?? null, 'what_enjoyed', ['required' => false, 'max' => 1200]);
            $sugg = V::text($input['suggestions'] ?? null, 'suggestions', ['required' => false, 'max' => 1200]);
            $ret = V::oneOf($input['would_return'] ?? null, ['Yes', 'Maybe', 'No'], 'would_return', ['fallback' => 'Maybe']);
            $rec = V::oneOf($input['would_recommend'] ?? null, ['Yes', 'Maybe', 'No'], 'would_recommend', ['fallback' => 'Yes']);

            $created = $db->execute(
                'INSERT INTO exit_interviews(employee_name, department, last_day, tenure_years, reason_for_leaving, overall_satisfaction, management_rating, culture_rating, what_enjoyed, suggestions, would_return, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$emp, $dept, $lastDay, $tenure, $reason, $sat, $mgr, $cult, $enjoyed, $sugg, $ret, $rec, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['exit' => self::normalizeExit($db->first('SELECT * FROM exit_interviews WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function deleteExit(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM exit_interviews WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Exit interview not found.');
            }
            $db->execute('DELETE FROM exit_interviews WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
