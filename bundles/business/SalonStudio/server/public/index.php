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

// Clients & history
$app->get('/api/clients', [$ops, 'listClients']);
$app->get('/api/clients/history', [$ops, 'getClientHistory']);
$app->post('/api/clients', [$ops, 'addClient']);
$app->put('/api/clients', [$ops, 'saveClient']);
$app->delete('/api/clients', [$ops, 'deleteClient']);

// Service menu
$app->get('/api/services', [$ops, 'listServices']);
$app->post('/api/services', [$ops, 'addService']);
$app->put('/api/services', [$ops, 'saveService']);
$app->delete('/api/services', [$ops, 'deleteService']);

// Stylist roster
$app->get('/api/stylists', [$ops, 'listStylists']);
$app->post('/api/stylists', [$ops, 'addStylist']);
$app->put('/api/stylists', [$ops, 'saveStylist']);
$app->post('/api/stylists/toggle', [$ops, 'toggleStylistActive']);
$app->delete('/api/stylists', [$ops, 'deleteStylist']);

// Daily appointment book
$app->get('/api/appointments', [$ops, 'listAppointments']);
$app->post('/api/appointments', [$ops, 'addAppointment']);
$app->put('/api/appointments', [$ops, 'saveAppointment']);
$app->post('/api/appointments/status', [$ops, 'advanceAppointmentStatus']);
$app->delete('/api/appointments', [$ops, 'deleteAppointment']);

// Retail product sales
$app->get('/api/sales', [$ops, 'listSales']);
$app->post('/api/sales', [$ops, 'addSale']);
$app->delete('/api/sales', [$ops, 'deleteSale']);

$app->run();
