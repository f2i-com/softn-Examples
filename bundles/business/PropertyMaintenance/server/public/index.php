<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\MaintenanceController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$ops = new MaintenanceController();

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

// Properties register
$app->get('/api/properties', [$ops, 'listProperties']);
$app->post('/api/properties', [$ops, 'addProperty']);
$app->put('/api/properties', [$ops, 'saveProperty']);
$app->delete('/api/properties', [$ops, 'deleteProperty']);

// Tenants directory
$app->get('/api/tenants', [$ops, 'listTenants']);
$app->post('/api/tenants', [$ops, 'addTenant']);
$app->put('/api/tenants', [$ops, 'saveTenant']);
$app->delete('/api/tenants', [$ops, 'deleteTenant']);

// Maintenance requests triage board
$app->get('/api/requests', [$ops, 'listRequests']);
$app->post('/api/requests', [$ops, 'addRequest']);
$app->put('/api/requests', [$ops, 'saveRequest']);
$app->post('/api/requests/status', [$ops, 'setRequestStatus']);
$app->delete('/api/requests', [$ops, 'deleteRequest']);

// Work orders & handyman schedule
$app->get('/api/work-orders', [$ops, 'listWorkOrders']);
$app->post('/api/work-orders', [$ops, 'addWorkOrder']);
$app->put('/api/work-orders', [$ops, 'saveWorkOrder']);
$app->post('/api/work-orders/complete', [$ops, 'completeWorkOrder']);
$app->delete('/api/work-orders', [$ops, 'deleteWorkOrder']);

// Property inspections
$app->get('/api/inspections', [$ops, 'listInspections']);
$app->post('/api/inspections', [$ops, 'addInspection']);
$app->put('/api/inspections', [$ops, 'saveInspection']);
$app->delete('/api/inspections', [$ops, 'deleteInspection']);

$app->run();
