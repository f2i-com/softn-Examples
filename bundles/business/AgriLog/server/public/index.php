<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\FarmController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

// Polyfill is_finite() for zipp-php.wasm (used by SoftN\Kit\Validator::int/numVal/moneyCents).
if (!function_exists('is_finite')) {
    eval('function is_finite($num): bool { $f = (float) $num; return ($f - $f) === 0.0; }');
}

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$farm = new FarmController();

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

// Paddocks & blocks
$app->get('/api/paddocks', [$farm, 'listPaddocks']);
$app->post('/api/paddocks', [$farm, 'addPaddock']);
$app->put('/api/paddocks', [$farm, 'savePaddock']);
$app->delete('/api/paddocks', [$farm, 'deletePaddock']);

// Farm jobs
$app->get('/api/jobs', [$farm, 'listJobs']);
$app->post('/api/jobs', [$farm, 'addJob']);
$app->put('/api/jobs', [$farm, 'saveJob']);
$app->post('/api/jobs/status', [$farm, 'setJobStatus']);
$app->delete('/api/jobs', [$farm, 'deleteJob']);

// Harvest log (WHP-guarded)
$app->get('/api/harvests', [$farm, 'listHarvests']);
$app->post('/api/harvests', [$farm, 'addHarvest']);
$app->delete('/api/harvests', [$farm, 'deleteHarvest']);

// Chemical application register
$app->get('/api/chemicals', [$farm, 'listChemicals']);
$app->post('/api/chemicals', [$farm, 'addChemical']);
$app->delete('/api/chemicals', [$farm, 'deleteChemical']);

// Machinery & shed maintenance
$app->get('/api/machinery', [$farm, 'listMachinery']);
$app->post('/api/machinery', [$farm, 'addMachine']);
$app->put('/api/machinery', [$farm, 'saveMachine']);
$app->delete('/api/machinery', [$farm, 'deleteMachine']);
$app->get('/api/maintenance', [$farm, 'listMaintenance']);
$app->post('/api/maintenance', [$farm, 'addMaintenance']);
$app->delete('/api/maintenance', [$farm, 'deleteMaintenance']);

$app->run();
