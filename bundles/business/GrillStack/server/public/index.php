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

// Menu & ingredient builds
$app->get('/api/menu', [$ops, 'listMenu']);
$app->post('/api/menu', [$ops, 'addMenuItem']);
$app->put('/api/menu', [$ops, 'saveMenuItem']);
$app->delete('/api/menu', [$ops, 'deleteMenuItem']);

// Counter orders (auto-fires multi-station KDS tickets)
$app->get('/api/orders', [$ops, 'listOrders']);
$app->post('/api/orders', [$ops, 'createOrder']);
$app->post('/api/orders/status', [$ops, 'setOrderStatus']);
$app->delete('/api/orders', [$ops, 'deleteOrder']);

// Kitchen pass KDS tickets
$app->get('/api/tickets', [$ops, 'listTickets']);
$app->post('/api/tickets', [$ops, 'addTicket']);
$app->post('/api/tickets/advance', [$ops, 'advanceTicket']);
$app->delete('/api/tickets', [$ops, 'deleteTicket']);

// Prep & par stock
$app->get('/api/stock', [$ops, 'listStock']);
$app->post('/api/stock', [$ops, 'addStockItem']);
$app->put('/api/stock', [$ops, 'saveStockItem']);
$app->post('/api/stock/adjust', [$ops, 'adjustStock']);
$app->delete('/api/stock', [$ops, 'deleteStockItem']);

// Staff shifts & break tracking
$app->get('/api/shifts', [$ops, 'listShifts']);
$app->post('/api/shifts', [$ops, 'addShift']);
$app->put('/api/shifts', [$ops, 'saveShift']);
$app->post('/api/shifts/break', [$ops, 'toggleShiftBreak']);
$app->delete('/api/shifts', [$ops, 'deleteShift']);

// Daily close & till reconciliation
$app->get('/api/closes', [$ops, 'listCloses']);
$app->post('/api/closes', [$ops, 'addClose']);
$app->post('/api/closes/status', [$ops, 'setCloseStatus']);
$app->delete('/api/closes', [$ops, 'deleteClose']);

$app->run();
