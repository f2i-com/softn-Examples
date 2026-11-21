CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'BlueLine Plumbing & Gas',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '24/7 Plumbing & Field Service',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'trade-blue',
  hourly_rate_cents INTEGER NOT NULL DEFAULT 12500,
  callout_fee_cents INTEGER NOT NULL DEFAULT 8500,
  job_seq INTEGER NOT NULL DEFAULT 1000,
  invoice_seq INTEGER NOT NULL DEFAULT 1000,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'technician',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'Residential',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_number TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Repair',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  priority TEXT NOT NULL DEFAULT 'Normal',
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '',
  assigned_tech TEXT NOT NULL DEFAULT '',
  site_address TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_cents INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  technician_name TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  hours_on_site REAL NOT NULL DEFAULT 0,
  work_performed TEXT NOT NULL,
  materials_used TEXT NOT NULL DEFAULT '',
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS parts_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  supplier TEXT NOT NULL DEFAULT '',
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Requested',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  labour_hours REAL NOT NULL DEFAULT 0,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 12500,
  labour_cents INTEGER NOT NULL DEFAULT 0,
  parts_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 10,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_date ON jobs(status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_job ON site_visits(job_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_parts_job_status ON parts_requests(job_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, issue_date);
