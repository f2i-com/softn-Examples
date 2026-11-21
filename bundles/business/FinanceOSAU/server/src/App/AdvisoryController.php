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

final class AdvisoryController
{
    private const AU_RESIDENCIES = ['au_citizen', 'permanent_resident', 'temporary_visa', 'non_resident'];
    private const AU_OBJECTIVES = ['growth', 'income', 'capital_preservation', 'balanced'];
    private const AU_STAGES = ['Prospect', 'Fact Find', 'SOA Prep', 'Active', 'Review Due'];
    private const AU_TFN_EXEMPT = ['none', 'under_18', 'pensioner', 'not_quoted'];
    private const AU_TAX_RES = ['au_resident', 'foreign_resident', 'working_holiday'];
    private const AU_MARKET_REACTIONS = ['sell', 'hold', 'buy'];
    private const AU_EXPERIENCES = ['none', 'limited', 'moderate', 'extensive'];
    private const AU_BANDS = ['Conservative', 'Moderately Conservative', 'Balanced', 'Growth', 'High Growth'];
    private const AU_FEE_TYPES = ['percentage', 'fixed', 'combination'];
    private const AU_BILLING_FREQS = ['monthly', 'quarterly', 'annually'];
    private const AU_CONSENTS = ['yes', 'no', 'pending'];

    public static function computeAuWholesale(int $annualIncomeCents, int $netAssetsCents): string
    {
        return ($annualIncomeCents >= 25000000 || $netAssetsCents >= 250000000) ? 'Yes' : 'No';
    }

    /** @return array{score: int, band: string} */
    public static function computeAuRiskScore(int $timeHorizon, string $marketReaction, int $lossCapacity, string $experience): array
    {
        $hPts = (int) round((min(30, max(1, $timeHorizon)) / 30.0) * 25.0);
        $lPts = (int) round(min(10, max(1, $lossCapacity)) * 3.5);
        $mPts = $marketReaction === 'buy' ? 25 : ($marketReaction === 'hold' ? 12 : 0);
        $ePts = $experience === 'extensive' ? 15 : ($experience === 'moderate' ? 10 : ($experience === 'limited' ? 5 : 0));
        $score = min(100, max(0, $hPts + $lPts + $mPts + $ePts));

        $band = 'Conservative';
        if ($score >= 83) {
            $band = 'High Growth';
        } elseif ($score >= 65) {
            $band = 'Growth';
        } elseif ($score >= 45) {
            $band = 'Balanced';
        } elseif ($score >= 25) {
            $band = 'Moderately Conservative';
        }

        return ['score' => $score, 'band' => $band];
    }

    public static function computeAuTieredFeeRate(int $portfolioCents): float
    {
        if ($portfolioCents <= 50000000) {
            return 1.1;
        }
        if ($portfolioCents <= 100000000) {
            return 0.88;
        }
        return 0.77;
    }

    /** @return array{annualCents: int, effectiveRate: float} */
    public static function computeAuAnnualFeeCents(int $portfolioCents, string $feeType, float $customRate, int $fixedFeeCents): array
    {
        $effRate = $customRate > 0.0 ? $customRate : self::computeAuTieredFeeRate($portfolioCents);
        if ($feeType === 'fixed') {
            return ['annualCents' => max(0, $fixedFeeCents), 'effectiveRate' => 0.0];
        }
        $pctCents = (int) round($portfolioCents * ($effRate / 100.0));
        if ($feeType === 'combination') {
            return ['annualCents' => $pctCents + max(0, $fixedFeeCents), 'effectiveRate' => $effRate];
        }
        return ['annualCents' => $pctCents, 'effectiveRate' => $effRate];
    }

    public static function computeDocStatus(string $expiryDate, string $todayDay): string
    {
        if ($expiryDate === '') {
            return 'Current';
        }
        if ($expiryDate < $todayDay) {
            return 'Expired';
        }
        $in30 = WorkspaceController::auAddDays($todayDay, 30);
        if ($expiryDate <= $in30) {
            return 'Expiring Soon';
        }
        return 'Current';
    }

