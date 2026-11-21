-- Finance OS (AU) initial SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Harbour Private Wealth',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'AFSL Advisory & Compliance',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'harbour',
  afsl_number TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'adviser',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 40,
  tfn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  residency_status TEXT NOT NULL DEFAULT 'au_citizen',
  employer TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  annual_income_cents INTEGER NOT NULL DEFAULT 0,
  net_assets_cents INTEGER NOT NULL DEFAULT 0,
  liquid_assets_cents INTEGER NOT NULL DEFAULT 0,
  investment_objectives TEXT NOT NULL DEFAULT 'balanced',
  time_horizon INTEGER NOT NULL DEFAULT 10,
  risk_tolerance INTEGER NOT NULL DEFAULT 5,
  risk_score INTEGER NOT NULL DEFAULT 50,
  wholesale_status TEXT NOT NULL DEFAULT 'No',
  onboarding_stage TEXT NOT NULL DEFAULT 'Prospect',
  fsg_acknowledged INTEGER NOT NULL DEFAULT 0,
  fsg_ack_date TEXT NOT NULL DEFAULT '',
  fsg_signer TEXT NOT NULL DEFAULT '',
  tfn_exemption TEXT NOT NULL DEFAULT 'none',
  residency_for_tax TEXT NOT NULL DEFAULT 'au_resident',
  tax_free_threshold TEXT NOT NULL DEFAULT 'yes',
  has_hecs_help TEXT NOT NULL DEFAULT 'no',
  tfn_declared_date TEXT NOT NULL DEFAULT '',
  adviser_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_risk_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  client_age INTEGER NOT NULL DEFAULT 40,
  client_income_cents INTEGER NOT NULL DEFAULT 0,
  client_net_assets_cents INTEGER NOT NULL DEFAULT 0,
  time_horizon INTEGER NOT NULL DEFAULT 10,
  market_reaction TEXT NOT NULL DEFAULT 'hold',
  loss_capacity INTEGER NOT NULL DEFAULT 5,
  investment_experience TEXT NOT NULL DEFAULT 'moderate',
  risk_score INTEGER NOT NULL DEFAULT 50,
  profile_band TEXT NOT NULL DEFAULT 'Balanced',
  recommended_profile TEXT NOT NULL DEFAULT 'Balanced',
  best_interest_notes TEXT NOT NULL DEFAULT '',
  assessed_date TEXT NOT NULL DEFAULT '',
  assessed_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_fee_disclosures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  portfolio_value_cents INTEGER NOT NULL DEFAULT 0,
  fee_type TEXT NOT NULL DEFAULT 'percentage',
  percentage_rate REAL NOT NULL DEFAULT 0,
  fixed_fee_cents INTEGER NOT NULL DEFAULT 0,
  calculated_annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  billing_frequency TEXT NOT NULL DEFAULT 'quarterly',
  ongoing_fee_consent TEXT NOT NULL DEFAULT 'pending',
  consent_signed_date TEXT NOT NULL DEFAULT '',
  effective_date TEXT NOT NULL DEFAULT '',
  renewal_due_date TEXT NOT NULL DEFAULT '',
  client_signer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_off_market_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  delivering_platform TEXT NOT NULL DEFAULT 'BT Panorama',
  hin_or_srn TEXT NOT NULL DEFAULT '',
  account_reference TEXT NOT NULL DEFAULT '',
  transfer_type TEXT NOT NULL DEFAULT 'Full',
  assets_to_transfer TEXT NOT NULL DEFAULT '',
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  transfer_fee_cents INTEGER NOT NULL DEFAULT 5450,
  chess_sponsorship TEXT NOT NULL DEFAULT 'Broker-Sponsored',
  status TEXT NOT NULL DEFAULT 'Submitted',
  submitted_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_super_rollovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  from_fund_name TEXT NOT NULL,
  from_fund_abn TEXT NOT NULL DEFAULT '',
  from_member_number TEXT NOT NULL DEFAULT '',
  to_fund_name TEXT NOT NULL,
  to_fund_abn TEXT NOT NULL DEFAULT '',
  to_member_number TEXT NOT NULL DEFAULT '',
  rollover_type TEXT NOT NULL DEFAULT 'Full Rollover',
  partial_amount_cents INTEGER NOT NULL DEFAULT 0,
  estimated_balance_cents INTEGER NOT NULL DEFAULT 0,
  preservation_status TEXT NOT NULL DEFAULT 'Preserved',
  insurance_checked INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Initiated',
  requested_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_bdbns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  super_fund_name TEXT NOT NULL,
  member_number TEXT NOT NULL DEFAULT '',
  primary_json TEXT NOT NULL DEFAULT '[]',
  contingent_json TEXT NOT NULL DEFAULT '[]',
  witness_1_name TEXT NOT NULL DEFAULT '',
  witness_1_over_18 INTEGER NOT NULL DEFAULT 1,
  witness_2_name TEXT NOT NULL DEFAULT '',
  witness_2_over_18 INTEGER NOT NULL DEFAULT 1,
  nomination_date TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_annual_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  review_date TEXT NOT NULL,
  current_portfolio_value_cents INTEGER NOT NULL DEFAULT 0,
  current_annual_fee_cents INTEGER NOT NULL DEFAULT 0,
  goal_progress INTEGER NOT NULL DEFAULT 7,
  life_changes_json TEXT NOT NULL DEFAULT '[]',
  updated_risk_tolerance INTEGER NOT NULL DEFAULT 5,
  soa_required INTEGER NOT NULL DEFAULT 0,
  advisor_notes TEXT NOT NULL DEFAULT '',
  next_review_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  adviser_name TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS au_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Statement of Advice',
  document_name TEXT NOT NULL,
  reference_code TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_au_clients_stage ON au_clients(onboarding_stage);
CREATE INDEX IF NOT EXISTS idx_au_risk_client ON au_risk_profiles(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_au_fds_client ON au_fee_disclosures(client_id, ongoing_fee_consent);
CREATE INDEX IF NOT EXISTS idx_au_omt_client ON au_off_market_transfers(client_id, status);
CREATE INDEX IF NOT EXISTS idx_au_roll_client ON au_super_rollovers(client_id, status);
CREATE INDEX IF NOT EXISTS idx_au_bdbn_client ON au_bdbns(client_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_au_rev_next ON au_annual_reviews(next_review_date);
CREATE INDEX IF NOT EXISTS idx_au_doc_exp ON au_documents(expiry_date);
