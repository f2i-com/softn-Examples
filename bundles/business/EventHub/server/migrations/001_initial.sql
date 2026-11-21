-- Event Hub initial SQLite schema (FormLogic private-sqlite)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Summit Live Events',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Event Command & Operations',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  brand_preset TEXT NOT NULL DEFAULT 'plum',
  event_title TEXT NOT NULL DEFAULT 'Annual Summit 2026',
  event_date TEXT NOT NULL DEFAULT '',
  event_venue TEXT NOT NULL DEFAULT 'Grand Convention Center',
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

CREATE TABLE IF NOT EXISTS attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendee_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  ticket_type TEXT NOT NULL DEFAULT 'General Admission',
  dietary_json TEXT NOT NULL DEFAULT '[]',
  accessibility_needs TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  checked_in INTEGER NOT NULL DEFAULT 0,
  checked_in_at INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speakers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speaker_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  topic_title TEXT NOT NULL,
  abstract TEXT NOT NULL DEFAULT '',
  presentation_type TEXT NOT NULL DEFAULT 'Breakout Session',
  equipment_json TEXT NOT NULL DEFAULT '[]',
  session_slot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Submitted',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  products_services TEXT NOT NULL DEFAULT '',
  booth_size TEXT NOT NULL DEFAULT 'Medium (10x10)',
  power_json TEXT NOT NULL DEFAULT '[]',
  booth_number TEXT NOT NULL DEFAULT '',
  insurance_verified INTEGER NOT NULL DEFAULT 0,
  special_requests TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Applied',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  availability_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  t_shirt_size TEXT NOT NULL DEFAULT 'M',
  assigned_shift TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Venue',
  estimated_cents INTEGER NOT NULL DEFAULT 0,
  actual_cents INTEGER NOT NULL DEFAULT 0,
  vendor TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_name TEXT NOT NULL,
  incident_date TEXT NOT NULL,
  incident_time TEXT NOT NULL DEFAULT '12:00',
  location TEXT NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'Safety Hazard',
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'Medium',
  actions_taken TEXT NOT NULL DEFAULT '',
  witnesses TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendee_id INTEGER,
  attendee_name TEXT NOT NULL DEFAULT '',
  overall_rating INTEGER NOT NULL DEFAULT 5,
  venue_rating INTEGER NOT NULL DEFAULT 5,
  speakers_rating INTEGER NOT NULL DEFAULT 5,
  organization_rating INTEGER NOT NULL DEFAULT 5,
  food_rating INTEGER NOT NULL DEFAULT 5,
  what_enjoyed TEXT NOT NULL DEFAULT '',
  suggestions TEXT NOT NULL DEFAULT '',
  would_attend_again TEXT NOT NULL DEFAULT 'Definitely',
  would_recommend TEXT NOT NULL DEFAULT 'Yes',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendees_checkin ON attendees(checked_in, ticket_type);
CREATE INDEX IF NOT EXISTS idx_speakers_status ON speakers(status);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, severity);
