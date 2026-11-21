-- Service Desk initial SQLite schema (FormLogic private-sqlite)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Northstar Support',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'Customer Support & Helpdesk',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  brand_preset TEXT NOT NULL DEFAULT 'cobalt',
  ticket_seq INTEGER NOT NULL DEFAULT 1000,
  bug_seq INTEGER NOT NULL DEFAULT 100,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'support_agent',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Technical',
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Open',
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  internal_notes_json TEXT NOT NULL DEFAULT '[]',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_number TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT 'Web Application',
  severity TEXT NOT NULL DEFAULT 'Medium',
  bug_title TEXT NOT NULL,
  steps_to_reproduce TEXT NOT NULL DEFAULT '',
  expected_behavior TEXT NOT NULL DEFAULT '',
  actual_behavior TEXT NOT NULL DEFAULT '',
  browser_os TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitter_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  feature_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  use_case TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Important',
  impact_score INTEGER NOT NULL DEFAULT 3,
  additional_context TEXT NOT NULL DEFAULT '',
  upvotes INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Under Review',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  order_number TEXT NOT NULL,
  purchase_date TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT 'Defective / Damaged',
  refund_method TEXT NOT NULL DEFAULT 'Original Payment Method',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  additional_details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER,
  escalation_reason TEXT NOT NULL DEFAULT 'SLA Breach',
  current_status TEXT NOT NULL DEFAULT '',
  desired_outcome TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'High (within 4h)',
  escalated_to TEXT NOT NULL DEFAULT '',
  escalated_by TEXT NOT NULL DEFAULT '',
  escalation_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  overall_satisfaction INTEGER NOT NULL DEFAULT 5,
  response_time_rating INTEGER NOT NULL DEFAULT 5,
  resolution_rating INTEGER NOT NULL DEFAULT 5,
  agent_rating INTEGER NOT NULL DEFAULT 5,
  nps_score INTEGER NOT NULL DEFAULT 9,
  nps_category TEXT NOT NULL DEFAULT 'Promoter',
  comments TEXT NOT NULL DEFAULT '',
  would_recommend TEXT NOT NULL DEFAULT 'Yes',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'FAQ',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  related_articles TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  last_reviewed TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Published',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, priority, updated_at);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bug_reports(status, severity);
CREATE INDEX IF NOT EXISTS idx_features_votes ON feature_requests(status, upvotes);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refund_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_ticket ON escalations(ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_kb_cat ON kb_articles(category, status);
