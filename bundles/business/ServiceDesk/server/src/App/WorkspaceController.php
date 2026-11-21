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
    private const SUPPORT_ROLES = ['owner', 'manager', 'support_agent'];
    private const JOIN_ROLES = ['manager', 'support_agent'];
    private const PRESETS = ['cobalt', 'teal', 'slate', 'violet'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'support_tickets',
        'bug_reports',
        'feature_requests',
        'refund_requests',
        'escalations',
        'customer_feedback',
        'kb_articles',
    ];
    private const CLEAR_ORDER = [
        'customer_feedback',
        'escalations',
        'refund_requests',
        'feature_requests',
        'bug_reports',
        'support_tickets',
        'kb_articles',
    ];

    public static function computeNpsCategory(int $score): string
    {
        if ($score >= 9) {
            return 'Promoter';
        }
        if ($score >= 7) {
            return 'Passive';
        }
        return 'Detractor';
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<string, int|float>
     */
    public static function computeNpsSummary(array $rows): array
    {
        $total = count($rows);
        $promoters = 0;
        $passives = 0;
        $detractors = 0;
        $sumSat = 0.0;
        $sumResp = 0.0;
        $sumRes = 0.0;
        $sumAgent = 0.0;

        foreach ($rows as $r) {
            $cat = self::computeNpsCategory((int) ($r['nps_score'] ?? 0));
            if ($cat === 'Promoter') {
                $promoters++;
            } elseif ($cat === 'Passive') {
                $passives++;
            } else {
                $detractors++;
            }
            $sumSat += (float) ($r['overall_satisfaction'] ?? 0);
            $sumResp += (float) ($r['response_time_rating'] ?? 0);
            $sumRes += (float) ($r['resolution_rating'] ?? 0);
            $sumAgent += (float) ($r['agent_rating'] ?? 0);
        }

        $nps = $total > 0 ? (int) round((($promoters - $detractors) / $total) * 100.0) : 0;
        return [
            'total' => $total,
            'promoters' => $promoters,
            'passives' => $passives,
            'detractors' => $detractors,
            'promoterPct' => $total > 0 ? (int) round(($promoters / $total) * 100.0) : 0,
            'passivePct' => $total > 0 ? (int) round(($passives / $total) * 100.0) : 0,
            'detractorPct' => $total > 0 ? (int) round(($detractors / $total) * 100.0) : 0,
            'nps' => $nps,
            'avgSatisfaction' => $total > 0 ? round(($sumSat / $total) * 10.0) / 10.0 : 0,
            'avgResponse' => $total > 0 ? round(($sumResp / $total) * 10.0) / 10.0 : 0,
            'avgResolution' => $total > 0 ? round(($sumRes / $total) * 10.0) / 10.0 : 0,
            'avgAgent' => $total > 0 ? round(($sumAgent / $total) * 10.0) / 10.0 : 0,
        ];
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'ticket_seq', 'bug_seq', 'updated_at'] as $intCol) {
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
    private static function normalizeMember(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        if (array_key_exists('is_owner', $row)) {
            $row['is_owner'] = (int) $row['is_owner'];
        }
        if (array_key_exists('created_at', $row)) {
            $row['created_at'] = (int) $row['created_at'];
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
    public static function readBadgeCounts(Database $db): array
    {
        $openT = $db->first(
            "SELECT COUNT(*) AS c FROM support_tickets WHERE status IN ('Open', 'In Progress', 'Waiting on Customer', 'Escalated')"
        );
        $urgentT = $db->first(
            "SELECT COUNT(*) AS c FROM support_tickets WHERE priority = 'Urgent' AND status NOT IN ('Resolved', 'Closed')"
        );
        $activeEsc = $db->first("SELECT COUNT(*) AS c FROM escalations WHERE status = 'Active'");
        $pendRef = $db->first("SELECT COUNT(*) AS c FROM refund_requests WHERE status = 'Pending'");
        $openBugs = $db->first("SELECT COUNT(*) AS c FROM bug_reports WHERE status NOT IN ('Verified', 'Closed')");
        $fbRows = $db->query(
            'SELECT nps_score, overall_satisfaction, response_time_rating, resolution_rating, agent_rating FROM customer_feedback'
        );
        $npsSum = self::computeNpsSummary($fbRows);

        return [
            'openTickets' => $openT ? (int) $openT['c'] : 0,
            'urgentTickets' => $urgentT ? (int) $urgentT['c'] : 0,
            'activeEscalations' => $activeEsc ? (int) $activeEsc['c'] : 0,
            'pendingRefunds' => $pendRef ? (int) $pendRef['c'] : 0,
            'openBugs' => $openBugs ? (int) $openBugs['c'] : 0,
            'nps' => (int) $npsSum['nps'],
            'feedbackCount' => (int) $npsSum['total'],
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedSupportSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

        $t1 = $db->execute(
            'INSERT INTO support_tickets(ticket_number, customer_name, email, phone, category, priority, status, subject, description, assigned_to, internal_notes_json, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'TKT-1001',
                'Rachel Morales',
                'rachel@brightleaf.io',
                '(415) 555-0194',
                'Billing',
                'Urgent',
                'Escalated',
                'Duplicate annual renewal charge on Visa ending 4821',
                'Our corporate card was billed twice for our Pro Annual renewal this morning. Need immediate reversal before month-end close.',
                'Nina Patel',
                json_encode([[
                    'author' => 'Nina Patel',
                    'body' => 'Confirmed two Stripe charges #ch_9821 and #ch_9822. Escalated to Billing Lead for instant void.',
                    'ts' => $ts - 1800,
                ]], $jsonFlags),
                $ts - 5400,
                $ts - 1800,
            ]
        )['lastInsertRowid'];

        $t2 = $db->execute(
            'INSERT INTO support_tickets(ticket_number, customer_name, email, phone, category, priority, status, subject, description, assigned_to, internal_notes_json, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'TKT-1002',
                'Owen Gallagher',
                'owen@kestrelops.com',
                '(212) 555-0148',
                'Technical',
                'High',
                'In Progress',
                'SSO SAML login redirects to blank screen on Safari 18',
                'After enabling Okta SAML in workspace settings, team members on macOS Safari hit a blank loop after IdP callback.',
                'Liam Brooks',
                json_encode([[
                    'author' => 'Liam Brooks',
                    'body' => 'Requested HAR capture; looks related to BUG-101 cookie SameSite header.',
                    'ts' => $ts - 2600,
                ]], $jsonFlags),
                $ts - 7200,
                $ts - 2600,
            ]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO support_tickets(ticket_number, customer_name, email, phone, category, priority, status, subject, description, assigned_to, internal_notes_json, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'TKT-1003',
                'Priya Subramanian',
                'priya@vervehealth.org',
                '',
                'Account',
                'Medium',
                'Open',
                'How do we transfer workspace ownership to a new admin?',
                'Our previous IT director left and we need to promote our Operations Lead to Primary Owner without losing saved reports.',
                '',
                '[]',
                $ts - 3100,
                $ts - 3100,
            ]
        );

        $t4 = $db->execute(
            'INSERT INTO support_tickets(ticket_number, customer_name, email, phone, category, priority, status, subject, description, assigned_to, internal_notes_json, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'TKT-1004',
                'Daniel Cho',
                'dcho@harbortech.co',
                '',
                'Shipping / Delivery',
                'Low',
                'Resolved',
                'Hardware starter kit arrived with missing USB-C cable',
                'Received our reader dock today cleanly, only the braided USB-C cable was missing from the box.',
                'Nina Patel',
                json_encode([[
                    'author' => 'Nina Patel',
                    'body' => 'Replacement cable dispatched express — tracking sent to customer.',
                    'ts' => $ts - 20000,
                ]], $jsonFlags),
                $ts - 86400,
                $ts - 20000,
            ]
        )['lastInsertRowid'];

        $db->execute(
            "INSERT INTO escalations(ticket_id, escalation_reason, current_status, desired_outcome, urgency, escalated_to, escalated_by, escalation_date, notes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1, ?, ?)",
            [
                $t1,
                'VIP Customer',
                'Duplicate $2,400 charge verified in payment gateway.',
                'Void second authorization and send written confirmation within 2 hours.',
                'Critical (immediate)',
                'Finance & Billing Lead',
                'Nina Patel',
                $todayDay,
                'Enterprise tier account renewing 40 seats.',
                $ts - 1800,
                $ts - 1800,
            ]
        );

        $db->execute(
            'INSERT INTO bug_reports(bug_number, reporter_name, email, product, severity, bug_title, steps_to_reproduce, expected_behavior, actual_behavior, browser_os, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'BUG-101',
                'Owen Gallagher',
                'owen@kestrelops.com',
                'Web Application',
                'High',
                'SAML callback drops session cookie on Safari 18',
                "1. Enable Okta SAML.\n2. Open login page in Safari 18.\n3. Complete IdP auth and return to /sso/callback.",
                'User lands on dashboard authenticated.',
                'Redirects back to /login with blank screen loop.',
                'Safari 18.1 / macOS 15',
                'In Fix',
                $ts - 6800,
                $ts - 2200,
            ]
        );

        $db->execute(
            'INSERT INTO bug_reports(bug_number, reporter_name, email, product, severity, bug_title, steps_to_reproduce, expected_behavior, actual_behavior, browser_os, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'BUG-102',
                'Maya Lin',
                'maya@studioforge.co',
                'Mobile App (iOS)',
                'Medium',
                'CSV export sheet clips long notes column on iPhone SE',
                "1. Open Reports on iOS.\n2. Tap Export Preview.\n3. Scroll right.",
                'Horizontal scroll reveals full notes text.',
                'Notes text overlaps right margin.',
                'iOS 18.0 / iPhone SE',
                'Triaged',
                $ts - 14000,
                $ts - 14000,
            ]
        );

        $db->execute(
            'INSERT INTO feature_requests(submitter_name, email, feature_title, description, use_case, priority, impact_score, additional_context, upvotes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Claire Wu',
                'claire@civicgrid.com',
                'Bulk CSV import for customer contacts',
                'Allow importing up to 5,000 customer accounts with column mapping and duplicate detection.',
                'Onboarding new enterprise clients takes hours of manual entry without bulk CSV upload.',
                'Critical',
                5,
                'Happy to beta test with our ops team.',
                14,
                'Planned',
                $ts - 50000,
                $ts - 10000,
            ]
        );

        $db->execute(
            'INSERT INTO feature_requests(submitter_name, email, feature_title, description, use_case, priority, impact_score, additional_context, upvotes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Samir Patel',
                'samir@foundrylabs.io',
                'Slack alert webhook for Urgent tickets',
                'Post instant notification to a chosen Slack channel whenever an Urgent ticket or Escalation opens.',
                'Our on-call engineers live in Slack and want <5 minute response times.',
                'Important',
                4,
                '',
                9,
                'Under Review',
                $ts - 30000,
                $ts - 8000,
            ]
        );

        $db->execute(
            'INSERT INTO feature_requests(submitter_name, email, feature_title, description, use_case, priority, impact_score, additional_context, upvotes, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Hannah Scott',
                'hannah@orbitretail.com',
                'Dark-mode knowledge base widget',
                'Match customer portal dark theme for embedded help articles.',
                'Reduces glare for night-shift warehouse staff.',
                'Nice to Have',
                2,
                '',
                5,
                'Shipped',
                $ts - 90000,
                $ts - 4000,
            ]
        );

        $db->execute(
            'INSERT INTO refund_requests(customer_name, email, order_number, purchase_date, items, reason, refund_method, amount_cents, additional_details, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Rachel Morales',
                'rachel@brightleaf.io',
                'ORD-88412',
                $todayDay,
                'Pro Annual Subscription (Duplicate Charge)',
                'Billing Error',
                'Original Payment Method',
                240000,
                'Second charge #ch_9822 from same morning.',
                'Pending',
                $ts - 1500,
                $ts - 1500,
            ]
        );

        $db->execute(
            'INSERT INTO refund_requests(customer_name, email, order_number, purchase_date, items, reason, refund_method, amount_cents, additional_details, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Marcus Vance',
                'marcus@oaklandbrew.com',
                'ORD-87905',
                $todayDay,
                'Thermal Receipt Printer (Cracked Lid)',
                'Defective / Damaged',
                'Store Credit',
                18900,
                'Customer requested credit toward upgraded Wi-Fi model.',
                'Approved',
                $ts - 12000,
                $ts - 6000,
            ]
        );

        $feedback = [
            [$t4, 'Daniel Cho', 5, 5, 5, 5, 10, 'Nina shipped our replacement cable the same afternoon. Super smooth experience!', 'Yes'],
            [$t2, 'Owen Gallagher', 4, 4, 4, 5, 8, 'Liam responded fast and isolated the Safari issue quickly; waiting on patch.', 'Yes'],
            [$t1, 'Rachel Morales', 3, 4, 3, 4, 6, "Support agent was helpful, though duplicate billing shouldn't happen in the first place.", 'Maybe'],
            [null, 'Elena Rostova', 5, 5, 5, 5, 9, 'Clear onboarding guide and friendly live follow-up.', 'Yes'],
        ];
        foreach ($feedback as $f => $fb) {
            $db->execute(
                'INSERT INTO customer_feedback(ticket_id, customer_name, overall_satisfaction, response_time_rating, resolution_rating, agent_rating, nps_score, nps_category, comments, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $fb[0],
                    $fb[1],
                    $fb[2],
                    $fb[3],
                    $fb[4],
                    $fb[5],
                    $fb[6],
                    self::computeNpsCategory($fb[6]),
                    $fb[7],
                    $fb[8],
                    $ts - (4 - $f) * 7200,
                ]
            );
        }

        $kb = [
            [
                'Transferring Workspace Ownership',
                'Account Management',
                'How do we transfer workspace ownership to a new admin?',
                "To transfer Primary Ownership:\n1. Sign in as the current Owner or ask Support to verify your domain admin.\n2. Open Settings -> Team & Roles and ensure the incoming admin is Active.\n3. Confirm the transfer request via email — all reports, forms, and billing history stay intact with zero downtime.",
                'owner, transfer, admin, permissions',
                'Role Permissions Guide',
                'Support Ops',
            ],
            [
                'Resolving Duplicate Renewal Charges',
                'Billing & Payments',
                'Why was my card charged twice and how fast is a refund?',
                'Occasionally a bank retry triggers a duplicate pending authorization. We immediately void duplicate charges on our side; authorizations drop off within 24–48 hours and settled refunds return to your original payment method in 3–5 business days.',
                'duplicate, billing, charge, refund, visa',
                'Billing Receipts FAQ',
                'Billing Team',
            ],
            [
                'Troubleshooting Safari SAML / SSO Loops',
                'Troubleshooting',
                'Why does SSO redirect back to the login screen on Safari?',
                "In Safari Privacy Settings, temporarily ensure 'Prevent cross-site tracking' allows your Identity Provider callback URL, clear site cookies for the app domain, and sign in via your IdP tile directly. Our engineering team is also rolling out a SameSite cookie update.",
                'sso, saml, okta, safari, login loop',
                'Configuring Okta SAML',
                'Engineering Support',
            ],
            [
                'Hardware Warranty & Missing Parts Replacement',
                'Policy',
                'What is covered if a hardware kit arrives incomplete or damaged?',
                'All hardware kits include a 12-month replacement warranty. Share your Order # and shipping address and we will dispatch missing cables or defective units via express courier within 1 business day at no cost.',
                'hardware, warranty, cable, shipping, damaged',
                'Return Policy',
                'Fulfillment Ops',
            ],
        ];
        foreach ($kb as $a) {
            $db->execute(
                "INSERT INTO kb_articles(title, category, question, answer, keywords, related_articles, author, last_reviewed, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Published', 1, ?, ?)",
                [$a[0], $a[1], $a[2], $a[3], $a[4], $a[5], $a[6], $todayDay, $ts - 10000, $ts - 10000]
            );
        }

        $db->execute('UPDATE business_settings SET ticket_seq = 1004, bug_seq = 102 WHERE id = 1 AND ticket_seq < 1004');
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
                    'me' => [
                        'userId' => $me['userId'],
                        'isOwner' => $me['isOwner'],
                        'role' => $me['isOwner'] ? 'owner' : '',
                    ],
                    'settings' => $settings,
                    'counts' => null,
                ];
            }
            $member = self::normalizeMember(Context::getTeamMember($db, $me['userId']));
            if ($me['isOwner'] && !$member) {
                $member = [
                    'user_id' => $me['userId'],
                    'display_name' => ($settings['owner_name'] ?? '') !== '' ? $settings['owner_name'] : 'Owner',
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
                'counts' => self::readBadgeCounts($db),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Customer Support & Helpdesk';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'USD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'America/New_York';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'cobalt']);
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
                self::seedSupportSample($db, $todayDay);
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
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
            $rows = $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC');
            return ['team' => array_map([self::class, 'normalizeMember'], $rows)];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'Workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'support_agent']);
            $existing = self::normalizeMember(Context::getTeamMember($db, $me['userId']));
            if ($existing) {
                return ['member' => $existing];
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
            $target = self::normalizeMember(Context::getTeamMember($db, $targetId));
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
            $target = self::normalizeMember(Context::getTeamMember($db, $targetId));
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
                'sampleCount' => self::seedSupportSample($db, $todayDay),
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
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db)];
        }, write: true);
    }
}
