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
    private const CLINIC_ROLES = ['owner', 'admin', 'front_desk', 'provider'];
    private const JOIN_ROLES = ['admin', 'front_desk', 'provider'];
    private const CLINIC_PRESETS = ['clinical-teal', 'harbour-blue', 'calm-sage', 'deep-plum'];
    private const CLINIC_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['patients', 'providers', 'appointments', 'intake_forms', 'follow_ups'];

    public static function shiftIsoDay(string $isoDay, int $deltaDays): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $isoDay, $m)) {
            return V::utcDay($deltaDays);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $y -= ($mo <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($mo + ($mo > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $deltaDays;
        return gmdate('Y-m-d', $z * 86400);
    }

    public static function clinicSampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function clinicBadgeCounts(Database $db, string $todayDay): array
    {
        $waiting = $db->first(
            "SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status IN ('Booked', 'Checked In', 'In Room')",
            [$todayDay]
        );
        $checkedIn = $db->first(
            "SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status = 'Checked In'",
            [$todayDay]
        );
        $inRoom = $db->first(
            "SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status = 'In Room'",
            [$todayDay]
        );
        $completedToday = $db->first(
            "SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status = 'Completed'",
            [$todayDay]
        );
        $dueFollowUps = $db->first(
            "SELECT COUNT(*) AS c FROM follow_ups WHERE status = 'Pending' AND followup_date <= ?",
            [$todayDay]
        );
        $pendingFollowUps = $db->first(
            "SELECT COUNT(*) AS c FROM follow_ups WHERE status = 'Pending'"
        );
        $totalPatients = $db->first('SELECT COUNT(*) AS c FROM patients');
        $activeProviders = $db->first('SELECT COUNT(*) AS c FROM providers WHERE active = 1');

        return [
            'todayActive' => $waiting ? (int) $waiting['c'] : 0,
            'checkedIn' => $checkedIn ? (int) $checkedIn['c'] : 0,
            'inRoom' => $inRoom ? (int) $inRoom['c'] : 0,
            'completedToday' => $completedToday ? (int) $completedToday['c'] : 0,
            'dueFollowUps' => $dueFollowUps ? (int) $dueFollowUps['c'] : 0,
            'pendingFollowUps' => $pendingFollowUps ? (int) $pendingFollowUps['c'] : 0,
            'totalPatients' => $totalPatients ? (int) $totalPatients['c'] : 0,
            'activeProviders' => $activeProviders ? (int) $activeProviders['c'] : 0,
            'sampleCount' => self::clinicSampleCount($db),
        ];
    }

    public static function seedClinicSample(Database $db, string $todayDay): int
    {
        if (self::clinicSampleCount($db) > 0) {
            return self::clinicSampleCount($db);
        }

        $ts = V::now();

        $providerSeeds = [
            ['Dr. Clara Bennett', 'General Practitioner', 'clara.bennett@harbourclinic.example', '02 9001 4110', 'Room 1', 1],
            ["Liam O'Connor", 'Physiotherapist', 'liam.oconnor@harbourclinic.example', '02 9001 4112', 'Physio Suite A', 1],
            ['Dr. Priya Sharma', 'Dentist', 'priya.sharma@harbourclinic.example', '02 9001 4114', 'Dental 2', 1],
            ['Hannah Wu', 'Nurse', 'hannah.wu@harbourclinic.example', '02 9001 4116', 'Treatment Bay', 1],
            ['Marcus Grant', 'Allied Health', 'marcus.grant@harbourclinic.example', '02 9001 4118', 'Room 4', 0],
        ];
        $provIds = [];
        foreach ($providerSeeds as $p => $pr) {
            $prRes = $db->execute(
                'INSERT INTO providers(full_name, role, email, phone, room, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$pr[0], $pr[1], $pr[2], $pr[3], $pr[4], $pr[5], $ts - (5 - $p) * 3600]
            );
            $provIds[] = $prRes['lastInsertRowid'];
        }

        $patientSeeds = [
            ['Evelyn Brooks', '1986-04-14', '0412 334 891', 'evelyn.brooks@example.com', '18 Coral St, Neutral Bay NSW 2089', 'David Brooks', '0412 334 890', 'Prefers morning slots; SMS reminders'],
            ['Noah Takahashi', '1993-09-22', '0421 887 204', 'noah.takahashi@example.com', '72 Military Rd, Cremorne NSW 2090', 'Keiko Takahashi', '0418 552 109', 'Recovering from right ankle sprain'],
            ['Sofia Alvarez', '1974-11-03', '0408 912 640', 'sofia.alvarez@example.com', '4/90 Pacific Hwy, North Sydney NSW 2060', 'Mateo Alvarez', '0408 912 641', 'Annual review patient'],
            ['Arthur Pendelton', '1958-02-19', '0433 109 472', 'arthur.p@example.com', '31 Berry St, Kirribilli NSW 2061', 'Margaret Pendelton', '0433 109 473', 'Requires ground-floor room'],
            ['Zara Al-Mansoor', '2001-07-30', '0450 618 332', 'zara.almansoor@example.com', '112 Walker St, North Sydney NSW 2060', 'Tariq Al-Mansoor', '0450 618 330', 'New patient registered online'],
            ['Callum Reid', '1989-12-08', '0417 290 515', 'callum.reid@example.com', '9 Ben Boyd Rd, Neutral Bay NSW 2089', 'Claire Reid', '0417 290 516', 'Dental check-up & scale'],
        ];
        $patIds = [];
        foreach ($patientSeeds as $i => $pt) {
            $ptRes = $db->execute(
                'INSERT INTO patients(full_name, date_of_birth, phone, email, address, emergency_contact_name, emergency_contact_phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$pt[0], $pt[1], $pt[2], $pt[3], $pt[4], $pt[5], $pt[6], $pt[7], $ts - (6 - $i) * 86400]
            );
            $patIds[] = $ptRes['lastInsertRowid'];
        }

        $pastDay = self::shiftIsoDay($todayDay, -10);
        $tomorrowDay = self::shiftIsoDay($todayDay, 1);

        $aPast = $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '09:30', 'Consultation', 'Completed', 'Room 1', 'Routine check and blood test request', ?, 1, ?)",
            [$patIds[2], $provIds[0], $pastDay, $ts - 864000, $ts - 900000]
        )['lastInsertRowid'];

        $a1 = $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '08:45', 'Consultation', 'Completed', 'Room 1', 'BP check and script renewal', ?, 1, ?)",
            [$patIds[3], $provIds[0], $todayDay, $ts - 3600, $ts - 7200]
        )['lastInsertRowid'];

        $a2 = $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '09:15', 'Follow-up', 'In Room', 'Physio Suite A', 'Week 3 ankle mobility reassessment', ?, 1, ?)",
            [$patIds[1], $provIds[1], $todayDay, $ts - 1200, $ts - 7000]
        )['lastInsertRowid'];

        $a3 = $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '09:45', 'New Patient', 'Checked In', 'Room 1', 'First visit — welcome pack handed over', ?, 1, ?)",
            [$patIds[4], $provIds[0], $todayDay, $ts - 480, $ts - 6800]
        )['lastInsertRowid'];

        $a4 = $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '10:30', 'Procedure', 'Booked', 'Dental 2', '6-month clean and fluoride check', 0, 1, ?)",
            [$patIds[5], $provIds[2], $todayDay, $ts - 6500]
        )['lastInsertRowid'];

        $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '11:15', 'Telehealth', 'Booked', 'Treatment Bay', 'Post-vaccination nurse check-in call', 0, 1, ?)",
            [$patIds[0], $provIds[3], $todayDay, $ts - 6200]
        );

        $db->execute(
            "INSERT INTO appointments(patient_id, provider_id, appt_date, appt_time, appt_type, status, room, notes, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, '10:00', 'Follow-up', 'Booked', 'Room 1', 'Review pathology results', 0, 1, ?)",
            [$patIds[2], $provIds[0], $tomorrowDay, $ts - 5000]
        );

        $fullConsent = json_encode([
            'I consent to be seen and treated by the clinic',
            'I acknowledge the clinic privacy and administrative policy',
            'I consent to appointment reminders via my preferred contact method',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $db->execute(
            'INSERT INTO intake_forms(patient_id, appointment_id, reason_for_visit, symptoms, current_medications, preferred_contact, consent_json, signed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$patIds[3], $a1, 'Quarterly blood pressure review and prescription renewal', 'Mild morning dizziness when standing quickly', 'Perindopril 5mg daily, Vitamin D3 1000IU', 'Phone Call', $fullConsent, 'Arthur Pendelton', $ts - 4000]
        );
        $db->execute(
            'INSERT INTO intake_forms(patient_id, appointment_id, reason_for_visit, symptoms, current_medications, preferred_contact, consent_json, signed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$patIds[1], $a2, 'Right ankle physiotherapy reassessment after running injury', 'Tightness along outer ankle after 20 min walk; swelling resolved', 'None currently', 'Text Message', $fullConsent, 'Noah Takahashi', $ts - 1800]
        );
        $db->execute(
            'INSERT INTO intake_forms(patient_id, appointment_id, reason_for_visit, symptoms, current_medications, preferred_contact, consent_json, signed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$patIds[5], $a4, 'Six-month dental check-up and scale', 'Occasional cold sensitivity on upper left molar', 'None', 'Email', $fullConsent, 'Callum Reid', $ts - 10800]
        );

        // Follow-ups: 1 overdue, 1 due today, 1 upcoming
        $db->execute(
            "INSERT INTO follow_ups(appointment_id, patient_id, provider_id, followup_date, action, status, booked_appointment_id, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Pending', NULL, 1, ?)",
            [$aPast, $patIds[2], $provIds[0], self::shiftIsoDay($todayDay, -2), 'Call Sofia to confirm pathology review appointment and fasting instructions', $ts - 400000]
        );
        $db->execute(
            "INSERT INTO follow_ups(appointment_id, patient_id, provider_id, followup_date, action, status, booked_appointment_id, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Pending', NULL, 1, ?)",
            [$a1, $patIds[3], $provIds[0], $todayDay, 'Book 4-week blood pressure follow-up with Dr. Clara Bennett', $ts - 1800]
        );
        $db->execute(
            "INSERT INTO follow_ups(appointment_id, patient_id, provider_id, followup_date, action, status, booked_appointment_id, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Pending', NULL, 1, ?)",
            [$a2, $patIds[1], $provIds[1], self::shiftIsoDay($todayDay, 7), "Schedule Stage 2 return-to-run physio session with Liam O'Connor", $ts - 900]
        );

        if ($a3 < 0) {
            return 0;
        }
        return self::clinicSampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

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
                    'display_name' => $settings['owner_name'] ?: 'Owner',
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
                'counts' => self::clinicBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Clinic name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Patient Reception & Intake Desk';
            $currency = V::oneOf($input['currency'] ?? null, self::CLINIC_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::CLINIC_PRESETS, 'brand_preset', ['fallback' => 'clinical-teal']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $ts]
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

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedClinicSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => Context::getBusinessSettings($db),
                    'counts' => self::clinicBadgeCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = Context::getBusinessSettings($db);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Clinic name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::CLINIC_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::CLINIC_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
            $members = $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC');
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This clinic workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'front_desk']);
            $existing = Context::getTeamMember($db, $me['userId']);
            if ($existing) {
                return ['member' => $existing];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return ['__status' => 201, '__body' => ['member' => Context::getTeamMember($db, $me['userId'])]];
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
            $role = V::oneOf($input['role'] ?? null, self::JOIN_ROLES, 'role', ['fallback' => $target['role']]);
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
                HttpException::fail(403, 'cannot_remove_owner', 'The clinic owner cannot be removed.');
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
            $loaded = self::seedClinicSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::clinicBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['follow_ups', 'intake_forms', 'appointments', 'patients', 'providers'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::clinicBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
