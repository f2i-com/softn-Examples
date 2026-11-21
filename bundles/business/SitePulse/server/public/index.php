<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\SitePulseController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$sp = new SitePulseController();

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

// Construction projects
$app->get('/api/projects', [$sp, 'listProjects']);
$app->post('/api/projects', [$sp, 'addProject']);
$app->put('/api/projects', [$sp, 'saveProject']);
$app->delete('/api/projects', [$sp, 'deleteProject']);

// Daily site diaries
$app->get('/api/diaries', [$sp, 'listDiaries']);
$app->post('/api/diaries', [$sp, 'addDiary']);
$app->put('/api/diaries', [$sp, 'saveDiary']);
$app->post('/api/diaries/sign', [$sp, 'signDiary']);
$app->delete('/api/diaries', [$sp, 'deleteDiary']);

// Defect & snag list
$app->get('/api/defects', [$sp, 'listDefects']);
$app->post('/api/defects', [$sp, 'addDefect']);
$app->put('/api/defects', [$sp, 'saveDefect']);
$app->post('/api/defects/status', [$sp, 'setDefectStatus']);
$app->delete('/api/defects', [$sp, 'deleteDefect']);

// Variation requests
$app->get('/api/variations', [$sp, 'listVariations']);
$app->post('/api/variations', [$sp, 'addVariation']);
$app->put('/api/variations', [$sp, 'saveVariation']);
$app->post('/api/variations/decide', [$sp, 'decideVariation']);
$app->delete('/api/variations', [$sp, 'deleteVariation']);

// Material deliveries
$app->get('/api/deliveries', [$sp, 'listDeliveries']);
$app->post('/api/deliveries', [$sp, 'addDelivery']);
$app->put('/api/deliveries', [$sp, 'saveDelivery']);
$app->delete('/api/deliveries', [$sp, 'deleteDelivery']);

// Subcontractor register
$app->get('/api/subcontractors', [$sp, 'listSubcontractors']);
$app->post('/api/subcontractors', [$sp, 'addSubcontractor']);
$app->put('/api/subcontractors', [$sp, 'saveSubcontractor']);
$app->delete('/api/subcontractors', [$sp, 'deleteSubcontractor']);

$app->run();
