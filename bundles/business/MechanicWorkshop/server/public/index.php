<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\WorkshopController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$shop = new WorkshopController();

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
$app->get('/api/customers', [$shop, 'listCustomers']);
$app->post('/api/customers', [$shop, 'addCustomer']);
$app->put('/api/customers', [$shop, 'saveCustomer']);
$app->delete('/api/customers', [$shop, 'deleteCustomer']);

// Vehicles garage
$app->get('/api/vehicles', [$shop, 'listVehicles']);
$app->post('/api/vehicles', [$shop, 'addVehicle']);
$app->put('/api/vehicles', [$shop, 'saveVehicle']);
$app->delete('/api/vehicles', [$shop, 'deleteVehicle']);

// Job cards & bay pipeline
$app->get('/api/cards', [$shop, 'listCards']);
$app->get('/api/cards/detail', [$shop, 'getCardDetail']);
$app->post('/api/cards', [$shop, 'addCard']);
$app->put('/api/cards', [$shop, 'saveCard']);
$app->post('/api/cards/status', [$shop, 'setCardStatus']);
$app->delete('/api/cards', [$shop, 'deleteCard']);

// Parts used log
$app->get('/api/parts', [$shop, 'listParts']);
$app->post('/api/parts', [$shop, 'addPart']);
$app->delete('/api/parts', [$shop, 'deletePart']);

// Workshop invoices
$app->get('/api/invoices', [$shop, 'listInvoices']);
$app->get('/api/invoices/detail', [$shop, 'getInvoiceDetail']);
$app->post('/api/invoices/from-card', [$shop, 'generateInvoiceFromCard']);
$app->post('/api/invoices/status', [$shop, 'setInvoiceStatus']);
$app->delete('/api/invoices', [$shop, 'deleteInvoice']);

$app->run();
