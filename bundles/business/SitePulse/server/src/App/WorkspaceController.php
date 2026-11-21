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
    private const JOIN_ROLES = ['manager', 'supervisor', 'subcontractor'];
    private const PRESETS = ['hi-vis-amber', 'blueprint-blue', 'concrete-slate', 'timber-rust'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['projects', 'site_diaries', 'defects', 'variations', 'deliveries', 'subcontractors'];
    private const CLEAR_SAMPLE_TABLES = ['deliveries', 'variations', 'defects', 'site_diaries', 'subcontractors', 'projects'];

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

    /** Parse YYYY-MM-DD into [year, month, day] or null if invalid. */
    private static function parseIsoDay(?string $day): ?array
    {
        if ($day === null || $day === '') {
            return null;
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($day), $m)) {
            return null;
        }
        return [(int) $m[1], (int) $m[2], (int) $m[3]];
    }

    public static function isoDayDiff(?string $fromDay, ?string $toDay): ?int
    {
        $a = self::parseIsoDay($fromDay);
        $b = self::parseIsoDay($toDay);
        if ($a === null || $b === null) {
            return null;
        }
        return self::daysFromCivil($b[0], $b[1], $b[2]) - self::daysFromCivil($a[0], $a[1], $a[2]);
    }

    public static function addIsoDays(string $baseDay, int $delta): string
    {
        $p = self::parseIsoDay($baseDay);
        if ($p === null) {
            return V::utcDay($delta);
        }
        return self::civilFromDays(self::daysFromCivil($p[0], $p[1], $p[2]) + $delta);
    }

    /** @return array{daysToExpiry: ?int, insuranceState: string} */
    public static function computeInsuranceMeta(?string $expiryDay, string $refDay): array
    {
        if ($expiryDay === null || $expiryDay === '') {
            return ['daysToExpiry' => null, 'insuranceState' => 'none'];
        }
        $diff = self::isoDayDiff($refDay, $expiryDay);
        if ($diff === null) {
            return ['daysToExpiry' => null, 'insuranceState' => 'none'];
        }
        if ($diff < 0) {
            return ['daysToExpiry' => $diff, 'insuranceState' => 'expired'];
        }
        if ($diff <= 30) {
            return ['daysToExpiry' => $diff, 'insuranceState' => 'expiring_soon'];
        }
        return ['daysToExpiry' => $diff, 'insuranceState' => 'valid'];
    }

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'defect_seq', 'var_seq', 'updated_at'] as $intCol) {
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

    /** @return array<string, mixed> */
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $activeProj = $db->first("SELECT COUNT(*) AS c FROM projects WHERE status = 'Active'");
        $headcount = $db->first(
            'SELECT COALESCE(SUM(workers_on_site), 0) AS s FROM site_diaries WHERE diary_date = ?',
            [$todayDay]
        );
        $openDef = $db->first("SELECT COUNT(*) AS c FROM defects WHERE status IN ('Open', 'In Progress')");
        $pendVar = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(estimated_cost_cents), 0) AS s FROM variations WHERE status = 'Pending'"
        );
        $delivIssues = $db->first('SELECT COUNT(*) AS c FROM deliveries WHERE has_issue = 1');

        $subbies = $db->query('SELECT insurance_expiry FROM subcontractors');
        $expiredIns = 0;
        $expiringIns = 0;
        foreach ($subbies as $sub) {
            $m = self::computeInsuranceMeta(isset($sub['insurance_expiry']) ? (string) $sub['insurance_expiry'] : '', $todayDay);
            if ($m['insuranceState'] === 'expired') {
                $expiredIns++;
            } elseif ($m['insuranceState'] === 'expiring_soon') {
                $expiringIns++;
            }
        }

        return [
            'activeProjects' => $activeProj ? (int) $activeProj['c'] : 0,
            'headcountToday' => $headcount ? (int) $headcount['s'] : 0,
            'openDefects' => $openDef ? (int) $openDef['c'] : 0,
            'pendingVariations' => $pendVar ? (int) $pendVar['c'] : 0,
            'pendingVariationCents' => $pendVar ? (int) $pendVar['s'] : 0,
            'deliveryIssues' => $delivIssues ? (int) $delivIssues['c'] : 0,
            'expiredInsurances' => $expiredIns,
            'expiringInsurances' => $expiringIns,
            'insuranceAlerts' => $expiredIns + $expiringIns,
            'todayDay' => $todayDay,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedSitePulseSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $p1 = $db->execute(
            'INSERT INTO projects(project_name, client, site_address, start_date, target_completion, project_manager, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                '14 Harbour St Townhouses (x3)',
                'Harbour Developments Pty Ltd',
                '14 Harbour St, Wollongong NSW 2500',
                self::addIsoDays($todayDay, -90),
                self::addIsoDays($todayDay, 75),
                'Dave Kowalski',
                'Active',
                'DA2026/0418 · Site gate open 06:45–16:30. Certifier requires frame & wet-area hold points.',
                $ts - 120000,
                $ts - 1800,
            ]
        )['lastInsertRowid'];

        $p2 = $db->execute(
            'INSERT INTO projects(project_name, client, site_address, start_date, target_completion, project_manager, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Bayside Medical Clinic Fit-out',
                'Bayside Health Group',
                '208 Crown St, Wollongong NSW 2500',
                self::addIsoDays($todayDay, -45),
                self::addIsoDays($todayDay, 32),
                'Rachel Singh',
                'Active',
                'After-hours core drilling only. Fire sprinkler sign-off booked next Tuesday.',
                $ts - 110000,
                $ts - 3600,
            ]
        )['lastInsertRowid'];

        $p3 = $db->execute(
            'INSERT INTO projects(project_name, client, site_address, start_date, target_completion, project_manager, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                '72 Cliff Rd Coastal Extension',
                'M & L Henderson',
                '72 Cliff Rd, North Wollongong NSW 2500',
                self::addIsoDays($todayDay, -160),
                self::addIsoDays($todayDay, 8),
                'Dave Kowalski',
                'Practical Completion',
                'Final paint touch-ups & snag closeout ahead of client handover.',
                $ts - 105000,
                $ts - 7200,
            ]
        )['lastInsertRowid'];

        // Daily Site Diaries (including today for live Headcount Today KPI)
        $db->execute(
            'INSERT INTO site_diaries(project_id, diary_date, weather, workers_on_site, work_completed, delays, visitors, signed_by, signed_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $p1,
                $todayDay,
                'Fine',
                11,
                'Completed Unit 1 & 2 first-floor timber framing; commenced roof truss crane lift. Rough-in plumbing started on ground floor.',
                '45 min wait for crane dogman at 07:30.',
                'Structural Engineer (K. Zhou) inspected steel portal beam weld.',
                'Dave Kowalski',
                $ts - 1200,
                $ts - 3600,
                $ts - 1200,
            ]
        );
        $db->execute(
            'INSERT INTO site_diaries(project_id, diary_date, weather, workers_on_site, work_completed, delays, visitors, signed_by, signed_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $p2,
                $todayDay,
                'Overcast',
                7,
                'Hung acoustic plasterboard to Consult Rooms 1–4; data & nurse-call cabling pulled through ceiling grid.',
                '',
                'Client Practice Manager walkthrough at 10:15am.',
                '',
                0,
                $ts - 2400,
                $ts - 2400,
            ]
        );
        $db->execute(
            'INSERT INTO site_diaries(project_id, diary_date, weather, workers_on_site, work_completed, delays, visitors, signed_by, signed_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $p1,
                self::addIsoDays($todayDay, -1),
                'Rain',
                6,
                'Waterproofed ground slab joints under tarps; pre-cut internal stud walls under covered deck.',
                'Heavy rain halted exterior cladding and scaffold access from 11:30am.',
                'PCA Certifier phone check-in.',
                'Dave Kowalski',
                $ts - 86000,
                $ts - 88000,
                $ts - 86000,
            ]
        );

        // Defects & Snag List
        $db->execute(
            'INSERT INTO defects(defect_code, project_id, issue_title, category, priority, status, assigned_to, due_date, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'DEF-101',
                $p1,
                'Puddle ponding near Unit 2 balcony floor waste',
                'Waterproofing',
                'Critical',
                'Open',
                'SealRight Waterproofing',
                self::addIsoDays($todayDay, 2),
                'Needs re-screed fall to 1:80 before membrane flood test.',
                $ts - 42000,
                $ts - 42000,
            ]
        );
        $db->execute(
            'INSERT INTO defects(defect_code, project_id, issue_title, category, priority, status, assigned_to, due_date, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'DEF-102',
                $p2,
                'Missing fire collar on 50mm PVC penetration in sterilisation room',
                'Safety',
                'High',
                'In Progress',
                'Coastline Plumbing',
                self::addIsoDays($todayDay, 1),
                'Collar on site; installer scheduled back at 7am.',
                $ts - 36000,
                $ts - 18000,
            ]
        );
        $db->execute(
            'INSERT INTO defects(defect_code, project_id, issue_title, category, priority, status, assigned_to, due_date, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'DEF-103',
                $p3,
                'Hairline plaster crack at master ensuite bulkhead corner',
                'Finishes',
                'Medium',
                'Rectified',
                'Illawarra Plaster & Paint',
                self::addIsoDays($todayDay, 3),
                'Taped, skimmed and primed; ready for final sign-off.',
                $ts - 95000,
                $ts - 14000,
            ]
        );
        $db->execute(
            'INSERT INTO defects(defect_code, project_id, issue_title, category, priority, status, assigned_to, due_date, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'DEF-104',
                $p3,
                'External deck LED step light #4 not switching',
                'Services',
                'Low',
                'Verified',
                'Coastline Electrical',
                self::addIsoDays($todayDay, -2),
                'Loose neutral terminal tightened and tested.',
                $ts - 140000,
                $ts - 50000,
            ]
        );

        // Variation Requests
        $db->execute(
            'INSERT INTO variations(var_number, project_id, variation_title, description, estimated_cost_cents, status, client_approval_name, client_approved_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'VAR-101',
                $p1,
                'Upgrade Unit 1–3 kitchens to 40mm Caesarstone waterfall island',
                'Client requested upgrade from 20mm laminate to 40mm engineered stone across all 3 townhouses.',
                1480000,
                'Approved',
                'Mark Dawson (Harbour Dev)',
                $ts - 170000,
                $ts - 220000,
                $ts - 170000,
            ]
        );
        $db->execute(
            'INSERT INTO variations(var_number, project_id, variation_title, description, estimated_cost_cents, status, client_approval_name, client_approved_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'VAR-102',
                $p1,
                'Additional stormwater detention pit & 150mm overflow tie-in',
                'Required following council civil engineer inspection of rear easement grade.',
                645000,
                'Pending',
                '',
                0,
                $ts - 28000,
                $ts - 28000,
            ]
        );
        $db->execute(
            'INSERT INTO variations(var_number, project_id, variation_title, description, estimated_cost_cents, status, client_approval_name, client_approved_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'VAR-103',
                $p2,
                'Acoustic glazing upgrade to Consult Room 1 & 2 doors',
                'Upgrade hollow-core doors to solid acoustic seals & laminated vision panels.',
                420000,
                'Approved',
                'Dr. Priya Nair',
                $ts - 90000,
                $ts - 130000,
                $ts - 90000,
            ]
        );

        // Material Deliveries
        $db->execute(
            'INSERT INTO deliveries(project_id, delivery_date, supplier, material, quantity, unit, received_by, has_issue, issues, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $p1,
                $todayDay,
                'Bunnings Trade Timber',
                '90x45 MGP10 Pine Studs (4.8m)',
                180,
                'Lengths',
                'Dave Kowalski',
                0,
                '',
                $ts - 14400,
            ]
        );
        $db->execute(
            'INSERT INTO deliveries(project_id, delivery_date, supplier, material, quantity, unit, received_by, has_issue, issues, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $p2,
                $todayDay,
                'CSR Gyprock Trade',
                '13mm Soundchek Plasterboard 3000x1200',
                48,
                'Sheets',
                'Rachel Singh',
                1,
                '4 sheets arrived with crushed corners on top pallet — credit claim #CS-882 raised.',
                $ts - 10800,
            ]
        );
        $db->execute(
            'INSERT INTO deliveries(project_id, delivery_date, supplier, material, quantity, unit, received_by, has_issue, issues, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $p1,
                self::addIsoDays($todayDay, -1),
                'South Coast Steel',
                '250UB31.4 Primed Structural Beams',
                4,
                'Beams',
                'Dave Kowalski',
                0,
                '',
                $ts - 92000,
            ]
        );

        // Subcontractor Register (includes 1 EXPIRED, 1 EXPIRING IN 12 DAYS, and 3 CURRENT)
        $db->execute(
            'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Coastline Electrical Pty Ltd',
                'Ben Carter',
                '0412 440 811',
                'Electrical',
                self::addIsoDays($todayDay, 185),
                'Approved',
                'Lic #284910C · $20M Public Liability current.',
                $ts - 200000,
                $ts - 200000,
            ]
        );
        $db->execute(
            'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'SealRight Waterproofing',
                'Miro Novak',
                '0438 991 204',
                'Waterproofing',
                self::addIsoDays($todayDay, 12),
                'Approved',
                'Renewal certificate requested — due within 2 weeks!',
                $ts - 190000,
                $ts - 190000,
            ]
        );
        $db->execute(
            'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'RidgeTop Roofing & Fascia',
                'Dean Hollis',
                '0409 321 776',
                'Roofing',
                self::addIsoDays($todayDay, -9),
                'Expired Insurance',
                'HOLD SITE ENTRY until updated Certificate of Currency is received.',
                $ts - 180000,
                $ts - 180000,
            ]
        );
        $db->execute(
            'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Southern Cross Concreting',
                'Tony Russo',
                '0417 654 220',
                'Concreting',
                self::addIsoDays($todayDay, 240),
                'Approved',
                'Pump & slab finishing crew.',
                $ts - 170000,
                $ts - 170000,
            ]
        );
        $db->execute(
            'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Illawarra Plaster & Paint',
                'Chris Tran',
                '0422 871 009',
                'Painting',
                self::addIsoDays($todayDay, 115),
                'Approved',
                'Internal lining, setting & two-pack finishes.',
                $ts - 160000,
                $ts - 160000,
            ]
        );

        $db->execute(
            'UPDATE business_settings SET defect_seq = CASE WHEN defect_seq < 104 THEN 104 ELSE defect_seq END, var_seq = CASE WHEN var_seq < 103 THEN 103 ELSE var_seq END WHERE id = 1'
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
                'counts' => self::readBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Builder / Company name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'Construction Site Diary';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'hi-vis-amber']);
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
                self::seedSitePulseSample($db, $todayDay);
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

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Company name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
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
                HttpException::fail(409, 'setup_required', 'SitePulse is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'supervisor']);
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
            $loaded = self::seedSitePulseSample($db, $todayDay);
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
