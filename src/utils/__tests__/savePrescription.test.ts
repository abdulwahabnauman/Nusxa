/**
 * Unit tests for src/utils/savePrescription.ts — the fuzzy duplicate
 * matching that keeps re-scans from creating double entries, plus the
 * default schedule builder. DB + notification layers are mocked.
 */
import type { PrescriptionJSON, MedicineJSON } from '../../ai/types';
import type { Medicine, Schedule } from '../../types/models';
import {
  analyzePrescriptionDuplicates,
  buildDefaultSchedules,
  savePrescription,
  dedupeActiveMedicines,
  cleanupDeadSchedules,
  type ScheduleDraft,
} from '../savePrescription';

jest.mock('../../db/repositories/prescription', () => ({
  createPrescription: jest.fn(),
  getAllPrescriptions: jest.fn(),
  hardDeletePrescription: jest.fn(),
}));
jest.mock('../../db/repositories/medicine', () => ({
  createMedicine: jest.fn(),
  getActiveMedicines: jest.fn(),
  getAllMedicines: jest.fn(),
  updateMedicine: jest.fn(),
  hardDeleteMedicine: jest.fn(),
  getMedicinesByPrescription: jest.fn(),
}));
jest.mock('../../db/repositories/schedule', () => ({
  createSchedule: jest.fn(),
  getSchedulesByMedicine: jest.fn(),
  updateSchedule: jest.fn(),
  hardDeleteSchedule: jest.fn(),
}));
jest.mock('../../db/repositories/dose', () => ({
  getDoseRecordsBySchedule: jest.fn(),
}));
jest.mock('../notifications', () => ({
  scheduleDoseNotification: jest.fn(),
  cancelNotification: jest.fn(),
}));

import {
  createPrescription,
  getAllPrescriptions,
  hardDeletePrescription,
} from '../../db/repositories/prescription';
import {
  createMedicine,
  getActiveMedicines,
  getAllMedicines,
  updateMedicine,
  hardDeleteMedicine,
  getMedicinesByPrescription,
} from '../../db/repositories/medicine';
import {
  createSchedule,
  getSchedulesByMedicine,
  updateSchedule,
  hardDeleteSchedule,
} from '../../db/repositories/schedule';
import { getDoseRecordsBySchedule } from '../../db/repositories/dose';
import { scheduleDoseNotification, cancelNotification } from '../notifications';

