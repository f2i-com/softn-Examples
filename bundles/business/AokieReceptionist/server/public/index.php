<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\ReceptionistController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$rec = new ReceptionistController();

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

// Live Call Console & Transcripts
$app->get('/api/calls', [$rec, 'listCalls']);
$app->get('/api/calls/detail', [$rec, 'getCallDetail']);
$app->post('/api/calls', [$rec, 'addCall']);
$app->post('/api/calls/status', [$rec, 'setCallStatus']);
$app->post('/api/calls/turn', [$rec, 'addTranscriptTurn']);
$app->delete('/api/calls', [$rec, 'deleteCall']);

// Two-Pane SMS Inbox
$app->get('/api/sms/threads', [$rec, 'listSmsThreads']);
$app->get('/api/sms/messages', [$rec, 'listSmsMessages']);
$app->post('/api/sms/send', [$rec, 'sendSmsMessage']);
$app->post('/api/sms/read', [$rec, 'markThreadRead']);
$app->post('/api/sms/approve', [$rec, 'approveSmsDraft']);
$app->delete('/api/sms/threads', [$rec, 'deleteSmsThread']);

// Appointments Desk
$app->get('/api/appointments', [$rec, 'listAppointments']);
$app->post('/api/appointments', [$rec, 'addAppointment']);
$app->post('/api/appointments/status', [$rec, 'setAppointmentStatus']);
$app->delete('/api/appointments', [$rec, 'deleteAppointment']);

// Orders Desk
$app->get('/api/orders', [$rec, 'listOrders']);
$app->post('/api/orders', [$rec, 'addOrder']);
$app->post('/api/orders/status', [$rec, 'setOrderStatus']);
$app->delete('/api/orders', [$rec, 'deleteOrder']);

// Follow-Up Tasks Queue
$app->get('/api/tasks', [$rec, 'listTasks']);
$app->post('/api/tasks', [$rec, 'addTask']);
$app->post('/api/tasks/status', [$rec, 'setTaskStatus']);
$app->delete('/api/tasks', [$rec, 'deleteTask']);

// Callers / Customers CRM
$app->get('/api/customers', [$rec, 'listCustomers']);
$app->post('/api/customers', [$rec, 'addCustomer']);
$app->put('/api/customers', [$rec, 'saveCustomer']);
$app->delete('/api/customers', [$rec, 'deleteCustomer']);

// Hardware & Bridge Events Log
$app->get('/api/hardware', [$rec, 'listHardwareEvents']);
$app->post('/api/hardware', [$rec, 'addHardwareEvent']);
$app->post('/api/hardware/ack', [$rec, 'ackHardwareEvent']);
$app->delete('/api/hardware', [$rec, 'deleteHardwareEvent']);

// AI Receptionist Persona & Routing Settings
$app->get('/api/receptionist', [$rec, 'getReceptionistConfig']);
$app->put('/api/receptionist', [$rec, 'saveReceptionistConfig']);

$app->run();
