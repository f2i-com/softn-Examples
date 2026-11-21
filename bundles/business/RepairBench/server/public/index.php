<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\BenchController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$bench = new BenchController();

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

// Customers
$app->get('/api/customers', [$bench, 'listCustomers']);
$app->post('/api/customers', [$bench, 'addCustomer']);
$app->put('/api/customers', [$bench, 'saveCustomer']);
$app->delete('/api/customers', [$bench, 'deleteCustomer']);

// Bench Technicians
$app->get('/api/technicians', [$bench, 'listTechnicians']);
$app->post('/api/technicians', [$bench, 'addTechnician']);
$app->put('/api/technicians', [$bench, 'saveTechnician']);
$app->delete('/api/technicians', [$bench, 'deleteTechnician']);

// Devices
$app->get('/api/devices', [$bench, 'listDevices']);
$app->post('/api/devices', [$bench, 'addDevice']);
$app->put('/api/devices', [$bench, 'saveDevice']);
$app->delete('/api/devices', [$bench, 'deleteDevice']);

// Repair Pipeline Jobs
$app->get('/api/jobs', [$bench, 'listJobs']);
$app->post('/api/jobs', [$bench, 'addJob']);
$app->post('/api/jobs/intake', [$bench, 'quickIntakeDeviceJob']);
$app->put('/api/jobs', [$bench, 'saveJob']);
$app->post('/api/jobs/advance', [$bench, 'advanceJob']);
$app->post('/api/jobs/notify', [$bench, 'markJobNotified']);
$app->delete('/api/jobs', [$bench, 'deleteJob']);

// Parts Orders
$app->get('/api/parts', [$bench, 'listParts']);
$app->post('/api/parts', [$bench, 'addPartOrder']);
$app->post('/api/parts/status', [$bench, 'setPartStatus']);
$app->delete('/api/parts', [$bench, 'deletePartOrder']);

// Quality Check & Pickup Desk
$app->get('/api/qa', [$bench, 'listQualityChecks']);
$app->post('/api/qa', [$bench, 'addQualityCheck']);
$app->post('/api/qa/notify', [$bench, 'markQaNotified']);

$app->run();
