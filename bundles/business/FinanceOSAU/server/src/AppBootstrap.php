<?php
declare(strict_types=1);

namespace SoftN\Kit;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Throwable;

final class AppBootstrap
{
    public static function installPolyfills(): void
    {
        if (!defined('CONNECTION_NORMAL')) {
            define('CONNECTION_NORMAL', 0);
        }
        if (!defined('CONNECTION_ABORTED')) {
            define('CONNECTION_ABORTED', 1);
        }
        if (!defined('CONNECTION_TIMEOUT')) {
            define('CONNECTION_TIMEOUT', 2);
        }
        if (!function_exists('connection_status')) {
            eval('function connection_status(): int { return 0; }');
        }
        if (!function_exists('set_error_handler')) {
            eval('function set_error_handler($cb = null, int $levels = E_ALL) { return null; }');
        }
        if (!function_exists('restore_error_handler')) {
            eval('function restore_error_handler(): bool { return true; }');
        }
        if (!function_exists('set_exception_handler')) {
            eval('function set_exception_handler($cb = null) { return null; }');
        }
        if (!function_exists('restore_exception_handler')) {
            eval('function restore_exception_handler(): bool { return true; }');
        }
        if (!function_exists('is_finite')) {
            eval('function is_finite(float|int $num): bool { $f = (float) $num; return ($f - $f) === 0.0; }');
        }
        if (!function_exists('is_nan')) {
            eval('function is_nan(float|int $num): bool { $f = (float) $num; return $f !== $f; }');
        }
        if (!function_exists('is_infinite')) {
            eval('function is_infinite(float|int $num): bool { $f = (float) $num; return ($f - $f) !== 0.0 && $f === $f; }');
        }
    }

    public static function create(): App
    {
        self::installPolyfills();
        $app = AppFactory::create();
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();

        $errorMiddleware = $app->addErrorMiddleware(true, false, false);
        $errorMiddleware->setDefaultErrorHandler(function (
            ServerRequestInterface $request,
            Throwable $exception,
            bool $displayErrorDetails,
            bool $logErrors,
            bool $logErrorDetails
        ) use ($app): ResponseInterface {
            $response = $app->getResponseFactory()->createResponse();
            if ($exception instanceof HttpException) {
                $body = ['error' => $exception->getMessage(), 'code' => $exception->errorCode];
                if ($exception->field !== '') {
                    $body['field'] = $exception->field;
                }
                return self::json($response, $body, $exception->status);
            }
            $status = 500;
            if ($exception instanceof \Slim\Exception\HttpNotFoundException) {
                $status = 404;
            } elseif ($exception instanceof \Slim\Exception\HttpMethodNotAllowedException) {
                $status = 405;
            }
            return self::json($response, [
                'error' => $displayErrorDetails ? $exception->getMessage() : 'Internal server error.',
                'code' => $status === 404 ? 'not_found' : ($status === 405 ? 'method_not_allowed' : 'server_error'),
            ], $status);
        });

        return $app;
    }

    /** Extract normalized input array from query params (GET) or parsed/raw JSON body (POST/PUT/PATCH/DELETE). */
    public static function input(ServerRequestInterface $request): array
    {
        $method = strtoupper($request->getMethod());
        if ($method === 'GET' || $method === 'HEAD') {
            $q = $request->getQueryParams();
            return is_array($q) ? $q : [];
        }
        $parsed = $request->getParsedBody();
        if (is_array($parsed) && count($parsed) > 0) {
            return $parsed;
        }
        $raw = (string) $request->getBody();
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
            // Recover JSON request bodies if low-byte truncation turned U+201x punctuation into control bytes
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
                $recovered = json_decode($out, true);
                if (is_array($recovered)) {
                    return $recovered;
                }
            }
        }
        $q = $request->getQueryParams();
        return is_array($q) ? $q : [];
    }

    public static function json(ResponseInterface $response, mixed $payload, int $status = 200): ResponseInterface
    {
        $data = ($payload === null) ? new \stdClass() : $payload;
        $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $response->getBody()->write($encoded === false ? '{}' : $encoded);
        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Execute a route handler with automatic caller resolution, input extraction,
     * optional SQLite write transaction, and HttpException -> JSON error formatting.
     */
    public static function handle(
        ServerRequestInterface $request,
        ResponseInterface $response,
        callable $work,
        bool $write = false,
        bool $public = false
    ): ResponseInterface {
        $db = Database::shared();
        $me = $public ? Context::callerOrNull($request) : Context::caller($request);
        $input = self::input($request);

        try {
            $run = static fn () => $work($db, $me, $input, $request);
            $result = $write ? $db->transaction($run) : $run();
            if ($result instanceof ResponseInterface) {
                return $result;
            }
            if (is_array($result) && isset($result['__status']) && array_key_exists('__body', $result)) {
                return self::json($response, $result['__body'], (int) $result['__status']);
            }
            return self::json($response, $result ?? [], 200);
        } catch (HttpException $e) {
            $body = ['error' => $e->getMessage(), 'code' => $e->errorCode];
            if ($e->field !== '') {
                $body['field'] = $e->field;
            }
            return self::json($response, $body, $e->status);
        }
    }
}
