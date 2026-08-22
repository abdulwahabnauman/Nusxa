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
} from './schema';

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

/** All migrations in order */
const migrations: Migration[] = [migration_v1, migration_v2];

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
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await migration.up(db);
    }
  }
}
