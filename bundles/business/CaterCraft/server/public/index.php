<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\OpsController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$ops = new OpsController();

// Workspace, settings, team & sample data
$app->get('/api/session', [$ws, 'getSession']);
$app->post('/api/setup', [$ws, 'completeSetup']);
$app->put('/api/settings', [$ws, 'saveSettings']);
$app->get('/api/team', [$ws, 'listTeam']);
$app->post('/api/team/join', [$ws, 'requestJoin']);
$app->put('/api/team', [$ws, 'updateMember']);
$app->delete('/api/team', [$ws, 'removeMember']);
$app->post('/api/sample/load', [$ws, 'loadSampleData']);
$app->post('/api/sample/clear', [$ws, 'clearSampleData']);

// Clients directory
$app->get('/api/clients', [$ops, 'listClients']);
$app->post('/api/clients', [$ops, 'addClient']);
$app->put('/api/clients', [$ops, 'saveClient']);
$app->delete('/api/clients', [$ops, 'deleteClient']);

// Menu packages catalogue
$app->get('/api/packages', [$ops, 'listPackages']);
$app->post('/api/packages', [$ops, 'addPackage']);
$app->put('/api/packages', [$ops, 'savePackage']);
$app->delete('/api/packages', [$ops, 'deletePackage']);

// Event pipeline jobs & run-sheets
$app->get('/api/jobs', [$ops, 'listJobs']);
$app->get('/api/jobs/runsheet', [$ops, 'getJobRunSheet']);
$app->post('/api/jobs', [$ops, 'addJob']);
$app->put('/api/jobs', [$ops, 'saveJob']);
$app->post('/api/jobs/status', [$ops, 'setJobStatus']);
$app->delete('/api/jobs', [$ops, 'deleteJob']);

// Kitchen production board
$app->get('/api/production', [$ops, 'listProduction']);
$app->post('/api/production', [$ops, 'addProduction']);
$app->put('/api/production', [$ops, 'saveProduction']);
$app->post('/api/production/status', [$ops, 'setProductionStatus']);
$app->delete('/api/production', [$ops, 'deleteProduction']);

// Delivery dispatch runs
$app->get('/api/deliveries', [$ops, 'listDeliveries']);
$app->post('/api/deliveries', [$ops, 'addDelivery']);
$app->put('/api/deliveries', [$ops, 'saveDelivery']);
$app->post('/api/deliveries/status', [$ops, 'setDeliveryStatus']);
$app->delete('/api/deliveries', [$ops, 'deleteDelivery']);

// Dietary requirements matrix & kitchen sign-off
$app->get('/api/dietary', [$ops, 'listDietary']);
$app->post('/api/dietary', [$ops, 'addDietary']);
$app->post('/api/dietary/confirm', [$ops, 'confirmDietary']);
$app->delete('/api/dietary', [$ops, 'deleteDietary']);

$app->run();
