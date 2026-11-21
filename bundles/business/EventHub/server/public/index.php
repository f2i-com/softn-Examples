<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\EventOpsController;
use App\EventPeopleController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$people = new EventPeopleController();
$ops = new EventOpsController();

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

// Event Command Center
$app->get('/api/command', [$people, 'getCommandCenter']);

// Attendees & 1-Tap Check-In Desk
$app->get('/api/attendees', [$people, 'listAttendees']);
$app->post('/api/attendees', [$people, 'addAttendee']);
$app->put('/api/attendees', [$people, 'saveAttendee']);
$app->post('/api/attendees/checkin', [$people, 'toggleCheckIn']);
$app->delete('/api/attendees', [$people, 'deleteAttendee']);

// Speakers & Program
$app->get('/api/speakers', [$people, 'listSpeakers']);
$app->post('/api/speakers', [$people, 'addSpeaker']);
$app->put('/api/speakers', [$people, 'saveSpeaker']);
$app->post('/api/speakers/status', [$people, 'setSpeakerStatus']);
$app->delete('/api/speakers', [$people, 'deleteSpeaker']);

// Vendors & Exhibitors
$app->get('/api/vendors', [$people, 'listVendors']);
$app->post('/api/vendors', [$people, 'addVendor']);
$app->put('/api/vendors', [$people, 'saveVendor']);
$app->post('/api/vendors/status', [$people, 'setVendorStatus']);
$app->delete('/api/vendors', [$people, 'deleteVendor']);

// Volunteer Roster
$app->get('/api/volunteers', [$people, 'listVolunteers']);
$app->post('/api/volunteers', [$people, 'addVolunteer']);
$app->put('/api/volunteers', [$people, 'saveVolunteer']);
$app->delete('/api/volunteers', [$people, 'deleteVolunteer']);

// Budget Tracker
$app->get('/api/budget', [$ops, 'listBudget']);
$app->post('/api/budget', [$ops, 'addBudgetItem']);
$app->put('/api/budget', [$ops, 'saveBudgetItem']);
$app->delete('/api/budget', [$ops, 'deleteBudgetItem']);

// Event Incident Log
$app->get('/api/incidents', [$ops, 'listIncidents']);
$app->post('/api/incidents', [$ops, 'addIncident']);
$app->post('/api/incidents/status', [$ops, 'setIncidentStatus']);
$app->delete('/api/incidents', [$ops, 'deleteIncident']);

// Post-Event Feedback Summary
$app->get('/api/feedback', [$ops, 'listFeedback']);
$app->post('/api/feedback', [$ops, 'addFeedback']);
$app->delete('/api/feedback', [$ops, 'deleteFeedback']);

$app->run();
