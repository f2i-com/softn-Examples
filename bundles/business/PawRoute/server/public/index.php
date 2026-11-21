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

// Clients (pet owners & home access)
$app->get('/api/clients', [$ops, 'listClients']);
$app->post('/api/clients', [$ops, 'addClient']);
$app->put('/api/clients', [$ops, 'saveClient']);
$app->delete('/api/clients', [$ops, 'deleteClient']);

// Pet profiles
$app->get('/api/pets', [$ops, 'listPets']);
$app->post('/api/pets', [$ops, 'addPet']);
$app->put('/api/pets', [$ops, 'savePet']);
$app->delete('/api/pets', [$ops, 'deletePet']);

// Walkers & sitters roster
$app->get('/api/walkers', [$ops, 'listWalkers']);
$app->post('/api/walkers', [$ops, 'addWalker']);
$app->put('/api/walkers', [$ops, 'saveWalker']);
$app->delete('/api/walkers', [$ops, 'deleteWalker']);

// Daily walks & visits run-sheet
$app->get('/api/walks', [$ops, 'listWalks']);
$app->post('/api/walks', [$ops, 'addWalk']);
$app->put('/api/walks', [$ops, 'saveWalk']);
$app->post('/api/walks/status', [$ops, 'setWalkStatus']);
$app->delete('/api/walks', [$ops, 'deleteWalk']);

// Safety incidents & care notes
$app->get('/api/incidents', [$ops, 'listIncidents']);
$app->post('/api/incidents', [$ops, 'addIncident']);
$app->put('/api/incidents', [$ops, 'saveIncident']);
$app->post('/api/incidents/followup', [$ops, 'toggleIncidentFollowUp']);
$app->delete('/api/incidents', [$ops, 'deleteIncident']);

$app->run();
