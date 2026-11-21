CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'CleanShift Cleaning Co.',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Residential & Commercial Cleaning',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'aqua',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cleaner',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'Residential',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  access_instructions TEXT NOT NULL DEFAULT '',
  billing_status TEXT NOT NULL DEFAULT 'Up to date',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaning_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  lead_cleaner TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT '',
  service_areas_json TEXT NOT NULL DEFAULT '[]',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaning_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Regular clean',
  scheduled_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  duration_hours REAL NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  price_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  checklist_json TEXT NOT NULL DEFAULT '[]',
  rating INTEGER NOT NULL DEFAULT 5,
  issues_found TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT 'No',
  checked_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaning_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_item TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Chemicals',
  current_stock REAL NOT NULL DEFAULT 0,
  reorder_point REAL NOT NULL DEFAULT 5,
  unit TEXT NOT NULL DEFAULT 'bottles',
  supplier TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OK',
  is_sample INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS client_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  job_id INTEGER,
  issue_type TEXT NOT NULL DEFAULT 'Missed item',
  severity TEXT NOT NULL DEFAULT 'Medium',
  description TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cs_jobs_date ON cleaning_jobs(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_cs_jobs_team ON cleaning_jobs(team_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cs_qc_job ON quality_checks(job_id);
CREATE INDEX IF NOT EXISTS idx_cs_issues_status ON client_issues(status, severity);
