<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\FleetController;
use App\WorkspaceController;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();

// Recover JSON request bodies if zipp-php.wasm truncated U+201x punctuation (e.g. '—' -> byte 0x14)
$app->add(static function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
    $method = strtoupper($request->getMethod());
    if ($method !== 'GET' && $method !== 'HEAD') {
        $raw = (string) $request->getBody();
        if ($raw !== '' && json_decode($raw, true) === null) {
            $map = [
                0x13 => '\u2013',
                0x14 => '\u2014',
                0x18 => '\u2018',
                0x19 => '\u2019',
                0x1c => '\u201c',
                0x1d => '\u201d',
            ];
            $out = '';
            $len = strlen($raw);
            $changed = false;
            for ($i = 0; $i < $len; $i++) {
                $ch = $raw[$i];
                $ord = ord($ch);
                if (isset($map[$ord])) {
                    $out .= $map[$ord];
                    $changed = true;
                } else {
                    $out .= $ch;
                }
            }
            if ($changed) {
                $parsed = json_decode($out, true);
                if (is_array($parsed)) {
                    $request = $request->withParsedBody($parsed);
                }
            }
        }
    }
    return $handler->handle($request);
});

$ws = new WorkspaceController();
$fleet = new FleetController();

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

// Compliance command & 1-click renewal
$app->get('/api/compliance', [$fleet, 'getCompliance']);
$app->post('/api/compliance/renew', [$fleet, 'renewComplianceDate']);

// Vehicles register
$app->get('/api/vehicles', [$fleet, 'listVehicles']);
$app->post('/api/vehicles', [$fleet, 'addVehicle']);
$app->put('/api/vehicles', [$fleet, 'saveVehicle']);
$app->delete('/api/vehicles', [$fleet, 'deleteVehicle']);

// Drivers directory
$app->get('/api/drivers', [$fleet, 'listDrivers']);
$app->post('/api/drivers', [$fleet, 'addDriver']);
$app->put('/api/drivers', [$fleet, 'saveDriver']);
$app->delete('/api/drivers', [$fleet, 'deleteDriver']);

// Trip & fuel logbook (FBT + auto-odometer sync)
$app->get('/api/trips', [$fleet, 'listTrips']);
$app->post('/api/trips', [$fleet, 'addTrip']);
$app->put('/api/trips', [$fleet, 'saveTrip']);
$app->delete('/api/trips', [$fleet, 'deleteTrip']);

// Maintenance schedule
$app->get('/api/maintenance', [$fleet, 'listMaintenance']);
$app->post('/api/maintenance', [$fleet, 'addMaintenance']);
$app->put('/api/maintenance', [$fleet, 'saveMaintenance']);
$app->post('/api/maintenance/status', [$fleet, 'setMaintenanceStatus']);
$app->delete('/api/maintenance', [$fleet, 'deleteMaintenance']);

// Incident reports
$app->get('/api/incidents', [$fleet, 'listIncidents']);
$app->post('/api/incidents', [$fleet, 'addIncident']);
$app->put('/api/incidents', [$fleet, 'saveIncident']);
$app->post('/api/incidents/status', [$fleet, 'setIncidentStatus']);
$app->delete('/api/incidents', [$fleet, 'deleteIncident']);

$app->run();