const mockMedicine = (overrides: Partial<Medicine> = {}): Medicine => ({
  id: 'med-1',
  prescription_id: 'rx-1',
  name: 'Amoxicillin',
  generic_name: null,
  brand_name: null,
  strength: '500 mg',
  form: 'capsule' as Medicine['form'],
  dosage: '1 capsule',
  frequency: 'Three times daily',
  meal_instruction: 'after' as Medicine['meal_instruction'],
  duration: '7 days',
  purpose: null,
  side_effects: [],
  food_interactions: [],
  storage: null,
  confidence: 0.9,
  warnings: [],
  verification_status: 'verified',
  initial_quantity: null,
  remaining_quantity: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeMedicineJSON = (overrides: Partial<MedicineJSON> = {}): MedicineJSON => ({
  name: 'Amoxicillin',
  generic_name: null,
  brand_name: null,
  strength: '500 mg',
  form: 'capsule',
  dosage: '1 capsule',
  frequency: 'Three times daily',
  meal_instruction: 'after',
  duration: '7 days',
  original_text: null,
  purpose: null,
  side_effects: [],
  food_interactions: [],
  storage: null,
  confidence: 0.9,
  field_confidence: {},
  field_sources: {},
  warnings: [],
  verification_status: 'verified',
  ...overrides,
});

const makePrescriptionJSON = (medicines: MedicineJSON[]): PrescriptionJSON => ({
  prescription: {
    doctor_name: 'Dr. Khan',
    hospital: 'City Hospital',
    date: '2026-01-15',
    follow_up_date: null,
    source_image_id: null,
    verification_status: 'verified',
  },
  medicines,
  patient_notes: null,
  overall_confidence: 0.9,
  verification_status: 'verified',
});

const draftFor = (index: number, times: string[] = ['08:00']): ScheduleDraft => ({
  medicineIndex: index,
  medicineName: 'Amoxicillin',
  dosage: '1 capsule',
  frequency: 'Three times daily',
  mealInstruction: 'after',
  times,
  windowMinutes: 120,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getActiveMedicines as jest.Mock).mockResolvedValue([]);
  (getAllMedicines as jest.Mock).mockResolvedValue([]);
  (getAllPrescriptions as jest.Mock).mockResolvedValue([]);
  (getSchedulesByMedicine as jest.Mock).mockResolvedValue([]);
  (getDoseRecordsBySchedule as jest.Mock).mockResolvedValue([]);
  (getMedicinesByPrescription as jest.Mock).mockResolvedValue([]);
  (scheduleDoseNotification as jest.Mock).mockResolvedValue('notif-1');
  // clearAllMocks keeps implementations, so re-arm the repository mocks
  // that stateful tests override — stale ones must not leak across tests.
  (createSchedule as jest.Mock).mockResolvedValue(undefined);
  (updateSchedule as jest.Mock).mockResolvedValue(undefined);
  (hardDeleteSchedule as jest.Mock).mockResolvedValue(undefined);
});

describe('analyzePrescriptionDuplicates', () => {
  it('flags an exact-name match against the active list', async () => {
    (getActiveMedicines as jest.Mock).mockResolvedValue([mockMedicine()]);
    const result = await analyzePrescriptionDuplicates(
      makePrescriptionJSON([makeMedicineJSON()])
    );
    expect(result.matched).toEqual([true]);
    expect(result.isFullDuplicate).toBe(true);
    expect(result.matchedCount).toBe(1);
  });

  it('matches parenthetical brand labels against the generic name', async () => {
    (getActiveMedicines as jest.Mock).mockResolvedValue([mockMedicine()]);
    const result = await analyzePrescriptionDuplicates(
      makePrescriptionJSON([makeMedicineJSON({ name: 'Amoxicillin (Himiox)' })])
    );
    expect(result.matched).toEqual([true]);
  });

  it('keeps different strengths as separate medicines', async () => {
    (getActiveMedicines as jest.Mock).mockResolvedValue([
      mockMedicine({ strength: '500 mg' }),
    ]);
    const result = await analyzePrescriptionDuplicates(
      makePrescriptionJSON([makeMedicineJSON({ strength: '1000 mg' })])
    );
    expect(result.matched).toEqual([false]);
    expect(result.isFullDuplicate).toBe(false);
  });

  it('detects a previously saved prescription by the same doctor and date', async () => {
    (getAllPrescriptions as jest.Mock).mockResolvedValue([
      { doctor_name: 'Dr. Khan', date: '2026-01-15' },
    ]);
    const result = await analyzePrescriptionDuplicates(
      makePrescriptionJSON([makeMedicineJSON({ name: 'Ibuprofen' })])
    );
    expect(result.samePrescriptionOnRecord).toBe(true);
  });

  it('rejects a definite date mismatch for the same doctor', async () => {
    (getAllPrescriptions as jest.Mock).mockResolvedValue([
      { doctor_name: 'Dr. Khan', date: '2025-06-01' },
    ]);
    const result = await analyzePrescriptionDuplicates(
      makePrescriptionJSON([makeMedicineJSON({ name: 'Ibuprofen' })])
    );
    expect(result.samePrescriptionOnRecord).toBe(false);
  });
});

describe('buildDefaultSchedules', () => {
  it('derives reminder times from the frequency', () => {
    const drafts = buildDefaultSchedules(
      makePrescriptionJSON([
        makeMedicineJSON({ name: 'A', frequency: 'Twice daily' }),
        makeMedicineJSON({ name: 'B', frequency: 'TID' }),
      ])
    );
    expect(drafts[0]!.times).toEqual(['08:00', '20:00']);
    expect(drafts[1]!.times).toEqual(['08:00', '13:00', '20:00']);
  });

  it('falls back to a single morning slot for unknown frequencies', () => {
    const drafts = buildDefaultSchedules(
      makePrescriptionJSON([makeMedicineJSON({ frequency: 'whenever needed-ish' })])
    );
    expect(drafts[0]!.times).toEqual(['08:00']);
  });

  it('uses the default 120-minute reminder window', () => {
    const drafts = buildDefaultSchedules(makePrescriptionJSON([makeMedicineJSON()]));
    expect(drafts[0]!.windowMinutes).toBe(120);
  });
});

describe('savePrescription', () => {
  it('inserts a brand-new medicine with its prescription and schedules', async () => {
    const result = await savePrescription(
      makePrescriptionJSON([makeMedicineJSON()]),
      [draftFor(0, ['08:00', '20:00'])]
    );

    expect(result).toEqual({ added: 1, updated: 0 });
    expect(createPrescription).toHaveBeenCalledTimes(1);
    expect(createMedicine).toHaveBeenCalledTimes(1);
    expect(createSchedule).toHaveBeenCalledTimes(2);
    expect(scheduleDoseNotification).toHaveBeenCalledTimes(2);
    expect(updateMedicine).not.toHaveBeenCalled();
  });

  it('updates an existing match in place instead of inserting a duplicate', async () => {
    (getActiveMedicines as jest.Mock).mockResolvedValue([mockMedicine({ id: 'existing-1' })]);
    (getSchedulesByMedicine as jest.Mock).mockResolvedValue([
      { id: 'old-sched', notification_id: 'old-notif' },
    ]);

    const result = await savePrescription(
      makePrescriptionJSON([makeMedicineJSON({ name: 'Amoxicillin (Himiox)' })]),
      [draftFor(0, ['09:00'])]
    );

    expect(result).toEqual({ added: 0, updated: 1 });
    expect(createMedicine).not.toHaveBeenCalled();
    expect(createPrescription).not.toHaveBeenCalled();
    expect(updateMedicine).toHaveBeenCalledTimes(1);
    expect((updateMedicine as jest.Mock).mock.calls[0]![0]).toBe('existing-1');
    // Old reminder cancelled and its row replaced — no dose history to keep
    expect(cancelNotification).toHaveBeenCalledWith('old-notif');
    expect(hardDeleteSchedule).toHaveBeenCalledWith('old-sched');
    expect(createSchedule).toHaveBeenCalledTimes(1);
  });

  it('shares one prescription row across multiple new medicines', async () => {
    const result = await savePrescription(
      makePrescriptionJSON([
        makeMedicineJSON({ name: 'A' }),
        makeMedicineJSON({ name: 'B' }),
      ]),
      [draftFor(0), draftFor(1)]
    );

    expect(result).toEqual({ added: 2, updated: 0 });
    expect(createPrescription).toHaveBeenCalledTimes(1);
    expect(createMedicine).toHaveBeenCalledTimes(2);
  });
});

describe('savePrescription schedule replacement', () => {
  // In-memory schedules table shared by the mocked repository functions so
  // consecutive saves are observed against realistic row state.
  interface ScheduleRow {
    id: string;
    medicine_id: string;
    time: string;
    window_minutes: number;
    frequency: string;
    meal_instruction: string | null;
    is_active: boolean;
    notification_id: string | null;
    [key: string]: unknown;
  }

  const withScheduleStore = (): ScheduleRow[] => {
    const rows: ScheduleRow[] = [];
    (createSchedule as jest.Mock).mockImplementation(async (data: ScheduleRow) => {
      rows.push({ ...data });
      return { ...data };
    });
    (getSchedulesByMedicine as jest.Mock).mockImplementation(async (medicineId: string) =>
      rows.filter((r) => r.medicine_id === medicineId).map((r) => ({ ...r }))
    );
    (updateSchedule as jest.Mock).mockImplementation(
      async (id: string, patch: Record<string, unknown>) => {
        const row = rows.find((r) => r.id === id);
        if (row) Object.assign(row, patch);
      }
    );
    (hardDeleteSchedule as jest.Mock).mockImplementation(async (id: string) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    });
    (getActiveMedicines as jest.Mock).mockResolvedValue([mockMedicine({ id: 'existing-1' })]);
    return rows;
  };

  it('re-saving the same prescription does not stack schedule generations', async () => {
    const rows = withScheduleStore();

    const prescription = makePrescriptionJSON([makeMedicineJSON()]);
    await savePrescription(prescription, [draftFor(0, ['08:00', '20:00'])]);
    expect(rows).toHaveLength(2);

    await savePrescription(prescription, [draftFor(0, ['08:00', '20:00'])]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.is_active === true)).toBe(true);
    expect(cancelNotification).toHaveBeenCalledTimes(2);
  });

  it('keeps an old schedule with dose records as an inactive history row', async () => {
    const rows = withScheduleStore();

    await savePrescription(makePrescriptionJSON([makeMedicineJSON()]), [draftFor(0, ['08:00', '20:00'])]);
    const historyRow = rows.find((r) => r.time === '08:00')!;
    // The 08:00 slot has doses on record; the 20:00 slot does not
    (getDoseRecordsBySchedule as jest.Mock).mockImplementation(async (scheduleId: string) =>
      scheduleId === historyRow.id ? [{ id: 'dose-1', schedule_id: scheduleId }] : []
    );

    await savePrescription(makePrescriptionJSON([makeMedicineJSON()]), [draftFor(0, ['09:00', '21:00'])]);

    const surviving = rows.find((r) => r.id === historyRow.id);
    expect(surviving).toBeDefined();
    expect(surviving?.is_active).toBe(false);
    // Record-less old row deleted, two fresh rows armed
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.is_active).length).toBe(2);
    expect(hardDeleteSchedule).toHaveBeenCalledTimes(1);
  });

  it('reuses a kept row in place when the new draft keeps the same time', async () => {
    const rows = withScheduleStore();

    await savePrescription(makePrescriptionJSON([makeMedicineJSON()]), [draftFor(0, ['08:00', '20:00'])]);
    const historyRow = rows.find((r) => r.time === '08:00')!;
    (getDoseRecordsBySchedule as jest.Mock).mockImplementation(async (scheduleId: string) =>
      scheduleId === historyRow.id ? [{ id: 'dose-1', schedule_id: scheduleId }] : []
    );

    await savePrescription(makePrescriptionJSON([makeMedicineJSON()]), [draftFor(0, ['08:00', '20:00'])]);

    // Same row re-armed in place, not a new insert stacked on the old one
    expect(rows.find((r) => r.id === historyRow.id)?.is_active).toBe(true);
    expect(rows).toHaveLength(2);
    expect(createSchedule).toHaveBeenCalledTimes(3); // 2 on first save + 1 on re-save
    expect(updateSchedule).toHaveBeenCalledWith(historyRow.id, {
      frequency: 'Three times daily',
      meal_instruction: 'after',
      window_minutes: 120,
      is_active: true,
      notification_id: 'notif-1',
    });
  });
});

