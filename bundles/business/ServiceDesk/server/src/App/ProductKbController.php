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

final class ProductKbController
{
    private const BUG_PRODUCTS = [
        'Web Application',
        'Mobile App (iOS)',
        'Mobile App (Android)',
        'Desktop Application',
        'API',
        'Other',
    ];
    private const BUG_SEVS = ['Critical', 'High', 'Medium', 'Low'];
    private const BUG_STATUSES = ['New', 'Triaged', 'In Fix', 'Verified', 'Closed'];
    private const FEAT_PRIOS = ['Nice to Have', 'Important', 'Critical'];
    private const FEAT_STATUSES = ['Under Review', 'Planned', 'Shipped', 'Declined'];
    private const KB_CATS = [
        'Getting Started',
        'Account Management',
        'Billing & Payments',
        'Technical',
        'Troubleshooting',
        'How-To Guide',
        'FAQ',
        'Policy',
    ];
    private const KB_STATUSES = ['Draft', 'Published', 'Archived', 'Needs Review'];

    /** @return array<string, mixed>|null */
    private static function normalizeBug(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeFeature(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['impact_score'] = (int) ($row['impact_score'] ?? 3);
        $row['upvotes'] = (int) ($row['upvotes'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeFeedback(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['ticket_id'] = isset($row['ticket_id']) && $row['ticket_id'] !== null && $row['ticket_id'] !== ''
            ? (int) $row['ticket_id']
            : null;
        $row['overall_satisfaction'] = (int) ($row['overall_satisfaction'] ?? 0);
        $row['response_time_rating'] = (int) ($row['response_time_rating'] ?? 0);
        $row['resolution_rating'] = (int) ($row['resolution_rating'] ?? 0);
        $row['agent_rating'] = (int) ($row['agent_rating'] ?? 0);
        $row['nps_score'] = (int) ($row['nps_score'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeKb(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    // ---- Bug Reports ----

    public function listBugs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $sev = V::text($input['severity'] ?? null, 'severity', ['required' => false, 'max' => 30]);
            $prod = V::text($input['product'] ?? null, 'product', ['required' => false, 'max' => 40]);
            $sql = 'SELECT * FROM bug_reports WHERE 1=1';
            $params = [];
            if ($sev !== '' && $sev !== 'All') {
                $sql .= ' AND severity = ?';
                $params[] = $sev;
            }
            if ($prod !== '' && $prod !== 'All') {
                $sql .= ' AND product = ?';
                $params[] = $prod;
            }
            $sql .= " ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, created_at DESC";
            $rows = $db->query($sql, $params);
            return ['bugs' => array_map([self::class, 'normalizeBug'], $rows)];
        });
    }

    public function addBug(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $reporter = V::text($input['reporter_name'] ?? null, 'reporter_name', ['max' => 120, 'label' => 'Reporter name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $product = V::oneOf($input['product'] ?? null, self::BUG_PRODUCTS, 'product', ['fallback' => 'Web Application']);
            $severity = V::oneOf($input['severity'] ?? null, self::BUG_SEVS, 'severity', ['fallback' => 'Medium']);
            $title = V::text($input['bug_title'] ?? null, 'bug_title', ['max' => 200, 'label' => 'Bug title']);
            $steps = V::text($input['steps_to_reproduce'] ?? null, 'steps_to_reproduce', ['max' => 2000, 'label' => 'Steps to reproduce']);
            $exp = V::text($input['expected_behavior'] ?? null, 'expected_behavior', ['max' => 1000, 'label' => 'Expected behavior']);
            $act = V::text($input['actual_behavior'] ?? null, 'actual_behavior', ['max' => 1000, 'label' => 'Actual behavior']);
            $env = V::text($input['browser_os'] ?? null, 'browser_os', ['required' => false, 'max' => 120]);

            $curSeq = (int) ($ctx['settings']['bug_seq'] ?? 0);
            $nextSeq = ($curSeq > 0 ? $curSeq : 100) + 1;
            $db->execute('UPDATE business_settings SET bug_seq = ? WHERE id = 1', [$nextSeq]);
            $bugNum = 'BUG-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO bug_reports(bug_number, reporter_name, email, product, severity, bug_title, steps_to_reproduce, expected_behavior, actual_behavior, browser_os, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 0, ?, ?)",
                [$bugNum, $reporter, $em, $product, $severity, $title, $steps, $exp, $act, $env, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => ['bug' => self::normalizeBug($db->first('SELECT * FROM bug_reports WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveBug(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM bug_reports WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Bug report not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::BUG_STATUSES, 'status', ['fallback' => $cur['status']]);
            $severity = V::oneOf($input['severity'] ?? null, self::BUG_SEVS, 'severity', ['fallback' => $cur['severity']]);
            $product = V::oneOf($input['product'] ?? null, self::BUG_PRODUCTS, 'product', ['fallback' => $cur['product']]);
            $title = array_key_exists('bug_title', $input)
                ? V::text($input['bug_title'], 'bug_title', ['max' => 200])
                : (string) $cur['bug_title'];

            $db->execute(
                'UPDATE bug_reports SET status = ?, severity = ?, product = ?, bug_title = ?, updated_at = ? WHERE id = ?',
                [$status, $severity, $product, $title, V::now(), $id]
            );

            return ['bug' => self::normalizeBug($db->first('SELECT * FROM bug_reports WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteBug(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM bug_reports WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Bug report not found.');
            }
            $db->execute('DELETE FROM bug_reports WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Feature Requests (with 1-click Upvote!) ----

    public function listFeatures(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $st = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM feature_requests WHERE 1=1';
            $params = [];
            if ($st !== '' && $st !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $st;
            }
            $sql .= ' ORDER BY upvotes DESC, impact_score DESC, created_at DESC';
            $rows = $db->query($sql, $params);
            return ['features' => array_map([self::class, 'normalizeFeature'], $rows)];
        });
    }

    public function addFeature(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $sub = V::text($input['submitter_name'] ?? null, 'submitter_name', ['max' => 120, 'label' => 'Submitter']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $title = V::text($input['feature_title'] ?? null, 'feature_title', ['max' => 180, 'label' => 'Feature title']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1500, 'label' => 'Description']);
            $useCase = V::text($input['use_case'] ?? null, 'use_case', ['max' => 1500, 'label' => 'Use case']);
            $prio = V::oneOf($input['priority'] ?? null, self::FEAT_PRIOS, 'priority', ['fallback' => 'Important']);
            $impact = V::int($input['impact_score'] ?? null, 'impact_score', [
                'required' => false,
                'min' => 1,
                'max' => 5,
                'fallback' => 3,
                'label' => 'Impact score (1-5)',
            ]);
            $ctx = V::text($input['additional_context'] ?? null, 'additional_context', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO feature_requests(submitter_name, email, feature_title, description, use_case, priority, impact_score, additional_context, upvotes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, 'Under Review', 0, ?, ?)",
                [$sub, $em, $title, $desc, $useCase, $prio, $impact, $ctx, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => ['feature' => self::normalizeFeature($db->first('SELECT * FROM feature_requests WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function upvoteFeature(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM feature_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Feature request not found.');
            }
            $nextVotes = (int) ($cur['upvotes'] ?? 0) + 1;
            $db->execute('UPDATE feature_requests SET upvotes = ?, updated_at = ? WHERE id = ?', [$nextVotes, V::now(), $id]);
            return ['feature' => self::normalizeFeature($db->first('SELECT * FROM feature_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setFeatureStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM feature_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Feature request not found.');
            }
            $st = V::oneOf($input['status'] ?? null, self::FEAT_STATUSES, 'status');
            $db->execute('UPDATE feature_requests SET status = ?, updated_at = ? WHERE id = ?', [$st, V::now(), $id]);
            return ['feature' => self::normalizeFeature($db->first('SELECT * FROM feature_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteFeature(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM feature_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Feature request not found.');
            }
            $db->execute('DELETE FROM feature_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Customer Feedback & Live NPS Score Calculator ----

    public function listFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                'SELECT f.*, t.ticket_number, t.subject AS ticket_subject FROM customer_feedback f LEFT JOIN support_tickets t ON t.id = f.ticket_id ORDER BY f.created_at DESC'
            );
            $normalized = array_map([self::class, 'normalizeFeedback'], $rows);
            return [
                'feedback' => $normalized,
                'summary' => WorkspaceController::computeNpsSummary($normalized),
            ];
        });
    }

    public function addFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $ticketId = V::int($input['ticket_id'] ?? null, 'ticket_id', ['required' => false, 'min' => 1]);
            $custName = V::text($input['customer_name'] ?? null, 'customer_name', ['required' => false, 'max' => 120]);
            if ($custName === '' && $ticketId !== null) {
                $tk = $db->first('SELECT customer_name FROM support_tickets WHERE id = ?', [$ticketId]);
                if ($tk) {
                    $custName = (string) $tk['customer_name'];
                }
            }
            $sat = (int) V::int($input['overall_satisfaction'] ?? null, 'overall_satisfaction', [
                'min' => 1,
                'max' => 5,
                'label' => 'Overall satisfaction',
            ]);
            $resp = (int) V::int($input['response_time_rating'] ?? null, 'response_time_rating', [
                'required' => false,
                'min' => 1,
                'max' => 5,
                'fallback' => $sat,
            ]);
            $resR = (int) V::int($input['resolution_rating'] ?? null, 'resolution_rating', [
                'required' => false,
                'min' => 1,
                'max' => 5,
                'fallback' => $sat,
            ]);
            $agentR = (int) V::int($input['agent_rating'] ?? null, 'agent_rating', [
                'required' => false,
                'min' => 1,
                'max' => 5,
                'fallback' => $sat,
            ]);
            $npsScore = (int) V::int($input['nps_score'] ?? null, 'nps_score', [
                'min' => 0,
                'max' => 10,
                'label' => 'NPS score (0-10)',
            ]);
            $npsCat = WorkspaceController::computeNpsCategory($npsScore);
            $comments = V::text($input['comments'] ?? null, 'comments', ['required' => false, 'max' => 1500]);
            $wouldRec = V::oneOf($input['would_recommend'] ?? null, ['Yes', 'Maybe', 'No'], 'would_recommend', [
                'fallback' => $npsScore >= 7 ? 'Yes' : 'No',
            ]);

            $created = $db->execute(
                'INSERT INTO customer_feedback(ticket_id, customer_name, overall_satisfaction, response_time_rating, resolution_rating, agent_rating, nps_score, nps_category, comments, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$ticketId, $custName !== '' ? $custName : 'Customer', $sat, $resp, $resR, $agentR, $npsScore, $npsCat, $comments, $wouldRec, V::now()]
            );

            $all = $db->query('SELECT nps_score, overall_satisfaction, response_time_rating, resolution_rating, agent_rating FROM customer_feedback');
            return [
                '__status' => 201,
                '__body' => [
                    'entry' => self::normalizeFeedback($db->first('SELECT * FROM customer_feedback WHERE id = ?', [$created['lastInsertRowid']])),
                    'summary' => WorkspaceController::computeNpsSummary($all),
                ],
            ];
        }, write: true);
    }

    public function deleteFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM customer_feedback WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Feedback entry not found.');
            }
            $db->execute('DELETE FROM customer_feedback WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Searchable Knowledge Base ----

    public function listKb(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cat = V::text($input['category'] ?? null, 'category', ['required' => false, 'max' => 40]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 120]);
            $onlyPub = V::bool($input['onlyPublished'] ?? false);

            $sql = 'SELECT * FROM kb_articles WHERE 1=1';
            $params = [];
            if ($cat !== '' && $cat !== 'All') {
                $sql .= ' AND category = ?';
                $params[] = $cat;
            }
            if ($onlyPub) {
                $sql .= " AND status = 'Published'";
            }
            if ($q !== '') {
                $pat = V::likeTerm($q);
                $sql .= " AND (title LIKE ? ESCAPE '\\' OR question LIKE ? ESCAPE '\\' OR answer LIKE ? ESCAPE '\\' OR keywords LIKE ? ESCAPE '\\')";
                array_push($params, $pat, $pat, $pat, $pat);
            }
            $sql .= ' ORDER BY status ASC, category ASC, title ASC';
            $rows = $db->query($sql, $params);
            return ['articles' => array_map([self::class, 'normalizeKb'], $rows)];
        });
    }

    public function addKb(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $title = V::text($input['title'] ?? null, 'title', ['max' => 180, 'label' => 'Article title']);
            $cat = V::oneOf($input['category'] ?? null, self::KB_CATS, 'category', ['fallback' => 'FAQ']);
            $question = V::text($input['question'] ?? null, 'question', ['max' => 300, 'label' => 'Question']);
            $answer = V::text($input['answer'] ?? null, 'answer', ['max' => 4000, 'label' => 'Answer']);
            $keywords = V::text($input['keywords'] ?? null, 'keywords', ['required' => false, 'max' => 240]);
            $related = V::text($input['related_articles'] ?? null, 'related_articles', ['required' => false, 'max' => 240]);
            $author = V::text($input['author'] ?? null, 'author', ['required' => false, 'max' => 80]) ?: (string) $ctx['member']['display_name'];
            $reviewed = V::day($input['last_reviewed'] ?? null, 'last_reviewed', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::oneOf($input['status'] ?? null, self::KB_STATUSES, 'status', ['fallback' => 'Published']);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO kb_articles(title, category, question, answer, keywords, related_articles, author, last_reviewed, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$title, $cat, $question, $answer, $keywords, $related, $author, $reviewed, $status, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => ['article' => self::normalizeKb($db->first('SELECT * FROM kb_articles WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveKb(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM kb_articles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Article not found.');
            }
            $title = V::text($input['title'] ?? null, 'title', ['max' => 180]);
            $cat = V::oneOf($input['category'] ?? null, self::KB_CATS, 'category', ['fallback' => $cur['category']]);
            $question = V::text($input['question'] ?? null, 'question', ['max' => 300]);
            $answer = V::text($input['answer'] ?? null, 'answer', ['max' => 4000]);
            $keywords = V::text($input['keywords'] ?? null, 'keywords', ['required' => false, 'max' => 240]);
            $related = V::text($input['related_articles'] ?? null, 'related_articles', ['required' => false, 'max' => 240]);
            $author = V::text($input['author'] ?? null, 'author', ['required' => false, 'max' => 80]) ?: (string) $cur['author'];
            $reviewed = V::day($input['last_reviewed'] ?? null, 'last_reviewed', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::oneOf($input['status'] ?? null, self::KB_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE kb_articles SET title = ?, category = ?, question = ?, answer = ?, keywords = ?, related_articles = ?, author = ?, last_reviewed = ?, status = ?, updated_at = ? WHERE id = ?',
                [$title, $cat, $question, $answer, $keywords, $related, $author, $reviewed, $status, V::now(), $id]
            );

            return ['article' => self::normalizeKb($db->first('SELECT * FROM kb_articles WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteKb(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM kb_articles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Article not found.');
            }
            $db->execute('DELETE FROM kb_articles WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
