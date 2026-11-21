-- OHS & QMS initial SQLite schema (FormLogic private-sqlite, no clock/random/triggers/views)
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Apex Industrial Operations',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'ISO 45001 Safety & ISO 9001 Quality',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'amber',
  iso_cert_ref TEXT NOT NULL DEFAULT '',
  seq_counter INTEGER NOT NULL DEFAULT 100,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'safety_officer',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_code TEXT NOT NULL,
  incident_title TEXT NOT NULL,
  incident_date TEXT NOT NULL,
  incident_time TEXT NOT NULL DEFAULT '09:00',
  location TEXT NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'Near Miss',
  severity TEXT NOT NULL DEFAULT 'Medium',
  lost_time_injury INTEGER NOT NULL DEFAULT 0,
  investigation_status TEXT NOT NULL DEFAULT 'Reported',
  description TEXT NOT NULL DEFAULT '',
  reported_by TEXT NOT NULL DEFAULT '',
  witnesses TEXT NOT NULL DEFAULT '',
  immediate_actions TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER,
  employee_name TEXT NOT NULL,
  injury_date TEXT NOT NULL,
  injury_type TEXT NOT NULL DEFAULT 'Strain / Sprain',
  body_part TEXT NOT NULL DEFAULT '',
  injury_description TEXT NOT NULL DEFAULT '',
  treatment TEXT NOT NULL DEFAULT '',
  lost_time TEXT NOT NULL DEFAULT 'No',
  lost_time_start TEXT NOT NULL DEFAULT '',
  lost_time_end TEXT NOT NULL DEFAULT '',
  rtw_date TEXT NOT NULL DEFAULT '',
  treatment_notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_hazards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hazard_title TEXT NOT NULL,
  location TEXT NOT NULL,
  hazard_type TEXT NOT NULL DEFAULT 'Physical',
  hazard_description TEXT NOT NULL DEFAULT '',
  reported_by TEXT NOT NULL DEFAULT '',
  likelihood INTEGER NOT NULL DEFAULT 3,
  consequence INTEGER NOT NULL DEFAULT 3,
  risk_score INTEGER NOT NULL DEFAULT 9,
  risk_rating TEXT NOT NULL DEFAULT 'Medium',
  control_type TEXT NOT NULL DEFAULT 'Engineering Controls',
  control_description TEXT NOT NULL DEFAULT '',
  residual_risk INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_title TEXT NOT NULL,
  action_description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'Hazard',
  source_ref TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Medium',
  assigned_to TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  verified_by TEXT NOT NULL DEFAULT '',
  verified_at INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_code TEXT NOT NULL,
  audit_title TEXT NOT NULL,
  audit_type TEXT NOT NULL DEFAULT 'Internal',
  audit_date TEXT NOT NULL,
  auditor_name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  observations TEXT NOT NULL DEFAULT '',
  findings TEXT NOT NULL DEFAULT '',
  finding_severity TEXT NOT NULL DEFAULT 'Observation',
  corrective_actions_required TEXT NOT NULL DEFAULT 'No',
  follow_up_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Completed',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_code TEXT NOT NULL,
  car_title TEXT NOT NULL,
  car_description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'Audit',
  source_reference TEXT NOT NULL DEFAULT '',
  raised_by TEXT NOT NULL DEFAULT '',
  raised_date TEXT NOT NULL,
  assigned_to TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'High',
  root_cause TEXT NOT NULL DEFAULT '',
  corrective_action TEXT NOT NULL DEFAULT '',
  preventive_action TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_ncrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ncr_code TEXT NOT NULL,
  ncr_title TEXT NOT NULL,
  ncr_type TEXT NOT NULL DEFAULT 'Process',
  ncr_description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'Minor',
  source_type TEXT NOT NULL DEFAULT 'Inspection',
  raised_by TEXT NOT NULL DEFAULT '',
  raised_date TEXT NOT NULL,
  assigned_to TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  root_cause TEXT NOT NULL DEFAULT '',
  disposition TEXT NOT NULL DEFAULT 'Rework',
  corrective_action TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_training (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  completion_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL DEFAULT '',
  certificate_number TEXT NOT NULL DEFAULT '',
  is_mandatory TEXT NOT NULL DEFAULT 'Yes',
  assessment_result TEXT NOT NULL DEFAULT 'Passed',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_contractors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  trading_name TEXT NOT NULL DEFAULT '',
  abn TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  public_liability TEXT NOT NULL DEFAULT 'Yes',
  workers_comp TEXT NOT NULL DEFAULT 'Yes',
  licence_details TEXT NOT NULL DEFAULT '',
  induction_completed TEXT NOT NULL DEFAULT 'Yes',
  approval_expiry TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_title TEXT NOT NULL,
  complaint_type TEXT NOT NULL DEFAULT 'Quality',
  complaint_source TEXT NOT NULL DEFAULT 'Customer',
  complainant_name TEXT NOT NULL DEFAULT '',
  complainant_contact TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL,
  complaint_description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Medium',
  assigned_to TEXT NOT NULL DEFAULT '',
  investigation TEXT NOT NULL DEFAULT '',
  resolution TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_title TEXT NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'Toolbox Talk',
  meeting_date TEXT NOT NULL,
  meeting_time TEXT NOT NULL DEFAULT '07:00',
  location TEXT NOT NULL DEFAULT '',
  facilitator TEXT NOT NULL DEFAULT '',
  attendees TEXT NOT NULL DEFAULT '',
  agenda TEXT NOT NULL DEFAULT '',
  minutes TEXT NOT NULL DEFAULT '',
  action_items TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ohs_plant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Forklift',
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  purchase_date TEXT NOT NULL DEFAULT '',
  equipment_location TEXT NOT NULL DEFAULT '',
  last_service_date TEXT NOT NULL DEFAULT '',
  next_service_date TEXT NOT NULL DEFAULT '',
  inspection_frequency TEXT NOT NULL DEFAULT 'Monthly',
  registration_number TEXT NOT NULL DEFAULT '',
  registration_expiry TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ohs_inc_status ON ohs_incidents(investigation_status);
CREATE INDEX IF NOT EXISTS idx_ohs_haz_score ON ohs_hazards(risk_score, status);
CREATE INDEX IF NOT EXISTS idx_ohs_act_status ON ohs_actions(status, due_date);
CREATE INDEX IF NOT EXISTS idx_ohs_trn_exp ON ohs_training(expiry_date);
CREATE INDEX IF NOT EXISTS idx_ohs_con_exp ON ohs_contractors(approval_expiry);