describe('cleanupDeadSchedules', () => {
  const mockSchedule = (overrides: Partial<Schedule> = {}): Schedule => ({
    id: 'sched-1',
    medicine_id: 'med-1',
    time: '08:00',
    window_minutes: 120,
    timezone: 'Asia/Karachi',
    frequency: 'Twice daily',
    meal_instruction: 'after',
    start_date: '2026-01-01',
    end_date: null,
    is_active: false,
    notification_id: 'notif-1',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('removes record-less inactive rows only and is idempotent', async () => {
    const store = [
      mockSchedule({ id: 'active', is_active: true }),
      mockSchedule({ id: 'kept', is_active: false }),
      mockSchedule({ id: 'dead', is_active: false, notification_id: 'dead-notif' }),
    ];
    (getAllMedicines as jest.Mock).mockResolvedValue([mockMedicine({ id: 'med-1' })]);
    (getSchedulesByMedicine as jest.Mock).mockImplementation(async () =>
      store.map((r) => ({ ...r }))
    );
    (hardDeleteSchedule as jest.Mock).mockImplementation(async (id: string) => {
      const index = store.findIndex((r) => r.id === id);
      if (index >= 0) store.splice(index, 1);
    });
    (getDoseRecordsBySchedule as jest.Mock).mockImplementation(async (scheduleId: string) =>
      scheduleId === 'kept' ? [{ id: 'dose-1', schedule_id: scheduleId }] : []
    );

    const removed = await cleanupDeadSchedules();

    expect(removed).toBe(1);
    expect(cancelNotification).toHaveBeenCalledWith('dead-notif');
    expect(store.map((r) => r.id)).toEqual(['active', 'kept']);
    // Active rows are never even probed for dose records
    expect(getDoseRecordsBySchedule).not.toHaveBeenCalledWith('active');

    // A second pass finds nothing left to remove
    expect(await cleanupDeadSchedules()).toBe(0);
  });
});

describe('dedupeActiveMedicines', () => {
  it('removes fuzzy duplicates while keeping the oldest copy', async () => {
    const keeper = mockMedicine({ id: 'old', created_at: '2026-01-01' });
    const twin = mockMedicine({ id: 'new', name: 'amoxicillin (himiox)', created_at: '2026-02-01' });
    (getActiveMedicines as jest.Mock).mockResolvedValue([keeper, twin]);

    const removed = await dedupeActiveMedicines();

    expect(removed).toBe(1);
    expect(hardDeleteMedicine).toHaveBeenCalledTimes(1);
    expect(hardDeleteMedicine).toHaveBeenCalledWith('new');
    // Prescription left empty by the delete is cleaned up too
    expect(hardDeletePrescription).toHaveBeenCalledWith('rx-1');
  });

  it('is a no-op on a clean list', async () => {
    (getActiveMedicines as jest.Mock).mockResolvedValue([
      mockMedicine({ id: 'a', name: 'Warfarin' }),
      mockMedicine({ id: 'b', name: 'Omeprazole' }),
    ]);

    const removed = await dedupeActiveMedicines();

    expect(removed).toBe(0);
    expect(hardDeleteMedicine).not.toHaveBeenCalled();
  });
});
