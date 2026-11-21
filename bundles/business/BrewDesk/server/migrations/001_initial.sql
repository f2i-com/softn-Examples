-- BrewDesk initial SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'BrewDesk Cafe',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Espresso & Counter Operations',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'espresso',
  order_seq INTEGER NOT NULL DEFAULT 100,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'barista',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Coffee',
  price_cents INTEGER NOT NULL DEFAULT 0,
  station TEXT NOT NULL DEFAULT 'Espresso',
  active TEXT NOT NULL DEFAULT 'Active',
  dietary_tags TEXT NOT NULL DEFAULT '[]',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cafe_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  order_day TEXT NOT NULL,
  table_number TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL DEFAULT 'Takeaway',
  customer_name TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  items_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS barista_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  order_number TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  drink_type TEXT NOT NULL,
  milk TEXT NOT NULL DEFAULT 'Full cream',
  size TEXT NOT NULL DEFAULT 'Regular',
  shots INTEGER NOT NULL DEFAULT 2,
  extras_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Queued',
  barista_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Beans',
  current_qty REAL NOT NULL DEFAULT 0,
  par_level REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'kg',
  status TEXT NOT NULL DEFAULT 'OK',
  supplier TEXT NOT NULL DEFAULT '',
  last_checked INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Barista',
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'Espresso',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  close_date TEXT NOT NULL,
  register_cents INTEGER NOT NULL DEFAULT 0,
  pos_cents INTEGER NOT NULL DEFAULT 0,
  tips_cents INTEGER NOT NULL DEFAULT 0,
  beans_used REAL NOT NULL DEFAULT 0,
  milk_used REAL NOT NULL DEFAULT 0,
  waste TEXT NOT NULL DEFAULT '',
  cleaning_json TEXT NOT NULL DEFAULT '[]',
  manager_notes TEXT NOT NULL DEFAULT '',
  closed_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_day ON cafe_orders(order_day, status);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON barista_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON staff_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_closes_date ON daily_closes(close_date);
