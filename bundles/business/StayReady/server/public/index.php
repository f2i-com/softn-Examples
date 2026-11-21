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

// Turnover command
$app->get('/api/command', [$ops, 'getTurnoverCommand']);

// Properties
$app->get('/api/properties', [$ops, 'listProperties']);
$app->post('/api/properties', [$ops, 'addProperty']);
$app->put('/api/properties', [$ops, 'saveProperty']);
$app->delete('/api/properties', [$ops, 'deleteProperty']);

// Cleaners roster
$app->get('/api/cleaners', [$ops, 'listCleaners']);
$app->post('/api/cleaners', [$ops, 'addCleaner']);
$app->put('/api/cleaners', [$ops, 'saveCleaner']);
$app->delete('/api/cleaners', [$ops, 'deleteCleaner']);

// Bookings
$app->get('/api/bookings', [$ops, 'listBookings']);
$app->post('/api/bookings', [$ops, 'addBooking']);
$app->put('/api/bookings', [$ops, 'saveBooking']);
$app->post('/api/bookings/status', [$ops, 'setBookingStatus']);
$app->delete('/api/bookings', [$ops, 'deleteBooking']);

// Turnovers
$app->get('/api/turnovers', [$ops, 'listTurnovers']);
$app->post('/api/turnovers', [$ops, 'addTurnover']);
$app->put('/api/turnovers', [$ops, 'saveTurnover']);
$app->post('/api/turnovers/status', [$ops, 'advanceTurnoverStatus']);
$app->delete('/api/turnovers', [$ops, 'deleteTurnover']);

// Inspections & damage log
$app->get('/api/inspections', [$ops, 'listInspections']);
$app->post('/api/inspections', [$ops, 'addInspection']);
$app->post('/api/inspections/followup', [$ops, 'toggleInspectionFollowUp']);
$app->delete('/api/inspections', [$ops, 'deleteInspection']);

// Per-property supplies
$app->get('/api/supplies', [$ops, 'listSupplies']);
$app->post('/api/supplies', [$ops, 'addSupply']);
$app->put('/api/supplies', [$ops, 'saveSupply']);
$app->post('/api/supplies/adjust', [$ops, 'adjustSupply']);
$app->delete('/api/supplies', [$ops, 'deleteSupply']);

$app->run();
