-- AgriLog initial SQLite schema
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Greenridge Farm',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Paddocks, Harvest & Compliance',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'forest',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'farm_hand',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paddocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_name TEXT NOT NULL,
  crop TEXT NOT NULL DEFAULT '',
  area_ha REAL NOT NULL DEFAULT 0,
  soil_notes TEXT NOT NULL DEFAULT '',
  irrigation TEXT NOT NULL DEFAULT 'Dryland',
  status TEXT NOT NULL DEFAULT 'In crop',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS farm_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paddock_id INTEGER,
  job_type TEXT NOT NULL DEFAULT 'Planting',
  scheduled_date TEXT NOT NULL,
  completed_date TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Planned',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS harvest_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paddock_id INTEGER,
  harvest_date TEXT NOT NULL,
  crop TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Tonnes',
  grade TEXT NOT NULL DEFAULT 'Grade 1',
  buyer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chemical_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paddock_id INTEGER,
  product_used TEXT NOT NULL,
  rate TEXT NOT NULL DEFAULT '',
  application_date TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT '',
  weather TEXT NOT NULL DEFAULT '',
  whp_end TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS machinery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_name TEXT NOT NULL,
  machine_type TEXT NOT NULL DEFAULT 'Tractor',
  service_due TEXT NOT NULL DEFAULT '',
  hours REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Running',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL,
  log_date TEXT NOT NULL,
  maintenance_type TEXT NOT NULL DEFAULT 'Scheduled service',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_date ON farm_jobs(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_chem_whp ON chemical_applications(paddock_id, whp_end);
CREATE INDEX IF NOT EXISTS idx_harvest_date ON harvest_logs(harvest_date);
CREATE INDEX IF NOT EXISTS idx_maint_machine ON maintenance_logs(machine_id, log_date);
