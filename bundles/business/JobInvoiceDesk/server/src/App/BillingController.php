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

final class BillingController
{
    private const CLIENT_TYPES = ['Residential', 'Commercial', 'Government', 'Non-Profit'];
    private const SERVICE_TYPES = ['Consulting', 'Installation', 'Repair / Maintenance', 'Design', 'Support', 'Other'];
    private const JOB_STAGES = ['Lead', 'Quoted', 'In Progress', 'Completed', 'Invoiced'];
    private const QUOTE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];
    private const PAY_METHODS = ['Card', 'Bank Transfer', 'Cash', 'Cheque', 'Other'];

    /** @return array<string, mixed>|null */
    private static function normalizeClient(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'is_sample', 'created_at', 'updated_at', 'job_count', 'billed_cents', 'paid_cents', 'owed_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeJob(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'client_id', 'estimated_cents', 'is_sample', 'created_at', 'updated_at', 'quote_count', 'invoice_count'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function normalizeQuote(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'job_id', 'client_id', 'subtotal_cents', 'tax_cents', 'total_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        if (array_key_exists('converted_invoice_id', $row)) {
            $row['converted_invoice_id'] = $row['converted_invoice_id'] === null ? null : (int) $row['converted_invoice_id'];
        }
        return $row;
    }

    /** @return array<string, mixed>|null */
    private static function hydrateInvoice(?array $inv, string $todayDay): ?array
    {
        if ($inv === null) {
            return null;
        }
        foreach (['id', 'client_id', 'subtotal_cents', 'tax_cents', 'amount_cents', 'amount_paid_cents', 'is_sample', 'created_at', 'updated_at'] as $col) {
            if (array_key_exists($col, $inv) && $inv[$col] !== null) {
                $inv[$col] = (int) $inv[$col];
            }
        }
        foreach (['job_id', 'quote_id'] as $optInt) {
            if (array_key_exists($optInt, $inv)) {
                $inv[$optInt] = $inv[$optInt] === null ? null : (int) $inv[$optInt];
            }
        }
        $amountCents = (int) ($inv['amount_cents'] ?? 0);
        $paidCents = (int) ($inv['amount_paid_cents'] ?? 0);
        $dueDate = (string) ($inv['due_date'] ?? '');
        $inv['status'] = WorkspaceController::computeInvoiceStatus($amountCents, $paidCents, $dueDate, $todayDay);
        $inv['balance_cents'] = max(0, $amountCents - $paidCents);
        return $inv;
    }

    /** @return array<string, mixed>|null */
    private static function normalizePayment(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }
        foreach (['id', 'invoice_id', 'amount_cents', 'is_sample', 'created_at', 'invoice_amount_cents', 'invoice_paid_cents'] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = (int) $row[$col];
            }
        }
        return $row;
    }

    // ---- Billing Desk Today ----

    public function getBillingDesk(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $monthPrefix = substr($todayDay, 0, 7);

            $allInvs = $db->query(
                'SELECT i.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.phone AS client_phone, j.title AS job_title ' .
                'FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN jobs j ON j.id = i.job_id ' .
                'ORDER BY i.due_date ASC, i.id DESC'
            );

            $totalOwedCents = 0;
            $overdueCents = 0;
            $overdueQueue = [];
            $dueSoon = [];
            foreach ($allInvs as $rawInv) {
                $inv = self::hydrateInvoice($rawInv, $todayDay);
                if ($inv['balance_cents'] > 0) {
                    $totalOwedCents += $inv['balance_cents'];
                    if (!empty($inv['due_date']) && $inv['due_date'] < $todayDay) {
                        $overdueCents += $inv['balance_cents'];
                        $overdueQueue[] = $inv;
                    } else {
                        $dueSoon[] = $inv;
                    }
                }
            }

            $monthPaid = $db->first(
                'SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS cnt FROM payments WHERE payment_date LIKE ?',
                [$monthPrefix . '%']
            );

            $awaitingQuotes = array_map(
                [self::class, 'normalizeQuote'],
                $db->query(
                    'SELECT q.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, j.title AS job_title ' .
                    'FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN jobs j ON j.id = q.job_id ' .
                    "WHERE q.status IN ('Draft', 'Sent', 'Accepted') AND q.converted_invoice_id IS NULL ORDER BY q.created_at DESC LIMIT 20"
                )
            );

            $activeJobs = array_map(
                [self::class, 'normalizeJob'],
                $db->query(
                    'SELECT j.*, c.business_name AS client_name ' .
                    'FROM jobs j LEFT JOIN clients c ON c.id = j.client_id ' .
                    "WHERE j.status IN ('Lead', 'Quoted', 'In Progress', 'Completed') ORDER BY j.updated_at DESC LIMIT 20"
                )
            );

            $pipelineValue = 0;
            foreach ($activeJobs as $job) {
                $pipelineValue += (int) ($job['estimated_cents'] ?? 0);
            }

            return [
                'today' => $todayDay,
                'summary' => [
                    'totalOwedCents' => $totalOwedCents,
                    'overdueCents' => $overdueCents,
                    'overdueCount' => count($overdueQueue),
                    'awaitingQuotesCount' => count($awaitingQuotes),
                    'activeJobsCount' => count($activeJobs),
                    'pipelineCents' => $pipelineValue,
                    'collectedMonthCents' => $monthPaid ? (int) $monthPaid['total'] : 0,
                    'paymentsMonthCount' => $monthPaid ? (int) $monthPaid['cnt'] : 0,
                ],
                'overdueQueue' => $overdueQueue,
                'dueSoon' => array_slice($dueSoon, 0, 8),
                'awaitingQuotes' => $awaitingQuotes,
                'activeJobs' => $activeJobs,
            ];
        });
    }

    // ---- Clients Directory ----

    public function listClients(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $q = V::text($input['q'] ?? null, 'q', ['required' => false, 'max' => 120]);
            $clientType = V::text($input['client_type'] ?? null, 'client_type', ['required' => false, 'max' => 40]);
            $sql =
                'SELECT c.*, ' .
                '(SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id) AS job_count, ' .
                '(SELECT COALESCE(SUM(i.amount_cents), 0) FROM invoices i WHERE i.client_id = c.id) AS billed_cents, ' .
                '(SELECT COALESCE(SUM(i.amount_paid_cents), 0) FROM invoices i WHERE i.client_id = c.id) AS paid_cents ' .
                'FROM clients c WHERE 1=1';
            $params = [];
            if ($clientType !== '' && $clientType !== 'All') {
                $sql .= ' AND c.client_type = ?';
                $params[] = $clientType;
            }
            if ($q !== '') {
                $pat = V::likeTerm($q);
                $sql .= " AND (c.business_name LIKE ? ESCAPE '\\' OR c.contact_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\')";
                $params[] = $pat;
                $params[] = $pat;
                $params[] = $pat;
            }
            $sql .= ' ORDER BY c.business_name ASC';
            $rows = $db->query($sql, $params);
            foreach ($rows as &$row) {
                $row = self::normalizeClient($row);
                $row['owed_cents'] = max(0, (int) ($row['billed_cents'] ?? 0) - (int) ($row['paid_cents'] ?? 0));
            }
            unset($row);
            return ['clients' => $rows];
        });
    }

    public function addClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $biz = V::text($input['business_name'] ?? null, 'business_name', ['max' => 140, 'label' => 'Business / client name']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['max' => 100, 'label' => 'Primary contact']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true, 'label' => 'Email address']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $addr = V::text($input['billing_address'] ?? null, 'billing_address', ['required' => false, 'max' => 300]);
            $ctype = V::oneOf($input['client_type'] ?? null, self::CLIENT_TYPES, 'client_type', ['fallback' => 'Commercial']);
            $since = V::day($input['client_since'] ?? null, 'client_since', ['required' => false, 'fallback' => V::utcDay(0)]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO clients(business_name, contact_name, email, phone, billing_address, client_type, client_since, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$biz, $contact, $em, $phone, $addr, $ctype, $since, $notes, $ts, $ts]
            );
            $row = self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$created['lastInsertRowid']]));
            $row['billed_cents'] = 0;
            $row['paid_cents'] = 0;
            $row['owed_cents'] = 0;
            $row['job_count'] = 0;
            return ['__status' => 201, '__body' => ['client' => $row]];
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
            $biz = V::text($input['business_name'] ?? null, 'business_name', ['max' => 140, 'label' => 'Business / client name']);
            $contact = V::text($input['contact_name'] ?? null, 'contact_name', ['max' => 100, 'label' => 'Primary contact']);
            $em = V::email($input['email'] ?? null, 'email', ['required' => true, 'label' => 'Email address']);
            $phone = V::text($input['phone'] ?? null, 'phone', ['required' => false, 'max' => 40]);
            $addr = V::text($input['billing_address'] ?? null, 'billing_address', ['required' => false, 'max' => 300]);
            $ctype = V::oneOf($input['client_type'] ?? null, self::CLIENT_TYPES, 'client_type', ['fallback' => $cur['client_type']]);
            $since = V::day($input['client_since'] ?? null, 'client_since', ['required' => false, 'fallback' => (string) $cur['client_since']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 800]);
            $db->execute(
                'UPDATE clients SET business_name = ?, contact_name = ?, email = ?, phone = ?, billing_address = ?, client_type = ?, client_since = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$biz, $contact, $em, $phone, $addr, $ctype, $since, $notes, V::now(), $id]
            );
            return ['client' => self::normalizeClient($db->first('SELECT * FROM clients WHERE id = ?', [$id]))];
        }, write: true);
    }

    public function deleteClient(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM clients WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Client not found.');
            }
            $invs = $db->first('SELECT COUNT(*) AS c FROM invoices WHERE client_id = ?', [$id]);
            if ($invs && (int) $invs['c'] > 0) {
                HttpException::fail(409, 'client_has_invoices', 'Cannot delete a client with existing invoices.');
            }
            $db->execute('DELETE FROM quotes WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM jobs WHERE client_id = ?', [$id]);
            $db->execute('DELETE FROM clients WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Jobs Pipeline ----

    public function listJobs(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $stage = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 40]);
            $clientId = V::int($input['client_id'] ?? null, 'client_id', ['required' => false, 'min' => 1]);
            $sql =
                'SELECT j.*, c.business_name AS client_name, c.contact_name AS client_contact, ' .
                '(SELECT COUNT(*) FROM quotes q WHERE q.job_id = j.id) AS quote_count, ' .
                '(SELECT COUNT(*) FROM invoices i WHERE i.job_id = j.id) AS invoice_count ' .
                'FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE 1=1';
            $params = [];
            if ($stage !== '' && $stage !== 'All') {
                $sql .= ' AND j.status = ?';
                $params[] = $stage;
            }
            if ($clientId !== null) {
                $sql .= ' AND j.client_id = ?';
                $params[] = $clientId;
            }
            $sql .= ' ORDER BY j.updated_at DESC, j.id DESC';
            $rows = array_map([self::class, 'normalizeJob'], $db->query($sql, $params));
            return ['jobs' => $rows];
        });
    }

    public function addJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = $db->first('SELECT id FROM clients WHERE id = ?', [$clientId]);
            if (!$client) {
                HttpException::fail(404, 'client_not_found', 'Select a valid client.');
            }
            $title = V::text($input['title'] ?? null, 'title', ['max' => 160, 'label' => 'Job title']);
            $serviceType = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => 'Consulting']);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STAGES, 'status', ['fallback' => 'Lead']);
            $startDate = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $estCents = V::moneyCents($input['estimated_value'] ?? null, 'estimated_value', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO jobs(client_id, title, service_type, status, start_date, description, estimated_cents, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
                [$clientId, $title, $serviceType, $status, $startDate, $desc, $estCents, $ts, $ts]
            );
            $row = self::normalizeJob($db->first(
                'SELECT j.*, c.business_name AS client_name FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['job' => $row]];
        }, write: true);
    }

    public function saveJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $clientId = !empty($input['client_id']) ? V::rowId($input['client_id'], 'client_id') : (int) $cur['client_id'];
            $client = $db->first('SELECT id FROM clients WHERE id = ?', [$clientId]);
            if (!$client) {
                HttpException::fail(404, 'client_not_found', 'Client not found.');
            }
            $title = V::text($input['title'] ?? null, 'title', ['max' => 160, 'label' => 'Job title']);
            $serviceType = V::oneOf($input['service_type'] ?? null, self::SERVICE_TYPES, 'service_type', ['fallback' => $cur['service_type']]);
            $status = V::oneOf($input['status'] ?? null, self::JOB_STAGES, 'status', ['fallback' => $cur['status']]);
            $startDate = V::day($input['start_date'] ?? null, 'start_date', ['required' => false, 'fallback' => (string) $cur['start_date']]);
            $desc = V::text($input['description'] ?? null, 'description', ['required' => false, 'max' => 1200]);
            $estCents = array_key_exists('estimated_value', $input)
                ? V::moneyCents($input['estimated_value'], 'estimated_value', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                : (int) $cur['estimated_cents'];

            $db->execute(
                'UPDATE jobs SET client_id = ?, title = ?, service_type = ?, status = ?, start_date = ?, description = ?, estimated_cents = ?, updated_at = ? WHERE id = ?',
                [$clientId, $title, $serviceType, $status, $startDate, $desc, $estCents, V::now(), $id]
            );
            $row = self::normalizeJob($db->first(
                'SELECT j.*, c.business_name AS client_name FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = ?',
                [$id]
            ));
            return ['job' => $row];
        }, write: true);
    }

    public function setJobStage(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            if (!empty($input['status'])) {
                $nextStage = V::oneOf($input['status'], self::JOB_STAGES, 'status');
            } else {
                $idx = array_search($cur['status'], self::JOB_STAGES, true);
                $nextIdx = min(($idx === false ? 0 : $idx) + 1, count(self::JOB_STAGES) - 1);
                $nextStage = self::JOB_STAGES[$nextIdx];
            }
            $db->execute('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?', [$nextStage, V::now(), $id]);
            $row = self::normalizeJob($db->first(
                'SELECT j.*, c.business_name AS client_name FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = ?',
                [$id]
            ));
            return ['job' => $row];
        }, write: true);
    }

    public function deleteJob(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM jobs WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Job not found.');
            }
            $db->execute('DELETE FROM quotes WHERE job_id = ?', [$id]);
            $db->execute('UPDATE invoices SET job_id = NULL WHERE job_id = ?', [$id]);
            $db->execute('DELETE FROM jobs WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Quotes Workbench ----

    public function listQuotes(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $status = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $sql =
                'SELECT q.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.billing_address AS client_address, ' .
                'j.title AS job_title, j.service_type AS job_service, inv.invoice_number AS converted_invoice_number ' .
                'FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN jobs j ON j.id = q.job_id LEFT JOIN invoices inv ON inv.id = q.converted_invoice_id WHERE 1=1';
            $params = [];
            if ($status !== '' && $status !== 'All') {
                $sql .= ' AND q.status = ?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY q.created_at DESC, q.id DESC';
            $rows = array_map([self::class, 'normalizeQuote'], $db->query($sql, $params));
            return ['quotes' => $rows];
        });
    }

    public function addQuote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $jobId = V::rowId($input['job_id'] ?? null, 'job_id');
            $job = $db->first('SELECT * FROM jobs WHERE id = ?', [$jobId]);
            if (!$job) {
                HttpException::fail(404, 'job_not_found', 'Select a valid job.');
            }
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $validUntil = V::day($input['valid_until'] ?? null, 'valid_until', ['required' => false, 'fallback' => WorkspaceController::addDaysIso($issueDate, 30)]);
            $subtotalCents = V::moneyCents($input['subtotal'] ?? null, 'subtotal', ['min' => 0, 'max' => 1000000000, 'label' => 'Subtotal']);
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            $taxCents = (array_key_exists('tax', $input) && $input['tax'] !== '' && $input['tax'] !== null)
                ? V::moneyCents($input['tax'], 'tax', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                : (int) round($subtotalCents * $taxRate / 100.0);
            $totalCents = $subtotalCents + $taxCents;
            $status = V::oneOf($input['status'] ?? null, self::QUOTE_STATUSES, 'status', ['fallback' => 'Draft']);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $nextSeq = (int) ($ctx['settings']['quote_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET quote_seq = ? WHERE id = 1', [$nextSeq]);
            $quoteNumber = V::text($input['quote_number'] ?? null, 'quote_number', ['required' => false, 'max' => 40]) ?: ('Q-' . $nextSeq);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO quotes(job_id, client_id, quote_number, issue_date, valid_until, subtotal_cents, tax_cents, total_cents, status, notes, converted_invoice_id, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)',
                [$jobId, (int) $job['client_id'], $quoteNumber, $issueDate, $validUntil, $subtotalCents, $taxCents, $totalCents, $status, $notes, $ts, $ts]
            );

            if (($job['status'] ?? '') === 'Lead') {
                $db->execute("UPDATE jobs SET status = 'Quoted', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            }
            $row = self::normalizeQuote($db->first(
                'SELECT q.*, c.business_name AS client_name, j.title AS job_title FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN jobs j ON j.id = q.job_id WHERE q.id = ?',
                [$created['lastInsertRowid']]
            ));
            return ['__status' => 201, '__body' => ['quote' => $row]];
        }, write: true);
    }

    public function saveQuote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM quotes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Quote not found.');
            }
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => (string) $cur['issue_date']]);
            $validUntil = V::day($input['valid_until'] ?? null, 'valid_until', ['required' => false, 'fallback' => (string) $cur['valid_until']]);
            $subtotalCents = array_key_exists('subtotal', $input)
                ? V::moneyCents($input['subtotal'], 'subtotal', ['min' => 0, 'max' => 1000000000])
                : (int) $cur['subtotal_cents'];
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            $taxCents = (array_key_exists('tax', $input) && $input['tax'] !== '' && $input['tax'] !== null)
                ? V::moneyCents($input['tax'], 'tax', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                : (int) round($subtotalCents * $taxRate / 100.0);
            $totalCents = $subtotalCents + $taxCents;
            $status = V::oneOf($input['status'] ?? null, self::QUOTE_STATUSES, 'status', ['fallback' => $cur['status']]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);

            $db->execute(
                'UPDATE quotes SET issue_date = ?, valid_until = ?, subtotal_cents = ?, tax_cents = ?, total_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$issueDate, $validUntil, $subtotalCents, $taxCents, $totalCents, $status, $notes, V::now(), $id]
            );
            $row = self::normalizeQuote($db->first(
                'SELECT q.*, c.business_name AS client_name, j.title AS job_title FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN jobs j ON j.id = q.job_id WHERE q.id = ?',
                [$id]
            ));
            return ['quote' => $row];
        }, write: true);
    }

    public function setQuoteStatus(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM quotes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Quote not found.');
            }
            $status = V::oneOf($input['status'] ?? null, self::QUOTE_STATUSES, 'status');
            $ts = V::now();
            $db->execute('UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?', [$status, $ts, $id]);
            if ($status === 'Accepted') {
                $db->execute(
                    "UPDATE jobs SET status = 'In Progress', updated_at = ? WHERE id = ? AND status IN ('Lead', 'Quoted')",
                    [$ts, (int) $cur['job_id']]
                );
            }
            $row = self::normalizeQuote($db->first(
                'SELECT q.*, c.business_name AS client_name, j.title AS job_title FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN jobs j ON j.id = q.job_id WHERE q.id = ?',
                [$id]
            ));
            return ['quote' => $row];
        }, write: true);
    }

    public function convertQuoteToInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $quote = $db->first('SELECT * FROM quotes WHERE id = ?', [$id]);
            if (!$quote) {
                HttpException::fail(404, 'not_found', 'Quote not found.');
            }
            if (!empty($quote['converted_invoice_id'])) {
                $existing = $db->first('SELECT * FROM invoices WHERE id = ?', [(int) $quote['converted_invoice_id']]);
                if ($existing) {
                    HttpException::fail(409, 'already_converted', 'This quote was already converted to ' . $existing['invoice_number'] . '.');
                }
            }
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $terms = array_key_exists('payment_terms_days', $ctx['settings']) && $ctx['settings']['payment_terms_days'] !== null
                ? (int) $ctx['settings']['payment_terms_days']
                : 14;
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => WorkspaceController::addDaysIso($issueDate, $terms)]);

            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = 'INV-' . $nextSeq;
            $ts = V::now();
            $notes = ($quote['notes'] ?? '') !== '' ? (string) $quote['notes'] : ('Converted from ' . $quote['quote_number']);

            $created = $db->execute(
                "INSERT INTO invoices(job_id, client_id, quote_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, amount_cents, amount_paid_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Unpaid', ?, 0, ?, ?)",
                [
                    (int) $quote['job_id'],
                    (int) $quote['client_id'],
                    (int) $quote['id'],
                    $invNum,
                    $issueDate,
                    $dueDate,
                    (int) $quote['subtotal_cents'],
                    (int) $quote['tax_cents'],
                    (int) $quote['total_cents'],
                    $notes,
                    $ts,
                    $ts,
                ]
            );
            $invId = $created['lastInsertRowid'];

            $db->execute("UPDATE quotes SET status = 'Accepted', converted_invoice_id = ?, updated_at = ? WHERE id = ?", [$invId, $ts, (int) $quote['id']]);
            $db->execute("UPDATE jobs SET status = 'Invoiced', updated_at = ? WHERE id = ?", [$ts, (int) $quote['job_id']]);

            $inv = self::hydrateInvoice($db->first(
                'SELECT i.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.billing_address AS client_address, j.title AS job_title ' .
                'FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN jobs j ON j.id = i.job_id WHERE i.id = ?',
                [$invId]
            ), $issueDate);
            return ['__status' => 201, '__body' => ['invoice' => $inv, 'quoteId' => (int) $quote['id']]];
        }, write: true);
    }

    public function deleteQuote(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM quotes WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Quote not found.');
            }
            $db->execute('DELETE FROM quotes WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Invoices Workbench ----

    public function listInvoices(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $filter = V::text($input['status'] ?? null, 'status', ['required' => false, 'max' => 30]);
            $rows = $db->query(
                'SELECT i.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.phone AS client_phone, c.billing_address AS client_address, j.title AS job_title, j.service_type AS job_service ' .
                'FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN jobs j ON j.id = i.job_id ' .
                'ORDER BY i.created_at DESC, i.id DESC'
            );
            $out = [];
            foreach ($rows as $rawInv) {
                $inv = self::hydrateInvoice($rawInv, $todayDay);
                if ($filter === '' || $filter === 'All' || $inv['status'] === $filter) {
                    $out[] = $inv;
                }
            }
            return ['invoices' => $out];
        });
    }

    public function addInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $clientId = V::rowId($input['client_id'] ?? null, 'client_id');
            $client = $db->first('SELECT id FROM clients WHERE id = ?', [$clientId]);
            if (!$client) {
                HttpException::fail(404, 'client_not_found', 'Select a valid client.');
            }
            $jobId = V::int($input['job_id'] ?? null, 'job_id', ['required' => false, 'min' => 1]);
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $terms = array_key_exists('payment_terms_days', $ctx['settings']) && $ctx['settings']['payment_terms_days'] !== null
                ? (int) $ctx['settings']['payment_terms_days']
                : 14;
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => WorkspaceController::addDaysIso($issueDate, $terms)]);

            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);
            if (array_key_exists('subtotal', $input) && $input['subtotal'] !== '' && $input['subtotal'] !== null) {
                $subtotalCents = V::moneyCents($input['subtotal'], 'subtotal', ['min' => 1, 'max' => 1000000000, 'label' => 'Subtotal']);
                $taxCents = (array_key_exists('tax', $input) && $input['tax'] !== '' && $input['tax'] !== null)
                    ? V::moneyCents($input['tax'], 'tax', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                    : (int) round($subtotalCents * $taxRate / 100.0);
                $amountCents = $subtotalCents + $taxCents;
            } else {
                $amountCents = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 1000000000, 'label' => 'Invoice amount']);
                $taxCents = $taxRate > 0 ? (int) round($amountCents - $amountCents / (1.0 + $taxRate / 100.0)) : 0;
                $subtotalCents = $amountCents - $taxCents;
            }

            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $nextSeq = (int) ($ctx['settings']['invoice_seq'] ?? 1000) + 1;
            $db->execute('UPDATE business_settings SET invoice_seq = ? WHERE id = 1', [$nextSeq]);
            $invNum = V::text($input['invoice_number'] ?? null, 'invoice_number', ['required' => false, 'max' => 40]) ?: ('INV-' . $nextSeq);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => $issueDate]);
            $st = WorkspaceController::computeInvoiceStatus($amountCents, 0, $dueDate, $todayDay);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO invoices(job_id, client_id, quote_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, amount_cents, amount_paid_cents, status, notes, is_sample, created_at, updated_at) VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)',
                [$jobId, $clientId, $invNum, $issueDate, $dueDate, $subtotalCents, $taxCents, $amountCents, $st, $notes, $ts, $ts]
            );
            if ($jobId !== null) {
                $db->execute("UPDATE jobs SET status = 'Invoiced', updated_at = ? WHERE id = ?", [$ts, $jobId]);
            }
            $inv = self::hydrateInvoice($db->first(
                'SELECT i.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.billing_address AS client_address, j.title AS job_title ' .
                'FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN jobs j ON j.id = i.job_id WHERE i.id = ?',
                [$created['lastInsertRowid']]
            ), $todayDay);
            return ['__status' => 201, '__body' => ['invoice' => $inv]];
        }, write: true);
    }

    public function saveInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT * FROM invoices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Invoice not found.');
            }
            $issueDate = V::day($input['issue_date'] ?? null, 'issue_date', ['required' => false, 'fallback' => (string) $cur['issue_date']]);
            $dueDate = V::day($input['due_date'] ?? null, 'due_date', ['required' => false, 'fallback' => (string) $cur['due_date']]);
            $taxRate = (float) ($ctx['settings']['tax_rate'] ?? 0);

            $hasSub = array_key_exists('subtotal', $input) && $input['subtotal'] !== '' && $input['subtotal'] !== null;
            $hasTax = array_key_exists('tax', $input) && $input['tax'] !== '' && $input['tax'] !== null;
            $hasAmt = array_key_exists('amount', $input) && $input['amount'] !== '' && $input['amount'] !== null;

            $subtotalCents = $hasSub
                ? V::moneyCents($input['subtotal'], 'subtotal', ['min' => 1, 'max' => 1000000000])
                : (int) $cur['subtotal_cents'];
            $taxCents = $hasTax
                ? V::moneyCents($input['tax'], 'tax', ['required' => false, 'min' => 0, 'max' => 1000000000, 'fallback' => 0])
                : ($hasSub ? (int) round($subtotalCents * $taxRate / 100.0) : (int) $cur['tax_cents']);
            $amountCents = ($hasAmt && !$hasSub)
                ? V::moneyCents($input['amount'], 'amount', ['min' => 1, 'max' => 1000000000])
                : ($subtotalCents + $taxCents);

            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 1000]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $st = WorkspaceController::computeInvoiceStatus($amountCents, (int) $cur['amount_paid_cents'], $dueDate, $todayDay);

            $db->execute(
                'UPDATE invoices SET issue_date = ?, due_date = ?, subtotal_cents = ?, tax_cents = ?, amount_cents = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?',
                [$issueDate, $dueDate, $subtotalCents, $taxCents, $amountCents, $st, $notes, V::now(), $id]
            );
            $inv = self::hydrateInvoice($db->first(
                'SELECT i.*, c.business_name AS client_name, c.contact_name AS client_contact, c.email AS client_email, c.billing_address AS client_address, j.title AS job_title ' .
                'FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN jobs j ON j.id = i.job_id WHERE i.id = ?',
                [$id]
            ), $todayDay);
            return ['invoice' => $inv];
        }, write: true);
    }

    public function deleteInvoice(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $cur = $db->first('SELECT id FROM invoices WHERE id = ?', [$id]);
            if (!$cur) {
                HttpException::fail(404, 'not_found', 'Invoice not found.');
            }
            $db->execute('DELETE FROM payments WHERE invoice_id = ?', [$id]);
            $db->execute('UPDATE quotes SET converted_invoice_id = NULL WHERE converted_invoice_id = ?', [$id]);
            $db->execute('DELETE FROM invoices WHERE id = ?', [$id]);
            return ['deleted' => true];
        }, write: true);
    }

    // ---- Payments Ledger (Atomically updates parent invoice amount_paid_cents & status) ----

    public function listPayments(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $invoiceId = V::int($input['invoice_id'] ?? null, 'invoice_id', ['required' => false, 'min' => 1]);
            $method = V::text($input['method'] ?? null, 'method', ['required' => false, 'max' => 40]);
            $sql =
                'SELECT p.*, i.invoice_number, i.amount_cents AS invoice_amount_cents, i.amount_paid_cents AS invoice_paid_cents, c.business_name AS client_name, c.email AS client_email ' .
                'FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN clients c ON c.id = i.client_id WHERE 1=1';
            $params = [];
            if ($invoiceId !== null) {
                $sql .= ' AND p.invoice_id = ?';
                $params[] = $invoiceId;
            }
            if ($method !== '' && $method !== 'All') {
                $sql .= ' AND p.method = ?';
                $params[] = $method;
            }
            $sql .= ' ORDER BY p.payment_date DESC, p.created_at DESC';
            $rows = array_map([self::class, 'normalizePayment'], $db->query($sql, $params));
            return ['payments' => $rows];
        });
    }

    public function recordPayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            $ctx = Context::requireTeamAccess($db, $me);
            $invoiceId = V::rowId($input['invoice_id'] ?? null, 'invoice_id');
            $inv = $db->first('SELECT * FROM invoices WHERE id = ?', [$invoiceId]);
            if (!$inv) {
                HttpException::fail(404, 'invoice_not_found', 'Invoice not found.');
            }
            $amountCents = V::moneyCents($input['amount'] ?? null, 'amount', ['min' => 1, 'max' => 1000000000, 'label' => 'Payment amount']);
            $payDate = V::day($input['payment_date'] ?? null, 'payment_date', ['required' => false, 'fallback' => V::utcDay(0)]);
            $method = V::oneOf($input['method'] ?? null, self::PAY_METHODS, 'method', ['fallback' => 'Bank Transfer']);
            $ref = V::text($input['reference'] ?? null, 'reference', ['required' => false, 'max' => 100]);
            $notes = V::text($input['notes'] ?? null, 'notes', ['required' => false, 'max' => 500]);
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => $payDate]);
            $ts = V::now();

            $created = $db->execute(
                'INSERT INTO payments(invoice_id, payment_date, amount_cents, method, reference, notes, recorded_by, is_sample, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [$invoiceId, $payDate, $amountCents, $method, $ref, $notes, (string) $ctx['member']['display_name'], $ts]
            );

            $sumRow = $db->first('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE invoice_id = ?', [$invoiceId]);
            $newPaid = $sumRow ? (int) $sumRow['total'] : 0;
            $nextStatus = WorkspaceController::computeInvoiceStatus((int) $inv['amount_cents'], $newPaid, (string) $inv['due_date'], $todayDay);
            $db->execute('UPDATE invoices SET amount_paid_cents = ?, status = ?, updated_at = ? WHERE id = ?', [$newPaid, $nextStatus, $ts, $invoiceId]);

            $payment = self::normalizePayment($db->first(
                'SELECT p.*, i.invoice_number, c.business_name AS client_name FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN clients c ON c.id = i.client_id WHERE p.id = ?',
                [$created['lastInsertRowid']]
            ));
            $updatedInv = self::hydrateInvoice($db->first('SELECT * FROM invoices WHERE id = ?', [$invoiceId]), $todayDay);
            return ['__status' => 201, '__body' => ['payment' => $payment, 'invoice' => $updatedInv]];
        }, write: true);
    }

    public function deletePayment(Request $req, Response $res): Response
    {
        return AppBootstrap::handle($req, $res, function (Database $db, array $me, array $input): array {
            Context::requireTeamAccess($db, $me);
            $id = V::rowId($input['id'] ?? null);
            $pay = $db->first('SELECT * FROM payments WHERE id = ?', [$id]);
            if (!$pay) {
                HttpException::fail(404, 'not_found', 'Payment not found.');
            }
            $todayDay = V::day($input['today'] ?? null, 'today', ['required' => false, 'fallback' => V::utcDay(0)]);
            $db->execute('DELETE FROM payments WHERE id = ?', [$id]);

            $inv = $db->first('SELECT * FROM invoices WHERE id = ?', [(int) $pay['invoice_id']]);
            if ($inv) {
                $sumRow = $db->first('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE invoice_id = ?', [(int) $inv['id']]);
                $newPaid = $sumRow ? (int) $sumRow['total'] : 0;
                $nextStatus = WorkspaceController::computeInvoiceStatus((int) $inv['amount_cents'], $newPaid, (string) $inv['due_date'], $todayDay);
                $db->execute('UPDATE invoices SET amount_paid_cents = ?, status = ?, updated_at = ? WHERE id = ?', [$newPaid, $nextStatus, V::now(), (int) $inv['id']]);
            }
            return ['deleted' => true];
        }, write: true);
    }
}
