<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\RiaAdvisoryController;
use App\TransitionsEstateController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$ria = new RiaAdvisoryController();
$te = new TransitionsEstateController();

// Workspace, SEC RIA / CRD settings, team & sample data
$app->get('/api/session', [$ws, 'getSession']);
$app->post('/api/setup', [$ws, 'completeSetup']);
$app->put('/api/settings', [$ws, 'saveSettings']);
$app->get('/api/team', [$ws, 'listTeam']);
$app->post('/api/team/join', [$ws, 'requestJoin']);
$app->put('/api/team', [$ws, 'updateMember']);
$app->delete('/api/team', [$ws, 'removeMember']);
$app->post('/api/sample/load', [$ws, 'loadSampleData']);
$app->post('/api/sample/clear', [$ws, 'clearSampleData']);

// RIA Advisory & Transition Desk
$app->get('/api/desk', [$ria, 'getDeskSummary']);

// Clients, SEC Rule 501(a) Accredited, Form CRS & IRS Form W-9
$app->get('/api/clients', [$ria, 'listClients']);
$app->get('/api/clients/detail', [$ria, 'getClientDetail']);
$app->post('/api/clients', [$ria, 'addClient']);
$app->put('/api/clients', [$ria, 'saveClient']);
$app->post('/api/clients/stage', [$ria, 'setClientStage']);
$app->post('/api/clients/crs', [$ria, 'recordFormCrs']);
$app->post('/api/clients/w9', [$ria, 'saveW9Record']);
$app->delete('/api/clients', [$ria, 'deleteClient']);

// Risk Tolerance Scorer & Reg BI Suitability
$app->get('/api/risk', [$ria, 'listRiskAssessments']);
$app->post('/api/risk', [$ria, 'addRiskAssessment']);
$app->delete('/api/risk', [$ria, 'deleteRiskAssessment']);

// Progressive Tiered AUM Fee Agreements
$app->get('/api/fees', [$ria, 'listFeeAgreements']);
$app->post('/api/fees', [$ria, 'addFeeAgreement']);
$app->post('/api/fees/status', [$ria, 'setFeeAgreementStatus']);
$app->delete('/api/fees', [$ria, 'deleteFeeAgreement']);

// ACAT Transfers
$app->get('/api/acats', [$te, 'listAcats']);
$app->post('/api/acats', [$te, 'addAcat']);
$app->post('/api/acats/status', [$te, 'setAcatStatus']);
$app->delete('/api/acats', [$te, 'deleteAcat']);

// IRA / 401(k) / 403(b) Rollovers (with 60-day Indirect Deadline)
$app->get('/api/rollovers', [$te, 'listRollovers']);
$app->post('/api/rollovers', [$te, 'addRollover']);
$app->post('/api/rollovers/status', [$te, 'setRolloverStatus']);
$app->delete('/api/rollovers', [$te, 'deleteRollover']);

// IRC Section 1035 Exchanges
$app->get('/api/exchanges', [$te, 'listExchanges']);
$app->post('/api/exchanges', [$te, 'addExchange']);
$app->post('/api/exchanges/status', [$te, 'setExchangeStatus']);
$app->delete('/api/exchanges', [$te, 'deleteExchange']);

// Beneficiary Designations (strict 100% allocation validation)
$app->get('/api/beneficiaries', [$te, 'listBeneficiaries']);
$app->post('/api/beneficiaries', [$te, 'addBeneficiary']);
$app->delete('/api/beneficiaries', [$te, 'deleteBeneficiary']);

// Power of Attorney (POA)
$app->get('/api/poas', [$te, 'listPoas']);
$app->post('/api/poas', [$te, 'addPoa']);
$app->post('/api/poas/status', [$te, 'setPoaStatus']);
$app->delete('/api/poas', [$te, 'deletePoa']);

// Annual Client Reviews
$app->get('/api/reviews', [$te, 'listReviews']);
$app->post('/api/reviews', [$te, 'addReview']);
$app->delete('/api/reviews', [$te, 'deleteReview']);

// SEC Rule 204-2 Document Vault
$app->get('/api/documents', [$te, 'listDocuments']);
$app->post('/api/documents', [$te, 'addDocument']);
$app->delete('/api/documents', [$te, 'deleteDocument']);

$app->run();
