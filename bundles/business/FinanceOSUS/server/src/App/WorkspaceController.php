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
    private const US_ROLES = ['owner', 'manager', 'advisor', 'transition', 'compliance', 'operations'];
    private const US_MEMBER_ROLES = ['manager', 'advisor', 'transition', 'compliance', 'operations'];
    private const US_PRESETS = ['federal', 'wallstreet', 'emerald', 'bronze'];
    private const US_CURRENCIES = ['USD', 'AUD', 'CAD', 'GBP', 'EUR', 'NZD', 'SGD'];
    private const US_SAMPLE_TABLES = [
        'us_documents',
        'us_annual_reviews',
        'us_poas',
        'us_beneficiaries',
        'us_exchanges_1035',
        'us_rollovers',
        'us_acat_transfers',
        'us_fee_agreements',
        'us_risk_assessments',
        'us_clients',
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

    public static function usAddYears(string $isoDay, int $years): string
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

    public static function usAddDays(string $isoDay, int $delta): string
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

    public static function usSampleCount(Database $db): int
    {
        $total = 0;
        foreach (self::US_SAMPLE_TABLES as $table) {
            $row = $db->first("SELECT COUNT(*) AS c FROM {$table} WHERE is_sample = 1");
            $total += $row ? (int) $row['c'] : 0;
        }
        return $total;
    }

    /** @return array<string, int> */
    public static function usBadgeCounts(Database $db, string $todayDay): array
    {
        $in30 = self::usAddDays($todayDay, 30);
        $clients = $db->first('SELECT COUNT(*) AS c FROM us_clients');
        $accredited = $db->first("SELECT COUNT(*) AS c FROM us_clients WHERE accredited_investor = 'Yes'");
        $crsPending = $db->first('SELECT COUNT(*) AS c FROM us_clients WHERE crs_acknowledged = 0');
        $reviewsDue = $db->first('SELECT COUNT(*) AS c FROM us_annual_reviews WHERE next_review_date <= ?', [$in30]);
        $docsExpiring = $db->first("SELECT COUNT(*) AS c FROM us_documents WHERE expiry_date != '' AND expiry_date <= ?", [$in30]);
        $acatOpen = $db->first("SELECT COUNT(*) AS c FROM us_acat_transfers WHERE status IN ('Initiated', 'Custodian Pending', 'In Transit')");
        $rollOpen = $db->first("SELECT COUNT(*) AS c FROM us_rollovers WHERE status IN ('Initiated', 'Custodian Pending')");
        $exchOpen = $db->first("SELECT COUNT(*) AS c FROM us_exchanges_1035 WHERE status IN ('Reviewing', 'Submitted', 'Carrier Transfer')");
        $aumRow = $db->first(
            'SELECT COALESCE(SUM(account_value_cents), 0) AS s FROM us_fee_agreements WHERE id IN (SELECT MAX(id) FROM us_fee_agreements GROUP BY client_id)'
        );

        return [
            'clients' => $clients ? (int) $clients['c'] : 0,
            'accreditedClients' => $accredited ? (int) $accredited['c'] : 0,
            'crsPending' => $crsPending ? (int) $crsPending['c'] : 0,
            'reviewsDue' => $reviewsDue ? (int) $reviewsDue['c'] : 0,
            'docsExpiring' => $docsExpiring ? (int) $docsExpiring['c'] : 0,
            'activeTransfers' => ($acatOpen ? (int) $acatOpen['c'] : 0)
                + ($rollOpen ? (int) $rollOpen['c'] : 0)
                + ($exchOpen ? (int) $exchOpen['c'] : 0),
            'totalAumCents' => $aumRow ? (int) $aumRow['s'] : 0,
            'sampleCount' => self::usSampleCount($db),
        ];
    }

    public static function seedUsSample(Database $db, string $todayDay): int
    {
        if (self::usSampleCount($db) > 0) {
            return self::usSampleCount($db);
        }
        $ts = V::now();
        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

        $c1 = $db->execute(
            'INSERT INTO us_clients(first_name, last_name, email, phone, dob, age, ssn, address, citizenship, employer, occupation, annual_income_cents, net_worth_cents, liquid_net_worth_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, accredited_investor, portfolio_allocation, onboarding_stage, crs_acknowledged, crs_ack_date, crs_signer, crs_advisor_name, w9_legal_name, w9_business_name, w9_tax_classification, w9_ssn_ein, w9_certified_date, advisor_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Jonathan', 'Sterling', 'j.sterling@example.com', '(212) 555-0148', '1972-04-18', 54,
                '412-88-9021', '885 Park Ave, Apt 11B, New York, NY 10075', 'us', 'Hudson Biotech Partners',
                'Managing Partner', 48000000, 425000000, 210000000, 'growth', 16, 8, 82, 'Yes', '80/15/5',
                'Active', 1, self::usAddDays($todayDay, -210), 'Jonathan Sterling', 'Victoria Hayes',
                'Jonathan M. Sterling', 'Sterling Family Holdings LLC', 'llc', '84-2910482',
                self::usAddDays($todayDay, -210), 'Victoria Hayes',
                'SEC Rule 501(a) Accredited Investor. Consolidating legacy wirehouse accounts via ACAT.',
                $ts - 86400 * 30, $ts - 86400 * 2,
            ]
        )['lastInsertRowid'];

        $c2 = $db->execute(
            'INSERT INTO us_clients(first_name, last_name, email, phone, dob, age, ssn, address, citizenship, employer, occupation, annual_income_cents, net_worth_cents, liquid_net_worth_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, accredited_investor, portfolio_allocation, onboarding_stage, crs_acknowledged, crs_ack_date, crs_signer, crs_advisor_name, w9_legal_name, w9_business_name, w9_tax_classification, w9_ssn_ein, w9_certified_date, advisor_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Elena', 'Rostova', 'elena.rostova@example.com', '(617) 555-0193', '1980-09-12', 46,
                '529-44-7710', '240 Newbury St, Boston, MA 02116', 'us', 'Mass General Brigham',
                'Chief of Cardiology', 36500000, 165000000, 92000000, 'balanced', 20, 6, 66, 'Yes', '60/30/10',
                'Review Due', 1, self::usAddDays($todayDay, -352), 'Elena Rostova', 'Victoria Hayes',
                'Elena V. Rostova', '', 'individual', '529-44-7710',
                self::usAddDays($todayDay, -352), 'Victoria Hayes',
                'Rolling over legacy hospital 403(b) into Schwab IRA. Annual review due next fortnight.',
                $ts - 86400 * 26, $ts - 86400 * 3,
            ]
        )['lastInsertRowid'];

        $c3 = $db->execute(
            'INSERT INTO us_clients(first_name, last_name, email, phone, dob, age, ssn, address, citizenship, employer, occupation, annual_income_cents, net_worth_cents, liquid_net_worth_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, accredited_investor, portfolio_allocation, onboarding_stage, crs_acknowledged, crs_ack_date, crs_signer, crs_advisor_name, w9_legal_name, w9_business_name, w9_tax_classification, w9_ssn_ein, w9_certified_date, advisor_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Robert', 'Caldwell', 'r.caldwell@example.com', '(312) 555-0172', '1956-12-03', 69,
                '318-62-4405', '1500 N Lake Shore Dr, Chicago, IL 60610', 'us', 'Retired',
                'Former CFO', 14500000, 220000000, 135000000, 'income', 9, 3, 35, 'Yes', '30/50/20',
                'Active', 1, self::usAddDays($todayDay, -160), 'Robert Caldwell', 'David Chen',
                'Caldwell Revocable Living Trust', '', 'trust', '36-7821904',
                self::usAddDays($todayDay, -160), 'David Chen',
                'Evaluating 1035 exchange out of high-fee Prudential variable annuity into low-cost FIA.',
                $ts - 86400 * 22, $ts - 86400 * 5,
            ]
        )['lastInsertRowid'];

        $c4 = $db->execute(
            'INSERT INTO us_clients(first_name, last_name, email, phone, dob, age, ssn, address, citizenship, employer, occupation, annual_income_cents, net_worth_cents, liquid_net_worth_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, accredited_investor, portfolio_allocation, onboarding_stage, crs_acknowledged, crs_ack_date, crs_signer, crs_advisor_name, w9_legal_name, w9_business_name, w9_tax_classification, w9_ssn_ein, w9_certified_date, advisor_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [
                'Maya', 'Patel', 'maya.patel@example.com', '(415) 555-0126', '1989-07-29', 37,
                '602-19-8340', '710 Steiner St, San Francisco, CA 94117', 'permanent_resident', 'Stripe',
                'Staff Product Lead', 24000000, 88000000, 48000000, 'growth', 26, 8, 84, 'Yes', '80/15/5',
                'ACAT & Paperwork', 0, '', '', '',
                'Maya Patel', '', 'individual', '', '', 'David Chen',
                'Awaiting signed SEC Form CRS delivery receipt and W-9 certification before account opening.',
                $ts - 86400 * 6, $ts - 86400 * 1,
            ]
        )['lastInsertRowid'];

        // Risk Tolerance Assessments
        $db->execute(
            'INSERT INTO us_risk_assessments(client_id, client_age, client_income_cents, client_net_worth_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, risk_band, portfolio_type, suggested_allocation, reg_bi_check, rationale, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 54, 48000000, 425000000, 16, 'buy_more', 8, 'extensive', 81, 'Growth', 'Aggressive',
                '75/20/5', 'Suitable', 'Long horizon, high liquidity, experienced equity investor.',
                self::usAddDays($todayDay, -200), 'Victoria Hayes', $ts - 86400 * 28,
            ]
        );
        $db->execute(
            'INSERT INTO us_risk_assessments(client_id, client_age, client_income_cents, client_net_worth_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, risk_band, portfolio_type, suggested_allocation, reg_bi_check, rationale, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 46, 36500000, 165000000, 20, 'hold', 6, 'moderate', 60, 'Moderate', 'Moderate',
                '60/30/10', 'Suitable', 'Balanced core allocation suitable for mid-career surgeon.',
                self::usAddDays($todayDay, -340), 'Victoria Hayes', $ts - 86400 * 25,
            ]
        );
        $db->execute(
            'INSERT INTO us_risk_assessments(client_id, client_age, client_income_cents, client_net_worth_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, risk_band, portfolio_type, suggested_allocation, reg_bi_check, rationale, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 69, 14500000, 220000000, 9, 'sell_some', 3, 'moderate', 35, 'Moderate Conservative', 'Conservative',
                '40/45/15', 'Suitable', 'Retirement distribution phase; prioritizes municipal bond income & downside defense.',
                self::usAddDays($todayDay, -155), 'David Chen', $ts - 86400 * 20,
            ]
        );

        // Tiered AUM Fee Agreements
        $db->execute(
            'INSERT INTO us_fee_agreements(client_id, account_value_cents, fee_tier, effective_bps, annual_fee_cents, quarterly_fee_cents, monthly_fee_cents, billing_frequency, tier_breakdown_json, status, effective_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 210000000, 'Standard', 80.7, 1695000, 423750, 141250, 'Quarterly',
                json_encode([
                    ['bracket' => 'First $500,000 @ 1.00%', 'fee_cents' => 500000],
                    ['bracket' => 'Next $500,000 @ 0.85%', 'fee_cents' => 425000],
                    ['bracket' => 'Above $1,000,000 @ 0.70%', 'fee_cents' => 770000],
                ], $jsonFlags),
                'Executed', self::usAddDays($todayDay, -200), 'Jonathan Sterling',
                'Standard progressive AUM schedule billed quarterly in advance.', $ts - 86400 * 27,
            ]
        );
        $db->execute(
            'INSERT INTO us_fee_agreements(client_id, account_value_cents, fee_tier, effective_bps, annual_fee_cents, quarterly_fee_cents, monthly_fee_cents, billing_frequency, tier_breakdown_json, status, effective_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, 92000000, 'Standard', 93.2, 857000, 214250, 71417, 'Quarterly',
                json_encode([
                    ['bracket' => 'First $500,000 @ 1.00%', 'fee_cents' => 500000],
                    ['bracket' => 'Next $420,000 @ 0.85%', 'fee_cents' => 357000],
                ], $jsonFlags),
                'Executed', self::usAddDays($todayDay, -340), 'Elena Rostova',
                'Billed directly from Schwab brokerage sweep.', $ts - 86400 * 24,
            ]
        );
        $db->execute(
            'INSERT INTO us_fee_agreements(client_id, account_value_cents, fee_tier, effective_bps, annual_fee_cents, quarterly_fee_cents, monthly_fee_cents, billing_frequency, tier_breakdown_json, status, effective_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 135000000, 'Premium', 71.7, 967500, 241875, 80625, 'Quarterly',
                json_encode([
                    ['bracket' => 'First $500,000 @ 0.85%', 'fee_cents' => 425000],
                    ['bracket' => 'Next $500,000 @ 0.70%', 'fee_cents' => 350000],
                    ['bracket' => 'Above $1,000,000 @ 0.55%', 'fee_cents' => 192500],
                ], $jsonFlags),
                'Executed', self::usAddDays($todayDay, -155), 'Robert Caldwell',
                'Trust household Premium tier applied.', $ts - 86400 * 19,
            ]
        );

        // ACAT Transfers
        $db->execute(
            'INSERT INTO us_acat_transfers(client_id, custodian, account_number, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 'Fidelity', 'Z42-881920', 'Full',
                'VTI (3,200 sh), VXUS (2,100 sh), BND (1,800 sh), AAPL (600 sh)',
                118000000, 7500, 'In Transit', self::usAddDays($todayDay, -4),
                'Full ACAT in-kind initiated to Schwab Institutional; $75 fee rebate approved.', $ts - 86400 * 4,
            ]
        );
        $db->execute(
            'INSERT INTO us_acat_transfers(client_id, custodian, account_number, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c4, 'E*TRADE', 'ET-7730192', 'Partial',
                'VOO (450 sh), Cash sweep ($85,000)',
                32000000, 7500, 'Custodian Pending', self::usAddDays($todayDay, -2),
                'Waiting on W-9 and signed ACAT LOA.', $ts - 86400 * 2,
            ]
        );

        // IRA / 401(k) Rollovers
        $db->execute(
            'INSERT INTO us_rollovers(client_id, rollover_type, current_custodian, current_account_number, receiving_custodian, receiving_account_number, estimated_value_cents, direct_or_indirect, roth_tax_acknowledged, sixty_day_deadline, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, '403b to IRA', 'TIAA-CREF', 'TC-403B-99104', 'Charles Schwab', 'SCH-IRA-55182',
                46000000, 'Direct (trustee-to-trustee)', 0, '', 'Custodian Pending',
                self::usAddDays($todayDay, -7), 'Direct trustee-to-trustee rollover; zero withholding.', $ts - 86400 * 7,
            ]
        );

        // 1035 Exchanges
        $db->execute(
            'INSERT INTO us_exchanges_1035(client_id, existing_policy_number, existing_carrier, exchange_type, new_carrier, new_policy_type, estimated_value_cents, has_surrender_charges, surrender_charges_cents, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 'PRU-VA-882410', 'Prudential', 'Annuity', 'Athene',
                'Fee-Based Advisory Fixed Indexed Annuity', 38500000, 'Yes', 420000, 'Reviewing',
                self::usAddDays($todayDay, -5),
                'Surrender schedule drops from 2% to 1% next quarter; compliance sign-off on fee savings comparison.',
                $ts - 86400 * 5,
            ]
        );

        // Beneficiary Designations (strict 100% primary allocations!)
        $db->execute(
            'INSERT INTO us_beneficiaries(client_id, account_label, primary_json, contingent_json, effective_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c1, 'Schwab Traditional IRA (SCH-99102)',
                json_encode([
                    ['name' => 'Claire Sterling', 'relationship' => 'Spouse', 'percentage' => 70],
                    ['name' => 'Lucas Sterling', 'relationship' => 'Child', 'percentage' => 30],
                ], $jsonFlags),
                json_encode([
                    ['name' => 'Sterling Family Trust', 'relationship' => 'Trust', 'percentage' => 100],
                ], $jsonFlags),
                self::usAddDays($todayDay, -180), 'Active', 'Per stirpes election noted on custodian form.', $ts - 86400 * 18,
            ]
        );

        // Power of Attorney
        $db->execute(
            'INSERT INTO us_poas(client_id, principal_name, agent_name, powers_granted_json, effective_date, witness_1_name, witness_2_name, notarized, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c3, 'Robert Caldwell', 'Margaret Caldwell',
                json_encode(['Financial', 'Real Estate', 'Legal'], $jsonFlags),
                self::usAddDays($todayDay, -150), 'Alan Brooks', 'Susan Rivera', 1, 'Active',
                'Durable Financial POA notarized in Cook County, IL; accepted by Schwab legal.', $ts - 86400 * 16,
            ]
        );

        // Annual Reviews
        $db->execute(
            'INSERT INTO us_annual_reviews(client_id, review_date, current_aum_cents, current_annual_fee_cents, goal_progress, life_changes_json, updated_risk_tolerance, advisor_notes, next_review_date, status, advisor_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            [
                $c2, self::usAddDays($todayDay, -352), 92000000, 857000, 8,
                json_encode(['Job Change'], $jsonFlags), 6,
                'Promoted to department chief; tax-loss harvesting + 403(b) consolidation scheduled.',
                self::usAddDays($todayDay, 13), 'Completed', 'Victoria Hayes', $ts - 86400 * 14,
            ]
        );

        // Document Vault
        $docs = [
            [$c1, 'Form CRS', 'SEC Form CRS Receipt & ADV Part 2A Delivery', 'CRS-JS-2026', self::usAddDays($todayDay, 155), 'Delivered electronically.'],
            [$c2, 'ID Verification', 'US Passport Copy (Expiring Soon)', 'ID-ER-402', self::usAddDays($todayDay, 21), 'Request renewed passport copy for CIP/AML file.'],
            [$c3, 'Legal Document', 'Caldwell Revocable Trust Certificate of Trust', 'TR-RC-118', '', 'Notarized and verified.'],
            [$c4, 'Tax Return', 'Form 1040 (Prior Year — Update Needed)', 'TAX-MP-2025', self::usAddDays($todayDay, -3), 'Need current year Form 1040 for tax bracket review.'],
        ];
        $docLen = count($docs);
        foreach ($docs as $i => $doc) {
            $db->execute(
                'INSERT INTO us_documents(client_id, document_type, document_name, reference_code, expiry_date, notes, uploaded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [$doc[0], $doc[1], $doc[2], $doc[3], $doc[4], $doc[5], 'Compliance Desk', $ts - ($docLen - $i) * 3600]
            );
        }

        return self::usSampleCount($db);
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
                    'display_name' => ($settings['owner_name'] ?? '') !== '' ? $settings['owner_name'] : 'Managing Advisor',
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
                'counts' => self::usBadgeCounts($db, $todayDay),
            ];
        });
    }

    public function completeSetup(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::ownerOnly($me);
            $businessName = V::text($input['business_name'] ?? null, 'business_name', ['max' => 120, 'label' => 'RIA firm name']);
            $ownerName = V::text($input['owner_name'] ?? null, 'owner_name', ['max' => 80, 'label' => 'Your name']);
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]) ?: 'SEC Registered Investment Adviser';
            $currency = V::oneOf($input['currency'] ?? null, self::US_CURRENCIES, 'currency', ['fallback' => 'USD']);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: 'America/New_York';
            $preset = V::oneOf($input['brand_preset'] ?? null, self::US_PRESETS, 'brand_preset', ['fallback' => 'federal']);
            $crd = V::text($input['crd_number'] ?? null, 'crd_number', ['required' => false, 'max' => 40]) ?: 'CRD #289410';
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $ts = V::now();

            $existing = Context::getBusinessSettings($db);
            if ($existing) {
                $db->execute(
                    'UPDATE business_settings SET setup_done = 1, business_name = ?, owner_name = ?, tagline = ?, currency = ?, timezone = ?, brand_preset = ?, crd_number = ?, updated_at = ? WHERE id = 1',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $crd, $ts]
                );
            } else {
                $db->execute(
                    'INSERT INTO business_settings(id, setup_done, business_name, owner_name, tagline, currency, timezone, brand_preset, crd_number, updated_at) VALUES(1, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$businessName, $ownerName, $tagline, $currency, $timezone, $preset, $crd, $ts]
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
                self::seedUsSample($db, $todayDay);
            }

            return [
                '__status' => 201,
                '__body' => [
                    'settings' => self::normalizeSettings(Context::getBusinessSettings($db)),
                    'counts' => self::usBadgeCounts($db, $todayDay),
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
            $tagline = V::text($input['tagline'] ?? null, 'tagline', ['required' => false, 'max' => 140]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $taxId = V::text($input['tax_id'] ?? null, 'tax_id', ['required' => false, 'max' => 60]);
            $crd = V::text($input['crd_number'] ?? null, 'crd_number', ['required' => false, 'max' => 60]);
            if ($crd === '') {
                $crd = (string) ($cur['crd_number'] ?? '');
            }
            $currency = V::oneOf($input['currency'] ?? null, self::US_CURRENCIES, 'currency', ['fallback' => $cur['currency']]);
            $taxRate = V::numVal($input['tax_rate'] ?? null, 'tax_rate', ['required' => false, 'min' => 0, 'max' => 50, 'fallback' => $cur['tax_rate']]);
            $timezone = V::text($input['timezone'] ?? null, 'timezone', ['required' => false, 'max' => 60]) ?: (string) $cur['timezone'];
            $preset = V::oneOf($input['brand_preset'] ?? null, self::US_PRESETS, 'brand_preset', ['fallback' => $cur['brand_preset']]);

            $db->execute(
                'UPDATE business_settings SET business_name = ?, tagline = ?, phone = ?, email = ?, address = ?, tax_id = ?, crd_number = ?, currency = ?, tax_rate = ?, timezone = ?, brand_preset = ?, updated_at = ? WHERE id = 1',
                [$businessName, $tagline, $phone, $em, $address, $taxId, $crd, $currency, $taxRate, $timezone, $preset, V::now()]
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
                HttpException::fail(409, 'setup_required', 'This RIA workspace is not set up yet.');
            }
            $displayName = V::text($input['display_name'] ?? null, 'display_name', ['max' => 80, 'label' => 'Your name']);
            $role = V::oneOf($input['requested_role'] ?? null, self::US_MEMBER_ROLES, 'requested_role', ['fallback' => 'advisor']);
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
            $role = V::oneOf($input['role'] ?? null, self::US_MEMBER_ROLES, 'role', ['fallback' => $target['role']]);
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
            return [
                'sampleCount' => self::seedUsSample($db, $todayDay),
                'counts' => self::usBadgeCounts($db, $todayDay),
            ];
        }, write: true);
    }

    public function clearSampleData(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            foreach (self::US_SAMPLE_TABLES as $table) {
                $db->execute("DELETE FROM {$table} WHERE is_sample = 1");
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            return ['sampleCount' => 0, 'counts' => self::usBadgeCounts($db, $todayDay)];
        }, write: true);
    }
}
