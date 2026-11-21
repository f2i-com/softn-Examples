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

final class SuperComplianceController
{
    private const AU_PLATFORMS = ['BT Panorama', 'Macquarie Wrap', 'Netwealth', 'CFS FirstChoice', 'HUB24', 'Other'];
    private const AU_TRANSFER_TYPES = ['Full', 'Partial'];
    private const AU_CHESS = ['Broker-Sponsored', 'Issuer-Sponsored'];
    private const AU_OMT_STATUSES = ['Draft', 'Submitted', 'In Transit', 'Completed', 'Cancelled'];
    private const AU_ROLLOVER_TYPES = ['Full Rollover', 'Partial Rollover'];
    private const AU_PRESERVATIONS = ['Preserved', 'Restricted Non-preserved', 'Unrestricted Non-preserved'];
    private const AU_ROLL_STATUSES = ['Initiated', 'Awaiting Fund', 'Completed', 'Cancelled'];
    private const AU_SIS_RELS = [
        'Spouse',
        'Child',
        'Financial Dependent',
        'Interdependency Relationship',
        'Legal Personal Representative',
    ];
    private const AU_BDBN_STATUSES = ['Active', 'Lapsing Soon', 'Expired', 'Revoked'];
    private const AU_DOC_TYPES = [
        'Statement of Advice',
        'Financial Services Guide',
        'Product Disclosure Statement',
        'ID Verification (AUSTRAC)',
        'TFN Declaration',
        'Tax Return',
        'Insurance Policy',
        'Superannuation Statement',
        'Other',
    ];

    // ---- Off-Market Transfers ----

