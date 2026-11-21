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
    private const TUTOR_ROLES = ['owner', 'manager', 'tutor'];
    private const JOIN_ROLES = ['manager', 'tutor'];
    private const PRESETS = ['academic-royal', 'chalkboard-forest', 'burgundy-conservatory', 'ochre-studio'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['students', 'tutors', 'lessons', 'progress_notes', 'invoices'];
    private const CLEAR_SAMPLE_TABLES = ['invoices', 'progress_notes', 'lessons', 'students', 'tutors'];

    /** Pure-integer Gregorian civil date -> days since 1970-01-01 (Hinnant algorithm, zipp-php.wasm safe). */
    public static function daysFromCivil(int $y, int $m, int $d): int
    {
        $y -= ($m <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        return $era * 146097 + $doe - 719468;
    }

    /** Pure-integer days since 1970-01-01 -> ISO YYYY-MM-DD (Hinnant algorithm, zipp-php.wasm safe). */
    public static function civilFromDays(int $z): string
    {
        $z += 719468;
        $era = intdiv($z >= 0 ? $z : $z - 146096, 146097);
        $doe = $z - $era * 146097;
        $yoe = intdiv($doe - intdiv($doe, 1460) + intdiv($doe, 36524) - intdiv($doe, 146096), 365);
        $y = $yoe + $era * 400;
        $doy = $doe - (365 * $yoe + intdiv($yoe, 4) - intdiv($yoe, 100));
        $mp = intdiv(5 * $doy + 2, 153);
        $d = $doy - intdiv(153 * $mp + 2, 5) + 1;
        $m = $mp + ($mp < 10 ? 3 : -9);
        $y += ($m <= 2) ? 1 : 0;
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    /** Move an ISO YYYY-MM-DD date string by delta days using pure-integer Hinnant math. */
    public static function moveIsoDay(string $isoDay, int $deltaDays = 0): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($isoDay), $m)) {
            return V::utcDay($deltaDays);
        }
        return self::civilFromDays(self::daysFromCivil((int) $m[1], (int) $m[2], (int) $m[3]) + $deltaDays);
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'invoice_seq', 'updated_at'] as $intCol) {
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
        $todayLessons = $db->first(
            "SELECT COUNT(*) AS c FROM lessons WHERE lesson_date = ? AND status != 'Cancelled'",
            [$todayDay]
        );
        $activeStudents = $db->first("SELECT COUNT(*) AS c FROM students WHERE status = 'Active'");
        $followUpNotes = $db->first("SELECT COUNT(*) AS c FROM progress_notes WHERE follow_up = 'Yes'");
        $unpaidInvoices = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS s FROM invoices WHERE status IN ('Unpaid', 'Sent', 'Overdue')"
        );
        $overdueInvoices = $db->first(
            "SELECT COUNT(*) AS c FROM invoices WHERE status = 'Overdue' OR (status IN ('Unpaid', 'Sent') AND due_date != '' AND due_date < ?)",
            [$todayDay]
        );
        return [
            'todayLessons' => $todayLessons ? (int) $todayLessons['c'] : 0,
            'activeStudents' => $activeStudents ? (int) $activeStudents['c'] : 0,
            'followUpNotes' => $followUpNotes ? (int) $followUpNotes['c'] : 0,
            'unpaidInvoicesCount' => $unpaidInvoices ? (int) $unpaidInvoices['c'] : 0,
            'unpaidInvoicesCents' => $unpaidInvoices ? (int) $unpaidInvoices['s'] : 0,
            'overdueInvoices' => $overdueInvoices ? (int) $overdueInvoices['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedTutorSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $tutorSeeds = [
            ['Dr. Miriam Foster', 'miriam@brightwell.example', '0413 440 201', ['Mathematics', 'Science'], ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], 8500, 'Active'],
            ['Sebastian Lind', 'sebastian@brightwell.example', '0413 440 202', ['Piano', 'Violin'], ['Tuesday', 'Wednesday', 'Friday', 'Saturday'], 8000, 'Active'],
            ['Camille Laurent', 'camille@brightwell.example', '0413 440 203', ['English', 'French', 'Spanish'], ['Monday', 'Wednesday', 'Thursday', 'Saturday'], 7500, 'Active'],
            ['Toby Mercer', 'toby@brightwell.example', '0413 440 204', ['Guitar', 'Piano'], ['Thursday', 'Friday', 'Saturday'], 7000, 'Active'],
        ];
        $tIds = [];
        foreach ($tutorSeeds as $t => $tr) {
            $r = $db->execute(
                'INSERT INTO tutors(tutor_name, email, phone, subjects_json, availability_json, hourly_rate_cents, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $tr[0],
                    $tr[1],
                    $tr[2],
                    json_encode($tr[3], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($tr[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $tr[5],
                    $tr[6],
                    $ts - (4 - $t) * 3600,
                ]
            );
            $tIds[] = $r['lastInsertRowid'];
        }

        $studentSeeds = [
            ['Chloe Henderson', 'Sarah Henderson', 'sarah.henderson@example.com', '0402 881 114', 'Mathematics', 'Exam preparation', 'HSC Extension 1 Calculus — targeting Band 6 in November mocks.', 'Active'],
            ['Ethan Park', 'Grace Park', 'grace.park@example.com', '0418 773 902', 'Piano', 'Intermediate', 'AMEB Grade 5 Piano exam repertoire & sight-reading fluency.', 'Active'],
            ['Amara Osei', 'Kwame Osei', 'kwame.osei@example.com', '0424 510 388', 'English', 'Advanced', 'Analytical essay structure and timed comprehension practice.', 'Active'],
            ['Leo Rossi', 'Marco Rossi', 'marco.rossi@example.com', '0439 204 615', 'Guitar', 'Beginner', 'Open chords, strumming tempo and first acoustic recital piece.', 'Active'],
            ['Isla McAllister', 'Fiona McAllister', 'fiona.mcallister@example.com', '0409 612 877', 'French', 'Intermediate', 'Conversational fluency and oral presentation confidence.', 'Waitlist'],
        ];
        $sIds = [];
        foreach ($studentSeeds as $s => $st) {
            $sr = $db->execute(
                'INSERT INTO students(student_name, guardian_name, guardian_email, phone, subject, level, goals, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$st[0], $st[1], $st[2], $st[3], $st[4], $st[5], $st[6], $st[7], $ts - (5 - $s) * 86400]
            );
            $sIds[] = $sr['lastInsertRowid'];
        }

        $l1 = $db->execute(
            "INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, '15:30', 60, 'Mathematics', 'Completed', 'Integration by substitution & timed exam drills', 8500, 1, ?)",
            [$sIds[0], $tIds[0], $todayDay, $ts - 7200]
        )['lastInsertRowid'];

        $l2 = $db->execute(
            "INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, '16:15', 45, 'Piano', 'Completed', 'Chopin Prelude in E Minor phrasing and pedalling', 6000, 1, ?)",
            [$sIds[1], $tIds[1], $todayDay, $ts - 5400]
        )['lastInsertRowid'];

        $db->execute(
            "INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, '17:00', 60, 'English', 'Scheduled', 'Comparative essay thesis workshop', 7500, 1, ?)",
            [$sIds[2], $tIds[2], $todayDay, $ts - 3600]
        );

        $db->execute(
            "INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, '17:45', 30, 'Guitar', 'Scheduled', 'G-C-D chord transition speed with metronome', 3500, 1, ?)",
            [$sIds[3], $tIds[3], $todayDay, $ts - 2400]
        );

        $db->execute(
            "INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, '16:00', 90, 'Mathematics', 'Scheduled', 'Full mock paper walkthrough', 12750, 1, ?)",
            [$sIds[0], $tIds[0], self::moveIsoDay($todayDay, 2), $ts - 1800]
        );

        $db->execute(
            "INSERT INTO progress_notes(student_id, lesson_id, area, score, notes, homework, follow_up, is_sample, created_at) VALUES(?, ?, 'Exam readiness', 5, ?, ?, 'No', 1, ?)",
            [
                $sIds[0],
                $l1,
                'Chloe nailed 4 out of 5 past-paper integration questions under timed conditions with much cleaner working.',
                'Complete Questions 6–12 of the 2024 Past Paper (35 min timer) and flag any tricky trig substitutions.',
                $ts - 3600,
            ]
        );

        $db->execute(
            "INSERT INTO progress_notes(student_id, lesson_id, area, score, notes, homework, follow_up, is_sample, created_at) VALUES(?, ?, 'Technique', 4, ?, ?, 'Yes', 1, ?)",
            [
                $sIds[1],
                $l2,
                'Expressive left-hand voicing in bars 1–16; right-hand rubato tightened up noticeably once we slowed to 72 bpm.',
                '15 min daily: Bars 13–24 hands separate then together at 76 bpm; 2 sight-reading cards from Grade 5 book.',
                $ts - 2000,
            ]
        );

        // Invoices
        $db->execute(
            "INSERT INTO invoices(invoice_number, student_id, billing_period, amount_cents, status, due_date, notes, paid_at, is_sample, created_at) VALUES('INV-1001', ?, 'Term 4 · Weeks 1–4', 34000, 'Paid', ?, '4 x 60 min HSC Maths lessons', ?, 1, ?)",
            [$sIds[0], self::moveIsoDay($todayDay, -5), $ts - 500000, $ts - 900000]
        );
        $db->execute(
            "INSERT INTO invoices(invoice_number, student_id, billing_period, amount_cents, status, due_date, notes, paid_at, is_sample, created_at) VALUES('INV-1002', ?, 'November Piano Block', 24000, 'Unpaid', ?, '4 x 45 min AMEB Grade 5 Piano lessons', 0, 1, ?)",
            [$sIds[1], self::moveIsoDay($todayDay, 7), $ts - 200000]
        );
        $db->execute(
            "INSERT INTO invoices(invoice_number, student_id, billing_period, amount_cents, status, due_date, notes, paid_at, is_sample, created_at) VALUES('INV-1003', ?, 'October English Pack', 30000, 'Overdue', ?, '4 x 60 min Advanced English essays', 0, 1, ?)",
            [$sIds[2], self::moveIsoDay($todayDay, -6), $ts - 1200000]
        );

        $db->execute('UPDATE business_settings SET invoice_seq = 1003 WHERE id = 1 AND invoice_seq < 1003');
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Studio name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Lessons, Progress & Family Billing';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'academic-royal']);
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

            $member = Context::getTeamMember($db, (string) $me['userId']);
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
                self::seedTutorSample($db, $todayDay);
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

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Studio name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This tutoring studio is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'tutor']);
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
            $role = V::oneOf($input['role'] ?? null, self::JOIN_ROLES, 'role', ['fallback' => $target['role']]);
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
                HttpException::fail(403, 'cannot_remove_owner', 'The owner cannot be removed.');
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
            $loaded = self::seedTutorSample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_SAMPLE_TABLES as $t) {
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
