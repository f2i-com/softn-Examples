<?php
declare(strict_types=1);

namespace SoftN\Kit;

use RuntimeException;

final class HttpException extends RuntimeException
{
    public readonly int $status;
    public readonly string $errorCode;
    public readonly string $field;

    public function __construct(int $status, string $code, string $message, string $field = '')
    {
        parent::__construct($message, $status);
        $this->status = $status;
        $this->errorCode = $code;
        $this->field = $field;
    }

    public static function fail(int $status, string $code, string $message, string $field = ''): never
    {
        throw new self($status, $code, $message, $field);
    }
}
