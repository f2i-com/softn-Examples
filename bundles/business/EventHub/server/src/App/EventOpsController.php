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

final class EventOpsController
{
    private const BUDGET_CATS = [
        'Venue',
        'Catering',
        'AV Equipment',
        'Marketing',
        'Speaker Fees',
        'Decorations',
        'Transportation',
        'Staffing',
        'Insurance',
        'Other',
    ];
    private const INCIDENT_TYPES = [
        'Medical Emergency',
        'Safety Hazard',
        'Security Issue',
        'Property Damage',
        'Weather Related',
        'Attendee Complaint',
        'Other',
    ];
    private const INCIDENT_SEVS = ['Low', 'Medium', 'High', 'Critical'];

    /** @return array<string, mixed>|null */
    public static function hydrateBudgetItem(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['estimated_cents'] = (int) ($row['estimated_cents'] ?? 0);
        $row['actual_cents'] = (int) ($row['actual_cents'] ?? 0);
        $row['variance_cents'] = $row['estimated_cents'] - $row['actual_cents'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeIncident(?array $row): ?array
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
    private static function normalizeFeedback(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['attendee_id'] = isset($row['attendee_id']) && $row['attendee_id'] !== null && $row['attendee_id'] !== ''
            ? (int) $row['attendee_id']
            : null;
        $row['overall_rating'] = (int) ($row['overall_rating'] ?? 0);
        $row['venue_rating'] = (int) ($row['venue_rating'] ?? 0);
        $row['speakers_rating'] = (int) ($row['speakers_rating'] ?? 0);
        $row['organization_rating'] = (int) ($row['organization_rating'] ?? 0);
        $row['food_rating'] = (int) ($row['food_rating'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        return $row;
    }

    // ---- Budget Tracker ----

    public function listBudget(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'hydrateBudgetItem'],
                $db->query('SELECT * FROM budget_items ORDER BY category ASC, item_name ASC')
            );
            return [
                'items' => $rows,
                'summary' => WorkspaceController::computeBudgetTotals($db),
            ];
        });
    }

