import { getDatabase } from '../db/database';
import { getProfile } from '../db/repositories/profile';
import { getActiveMedicines } from '../db/repositories/medicine';
import { getActiveSchedules } from '../db/repositories/schedule';
import { getTodayDoseRecords } from '../db/repositories/dose';
import { getAllPrescriptions } from '../db/repositories/prescription';
import { getTodayISO } from './date';
import type { Medicine, DoseRecord } from '../types/models';

/** Export all app data as a JSON object */
export async function exportAsJSON(): Promise<Record<string, unknown>> {
  const [profile, prescriptions, medicines, schedules, doseRecords] = await Promise.all([
    getProfile(),
    getAllPrescriptions(),
    getActiveMedicines(),
    getActiveSchedules(),
    getTodayDoseRecords(getTodayISO()),
  ]);

  return {
    exportFormat: 'nusxa-export',
    exportVersion: 1,
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0',
    profile,
    prescriptions,
    medicines,
    schedules,
    doseRecords,
  };
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
        `INSERT INTO schedules (id, medicine_id, time, timezone, frequency, meal_instruction, start_date, end_date, is_active, notification_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          asString(s.medicine_id),
          asString(s.time),
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

    let restoredDoses = 0;
    for (const d of doseRecords) {
      const id = d.id as string | undefined;
      // Skip orphan records (their schedule wasn't part of this export)
      if (!id || !d.scheduled_time || !d.status || !scheduleIds.has(d.schedule_id as string)) continue;
      restoredDoses++;
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

    // Restore the profile last so the app state reflects the imported data.
    // Onboarding stays complete only when the imported profile actually has
    // a name — same rule the startup gate applies.
    if (data.profile) {
      const p = data.profile;
      const importedName = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null;
      await db.runAsync(
        `INSERT OR REPLACE INTO profile (id, name, date_of_birth, blood_group, allergies, emergency_contact, primary_physician, elderly_mode, onboarding_complete, language, notifications_enabled, reduced_motion, theme_preference, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          importedName,
          asString(p.date_of_birth),
          asString(p.blood_group),
          JSON.stringify(Array.isArray(p.allergies) ? p.allergies : []),
          p.emergency_contact ? JSON.stringify(p.emergency_contact) : null,
          asString(p.primary_physician),
          p.elderly_mode ? 1 : 0,
          importedName && p.onboarding_complete ? 1 : 0,
          typeof p.language === 'string' ? p.language : 'en',
          p.notifications_enabled === false ? 0 : 1,
          p.reduced_motion ? 1 : 0,
          typeof p.theme_preference === 'string' ? p.theme_preference : 'system',
          asString(p.created_at) ?? now,
          asString(p.updated_at) ?? now,
        ]
      );
    }
  });

  return {
    medicines: medicines.length,
    schedules: schedules.length,
    doseRecords: doseRecords.length,
  };
}

/** Generate a doctor visit report as formatted text */
export function generateDoctorVisitReport(params: {
  profileName: string;
  medicines: Medicine[];
  doseRecords: DoseRecord[];
  notes?: string;
}): string {
  const { profileName, medicines, doseRecords, notes } = params;
  const lines: string[] = [];

  lines.push(`Patient Visit Summary`);
  lines.push(`Patient: ${profileName}`);
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Current medicines
  lines.push('Current Medicines:');
  if (medicines.length === 0) {
    lines.push('  No active medicines.');
  } else {
    for (const med of medicines) {
      lines.push(`  - ${med.name ?? 'Unknown'} ${med.strength ? `(${med.strength})` : ''}`);
      lines.push(`    Dosage: ${med.dosage ?? 'Not specified'}, Frequency: ${med.frequency ?? 'Not specified'}`);
      lines.push(`    Duration: ${med.duration ?? 'Not specified'}, Meal: ${med.meal_instruction ?? 'None'}`);
    }
  }

  lines.push('');

  // Adherence summary
  const taken = doseRecords.filter((d) => d.status === 'taken').length;
  const missed = doseRecords.filter((d) => d.status === 'missed').length;
  const skipped = doseRecords.filter((d) => d.status === 'skipped').length;
  const total = doseRecords.length;
  const adherencePercent = total > 0 ? Math.round((taken / total) * 100) : 0;

  lines.push('Adherence Summary (app metric, not clinical):');
  lines.push(`  Total recorded doses: ${total}`);
  lines.push(`  Taken: ${taken}, Missed: ${missed}, Skipped: ${skipped}`);
  lines.push(`  Adherence rate: ${adherencePercent}%`);

  lines.push('');

  // Notes
  if (notes) {
    lines.push('Patient Notes:');
    lines.push(`  ${notes}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('This is a patient-generated summary, not an official medical record.');

  return lines.join('\n');
}
