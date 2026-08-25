import { type SQLiteDatabase } from 'expo-sqlite';
import {
  SCHEMA_VERSION,
  CREATE_PROFILE_TABLE,
  CREATE_PRESCRIPTIONS_TABLE,
  CREATE_MEDICINES_TABLE,
  CREATE_SCHEDULES_TABLE,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_INDEXES,
  ALTER_PROFILE_ADD_LANGUAGE,
  ALTER_PROFILE_ADD_SETTINGS,
} from './schema';
import { EDUCATION_SCHEMA } from './schemas/education';

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

/** Version 1: Initial schema */
const migration_v1: Migration = {
  version: 1,
  up: async (db) => {
    await db.execAsync(CREATE_PROFILE_TABLE);
    await db.execAsync(CREATE_PRESCRIPTIONS_TABLE);
    await db.execAsync(CREATE_MEDICINES_TABLE);
    await db.execAsync(CREATE_SCHEDULES_TABLE);
    await db.execAsync(CREATE_DOSE_RECORDS_TABLE);
    await db.execAsync(CREATE_SCHEMA_VERSION_TABLE);

    for (const indexSql of CREATE_INDEXES) {
      await db.execAsync(indexSql);
    }

    await db.execAsync(`INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION});`);
  },
};

/** Version 2: Add language preference to profile */
const migration_v2: Migration = {
  version: 2,
  up: async (db) => {
    await db.execAsync(ALTER_PROFILE_ADD_LANGUAGE);
  },
};

/** Version 3: Add settings persistence columns */
const migration_v3: Migration = {
  version: 3,
  up: async (db) => {
    try {
      await db.runAsync(
        'ALTER TABLE profile ADD COLUMN elderly_mode INTEGER DEFAULT 0;',
      );
    } catch (e) {
      // Column may already exist
    }
    try {
      await db.runAsync('ALTER TABLE profile ADD COLUMN reduced_motion INTEGER DEFAULT 0;');
    } catch {
      // Ignore if exists
    }
  },
};

/** Version 4: Add education content library tables */
const migration_v4: Migration = {
  version: 4,
  up: async (db) => {
    // Create education-related tables
    await db.execAsync(EDUCATION_SCHEMA);
    
    // Update schema version to 4
    await db.runAsync(
      `UPDATE schema_version SET version = 4;`,
    );
  },
};

/** Version 5: Education schema consistency */
const migration_v5: Migration = {
  version: 5,
  up: async (db) => {
    await db.runAsync(
      `UPDATE schema_version SET version = 5;`,
    );
  },
};

export const MIGRATIONS: Migration[] = [
  migration_v1,
  migration_v2,
  migration_v3,
  migration_v4,
  migration_v5,
];

/** Run pending migrations */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Ensure schema_version table exists
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  // Get current version
  const result = await db.getFirstAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_version;'
  );
  const currentVersion = result?.version ?? 0;

  // Run pending migrations
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      await migration.up(db);
    }
  }
}

export const CURRENT_SCHEMA_VERSION = 5;
