<?php
declare(strict_types=1);

namespace App;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use SoftN\Kit\AppBootstrap;
use SoftN\Kit\Context;
use SoftN\Kit\Database;
use SoftN\Kit\HttpException;
use SoftN\Kit\Validator as V;

final class SitePulseController
{
    private const PROJ_STATUSES = ['Planning', 'Active', 'On Hold', 'Practical Completion', 'Closed'];
    private const WEATHERS = ['Sunny', 'Cloudy', 'Rain', 'Windy', 'Storm', 'Fine', 'Overcast', 'Wind', 'Heat'];
    private const DEFECT_CATS = ['Structural', 'Waterproofing', 'Finishes', 'Services', 'Safety', 'Other'];
    private const DEFECT_PRIOS = ['Critical', 'High', 'Medium', 'Low'];
    private const DEFECT_STATUSES = ['Open', 'In Progress', 'Rectified', 'Verified'];
    private const VAR_STATUSES = ['Pending', 'Approved', 'Rejected'];
    private const SUB_TRADES = ['Electrical', 'Plumbing', 'Carpentry', 'Concreting', 'Roofing', 'Painting', 'Earthworks', 'Tiling', 'Waterproofing', 'Other'];
    private const SUB_STATUSES = ['Approved', 'Pending Review', 'Expired Insurance'];

