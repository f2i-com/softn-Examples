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

final class TransitionsEstateController
{
    private const US_CUSTODIANS = ['Schwab', 'Fidelity', 'Vanguard', 'E*TRADE', 'BNY Pershing', 'LPL Financial', 'Other'];
    private const US_ACAT_STATUSES = ['Initiated', 'Custodian Pending', 'In Transit', 'Settled', 'Rejected'];
    private const US_ROLL_TYPES = ['Traditional to Traditional', 'Traditional to Roth', '401k to IRA', '403b to IRA'];
    private const US_DIRECT_MODES = ['Direct (trustee-to-trustee)', 'Indirect (60-day rollover)'];
    private const US_ROLL_STATUSES = ['Initiated', 'Custodian Pending', 'Funded', 'Cancelled'];
    private const US_OLD_CARRIERS = ['Prudential', 'MetLife', 'Lincoln Financial', 'Nationwide', 'Pacific Life', 'John Hancock', 'Allianz Life', 'Other'];
    private const US_NEW_CARRIERS = ['Athene', 'Jackson National', 'Transamerica', 'Brighthouse Financial', 'Corebridge Financial', 'Equitable', 'Other'];
    private const US_1035_TYPES = ['Life Insurance', 'Annuity'];
    private const US_SURR_FLAGS = ['Yes', 'No', 'Unknown'];
    private const US_1035_STATUSES = ['Reviewing', 'Submitted', 'Carrier Transfer', 'Completed', 'Cancelled'];
    private const US_BEN_RELS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Trust', 'Estate', 'Charity', 'Other'];
    private const US_POA_POWERS = ['Financial', 'Healthcare', 'Real Estate', 'Legal', 'All'];
    private const US_POA_STATUSES = ['Active', 'Pending Notary', 'Revoked'];
    private const US_DOC_TYPES = [
        'Tax Return',
        'Legal Document',
        'Statement',
        'Insurance',
        'Form CRS',
        'W-9 Certification',
        'ID Verification',
        'Other',
    ];

    // ---- ACAT Transfers ----

