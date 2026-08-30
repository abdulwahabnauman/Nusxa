import type { SQLiteBindValue } from 'expo-sqlite';
import { getDatabase } from '../database';
import type { Profile } from '../../types/models';

function parseProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as number,
    name: row.name as string | null,
    date_of_birth: row.date_of_birth as string | null,
    blood_group: row.blood_group as string | null,
    allergies: JSON.parse((row.allergies as string) || '[]'),
    emergency_contact: row.emergency_contact
      ? JSON.parse(row.emergency_contact as string)
      : null,
    primary_physician: row.primary_physician as string | null,
    elderly_mode: (row.elderly_mode as number) === 1,
    language: (row.language as string) || 'en',
    onboarding_complete: (row.onboarding_complete as number) === 1,
    notifications_enabled: (row.notifications_enabled as number) === 1,
    reduced_motion: (row.reduced_motion as number) === 1,
    reminder_escalation: row.reminder_escalation === undefined || row.reminder_escalation === null
      ? true
      : (row.reminder_escalation as number) === 1,
    eastern_numerals: (row.eastern_numerals as number) === 1,
    snooze_minutes: typeof row.snooze_minutes === 'number' ? row.snooze_minutes : 10,
    high_contrast: (row.high_contrast as number) === 1,
    use_own_keys: (row.use_own_keys as number) === 1,
    theme_preference:
      row.theme_preference === 'light' || row.theme_preference === 'dark'
        ? row.theme_preference
        : 'system',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Guarantee the singleton profile row exists without touching any values.
 * Every preference toggle persists via `UPDATE profile ... WHERE id = 1`,
 * which silently affects 0 rows when the row is missing — so toggles look
 * like they save and then "reset" after a restart. The row can legitimately
 * be absent after restoring a backup that was exported without a profile or
 * on installs upgraded across schema changes, so recreate the stub on demand.
 */
export async function ensureProfileRow(): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO profile
       (id, name, allergies, elderly_mode, onboarding_complete, language,
        notifications_enabled, reduced_motion, reminder_escalation,
        eastern_numerals, snooze_minutes, high_contrast, use_own_keys,
        theme_preference, created_at, updated_at)
     VALUES
       (1, NULL, '[]', 0, 0, 'en', 1, 0, 1, 0, 10, 0, 0, 'system', ?, ?);`,
    [now, now]
  );
}

export async function getProfile(): Promise<Profile | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM profile WHERE id = 1;'
  );
  return row ? parseProfile(row) : null;
}

export async function createProfile(
  data: Partial<Pick<Profile, 'name' | 'date_of_birth' | 'blood_group' | 'allergies' | 'emergency_contact' | 'primary_physician'> & { 
    language?: string;
    notifications_enabled?: boolean;
    reduced_motion?: boolean;
  }>
): Promise<Profile> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO profile (id, name, date_of_birth, blood_group, allergies, emergency_contact, primary_physician, elderly_mode, onboarding_complete, language, notifications_enabled, reduced_motion, theme_preference, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?);`,
    [
      data.name ?? null,
      data.date_of_birth ?? null,
      data.blood_group ?? null,
      JSON.stringify(data.allergies ?? []),
      data.emergency_contact ? JSON.stringify(data.emergency_contact) : null,
      data.primary_physician ?? null,
      data.language ?? 'en',
      data.notifications_enabled !== false ? 1 : 0,
      data.reduced_motion ? 1 : 0,
      'system', // theme_preference default
      now,
      now,
    ]
  );

  const profile = await getProfile();
  if (!profile) throw new Error('Failed to create profile');
  return profile;
}

