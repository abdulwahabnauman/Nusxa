import type { SQLiteBindValue } from 'expo-sqlite';
import { getDatabase } from '../database';
import type { Prescription, PrescriptionWithMedicines } from '../../types/models';
import { getMedicinesByPrescription } from './medicine';

function parsePrescription(row: Record<string, unknown>): Prescription {
  return {
    id: row.id as string,
    doctor_name: row.doctor_name as string | null,
    hospital: row.hospital as string | null,
    date: row.date as string | null,
    follow_up_date: row.follow_up_date as string | null,
    source_image_uri: row.source_image_uri as string | null,
    verification_status: row.verification_status as Prescription['verification_status'],
    overall_confidence: row.overall_confidence as number,
    patient_notes: row.patient_notes as string | null,
    treatment_status: row.treatment_status as Prescription['treatment_status'],
    deleted_at: (row.deleted_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function createPrescription(
  data: Omit<Prescription, 'created_at' | 'updated_at'>
): Promise<Prescription> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO prescriptions (id, doctor_name, hospital, date, follow_up_date, source_image_uri, verification_status, overall_confidence, patient_notes, treatment_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      data.id,
      data.doctor_name,
      data.hospital,
      data.date,
      data.follow_up_date,
      data.source_image_uri,
      data.verification_status,
      data.overall_confidence,
      data.patient_notes,
      data.treatment_status,
      now,
      now,
    ]
  );

  return { ...data, created_at: now, updated_at: now };
}

export async function getPrescription(id: string): Promise<Prescription | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM prescriptions WHERE id = ?;',
    [id]
  );
  return row ? parsePrescription(row) : null;
}

export async function getPrescriptionWithMedicines(id: string): Promise<PrescriptionWithMedicines | null> {
  const prescription = await getPrescription(id);
  if (!prescription) return null;

  const medicines = await getMedicinesByPrescription(id);
  return { ...prescription, medicines };
}

export async function getAllPrescriptions(status?: string): Promise<Prescription[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM prescriptions WHERE deleted_at IS NULL';
  const params: SQLiteBindValue[] = [];

  if (status) {
    query += ' AND treatment_status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC;';

  const rows = await db.getAllAsync<Record<string, unknown>>(query, params);
  return rows.map(parsePrescription);
}

export async function updatePrescription(
  id: string,
  data: Partial<Pick<Prescription, 'doctor_name' | 'hospital' | 'date' | 'follow_up_date' | 'verification_status' | 'overall_confidence' | 'patient_notes' | 'treatment_status' | 'source_image_uri'>>
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: SQLiteBindValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value as SQLiteBindValue);
  }

  fields.push('updated_at = ?');
  values.push(now);

  await db.runAsync(
    `UPDATE prescriptions SET ${fields.join(', ')} WHERE id = ?;`,
    [...values, id]
  );
}

/**
 * Soft delete: tombstones the prescription and every medicine on it (their
 * schedules and dose history survive underneath). Undo restores everything
 * via restorePrescription(); exports never include tombstoned rows.
 */
export async function deletePrescription(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE prescriptions SET deleted_at = ?, updated_at = ? WHERE id = ?;',
    [now, now, id]
  );
  await db.runAsync(
    'UPDATE medicines SET deleted_at = ?, updated_at = ? WHERE prescription_id = ?;',
    [now, now, id]
  );
}

/** Undo a soft delete — clears the tombstone on the prescription + medicines. */
export async function restorePrescription(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE prescriptions SET deleted_at = NULL, updated_at = ? WHERE id = ?;',
    [now, id]
  );
  await db.runAsync(
    'UPDATE medicines SET deleted_at = NULL, updated_at = ? WHERE prescription_id = ?;',
    [now, id]
  );
}

/** Hard delete for internal cleanup (dedupe) where undo is not a goal. */
export async function hardDeletePrescription(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM prescriptions WHERE id = ?;', [id]);
}

export async function archivePrescription(id: string): Promise<void> {
  await updatePrescription(id, { treatment_status: 'archived' });
}

export async function searchPrescriptions(query: string): Promise<Prescription[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM prescriptions
     WHERE deleted_at IS NULL AND (doctor_name LIKE ? OR hospital LIKE ? OR date LIKE ?)
     ORDER BY created_at DESC;`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  return rows.map(parsePrescription);
}
