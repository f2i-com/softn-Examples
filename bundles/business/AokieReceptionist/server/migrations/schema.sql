CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_done INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT 'Harbourside Dental & Wellness',
  owner_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT 'AI Phone & Front-Desk Console',
  phone TEXT NOT NULL DEFAULT '+61 2 9000 4120',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'AUD',
  tax_rate REAL NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  brand_preset TEXT NOT NULL DEFAULT 'teal',
  call_seq INTEGER NOT NULL DEFAULT 1000,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'receptionist',
  is_owner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  preferred_service TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  sms_capable TEXT NOT NULL DEFAULT 'Yes',
  last_call_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_code TEXT NOT NULL,
  customer_id INTEGER,
  caller_name TEXT NOT NULL DEFAULT '',
  caller_phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'Inbound',
  status TEXT NOT NULL DEFAULT 'Ringing',
  started_at INTEGER NOT NULL,
  answered_at INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT 'Question',
  sentiment TEXT NOT NULL DEFAULT 'Neutral',
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_transcript_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER NOT NULL,
  turn_index INTEGER NOT NULL DEFAULT 1,
  speaker TEXT NOT NULL DEFAULT 'Caller',
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'stt',
  overlapped INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_sms_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  phone TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER NOT NULL,
  last_preview TEXT NOT NULL DEFAULT '',
  unread_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_sms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'Outbound',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Sent',
  is_ai_reply INTEGER NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'Not required',
  delivery_note TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  call_id INTEGER,
  caller_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL,
  appt_date TEXT NOT NULL,
  appt_time TEXT NOT NULL DEFAULT '10:00',
  status TEXT NOT NULL DEFAULT 'Requested',
  source TEXT NOT NULL DEFAULT 'Call',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  call_id INTEGER,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  source TEXT NOT NULL DEFAULT 'Call',
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  call_id INTEGER,
  phone TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  due_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open',
  assignee TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Medium',
  sms_state TEXT NOT NULL DEFAULT 'None',
  callback_state TEXT NOT NULL DEFAULT 'None',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_hardware_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'Info',
  message TEXT NOT NULL,
  dongle_id TEXT NOT NULL DEFAULT 'AOKIE-BT-01',
  occurred_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  acknowledged INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ak_receptionist_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active TEXT NOT NULL DEFAULT 'Yes',
  greeting TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  business_info TEXT NOT NULL DEFAULT '',
  reply_mode TEXT NOT NULL DEFAULT 'Built-in AI agent',
  sms_enabled TEXT NOT NULL DEFAULT 'Yes',
  whitelist_only TEXT NOT NULL DEFAULT 'No',
  default_country_code TEXT NOT NULL DEFAULT '+61',
  call_route TEXT NOT NULL DEFAULT 'oaiy',
  voice TEXT NOT NULL DEFAULT 'aria-warm',
  model TEXT NOT NULL DEFAULT '',
  llm_source TEXT NOT NULL DEFAULT '',
  llm_endpoint TEXT NOT NULL DEFAULT 'http://127.0.0.1:8080/v1',
  stt_source TEXT NOT NULL DEFAULT '',
  stt_endpoint TEXT NOT NULL DEFAULT '',
  tts_source TEXT NOT NULL DEFAULT '',
  tts_endpoint TEXT NOT NULL DEFAULT '',
  correction_source TEXT NOT NULL DEFAULT '',
  correction_endpoint TEXT NOT NULL DEFAULT '',
  background_ai_source TEXT NOT NULL DEFAULT '',
  background_ai_model TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ak_calls_status ON ak_calls(status, started_at);
CREATE INDEX IF NOT EXISTS idx_ak_turns_call ON ak_transcript_turns(call_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_ak_sms_thread ON ak_sms_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ak_appt_date ON ak_appointments(appt_date, appt_time);
CREATE INDEX IF NOT EXISTS idx_ak_tasks_status ON ak_tasks(status, due_at);
