<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\ClinicController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$clinic = new ClinicController();

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

// Patients & administrative dossiers
$app->get('/api/patients', [$clinic, 'listPatients']);
$app->get('/api/patients/dossier', [$clinic, 'getPatientDossier']);
$app->post('/api/patients', [$clinic, 'addPatient']);
$app->put('/api/patients', [$clinic, 'savePatient']);
$app->delete('/api/patients', [$clinic, 'deletePatient']);

// Providers roster
$app->get('/api/providers', [$clinic, 'listProviders']);
$app->post('/api/providers', [$clinic, 'addProvider']);
$app->put('/api/providers', [$clinic, 'saveProvider']);
$app->delete('/api/providers', [$clinic, 'deleteProvider']);

// Waiting room appointments
$app->get('/api/appointments', [$clinic, 'listAppointments']);
$app->post('/api/appointments', [$clinic, 'addAppointment']);
$app->put('/api/appointments', [$clinic, 'saveAppointment']);
$app->post('/api/appointments/status', [$clinic, 'setAppointmentStatus']);
$app->delete('/api/appointments', [$clinic, 'deleteAppointment']);

// Digital intake & consent
$app->get('/api/intakes', [$clinic, 'listIntakes']);
$app->post('/api/intakes', [$clinic, 'addIntake']);
$app->delete('/api/intakes', [$clinic, 'deleteIntake']);

// Follow-up & recall queue
$app->get('/api/followups', [$clinic, 'listFollowUps']);
$app->post('/api/followups', [$clinic, 'addFollowUp']);
$app->post('/api/followups/status', [$clinic, 'setFollowUpStatus']);
$app->post('/api/followups/book', [$clinic, 'bookFollowUpAppointment']);
$app->delete('/api/followups', [$clinic, 'deleteFollowUp']);

$app->run();
