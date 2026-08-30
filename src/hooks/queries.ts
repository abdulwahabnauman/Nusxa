import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveMedicines, getMedicineCountsByPrescription } from '../db/repositories/medicine';
import { getAllPrescriptions, searchPrescriptions } from '../db/repositories/prescription';
import { getActiveSchedules } from '../db/repositories/schedule';
import { estimateDaysUntilRefillFromFrequency } from '../utils/inventory';
import type { Medicine, Prescription, Schedule } from '../types/models';

/**
 * Central react-query layer for the read paths that used to re-query SQLite
 * on every mount (Perf 2). Mutating screens invalidate these keys instead of
 * each managing their own loadData().
 */

export const queryKeys = {
  medicines: ['medicines'] as const,
  prescriptions: ['prescriptions'] as const,
  prescriptionList: (search: string) => ['prescriptions', 'list', search] as const,
  schedules: ['schedules'] as const,
};

export interface MedicineWithInfo extends Medicine {
  scheduleTimes: string[];
  daysUntilRefill: number | null;
}

export interface PrescriptionItem extends Prescription {
  medicineCount: number;
}

/** Active medicines enriched with schedule times + refill estimate (batched). */
export function useActiveMedicines(enabled = true) {
  return useQuery({
    queryKey: queryKeys.medicines,
    enabled,
    queryFn: async (): Promise<MedicineWithInfo[]> => {
      const [active, schedules] = await Promise.all([getActiveMedicines(), getActiveSchedules()]);
      // Group the active schedules by medicine in one pass (no per-row query)
      const timesByMedicine = new Map<string, string[]>();
      for (const sch of schedules) {
        const list = timesByMedicine.get(sch.medicine_id) ?? [];
        list.push(sch.time);
        timesByMedicine.set(sch.medicine_id, list);
      }
      return active.map((med) => ({
        ...med,
        scheduleTimes: (timesByMedicine.get(med.id) ?? []).sort(),
        daysUntilRefill:
          med.remaining_quantity !== null && med.frequency
            ? estimateDaysUntilRefillFromFrequency(med.remaining_quantity, med.frequency)
            : null,
      }));
    },
  });
}

/** Active schedules (shared by home-facing widgets that need them). */
export function useActiveSchedules(enabled = true) {
  return useQuery({
    queryKey: queryKeys.schedules,
    enabled,
    queryFn: (): Promise<Schedule[]> => getActiveSchedules(),
  });
}

/** Prescription history, optionally filtered by search. Batched counts. */
export function usePrescriptionList(searchQuery: string, enabled = true) {
  const trimmed = searchQuery.trim();
  return useQuery({
    queryKey: queryKeys.prescriptionList(trimmed),
    enabled,
    queryFn: async (): Promise<PrescriptionItem[]> => {
      const [results, counts] = await Promise.all([
        trimmed ? searchPrescriptions(trimmed) : getAllPrescriptions(),
        getMedicineCountsByPrescription(),
      ]);
      return results.map((rx) => ({ ...rx, medicineCount: counts[rx.id] ?? 0 }));
    },
  });
}

/**
 * Invalidate every read query after a mutation (dose taken, medicine
 * edited/deleted, prescription archived, etc.).
 */
export function useInvalidateData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.medicines });
    queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions });
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules });
  };
}