export async function updateProfile(
  data: Partial<Omit<Profile, 'id' | 'created_at'>>
): Promise<Profile> {
  // UPDATE ... WHERE id = 1 is a silent no-op if the row vanished (restore
  // of a profile-less backup, upgrade installs) — recreate the stub first so
  // preference writes always land.
  await ensureProfileRow();
  const db = getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: SQLiteBindValue[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.date_of_birth !== undefined) {
    fields.push('date_of_birth = ?');
    values.push(data.date_of_birth);
  }
  if (data.blood_group !== undefined) {
    fields.push('blood_group = ?');
    values.push(data.blood_group);
  }
  if (data.allergies !== undefined) {
    fields.push('allergies = ?');
    values.push(JSON.stringify(data.allergies));
  }
  if (data.emergency_contact !== undefined) {
    fields.push('emergency_contact = ?');
    values.push(data.emergency_contact ? JSON.stringify(data.emergency_contact) : null);
  }
  if (data.primary_physician !== undefined) {
    fields.push('primary_physician = ?');
    values.push(data.primary_physician);
  }
  if (data.elderly_mode !== undefined) {
    fields.push('elderly_mode = ?');
    values.push(data.elderly_mode ? 1 : 0);
  }
  if (data.language !== undefined) {
    fields.push('language = ?');
    values.push(data.language);
  }
  if (data.onboarding_complete !== undefined) {
    fields.push('onboarding_complete = ?');
    values.push(data.onboarding_complete ? 1 : 0);
  }
  if (data.notifications_enabled !== undefined) {
    fields.push('notifications_enabled = ?');
    values.push(data.notifications_enabled ? 1 : 0);
  }
  if (data.reduced_motion !== undefined) {
    fields.push('reduced_motion = ?');
    values.push(data.reduced_motion ? 1 : 0);
  }
  if (data.reminder_escalation !== undefined) {
    fields.push('reminder_escalation = ?');
    values.push(data.reminder_escalation ? 1 : 0);
  }
  if (data.eastern_numerals !== undefined) {
    fields.push('eastern_numerals = ?');
    values.push(data.eastern_numerals ? 1 : 0);
  }
  if (data.snooze_minutes !== undefined) {
    fields.push('snooze_minutes = ?');
    values.push(data.snooze_minutes);
  }
  if (data.high_contrast !== undefined) {
    fields.push('high_contrast = ?');
    values.push(data.high_contrast ? 1 : 0);
  }
  if (data.use_own_keys !== undefined) {
    fields.push('use_own_keys = ?');
    values.push(data.use_own_keys ? 1 : 0);
  }
  if (data.theme_preference !== undefined) {
    fields.push('theme_preference = ?');
    values.push(data.theme_preference);
  }

  fields.push('updated_at = ?');
  values.push(now);

  if (fields.length <= 1) return (await getProfile())!;

  await db.runAsync(
    `UPDATE profile SET ${fields.join(', ')} WHERE id = 1;`,
    values
  );

  return (await getProfile())!;
}

export async function completeOnboarding(): Promise<void> {
  const db = getDatabase();
  await ensureProfileRow();
  await db.runAsync(
    'UPDATE profile SET onboarding_complete = 1, updated_at = ? WHERE id = 1;',
    [new Date().toISOString()]
  );
}

/**
 * Create-or-update the profile at the end of onboarding.
 * A profile row can already exist (upgrade installs keep the SQLite file,
 * and a legacy bug could leave a nameless row behind), in which case a plain
 * INSERT would fail on the `id = 1` uniqueness constraint and trap the user
 * on the onboarding screen forever.
 * `extras` carries the optional (skippable) health details collected during
 * onboarding — date of birth and blood group.
 */
export async function upsertProfileForOnboarding(
  name: string,
  language: string,
  extras?: { date_of_birth?: string | null; blood_group?: string | null }
): Promise<Profile> {
  const existing = await getProfile();
  if (existing) {
    await updateProfile({
      name,
      language,
      onboarding_complete: true,
      ...(extras?.date_of_birth !== undefined ? { date_of_birth: extras.date_of_birth } : {}),
      ...(extras?.blood_group !== undefined ? { blood_group: extras.blood_group } : {}),
    });
    const profile = await getProfile();
    if (!profile) throw new Error('Failed to update profile');
    return profile;
  }
  const profile = await createProfile({
    name,
    language,
    date_of_birth: extras?.date_of_birth ?? null,
    blood_group: extras?.blood_group ?? null,
  });
  await completeOnboarding();
  return { ...profile, onboarding_complete: true };
}

export async function deleteProfile(): Promise<void> {
  const db = getDatabase();
  // Foreign keys cascade will clean up related data
  await db.runAsync('DELETE FROM prescriptions;');
  await db.runAsync('DELETE FROM profile;');
}
