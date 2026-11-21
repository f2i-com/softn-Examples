CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'GrillStack Burgers',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Smash Burgers & Kitchen Pass',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'flame',
  order_seq INTEGER NOT NULL DEFAULT 100,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'grill_crew',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Burger',
  price_cents INTEGER NOT NULL DEFAULT 0,
  prep_station TEXT NOT NULL DEFAULT 'Grill',
  ingredients_json TEXT NOT NULL DEFAULT '[]',
  active TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  order_day TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'Takeaway',
  customer_name TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  items_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  priority TEXT NOT NULL DEFAULT 'Normal',
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  order_number TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL DEFAULT 'Takeaway',
  priority TEXT NOT NULL DEFAULT 'Normal',
  station TEXT NOT NULL DEFAULT 'Grill',
  ticket_items TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  staff_member TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prep_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Patty',
  opening_count REAL NOT NULL DEFAULT 0,
  current_count REAL NOT NULL DEFAULT 0,
  par_level REAL NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'Units',
  status TEXT NOT NULL DEFAULT 'OK',
  last_checked INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_member TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Grill',
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_taken TEXT NOT NULL DEFAULT 'Not yet',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  close_date TEXT NOT NULL,
  cash_cents INTEGER NOT NULL DEFAULT 0,
  eftpos_cents INTEGER NOT NULL DEFAULT 0,
  delivery_cents INTEGER NOT NULL DEFAULT 0,
  pos_cents INTEGER NOT NULL DEFAULT 0,
  waste_notes TEXT NOT NULL DEFAULT '',
  cleaning_json TEXT NOT NULL DEFAULT '[]',
  manager TEXT NOT NULL DEFAULT '',
  issues TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Submitted',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gs_orders_day ON shop_orders(order_day, status);
CREATE INDEX IF NOT EXISTS idx_gs_tickets_station ON kitchen_tickets(station, status, priority);
CREATE INDEX IF NOT EXISTS idx_gs_shifts_date ON staff_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_gs_closes_date ON daily_closes(close_date);
