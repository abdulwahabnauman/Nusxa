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
import { EDUCATION_SCHEMA, SAMPLE_CATEGORIES, SAMPLE_CONTENT } from './schemas/education';

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

/** Version 6: Seed education library with sample categories and content */
const migration_v6: Migration = {
  version: 6,
  up: async (db) => {
    // Insert categories (idempotent — slugs are unique)
    for (const category of SAMPLE_CATEGORIES) {
      await db.runAsync(
        `INSERT OR IGNORE INTO education_categories
         (slug, title_en, title_ur, description_en, description_ur, icon_name, color, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          category.slug,
          category.title_en,
          category.title_ur,
          category.description_en ?? null,
          category.description_ur ?? null,
          category.icon_name,
          category.color,
          category.sort_order,
        ],
      );
    }

    // Map sample content category refs (1-based sort order) to real category ids
    const categories = await db.getAllAsync<{ id: number; sort_order: number }>(
      'SELECT id, sort_order FROM education_categories ORDER BY sort_order ASC',
    );
    const idByOrder = new Map(categories.map((c) => [c.sort_order, c.id]));

    for (const content of SAMPLE_CONTENT) {
      const categoryId = idByOrder.get(content.category_id) ?? content.category_id;
      await db.runAsync(
        `INSERT OR IGNORE INTO education_content
         (category_id, slug, title_en, title_ur, summary_en, summary_ur, content_en, content_ur,
          read_time_minutes, is_published, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          categoryId,
          content.slug,
          content.title_en,
          content.title_ur,
          content.summary_en ?? null,
          content.summary_ur ?? null,
          content.content_en ?? null,
          content.content_ur ?? null,
          content.read_time_minutes,
          content.is_published,
          content.sort_order,
        ],
      );
    }
  },
};

export const MIGRATIONS: Migration[] = [
  migration_v1,
  migration_v2,
  migration_v3,
  migration_v4,
  migration_v5,
  migration_v6,
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

export const CURRENT_SCHEMA_VERSION = 6;
