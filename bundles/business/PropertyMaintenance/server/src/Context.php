<?php
declare(strict_types=1);

namespace SoftN\Kit;

use Psr\Http\Message\ServerRequestInterface;

final class Context
{
    /** @return array{userId: string, roleId: string, isOwner: bool, appId: string, isPublicDemo: bool} */
    public static function caller(ServerRequestInterface $req): array
    {
        $userId = trim($req->getHeaderLine('X-SoftN-User-Id'));
        $roleId = trim($req->getHeaderLine('X-SoftN-Role-Id'));
        $appId = trim($req->getHeaderLine('X-SoftN-App-Id'));
        if ($userId !== '') {
            return [
                'userId' => $userId,
                'roleId' => $roleId !== '' ? $roleId : 'owner',
                'isOwner' => ($roleId === '' || $roleId === 'owner'),
                'appId' => $appId,
                'isPublicDemo' => false,
            ];
        }
        // Local browser-sandboxed SoftN demo: visitor acts as the workspace owner locally in their browser.
        return [
            'userId' => 'sandbox-owner',
            'roleId' => 'owner',
            'isOwner' => true,
            'appId' => $appId,
            'isPublicDemo' => true,
        ];
    }

    public static function callerOrNull(ServerRequestInterface $req): ?array
    {
        $userId = trim($req->getHeaderLine('X-SoftN-User-Id'));
        if ($userId === '') {
            return self::caller($req);
        }
        return self::caller($req);
    }

    public static function ownerOnly(?array $me): void
    {
        if (!$me || empty($me['isOwner'])) {
            HttpException::fail(403, 'owner_only', 'Only the business owner can do that.');
        }
    }

    public static function getBusinessSettings(Database $db): ?array
    {
        return $db->first('SELECT * FROM business_settings WHERE id = 1');
    }

    public static function getTeamMember(Database $db, string $userId): ?array
    {
        return $db->first('SELECT * FROM team_members WHERE user_id = ?', [$userId]);
    }

    /** @return array{settings: array<string, mixed>, member: array<string, mixed>} */
    public static function requireTeamAccess(Database $db, array $me): array
    {
        $settings = self::getBusinessSettings($db);
        if (!$settings || empty($settings['setup_done'])) {
            HttpException::fail(409, 'setup_required', 'Complete business setup first.');
        }
        if (!empty($me['isOwner'])) {
            $ownerRow = self::getTeamMember($db, (string) $me['userId']);
            if (!$ownerRow) {
                $db->execute(
                    "INSERT INTO team_members(user_id, display_name, role, is_owner, status, created_at) VALUES(?, ?, ?, 1, 'active', ?)",
                    [(string) $me['userId'], (string) ($settings['owner_name'] ?: 'Owner'), 'owner', Validator::now()]
                );
                $ownerRow = self::getTeamMember($db, (string) $me['userId']);
            }
            return ['settings' => $settings, 'member' => $ownerRow];
        }
        $member = self::getTeamMember($db, (string) $me['userId']);
        if (!$member || ($member['status'] ?? '') !== 'active') {
            HttpException::fail(403, 'access_pending', 'Your account needs approval from the business owner.');
        }
        return ['settings' => $settings, 'member' => $member];
    }

    /** @return array{settings: array<string, mixed>, member: array<string, mixed>} */
    public static function requireManagerAccess(Database $db, array $me): array
    {
        $ctx = self::requireTeamAccess($db, $me);
        $role = (string) ($ctx['member']['role'] ?? '');
        if (empty($me['isOwner']) && !in_array($role, ['owner', 'manager', 'admin'], true)) {
            HttpException::fail(403, 'manager_only', 'Only the business owner or a manager can do that.');
        }
        return $ctx;
    }
}
