import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';
import { DB_NAME } from '../constants/config';

let db: SQLite.SQLiteDatabase | null = null;

/** Open database connection and run migrations */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // PRAGMA settings - with error handling for compatibility
    try {
      await db.execAsync('PRAGMA journal_mode = DELETE;');
    } catch {
      console.log('[DB] Could not set journal_mode, continuing...');
    }
    
    try {
      await db.execAsync('PRAGMA foreign_keys = ON;');
    } catch (error) {
      console.error('[DB] Foreign keys failed:', error);
    }
    
    await runMigrations(db);
  } catch (error) {
    console.error('[DB] Failed to initialize:', error);
    throw new Error(`Database initialization failed: ${error}`);
  }

  return db;
}

/** Get the existing database connection. Throws if not initialized. */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call openDatabase() first.');
  }
  return db;
}

/** Close the database connection */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
