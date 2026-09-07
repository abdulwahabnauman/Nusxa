import { type SQLiteDatabase } from 'expo-sqlite';
import {
  CURRENT_SCHEMA_VERSION,
  CREATE_PROFILE_TABLE,
  CREATE_PRESCRIPTIONS_TABLE,
  CREATE_MEDICINES_TABLE,
  CREATE_SCHEDULES_TABLE,
  CREATE_DOSE_RECORDS_TABLE,
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_INDEXES,
  ALTER_PROFILE_ADD_LANGUAGE,
} from './schema';
import {
  EDUCATION_SCHEMA,
  SAMPLE_CATEGORIES,
  SAMPLE_CONTENT,
  ADDITIONAL_CATEGORIES,
  ADDITIONAL_CONTENT,
  type EducationCategorySeed,
  type EducationContentSeed,
} from './schemas/education';

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

    await db.execAsync(`INSERT INTO schema_version (version) VALUES (1);`);
  },
};

/** Version 2: Add language preference to profile.
 * Fresh installs create the profile table WITH the language column already
 * (CREATE_PROFILE_TABLE), so the ALTER throws "duplicate column name" there.
 * Swallowing it is mandatory — an unguarded throw here aborts every later
 * migration and leaves the schema half-built (e.g. missing
 * reminder_escalation on iOS fresh installs).
 */