    public function addBudgetItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 140, 'label' => 'Item name']);
            $cat = V::oneOf($input['category'] ?? null, self::BUDGET_CATS, 'category', ['fallback' => 'Other']);
            $est = V::moneyCents($input['estimated_cost'] ?? null, 'estimated_cost', ['min' => 0, 'max' => 1000000000, 'label' => 'Estimated cost']);
            $act = V::moneyCents($input['actual_cost'] ?? null, 'actual_cost', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0, 'label' => 'Actual cost']);
            $vendor = V::text($input['vendor'] ?? null, 'vendor', ['required' => false, 'max' => 120]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO budget_items(item_name, category, estimated_cents, actual_cents, vendor, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$name, $cat, $est, $act, $vendor, $notes, $ts, $ts]
            );
            $row = self::hydrateBudgetItem($db->first('SELECT * FROM budget_items WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => [
                    'item' => $row,
                    'summary' => WorkspaceController::computeBudgetTotals($db),
                ],
            ];
        }, write: true);
    }

    public function saveBudgetItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM budget_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Budget item not found.');
            }
            $name = V::text($input['item_name'] ?? null, 'item_name', ['max' => 140]);
            $cat = V::oneOf($input['category'] ?? null, self::BUDGET_CATS, 'category', ['fallback' => $cur['category']]);
            $est = V::moneyCents($input['estimated_cost'] ?? null, 'estimated_cost', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => (int) $cur['estimated_cents']]);
            $act = V::moneyCents($input['actual_cost'] ?? null, 'actual_cost', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => (int) $cur['actual_cents']]);
            $vendor = V::text($input['vendor'] ?? null, 'vendor', ['required' => false, 'max' => 120]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE budget_items SET item_name = ?, category = ?, estimated_cents = ?, actual_cents = ?, vendor = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$name, $cat, $est, $act, $vendor, $notes, V::now(), $id]
            );
            $row = self::hydrateBudgetItem($db->first('SELECT * FROM budget_items WHERE id = ?', [$id]));
            return [
                'item' => $row,
                'summary' => WorkspaceController::computeBudgetTotals($db),
            ];
        }, write: true);
    }

    public function deleteBudgetItem(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM budget_items WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Budget item not found.');
            }
            $db->execute('DELETE FROM budget_items WHERE id = ?', [$id]);
            return [
                'deleted' => true,
                'summary' => WorkspaceController::computeBudgetTotals($db),
            ];
        }, write: true);
    }

    // ---- Incident Log ----

    public function listIncidents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM incidents ORDER BY CASE status WHEN 'Open' THEN 0 ELSE 1 END, CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, created_at DESC"
            );
            return ['incidents' => array_map([self::class, 'normalizeIncident'], $rows)];
        });
    }

    public function addIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $reporter = V::text($input['reporter_name'] ?? null, 'reporter_name', ['required' => false, 'max' => 100])
                ?: (string) $ctx['member']['display_name'];
            $iDate = V::day($input['incident_date'] ?? null, 'incident_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $iTime = V::timeStr($input['incident_time'] ?? null, 'incident_time', ['required' => false, 'fallback' => '12:00']);
            $loc = V::text($input['location'] ?? null, 'location', ['max' => 140, 'label' => 'Location']);
            $itype = V::oneOf($input['incident_type'] ?? null, self::INCIDENT_TYPES, 'incident_type', ['fallback' => 'Safety Hazard']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 2000, 'label' => 'Description']);
            $sev = V::oneOf($input['severity'] ?? null, self::INCIDENT_SEVS, 'severity', ['fallback' => 'Medium']);
            $actions = V::text($input['actions_taken'] ?? null, 'actions_taken', ['max' => 1500, 'label' => 'Actions taken']);
            $witnesses = V::text($input['witnesses'] ?? null, 'witnesses', ['required' => false, 'max' => 500]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO incidents(reporter_name, incident_date, incident_time, location, incident_type, description, severity, actions_taken, witnesses, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 0, ?, ?)",
                [$reporter, $iDate, $iTime, $loc, $itype, $desc, $sev, $actions, $witnesses, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['incident' => self::normalizeIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setIncidentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $st = V::oneOf($input['status'] ?? null, ['Open', 'Resolved'], 'status');
            $actions = array_key_exists('actions_taken', $input)
                ? V::text($input['actions_taken'], 'actions_taken', ['required' => false, 'max' => 1500])
                : (string) $cur['actions_taken'];
            $db->execute(
                'UPDATE incidents SET status = ?, actions_taken = ?, updated_at = ? WHERE id = ?',
                [$st, $actions, V::now(), $id]
            );
            return ['incident' => self::normalizeIncident($db->first('SELECT * FROM incidents WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $db->execute('DELETE FROM incidents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Post-Event Feedback Summary ----

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<string, int|float>
     */
    public static function computeEventFeedbackSummary(array $rows): array
    {
        $n = count($rows);
        $ov = 0.0;
        $vn = 0.0;
        $sp = 0.0;
        $org = 0.0;
        $fd = 0.0;
        $recYes = 0;
        $againPos = 0;

        foreach ($rows as $r) {
            $ov += (float) ($r['overall_rating'] ?? 0);
            $vn += (float) ($r['venue_rating'] ?? 0);
            $sp += (float) ($r['speakers_rating'] ?? 0);
            $org += (float) ($r['organization_rating'] ?? 0);
            $fd += (float) ($r['food_rating'] ?? 0);
            if (($r['would_recommend'] ?? '') === 'Yes') {
                $recYes++;
            }
            $again = (string) ($r['would_attend_again'] ?? '');
            if ($again === 'Definitely' || $again === 'Probably') {
                $againPos++;
            }
        }

        return [
            'total' => $n,
            'avgOverall' => $n > 0 ? round(($ov / $n) * 10.0) / 10.0 : 0,
            'avgVenue' => $n > 0 ? round(($vn / $n) * 10.0) / 10.0 : 0,
            'avgSpeakers' => $n > 0 ? round(($sp / $n) * 10.0) / 10.0 : 0,
            'avgOrganization' => $n > 0 ? round(($org / $n) * 10.0) / 10.0 : 0,
            'avgFood' => $n > 0 ? round(($fd / $n) * 10.0) / 10.0 : 0,
            'recommendPct' => $n > 0 ? (int) round(($recYes / $n) * 100.0) : 0,
            'attendAgainPct' => $n > 0 ? (int) round(($againPos / $n) * 100.0) : 0,
        ];
    }

    public function listFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeFeedback'],
                $db->query('SELECT * FROM event_feedback ORDER BY created_at DESC')
            );
            return [
                'feedback' => $rows,
                'summary' => self::computeEventFeedbackSummary($rows),
            ];
        });
    }

    public function addFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $attId = V::int($input['attendee_id'] ?? null, 'attendee_id', ['required' => false, 'min' => 1]);
            $attName = V::text($input['attendee_name'] ?? null, 'attendee_name', ['required' => false, 'max' => 120]);
            if ($attName === '' && $attId !== null) {
                $a = $db->first('SELECT attendee_name FROM attendees WHERE id = ?', [$attId]);
                if ($a) {
                    $attName = (string) $a['attendee_name'];
                }
            }
            $overall = (int) V::int($input['overall_rating'] ?? null, 'overall_rating', ['min' => 1, 'max' => 5, 'label' => 'Overall rating']);
            $venue = (int) V::int($input['venue_rating'] ?? null, 'venue_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $overall]);
            $speakers = (int) V::int($input['speakers_rating'] ?? null, 'speakers_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $overall]);
            $org = (int) V::int($input['organization_rating'] ?? null, 'organization_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $overall]);
            $food = (int) V::int($input['food_rating'] ?? null, 'food_rating', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => $overall]);
            $enjoyed = V::text($input['what_enjoyed'] ?? null, 'what_enjoyed', ['required' => false, 'max' => 1000]);
            $sugg = V::text($input['suggestions'] ?? null, 'suggestions', ['required' => false, 'max' => 1000]);
            $again = V::oneOf($input['would_attend_again'] ?? null, ['Definitely', 'Probably', 'Unsure', 'No'], 'would_attend_again', ['fallback' => 'Definitely']);
            $rec = V::oneOf($input['would_recommend'] ?? null, ['Yes', 'Maybe', 'No'], 'would_recommend', ['fallback' => 'Yes']);

            $created = $db->execute(
                'INSERT INTO event_feedback(attendee_id, attendee_name, overall_rating, venue_rating, speakers_rating, organization_rating, food_rating, what_enjoyed, suggestions, would_attend_again, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$attId, $attName !== '' ? $attName : 'Attendee', $overall, $venue, $speakers, $org, $food, $enjoyed, $sugg, $again, $rec, V::now()]
            );
            $all = array_map(
                [self::class, 'normalizeFeedback'],
                $db->query('SELECT * FROM event_feedback ORDER BY created_at DESC')
            );
            return [
                '__status' => 201,
                '__body' => [
                    'entry' => self::normalizeFeedback($db->first('SELECT * FROM event_feedback WHERE id = ?', [$created['lastInsertRowid']])),
                    'summary' => self::computeEventFeedbackSummary($all),
                ],
            ];
        }, write: true);
    }

    public function deleteFeedback(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM event_feedback WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Feedback entry not found.');
            }
            $db->execute('DELETE FROM event_feedback WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
