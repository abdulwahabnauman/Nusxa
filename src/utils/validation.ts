import type { MedicineJSON } from '../ai/types';

/** Required fields for a medicine to be schedulable */
const REQUIRED_FIELDS: (keyof MedicineJSON)[] = ['name', 'dosage', 'frequency', 'duration'];

/** Check if a medicine has all required fields filled */
export function isMedicineComplete(medicine: MedicineJSON): boolean {
  return REQUIRED_FIELDS.every((field) => {
    const value = medicine[field];
    return value !== null && value !== undefined && value !== '';
  });
}

/** Get list of missing required field names */
export function getMissingFields(medicine: MedicineJSON): string[] {
  return REQUIRED_FIELDS.filter((field) => {
    const value = medicine[field];
    return value === null || value === undefined || value === '';
  });
}

/** Check for duplicate medicine names */
export function findDuplicateMedicines(medicines: MedicineJSON[]): string[] {
  const nameMap = new Map<string, number>();
  const duplicates: string[] = [];

  for (const med of medicines) {
    if (med.name) {
      const key = med.name.toLowerCase().trim();
      const count = (nameMap.get(key) ?? 0) + 1;
      nameMap.set(key, count);
      if (count === 2) duplicates.push(med.name);
    }
  }

  return duplicates;
}

/** Check for conflicting schedule times */
export function findScheduleConflicts(
  schedules: Array<{ medicineName: string; time: string }>
): Array<{ medicine1: string; medicine2: string; time: string }> {
  const conflicts: Array<{ medicine1: string; medicine2: string; time: string }> = [];
  const timeMap = new Map<string, string[]>();

  for (const sch of schedules) {
    const existing = timeMap.get(sch.time) ?? [];
    existing.push(sch.medicineName);
    timeMap.set(sch.time, existing);
  }

  for (const [time, medicines] of timeMap) {
    if (medicines.length > 1) {
      for (let i = 0; i < medicines.length - 1; i++) {
        conflicts.push({
          medicine1: medicines[i]!,
          medicine2: medicines[i + 1]!,
          time,
        });
      }
    }
  }

  return conflicts;
}

/** Validate time format HH:MM */
export function isValidTimeFormat(time: string): boolean {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}
