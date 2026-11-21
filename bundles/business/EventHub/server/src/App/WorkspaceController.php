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
    private const EVENT_ROLES = ['owner', 'manager', 'coordinator'];
    private const JOIN_ROLES = ['manager', 'coordinator'];
    private const PRESETS = ['plum', 'coral', 'gala', 'expo'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'attendees',
        'speakers',
        'vendors',
        'volunteers',
        'budget_items',
        'incidents',
        'event_feedback',
    ];
    private const CLEAR_ORDER = [
        'event_feedback',
        'incidents',
        'budget_items',
        'volunteers',
        'vendors',
        'speakers',
        'attendees',
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

    /** @return array{estimatedCents: int, actualCents: int, varianceCents: int, itemCount: int} */
    public static function computeBudgetTotals(Database $db): array
    {
        $row = $db->first(
            'SELECT COALESCE(SUM(estimated_cents), 0) AS est, COALESCE(SUM(actual_cents), 0) AS act, COUNT(*) AS cnt FROM budget_items'
        );
        $est = $row ? (int) $row['est'] : 0;
        $act = $row ? (int) $row['act'] : 0;
        return [
            'estimatedCents' => $est,
            'actualCents' => $act,
            'varianceCents' => $est - $act,
            'itemCount' => $row ? (int) $row['cnt'] : 0,
        ];
    }

    /** @return array<string, int> */
    public static function readBadgeCounts(Database $db): array
    {
        $att = $db->first('SELECT COUNT(*) AS total, COALESCE(SUM(checked_in), 0) AS checked FROM attendees');
        $totalAtt = $att ? (int) $att['total'] : 0;
        $checkedAtt = $att ? (int) $att['checked'] : 0;
        $pct = $totalAtt > 0 ? (int) round(($checkedAtt / $totalAtt) * 100.0) : 0;
        $spk = $db->first("SELECT COUNT(*) AS c FROM speakers WHERE status IN ('Accepted', 'Scheduled')");
        $vnd = $db->first("SELECT COUNT(*) AS c FROM vendors WHERE status = 'Booth Assigned'");
        $vol = $db->first('SELECT COUNT(*) AS c FROM volunteers');
        $inc = $db->first("SELECT COUNT(*) AS c FROM incidents WHERE status = 'Open'");
        $bud = self::computeBudgetTotals($db);

        return [
            'totalRegistrations' => $totalAtt,
            'checkedIn' => $checkedAtt,
            'checkInPct' => $pct,
            'confirmedSpeakers' => $spk ? (int) $spk['c'] : 0,
            'assignedBooths' => $vnd ? (int) $vnd['c'] : 0,
            'volunteers' => $vol ? (int) $vol['c'] : 0,
            'openIncidents' => $inc ? (int) $inc['c'] : 0,
            'budgetEstimatedCents' => $bud['estimatedCents'],
            'budgetActualCents' => $bud['actualCents'],
            'budgetVarianceCents' => $bud['varianceCents'],
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedEventSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

        $attendees = [
            ['Elena Rostova', 'elena@quantumstudio.io', '(415) 555-0181', 'Quantum Studio', 'VIP', ['Gluten Free', 'Nut Free'], 'Front-row seating near aisle', 'Viktor Rostov', '(415) 555-0199', 1],
            ['Marcus Vance', 'marcus@civicmesh.org', '(212) 555-0132', 'CivicMesh', 'General Admission', ['Vegetarian'], '', 'Dana Vance', '(212) 555-0144', 1],
            ['Dr. Priya Nair', 'priya@aifoundry.edu', '(617) 555-0166', 'AI Foundry Lab', 'Speaker', ['Vegan'], 'Wheelchair ramp access for Main Stage', 'Raj Nair', '(617) 555-0167', 1],
            ["Liam O'Connor", 'liam@techpulse.media', '(312) 555-0174', 'TechPulse Daily', 'Press', [], '', "Siobhan O'Connor", '(312) 555-0175', 0],
            ['Sora Takahashi', 'sora@kurodesign.jp', '(206) 555-0123', 'Kuro Design', 'VIP', ['Halal'], 'ASL interpreter requested for keynote', 'Kenji Takahashi', '(206) 555-0124', 0],
            ['Chloe Bennett', 'chloe@greenbridge.co', '(512) 555-0158', 'Greenbridge Ventures', 'Early Bird', ['None'], '', 'Sam Bennett', '(512) 555-0159', 1],
            ['Devon Alverez', 'devon@stateu.edu', '(305) 555-0117', 'State University', 'Student', ['Nut Free'], '', 'Rosa Alverez', '(305) 555-0118', 0],
        ];
        $firstAttId = null;
        foreach ($attendees as $i => $a) {
            $r = $db->execute(
                'INSERT INTO attendees(attendee_name, email, phone, organization, ticket_type, dietary_json, accessibility_needs, emergency_contact_name, emergency_contact_phone, checked_in, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $a[0],
                    $a[1],
                    $a[2],
                    $a[3],
                    $a[4],
                    json_encode($a[5], $jsonFlags),
                    $a[6],
                    $a[7],
                    $a[8],
                    $a[9],
                    $a[9] ? $ts - 1200 : 0,
                    $ts - (7 - $i) * 3600,
                ]
            );
            if ($firstAttId === null) {
                $firstAttId = $r['lastInsertRowid'];
            }
        }

        $speakers = [
            ['Dr. Priya Nair', 'priya@aifoundry.edu', '(617) 555-0166', 'Director of Applied AI Systems with 14 years leading production ML deployments.', 'Designing Human-Centered Operations at Scale', 'How mid-sized teams pair deterministic workflows with real-time automation without sacrificing reliability.', 'Keynote', ['Projector', 'Microphone', 'High-Speed WiFi'], 'Day 1 · 09:30 · Main Stage', 'Scheduled', 'Needs stage ramp + lapel mic.'],
            ['Julian Alvarez', 'julian@soundcraft.io', '(415) 555-0190', 'Principal Product Architect and author of Live Craft Systems.', 'Zero-Downtime Event Production Playbook', 'Hands-on walkthrough of live venue checklists, fallback comms, and rapid check-in architecture.', 'Workshop', ['Projector', 'Whiteboard', 'Laptop', 'High-Speed WiFi'], 'Day 1 · 13:30 · Studio B', 'Accepted', 'Confirmed slide deck.'],
            ['Nadia Haddad', 'nadia@meridianux.com', '(212) 555-0141', 'VP of Design Systems at Meridian.', 'Accessible Interfaces for Live Crowds', 'High-contrast signage, dietary visibility, and tactile wayfinding for inclusive conferences.', 'Breakout Session', ['Projector', 'Microphone'], '', 'Under Review', 'Strong abstract — fits Track 2.'],
            ['Trevor Cole', 'trevor@beaconcloud.dev', '(503) 555-0162', 'Staff SRE at Beacon Cloud.', '5-Minute Incident Triage Under Pressure', 'Rapid communication templates when venue WiFi or AV drops mid-keynote.', 'Lightning Talk', ['Microphone'], '', 'Submitted', ''],
        ];
        foreach ($speakers as $sp) {
            $db->execute(
                'INSERT INTO speakers(speaker_name, email, phone, bio, topic_title, abstract, presentation_type, equipment_json, session_slot, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [
                    $sp[0],
                    $sp[1],
                    $sp[2],
                    $sp[3],
                    $sp[4],
                    $sp[5],
                    $sp[6],
                    json_encode($sp[7], $jsonFlags),
                    $sp[8],
                    $sp[9],
                    $sp[10],
                    $ts - 9000,
                    $ts - 2000,
                ]
            );
        }

        $vendors = [
            ['Roastcraft Espresso Carts', 'Maya Lin', 'events@roastcraft.co', '(415) 555-0188', 'https://roastcraft.co', 'Specialty espresso bar & cold brew taps for VIP lounge.', 'Large (10x20)', ['High Power (240V)', 'Multiple Outlets'], 'A-01', 1, 'Needs water access near West Foyer.', 'Booth Assigned'],
            ['LumenStage AV Rentals', 'Derek Ortiz', 'derek@lumenstage.com', '(312) 555-0149', 'https://lumenstage.com', 'Modular LED backdrops and wireless audience Q&A mics.', 'Premium (20x20)', ['High Power (240V)'], 'B-04', 1, 'Load-in at 06:30 via South Dock.', 'Booth Assigned'],
            ['PrintCraft Swag Co.', 'Tessa Ward', 'tessa@printcraft.io', '(512) 555-0177', '', 'Eco-friendly conference totes, lanyards, and badge reels.', 'Medium (10x10)', ['Standard Power (120V)'], '', 1, '', 'Approved'],
            ['PulseCheck BioSensors', 'Arjun Mehta', 'arjun@pulsecheck.ai', '(650) 555-0122', '', 'Interactive wearable demo pods.', 'Small (6x6)', ['Standard Power (120V)', 'Multiple Outlets'], '', 0, 'Awaiting certificate of insurance.', 'Applied'],
        ];
        foreach ($vendors as $vn) {
            $db->execute(
                'INSERT INTO vendors(company_name, contact_name, email, phone, website, products_services, booth_size, power_json, booth_number, insurance_verified, special_requests, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [
                    $vn[0],
                    $vn[1],
                    $vn[2],
                    $vn[3],
                    $vn[4],
                    $vn[5],
                    $vn[6],
                    json_encode($vn[7], $jsonFlags),
                    $vn[8],
                    $vn[9],
                    $vn[10],
                    $vn[11],
                    $ts - 8000,
                    $ts - 1500,
                ]
            );
        }

        $volunteers = [
            ['Hannah Park', 'hannah.p@example.com', '(415) 555-0101', ['Setup (day before)', 'Event Day'], ['Registration Desk', 'Hospitality / Catering'], 'M', 'Check-In Desk · 07:30–12:30', 'Grace Park', '(415) 555-0102', 'Bilingual Korean/English'],
            ['Noah Kim', 'noah.k@example.com', '(415) 555-0103', ['Event Day', 'Teardown (day after)'], ['Tech / AV Support', 'Photography / Video'], 'L', 'Main Stage AV · 08:30–16:00', 'David Kim', '(415) 555-0104', 'Experienced with wireless lapels'],
            ['Amara Osei', 'amara.o@example.com', '(415) 555-0105', ['All Days'], ['First Aid', 'Crowd Management'], 'S', 'Foyer Rover · 09:00–17:00', 'Kofi Osei', '(415) 555-0106', 'Certified First Aid & CPR'],
        ];
        foreach ($volunteers as $vl) {
            $db->execute(
                'INSERT INTO volunteers(volunteer_name, email, phone, availability_json, skills_json, t_shirt_size, assigned_shift, emergency_contact_name, emergency_contact_phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $vl[0],
                    $vl[1],
                    $vl[2],
                    json_encode($vl[3], $jsonFlags),
                    json_encode($vl[4], $jsonFlags),
                    $vl[5],
                    $vl[6],
                    $vl[7],
                    $vl[8],
                    $vl[9],
                    $ts - 5000,
                ]
            );
        }

        $budget = [
            ['Grand Hall & Breakout Rooms', 'Venue', 1800000, 1750000, 'Metro Convention Center', 'Negotiated 5% multi-room discount'],
            ['All-Day Catering & Dietary Meals', 'Catering', 950000, 1020000, 'FreshTable Catering', 'Added 15 extra gluten-free & vegan boxes'],
            ['Main Stage LED & Lighting Rig', 'AV Equipment', 620000, 595000, 'LumenStage AV Rentals', ''],
            ['Keynote Travel & Honoraria', 'Speaker Fees', 400000, 360000, 'Direct Reimbursements', ''],
            ['Signage, Lanyards & Programs', 'Marketing', 240000, 225000, 'PrintCraft Swag Co.', ''],
        ];
        foreach ($budget as $bi) {
            $db->execute(
                'INSERT INTO budget_items(item_name, category, estimated_cents, actual_cents, vendor, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$bi[0], $bi[1], $bi[2], $bi[3], $bi[4], $bi[5], $ts - 7000, $ts - 1200]
            );
        }

        $db->execute(
            "INSERT INTO incidents(reporter_name, incident_date, incident_time, location, incident_type, description, severity, actions_taken, witnesses, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', 1, ?, ?)",
            [
                'Amara Osei',
                $todayDay,
                '09:15',
                'West Foyer Espresso Zone',
                'Safety Hazard',
                'Loose extension cord taped across walkway near Booth A-01 creating trip hazard.',
                'High',
                'Placed yellow cable ramp over cord and alerted Facilities & Booth A-01 lead.',
                'Hannah Park',
                $ts - 1600,
                $ts - 1600,
            ]
        );

        $feedbacks = [
            [$firstAttId, 'Elena Rostova', 5, 5, 5, 5, 4, "Lightning-fast VIP check-in and Dr. Nair's keynote was brilliant.", 'Add more charging tables near Studio B.', 'Definitely', 'Yes'],
            [null, 'Marcus Vance', 4, 4, 5, 4, 5, 'Great speaker lineup and clearly labelled vegetarian lunch boxes.', 'Signage to Breakout Room C could be bigger.', 'Definitely', 'Yes'],
            [null, 'Chloe Bennett', 5, 4, 4, 5, 4, 'Super friendly volunteers and smooth registration.', 'Extend networking coffee break by 10 minutes.', 'Probably', 'Yes'],
        ];
        foreach ($feedbacks as $f => $fb) {
            $db->execute(
                'INSERT INTO event_feedback(attendee_id, attendee_name, overall_rating, venue_rating, speakers_rating, organization_rating, food_rating, what_enjoyed, suggestions, would_attend_again, would_recommend, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $fb[0],
                    $fb[1],
                    $fb[2],
                    $fb[3],
                    $fb[4],
                    $fb[5],
                    $fb[6],
                    $fb[7],
                    $fb[8],
                    $fb[9],
                    $fb[10],
                    $ts - (3 - $f) * 1800,
                ]
            );
        }

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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Organization name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Event Command & Operations';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'USD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'America/New_York';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'plum']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $eventTitle = V::text($input['event_title'] ?? null, 'event_title', ['required' => false, 'max' => 140]) ?: ($businessName . ' Summit');
            $eventDate = V::day($input['event_date'] ?? null, 'event_date', ['required' => false, 'fallback' => $todayDay]);
            $eventVenue = V::text($input['event_venue'] ?? null, 'event_venue', ['required' => false, 'max' => 160]) ?: 'Grand Convention Center';
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, event_title = ?, event_date = ?, event_venue = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $eventTitle, $eventDate, $eventVenue, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, event_title, event_date, event_venue, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $eventTitle, $eventDate, $eventVenue, $ts]
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
                self::seedEventSample($db, $todayDay);
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
            $eventTitle = array_key_exists('event_title', $input)
                ? V::text($input['event_title'], 'event_title', ['required' => false, 'max' => 140])
                : (string) ($cur['event_title'] ?? '');
            $eventDate = array_key_exists('event_date', $input)
                ? V::day($input['event_date'], 'event_date', ['required' => false, 'fallback' => (string) ($cur['event_date'] ?? '')])
                : (string) ($cur['event_date'] ?? '');
            $eventVenue = array_key_exists('event_venue', $input)
                ? V::text($input['event_venue'], 'event_venue', ['required' => false, 'max' => 160])
                : (string) ($cur['event_venue'] ?? '');

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, event_title = ?, event_date = ?, event_venue = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, $eventTitle, $eventDate, $eventVenue, V::now()]
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
                HttpException::fail(409, 'setup_required', 'Event Hub is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'coordinator']);
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
                'sampleCount' => self::seedEventSample($db, $todayDay),
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
