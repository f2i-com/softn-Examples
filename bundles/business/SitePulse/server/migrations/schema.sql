CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Ironbark Builders & Construction',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Construction Site Diary & Field Control',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'hi-vis-amber',
  defect_seq INTEGER NOT NULL DEFAULT 100,
  var_seq INTEGER NOT NULL DEFAULT 100,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supervisor',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  site_address TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  target_completion TEXT NOT NULL DEFAULT '',
  project_manager TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_diaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  diary_date TEXT NOT NULL,
  weather TEXT NOT NULL DEFAULT 'Fine',
  workers_on_site INTEGER NOT NULL DEFAULT 0,
  work_completed TEXT NOT NULL DEFAULT '',
  delays TEXT NOT NULL DEFAULT '',
  visitors TEXT NOT NULL DEFAULT '',
  signed_by TEXT NOT NULL DEFAULT '',
  signed_at INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS defects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  defect_code TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  issue_title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Finishes',
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_to TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS variations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  var_number TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  variation_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  client_approval_name TEXT NOT NULL DEFAULT '',
  client_approved_at INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  delivery_date TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Units',
  received_by TEXT NOT NULL DEFAULT '',
  has_issue INTEGER NOT NULL DEFAULT 0,
  issues TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subcontractors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  trade TEXT NOT NULL DEFAULT 'Carpentry',
  insurance_expiry TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Approved',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diaries_proj_date ON site_diaries(project_id, diary_date);
CREATE INDEX IF NOT EXISTS idx_defects_proj_status ON defects(project_id, status);
CREATE INDEX IF NOT EXISTS idx_vars_proj_status ON variations(project_id, status);
CREATE INDEX IF NOT EXISTS idx_deliv_proj_date ON deliveries(project_id, delivery_date);
CREATE INDEX IF NOT EXISTS idx_subbies_exp ON subcontractors(insurance_expiry);
