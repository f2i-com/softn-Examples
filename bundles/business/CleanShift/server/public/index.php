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

// Clients directory
$app->get('/api/clients', [$ops, 'listClients']);
$app->post('/api/clients', [$ops, 'addClient']);
$app->put('/api/clients', [$ops, 'saveClient']);
$app->delete('/api/clients', [$ops, 'deleteClient']);

// Cleaning teams roster
$app->get('/api/teams', [$ops, 'listTeams']);
$app->post('/api/teams', [$ops, 'addTeam']);
$app->put('/api/teams', [$ops, 'saveTeam']);
$app->delete('/api/teams', [$ops, 'deleteTeam']);

// Crew dispatch jobs
$app->get('/api/jobs', [$ops, 'listJobs']);
$app->post('/api/jobs', [$ops, 'addJob']);
$app->put('/api/jobs', [$ops, 'saveJob']);
$app->post('/api/jobs/status', [$ops, 'advanceJobStatus']);
$app->delete('/api/jobs', [$ops, 'deleteJob']);

// Quality checklists & star ratings
$app->get('/api/quality', [$ops, 'listQualityChecks']);
$app->post('/api/quality', [$ops, 'addQualityCheck']);
$app->delete('/api/quality', [$ops, 'deleteQualityCheck']);

// Cleaning supplies par stock
$app->get('/api/supplies', [$ops, 'listSupplies']);
$app->post('/api/supplies', [$ops, 'addSupply']);
$app->put('/api/supplies', [$ops, 'saveSupply']);
$app->post('/api/supplies/adjust', [$ops, 'adjustSupply']);
$app->delete('/api/supplies', [$ops, 'deleteSupply']);

// Client issues desk
$app->get('/api/issues', [$ops, 'listIssues']);
$app->post('/api/issues', [$ops, 'addIssue']);
$app->put('/api/issues', [$ops, 'saveIssue']);
$app->post('/api/issues/status', [$ops, 'setIssueStatus']);
$app->delete('/api/issues', [$ops, 'deleteIssue']);

$app->run();
