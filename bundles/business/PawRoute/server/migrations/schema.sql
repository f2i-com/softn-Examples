CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'PawRoute Pet Care',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Dog Walking & Pet Care Studio',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'emerald',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'walker',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  access_instructions TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  preferred_contact TEXT NOT NULL DEFAULT 'Text message',
  billing_status TEXT NOT NULL DEFAULT 'Up to date',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'Dog',
  breed TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT 'Medium',
  temperament_json TEXT NOT NULL DEFAULT '[]',
  medical_notes TEXT NOT NULL DEFAULT '',
  feeding_instructions TEXT NOT NULL DEFAULT '',
  vet_contact TEXT NOT NULL DEFAULT '',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS walkers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Walker',
  service_areas_json TEXT NOT NULL DEFAULT '[]',
  availability_json TEXT NOT NULL DEFAULT '[]',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS walks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  walker_id INTEGER NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'Solo Walk',
  walk_date TEXT NOT NULL,
  walk_time TEXT NOT NULL DEFAULT '09:00',
  duration TEXT NOT NULL DEFAULT '45 minutes',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  weather TEXT NOT NULL DEFAULT 'Sunny',
  walk_notes TEXT NOT NULL DEFAULT '',
  charge_cents INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL,
  walk_id INTEGER,
  reported_by_id INTEGER,
  incident_type TEXT NOT NULL DEFAULT 'Owner note',
  severity TEXT NOT NULL DEFAULT 'Low',
  description TEXT NOT NULL,
  action_taken TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT 'No',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pr_walks_date ON walks(walk_date, walk_time);
CREATE INDEX IF NOT EXISTS idx_pr_walks_walker ON walks(walker_id, walk_date);
CREATE INDEX IF NOT EXISTS idx_pr_pets_owner ON pets(owner_id);
CREATE INDEX IF NOT EXISTS idx_pr_incidents_fu ON incidents(follow_up, severity);
