-- VenueOps initial SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Grand Civic Halls & Studios',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Venue Hire & Space Scheduling',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'indigo',
  booking_seq INTEGER NOT NULL DEFAULT 300,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coordinator',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 50,
  space_type TEXT NOT NULL DEFAULT 'Hall',
  hourly_rate_cents INTEGER NOT NULL DEFAULT 6000,
  features_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Available',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT NOT NULL,
  space_id INTEGER NOT NULL,
  space_name TEXT NOT NULL DEFAULT '',
  client_id INTEGER,
  client_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  booking_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_hours REAL NOT NULL DEFAULT 1,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL DEFAULT 'Meeting',
  status TEXT NOT NULL DEFAULT 'Confirmed',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  booking_ref TEXT NOT NULL DEFAULT '',
  space_name TEXT NOT NULL DEFAULT '',
  booking_date TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT 'Theatre',
  equipment_json TEXT NOT NULL DEFAULT '[]',
  catering_required TEXT NOT NULL DEFAULT 'No',
  notes TEXT NOT NULL DEFAULT '',
  setup_complete TEXT NOT NULL DEFAULT 'Not yet',
  completed_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  booking_ref TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  space_name TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'Bank transfer',
  status TEXT NOT NULL DEFAULT 'Paid',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  booking_ref TEXT NOT NULL DEFAULT '',
  space_name TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  incident_type TEXT NOT NULL DEFAULT 'Damage',
  description TEXT NOT NULL,
  cost_estimate_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Reported',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vo_bookings_conflict ON bookings(space_id, booking_date, status);
CREATE INDEX IF NOT EXISTS idx_vo_setups_booking ON setup_requirements(booking_id, setup_complete);
CREATE INDEX IF NOT EXISTS idx_vo_payments_booking ON payments(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_vo_incidents_status ON incidents(status);
