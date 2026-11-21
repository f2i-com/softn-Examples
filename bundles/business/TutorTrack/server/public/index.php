<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\TutoringController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$tut = new TutoringController();

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

// Students & Guardians
$app->get('/api/students', [$tut, 'listStudents']);
$app->get('/api/students/dossier', [$tut, 'getStudentDossier']);
$app->post('/api/students', [$tut, 'addStudent']);
$app->put('/api/students', [$tut, 'saveStudent']);
$app->delete('/api/students', [$tut, 'deleteStudent']);

// Tutors Roster
$app->get('/api/tutors', [$tut, 'listTutors']);
$app->post('/api/tutors', [$tut, 'addTutor']);
$app->put('/api/tutors', [$tut, 'saveTutor']);
$app->delete('/api/tutors', [$tut, 'deleteTutor']);

// Lessons Schedule
$app->get('/api/lessons', [$tut, 'listLessons']);
$app->post('/api/lessons', [$tut, 'addLesson']);
$app->put('/api/lessons', [$tut, 'saveLesson']);
$app->post('/api/lessons/status', [$tut, 'setLessonStatus']);
$app->delete('/api/lessons', [$tut, 'deleteLesson']);

// Progress Notes & Homework
$app->get('/api/progress', [$tut, 'listProgressNotes']);
$app->post('/api/progress', [$tut, 'addProgressNote']);
$app->delete('/api/progress', [$tut, 'deleteProgressNote']);

// Billing & Tuition Invoices
$app->get('/api/invoices', [$tut, 'listInvoices']);
$app->post('/api/invoices', [$tut, 'addInvoice']);
$app->post('/api/invoices/status', [$tut, 'setInvoiceStatus']);
$app->delete('/api/invoices', [$tut, 'deleteInvoice']);

$app->run();
