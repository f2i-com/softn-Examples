<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\BillingController;
use App\WorkspaceController;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();
$ws = new WorkspaceController();
$billing = new BillingController();

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

// Billing desk command overview
$app->get('/api/desk', [$billing, 'getBillingDesk']);

// Clients directory
$app->get('/api/clients', [$billing, 'listClients']);
$app->post('/api/clients', [$billing, 'addClient']);
$app->put('/api/clients', [$billing, 'saveClient']);
$app->delete('/api/clients', [$billing, 'deleteClient']);

// Jobs pipeline
$app->get('/api/jobs', [$billing, 'listJobs']);
$app->post('/api/jobs', [$billing, 'addJob']);
$app->put('/api/jobs', [$billing, 'saveJob']);
$app->post('/api/jobs/stage', [$billing, 'setJobStage']);
$app->delete('/api/jobs', [$billing, 'deleteJob']);

// Quotes workbench
$app->get('/api/quotes', [$billing, 'listQuotes']);
$app->post('/api/quotes', [$billing, 'addQuote']);
$app->put('/api/quotes', [$billing, 'saveQuote']);
$app->post('/api/quotes/status', [$billing, 'setQuoteStatus']);
$app->post('/api/quotes/convert', [$billing, 'convertQuoteToInvoice']);
$app->delete('/api/quotes', [$billing, 'deleteQuote']);

// Invoices ledger
$app->get('/api/invoices', [$billing, 'listInvoices']);
$app->post('/api/invoices', [$billing, 'addInvoice']);
$app->put('/api/invoices', [$billing, 'saveInvoice']);
$app->delete('/api/invoices', [$billing, 'deleteInvoice']);

// Payments ledger
$app->get('/api/payments', [$billing, 'listPayments']);
$app->post('/api/payments', [$billing, 'recordPayment']);
$app->delete('/api/payments', [$billing, 'deletePayment']);

$app->run();
