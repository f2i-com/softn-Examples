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

final class TutoringController
{
    private const SUBJECTS = ['Mathematics', 'English', 'Science', 'Piano', 'Guitar', 'Violin', 'Spanish', 'French'];
    private const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Exam preparation'];
    private const STUDENT_STATUSES = ['Active', 'Waitlist', 'Paused', 'Finished'];
    private const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    private const DURATIONS = [30, 45, 60, 90];
    private const LESSON_STATUSES = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled', 'No-Show'];
    private const PROGRESS_AREAS = ['Technique', 'Theory', 'Confidence', 'Exam readiness', 'Homework habits'];
    private const INVOICE_STATUSES = ['Draft', 'Unpaid', 'Sent', 'Paid', 'Overdue'];
    private const ACTIVE_OPT = ['Active', 'Inactive'];
    private const YES_NO = ['Yes', 'No'];

    /** @return array<string, mixed>|null */
    private static function normalizeStudent(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'completed_lessons'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('avg_score', $row) && $row['avg_score'] !== null) {
            $row['avg_score'] = (float) $row['avg_score'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeTutor(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'hourly_rate_cents', 'is_sample', 'created_at', 'lesson_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['subjects'] = V::parseJson($row['subjects_json'] ?? '', []);
        $row['availability'] = V::parseJson($row['availability_json'] ?? '', []);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeLesson(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'student_id', 'tutor_id', 'duration', 'fee_cents', 'is_sample', 'created_at', 'hourly_rate_cents', 'note_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeProgressNote(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'student_id', 'lesson_id', 'score', 'is_sample', 'created_at', 'duration'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeInvoice(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'student_id', 'amount_cents', 'paid_at', 'is_sample', 'created_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    // ---- Students & Guardians ----

    public function listStudents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql = 'SELECT s.*, '
                . "(SELECT COUNT(*) FROM lessons l WHERE l.student_id = s.id AND l.status = 'Completed') AS completed_lessons, "
                . '(SELECT ROUND(AVG(pn.score), 1) FROM progress_notes pn WHERE pn.student_id = s.id) AS avg_score '
                . 'FROM students s WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND s.status = ?';
                $params[] = $status;
            }
            $sql .= " ORDER BY CASE s.status WHEN 'Active' THEN 0 WHEN 'Waitlist' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, s.student_name ASC";
            $rows = array_map([self::class, 'normalizeStudent'], $db->query($sql, $params));
            return ['students' => $rows];
        });
    }

