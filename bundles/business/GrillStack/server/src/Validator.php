<?php
declare(strict_types=1);

namespace SoftN\Kit;

final class Validator
{
    public static function now(): int
    {
        return time();
    }

    public static function utcDay(int $deltaDays = 0): string
    {
        return gmdate('Y-m-d', self::now() + $deltaDays * 86400);
    }

    public static function sha256(string $value): string
    {
        return hash('sha256', $value);
    }

    public static function randomHex(int $bytes = 16): string
    {
        return bin2hex(random_bytes(max(1, $bytes)));
    }

    public static function text(mixed $value, string $name, array $options = []): string
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null) {
            $value = '';
        } elseif (!is_string($value)) {
            $value = (string) $value;
        }
        $out = trim(str_replace("\r\n", "\n", $value));
        $required = ($options['required'] ?? true) !== false;
        if ($out === '') {
            if ($required) {
                HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
            }
            return '';
        }
        $len = function_exists('mb_strlen') ? mb_strlen($out, 'UTF-8') : strlen($out);
        if (!empty($options['min']) && $len < (int) $options['min']) {
            HttpException::fail(422, $name . '_short', $label . ' needs at least ' . (int) $options['min'] . ' characters.', $name);
        }
        $max = isset($options['max']) ? (int) $options['max'] : 300;
        if ($len > $max) {
            HttpException::fail(422, $name . '_long', $label . ' can be at most ' . $max . ' characters.', $name);
        }
        return $out;
    }

    public static function int(mixed $value, string $name, array $options = []): ?int
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (($options['required'] ?? true) === false) {
                return array_key_exists('fallback', $options) ? ($options['fallback'] === null ? null : (int) $options['fallback']) : null;
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (is_string($value)) {
            $trimmed = trim($value);
            if (!preg_match('/^-?\d+$/', $trimmed)) {
                HttpException::fail(422, $name . '_invalid', $label . ' must be a whole number.', $name);
            }
            $n = (int) $trimmed;
        } elseif (is_int($value)) {
            $n = $value;
        } elseif (is_float($value) && is_finite($value) && floor($value) === $value && abs($value) <= 9007199254740991.0) {
            $n = (int) $value;
        } else {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a whole number.', $name);
        }
        if (array_key_exists('min', $options) && $n < (int) $options['min']) {
            HttpException::fail(422, $name . '_low', $label . ' must be at least ' . (int) $options['min'] . '.', $name);
        }
        if (array_key_exists('max', $options) && $n > (int) $options['max']) {
            HttpException::fail(422, $name . '_high', $label . ' must be at most ' . (int) $options['max'] . '.', $name);
        }
        return $n;
    }

    public static function numVal(mixed $value, string $name, array $options = []): float
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (($options['required'] ?? true) === false) {
                return array_key_exists('fallback', $options) ? (float) $options['fallback'] : 0.0;
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '' || !is_numeric($trimmed)) {
                HttpException::fail(422, $name . '_invalid', $label . ' must be a number.', $name);
            }
            $n = (float) $trimmed;
        } elseif (is_int($value) || is_float($value)) {
            $n = (float) $value;
        } else {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a number.', $name);
        }
        if (!is_finite($n)) {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a number.', $name);
        }
        if (array_key_exists('min', $options) && $n < (float) $options['min']) {
            HttpException::fail(422, $name . '_low', $label . ' must be at least ' . $options['min'] . '.', $name);
        }
        if (array_key_exists('max', $options) && $n > (float) $options['max']) {
            HttpException::fail(422, $name . '_high', $label . ' must be at most ' . $options['max'] . '.', $name);
        }
        return round($n * 10000.0) / 10000.0;
    }

    public static function moneyCents(mixed $value, string $name, array $options = []): int
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (($options['required'] ?? true) === false) {
                return array_key_exists('fallback', $options) ? (int) $options['fallback'] : 0;
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (is_string($value)) {
            $cleaned = preg_replace('/[^0-9.\-]/', '', $value) ?? '';
            if ($cleaned === '' || !is_numeric($cleaned)) {
                HttpException::fail(422, $name . '_invalid', $label . ' must be a valid amount.', $name);
            }
            $n = (float) $cleaned;
        } elseif (is_int($value) || is_float($value)) {
            $n = (float) $value;
        } else {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a valid amount.', $name);
        }
        if (!is_finite($n)) {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a valid amount.', $name);
        }
        $cents = !empty($options['alreadyCents']) ? (int) round($n) : (int) round($n * 100.0);
        if (array_key_exists('min', $options) && $cents < (int) $options['min']) {
            HttpException::fail(422, $name . '_low', $label . ' is too low.', $name);
        }
        if (array_key_exists('max', $options) && $cents > (int) $options['max']) {
            HttpException::fail(422, $name . '_high', $label . ' is too high.', $name);
        }
        return $cents;
    }

    public static function rowId(mixed $value, string $name = 'id'): int
    {
        $n = self::int($value, $name, ['min' => 1, 'label' => 'Record ID']);
        return $n ?? 1;
    }

    public static function oneOf(mixed $value, array $list, string $name, array $options = []): string
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (array_key_exists('fallback', $options)) {
                return (string) $options['fallback'];
            }
            if (($options['required'] ?? true) === false) {
                return '';
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (!in_array($value, $list, true)) {
            HttpException::fail(422, $name . '_invalid', $label . ' is not a valid option.', $name);
        }
        return (string) $value;
    }

    public static function bool(mixed $value): bool
    {
        return $value === true || $value === 1 || $value === '1' || $value === 'true' || $value === 'on';
    }

    public static function day(mixed $value, string $name, array $options = []): string
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (($options['required'] ?? true) === false) {
                return array_key_exists('fallback', $options) ? (string) $options['fallback'] : '';
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($value), $m)) {
            HttpException::fail(422, $name . '_invalid', $label . ' must be YYYY-MM-DD.', $name);
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $isLeap = ($y % 4 === 0 && $y % 100 !== 0) || ($y % 400 === 0);
        $lengths = [31, $isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if ($y < 1900 || $y > 2200 || $mo < 1 || $mo > 12 || $d < 1 || $d > $lengths[$mo - 1]) {
            HttpException::fail(422, $name . '_invalid', $label . ' must be a real date.', $name);
        }
        return trim($value);
    }

    public static function timeStr(mixed $value, string $name, array $options = []): string
    {
        $label = (string) ($options['label'] ?? $name);
        if ($value === null || $value === '') {
            if (($options['required'] ?? true) === false) {
                return array_key_exists('fallback', $options) ? (string) $options['fallback'] : '';
            }
            HttpException::fail(422, $name . '_required', $label . ' is required.', $name);
        }
        if (!is_string($value) || !preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', trim($value))) {
            HttpException::fail(422, $name . '_invalid', $label . ' must be HH:MM (24-hour).', $name);
        }
        return trim($value);
    }

    public static function listOf(mixed $value, string $name, int $max, callable $check): array
    {
        if ($value === null) {
            return [];
        }
        if (!is_array($value)) {
            HttpException::fail(422, $name . '_invalid', $name . ' must be a list.', $name);
        }
        if (count($value) > $max) {
            HttpException::fail(422, $name . '_long', 'At most ' . $max . ' ' . $name . ' allowed.', $name);
        }
        $out = [];
        $i = 0;
        foreach ($value as $item) {
            $out[] = $check($item, $i);
            $i++;
        }
        return $out;
    }

    public static function email(mixed $value, string $name, array $options = []): string
    {
        $out = self::text($value, $name, [
            'max' => 254,
            'required' => ($options['required'] ?? true) !== false,
            'label' => $options['label'] ?? 'Email',
        ]);
        if ($out === '') {
            return '';
        }
        if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $out)) {
            HttpException::fail(422, $name . '_invalid', 'Enter a valid email address.', $name);
        }
        return strtolower($out);
    }

    /** @return array{limit: int, offset: int} */
    public static function paging(array $input, int $max = 200): array
    {
        $limit = self::int($input['limit'] ?? null, 'limit', ['required' => false, 'min' => 1, 'max' => $max]);
        $offset = self::int($input['offset'] ?? null, 'offset', ['required' => false, 'min' => 0, 'max' => 1000000]);
        return [
            'limit' => $limit === null ? min(100, $max) : $limit,
            'offset' => $offset === null ? 0 : $offset,
        ];
    }

    public static function likeTerm(mixed $term): string
    {
        $s = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $term);
        return '%' . $s . '%';
    }

    public static function marks(int $count): string
    {
        if ($count <= 0) {
            return '';
        }
        return implode(', ', array_fill(0, $count, '?'));
    }

    public static function parseJson(mixed $value, mixed $fallback = null): mixed
    {
        if (!is_string($value) || $value === '') {
            return $fallback;
        }
        $decoded = json_decode($value, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return $fallback;
        }
        return $decoded;
    }
}
