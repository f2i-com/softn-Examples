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

final class SupportController
{
    private const TICKET_CATS = ['Billing', 'Technical', 'General Inquiry', 'Account', 'Shipping / Delivery', 'Other'];
    private const TICKET_PRIOS = ['Low', 'Medium', 'High', 'Urgent'];
    private const TICKET_STATUSES = ['Open', 'In Progress', 'Waiting on Customer', 'Escalated', 'Resolved', 'Closed'];
    private const ESC_REASONS = [
        'SLA Breach',
        'Customer Dissatisfied',
        'Complex Technical Issue',
        'Repeated Contact',
        'Legal / Compliance',
        'VIP Customer',
        'Other',
    ];
    private const ESC_URGENCIES = [
        'Low (within 48h)',
        'Medium (within 24h)',
        'High (within 4h)',
        'Critical (immediate)',
    ];
    private const REFUND_REASONS = [
        'Defective / Damaged',
        'Wrong Item Received',
        'Not as Described',
        'No Longer Needed',
        'Billing Error',
        'Other',
    ];
    private const REFUND_METHODS = ['Original Payment Method', 'Store Credit', 'Bank Transfer', 'Check'];
    private const REFUND_STATUSES = ['Pending', 'Approved', 'Declined', 'Refunded'];

    /** @return array<string, mixed>|null */
    private static function hydrateTicket(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        if (array_key_exists('active_escalations', $row)) {
            $row['active_escalations'] = (int) $row['active_escalations'];
        }
        $notes = V::parseJson($row['internal_notes_json'] ?? '', []);
        $row['internal_notes'] = is_array($notes) ? $notes : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeEscalation(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['ticket_id'] = isset($row['ticket_id']) && $row['ticket_id'] !== null && $row['ticket_id'] !== ''
            ? (int) $row['ticket_id']
            : null;
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeRefund(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['amount_cents'] = (int) ($row['amount_cents'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        return $row;
    }

    // ---- Support Tickets ----

    public function listTickets(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 40]);
            $priority = V::text($input['priority'] ?? null, 'priority', ['required' => false, 'max' => 30]);
            $category = V::text($input['category'] ?? null, 'category', ['required' => false, 'max' => 40]);

            $sql =
                "SELECT t.*, (SELECT COUNT(*) FROM escalations e WHERE e.ticket_id = t.id AND e.status = 'Active') AS active_escalations "
                . 'FROM support_tickets t WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND t.status = ?';
                $params[] = $status;
            }
            if ($priority !== '' && $priority !== 'All') {
                $sql .= ' AND t.priority = ?';
                $params[] = $priority;
            }
            if ($category !== '' && $category !== 'All') {
                $sql .= ' AND t.category = ?';
                $params[] = $category;
            }
            $sql .= " ORDER BY CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, t.updated_at DESC";

            $rows = $db->query($sql, $params);
            return ['tickets' => array_map([self::class, 'hydrateTicket'], $rows)];
        });
    }

    public function addTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $cust = V::text($input['customer_name'] ?? null, 'customer_name', ['max' => 120, 'label' => 'Customer name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true, 'label' => 'Email address']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $cat = V::oneOf($input['category'] ?? null, self::TICKET_CATS, 'category', ['fallback' => 'Technical']);
            $prio = V::oneOf($input['priority'] ?? null, self::TICKET_PRIOS, 'priority', ['fallback' => 'Medium']);
            $subject = V::text($input['subject'] ?? null, 'subject', ['max' => 200, 'label' => 'Subject']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 2500, 'label' => 'Description']);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 80]);

            $curSeq = (int) ($ctx['settings']['ticket_seq'] ?? 0);
            $nextSeq = ($curSeq > 0 ? $curSeq : 1000) + 1;
            $db->execute('UPDATE business_settings SET ticket_seq = ? WHERE id = 1', [$nextSeq]);
            $tktNum = 'TKT-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO support_tickets(ticket_number, customer_name, email, phone, category, priority, status, subject, description, assigned_to, internal_notes_json, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, '[]', 0, ?, ?)",
                [$tktNum, $cust, $em, $phone, $cat, $prio, $subject, $desc, $assigned, $ts, $ts]
            );
            $row = self::hydrateTicket($db->first('SELECT * FROM support_tickets WHERE id = ?', [$created['lastInsertRowid']]));
            $row['active_escalations'] = 0;

            return ['__status' => 201, '__body' => ['ticket' => $row]];
        }, write: true);
    }

    public function saveTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM support_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Ticket not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::TICKET_STATUSES, 'status', ['fallback' => $cur['status']]);
            $priority = V::oneOf($input['priority'] ?? null, self::TICKET_PRIOS, 'priority', ['fallback' => $cur['priority']]);
            $category = V::oneOf($input['category'] ?? null, self::TICKET_CATS, 'category', ['fallback' => $cur['category']]);
            $assigned = array_key_exists('assigned_to', $input)
                ? V::text($input['assigned_to'], 'assigned_to', ['required' => false, 'max' => 80])
                : (string) $cur['assigned_to'];
            $subject = array_key_exists('subject', $input)
                ? V::text($input['subject'], 'subject', ['max' => 200])
                : (string) $cur['subject'];
            $desc = array_key_exists('description', $input)
                ? V::text($input['description'], 'description', ['max' => 2500])
                : (string) $cur['description'];

            $db->execute(
                'UPDATE support_tickets SET status = ?, priority = ?, category = ?, assigned_to = ?, subject = ?, description = ?, updated_at = ? WHERE id = ?',
                [$status, $priority, $category, $assigned, $subject, $desc, V::now(), $id]
            );

            return ['ticket' => self::hydrateTicket($db->first('SELECT * FROM support_tickets WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function addTicketNote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM support_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Ticket not found.');
            }
            $body = V::text($input['body'] ?? null, 'body', ['max' => 1500, 'label' => 'Triage note']);
            $notes = V::parseJson($cur['internal_notes_json'] ?? '', []);
            if (!is_array($notes)) {
                $notes = [];
            }
            $ts = V::now();
            $notes[] = ['author' => (string) $ctx['member']['display_name'], 'body' => $body, 'ts' => $ts];

            $db->execute(
                'UPDATE support_tickets SET internal_notes_json = ?, updated_at = ? WHERE id = ?',
                [json_encode($notes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ts, $id]
            );

            return ['ticket' => self::hydrateTicket($db->first('SELECT * FROM support_tickets WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function escalateTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $ticketId = V::rowId($input['ticket_id'] ?? null, 'ticket_id');
            $tkt = $db->first('SELECT * FROM support_tickets WHERE id = ?', [$ticketId]);
            if (!$tkt) {
                HttpException::fail(404, 'ticket_not_found', 'Ticket not found.');
            }
            $reason = V::oneOf($input['escalation_reason'] ?? null, self::ESC_REASONS, 'escalation_reason', ['fallback' => 'Complex Technical Issue']);
            $curStatus = V::text($input['current_status'] ?? null, 'current_status', ['required' => false, 'max' => 1200])
                ?: ('Escalated from ' . $tkt['ticket_number'] . ': ' . $tkt['subject']);
            $outcome = V::text($input['desired_outcome'] ?? null, 'desired_outcome', ['max' => 1000, 'label' => 'Desired outcome']);
            $urgency = V::oneOf($input['urgency'] ?? null, self::ESC_URGENCIES, 'urgency', ['fallback' => 'High (within 4h)']);
            $escTo = V::text($input['escalated_to'] ?? null, 'escalated_to', ['max' => 100, 'label' => 'Escalated to']);
            $escDate = V::day($input['escalation_date'] ?? null, 'escalation_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO escalations(ticket_id, escalation_reason, current_status, desired_outcome, urgency, escalated_to, escalated_by, escalation_date, notes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0, ?, ?)",
                [$ticketId, $reason, $curStatus, $outcome, $urgency, $escTo, (string) $ctx['member']['display_name'], $escDate, $notes, $ts, $ts]
            );

            $tktNotes = V::parseJson($tkt['internal_notes_json'] ?? '', []);
            if (!is_array($tktNotes)) {
                $tktNotes = [];
            }
            $tktNotes[] = [
                'author' => (string) $ctx['member']['display_name'],
                'body' => 'Escalated to ' . $escTo . ' (' . $reason . ' · ' . $urgency . ')',
                'ts' => $ts,
            ];
            $db->execute(
                "UPDATE support_tickets SET status = 'Escalated', internal_notes_json = ?, updated_at = ? WHERE id = ?",
                [json_encode($tktNotes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ts, $ticketId]
            );

            $esc = self::normalizeEscalation($db->first(
                'SELECT e.*, t.ticket_number, t.subject AS ticket_subject, t.customer_name FROM escalations e LEFT JOIN support_tickets t ON t.id = e.ticket_id WHERE e.id = ?',
                [$created['lastInsertRowid']]
            ));
            $updatedTicket = self::hydrateTicket($db->first('SELECT * FROM support_tickets WHERE id = ?', [$ticketId]));

            return [
                '__status' => 201,
                '__body' => [
                    'escalation' => $esc,
                    'ticket' => $updatedTicket,
                ],
            ];
        }, write: true);
    }

    public function deleteTicket(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM support_tickets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Ticket not found.');
            }
            $db->execute('DELETE FROM escalations WHERE ticket_id = ?', [$id]);
            $db->execute('DELETE FROM support_tickets WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Escalations Desk ----

    public function listEscalations(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $st = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql =
                'SELECT e.*, t.ticket_number, t.subject AS ticket_subject, t.customer_name, t.priority AS ticket_priority '
                . 'FROM escalations e LEFT JOIN support_tickets t ON t.id = e.ticket_id WHERE 1=1';
            $params = [];
            if ($st !== '' && $st !== 'All') {
                $sql .= ' AND e.status = ?';
                $params[] = $st;
            }
            $sql .= " ORDER BY CASE e.status WHEN 'Active' THEN 0 ELSE 1 END, e.created_at DESC";
            $rows = $db->query($sql, $params);
            return ['escalations' => array_map([self::class, 'normalizeEscalation'], $rows)];
        });
    }

    public function addEscalation(Request $req, Response $res): Response
    {
        return $this->escalateTicket($req, $res);
    }

    public function resolveEscalation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM escalations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Escalation not found.');
            }
            $ts = V::now();
            $db->execute("UPDATE escalations SET status = 'Resolved', updated_at = ? WHERE id = ?", [$ts, $id]);
            if (!empty($cur['ticket_id']) && V::bool($input['resolveTicket'] ?? false)) {
                $db->execute("UPDATE support_tickets SET status = 'Resolved', updated_at = ? WHERE id = ?", [$ts, (int) $cur['ticket_id']]);
            }
            return ['escalation' => self::normalizeEscalation($db->first('SELECT * FROM escalations WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteEscalation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM escalations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Escalation not found.');
            }
            $db->execute('DELETE FROM escalations WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Refund & Return Requests ----

    public function listRefunds(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $st = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT * FROM refund_requests WHERE 1=1';
            $params = [];
            if ($st !== '' && $st !== 'All') {
                $sql .= ' AND status = ?';
                $params[] = $st;
            }
            $sql .= " ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, created_at DESC";
            $rows = $db->query($sql, $params);
            return ['refunds' => array_map([self::class, 'normalizeRefund'], $rows)];
        });
    }

    public function addRefund(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $cust = V::text($input['customer_name'] ?? null, 'customer_name', ['max' => 120, 'label' => 'Customer name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $orderNum = V::text($input['order_number'] ?? null, 'order_number', ['max' => 60, 'label' => 'Order number']);
            $pDate = V::day($input['purchase_date'] ?? null, 'purchase_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $items = V::text($input['items'] ?? null, 'items', ['max' => 600, 'label' => 'Items']);
            $reason = V::oneOf($input['reason'] ?? null, self::REFUND_REASONS, 'reason', ['fallback' => 'Defective / Damaged']);
            $method = V::oneOf($input['refund_method'] ?? null, self::REFUND_METHODS, 'refund_method', ['fallback' => 'Original Payment Method']);
            $amt = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 100000000, 'label' => 'Refund amount']);
            $details = V::text($input['additional_details'] ?? null, 'additional_details', ['required' => false, 'max' => 1000]);
            $ts = V::now();

            $created = $db->execute(
                "INSERT INTO refund_requests(customer_name, email, order_number, purchase_date, items, reason, refund_method, amount_cents, additional_details, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)",
                [$cust, $em, $orderNum, $pDate, $items, $reason, $method, $amt, $details, $ts, $ts]
            );

            return [
                '__status' => 201,
                '__body' => ['refund' => self::normalizeRefund($db->first('SELECT * FROM refund_requests WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function setRefundStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM refund_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Refund request not found.');
            }
            $st = V::oneOf($input['status'] ?? null, self::REFUND_STATUSES, 'status');
            $db->execute('UPDATE refund_requests SET status = ?, updated_at = ? WHERE id = ?', [$st, V::now(), $id]);
            return ['refund' => self::normalizeRefund($db->first('SELECT * FROM refund_requests WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteRefund(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM refund_requests WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Refund request not found.');
            }
            $db->execute('DELETE FROM refund_requests WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
