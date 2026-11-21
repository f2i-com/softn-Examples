-- StayReady initial SQLite schema (FormLogic private-sqlite, no triggers/views/PRAGMAs/clock/random)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'StayReady Host Co.',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Short-Stay & Airbnb Turnovers',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'coastal',
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

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL DEFAULT 'Apartment',
  bedrooms INTEGER NOT NULL DEFAULT 2,
  bathrooms REAL NOT NULL DEFAULT 1,
  access_instructions TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Live',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cleaners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  service_areas_json TEXT NOT NULL DEFAULT '[]',
  availability_json TEXT NOT NULL DEFAULT '[]',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  guest_name TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 2,
  platform TEXT NOT NULL DEFAULT 'Airbnb',
  status TEXT NOT NULL DEFAULT 'Confirmed',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turnovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  booking_id INTEGER,
  cleaner_id INTEGER NOT NULL,
  turnover_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '10:30',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  linen_required TEXT NOT NULL DEFAULT 'Yes',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  turnover_id INTEGER,
  inspection_date TEXT NOT NULL,
  condition_rating INTEGER NOT NULL DEFAULT 5,
  missing_items TEXT NOT NULL DEFAULT '',
  damage_notes TEXT NOT NULL DEFAULT '',
  follow_up_required TEXT NOT NULL DEFAULT 'No',
  inspector_name TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS property_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  supply_item TEXT NOT NULL,
  current_stock REAL NOT NULL DEFAULT 0,
  reorder_point REAL NOT NULL DEFAULT 3,
  unit TEXT NOT NULL DEFAULT 'Sets',
  status TEXT NOT NULL DEFAULT 'OK',
  is_sample INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sr_bookings_dates ON bookings(property_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_sr_turnovers_date ON turnovers(turnover_date, status);
CREATE INDEX IF NOT EXISTS idx_sr_inspections_prop ON inspections(property_id, inspection_date);
CREATE INDEX IF NOT EXISTS idx_sr_supplies_prop ON property_supplies(property_id, status);
