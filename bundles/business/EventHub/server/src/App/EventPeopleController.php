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

final class EventPeopleController
{
    private const TICKET_TYPES = ['General Admission', 'VIP', 'Early Bird', 'Student', 'Speaker', 'Press'];
    private const PRES_TYPES = ['Keynote', 'Breakout Session', 'Workshop', 'Panel Discussion', 'Lightning Talk'];
    private const SPEAKER_STATUSES = ['Submitted', 'Under Review', 'Accepted', 'Scheduled', 'Declined'];
    private const BOOTH_SIZES = ['Small (6x6)', 'Medium (10x10)', 'Large (10x20)', 'Premium (20x20)'];
    private const VENDOR_STATUSES = ['Applied', 'Approved', 'Booth Assigned', 'Declined'];
    private const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    private const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    /** @return array<string, mixed>|null */
    private static function hydrateAttendee(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['checked_in'] = (int) ($row['checked_in'] ?? 0);
        $row['checked_in_at'] = (int) ($row['checked_in_at'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $dietary = V::parseJson($row['dietary_json'] ?? '', []);
        $row['dietary'] = is_array($dietary) ? array_values($dietary) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function hydrateSpeaker(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        $equip = V::parseJson($row['equipment_json'] ?? '', []);
        $row['equipment'] = is_array($equip) ? array_values($equip) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function hydrateVendor(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['insurance_verified'] = (int) ($row['insurance_verified'] ?? 0);
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $row['updated_at'] = (int) ($row['updated_at'] ?? 0);
        $power = V::parseJson($row['power_json'] ?? '', []);
        $row['power'] = is_array($power) ? array_values($power) : [];
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function hydrateVolunteer(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['is_sample'] = (int) ($row['is_sample'] ?? 0);
        $row['created_at'] = (int) ($row['created_at'] ?? 0);
        $avail = V::parseJson($row['availability_json'] ?? '', []);
        $skills = V::parseJson($row['skills_json'] ?? '', []);
        $row['availability'] = is_array($avail) ? array_values($avail) : [];
        $row['skills'] = is_array($skills) ? array_values($skills) : [];
        return $row;
    }

    // ---- Command Center ----

    public function getCommandCenter(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $counts = WorkspaceController::readBadgeCounts($db);
            $recentCheckIns = array_map(
                [self::class, 'hydrateAttendee'],
                $db->query('SELECT * FROM attendees WHERE checked_in = 1 ORDER BY checked_in_at DESC LIMIT 8')
            );
            $openIncidents = array_map(
                [EventOpsController::class, 'normalizeIncident'],
                $db->query(
                    "SELECT * FROM incidents WHERE status = 'Open' ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 10"
                )
            );
            $scheduledSpeakers = array_map(
                [self::class, 'hydrateSpeaker'],
                $db->query("SELECT * FROM speakers WHERE status IN ('Accepted', 'Scheduled') ORDER BY status DESC, speaker_name ASC LIMIT 10")
            );
            $budgetRows = array_map(
                [EventOpsController::class, 'hydrateBudgetItem'],
                $db->query('SELECT * FROM budget_items ORDER BY (estimated_cents - actual_cents) ASC LIMIT 10')
            );

            return [
                'counts' => $counts,
                'recentCheckIns' => $recentCheckIns,
                'openIncidents' => $openIncidents,
                'scheduledSpeakers' => $scheduledSpeakers,
                'budgetHighlights' => $budgetRows,
            ];
        });
    }

    // ---- Attendees & 1-Tap Check-In ----

    public function listAttendees(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $ttype = V::text($input['ticket_type'] ?? null, 'ticket_type', ['required' => false, 'max' => 40]);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 120]);
            $sql = 'SELECT * FROM attendees WHERE 1=1';
            $params = [];
            if ($ttype !== '' && $ttype !== 'All') {
                $sql .= ' AND ticket_type = ?';
                $params[] = $ttype;
            }
            if ($q !== '') {
                $pat = V::likeTerm($q);
                $sql .= " AND (attendee_name LIKE ? ESCAPE '\\' OR organization LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')";
                array_push($params, $pat, $pat, $pat);
            }
            $sql .= ' ORDER BY checked_in ASC, attendee_name ASC';
            $rows = array_map([self::class, 'hydrateAttendee'], $db->query($sql, $params));
            return [
                'attendees' => $rows,
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        });
    }

