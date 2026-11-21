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
    private const BILLING_ROLES = ['owner', 'manager', 'billing_clerk', 'technician'];
    private const JOIN_ROLES = ['manager', 'billing_clerk', 'technician'];
    private const PRESETS = ['cobalt', 'ledger', 'slate', 'burgundy'];
    private const CURRENCIES_OK = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const SAMPLE_TABLES = ['clients', 'jobs', 'quotes', 'invoices', 'payments'];
    private const CLEAR_TABLES = ['payments', 'invoices', 'quotes', 'jobs', 'clients'];

    /** @return array<string, mixed>|null */
    public static function normalizeSettings(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'setup_done', 'quote_seq', 'invoice_seq', 'payment_terms_days', 'updated_at'] as $intCol) {
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

    public static function addDaysIso(string $isoDay, int $deltaDays): string
    {
        $src = $isoDay !== '' ? $isoDay : V::utcDay(0);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $src, $m)) {
            return V::utcDay($deltaDays);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $y -= ($mo <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($mo + ($mo > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $deltaDays;

        $z2 = $z + 719468;
        $era2 = intdiv($z2 >= 0 ? $z2 : $z2 - 146096, 146097);
        $doe2 = $z2 - $era2 * 146097;
        $yoe2 = intdiv($doe2 - intdiv($doe2, 1460) + intdiv($doe2, 36524) - intdiv($doe2, 146096), 365);
        $y2 = $yoe2 + $era2 * 400;
        $doy2 = $doe2 - (365 * $yoe2 + intdiv($yoe2, 4) - intdiv($yoe2, 100));
        $mp = intdiv(5 * $doy2 + 2, 153);
        $d2 = $doy2 - intdiv(153 * $mp + 2, 5) + 1;
        $m2 = $mp + ($mp < 10 ? 3 : -9);
        $y2 += ($m2 <= 2) ? 1 : 0;
        return sprintf('%04d-%02d-%02d', $y2, $m2, $d2);
    }

    public static function computeInvoiceStatus(int $amountCents, int $paidCents, string $dueDate, string $todayDay): string
    {
        if ($amountCents > 0 && $paidCents >= $amountCents) {
            return 'Paid';
        }
        if ($paidCents > 0) {
            return 'Part-Paid';
        }
        if ($dueDate !== '' && $todayDay !== '' && $dueDate < $todayDay) {
            return 'Overdue';
        }
        return 'Unpaid';
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
        $invs = $db->query('SELECT amount_cents, amount_paid_cents, due_date, status FROM invoices');
        $overdueCount = 0;
        $unpaidCount = 0;
        $totalOwedCents = 0;
        foreach ($invs as $inv) {
            $amt = (int) ($inv['amount_cents'] ?? 0);
            $paid = (int) ($inv['amount_paid_cents'] ?? 0);
            $due = (string) ($inv['due_date'] ?? '');
            $st = self::computeInvoiceStatus($amt, $paid, $due, $todayDay);
            $bal = max(0, $amt - $paid);
            if ($bal > 0) {
                $totalOwedCents += $bal;
                $unpaidCount++;
                if ($st === 'Overdue' || ($due !== '' && $due < $todayDay)) {
                    $overdueCount++;
                }
            }
        }
        $quotesOpen = $db->first("SELECT COUNT(*) AS c FROM quotes WHERE status IN ('Draft', 'Sent')");
        $activeJobs = $db->first("SELECT COUNT(*) AS c FROM jobs WHERE status IN ('Lead', 'Quoted', 'In Progress', 'Completed')");
        return [
            'overdueInvoices' => $overdueCount,
            'openInvoices' => $unpaidCount,
            'totalOwedCents' => $totalOwedCents,
            'openQuotes' => $quotesOpen ? (int) $quotesOpen['c'] : 0,
            'activeJobs' => $activeJobs ? (int) $activeJobs['c'] : 0,
            'sampleCount' => self::sampleCount($db),
        ];
    }

    public static function seedBillingSample(Database $db, string $todayDay): int
    {
        if (self::sampleCount($db) > 0) {
            return self::sampleCount($db);
        }
        $ts = V::now();
        $settings = Context::getBusinessSettings($db);
        $taxRate = ($settings && !empty($settings['tax_rate'])) ? (float) $settings['tax_rate'] : 10.0;

        $c1 = $db->execute(
            'INSERT INTO clients(business_name, contact_name, email, phone, billing_address, client_type, client_since, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Harbourview Strata Group',
                'Claire Maddox',
                'accounts@harbourviewstrata.com.au',
                '(02) 9411 2840',
                'Level 4, 88 Alfred St, Milsons Point NSW 2061',
                'Commercial',
                self::addDaysIso($todayDay, -420),
                'Prefers PDF/HTML tax invoices emailed to accounts@ by Thursday.',
                $ts - 9000,
                $ts - 9000,
            ]
        )['lastInsertRowid'];
        $c2 = $db->execute(
            'INSERT INTO clients(business_name, contact_name, email, phone, billing_address, client_type, client_since, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Northside Dental Studio',
                'Dr. Aaron Lim',
                'practice@northsidedental.com.au',
                '(02) 9954 1102',
                '212 Pacific Hwy, Crows Nest NSW 2065',
                'Commercial',
                self::addDaysIso($todayDay, -210),
                'Net 14 terms. Always include PO reference on invoices.',
                $ts - 8000,
                $ts - 8000,
            ]
        )['lastInsertRowid'];
        $c3 = $db->execute(
            'INSERT INTO clients(business_name, contact_name, email, phone, billing_address, client_type, client_since, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Bayside Community Library',
                'Nadia Kowalski',
                'facilities@baysidelib.org',
                '(03) 9582 4419',
                '14 Station Rd, Sandringham VIC 3191',
                'Non-Profit',
                self::addDaysIso($todayDay, -160),
                'Board approves quotes above $5,000.',
                $ts - 7000,
                $ts - 7000,
            ]
        )['lastInsertRowid'];
        $c4 = $db->execute(
            'INSERT INTO clients(business_name, contact_name, email, phone, billing_address, client_type, client_since, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Toby & Hannah Mercer',
                'Hannah Mercer',
                'hannah.mercer@example.com',
                '0412 883 920',
                '19 Jacaranda Ave, Balmain NSW 2041',
                'Residential',
                self::addDaysIso($todayDay, -45),
                'Residential renovation client; prefers card or bank transfer.',
                $ts - 6000,
                $ts - 6000,
            ]
        )['lastInsertRowid'];

        $j1 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c1,
                'Foyer LED Retrofit & Emergency Lighting Audit',
                'Installation',
                'Invoiced',
                self::addDaysIso($todayDay, -28),
                'Replace 34 lobby fixtures with dimmable LED panels and certify exit signage across 3 levels.',
                480000,
                $ts - 5500,
                $ts - 2000,
            ]
        )['lastInsertRowid'];
        $j2 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c2,
                'Treatment Room Air-Handling Service & Calibration',
                'Repair / Maintenance',
                'Invoiced',
                self::addDaysIso($todayDay, -14),
                'Quarterly HEPA filtration replacement, compressor balance, and compliance report.',
                265000,
                $ts - 5000,
                $ts - 1800,
            ]
        )['lastInsertRowid'];
        $j3 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c3,
                'Reading Wing Acoustic Panel Design & Fitout',
                'Design',
                'Quoted',
                self::addDaysIso($todayDay, 7),
                "Acoustic wall treatment for study booths and children's reading area.",
                640000,
                $ts - 4000,
                $ts - 1500,
            ]
        )['lastInsertRowid'];
        $j4 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c4,
                'Kitchen Island Wiring & Pendant Installation',
                'Installation',
                'In Progress',
                self::addDaysIso($todayDay, -2),
                'Dedicated 20A circuit, pop-up island power dock, and three brass pendants.',
                195000,
                $ts - 3000,
                $ts - 1200,
            ]
        )['lastInsertRowid'];
        $j5 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c1,
                'Basement Carpark Intercom Upgrade',
                'Consulting',
                'Lead',
                self::addDaysIso($todayDay, 14),
                'Site walkthrough to replace legacy analog intercom with IP gate controller.',
                320000,
                $ts - 2000,
                $ts - 1000,
            ]
        )['lastInsertRowid'];
        $j6 = $db->execute(
            'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $c2,
                'Reception Network Switch Replacement',
                'Support',
                'Completed',
                self::addDaysIso($todayDay, -4),
                'Swapped failing 24-port PoE switch and labelled patch bay; ready to bill.',
                118000,
                $ts - 1500,
                $ts - 800,
            ]
        )['lastInsertRowid'];

        // Quotes (Q-1001..Q-1003)
        $sub1 = 440000;
        $tax1 = (int) round($sub1 * $taxRate / 100.0);
        $tot1 = $sub1 + $tax1;
        $sub2 = 640000;
        $tax2 = (int) round($sub2 * $taxRate / 100.0);
        $tot2 = $sub2 + $tax2;
        $sub3 = 195000;
        $tax3 = (int) round($sub3 * $taxRate / 100.0);
        $tot3 = $sub3 + $tax3;

        // Invoices (INV-1001 Overdue, INV-1002 Part-Paid, INV-1003 Paid)
        $inv1 = $db->execute(
            'INSERT INTO invoices(job_id, client_id, quote_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, amount_cents, amount_paid_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $j1,
                $c1,
                'INV-1001',
                self::addDaysIso($todayDay, -24),
                self::addDaysIso($todayDay, -10),
                $sub1,
                $tax1,
                $tot1,
                0,
                'Overdue',
                'Foyer LED retrofit + compliance certificate.',
                $ts - 4500,
                $ts - 4500,
            ]
        )['lastInsertRowid'];

        $subInv2 = 240000;
        $taxInv2 = (int) round($subInv2 * $taxRate / 100.0);
        $totInv2 = $subInv2 + $taxInv2;
        $inv2 = $db->execute(
            'INSERT INTO invoices(job_id, client_id, quote_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, amount_cents, amount_paid_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $j2,
                $c2,
                'INV-1002',
                self::addDaysIso($todayDay, -9),
                self::addDaysIso($todayDay, 5),
                $subInv2,
                $taxInv2,
                $totInv2,
                150000,
                'Part-Paid',
                'Deposit paid; balance due upon HEPA cert sign-off.',
                $ts - 3500,
                $ts - 1500,
            ]
        )['lastInsertRowid'];

        $subInv3 = 130000;
        $taxInv3 = (int) round($subInv3 * $taxRate / 100.0);
        $totInv3 = $subInv3 + $taxInv3;
        $inv3 = $db->execute(
            'INSERT INTO invoices(job_id, client_id, quote_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, amount_cents, amount_paid_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $j4,
                $c4,
                'INV-1003',
                self::addDaysIso($todayDay, -18),
                self::addDaysIso($todayDay, -4),
                $subInv3,
                $taxInv3,
                $totInv3,
                $totInv3,
                'Paid',
                'Initial stage materials & rough-in deposit.',
                $ts - 4000,
                $ts - 2200,
            ]
        )['lastInsertRowid'];

        $db->execute(
            'INSERT INTO quotes(job_id, client_id, quote_number, issue_date, valid_until, subtotal_cents, tax_cents, total_cents, status, notes, converted_invoice_id, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                $j1,
                $c1,
                'Q-1001',
                self::addDaysIso($todayDay, -32),
                self::addDaysIso($todayDay, -18),
                $sub1,
                $tax1,
                $tot1,
                'Accepted',
                'Approved by Strata Committee — converted to INV-1001.',
                $inv1,
                $ts - 5200,
                $ts - 4500,
            ]
        );
        $db->execute(
            'INSERT INTO quotes(job_id, client_id, quote_number, issue_date, valid_until, subtotal_cents, tax_cents, total_cents, status, notes, converted_invoice_id, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)',
            [
                $j3,
                $c3,
                'Q-1002',
                self::addDaysIso($todayDay, -3),
                self::addDaysIso($todayDay, 27),
                $sub2,
                $tax2,
                $tot2,
                'Sent',
                'Includes acoustic fabric samples and weekend installation.',
                $ts - 2800,
                $ts - 2800,
            ]
        );
        $db->execute(
            'INSERT INTO quotes(job_id, client_id, quote_number, issue_date, valid_until, subtotal_cents, tax_cents, total_cents, status, notes, converted_invoice_id, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)',
            [
                $j6,
                $c2,
                'Q-1003',
                self::addDaysIso($todayDay, -5),
                self::addDaysIso($todayDay, 25),
                $sub3,
                $tax3,
                $tot3,
                'Accepted',
                'Ready to convert to invoice.',
                $ts - 2200,
                $ts - 2200,
            ]
        );

        // Payments matching inv2 (partial) & inv3 (full)
        $db->execute(
            'INSERT INTO payments(invoice_id, payment_date, amount_cents, method, reference, notes, recorded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$inv2, self::addDaysIso($todayDay, -5), 150000, 'Bank Transfer', 'EFT-88412', '50% progress transfer', 'Accounts Desk', $ts - 1500]
        );
        $db->execute(
            'INSERT INTO payments(invoice_id, payment_date, amount_cents, method, reference, notes, recorded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [$inv3, self::addDaysIso($todayDay, -11), $totInv3, 'Card', 'STRIPE-4429', 'Paid online via card', 'Accounts Desk', $ts - 2200]
        );

        $db->execute('UPDATE business_settings SET quote_seq = MAX(quote_seq, 1003), invoice_seq = MAX(invoice_seq, 1003) WHERE id = 1');
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'Job & Billing Operations';
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => 'cobalt']);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => 10]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, tax_rate = ?, tax_id = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $taxRate, $taxId, $timezone, $preset, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, tax_rate, tax_id, timezone, brand_preset, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $taxRate, $taxId, $timezone, $preset, $ts]
                );
            }

            $member = Context::getTeamMember($db, (string) $me['userId']);
            if (!$member) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, 'owner', 1, 'active', ?)",
                    [$me['userId'], $ownerName, $ts]
                );
            } else {
                $db->execute("UPDATE team_members SET display_name = ?, is_owner = 1, status = 'active' WHERE user_id = ?", [$ownerName, $me['userId']]);
            }

            if (V::bool($input['load_sample'] ?? false)) {
                self::seedBillingSample($db, $todayDay);
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
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Business name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40, 'label' => 'Phone']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240, 'label' => 'Address']);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'Business/Tax ID']);
            $currency = V::oneOf($input['currency'] ?? null, self::CURRENCIES_OK, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);
            $terms = V::int($input['payment_terms_days'] ?? null, 'payment_terms_days', [
                'required' => false,
                'min' => 0,
                'max' => 180,
                'fallback' => array_key_exists('payment_terms_days', $cur) ? (int) $cur['payment_terms_days'] : 14,
            ]) ?? 14;
            $bankVal = array_key_exists('bank_details', $input)
                ? V::text($input['bank_details'], 'bank_details', ['required' => false, 'max' => 300])
                : (string) ($cur['bank_details'] ?? '');

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, payment_terms_days = ?, bank_details = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $currency, $taxRate, $timezone, $preset, $terms, $bankVal, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::JOIN_ROLES, 'requested_role', ['fallback' => 'billing_clerk']);
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
            $loaded = self::seedBillingSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::CLEAR_TABLES as $t) {
                $db->execute("DELETE FROM {$t} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::readBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
