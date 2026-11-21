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
    private const JOIN_ROLES = ['manager', 'dispatch', 'technician'];
    private const PRESETS = ['trade-blue', 'copper-pipe', 'steel-charcoal', 'safety-teal'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['customers', 'jobs', 'site_visits', 'parts_requests', 'invoices'];
    private const CLEAR_SAMPLE_TABLES = ['invoices', 'parts_requests', 'site_visits', 'jobs', 'customers'];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'hourly_rate_cents', 'callout_fee_cents', 'job_seq', 'invoice_seq', 'updated_at'] as $intCol) {
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
        $activeJobs = $db->first("SELECT COUNT(*) AS c FROM jobs WHERE status NOT IN ('Completed', 'Invoiced')");
        $emergencyJobs = $db->first("SELECT COUNT(*) AS c FROM jobs WHERE priority = 'Emergency' AND status NOT IN ('Completed', 'Invoiced')");
        $todayJobs = $db->first("SELECT COUNT(*) AS c FROM jobs WHERE scheduled_date = ? AND status != 'Invoiced'", [$todayDay]);
        $pendingParts = $db->first("SELECT COUNT(*) AS c FROM parts_requests WHERE status IN ('Requested', 'Ordered')");
        $unpaidInv = $db->first("SELECT COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS s FROM invoices WHERE status IN ('Draft', 'Sent', 'Overdue')");
        $followUps = $db->first('SELECT COUNT(*) AS c FROM site_visits WHERE follow_up_required = 1');

        return [
            'activeJobs' => $activeJobs ? (int) $activeJobs['c'] : 0,
            'emergencyJobs' => $emergencyJobs ? (int) $emergencyJobs['c'] : 0,
            'todayJobs' => $todayJobs ? (int) $todayJobs['c'] : 0,
            'pendingParts' => $pendingParts ? (int) $pendingParts['c'] : 0,
            'unpaidInvoices' => $unpaidInv ? (int) $unpaidInv['c'] : 0,
            'unpaidCents' => $unpaidInv ? (int) $unpaidInv['s'] : 0,
            'followUps' => $followUps ? (int) $followUps['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedPlumbingSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $c1 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Claire Henderson', '0412 883 410', 'claire.h@example.com', '42 Banksia Ave, Miranda NSW 2228', 'Residential', 'Side gate latch on left; friendly kelpie in backyard.', $ts - 90000]
        )['lastInsertRowid'];
        $c2 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Harbourview Strata SP44102', '02 9540 2210', 'strata@harbourview.example.com', '18 Pacific Parade, Cronulla NSW 2230', 'Strata / Body Corporate', 'Basement plant room key in lockbox #4821 by lift.', $ts - 86000]
        )['lastInsertRowid'];
        $c3 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Bayside Bistro & Grill', '02 9525 7780', 'ops@baysidebistro.example.com', '91 Kingsway, Caringbah NSW 2229', 'Commercial', 'Rear service lane entry before 11am; ask for Chef Marco.', $ts - 82000]
        )['lastInsertRowid'];
        $c4 = $db->execute(
            'INSERT INTO customers(name, phone, email, address, customer_type, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, 1, ?)',
            ['Southern Cross Property Mgmt', '02 9521 6600', 'repairs@scpm.example.com', '7/14 President Ave, Sutherland NSW 2232', 'Property Manager', 'Tenant pre-approval cap $500; invoice agency directly.', $ts - 78000]
        )['lastInsertRowid'];

        $j1 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1001', $c1, 'Emergency Call-out', 'En Route', 'Emergency', $todayDay, '08:30', 'Liam Cooper', '42 Banksia Ave, Miranda NSW 2228', 'Burst copper hot-water feed line under kitchen sink; main shutoff closed.', 48000, $ts - 7200, $ts - 1800]
        )['lastInsertRowid'];
        $j2 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1002', $c2, 'Installation', 'On Site', 'High', $todayDay, '09:00', 'Tessa Grant', '18 Pacific Parade, Cronulla NSW 2230', 'Replace leaking 315L Rheem commercial hot water booster valve and PTR.', 115000, $ts - 14400, $ts - 1200]
        )['lastInsertRowid'];
        $j3 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1003', $c3, 'Maintenance', 'Awaiting Parts', 'High', $todayDay, '10:30', 'Noah Patel', '91 Kingsway, Caringbah NSW 2229', 'Commercial kitchen pre-rinse spray arm leaking & grease trap pump float switch worn.', 69000, $ts - 36000, $ts - 3600]
        )['lastInsertRowid'];
        $j4 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1004', $c4, 'Repair', 'Scheduled', 'Normal', $todayDay, '13:30', 'Liam Cooper', 'Unit 4, 14 President Ave, Sutherland NSW 2232', 'Running dual-flush toilet cistern and dripping laundry tap spindles.', 32000, $ts - 28000, $ts - 28000]
        )['lastInsertRowid'];
        $j5 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1005', $c1, 'Repair', 'Completed', 'Normal', V::utcDay(-1), '14:00', 'Tessa Grant', '42 Banksia Ave, Miranda NSW 2228', 'High-pressure jet blast blocked stormwater drain near driveway pit.', 42000, $ts - 95000, $ts - 42000]
        )['lastInsertRowid'];
        $j6 = $db->execute(
            'INSERT INTO jobs(job_number, customer_id, job_type, status, priority, scheduled_date, scheduled_time, assigned_tech, site_address, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['JOB-1006', $c2, 'Maintenance', 'Invoiced', 'Normal', V::utcDay(-3), '08:00', 'Noah Patel', '18 Pacific Parade, Cronulla NSW 2230', 'Annual TMV and RPZ backflow prevention device certification (3 valves).', 59000, $ts - 260000, $ts - 180000]
        )['lastInsertRowid'];

        // Site visits
        $db->execute(
            'INSERT INTO site_visits(job_id, technician_name, visit_date, hours_on_site, work_performed, materials_used, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$j2, 'Tessa Grant', $todayDay, 2.5, 'Isolated basement riser, drained 315L tank, removed seized tempering and PTR valves.', '1x 20mm Brass Isolation Valve, PTFE tape', 0, $ts - 2400]
        );
        $db->execute(
            'INSERT INTO site_visits(job_id, technician_name, visit_date, hours_on_site, work_performed, materials_used, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$j3, 'Noah Patel', V::utcDay(-1), 1.5, 'Diagnosed failed float switch on grease trap pump; isolated pre-rinse hose leak. Ordered OEM parts.', 'Temporary 15mm cap', 1, $ts - 40000]
        );
        $db->execute(
            'INSERT INTO site_visits(job_id, technician_name, visit_date, hours_on_site, work_performed, materials_used, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$j5, 'Tessa Grant', V::utcDay(-1), 2.0, 'Cleared tree-root blockage 14m down stormwater run with hydro-jetter and verified flow with CCTV.', '1x 100mm PVC inspection cap', 0, $ts - 43000]
        );
        $db->execute(
            'INSERT INTO site_visits(job_id, technician_name, visit_date, hours_on_site, work_performed, materials_used, follow_up_required, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$j6, 'Noah Patel', V::utcDay(-3), 3.0, 'Tested and certified 3 RPZ backflow devices; replaced worn check seal kit on Valve #2; lodged council test certs.', '1x 25mm RPZ rubber seal kit', 0, $ts - 185000]
        );

        // Parts requests
        $db->execute(
            'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$j3, 'Commercial Grease Trap Float Switch 240V', 1, 'Reece Plumbing Miranda', 14800, 'Ordered', 'ETA 11:00am trade counter', $ts - 35000, $ts - 12000]
        );
        $db->execute(
            'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$j3, 'Heavy-Duty Pre-Rinse Flex Hose & Trigger', 1, 'Tradelink Caringbah', 18500, 'Requested', 'Check 1/2 BSP thread', $ts - 34000, $ts - 34000]
        );
        $db->execute(
            'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$j2, '20mm Commercial PTR Relief Valve 850kPa', 1, 'Reece Plumbing Miranda', 9200, 'Received', "In Tessa's van", $ts - 14000, $ts - 5000]
        );
        $db->execute(
            'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$j5, '100mm PVC Inspection Opening Cap & Seal', 1, 'Reece Plumbing Miranda', 2800, 'Fitted', 'Installed at driveway pit', $ts - 45000, $ts - 42000]
        );
        $db->execute(
            'INSERT INTO parts_requests(job_id, item, quantity, supplier, unit_cost_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [$j6, '25mm RPZ Check Valve Seal Kit', 1, 'PlumbTec Supply', 11500, 'Fitted', 'Valve #2 plant room', $ts - 190000, $ts - 184000]
        );

        // Sample Invoice for JOB-1006
        $db->execute(
            'INSERT INTO invoices(invoice_number, job_id, customer_id, issue_date, due_date, labour_hours, hourly_rate_cents, labour_cents, parts_cents, subtotal_cents, tax_rate, tax_cents, total_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            ['INV-1001', $j6, $c2, V::utcDay(-3), V::utcDay(11), 3.0, 12500, 37500, 11500, 49000, 10, 4900, 53900, 'Sent', 'Includes council backflow test certificate lodgement.', $ts - 180000, $ts - 180000]
        );

        $db->execute('UPDATE business_settings SET job_seq = 1006 WHERE id = 1 AND job_seq < 1006');
        $db->execute('UPDATE business_settings SET invoice_seq = 1001 WHERE id = 1 AND invoice_seq < 1001');
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Plumbing & Field Service';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'trade-blue']);
            $hourlyRateCents = V::moneyCents($input['hourly_rate'] ?? null, 'hourly_rate', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => 12500, 'label' => 'Hourly labour rate']);
            $calloutFeeCents = V::moneyCents($input['callout_fee'] ?? null, 'callout_fee', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => 8500, 'label' => 'Call-out fee']);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, hourly_rate_cents = ?, callout_fee_cents = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $hourlyRateCents, $calloutFeeCents, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, hourly_rate_cents, callout_fee_cents, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $hourlyRateCents, $calloutFeeCents, $ts]
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
                self::seedPlumbingSample($db, $todayDay);
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

            $businessName = array_key_exists('business_name', $input)
                ? V::text($input['business_name'], 'business_name', ['max' => 120, 'label' => 'Business name'])
                : (string) $cur['business_name'];
            $tagline = array_key_exists('tagline', $input)
                ? V::text($input['tagline'], 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline'])
                : (string) $cur['tagline'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone'])
                : (string) $cur['phone'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $address = array_key_exists('address', $input)
                ? V::text($input['address'], 'address', ['required' => false, 'max' => 240, 'label' => 'Address'])
                : (string) $cur['address'];
            $taxId = array_key_exists('tax_id', $input)
                ? V::text($input['tax_id'], 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID'])
                : (string) $cur['tax_id'];
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);
            $hourlyRateCents = array_key_exists('hourly_rate', $input)
                ? V::moneyCents($input['hourly_rate'], 'hourly_rate', ['min' => 0, 'max' => 500000, 'label' => 'Hourly labour rate'])
                : (int) $cur['hourly_rate_cents'];
            $calloutFeeCents = array_key_exists('callout_fee', $input)
                ? V::moneyCents($input['callout_fee'], 'callout_fee', ['min' => 0, 'max' => 500000, 'label' => 'Call-out fee'])
                : (int) $cur['callout_fee_cents'];

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, hourly_rate_cents = ?, callout_fee_cents = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, $hourlyRateCents, $calloutFeeCents, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This field service workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'technician']);
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
            $loaded = self::seedPlumbingSample($db, $todayDay);
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
