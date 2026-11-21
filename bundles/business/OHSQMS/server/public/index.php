<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\OhsController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$ohs = new OhsController();

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

// Safety & Quality Command dashboard
$app->get('/api/command', [$ohs, 'getCommandSummary']);

// Incidents & Injury register
$app->get('/api/incidents', [$ohs, 'listIncidents']);
$app->post('/api/incidents', [$ohs, 'addIncident']);
$app->post('/api/incidents/status', [$ohs, 'setIncidentStatus']);
$app->delete('/api/incidents', [$ohs, 'deleteIncident']);

$app->get('/api/injuries', [$ohs, 'listInjuries']);
$app->post('/api/injuries', [$ohs, 'addInjury']);
$app->delete('/api/injuries', [$ohs, 'deleteInjury']);

// Hazards & 5x5 Risk Matrix
$app->get('/api/hazards', [$ohs, 'listHazards']);
$app->post('/api/hazards', [$ohs, 'addHazard']);
$app->post('/api/hazards/status', [$ohs, 'setHazardStatus']);
$app->delete('/api/hazards', [$ohs, 'deleteHazard']);

// Action Items & CAPA Tracker
$app->get('/api/actions', [$ohs, 'listActions']);
$app->post('/api/actions', [$ohs, 'addAction']);
$app->post('/api/actions/status', [$ohs, 'setActionStatus']);
$app->delete('/api/actions', [$ohs, 'deleteAction']);

// Audits, CARs & NCRs
$app->get('/api/audits', [$ohs, 'listAudits']);
$app->post('/api/audits', [$ohs, 'addAudit']);
$app->delete('/api/audits', [$ohs, 'deleteAudit']);

$app->get('/api/cars', [$ohs, 'listCars']);
$app->post('/api/cars', [$ohs, 'addCar']);
$app->post('/api/cars/status', [$ohs, 'setCarStatus']);
$app->delete('/api/cars', [$ohs, 'deleteCar']);

$app->get('/api/ncrs', [$ohs, 'listNcrs']);
$app->post('/api/ncrs', [$ohs, 'addNcr']);
$app->post('/api/ncrs/status', [$ohs, 'setNcrStatus']);
$app->delete('/api/ncrs', [$ohs, 'deleteNcr']);

// Training & Competency Matrix
$app->get('/api/training', [$ohs, 'listTraining']);
$app->post('/api/training', [$ohs, 'addTraining']);
$app->delete('/api/training', [$ohs, 'deleteTraining']);

// Contractor Approvals
$app->get('/api/contractors', [$ohs, 'listContractors']);
$app->post('/api/contractors', [$ohs, 'addContractor']);
$app->delete('/api/contractors', [$ohs, 'deleteContractor']);

// Complaints, Toolbox Talks & Plant Register
$app->get('/api/complaints', [$ohs, 'listComplaints']);
$app->post('/api/complaints', [$ohs, 'addComplaint']);
$app->post('/api/complaints/status', [$ohs, 'setComplaintStatus']);
$app->delete('/api/complaints', [$ohs, 'deleteComplaint']);

$app->get('/api/meetings', [$ohs, 'listMeetings']);
$app->post('/api/meetings', [$ohs, 'addMeeting']);
$app->delete('/api/meetings', [$ohs, 'deleteMeeting']);

$app->get('/api/plant', [$ohs, 'listPlant']);
$app->post('/api/plant', [$ohs, 'addPlant']);
$app->delete('/api/plant', [$ohs, 'deletePlant']);

$app->run();
