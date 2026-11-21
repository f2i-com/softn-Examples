<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\ProductKbController;
use App\SupportController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$support = new SupportController();
$pkb = new ProductKbController();

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

// Support ticket queue & triage
$app->get('/api/tickets', [$support, 'listTickets']);
$app->post('/api/tickets', [$support, 'addTicket']);
$app->put('/api/tickets', [$support, 'saveTicket']);
$app->post('/api/tickets/note', [$support, 'addTicketNote']);
$app->post('/api/tickets/escalate', [$support, 'escalateTicket']);
$app->delete('/api/tickets', [$support, 'deleteTicket']);

// Escalations desk
$app->get('/api/escalations', [$support, 'listEscalations']);
$app->post('/api/escalations', [$support, 'addEscalation']);
$app->post('/api/escalations/resolve', [$support, 'resolveEscalation']);
$app->delete('/api/escalations', [$support, 'deleteEscalation']);

// Refund & return requests
$app->get('/api/refunds', [$support, 'listRefunds']);
$app->post('/api/refunds', [$support, 'addRefund']);
$app->post('/api/refunds/status', [$support, 'setRefundStatus']);
$app->delete('/api/refunds', [$support, 'deleteRefund']);

// Bug reports tracker
$app->get('/api/bugs', [$pkb, 'listBugs']);
$app->post('/api/bugs', [$pkb, 'addBug']);
$app->put('/api/bugs', [$pkb, 'saveBug']);
$app->delete('/api/bugs', [$pkb, 'deleteBug']);

// Feature requests board
$app->get('/api/features', [$pkb, 'listFeatures']);
$app->post('/api/features', [$pkb, 'addFeature']);
$app->post('/api/features/upvote', [$pkb, 'upvoteFeature']);
$app->post('/api/features/status', [$pkb, 'setFeatureStatus']);
$app->delete('/api/features', [$pkb, 'deleteFeature']);

// Customer feedback & live NPS
$app->get('/api/feedback', [$pkb, 'listFeedback']);
$app->post('/api/feedback', [$pkb, 'addFeedback']);
$app->delete('/api/feedback', [$pkb, 'deleteFeedback']);

// Searchable knowledge base
$app->get('/api/kb', [$pkb, 'listKb']);
$app->post('/api/kb', [$pkb, 'addKb']);
$app->put('/api/kb', [$pkb, 'saveKb']);
$app->delete('/api/kb', [$pkb, 'deleteKb']);

$app->run();
