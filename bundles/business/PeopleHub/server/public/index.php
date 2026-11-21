<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\PeopleOpsController;
use App\TalentController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$talent = new TalentController();
$ops = new PeopleOpsController();

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

// People Ops Today (Approvals Inbox)
$app->get('/api/today', [$talent, 'getPeopleToday']);

// Recruitment Pipeline & Linked Interview Scorecards
$app->get('/api/candidates', [$talent, 'listCandidates']);
$app->post('/api/candidates', [$talent, 'addCandidate']);
$app->put('/api/candidates', [$talent, 'saveCandidate']);
$app->post('/api/candidates/stage', [$talent, 'setCandidateStage']);
$app->delete('/api/candidates', [$talent, 'deleteCandidate']);
$app->post('/api/scorecards', [$talent, 'addScorecard']);
$app->delete('/api/scorecards', [$talent, 'deleteScorecard']);

// Employee Onboarding Checklists
$app->get('/api/onboardings', [$talent, 'listOnboardings']);
$app->post('/api/onboardings', [$talent, 'addOnboarding']);
$app->put('/api/onboardings', [$talent, 'saveOnboarding']);
$app->post('/api/onboardings/toggle', [$talent, 'toggleOnboardingItem']);
$app->delete('/api/onboardings', [$talent, 'deleteOnboarding']);

// Leave Requests
$app->get('/api/leave', [$ops, 'listLeave']);
$app->post('/api/leave', [$ops, 'addLeave']);
$app->post('/api/leave/status', [$ops, 'setLeaveStatus']);
$app->delete('/api/leave', [$ops, 'deleteLeave']);

// Performance Reviews
$app->get('/api/reviews', [$ops, 'listReviews']);
$app->post('/api/reviews', [$ops, 'addReview']);
$app->delete('/api/reviews', [$ops, 'deleteReview']);

// Expense Claims
$app->get('/api/expenses', [$ops, 'listExpenses']);
$app->post('/api/expenses', [$ops, 'addExpense']);
$app->post('/api/expenses/status', [$ops, 'setExpenseStatus']);
$app->delete('/api/expenses', [$ops, 'deleteExpense']);

// Training Requests & Budget
$app->get('/api/training', [$ops, 'listTraining']);
$app->post('/api/training', [$ops, 'addTraining']);
$app->post('/api/training/status', [$ops, 'setTrainingStatus']);
$app->delete('/api/training', [$ops, 'deleteTraining']);

// Exit Interviews
$app->get('/api/exits', [$ops, 'listExits']);
$app->post('/api/exits', [$ops, 'addExit']);
$app->delete('/api/exits', [$ops, 'deleteExit']);

$app->run();