const migration_v2: Migration = {
  version: 2,
  up: async (db) => {
    try {
      await db.execAsync(ALTER_PROFILE_ADD_LANGUAGE);
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 2;');
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
    } catch {
      // Column may already exist
    }
    try {
      await db.runAsync('ALTER TABLE profile ADD COLUMN reduced_motion INTEGER DEFAULT 0;');
    } catch {
      // Ignore if exists
    }
    await db.runAsync('UPDATE schema_version SET version = 3;');
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

/**
 * Version 5: Education schema consistency.
 * Repair pass for devices whose stored version got stuck at 3 by the early
 * v2/v3 migrations (which never bumped the row): normalize the stored value
 * so version checks can trust it from this point on.
 */
const migration_v5: Migration = {
  version: 5,
  up: async (db) => {
    await db.runAsync(
      `UPDATE schema_version SET version = 5;`,
    );
  },
};

/** Insert categories idempotently (slugs are unique) */
async function seedCategories(
  db: SQLiteDatabase,
  list: EducationCategorySeed[]
): Promise<void> {
  for (const category of list) {
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
}

/** Insert content idempotently, resolving category refs (sort order) to real ids */
async function seedContent(
  db: SQLiteDatabase,
  list: EducationContentSeed[]
): Promise<void> {
  const categories = await db.getAllAsync<{ id: number; sort_order: number }>(
    'SELECT id, sort_order FROM education_categories ORDER BY sort_order ASC',
  );
  const idByOrder = new Map(categories.map((c) => [c.sort_order, c.id]));

  for (const content of list) {
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
}

/** Version 6: Seed education library with sample categories and content */
const migration_v6: Migration = {
  version: 6,
  up: async (db) => {
    await seedCategories(db, SAMPLE_CATEGORIES);
    await seedContent(db, SAMPLE_CONTENT);
  },
};

/**
 * Version 7: Ensure settings columns exist on upgrade installs.
 * Early builds passed schema v3 before the settings columns were part of the
 * v3 migration, so devices can sit at version 6 with a profile table that is
 * missing notifications_enabled / theme_preference ("no such column" errors
 * when saving settings). Add any missing column defensively.
 */
const migration_v7: Migration = {
  version: 7,
  up: async (db) => {
    const columns = [
      'ALTER TABLE profile ADD COLUMN notifications_enabled INTEGER DEFAULT 1;',
      'ALTER TABLE profile ADD COLUMN theme_preference TEXT DEFAULT \'system\';',
      'ALTER TABLE profile ADD COLUMN elderly_mode INTEGER DEFAULT 0;',
      'ALTER TABLE profile ADD COLUMN reduced_motion INTEGER DEFAULT 0;',
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — nothing to do
      }
    }
    await db.runAsync('UPDATE schema_version SET version = 7;');
  },
};

/**
 * Version 8: Expand the education library.
 * Early builds shipped only two sample articles; this adds the full starter
 * library (a fifth category plus ten bilingual articles). INSERT OR IGNORE
 * keeps it safe to re-run on devices that already have some of the slugs.
 */
const migration_v8: Migration = {
  version: 8,
  up: async (db) => {
    await seedCategories(db, ADDITIONAL_CATEGORIES);
    await seedContent(db, ADDITIONAL_CONTENT);
    await db.runAsync('UPDATE schema_version SET version = 8;');
  },
};

/**
 * Version 9: Eastern Arabic numeral preference.
 * Adds an `eastern_numerals` flag to the profile so the numeral style
 * choice survives restarts. Defensive ALTER keeps it safe if the column
 * already exists.
 */
const migration_v9: Migration = {
  version: 9,
  up: async (db) => {
    try {
      await db.execAsync('ALTER TABLE profile ADD COLUMN eastern_numerals INTEGER DEFAULT 0;');
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 9;');
  },
};

/**
 * Version 10: Reminder time windows.
 * Adds `window_minutes` to schedules so a reminder represents a flexible
 * window (e.g. 8:00–10:00 AM) instead of a single fixed point. `time`
 * stays the window's start; the notification still fires at the start.
 */
const migration_v10: Migration = {
  version: 10,
  up: async (db) => {
    try {
      await db.execAsync('ALTER TABLE schedules ADD COLUMN window_minutes INTEGER DEFAULT 120;');
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 10;');
  },
};

/**
 * Version 11: Per-language Learn enrichment cache.
 * The Learn detail fills thin medicine data via the AI text provider.
 * Urdu gap-fill results are cached in separate `_ur` columns so each
 * language keeps its own copy and the base (scan/English) data is
 * never overwritten.
 */
const migration_v11: Migration = {
  version: 11,
  up: async (db) => {
    const columns = [
      'ALTER TABLE medicines ADD COLUMN purpose_ur TEXT;',
      "ALTER TABLE medicines ADD COLUMN side_effects_ur TEXT DEFAULT '[]';",
      "ALTER TABLE medicines ADD COLUMN food_interactions_ur TEXT DEFAULT '[]';",
      'ALTER TABLE medicines ADD COLUMN storage_ur TEXT;',
      "ALTER TABLE medicines ADD COLUMN warnings_ur TEXT DEFAULT '[]';",
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — nothing to do
      }
    }
    await db.runAsync('UPDATE schema_version SET version = 11;');
  },
};

/**
 * Version 12: Configurable snooze + high-contrast preference.
 * Adds `snooze_minutes` and `high_contrast` to the profile, plus a tiny
 * key/value table used to throttle reminder notifications (e.g. refill
 * reminders max once per medicine per few days) so the app never nags.
 */
const migration_v12: Migration = {
  version: 12,
  up: async (db) => {
    const columns = [
      'ALTER TABLE profile ADD COLUMN snooze_minutes INTEGER DEFAULT 10;',
      'ALTER TABLE profile ADD COLUMN high_contrast INTEGER DEFAULT 0;',
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — nothing to do
      }
    }
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS reminders_state (key TEXT PRIMARY KEY, value TEXT);'
    );
    await db.runAsync('UPDATE schema_version SET version = 12;');
  },
};

/**
 * Version 13: Multi-patient support.
 * A phone can track medicines for several people: each prescription records
 * which patient it belongs to (`patient_name`), and the profile remembers
 * which patient the home screen is currently filtered to (`active_patient`,
 * 'ALL' to see everyone, null/empty for the default owner).
 */
const migration_v13: Migration = {
  version: 13,
  up: async (db) => {
    const columns = [
      'ALTER TABLE prescriptions ADD COLUMN patient_name TEXT;',
      'ALTER TABLE profile ADD COLUMN active_patient TEXT;',
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — nothing to do
      }
    }
    await db.runAsync('UPDATE schema_version SET version = 13;');
  },
};

/**
 * Version 14: Reminder escalation preference.
 * Adds `reminder_escalation` to the profile so the "escalate repeated missed
 * doses" toggle survives restarts, matching every other settings toggle.
 */
const migration_v14: Migration = {
  version: 14,
  up: async (db) => {
    try {
      await db.execAsync('ALTER TABLE profile ADD COLUMN reminder_escalation INTEGER DEFAULT 1;');
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 14;');
  },
};

/**
 * Version 15: Multi-patient support removed.
 * The app is single-user again; wipe every leftover multi-patient value.
 * The columns themselves stay (dropping columns is unreliable across the
 * SQLite versions shipped with older Android devices), but no code reads
 * or writes them anymore.
 */
const migration_v15: Migration = {
  version: 15,
  up: async (db) => {
    try {
      await db.execAsync(
        'UPDATE prescriptions SET patient_name = NULL WHERE patient_name IS NOT NULL;'
      );
    } catch {
      // Column missing — nothing to wipe
    }
    try {
      await db.execAsync(
        'UPDATE profile SET active_patient = NULL WHERE active_patient IS NOT NULL;'
      );
    } catch {
      // Column missing — nothing to wipe
    }
    await db.runAsync('UPDATE schema_version SET version = 15;');
  },
};

/**
 * Version 16: Soft-delete tombstones + analytics index.
 * Medicines and prescriptions gain a `deleted_at` column so user deletes are
 * reversible (undo) and exports stay consistent: list queries filter
 * tombstones out instead of losing rows to cascades. Also guarantees the
 * dose_records.scheduled_time index exists on databases created before it
 * was part of the v1 index set (analytics range queries).
 */
const migration_v16: Migration = {
  version: 16,
  up: async (db) => {
    const columns = [
      'ALTER TABLE medicines ADD COLUMN deleted_at TEXT;',
      'ALTER TABLE prescriptions ADD COLUMN deleted_at TEXT;',
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — nothing to do
      }
    }
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_dose_records_scheduled ON dose_records(scheduled_time);'
    );
    await db.runAsync('UPDATE schema_version SET version = 16;');
  },
};

