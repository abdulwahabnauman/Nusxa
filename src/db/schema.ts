/** SQL statements for creating the Nusxa database schema (version 1) */

/**
 * Single source of truth for the database schema version. Every migration
 * updates the stored `schema_version` row to its own version, so after all
 * migrations run the stored value always equals this constant.
 */
export const CURRENT_SCHEMA_VERSION = 19;

export const CREATE_PROFILE_TABLE = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  name_ur TEXT,
  date_of_birth TEXT,
  blood_group TEXT,
  allergies TEXT DEFAULT '[]',
  emergency_contact TEXT,
  primary_physician TEXT,
  elderly_mode INTEGER DEFAULT 0,
  onboarding_complete INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  notifications_enabled INTEGER DEFAULT 1,
  reduced_motion INTEGER DEFAULT 0,
  use_own_keys INTEGER DEFAULT 0,
  theme_preference TEXT DEFAULT 'system'
);
`;

export const CREATE_PRESCRIPTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  doctor_name TEXT,
  hospital TEXT,
  date TEXT,
  follow_up_date TEXT,
  source_image_uri TEXT,
  verification_status TEXT DEFAULT 'pending',
  overall_confidence REAL DEFAULT 0,
  patient_notes TEXT,
  treatment_status TEXT DEFAULT 'active',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_MEDICINES_TABLE = `
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  name TEXT,
  generic_name TEXT,
  brand_name TEXT,
  strength TEXT,
  form TEXT,
  dosage TEXT,
  frequency TEXT,
  meal_instruction TEXT,
  duration TEXT,
  purpose TEXT,
  side_effects TEXT DEFAULT '[]',
  food_interactions TEXT DEFAULT '[]',
  storage TEXT,
  purpose_ur TEXT,
  side_effects_ur TEXT DEFAULT '[]',
  food_interactions_ur TEXT DEFAULT '[]',
  storage_ur TEXT,
  warnings_ur TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0,
  warnings TEXT DEFAULT '[]',
  verification_status TEXT DEFAULT 'pending',
  initial_quantity REAL,
  remaining_quantity REAL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_SCHEDULES_TABLE = `
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  window_minutes INTEGER DEFAULT 120,
  timezone TEXT NOT NULL,
  frequency TEXT NOT NULL,
  meal_instruction TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  notification_id TEXT,
  created_at TEXT NOT NULL
);
`;

export const CREATE_DOSE_RECORDS_TABLE = `
CREATE TABLE IF NOT EXISTS dose_records (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  scheduled_time TEXT NOT NULL,
  actual_time TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
`;

/** Indexes for common queries */
export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_medicines_prescription ON medicines(prescription_id);`,
  `CREATE INDEX IF NOT EXISTS idx_schedules_medicine ON schedules(medicine_id);`,
  `CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_dose_records_schedule ON dose_records(schedule_id);`,
  `CREATE INDEX IF NOT EXISTS idx_dose_records_medicine ON dose_records(medicine_id);`,
  `CREATE INDEX IF NOT EXISTS idx_dose_records_scheduled ON dose_records(scheduled_time);`,
  `CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(treatment_status);`,
];

/** Migration v2 SQL */
export const ALTER_PROFILE_ADD_LANGUAGE = `
ALTER TABLE profile ADD COLUMN language TEXT DEFAULT 'en';
`;

/** Migration v3 SQL - Add settings persistence columns */
export const ALTER_PROFILE_ADD_SETTINGS = `
ALTER TABLE profile ADD COLUMN notifications_enabled INTEGER DEFAULT 1;
ALTER TABLE profile ADD COLUMN reduced_motion INTEGER DEFAULT 0;
ALTER TABLE profile ADD COLUMN theme_preference TEXT DEFAULT 'system';
`;
