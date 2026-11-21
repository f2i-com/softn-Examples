CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Bistro Verve',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Floor Service & Kitchen Pass',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'burgundy',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'server',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brigade_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Server',
  station TEXT NOT NULL DEFAULT 'Main',
  phone TEXT NOT NULL DEFAULT '',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'Main',
  capacity INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'Available',
  server_id INTEGER,
  server_name TEXT NOT NULL DEFAULT '',
  current_guest TEXT NOT NULL DEFAULT '',
  current_party_size INTEGER NOT NULL DEFAULT 0,
  current_reservation_id INTEGER,
  seated_at INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  res_date TEXT NOT NULL,
  res_time TEXT NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  table_pref TEXT NOT NULL DEFAULT 'No preference',
  status TEXT NOT NULL DEFAULT 'Booked',
  assigned_table_id INTEGER,
  assigned_table_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER,
  table_number TEXT NOT NULL DEFAULT '',
  course TEXT NOT NULL DEFAULT 'Mains',
  items TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Fire',
  priority TEXT NOT NULL DEFAULT 'Normal',
  allergy_notes TEXT NOT NULL DEFAULT '',
  server_id INTEGER,
  server_name TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prep_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prep_item TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'Hot',
  quantity_needed REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'portions',
  due_by TEXT NOT NULL DEFAULT '16:30',
  status TEXT NOT NULL DEFAULT 'Not started',
  assigned_to_id INTEGER,
  assigned_to_name TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  close_date TEXT NOT NULL,
  covers_served INTEGER NOT NULL DEFAULT 0,
  sales_cents INTEGER NOT NULL DEFAULT 0,
  voids_comps_cents INTEGER NOT NULL DEFAULT 0,
  incidents TEXT NOT NULL DEFAULT '',
  cleaning_json TEXT NOT NULL DEFAULT '[]',
  manager_signoff TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pm_tables_section ON dining_tables(section, status);
CREATE INDEX IF NOT EXISTS idx_pm_res_date ON reservations(res_date, res_time);
CREATE INDEX IF NOT EXISTS idx_pm_tickets_status ON kitchen_tickets(status, course);
CREATE INDEX IF NOT EXISTS idx_pm_prep_station ON prep_items(station, status);
