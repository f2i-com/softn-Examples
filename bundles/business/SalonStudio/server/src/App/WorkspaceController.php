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
    private const JOIN_ROLES = ['manager', 'stylist'];
    private const PRESETS = ['rosewood', 'champagne', 'sage', 'plum'];
    private const CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['clients', 'services', 'stylists', 'appointments', 'product_sales'];
    private const CLEAR_SAMPLE_TABLES = ['product_sales', 'appointments', 'services', 'stylists', 'clients'];

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
    public static function readBadgeCounts(Database $db, string $todayDay): array
    {
        $appts = $db->first(
            "SELECT COUNT(*) AS c, COALESCE(SUM(price_cents), 0) AS rev FROM appointments WHERE appt_date = ? AND status NOT IN ('Cancelled', 'No-show')",
            [$todayDay]
        );
        $inChair = $db->first(
            "SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status = 'In Chair'",
            [$todayDay]
        );
        $paidRev = $db->first(
            "SELECT COALESCE(SUM(price_cents), 0) AS rev FROM appointments WHERE appt_date = ? AND status = 'Paid'",
            [$todayDay]
        );
        $retailToday = $db->first(
            'SELECT COALESCE(SUM(amount_cents), 0) AS rev, COALESCE(SUM(quantity), 0) AS qty FROM product_sales WHERE sale_date = ?',
            [$todayDay]
        );
        $activeStylists = $db->first('SELECT COUNT(*) AS c FROM stylists WHERE active = 1');
        $totalClients = $db->first('SELECT COUNT(*) AS c FROM clients');

        return [
            'todayAppointments' => $appts ? (int) $appts['c'] : 0,
            'todayServiceRevCents' => $appts ? (int) $appts['rev'] : 0,
            'todayPaidRevCents' => $paidRev ? (int) $paidRev['rev'] : 0,
            'inChairCount' => $inChair ? (int) $inChair['c'] : 0,
            'todayRetailCents' => $retailToday ? (int) $retailToday['rev'] : 0,
            'todayRetailUnits' => $retailToday ? (int) $retailToday['qty'] : 0,
            'activeStylists' => $activeStylists ? (int) $activeStylists['c'] : 0,
            'totalClients' => $totalClients ? (int) $totalClients['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedSalonSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();

        $cRows = [
            ['Camille Laurent', '0413 882 190', 'camille.l@example.com', '2024-03-14', 'Formula: Roots 7N + 7.1 (20vol 30m), Gloss 9V + 9P on ends (10m). Loves soft curtain fringe & oat flat white.'],
            ['Nadia Okafor', '0425 409 731', 'nadia.okafor@example.com', '2024-09-02', 'Silk press + deep bond treatment every 6 weeks. Low heat setting; sensitive scalp — sulphate-free cleanser only.'],
            ['Grace Thornton', '0431 612 885', 'grace.t@example.com', '2025-01-19', 'Formula: Half-head fine babylights 20vol + Bond Builder, Toner 10.21 + 10.0. Prefers BIAB sheer blush nails.'],
            ['Mei-Ling Zhou', '0407 920 344', 'meiling.z@example.com', '2025-06-11', 'Signature blunt bob (collarbone), gloss clear shine. No strong fragrance in facial serums.'],
            ['Isabella Conti', '0448 310 662', 'isabella.c@example.com', '2026-02-05', 'Formula: Rich espresso gloss 4.0 + 4.15 (10vol 20m). Likes bouncy round-brush blowout.'],
        ];
        $cIds = [];
        foreach ($cRows as $i => $c) {
            $cr = $db->execute(
                'INSERT INTO clients(name, phone, email, client_since, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$c[0], $c[1], $c[2], $c[3], $c[4], $ts - (5 - $i) * 3600]
            );
            $cIds[] = $cr['lastInsertRowid'];
        }

        $svcRows = [
            ['Signature Cut & Blow Dry', 'Cut', 60, 11500, 'Consultation, relaxing scalp massage wash, tailored cut & bouncy blowout.'],
            ['Restyle Cut & Finish', 'Cut', 75, 14000, 'Complete shape transformation with precision finish & styling.'],
            ['Half Head Foils & Gloss', 'Colour', 135, 24500, 'Fine babylights or dimensional foils, custom toner gloss & blow dry.'],
            ['Root Tint & Refresh', 'Colour', 90, 16500, 'Regrowth colour match with shine-boosting gloss through mid-lengths.'],
            ['Bond Repair Ritual', 'Treatment', 45, 8500, 'Intensive peptide bond masque under steam towel + blow dry finish.'],
            ['BIAB Builder Gel Manicure', 'Nails', 60, 8000, 'Russian cuticle tidy, strengthening builder gel overlay & rosewood finish.'],
            ['Hydra-Glow Rose Facial', 'Beauty', 60, 14500, 'Lymphatic sculpt massage, enzyme polish & calming botanical mask.'],
            ['Lash Lift & Brow Sculpt', 'Beauty', 45, 9500, 'Keratin lash elevation paired with bespoke brow mapping and tint.'],
        ];
        $svcIds = [];
        foreach ($svcRows as $j => $sv) {
            $sr = $db->execute(
                'INSERT INTO services(name, category, duration_minutes, price_cents, description, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$sv[0], $sv[1], $sv[2], $sv[3], $sv[4], $ts - (8 - $j) * 1800]
            );
            $svcIds[] = $sr['lastInsertRowid'];
        }

        $stRows = [
            ['Colette Marchand', 'Senior Stylist', '0411 701 200', 1],
            ['Sienna Vance', 'Colour Specialist', '0419 882 311', 1],
            ['Hana Sato', 'Nail Technician', '0422 504 980', 1],
            ['Amara Reid', 'Beauty Therapist', '0434 218 640', 1],
        ];
        $stIds = [];
        foreach ($stRows as $k => $st) {
            $str = $db->execute(
                'INSERT INTO stylists(name, role, phone, active, is_sample, created_at) VALUES(?, ?, ?, ?, 1, ?)',
                [$st[0], $st[1], $st[2], $st[3], $ts - (4 - $k) * 3600]
            );
            $stIds[] = $str['lastInsertRowid'];
        }

        $aRows = [
            [$cIds[0], $svcIds[2], $stIds[1], $todayDay, '09:30', 135, 'In Chair', 24500, 'Processing toner 9V+9P — finish with soft wave.'],
            [$cIds[3], $svcIds[0], $stIds[0], $todayDay, '09:30', 60, 'Paid', 11500, 'Trimmed 1.5cm blunt bob; super glossy.'],
            [$cIds[1], $svcIds[4], $stIds[0], $todayDay, '11:00', 45, 'Confirmed', 8500, 'Sulphate-free cleanser + steam ritual.'],
            [$cIds[2], $svcIds[5], $stIds[2], $todayDay, '11:30', 60, 'Confirmed', 8000, 'Sheer blush BIAB infill.'],
            [$cIds[4], $svcIds[3], $stIds[1], $todayDay, '13:00', 90, 'Booked', 16500, 'Espresso gloss 4.0 + 4.15 refresh.'],
            [$cIds[0], $svcIds[6], $stIds[3], $todayDay, '12:15', 60, 'Confirmed', 14500, 'Follow-on facial after hair colour.'],
        ];
        foreach ($aRows as $m => $ap) {
            $db->execute(
                'INSERT INTO appointments(client_id, service_id, stylist_id, appt_date, appt_time, duration_minutes, status, price_cents, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$ap[0], $ap[1], $ap[2], $ap[3], $ap[4], $ap[5], $ap[6], $ap[7], $ap[8], $ts - (6 - $m) * 1200, $ts - 300]
            );
        }

        $saleRows = [
            [$cIds[3], 'Silk Shine Botanical Hair Oil (50ml)', 1, 5800, $todayDay],
            [$cIds[0], 'Violet Toning Mask (200ml)', 1, 4600, $todayDay],
            [$cIds[0], 'Peptide Bond Leave-In Serum', 1, 6400, $todayDay],
            [$cIds[2], 'Rose Cuticle Elixir Oil', 2, 4800, $todayDay],
        ];
        foreach ($saleRows as $r => $sl) {
            $db->execute(
                'INSERT INTO product_sales(client_id, product_name, quantity, amount_cents, sale_date, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 1, ?)',
                [$sl[0], $sl[1], $sl[2], $sl[3], $sl[4], $ts - (4 - $r) * 900]
            );
        }

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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Salon name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Hair Salon & Beauty Studio';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'rosewood']);
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
                self::seedSalonSample($db, $todayDay);
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

            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Salon name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
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
                HttpException::fail(409, 'setup_required', 'This salon studio is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'stylist']);
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
                HttpException::fail(403, 'cannot_remove_owner', 'The salon owner cannot be removed.');
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
            $loaded = self::seedSalonSample($db, $todayDay);
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
