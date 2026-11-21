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
    private const ROLES = ['manager', 'kitchen_lead', 'delivery_driver'];
    private const PRESETS = ['sage', 'champagne', 'plum', 'harbour'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = [
        'clients',
        'menu_packages',
        'catering_jobs',
        'production_tasks',
        'delivery_runs',
        'dietary_requirements',
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

    public static function badgeCounts(Database $db): array
    {
        $activeJobs = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(estimated_value_cents), 0) AS val, COALESCE(SUM(guest_count), 0) AS guests FROM catering_jobs WHERE status != 'Completed'"
        );
        $openTasks = $db->first(
            "SELECT COUNT(*) AS c FROM production_tasks WHERE status IN ('Not started', 'In progress', 'Blocked')"
        );
        $openRuns = $db->first(
            "SELECT COUNT(*) AS c FROM delivery_runs WHERE status IN ('Scheduled', 'Loaded', 'En Route', 'Issue')"
        );
        $pendingDiet = $db->first(
            "SELECT COUNT(*) AS c FROM dietary_requirements WHERE kitchen_confirmed != 'Confirmed'"
        );

        return [
            'activeJobs' => $activeJobs ? (int) $activeJobs['c'] : 0,
            'pipelineValueCents' => $activeJobs ? (int) $activeJobs['val'] : 0,
            'pipelineGuests' => $activeJobs ? (int) $activeJobs['guests'] : 0,
            'openTasks' => $openTasks ? (int) $openTasks['c'] : 0,
            'openRuns' => $openRuns ? (int) $openRuns['c'] : 0,
            'pendingDietary' => $pendingDiet ? (int) $pendingDiet['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedCaterCraftSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }

        $ts = V::now();

        $clientIds = [];
        $clients = [
            ['Hannah Hartley', 'Hartley & Co Events', 'hannah@hartleyevents.example', '0419 402 811', '48 Bridge St, Sydney NSW', 'Wedding planner — prefers linen table setups'],
            ['David Cho', 'Meridian Architecture', 'd.cho@meridianarch.example', '0404 712 309', 'Level 14, 180 George St, Sydney', 'Monthly board lunches; 14-day invoice terms'],
            ['Priya Sundaram', 'Botanic Gardens Trust', 'psundaram@botanictrust.example', '0428 990 112', 'Mrs Macquaries Rd, Sydney', 'Outdoor marquee functions; strict allergen signage'],
            ['Tom Gallagher', 'Harbourside Grammar', 'tgallagher@harbourside.edu.example', '0411 603 552', '12 Bayview Ave, Mosman', 'Speech night & parent cocktail evenings'],
        ];
        $clientCount = count($clients);
        foreach ($clients as $i => $c) {
            $ci = $db->execute(
                'INSERT INTO clients(client_name, organisation, email, phone, billing_address, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
                [$c[0], $c[1], $c[2], $c[3], $c[4], $c[5], $ts - ($clientCount - $i) * 60]
            );
            $clientIds[$c[0]] = $ci['lastInsertRowid'];
        }

        $pkgIds = [];
        $pkgs = [
            ['Executive Boardroom Lunch', 'Lunch', 4200, 12, ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Nut-free'], 'Artisan focaccia platters, warm grain salads, roasted heirloom veg, petit fours.', 'Active'],
            ['Harvest Grazing Table', 'Grazing', 5400, 25, ['Vegetarian', 'Gluten-free', 'Halal'], 'Styled 2m grazing runner with local cheeses, charcuterie, dips, seasonal fruit and lavosh.', 'Active'],
            ['Three-Course Plated Banquet', 'Dinner', 9800, 30, ['Vegan', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal', 'Kosher'], 'Plated entree, alternate-drop main with sides, and patisserie dessert with waitstaff.', 'Active'],
            ['Artisan Morning Tea & Espresso', 'Breakfast', 2600, 15, ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free'], 'Warm pastries, seasonal fruit skewers, yoghurt chia pots and batch-brewed coffee flasks.', 'Active'],
            ['Canapés & Champagne Service', 'Drinks', 6200, 20, ['Vegan', 'Gluten-free', 'Nut-free'], '8 roving canapés per guest plus sparkling, wine and botanical mocktail bar.', 'Seasonal'],
        ];
        $pkgCount = count($pkgs);
        foreach ($pkgs as $p => $pk) {
            $pi = $db->execute(
                'INSERT INTO menu_packages(package_name, category, price_per_person_cents, min_guests, dietary_support_json, description, active_status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $pk[0],
                    $pk[1],
                    $pk[2],
                    $pk[3],
                    json_encode($pk[4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $pk[5],
                    $pk[6],
                    $ts - ($pkgCount - $p) * 60,
                ]
            );
            $pkgIds[$pk[0]] = $pi['lastInsertRowid'];
        }

        $dayPlus1 = V::utcDay(1);
        $dayPlus3 = V::utcDay(3);
        $dayPlus6 = V::utcDay(6);
        $dayPlus10 = V::utcDay(10);

        $jobIds = [];
        $jobs = [
            ['EV-201', $clientIds['David Cho'], 'David Cho', 'Meridian Architecture', $pkgIds['Executive Boardroom Lunch'], 'Executive Boardroom Lunch', 4200, 'Meridian Quarterly Strategy Lunch', $todayDay, '11:45', 36, 'Drop-off', 'Level 14, 180 George St, Sydney', 'In Prep', 36 * 4200, 'Loading dock access via Pitt St'],
            ['EV-202', $clientIds['Priya Sundaram'], 'Priya Sundaram', 'Botanic Gardens Trust', $pkgIds['Harvest Grazing Table'], 'Harvest Grazing Table', 5400, 'Spring Pavilion Donor Reception', $dayPlus1, '16:30', 65, 'Grazing table', 'Calyx Pavilion, Royal Botanic Garden', 'Confirmed', 65 * 5400, 'Set up 90 mins prior; biodegradable napkins'],
            ['EV-203', $clientIds['Hannah Hartley'], 'Hannah Hartley', 'Hartley & Co Events', $pkgIds['Three-Course Plated Banquet'], 'Three-Course Plated Banquet', 9800, 'Hartley-Vance Wedding Reception', $dayPlus3, '18:00', 110, 'Plated', 'Carriageworks Bay 20, Eveleigh', 'Confirmed', 110 * 9800, 'Tasting approved; bridal table GF & Vegan'],
            ['EV-204', $clientIds['Tom Gallagher'], 'Tom Gallagher', 'Harbourside Grammar', $pkgIds['Canapés & Champagne Service'], 'Canapés & Champagne Service', 6200, 'Harbourside Alumni Evening', $dayPlus6, '17:30', 85, 'Staffed buffet', '12 Bayview Ave, Mosman', 'Quoted', 85 * 6200, 'Awaiting headmaster sign-off'],
            ['EV-205', $clientIds['David Cho'], 'David Cho', 'Meridian Architecture', $pkgIds['Artisan Morning Tea & Espresso'], 'Artisan Morning Tea & Espresso', 2600, 'Design Studio Client Workshop', $dayPlus10, '08:45', 24, 'Drop-off', 'Level 14, 180 George St, Sydney', 'Enquiry', 24 * 2600, 'Asking about extra vegan pastries'],
        ];
        $jobCount = count($jobs);
        foreach ($jobs as $j => $jb) {
            $ji = $db->execute(
                'INSERT INTO catering_jobs(job_number, client_id, client_name, organisation, package_id, package_name, price_per_person_cents, event_name, event_date, delivery_time, guest_count, service_type, venue_address, status, estimated_value_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$jb[0], $jb[1], $jb[2], $jb[3], $jb[4], $jb[5], $jb[6], $jb[7], $jb[8], $jb[9], $jb[10], $jb[11], $jb[12], $jb[13], $jb[14], $jb[15], $ts - ($jobCount - $j) * 180]
            );
            $jobIds[$jb[0]] = $ji['lastInsertRowid'];
        }

        $tasks = [
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Roast harissa pumpkin & spiced chicken trays', 'Hot Kitchen', $todayDay, '10:15', 'Chef Amir', 'In progress', 'Keep 6 portions separate for Vegan/GF'],
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Assemble 36 artisan focaccia platters & labels', 'Cold Larder', $todayDay, '10:30', 'Elena', 'Done', 'Allergen flags attached'],
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Plate citrus tartlets & gluten-free brownies', 'Pastry', $todayDay, '10:30', 'Sora', 'Done', ''],
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Pack insulated hot boxes, tongs & napkins', 'Packing', $todayDay, '11:00', 'Liam', 'Not started', 'Check dock permit'],
            [$jobIds['EV-202'], 'Spring Pavilion Donor Reception', $dayPlus1, 'Prep seasonal dips, marinated olives & crudités', 'Cold Larder', $dayPlus1, '13:00', 'Elena', 'Not started', '65 guests'],
            [$jobIds['EV-203'], 'Hartley-Vance Wedding Reception', $dayPlus3, 'Bake 140 sourdough dinner rolls & GF rolls', 'Pastry', $dayPlus3, '12:00', 'Sora', 'Not started', 'Separate oven deck for GF'],
        ];
        foreach ($tasks as $tk) {
            $db->execute(
                'INSERT INTO production_tasks(job_id, event_name, event_date, task, station, due_date, due_time, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$tk[0], $tk[1], $tk[2], $tk[3], $tk[4], $tk[5], $tk[6], $tk[7], $tk[8], $tk[9], $ts]
            );
        }

        $runs = [
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Level 14, 180 George St, Sydney', 'Benny Zhao', 'Van 1 (Chilled Sprinter)', '11:10', '11:45', 'Loaded', 'Ask concierge for service lift key; David Cho signs'],
            [$jobIds['EV-202'], 'Spring Pavilion Donor Reception', $dayPlus1, 'Calyx Pavilion, Royal Botanic Garden', 'Aisha Farah', 'Van 2 (Grazing Rig)', '14:45', '15:15', 'Scheduled', 'Gate C security code #4491; bring grazing risers'],
            [$jobIds['EV-203'], 'Hartley-Vance Wedding Reception', $dayPlus3, 'Carriageworks Bay 20, Eveleigh', 'Benny Zhao', 'Truck 1 (Banquet Box)', '15:30', '16:15', 'Scheduled', 'Confirm kitchen power hookup with venue manager'],
        ];
        foreach ($runs as $rn) {
            $db->execute(
                'INSERT INTO delivery_runs(job_id, event_name, event_date, venue_address, driver, vehicle, pickup_time, delivery_time, status, delivery_notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$rn[0], $rn[1], $rn[2], $rn[3], $rn[4], $rn[5], $rn[6], $rn[7], $rn[8], $rn[9], $ts]
            );
        }

        $diets = [
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Vegan', 4, 'Individually boxed lunches', 'Confirmed', 'Chef Amir'],
            [$jobIds['EV-201'], 'Meridian Quarterly Strategy Lunch', $todayDay, 'Gluten-free', 2, 'Coeliac — sealed foil container', 'Confirmed', 'Chef Amir'],
            [$jobIds['EV-202'], 'Spring Pavilion Donor Reception', $dayPlus1, 'Nut-free', 3, 'Severe anaphylaxis — keep entire grazing table tree-nut free', 'Pending', ''],
            [$jobIds['EV-202'], 'Spring Pavilion Donor Reception', $dayPlus1, 'Halal', 6, 'Certified Halal charcuterie platter separated', 'Pending', ''],
            [$jobIds['EV-203'], 'Hartley-Vance Wedding Reception', $dayPlus3, 'Vegan', 8, 'Mushroom Wellington main + dark choc mousse', 'Confirmed', 'Chef Amir'],
            [$jobIds['EV-203'], 'Hartley-Vance Wedding Reception', $dayPlus3, 'Gluten-free', 5, "Table 1 (Bride's aunt) + Table 4", 'Pending', ''],
            [$jobIds['EV-203'], 'Hartley-Vance Wedding Reception', $dayPlus3, 'Kosher', 2, 'Sealed Kosher vendor meals heated separately', 'Pending', ''],
        ];
        foreach ($diets as $dt) {
            $db->execute(
                'INSERT INTO dietary_requirements(job_id, event_name, event_date, requirement_type, guest_count, notes, kitchen_confirmed, confirmed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$dt[0], $dt[1], $dt[2], $dt[3], $dt[4], $dt[5], $dt[6], $dt[7], $ts]
            );
        }

        $db->execute('UPDATE business_settings SET job_seq = 205 WHERE id = 1 AND job_seq < 205');
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Bespoke Event & Corporate Catering';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'sage']);
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
                self::seedCaterCraftSample($db, $todayDay);
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
                HttpException::fail(409, 'setup_required', 'This catering workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::ROLES, 'requested_role', ['fallback' => 'kitchen_lead']);
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
            $role = V::oneOf($input['role'] ?? null, self::ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedCaterCraftSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::badgeCounts($db)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireManagerAccess($db, $me);
            $tables = [
                'dietary_requirements',
                'delivery_runs',
                'production_tasks',
                'catering_jobs',
                'menu_packages',
                'clients',
            ];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            return ['sampleCount' => 0, 'counts' => self::badgeCounts($db)];
        }, write: true);
    }
}
