// Must precede crypto-js: installs the globalThis.crypto CSPRNG shim that
// crypto-js captures at module load (Hermes ships no WebCrypto/Node crypto).
import './webCryptoShim';
import Constants from 'expo-constants';
import CryptoJS from 'crypto-js';
import { getDatabase } from '../db/database';
import { getProfile , ensureProfileRow } from '../db/repositories/profile';

import { getActiveMedicines } from '../db/repositories/medicine';
import { getActiveSchedules } from '../db/repositories/schedule';
import { getAllDoseRecords } from '../db/repositories/dose';
import { getAllPrescriptions } from '../db/repositories/prescription';
import { loadChatHistory, saveChatHistory } from './chatHistory';

/**
 * Wrap one backup data source so a failed read identifies itself — the
 * settings screen shows the resulting message verbatim, so a broken backup
 * says WHICH section failed instead of a generic "could not be exported".
 */
async function collect<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : String(err);
    throw new Error(`Failed reading ${label} — ${detail}`);
  }
}

/** Export all app data as a JSON object (full dose history — a real backup) */
export async function exportAsJSON(): Promise<Record<string, unknown>> {
  const [
    profile,
    prescriptions,
    medicines,
    schedules,
    doseRecords,
    kvRows,
    bookmarks,
    readingHistory,
    chatHistory,
  ] = await Promise.all([
    collect('profile', getProfile),
    collect('prescriptions', getAllPrescriptions),
    collect('medicines', getActiveMedicines),
    collect('schedules', getActiveSchedules),
    collect('dose records', getAllDoseRecords),
    // Optional sections guard themselves and degrade to empty lists
    getKVState(),
    getEducationBookmarks(),
    getEducationReadingHistory(),
    loadChatHistory(),
  ]);

  return {
    exportFormat: 'nusxa-export',
    exportVersion: 3,
    exportDate: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    profile,
    prescriptions,
    medicines,
    schedules,
    doseRecords,
    kv: kvRows,
    // Learn-tab state + AI chat transcript (audit Perf 13)
    bookmarks,
    readingHistory,
    chatHistory,
  };
}

/** Reminder/bookmark key-value state (reminders_state table) */
async function getKVState(): Promise<{ key: string; value: string }[]> {
  try {
    return await getDatabase().getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM reminders_state;'
    );
  } catch {
    return [];
  }
}

/**
 * Education bookmarks keyed by content SLUG (not the autoincrement id) so a
 * restore onto a fresh install still resolves to the right articles.
 */
async function getEducationBookmarks(): Promise<{ user_id: string; content_slug: string; added_at: string | null }[]> {
  try {
    return await getDatabase().getAllAsync<{ user_id: string; content_slug: string; added_at: string | null }>(
      `SELECT b.user_id, c.slug AS content_slug, b.added_at
       FROM education_bookmarks b
       INNER JOIN education_content c ON c.id = b.content_id;`
    );
  } catch {
    return [];
  }
}

async function getEducationReadingHistory(): Promise<{
  user_id: string;
  content_slug: string;
  last_read_position: number;
  completed_at: string | null;
  started_at: string | null;
  total_time_spent_seconds: number;
}[]> {
  try {
    return await getDatabase().getAllAsync(
      `SELECT h.user_id, c.slug AS content_slug, h.last_read_position, h.completed_at, h.started_at, h.total_time_spent_seconds
       FROM education_reading_history h
       INNER JOIN education_content c ON c.id = h.content_id;`
    );
  } catch {
    return [];
  }
}

/**
 * Encrypted backups (audit Feature 17). The full export JSON is AES-encrypted
 * with a user password (crypto-js applies PBKDF-style key stretching + salt)
 * and wrapped in a small identifiable envelope, so the user can store the
 * file anywhere — Google Drive, email, WhatsApp — without exposing PHI.
 */
export const ENCRYPTED_BACKUP_FORMAT = 'nusxa-encrypted-backup';

/** Build an encrypted backup envelope (JSON string) protected by a password */
export async function createEncryptedBackup(password: string): Promise<string> {
  const data = await exportAsJSON();
  let cipher: string;
  try {
    cipher = CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : String(err);
    throw new Error(`Encryption failed — ${detail}`);
  }
  return JSON.stringify({
    exportFormat: ENCRYPTED_BACKUP_FORMAT,
    exportVersion: 1,
    exportDate: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    cipher,
  });
}

