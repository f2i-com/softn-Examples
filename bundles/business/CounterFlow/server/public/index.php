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

// Store ops overview
$app->get('/api/overview', [$ops, 'getOverview']);

// Suppliers
$app->get('/api/suppliers', [$ops, 'listSuppliers']);
$app->post('/api/suppliers', [$ops, 'addSupplier']);
$app->put('/api/suppliers', [$ops, 'saveSupplier']);
$app->delete('/api/suppliers', [$ops, 'deleteSupplier']);

// Products & atomic stock adjustment
$app->get('/api/products', [$ops, 'listProducts']);
$app->post('/api/products', [$ops, 'addProduct']);
$app->put('/api/products', [$ops, 'saveProduct']);
$app->post('/api/products/adjust', [$ops, 'adjustProductStock']);
$app->delete('/api/products', [$ops, 'deleteProduct']);

// Stock movements ledger
$app->get('/api/movements', [$ops, 'listMovements']);
$app->post('/api/movements', [$ops, 'addMovement']);
$app->delete('/api/movements', [$ops, 'deleteMovement']);

// Store floor tasks
$app->get('/api/tasks', [$ops, 'listTasks']);
$app->post('/api/tasks', [$ops, 'addTask']);
$app->put('/api/tasks', [$ops, 'saveTask']);
$app->post('/api/tasks/status', [$ops, 'setTaskStatus']);
$app->delete('/api/tasks', [$ops, 'deleteTask']);

// Staff roster
$app->get('/api/staff', [$ops, 'listStaff']);
$app->post('/api/staff', [$ops, 'addStaffMember']);
$app->put('/api/staff', [$ops, 'saveStaffMember']);
$app->delete('/api/staff', [$ops, 'deleteStaffMember']);

// Customer returns & exchanges desk
$app->get('/api/returns', [$ops, 'listReturns']);
$app->post('/api/returns', [$ops, 'addReturn']);
$app->put('/api/returns', [$ops, 'saveReturn']);
$app->post('/api/returns/status', [$ops, 'setReturnStatus']);
$app->delete('/api/returns', [$ops, 'deleteReturn']);

$app->run();
