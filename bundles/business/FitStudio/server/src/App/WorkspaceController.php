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
    private const STUDIO_ROLES = ['owner', 'manager', 'coach', 'front_desk'];
    private const JOIN_ROLES = ['manager', 'coach', 'front_desk'];
    private const STUDIO_PRESETS = ['studio-emerald', 'graphite-flame', 'cobalt-iron', 'amber-kettlebell'];
    private const STUDIO_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['clients', 'trainers', 'sessions', 'assessments', 'programs', 'payments'];

    public static function addIsoDays(string $isoDay, int $deltaDays): string
    {
        $base = $isoDay !== '' ? $isoDay : V::utcDay(0);
        $parts = explode('-', $base);
        $y = (int) ($parts[0] ?? 1970);
        $m = (int) ($parts[1] ?? 1);
        $d = (int) ($parts[2] ?? 1);

        // Civil date -> days since 1970-01-01 (Howard Hinnant algorithm)
        $yr = $y - ($m <= 2 ? 1 : 0);
        $era = (int) floor(($yr >= 0 ? $yr : $yr - 399) / 400);
        $yoe = $yr - $era * 400;
        $doy = (int) floor((153 * ($m + ($m > 2 ? -3 : 9)) + 2) / 5) + $d - 1;
        $doe = $yoe * 365 + (int) floor($yoe / 4) - (int) floor($yoe / 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $deltaDays;

        // Days since 1970-01-01 -> civil date
        $z += 719468;
        $era2 = (int) floor(($z >= 0 ? $z : $z - 146096) / 146097);
        $doe2 = $z - $era2 * 146097;
        $yoe2 = (int) floor(($doe2 - (int) floor($doe2 / 1460) + (int) floor($doe2 / 36524) - (int) floor($doe2 / 146096)) / 365);
        $y2 = $yoe2 + $era2 * 400;
        $doy2 = $doe2 - (365 * $yoe2 + (int) floor($yoe2 / 4) - (int) floor($yoe2 / 100));
        $mp = (int) floor((5 * $doy2 + 2) / 153);
        $d2 = $doy2 - (int) floor((153 * $mp + 2) / 5) + 1;
        $m2 = $mp + ($mp < 10 ? 3 : -9);
        if ($m2 <= 2) {
            $y2++;
        }

        return str_pad((string) $y2, 4, '0', STR_PAD_LEFT)
            . '-' . str_pad((string) $m2, 2, '0', STR_PAD_LEFT)
            . '-' . str_pad((string) $d2, 2, '0', STR_PAD_LEFT);
    }

    public static function studioSampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    public static function studioBadgeCounts(Database $db, string $todayDay): array
    {
        $dayStr = $todayDay !== '' ? $todayDay : V::utcDay(0);
        $monthPrefix = substr($dayStr, 0, 7);
        $todaySessions = $db->first(
            "SELECT COUNT(*) AS c FROM sessions WHERE session_date = ? AND status IN ('Scheduled', 'Checked In')",
            [$dayStr]
        );
        $activeClients = $db->first("SELECT COUNT(*) AS c FROM clients WHERE status IN ('Active', 'Trial')");
        $activePrograms = $db->first("SELECT COUNT(*) AS c FROM programs WHERE status = 'Active'");
        $pendingPayments = $db->first("SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE status = 'Pending'");
        $monthPaid = $db->first(
            "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE status = 'Paid' AND payment_date >= ? AND payment_date <= ?",
            [$monthPrefix . '-01', $monthPrefix . '-31']
        );

        return [
            'todaySessions' => $todaySessions ? (int) $todaySessions['c'] : 0,
            'activeClients' => $activeClients ? (int) $activeClients['c'] : 0,
            'activePrograms' => $activePrograms ? (int) $activePrograms['c'] : 0,
            'pendingPaymentsCount' => $pendingPayments ? (int) $pendingPayments['c'] : 0,
            'pendingPaymentsCents' => $pendingPayments ? (int) $pendingPayments['s'] : 0,
            'monthPaidCents' => $monthPaid ? (int) $monthPaid['s'] : 0,
            'sampleCount' => self::studioSampleCount($db),
        ];
    }

    public static function seedStudioSample(Database $db, string $todayDay): int
    {
        if (self::studioSampleCount($db) > 0) {
            return self::studioSampleCount($db);
        }

        $ts = V::now();
        $trainerSeeds = [
            ['Kieran Blake', 'Personal trainer', ['Strength', 'HIIT', 'Boxing'], '0411 720 310', 'kieran@ironleaf.example', 'Active'],
            ['Tessa Lindholm', 'Physio', ['Rehab', 'Pilates', 'Strength'], '0411 720 312', 'tessa@ironleaf.example', 'Active'],
            ['Devon Patel', 'Group instructor', ['HIIT', 'Boxing', 'Nutrition'], '0411 720 314', 'devon@ironleaf.example', 'Active'],
            ['Maya Okafor', 'Nutrition coach', ['Nutrition', 'Yoga'], '0411 720 316', 'maya@ironleaf.example', 'Active'],
        ];
        $tIds = [];
        foreach ($trainerSeeds as $t => $tr) {
            $r = $db->execute(
                'INSERT INTO trainers(name, role, specialties_json, phone, email, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$tr[0], $tr[1], json_encode($tr[2], JSON_UNESCAPED_UNICODE), $tr[3], $tr[4], $tr[5], $ts - (4 - $t) * 3600]
            );
            $tIds[] = $r['lastInsertRowid'];
        }

        $clientSeeds = [
            ['Lucas Harper', 'lucas.harper@example.com', '0422 501 119', 'Fat loss', 'Mild lower-back stiffness after long flights; avoid heavy conventional deadlifts when flared.', 'Rachel Harper · 0422 501 120', 'Active'],
            ['Aisha Darwish', 'aisha.darwish@example.com', '0431 992 405', 'Strength', '', 'Samir Darwish · 0431 992 406', 'Active'],
            ['Benji Morales', 'benji.morales@example.com', '0419 884 217', 'Rehab', 'Right ACL reconstruction 5 months ago — cleared for controlled squats, no plyometric cutting yet.', 'Elena Morales · 0419 884 218', 'Active'],
            ['Sienna Cho', 'sienna.cho@example.com', '0407 345 901', 'Endurance', 'Exercise-induced asthma; carries inhaler in gym bag.', 'Daniel Cho · 0407 345 902', 'Trial'],
            ['Owen Gallagher', 'owen.g@example.com', '0415 628 773', 'Muscle gain', '', 'Maeve Gallagher · 0415 628 774', 'Active'],
        ];
        $cIds = [];
        foreach ($clientSeeds as $c => $cl) {
            $cr = $db->execute(
                'INSERT INTO clients(name, email, phone, goal, medical_notes, emergency_contact, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$cl[0], $cl[1], $cl[2], $cl[3], $cl[4], $cl[5], $cl[6], $ts - (5 - $c) * 86400]
            );
            $cIds[] = $cr['lastInsertRowid'];
        }

        // Sessions: today & upcoming
        $sessionSeeds = [
            [$cIds[0], $tIds[0], $todayDay, '06:30', '1-on-1', 'Completed', 9500, 'Metabolic circuit + trap-bar hinge'],
            [$cIds[1], $tIds[0], $todayDay, '08:00', '1-on-1', 'Checked In', 9500, 'Upper push/pull strength progression'],
            [$cIds[2], $tIds[1], $todayDay, '09:30', 'Rehab', 'Scheduled', 11000, 'Single-leg balance & tempo split squats'],
            [$cIds[3], $tIds[2], $todayDay, '11:00', 'Assessment', 'Scheduled', 7500, 'Trial onboarding movement screen & body-comp baseline'],
            [$cIds[4], $tIds[2], $todayDay, '17:30', 'Small Group', 'Scheduled', 4500, 'Evening hypertrophy pod (4 athletes)'],
            [$cIds[0], $tIds[3], self::addIsoDays($todayDay, 1), '07:30', 'Nutrition', 'Scheduled', 8500, '4-week macro & protein timing review'],
            [$cIds[1], $tIds[0], self::addIsoDays($todayDay, 2), '07:00', '1-on-1', 'Scheduled', 9500, 'Barbell back squat top set @ RPE 8'],
        ];
        foreach ($sessionSeeds as $s => $ss) {
            $db->execute(
                'INSERT INTO sessions(client_id, trainer_id, session_date, session_time, session_type, status, fee_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$ss[0], $ss[1], $ss[2], $ss[3], $ss[4], $ss[5], $ss[6], $ss[7], $ts - (7 - $s) * 1800]
            );
        }

        // Assessments with 2+ check-ins per active client so Body-Comp Progress Delta lights up immediately
        $assessSeeds = [
            [$cIds[0], self::addIsoDays($todayDay, -42), 92.4, 24.8, 3, 'Trap-bar deadlift 80kg x 8; push-ups 12 reps', 'Baseline intake; focus on hip hinge mechanics and daily step target.'],
            [$cIds[0], self::addIsoDays($todayDay, -14), 89.8, 22.9, 4, 'Trap-bar deadlift 100kg x 8; push-ups 18 reps', 'Down 2.6 kg and nearly 2% body fat with zero back flare-ups.'],
            [$cIds[0], self::addIsoDays($todayDay, -1), 88.2, 21.4, 4, 'Trap-bar deadlift 110kg x 6; sled push 80kg x 4', 'Consistent energy and great thoracic mobility improvement.'],
            [$cIds[1], self::addIsoDays($todayDay, -30), 64.0, 22.0, 4, 'Back squat 62.5kg x 5; strict pull-ups 2', 'Strong bracing; ready for progressive overload block.'],
            [$cIds[1], self::addIsoDays($todayDay, -3), 64.5, 20.8, 5, 'Back squat 72.5kg x 5; strict pull-ups 5', 'Added lean muscle while dropping 1.2% body fat!'],
            [$cIds[2], self::addIsoDays($todayDay, -28), 78.5, 18.2, 2, 'Bodyweight box squat; right quad 75% symmetry', 'Mild knee stiffness at full flexion.'],
            [$cIds[2], self::addIsoDays($todayDay, -4), 78.1, 17.8, 4, 'Goblet split squat 16kg x 10; right quad 88% symmetry', 'Huge gain in knee control and painless full squat depth.'],
        ];
        foreach ($assessSeeds as $a => $as) {
            $db->execute(
                'INSERT INTO assessments(client_id, assessment_date, weight_kg, body_fat_pct, mobility_score, strength_notes, coach_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$as[0], $as[1], $as[2], $as[3], $as[4], $as[5], $as[6], $ts - (7 - $a) * 3600]
            );
        }

        // Programs with structured workout blocks
        $prog1Blocks = [
            ['day' => 'Day 1 — Lower Hinge & Core', 'exercises' => "Trap-Bar Deadlift 4x6 @ RPE 7.5\nBulgarian Split Squat 3x10/leg\nDeadbug Hold 3x40s\nSled Push Finisher 6x20m"],
            ['day' => 'Day 2 — Upper Push / Pull', 'exercises' => "Incline DB Press 4x8\nChest-Supported Row 4x10\nHalf-Kneeling Landmine Press 3x10\nAssault Bike Intervals 8x30s"],
            ['day' => 'Day 3 — Conditioning & Mobility', 'exercises' => "90/90 Hip Flow 10 min\nKettlebell Swings 5x15\nRowing Erg 4x500m @ Zone 3"],
        ];
        $prog2Blocks = [
            ['day' => 'Day 1 — Squat & Pull Focus', 'exercises' => "Barbell Back Squat 5x5 @ 72.5kg\nWeighted Pull-Up 4x4\nRomanian Deadlift 3x8\nHanging Leg Raises 3x12"],
            ['day' => 'Day 2 — Bench & Posterior Chain', 'exercises' => "Barbell Bench Press 4x6\nSingle-Arm DB Row 4x8\nHip Thrust 3x10\nFace Pulls 3x15"],
        ];
        $prog3Blocks = [
            ['day' => 'Rehab Session A — Knee Stability', 'exercises' => "Isometric Wall Sit 4x45s\nTempo Goblet Split Squat (3-1-1) 3x8/leg\nHamstring Bridge Walkouts 3x10\nSingle-Leg Balance Reach 3x8/side"],
            ['day' => 'Rehab Session B — Strength Rebuild', 'exercises' => "Leg Press (Bilateral to Single-Leg) 4x10\nStep-Down Control 3x12/leg\nCalf Raise Progression 4x15\nStationary Bike 15 min @ Low Resistance"],
        ];

        $db->execute(
            "INSERT INTO programs(client_id, program_name, goal, start_date, end_date, status, blocks_json, program_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Active', ?, ?, 1, ?)",
            [$cIds[0], '12-Week Lean Engine Block', 'Fat loss', self::addIsoDays($todayDay, -42), self::addIsoDays($todayDay, 42), json_encode($prog1Blocks, JSON_UNESCAPED_UNICODE), 'Keep 2 reps in reserve on hinge work; 9,500 daily step floor.', $ts - 360000]
        );
        $db->execute(
            "INSERT INTO programs(client_id, program_name, goal, start_date, end_date, status, blocks_json, program_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Active', ?, ?, 1, ?)",
            [$cIds[1], 'Barbell Strength Base Phase 2', 'Strength', self::addIsoDays($todayDay, -21), self::addIsoDays($todayDay, 35), json_encode($prog2Blocks, JSON_UNESCAPED_UNICODE), 'Add 2.5 kg to squat & bench every 2 weeks while bar speed stays crisp.', $ts - 240000]
        );
        $db->execute(
            "INSERT INTO programs(client_id, program_name, goal, start_date, end_date, status, blocks_json, program_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Active', ?, ?, 1, ?)",
            [$cIds[2], 'ACL Return-to-Strength Stage 3', 'Rehab', self::addIsoDays($todayDay, -28), self::addIsoDays($todayDay, 28), json_encode($prog3Blocks, JSON_UNESCAPED_UNICODE), 'Monitor next-day knee swelling; progress to light jogging only after physio sign-off.', $ts - 200000]
        );

        // Payments
        $paySeeds = [
            [$cIds[0], 85000, 'Session pack', self::addIsoDays($todayDay, -5), 'Paid', '10-session PT pack'],
            [$cIds[1], 32000, 'Membership', self::addIsoDays($todayDay, -2), 'Paid', 'Monthly unlimited coaching + gym'],
            [$cIds[2], 52000, 'Program fee', $todayDay, 'Pending', '5-pack physio rehab sessions'],
            [$cIds[4], 24000, 'Membership', self::addIsoDays($todayDay, -1), 'Paid', 'Small group squad monthly'],
            [$cIds[3], 7500, 'Casual visit', $todayDay, 'Pending', 'Initial trial assessment fee'],
        ];
        foreach ($paySeeds as $p => $py) {
            $db->execute(
                'INSERT INTO payments(client_id, amount_cents, payment_type, payment_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$py[0], $py[1], $py[2], $py[3], $py[4], $py[5], $ts - (5 - $p) * 3600]
            );
        }

        return self::studioSampleCount($db);
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
                'counts' => self::studioBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Studio name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Personal Training & Athletic Coaching';
            $currency = V::oneOf($input['currency'] ?? null, self::STUDIO_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::STUDIO_PRESETS, 'brand_preset', ['fallback' => 'studio-emerald']);
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
                self::seedStudioSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => Context::getBusinessSettings($db),
                    'counts' => self::studioBadgeCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = Context::getBusinessSettings($db);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Studio name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::STUDIO_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::STUDIO_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This studio workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'coach']);
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
            $loaded = self::seedStudioSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::studioBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = ['payments', 'programs', 'assessments', 'sessions', 'clients', 'trainers'];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::studioBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
