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
    private const AU_ROLES = ['owner', 'manager', 'senior_adviser', 'adviser', 'paraplanner', 'compliance', 'operations'];
    private const AU_MEMBER_ROLES = ['manager', 'senior_adviser', 'adviser', 'paraplanner', 'compliance', 'operations'];
    private const AU_PRESETS = ['harbour', 'eucalyptus', 'charcoal', 'gold'];
    private const AU_CURRENCIES = ['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'SGD'];
    private const AU_SAMPLE_TABLES = [
        'au_documents',
        'au_annual_reviews',
        'au_bdbns',
        'au_super_rollovers',
        'au_off_market_transfers',
        'au_fee_disclosures',
        'au_risk_profiles',
        'au_clients',
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

    public static function auAddYears(string $isoDay, int $years): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $isoDay, $m)) {
            return V::utcDay($years * 365);
        }
        $y = (int) $m[1] + $years;
        $mo = $m[2];
        $dd = $m[3];
        if ($mo === '02' && $dd === '29' && !(($y % 4 === 0 && $y % 100 !== 0) || $y % 400 === 0)) {
            $dd = '28';
        }
        return str_pad((string) $y, 4, '0', STR_PAD_LEFT) . '-' . $mo . '-' . $dd;
    }

    public static function auAddDays(string $isoDay, int $delta): string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $isoDay, $m)) {
            return V::utcDay($delta);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $y -= ($mo <= 2) ? 1 : 0;
        $era = intdiv($y >= 0 ? $y : $y - 399, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($mo + ($mo > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        $z = $era * 146097 + $doe - 719468 + $delta;
        return gmdate('Y-m-d', $z * 86400);
    }

    public static function auSampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::AU_SAMPLE_TABLES as $table) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$table} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function auBadgeCounts(Database $db, string $todayDay): array
    {
        $in30 = self::auAddDays($todayDay, 30);
        $clients = $db->first('SELECT COUNT(*) AS c FROM au_clients');
        $wholesale = $db->first("SELECT COUNT(*) AS c FROM au_clients WHERE wholesale_status = 'Yes'");
        $pendingConsent = $db->first("SELECT COUNT(*) AS c FROM au_fee_disclosures WHERE ongoing_fee_consent != 'yes'");
        $reviewsDue = $db->first('SELECT COUNT(*) AS c FROM au_annual_reviews WHERE next_review_date <= ?', [$in30]);
        $docsExpiring = $db->first("SELECT COUNT(*) AS c FROM au_documents WHERE expiry_date != '' AND expiry_date <= ?", [$in30]);
        $bdbnExpiring = $db->first("SELECT COUNT(*) AS c FROM au_bdbns WHERE status = 'Active' AND expiry_date != '' AND expiry_date <= ?", [$in30]);
        $activeTransfers = $db->first("SELECT COUNT(*) AS c FROM au_off_market_transfers WHERE status IN ('Draft', 'Submitted', 'In Transit')");
        $activeRollovers = $db->first("SELECT COUNT(*) AS c FROM au_super_rollovers WHERE status IN ('Initiated', 'Awaiting Fund')");
        $fumRow = $db->first(
            'SELECT COALESCE(SUM(portfolio_value_cents), 0) AS s FROM au_fee_disclosures WHERE id IN (SELECT MAX(id) FROM au_fee_disclosures GROUP BY client_id)'
        );

        return [
            'clients' => $clients ? (int) $clients['c'] : 0,
            'wholesaleClients' => $wholesale ? (int) $wholesale['c'] : 0,
            'pendingConsents' => $pendingConsent ? (int) $pendingConsent['c'] : 0,
            'reviewsDue' => $reviewsDue ? (int) $reviewsDue['c'] : 0,
            'docsExpiring' => $docsExpiring ? (int) $docsExpiring['c'] : 0,
            'bdbnExpiring' => $bdbnExpiring ? (int) $bdbnExpiring['c'] : 0,
            'activeTransfers' => ($activeTransfers ? (int) $activeTransfers['c'] : 0) + ($activeRollovers ? (int) $activeRollovers['c'] : 0),
            'totalFumCents' => $fumRow ? (int) $fumRow['s'] : 0,
            'sampleCount' => self::auSampleCount($db),
        ];
    }

    public static function seedAuSample(Database $db, string $todayDay): int
    {
        if (self::auSampleCount($db) > 0) {
            return self::auSampleCount($db);
        }
        $ts = V::now();
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

        $c1 = $db->execute(
            'INSERT INTO au_clients(first_name, last_name, email, phone, dob, age, tfn, address, residency_status, employer, occupation, annual_income_cents, net_assets_cents, liquid_assets_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, wholesale_status, onboarding_stage, fsg_acknowledged, fsg_ack_date, fsg_signer, tfn_exemption, residency_for_tax, tax_free_threshold, has_hecs_help, tfn_declared_date, adviser_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Lachlan', 'Whitmore', 'lachlan.whitmore@example.com.au', '0412 884 201', '1974-05-14', 52,
                '482-910-334', '42 Kurraba Rd, Neutral Bay NSW 2089', 'au_citizen', 'Pacific Infrastructure Group',
                'Executive Director', 34000000, 385000000, 145000000, 'growth', 15, 7, 74, 'Yes', 'Active', 1,
                self::auAddDays($todayDay, -290), 'Lachlan Whitmore', 'none', 'au_resident', 'yes', 'no',
                self::auAddDays($todayDay, -290), 'Claire Donovan',
                'Wholesale s761G accountant certificate verified. Transitioning legacy wrap holdings to HUB24.',
                $ts - 86400 * 30, $ts - 86400 * 2,
            ]
        )['lastInsertRowid'];

        $c2 = $db->execute(
            'INSERT INTO au_clients(first_name, last_name, email, phone, dob, age, tfn, address, residency_status, employer, occupation, annual_income_cents, net_assets_cents, liquid_assets_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, wholesale_status, onboarding_stage, fsg_acknowledged, fsg_ack_date, fsg_signer, tfn_exemption, residency_for_tax, tax_free_threshold, has_hecs_help, tfn_declared_date, adviser_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Priya', 'Subramanian', 'priya.s@example.com.au', '0438 119 742', '1983-11-02', 43,
                '619-304-882', '18 Orrong Rd, Elsternwick VIC 3185', 'au_citizen', 'Royal Melbourne Health',
                'Consultant Surgeon', 29500000, 182000000, 74000000, 'balanced', 18, 6, 65, 'Yes', 'Review Due', 1,
                self::auAddDays($todayDay, -355), 'Priya Subramanian', 'none', 'au_resident', 'yes', 'no',
                self::auAddDays($todayDay, -355), 'Claire Donovan',
                'Annual review & FDS renewal approaching. Considering super consolidation from industry fund.',
                $ts - 86400 * 25, $ts - 86400 * 3,
            ]
        )['lastInsertRowid'];

        $c3 = $db->execute(
            'INSERT INTO au_clients(first_name, last_name, email, phone, dob, age, tfn, address, residency_status, employer, occupation, annual_income_cents, net_assets_cents, liquid_assets_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, wholesale_status, onboarding_stage, fsg_acknowledged, fsg_ack_date, fsg_signer, tfn_exemption, residency_for_tax, tax_free_threshold, has_hecs_help, tfn_declared_date, adviser_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Margaret', 'Kavanagh', 'm.kavanagh@example.com.au', '0407 553 910', '1958-08-21', 68,
                '291-775-104', '7 Esplanade, South Perth WA 6151', 'au_citizen', 'Retired',
                'Former Principal', 9200000, 148000000, 88000000, 'income', 8, 3, 32, 'No', 'Active', 1,
                self::auAddDays($todayDay, -180), 'Margaret Kavanagh', 'none', 'au_resident', 'yes', 'no',
                self::auAddDays($todayDay, -180), 'Hamish Reid',
                'Account-based pension drawdown review. Priority is capital preservation and steady franked income.',
                $ts - 86400 * 20, $ts - 86400 * 4,
            ]
        )['lastInsertRowid'];

        $c4 = $db->execute(
            'INSERT INTO au_clients(first_name, last_name, email, phone, dob, age, tfn, address, residency_status, employer, occupation, annual_income_cents, net_assets_cents, liquid_assets_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, wholesale_status, onboarding_stage, fsg_acknowledged, fsg_ack_date, fsg_signer, tfn_exemption, residency_for_tax, tax_free_threshold, has_hecs_help, tfn_declared_date, adviser_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Callum', 'Harrington', 'callum.h@example.com.au', '0421 670 315', '1990-02-11', 36,
                '774-218-903', '114 Latrobe Tce, Paddington QLD 4064', 'permanent_resident', 'Atlassian',
                'Staff Engineer', 21500000, 76000000, 38000000, 'growth', 25, 8, 86, 'No', 'SOA Prep', 0,
                '', '', 'none', 'au_resident', 'yes', 'yes',
                '', 'Hamish Reid',
                'New retail client onboarding. Awaiting FSG acknowledgement signature before SOA issue.',
                $ts - 86400 * 7, $ts - 86400 * 1,
            ]
        )['lastInsertRowid'];

        // Risk Profile Assessments
        $db->execute(
            'INSERT INTO au_risk_profiles(client_id, client_age, client_income_cents, client_net_assets_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, profile_band, recommended_profile, best_interest_notes, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 52, 34000000, 385000000, 15, 'buy', 8, 'extensive', 81, 'Growth', 'Growth',
                'Client has 15yr horizon, strong liquidity buffer and experienced through 2020/2022 drawdowns.',
                self::auAddDays($todayDay, -280), 'Claire Donovan', $ts - 86400 * 28,
            ]
        );
        $db->execute(
            'INSERT INTO au_risk_profiles(client_id, client_age, client_income_cents, client_net_assets_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, profile_band, recommended_profile, best_interest_notes, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 43, 29500000, 182000000, 18, 'hold', 6, 'moderate', 58, 'Balanced', 'Balanced',
                "Prefers steady compounding with moderate volatility protection ahead of children's schooling.",
                self::auAddDays($todayDay, -340), 'Claire Donovan', $ts - 86400 * 24,
            ]
        );
        $db->execute(
            'INSERT INTO au_risk_profiles(client_id, client_age, client_income_cents, client_net_assets_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, profile_band, recommended_profile, best_interest_notes, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 68, 9200000, 148000000, 8, 'sell', 3, 'limited', 22, 'Conservative', 'Conservative',
                'Pension phase retiree requiring predictable quarterly cashflow and minimal capital drawdown.',
                self::auAddDays($todayDay, -170), 'Hamish Reid', $ts - 86400 * 19,
            ]
        );
        $db->execute(
            'INSERT INTO au_risk_profiles(client_id, client_age, client_income_cents, client_net_assets_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, profile_band, recommended_profile, best_interest_notes, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c4, 36, 21500000, 76000000, 25, 'buy', 9, 'extensive', 92, 'High Growth', 'High Growth',
                'Long accumulation horizon, comfortable with high equity allocation and automated DCA.',
                self::auAddDays($todayDay, -5), 'Hamish Reid', $ts - 86400 * 5,
            ]
        );

        // Fee Disclosure Statements (FDS)
        $db->execute(
            'INSERT INTO au_fee_disclosures(client_id, portfolio_value_cents, fee_type, percentage_rate, fixed_fee_cents, calculated_annual_fee_cents, billing_frequency, ongoing_fee_consent, consent_signed_date, effective_date, renewal_due_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 145000000, 'percentage', 0.77, 0, 1116500, 'quarterly', 'yes',
                self::auAddDays($todayDay, -200), self::auAddDays($todayDay, -200), self::auAddDays($todayDay, 165),
                'Lachlan Whitmore', 'Tier 3 AFSL FUA schedule (0.77% incl. GST). Ongoing consent active.', $ts - 86400 * 26,
            ]
        );
        $db->execute(
            'INSERT INTO au_fee_disclosures(client_id, portfolio_value_cents, fee_type, percentage_rate, fixed_fee_cents, calculated_annual_fee_cents, billing_frequency, ongoing_fee_consent, consent_signed_date, effective_date, renewal_due_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 74000000, 'percentage', 0.88, 0, 651200, 'quarterly', 'pending',
                '', self::auAddDays($todayDay, -350), self::auAddDays($todayDay, 15),
                '', 'Annual opt-in consent renewal sent; awaiting client signature within statutory window.', $ts - 86400 * 22,
            ]
        );
        $db->execute(
            'INSERT INTO au_fee_disclosures(client_id, portfolio_value_cents, fee_type, percentage_rate, fixed_fee_cents, calculated_annual_fee_cents, billing_frequency, ongoing_fee_consent, consent_signed_date, effective_date, renewal_due_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 88000000, 'fixed', 0.0, 550000, 550000, 'monthly', 'yes',
                self::auAddDays($todayDay, -170), self::auAddDays($todayDay, -170), self::auAddDays($todayDay, 195),
                'Margaret Kavanagh', 'Fixed annual advice retainer ($5,500 incl. GST) deducted monthly from pension cash hub.', $ts - 86400 * 18,
            ]
        );
        $db->execute(
            'INSERT INTO au_fee_disclosures(client_id, portfolio_value_cents, fee_type, percentage_rate, fixed_fee_cents, calculated_annual_fee_cents, billing_frequency, ongoing_fee_consent, consent_signed_date, effective_date, renewal_due_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c4, 38000000, 'percentage', 1.1, 0, 418000, 'quarterly', 'pending',
                '', $todayDay, self::auAddYears($todayDay, 1),
                '', 'Draft FDS prepared for SOA implementation meeting.', $ts - 86400 * 4,
            ]
        );

        // Off-Market Transfers
        $db->execute(
            'INSERT INTO au_off_market_transfers(client_id, delivering_platform, hin_or_srn, account_reference, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, chess_sponsorship, status, submitted_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 'Macquarie Wrap', 'X0014928172', 'MW-884210', 'Full',
                'VAS (2,400 units), VGS (1,850 units), CBA (900 shares), BHP (1,200 shares)',
                62000000, 5450, 'Broker-Sponsored', 'In Transit', self::auAddDays($todayDay, -6),
                'Broker-to-broker CHESS transfer lodged with Macquarie Wrap.', $ts - 86400 * 6,
            ]
        );
        $db->execute(
            'INSERT INTO au_off_market_transfers(client_id, delivering_platform, hin_or_srn, account_reference, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, chess_sponsorship, status, submitted_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c4, 'BT Panorama', 'I0048291044', 'BTP-44109', 'Partial',
                'IOZ (1,500 units), IVV (800 units)',
                14500000, 5450, 'Issuer-Sponsored', 'Submitted', self::auAddDays($todayDay, -2),
                'SRN verified against Computershare holding statement.', $ts - 86400 * 2,
            ]
        );

        // Superannuation Rollovers
        $db->execute(
            'INSERT INTO au_super_rollovers(client_id, from_fund_name, from_fund_abn, from_member_number, to_fund_name, to_fund_abn, to_member_number, rollover_type, partial_amount_cents, estimated_balance_cents, preservation_status, insurance_checked, status, requested_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 'AustralianSuper', '65 714 394 898', 'AS-9928140', 'HUB24 Super', '60 910 190 523', 'H24-552019',
                'Partial Rollover', 42000000, 48500000, 'Preserved', 1, 'Awaiting Fund',
                self::auAddDays($todayDay, -9),
                'Retaining $65k in AustralianSuper to preserve existing TPD & Death cover.', $ts - 86400 * 9,
            ]
        );
        $db->execute(
            'INSERT INTO au_super_rollovers(client_id, from_fund_name, from_fund_abn, from_member_number, to_fund_name, to_fund_abn, to_member_number, rollover_type, partial_amount_cents, estimated_balance_cents, preservation_status, insurance_checked, status, requested_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 'Rest Super', '62 653 671 394', 'RS-330918', 'Netwealth Super Accelerator', '94 573 747 704', 'NW-778201',
                'Full Rollover', 0, 54000000, 'Unrestricted Non-preserved', 1, 'Completed',
                self::auAddDays($todayDay, -45),
                'No active insurance cover held in legacy fund; full rollover settled into pension account.', $ts - 86400 * 45,
            ]
        );

        // Binding Death Benefit Nominations (strict 100% primary allocations!)
        $nom1 = self::auAddDays($todayDay, -180);
        $db->execute(
            'INSERT INTO au_bdbns(client_id, super_fund_name, member_number, primary_json, contingent_json, witness_1_name, witness_1_over_18, witness_2_name, witness_2_over_18, nomination_date, expiry_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 'HUB24 Super', 'H24-110842',
                json_encode([
                    ['name' => 'Eleanor Whitmore', 'relationship' => 'Spouse', 'dob' => '1976-09-10', 'percentage' => 70],
                    ['name' => 'Oliver Whitmore', 'relationship' => 'Child', 'dob' => '2004-03-19', 'percentage' => 30],
                ], $jsonFlags),
                json_encode([
                    ['name' => 'Estate of Lachlan Whitmore', 'relationship' => 'Legal Personal Representative', 'percentage' => 100],
                ], $jsonFlags),
                'David Mercer', 1, 'Hannah Wu', 1,
                $nom1, self::auAddYears($nom1, 3), 'Active',
                'Executed in presence of two independent adult witnesses per SIS Reg 6.17A.', $ts - 86400 * 20,
            ]
        );
        $db->execute(
            'INSERT INTO au_bdbns(client_id, super_fund_name, member_number, primary_json, contingent_json, witness_1_name, witness_1_over_18, witness_2_name, witness_2_over_18, nomination_date, expiry_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 'Netwealth Super Accelerator', 'NW-778201',
                json_encode([
                    ['name' => 'Sophie Kavanagh', 'relationship' => 'Child', 'dob' => '1986-07-04', 'percentage' => 50],
                    ['name' => 'Thomas Kavanagh', 'relationship' => 'Child', 'dob' => '1989-11-22', 'percentage' => 50],
                ], $jsonFlags),
                json_encode([], $jsonFlags),
                'Peter Grant', 1, 'Sarah Lin', 1,
                self::auAddDays($todayDay, -1080), self::auAddDays($todayDay, 15), 'Active',
                '3-year statutory BDBN renewal approaching in 15 days — schedule re-witnessing.', $ts - 86400 * 18,
            ]
        );

        // Annual Client Reviews
        $db->execute(
            'INSERT INTO au_annual_reviews(client_id, review_date, current_portfolio_value_cents, current_annual_fee_cents, goal_progress, life_changes_json, updated_risk_tolerance, soa_required, advisor_notes, next_review_date, status, adviser_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, self::auAddDays($todayDay, -350), 74000000, 651200, 8,
                json_encode(['Superannuation Event'], $jsonFlags), 6, 1,
                'Portfolio tracking ahead of retirement target. Super rollover SOA triggered for partial AustralianSuper consolidation.',
                self::auAddDays($todayDay, 12), 'SOA Pending', 'Claire Donovan', $ts - 86400 * 15,
            ]
        );
        $db->execute(
            'INSERT INTO au_annual_reviews(client_id, review_date, current_portfolio_value_cents, current_annual_fee_cents, goal_progress, life_changes_json, updated_risk_tolerance, soa_required, advisor_notes, next_review_date, status, adviser_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, self::auAddDays($todayDay, -120), 145000000, 1116500, 9,
                json_encode(['None'], $jsonFlags), 7, 0,
                'Growth portfolio rebalanced. No material change in circumstances; ROA issued.',
                self::auAddDays($todayDay, 245), 'Completed', 'Claire Donovan', $ts - 86400 * 12,
            ]
        );

        // Document Vault (including expiring AUSTRAC ID and SOA)
        $docs = [
            [$c1, 'Statement of Advice', 'SOA — Portfolio Consolidation & Wholesale Strategy', 'SOA-2026-014', self::auAddDays($todayDay, 240), 'Signed & implemented.'],
            [$c1, 'ID Verification (AUSTRAC)', 'Australian Passport & Driver Licence KYC', 'KYC-LW-901', self::auAddDays($todayDay, 540), 'Verified via GreenID.'],
            [$c2, 'ID Verification (AUSTRAC)', 'Passport Verification (Expiring Soon)', 'KYC-PS-404', self::auAddDays($todayDay, 18), 'Passport expiring in 18 days — request renewed copy for AUSTRAC CDD.'],
            [$c2, 'Financial Services Guide', 'FSG v4.2 — Signed Acknowledgement', 'FSG-PS-2025', self::auAddDays($todayDay, 14), 'Annual review FSG refresh due.'],
            [$c3, 'Superannuation Statement', 'Netwealth Pension Opening Statement', 'SUP-MK-2026', '', 'FY26 minimum pension drawdown verified.'],
            [$c4, 'Tax Return', 'FY25 ATO Notice of Assessment', 'TAX-CH-2025', self::auAddDays($todayDay, -5), 'Updated FY26 NOA required before SOA finalisation.'],
        ];
        $docLen = count($docs);
        foreach ($docs as $d => $doc) {
            $db->execute(
                'INSERT INTO au_documents(client_id, document_type, document_name, reference_code, expiry_date, notes, uploaded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$doc[0], $doc[1], $doc[2], $doc[3], $doc[4], $doc[5], 'Compliance Desk', $ts - ($docLen - $d) * 3600]
            );
        }

        return self::auSampleCount($db);
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
                    'display_name' => ($settings['owner_name'] ?? '') !== '' ? $settings['owner_name'] : 'Practice Principal',
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
                'counts' => self::auBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'Practice / AFSL name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140, 'label' => 'Tagline']) ?: 'AFSL Advisory & Compliance';
            $currency = V::oneOf($input['currency'] ?? null, self::AU_CURRENCIES, 'currency', ['fallback' => 'AUD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'Australia/Sydney';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::AU_PRESETS, 'brand_preset', ['fallback' => 'harbour']);
            $afslNumber = V::text($input['afsl_number'] ?? null, 'afsl_number', ['required' => false, 'max' => 40]) ?: 'AFSL 514892';
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, afsl_number = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $afslNumber, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, afsl_number, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $afslNumber, $ts]
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
                self::seedAuSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::auBadgeCounts($db, $todayDay),
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
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60, 'label' => 'ABN']);
            $afslNumber = V::text($input['afsl_number'] ?? null, 'afsl_number', ['required' => false, 'max' => 60]);
            if ($afslNumber === '') {
                $afslNumber = (string) ($cur['afsl_number'] ?? '');
            }
            $currency = V::oneOf($input['currency'] ?? null, self::AU_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::AU_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, afsl_number = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $afslNumber, $currency, $taxRate, $timezone, $preset, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This advisory workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::AU_MEMBER_ROLES, 'requested_role', ['fallback' => 'adviser']);
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
                HttpException::fail(403, 'cannot_edit_owner', 'The owner role cannot be changed.');
            }
            $role = V::oneOf($input['role'] ?? null, self::AU_MEMBER_ROLES, 'role', ['fallback' => $target['role']]);
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
            $loaded = self::seedAuSample($db, $todayDay);
            return ['sampleCount' => $loaded, 'counts' => self::auBadgeCounts($db, $todayDay)];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::AU_SAMPLE_TABLES as $table) {
                $db->execute("DELETE FROM {$table} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::auBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
