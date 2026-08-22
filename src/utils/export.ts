import { getProfile } from '../db/repositories/profile';
import { getActiveMedicines } from '../db/repositories/medicine';
import { getActiveSchedules } from '../db/repositories/schedule';
import { getTodayDoseRecords } from '../db/repositories/dose';
import { getTodayISO } from './date';
import type { Medicine, DoseRecord, Schedule, Profile } from '../types/models';

/** Export all app data as a JSON object */
export async function exportAsJSON(): Promise<Record<string, unknown>> {
  const [profile, medicines, schedules, doseRecords] = await Promise.all([
    getProfile(),
    getActiveMedicines(),
    getActiveSchedules(),
    getTodayDoseRecords(getTodayISO()),
  ]);

  return {
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0',
    profile,
    medicines,
    schedules,
    doseRecords,
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