    /** @return array<string, mixed>|null */
    private static function normalizeProject(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at', 'headcount_today', 'diary_count', 'open_defects', 'pending_vars', 'approved_var_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeDiary(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'project_id', 'workers_on_site', 'signed_at', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeDefect(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'project_id', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeVariation(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'project_id', 'estimated_cost_cents', 'client_approved_at', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeProjectTotal(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['project_id', 'approved_cents', 'pending_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeDelivery(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'project_id', 'has_issue', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('quantity', $row) && $row['quantity'] !== null) {
            $row['quantity'] = (float) $row['quantity'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeSubcontractor(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at', 'days_to_expiry'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    // ---- Projects ----

    public function listProjects(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql =
                'SELECT p.*, '
                . '(SELECT COALESCE(SUM(d.workers_on_site), 0) FROM site_diaries d WHERE d.project_id = p.id AND d.diary_date = ?) AS headcount_today, '
                . '(SELECT COUNT(*) FROM site_diaries d WHERE d.project_id = p.id) AS diary_count, '
                . "(SELECT COUNT(*) FROM defects df WHERE df.project_id = p.id AND df.status IN ('Open', 'In Progress')) AS open_defects, "
                . "(SELECT COUNT(*) FROM variations v WHERE v.project_id = p.id AND v.status = 'Pending') AS pending_vars, "
                . "(SELECT COALESCE(SUM(v.estimated_cost_cents), 0) FROM variations v WHERE v.project_id = p.id AND v.status = 'Approved') AS approved_var_cents "
                . 'FROM projects p WHERE 1=1';
            $params = [$todayDay];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND p.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE p.status WHEN 'Active' THEN 0 WHEN 'Practical Completion' THEN 1 WHEN 'Planning' THEN 2 WHEN 'On Hold' THEN 3 ELSE 4 END, p.id DESC LIMIT 120";
            $rows = array_map([self::class, 'normalizeProject'], $db->query($sql, $params));
            return ['projects' => $rows];
        });
    }

    public function addProject(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['project_name'] ?? null, 'project_name', ['max' => 140, 'label' => 'Project name']);
            $client = V::text($input['client'] ?? null, 'client', ['required' => false, 'max' => 120]);
            $addr = V::text($input['site_address'] ?? null, 'site_address', ['required' => false, 'max' => 240]);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => '']);
            $target = V::day($input['target_completion'] ?? null, 'target_completion', ['required' => false, 'fallback' => '']);
            $pm = V::text($input['project_manager'] ?? null, 'project_manager', ['required' => false, 'max' => 80]);
            $status = V::oneOf($input['status'] ?? null, self::PROJ_STATUSES, 'status', ['fallback' => 'Active']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO projects(project_name, client, site_address, start_date, target_completion, project_manager, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$name, $client, $addr, $start, $target, $pm, $status, $notes, $ts, $ts]
            );
            $row = self::normalizeProject($db->first('SELECT * FROM projects WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['project' => $row]];
        }, write: true);
    }

    public function saveProject(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM projects WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Project not found.');
            }
            $name = V::text($input['project_name'] ?? null, 'project_name', ['max' => 140, 'label' => 'Project name']);
            $client = V::text($input['client'] ?? null, 'client', ['required' => false, 'max' => 120]);
            $addr = V::text($input['site_address'] ?? null, 'site_address', ['required' => false, 'max' => 240]);
            $start = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => '']);
            $target = V::day($input['target_completion'] ?? null, 'target_completion', ['required' => false, 'fallback' => '']);
            $pm = V::text($input['project_manager'] ?? null, 'project_manager', ['required' => false, 'max' => 80]);
            $status = V::oneOf($input['status'] ?? null, self::PROJ_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE projects SET project_name = ?, client = ?, site_address = ?, start_date = ?, target_completion = ?, project_manager = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$name, $client, $addr, $start, $target, $pm, $status, $notes, V::now(), $id]
            );
            return ['project' => self::normalizeProject($db->first('SELECT * FROM projects WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteProject(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM projects WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Project not found.');
            }
            $db->execute('DELETE FROM site_diaries WHERE project_id = ?', [$id]);
            $db->execute('DELETE FROM defects WHERE project_id = ?', [$id]);
            $db->execute('DELETE FROM variations WHERE project_id = ?', [$id]);
            $db->execute('DELETE FROM deliveries WHERE project_id = ?', [$id]);
            $db->execute('DELETE FROM projects WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Daily Site Diaries ----

    public function listDiaries(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $projId = V::int($input['project_id'] ?? null, 'project_id', ['required' => false, 'min' => 1]);
            $dDate = V::day($input['diary_date'] ?? null, 'diary_date', ['required' => false, 'fallback' => '']);
            $sql = 'SELECT d.*, p.project_name, p.site_address, p.client, p.project_manager FROM site_diaries d LEFT JOIN projects p ON p.id = d.project_id WHERE 1=1';
            $params = [];
            if ($projId !== null) {
                $sql .= ' AND d.project_id = ?';
                $params[] = $projId;
            }
            if ($dDate !== '') {
                $sql .= ' AND d.diary_date = ?';
                $params[] = $dDate;
            }
            $sql .= ' ORDER BY d.diary_date DESC, d.id DESC LIMIT 150';
            $rows = array_map([self::class, 'normalizeDiary'], $db->query($sql, $params));
            return ['diaries' => $rows];
        });
    }

    public function addDiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $projId = V::rowId($input['project_id'] ?? null, 'project_id');
            $proj = $db->first('SELECT * FROM projects WHERE id = ?', [$projId]);
            if (!$proj) {
                HttpException::fail(404, 'project_not_found', 'Project not found.');
            }
            $dDate = V::day($input['diary_date'] ?? null, 'diary_date', ['required' => false, 'fallback' => V::utcDay(0), 'label' => 'Date']);
            $weather = V::oneOf($input['weather'] ?? null, self::WEATHERS, 'weather', ['fallback' => 'Fine']);
            $workers = V::int($input['workers_on_site'] ?? null, 'workers_on_site', ['required' => false, 'min' => 0, 'max' => 2000, 'fallback' => 0]) ?? 0;
            $work = V::text($input['work_completed'] ?? null, 'work_completed', ['max' => 2000, 'label' => 'Work completed']);
            $delays = V::text($input['delays'] ?? null, 'delays', ['required' => false, 'max' => 1000]);
            $visitors = V::text($input['visitors'] ?? null, 'visitors', ['required' => false, 'max' => 600]);
            $signedBy = V::text($input['signed_by'] ?? null, 'signed_by', ['required' => false, 'max' => 80]);
            $ts = V::now();
            $signedAt = $signedBy !== '' ? $ts : 0;

