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
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM profile WHERE id = 1;'
  );
  return row ? parseProfile(row) : null;
}

export async function createProfile(
  data: Partial<Pick<Profile, 'name' | 'date_of_birth' | 'blood_group' | 'allergies' | 'emergency_contact' | 'primary_physician'>>
): Promise<Profile> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO profile (id, name, date_of_birth, blood_group, allergies, emergency_contact, primary_physician, elderly_mode, onboarding_complete, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?);`,
    [
      data.name ?? null,
      data.date_of_birth ?? null,
      data.blood_group ?? null,
      JSON.stringify(data.allergies ?? []),
      data.emergency_contact ? JSON.stringify(data.emergency_contact) : null,
      data.primary_physician ?? null,
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
  const db = getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: unknown[] = [];

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
  await db.runAsync(
    'UPDATE profile SET onboarding_complete = 1, updated_at = ? WHERE id = 1;',
    [new Date().toISOString()]
  );
}

export async function deleteProfile(): Promise<void> {
  const db = getDatabase();
  // Foreign keys cascade will clean up related data
  await db.runAsync('DELETE FROM prescriptions;');
  await db.runAsync('DELETE FROM profile;');
}