    public function addAttendee(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['attendee_name'] ?? null, 'attendee_name', ['max' => 120, 'label' => 'Full name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $org = V::text($input['organization'] ?? null, 'organization', ['required' => false, 'max' => 120]);
            $ttype = V::oneOf($input['ticket_type'] ?? null, self::TICKET_TYPES, 'ticket_type', ['fallback' => 'General Admission']);
            $diet = V::listOf($input['dietary'] ?? null, 'dietary', 10, static fn ($v) => V::text($v, 'diet', ['max' => 40]));
            $access = V::text($input['accessibility_needs'] ?? null, 'accessibility_needs', ['required' => false, 'max' => 500]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $checked = V::bool($input['checked_in'] ?? false) ? 1 : 0;
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO attendees(attendee_name, email, phone, organization, ticket_type, dietary_json, accessibility_needs, emergency_contact_name, emergency_contact_phone, checked_in, checked_in_at, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $em, $phone, $org, $ttype, json_encode($diet, self::JSON_FLAGS), $access, $ecName, $ecPhone, $checked, $checked ? $ts : 0, $ts]
            );
            $row = self::hydrateAttendee($db->first('SELECT * FROM attendees WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => [
                    'attendee' => $row,
                    'counts' => WorkspaceController::readBadgeCounts($db),
                ],
            ];
        }, write: true);
    }

    public function saveAttendee(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM attendees WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Attendee not found.');
            }
            $name = V::text($input['attendee_name'] ?? null, 'attendee_name', ['max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $org = V::text($input['organization'] ?? null, 'organization', ['required' => false, 'max' => 120]);
            $ttype = V::oneOf($input['ticket_type'] ?? null, self::TICKET_TYPES, 'ticket_type', ['fallback' => $cur['ticket_type']]);
            if (array_key_exists('dietary', $input) && is_array($input['dietary'])) {
                $diet = V::listOf($input['dietary'], 'dietary', 10, static fn ($v) => V::text($v, 'diet', ['max' => 40]));
            } else {
                $existingDiet = V::parseJson($cur['dietary_json'] ?? '', []);
                $diet = is_array($existingDiet) ? array_values($existingDiet) : [];
            }
            $access = V::text($input['accessibility_needs'] ?? null, 'accessibility_needs', ['required' => false, 'max' => 500]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);

            $db->execute(
                'UPDATE attendees SET attendee_name = ?, email = ?, phone = ?, organization = ?, ticket_type = ?, dietary_json = ?, accessibility_needs = ?, emergency_contact_name = ?, emergency_contact_phone = ? WHERE id = ?',
                [$name, $em, $phone, $org, $ttype, json_encode($diet, self::JSON_FLAGS), $access, $ecName, $ecPhone, $id]
            );
            $row = self::hydrateAttendee($db->first('SELECT * FROM attendees WHERE id = ?', [$id]));
            return ['attendee' => $row];
        }, write: true);
    }

    public function toggleCheckIn(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM attendees WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Attendee not found.');
            }
            $nextVal = array_key_exists('checked_in', $input)
                ? (V::bool($input['checked_in']) ? 1 : 0)
                : ((int) $cur['checked_in'] ? 0 : 1);
            $ts = $nextVal ? V::now() : 0;
            $db->execute('UPDATE attendees SET checked_in = ?, checked_in_at = ? WHERE id = ?', [$nextVal, $ts, $id]);
            $row = self::hydrateAttendee($db->first('SELECT * FROM attendees WHERE id = ?', [$id]));
            return [
                'attendee' => $row,
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        }, write: true);
    }

    public function deleteAttendee(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM attendees WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Attendee not found.');
            }
            $db->execute('DELETE FROM attendees WHERE id = ?', [$id]);
            return [
                'deleted' => true,
                'counts' => WorkspaceController::readBadgeCounts($db),
            ];
        }, write: true);
    }

    // ---- Speakers & Program ----

    public function listSpeakers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM speakers ORDER BY CASE status WHEN 'Scheduled' THEN 0 WHEN 'Accepted' THEN 1 WHEN 'Under Review' THEN 2 WHEN 'Submitted' THEN 3 ELSE 4 END, created_at DESC"
            );
            return ['speakers' => array_map([self::class, 'hydrateSpeaker'], $rows)];
        });
    }

    public function addSpeaker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['speaker_name'] ?? null, 'speaker_name', ['max' => 120, 'label' => 'Speaker name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $bio = V::text($input['bio'] ?? null, 'bio', ['required' => false, 'max' => 1500]);
            $topic = V::text($input['topic_title'] ?? null, 'topic_title', ['max' => 200, 'label' => 'Topic title']);
            $abs = V::text($input['abstract'] ?? null, 'abstract', ['required' => false, 'max' => 2000]);
            $ptype = V::oneOf($input['presentation_type'] ?? null, self::PRES_TYPES, 'presentation_type', ['fallback' => 'Breakout Session']);
            $equip = V::listOf($input['equipment'] ?? null, 'equipment', 10, static fn ($v) => V::text($v, 'equip', ['max' => 40]));
            $slot = V::text($input['session_slot'] ?? null, 'session_slot', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::SPEAKER_STATUSES, 'status', ['fallback' => 'Submitted']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO speakers(speaker_name, email, phone, bio, topic_title, abstract, presentation_type, equipment_json, session_slot, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$name, $em, $phone, $bio, $topic, $abs, $ptype, json_encode($equip, self::JSON_FLAGS), $slot, $status, $notes, $ts, $ts]
            );
            $row = self::hydrateSpeaker($db->first('SELECT * FROM speakers WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => ['speaker' => $row],
            ];
        }, write: true);
    }

    public function saveSpeaker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM speakers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Speaker not found.');
            }
            $name = V::text($input['speaker_name'] ?? null, 'speaker_name', ['max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $bio = V::text($input['bio'] ?? null, 'bio', ['required' => false, 'max' => 1500]);
            $topic = V::text($input['topic_title'] ?? null, 'topic_title', ['max' => 200]);
            $abs = V::text($input['abstract'] ?? null, 'abstract', ['required' => false, 'max' => 2000]);
            $ptype = V::oneOf($input['presentation_type'] ?? null, self::PRES_TYPES, 'presentation_type', ['fallback' => $cur['presentation_type']]);
            if (array_key_exists('equipment', $input) && is_array($input['equipment'])) {
                $equip = V::listOf($input['equipment'], 'equipment', 10, static fn ($v) => V::text($v, 'equip', ['max' => 40]));
            } else {
                $existingEquip = V::parseJson($cur['equipment_json'] ?? '', []);
                $equip = is_array($existingEquip) ? array_values($existingEquip) : [];
            }
            $slot = V::text($input['session_slot'] ?? null, 'session_slot', ['required' => false, 'max' => 120]);
            $status = V::oneOf($input['status'] ?? null, self::SPEAKER_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);

            $db->execute(
                'UPDATE speakers SET speaker_name = ?, email = ?, phone = ?, bio = ?, topic_title = ?, abstract = ?, presentation_type = ?, equipment_json = ?, session_slot = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$name, $em, $phone, $bio, $topic, $abs, $ptype, json_encode($equip, self::JSON_FLAGS), $slot, $status, $notes, V::now(), $id]
            );
            return ['speaker' => self::hydrateSpeaker($db->first('SELECT * FROM speakers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setSpeakerStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM speakers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Speaker not found.');
            }
            $st = V::oneOf($input['status'] ?? null, self::SPEAKER_STATUSES, 'status', ['fallback' => $cur['status']]);
            $slot = array_key_exists('session_slot', $input)
                ? V::text($input['session_slot'], 'session_slot', ['required' => false, 'max' => 120])
                : (string) $cur['session_slot'];
            $db->execute('UPDATE speakers SET status = ?, session_slot = ?, updated_at = ? WHERE id = ?', [$st, $slot, V::now(), $id]);
            return ['speaker' => self::hydrateSpeaker($db->first('SELECT * FROM speakers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteSpeaker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM speakers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Speaker not found.');
            }
            $db->execute('DELETE FROM speakers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Vendors & Exhibitors ----

    public function listVendors(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = $db->query(
                "SELECT * FROM vendors ORDER BY CASE status WHEN 'Booth Assigned' THEN 0 WHEN 'Approved' THEN 1 WHEN 'Applied' THEN 2 ELSE 3 END, company_name ASC"
            );
            return ['vendors' => array_map([self::class, 'hydrateVendor'], $rows)];
        });
    }

    public function addVendor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $comp = V::text($input['company_name'] ?? null, 'company_name', ['max' => 140, 'label' => 'Company name']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['max' => 100, 'label' => 'Contact name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $website = V::text($input['website'] ?? null, 'website', ['required' => false, 'max' => 200]);
            $prods = V::text($input['products_services'] ?? null, 'products_services', ['required' => false, 'max' => 1000]);
            $size = V::oneOf($input['booth_size'] ?? null, self::BOOTH_SIZES, 'booth_size', ['fallback' => 'Medium (10x10)']);
            $power = V::listOf($input['power'] ?? null, 'power', 6, static fn ($v) => V::text($v, 'pwr', ['max' => 40]));
            $boothNum = V::text($input['booth_number'] ?? null, 'booth_number', ['required' => false, 'max' => 30]);
            $ins = V::bool($input['insurance_verified'] ?? false) ? 1 : 0;
            $special = V::text($input['special_requests'] ?? null, 'special_requests', ['required' => false, 'max' => 600]);
            $st = V::oneOf($input['status'] ?? null, self::VENDOR_STATUSES, 'status', [
                'fallback' => $boothNum !== '' ? 'Booth Assigned' : 'Applied',
            ]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO vendors(company_name, contact_name, email, phone, website, products_services, booth_size, power_json, booth_number, insurance_verified, special_requests, status, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$comp, $contact, $em, $phone, $website, $prods, $size, json_encode($power, self::JSON_FLAGS), $boothNum, $ins, $special, $st, $ts, $ts]
            );
            $row = self::hydrateVendor($db->first('SELECT * FROM vendors WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => ['vendor' => $row],
            ];
        }, write: true);
    }

    public function saveVendor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vendors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Vendor not found.');
            }
            $comp = V::text($input['company_name'] ?? null, 'company_name', ['max' => 140]);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['max' => 100]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $website = V::text($input['website'] ?? null, 'website', ['required' => false, 'max' => 200]);
            $prods = V::text($input['products_services'] ?? null, 'products_services', ['required' => false, 'max' => 1000]);
            $size = V::oneOf($input['booth_size'] ?? null, self::BOOTH_SIZES, 'booth_size', ['fallback' => $cur['booth_size']]);
            if (array_key_exists('power', $input) && is_array($input['power'])) {
                $power = V::listOf($input['power'], 'power', 6, static fn ($v) => V::text($v, 'pwr', ['max' => 40]));
            } else {
                $existingPower = V::parseJson($cur['power_json'] ?? '', []);
                $power = is_array($existingPower) ? array_values($existingPower) : [];
            }
            $boothNum = V::text($input['booth_number'] ?? null, 'booth_number', ['required' => false, 'max' => 30]);
            $ins = array_key_exists('insurance_verified', $input)
                ? (V::bool($input['insurance_verified']) ? 1 : 0)
                : (int) $cur['insurance_verified'];
            $special = V::text($input['special_requests'] ?? null, 'special_requests', ['required' => false, 'max' => 600]);
            $st = V::oneOf($input['status'] ?? null, self::VENDOR_STATUSES, 'status', ['fallback' => $cur['status']]);

            $db->execute(
                'UPDATE vendors SET company_name = ?, contact_name = ?, email = ?, phone = ?, website = ?, products_services = ?, booth_size = ?, power_json = ?, booth_number = ?, insurance_verified = ?, special_requests = ?, status = ?, updated_at = ? WHERE id = ?',
                [$comp, $contact, $em, $phone, $website, $prods, $size, json_encode($power, self::JSON_FLAGS), $boothNum, $ins, $special, $st, V::now(), $id]
            );
            return ['vendor' => self::hydrateVendor($db->first('SELECT * FROM vendors WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function setVendorStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM vendors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Vendor not found.');
            }
            $st = V::oneOf($input['status'] ?? null, self::VENDOR_STATUSES, 'status', ['fallback' => $cur['status']]);
            $boothNum = array_key_exists('booth_number', $input)
                ? V::text($input['booth_number'], 'booth_number', ['required' => false, 'max' => 30])
                : (string) $cur['booth_number'];
            $db->execute('UPDATE vendors SET status = ?, booth_number = ?, updated_at = ? WHERE id = ?', [$st, $boothNum, V::now(), $id]);
            return ['vendor' => self::hydrateVendor($db->first('SELECT * FROM vendors WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteVendor(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM vendors WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Vendor not found.');
            }
            $db->execute('DELETE FROM vendors WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Volunteers ----

    public function listVolunteers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'hydrateVolunteer'],
                $db->query('SELECT * FROM volunteers ORDER BY volunteer_name ASC')
            );
            $shirtCounts = [];
            foreach ($rows as $row) {
                $sz = (string) (($row['t_shirt_size'] ?? '') !== '' ? $row['t_shirt_size'] : 'M');
                $shirtCounts[$sz] = ($shirtCounts[$sz] ?? 0) + 1;
            }
            return [
                'volunteers' => $rows,
                'shirtCounts' => count($shirtCounts) > 0 ? $shirtCounts : new \stdClass(),
            ];
        });
    }

    public function addVolunteer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['volunteer_name'] ?? null, 'volunteer_name', ['max' => 120, 'label' => 'Volunteer name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $avail = V::listOf($input['availability'] ?? null, 'availability', 8, static fn ($v) => V::text($v, 'av', ['max' => 50]));
            $skills = V::listOf($input['skills'] ?? null, 'skills', 10, static fn ($v) => V::text($v, 'sk', ['max' => 50]));
            $shirt = V::oneOf($input['t_shirt_size'] ?? null, self::SHIRT_SIZES, 't_shirt_size', ['fallback' => 'M']);
            $shift = V::text($input['assigned_shift'] ?? null, 'assigned_shift', ['required' => false, 'max' => 120]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $created = $db->execute(
                'INSERT INTO volunteers(volunteer_name, email, phone, availability_json, skills_json, t_shirt_size, assigned_shift, emergency_contact_name, emergency_contact_phone, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $em, $phone, json_encode($avail, self::JSON_FLAGS), json_encode($skills, self::JSON_FLAGS), $shirt, $shift, $ecName, $ecPhone, $notes, V::now()]
            );
            $row = self::hydrateVolunteer($db->first('SELECT * FROM volunteers WHERE id = ?', [$created['lastInsertRowid']]));
            return [
                '__status' => 201,
                '__body' => ['volunteer' => $row],
            ];
        }, write: true);
    }

    public function saveVolunteer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM volunteers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Volunteer not found.');
            }
            $name = V::text($input['volunteer_name'] ?? null, 'volunteer_name', ['max' => 120]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            if (array_key_exists('availability', $input) && is_array($input['availability'])) {
                $avail = V::listOf($input['availability'], 'availability', 8, static fn ($v) => V::text($v, 'av', ['max' => 50]));
            } else {
                $existingAvail = V::parseJson($cur['availability_json'] ?? '', []);
                $avail = is_array($existingAvail) ? array_values($existingAvail) : [];
            }
            if (array_key_exists('skills', $input) && is_array($input['skills'])) {
                $skills = V::listOf($input['skills'], 'skills', 10, static fn ($v) => V::text($v, 'sk', ['max' => 50]));
            } else {
                $existingSkills = V::parseJson($cur['skills_json'] ?? '', []);
                $skills = is_array($existingSkills) ? array_values($existingSkills) : [];
            }
            $shirt = V::oneOf($input['t_shirt_size'] ?? null, self::SHIRT_SIZES, 't_shirt_size', ['fallback' => $cur['t_shirt_size']]);
            $shift = V::text($input['assigned_shift'] ?? null, 'assigned_shift', ['required' => false, 'max' => 120]);
            $ecName = V::text($input['emergency_contact_name'] ?? null, 'emergency_contact_name', ['required' => false, 'max' => 100]);
            $ecPhone = V::text($input['emergency_contact_phone'] ?? null, 'emergency_contact_phone', ['required' => false, 'max' => 40]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);

            $db->execute(
                'UPDATE volunteers SET volunteer_name = ?, email = ?, phone = ?, availability_json = ?, skills_json = ?, t_shirt_size = ?, assigned_shift = ?, emergency_contact_name = ?, emergency_contact_phone = ?, notes = ? WHERE id = ?',
                [$name, $em, $phone, json_encode($avail, self::JSON_FLAGS), json_encode($skills, self::JSON_FLAGS), $shirt, $shift, $ecName, $ecPhone, $notes, $id]
            );
            return ['volunteer' => self::hydrateVolunteer($db->first('SELECT * FROM volunteers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteVolunteer(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM volunteers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Volunteer not found.');
            }
            $db->execute('DELETE FROM volunteers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
