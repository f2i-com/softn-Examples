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

final class RiaAdvisoryController
{
    private const US_CITIZENSHIPS = ['us', 'permanent_resident', 'non_resident_alien', 'dual'];
    private const US_OBJECTIVES = ['growth', 'income', 'capital_preservation', 'speculation', 'balanced'];
    private const US_STAGES = ['Prospect', 'Discovery', 'ACAT & Paperwork', 'Active', 'Review Due'];
    private const US_W9_CLASSES = ['individual', 'llc', 'corporation', 'partnership', 'trust', 'other'];
    private const US_REACTIONS = ['sell', 'sell_some', 'hold', 'buy_more'];
    private const US_EXPS = ['none', 'limited', 'moderate', 'extensive'];
    private const US_PORTFOLIOS = ['Conservative', 'Moderate', 'Aggressive', 'Speculative'];
    private const US_FEE_TIERS = ['Standard', 'Premium', 'Institutional'];
    private const US_BILLINGS = ['Monthly', 'Quarterly', 'Annually'];
    private const US_FEE_STATUSES = ['Draft', 'Executed', 'Superseded'];

    public static function computeUsAccredited(int $incomeCents, int $netWorthCents): string
    {
        return ($incomeCents > 20000000 || $netWorthCents > 100000000) ? 'Yes' : 'No';
    }

    /** @return array{score: int, band: string, allocation: string, portfolioType: string, regBiCheck: string} */
    public static function computeUsRisk(
        int $timeHorizon,
        string $marketReaction,
        int $lossCapacity,
        string $experience,
        string $selectedPortfolio = ''
    ): array {
        $hPts = (int) round((min(30, max(1, $timeHorizon)) / 30.0) * 25.0);
        $lPts = (int) round(min(10, max(1, $lossCapacity)) * 3.5);
        $mPts = $marketReaction === 'buy_more'
            ? 25
            : ($marketReaction === 'hold' ? 16 : ($marketReaction === 'sell_some' ? 8 : 0));
        $ePts = $experience === 'extensive'
            ? 15
            : ($experience === 'moderate' ? 10 : ($experience === 'limited' ? 5 : 0));
        $score = min(100, max(0, $hPts + $lPts + $mPts + $ePts));

        $band = 'Conservative';
        $alloc = '25/60/15';
        $defaultPort = 'Conservative';
        if ($score >= 82) {
            $band = 'Aggressive';
            $alloc = '90/5/5';
            $defaultPort = 'Aggressive';
        } elseif ($score >= 65) {
            $band = 'Growth';
            $alloc = '75/20/5';
            $defaultPort = 'Aggressive';
        } elseif ($score >= 45) {
            $band = 'Moderate';
            $alloc = '60/30/10';
            $defaultPort = 'Moderate';
        } elseif ($score >= 25) {
            $band = 'Moderate Conservative';
            $alloc = '40/45/15';
            $defaultPort = 'Conservative';
        }

        $port = $selectedPortfolio !== '' ? $selectedPortfolio : $defaultPort;
        $regBi = 'Suitable';
        if ($score >= 70 && $port === 'Conservative') {
            $regBi = 'Review needed';
        }
        if ($score < 35 && ($port === 'Aggressive' || $port === 'Speculative')) {
            $regBi = 'Review needed';
        }

        return [
            'score' => $score,
            'band' => $band,
            'allocation' => $alloc,
            'portfolioType' => $port,
            'regBiCheck' => $regBi,
        ];
    }

