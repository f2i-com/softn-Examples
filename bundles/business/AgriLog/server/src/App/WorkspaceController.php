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
    private const PRESETS = ['forest', 'ochre', 'soil', 'river'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const JOIN_ROLES = ['manager', 'farm_hand', 'agronomist'];
    private const SAMPLE_TABLES = [
        'paddocks',
        'farm_jobs',
        'harvest_logs',
        'chemical_applications',
        'machinery',
        'maintenance_logs',
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

    public static function readFarmCounts(Database $db, string $todayDay): array
    {
        $paddocks = $db->first('SELECT COUNT(*) AS c, COALESCE(SUM(area_ha), 0) AS ha FROM paddocks');
        $openJobs = $db->first("SELECT COUNT(*) AS c FROM farm_jobs WHERE status IN ('Planned', 'In progress')");
        $whpLocked = $db->first(
            "SELECT COUNT(DISTINCT paddock_id) AS c FROM chemical_applications WHERE whp_end >= ? AND whp_end != ''",
            [$todayDay]
        );
        $serviceDue = $db->first(
            "SELECT COUNT(*) AS c FROM machinery WHERE status = 'Due for service' OR (service_due != '' AND service_due <= ? AND status != 'Retired')",
            [$todayDay]
        );

        return [
            'paddocks' => $paddocks ? (int) $paddocks['c'] : 0,
            'totalHa' => $paddocks ? round((float) $paddocks['ha'] * 10.0) / 10.0 : 0.0,
            'openJobs' => $openJobs ? (int) $openJobs['c'] : 0,
            'whpLocked' => $whpLocked ? (int) $whpLocked['c'] : 0,
            'serviceDue' => $serviceDue ? (int) $serviceDue['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedFarmSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }

        $ts = V::now();
        $p1 = $db->execute(
            'INSERT INTO paddocks(block_name, crop, area_ha, soil_notes, irrigation, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['North Creek Block', 'Shiraz Grapes', 6.4, 'Red loam, well drained, pH 6.5', 'Drip', 'In crop', $ts - 86400]
        );
        $p2 = $db->execute(
            'INSERT INTO paddocks(block_name, crop, area_ha, soil_notes, irrigation, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['River Flat 2', 'Sweet Corn', 11.2, 'Alluvial silt, high moisture retention', 'Sprinkler', 'In crop', $ts - 72000]
        );
        $p3 = $db->execute(
            'INSERT INTO paddocks(block_name, crop, area_ha, soil_notes, irrigation, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Hilltop Orchard', 'Pink Lady Apples', 4.8, 'Clay loam, windbreak on west fence', 'Drip', 'In crop', $ts - 60000]
        );
        $p4 = $db->execute(
            'INSERT INTO paddocks(block_name, crop, area_ha, soil_notes, irrigation, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['South Ridge', 'Cover Oats', 14.0, 'Resting block, lime applied autumn', 'Dryland', 'Fallow', $ts - 50000]
        );

        $futureWhp = V::utcDay(9);
        $pastWhp = V::utcDay(-5);

        $db->execute(
            'INSERT INTO chemical_applications(paddock_id, product_used, rate, application_date, operator, weather, whp_end, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $p1['lastInsertRowid'],
                'Copper Oxychloride Fungicide',
                '2.5 kg/ha',
                V::utcDay(-2),
                'Tom Gallagher',
                '18C, light SE breeze 6 km/h, dry',
                $futureWhp,
                'Preventative downy mildew spray — observe 11-day WHP',
                $ts - 172800,
            ]
        );
        $db->execute(
            'INSERT INTO chemical_applications(paddock_id, product_used, rate, application_date, operator, weather, whp_end, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $p2['lastInsertRowid'],
                'Liquid Kelp + Trace Foliar',
                '4 L/ha',
                V::utcDay(-12),
                'Claire Dawson',
                '21C, calm morning',
                $pastWhp,
                'Pre-tassel nutrition boost',
                $ts - 1036800,
            ]
        );

        $db->execute(
            "INSERT INTO farm_jobs(paddock_id, job_type, scheduled_date, completed_date, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, '', ?, ?, ?, 1, ?)",
            [$p2['lastInsertRowid'], 'Harvest', $todayDay, 'Tom Gallagher', 'In progress', 'First pick of sweet corn for market crate order', $ts - 7200]
        );
        $db->execute(
            "INSERT INTO farm_jobs(paddock_id, job_type, scheduled_date, completed_date, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, '', ?, ?, ?, 1, ?)",
            [$p3['lastInsertRowid'], 'Irrigation', $todayDay, 'Claire Dawson', 'Planned', 'Check drip line pressure on rows 14-22', $ts - 3600]
        );
        $db->execute(
            "INSERT INTO farm_jobs(paddock_id, job_type, scheduled_date, completed_date, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, '', ?, ?, ?, 1, ?)",
            [$p4['lastInsertRowid'], 'Planting', V::utcDay(3), 'Tom Gallagher', 'Planned', 'Direct drill winter cover mix after rain', $ts - 1800]
        );
        $db->execute(
            'INSERT INTO farm_jobs(paddock_id, job_type, scheduled_date, completed_date, assigned_to, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$p1['lastInsertRowid'], 'Spraying', V::utcDay(-2), V::utcDay(-2), 'Tom Gallagher', 'Done', 'Completed copper spray before wind picked up', $ts - 170000]
        );

        $db->execute(
            'INSERT INTO harvest_logs(paddock_id, harvest_date, crop, quantity, unit, grade, buyer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$p2['lastInsertRowid'], V::utcDay(-1), 'Sweet Corn', 4.6, 'Tonnes', 'Premium', 'FreshCo Regional Market', 'High brix, clean husks', $ts - 86400]
        );
        $db->execute(
            'INSERT INTO harvest_logs(paddock_id, harvest_date, crop, quantity, unit, grade, buyer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$p3['lastInsertRowid'], V::utcDay(-3), 'Pink Lady Apples', 18, 'Bins', 'Grade 1', 'Valley Fruit Packers', 'Coldroom #2', $ts - 259200]
        );

        $m1 = $db->execute(
            'INSERT INTO machinery(machine_name, machine_type, service_due, hours, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Kubota M7060 Tractor', 'Tractor', V::utcDay(-2), 1485, 'Due for service', '1500 hr oil & hydraulic filter due', $ts - 86400]
        );
        $m2 = $db->execute(
            'INSERT INTO machinery(machine_name, machine_type, service_due, hours, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Silvan 600L Airblast Sprayer', 'Sprayer', V::utcDay(45), 410, 'Running', 'Nozzles calibrated Nov', $ts - 86400]
        );
        $db->execute(
            'INSERT INTO machinery(machine_name, machine_type, service_due, hours, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Bore Pump #2 (River)', 'Pump', V::utcDay(15), 2240, 'Running', 'Pressure gauge replaced last month', $ts - 86400]
        );

        $db->execute(
            'INSERT INTO maintenance_logs(machine_id, log_date, maintenance_type, cost_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            [$m2['lastInsertRowid'], V::utcDay(-14), 'Scheduled service', 38500, 'Replaced diaphragm seals and checked boom pressure', $ts - 1209600]
        );
        $db->execute(
            'INSERT INTO maintenance_logs(machine_id, log_date, maintenance_type, cost_cents, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
            [$m1['lastInsertRowid'], V::utcDay(-60), 'Tyres or tracks', 62000, 'Front right tyre puncture repair and balance', $ts - 5184000]
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
                'counts' => self::readFarmCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Farm name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Paddocks, Harvest & Compliance';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'forest']);
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
                self::seedFarmSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => Context::getBusinessSettings($db),
                    'counts' => self::readFarmCounts($db, $todayDay),
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
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
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
                HttpException::fail(409, 'setup_required', 'Farm workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'farm_hand']);
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
                HttpException::fail(404, 'not_found', 'Member not found.');
            }
            if (!empty($target['is_owner'])) {
                HttpException::fail(403, 'cannot_edit_owner', 'Owner cannot be modified.');
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
                HttpException::fail(404, 'not_found', 'Member not found.');
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
            $loaded = self::seedFarmSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readFarmCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $tables = [
                'maintenance_logs',
                'chemical_applications',
                'harvest_logs',
                'farm_jobs',
                'machinery',
                'paddocks',
            ];
            foreach ($tables as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readFarmCounts($db, $todayDay)];
        }, write: true);
    }
}
