<?php
declare(strict_types=1);

namespace SoftN\Kit;

use PDO;
use Throwable;

final class Database
{
    private static ?self $instance = null;
    private PDO $pdo;

    public function __construct(string $dsn = 'sqlite:app.db')
    {
        $this->pdo = new PDO($dsn);
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    public static function shared(string $dsn = 'sqlite:app.db'): self
    {
        if (self::$instance === null) {
            self::$instance = new self($dsn);
        }
        return self::$instance;
    }

    public static function resetShared(): void
    {
        self::$instance = null;
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    /** @return list<array<string, mixed>> */
    public function query(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(self::bindParams($params));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }

    /** @return array<string, mixed>|null */
    public function first(string $sql, array $params = []): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(self::bindParams($params));
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    /** @return array{changes: int, lastInsertRowid: int} */
    public function execute(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute(self::bindParams($params));
        $changes = $stmt->rowCount();
        $lastId = (int) $this->pdo->lastInsertId();
        return [
            'changes' => $changes,
            'lastInsertRowid' => $lastId,
        ];
    }

    public function execRaw(string $sql): void
    {
        $this->pdo->exec($sql);
    }

    public function transaction(callable $work): mixed
    {
        $started = false;
        if (!$this->pdo->inTransaction()) {
            $this->pdo->beginTransaction();
            $started = true;
        }
        try {
            $result = $work($this);
            if ($started && $this->pdo->inTransaction()) {
                $this->pdo->commit();
            }
            return $result;
        } catch (Throwable $e) {
            if ($started && $this->pdo->inTransaction()) {
                try {
                    $this->pdo->rollBack();
                } catch (Throwable) {
                    // ignore rollback failure when already rolled back
                }
            }
            throw $e;
        }
    }

    /**
     * Normalize PHP bools to SQLite 0/1 ints while preserving ints, floats, strings, and nulls.
     *
     * @param array<int|string, mixed> $params
     * @return array<int|string, mixed>
     */
    private static function bindParams(array $params): array
    {
        $out = [];
        foreach ($params as $k => $v) {
            if (is_bool($v)) {
                $out[$k] = $v ? 1 : 0;
            } else {
                $out[$k] = $v;
            }
        }
        return $out;
    }
}
