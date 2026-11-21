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
    private const PR_ROLES = ['manager', 'dispatcher', 'walker'];
    private const PR_PRESETS = ['emerald', 'bark', 'meadow', 'berry'];
    private const PR_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['clients', 'pets', 'walkers', 'walks', 'incidents'];
    private const CLEAR_SAMPLE_TABLES = ['incidents', 'walks', 'pets', 'walkers', 'clients'];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'updated_at'] as $intCol) {
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
    public static function readCounts(Database $db, string $todayDay): array
    {
        $walksToday = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(charge_cents), 0) AS rev FROM walks WHERE walk_date = ? AND status != 'Cancelled'",
            [$todayDay]
        );
        $inProg = $db->first(
            "SELECT COUNT(*) AS c FROM walks WHERE walk_date = ? AND status = 'In Progress'",
            [$todayDay]
        );
        $done = $db->first(
            "SELECT COUNT(*) AS c FROM walks WHERE walk_date = ? AND status = 'Completed'",
            [$todayDay]
        );
        $activePets = $db->first("SELECT COUNT(*) AS c FROM pets WHERE active = 'Active'");
        $openIncidents = $db->first("SELECT COUNT(*) AS c FROM incidents WHERE follow_up = 'Yes'");
        $overdueBilling = $db->first("SELECT COUNT(*) AS c FROM clients WHERE billing_status = 'Overdue'");

        return [
            'walksToday' => $walksToday ? (int) $walksToday['c'] : 0,
            'todayRevenueCents' => $walksToday ? (int) $walksToday['rev'] : 0,
            'inProgressWalks' => $inProg ? (int) $inProg['c'] : 0,
            'completedWalks' => $done ? (int) $done['c'] : 0,
            'activePets' => $activePets ? (int) $activePets['c'] : 0,
            'openIncidents' => $openIncidents ? (int) $openIncidents['c'] : 0,
            'overdueBilling' => $overdueBilling ? (int) $overdueBilling['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedPawRouteSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $cRows = [
            [
                'Hannah & Owen Clark',
                'hannah.clark@example.com',
                '0414 290 551',
                '27 Parkside Ave, Balmain',
                'Front gate keypad: 4419#. Spare key in green frog box by porch. Harness hangs on hallway hook.',
                'Owen Clark — 0414 290 552 · Balmain Vet (02) 9810 4400',
                'Text message',
                'Up to date',
                'Send photo at the oval after every walk!',
            ],
            [
                'Dev Patel',
                'dev.patel@example.com',
                '0422 718 904',
                '8 / 112 Glebe Point Rd, Glebe',
                'Buzz unit 8 then unlock deadbolt with key #4 on walker ring. Alarm off code: 6320.',
                'Priya Patel — 0422 718 905 · Inner West Vet (02) 9552 1190',
                'App',
                'Up to date',
                'Please wipe paws with towel by front door on wet days.',
            ],
            [
                'Sophie Lindstrom',
                'sophie.l@example.com',
                '0439 601 238',
                '41 Birchgrove Rd, Birchgrove',
                'Side timber latch opens inward; double-check latch clicks shut! Back sliding door unlocked.',
                'Dr. Chen Vet — (02) 9818 3200',
                'Text message',
                'Pending',
                'Shadow MUST be walked solo away from off-leash parks.',
            ],
            [
                'Ben & Chloe Turner',
                'ben.turner@example.com',
                '0408 441 720',
                '15 Norton St, Leichhardt',
                'Lockbox on brick letterbox: 7082. Cat door stays locked while sitter is inside.',
                'Chloe Turner — 0408 441 721 · Leichhardt Vet (02) 9560 8822',
                'Email',
                'Overdue',
                'Mochi loves chin scratches before dinner.',
            ],
        ];
        $cIds = [];
        foreach ($cRows as $i => $c) {
            $cr = $db->execute(
                'INSERT INTO clients(name, email, phone, address, access_instructions, emergency_contact, preferred_contact, billing_status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$c[0], $c[1], $c[2], $c[3], $c[4], $c[5], $c[6], $c[7], $c[8], $ts - (4 - $i) * 3600]
            );
            $cIds[] = $cr['lastInsertRowid'];
        }

        $pRows = [
            [
                $cIds[0],
                'Biscuit',
                'Dog',
                'Border Collie',
                'Medium',
                ['Dog-friendly', 'Friendly', 'Pulls on lead'],
                'Chicken allergy — lamb or salmon treats only.',
                '1 cup kibble + fresh water top-up after morning walk.',
                '(02) 9810 4400',
                'Active',
            ],
            [
                $cIds[1],
                'Milo',
                'Dog',
                'Golden Retriever',
                'Large',
                ['Dog-friendly', 'Friendly', 'Senior'],
                'Arthritis in back hips — keep pace gentle, no stairs or steep hills. 1 joint chew after walk.',
                '1.5 cups senior kibble in blue bowl + joint chew from pantry jar.',
                '(02) 9552 1190',
                'Active',
            ],
            [
                $cIds[2],
                'Shadow',
                'Dog',
                'Australian Kelpie',
                'Medium',
                ['Reactive', 'Anxious', 'Pulls on lead'],
                'Muzzle-trained (basket muzzle on hook if crowded). Cross street if other dogs approach.',
                'Scatter feed 1/2 cup kibble on snuffle mat after walk to decompress.',
                '(02) 9818 3200',
                'Active',
            ],
            [
                $cIds[3],
                'Mochi',
                'Cat',
                'Ragdoll',
                'Small',
                ['Friendly', 'Nervous'],
                'Indoor cat only! Check front door carefully when entering.',
                'Half pouch wet salmon food + refresh water fountain + scoop litter tray.',
                '(02) 9560 8822',
                'Active',
            ],
            [
                $cIds[0],
                'Ziggy',
                'Dog',
                'Cavoodle',
                'Small',
                ['Friendly', 'Puppy'],
                'Recently vaccinated — avoid puddles and keep on short lead near roads.',
                '1/2 cup puppy biscuits at midday.',
                '(02) 9810 4400',
                'Active',
            ],
        ];
        $pIds = [];
        foreach ($pRows as $j => $p) {
            $pr = $db->execute(
                'INSERT INTO pets(owner_id, name, species, breed, size, temperament_json, medical_notes, feeding_instructions, vet_contact, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$p[0], $p[1], $p[2], $p[3], $p[4], json_encode($p[5], JSON_UNESCAPED_UNICODE), $p[6], $p[7], $p[8], $p[9], $ts - (5 - $j) * 3600]
            );
            $pIds[] = $pr['lastInsertRowid'];
        }

        $wRows = [
            [
                'Maya Gallagher',
                '0417 302 881',
                'maya@pawroute.example',
                'Walker',
                ['Inner city', 'West side'],
                ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'Active',
            ],
            [
                'Ethan Park',
                '0426 914 302',
                'ethan@pawroute.example',
                'Walker',
                ['North side', 'Inner city'],
                ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                'Active',
            ],
            [
                'Lola Morales',
                '0431 558 190',
                'lola@pawroute.example',
                'Sitter',
                ['West side', 'South side'],
                ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                'Active',
            ],
        ];
        $wIds = [];
        foreach ($wRows as $k => $w) {
            $wr = $db->execute(
                'INSERT INTO walkers(name, phone, email, role, service_areas_json, availability_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [
                    $w[0],
                    $w[1],
                    $w[2],
                    $w[3],
                    json_encode($w[4], JSON_UNESCAPED_UNICODE),
                    json_encode($w[5], JSON_UNESCAPED_UNICODE),
                    $w[6],
                    $ts - (3 - $k) * 3600,
                ]
            );
            $wIds[] = $wr['lastInsertRowid'];
        }

        $walkRows = [
            [$pIds[0], $cIds[0], $wIds[0], 'Group Walk', $todayDay, '08:30', '60 minutes', 'Completed', 'Sunny', 'Great recall at Birchgrove Oval, had big drink of water and lamb treat!', 4800],
            [$pIds[2], $cIds[2], $wIds[1], 'Solo Walk', $todayDay, '09:45', '45 minutes', 'In Progress', 'Sunny', 'Quiet back-street decompression loop — calm past 2 cyclists.', 5500],
            [$pIds[1], $cIds[1], $wIds[0], 'Solo Walk', $todayDay, '11:00', '30 minutes', 'Scheduled', 'Overcast', 'Gentle flat foreshore stroll + joint chew afterwards.', 4000],
            [$pIds[4], $cIds[0], $wIds[0], 'Drop-in Visit', $todayDay, '12:30', '30 minutes', 'Scheduled', 'Sunny', 'Midday puppy toilet break, lunch and 10 min tug play.', 3500],
            [$pIds[3], $cIds[3], $wIds[2], 'Pet Sitting', $todayDay, '16:30', '30 minutes', 'Scheduled', 'Overcast', 'Evening dinner, water fountain top-up and litter scoop.', 3800],
        ];
        $walkIds = [];
        foreach ($walkRows as $m => $wk) {
            $wkr = $db->execute(
                'INSERT INTO walks(pet_id, client_id, walker_id, service_type, walk_date, walk_time, duration, status, weather, walk_notes, charge_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$wk[0], $wk[1], $wk[2], $wk[3], $wk[4], $wk[5], $wk[6], $wk[7], $wk[8], $wk[9], $wk[10], $ts - (5 - $m) * 1200, $ts - 300]
            );
            $walkIds[] = $wkr['lastInsertRowid'];
        }

        $db->execute(
            'INSERT INTO incidents(pet_id, walk_id, reported_by_id, incident_type, severity, description, action_taken, follow_up, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $pIds[2],
                $walkIds[1],
                $wIds[1],
                'Aggression',
                'Medium',
                'Off-leash terrier ran up to Shadow near Mort Bay steps; Shadow barked and lunged on lead.',
                'Created distance immediately, used treat scatter to reset calm focus. No contact occurred; notified Sophie.',
                'Yes',
                $ts - 1800,
                $ts - 1800,
            ]
        );
        $db->execute(
            'INSERT INTO incidents(pet_id, walk_id, reported_by_id, incident_type, severity, description, action_taken, follow_up, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $pIds[1],
                $walkIds[2],
                $wIds[0],
                'Owner note',
                'Low',
                "Milo showed mild stiffness in left hind leg getting up after yesterday's rain.",
                'Shortened route to flat foreshore path and reminded Dev to mention at next vet check.',
                'No',
                $ts - 43200,
                $ts - 43200,
            ]
        );

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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Dog Walking & Pet Care Studio';
            $currency = V::oneOf($input['currency'] ?? null, self::PR_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PR_PRESETS, 'brand_preset', ['fallback' => 'emerald']);
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
                self::seedPawRouteSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::readCounts($db, $todayDay),
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::PR_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PR_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

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
                HttpException::fail(409, 'setup_required', 'This PawRoute studio is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::PR_ROLES, 'requested_role', ['fallback' => 'walker']);
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
            $role = V::oneOf($input['role'] ?? null, self::PR_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedPawRouteSample($db, $todayDay);
            return [
                'sampleCount' => $loaded,
                'counts' => self::readCounts($db, $todayDay),
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
                'counts' => self::readCounts($db, $todayDay),
            ];
        }, write: true);
    }
}