    public function listAcats(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizeAcat'],
                $db->query(
                    'SELECT t.*, c.first_name, c.last_name FROM us_acat_transfers t JOIN us_clients c ON c.id = t.client_id ORDER BY t.created_at DESC LIMIT 150'
                )
            );
            return ['acats' => $rows];
        });
    }

    public function addAcat(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            RiaAdvisoryController::ensureUsClient($db, $clientId);

            $custodian = V::oneOf($input['custodian'] ?? null, self::US_CUSTODIANS, 'custodian', ['fallback' => 'Schwab']);
            $acctNo = V::text($input['account_number'] ?? null, 'account_number', ['max' => 60, 'label' => 'Account number']);
            $tType = V::oneOf($input['transfer_type'] ?? null, ['Full', 'Partial'], 'transfer_type', ['fallback' => 'Full']);
            $assets = V::text($input['assets_to_transfer'] ?? null, 'assets_to_transfer', ['required' => false, 'max' => 1200]);
            $estVal = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Estimated value']);
            $hasFee = array_key_exists('transfer_fee', $input) && $input['transfer_fee'] !== null && $input['transfer_fee'] !== '';
            $feeCents = $hasFee
                ? V::moneyCents($input['transfer_fee'], 'transfer_fee', ['min' => 0, 'max' => 1000000])
                : 7500;
            $status = V::oneOf($input['status'] ?? null, self::US_ACAT_STATUSES, 'status', ['fallback' => 'Initiated']);
            $initDate = V::day($input['initiated_date'] ?? null, 'initiated_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO us_acat_transfers(client_id, custodian, account_number, transfer_type, assets_to_transfer, estimated_value_cents, transfer_fee_cents, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $custodian, $acctNo, $tType, $assets, $estVal, $feeCents, $status, $initDate, $notes, V::now()]
            );
            $row = RiaAdvisoryController::normalizeAcat($db->first(
                'SELECT t.*, c.first_name, c.last_name FROM us_acat_transfers t JOIN us_clients c ON c.id = t.client_id WHERE t.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['acat' => $row]];
        }, write: true);
    }

    public function setAcatStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_acat_transfers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'ACAT transfer not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::US_ACAT_STATUSES, 'status');
            $db->execute('UPDATE us_acat_transfers SET status = ? WHERE id = ?', [$status, $id]);
            $row = RiaAdvisoryController::normalizeAcat($db->first(
                'SELECT t.*, c.first_name, c.last_name FROM us_acat_transfers t JOIN us_clients c ON c.id = t.client_id WHERE t.id = ?',
                [$id]
            ));
            return ['acat' => $row];
        }, write: true);
    }

    public function deleteAcat(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_acat_transfers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'ACAT transfer not found.');
            }
            $db->execute('DELETE FROM us_acat_transfers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- IRA / 401(k) / 403(b) Rollovers ----

    public function listRollovers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizeRollover'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM us_rollovers r JOIN us_clients c ON c.id = r.client_id ORDER BY r.created_at DESC LIMIT 150'
                )
            );
            return ['rollovers' => $rows];
        });
    }

    public function addRollover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            RiaAdvisoryController::ensureUsClient($db, $clientId);

            $rType = V::oneOf($input['rollover_type'] ?? null, self::US_ROLL_TYPES, 'rollover_type', ['fallback' => '401k to IRA']);
            $curCust = V::text($input['current_custodian'] ?? null, 'current_custodian', ['max' => 120, 'label' => 'Current custodian']);
            $curAcct = V::text($input['current_account_number'] ?? null, 'current_account_number', ['max' => 60, 'label' => 'Current account number']);
            $recCust = V::text($input['receiving_custodian'] ?? null, 'receiving_custodian', ['max' => 120, 'label' => 'Receiving custodian']);
            $recAcct = V::text($input['receiving_account_number'] ?? null, 'receiving_account_number', ['required' => false, 'max' => 60]);
            $estVal = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Estimated value']);
            $mode = V::oneOf($input['direct_or_indirect'] ?? null, self::US_DIRECT_MODES, 'direct_or_indirect', ['fallback' => 'Direct (trustee-to-trustee)']);
            $rothAck = V::bool($input['roth_tax_acknowledged'] ?? false) ? 1 : 0;
            $initDate = V::day($input['initiated_date'] ?? null, 'initiated_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $deadline = $mode === 'Indirect (60-day rollover)' ? WorkspaceController::usAddDays($initDate, 60) : '';
            $status = V::oneOf($input['status'] ?? null, self::US_ROLL_STATUSES, 'status', ['fallback' => 'Initiated']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO us_rollovers(client_id, rollover_type, current_custodian, current_account_number, receiving_custodian, receiving_account_number, estimated_value_cents, direct_or_indirect, roth_tax_acknowledged, sixty_day_deadline, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $rType, $curCust, $curAcct, $recCust, $recAcct, $estVal, $mode, $rothAck, $deadline, $status, $initDate, $notes, V::now()]
            );
            $row = RiaAdvisoryController::normalizeRollover($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM us_rollovers r JOIN us_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['rollover' => $row]];
        }, write: true);
    }

    public function setRolloverStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_rollovers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Rollover not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::US_ROLL_STATUSES, 'status');
            $db->execute('UPDATE us_rollovers SET status = ? WHERE id = ?', [$status, $id]);
            $row = RiaAdvisoryController::normalizeRollover($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM us_rollovers r JOIN us_clients c ON c.id = r.client_id WHERE r.id = ?',
                [$id]
            ));
            return ['rollover' => $row];
        }, write: true);
    }

    public function deleteRollover(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_rollovers WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Rollover not found.');
            }
            $db->execute('DELETE FROM us_rollovers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- IRC Section 1035 Exchanges ----

    public function listExchanges(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizeExchange'],
                $db->query(
                    'SELECT e.*, c.first_name, c.last_name FROM us_exchanges_1035 e JOIN us_clients c ON c.id = e.client_id ORDER BY e.created_at DESC LIMIT 150'
                )
            );
            return ['exchanges' => $rows];
        });
    }

    public function addExchange(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            RiaAdvisoryController::ensureUsClient($db, $clientId);

            $policyNo = V::text($input['existing_policy_number'] ?? null, 'existing_policy_number', ['max' => 60, 'label' => 'Existing policy number']);
            $oldCarrier = V::oneOf($input['existing_carrier'] ?? null, self::US_OLD_CARRIERS, 'existing_carrier', ['fallback' => 'Prudential']);
            $exType = V::oneOf($input['exchange_type'] ?? null, self::US_1035_TYPES, 'exchange_type', ['fallback' => 'Annuity']);
            $newCarrier = V::oneOf($input['new_carrier'] ?? null, self::US_NEW_CARRIERS, 'new_carrier', ['fallback' => 'Athene']);
            $newPolicy = V::text($input['new_policy_type'] ?? null, 'new_policy_type', ['max' => 120, 'label' => 'New policy type']);
            $estVal = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['min' => 0, 'max' => 1000000000000, 'label' => 'Estimated contract value']);
            $hasSurr = V::oneOf($input['has_surrender_charges'] ?? null, self::US_SURR_FLAGS, 'has_surrender_charges', ['fallback' => 'No']);
            $surrCents = $hasSurr === 'Yes'
                ? V::moneyCents($input['surrender_charges'] ?? null, 'surrender_charges', ['required' => false, 'min' => 0, 'max' => 100000000, 'fallback' => 0])
                : 0;
            $status = V::oneOf($input['status'] ?? null, self::US_1035_STATUSES, 'status', ['fallback' => 'Reviewing']);
            $initDate = V::day($input['initiated_date'] ?? null, 'initiated_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO us_exchanges_1035(client_id, existing_policy_number, existing_carrier, exchange_type, new_carrier, new_policy_type, estimated_value_cents, has_surrender_charges, surrender_charges_cents, status, initiated_date, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $policyNo, $oldCarrier, $exType, $newCarrier, $newPolicy, $estVal, $hasSurr, $surrCents, $status, $initDate, $notes, V::now()]
            );
            $row = RiaAdvisoryController::normalizeExchange($db->first(
                'SELECT e.*, c.first_name, c.last_name FROM us_exchanges_1035 e JOIN us_clients c ON c.id = e.client_id WHERE e.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['exchange' => $row]];
        }, write: true);
    }

    public function setExchangeStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_exchanges_1035 WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', '1035 exchange not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::US_1035_STATUSES, 'status');
            $db->execute('UPDATE us_exchanges_1035 SET status = ? WHERE id = ?', [$status, $id]);
            $row = RiaAdvisoryController::normalizeExchange($db->first(
                'SELECT e.*, c.first_name, c.last_name FROM us_exchanges_1035 e JOIN us_clients c ON c.id = e.client_id WHERE e.id = ?',
                [$id]
            ));
            return ['exchange' => $row];
        }, write: true);
    }

    public function deleteExchange(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_exchanges_1035 WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', '1035 exchange not found.');
            }
            $db->execute('DELETE FROM us_exchanges_1035 WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Beneficiary Designations (STRICT 100% VALIDATION) ----

    public function listBeneficiaries(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizeBeneficiary'],
                $db->query(
                    'SELECT b.*, c.first_name, c.last_name FROM us_beneficiaries b JOIN us_clients c ON c.id = b.client_id ORDER BY b.created_at DESC LIMIT 150'
                )
            );
            return ['beneficiaries' => $rows];
        });
    }

    public function addBeneficiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            RiaAdvisoryController::ensureUsClient($db, $clientId);

            $acct = V::text($input['account_label'] ?? null, 'account_label', ['max' => 140, 'label' => 'Account']);

            $primaries = V::listOf($input['primary_beneficiaries'] ?? null, 'primary_beneficiaries', 10, function ($b, int $idx): array {
                $arr = is_array($b) ? $b : [];
                $nm = V::text($arr['name'] ?? null, 'primary_name_' . ($idx + 1), ['max' => 100, 'label' => 'Primary beneficiary ' . ($idx + 1) . ' name']);
                $rel = V::oneOf($arr['relationship'] ?? null, self::US_BEN_RELS, 'primary_rel_' . ($idx + 1), ['label' => 'Relationship']);
                $pct = V::numVal($arr['percentage'] ?? null, 'primary_pct_' . ($idx + 1), ['min' => 0.01, 'max' => 100, 'label' => 'Percentage']);
                return ['name' => $nm, 'relationship' => $rel, 'percentage' => $pct];
            });
            if (count($primaries) === 0) {
                HttpException::fail(422, 'primary_required', 'Add at least one primary beneficiary.', 'primary_beneficiaries');
            }
            $pSum = 0.0;
            foreach ($primaries as $p) {
                $pSum += (float) $p['percentage'];
            }
            $pSum = round($pSum * 100.0) / 100.0;
            if (abs($pSum - 100.0) > 0.001) {
                HttpException::fail(
                    422,
                    'primary_allocation_not_100',
                    'Primary beneficiary allocations must sum to exactly 100% (currently ' . $pSum . '%).',
                    'primary_beneficiaries'
                );
            }

            $contingents = V::listOf($input['contingent_beneficiaries'] ?? null, 'contingent_beneficiaries', 10, function ($b, int $idx): array {
                $arr = is_array($b) ? $b : [];
                $nm = V::text($arr['name'] ?? null, 'contingent_name_' . ($idx + 1), ['max' => 100, 'label' => 'Contingent beneficiary ' . ($idx + 1) . ' name']);
                $rel = V::oneOf($arr['relationship'] ?? null, self::US_BEN_RELS, 'contingent_rel_' . ($idx + 1), ['label' => 'Relationship']);
                $pct = V::numVal($arr['percentage'] ?? null, 'contingent_pct_' . ($idx + 1), ['min' => 0.01, 'max' => 100, 'label' => 'Percentage']);
                return ['name' => $nm, 'relationship' => $rel, 'percentage' => $pct];
            });
            if (count($contingents) > 0) {
                $cSum = 0.0;
                foreach ($contingents as $c) {
                    $cSum += (float) $c['percentage'];
                }
                $cSum = round($cSum * 100.0) / 100.0;
                if (abs($cSum - 100.0) > 0.001) {
                    HttpException::fail(
                        422,
                        'contingent_allocation_not_100',
                        'Contingent beneficiary allocations must sum to exactly 100% when provided (currently ' . $cSum . '%).',
                        'contingent_beneficiaries'
                    );
                }
            }

            $effDate = V::day($input['effective_date'] ?? null, 'effective_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $created = $db->execute(
                "INSERT INTO us_beneficiaries(client_id, account_label, primary_json, contingent_json, effective_date, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, 'Active', ?, 0, ?)",
                [
                    $clientId, $acct,
                    json_encode($primaries, $jsonFlags),
                    json_encode($contingents, $jsonFlags),
                    $effDate, $notes, V::now(),
                ]
            );
            $row = RiaAdvisoryController::normalizeBeneficiary($db->first(
                'SELECT b.*, c.first_name, c.last_name FROM us_beneficiaries b JOIN us_clients c ON c.id = b.client_id WHERE b.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['beneficiary' => $row]];
        }, write: true);
    }

    public function deleteBeneficiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_beneficiaries WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Beneficiary designation not found.');
            }
            $db->execute('DELETE FROM us_beneficiaries WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Power of Attorney (POA) ----

    public function listPoas(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizePoa'],
                $db->query(
                    'SELECT p.*, c.first_name, c.last_name FROM us_poas p JOIN us_clients c ON c.id = p.client_id ORDER BY p.created_at DESC LIMIT 150'
                )
            );
            return ['poas' => $rows];
        });
    }

    public function addPoa(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = RiaAdvisoryController::ensureUsClient($db, $clientId);

            $principal = V::text($input['principal_name'] ?? null, 'principal_name', ['required' => false, 'max' => 120])
                ?: ($client['first_name'] . ' ' . $client['last_name']);
            $agent = V::text($input['agent_name'] ?? null, 'agent_name', ['max' => 120, 'label' => 'Agent name']);
            $powers = V::listOf(
                $input['powers_granted'] ?? null,
                'powers_granted',
                10,
                static fn ($v): string => V::oneOf($v, self::US_POA_POWERS, 'power')
            );
            if (count($powers) === 0) {
                HttpException::fail(422, 'powers_required', 'Select at least one power granted to the agent.', 'powers_granted');
            }
            $effDate = V::day($input['effective_date'] ?? null, 'effective_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $w1 = V::text($input['witness_1_name'] ?? null, 'witness_1_name', ['max' => 100, 'label' => 'Witness 1']);
            $w2 = V::text($input['witness_2_name'] ?? null, 'witness_2_name', ['max' => 100, 'label' => 'Witness 2']);
            $notarized = V::bool($input['notarized'] ?? false) ? 1 : 0;
            $status = $notarized ? 'Active' : 'Pending Notary';
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $created = $db->execute(
                'INSERT INTO us_poas(client_id, principal_name, agent_name, powers_granted_json, effective_date, witness_1_name, witness_2_name, notarized, status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $clientId, $principal, $agent, json_encode($powers, $jsonFlags),
                    $effDate, $w1, $w2, $notarized, $status, $notes, V::now(),
                ]
            );
            $row = RiaAdvisoryController::normalizePoa($db->first(
                'SELECT p.*, c.first_name, c.last_name FROM us_poas p JOIN us_clients c ON c.id = p.client_id WHERE p.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['poa' => $row]];
        }, write: true);
    }

    public function setPoaStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_poas WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'POA record not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::US_POA_STATUSES, 'status');
            $notarized = $status === 'Active' ? 1 : 0;
            $db->execute('UPDATE us_poas SET status = ?, notarized = ? WHERE id = ?', [$status, $notarized, $id]);
            $row = RiaAdvisoryController::normalizePoa($db->first(
                'SELECT p.*, c.first_name, c.last_name FROM us_poas p JOIN us_clients c ON c.id = p.client_id WHERE p.id = ?',
                [$id]
            ));
            return ['poa' => $row];
        }, write: true);
    }

    public function deletePoa(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM us_poas WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'POA record not found.');
            }
            $db->execute('DELETE FROM us_poas WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Annual Reviews ----

    public function listReviews(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [RiaAdvisoryController::class, 'normalizeReview'],
                $db->query(
                    'SELECT r.*, c.first_name, c.last_name FROM us_annual_reviews r JOIN us_clients c ON c.id = r.client_id ORDER BY r.next_review_date ASC LIMIT 150'
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
            $client = RiaAdvisoryController::ensureUsClient($db, $clientId);

            $revDate = V::day($input['review_date'] ?? null, 'review_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $aumCents = V::moneyCents($input['current_aum'] ?? null, 'current_aum', ['min' => 0, 'max' => 1000000000000, 'label' => 'Current AUM']);
            $feeCalc = RiaAdvisoryController::computeTieredAumFee($aumCents, 'Standard');
            $goalProg = (int) (V::int($input['goal_progress'] ?? null, 'goal_progress', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => 8]) ?? 8);
            $lifeChanges = V::listOf($input['life_changes'] ?? null, 'life_changes', 10, static fn ($v): string => V::text($v, 'life_change', ['max' => 50]));
            $updatedTol = (int) (V::int($input['updated_risk_tolerance'] ?? null, 'updated_risk_tolerance', ['required' => false, 'min' => 1, 'max' => 10, 'fallback' => (int) $client['risk_tolerance']]) ?? (int) $client['risk_tolerance']);
            $nextRev = V::day($input['next_review_date'] ?? null, 'next_review_date', ['required' => false, 'fallback' => WorkspaceController::usAddYears($revDate, 1)]);
            $notes = V::text($input['advisor_notes'] ?? null, 'advisor_notes', ['required' => false, 'max' => 2000]);
            $ts = V::now();
            $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

            $created = $db->execute(
                "INSERT INTO us_annual_reviews(client_id, review_date, current_aum_cents, current_annual_fee_cents, goal_progress, life_changes_json, updated_risk_tolerance, advisor_notes, next_review_date, status, advisor_name, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, 0, ?)",
                [
                    $clientId, $revDate, $aumCents, $feeCalc['annualCents'], $goalProg,
                    json_encode($lifeChanges, $jsonFlags), $updatedTol, $notes, $nextRev,
                    (string) $ctx['member']['display_name'], $ts,
                ]
            );
            $db->execute(
                "UPDATE us_clients SET risk_tolerance = ?, onboarding_stage = 'Active', updated_at = ? WHERE id = ?",
                [$updatedTol, $ts, $clientId]
            );

            $row = RiaAdvisoryController::normalizeReview($db->first(
                'SELECT r.*, c.first_name, c.last_name FROM us_annual_reviews r JOIN us_clients c ON c.id = r.client_id WHERE r.id = ?',
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
            if (!$db->first('SELECT id FROM us_annual_reviews WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Annual review not found.');
            }
            $db->execute('DELETE FROM us_annual_reviews WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- SEC Rule 204-2 Document Vault ----

    public function listDocuments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                static fn (array $r): array => RiaAdvisoryController::normalizeDocument($r, $todayDay) ?? $r,
                $db->query(
                    "SELECT d.*, c.first_name, c.last_name FROM us_documents d JOIN us_clients c ON c.id = d.client_id ORDER BY CASE WHEN d.expiry_date = '' THEN 1 ELSE 0 END, d.expiry_date ASC, d.created_at DESC LIMIT 200"
                )
            );
            return ['documents' => $rows];
        });
    }

    public function addDocument(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            RiaAdvisoryController::ensureUsClient($db, $clientId);

            $docType = V::oneOf($input['document_type'] ?? null, self::US_DOC_TYPES, 'document_type', ['fallback' => 'Tax Return']);
            $docName = V::text($input['document_name'] ?? null, 'document_name', ['max' => 160, 'label' => 'Document name']);
            $refCode = V::text($input['reference_code'] ?? null, 'reference_code', ['required' => false, 'max' => 60]);
            $expDate = V::day($input['expiry_date'] ?? null, 'expiry_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);

            $created = $db->execute(
                'INSERT INTO us_documents(client_id, document_type, document_name, reference_code, expiry_date, notes, uploaded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$clientId, $docType, $docName, $refCode, $expDate, $notes, (string) $ctx['member']['display_name'], V::now()]
            );
            $row = RiaAdvisoryController::normalizeDocument(
                $db->first(
                    'SELECT d.*, c.first_name, c.last_name FROM us_documents d JOIN us_clients c ON c.id = d.client_id WHERE d.id = ?',
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
            if (!$db->first('SELECT id FROM us_documents WHERE id = ?', [$id])) {
                HttpException::fail(404, 'not_found', 'Document not found.');
            }
            $db->execute('DELETE FROM us_documents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
