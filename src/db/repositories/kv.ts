import { getDatabase } from '../database';

/**
 * Tiny key/value store (reminders_state table) used to remember state that
 * must survive restarts — currently the last time a refill reminder was
 * armed per medicine, so we never nag the user twice about the same thing.
 */

export async function getKV(key: string): Promise<string | null> {
  try {
    const row = await getDatabase().getFirstAsync<{ value: string }>(
      'SELECT value FROM reminders_state WHERE key = ?;',
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setKV(key: string, value: string): Promise<void> {
  try {
    await getDatabase().runAsync(
      'INSERT INTO reminders_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      [key, value]
    );
  } catch (error) {
    console.warn('[KV] set failed (table may not exist yet):', error);
  }
}
