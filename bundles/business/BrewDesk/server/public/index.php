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

// Menu board
$app->get('/api/menu', [$ops, 'listMenu']);
$app->post('/api/menu', [$ops, 'addMenuItem']);
$app->put('/api/menu', [$ops, 'saveMenuItem']);
$app->delete('/api/menu', [$ops, 'deleteMenuItem']);

// Orders
$app->get('/api/orders', [$ops, 'listOrders']);
$app->post('/api/orders', [$ops, 'createOrder']);
$app->post('/api/orders/status', [$ops, 'setOrderStatus']);
$app->delete('/api/orders', [$ops, 'deleteOrder']);

// Barista ticket queue
$app->get('/api/tickets', [$ops, 'listTickets']);
$app->post('/api/tickets', [$ops, 'addTicket']);
$app->post('/api/tickets/advance', [$ops, 'advanceTicket']);
$app->delete('/api/tickets', [$ops, 'deleteTicket']);

// Stock & par levels
$app->get('/api/stock', [$ops, 'listStock']);
$app->post('/api/stock', [$ops, 'addStockItem']);
$app->put('/api/stock', [$ops, 'saveStockItem']);
$app->post('/api/stock/adjust', [$ops, 'adjustStock']);
$app->delete('/api/stock', [$ops, 'deleteStockItem']);

// Shift roster
$app->get('/api/shifts', [$ops, 'listShifts']);
$app->post('/api/shifts', [$ops, 'addShift']);
$app->put('/api/shifts', [$ops, 'saveShift']);
$app->delete('/api/shifts', [$ops, 'deleteShift']);

// Daily closeouts
$app->get('/api/closes', [$ops, 'listCloses']);
$app->post('/api/closes', [$ops, 'addClose']);
$app->delete('/api/closes', [$ops, 'deleteClose']);

$app->run();
