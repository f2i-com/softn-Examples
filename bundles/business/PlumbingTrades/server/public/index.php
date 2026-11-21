<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\FieldOpsController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$ops = new FieldOpsController();

// Workspace, settings, rates, team & sample data
$app->get('/api/session', [$ws, 'getSession']);
$app->post('/api/setup', [$ws, 'completeSetup']);
$app->put('/api/settings', [$ws, 'saveSettings']);
$app->get('/api/team', [$ws, 'listTeam']);
$app->post('/api/team/join', [$ws, 'requestJoin']);
$app->put('/api/team', [$ws, 'updateMember']);
$app->delete('/api/team', [$ws, 'removeMember']);
$app->post('/api/sample/load', [$ws, 'loadSampleData']);
$app->post('/api/sample/clear', [$ws, 'clearSampleData']);

// Customers directory
$app->get('/api/customers', [$ops, 'listCustomers']);
$app->post('/api/customers', [$ops, 'addCustomer']);
$app->put('/api/customers', [$ops, 'saveCustomer']);
$app->delete('/api/customers', [$ops, 'deleteCustomer']);

// Jobs & field dispatch board
$app->get('/api/jobs', [$ops, 'listJobs']);
$app->get('/api/jobs/detail', [$ops, 'getJobDetail']);
$app->post('/api/jobs', [$ops, 'addJob']);
$app->put('/api/jobs', [$ops, 'saveJob']);
$app->post('/api/jobs/status', [$ops, 'setJobStatus']);
$app->delete('/api/jobs', [$ops, 'deleteJob']);

// Site visits / on-site work orders
$app->get('/api/visits', [$ops, 'listVisits']);
$app->post('/api/visits', [$ops, 'addVisit']);
$app->put('/api/visits', [$ops, 'saveVisit']);
$app->delete('/api/visits', [$ops, 'deleteVisit']);

// Parts & materials requests
$app->get('/api/parts', [$ops, 'listParts']);
$app->post('/api/parts', [$ops, 'addPart']);
$app->put('/api/parts', [$ops, 'savePart']);
$app->post('/api/parts/status', [$ops, 'setPartStatus']);
$app->delete('/api/parts', [$ops, 'deletePart']);

// Job invoices & 1-click raise from job
$app->get('/api/invoices', [$ops, 'listInvoices']);
$app->post('/api/invoices', [$ops, 'addInvoice']);
$app->post('/api/invoices/from-job', [$ops, 'raiseInvoiceFromJob']);
$app->post('/api/invoices/status', [$ops, 'setInvoiceStatus']);
$app->delete('/api/invoices', [$ops, 'deleteInvoice']);

$app->run();
