CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Meridian Federal Wealth RIA',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'SEC Registered Investment Adviser',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  brand_preset TEXT NOT NULL DEFAULT 'federal',
  crd_number TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'advisor',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 45,
  ssn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  citizenship TEXT NOT NULL DEFAULT 'us',
  employer TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  annual_income_cents INTEGER NOT NULL DEFAULT 0,
  net_worth_cents INTEGER NOT NULL DEFAULT 0,
  liquid_net_worth_cents INTEGER NOT NULL DEFAULT 0,
  investment_objectives TEXT NOT NULL DEFAULT 'balanced',
  time_horizon INTEGER NOT NULL DEFAULT 12,
  risk_tolerance INTEGER NOT NULL DEFAULT 6,
  risk_score INTEGER NOT NULL DEFAULT 60,
  accredited_investor TEXT NOT NULL DEFAULT 'No',
  portfolio_allocation TEXT NOT NULL DEFAULT '60/30/10',
  onboarding_stage TEXT NOT NULL DEFAULT 'Prospect',
  crs_acknowledged INTEGER NOT NULL DEFAULT 0,
  crs_ack_date TEXT NOT NULL DEFAULT '',
  crs_signer TEXT NOT NULL DEFAULT '',
  crs_advisor_name TEXT NOT NULL DEFAULT '',
  w9_legal_name TEXT NOT NULL DEFAULT '',
  w9_business_name TEXT NOT NULL DEFAULT '',
  w9_tax_classification TEXT NOT NULL DEFAULT 'individual',
  w9_ssn_ein TEXT NOT NULL DEFAULT '',
  w9_certified_date TEXT NOT NULL DEFAULT '',
  advisor_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  client_age INTEGER NOT NULL DEFAULT 45,
  client_income_cents INTEGER NOT NULL DEFAULT 0,
  client_net_worth_cents INTEGER NOT NULL DEFAULT 0,
  time_horizon INTEGER NOT NULL DEFAULT 12,
  market_reaction TEXT NOT NULL DEFAULT 'hold',
  loss_capacity INTEGER NOT NULL DEFAULT 6,
  investment_experience TEXT NOT NULL DEFAULT 'moderate',
  risk_score INTEGER NOT NULL DEFAULT 60,
  risk_band TEXT NOT NULL DEFAULT 'Moderate',
  portfolio_type TEXT NOT NULL DEFAULT 'Moderate',
  suggested_allocation TEXT NOT NULL DEFAULT '60/30/10',
  reg_bi_check TEXT NOT NULL DEFAULT 'Suitable',
  rationale TEXT NOT NULL DEFAULT '',
  assessed_date TEXT NOT NULL DEFAULT '',
  assessed_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_fee_agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  account_value_cents INTEGER NOT NULL DEFAULT 0,
  fee_tier TEXT NOT NULL DEFAULT 'Standard',
  effective_bps REAL NOT NULL DEFAULT 100,
  annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  quarterly_fee_cents INTEGER NOT NULL DEFAULT 0,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  billing_frequency TEXT NOT NULL DEFAULT 'Quarterly',
  tier_breakdown_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Executed',
  effective_date TEXT NOT NULL DEFAULT '',
  client_signer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_acat_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  custodian TEXT NOT NULL DEFAULT 'Schwab',
  account_number TEXT NOT NULL DEFAULT '',
  transfer_type TEXT NOT NULL DEFAULT 'Full',
  assets_to_transfer TEXT NOT NULL DEFAULT '',
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  transfer_fee_cents INTEGER NOT NULL DEFAULT 7500,
  status TEXT NOT NULL DEFAULT 'Initiated',
  initiated_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_rollovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  rollover_type TEXT NOT NULL DEFAULT '401k to IRA',
  current_custodian TEXT NOT NULL,
  current_account_number TEXT NOT NULL DEFAULT '',
  receiving_custodian TEXT NOT NULL,
  receiving_account_number TEXT NOT NULL DEFAULT '',
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  direct_or_indirect TEXT NOT NULL DEFAULT 'Direct (trustee-to-trustee)',
  roth_tax_acknowledged INTEGER NOT NULL DEFAULT 0,
  sixty_day_deadline TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Initiated',
  initiated_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_exchanges_1035 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  existing_policy_number TEXT NOT NULL,
  existing_carrier TEXT NOT NULL DEFAULT 'Prudential',
  exchange_type TEXT NOT NULL DEFAULT 'Annuity',
  new_carrier TEXT NOT NULL DEFAULT 'Athene',
  new_policy_type TEXT NOT NULL DEFAULT '',
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  has_surrender_charges TEXT NOT NULL DEFAULT 'No',
  surrender_charges_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Reviewing',
  initiated_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_beneficiaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  account_label TEXT NOT NULL,
  primary_json TEXT NOT NULL DEFAULT '[]',
  contingent_json TEXT NOT NULL DEFAULT '[]',
  effective_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_poas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  principal_name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  powers_granted_json TEXT NOT NULL DEFAULT '[]',
  effective_date TEXT NOT NULL DEFAULT '',
  witness_1_name TEXT NOT NULL DEFAULT '',
  witness_2_name TEXT NOT NULL DEFAULT '',
  notarized INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_annual_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  review_date TEXT NOT NULL,
  current_aum_cents INTEGER NOT NULL DEFAULT 0,
  current_annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  goal_progress INTEGER NOT NULL DEFAULT 8,
  life_changes_json TEXT NOT NULL DEFAULT '[]',
  updated_risk_tolerance INTEGER NOT NULL DEFAULT 6,
  advisor_notes TEXT NOT NULL DEFAULT '',
  next_review_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  advisor_name TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS us_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Tax Return',
  document_name TEXT NOT NULL,
  reference_code TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_us_clients_stage ON us_clients(onboarding_stage);
CREATE INDEX IF NOT EXISTS idx_us_risk_client ON us_risk_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_us_fee_client ON us_fee_agreements(client_id);
CREATE INDEX IF NOT EXISTS idx_us_acat_status ON us_acat_transfers(status);
CREATE INDEX IF NOT EXISTS idx_us_roll_status ON us_rollovers(status);
CREATE INDEX IF NOT EXISTS idx_us_1035_status ON us_exchanges_1035(status);
CREATE INDEX IF NOT EXISTS idx_us_ben_client ON us_beneficiaries(client_id);
CREATE INDEX IF NOT EXISTS idx_us_rev_next ON us_annual_reviews(next_review_date);
CREATE INDEX IF NOT EXISTS idx_us_doc_exp ON us_documents(expiry_date);
