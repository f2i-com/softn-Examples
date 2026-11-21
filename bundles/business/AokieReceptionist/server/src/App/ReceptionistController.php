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

final class ReceptionistController
{
    private const CALL_DIRS = ['Inbound', 'Outbound'];
    private const CALL_STATUSES = ['Ringing', 'Active', 'Completed', 'Missed', 'Voicemail'];
    private const CALL_INTENTS = ['Booking', 'Order', 'Question', 'Message', 'Other'];
    private const CALL_SENTIMENTS = ['Positive', 'Neutral', 'Negative'];
    private const SPEAKERS = ['Caller', 'Aokie', 'Operator', 'System'];
    private const TURN_SOURCES = ['stt', 'audio_model', 'operator', 'flow'];
    private const APPT_STATUSES = ['Requested', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
    private const ORD_STATUSES = ['New', 'Confirmed', 'Ready', 'Delivered', 'Cancelled'];
    private const SOURCES = ['Call', 'SMS', 'Manual', 'Flow'];
    private const TASK_STATUSES = ['Open', 'In progress', 'Done', 'Cancelled'];
    private const TASK_PRIOS = ['Low', 'Medium', 'High', 'Urgent'];
    private const CUST_STATUSES = ['Active', 'VIP', 'Inactive', 'Blocked'];
    private const HW_SEVS = ['Info', 'Warning', 'Error'];

    private static function optionalRowId(mixed $value, string $name): ?int
    {
        if ($value === null || $value === '' || $value === 0 || $value === false) {
            return null;
        }
        return V::rowId($value, $name);
    }

    private static function previewSlice(string $text, int $len = 140): string
    {
        return function_exists('mb_substr') ? mb_substr($text, 0, $len, 'UTF-8') : substr($text, 0, $len);
    }

    /** @return array<string, mixed> */
    private static function upsertSmsThread(
        Database $db,
        string $phone,
        string $displayName,
        ?int $customerId,
        string $preview,
        bool $isInbound,
        int $ts
    ): array {
        $tail = WorkspaceController::phoneTail($phone);
        $threads = $db->query('SELECT * FROM ak_sms_threads ORDER BY last_message_at DESC LIMIT 200');
        $found = null;
        if (strlen($tail) >= 6) {
            foreach ($threads as $t) {
                if (WorkspaceController::phoneTail($t['phone'] ?? '') === $tail) {
                    $found = $t;
                    break;
                }
            }
        }

        $shortPreview = self::previewSlice($preview, 140);
        if (!$found) {
            $cust = $customerId !== null
                ? $db->first('SELECT * FROM ak_customers WHERE id = ?', [$customerId])
                : WorkspaceController::lookupCustomerByPhone($db, $phone);
            $resolvedName = $displayName !== '' ? $displayName : ($cust ? (string) $cust['name'] : $phone);
            $res = $db->execute(
                "INSERT INTO ak_sms_threads(customer_id, phone, display_name, last_message_at, last_preview, unread_count, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 'Active', 0, ?)",
                [$cust ? $cust['id'] : null, $phone, $resolvedName, $ts, $shortPreview, $isInbound ? 1 : 0, $ts]
            );
            return $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$res['lastInsertRowid']]) ?? [];
        }

