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

// Warehouse command overview
$app->get('/api/overview', [$ops, 'getOverview']);

// Products & stock-on-hand
$app->get('/api/products', [$ops, 'listProducts']);
$app->post('/api/products', [$ops, 'addProduct']);
$app->put('/api/products', [$ops, 'saveProduct']);
$app->post('/api/products/adjust', [$ops, 'adjustStock']);
$app->delete('/api/products', [$ops, 'deleteProduct']);

// Suppliers directory
$app->get('/api/suppliers', [$ops, 'listSuppliers']);
$app->post('/api/suppliers', [$ops, 'addSupplier']);
$app->put('/api/suppliers', [$ops, 'saveSupplier']);
$app->delete('/api/suppliers', [$ops, 'deleteSupplier']);

// Multi-line purchase orders & atomic receiving
$app->get('/api/pos', [$ops, 'listPurchaseOrders']);
$app->get('/api/pos/detail', [$ops, 'getPurchaseOrder']);
$app->post('/api/pos', [$ops, 'createPurchaseOrder']);
$app->put('/api/pos', [$ops, 'updatePurchaseOrder']);
$app->post('/api/pos/status', [$ops, 'setPurchaseOrderStatus']);
$app->post('/api/pos/receive', [$ops, 'receivePurchaseOrder']);
$app->delete('/api/pos', [$ops, 'deletePurchaseOrder']);

// Stock movements audit ledger
$app->get('/api/movements', [$ops, 'listMovements']);
$app->post('/api/movements', [$ops, 'addMovement']);

$app->run();
