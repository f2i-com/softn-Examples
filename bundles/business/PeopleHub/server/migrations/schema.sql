CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Kindred People Co.',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'HR & People Operations',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  brand_preset TEXT NOT NULL DEFAULT 'berry',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT 'Software Engineer',
  cover_letter TEXT NOT NULL DEFAULT '',
  availability_date TEXT NOT NULL DEFAULT '',
  salary_expectations_cents INTEGER NOT NULL DEFAULT 0,
  referral_source TEXT NOT NULL DEFAULT 'LinkedIn',
  stage TEXT NOT NULL DEFAULT 'Applied',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_scorecards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  interviewer_name TEXT NOT NULL,
  interview_date TEXT NOT NULL,
  interview_type TEXT NOT NULL DEFAULT 'Technical',
  technical_skills INTEGER NOT NULL DEFAULT 3,
  communication INTEGER NOT NULL DEFAULT 3,
  culture_fit INTEGER NOT NULL DEFAULT 3,
  problem_solving INTEGER NOT NULL DEFAULT 3,
  overall_score REAL NOT NULL DEFAULT 3,
  overall_recommendation TEXT NOT NULL DEFAULT 'Hire',
  strengths TEXT NOT NULL DEFAULT '',
  concerns TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS onboardings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Engineering',
  manager TEXT NOT NULL DEFAULT '',
  it_setup_json TEXT NOT NULL DEFAULT '[]',
  policy_json TEXT NOT NULL DEFAULT '[]',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  emergency_contact_relationship TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL DEFAULT '',
  leave_type TEXT NOT NULL DEFAULT 'Annual Leave',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER,
  employee_name TEXT NOT NULL,
  review_period TEXT NOT NULL DEFAULT 'Annual',
  reviewer_name TEXT NOT NULL,
  review_date TEXT NOT NULL,
  job_knowledge INTEGER NOT NULL DEFAULT 4,
  quality_of_work INTEGER NOT NULL DEFAULT 4,
  productivity INTEGER NOT NULL DEFAULT 4,
  teamwork INTEGER NOT NULL DEFAULT 4,
  initiative INTEGER NOT NULL DEFAULT 4,
  overall_rating REAL NOT NULL DEFAULT 4,
  goals_met TEXT NOT NULL DEFAULT 'Met All Goals',
  strengths TEXT NOT NULL DEFAULT '',
  areas_for_improvement TEXT NOT NULL DEFAULT '',
  goals_next_period TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL DEFAULT '',
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Travel',
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  project_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL DEFAULT '',
  training_type TEXT NOT NULL DEFAULT 'Online Course',
  course_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL DEFAULT '',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  justification TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exit_interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Engineering',
  last_day TEXT NOT NULL,
  tenure_years REAL NOT NULL DEFAULT 1,
  reason_for_leaving TEXT NOT NULL DEFAULT 'New Opportunity',
  overall_satisfaction INTEGER NOT NULL DEFAULT 4,
  management_rating INTEGER NOT NULL DEFAULT 4,
  culture_rating INTEGER NOT NULL DEFAULT 4,
  what_enjoyed TEXT NOT NULL DEFAULT '',
  suggestions TEXT NOT NULL DEFAULT '',
  would_return TEXT NOT NULL DEFAULT 'Yes',
  would_recommend TEXT NOT NULL DEFAULT 'Yes',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cand_stage ON candidates(stage, updated_at);
CREATE INDEX IF NOT EXISTS idx_score_cand ON interview_scorecards(candidate_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status, start_date);
CREATE INDEX IF NOT EXISTS idx_expense_status ON expense_claims(status, expense_date);
CREATE INDEX IF NOT EXISTS idx_training_status ON training_requests(status, start_date);
