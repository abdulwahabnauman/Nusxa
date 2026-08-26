/**
 * Shared prescription persistence.
 * Used by the processing screen (quick approve with default times) and the
 * schedule screen (user-confirmed times) so both paths write identical rows.
 */
import { PrescriptionJSON } from '../ai/types';
import { DEFAULT_SCHEDULE_TIMES } from '../constants/medical';
import { createPrescription, getAllPrescriptions, deletePrescription } from '../db/repositories/prescription';
import { createMedicine, getActiveMedicines, updateMedicine, deleteMedicine, getMedicinesByPrescription } from '../db/repositories/medicine';
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

/** Lowercase, no spaces/punctuation — "500 mg" and "500mg" compare equal */
const compact = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Canonical patient identity: trimmed + lowercased name, '' for the app's
 * default owner. Prescriptions with no patient name belong to the owner.
 */
export const patientIdentity = (name?: string | null): string => normalize(name);

/** Map of prescription id → owning patient identity (best-effort) */
async function patientByPrescriptionId(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const all = await getAllPrescriptions();
    for (const p of all) map.set(p.id, patientIdentity(p.patient_name));
  } catch {
    // Dedupe stays global when the lookup fails — safer than skipping it
  }
  return map;
}

/** Active medicines belonging to one patient ('' = the default owner) */
async function getActiveMedicinesForPatient(identity: string): Promise<Medicine[]> {
  const [active, byRx] = await Promise.all([getActiveMedicines(), patientByPrescriptionId()]);
  return active.filter((m) => (byRx.get(m.prescription_id) ?? '') === identity);
}

/** Drop parentheticals: "amoxicillin (himiox)" also matches as "amoxicillin" */
const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * All plausible identity keys for a medicine: its name, generic and brand
 * names — each both with and without parentheticals. Re-scans rarely
 * reproduce the exact same name string, so matching considers every variant.
 */
function nameVariants(med: {
  name?: string | null;
  generic_name?: string | null;
  brand_name?: string | null;
}): string[] {
  const out = new Set<string>();
  for (const raw of [med.name, med.generic_name, med.brand_name]) {
    const n = normalize(raw);
    if (!n) continue;
    const full = compact(n);
    if (full.length >= 3) out.add(full);
    const stripped = compact(stripParens(n));
    if (stripped.length >= 3) out.add(stripped);
  }
  return [...out];
}

/** Coarse form bucket so "cap"/"capsule" and "tab"/"tablet" compare equal */
function formKey(form?: string | null): string {
  const f = (form ?? '').toLowerCase();
  if (!f) return '';
  if (f.includes('capsul') || f.includes('cap')) return 'capsule';
  if (f.includes('tablet') || f.includes('tab')) return 'tablet';
  if (f.includes('syrup') || f.includes('suspension') || f.includes('solution')) return 'syrup';
  if (f.includes('inj') || f.includes('ampoule') || f.includes('ampule') || f.includes('vial')) return 'injection';
  if (f.includes('cream') || f.includes('ointment') || f.includes('gel') || f.includes('lotion')) return 'cream';
  if (f.includes('drop')) return 'drops';
  if (f.includes('inhal')) return 'inhaler';
  if (f.includes('patch')) return 'patch';
  return compact(f);
}

/**
 * Match an incoming medicine against the user's active list so re-scanning
 * the same prescription never creates duplicates. Matching is fuzzy on
 * purpose: OCR/AI rarely reproduces the identical name string twice
 * ("Amoxicillin" vs "Amoxicillin (Himiox)" vs "Himiox"), so name/generic/
 * brand variants are compared with equality or containment. Strength and
 * form must still agree whenever both sides know them, so Panadol 500mg
 * and Panadol 1000mg stay separate medicines.
 */
function findExistingMatch(
  med: {
    name?: string | null;
    generic_name?: string | null;
    brand_name?: string | null;
    strength?: string | null;
    form?: string | null;
  },
  existing: Medicine[]
): Medicine | undefined {
  const incoming = nameVariants(med);
  if (incoming.length === 0) return undefined;
  const inStrength = compact(med.strength);
  const inForm = formKey(med.form);

  return existing.find((e) => {
    const existingNames = nameVariants(e);
    const nameMatch = incoming.some((a) =>
      existingNames.some(
        (b) =>
          a === b ||
          // "amoxicillin" vs "amoxicillintrihydrate": containment counts when
          // the shorter side is long enough to be meaningful (keeps
          // "vitamin d" and "vitamin d3" separate)
          (Math.min(a.length, b.length) >= 10 && (a.includes(b) || b.includes(a)))
      )
    );
    if (!nameMatch) return false;
    if (inStrength && compact(e.strength) && compact(e.strength) !== inStrength) return false;
    if (inForm && formKey(e.form) && formKey(e.form) !== inForm) return false;
    return true;
  });
}

