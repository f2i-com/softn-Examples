<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\CoachingController;
use App\WorkspaceController;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use SoftN\Kit\AppBootstrap;

$app = AppBootstrap::create();

// Guard against zipp-php.wasm UTF-16 low-byte truncation turning punctuation (e.g. U+2014 em-dash -> ord 20)
// into unescaped JSON control bytes in php://input.
$app->add(static function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
    $method = strtoupper($request->getMethod());
    if ($method !== 'GET' && $method !== 'HEAD' && empty($request->getParsedBody())) {
        $raw = (string) $request->getBody();
        if ($raw !== '' && !is_array(json_decode($raw, true))) {
            $map = [
                19 => '\u2013',
                20 => '\u2014',
                24 => '\u2018',
                25 => '\u2019',
                28 => '\u201c',
                29 => '\u201d',
            ];
            $out = '';
            $len = strlen($raw);
            for ($i = 0; $i < $len; $i++) {
                $ch = substr($raw, $i, 1);
                $o = ord($ch);
                if ($o < 32 && $o !== 9 && $o !== 10 && $o !== 13) {
                    $out .= $map[$o] ?? ' ';
                } else {
                    $out .= $ch;
                }
            }
            $decoded = json_decode($out, true);
            if (is_array($decoded)) {
                $request = $request->withParsedBody($decoded);
            }
        }
    }
    return $handler->handle($request);
});

$ws = new WorkspaceController();
$coaching = new CoachingController();

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

// Clients & progress dossier
$app->get('/api/clients', [$coaching, 'listClients']);
$app->get('/api/clients/dossier', [$coaching, 'getClientDossier']);
$app->post('/api/clients', [$coaching, 'addClient']);
$app->put('/api/clients', [$coaching, 'saveClient']);
$app->delete('/api/clients', [$coaching, 'deleteClient']);

// Trainers roster
$app->get('/api/trainers', [$coaching, 'listTrainers']);
$app->post('/api/trainers', [$coaching, 'addTrainer']);
$app->put('/api/trainers', [$coaching, 'saveTrainer']);
$app->delete('/api/trainers', [$coaching, 'deleteTrainer']);

// Coaching sessions board
$app->get('/api/sessions', [$coaching, 'listSessions']);
$app->post('/api/sessions', [$coaching, 'addSession']);
$app->put('/api/sessions', [$coaching, 'saveSession']);
$app->post('/api/sessions/status', [$coaching, 'setSessionStatus']);
$app->delete('/api/sessions', [$coaching, 'deleteSession']);

// Progress assessments
$app->get('/api/assessments', [$coaching, 'listAssessments']);
$app->post('/api/assessments', [$coaching, 'addAssessment']);
$app->delete('/api/assessments', [$coaching, 'deleteAssessment']);

// Training programs & workout blocks
$app->get('/api/programs', [$coaching, 'listPrograms']);
$app->post('/api/programs', [$coaching, 'addProgram']);
$app->put('/api/programs', [$coaching, 'saveProgram']);
$app->delete('/api/programs', [$coaching, 'deleteProgram']);

// Payments & packs ledger
$app->get('/api/payments', [$coaching, 'listPayments']);
$app->post('/api/payments', [$coaching, 'addPayment']);
$app->post('/api/payments/status', [$coaching, 'setPaymentStatus']);
$app->delete('/api/payments', [$coaching, 'deletePayment']);

$app->run();