    /** @return array<string, mixed> */
    public static function ensureAuClient(Database $db, int $clientId): array
    {
        $c = self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$clientId]));
        if ($c === null) {
            HttpException::fail(404, 'client_not_found', 'Client record not found.');
        }
        return $c;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeClient(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'age', 'annual_income_cents', 'net_assets_cents', 'liquid_assets_cents',
            'time_horizon', 'risk_tolerance', 'risk_score', 'fsg_acknowledged',
            'is_sample', 'created_at', 'updated_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeRisk(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'client_id', 'client_age', 'client_income_cents', 'client_net_assets_cents',
            'time_horizon', 'loss_capacity', 'risk_score', 'is_sample', 'created_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeFee(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'client_id', 'portfolio_value_cents', 'fixed_fee_cents',
            'calculated_annual_fee_cents', 'is_sample', 'created_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('percentage_rate', $row)) {
            $row['percentage_rate'] = (float) $row['percentage_rate'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeTransfer(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'estimated_value_cents', 'transfer_fee_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeRollover(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'client_id', 'partial_amount_cents', 'estimated_balance_cents',
            'insurance_checked', 'is_sample', 'created_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeBdbn(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'witness_1_over_18', 'witness_2_over_18', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        $prim = V::parseJson($row['primary_json'] ?? '', []);
        $cont = V::parseJson($row['contingent_json'] ?? '', []);
        $row['primary_beneficiaries'] = is_array($prim) ? $prim : [];
        $row['contingent_beneficiaries'] = is_array($cont) ? $cont : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeReview(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'client_id', 'current_portfolio_value_cents', 'current_annual_fee_cents',
            'goal_progress', 'updated_risk_tolerance', 'soa_required', 'is_sample', 'created_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        $lc = V::parseJson($row['life_changes_json'] ?? '', []);
        $row['life_changes'] = is_array($lc) ? $lc : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeDocument(?array $row, string $todayDay): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['doc_status'] = self::computeDocStatus((string) ($row['expiry_date'] ?? ''), $todayDay);
        return $row;
    }

    // ---- Workbench Summary ----

    public function getWorkbench(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $in30 = WorkspaceController::auAddDays($todayDay, 30);

            $clients = array_map(
                [self::class, 'normalizeClient'],
                $db->query('SELECT * FROM au_clients ORDER BY updated_at DESC')
            );
            $reviewsDue = array_map(
                [self::class, 'normalizeReview'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM au_annual_reviews r JOIN au_clients c ON c.id = r.client_id WHERE r.next_review_date <= ? ORDER BY r.next_review_date ASC LIMIT 20',
                    [$in30]
                )
            );
            $pendingFees = array_map(
                [self::class, 'normalizeFee'],
                $db->query(
                    "SELECT f.*, c.first_name, c.last_name FROM au_fee_disclosures f JOIN au_clients c ON c.id = f.client_id WHERE f.ongoing_fee_consent != 'yes' ORDER BY f.renewal_due_date ASC LIMIT 20"
                )
            );
            $expiringDocs = array_map(
                static fn (array $r): array => self::normalizeDocument($r, $todayDay) ?? $r,
                $db->query(
                    "SELECT d.*, c.first_name, c.last_name FROM au_documents d JOIN au_clients c ON c.id = d.client_id WHERE d.expiry_date != '' AND d.expiry_date <= ? ORDER BY d.expiry_date ASC LIMIT 20",
                    [$in30]
                )
            );
            $expiringBdbns = array_map(
                [self::class, 'normalizeBdbn'],
                $db->query(
                    "SELECT b.*, c.first_name, c.last_name FROM au_bdbns b JOIN au_clients c ON c.id = b.client_id WHERE b.status = 'Active' AND b.expiry_date != '' AND b.expiry_date <= ? ORDER BY b.expiry_date ASC LIMIT 20",
                    [$in30]
                )
            );
            $openTransfers = array_map(
                [self::class, 'normalizeTransfer'],
                $db->query(
                    "SELECT t.*, c.first_name, c.last_name FROM au_off_market_transfers t JOIN au_clients c ON c.id = t.client_id WHERE t.status IN ('Draft', 'Submitted', 'In Transit') ORDER BY t.created_at DESC LIMIT 12"
                )
            );

            return [
                'today' => $todayDay,
                'counts' => WorkspaceController::auBadgeCounts($db, $todayDay),
                'clients' => $clients,
                'reviewsDue' => $reviewsDue,
                'pendingFees' => $pendingFees,
                'expiringDocs' => $expiringDocs,
                'expiringBdbns' => $expiringBdbns,
                'openTransfers' => $openTransfers,
            ];
        });
    }

    // ---- Clients & Master Advice File ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $stage = V::text($input['stage'] ?? null, 'stage', ['required' => false, 'max' => 30]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 80]);

            $sql = 'SELECT * FROM au_clients WHERE 1=1';
            $params = [];
            if ($stage !== '' && $stage !== 'All') {
                if ($stage === 'Wholesale') {
                    $sql .= " AND wholesale_status = 'Yes'";
                } elseif ($stage === 'FSG Pending') {
                    $sql .= ' AND fsg_acknowledged = 0';
                } else {
                    $sql .= ' AND onboarding_stage = ?';
                    $params[] = $stage;
                }
            }
            if ($q !== '') {
                $like = V::likeTerm($q);
                $sql .= " AND (first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR adviser_name LIKE ? ESCAPE '\\')";
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }
            $sql .= ' ORDER BY updated_at DESC, id DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeClient'], $db->query($sql, $params));
            return ['clients' => $rows];
        });
    }

    public function getClientDetail(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $client = self::ensureAuClient($db, $id);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $risks = array_map(
                [self::class, 'normalizeRisk'],
                $db->query('SELECT * FROM au_risk_profiles WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $fees = array_map(
                [self::class, 'normalizeFee'],
                $db->query('SELECT * FROM au_fee_disclosures WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $transfers = array_map(
                [self::class, 'normalizeTransfer'],
                $db->query('SELECT * FROM au_off_market_transfers WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $rollovers = array_map(
                [self::class, 'normalizeRollover'],
                $db->query('SELECT * FROM au_super_rollovers WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $bdbns = array_map(
                [self::class, 'normalizeBdbn'],
                $db->query('SELECT * FROM au_bdbns WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $reviews = array_map(
                [self::class, 'normalizeReview'],
                $db->query('SELECT * FROM au_annual_reviews WHERE client_id = ? ORDER BY review_date DESC', [$id])
            );
            $docs = array_map(
                static fn (array $r): array => self::normalizeDocument($r, $todayDay) ?? $r,
                $db->query('SELECT * FROM au_documents WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );

            return [
                'client' => $client,
                'risks' => $risks,
                'fees' => $fees,
                'transfers' => $transfers,
                'rollovers' => $rollovers,
                'bdbns' => $bdbns,
                'reviews' => $reviews,
                'documents' => $docs,
            ];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $firstName = V::text($input['first_name'] ?? null, 'first_name', ['max' => 80, 'label' => 'First name']);
            $lastName = V::text($input['last_name'] ?? null, 'last_name', ['max' => 80, 'label' => 'Last name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $dob = V::day($input['dob'] ?? null, 'dob', ['required' => false, 'fallback' => '']);
            $age = (int) (V::int($input['age'] ?? null, 'age', ['required' => false, 'min' => 18, 'max' => 120, 'fallback' => 40]) ?? 40);
            $tfn = V::text($input['tfn'] ?? null, 'tfn', ['required' => false, 'max' => 20]);
            if ($tfn !== '' && !preg_match('/^\d{3}-?\d{3}-?\d{3}$/', $tfn)) {
                HttpException::fail(422, 'tfn_invalid', 'Enter a valid 9-digit TFN (e.g. 123-456-789).', 'tfn');
            }
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300]);
            $residency = V::oneOf($input['residency_status'] ?? null, self::AU_RESIDENCIES, 'residency_status', ['fallback' => 'au_citizen']);
            $employer = V::text($input['employer'] ?? null, 'employer', ['required' => false, 'max' => 120]);
            $occupation = V::text($input['occupation'] ?? null, 'occupation', ['required' => false, 'max' => 120]);
            $annualIncome = V::moneyCents($input['annual_income'] ?? null, 'annual_income', ['required' => false, 'min' => 0, 'max' => 100000000000, 'fallback' => 0]);
            $netAssets = V::moneyCents($input['net_assets'] ?? null, 'net_assets', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0]);
            $liquidAssets = V::moneyCents($input['liquid_assets'] ?? null, 'liquid_assets', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0]);
            $objectives = V::oneOf($input['investment_objectives'] ?? null, self::AU_OBJECTIVES, 'investment_objectives', ['fallback' => 'balanced']);
            $horizon = (int) (V::int($input['time_horizon'] ?? null, 'time_horizon', ['required' => false, 'min' => 1, 'max' => 30, 'fallback' => 10]) ?? 10);
            $riskTol = (int) (V::int($input['risk_tolerance'] ?? null, 'risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => 5]) ?? 5);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::AU_STAGES, 'onboarding_stage', ['fallback' => 'Prospect']);
            $adviser = V::text($input['adviser_name'] ?? null, 'adviser_name', ['required' => false, 'max' => 80]) ?: (string) $ctx['member']['display_name'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 2000]);

            $riskScore = min(100, max(1, (int) round(($riskTol * 5) + ($horizon * 2) + ((120 - $age) / 2.0))));
            $wholesale = self::computeAuWholesale($annualIncome, $netAssets);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO au_clients(first_name, last_name, email, phone, dob, age, tfn, address, residency_status, employer, occupation, annual_income_cents, net_assets_cents, liquid_assets_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, wholesale_status, onboarding_stage, adviser_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [
                    $firstName, $lastName, $em, $phone, $dob, $age, $tfn, $address, $residency, $employer, $occupation,
                    $annualIncome, $netAssets, $liquidAssets, $objectives, $horizon, $riskTol, $riskScore,
                    $wholesale, $stage, $adviser, $notes, $ts, $ts,
                ]
            );
            $row = self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['client' => $row]];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::ensureAuClient($db, $id);

            $firstName = V::text($input['first_name'] ?? null, 'first_name', ['max' => 80, 'label' => 'First name']);
            $lastName = V::text($input['last_name'] ?? null, 'last_name', ['max' => 80, 'label' => 'Last name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $dob = V::day($input['dob'] ?? null, 'dob', ['required' => false, 'fallback' => (string) $cur['dob']]);
            $age = (int) (V::int($input['age'] ?? null, 'age', ['required' => false, 'min' => 18, 'max' => 120, 'fallback' => (int) $cur['age']]) ?? (int) $cur['age']);
            $tfn = V::text($input['tfn'] ?? null, 'tfn', ['required' => false, 'max' => 20]);
            if ($tfn !== '' && !preg_match('/^\d{3}-?\d{3}-?\d{3}$/', $tfn)) {
                HttpException::fail(422, 'tfn_invalid', 'Enter a valid 9-digit TFN (e.g. 123-456-789).', 'tfn');
            }
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300]);
            $residency = V::oneOf($input['residency_status'] ?? null, self::AU_RESIDENCIES, 'residency_status', ['fallback' => $cur['residency_status']]);
            $employer = V::text($input['employer'] ?? null, 'employer', ['required' => false, 'max' => 120]);
            $occupation = V::text($input['occupation'] ?? null, 'occupation', ['required' => false, 'max' => 120]);
            $annualIncome = array_key_exists('annual_income', $input)
                ? V::moneyCents($input['annual_income'], 'annual_income', ['required' => false, 'min' => 0, 'max' => 100000000000, 'fallback' => 0])
                : (int) $cur['annual_income_cents'];
            $netAssets = array_key_exists('net_assets', $input)
                ? V::moneyCents($input['net_assets'], 'net_assets', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0])
                : (int) $cur['net_assets_cents'];
            $liquidAssets = array_key_exists('liquid_assets', $input)
                ? V::moneyCents($input['liquid_assets'], 'liquid_assets', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0])
                : (int) $cur['liquid_assets_cents'];
            $objectives = V::oneOf($input['investment_objectives'] ?? null, self::AU_OBJECTIVES, 'investment_objectives', ['fallback' => $cur['investment_objectives']]);
            $horizon = (int) (V::int($input['time_horizon'] ?? null, 'time_horizon', ['required' => false, 'min' => 1, 'max' => 30, 'fallback' => (int) $cur['time_horizon']]) ?? (int) $cur['time_horizon']);
            $riskTol = (int) (V::int($input['risk_tolerance'] ?? null, 'risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => (int) $cur['risk_tolerance']]) ?? (int) $cur['risk_tolerance']);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::AU_STAGES, 'onboarding_stage', ['fallback' => $cur['onboarding_stage']]);
            $adviser = V::text($input['adviser_name'] ?? null, 'adviser_name', ['required' => false, 'max' => 80]) ?: (string) $cur['adviser_name'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 2000]);

            $riskScore = min(100, max(1, (int) round(($riskTol * 5) + ($horizon * 2) + ((120 - $age) / 2.0))));
            $wholesale = self::computeAuWholesale($annualIncome, $netAssets);

            $db->execute(
                'UPDATE au_clients SET first_name = ?, last_name = ?, email = ?, phone = ?, dob = ?, age = ?, tfn = ?, address = ?, residency_status = ?, employer = ?, occupation = ?, annual_income_cents = ?, net_assets_cents = ?, liquid_assets_cents = ?, investment_objectives = ?, time_horizon = ?, risk_tolerance = ?, risk_score = ?, wholesale_status = ?, onboarding_stage = ?, adviser_name = ?, notes = ?, updated_at = ? WHERE id = ?',
                [
                    $firstName, $lastName, $em, $phone, $dob, $age, $tfn, $address, $residency, $employer, $occupation,
                    $annualIncome, $netAssets, $liquidAssets, $objectives, $horizon, $riskTol, $riskScore,
                    $wholesale, $stage, $adviser, $notes, V::now(), $id,
                ]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setClientStage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureAuClient($db, $id);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::AU_STAGES, 'onboarding_stage');
            $db->execute('UPDATE au_clients SET onboarding_stage = ?, updated_at = ? WHERE id = ?', [$stage, V::now(), $id]);
            return ['client' => self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function recordFsgAck(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::ensureAuClient($db, $id);
            $ackDate = V::day($input['acknowledgement_date'] ?? null, 'acknowledgement_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $signer = V::text($input['client_signature'] ?? null, 'client_signature', ['max' => 120, 'label' => 'Client signature / name']);
            $db->execute(
                'UPDATE au_clients SET fsg_acknowledged = 1, fsg_ack_date = ?, fsg_signer = ?, updated_at = ? WHERE id = ?',
                [$ackDate, $signer, V::now(), $id]
            );
            return [
                'client' => self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$id])),
                'previousStage' => $cur['onboarding_stage'],
            ];
        }, write: true);
    }

    public function saveTfnDecl(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::ensureAuClient($db, $id);
            $exemption = V::oneOf($input['tfn_exemption'] ?? null, self::AU_TFN_EXEMPT, 'tfn_exemption', ['fallback' => 'none']);
            $tfn = V::text($input['tfn'] ?? null, 'tfn', ['required' => $exemption === 'none', 'max' => 20, 'label' => 'Tax File Number']);
            if ($tfn !== '' && !preg_match('/^\d{3}-?\d{3}-?\d{3}$/', $tfn)) {
                HttpException::fail(422, 'tfn_invalid', 'Enter a valid 9-digit TFN (e.g. 123-456-789).', 'tfn');
            }
            $taxRes = V::oneOf($input['residency_for_tax'] ?? null, self::AU_TAX_RES, 'residency_for_tax', ['fallback' => 'au_resident']);
            $threshold = V::oneOf($input['tax_free_threshold'] ?? null, ['yes', 'no'], 'tax_free_threshold', ['fallback' => 'yes']);
            $hecs = V::oneOf($input['has_hecs_help'] ?? null, ['yes', 'no'], 'has_hecs_help', ['fallback' => 'no']);
            $declDate = V::day($input['declaration_date'] ?? null, 'declaration_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $db->execute(
                'UPDATE au_clients SET tfn = ?, tfn_exemption = ?, residency_for_tax = ?, tax_free_threshold = ?, has_hecs_help = ?, tfn_declared_date = ?, updated_at = ? WHERE id = ?',
                [$tfn !== '' ? $tfn : (string) $cur['tfn'], $exemption, $taxRes, $threshold, $hecs, $declDate, V::now(), $id]
            );
            return [
                'client' => self::normalizeClient($db->first('SELECT * FROM au_clients WHERE id = ?', [$id])),
                'withholdingWarning' => $exemption === 'not_quoted',
            ];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureAuClient($db, $id);
            $db->execute('DELETE FROM au_documents WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_annual_reviews WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_bdbns WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_super_rollovers WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_off_market_transfers WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_fee_disclosures WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_risk_profiles WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM au_clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Risk Profile Assessment Scorer ----

    public function listRiskProfiles(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $band = V::text($input['band'] ?? null, 'band', ['required' => false, 'max' => 40]);
            $sql = 'SELECT r.*, c.first_name, c.last_name, c.wholesale_status FROM au_risk_profiles r JOIN au_clients c ON c.id = r.client_id WHERE 1=1';
            $params = [];
            if ($band !== '' && $band !== 'All') {
                $sql .= ' AND r.profile_band = ?';
                $params[] = $band;
            }
            $sql .= ' ORDER BY r.created_at DESC LIMIT 150';
            $rows = array_map([self::class, 'normalizeRisk'], $db->query($sql, $params));
            return ['assessments' => $rows];
        });
    }

    public function addRiskProfile(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = self::ensureAuClient($db, $clientId);

            $clientAge = (int) (V::int($input['client_age'] ?? null, 'client_age', ['required' => false, 'min' => 18, 'max' => 120, 'fallback' => (int) $client['age']]) ?? (int) $client['age']);
            $hasIncome = array_key_exists('client_income', $input) && $input['client_income'] !== null && $input['client_income'] !== '';
            $incomeCents = $hasIncome
                ? V::moneyCents($input['client_income'], 'client_income', ['min' => 0, 'max' => 100000000000])
                : (int) $client['annual_income_cents'];
            $hasNet = array_key_exists('client_net_assets', $input) && $input['client_net_assets'] !== null && $input['client_net_assets'] !== '';
            $netAssetsCents = $hasNet
                ? V::moneyCents($input['client_net_assets'], 'client_net_assets', ['min' => 0, 'max' => 1000000000000])
                : (int) $client['net_assets_cents'];
            $horizon = (int) V::int($input['time_horizon'] ?? null, 'time_horizon', ['min' => 1, 'max' => 30, 'label' => 'Time horizon']);
            $reaction = V::oneOf($input['market_reaction'] ?? null, self::AU_MARKET_REACTIONS, 'market_reaction', ['label' => 'Market drop reaction']);
            $lossCap = (int) V::int($input['loss_capacity'] ?? null, 'loss_capacity', ['min' => 1, 'max' => 10, 'label' => 'Loss capacity']);
            $experience = V::oneOf($input['investment_experience'] ?? null, self::AU_EXPERIENCES, 'investment_experience', ['label' => 'Investment experience']);
            $notes = V::text($input['best_interest_notes'] ?? null, 'best_interest_notes', ['required' => false, 'max' => 2000]);
            $assessedDate = V::day($input['assessed_date'] ?? null, 'assessed_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $calc = self::computeAuRiskScore($horizon, $reaction, $lossCap, $experience);
            $recommended = V::oneOf($input['recommended_profile'] ?? null, self::AU_BANDS, 'recommended_profile', ['fallback' => $calc['band']]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO au_risk_profiles(client_id, client_age, client_income_cents, client_net_assets_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, profile_band, recommended_profile, best_interest_notes, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, $clientAge, $incomeCents, $netAssetsCents, $horizon, $reaction, $lossCap, $experience,
                    $calc['score'], $calc['band'], $recommended, $notes, $assessedDate, (string) $ctx['member']['display_name'], $ts,
                ]
            );
            $db->execute(
                'UPDATE au_clients SET risk_score = ?, time_horizon = ?, updated_at = ? WHERE id = ?',
                [$calc['score'], $horizon, $ts, $clientId]
            );

            $row = self::normalizeRisk($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM au_risk_profiles r JOIN au_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['assessment' => $row]];
        }, write: true);
    }

    public function deleteRiskProfile(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_risk_profiles WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Risk assessment not found.');
            }
            $db->execute('DELETE FROM au_risk_profiles WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Fee Disclosure Statements (FDS) ----

    public function listFeeDisclosures(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $consent = V::text($input['consent'] ?? null, 'consent', ['required' => false, 'max' => 20]);
            $sql = 'SELECT f.*, c.first_name, c.last_name, c.email AS client_email FROM au_fee_disclosures f JOIN au_clients c ON c.id = f.client_id WHERE 1=1';
            $params = [];
            if ($consent !== '' && $consent !== 'All') {
                $sql .= ' AND f.ongoing_fee_consent = ?';
                $params[] = $consent;
            }
            $sql .= ' ORDER BY f.created_at DESC LIMIT 150';
            $rows = array_map([self::class, 'normalizeFee'], $db->query($sql, $params));
            return ['fees' => $rows];
        });
    }

    public function addFeeDisclosure(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            self::ensureAuClient($db, $clientId);

            $portfolioCents = V::moneyCents($input['portfolio_value'] ?? null, 'portfolio_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Portfolio value']);
            $feeType = V::oneOf($input['fee_type'] ?? null, self::AU_FEE_TYPES, 'fee_type', ['fallback' => 'percentage']);
            $customRate = V::numVal($input['percentage_rate'] ?? null, 'percentage_rate', ['required' => false, 'min' => 0, 'max' => 10, 'fallback' => 0]);
            $fixedFeeCents = V::moneyCents($input['fixed_fee'] ?? null, 'fixed_fee', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0]);
            $billing = V::oneOf($input['billing_frequency'] ?? null, self::AU_BILLING_FREQS, 'billing_frequency', ['fallback' => 'quarterly']);
            $consent = V::oneOf($input['ongoing_fee_consent'] ?? null, self::AU_CONSENTS, 'ongoing_fee_consent', ['fallback' => 'pending']);
            $effectiveDate = V::day($input['effective_date'] ?? null, 'effective_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $renewalDue = V::day($input['renewal_due_date'] ?? null, 'renewal_due_date', ['required' => false, 'fallback' => WorkspaceController::auAddYears($effectiveDate, 1)]);
            $signer = V::text($input['client_signer'] ?? null, 'client_signer', ['required' => false, 'max' => 120]);
            $consentDate = $consent === 'yes'
                ? V::day($input['consent_signed_date'] ?? null, 'consent_signed_date', ['required' => false, 'fallback' => $effectiveDate])
                : '';
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1200]);

            if ($feeType === 'fixed' && $fixedFeeCents <= 0) {
                HttpException::fail(422, 'fixed_fee_required', 'Enter a fixed annual fee greater than $0.', 'fixed_fee');
            }

            $calc = self::computeAuAnnualFeeCents($portfolioCents, $feeType, $customRate, $fixedFeeCents);
            $created = $db->execute(
                'INSERT INTO au_fee_disclosures(client_id, portfolio_value_cents, fee_type, percentage_rate, fixed_fee_cents, calculated_annual_fee_cents, billing_frequency, ongoing_fee_consent, consent_signed_date, effective_date, renewal_due_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, $portfolioCents, $feeType, $calc['effectiveRate'], $fixedFeeCents, $calc['annualCents'],
                    $billing, $consent, $consentDate, $effectiveDate, $renewalDue, $signer, $notes, V::now(),
                ]
            );
            $row = self::normalizeFee($db->first(
                'SELECT f.*, c.first_name, c.last_name FROM au_fee_disclosures f JOIN au_clients c ON c.id = f.client_id WHERE f.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['fee' => $row]];
        }, write: true);
    }

    public function setFeeConsent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM au_fee_disclosures WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Fee disclosure record not found.');
            }
            $consent = V::oneOf($input['ongoing_fee_consent'] ?? null, self::AU_CONSENTS, 'ongoing_fee_consent');
            $signer = V::text($input['client_signer'] ?? null, 'client_signer', ['required' => false, 'max' => 120]) ?: (string) $cur['client_signer'];
            $signedDate = $consent === 'yes'
                ? V::day($input['consent_signed_date'] ?? null, 'consent_signed_date', ['required' => false, 'fallback' => V::utcDay(0)])
                : '';

            $db->execute(
                'UPDATE au_fee_disclosures SET ongoing_fee_consent = ?, client_signer = ?, consent_signed_date = ? WHERE id = ?',
                [$consent, $signer, $signedDate, $id]
            );
            $row = self::normalizeFee($db->first(
                'SELECT f.*, c.first_name, c.last_name FROM au_fee_disclosures f JOIN au_clients c ON c.id = f.client_id WHERE f.id = ?',
                [$id]
            ));
            return ['fee' => $row];
        }, write: true);
    }

    public function deleteFeeDisclosure(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_fee_disclosures WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Fee disclosure not found.');
            }
            $db->execute('DELETE FROM au_fee_disclosures WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