    /**
     * Progressive marginal AUM fee schedule calculation across Standard, Premium, and Institutional tiers.
     *
     * @return array{
     *   annualCents: int,
     *   quarterlyCents: int,
     *   monthlyCents: int,
     *   effectiveBps: float,
     *   breakdown: list<array{bracket: string, slice_cents: int, fee_cents: int}>
     * }
     */
    public static function computeTieredAumFee(int $accountCents, string $tier): array
    {
        if ($tier === 'Institutional') {
            $brackets = [
                ['cap' => 100000000, 'rate' => 0.0055, 'label' => 'First $1,000,000 @ 0.55%'],
                ['cap' => null, 'rate' => 0.0040, 'label' => 'Above $1,000,000 @ 0.40%'],
            ];
        } elseif ($tier === 'Premium') {
            $brackets = [
                ['cap' => 50000000, 'rate' => 0.0085, 'label' => 'First $500,000 @ 0.85%'],
                ['cap' => 100000000, 'rate' => 0.0070, 'label' => 'Next $500,000 @ 0.70%'],
                ['cap' => null, 'rate' => 0.0055, 'label' => 'Above $1,000,000 @ 0.55%'],
            ];
        } else {
            $brackets = [
                ['cap' => 50000000, 'rate' => 0.0100, 'label' => 'First $500,000 @ 1.00%'],
                ['cap' => 100000000, 'rate' => 0.0085, 'label' => 'Next $500,000 @ 0.85%'],
                ['cap' => null, 'rate' => 0.0070, 'label' => 'Above $1,000,000 @ 0.70%'],
            ];
        }

        $prev = 0;
        $totalAnnual = 0;
        $breakdown = [];
        foreach ($brackets as $b) {
            if ($accountCents <= $prev) {
                break;
            }
            $slice = $b['cap'] === null ? ($accountCents - $prev) : (min($accountCents, $b['cap']) - $prev);
            if ($slice > 0) {
                $fee = (int) round($slice * $b['rate']);
                $totalAnnual += $fee;
                $breakdown[] = [
                    'bracket' => $b['label'],
                    'slice_cents' => $slice,
                    'fee_cents' => $fee,
                ];
            }
            if ($b['cap'] === null) {
                break;
            }
            $prev = $b['cap'];
        }

        $effBps = $accountCents > 0 ? round(($totalAnnual / $accountCents) * 100000.0) / 10.0 : 0.0;

        return [
            'annualCents' => $totalAnnual,
            'quarterlyCents' => (int) round($totalAnnual / 4.0),
            'monthlyCents' => (int) round($totalAnnual / 12.0),
            'effectiveBps' => $effBps,
            'breakdown' => $breakdown,
        ];
    }

    public static function computeUsDocStatus(string $expiryDate, string $todayDay): string
    {
        if ($expiryDate === '') {
            return 'Current';
        }
        if ($expiryDate < $todayDay) {
            return 'Expired';
        }
        $in30 = WorkspaceController::usAddDays($todayDay, 30);
        if ($expiryDate <= $in30) {
            return 'Expiring Soon';
        }
        return 'Current';
    }

