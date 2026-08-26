import { getDatabase } from '../database';
import type { Schedule } from '../../types/models';

function parseSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as string,
    medicine_id: row.medicine_id as string,
    time: row.time as string,
    window_minutes: typeof row.window_minutes === 'number' ? row.window_minutes : 120,
    timezone: row.timezone as string,
    frequency: row.frequency as string,
    meal_instruction: row.meal_instruction as Schedule['meal_instruction'],
    start_date: row.start_date as string,
    end_date: row.end_date as string | null,
    is_active: (row.is_active as number) === 1,
    notification_id: row.notification_id as string | null,
    created_at: row.created_at as string,
  };
}

export async function createSchedule(
  data: Omit<Schedule, 'created_at'>
): Promise<Schedule> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO schedules (id, medicine_id, time, window_minutes, timezone, frequency, meal_instruction, start_date, end_date, is_active, notification_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      data.id, data.medicine_id, data.time, data.window_minutes, data.timezone,
      data.frequency, data.meal_instruction, data.start_date, data.end_date,
      data.is_active ? 1 : 0, data.notification_id, now,
    ]
  );

  return { ...data, created_at: now };
}

export async function getSchedulesByMedicine(medicineId: string): Promise<Schedule[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM schedules WHERE medicine_id = ? ORDER BY time ASC;',
    [medicineId]
  );
  return rows.map(parseSchedule);
}

export async function getActiveSchedules(): Promise<Schedule[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.* FROM schedules s
     INNER JOIN medicines m ON s.medicine_id = m.id
     INNER JOIN prescriptions p ON m.prescription_id = p.id
     WHERE s.is_active = 1 AND p.treatment_status = 'active'
     ORDER BY s.time ASC;`
  );
  return rows.map(parseSchedule);
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM schedules WHERE id = ?;',
    [id]
  );
  return row ? parseSchedule(row) : null;
}

export async function updateSchedule(
  id: string,
  data: Partial<Pick<Schedule, 'time' | 'window_minutes' | 'timezone' | 'is_active' | 'notification_id' | 'end_date'>>
): Promise<void> {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'is_active') {
      fields.push(`${key} = ?`);
      values.push(value ? 1 : 0);
    } else {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  await db.runAsync(
    `UPDATE schedules SET ${fields.join(', ')} WHERE id = ?;`,
    [...values, id]
  );
}

export async function deactivateSchedulesByMedicine(medicineId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE schedules SET is_active = 0 WHERE medicine_id = ?;',
    [medicineId]
  );
}

export async function deleteSchedulesByMedicine(medicineId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM schedules WHERE medicine_id = ?;', [medicineId]);
}
