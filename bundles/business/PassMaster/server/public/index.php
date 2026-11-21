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

// Brigade staff roster
$app->get('/api/staff', [$ops, 'listStaff']);
$app->post('/api/staff', [$ops, 'addStaff']);
$app->put('/api/staff', [$ops, 'saveStaff']);
$app->delete('/api/staff', [$ops, 'deleteStaff']);

// Floor & table map
$app->get('/api/tables', [$ops, 'listTables']);
$app->post('/api/tables', [$ops, 'addTable']);
$app->put('/api/tables', [$ops, 'saveTable']);
$app->post('/api/tables/status', [$ops, 'setTableStatus']);
$app->delete('/api/tables', [$ops, 'deleteTable']);

// Reservations book & 1-click seating
$app->get('/api/reservations', [$ops, 'listReservations']);
$app->post('/api/reservations', [$ops, 'addReservation']);
$app->put('/api/reservations', [$ops, 'saveReservation']);
$app->post('/api/reservations/seat', [$ops, 'seatReservation']);
$app->post('/api/reservations/status', [$ops, 'setReservationStatus']);
$app->delete('/api/reservations', [$ops, 'deleteReservation']);

// Course kitchen pass
$app->get('/api/tickets', [$ops, 'listTickets']);
$app->post('/api/tickets', [$ops, 'fireTicket']);
$app->post('/api/tickets/advance', [$ops, 'advanceTicket']);
$app->delete('/api/tickets', [$ops, 'deleteTicket']);

// Station prep list
$app->get('/api/prep', [$ops, 'listPrep']);
$app->post('/api/prep', [$ops, 'addPrepItem']);
$app->put('/api/prep', [$ops, 'savePrepItem']);
$app->post('/api/prep/status', [$ops, 'setPrepStatus']);
$app->delete('/api/prep', [$ops, 'deletePrepItem']);

// Nightly shift close
$app->get('/api/closes', [$ops, 'listCloses']);
$app->post('/api/closes', [$ops, 'addClose']);
$app->delete('/api/closes', [$ops, 'deleteClose']);

$app->run();
