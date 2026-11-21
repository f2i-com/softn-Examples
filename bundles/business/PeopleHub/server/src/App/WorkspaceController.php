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
    public const HR_ROLES = ['owner', 'manager', 'employee'];
    public const JOIN_ROLES = ['manager', 'employee'];
    public const PRESETS = ['berry', 'plum', 'indigo', 'sage'];
    public const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];

    public const IT_SETUP_ITEMS = [
        'Laptop / Workstation',
        'Email Account',
        'VPN Access',
        'Required Software',
        'Access Badge / Key Card',
        'Phone / Extension',
    ];

    public const POLICY_ITEMS = [
        'Employee Handbook',
        'Code of Conduct',
        'Data Privacy Policy',
        'Workplace Safety Policy',
        'Anti-Harassment Policy',
    ];

    private const SAMPLE_TABLES = [
        'candidates',
        'interview_scorecards',
        'onboardings',
        'leave_requests',
        'performance_reviews',
        'expense_claims',
        'training_requests',
        'exit_interviews',
    ];

    private const CLEAR_ORDER = [
        'exit_interviews',
        'training_requests',
        'expense_claims',
        'performance_reviews',
        'leave_requests',
        'onboardings',
        'interview_scorecards',
        'candidates',
    ];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        if (array_key_exists('tax_rate', $row)) {
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
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function hydrateOnboarding(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at'] as $intCol) {
            if (array_key_exists($intCol, $row)) {
                $row[$intCol] = (int) $row[$intCol];
            }
        }
        $it = V::parseJson($row['it_setup_json'] ?? '', []);
        $pol = V::parseJson($row['policy_json'] ?? '', []);
        $row['it_setup'] = is_array($it) ? array_values($it) : [];
        $row['policy_acknowledgement'] = is_array($pol) ? array_values($pol) : [];
        $total = count(self::IT_SETUP_ITEMS) + count(self::POLICY_ITEMS);
        $done = count($row['it_setup']) + count($row['policy_acknowledgement']);
        $row['completed_count'] = $done;
        $row['total_count'] = $total;
        $row['completion_pct'] = $total > 0 ? (int) round(($done / $total) * 100.0) : 0;
        return $row;
    }

    public static function addDaysIso(string $isoDay, int $delta = 0): string
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
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function readBadgeCounts(Database $db): array
    {
        $pendLeave = $db->first("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'Pending'");
        $pendExp = $db->first("SELECT COUNT(*) AS c FROM expense_claims WHERE status = 'Pending'");
        $pendTr = $db->first("SELECT COUNT(*) AS c FROM training_requests WHERE status = 'Pending'");
        $activeCand = $db->first(
            "SELECT COUNT(*) AS c FROM candidates WHERE stage IN ('Applied', 'Screening', 'Interview', 'Offer')"
        );
        $onbs = $db->query('SELECT it_setup_json, policy_json FROM onboardings');
        $inProgOnb = 0;
        $totalTasks = count(self::IT_SETUP_ITEMS) + count(self::POLICY_ITEMS);
        foreach ($onbs as $ob) {
            $it = V::parseJson($ob['it_setup_json'] ?? '', []);
            $pol = V::parseJson($ob['policy_json'] ?? '', []);
            $done = (is_array($it) ? count($it) : 0) + (is_array($pol) ? count($pol) : 0);
            if ($done < $totalTasks) {
                $inProgOnb++;
            }
        }
        $pl = $pendLeave ? (int) $pendLeave['c'] : 0;
        $pe = $pendExp ? (int) $pendExp['c'] : 0;
        $pt = $pendTr ? (int) $pendTr['c'] : 0;
        return [
            'pendingLeave' => $pl,
            'pendingExpenses' => $pe,
            'pendingTraining' => $pt,
            'pendingApprovals' => $pl + $pe + $pt,
            'activeCandidates' => $activeCand ? (int) $activeCand['c'] : 0,
            'inProgressOnboardings' => $inProgOnb,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedHrSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

        // Candidates + linked Interview Scorecards
        $c1 = $db->execute(
            'INSERT INTO candidates(first_name, last_name, email, phone, position, cover_letter, availability_date, salary_expectations_cents, referral_source, stage, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Amara', 'Okafor', 'amara.okafor@example.com', '(415) 555-0192', 'Software Engineer',
                '7 years shipping distributed TypeScript & Rust backends; excited about collaborative product teams.',
                self::addDaysIso($todayDay, 21), 15500000, 'Employee Referral', 'Offer', $ts - 18000, $ts - 2000,
            ]
        )['lastInsertRowid'];

        $c2 = $db->execute(
            'INSERT INTO candidates(first_name, last_name, email, phone, position, cover_letter, availability_date, salary_expectations_cents, referral_source, stage, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Lucas', 'Meyer', 'lucas.meyer@example.com', '(212) 555-0144', 'Product Designer',
                'Design systems lead focused on accessible enterprise workflows.',
                self::addDaysIso($todayDay, 14), 13200000, 'LinkedIn', 'Interview', $ts - 12000, $ts - 3000,
            ]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO candidates(first_name, last_name, email, phone, position, cover_letter, availability_date, salary_expectations_cents, referral_source, stage, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Sienna', 'Cho', 'sienna.cho@example.com', '(312) 555-0188', 'Operations Manager',
                'Scaled multi-site operations and vendor compliance for SaaS growth teams.',
                self::addDaysIso($todayDay, 30), 11800000, 'Job Board', 'Screening', $ts - 9000, $ts - 5000,
            ]
        );

        $db->execute(
            'INSERT INTO candidates(first_name, last_name, email, phone, position, cover_letter, availability_date, salary_expectations_cents, referral_source, stage, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Mateo', 'Cruz', 'mateo.cruz@example.com', '(512) 555-0133', 'Account Executive',
                'Mid-market SaaS closer with 128% quota attainment.',
                self::addDaysIso($todayDay, 10), 11000000, 'Company Website', 'Applied', $ts - 4000, $ts - 4000,
            ]
        );

        $db->execute(
            'INSERT INTO interview_scorecards(candidate_id, interviewer_name, interview_date, interview_type, technical_skills, communication, culture_fit, problem_solving, overall_score, overall_recommendation, strengths, concerns, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 'Rachel Lin', self::addDaysIso($todayDay, -4), 'Technical', 5, 5, 5, 4, 4.8, 'Strong Hire',
                'Clear systems decomposition, strong SQLite & reliability instincts, collaborative communication.',
                'None noted.', 'Ready for final offer sign-off.', $ts - 3600,
            ]
        );

        $db->execute(
            'INSERT INTO interview_scorecards(candidate_id, interviewer_name, interview_date, interview_type, technical_skills, communication, culture_fit, problem_solving, overall_score, overall_recommendation, strengths, concerns, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 'Devon Harper', self::addDaysIso($todayDay, -2), 'Panel', 4, 5, 4, 4, 4.3, 'Hire',
                'Deep accessibility craft and crisp storytelling in portfolio walkthrough.',
                'Limited experience with data-dense billing tables.', 'Recommend final executive chat.', $ts - 1800,
            ]
        );

        // Employee Onboarding Checklists
        $ob1 = $db->execute(
            'INSERT INTO onboardings(employee_name, email, start_date, department, manager, it_setup_json, policy_json, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_account, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Tessa Lindholm', 'tessa@kindredpeople.co', self::addDaysIso($todayDay, 3), 'Engineering', 'Rachel Lin',
                json_encode(['Laptop / Workstation', 'Email Account', 'VPN Access'], $jsonFlags),
                json_encode(['Employee Handbook', 'Code of Conduct', 'Data Privacy Policy'], $jsonFlags),
                'Erik Lindholm', '(415) 555-0177', 'Spouse', 'Ending •••• 4912',
                'MacBook Pro shipped — awaiting badge photo.', $ts - 8000, $ts - 2000,
            ]
        )['lastInsertRowid'];

        $ob2 = $db->execute(
            'INSERT INTO onboardings(employee_name, email, start_date, department, manager, it_setup_json, policy_json, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_account, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Noah Alvarez', 'noah@kindredpeople.co', self::addDaysIso($todayDay, -12), 'Design', 'Devon Harper',
                json_encode(self::IT_SETUP_ITEMS, $jsonFlags),
                json_encode(self::POLICY_ITEMS, $jsonFlags),
                'Elena Alvarez', '(212) 555-0165', 'Sister', 'Ending •••• 8821',
                'All Day-1 & IT checks complete!', $ts - 15000, $ts - 4000,
            ]
        )['lastInsertRowid'];

        // Leave Requests (2 pending for Approvals Inbox + 1 approved)
        $db->execute(
            "INSERT INTO leave_requests(employee_name, employee_email, leave_type, start_date, end_date, total_days, reason, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, ?, ?)",
            [
                'Noah Alvarez', 'noah@kindredpeople.co', 'Annual Leave',
                self::addDaysIso($todayDay, 14), self::addDaysIso($todayDay, 18), 5,
                'Family trip to Lisbon — design handoffs covered.', 'Devon Harper', $ts - 3600, $ts - 3600,
            ]
        );
        $db->execute(
            "INSERT INTO leave_requests(employee_name, employee_email, leave_type, start_date, end_date, total_days, reason, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, ?, ?)",
            [
                'Priya Raman', 'priya@kindredpeople.co', 'Personal Leave',
                self::addDaysIso($todayDay, 5), self::addDaysIso($todayDay, 6), 2,
                'Moving apartments.', 'Rachel Lin', $ts - 2200, $ts - 2200,
            ]
        );
        $db->execute(
            "INSERT INTO leave_requests(employee_name, employee_email, leave_type, start_date, end_date, total_days, reason, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 1, ?, ?)",
            [
                'Jordan Ellis', 'jordan@kindredpeople.co', 'Sick Leave',
                self::addDaysIso($todayDay, -3), self::addDaysIso($todayDay, -2), 2,
                'Flu recovery.', 'Rachel Lin', $ts - 25000, $ts - 20000,
            ]
        );

        // Performance Reviews
        $db->execute(
            'INSERT INTO performance_reviews(onboarding_id, employee_name, review_period, reviewer_name, review_date, job_knowledge, quality_of_work, productivity, teamwork, initiative, overall_rating, goals_met, strengths, areas_for_improvement, goals_next_period, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $ob2, 'Noah Alvarez', 'Probation', 'Devon Harper', self::addDaysIso($todayDay, -1),
                5, 5, 4, 5, 4, 4.6, 'Exceeded All Goals',
                'Shipped refreshed onboarding flows ahead of schedule and mentored junior designers.',
                'Document design tokens earlier in sprint planning.',
                'Lead Q1 mobile accessibility audit.', $ts - 5000,
            ]
        );
        $db->execute(
            'INSERT INTO performance_reviews(onboarding_id, employee_name, review_period, reviewer_name, review_date, job_knowledge, quality_of_work, productivity, teamwork, initiative, overall_rating, goals_met, strengths, areas_for_improvement, goals_next_period, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $ob1, 'Priya Raman', 'Annual', 'Rachel Lin', self::addDaysIso($todayDay, -10),
                4, 5, 4, 4, 5, 4.4, 'Met All Goals',
                'Consistent backend reliability and calm on-call leadership.',
                'Delegate routine reviews to peers.',
                'Architect v2 permissions engine.', $ts - 18000,
            ]
        );

        // Expense Claims (1 pending for Approvals Inbox + 1 reimbursed)
        $db->execute(
            "INSERT INTO expense_claims(employee_name, employee_email, expense_date, category, description, amount_cents, project_code, notes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, ?, ?)",
            [
                'Jordan Ellis', 'jordan@kindredpeople.co', self::addDaysIso($todayDay, -2), 'Travel',
                'Round-trip flights & airport rail for Austin client workshop', 64850, 'CUST-204',
                'Economy fare + express train receipt attached.', $ts - 2900, $ts - 2900,
            ]
        );
        $db->execute(
            "INSERT INTO expense_claims(employee_name, employee_email, expense_date, category, description, amount_cents, project_code, notes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Reimbursed', 1, ?, ?)",
            [
                'Noah Alvarez', 'noah@kindredpeople.co', self::addDaysIso($todayDay, -8), 'Technology / Software',
                'Ergonomic trackpad & USB-C dock', 21900, 'ONB-IT',
                'Reimbursed on payroll run #22.', $ts - 16000, $ts - 10000,
            ]
        );

        // Training Requests (1 pending + 1 approved)
        $db->execute(
            "INSERT INTO training_requests(employee_name, employee_email, training_type, course_name, provider, start_date, end_date, cost_cents, justification, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, ?, ?)",
            [
                'Tessa Lindholm', 'tessa@kindredpeople.co', 'Certification',
                'AWS Solutions Architect Associate', 'AWS Training',
                self::addDaysIso($todayDay, 20), self::addDaysIso($todayDay, 45), 45000,
                'Directly supports Q1 cloud cost-optimization initiative.', 'Rachel Lin', $ts - 3200, $ts - 3200,
            ]
        );
        $db->execute(
            "INSERT INTO training_requests(employee_name, employee_email, training_type, course_name, provider, start_date, end_date, cost_cents, justification, manager_name, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 1, ?, ?)",
            [
                'Noah Alvarez', 'noah@kindredpeople.co', 'Conference',
                'Config Design Systems Summit', 'Figma',
                self::addDaysIso($todayDay, 35), self::addDaysIso($todayDay, 37), 89000,
                'Deep dive on multi-brand token architecture.', 'Devon Harper', $ts - 14000, $ts - 11000,
            ]
        );

        // Exit Interviews
        $db->execute(
            'INSERT INTO exit_interviews(employee_name, department, last_day, tenure_years, reason_for_leaving, overall_satisfaction, management_rating, culture_rating, what_enjoyed, suggestions, would_return, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                'Marcus Vance', 'Marketing', self::addDaysIso($todayDay, -15), 2.5, 'Relocation',
                4, 5, 5,
                'Supportive teammates, transparent leadership, and genuine work-life flexibility.',
                'Create clearer senior IC progression bands in Marketing.', 'Yes', 'Yes', $ts - 22000,
            ]
        );

        return self::sampleCount($db);
    }

    public function getSession(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            $settings = self::normalizeSettings(Context::getBusinessSettings($db));
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
            $member = self::normalizeMember(Context::getTeamMember($db, $me['userId']));
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
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => false,
                        'role' => $member['role'],
                        'displayName' => $member['display_name'],
                    ],
                    'settings' => ['business_name' => $settings['business_name'], 'brand_preset' => $settings['brand_preset']],
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
                'counts' => self::readBadgeCounts($db),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Company name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'HR & People Operations';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'USD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'America/New_York';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'berry']);
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
                self::seedHrSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::readBadgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = self::normalizeSettings(Context::getBusinessSettings($db));
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120]);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
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
            $rows = $db->query(
                'SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC'
            );
            $team = [];
            foreach ($rows as $r) {
                $team[] = self::normalizeMember($r);
            }
            return ['team' => $team];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'People Hub is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'employee']);
            $existing = Context::getTeamMember($db, $me['userId']);
            if ($existing) {
                return ['member' => self::normalizeMember($existing)];
            }
            $db->execute(
                "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 0, 'pending', ?)",
                [$me['userId'], $displayName, $role, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['member' => self::normalizeMember(Context::getTeamMember($db, $me['userId']))],
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
                HttpException::fail(403, 'cannot_edit_owner', 'Owner cannot be changed.');
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
                HttpException::fail(403, 'cannot_remove_owner', 'Owner cannot be removed.');
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
                'sampleCount' => self::seedHrSample($db, $todayDay),
                'counts' => self::readBadgeCounts($db),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_ORDER as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            return [
                'sampleCount' => 0,
                'counts' => self::readBadgeCounts($db),
            ];
        }, write: true);
    }
}
