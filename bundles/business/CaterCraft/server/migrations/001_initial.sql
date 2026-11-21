-- CaterCraft initial SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Olive & Linen Catering',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Bespoke Event & Corporate Catering',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'sage',
  job_seq INTEGER NOT NULL DEFAULT 200,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'kitchen_lead',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Lunch',
  price_per_person_cents INTEGER NOT NULL DEFAULT 0,
  min_guests INTEGER NOT NULL DEFAULT 10,
  dietary_support_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  active_status TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS catering_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_number TEXT NOT NULL,
  client_id INTEGER,
  client_name TEXT NOT NULL DEFAULT '',
  organisation TEXT NOT NULL DEFAULT '',
  package_id INTEGER,
  package_name TEXT NOT NULL DEFAULT '',
  price_per_person_cents INTEGER NOT NULL DEFAULT 0,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  delivery_time TEXT NOT NULL DEFAULT '12:00',
  guest_count INTEGER NOT NULL DEFAULT 20,
  service_type TEXT NOT NULL DEFAULT 'Drop-off',
  venue_address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Enquiry',
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS production_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  event_name TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  task TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'Hot Kitchen',
  due_date TEXT NOT NULL DEFAULT '',
  due_time TEXT NOT NULL DEFAULT '10:00',
  assigned_to TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Not started',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  event_name TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  venue_address TEXT NOT NULL DEFAULT '',
  driver TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT '',
  pickup_time TEXT NOT NULL DEFAULT '10:30',
  delivery_time TEXT NOT NULL DEFAULT '11:30',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  delivery_notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dietary_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  event_name TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  requirement_type TEXT NOT NULL DEFAULT 'Vegan',
  guest_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  kitchen_confirmed TEXT NOT NULL DEFAULT 'Pending',
  confirmed_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cc_jobs_status ON catering_jobs(status, event_date);
CREATE INDEX IF NOT EXISTS idx_cc_tasks_station ON production_tasks(station, status, due_date);
CREATE INDEX IF NOT EXISTS idx_cc_runs_status ON delivery_runs(status, event_date);
CREATE INDEX IF NOT EXISTS idx_cc_diet_job ON dietary_requirements(job_id, kitchen_confirmed);
