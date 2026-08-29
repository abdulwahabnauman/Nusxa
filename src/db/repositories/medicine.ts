import type { SQLiteBindValue } from 'expo-sqlite';
import { getDatabase } from '../database';
import type { Medicine } from '../../types/models';

function parseMedicine(row: Record<string, unknown>): Medicine {
  return {
    id: row.id as string,
    prescription_id: row.prescription_id as string,
    name: row.name as string | null,
    generic_name: row.generic_name as string | null,
    brand_name: row.brand_name as string | null,
    strength: row.strength as string | null,
    form: row.form as Medicine['form'],
    dosage: row.dosage as string | null,
    frequency: row.frequency as string | null,
    meal_instruction: row.meal_instruction as Medicine['meal_instruction'],
    duration: row.duration as string | null,
    purpose: row.purpose as string | null,
    side_effects: JSON.parse((row.side_effects as string) || '[]'),
    food_interactions: JSON.parse((row.food_interactions as string) || '[]'),
    storage: row.storage as string | null,
    purpose_ur: (row.purpose_ur as string | null) ?? null,
    side_effects_ur: JSON.parse((row.side_effects_ur as string) || '[]'),
    food_interactions_ur: JSON.parse((row.food_interactions_ur as string) || '[]'),
    storage_ur: (row.storage_ur as string | null) ?? null,
    warnings_ur: JSON.parse((row.warnings_ur as string) || '[]'),
    confidence: row.confidence as number,
    warnings: JSON.parse((row.warnings as string) || '[]'),
    verification_status: row.verification_status as Medicine['verification_status'],
    initial_quantity: row.initial_quantity as number | null,
    remaining_quantity: row.remaining_quantity as number | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function createMedicine(
  data: Omit<Medicine, 'created_at' | 'updated_at'>
): Promise<Medicine> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO medicines (id, prescription_id, name, generic_name, brand_name, strength, form, dosage, frequency, meal_instruction, duration, purpose, side_effects, food_interactions, storage, confidence, warnings, verification_status, initial_quantity, remaining_quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      data.id, data.prescription_id, data.name, data.generic_name,
      data.brand_name, data.strength, data.form, data.dosage, data.frequency,
      data.meal_instruction, data.duration, data.purpose,
      JSON.stringify(data.side_effects), JSON.stringify(data.food_interactions),
      data.storage, data.confidence, JSON.stringify(data.warnings),
      data.verification_status, data.initial_quantity, data.remaining_quantity,
      now, now,
    ]
  );

  return { ...data, created_at: now, updated_at: now };
}

export async function getMedicine(id: string): Promise<Medicine | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM medicines WHERE id = ?;',
    [id]
  );
  return row ? parseMedicine(row) : null;
}

export async function getMedicinesByPrescription(prescriptionId: string): Promise<Medicine[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM medicines WHERE prescription_id = ? ORDER BY created_at ASC;',
    [prescriptionId]
  );
  return rows.map(parseMedicine);
}

/** Batch fetch by ids in a single query (kills per-medicine N+1 loops) */
export async function getMedicinesByIds(ids: string[]): Promise<Medicine[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const db = getDatabase();
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM medicines WHERE id IN (${placeholders});`,
    unique
  );
  return rows.map(parseMedicine);
}

export async function getActiveMedicines(): Promise<Medicine[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT m.* FROM medicines m
     INNER JOIN prescriptions p ON m.prescription_id = p.id
     WHERE p.treatment_status = 'active' AND m.verification_status = 'verified'
     ORDER BY m.created_at ASC;`
  );
  return rows.map(parseMedicine);
}

export async function updateMedicine(
  id: string,
  data: Partial<Omit<Medicine, 'id' | 'prescription_id' | 'created_at'>>
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: SQLiteBindValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (
      key === 'side_effects' || key === 'food_interactions' || key === 'warnings' ||
      key === 'side_effects_ur' || key === 'food_interactions_ur' || key === 'warnings_ur'
    ) {
      fields.push(`${key} = ?`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = ?`);
      values.push(value as SQLiteBindValue);
    }
  }

  fields.push('updated_at = ?');
  values.push(now);

  await db.runAsync(
    `UPDATE medicines SET ${fields.join(', ')} WHERE id = ?;`,
    [...values, id]
  );
}

export async function deleteMedicine(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM medicines WHERE id = ?;', [id]);
}

export async function updateInventory(
  id: string,
  remainingQuantity: number
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE medicines SET remaining_quantity = ?, updated_at = ? WHERE id = ?;',
    [remainingQuantity, new Date().toISOString(), id]
  );
}

export async function searchMedicinesByName(query: string): Promise<Medicine[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM medicines WHERE name LIKE ? OR generic_name LIKE ? OR brand_name LIKE ?
     ORDER BY created_at DESC;`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  return rows.map(parseMedicine);
}