    public function getStudentDossier(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null, 'id');
            $student = self::normalizeStudent($db->first('SELECT * FROM students WHERE id = ?', [$id]));
            if (!$student) {
                HttpException::fail(404, 'student_not_found', 'Student record not found.');
            }
            $lessons = array_map(
                [self::class, 'normalizeLesson'],
                $db->query(
                    'SELECT l.*, t.tutor_name, (SELECT COUNT(*) FROM progress_notes pn WHERE pn.lesson_id = l.id) AS note_count '
                    . 'FROM lessons l LEFT JOIN tutors t ON t.id = l.tutor_id '
                    . 'WHERE l.student_id = ? ORDER BY l.lesson_date DESC, l.start_time DESC LIMIT 40',
                    [$id]
                )
            );
            $progressNotes = array_map(
                [self::class, 'normalizeProgressNote'],
                $db->query(
                    'SELECT pn.*, l.lesson_date, l.subject AS lesson_subject, t.tutor_name '
                    . 'FROM progress_notes pn LEFT JOIN lessons l ON l.id = pn.lesson_id LEFT JOIN tutors t ON t.id = l.tutor_id '
                    . 'WHERE pn.student_id = ? ORDER BY pn.created_at DESC LIMIT 40',
                    [$id]
                )
            );
            $invoices = array_map(
                [self::class, 'normalizeInvoice'],
                $db->query('SELECT * FROM invoices WHERE student_id = ? ORDER BY created_at DESC LIMIT 30', [$id])
            );
            return [
                'student' => $student,
                'lessons' => $lessons,
                'progressNotes' => $progressNotes,
                'invoices' => $invoices,
            ];
        });
    }

    public function addStudent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['student_name'] ?? null, 'student_name', ['max' => 120, 'label' => 'Student name']);
            $gName = V::text($input['guardian_name'] ?? null, 'guardian_name', ['required' => false, 'max' => 120]);
            $gEmail = V::email($input['guardian_email'] ?? null, 'guardian_email', ['required' => false, 'label' => 'Guardian email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $subject = V::oneOf($input['subject'] ?? null, self::SUBJECTS, 'subject', ['fallback' => 'Mathematics']);
            $level = V::oneOf($input['level'] ?? null, self::LEVELS, 'level', ['fallback' => 'Intermediate']);
            $goals = V::text($input['goals'] ?? null, 'goals', ['required' => false, 'max' => 1000]);
            $status = V::oneOf($input['status'] ?? null, self::STUDENT_STATUSES, 'status', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO students(student_name, guardian_name, guardian_email, phone, subject, level, goals, status, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $gName, $gEmail, $phone, $subject, $level, $goals, $status, V::now()]
            );
            $row = self::normalizeStudent($db->first('SELECT * FROM students WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['student' => $row]];
        }, write: true);
    }

    public function saveStudent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM students WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            $name = V::text($input['student_name'] ?? null, 'student_name', ['max' => 120, 'label' => 'Student name']);
            $gName = V::text($input['guardian_name'] ?? null, 'guardian_name', ['required' => false, 'max' => 120]);
            $gEmail = V::email($input['guardian_email'] ?? null, 'guardian_email', ['required' => false, 'label' => 'Guardian email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $subject = V::oneOf($input['subject'] ?? null, self::SUBJECTS, 'subject', ['fallback' => $cur['subject']]);
            $level = V::oneOf($input['level'] ?? null, self::LEVELS, 'level', ['fallback' => $cur['level']]);
            $goals = V::text($input['goals'] ?? null, 'goals', ['required' => false, 'max' => 1000]);
            $status = V::oneOf($input['status'] ?? null, self::STUDENT_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE students SET student_name = ?, guardian_name = ?, guardian_email = ?, phone = ?, subject = ?, level = ?, goals = ?, status = ? WHERE id = ?',
                [$name, $gName, $gEmail, $phone, $subject, $level, $goals, $status, $id]
            );
            return ['student' => self::normalizeStudent($db->first('SELECT * FROM students WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteStudent(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM students WHERE id = ?', [$id])) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            $db->execute('DELETE FROM invoices WHERE student_id = ?', [$id]);
            $db->execute('DELETE FROM progress_notes WHERE student_id = ?', [$id]);
            $db->execute('DELETE FROM lessons WHERE student_id = ?', [$id]);
            $db->execute('DELETE FROM students WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Tutors Roster ----

    public function listTutors(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeTutor'],
                $db->query(
                    "SELECT t.*, (SELECT COUNT(*) FROM lessons l WHERE l.tutor_id = t.id AND l.status != 'Cancelled') AS lesson_count "
                    . "FROM tutors t ORDER BY CASE t.active WHEN 'Active' THEN 0 ELSE 1 END, t.tutor_name ASC"
                )
            );
            return ['tutors' => $rows];
        });
    }

    public function addTutor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['tutor_name'] ?? null, 'tutor_name', ['max' => 120, 'label' => 'Tutor name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false, 'label' => 'Email']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $subjects = V::listOf($input['subjects'] ?? null, 'subjects', 12, static fn ($v) => V::oneOf($v, self::SUBJECTS, 'subject'));
            $avail = V::listOf($input['availability'] ?? null, 'availability', 7, static fn ($v) => V::oneOf($v, self::WEEKDAYS, 'day'));
            $rateCents = V::moneyCents($input['hourly_rate'] ?? null, 'hourly_rate', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => 7000, 'label' => 'Hourly rate']);
            $active = V::oneOf($input['active'] ?? null, self::ACTIVE_OPT, 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO tutors(tutor_name, email, phone, subjects_json, availability_json, hourly_rate_cents, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $name,
                    $em,
                    $phone,
                    json_encode($subjects, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($avail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $rateCents,
                    $active,
                    V::now(),
                ]
            );
            $row = self::normalizeTutor($db->first('SELECT * FROM tutors WHERE id = ?', [$created['lastInsertRowid']]));
            return ['__status' => 201, '__body' => ['tutor' => $row]];
        }, write: true);
    }

    public function saveTutor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM tutors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'tutor_not_found', 'Tutor not found.');
            }
            $name = array_key_exists('tutor_name', $input)
                ? V::text($input['tutor_name'], 'tutor_name', ['max' => 120, 'label' => 'Tutor name'])
                : (string) $cur['tutor_name'];
            $em = array_key_exists('email', $input)
                ? V::email($input['email'], 'email', ['required' => false, 'label' => 'Email'])
                : (string) $cur['email'];
            $phone = array_key_exists('phone', $input)
                ? V::text($input['phone'], 'phone', ['required' => false, 'max' => 40])
                : (string) $cur['phone'];
            $subjects = is_array($input['subjects'] ?? null)
                ? V::listOf($input['subjects'], 'subjects', 12, static fn ($v) => V::oneOf($v, self::SUBJECTS, 'subject'))
                : V::parseJson($cur['subjects_json'] ?? '', []);
            $avail = is_array($input['availability'] ?? null)
                ? V::listOf($input['availability'], 'availability', 7, static fn ($v) => V::oneOf($v, self::WEEKDAYS, 'day'))
                : V::parseJson($cur['availability_json'] ?? '', []);
            $rateCents = array_key_exists('hourly_rate', $input)
                ? V::moneyCents($input['hourly_rate'], 'hourly_rate', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => (int) $cur['hourly_rate_cents']])
                : (int) $cur['hourly_rate_cents'];
            $active = array_key_exists('active', $input)
                ? V::oneOf($input['active'], self::ACTIVE_OPT, 'active', ['fallback' => $cur['active']])
                : (string) $cur['active'];

            $db->execute(
                'UPDATE tutors SET tutor_name = ?, email = ?, phone = ?, subjects_json = ?, availability_json = ?, hourly_rate_cents = ?, active = ? WHERE id = ?',
                [
                    $name,
                    $em,
                    $phone,
                    json_encode($subjects, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($avail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $rateCents,
                    $active,
                    $id,
                ]
            );
            $row = self::normalizeTutor($db->first('SELECT * FROM tutors WHERE id = ?', [$id]));
            return ['tutor' => $row];
        }, write: true);
    }

    public function deleteTutor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM tutors WHERE id = ?', [$id])) {
                HttpException::fail(404, 'tutor_not_found', 'Tutor not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM lessons WHERE tutor_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'tutor_has_lessons', 'This tutor has lessons on record. Set them Inactive instead.');
            }
            $db->execute('DELETE FROM tutors WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Lessons Schedule ----

    public function listLessons(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $lessonDate = V::day($input['date'] ?? null, 'date', ['required' => false, 'fallback' => '']);
            $tutorId = V::int($input['tutor_id'] ?? null, 'tutor_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT l.*, s.student_name, s.level AS student_level, s.guardian_name, s.guardian_email, '
                . 't.tutor_name, t.hourly_rate_cents, '
                . '(SELECT COUNT(*) FROM progress_notes pn WHERE pn.lesson_id = l.id) AS note_count '
                . 'FROM lessons l '
                . 'LEFT JOIN students s ON s.id = l.student_id '
                . 'LEFT JOIN tutors t ON t.id = l.tutor_id WHERE 1=1';
            $params = [];
            if ($lessonDate !== '') {
                $sql .= ' AND l.lesson_date = ?';
                $params[] = $lessonDate;
            }
            if ($tutorId !== null) {
                $sql .= ' AND l.tutor_id = ?';
                $params[] = $tutorId;
            }
            $sql .= ($lessonDate !== '')
                ? ' ORDER BY l.start_time ASC, l.id ASC'
                : ' ORDER BY l.lesson_date DESC, l.start_time ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeLesson'], $db->query($sql, $params));
            return ['lessons' => $rows];
        });
    }

    public function addLesson(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $studentId = V::rowId($input['student_id'] ?? null, 'student_id');
            $tutorId = V::rowId($input['tutor_id'] ?? null, 'tutor_id');
            $student = $db->first('SELECT id, subject FROM students WHERE id = ?', [$studentId]);
            if (!$student) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            $tutor = $db->first('SELECT id, hourly_rate_cents FROM tutors WHERE id = ?', [$tutorId]);
            if (!$tutor) {
                HttpException::fail(404, 'tutor_not_found', 'Tutor not found.');
            }

            $lDate = V::day($input['lesson_date'] ?? null, 'lesson_date', ['label' => 'Lesson date']);
            $startTime = V::timeStr($input['start_time'] ?? null, 'start_time', ['required' => false, 'fallback' => '16:00']);
            $duration = V::int($input['duration'] ?? null, 'duration', ['required' => false, 'min' => 15, 'max' => 180, 'fallback' => 60]) ?? 60;
            if (!in_array($duration, self::DURATIONS, true)) {
                $duration = 60;
            }
            $subject = V::oneOf($input['subject'] ?? null, self::SUBJECTS, 'subject', ['fallback' => ($student['subject'] ?: 'Mathematics')]);
            $status = V::oneOf($input['status'] ?? null, self::LESSON_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $autoFee = (int) round(((int) ($tutor['hourly_rate_cents'] ?? 0) * $duration) / 60.0);
            $feeCents = (array_key_exists('fee', $input) && $input['fee'] !== null && $input['fee'] !== '')
                ? V::moneyCents($input['fee'], 'fee', ['min' => 0, 'max' => 500000, 'label' => 'Fee'])
                : $autoFee;
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $created = $db->execute(
                'INSERT INTO lessons(student_id, tutor_id, lesson_date, start_time, duration, subject, status, notes, fee_cents, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$studentId, $tutorId, $lDate, $startTime, $duration, $subject, $status, $notes, $feeCents, V::now()]
            );
            $row = self::normalizeLesson($db->first(
                'SELECT l.*, s.student_name, t.tutor_name, 0 AS note_count FROM lessons l LEFT JOIN students s ON s.id = l.student_id LEFT JOIN tutors t ON t.id = l.tutor_id WHERE l.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['lesson' => $row]];
        }, write: true);
    }

    public function saveLesson(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM lessons WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'lesson_not_found', 'Lesson not found.');
            }
            $studentId = array_key_exists('student_id', $input)
                ? V::rowId($input['student_id'], 'student_id')
                : (int) $cur['student_id'];
            $tutorId = array_key_exists('tutor_id', $input)
                ? V::rowId($input['tutor_id'], 'tutor_id')
                : (int) $cur['tutor_id'];
            if (!$db->first('SELECT id FROM students WHERE id = ?', [$studentId])) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            if (!$db->first('SELECT id FROM tutors WHERE id = ?', [$tutorId])) {
                HttpException::fail(404, 'tutor_not_found', 'Tutor not found.');
            }
            $lDate = array_key_exists('lesson_date', $input)
                ? V::day($input['lesson_date'], 'lesson_date', ['label' => 'Lesson date'])
                : (string) $cur['lesson_date'];
            $startTime = array_key_exists('start_time', $input)
                ? V::timeStr($input['start_time'], 'start_time', ['required' => false, 'fallback' => (string) $cur['start_time']])
                : (string) $cur['start_time'];
            $duration = array_key_exists('duration', $input)
                ? (V::int($input['duration'], 'duration', ['required' => false, 'min' => 15, 'max' => 180, 'fallback' => (int) $cur['duration']]) ?? (int) $cur['duration'])
                : (int) $cur['duration'];
            $subject = V::oneOf($input['subject'] ?? null, self::SUBJECTS, 'subject', ['fallback' => $cur['subject']]);
            $status = V::oneOf($input['status'] ?? null, self::LESSON_STATUSES, 'status', ['fallback' => $cur['status']]);
            $feeCents = array_key_exists('fee', $input)
                ? V::moneyCents($input['fee'], 'fee', ['required' => false, 'min' => 0, 'max' => 500000, 'fallback' => (int) $cur['fee_cents']])
                : (int) $cur['fee_cents'];
            $notes = array_key_exists('notes', $input)
                ? V::text($input['notes'], 'notes', ['required' => false, 'max' => 800])
                : (string) $cur['notes'];

            $db->execute(
                'UPDATE lessons SET student_id = ?, tutor_id = ?, lesson_date = ?, start_time = ?, duration = ?, subject = ?, status = ?, notes = ?, fee_cents = ? WHERE id = ?',
                [$studentId, $tutorId, $lDate, $startTime, $duration, $subject, $status, $notes, $feeCents, $id]
            );
            return ['lesson' => self::normalizeLesson($db->first('SELECT * FROM lessons WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setLessonStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM lessons WHERE id = ?', [$id])) {
                HttpException::fail(404, 'lesson_not_found', 'Lesson not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::LESSON_STATUSES, 'status', ['label' => 'Status']);
            $db->execute('UPDATE lessons SET status = ? WHERE id = ?', [$status, $id]);
            return ['lesson' => self::normalizeLesson($db->first('SELECT * FROM lessons WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteLesson(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM lessons WHERE id = ?', [$id])) {
                HttpException::fail(404, 'lesson_not_found', 'Lesson not found.');
            }
            $db->execute('UPDATE progress_notes SET lesson_id = NULL WHERE lesson_id = ?', [$id]);
            $db->execute('DELETE FROM lessons WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Progress Notes & Homework ----

    public function listProgressNotes(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $studentId = V::int($input['student_id'] ?? null, 'student_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT pn.*, s.student_name, s.guardian_name, s.guardian_email, s.subject AS student_subject, '
                . 'l.lesson_date, l.start_time, l.duration, l.subject AS lesson_subject, t.tutor_name '
                . 'FROM progress_notes pn '
                . 'LEFT JOIN students s ON s.id = pn.student_id '
                . 'LEFT JOIN lessons l ON l.id = pn.lesson_id '
                . 'LEFT JOIN tutors t ON t.id = l.tutor_id WHERE 1=1';
            $params = [];
            if ($studentId !== null) {
                $sql .= ' AND pn.student_id = ?';
                $params[] = $studentId;
            }
            $sql .= ' ORDER BY pn.created_at DESC LIMIT 150';
            $rows = array_map([self::class, 'normalizeProgressNote'], $db->query($sql, $params));
            return ['notes' => $rows];
        });
    }

    public function addProgressNote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $studentId = V::rowId($input['student_id'] ?? null, 'student_id');
            if (!$db->first('SELECT id FROM students WHERE id = ?', [$studentId])) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            $lessonId = V::int($input['lesson_id'] ?? null, 'lesson_id', ['required' => false, 'min' => 1]);
            if ($lessonId !== null && !$db->first('SELECT id FROM lessons WHERE id = ?', [$lessonId])) {
                HttpException::fail(404, 'lesson_not_found', 'Linked lesson not found.');
            }
            $area = V::oneOf($input['area'] ?? null, self::PROGRESS_AREAS, 'area', ['fallback' => 'Technique']);
            $score = V::int($input['score'] ?? null, 'score', ['required' => false, 'min' => 1, 'max' => 5, 'fallback' => 4, 'label' => 'Score']) ?? 4;
            $notes = V::text($input['notes'] ?? null, 'notes', ['max' => 1500, 'label' => 'Progress notes']);
            $homework = V::text($input['homework'] ?? null, 'homework', ['required' => false, 'max' => 1200]);
            $followUp = V::oneOf($input['follow_up'] ?? null, self::YES_NO, 'follow_up', ['fallback' => 'No']);

            $created = $db->execute(
                'INSERT INTO progress_notes(student_id, lesson_id, area, score, notes, homework, follow_up, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$studentId, $lessonId, $area, $score, $notes, $homework, $followUp, V::now()]
            );
            $row = self::normalizeProgressNote($db->first(
                'SELECT pn.*, s.student_name, s.guardian_name, s.guardian_email, l.lesson_date, l.subject AS lesson_subject, t.tutor_name '
                . 'FROM progress_notes pn LEFT JOIN students s ON s.id = pn.student_id LEFT JOIN lessons l ON l.id = pn.lesson_id LEFT JOIN tutors t ON t.id = l.tutor_id WHERE pn.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['note' => $row]];
        }, write: true);
    }

    public function deleteProgressNote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM progress_notes WHERE id = ?', [$id])) {
                HttpException::fail(404, 'note_not_found', 'Progress note not found.');
            }
            $db->execute('DELETE FROM progress_notes WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Billing & Tuition Invoices ----

    public function listInvoices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                [self::class, 'normalizeInvoice'],
                $db->query(
                    'SELECT inv.*, s.student_name, s.guardian_name, s.guardian_email, s.phone AS student_phone, s.subject AS student_subject '
                    . 'FROM invoices inv LEFT JOIN students s ON s.id = inv.student_id ORDER BY inv.created_at DESC LIMIT 200'
                )
            );
            $collected = 0;
            $outstanding = 0;
            $overdueCount = 0;
            foreach ($rows as $r) {
                $st = (string) ($r['status'] ?? '');
                $amt = (int) ($r['amount_cents'] ?? 0);
                if ($st === 'Paid') {
                    $collected += $amt;
                } elseif ($st === 'Unpaid' || $st === 'Sent' || $st === 'Overdue') {
                    $outstanding += $amt;
                    $due = (string) ($r['due_date'] ?? '');
                    if ($st === 'Overdue' || ($due !== '' && $due < $todayDay)) {
                        $overdueCount++;
                    }
                }
            }
            return [
                'invoices' => $rows,
                'summary' => [
                    'collectedCents' => $collected,
                    'outstandingCents' => $outstanding,
                    'overdueCount' => $overdueCount,
                ],
            ];
        });
    }

    public function addInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $studentId = V::rowId($input['student_id'] ?? null, 'student_id');
            if (!$db->first('SELECT id FROM students WHERE id = ?', [$studentId])) {
                HttpException::fail(404, 'student_not_found', 'Student not found.');
            }
            $period = V::text($input['billing_period'] ?? null, 'billing_period', ['max' => 120, 'label' => 'Billing period']);
            $amountCents = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 50000000, 'label' => 'Invoice amount']);
            $status = V::oneOf($input['status'] ?? null, self::INVOICE_STATUSES, 'status', ['fallback' => 'Unpaid']);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => '']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = 'INV-' . $nextSeq;
            $ts = V::now();
            $paidAt = ($status === 'Paid') ? $ts : 0;

            $created = $db->execute(
                'INSERT INTO invoices(invoice_number, student_id, billing_period, amount_cents, status, due_date, notes, paid_at, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$invNum, $studentId, $period, $amountCents, $status, $dueDate, $notes, $paidAt, $ts]
            );
            $row = self::normalizeInvoice($db->first(
                'SELECT inv.*, s.student_name, s.guardian_name, s.guardian_email FROM invoices inv LEFT JOIN students s ON s.id = inv.student_id WHERE inv.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['invoice' => $row]];
        }, write: true);
    }

    public function setInvoiceStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM invoices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'invoice_not_found', 'Invoice not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::INVOICE_STATUSES, 'status', ['label' => 'Status']);
            $paidAt = ($status === 'Paid') ? (((int) ($cur['paid_at'] ?? 0)) ?: V::now()) : 0;
            $db->execute('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?', [$status, $paidAt, $id]);
            return ['invoice' => self::normalizeInvoice($db->first('SELECT * FROM invoices WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            if (!$db->first('SELECT id FROM invoices WHERE id = ?', [$id])) {
                HttpException::fail(404, 'invoice_not_found', 'Invoice not found.');
            }
            $db->execute('DELETE FROM invoices WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
