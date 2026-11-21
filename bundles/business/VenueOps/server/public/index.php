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

// Spaces catalogue
$app->get('/api/spaces', [$ops, 'listSpaces']);
$app->post('/api/spaces', [$ops, 'addSpace']);
$app->put('/api/spaces', [$ops, 'saveSpace']);
$app->delete('/api/spaces', [$ops, 'deleteSpace']);

// Hirer clients directory
$app->get('/api/clients', [$ops, 'listClients']);
$app->post('/api/clients', [$ops, 'addClient']);
$app->put('/api/clients', [$ops, 'saveClient']);
$app->delete('/api/clients', [$ops, 'deleteClient']);

// Space schedule & bookings
$app->get('/api/bookings', [$ops, 'listBookings']);
$app->get('/api/bookings/confirmation', [$ops, 'getBookingConfirmation']);
$app->post('/api/bookings', [$ops, 'addBooking']);
$app->put('/api/bookings', [$ops, 'saveBooking']);
$app->post('/api/bookings/status', [$ops, 'setBookingStatus']);
$app->delete('/api/bookings', [$ops, 'deleteBooking']);

// Setup & facilities checklists
$app->get('/api/setups', [$ops, 'listSetups']);
$app->post('/api/setups', [$ops, 'addSetup']);
$app->put('/api/setups', [$ops, 'saveSetup']);
$app->post('/api/setups/complete', [$ops, 'toggleSetupComplete']);
$app->delete('/api/setups', [$ops, 'deleteSetup']);

// Payments & deposits ledger
$app->get('/api/payments', [$ops, 'listPayments']);
$app->post('/api/payments', [$ops, 'addPayment']);
$app->post('/api/payments/status', [$ops, 'setPaymentStatus']);
$app->delete('/api/payments', [$ops, 'deletePayment']);

// Incidents & damage reports
$app->get('/api/incidents', [$ops, 'listIncidents']);
$app->post('/api/incidents', [$ops, 'addIncident']);
$app->post('/api/incidents/status', [$ops, 'setIncidentStatus']);
$app->delete('/api/incidents', [$ops, 'deleteIncident']);

$app->run();
