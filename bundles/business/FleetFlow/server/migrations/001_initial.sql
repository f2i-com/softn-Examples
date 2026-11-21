-- FleetFlow Vehicle Fleet & Driver Log SQLite schema (FormLogic private-sqlite)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Metro Courier Fleet',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Vehicle Fleet & Driver Logbook',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'highway-blue',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'driver',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_name TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  make_model TEXT NOT NULL DEFAULT '',
  year INTEGER NOT NULL DEFAULT 2022,
  odometer_km INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Available',
  rego_expiry TEXT NOT NULL DEFAULT '',
  insurance_expiry TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  licence_class TEXT NOT NULL DEFAULT 'Car',
  licence_expiry TEXT NOT NULL DEFAULT '',
  active TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  vehicle_name TEXT NOT NULL DEFAULT '',
  registration TEXT NOT NULL DEFAULT '',
  driver_id INTEGER NOT NULL,
  driver_name TEXT NOT NULL DEFAULT '',
  trip_date TEXT NOT NULL,
  start_odometer INTEGER NOT NULL DEFAULT 0,
  end_odometer INTEGER NOT NULL DEFAULT 0,
  distance_km INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL DEFAULT 'Delivery',
  usage_class TEXT NOT NULL DEFAULT 'Business',
  destination TEXT NOT NULL DEFAULT '',
  fuel_cost_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  vehicle_name TEXT NOT NULL DEFAULT '',
  registration TEXT NOT NULL DEFAULT '',
  maintenance_type TEXT NOT NULL DEFAULT 'Service',
  due_date TEXT NOT NULL DEFAULT '',
  completed_date TEXT NOT NULL DEFAULT '',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  supplier TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL,
  vehicle_name TEXT NOT NULL DEFAULT '',
  registration TEXT NOT NULL DEFAULT '',
  driver_id INTEGER NOT NULL,
  driver_name TEXT NOT NULL DEFAULT '',
  incident_date TEXT NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'Near miss',
  severity TEXT NOT NULL DEFAULT 'Low',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Reported',
  resolution_notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ff_trips_date ON trips(trip_date, created_at);
CREATE INDEX IF NOT EXISTS idx_ff_trips_veh ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ff_maint_status ON maintenance_jobs(status, due_date);
CREATE INDEX IF NOT EXISTS idx_ff_inc_status ON incidents(status, severity);
