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
    private const ROLES = ['owner', 'manager', 'dispatcher', 'cleaner'];
    private const JOIN_ROLES = ['manager', 'dispatcher', 'cleaner'];
    private const PRESETS = ['aqua', 'mint', 'navy', 'citrus'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'clients',
        'cleaning_teams',
        'cleaning_jobs',
        'quality_checks',
        'cleaning_supplies',
        'client_issues',
    ];

    public static function sampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::SAMPLE_TABLES as $t) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$t} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    public static function readCounts(Database $db, string $todayDay): array
    {
        $jobsToday = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(price_cents), 0) AS rev FROM cleaning_jobs WHERE scheduled_date = ? AND status != 'Cancelled'",
            [$todayDay]
        );
        $activeJobs = $db->first(
            "SELECT COUNT(*) AS c FROM cleaning_jobs WHERE scheduled_date = ? AND status IN ('En Route', 'Cleaning')",
            [$todayDay]
        );
        $openIssues = $db->first("SELECT COUNT(*) AS c FROM client_issues WHERE status != 'Resolved'");
        $lowSupplies = $db->first("SELECT COUNT(*) AS c FROM cleaning_supplies WHERE status IN ('Low', 'Out')");
        $overdueClients = $db->first("SELECT COUNT(*) AS c FROM clients WHERE billing_status = 'Overdue'");
        $avgRating = $db->first('SELECT COALESCE(ROUND(AVG(rating), 1), 0) AS r, COUNT(*) AS c FROM quality_checks');

        return [
            'jobsToday' => $jobsToday ? (int) $jobsToday['c'] : 0,
            'todayRevenueCents' => $jobsToday ? (int) $jobsToday['rev'] : 0,
            'activeJobs' => $activeJobs ? (int) $activeJobs['c'] : 0,
            'openIssues' => $openIssues ? (int) $openIssues['c'] : 0,
            'lowSupplies' => $lowSupplies ? (int) $lowSupplies['c'] : 0,
            'overdueClients' => $overdueClients ? (int) $overdueClients['c'] : 0,
            'avgRating' => $avgRating ? (float) $avgRating['r'] : 0,
            'qualityChecksCount' => $avgRating ? (int) $avgRating['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedCleanShiftSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }

        $ts = V::now();

        $cRows = [
            ['Harbourview Dental Studio', 'Commercial', 'practice@harbourviewdental.example', '0412 310 488', 'Suite 4, 88 Alfred St, Milsons Point', 'Rear lane security door code #4821*. Alarm keypad right of reception: 2904# to disarm. Keys return to lockbox B.', 'Up to date', 'Hospital-grade neutral floor cleaner only. Skip sterilisation bay.'],
            ['Claire & David Bennett', 'Residential', 'claire.bennett@example.com', '0421 908 114', '14 Cammeray Rd, Cammeray', 'Side gate latch sticks slightly — lift handle. Lockbox behind jasmine pot: 7391. Friendly Labrador inside.', 'Up to date', 'Use eco citrus spray in nursery. Extra attention to kitchen splashback.'],
            ['Bayside Loft 4B (Short-Stay)', 'Airbnb', 'host@baysideloft.example', '0438 662 900', 'Unit 4B, 22 Esplanade, Manly', 'Building intercom 402# then call host or swipe fob #3. Master key in silver lockbox on railing: 5519.', 'Pending', 'Hotel-fold towels and leave welcome card on dining table.'],
            ['Northshore Creative Agency', 'Office', 'ops@northshorecreative.example', '0409 774 321', 'Level 2, 190 Pacific Hwy, Crows Nest', 'Building access swipe card in Van 1 pouch. Alarm auto-arms at 8pm; PIN 6180. Parking Bay 7 in basement.', 'Up to date', 'Wipe glass boardroom walls and empty recycling crates.'],
            ['Priya Sundaram', 'Residential', 'priya.s@example.com', '0455 210 874', '72 Balmoral Ave, Mosman', 'Front door keypad: 8420#. Spare key under veranda bench. No shoes upstairs.', 'Overdue', 'Fragrance-free products only (asthma).'],
        ];
        $cIds = [];
        foreach ($cRows as $i => $c) {
            $r = $db->execute(
                'INSERT INTO clients(client_name, client_type, email, phone, address, access_instructions, billing_status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$c[0], $c[1], $c[2], $c[3], $c[4], $c[5], $c[6], $c[7], $ts - (5 - $i) * 3600]
            );
            $cIds[] = $r['lastInsertRowid'];
        }

        $tRows = [
            ['Aqua Crew A', 'Tessa Morales', 'Tessa Morales, Samira Haddad, Leo Wu', 'Van 1 · CLN-204', ['North side', 'Inner city'], 'Active'],
            ['Harbour Crew B', 'Devon Brooks', 'Devon Brooks, Mei Lin', 'Van 2 · CLN-318', ['East side', 'Inner city'], 'Active'],
            ['Deep-Clean Squad C', 'Kieran Walsh', 'Kieran Walsh, Sofia Rossi, Benji Cho', 'Van 3 · CLN-509', ['North side', 'West side', 'South side'], 'Active'],
        ];
        $tIds = [];
        foreach ($tRows as $j => $tm) {
            $tr = $db->execute(
                'INSERT INTO cleaning_teams(team_name, lead_cleaner, members, vehicle, service_areas_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$tm[0], $tm[1], $tm[2], $tm[3], json_encode($tm[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tm[5], $ts - (3 - $j) * 3600]
            );
            $tIds[] = $tr['lastInsertRowid'];
        }

        $jRows = [
            [$cIds[0], $tIds[0], 'Office', $todayDay, '07:30', 2.0, 'Complete', 24000, 'Pre-opening clinical reception & bathrooms.'],
            [$cIds[1], $tIds[0], 'Regular clean', $todayDay, '10:00', 2.5, 'Cleaning', 19500, 'Fortnightly 3-bed home clean + linen strip.'],
            [$cIds[2], $tIds[1], 'Airbnb turnover', $todayDay, '10:30', 2.0, 'Inspected', 21000, 'Guest arrives 2:30pm — check balcony glass.'],
            [$cIds[4], $tIds[1], 'Deep clean', $todayDay, '13:30', 3.5, 'En Route', 38500, 'Fragrance-free kit packed on Van 2. Oven + pantry.'],
            [$cIds[3], $tIds[2], 'Office', $todayDay, '16:30', 2.5, 'Scheduled', 29000, 'After-hours boardroom glass & kitchenettes.'],
            [$cIds[1], $tIds[2], 'End-of-lease', V::utcDay(1), '08:30', 5.0, 'Scheduled', 62000, 'Full bond clean including tracks and blinds.'],
        ];
        $jIds = [];
        foreach ($jRows as $k => $jb) {
            $jr = $db->execute(
                'INSERT INTO cleaning_jobs(client_id, team_id, job_type, scheduled_date, start_time, duration_hours, status, price_cents, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$jb[0], $jb[1], $jb[2], $jb[3], $jb[4], $jb[5], $jb[6], $jb[7], $jb[8], $ts - (6 - $k) * 900, $ts - 300]
            );
            $jIds[] = $jr['lastInsertRowid'];
        }

        $db->execute(
            'INSERT INTO quality_checks(job_id, checklist_json, rating, issues_found, follow_up, checked_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $jIds[0],
                json_encode(['Kitchen', 'Bathrooms', 'Floors', 'Windows and glass', 'Dusting', 'Bins and consumables'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                5, '', 'No', 'Tessa Morales', $ts - 2400,
            ]
        );
        $db->execute(
            'INSERT INTO quality_checks(job_id, checklist_json, rating, issues_found, follow_up, checked_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $jIds[2],
                json_encode(['Kitchen', 'Bathrooms', 'Floors', 'Dusting', 'Bins and consumables'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                4, 'Light water marks on balcony sliding door — re-buffed before photo sign-off.', 'No', 'Devon Brooks', $ts - 1200,
            ]
        );

        $supRows = [
            ['Neutral Floor Cleaner (5L)', 'Chemicals', 9, 8, 'bottles', 'CleanPro Wholesale', 'OK'],
            ['Eco Citrus Multi-Surface Spray', 'Chemicals', 3, 10, 'bottles', 'GreenSpark Supplies', 'Low'],
            ['Hospital-Grade Disinfectant', 'Chemicals', 0, 6, 'bottles', 'CleanPro Wholesale', 'Out'],
            ['Colour-Coded Microfibre Cloths', 'Cloths and pads', 14, 12, 'packs', 'Sparkle Direct', 'OK'],
            ['Heavy-Duty Scrub Pads', 'Cloths and pads', 2, 8, 'packs', 'Sparkle Direct', 'Low'],
            ['HEPA Vacuum Bags', 'Equipment', 5, 6, 'boxes', 'VacMaster Commercial', 'Low'],
            ['Nitrile Gloves (Medium)', 'Consumables', 10, 8, 'boxes', 'CleanPro Wholesale', 'OK'],
            ['Biodegradable Bin Liners', 'Consumables', 12, 10, 'packs', 'GreenSpark Supplies', 'OK'],
        ];
        foreach ($supRows as $sp) {
            $db->execute(
                'INSERT INTO cleaning_supplies(supply_item, category, current_stock, reorder_point, unit, supplier, status, is_sample, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$sp[0], $sp[1], $sp[2], $sp[3], $sp[4], $sp[5], $sp[6], $ts - 1800]
            );
        }

        $db->execute(
            'INSERT INTO client_issues(client_id, job_id, issue_type, severity, description, resolution, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$cIds[2], $jIds[2], 'Access issue', 'High', 'Silver lockbox on railing jammed for 15 minutes until host gave backup foyer code.', 'Noted backup foyer code in client card; requesting replacement lockbox.', 'Investigating', $ts - 3600, $ts - 1200]
        );
        $db->execute(
            'INSERT INTO client_issues(client_id, job_id, issue_type, severity, description, resolution, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$cIds[4], $jIds[3], 'Payment issue', 'Medium', "Previous fortnight invoice overdue by 9 days; reminder sent before today's deep clean.", '', 'Open', $ts - 7200, $ts - 7200]
        );
        $db->execute(
            'INSERT INTO client_issues(client_id, job_id, issue_type, severity, description, resolution, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$cIds[1], $jIds[1], 'Missed item', 'Low', 'Laundry glass door fingerprints missed on last visit.', "Added laundry glass check to client notes and completed on today's visit.", 'Resolved', $ts - 86400, $ts - 1800]
        );

        return self::sampleCount($db);
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
                'counts' => self::readCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Residential & Commercial Cleaning';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'aqua']);
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
                self::seedCleanShiftSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => Context::getBusinessSettings($db),
                    'counts' => self::readCounts($db, $todayDay),
                ],
            ];
        }, write: true);
    }

    public function saveSettings(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $cur = Context::getBusinessSettings($db);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
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
            $members = $db->query('SELECT user_id, display_name, role, is_owner, status, created_at FROM team_members ORDER BY is_owner DESC, created_at ASC');
            return ['team' => $members];
        });
    }

    public function requestJoin(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $settings = Context::getBusinessSettings($db);
            if (!$settings || empty($settings['setup_done'])) {
                HttpException::fail(409, 'setup_required', 'This CleanShift workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'cleaner']);
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
            $loaded = self::seedCleanShiftSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = [
                'client_issues',
                'quality_checks',
                'cleaning_jobs',
                'cleaning_supplies',
                'cleaning_teams',
                'clients',
            ];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readCounts($db, $todayDay)];
        }, write: true);
    }
}