    public function listOffMarketTransfers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT t.*, c.first_name, c.last_name FROM au_off_market_transfers t JOIN au_clients c ON c.id = t.client_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND t.status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY t.created_at DESC LIMIT 150';
            $rows = array_map([AdvisoryController::class, 'normalizeTransfer'], $db->query($sql, $params));
            return ['transfers' => $rows];
        });
    }

    public function addOffMarketTransfer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            AdvisoryController::ensureAuClient($db, $clientId);

            $platform = V::oneOf($input['delivering_platform'] ?? null, self::AU_PLATFORMS, 'delivering_platform', ['fallback' => 'BT Panorama']);
            $hin = V::text($input['hin_or_srn'] ?? null, 'hin_or_srn', ['max' => 40, 'label' => 'HIN or SRN']);
            $acctRef = V::text($input['account_reference'] ?? null, 'account_reference', ['max' => 60, 'label' => 'Account reference']);
            $tType = V::oneOf($input['transfer_type'] ?? null, self::AU_TRANSFER_TYPES, 'transfer_type', ['fallback' => 'Full']);
            $assets = V::text($input['assets_to_transfer'] ?? null, 'assets_to_transfer', ['required' => false, 'max' => 1200]);
            $estVal = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Estimated value']);
            $hasFee = array_key_exists('transfer_fee', $input) && $input['transfer_fee'] !== null && $input['transfer_fee'] !== '';
            $feeCents = $hasFee
                ? V::moneyCents($input['transfer_fee'], 'transfer_fee', ['min' => 0, 'max' => 1000000])
                : 5450;
            $chess = V::oneOf($input['chess_sponsorship'] ?? null, self::AU_CHESS, 'chess_sponsorship', ['fallback' => 'Broker-Sponsored']);
            $status = V::oneOf($input['status'] ?? null, self::AU_OMT_STATUSES, 'status', ['fallback' => 'Submitted']);
            $submittedDate = V::day($input['submitted_date'] ?? null, 'submitted_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO au_off_market_transfers(client_id, delivering_platform, hin_or_srn, account_reference, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, chess_sponsorship, status, submitted_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $platform, $hin, $acctRef, $tType, $assets, $estVal, $feeCents, $chess, $status, $submittedDate, $notes, V::now()]
            );
            $row = AdvisoryController::normalizeTransfer($db->first(
                'SELECT t.*, c.first_name, c.last_name FROM au_off_market_transfers t JOIN au_clients c ON c.id = t.client_id WHERE t.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['transfer' => $row]];
        }, write: true);
    }

    public function setOffMarketTransferStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_off_market_transfers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Off-market transfer not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::AU_OMT_STATUSES, 'status');
            $db->execute('UPDATE au_off_market_transfers SET status = ? WHERE id = ?', [$status, $id]);
            $row = AdvisoryController::normalizeTransfer($db->first(
                'SELECT t.*, c.first_name, c.last_name FROM au_off_market_transfers t JOIN au_clients c ON c.id = t.client_id WHERE t.id = ?',
                [$id]
            ));
            return ['transfer' => $row];
        }, write: true);
    }

    public function deleteOffMarketTransfer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_off_market_transfers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Off-market transfer not found.');
            }
            $db->execute('DELETE FROM au_off_market_transfers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Superannuation Rollovers ----

    public function listSuperRollovers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [AdvisoryController::class, 'normalizeRollover'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM au_super_rollovers r JOIN au_clients c ON c.id = r.client_id ORDER BY r.created_at DESC LIMIT 150'
                )
            );
            return ['rollovers' => $rows];
        });
    }

    public function addSuperRollover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            AdvisoryController::ensureAuClient($db, $clientId);

            $fromFund = V::text($input['from_fund_name'] ?? null, 'from_fund_name', ['max' => 120, 'label' => 'From fund name']);
            $fromAbn = V::text($input['from_fund_abn'] ?? null, 'from_fund_abn', ['required' => false, 'max' => 30]);
            $fromMem = V::text($input['from_member_number'] ?? null, 'from_member_number', ['max' => 60, 'label' => 'From member number']);
            $toFund = V::text($input['to_fund_name'] ?? null, 'to_fund_name', ['max' => 120, 'label' => 'To fund name']);
            $toAbn = V::text($input['to_fund_abn'] ?? null, 'to_fund_abn', ['required' => false, 'max' => 30]);
            $toMem = V::text($input['to_member_number'] ?? null, 'to_member_number', ['max' => 60, 'label' => 'To member number']);
            $rType = V::oneOf($input['rollover_type'] ?? null, self::AU_ROLLOVER_TYPES, 'rollover_type', ['fallback' => 'Full Rollover']);
            $estBal = V::moneyCents($input['estimated_balance'] ?? null, 'estimated_balance', ['min' => 0, 'max' => 1000000000000, 'label' => 'Estimated balance']);
            $partialAmt = $rType === 'Partial Rollover'
                ? V::moneyCents($input['partial_amount'] ?? null, 'partial_amount', ['min' => 100, 'max' => $estBal > 0 ? $estBal : 1000000000000, 'label' => 'Partial rollover amount'])
                : 0;
            $pres = V::oneOf($input['preservation_status'] ?? null, self::AU_PRESERVATIONS, 'preservation_status', ['fallback' => 'Preserved']);
            $insChecked = V::bool($input['insurance_checked'] ?? false) ? 1 : 0;
            $status = V::oneOf($input['status'] ?? null, self::AU_ROLL_STATUSES, 'status', ['fallback' => 'Initiated']);
            $reqDate = V::day($input['requested_date'] ?? null, 'requested_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO au_super_rollovers(client_id, from_fund_name, from_fund_abn, from_member_number, to_fund_name, to_fund_abn, to_member_number, rollover_type, partial_amount_cents, estimated_balance_cents, preservation_status, insurance_checked, status, requested_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $fromFund, $fromAbn, $fromMem, $toFund, $toAbn, $toMem, $rType, $partialAmt, $estBal, $pres, $insChecked, $status, $reqDate, $notes, V::now()]
            );
            $row = AdvisoryController::normalizeRollover($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM au_super_rollovers r JOIN au_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['rollover' => $row]];
        }, write: true);
    }

    public function setSuperRolloverStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_super_rollovers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Superannuation rollover not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::AU_ROLL_STATUSES, 'status');
            $db->execute('UPDATE au_super_rollovers SET status = ? WHERE id = ?', [$status, $id]);
            $row = AdvisoryController::normalizeRollover($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM au_super_rollovers r JOIN au_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$id]
            ));
            return ['rollover' => $row];
        }, write: true);
    }

    public function deleteSuperRollover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_super_rollovers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Superannuation rollover not found.');
            }
            $db->execute('DELETE FROM au_super_rollovers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Binding Death Benefit Nominations (BDBN — STRICT 100% VALIDATION!) ----

    public function listBdbns(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [AdvisoryController::class, 'normalizeBdbn'],
                $db->query(
                    'SELECT b.*, c.first_name, c.last_name FROM au_bdbns b JOIN au_clients c ON c.id = b.client_id ORDER BY b.expiry_date ASC, b.created_at DESC LIMIT 150'
                )
            );
            return ['bdbns' => $rows];
        });
    }

    public function addBdbn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            AdvisoryController::ensureAuClient($db, $clientId);

            $fundName = V::text($input['super_fund_name'] ?? null, 'super_fund_name', ['max' => 120, 'label' => 'Superannuation fund name']);
            $memberNo = V::text($input['member_number'] ?? null, 'member_number', ['max' => 60, 'label' => 'Member number']);

            $primaries = V::listOf($input['primary_beneficiaries'] ?? null, 'primary_beneficiaries', 10, function ($b, int $idx): array {
                $arr = is_array($b) ? $b : [];
                $nm = V::text($arr['name'] ?? null, 'primary_name_' . ($idx + 1), ['max' => 100, 'label' => 'Primary beneficiary ' . ($idx + 1) . ' name']);
                $rel = V::oneOf($arr['relationship'] ?? null, self::AU_SIS_RELS, 'primary_rel_' . ($idx + 1), ['label' => 'Relationship']);
                $dob = V::day($arr['dob'] ?? null, 'primary_dob_' . ($idx + 1), ['required' => false, 'fallback' => '']);
                $pct = V::numVal($arr['percentage'] ?? null, 'primary_pct_' . ($idx + 1), ['min' => 0.01, 'max' => 100, 'label' => 'Percentage']);
                return ['name' => $nm, 'relationship' => $rel, 'dob' => $dob, 'percentage' => $pct];
            });
            if (count($primaries) === 0) {
                HttpException::fail(422, 'primary_required', 'Add at least one primary beneficiary for a Binding Death Benefit Nomination.', 'primary_beneficiaries');
            }
            $primarySum = 0.0;
            foreach ($primaries as $p) {
                $primarySum += (float) $p['percentage'];
            }
            $primarySum = round($primarySum * 100.0) / 100.0;
            if (abs($primarySum - 100.0) > 0.001) {
                HttpException::fail(
                    422,
                    'primary_allocation_not_100',
                    'Primary beneficiary allocations must sum to exactly 100% (currently ' . $primarySum . '%).',
                    'primary_beneficiaries'
                );
            }

            $contingents = V::listOf($input['contingent_beneficiaries'] ?? null, 'contingent_beneficiaries', 10, function ($b, int $idx): array {
                $arr = is_array($b) ? $b : [];
                $nm = V::text($arr['name'] ?? null, 'contingent_name_' . ($idx + 1), ['max' => 100, 'label' => 'Contingent beneficiary ' . ($idx + 1) . ' name']);
                $rel = V::oneOf($arr['relationship'] ?? null, self::AU_SIS_RELS, 'contingent_rel_' . ($idx + 1), ['label' => 'Relationship']);
                $pct = V::numVal($arr['percentage'] ?? null, 'contingent_pct_' . ($idx + 1), ['min' => 0.01, 'max' => 100, 'label' => 'Contingent percentage']);
                return ['name' => $nm, 'relationship' => $rel, 'percentage' => $pct];
            });
            if (count($contingents) > 0) {
                $contSum = 0.0;
                foreach ($contingents as $c) {
                    $contSum += (float) $c['percentage'];
                }
                $contSum = round($contSum * 100.0) / 100.0;
                if (abs($contSum - 100.0) > 0.001) {
                    HttpException::fail(
                        422,
                        'contingent_allocation_not_100',
                        'Contingent beneficiary allocations must sum to exactly 100% when specified (currently ' . $contSum . '%).',
                        'contingent_beneficiaries'
                    );
                }
            }

            $w1 = V::text($input['witness_1_name'] ?? null, 'witness_1_name', ['max' => 100, 'label' => 'Witness 1 name']);
            $w1Over18 = V::bool($input['witness_1_over_18'] ?? false) ? 1 : 0;
            $w2 = V::text($input['witness_2_name'] ?? null, 'witness_2_name', ['max' => 100, 'label' => 'Witness 2 name']);
            $w2Over18 = V::bool($input['witness_2_over_18'] ?? false) ? 1 : 0;
            if (!$w1Over18 || !$w2Over18) {
                HttpException::fail(422, 'witnesses_over_18_required', 'Both SIS Act witnesses must be confirmed over 18 years of age.', 'witness_1_over_18');
            }
            $nomDate = V::day($input['nomination_date'] ?? null, 'nomination_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $expDate = V::day($input['expiry_date'] ?? null, 'expiry_date', ['required' => false, 'fallback' => WorkspaceController::auAddYears($nomDate, 3)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
            $created = $db->execute(
                "INSERT INTO au_bdbns(client_id, super_fund_name, member_number, primary_json, contingent_json, witness_1_name, witness_1_over_18, witness_2_name, witness_2_over_18, nomination_date, expiry_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, 0, ?)",
                [
                    $clientId, $fundName, $memberNo,
                    json_encode($primaries, $jsonFlags),
                    json_encode($contingents, $jsonFlags),
                    $w1, $w1Over18, $w2, $w2Over18,
                    $nomDate, $expDate, $notes, V::now(),
                ]
            );
            $row = AdvisoryController::normalizeBdbn($db->first(
                'SELECT b.*, c.first_name, c.last_name FROM au_bdbns b JOIN au_clients c ON c.id = b.client_id WHERE b.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['bdbn' => $row]];
        }, write: true);
    }

    public function setBdbnStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_bdbns WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'BDBN record not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::AU_BDBN_STATUSES, 'status');
            $db->execute('UPDATE au_bdbns SET status = ? WHERE id = ?', [$status, $id]);
            $row = AdvisoryController::normalizeBdbn($db->first(
                'SELECT b.*, c.first_name, c.last_name FROM au_bdbns b JOIN au_clients c ON c.id = b.client_id WHERE b.id = ?',
                [$id]
            ));
            return ['bdbn' => $row];
        }, write: true);
    }

    public function deleteBdbn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_bdbns WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'BDBN record not found.');
            }
            $db->execute('DELETE FROM au_bdbns WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Annual Client Reviews ----

    public function listReviews(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [AdvisoryController::class, 'normalizeReview'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM au_annual_reviews r JOIN au_clients c ON c.id = r.client_id ORDER BY r.next_review_date ASC, r.review_date DESC LIMIT 150'
                )
            );
            return ['reviews' => $rows];
        });
    }

    public function addReview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = AdvisoryController::ensureAuClient($db, $clientId);

            $revDate = V::day($input['review_date'] ?? null, 'review_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $portCents = V::moneyCents($input['current_portfolio_value'] ?? null, 'current_portfolio_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Current portfolio value']);
            $feeCalc = AdvisoryController::computeAuAnnualFeeCents($portCents, 'percentage', 0.0, 0);
            $goalProg = (int) (V::int($input['goal_progress'] ?? null, 'goal_progress', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => 7]) ?? 7);
            $lifeChanges = V::listOf($input['life_changes'] ?? null, 'life_changes', 10, static fn ($v): string => V::text($v, 'life_change', ['max' => 50]));
            $updatedTol = (int) (V::int($input['updated_risk_tolerance'] ?? null, 'updated_risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => (int) $client['risk_tolerance']]) ?? (int) $client['risk_tolerance']);

            $hasMajorLife = count($lifeChanges) > 0 && !(count($lifeChanges) === 1 && $lifeChanges[0] === 'None');
            $prevTol = (int) ($client['risk_tolerance'] ?: 5);
            $soaReq = ($hasMajorLife || abs($updatedTol - $prevTol) >= 2 || V::bool($input['soa_required'] ?? false)) ? 1 : 0;
            $nextRev = V::day($input['next_review_date'] ?? null, 'next_review_date', ['required' => false, 'fallback' => WorkspaceController::auAddYears($revDate, 1)]);
            $notes = V::text($input['advisor_notes'] ?? null, 'advisor_notes', ['required' => false, 'max' => 2000]);
            $status = $soaReq ? 'SOA Pending' : 'Completed';
            $ts = V::now();

            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
            $created = $db->execute(
                'INSERT INTO au_annual_reviews(client_id, review_date, current_portfolio_value_cents, current_annual_fee_cents, goal_progress, life_changes_json, updated_risk_tolerance, soa_required, advisor_notes, next_review_date, status, adviser_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, $revDate, $portCents, $feeCalc['annualCents'], $goalProg,
                    json_encode($lifeChanges, $jsonFlags), $updatedTol, $soaReq, $notes,
                    $nextRev, $status, (string) $ctx['member']['display_name'], $ts,
                ]
            );
            $db->execute(
                "UPDATE au_clients SET risk_tolerance = ?, onboarding_stage = 'Active', updated_at = ? WHERE id = ?",
                [$updatedTol, $ts, $clientId]
            );

            $row = AdvisoryController::normalizeReview($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM au_annual_reviews r JOIN au_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['review' => $row]];
        }, write: true);
    }

    public function deleteReview(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_annual_reviews WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Annual review not found.');
            }
            $db->execute('DELETE FROM au_annual_reviews WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Document Vault ----

    public function listDocuments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $docType = V::text($input['document_type'] ?? null, 'document_type', ['required' => false, 'max' => 60]);
            $sql = 'SELECT d.*, c.first_name, c.last_name FROM au_documents d JOIN au_clients c ON c.id = d.client_id WHERE 1=1';
            $params = [];
            if ($docType !== '' && $docType !== 'All') {
                $sql .= ' AND d.document_type = ?';
                $params[] = $docType;
            }
            $sql .= " ORDER BY CASE WHEN d.expiry_date = '' THEN 1 ELSE 0 END, d.expiry_date ASC, d.created_at DESC LIMIT 200";
            $rows = array_map(
                static fn (array $r): array => AdvisoryController::normalizeDocument($r, $todayDay) ?? $r,
                $db->query($sql, $params)
            );
            return ['documents' => $rows];
        });
    }

    public function addDocument(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            AdvisoryController::ensureAuClient($db, $clientId);

            $docType = V::oneOf($input['document_type'] ?? null, self::AU_DOC_TYPES, 'document_type', ['fallback' => 'Statement of Advice']);
            $docName = V::text($input['document_name'] ?? null, 'document_name', ['max' => 160, 'label' => 'Document name']);
            $refCode = V::text($input['reference_code'] ?? null, 'reference_code', ['required' => false, 'max' => 60]);
            $expDate = V::day($input['expiry_date'] ?? null, 'expiry_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $created = $db->execute(
                'INSERT INTO au_documents(client_id, document_type, document_name, reference_code, expiry_date, notes, uploaded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $docType, $docName, $refCode, $expDate, $notes, (string) $ctx['member']['display_name'], V::now()]
            );
            $row = AdvisoryController::normalizeDocument(
                $db->first(
                    'SELECT d.*, c.first_name, c.last_name FROM au_documents d JOIN au_clients c ON c.id = d.client_id WHERE d.id = ?',
                    [$created['lastInsertRowid']]
                ),
                $todayDay
            );
            return ['__status' => 201, '__body' => ['document' => $row]];
        }, write: true);
    }

    public function deleteDocument(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM au_documents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Document record not found.');
            }
            $db->execute('DELETE FROM au_documents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
