<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\AdvisoryController;
use App\SuperComplianceController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$adv = new AdvisoryController();
$sup = new SuperComplianceController();

// Workspace, AFSL settings, team & sample data
$app->get('/api/session', [$ws, 'getSession']);
$app->post('/api/setup', [$ws, 'completeSetup']);
$app->put('/api/settings', [$ws, 'saveSettings']);
$app->get('/api/team', [$ws, 'listTeam']);
$app->post('/api/team/join', [$ws, 'requestJoin']);
$app->put('/api/team', [$ws, 'updateMember']);
$app->delete('/api/team', [$ws, 'removeMember']);
$app->post('/api/sample/load', [$ws, 'loadSampleData']);
$app->post('/api/sample/clear', [$ws, 'clearSampleData']);

// AFSL Advisory Workbench
$app->get('/api/workbench', [$adv, 'getWorkbench']);

// Clients & Master Advice File (s761G Wholesale, FSG s941A, ATO TFN)
$app->get('/api/clients', [$adv, 'listClients']);
$app->get('/api/clients/detail', [$adv, 'getClientDetail']);
$app->post('/api/clients', [$adv, 'addClient']);
$app->put('/api/clients', [$adv, 'saveClient']);
$app->post('/api/clients/stage', [$adv, 'setClientStage']);
$app->post('/api/clients/fsg', [$adv, 'recordFsgAck']);
$app->post('/api/clients/tfn', [$adv, 'saveTfnDecl']);
$app->delete('/api/clients', [$adv, 'deleteClient']);

// Best Interest Duty Risk Profile Assessment Scorer (s961B)
$app->get('/api/risk', [$adv, 'listRiskProfiles']);
$app->post('/api/risk', [$adv, 'addRiskProfile']);
$app->delete('/api/risk', [$adv, 'deleteRiskProfile']);

// Fee Disclosure Statements (FDS) & Ongoing Fee Consent
$app->get('/api/fees', [$adv, 'listFeeDisclosures']);
$app->post('/api/fees', [$adv, 'addFeeDisclosure']);
$app->post('/api/fees/consent', [$adv, 'setFeeConsent']);
$app->delete('/api/fees', [$adv, 'deleteFeeDisclosure']);

// Off-Market CHESS & SRN Transfers
$app->get('/api/transfers', [$sup, 'listOffMarketTransfers']);
$app->post('/api/transfers', [$sup, 'addOffMarketTransfer']);
$app->post('/api/transfers/status', [$sup, 'setOffMarketTransferStatus']);
$app->delete('/api/transfers', [$sup, 'deleteOffMarketTransfer']);

// Superannuation Rollovers
$app->get('/api/rollovers', [$sup, 'listSuperRollovers']);
$app->post('/api/rollovers', [$sup, 'addSuperRollover']);
$app->post('/api/rollovers/status', [$sup, 'setSuperRolloverStatus']);
$app->delete('/api/rollovers', [$sup, 'deleteSuperRollover']);

// Binding Death Benefit Nominations (SIS Reg 6.17A — 100% validated)
$app->get('/api/bdbns', [$sup, 'listBdbns']);
$app->post('/api/bdbns', [$sup, 'addBdbn']);
$app->post('/api/bdbns/status', [$sup, 'setBdbnStatus']);
$app->delete('/api/bdbns', [$sup, 'deleteBdbn']);

// Annual Client Reviews
$app->get('/api/reviews', [$sup, 'listReviews']);
$app->post('/api/reviews', [$sup, 'addReview']);
$app->delete('/api/reviews', [$sup, 'deleteReview']);

// Compliance Document Vault
$app->get('/api/documents', [$sup, 'listDocuments']);
$app->post('/api/documents', [$sup, 'addDocument']);
$app->delete('/api/documents', [$sup, 'deleteDocument']);

$app->run();