/**
 * Pre-save duplicate analysis for the review screen. Tells the UI which
 * incoming medicines already exist (so re-scanning the same prescription
 * can be flagged up front instead of looking like a fresh add), and whether
 * the exact same prescription (same doctor + date) was scanned before.
 */
export interface DuplicateAnalysis {
  /** Per incoming medicine: true when it matches an existing active medicine */
  matched: boolean[];
  matchedCount: number;
  total: number;
  /** Every incoming medicine already exists in the active list */
  isFullDuplicate: boolean;
  /** A saved prescription shares the same doctor (and date when both known) */
  samePrescriptionOnRecord: boolean;
}

export async function analyzePrescriptionDuplicates(
  prescription: PrescriptionJSON,
  patientName?: string | null
): Promise<DuplicateAnalysis> {
  // Scope the comparison to the selected patient so the same medicine for
  // two different people is never mistaken for a duplicate.
  const existing = await getActiveMedicinesForPatient(patientIdentity(patientName));
  const matched = prescription.medicines.map((med) => !!findExistingMatch(med, existing));
  const matchedCount = matched.filter(Boolean).length;
  const total = prescription.medicines.length;

  let samePrescriptionOnRecord = false;
  try {
    const doctor = normalize(prescription.prescription?.doctor_name);
    const date = normalize(prescription.prescription?.date);
    if (doctor) {
      const saved = await getAllPrescriptions();
      samePrescriptionOnRecord = saved.some((p) => {
        if (normalize(p.doctor_name) !== doctor) return false;
        // Dates may be missing or free-text; only reject on a definite mismatch
        if (date && normalize(p.date) && normalize(p.date) !== date) return false;
        return true;
      });
    }
  } catch {
    // Detection is best-effort; never block the review flow on it
  }

  return {
    matched,
    matchedCount,
    total,
    isFullDuplicate: total > 0 && matchedCount === total,
    samePrescriptionOnRecord,
  };
}

/**
 * Cleanup for duplicates created before fuzzy matching existed. Walks the
 * active list oldest-first; any medicine that fuzzy-matches an older kept
 * one is removed (schedules/dose records cascade-delete, pending
 * notifications are cancelled first). Matching only happens WITHIN the same
 * patient, so two people taking the same medicine keep separate entries.
 * Prescriptions left with no medicines are dropped as well. Idempotent — a
 * no-op once the list is clean.
 */
export async function dedupeActiveMedicines(): Promise<number> {
  const active = await getActiveMedicines();
  const byRx = await patientByPrescriptionId();
  // One kept-list per patient so cross-patient twins never merge
  const kept = new Map<string, Medicine[]>();
  let removed = 0;

  for (const med of active) {
    const patient = byRx.get(med.prescription_id) ?? '';
    const keptForPatient = kept.get(patient) ?? [];
    const twin = findExistingMatch(med, keptForPatient);
    if (!twin) {
      keptForPatient.push(med);
      kept.set(patient, keptForPatient);
      continue;
    }

    const schedules = await getSchedulesByMedicine(med.id);
    for (const s of schedules) {
      if (s.notification_id) {
        try {
          await cancelNotification(s.notification_id);
        } catch {
          // Notification already gone — nothing to cancel
        }
      }
    }

    const prescriptionId = med.prescription_id;
    await deleteMedicine(med.id);
    removed++;

    try {
      const remaining = await getMedicinesByPrescription(prescriptionId);
      if (remaining.length === 0) await deletePrescription(prescriptionId);
    } catch {
      // Cosmetic cleanup only — never fail the dedupe over it
    }
  }

  return removed;
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
 * Duplicate-safe: a medicine that already exists in the SAME patient's active
 * list (same name + strength/form) is updated in place and re-scheduled
 * instead of being inserted again, so scanning the same prescription twice
 * never produces redundant entries — while different patients keep their own
 * copies of identically-named medicines.
 */
export async function savePrescription(
  prescription: PrescriptionJSON,
  schedules: ScheduleDraft[],
  imageUri?: string | null,
  patientName?: string | null
): Promise<{ added: number; updated: number }> {
  const today = getTodayISO();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const patient = (patientName ?? '').trim();
  const existing = await getActiveMedicinesForPatient(patientIdentity(patient));

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
        patient_name: patient || null,
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
