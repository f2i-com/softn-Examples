-- TutorTrack SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Brightwell Tutoring & Music Studio',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Lessons, Progress & Family Billing',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'academic-royal',
  invoice_seq INTEGER NOT NULL DEFAULT 1000,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tutor',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  guardian_name TEXT NOT NULL DEFAULT '',
  guardian_email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT 'Mathematics',
  level TEXT NOT NULL DEFAULT 'Intermediate',
  goals TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tutors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  subjects_json TEXT NOT NULL DEFAULT '[]',
  availability_json TEXT NOT NULL DEFAULT '[]',
  hourly_rate_cents INTEGER NOT NULL DEFAULT 7000,
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  tutor_id INTEGER NOT NULL,
  lesson_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '16:00',
  duration INTEGER NOT NULL DEFAULT 60,
  subject TEXT NOT NULL DEFAULT 'Mathematics',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  notes TEXT NOT NULL DEFAULT '',
  fee_cents INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  lesson_id INTEGER,
  area TEXT NOT NULL DEFAULT 'Technique',
  score INTEGER NOT NULL DEFAULT 4,
  notes TEXT NOT NULL DEFAULT '',
  homework TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT 'No',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  student_id INTEGER NOT NULL,
  billing_period TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Unpaid',
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  paid_at INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(lesson_date, start_time);
CREATE INDEX IF NOT EXISTS idx_notes_student ON progress_notes(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, due_date);
