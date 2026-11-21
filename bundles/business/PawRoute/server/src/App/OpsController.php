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

final class OpsController
{
    private const CONTACT_PREFS = ['Text message', 'Phone call', 'Email', 'App'];
    private const BILLING_OPTS = ['Up to date', 'Pending', 'Overdue'];
    private const SPECIES = ['Dog', 'Cat', 'Other'];
    private const SIZES = ['Small', 'Medium', 'Large', 'Giant'];
    private const TEMPERAMENTS = ['Dog-friendly', 'Friendly', 'Nervous', 'Anxious', 'Reactive', 'Pulls on lead', 'Senior', 'Puppy'];
    private const PET_ACTIVE = ['Active', 'Paused', 'Archived'];
    private const WALKER_ROLES = ['Walker', 'Sitter', 'Admin'];
    private const PR_AREAS = ['North side', 'South side', 'East side', 'West side', 'Inner city'];
    private const PR_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    private const ACTIVE_YN = ['Active', 'Inactive'];
    private const SERVICE_TYPES = ['Solo Walk', 'Group Walk', 'Drop-in Visit', 'Pet Sitting', 'Pet Taxi'];
    private const DURATIONS = ['15 minutes', '30 minutes', '45 minutes', '60 minutes'];
    private const WALK_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'No Access'];
    private const WEATHERS = ['Sunny', 'Overcast', 'Rain', 'Windy', 'Hot'];
    private const INCIDENT_TYPES = ['Injury', 'Escape risk', 'Aggression', 'Illness', 'No access', 'Owner note'];
    private const INCIDENT_SEVS = ['Low', 'Medium', 'High', 'Urgent'];
    private const YES_NO = ['Yes', 'No'];

    /** @return array<string, mixed>|null */
    private static function normalizeClient(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'pet_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePet(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'owner_id', 'is_sample', 'created_at', 'completed_walks'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['temperament'] = V::parseJson($row['temperament_json'] ?? '', []);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeWalker(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'today_walks'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['service_areas'] = V::parseJson($row['service_areas_json'] ?? '', []);
        $row['availability'] = V::parseJson($row['availability_json'] ?? '', []);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeWalk(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'pet_id', 'client_id', 'walker_id', 'charge_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        $row['temperament'] = V::parseJson($row['temperament_json'] ?? '', []);
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeIncident(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'pet_id', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        foreach (['walk_id', 'reported_by_id'] as $nullIntCol) {
            if (array_key_exists($nullIntCol, $row)) {
                $row[$nullIntCol] = ($row[$nullIntCol] !== null && $row[$nullIntCol] !== '') ? (int) $row[$nullIntCol] : null;
            }
        }
        return $row;
    }

    // ---- Clients ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeClient'],
                $db->query(
                    "SELECT c.*, (SELECT COUNT(*) FROM pets p WHERE p.owner_id = c.id AND p.active = 'Active') AS pet_count FROM clients c ORDER BY CASE c.billing_status WHEN 'Overdue' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END, c.name ASC"
                )
            );
            return ['clients' => $rows];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1200]);
            $emergency = V::text($input['emergency_contact'] ?? null, 'emergency_contact', ['required' => false, 'max' => 240]);
            $pref = V::oneOf($input['preferred_contact'] ?? null, self::CONTACT_PREFS, 'preferred_contact', ['fallback' => 'Text message']);
            $billing = V::oneOf($input['billing_status'] ?? null, self::BILLING_OPTS, 'billing_status', ['fallback' => 'Up to date']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $created = $db->execute(
                'INSERT INTO clients(name, email, phone, address, access_instructions, emergency_contact, preferred_contact, billing_status, notes, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$name, $em, $phone, $address, $access, $emergency, $pref, $billing, $notes, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 120, 'label' => 'Client name']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $phone = V::text($input['phone'] ?? null, 'phone', ['max' => 40, 'label' => 'Phone number']);
            $address = V::text($input['address'] ?? null, 'address', ['required' => false, 'max' => 240]);
            $access = V::text($input['access_instructions'] ?? null, 'access_instructions', ['required' => false, 'max' => 1200]);
            $emergency = V::text($input['emergency_contact'] ?? null, 'emergency_contact', ['required' => false, 'max' => 240]);
            $pref = V::oneOf($input['preferred_contact'] ?? null, self::CONTACT_PREFS, 'preferred_contact', ['fallback' => $cur['preferred_contact']]);
            $billing = V::oneOf($input['billing_status'] ?? null, self::BILLING_OPTS, 'billing_status', ['fallback' => $cur['billing_status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE clients SET name = ?, email = ?, phone = ?, address = ?, access_instructions = ?, emergency_contact = ?, preferred_contact = ?, billing_status = ?, notes = ? WHERE id = ?',
                [$name, $em, $phone, $address, $access, $emergency, $pref, $billing, $notes, $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM pets WHERE owner_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'client_has_pets', "Remove or reassign this client's pets first.");
            }
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Pets ----

    /** @return array<string, mixed>|null */
    private static function hydratePet(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT p.*, c.name AS owner_name, c.phone AS owner_phone, c.address AS owner_address, c.access_instructions, c.emergency_contact FROM pets p LEFT JOIN clients c ON c.id = p.owner_id WHERE p.id = ?',
            [$id]
        );
        return self::normalizePet($row);
    }

    public function listPets(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizePet'],
                $db->query(
                    "SELECT p.*, c.name AS owner_name, c.phone AS owner_phone, c.address AS owner_address, c.access_instructions, c.emergency_contact, (SELECT COUNT(*) FROM walks w WHERE w.pet_id = p.id AND w.status = 'Completed') AS completed_walks FROM pets p LEFT JOIN clients c ON c.id = p.owner_id ORDER BY CASE p.active WHEN 'Active' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END, p.name ASC"
                )
            );
            return ['pets' => $rows];
        });
    }

    public function addPet(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $ownerId = V::rowId($input['owner_id'] ?? null, 'owner_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$ownerId])) {
                HttpException::fail(404, 'client_not_found', 'Owner not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 80, 'label' => 'Pet name']);
            $species = V::oneOf($input['species'] ?? null, self::SPECIES, 'species', ['fallback' => 'Dog']);
            $breed = V::text($input['breed'] ?? null, 'breed', ['required' => false, 'max' => 100]);
            $size = V::oneOf($input['size'] ?? null, self::SIZES, 'size', ['fallback' => 'Medium']);
            $temps = V::listOf(
                $input['temperament'] ?? null,
                'temperament',
                10,
                fn ($v) => V::oneOf($v, self::TEMPERAMENTS, 'temperament')
            );
            $med = V::text($input['medical_notes'] ?? null, 'medical_notes', ['required' => false, 'max' => 1200]);
            $feed = V::text($input['feeding_instructions'] ?? null, 'feeding_instructions', ['required' => false, 'max' => 1000]);
            $vet = V::text($input['vet_contact'] ?? null, 'vet_contact', ['required' => false, 'max' => 80]);
            $active = V::oneOf($input['active'] ?? null, self::PET_ACTIVE, 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO pets(owner_id, name, species, breed, size, temperament_json, medical_notes, feeding_instructions, vet_contact, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$ownerId, $name, $species, $breed, $size, json_encode($temps, JSON_UNESCAPED_UNICODE), $med, $feed, $vet, $active, V::now()]
            );
            return [
                '__status' => 201,
                '__body' => ['pet' => self::hydratePet($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function savePet(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM pets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Pet profile not found.');
            }
            $ownerId = V::rowId(($input['owner_id'] ?? null) ?: $cur['owner_id'], 'owner_id');
            if (!$db->first('SELECT id FROM clients WHERE id = ?', [$ownerId])) {
                HttpException::fail(404, 'client_not_found', 'Owner not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 80, 'label' => 'Pet name']);
            $species = V::oneOf($input['species'] ?? null, self::SPECIES, 'species', ['fallback' => $cur['species']]);
            $breed = V::text($input['breed'] ?? null, 'breed', ['required' => false, 'max' => 100]);
            $size = V::oneOf($input['size'] ?? null, self::SIZES, 'size', ['fallback' => $cur['size']]);
            $temps = is_array($input['temperament'] ?? null)
                ? V::listOf($input['temperament'], 'temperament', 10, fn ($v) => V::oneOf($v, self::TEMPERAMENTS, 'temperament'))
                : V::parseJson($cur['temperament_json'] ?? '', []);
            $med = V::text($input['medical_notes'] ?? null, 'medical_notes', ['required' => false, 'max' => 1200]);
            $feed = V::text($input['feeding_instructions'] ?? null, 'feeding_instructions', ['required' => false, 'max' => 1000]);
            $vet = V::text($input['vet_contact'] ?? null, 'vet_contact', ['required' => false, 'max' => 80]);
            $active = V::oneOf($input['active'] ?? null, self::PET_ACTIVE, 'active', ['fallback' => $cur['active']]);

            $db->execute(
                'UPDATE pets SET owner_id = ?, name = ?, species = ?, breed = ?, size = ?, temperament_json = ?, medical_notes = ?, feeding_instructions = ?, vet_contact = ?, active = ? WHERE id = ?',
                [$ownerId, $name, $species, $breed, $size, json_encode($temps, JSON_UNESCAPED_UNICODE), $med, $feed, $vet, $active, $id]
            );
            return ['pet' => self::hydratePet($db, $id)];
        }, write: true);
    }

    public function deletePet(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM pets WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Pet profile not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM walks WHERE pet_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'pet_has_walks', 'Delete or archive walks for this pet before deleting its profile.');
            }
            $db->execute('DELETE FROM incidents WHERE pet_id = ?', [$id]);
            $db->execute('DELETE FROM pets WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Walkers Roster ----

    public function listWalkers(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $refDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => V::utcDay(0)]);
            $rows = array_map(
                [self::class, 'normalizeWalker'],
                $db->query(
                    "SELECT w.*, (SELECT COUNT(*) FROM walks wk WHERE wk.walker_id = w.id AND wk.walk_date = ? AND wk.status != 'Cancelled') AS today_walks FROM walkers w ORDER BY CASE w.active WHEN 'Active' THEN 0 ELSE 1 END, w.name ASC",
                    [$refDay]
                )
            );
            return ['walkers' => $rows];
        });
    }

    public function addWalker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Walker name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $role = V::oneOf($input['role'] ?? null, self::WALKER_ROLES, 'role', ['fallback' => 'Walker']);
            $areas = V::listOf(
                $input['service_areas'] ?? null,
                'service_areas',
                10,
                fn ($a) => V::oneOf($a, self::PR_AREAS, 'service_area')
            );
            $avail = V::listOf(
                $input['availability'] ?? null,
                'availability',
                7,
                fn ($d) => V::oneOf($d, self::PR_DAYS, 'day')
            );
            $active = V::oneOf($input['active'] ?? null, self::ACTIVE_YN, 'active', ['fallback' => 'Active']);

            $created = $db->execute(
                'INSERT INTO walkers(name, phone, email, role, service_areas_json, availability_json, active, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [
                    $name,
                    $phone,
                    $em,
                    $role,
                    json_encode($areas, JSON_UNESCAPED_UNICODE),
                    json_encode($avail, JSON_UNESCAPED_UNICODE),
                    $active,
                    V::now(),
                ]
            );
            return [
                '__status' => 201,
                '__body' => ['walker' => self::normalizeWalker($db->first('SELECT * FROM walkers WHERE id = ?', [$created['lastInsertRowid']]))],
            ];
        }, write: true);
    }

    public function saveWalker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM walkers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Walker not found.');
            }
            $name = V::text($input['name'] ?? null, 'name', ['max' => 100, 'label' => 'Walker name']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $em = V::email($input['email'] ?? null, 'email', ['required' => false]);
            $role = V::oneOf($input['role'] ?? null, self::WALKER_ROLES, 'role', ['fallback' => $cur['role']]);
            $areas = is_array($input['service_areas'] ?? null)
                ? V::listOf($input['service_areas'], 'service_areas', 10, fn ($a) => V::oneOf($a, self::PR_AREAS, 'service_area'))
                : V::parseJson($cur['service_areas_json'] ?? '', []);
            $avail = is_array($input['availability'] ?? null)
                ? V::listOf($input['availability'], 'availability', 7, fn ($d) => V::oneOf($d, self::PR_DAYS, 'day'))
                : V::parseJson($cur['availability_json'] ?? '', []);
            $active = V::oneOf($input['active'] ?? null, self::ACTIVE_YN, 'active', ['fallback' => $cur['active']]);

            $db->execute(
                'UPDATE walkers SET name = ?, phone = ?, email = ?, role = ?, service_areas_json = ?, availability_json = ?, active = ? WHERE id = ?',
                [
                    $name,
                    $phone,
                    $em,
                    $role,
                    json_encode($areas, JSON_UNESCAPED_UNICODE),
                    json_encode($avail, JSON_UNESCAPED_UNICODE),
                    $active,
                    $id,
                ]
            );
            return ['walker' => self::normalizeWalker($db->first('SELECT * FROM walkers WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteWalker(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireManagerAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM walkers WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Walker not found.');
            }
            $linked = $db->first('SELECT COUNT(*) AS c FROM walks WHERE walker_id = ?', [$id]);
            if ($linked && (int) $linked['c'] > 0) {
                HttpException::fail(409, 'walker_has_walks', 'Reassign walks before removing this walker.');
            }
            $db->execute('UPDATE incidents SET reported_by_id = NULL WHERE reported_by_id = ?', [$id]);
            $db->execute('DELETE FROM walkers WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Daily Walks & Visits Run-Sheet ----

    /** @return array<string, mixed>|null */
    private static function hydrateWalk(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT w.*, p.name AS pet_name, p.species, p.breed, p.size, p.temperament_json, p.medical_notes, p.feeding_instructions, p.vet_contact, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, c.access_instructions, c.preferred_contact, wk.name AS walker_name FROM walks w LEFT JOIN pets p ON p.id = w.pet_id LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN walkers wk ON wk.id = w.walker_id WHERE w.id = ?',
            [$id]
        );
        return self::normalizeWalk($row);
    }

    public function listWalks(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $walkDay = V::day($input['day'] ?? null, 'day', ['required' => false, 'fallback' => '']);
            $walkerId = V::int($input['walker_id'] ?? null, 'walker_id', ['required' => false, 'min' => 1]);
            $sql = 'SELECT w.*, p.name AS pet_name, p.species, p.breed, p.size, p.temperament_json, p.medical_notes, p.feeding_instructions, p.vet_contact, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, c.access_instructions, c.preferred_contact, wk.name AS walker_name FROM walks w LEFT JOIN pets p ON p.id = w.pet_id LEFT JOIN clients c ON c.id = w.client_id LEFT JOIN walkers wk ON wk.id = w.walker_id WHERE 1=1';
            $params = [];
            if ($walkDay !== '') {
                $sql .= ' AND w.walk_date = ?';
                $params[] = $walkDay;
            }
            if ($walkerId !== null) {
                $sql .= ' AND w.walker_id = ?';
                $params[] = $walkerId;
            }
            $sql .= ' ORDER BY w.walk_date ASC, w.walk_time ASC, w.id ASC LIMIT 160';
            $rows = array_map([self::class, 'normalizeWalk'], $db->query($sql, $params));
            return ['walks' => $rows];
        });
    }

    public function addWalk(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $petId = V::rowId($input['pet_id'] ?? null, 'pet_id');
            $pet = $db->first('SELECT * FROM pets WHERE id = ?', [$petId]);
            if (!$pet) {
                HttpException::fail(404, 'pet_not_found', 'Selected pet not found.');
            }
            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1]) ?? (int) $pet['owner_id'];
            $walkerId = V::rowId($input['walker_id'] ?? null, 'walker_id');
            if (!$db->first('SELECT id FROM walkers WHERE id = ?', [$walkerId])) {
                HttpException::fail(404, 'walker_not_found', 'Selected walker not found.');
            }
            $svc = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => 'Solo Walk']);
            $wDate = V::day($input['walk_date'] ?? null, 'walk_date', ['label' => 'Scheduled date']);
            $wTime = V::timeStr($input['walk_time'] ?? null, 'walk_time', ['label' => 'Scheduled time']);
            $dur = V::oneOf($input['duration'] ?? null, self::DURATIONS, 'duration', ['fallback' => '45 minutes']);
            $status = V::oneOf($input['status'] ?? null, self::WALK_STATUSES, 'status', ['fallback' => 'Scheduled']);
            $weather = V::oneOf($input['weather'] ?? null, self::WEATHERS, 'weather', ['fallback' => 'Sunny']);
            $notes = V::text($input['walk_notes'] ?? null, 'walk_notes', ['required' => false, 'max' => 1000]);
            $charge = V::moneyCents($input['charge_amount'] ?? null, 'charge_amount', ['required' => false, 'min' => 0, 'max' => 1000000, 'fallback' => 4500]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO walks(pet_id, client_id, walker_id, service_type, walk_date, walk_time, duration, status, weather, walk_notes, charge_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$petId, $clientId, $walkerId, $svc, $wDate, $wTime, $dur, $status, $weather, $notes, $charge, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => [
                    'walk' => self::hydrateWalk($db, $created['lastInsertRowid']),
                    'counts' => WorkspaceController::readCounts($db, $wDate),
                ],
            ];
        }, write: true);
    }

    public function saveWalk(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM walks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Walk or visit not found.');
            }
            $petId = V::rowId(($input['pet_id'] ?? null) ?: $cur['pet_id'], 'pet_id');
            $pet = $db->first('SELECT * FROM pets WHERE id = ?', [$petId]);
            if (!$pet) {
                HttpException::fail(404, 'pet_not_found', 'Selected pet not found.');
            }
            $walkerId = V::rowId(($input['walker_id'] ?? null) ?: $cur['walker_id'], 'walker_id');
            if (!$db->first('SELECT id FROM walkers WHERE id = ?', [$walkerId])) {
                HttpException::fail(404, 'walker_not_found', 'Selected walker not found.');
            }
            $svc = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => $cur['service_type']]);
            $wDate = V::day($input['walk_date'] ?? null, 'walk_date', ['required' => false, 'fallback' => (string) $cur['walk_date']]);
            $wTime = V::timeStr($input['walk_time'] ?? null, 'walk_time', ['required' => false, 'fallback' => (string) $cur['walk_time']]);
            $dur = V::oneOf($input['duration'] ?? null, self::DURATIONS, 'duration', ['fallback' => $cur['duration']]);
            $status = V::oneOf($input['status'] ?? null, self::WALK_STATUSES, 'status', ['fallback' => $cur['status']]);
            $weather = V::oneOf($input['weather'] ?? null, self::WEATHERS, 'weather', ['fallback' => $cur['weather']]);
            $notes = V::text($input['walk_notes'] ?? null, 'walk_notes', ['required' => false, 'max' => 1000]);
            $charge = (array_key_exists('charge_amount', $input) && $input['charge_amount'] !== null && $input['charge_amount'] !== '')
                ? V::moneyCents($input['charge_amount'], 'charge_amount', ['min' => 0, 'max' => 1000000])
                : (int) $cur['charge_cents'];

            $db->execute(
                'UPDATE walks SET pet_id = ?, client_id = ?, walker_id = ?, service_type = ?, walk_date = ?, walk_time = ?, duration = ?, status = ?, weather = ?, walk_notes = ?, charge_cents = ?, updated_at = ? WHERE id = ?',
                [$petId, (int) $pet['owner_id'], $walkerId, $svc, $wDate, $wTime, $dur, $status, $weather, $notes, $charge, V::now(), $id]
            );
            return [
                'walk' => self::hydrateWalk($db, $id),
                'counts' => WorkspaceController::readCounts($db, $wDate),
            ];
        }, write: true);
    }

    public function setWalkStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM walks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Walk not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::WALK_STATUSES, 'status');
            $weather = !empty($input['weather'])
                ? V::oneOf($input['weather'], self::WEATHERS, 'weather')
                : (string) $cur['weather'];
            $notes = array_key_exists('walk_notes', $input)
                ? V::text($input['walk_notes'], 'walk_notes', ['required' => false, 'max' => 1000])
                : (string) $cur['walk_notes'];

            $db->execute(
                'UPDATE walks SET status = ?, weather = ?, walk_notes = ?, updated_at = ? WHERE id = ?',
                [$status, $weather, $notes, V::now(), $id]
            );
            return [
                'walk' => self::hydrateWalk($db, $id),
                'counts' => WorkspaceController::readCounts($db, (string) $cur['walk_date']),
            ];
        }, write: true);
    }

    public function deleteWalk(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM walks WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Walk not found.');
            }
            $db->execute('UPDATE incidents SET walk_id = NULL WHERE walk_id = ?', [$id]);
            $db->execute('DELETE FROM walks WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Incidents & Care Notes ----

    /** @return array<string, mixed>|null */
    private static function hydrateIncident(Database $db, int $id): ?array
    {
        $row = $db->first(
            'SELECT i.*, p.name AS pet_name, p.breed, c.name AS owner_name, c.phone AS owner_phone, w.walk_date, w.service_type, wk.name AS reported_by_name FROM incidents i LEFT JOIN pets p ON p.id = i.pet_id LEFT JOIN clients c ON c.id = p.owner_id LEFT JOIN walks w ON w.id = i.walk_id LEFT JOIN walkers wk ON wk.id = i.reported_by_id WHERE i.id = ?',
            [$id]
        );
        return self::normalizeIncident($row);
    }

    public function listIncidents(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me): array {
            Context::requireTeamAccess($db, $me);
            $rows = array_map(
                [self::class, 'normalizeIncident'],
                $db->query(
                    "SELECT i.*, p.name AS pet_name, p.breed, c.name AS owner_name, c.phone AS owner_phone, w.walk_date, w.service_type, wk.name AS reported_by_name FROM incidents i LEFT JOIN pets p ON p.id = i.pet_id LEFT JOIN clients c ON c.id = p.owner_id LEFT JOIN walks w ON w.id = i.walk_id LEFT JOIN walkers wk ON wk.id = i.reported_by_id ORDER BY CASE i.follow_up WHEN 'Yes' THEN 0 ELSE 1 END, CASE i.severity WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, i.created_at DESC LIMIT 120"
                )
            );
            return ['incidents' => $rows];
        });
    }

    public function addIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $petId = V::rowId($input['pet_id'] ?? null, 'pet_id');
            if (!$db->first('SELECT id FROM pets WHERE id = ?', [$petId])) {
                HttpException::fail(404, 'pet_not_found', 'Selected pet not found.');
            }
            $walkId = V::int($input['walk_id'] ?? null, 'walk_id', ['required' => false, 'min' => 1]);
            $repId = V::int($input['reported_by_id'] ?? null, 'reported_by_id', ['required' => false, 'min' => 1]);
            $itype = V::oneOf($input['incident_type'] ?? null, self::INCIDENT_TYPES, 'incident_type', ['fallback' => 'Owner note']);
            $sev = V::oneOf($input['severity'] ?? null, self::INCIDENT_SEVS, 'severity', ['fallback' => 'Medium']);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $action = V::text($input['action_taken'] ?? null, 'action_taken', ['required' => false, 'max' => 1200]);
            $followUp = V::oneOf(
                $input['follow_up'] ?? null,
                self::YES_NO,
                'follow_up',
                ['fallback' => ($sev === 'High' || $sev === 'Urgent') ? 'Yes' : 'No']
            );
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO incidents(pet_id, walk_id, reported_by_id, incident_type, severity, description, action_taken, follow_up, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$petId, $walkId, $repId, $itype, $sev, $desc, $action, $followUp, $ts, $ts]
            );
            return [
                '__status' => 201,
                '__body' => ['incident' => self::hydrateIncident($db, $created['lastInsertRowid'])],
            ];
        }, write: true);
    }

    public function saveIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $itype = V::oneOf($input['incident_type'] ?? null, self::INCIDENT_TYPES, 'incident_type', ['fallback' => $cur['incident_type']]);
            $sev = V::oneOf($input['severity'] ?? null, self::INCIDENT_SEVS, 'severity', ['fallback' => $cur['severity']]);
            $desc = V::text($input['description'] ?? null, 'description', ['max' => 1200, 'label' => 'Description']);
            $action = V::text($input['action_taken'] ?? null, 'action_taken', ['required' => false, 'max' => 1200]);
            $followUp = V::oneOf($input['follow_up'] ?? null, self::YES_NO, 'follow_up', ['fallback' => $cur['follow_up']]);

            $db->execute(
                'UPDATE incidents SET incident_type = ?, severity = ?, description = ?, action_taken = ?, follow_up = ?, updated_at = ? WHERE id = ?',
                [$itype, $sev, $desc, $action, $followUp, V::now(), $id]
            );
            return ['incident' => self::hydrateIncident($db, $id)];
        }, write: true);
    }

    public function toggleIncidentFollowUp(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $nextVal = !empty($input['follow_up'])
                ? V::oneOf($input['follow_up'], self::YES_NO, 'follow_up')
                : ($cur['follow_up'] === 'Yes' ? 'No' : 'Yes');

            $db->execute('UPDATE incidents SET follow_up = ?, updated_at = ? WHERE id = ?', [$nextVal, V::now(), $id]);
            return ['incident' => self::hydrateIncident($db, $id)];
        }, write: true);
    }

    public function deleteIncident(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM incidents WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Incident not found.');
            }
            $db->execute('DELETE FROM incidents WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }
}
