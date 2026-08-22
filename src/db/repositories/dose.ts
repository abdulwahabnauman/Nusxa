import { getDatabase } from '../database';
import type { DoseRecord, DoseStatus } from '../../types/models';

function parseDoseRecord(row: Record<string, unknown>): DoseRecord {
  return {
    id: row.id as string,
    schedule_id: row.schedule_id as string,
    medicine_id: row.medicine_id as string,
    scheduled_time: row.scheduled_time as string,
    actual_time: row.actual_time as string | null,
    status: row.status as DoseStatus,
    notes: row.notes as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function createDoseRecord(
  data: Omit<DoseRecord, 'created_at' | 'updated_at'>
): Promise<DoseRecord> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO dose_records (id, schedule_id, medicine_id, scheduled_time, actual_time, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      data.id, data.schedule_id, data.medicine_id,
      data.scheduled_time, data.actual_time, data.status, data.notes,
      now, now,
    ]
  );

  return { ...data, created_at: now, updated_at: now };
}

export async function getDoseRecord(id: string): Promise<DoseRecord | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM dose_records WHERE id = ?;',
    [id]
  );
  return row ? parseDoseRecord(row) : null;
}

export async function getDoseRecordsBySchedule(scheduleId: string): Promise<DoseRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dose_records WHERE schedule_id = ? ORDER BY scheduled_time DESC;',
    [scheduleId]
  );
  return rows.map(parseDoseRecord);
}

export async function getDoseRecordsByMedicine(medicineId: string): Promise<DoseRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dose_records WHERE medicine_id = ? ORDER BY scheduled_time DESC;',
    [medicineId]
  );
  return rows.map(parseDoseRecord);
}

export async function getTodayDoseRecords(dateStr: string): Promise<DoseRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM dose_records
     WHERE scheduled_time LIKE ?
     ORDER BY scheduled_time ASC;`,
    [`${dateStr}%`]
  );
  return rows.map(parseDoseRecord);
}

export async function getDoseRecordsForDateRange(
  startDate: string,
  endDate: string
): Promise<DoseRecord[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM dose_records
     WHERE scheduled_time >= ? AND scheduled_time <= ?
     ORDER BY scheduled_time ASC;`,
    [startDate, endDate]
  );
  return rows.map(parseDoseRecord);
}

export async function updateDoseRecord(
  id: string,
  data: Partial<Pick<DoseRecord, 'actual_time' | 'status' | 'notes'>>
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  fields.push('updated_at = ?');
  values.push(now);

  await db.runAsync(
    `UPDATE dose_records SET ${fields.join(', ')} WHERE id = ?;`,
    [...values, id]
  );
}

export async function recordDoseTaken(
  scheduleId: string,
  medicineId: string,
  scheduledTime: string
): Promise<DoseRecord> {
  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return createDoseRecord({
    id,
    schedule_id: scheduleId,
    medicine_id: medicineId,
    scheduled_time: scheduledTime,
    actual_time: now,
    status: 'taken',
    notes: null,
  });
}

export async function recordDoseSkipped(
  scheduleId: string,
  medicineId: string,
  scheduledTime: string,
  reason?: string
): Promise<DoseRecord> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return createDoseRecord({
    id,
    schedule_id: scheduleId,
    medicine_id: medicineId,
    scheduled_time: scheduledTime,
    actual_time: new Date().toISOString(),
    status: 'skipped',
    notes: reason ?? null,
  });
}

export async function deleteDoseRecord(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM dose_records WHERE id = ?;', [id]);
}

/** Get adherence stats for a date range */
export async function getAdherenceStats(
  startDate: string,
  endDate: string
): Promise<{ total: number; taken: number; skipped: number; missed: number; pending: number }> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM dose_records
     WHERE scheduled_time >= ? AND scheduled_time <= ?
     GROUP BY status;`,
    [startDate, endDate]
  );

  const stats = { total: 0, taken: 0, skipped: 0, missed: 0, pending: 0 };
  for (const row of rows) {
    const count = row.count as number;
    stats.total += count;
    if (row.status === 'taken') stats.taken = count;
    else if (row.status === 'skipped') stats.skipped = count;
    else if (row.status === 'missed') stats.missed = count;
    else if (row.status === 'pending') stats.pending = count;
  }

  return stats;
}