            $created = $db->execute(
                'INSERT INTO site_diaries(project_id, diary_date, weather, workers_on_site, work_completed, delays, visitors, signed_by, signed_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$projId, $dDate, $weather, $workers, $work, $delays, $visitors, $signedBy, $signedAt, $ts, $ts]
            );
            $row = self::normalizeDiary($db->first('SELECT * FROM site_diaries WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['diary' => $row]];
        }, write: true);
    }

    public function saveDiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM site_diaries WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Diary entry not found.');
            }
            $dDate = V::day($input['diary_date'] ?? null, 'diary_date', ['required' => false, 'fallback' => (string) $cur['diary_date']]);
            $weather = V::oneOf($input['weather'] ?? null, self::WEATHERS, 'weather', ['fallback' => $cur['weather']]);
            $workers = V::int($input['workers_on_site'] ?? null, 'workers_on_site', ['required' => false, 'min' => 0, 'max' => 2000, 'fallback' => (int) $cur['workers_on_site']]) ?? (int) $cur['workers_on_site'];
            $work = V::text($input['work_completed'] ?? null, 'work_completed', ['max' => 2000, 'label' => 'Work completed']);
            $delays = V::text($input['delays'] ?? null, 'delays', ['required' => false, 'max' => 1000]);
            $visitors = V::text($input['visitors'] ?? null, 'visitors', ['required' => false, 'max' => 600]);
            $signedBy = array_key_exists('signed_by', $input)
                ? V::text($input['signed_by'], 'signed_by', ['required' => false, 'max' => 80])
                : (string) ($cur['signed_by'] ?? '');
            $ts = V::now();
            $signedAt = $signedBy !== '' ? ((int) ($cur['signed_at'] ?? 0) ?: $ts) : 0;

            $db->execute(
                'UPDATE site_diaries SET diary_date = ?, weather = ?, workers_on_site = ?, work_completed = ?, delays = ?, visitors = ?, signed_by = ?, signed_at = ?, updated_at = ? WHERE id = ?',
                [$dDate, $weather, $workers, $work, $delays, $visitors, $signedBy, $signedAt, $ts, $id]
            );
            return ['diary' => self::normalizeDiary($db->first('SELECT * FROM site_diaries WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function signDiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM site_diaries WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Diary entry not found.');
            }
            $signer = V::text($input['signed_by'] ?? null, 'signed_by', ['required' => false, 'max' => 80])
                ?: (string) ($ctx['member']['display_name'] ?? '');
            $ts = V::now();
            $db->execute('UPDATE site_diaries SET signed_by = ?, signed_at = ?, updated_at = ? WHERE id = ?', [$signer, $ts, $ts, $id]);
            return ['diary' => self::normalizeDiary($db->first('SELECT * FROM site_diaries WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteDiary(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM site_diaries WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Diary entry not found.');
            }
            $db->execute('DELETE FROM site_diaries WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Defect & Snag List ----

    public function listDefects(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $projId = V::int($input['project_id'] ?? null, 'project_id', ['required' => false, 'min' => 1]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT d.*, p.project_name, p.site_address FROM defects d LEFT JOIN projects p ON p.id = d.project_id WHERE 1=1';
            $params = [];
            if ($projId !== null) {
                $sql .= ' AND d.project_id = ?';
                $params[] = $projId;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND d.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE d.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, d.due_date ASC, d.id DESC LIMIT 250";
            $rows = array_map([self::class, 'normalizeDefect'], $db->query($sql, $params));
            return ['defects' => $rows];
        });
    }

    public function addDefect(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $projId = V::rowId($input['project_id'] ?? null, 'project_id');
            $proj = $db->first('SELECT * FROM projects WHERE id = ?', [$projId]);
            if (!$proj) {
                HttpException::fail(404, 'project_not_found', 'Project not found.');
            }
            $title = V::text($input['issue_title'] ?? null, 'issue_title', ['max' => 180, 'label' => 'Issue title']);
            $cat = V::oneOf($input['category'] ?? null, self::DEFECT_CATS, 'category', ['fallback' => 'Finishes']);
            $prio = V::oneOf($input['priority'] ?? null, self::DEFECT_PRIOS, 'priority', ['fallback' => 'Medium']);
            $status = V::oneOf($input['status'] ?? null, self::DEFECT_STATUSES, 'status', ['fallback' => 'Open']);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 120]);
            $due = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $nextSeq = (int) ($ctx['settings']['defect_seq'] ?? 100) + 1;
            $db->execute('UPDATE business_settings SET defect_seq = ? WHERE id = 1', [$nextSeq]);
            $code = 'DEF-' . $nextSeq;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO defects(defect_code, project_id, issue_title, category, priority, status, assigned_to, due_date, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$code, $projId, $title, $cat, $prio, $status, $assigned, $due, $notes, $ts, $ts]
            );
            $row = self::normalizeDefect($db->first('SELECT * FROM defects WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['defect' => $row]];
        }, write: true);
    }

    public function saveDefect(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM defects WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Defect not found.');
            }
            $title = V::text($input['issue_title'] ?? null, 'issue_title', ['max' => 180, 'label' => 'Issue title']);
            $cat = V::oneOf($input['category'] ?? null, self::DEFECT_CATS, 'category', ['fallback' => $cur['category']]);
            $prio = V::oneOf($input['priority'] ?? null, self::DEFECT_PRIOS, 'priority', ['fallback' => $cur['priority']]);
            $status = V::oneOf($input['status'] ?? null, self::DEFECT_STATUSES, 'status', ['fallback' => $cur['status']]);
            $assigned = V::text($input['assigned_to'] ?? null, 'assigned_to', ['required' => false, 'max' => 120]);
            $due = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE defects SET issue_title = ?, category = ?, priority = ?, status = ?, assigned_to = ?, due_date = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$title, $cat, $prio, $status, $assigned, $due, $notes, V::now(), $id]
            );
            return ['defect' => self::normalizeDefect($db->first('SELECT * FROM defects WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setDefectStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM defects WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Defect not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::DEFECT_STATUSES, 'status');
            $db->execute('UPDATE defects SET status = ?, updated_at = ? WHERE id = ?', [$status, V::now(), $id]);
            return ['defect' => self::normalizeDefect($db->first('SELECT * FROM defects WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteDefect(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM defects WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Defect not found.');
            }
            $db->execute('DELETE FROM defects WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Variation Requests ----

    public function listVariations(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $projId = V::int($input['project_id'] ?? null, 'project_id', ['required' => false, 'min' => 1]);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 20]);
            $sql = 'SELECT v.*, p.project_name, p.client FROM variations v LEFT JOIN projects p ON p.id = v.project_id WHERE 1=1';
            $params = [];
            if ($projId !== null) {
                $sql .= ' AND v.project_id = ?';
                $params[] = $projId;
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND v.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE v.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, v.created_at DESC LIMIT 200";
            $rows = array_map([self::class, 'normalizeVariation'], $db->query($sql, $params));

            $projectTotals = array_map(
                [self::class, 'normalizeProjectTotal'],
                $db->query(
                    'SELECT p.id AS project_id, p.project_name, '
                    . "COALESCE(SUM(CASE WHEN v.status = 'Approved' THEN v.estimated_cost_cents ELSE 0 END), 0) AS approved_cents, "
                    . "COALESCE(SUM(CASE WHEN v.status = 'Pending' THEN v.estimated_cost_cents ELSE 0 END), 0) AS pending_cents "
                    . 'FROM projects p LEFT JOIN variations v ON v.project_id = p.id GROUP BY p.id, p.project_name ORDER BY approved_cents DESC'
                )
            );
            return ['variations' => $rows, 'projectTotals' => $projectTotals];
        });
    }

    public function addVariation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $projId = V::rowId($input['project_id'] ?? null, 'project_id');
            $proj = $db->first('SELECT * FROM projects WHERE id = ?', [$projId]);
            if (!$proj) {
                HttpException::fail(404, 'project_not_found', 'Project not found.');
            }
            $title = V::text($input['variation_title'] ?? null, 'variation_title', ['max' => 180, 'label' => 'Variation title']);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $cost = V::moneyCents($input['estimated_cost'] ?? null, 'estimated_cost', ['min' => 0, 'max' => 500000000, 'label' => 'Estimated cost']);
            $status = V::oneOf($input['status'] ?? null, self::VAR_STATUSES, 'status', ['fallback' => 'Pending']);
            $approver = V::text($input['client_approval_name'] ?? null, 'client_approval_name', ['required' => false, 'max' => 100]);
            $ts = V::now();
            $approvedAt = $status === 'Approved' ? $ts : 0;

            $nextSeq = (int) ($ctx['settings']['var_seq'] ?? 100) + 1;
            $db->execute('UPDATE business_settings SET var_seq = ? WHERE id = 1', [$nextSeq]);
            $num = 'VAR-' . $nextSeq;

            $created = $db->execute(
                'INSERT INTO variations(var_number, project_id, variation_title, description, estimated_cost_cents, status, client_approval_name, client_approved_at, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$num, $projId, $title, $desc, $cost, $status, $approver, $approvedAt, $ts, $ts]
            );
            $row = self::normalizeVariation($db->first('SELECT * FROM variations WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['variation' => $row]];
        }, write: true);
    }

    public function saveVariation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM variations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Variation not found.');
            }
            $title = V::text($input['variation_title'] ?? null, 'variation_title', ['max' => 180, 'label' => 'Variation title']);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $cost = V::moneyCents(
                $input['estimated_cost'] ?? null,
                'estimated_cost',
                ['required' => false, 'min' => 0, 'max' => 500000000, 'fallback' => (int) $cur['estimated_cost_cents']]
            );
            $db->execute(
                'UPDATE variations SET variation_title = ?, description = ?, estimated_cost_cents = ?, updated_at = ? WHERE id = ?',
                [$title, $desc, $cost, V::now(), $id]
            );
            return ['variation' => self::normalizeVariation($db->first('SELECT * FROM variations WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function decideVariation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM variations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Variation not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::VAR_STATUSES, 'status');
            $approver = V::text($input['client_approval_name'] ?? null, 'client_approval_name', [
                'required' => $status === 'Approved',
                'max' => 100,
                'label' => 'Client approval name',
            ]);
            $ts = V::now();
            $approvedAt = $status === 'Approved' ? $ts : 0;

            $db->execute(
                'UPDATE variations SET status = ?, client_approval_name = ?, client_approved_at = ?, updated_at = ? WHERE id = ?',
                [$status, $approver, $approvedAt, $ts, $id]
            );
            return ['variation' => self::normalizeVariation($db->first('SELECT * FROM variations WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteVariation(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM variations WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Variation not found.');
            }
            $db->execute('DELETE FROM variations WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Material Deliveries ----

    public function listDeliveries(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $projId = V::int($input['project_id'] ?? null, 'project_id', ['required' => false, 'min' => 1]);
            $issuesOnly = V::bool($input['issues_only'] ?? false);
            $sql = 'SELECT dl.*, p.project_name FROM deliveries dl LEFT JOIN projects p ON p.id = dl.project_id WHERE 1=1';
            $params = [];
            if ($projId !== null) {
                $sql .= ' AND dl.project_id = ?';
                $params[] = $projId;
            }
            if ($issuesOnly) {
                $sql .= ' AND dl.has_issue = 1';
            }
            $sql .= ' ORDER BY dl.delivery_date DESC, dl.id DESC LIMIT 200';
            $rows = array_map([self::class, 'normalizeDelivery'], $db->query($sql, $params));
            return ['deliveries' => $rows];
        });
    }

    public function addDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $projId = V::rowId($input['project_id'] ?? null, 'project_id');
            $proj = $db->first('SELECT * FROM projects WHERE id = ?', [$projId]);
            if (!$proj) {
                HttpException::fail(404, 'project_not_found', 'Project not found.');
            }
            $delDate = V::day($input['delivery_date'] ?? null, 'delivery_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $material = V::text($input['material'] ?? null, 'material', ['max' => 160, 'label' => 'Material']);
            $qty = V::numVal($input['quantity'] ?? null, 'quantity', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => 1]);
            $unit = V::text($input['unit'] ?? null, 'unit', ['required' => false, 'max' => 30]) ?: 'Units';
            $recv = V::text($input['received_by'] ?? null, 'received_by', ['required' => false, 'max' => 80])
                ?: (string) ($ctx['member']['display_name'] ?? '');
            $issues = V::text($input['issues'] ?? null, 'issues', ['required' => false, 'max' => 600]);
            $hasIssue = (V::bool($input['has_issue'] ?? false) || $issues !== '') ? 1 : 0;

            $created = $db->execute(
                'INSERT INTO deliveries(project_id, delivery_date, supplier, material, quantity, unit, received_by, has_issue, issues, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$projId, $delDate, $supplier, $material, $qty, $unit, $recv, $hasIssue, $issues, V::now()]
            );
            $row = self::normalizeDelivery($db->first('SELECT * FROM deliveries WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['delivery' => $row]];
        }, write: true);
    }

    public function saveDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM deliveries WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Delivery record not found.');
            }
            $delDate = V::day($input['delivery_date'] ?? null, 'delivery_date', ['required' => false, 'fallback' => (string) $cur['delivery_date']]);
            $supplier = V::text($input['supplier'] ?? null, 'supplier', ['required' => false, 'max' => 120]);
            $material = V::text($input['material'] ?? null, 'material', ['max' => 160, 'label' => 'Material']);
            $qty = V::numVal($input['quantity'] ?? null, 'quantity', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => (float) $cur['quantity']]);
            $unit = V::text($input['unit'] ?? null, 'unit', ['required' => false, 'max' => 30]) ?: (string) ($cur['unit'] ?? 'Units');
            $recv = V::text($input['received_by'] ?? null, 'received_by', ['required' => false, 'max' => 80]);
            $issues = V::text($input['issues'] ?? null, 'issues', ['required' => false, 'max' => 600]);
            $hasIssue = (V::bool($input['has_issue'] ?? false) || $issues !== '') ? 1 : 0;

            $db->execute(
                'UPDATE deliveries SET delivery_date = ?, supplier = ?, material = ?, quantity = ?, unit = ?, received_by = ?, has_issue = ?, issues = ? WHERE id = ?',
                [$delDate, $supplier, $material, $qty, $unit, $recv, $hasIssue, $issues, $id]
            );
            return ['delivery' => self::normalizeDelivery($db->first('SELECT * FROM deliveries WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteDelivery(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM deliveries WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Delivery not found.');
            }
            $db->execute('DELETE FROM deliveries WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Subcontractor Register (with automatic Insurance Expiry evaluation) ----

    public function listSubcontractors(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $trade = V::text($input['trade'] ?? null, 'trade', ['required' => false, 'max' => 40]);
            $sql = 'SELECT * FROM subcontractors WHERE 1=1';
            $params = [];
            if ($trade !== '' && $trade !== 'All') {
                $sql .= ' AND trade = ?';
                $params[] = $trade;
            }
            $sql .= " ORDER BY CASE WHEN insurance_expiry = '' THEN 1 ELSE 0 END, insurance_expiry ASC, business_name ASC LIMIT 250";
            $rows = $db->query($sql, $params);
            foreach ($rows as &$r) {
                $meta = WorkspaceController::computeInsuranceMeta(isset($r['insurance_expiry']) ? (string) $r['insurance_expiry'] : '', $todayDay);
                $r['days_to_expiry'] = $meta['daysToExpiry'];
                $r['insurance_state'] = $meta['insuranceState'];
                $r = self::normalizeSubcontractor($r);
            }
            unset($r);
            return ['subcontractors' => $rows];
        });
    }

    public function addSubcontractor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $biz = V::text($input['business_name'] ?? null, 'business_name', ['max' => 140, 'label' => 'Business name']);
            $contact = V::text($input['contact'] ?? null, 'contact', ['required' => false, 'max' => 80]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $trade = V::oneOf($input['trade'] ?? null, self::SUB_TRADES, 'trade', ['fallback' => 'Carpentry']);
            $expiry = V::day($input['insurance_expiry'] ?? null, 'insurance_expiry', ['required' => false, 'fallback' => '']);
            $meta = WorkspaceController::computeInsuranceMeta($expiry, $todayDay);
            $defaultStatus = $meta['insuranceState'] === 'expired' ? 'Expired Insurance' : 'Approved';
            $status = V::oneOf($input['status'] ?? null, self::SUB_STATUSES, 'status', ['fallback' => $defaultStatus]);
            if ($meta['insuranceState'] === 'expired') {
                $status = 'Expired Insurance';
            }
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO subcontractors(business_name, contact, phone, trade, insurance_expiry, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$biz, $contact, $phone, $trade, $expiry, $status, $notes, $ts, $ts]
            );
            $row = $db->first('SELECT * FROM subcontractors WHERE id = ?', [$created['lastInsertRowid']]);
            $row['days_to_expiry'] = $meta['daysToExpiry'];
            $row['insurance_state'] = $meta['insuranceState'];
            return ['__status' => 201, '__body' => ['subcontractor' => self::normalizeSubcontractor($row)]];
        }, write: true);
    }

    public function saveSubcontractor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM subcontractors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Subcontractor not found.');
            }
            $biz = V::text($input['business_name'] ?? null, 'business_name', ['max' => 140, 'label' => 'Business name']);
            $contact = V::text($input['contact'] ?? null, 'contact', ['required' => false, 'max' => 80]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $trade = V::oneOf($input['trade'] ?? null, self::SUB_TRADES, 'trade', ['fallback' => $cur['trade']]);
            $expiry = V::day($input['insurance_expiry'] ?? null, 'insurance_expiry', ['required' => false, 'fallback' => '']);
            $meta = WorkspaceController::computeInsuranceMeta($expiry, $todayDay);
            $status = V::oneOf($input['status'] ?? null, self::SUB_STATUSES, 'status', ['fallback' => $cur['status']]);
            if ($meta['insuranceState'] === 'expired') {
                $status = 'Expired Insurance';
            } elseif ($status === 'Expired Insurance' && ($meta['insuranceState'] === 'valid' || $meta['insuranceState'] === 'expiring_soon')) {
                $status = 'Approved';
            }
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 600]);

            $db->execute(
                'UPDATE subcontractors SET business_name = ?, contact = ?, phone = ?, trade = ?, insurance_expiry = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$biz, $contact, $phone, $trade, $expiry, $status, $notes, V::now(), $id]
            );
            $row = $db->first('SELECT * FROM subcontractors WHERE id = ?', [$id]);
            $row['days_to_expiry'] = $meta['daysToExpiry'];
            $row['insurance_state'] = $meta['insuranceState'];
            return ['subcontractor' => self::normalizeSubcontractor($row)];
        }, write: true);
    }

    public function deleteSubcontractor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM subcontractors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Subcontractor not found.');
            }
            $db->execute('DELETE FROM subcontractors WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