        $nextUnread = $isInbound ? ((int) ($found['unread_count'] ?? 0)) + 1 : (int) ($found['unread_count'] ?? 0);
        $db->execute(
            "UPDATE ak_sms_threads SET last_message_at = ?, last_preview = ?, unread_count = ?, status = 'Active' WHERE id = ?",
            [$ts, $shortPreview, $nextUnread, $found['id']]
        );
        return $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$found['id']]) ?? [];
    }

    // ---- Live Call Console & Transcripts ----

    public function listCalls(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT c.*, cu.status AS customer_tier, cu.sms_capable FROM ak_calls c LEFT JOIN ak_customers cu ON cu.id = c.customer_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                if ($status === 'Live') {
                    $sql .= " AND c.status IN ('Ringing', 'Active')";
                } else {
                    $sql .= ' AND c.status = ?';
                    $params[] = $status;
                }
            }
            $sql .= " ORDER BY CASE WHEN c.status IN ('Ringing', 'Active') THEN 0 ELSE 1 END, c.started_at DESC LIMIT 120";
            return ['calls' => $db->query($sql, $params)];
        });
    }

    public function getCallDetail(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $call = $db->first(
                'SELECT c.*, cu.status AS customer_tier, cu.sms_capable, cu.preferred_service, cu.notes AS customer_notes FROM ak_calls c LEFT JOIN ak_customers cu ON cu.id = c.customer_id WHERE c.id = ?',
                [$id]
            );
            if (!$call) {
                HttpException::fail(404, 'call_not_found', 'Call record not found.');
            }
            $turns = $db->query('SELECT * FROM ak_transcript_turns WHERE call_id = ? ORDER BY turn_index ASC, id ASC', [$id]);
            return ['call' => $call, 'turns' => $turns];
        });
    }

    public function addCall(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $phone = V::text($input['caller_phone'] ?? null, 'caller_phone', ['max' => 40, 'label' => 'Caller phone']);
            $matched = WorkspaceController::lookupCustomerByPhone($db, $phone);
            $callerName = V::text($input['caller_name'] ?? null, 'caller_name', ['required' => false, 'max' => 120])
                ?: ($matched ? (string) $matched['name'] : 'Unknown Caller');
            $direction = V::oneOf($input['direction'] ?? null, self::CALL_DIRS, 'direction', ['fallback' => 'Inbound']);
            $status = V::oneOf($input['status'] ?? null, self::CALL_STATUSES, 'status', ['fallback' => 'Ringing']);
            $intent = V::oneOf($input['intent'] ?? null, self::CALL_INTENTS, 'intent', ['fallback' => 'Question']);
            $sentiment = V::oneOf($input['sentiment'] ?? null, self::CALL_SENTIMENTS, 'sentiment', ['fallback' => 'Neutral']);
            $summary = V::text($input['summary'] ?? null, 'summary', ['required' => false, 'max' => 1500]);
            $duration = V::int($input['duration_seconds'] ?? null, 'duration_seconds', ['required' => false, 'min' => 0, 'max' => 86400, 'fallback' => 0]) ?? 0;
            $followUp = V::bool($input['follow_up_required'] ?? false) ? 1 : 0;

            $settings = Context::getBusinessSettings($db);
            $nextSeq = (int) (($settings && !empty($settings['call_seq'])) ? $settings['call_seq'] : 1000) + 1;
            $db->execute('UPDATE business_settings SET call_seq = ? WHERE id = 1', [$nextSeq]);
            $code = 'CALL-' . $nextSeq;
            $ts = V::now();
            $answeredAt = ($status === 'Active' || $status === 'Completed') ? $ts : 0;
            $endedAt = ($status === 'Completed' || $status === 'Missed' || $status === 'Voicemail') ? $ts : 0;

            $created = $db->execute(
                'INSERT INTO ak_calls(call_code, customer_id, caller_name, caller_phone, direction, status, started_at, answered_at, ended_at, duration_seconds, summary, intent, sentiment, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$code, $matched ? $matched['id'] : null, $callerName, $phone, $direction, $status, $ts, $answeredAt, $endedAt, $duration, $summary, $intent, $sentiment, $followUp, $ts]
            );
            $callId = $created['lastInsertRowid'];

            // Seed initial opening turn if provided, or AI greeting when Active
            $opening = V::text($input['opening_turn'] ?? null, 'opening_turn', ['required' => false, 'max' => 600]);
            if ($opening !== '') {
                $db->execute(
                    "INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, 1, 'Caller', ?, 'stt', 0, 0, ?)",
                    [$callId, $opening, $ts]
                );
            } elseif ($status === 'Active') {
                $cfg = WorkspaceController::ensureReceptionistConfig($db, $settings ? (string) ($settings['business_name'] ?? '') : '');
                $greeting = !empty($cfg['greeting']) ? (string) $cfg['greeting'] : 'Hello, Aokie speaking. How can I help you today?';
                $db->execute(
                    "INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, 1, 'Aokie', ?, 'flow', 0, 0, ?)",
                    [$callId, $greeting, $ts]
                );
            }
            if ($matched) {
                $db->execute('UPDATE ak_customers SET last_call_at = ? WHERE id = ?', [V::utcDay(0), $matched['id']]);
            }

            $row = $db->first(
                'SELECT c.*, cu.status AS customer_tier, cu.sms_capable FROM ak_calls c LEFT JOIN ak_customers cu ON cu.id = c.customer_id WHERE c.id = ?',
                [$callId]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'call' => $row,
                    'matchedCustomer' => $matched,
                    'counts' => WorkspaceController::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function setCallStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM ak_calls WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'call_not_found', 'Call record not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::CALL_STATUSES, 'status', ['fallback' => $cur['status']]);
            $summary = array_key_exists('summary', $input)
                ? V::text($input['summary'], 'summary', ['required' => false, 'max' => 1500])
                : (string) ($cur['summary'] ?? '');
            $intent = !empty($input['intent']) ? V::oneOf($input['intent'], self::CALL_INTENTS, 'intent') : (string) $cur['intent'];
            $sentiment = !empty($input['sentiment']) ? V::oneOf($input['sentiment'], self::CALL_SENTIMENTS, 'sentiment') : (string) $cur['sentiment'];
            $ts = V::now();
            $answeredAt = ((int) ($cur['answered_at'] ?? 0)) ?: ($status === 'Active' ? $ts : 0);
            $endedAt = (int) ($cur['ended_at'] ?? 0);
            $duration = (int) ($cur['duration_seconds'] ?? 0);
            if (($status === 'Completed' || $status === 'Missed' || $status === 'Voicemail') && !$endedAt) {
                $endedAt = $ts;
                $startedAt = (int) ($cur['started_at'] ?? $ts);
                $duration = max($duration, max(0, $ts - $startedAt));
            }
            $db->execute(
                'UPDATE ak_calls SET status = ?, summary = ?, intent = ?, sentiment = ?, answered_at = ?, ended_at = ?, duration_seconds = ? WHERE id = ?',
                [$status, $summary, $intent, $sentiment, $answeredAt, $endedAt, $duration, $id]
            );
            return [
                'call' => $db->first('SELECT * FROM ak_calls WHERE id = ?', [$id]),
                'counts' => WorkspaceController::badgeCounts($db),
            ];
        }, write: true);
    }

    public function addTranscriptTurn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $callId = V::rowId($input['call_id'] ?? null, 'call_id');
            $call = $db->first('SELECT * FROM ak_calls WHERE id = ?', [$callId]);
            if (!$call) {
                HttpException::fail(404, 'call_not_found', 'Call not found.');
            }
            $speaker = V::oneOf($input['speaker'] ?? null, self::SPEAKERS, 'speaker', ['fallback' => 'Caller']);
            $body = V::text($input['text'] ?? null, 'text', ['max' => 1500, 'label' => 'Transcript text']);
            $defaultSource = $speaker === 'Operator' ? 'operator' : ($speaker === 'Aokie' ? 'flow' : 'stt');
            $src = V::oneOf($input['source'] ?? null, self::TURN_SOURCES, 'source', ['fallback' => $defaultSource]);
            $maxRow = $db->first('SELECT COALESCE(MAX(turn_index), 0) AS m FROM ak_transcript_turns WHERE call_id = ?', [$callId]);
            $nextIdx = ($maxRow ? (int) $maxRow['m'] : 0) + 1;
            $created = $db->execute(
                'INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, 0, ?)',
                [$callId, $nextIdx, $speaker, $body, $src, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['turn' => $db->first('SELECT * FROM ak_transcript_turns WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function deleteCall(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_calls WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Call not found.');
            }
            $db->execute('DELETE FROM ak_transcript_turns WHERE call_id = ?', [$id]);
            $db->execute('DELETE FROM ak_calls WHERE id = ?', [$id]);
            return ['deleted' => true, 'counts' => WorkspaceController::badgeCounts($db)];
        }, write: true);
    }

    // ---- Two-Pane SMS Inbox ----

    public function listSmsThreads(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $threads = $db->query(
                "SELECT t.*, (SELECT COUNT(*) FROM ak_sms_messages m WHERE m.thread_id = t.id AND m.status = 'Draft' AND m.approval_status = 'Pending approval') AS draft_count FROM ak_sms_threads t ORDER BY t.last_message_at DESC LIMIT 150"
            );
            return ['threads' => $threads];
        });
    }

    public function listSmsMessages(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $threadId = V::rowId($input['thread_id'] ?? null, 'thread_id');
            $thread = $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$threadId]);
            if (!$thread) {
                HttpException::fail(404, 'thread_not_found', 'SMS thread not found.');
            }
            $msgs = $db->query('SELECT * FROM ak_sms_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC', [$threadId]);
            return ['thread' => $thread, 'messages' => $msgs];
        });
    }

    public function sendSmsMessage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $body = V::text($input['body'] ?? null, 'body', ['max' => 1600, 'label' => 'SMS message']);
            $direction = V::oneOf($input['direction'] ?? null, ['Inbound', 'Outbound'], 'direction', ['fallback' => 'Outbound']);
            $isAiDraft = ($direction === 'Outbound') && V::bool($input['is_ai_reply'] ?? false);
            $ts = V::now();

            if (!empty($input['thread_id'])) {
                $tid = V::rowId($input['thread_id'], 'thread_id');
                $thread = $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$tid]);
                if (!$thread) {
                    HttpException::fail(404, 'thread_not_found', 'SMS thread not found.');
                }
                $nextUnread = ($direction === 'Inbound') ? ((int) ($thread['unread_count'] ?? 0)) + 1 : 0;
                $db->execute(
                    'UPDATE ak_sms_threads SET last_message_at = ?, last_preview = ?, unread_count = ? WHERE id = ?',
                    [$ts, self::previewSlice($body, 140), $nextUnread, $tid]
                );
                $thread = $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$tid]);
            } else {
                $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
                $disp = V::text($input['display_name'] ?? null, 'display_name', ['required' => false, 'max' => 120]);
                $customerId = self::optionalRowId($input['customer_id'] ?? null, 'customer_id');
                $thread = self::upsertSmsThread($db, $phone, $disp, $customerId, $body, $direction === 'Inbound', $ts);
            }

            $msgStatus = $direction === 'Inbound' ? 'Received' : ($isAiDraft ? 'Draft' : 'Sent');
            $approval = $isAiDraft ? 'Pending approval' : 'Not required';
            $note = $isAiDraft ? 'AI Draft queued for review' : ($direction === 'Outbound' ? 'Sent via Aokie Bridge' : '');

            $created = $db->execute(
                'INSERT INTO ak_sms_messages(thread_id, phone, direction, body, status, is_ai_reply, approval_status, delivery_note, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$thread['id'], $thread['phone'], $direction, $body, $msgStatus, $isAiDraft ? 1 : 0, $approval, $note, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'thread' => $thread,
                    'message' => $db->first('SELECT * FROM ak_sms_messages WHERE id = ?', [$created['lastInsertRowid']]),
                    'counts' => WorkspaceController::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function markThreadRead(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $tid = V::rowId($input['thread_id'] ?? null, 'thread_id');
            if (!$db->first('SELECT id FROM ak_sms_threads WHERE id = ?', [$tid])) {
                HttpException::fail(404, 'thread_not_found', 'SMS thread not found.');
            }
            $db->execute('UPDATE ak_sms_threads SET unread_count = 0 WHERE id = ?', [$tid]);
            return [
                'thread' => $db->first('SELECT * FROM ak_sms_threads WHERE id = ?', [$tid]),
                'counts' => WorkspaceController::badgeCounts($db),
            ];
        }, write: true);
    }

    public function approveSmsDraft(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM ak_sms_messages WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'message_not_found', 'SMS message not found.');
            }
            $decision = V::oneOf($input['decision'] ?? null, ['Approved', 'Rejected'], 'decision');
            $nextStatus = $decision === 'Approved' ? 'Sent' : 'Failed';
            $note = $decision === 'Approved' ? 'Approved & sent via Aokie Bridge' : 'Draft rejected by operator';
            $db->execute(
                'UPDATE ak_sms_messages SET approval_status = ?, status = ?, delivery_note = ? WHERE id = ?',
                [$decision, $nextStatus, $note, $id]
            );
            return [
                'message' => $db->first('SELECT * FROM ak_sms_messages WHERE id = ?', [$id]),
                'counts' => WorkspaceController::badgeCounts($db),
            ];
        }, write: true);
    }

    public function deleteSmsThread(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $tid = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_sms_threads WHERE id = ?', [$tid])) {
                HttpException::fail(404, 'thread_not_found', 'SMS thread not found.');
            }
            $db->execute('DELETE FROM ak_sms_messages WHERE thread_id = ?', [$tid]);
            $db->execute('DELETE FROM ak_sms_threads WHERE id = ?', [$tid]);
            return ['deleted' => true, 'counts' => WorkspaceController::badgeCounts($db)];
        }, write: true);
    }

    // ---- Appointments & Orders Desk ----

    public function listAppointments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            return ['appointments' => $db->query('SELECT * FROM ak_appointments ORDER BY appt_date ASC, appt_time ASC LIMIT 150')];
        });
    }

    public function addAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $callerName = V::text($input['caller_name'] ?? null, 'caller_name', ['max' => 120, 'label' => 'Caller name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $service = V::text($input['service'] ?? null, 'service', ['max' => 140, 'label' => 'Service']);
            $apptDate = V::day($input['appt_date'] ?? null, 'appt_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $apptTime = V::timeStr($input['appt_time'] ?? null, 'appt_time', ['required' => false, 'fallback' => '10:00']);
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status', ['fallback' => 'Requested']);
            $source = V::oneOf($input['source'] ?? null, self::SOURCES, 'source', ['fallback' => 'Call']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $callId = self::optionalRowId($input['call_id'] ?? null, 'call_id');
            $custInputId = self::optionalRowId($input['customer_id'] ?? null, 'customer_id');
            $cust = $custInputId !== null
                ? $db->first('SELECT id FROM ak_customers WHERE id = ?', [$custInputId])
                : ($phone !== '' ? WorkspaceController::lookupCustomerByPhone($db, $phone) : null);

            $created = $db->execute(
                'INSERT INTO ak_appointments(customer_id, call_id, caller_name, phone, service, appt_date, appt_time, status, source, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$cust ? $cust['id'] : null, $callId, $callerName, $phone, $service, $apptDate, $apptTime, $status, $source, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['appointment' => $db->first('SELECT * FROM ak_appointments WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function setAppointmentStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_appointments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Appointment not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::APPT_STATUSES, 'status');
            $db->execute('UPDATE ak_appointments SET status = ? WHERE id = ?', [$status, $id]);
            return ['appointment' => $db->first('SELECT * FROM ak_appointments WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteAppointment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_appointments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Appointment not found.');
            }
            $db->execute('DELETE FROM ak_appointments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    public function listOrders(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            return ['orders' => $db->query('SELECT * FROM ak_orders ORDER BY created_at DESC LIMIT 150')];
        });
    }

    public function addOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $custName = V::text($input['customer_name'] ?? null, 'customer_name', ['max' => 120, 'label' => 'Customer name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $status = V::oneOf($input['status'] ?? null, self::ORD_STATUSES, 'status', ['fallback' => 'New']);
            $source = V::oneOf($input['source'] ?? null, self::SOURCES, 'source', ['fallback' => 'Call']);
            $totalCents = V::moneyCents($input['total'] ?? null, 'total', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['max' => 1200, 'label' => 'Order details']);
            $callId = self::optionalRowId($input['call_id'] ?? null, 'call_id');
            $custInputId = self::optionalRowId($input['customer_id'] ?? null, 'customer_id');
            $cust = $custInputId !== null
                ? $db->first('SELECT id FROM ak_customers WHERE id = ?', [$custInputId])
                : ($phone !== '' ? WorkspaceController::lookupCustomerByPhone($db, $phone) : null);

            $created = $db->execute(
                'INSERT INTO ak_orders(customer_id, call_id, customer_name, phone, status, source, total_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$cust ? $cust['id'] : null, $callId, $custName, $phone, $status, $source, $totalCents, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['order' => $db->first('SELECT * FROM ak_orders WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function setOrderStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_orders WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Order not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::ORD_STATUSES, 'status');
            $db->execute('UPDATE ak_orders SET status = ? WHERE id = ?', [$status, $id]);
            return ['order' => $db->first('SELECT * FROM ak_orders WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteOrder(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_orders WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Order not found.');
            }
            $db->execute('DELETE FROM ak_orders WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Follow-Up Tasks Queue ----

    public function listTasks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $tasks = $db->query(
                "SELECT * FROM ak_tasks ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'In progress' THEN 1 ELSE 2 END, CASE priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, due_at ASC LIMIT 150"
            );
            return ['tasks' => $tasks];
        });
    }

    public function addTask(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $summary = V::text($input['summary'] ?? null, 'summary', ['max' => 200, 'label' => 'Task summary']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $dueAt = V::day($input['due_at'] ?? null, 'due_at', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::oneOf($input['status'] ?? null, self::TASK_STATUSES, 'status', ['fallback' => 'Open']);
            $priority = V::oneOf($input['priority'] ?? null, self::TASK_PRIOS, 'priority', ['fallback' => 'Medium']);
            $assignee = V::text($input['assignee'] ?? null, 'assignee', ['required' => false, 'max' => 100])
                ?: (string) ($ctx['member']['display_name'] ?? 'Front Desk');
            $smsState = V::text($input['sms_state'] ?? null, 'sms_state', ['required' => false, 'max' => 60]) ?: 'None';
            $cbState = V::text($input['callback_state'] ?? null, 'callback_state', ['required' => false, 'max' => 60]) ?: 'None';
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $callId = self::optionalRowId($input['call_id'] ?? null, 'call_id');
            $custInputId = self::optionalRowId($input['customer_id'] ?? null, 'customer_id');
            $cust = $custInputId !== null
                ? $db->first('SELECT id FROM ak_customers WHERE id = ?', [$custInputId])
                : ($phone !== '' ? WorkspaceController::lookupCustomerByPhone($db, $phone) : null);

            $created = $db->execute(
                'INSERT INTO ak_tasks(customer_id, call_id, phone, summary, due_at, status, assignee, priority, sms_state, callback_state, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$cust ? $cust['id'] : null, $callId, $phone, $summary, $dueAt, $status, $assignee, $priority, $smsState, $cbState, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'task' => $db->first('SELECT * FROM ak_tasks WHERE id = ?', [$created['lastInsertRowid']]),
                    'counts' => WorkspaceController::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function setTaskStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_tasks WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Task not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::TASK_STATUSES, 'status');
            $db->execute('UPDATE ak_tasks SET status = ? WHERE id = ?', [$status, $id]);
            return [
                'task' => $db->first('SELECT * FROM ak_tasks WHERE id = ?', [$id]),
                'counts' => WorkspaceController::badgeCounts($db),
            ];
        }, write: true);
    }

    public function deleteTask(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_tasks WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Task not found.');
            }
            $db->execute('DELETE FROM ak_tasks WHERE id = ?', [$id]);
            return ['deleted' => true, 'counts' => WorkspaceController::badgeCounts($db)];
        }, write: true);
    }

    // ---- Callers / Customers CRM ----

    public function listCustomers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 80]);
            $sql = 'SELECT * FROM ak_customers WHERE 1=1';
            $params = [];
            if ($q !== '') {
                $like = V::likeTerm($q);
                $sql .= " AND (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR preferred_service LIKE ? ESCAPE '\\')";
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }
            $sql .= " ORDER BY CASE status WHEN 'VIP' THEN 0 WHEN 'Active' THEN 1 ELSE 2 END, name ASC LIMIT 200";
            return ['customers' => $db->query($sql, $params)];
        });
    }

    public function addCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $pref = V::text($input['preferred_service'] ?? null, 'preferred_service', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::CUST_STATUSES, 'status', ['fallback' => 'Active']);
            $smsCap = V::oneOf($input['sms_capable'] ?? null, ['Yes', 'No'], 'sms_capable', ['fallback' => 'Yes']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                "INSERT INTO ak_customers(name, phone, email, preferred_service, status, sms_capable, last_call_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, '', ?, 0, ?)",
                [$name, $phone, $em, $pref, $status, $smsCap, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['customer' => $db->first('SELECT * FROM ak_customers WHERE id = ?', [$created['lastInsertRowid']])],
            ];
        }, write: true);
    }

    public function saveCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM ak_customers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Customer not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $pref = V::text($input['preferred_service'] ?? null, 'preferred_service', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::CUST_STATUSES, 'status', ['fallback' => $cur['status']]);
            $smsCap = V::oneOf($input['sms_capable'] ?? null, ['Yes', 'No'], 'sms_capable', ['fallback' => $cur['sms_capable']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE ak_customers SET name = ?, phone = ?, email = ?, preferred_service = ?, status = ?, sms_capable = ?, notes = ? WHERE id = ?',
                [$name, $phone, $em, $pref, $status, $smsCap, $notes, $id]
            );
            return ['customer' => $db->first('SELECT * FROM ak_customers WHERE id = ?', [$id])];
        }, write: true);
    }

    public function deleteCustomer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_customers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Customer not found.');
            }
            $db->execute('DELETE FROM ak_customers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Hardware & Bridge Events Log ----

    public function listHardwareEvents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            return ['events' => $db->query('SELECT * FROM ak_hardware_events ORDER BY occurred_at DESC, id DESC LIMIT 150')];
        });
    }

    public function addHardwareEvent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $evName = V::text($input['event_name'] ?? null, 'event_name', ['max' => 100, 'label' => 'Event name']);
            $sev = V::oneOf($input['severity'] ?? null, self::HW_SEVS, 'severity', ['fallback' => 'Info']);
            $msg = V::text($input['message'] ?? null, 'message', ['max' => 1200, 'label' => 'Message']);
            $dongle = V::text($input['dongle_id'] ?? null, 'dongle_id', ['required' => false, 'max' => 60]) ?: 'AOKIE-BT-01';
            $payload = V::text($input['payload_json'] ?? null, 'payload_json', ['required' => false, 'max' => 1500]) ?: '{}';
            $ts = V::now();
            $created = $db->execute(
                'INSERT INTO ak_hardware_events(event_name, severity, message, dongle_id, occurred_at, payload_json, acknowledged, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$evName, $sev, $msg, $dongle, $ts, $payload, $sev === 'Info' ? 1 : 0, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'event' => $db->first('SELECT * FROM ak_hardware_events WHERE id = ?', [$created['lastInsertRowid']]),
                    'counts' => WorkspaceController::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function ackHardwareEvent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_hardware_events WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Event not found.');
            }
            $db->execute('UPDATE ak_hardware_events SET acknowledged = 1 WHERE id = ?', [$id]);
            return [
                'event' => $db->first('SELECT * FROM ak_hardware_events WHERE id = ?', [$id]),
                'counts' => WorkspaceController::badgeCounts($db),
            ];
        }, write: true);
    }

    public function deleteHardwareEvent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM ak_hardware_events WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Event not found.');
            }
            $db->execute('DELETE FROM ak_hardware_events WHERE id = ?', [$id]);
            return ['deleted' => true, 'counts' => WorkspaceController::badgeCounts($db)];
        }, write: true);
    }

    // ---- AI Receptionist Persona & Routing Settings ----

    public function getReceptionistConfig(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            $ctx = Context::requireTeamAccess($db, $me);
            return ['config' => WorkspaceController::ensureReceptionistConfig($db, (string) ($ctx['settings']['business_name'] ?? ''))];
        });
    }

    public function saveReceptionistConfig(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $cur = WorkspaceController::ensureReceptionistConfig($db, (string) ($ctx['settings']['business_name'] ?? ''));

            $active = V::oneOf($input['active'] ?? null, ['Yes', 'No'], 'active', ['fallback' => $cur['active']]);
            $greeting = V::text($input['greeting'] ?? null, 'greeting', ['required' => false, 'max' => 400]);
            $instructions = V::text($input['instructions'] ?? null, 'instructions', ['required' => false, 'max' => 3000]);
            $bizInfo = V::text($input['business_info'] ?? null, 'business_info', ['required' => false, 'max' => 4000]);
            $replyMode = V::oneOf($input['reply_mode'] ?? null, ['Built-in AI agent', 'Custom flow'], 'reply_mode', ['fallback' => $cur['reply_mode']]);
            $smsEnabled = V::oneOf($input['sms_enabled'] ?? null, ['Yes', 'No'], 'sms_enabled', ['fallback' => $cur['sms_enabled']]);
            $whitelist = V::oneOf($input['whitelist_only'] ?? null, ['No', 'Yes'], 'whitelist_only', ['fallback' => $cur['whitelist_only']]);
            $cc = V::text($input['default_country_code'] ?? null, 'default_country_code', ['required' => false, 'max' => 10]) ?: '+61';
            $callRoute = V::text($input['call_route'] ?? null, 'call_route', ['required' => false, 'max' => 40]);
            $voice = V::text($input['voice'] ?? null, 'voice', ['required' => false, 'max' => 60]);
            $model = V::text($input['model'] ?? null, 'model', ['required' => false, 'max' => 120]);
            $llmSource = V::text($input['llm_source'] ?? null, 'llm_source', ['required' => false, 'max' => 80]);
            $llmEndpoint = V::text($input['llm_endpoint'] ?? null, 'llm_endpoint', ['required' => false, 'max' => 240]);
            $sttSource = V::text($input['stt_source'] ?? null, 'stt_source', ['required' => false, 'max' => 80]);
            $sttEndpoint = V::text($input['stt_endpoint'] ?? null, 'stt_endpoint', ['required' => false, 'max' => 240]);
            $ttsSource = V::text($input['tts_source'] ?? null, 'tts_source', ['required' => false, 'max' => 80]);
            $ttsEndpoint = V::text($input['tts_endpoint'] ?? null, 'tts_endpoint', ['required' => false, 'max' => 240]);
            $corrSource = V::text($input['correction_source'] ?? null, 'correction_source', ['required' => false, 'max' => 80]);
            $corrEndpoint = V::text($input['correction_endpoint'] ?? null, 'correction_endpoint', ['required' => false, 'max' => 240]);
            $bgSource = V::text($input['background_ai_source'] ?? null, 'background_ai_source', ['required' => false, 'max' => 80]);
            $bgModel = V::text($input['background_ai_model'] ?? null, 'background_ai_model', ['required' => false, 'max' => 120]);

            $db->execute(
                'UPDATE ak_receptionist_config SET active = ?, greeting = ?, instructions = ?, business_info = ?, reply_mode = ?, sms_enabled = ?, whitelist_only = ?, default_country_code = ?, call_route = ?, voice = ?, model = ?, llm_source = ?, llm_endpoint = ?, stt_source = ?, stt_endpoint = ?, tts_source = ?, tts_endpoint = ?, correction_source = ?, correction_endpoint = ?, background_ai_source = ?, background_ai_model = ?, updated_at = ? WHERE id = 1',
                [$active, $greeting, $instructions, $bizInfo, $replyMode, $smsEnabled, $whitelist, $cc, $callRoute, $voice, $model, $llmSource, $llmEndpoint, $sttSource, $sttEndpoint, $ttsSource, $ttsEndpoint, $corrSource, $corrEndpoint, $bgSource, $bgModel, V::now()]
            );

            return ['config' => $db->first('SELECT * FROM ak_receptionist_config WHERE id = 1')];
        }, write: true);
    }
}
