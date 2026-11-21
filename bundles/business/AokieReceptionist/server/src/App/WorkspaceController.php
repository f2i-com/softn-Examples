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
    private const MEMBER_ROLES = ['manager', 'receptionist', 'device_admin', 'viewer'];
    private const PRESETS = ['teal', 'indigo', 'violet', 'amber'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'ak_transcript_turns',
        'ak_sms_messages',
        'ak_sms_threads',
        'ak_appointments',
        'ak_orders',
        'ak_tasks',
        'ak_calls',
        'ak_customers',
        'ak_hardware_events',
    ];

    public static function phoneTail(mixed $phone): string
    {
        $digits = preg_replace('/\D+/', '', (string) ($phone ?? '')) ?? '';
        return strlen($digits) > 9 ? substr($digits, -9) : $digits;
    }

    /** @return array<string, mixed>|null */
    public static function lookupCustomerByPhone(Database $db, mixed $phone): ?array
    {
        $tail = self::phoneTail($phone);
        if (strlen($tail) < 6) {
            return null;
        }
        $rows = $db->query('SELECT * FROM ak_customers ORDER BY id DESC LIMIT 300');
        foreach ($rows as $row) {
            if (self::phoneTail($row['phone'] ?? '') === $tail) {
                return $row;
            }
        }
        return null;
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

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $table) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$table} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function badgeCounts(Database $db): array
    {
        $liveCalls = $db->first("SELECT COUNT(*) AS c FROM ak_calls WHERE status IN ('Ringing', 'Active')");
        $unreadSms = $db->first("SELECT COALESCE(SUM(unread_count), 0) AS s FROM ak_sms_threads WHERE status = 'Active'");
        $pendingDrafts = $db->first("SELECT COUNT(*) AS c FROM ak_sms_messages WHERE status = 'Draft' AND approval_status = 'Pending approval'");
        $openTasks = $db->first("SELECT COUNT(*) AS c FROM ak_tasks WHERE status IN ('Open', 'In progress')");
        $pendingAppts = $db->first("SELECT COUNT(*) AS c FROM ak_appointments WHERE status IN ('Requested', 'Confirmed')");
        $openOrders = $db->first("SELECT COUNT(*) AS c FROM ak_orders WHERE status IN ('New', 'Confirmed', 'Ready')");
        $hwAlerts = $db->first("SELECT COUNT(*) AS c FROM ak_hardware_events WHERE severity IN ('Warning', 'Error') AND acknowledged = 0");

        return [
            'liveCalls' => $liveCalls ? (int) $liveCalls['c'] : 0,
            'unreadSms' => $unreadSms ? (int) $unreadSms['s'] : 0,
            'pendingDrafts' => $pendingDrafts ? (int) $pendingDrafts['c'] : 0,
            'openTasks' => $openTasks ? (int) $openTasks['c'] : 0,
            'pendingAppts' => $pendingAppts ? (int) $pendingAppts['c'] : 0,
            'openOrders' => $openOrders ? (int) $openOrders['c'] : 0,
            'hwAlerts' => $hwAlerts ? (int) $hwAlerts['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    /** @return array<string, mixed> */
    public static function ensureReceptionistConfig(Database $db, ?string $businessName = null): array
    {
        $cur = $db->first('SELECT * FROM ak_receptionist_config WHERE id = 1');
        if ($cur) {
            return $cur;
        }
        $bName = ($businessName !== null && $businessName !== '') ? $businessName : 'Harbourside Dental & Wellness';
        $greeting = 'Good morning, thank you for calling ' . $bName . ', Aokie speaking. How can I help you today?';
        $instructions = "Speak warmly, concisely, and naturally. Always confirm the caller's name, preferred date/time, and best callback number. Never invent pricing — quote only facts in Business Info. If a caller sounds urgent or upset, offer immediate transfer or priority callback task.";
        $businessInfo = "Hours: Mon-Fri 8:00 AM - 6:00 PM, Sat 9:00 AM - 2:00 PM.\nLocation: Level 2, 88 Miller St, North Sydney (2 hrs free basement parking).\nServices: Check-up & Clean (\$195), Emergency Same-Day Slot, Whitening Consult (\$90), Retainer / Whitening Kit Pickup (\$65).\nCancellation Policy: 24 hours notice appreciated.";

        $db->execute(
            "INSERT INTO ak_receptionist_config(id, active, greeting, instructions, business_info, reply_mode, sms_enabled, whitelist_only, default_country_code, call_route, voice, model, llm_source, llm_endpoint, stt_source, stt_endpoint, tts_source, tts_endpoint, correction_source, correction_endpoint, background_ai_source, background_ai_model, updated_at) VALUES(1, 'Yes', ?, ?, ?, 'Built-in AI agent', 'Yes', 'No', '+61', 'oaiy', 'aria-warm', 'qwen2.5-7b-instruct', 'local-oaiy', 'http://127.0.0.1:8080/v1', 'whisper-local', '', 'kokoro-local', '', 'main', '', 'local-oaiy', '', ?)",
            [$greeting, $instructions, $businessInfo, V::now()]
        );
        return $db->first('SELECT * FROM ak_receptionist_config WHERE id = 1') ?? [];
    }

    public static function seedAokieSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        // Callers / Customers CRM
        $c1 = $db->execute(
            'INSERT INTO ak_customers(name, phone, email, preferred_service, status, sms_capable, last_call_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['Sophia Mercer', '+61 414 820 391', 'sophia.mercer@example.com', 'Check-up & Clean', 'VIP', 'Yes', $todayDay, 'Prefers morning appointments with Dr. Patel. Always confirms by SMS.', $ts - 86400 * 14]
        )['lastInsertRowid'];

        $c2 = $db->execute(
            'INSERT INTO ak_customers(name, phone, email, preferred_service, status, sms_capable, last_call_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['Daniel Okafor', '+61 428 551 094', 'daniel.okafor@example.com', 'Whitening Kit Pickup', 'Active', 'Yes', $todayDay, 'Ordered take-home whitening gel kit; needs parking code.', $ts - 86400 * 9]
        )['lastInsertRowid'];

        $c3 = $db->execute(
            'INSERT INTO ak_customers(name, phone, email, preferred_service, status, sms_capable, last_call_at, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['Arthur Pendelton', '+61 2 9411 7820', '', 'Emergency Consult', 'Active', 'No', self::addDays($todayDay, -1), 'Landline only — never send SMS; always create callback task.', $ts - 86400 * 5]
        )['lastInsertRowid'];

        // Calls + Structured Transcript Turns
        $call1 = $db->execute(
            'INSERT INTO ak_calls(call_code, customer_id, caller_name, caller_phone, direction, status, started_at, answered_at, ended_at, duration_seconds, summary, intent, sentiment, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['CALL-1001', $c1, 'Sophia Mercer', '+61 414 820 391', 'Inbound', 'Active', $ts - 140, $ts - 135, 0, 140, 'VIP caller Sophia Mercer requesting a morning Check-up & Clean with Dr. Patel tomorrow at 9:30 AM. Aokie confirmed slot availability and offered SMS confirmation.', 'Booking', 'Positive', 0, $ts - 140]
        )['lastInsertRowid'];

        $turns1 = [
            [1, 'Aokie', 'Good morning! Thank you for calling, Aokie speaking. Hi Sophia — lovely to hear from you again. How can I help today?', 'flow'],
            [2, 'Caller', "Hi Aokie, I'd love to book my 6-month check-up and clean with Dr. Patel. Do you have anything tomorrow morning around 9:30?", 'stt'],
            [3, 'Aokie', "Let me check Dr. Patel's morning schedule. Yes, we have 9:30 AM open tomorrow! Would you like me to pencil you in and text you a confirmation?", 'flow'],
            [4, 'Caller', "Yes please, 9:30 AM is ideal. Also can I pick up a spare retainer case while I'm there?", 'audio_model'],
            [5, 'Aokie', "Absolutely — I've noted the 9:30 AM Check-up & Clean plus a retainer case at the front desk.", 'flow'],
        ];
        foreach ($turns1 as $i => $t) {
            $db->execute(
                'INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, 1, ?)',
                [$call1, $t[0], $t[1], $t[2], $t[3], $ts - 135 + $i * 24]
            );
        }

        $call2 = $db->execute(
            'INSERT INTO ak_calls(call_code, customer_id, caller_name, caller_phone, direction, status, started_at, answered_at, ended_at, duration_seconds, summary, intent, sentiment, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['CALL-1002', $c2, 'Daniel Okafor', '+61 428 551 094', 'Inbound', 'Completed', $ts - 2400, $ts - 2395, $ts - 2260, 135, 'Daniel Okafor ordered a take-home whitening gel refill pack ($65) for pickup today before 5:00 PM and asked for basement parking directions.', 'Order', 'Positive', 1, $ts - 2400]
        )['lastInsertRowid'];

        $turns2 = [
            [1, 'Aokie', 'Hello, Aokie speaking. How may I help you today?', 'flow'],
            [2, 'Caller', "Hey, it's Daniel Okafor. Can I put in an order for the take-home whitening gel refill kit and swing by at 4:30?", 'stt'],
            [3, 'Aokie', "Of course Daniel — that's \$65 for the refill pack, ready at reception by 4:30 PM. We also have 2 hours free basement parking off Miller Street.", 'flow'],
        ];
        foreach ($turns2 as $j => $t) {
            $db->execute(
                'INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, 1, ?)',
                [$call2, $t[0], $t[1], $t[2], $t[3], $ts - 2395 + $j * 30]
            );
        }

        $call3 = $db->execute(
            'INSERT INTO ak_calls(call_code, customer_id, caller_name, caller_phone, direction, status, started_at, answered_at, ended_at, duration_seconds, summary, intent, sentiment, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['CALL-1003', $c3, 'Arthur Pendelton', '+61 2 9411 7820', 'Inbound', 'Voicemail', $ts - 5400, 0, $ts - 5355, 45, 'Voicemail left on landline: chipped molar, requesting urgent callback for same-day emergency slot. Customer is SMS-incapable (landline).', 'Message', 'Negative', 1, $ts - 5400]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO ak_transcript_turns(call_id, turn_index, speaker, text, source, overlapped, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 0, 1, ?)',
            [$call3, 1, 'Caller', "Hello, this is Arthur Pendelton on 9411 7820. I chipped a back tooth at breakfast and would appreciate a call back to see if there's an emergency slot today.", 'stt', $ts - 5380]
        );

        // Two-Pane SMS Threads & Messages (including unread inbound + AI Draft Reply pending approval)
        $t1 = $db->execute(
            "INSERT INTO ak_sms_threads(customer_id, phone, display_name, last_message_at, last_preview, unread_count, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 'Active', 1, ?)",
            [$c1, '+61 414 820 391', 'Sophia Mercer', $ts - 300, "Thanks! Can I shift tomorrow's 9:30 to 10:00 AM if free?", 1, $ts - 3600]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO ak_sms_messages(thread_id, phone, direction, body, status, is_ai_reply, approval_status, delivery_note, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$t1, '+61 414 820 391', 'Outbound', "Hi Sophia, you're booked with Dr. Patel tomorrow at 9:30 AM for a Check-up & Clean. Reply YES to confirm.", 'Sent', 1, 'Approved', 'Delivered via Aokie BT', $ts - 900]
        );
        $db->execute(
            'INSERT INTO ak_sms_messages(thread_id, phone, direction, body, status, is_ai_reply, approval_status, delivery_note, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$t1, '+61 414 820 391', 'Inbound', "Thanks! Can I shift tomorrow's 9:30 to 10:00 AM if free?", 'Received', 0, 'Not required', '', $ts - 300]
        );
        $db->execute(
            'INSERT INTO ak_sms_messages(thread_id, phone, direction, body, status, is_ai_reply, approval_status, delivery_note, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$t1, '+61 414 820 391', 'Outbound', "Hi Sophia, we can move your Check-up & Clean with Dr. Patel to 10:00 AM tomorrow! We'll also have a retainer case ready for you at reception.", 'Draft', 1, 'Pending approval', 'AI Draft waiting operator sign-off', $ts - 280]
        );

        $t2 = $db->execute(
            "INSERT INTO ak_sms_threads(customer_id, phone, display_name, last_message_at, last_preview, unread_count, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 'Active', 1, ?)",
            [$c2, '+61 428 551 094', 'Daniel Okafor', $ts - 1800, 'Your whitening refill kit ($65) is packed and ready at reception.', 0, $ts - 2200]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO ak_sms_messages(thread_id, phone, direction, body, status, is_ai_reply, approval_status, delivery_note, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$t2, '+61 428 551 094', 'Outbound', 'Hi Daniel, your whitening refill kit ($65) is packed and ready at reception until 6:00 PM. Basement parking entrance is on Miller St.', 'Sent', 1, 'Approved', 'Delivered', $ts - 1800]
        );

        // Appointments & Orders
        $db->execute(
            'INSERT INTO ak_appointments(customer_id, call_id, caller_name, phone, service, appt_date, appt_time, status, source, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$c1, $call1, 'Sophia Mercer', '+61 414 820 391', 'Check-up & Clean (Dr. Patel)', self::addDays($todayDay, 1), '09:30', 'Confirmed', 'Call', 'Requested move to 10:00 AM via SMS; add retainer case.', $ts - 120]
        );
        $db->execute(
            'INSERT INTO ak_appointments(customer_id, call_id, caller_name, phone, service, appt_date, appt_time, status, source, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$c3, $call3, 'Arthur Pendelton', '+61 2 9411 7820', 'Emergency Chipped Molar Consult', $todayDay, '14:15', 'Requested', 'Call', 'Provisional hold pending landline callback confirmation.', $ts - 5200]
        );

        $db->execute(
            'INSERT INTO ak_orders(customer_id, call_id, customer_name, phone, status, source, total_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$c2, $call2, 'Daniel Okafor', '+61 428 551 094', 'Ready', 'Call', 6500, '1x Take-Home Whitening Gel Refill Pack — pickup 4:30 PM.', $ts - 2200]
        );

        // Follow-Up Tasks
        $db->execute(
            'INSERT INTO ak_tasks(customer_id, call_id, phone, summary, due_at, status, assignee, priority, sms_state, callback_state, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$c3, $call3, '+61 2 9411 7820', 'Ring Arthur Pendelton on landline to confirm 2:15 PM emergency slot', $todayDay, 'Open', 'Front Desk', 'Urgent', 'None', 'Please ring them', 'Landline number — cannot receive SMS confirmation.', $ts - 5100]
        );
        $db->execute(
            'INSERT INTO ak_tasks(customer_id, call_id, phone, summary, due_at, status, assignee, priority, sms_state, callback_state, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$c1, $call1, '+61 414 820 391', "Approve AI SMS reply confirming Sophia Mercer's 10:00 AM shift", $todayDay, 'Open', 'Receptionist', 'High', 'Texting — awaiting reply', 'None', 'AI draft queued in SMS Inbox.', $ts - 260]
        );

        // Hardware & Bridge Events Log
        $db->execute(
            'INSERT INTO ak_hardware_events(event_name, severity, message, dongle_id, occurred_at, payload_json, acknowledged, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['aokie.bridge.connected', 'Info', 'Bluetooth HFP/MAP bridge paired with Front Desk Pixel 9 (RSSI -54 dBm). Audio latency 32ms.', 'AOKIE-BT-01', $ts - 7200, json_encode(['rssi' => -54, 'codec' => 'mSBC', 'batteryPct' => 92]), 1, $ts - 7200]
        );
        $db->execute(
            'INSERT INTO ak_hardware_events(event_name, severity, message, dongle_id, occurred_at, payload_json, acknowledged, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            ['aokie.hardware.audio_jitter', 'Warning', 'Brief Bluetooth SCO packet drop (140ms) during CALL-1002; auto-recovered via local audio correction.', 'AOKIE-BT-01', $ts - 2300, json_encode(['droppedFrames' => 7, 'recovered' => true]), 0, $ts - 2300]
        );

        $db->execute('UPDATE business_settings SET call_seq = 1003 WHERE id = 1 AND call_seq < 1003');
        return self::sampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                return [
                    'setupDone' => false,
                    'isOwner' => $me['isOwner'],
                    'access' => $me['isOwner'] ? 'setup' : 'not_ready',
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => $me['isOwner'],
                        'role' => $me['isOwner'] ? 'owner' : '',
                    ],
                    'settings' => $settings,
                    'counts' => null,
                ];
            }

            $member = Context::getTeamMember($db, $me['userId']);
            if ($me['isOwner'] && !$member) {
                $member = [
                    'user_id' => $me['userId'],
                    'display_name' => $settings['owner_name'] ?: 'Front-Desk Owner',
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
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => false,
                        'role' => '',
                    ],
                    'settings' => [
                        'business_name' => $settings['business_name'],
                        'brand_preset' => $settings['brand_preset'],
                    ],
                    'counts' => null,
                ];
            }

            if (($member['status'] ?? '') !== 'active') {
                return [
                    'setupDone' => true,
                    'isOwner' => false,
                    'access' => 'pending',
                    'businessName' => $settings['business_name'],
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => false,
                        'role' => $member['role'],
                        'displayName' => $member['display_name'],
                    ],
                    'settings' => [
                        'business_name' => $settings['business_name'],
                        'brand_preset' => $settings['brand_preset'],
                    ],
                    'counts' => null,
                ];
            }

            self::ensureReceptionistConfig($db, (string) ($settings['business_name'] ?? ''));

            return [
                'setupDone' => true,
                'isOwner' => $me['isOwner'],
                'access' => 'granted',
                'me' => [
                    'userId' => $me['userId'],
                    'isOwner' => $me['isOwner'],
                    'role' => $member['role'],
                    'displayName' => $member['display_name'],
                ],
                'settings' => $settings,
                'counts' => self::badgeCounts($db),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'AI Phone & Front-Desk Console';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'teal']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]) ?: '+61 2 9000 4120';
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, phone = ?, currency = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $phone, $currency, $timezone, $preset, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, phone, currency, timezone, brand_preset, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $phone, $currency, $timezone, $preset, $ts]
                );
            }

            $member = Context::getTeamMember($db, $me['userId']);
            if (!$member) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, 'owner', 1, 'active', ?)",
                    [$me['userId'], $ownerName, $ts]
                );
            } else {
                $db->execute(
                    "UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?",
                    [$ownerName, $me['userId']]
                );
            }

            self::ensureReceptionistConfig($db, $businessName);
            if (V::bool($input['load_sample'] ?? false)) {
                self::seedAokieSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => Context::getBusinessSettings($db),
                    'counts' => self::badgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = Context::getBusinessSettings($db);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120]);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, V::now()]
            );

            return ['settings' => Context::getBusinessSettings($db)];
        }, write: true);
    }

    public function listTeam(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            return [
                'team' => $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC'),
            ];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'Aokie Receptionist is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::MEMBER_ROLES, 'requested_role', ['fallback' => 'receptionist']);
            $existing = Context::getTeamMember($db, $me['userId']);
            if ($existing) {
                return ['member' => $existing];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['member' => Context::getTeamMember($db, $me['userId'])],
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
            $role = V::oneOf($input['role'] ?? null, self::MEMBER_ROLES, 'role', ['fallback' => $target['role']]);
            $status = V::oneOf($input['status'] ?? null, ['active', 'pending'], 'status', ['fallback' => $target['status']]);
            $db->execute('UPDATE team_members SET role = ?, status = ? WHERE user_id = ?', [$role, $status, $targetId]);
            return ['member' => Context::getTeamMember($db, $targetId)];
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
                'sampleCount' => self::seedAokieSample($db, $todayDay),
                'counts' => self::badgeCounts($db),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::SAMPLE_TABLES as $table) {
                $db->execute("DELETE FROM {$table} WHERE is_sample = 1");
            }
            return [
                'sampleCount' => 0,
                'counts' => self::badgeCounts($db),
            ];
        }, write: true);
    }
}