/** True when the raw file content looks like an encrypted backup envelope */
export function isEncryptedBackup(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { exportFormat?: unknown; cipher?: unknown } | null;
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      parsed.exportFormat === ENCRYPTED_BACKUP_FORMAT &&
      typeof parsed.cipher === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Decrypt an encrypted backup envelope back into the inner export JSON.
 * Throws Error('wrong-password') when the password does not match.
 */
export function openEncryptedBackup(raw: string, password: string): string {
  try {
    const wrapper = JSON.parse(raw) as { cipher?: string };
    if (!wrapper.cipher) throw new Error('bad envelope');
    const decrypted = CryptoJS.AES.decrypt(wrapper.cipher, password).toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error('bad password');
    return decrypted;
  } catch {
    throw new Error('wrong-password');
  }
}

/** Shape of a Nusxa JSON export file (fields are untrusted until validated) */
interface NusxaExport {
  exportFormat?: string;
  exportDate?: string;
  profile?: Record<string, unknown> | null;
  prescriptions?: Record<string, unknown>[];
  medicines?: Record<string, unknown>[];
  schedules?: Record<string, unknown>[];
  doseRecords?: Record<string, unknown>[];
  kv?: Record<string, unknown>[];
  bookmarks?: Record<string, unknown>[];
  readingHistory?: Record<string, unknown>[];
  chatHistory?: Record<string, unknown>[];
}

export interface ImportResult {
  medicines: number;
  schedules: number;
  doseRecords: number;
}

/** Parse and validate a JSON export string. Throws a friendly message when invalid. */
function parseExport(raw: string): NusxaExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The selected file is not a Nusxa data export.');
  }
  const data = parsed as NusxaExport;

  for (const key of ['prescriptions', 'medicines', 'schedules', 'doseRecords'] as const) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Invalid export file: "${key}" must be a list.`);
    }
  }

  const hasAnyData =
    data.profile ||
    (data.medicines?.length ?? 0) > 0 ||
    (data.schedules?.length ?? 0) > 0 ||
    (data.doseRecords?.length ?? 0) > 0;
  if (!hasAnyData) {
    throw new Error('This file does not look like a Nusxa export (no profile, medicines or schedules found).');
  }
  return data;
}

/** Coerce untrusted export values to SQLite-bindable types */
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Restore a previously exported JSON file into the local database.
 * This REPLACES all current data and runs inside a single transaction, so a
 * malformed file can never leave the database half-restored.
 */
export async function importFromJSON(raw: string): Promise<ImportResult> {
  const data = parseExport(raw);
  const db = getDatabase();
  const now = new Date().toISOString();

  const medicines = data.medicines ?? [];
  const schedules = data.schedules ?? [];
  const doseRecords = data.doseRecords ?? [];
  const prescriptions = data.prescriptions ?? [];

  await db.withTransactionAsync(async () => {
    // Wipe current clinical data (children first — foreign keys are enabled)
    await db.execAsync('DELETE FROM dose_records;');
    await db.execAsync('DELETE FROM schedules;');
    await db.execAsync('DELETE FROM medicines;');
    await db.execAsync('DELETE FROM prescriptions;');

    // Restore prescriptions from the export…
    const prescriptionIds = new Set<string>();
    for (const p of prescriptions) {
      const id = p.id as string | undefined;
      if (!id || prescriptionIds.has(id)) continue;
      prescriptionIds.add(id);
      await db.runAsync(
        `INSERT INTO prescriptions (id, doctor_name, hospital, date, follow_up_date, source_image_uri, verification_status, overall_confidence, patient_notes, treatment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          asString(p.doctor_name),
          asString(p.hospital),
          asString(p.date),
          asString(p.follow_up_date),
          asString(p.source_image_uri),
          asString(p.verification_status) ?? 'verified',
          asNumber(p.overall_confidence) ?? 1,
          asString(p.patient_notes),
          asString(p.treatment_status) ?? 'active',
          asString(p.created_at) ?? now,
          asString(p.updated_at) ?? now,
        ]
      );
    }
    // …and synthesize placeholders for older exports that predate the
    // prescriptions field (medicines reference a prescription row, and only
    // medicines under an "active" prescription are shown in the app).
    for (const m of medicines) {
      const pid = m.prescription_id as string | undefined;
      if (!pid || prescriptionIds.has(pid)) continue;
      prescriptionIds.add(pid);
      await db.runAsync(
        `INSERT INTO prescriptions (id, doctor_name, hospital, date, follow_up_date, source_image_uri, verification_status, overall_confidence, patient_notes, treatment_status, created_at, updated_at)
         VALUES (?, NULL, NULL, NULL, NULL, NULL, 'verified', 1, NULL, 'active', ?, ?);`,
        [pid, now, now]
      );
    }

    const medicineIds = new Set<string>();
    for (const m of medicines) {
      const id = m.id as string | undefined;
      if (!id || !m.prescription_id || medicineIds.has(id)) continue;
      medicineIds.add(id);
      await db.runAsync(
        `INSERT INTO medicines (id, prescription_id, name, generic_name, brand_name, strength, form, dosage, frequency, meal_instruction, duration, purpose, side_effects, food_interactions, storage, confidence, warnings, verification_status, initial_quantity, remaining_quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          asString(m.prescription_id),
          asString(m.name),
          asString(m.generic_name),
          asString(m.brand_name),
          asString(m.strength),
          asString(m.form),
          asString(m.dosage),
          asString(m.frequency),
          asString(m.meal_instruction),
          asString(m.duration),
          asString(m.purpose),
          JSON.stringify(Array.isArray(m.side_effects) ? m.side_effects : []),
          JSON.stringify(Array.isArray(m.food_interactions) ? m.food_interactions : []),
          asString(m.storage),
          asNumber(m.confidence) ?? 1,
          JSON.stringify(Array.isArray(m.warnings) ? m.warnings : []),
          asString(m.verification_status) ?? 'verified',
          asNumber(m.initial_quantity),
          asNumber(m.remaining_quantity),
          asString(m.created_at) ?? now,
          asString(m.updated_at) ?? now,
        ]
      );
    }

    const scheduleIds = new Set<string>();
    for (const s of schedules) {
      const id = s.id as string | undefined;
      // Skip rows pointing at medicines missing from the export (FK safety)
      if (!id || !s.time || !medicineIds.has(s.medicine_id as string) || scheduleIds.has(id)) continue;
      scheduleIds.add(id);
      await db.runAsync(
        `INSERT INTO schedules (id, medicine_id, time, window_minutes, timezone, frequency, meal_instruction, start_date, end_date, is_active, notification_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          asString(s.medicine_id),
          asString(s.time),
          typeof s.window_minutes === 'number' ? s.window_minutes : 120,
          asString(s.timezone) ?? 'UTC',
          asString(s.frequency) ?? 'daily',
          asString(s.meal_instruction),
          asString(s.start_date) ?? now.slice(0, 10),
          asString(s.end_date),
          s.is_active === false ? 0 : 1,
          asString(s.notification_id),
          asString(s.created_at) ?? now,
        ]
      );
    }

    for (const d of doseRecords) {
      const id = d.id as string | undefined;
      // Skip orphan records (their schedule wasn't part of this export)
      if (!id || !d.scheduled_time || !d.status || !scheduleIds.has(d.schedule_id as string)) continue;
      await db.runAsync(
        `INSERT INTO dose_records (id, schedule_id, medicine_id, scheduled_time, actual_time, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          asString(d.schedule_id),
          asString(d.medicine_id),
          asString(d.scheduled_time),
          asString(d.actual_time),
          asString(d.status),
          asString(d.notes),
          asString(d.created_at) ?? now,
          asString(d.updated_at) ?? now,
        ]
      );
    }

    // Restore reminder/bookmark key-value state when the export includes it
    if (Array.isArray(data.kv) && data.kv.length > 0) {
      try {
        await db.execAsync('DELETE FROM reminders_state;');
        for (const row of data.kv) {
          const key = asString(row.key);
          if (!key) continue;
          await db.runAsync(
            'INSERT OR REPLACE INTO reminders_state (key, value) VALUES (?, ?);',
            [key, asString(row.value) ?? '']
          );
        }
      } catch {
        // reminders_state missing on very old installs — skip silently
      }
    }

    // Restore Learn-tab state (bookmarks + reading history), resolving the
    // exported content slugs back to local autoincrement ids.
    if (Array.isArray(data.bookmarks) || Array.isArray(data.readingHistory)) {
      try {
        const slugToId = new Map<string, number>();
        const contentRows = await db.getAllAsync<{ id: number; slug: string }>(
          'SELECT id, slug FROM education_content;'
        );
        for (const row of contentRows) slugToId.set(row.slug, row.id);

        await db.execAsync('DELETE FROM education_bookmarks;');
        for (const b of data.bookmarks ?? []) {
          const contentId = slugToId.get(asString(b.content_slug) ?? '');
          if (contentId === undefined) continue; // article no longer shipped
          await db.runAsync(
            'INSERT OR IGNORE INTO education_bookmarks (user_id, content_id, added_at) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP));',
            [asString(b.user_id) ?? 'local', contentId, asString(b.added_at)]
          );
        }

        await db.execAsync('DELETE FROM education_reading_history;');
        for (const h of data.readingHistory ?? []) {
          const contentId = slugToId.get(asString(h.content_slug) ?? '');
          if (contentId === undefined) continue;
          await db.runAsync(
            `INSERT INTO education_reading_history (user_id, content_id, last_read_position, completed_at, started_at, total_time_spent_seconds)
             VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
             ON CONFLICT(user_id, content_id) DO UPDATE SET
               last_read_position = excluded.last_read_position,
               completed_at = excluded.completed_at,
               total_time_spent_seconds = excluded.total_time_spent_seconds;`,
            [
              asString(h.user_id) ?? 'local',
              contentId,
              asNumber(h.last_read_position) ?? 0,
              asString(h.completed_at),
              asString(h.started_at),
              asNumber(h.total_time_spent_seconds) ?? 0,
            ]
          );
        }
      } catch {
        // education tables missing on very old installs — skip silently
      }
    }

    // Restore the profile last so the app state reflects the imported data.
    // Onboarding stays complete only when the imported profile actually has
    // a name — same rule the startup gate applies.
    if (data.profile) {
      const p = data.profile;
      const importedName = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null;
      const importedNameUr = typeof p.name_ur === 'string' && p.name_ur.trim() ? p.name_ur.trim() : null;
      await db.runAsync(
        `INSERT OR REPLACE INTO profile (id, name, name_ur, date_of_birth, blood_group, allergies, emergency_contact, primary_physician, elderly_mode, onboarding_complete, language, notifications_enabled, reduced_motion, reminder_escalation, eastern_numerals, snooze_minutes, high_contrast, theme_preference, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          importedName,
          importedNameUr,
          asString(p.date_of_birth),
          asString(p.blood_group),
          JSON.stringify(Array.isArray(p.allergies) ? p.allergies : []),
          p.emergency_contact ? JSON.stringify(p.emergency_contact) : null,
          asString(p.primary_physician),
          p.elderly_mode ? 1 : 0,
          (importedName || importedNameUr) && p.onboarding_complete ? 1 : 0,
          typeof p.language === 'string' ? p.language : 'en',
          p.notifications_enabled === false ? 0 : 1,
          p.reduced_motion ? 1 : 0,
          p.reminder_escalation === false ? 0 : 1,
          p.eastern_numerals ? 1 : 0,
          typeof p.snooze_minutes === 'number' ? p.snooze_minutes : 10,
          p.high_contrast ? 1 : 0,
          typeof p.theme_preference === 'string' ? p.theme_preference : 'system',
          asString(p.created_at) ?? now,
          asString(p.updated_at) ?? now,
        ]
      );
    } else {
      // Exports created before the profile existed carry profile: null —
      // recreate the stub so preference toggles keep persisting after this
      // restore instead of silently updating 0 rows.
      await ensureProfileRow();
    }
  });

  // Chat history lives in a JSON file, not SQLite — restore it after the
  // transaction so a DB failure never half-restores the transcript.
  if (Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
    const messages = data.chatHistory.filter(
      (m) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.content === 'string' &&
        (m.role === 'user' || m.role === 'assistant')
    ) as { id: string; role: 'user' | 'assistant'; content: string; timestamp?: string }[];
    await saveChatHistory(
      messages.map((m) => ({ ...m, timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString() }))
    );
  }

  return {
    medicines: medicines.length,
    schedules: schedules.length,
    doseRecords: doseRecords.length,
  };
}