    /** @return array<string, mixed> */
    public static function ensureUsClient(Database $db, int $clientId): array
    {
        $c = self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$clientId]));
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
            'id', 'age', 'annual_income_cents', 'net_worth_cents', 'liquid_net_worth_cents',
            'time_horizon', 'risk_tolerance', 'risk_score', 'crs_acknowledged',
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
            'id', 'client_id', 'client_age', 'client_income_cents', 'client_net_worth_cents',
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
            'id', 'client_id', 'account_value_cents', 'annual_fee_cents',
            'quarterly_fee_cents', 'monthly_fee_cents', 'is_sample', 'created_at',
        ] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('effective_bps', $row)) {
            $row['effective_bps'] = (float) $row['effective_bps'];
        }
        $bd = V::parseJson($row['tier_breakdown_json'] ?? '', []);
        $row['tier_breakdown'] = is_array($bd) ? $bd : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeAcat(?array $row): ?array
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
        foreach (['id', 'client_id', 'estimated_value_cents', 'roth_tax_acknowledged', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeExchange(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'estimated_value_cents', 'surrender_charges_cents', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeBeneficiary(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'is_sample', 'created_at'] as $col) {
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
    public static function normalizePoa(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'notarized', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (int) $row[$col];
            }
        }
        $powers = V::parseJson($row['powers_granted_json'] ?? '', []);
        $row['powers_granted'] = is_array($powers) ? $powers : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    public static function normalizeReview(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach ([
            'id', 'client_id', 'current_aum_cents', 'current_annual_fee_cents',
            'goal_progress', 'updated_risk_tolerance', 'is_sample', 'created_at',
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
        $row['doc_status'] = self::computeUsDocStatus((string) ($row['expiry_date'] ?? ''), $todayDay);
        return $row;
    }

    // ---- RIA Desk Summary ----

    public function getDeskSummary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $in30 = WorkspaceController::usAddDays($todayDay, 30);

            $clients = array_map(
                [self::class, 'normalizeClient'],
                $db->query('SELECT * FROM us_clients ORDER BY updated_at DESC')
            );
            $acats = array_map(
                [self::class, 'normalizeAcat'],
                $db->query(
                    "SELECT t.*, c.first_name, c.last_name FROM us_acat_transfers t JOIN us_clients c ON c.id = t.client_id WHERE t.status IN ('Initiated', 'Custodian Pending', 'In Transit') ORDER BY t.created_at DESC LIMIT 12"
                )
            );
            $rollovers = array_map(
                [self::class, 'normalizeRollover'],
                $db->query(
                    "SELECT r.*, c.first_name, c.last_name FROM us_rollovers r JOIN us_clients c ON c.id = r.client_id WHERE r.status IN ('Initiated', 'Custodian Pending') ORDER BY r.created_at DESC LIMIT 12"
                )
            );
            $exchanges = array_map(
                [self::class, 'normalizeExchange'],
                $db->query(
                    "SELECT e.*, c.first_name, c.last_name FROM us_exchanges_1035 e JOIN us_clients c ON c.id = e.client_id WHERE e.status IN ('Reviewing', 'Submitted', 'Carrier Transfer') ORDER BY e.created_at DESC LIMIT 12"
                )
            );
            $reviewsDue = array_map(
                [self::class, 'normalizeReview'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM us_annual_reviews r JOIN us_clients c ON c.id = r.client_id WHERE r.next_review_date <= ? ORDER BY r.next_review_date ASC LIMIT 20',
                    [$in30]
                )
            );
            $expiringDocs = array_map(
                static fn (array $r): array => self::normalizeDocument($r, $todayDay) ?? $r,
                $db->query(
                    "SELECT d.*, c.first_name, c.last_name FROM us_documents d JOIN us_clients c ON c.id = d.client_id WHERE d.expiry_date != '' AND d.expiry_date <= ? ORDER BY d.expiry_date ASC LIMIT 20",
                    [$in30]
                )
            );

            return [
                'today' => $todayDay,
                'counts' => WorkspaceController::usBadgeCounts($db, $todayDay),
                'clients' => $clients,
                'acats' => $acats,
                'rollovers' => $rollovers,
                'exchanges' => $exchanges,
                'reviewsDue' => $reviewsDue,
                'expiringDocs' => $expiringDocs,
            ];
        });
    }

    // ---- Clients, Form CRS & W-9 ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $filter = V::text($input['filter'] ?? null, 'filter', ['required' => false, 'max' => 40]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 80]);

            $sql = 'SELECT * FROM us_clients WHERE 1=1';
            $params = [];
            if ($filter !== '' && $filter !== 'All') {
                if ($filter === 'Accredited') {
                    $sql .= " AND accredited_investor = 'Yes'";
                } elseif ($filter === 'CRS Pending') {
                    $sql .= ' AND crs_acknowledged = 0';
                } else {
                    $sql .= ' AND onboarding_stage = ?';
                    $params[] = $filter;
                }
            }
            if ($q !== '') {
                $like = V::likeTerm($q);
                $sql .= " AND (first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR advisor_name LIKE ? ESCAPE '\\')";
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
            $client = self::ensureUsClient($db, $id);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $risks = array_map(
                [self::class, 'normalizeRisk'],
                $db->query('SELECT * FROM us_risk_assessments WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $fees = array_map(
                [self::class, 'normalizeFee'],
                $db->query('SELECT * FROM us_fee_agreements WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $acats = array_map(
                [self::class, 'normalizeAcat'],
                $db->query('SELECT * FROM us_acat_transfers WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $rollovers = array_map(
                [self::class, 'normalizeRollover'],
                $db->query('SELECT * FROM us_rollovers WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $exchanges = array_map(
                [self::class, 'normalizeExchange'],
                $db->query('SELECT * FROM us_exchanges_1035 WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $beneficiaries = array_map(
                [self::class, 'normalizeBeneficiary'],
                $db->query('SELECT * FROM us_beneficiaries WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $poas = array_map(
                [self::class, 'normalizePoa'],
                $db->query('SELECT * FROM us_poas WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );
            $reviews = array_map(
                [self::class, 'normalizeReview'],
                $db->query('SELECT * FROM us_annual_reviews WHERE client_id = ? ORDER BY review_date DESC', [$id])
            );
            $docs = array_map(
                static fn (array $r): array => self::normalizeDocument($r, $todayDay) ?? $r,
                $db->query('SELECT * FROM us_documents WHERE client_id = ? ORDER BY created_at DESC', [$id])
            );

            return [
                'client' => $client,
                'risks' => $risks,
                'fees' => $fees,
                'acats' => $acats,
                'rollovers' => $rollovers,
                'exchanges' => $exchanges,
                'beneficiaries' => $beneficiaries,
                'poas' => $poas,
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
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $dob = V::day($input['dob'] ?? null, 'dob', ['required' => false, 'fallback' => '']);
            $age = (int) (V::int($input['age'] ?? null, 'age', ['required' => false, 'min' => 18, 'max' => 120, 'fallback' => 45]) ?? 45);
            $ssn = V::text($input['ssn'] ?? null, 'ssn', ['required' => false, 'max' => 20]);
            if ($ssn !== '' && !preg_match('/^\d{3}-?\d{2}-?\d{4}$/', $ssn)) {
                HttpException::fail(422, 'ssn_invalid', 'Enter a valid SSN (e.g. 123-45-6789).', 'ssn');
            }
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300]);
            $citizenship = V::oneOf($input['citizenship'] ?? null, self::US_CITIZENSHIPS, 'citizenship', ['fallback' => 'us']);
            $employer = V::text($input['employer'] ?? null, 'employer', ['required' => false, 'max' => 120]);
            $occupation = V::text($input['occupation'] ?? null, 'occupation', ['required' => false, 'max' => 120]);
            $income = V::moneyCents($input['annual_income'] ?? null, 'annual_income', ['required' => false, 'min' => 0, 'max' => 100000000000, 'fallback' => 0]);
            $netWorth = V::moneyCents($input['net_worth'] ?? null, 'net_worth', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0]);
            $liquid = V::moneyCents($input['liquid_net_worth'] ?? null, 'liquid_net_worth', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0]);
            $objectives = V::oneOf($input['investment_objectives'] ?? null, self::US_OBJECTIVES, 'investment_objectives', ['fallback' => 'balanced']);
            $horizon = (int) (V::int($input['time_horizon'] ?? null, 'time_horizon', ['required' => false, 'min' => 1, 'max' => 30, 'fallback' => 12]) ?? 12);
            $riskTol = (int) (V::int($input['risk_tolerance'] ?? null, 'risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => 6]) ?? 6);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::US_STAGES, 'onboarding_stage', ['fallback' => 'Prospect']);
            $advisor = V::text($input['advisor_name'] ?? null, 'advisor_name', ['required' => false, 'max' => 80]) ?: (string) $ctx['member']['display_name'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 2000]);

            $riskScore = min(100, max(1, (int) round(($riskTol * 5) + ($horizon * 2) + ((120 - $age) / 2.0))));
            $accredited = self::computeUsAccredited($income, $netWorth);
            $alloc = $riskScore >= 70 ? '80/15/5' : ($riskScore >= 40 ? '60/30/10' : '30/50/20');
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO us_clients(first_name, last_name, email, phone, dob, age, ssn, address, citizenship, employer, occupation, annual_income_cents, net_worth_cents, liquid_net_worth_cents, investment_objectives, time_horizon, risk_tolerance, risk_score, accredited_investor, portfolio_allocation, onboarding_stage, w9_legal_name, advisor_name, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [
                    $firstName, $lastName, $em, $phone, $dob, $age, $ssn, $address, $citizenship, $employer, $occupation,
                    $income, $netWorth, $liquid, $objectives, $horizon, $riskTol, $riskScore,
                    $accredited, $alloc, $stage, $firstName . ' ' . $lastName, $advisor, $notes, $ts, $ts,
                ]
            );
            $row = self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['client' => $row]];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = self::ensureUsClient($db, $id);

            $firstName = V::text($input['first_name'] ?? null, 'first_name', ['max' => 80, 'label' => 'First name']);
            $lastName = V::text($input['last_name'] ?? null, 'last_name', ['max' => 80, 'label' => 'Last name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $dob = V::day($input['dob'] ?? null, 'dob', ['required' => false, 'fallback' => (string) $cur['dob']]);
            $age = (int) (V::int($input['age'] ?? null, 'age', ['required' => false, 'min' => 18, 'max' => 120, 'fallback' => (int) $cur['age']]) ?? (int) $cur['age']);
            $ssn = V::text($input['ssn'] ?? null, 'ssn', ['required' => false, 'max' => 20]);
            if ($ssn !== '' && !preg_match('/^\d{3}-?\d{2}-?\d{4}$/', $ssn)) {
                HttpException::fail(422, 'ssn_invalid', 'Enter a valid SSN (e.g. 123-45-6789).', 'ssn');
            }
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 300]);
            $citizenship = V::oneOf($input['citizenship'] ?? null, self::US_CITIZENSHIPS, 'citizenship', ['fallback' => $cur['citizenship']]);
            $employer = V::text($input['employer'] ?? null, 'employer', ['required' => false, 'max' => 120]);
            $occupation = V::text($input['occupation'] ?? null, 'occupation', ['required' => false, 'max' => 120]);
            $income = array_key_exists('annual_income', $input)
                ? V::moneyCents($input['annual_income'], 'annual_income', ['required' => false, 'min' => 0, 'max' => 100000000000, 'fallback' => 0])
                : (int) $cur['annual_income_cents'];
            $netWorth = array_key_exists('net_worth', $input)
                ? V::moneyCents($input['net_worth'], 'net_worth', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0])
                : (int) $cur['net_worth_cents'];
            $liquid = array_key_exists('liquid_net_worth', $input)
                ? V::moneyCents($input['liquid_net_worth'], 'liquid_net_worth', ['required' => false, 'min' => 0, 'max' => 1000000000000, 'fallback' => 0])
                : (int) $cur['liquid_net_worth_cents'];
            $objectives = V::oneOf($input['investment_objectives'] ?? null, self::US_OBJECTIVES, 'investment_objectives', ['fallback' => $cur['investment_objectives']]);
            $horizon = (int) (V::int($input['time_horizon'] ?? null, 'time_horizon', ['required' => false, 'min' => 1, 'max' => 30, 'fallback' => (int) $cur['time_horizon']]) ?? (int) $cur['time_horizon']);
            $riskTol = (int) (V::int($input['risk_tolerance'] ?? null, 'risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => (int) $cur['risk_tolerance']]) ?? (int) $cur['risk_tolerance']);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::US_STAGES, 'onboarding_stage', ['fallback' => $cur['onboarding_stage']]);
            $advisor = V::text($input['advisor_name'] ?? null, 'advisor_name', ['required' => false, 'max' => 80]) ?: (string) $cur['advisor_name'];
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 2000]);

            $riskScore = min(100, max(1, (int) round(($riskTol * 5) + ($horizon * 2) + ((120 - $age) / 2.0))));
            $accredited = self::computeUsAccredited($income, $netWorth);
            $alloc = $riskScore >= 70 ? '80/15/5' : ($riskScore >= 40 ? '60/30/10' : '30/50/20');

            $db->execute(
                'UPDATE us_clients SET first_name = ?, last_name = ?, email = ?, phone = ?, dob = ?, age = ?, ssn = ?, address = ?, citizenship = ?, employer = ?, occupation = ?, annual_income_cents = ?, net_worth_cents = ?, liquid_net_worth_cents = ?, investment_objectives = ?, time_horizon = ?, risk_tolerance = ?, risk_score = ?, accredited_investor = ?, portfolio_allocation = ?, onboarding_stage = ?, advisor_name = ?, notes = ?, updated_at = ? WHERE id = ?',
                [
                    $firstName, $lastName, $em, $phone, $dob, $age, $ssn, $address, $citizenship, $employer, $occupation,
                    $income, $netWorth, $liquid, $objectives, $horizon, $riskTol, $riskScore,
                    $accredited, $alloc, $stage, $advisor, $notes, V::now(), $id,
                ]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setClientStage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureUsClient($db, $id);
            $stage = V::oneOf($input['onboarding_stage'] ?? null, self::US_STAGES, 'onboarding_stage');
            $db->execute('UPDATE us_clients SET onboarding_stage = ?, updated_at = ? WHERE id = ?', [$stage, V::now(), $id]);
            return ['client' => self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function recordFormCrs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureUsClient($db, $id);
            $ackDate = V::day($input['acknowledgement_date'] ?? null, 'acknowledgement_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $signer = V::text($input['client_signature'] ?? null, 'client_signature', ['max' => 120, 'label' => 'Client signature']);
            $advisor = V::text($input['advisor_name'] ?? null, 'advisor_name', ['required' => false, 'max' => 100]) ?: (string) $ctx['member']['display_name'];
            $db->execute(
                'UPDATE us_clients SET crs_acknowledged = 1, crs_ack_date = ?, crs_signer = ?, crs_advisor_name = ?, updated_at = ? WHERE id = ?',
                [$ackDate, $signer, $advisor, V::now(), $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function saveW9Record(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureUsClient($db, $id);
            $legalName = V::text($input['legal_name'] ?? null, 'legal_name', ['max' => 120, 'label' => 'Legal name']);
            $bizName = V::text($input['business_name'] ?? null, 'business_name', ['required' => false, 'max' => 120]);
            $taxClass = V::oneOf($input['tax_classification'] ?? null, self::US_W9_CLASSES, 'tax_classification', ['fallback' => 'individual']);
            $ssnEin = V::text($input['ssn_ein'] ?? null, 'ssn_ein', ['max' => 30, 'label' => 'SSN or EIN']);
            $certDate = V::day($input['date'] ?? null, 'date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $db->execute(
                'UPDATE us_clients SET w9_legal_name = ?, w9_business_name = ?, w9_tax_classification = ?, w9_ssn_ein = ?, w9_certified_date = ?, updated_at = ? WHERE id = ?',
                [$legalName, $bizName, $taxClass, $ssnEin, $certDate, V::now(), $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM us_clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            self::ensureUsClient($db, $id);
            $tables = [
                'us_documents',
                'us_annual_reviews',
                'us_poas',
                'us_beneficiaries',
                'us_exchanges_1035',
                'us_rollovers',
                'us_acat_transfers',
                'us_fee_agreements',
                'us_risk_assessments',
            ];
            foreach ($tables as $table) {
                $db->execute("DELETE FROM {$table} WHERE client_id = ?", [$id]);
            }
            $db->execute('DELETE FROM us_clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Risk Tolerance Scorer ----

    public function listRiskAssessments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeRisk'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM us_risk_assessments r JOIN us_clients c ON c.id = r.client_id ORDER BY r.created_at DESC LIMIT 150'
                )
            );
            return ['assessments' => $rows];
        });
    }

    public function addRiskAssessment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = self::ensureUsClient($db, $clientId);

            $horizon = (int) V::int($input['time_horizon'] ?? null, 'time_horizon', ['min' => 1, 'max' => 30, 'label' => 'Time horizon']);
            $reaction = V::oneOf($input['market_reaction'] ?? null, self::US_REACTIONS, 'market_reaction', ['label' => 'Market drop reaction']);
            $lossCap = (int) V::int($input['loss_capacity'] ?? null, 'loss_capacity', ['min' => 1, 'max' => 10, 'label' => 'Loss capacity']);
            $experience = V::oneOf($input['investment_experience'] ?? null, self::US_EXPS, 'investment_experience', ['label' => 'Investment experience']);
            $rawPort = $input['portfolio_type'] ?? null;
            $selectedPort = ($rawPort !== null && $rawPort !== '')
                ? V::oneOf($rawPort, self::US_PORTFOLIOS, 'portfolio_type')
                : '';
            $rationale = V::text($input['rationale'] ?? null, 'rationale', ['required' => false, 'max' => 2000]);
            $assessedDate = V::day($input['assessed_date'] ?? null, 'assessed_date', ['required' => false, 'fallback' => V::utcDay(0)]);

            $calc = self::computeUsRisk($horizon, $reaction, $lossCap, $experience, $selectedPort);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO us_risk_assessments(client_id, client_age, client_income_cents, client_net_worth_cents, time_horizon, market_reaction, loss_capacity, investment_experience, risk_score, risk_band, portfolio_type, suggested_allocation, reg_bi_check, rationale, assessed_date, assessed_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, (int) $client['age'], (int) $client['annual_income_cents'], (int) $client['net_worth_cents'],
                    $horizon, $reaction, $lossCap, $experience,
                    $calc['score'], $calc['band'], $calc['portfolioType'], $calc['allocation'], $calc['regBiCheck'],
                    $rationale, $assessedDate, (string) $ctx['member']['display_name'], $ts,
                ]
            );
            $db->execute(
                'UPDATE us_clients SET risk_score = ?, portfolio_allocation = ?, time_horizon = ?, updated_at = ? WHERE id = ?',
                [$calc['score'], $calc['allocation'], $horizon, $ts, $clientId]
            );

            $row = self::normalizeRisk($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM us_risk_assessments r JOIN us_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['assessment' => $row]];
        }, write: true);
    }

    public function deleteRiskAssessment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_risk_assessments WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Assessment not found.');
            }
            $db->execute('DELETE FROM us_risk_assessments WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Tiered AUM Fee Agreements ----

    public function listFeeAgreements(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeFee'],
                $db->query(
                    'SELECT f.*, c.first_name, c.last_name FROM us_fee_agreements f JOIN us_clients c ON c.id = f.client_id ORDER BY f.created_at DESC LIMIT 150'
                )
            );
            return ['agreements' => $rows];
        });
    }

    public function addFeeAgreement(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            self::ensureUsClient($db, $clientId);

            $accountCents = V::moneyCents($input['account_value'] ?? null, 'account_value', ['min' => 100, 'max' => 1000000000000, 'label' => 'Account AUM']);
            $tier = V::oneOf($input['fee_tier'] ?? null, self::US_FEE_TIERS, 'fee_tier', ['fallback' => 'Standard']);
            $billing = V::oneOf($input['billing_frequency'] ?? null, self::US_BILLINGS, 'billing_frequency', ['fallback' => 'Quarterly']);
            $status = V::oneOf($input['status'] ?? null, self::US_FEE_STATUSES, 'status', ['fallback' => 'Executed']);
            $effDate = V::day($input['effective_date'] ?? null, 'effective_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $signer = V::text($input['client_signer'] ?? null, 'client_signer', ['required' => false, 'max' => 120]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1200]);

            $calc = self::computeTieredAumFee($accountCents, $tier);
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $created = $db->execute(
                'INSERT INTO us_fee_agreements(client_id, account_value_cents, fee_tier, effective_bps, annual_fee_cents, quarterly_fee_cents, monthly_fee_cents, billing_frequency, tier_breakdown_json, status, effective_date, client_signer, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, $accountCents, $tier, $calc['effectiveBps'], $calc['annualCents'],
                    $calc['quarterlyCents'], $calc['monthlyCents'], $billing,
                    json_encode($calc['breakdown'], $jsonFlags), $status, $effDate, $signer, $notes, V::now(),
                ]
            );
            $row = self::normalizeFee($db->first(
                'SELECT f.*, c.first_name, c.last_name FROM us_fee_agreements f JOIN us_clients c ON c.id = f.client_id WHERE f.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['agreement' => $row]];
        }, write: true);
    }

    public function setFeeAgreementStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_fee_agreements WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Fee agreement not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::US_FEE_STATUSES, 'status');
            $db->execute('UPDATE us_fee_agreements SET status = ? WHERE id = ?', [$status, $id]);
            $row = self::normalizeFee($db->first(
                'SELECT f.*, c.first_name, c.last_name FROM us_fee_agreements f JOIN us_clients c ON c.id = f.client_id WHERE f.id = ?',
                [$id]
            ));
            return ['agreement' => $row];
        }, write: true);
    }

    public function deleteFeeAgreement(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_fee_agreements WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Fee agreement not found.');
            }
            $db->execute('DELETE FROM us_fee_agreements WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
