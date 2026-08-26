/**
 * Shared prescription persistence.
 * Used by the processing screen (quick approve with default times) and the
 * schedule screen (user-confirmed times) so both paths write identical rows.
 */
import { PrescriptionJSON } from '../ai/types';
import { DEFAULT_SCHEDULE_TIMES } from '../constants/medical';
import { createPrescription } from '../db/repositories/prescription';
import { createMedicine, getActiveMedicines, updateMedicine } from '../db/repositories/medicine';
import { createSchedule, getSchedulesByMedicine, updateSchedule } from '../db/repositories/schedule';
import { scheduleDoseNotification, cancelNotification } from './notifications';
import { getTodayISO } from './date';
import type { Medicine } from '../types/models';

export interface ScheduleDraft {
  medicineIndex: number;
  medicineName: string;
  dosage: string;
  frequency: string;
  mealInstruction: string;
  times: string[];
  /** Reminder window length in minutes from each reminder time */
  windowMinutes: number;
}

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalize = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Match an incoming medicine against the user's active list so re-scanning
 * the same prescription never creates duplicates. Names must match; strength
 * and form must also match whenever both sides know them (so Panadol 500mg
 * and Panadol 1000mg stay separate).
 */
function findExistingMatch(
  med: { name?: string | null; strength?: string | null; form?: string | null },
  existing: Medicine[]
): Medicine | undefined {
  const name = normalize(med.name);
  if (!name) return undefined;
  return existing.find((e) => {
    if (normalize(e.name) !== name) return false;
    if (normalize(med.strength) && normalize(e.strength) && normalize(e.strength) !== normalize(med.strength)) {
      return false;
    }
    if (normalize(med.form) && normalize(e.form) && normalize(e.form) !== normalize(med.form)) {
      return false;
    }
    return true;
  });
}

/** Derive sensible default reminder times from each medicine's frequency. */
export function buildDefaultSchedules(
  prescription: PrescriptionJSON
): ScheduleDraft[] {
  return prescription.medicines.map((med, i) => {
    const freq = (med.frequency ?? 'once daily').toLowerCase();
    const dailyCount =
      freq.includes('twice') || freq.includes('bid') ? 2
      : freq.includes('three') || freq.includes('tid') || freq.includes('tds') ? 3
      : freq.includes('four') || freq.includes('qid') || freq.includes('qds') ? 4
      : 1;
    const times = DEFAULT_SCHEDULE_TIMES[String(dailyCount)] ?? ['08:00'];
    return {
      medicineIndex: i,
      medicineName: med.name ?? `Medicine ${i + 1}`,
      dosage: med.dosage ?? '',
      frequency: med.frequency ?? 'Once daily',
      mealInstruction: med.meal_instruction ?? 'none',
      times: [...times],
      windowMinutes: 120,
    };
  });
}

/** Create schedule rows + reminder notifications for one medicine. */
async function armSchedules(
  medicineId: string,
  schedule: ScheduleDraft,
  timezone: string,
  startDate: string
): Promise<void> {
  for (const time of schedule.times) {
    const scheduleId = generateId();
    const notificationId = await scheduleDoseNotification({
      id: scheduleId,
      medicineId,
      medicineName: schedule.medicineName,
      dosage: schedule.dosage,
      mealInstruction: schedule.mealInstruction,
      time,
      date: new Date(),
    });

    await createSchedule({
      id: scheduleId,
      medicine_id: medicineId,
      time,
      window_minutes: schedule.windowMinutes,
      timezone,
      frequency: schedule.frequency,
      meal_instruction: (schedule.mealInstruction as any) ?? null,
      start_date: startDate,
      end_date: null,
      is_active: true,
      notification_id: notificationId,
    });
  }
}

/**
 * Persist prescription + medicines + schedules and arm reminder notifications.
 * Duplicate-safe: a medicine that already exists in the active list (same
 * name + strength/form) is updated in place and re-scheduled instead of
 * being inserted again, so scanning the same prescription twice never
 * produces redundant entries.
 */
export async function savePrescription(
  prescription: PrescriptionJSON,
  schedules: ScheduleDraft[],
  imageUri?: string | null
): Promise<{ added: number; updated: number }> {
  const today = getTodayISO();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const existing = await getActiveMedicines();

  let prescriptionId: string | null = null;
  let added = 0;
  let updated = 0;

  for (let i = 0; i < prescription.medicines.length; i++) {
    const med = prescription.medicines[i]!;
    const schedule = schedules[i];
    if (!schedule) continue;

    const match = findExistingMatch(med, existing);

    if (match) {
      // Refresh details from the new scan (inventory counts are preserved),
      // then replace the old reminders with the freshly confirmed times.
      await updateMedicine(match.id, {
        generic_name: med.generic_name ?? match.generic_name,
        brand_name: med.brand_name ?? match.brand_name,
        dosage: med.dosage ?? match.dosage,
        frequency: med.frequency ?? match.frequency,
        meal_instruction: (med.meal_instruction as any) ?? match.meal_instruction,
        duration: med.duration ?? match.duration,
        purpose: med.purpose ?? match.purpose,
        side_effects: med.side_effects?.length ? med.side_effects : match.side_effects,
        food_interactions: med.food_interactions?.length ? med.food_interactions : match.food_interactions,
        warnings: med.warnings?.length ? med.warnings : match.warnings,
        verification_status: 'verified',
      });

      const oldSchedules = await getSchedulesByMedicine(match.id);
      for (const old of oldSchedules) {
        if (old.notification_id) {
          await cancelNotification(old.notification_id);
        }
        await updateSchedule(old.id, { is_active: false });
      }

      await armSchedules(match.id, schedule, timezone, today);
      updated++;
      continue;
    }

    // New medicine — make sure we have a prescription row to attach it to.
    if (!prescriptionId) {
      prescriptionId = generateId();
      await createPrescription({
        id: prescriptionId,
        doctor_name: prescription.prescription?.doctor_name ?? null,
        hospital: prescription.prescription?.hospital ?? null,
        date: prescription.prescription?.date ?? null,
        follow_up_date: prescription.prescription?.follow_up_date ?? null,
        source_image_uri: imageUri ?? null,
        verification_status: 'verified',
        overall_confidence: prescription.overall_confidence ?? 0,
        patient_notes: null,
        treatment_status: 'active',
      });
    }

    const medicineId = generateId();
    await createMedicine({
      id: medicineId,
      prescription_id: prescriptionId,
      name: med.name ?? null,
      generic_name: med.generic_name ?? null,
      brand_name: med.brand_name ?? null,
      strength: med.strength ?? null,
      form: (med.form as any) ?? null,
      dosage: med.dosage ?? null,
      frequency: med.frequency ?? null,
      meal_instruction: (med.meal_instruction as any) ?? null,
      duration: med.duration ?? null,
      purpose: med.purpose ?? null,
      side_effects: med.side_effects ?? [],
      food_interactions: med.food_interactions ?? [],
      storage: med.storage ?? null,
      confidence: med.confidence ?? 0,
      warnings: med.warnings ?? [],
      verification_status: 'verified',
      initial_quantity: null,
      remaining_quantity: null,
    });

    await armSchedules(medicineId, schedule, timezone, today);
    added++;
  }

  return { added, updated };
}