/** v17: preference to route AI calls to the user's own provider keys */
const migration_v17: Migration = {
  version: 17,
  up: async (db) => {
    try {
      await db.execAsync('ALTER TABLE profile ADD COLUMN use_own_keys INTEGER DEFAULT 0;');
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 17;');
  },
};

/**
 * Version 18: Per-language profile name.
 * Adds `name_ur` so the Urdu-script spelling of the user's name lives in
 * its own column; edits in one app language only ever touch that language's
 * column (`name` stays the English/Latin spelling).
 */
const migration_v18: Migration = {
  version: 18,
  up: async (db) => {
    try {
      await db.execAsync('ALTER TABLE profile ADD COLUMN name_ur TEXT;');
    } catch {
      // Column already exists — nothing to do
    }
    await db.runAsync('UPDATE schema_version SET version = 18;');
  },
};

/**
 * Version 19: Repair pass for `name_ur`.
 * The final version-normalization step in runMigrations can record version
 * 18 before this ALTER ever shipped to a device (bundle swaps during dev),
 * leaving the stored version at 18 with the column still missing — after
 * which v18 is skipped forever. Verify the real schema and add the column
 * whenever it is absent, regardless of the stored version.
 */
const migration_v19: Migration = {
  version: 19,
  up: async (db) => {
    const columns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(profile);'
    );
    if (!columns.some((c) => c.name === 'name_ur')) {
      await db.execAsync('ALTER TABLE profile ADD COLUMN name_ur TEXT;');
    }
    await db.runAsync('UPDATE schema_version SET version = 19;');
  },
};

export const MIGRATIONS: Migration[] = [
  migration_v1,
  migration_v2,
  migration_v3,
  migration_v4,
  migration_v5,
  migration_v6,
  migration_v7,
  migration_v8,
  migration_v9,
  migration_v10,
  migration_v11,
  migration_v12,
  migration_v13,
  migration_v14,
  migration_v15,
  migration_v16,
  migration_v17,
  migration_v18,
  migration_v19,
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

  // Normalize the stored version: after all migrations run it must equal the
  // constant, even on installs upgraded from the buggy v2/v3 era.
  await db.runAsync('UPDATE schema_version SET version = ?;', [CURRENT_SCHEMA_VERSION]);
}
