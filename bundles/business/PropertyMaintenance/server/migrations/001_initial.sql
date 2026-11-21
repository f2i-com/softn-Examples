-- Property Maintenance & Handyman Desk initial SQLite schema
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Hearthstone Property Care',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Maintenance & Handyman Operations',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'brick-terracotta',
  req_seq INTEGER NOT NULL DEFAULT 3000,
  wo_seq INTEGER NOT NULL DEFAULT 4000,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'handyman',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'House',
  owner_manager TEXT NOT NULL,
  manager_phone TEXT NOT NULL DEFAULT '',
  access_notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  lease_start TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  tenant_id INTEGER,
  category TEXT NOT NULL DEFAULT 'Plumbing',
  priority TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'New',
  description TEXT NOT NULL,
  reported_date TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_number TEXT NOT NULL,
  request_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  assigned_to TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  work_done TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  inspection_type TEXT NOT NULL DEFAULT 'Routine',
  inspection_date TEXT NOT NULL,
  condition_rating INTEGER NOT NULL DEFAULT 4,
  inspector TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_prop ON tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_req_status ON maintenance_requests(status, priority);
CREATE INDEX IF NOT EXISTS idx_wo_req ON work_orders(request_id);
CREATE INDEX IF NOT EXISTS idx_wo_date ON work_orders(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_insp_prop ON inspections(property_id, inspection_date);
