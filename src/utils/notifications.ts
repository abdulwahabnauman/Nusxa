import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useSettingsStore } from '../stores/settings-store';
import { getActiveMedicines, getMedicine } from '../db/repositories/medicine';
import { getActiveSchedules } from '../db/repositories/schedule';
import { getTodayDoseRecords, createDoseRecord } from '../db/repositories/dose';
import { estimateDaysUntilRefillFromFrequency } from './inventory';
import { getKV, setKV } from '../db/repositories/kv';
import { getTodayISO } from './date';

/* Android channel used for all medicine reminders */
export const DOSE_CHANNEL_ID = 'medication-reminders';
/* Quieter channel for non-critical reminders (refills) — deliberately not HIGH */
export const REFILL_CHANNEL_ID = 'refill-reminders';

/** Bilingual copy for reminders, picked from the current app language. */
interface ReminderCopy {
  doseTitle: string;
  doseBody: (name: string, dosage: string, mealText: string) => string;
  snoozeTitle: string;
  snoozeBody: (name: string) => string;
  warningTitle: string;
  warningBody: (name: string) => string;
  refillTitle: string;
  refillBody: (name: string, days: number) => string;
}

const REMINDER_COPY: Record<'en' | 'ur', ReminderCopy> = {
  en: {
    doseTitle: 'Medicine reminder',
    doseBody: (name, dosage, mealText) => `It is time to take ${name}${dosage ? `, ${dosage}` : ''}${mealText}.`,
    snoozeTitle: 'Medicine reminder (snoozed)',
    snoozeBody: (name) => `Time to take ${name}. You snoozed this reminder.`,
    warningTitle: 'Medicine not taken yet',
    warningBody: (name) => `You have not taken ${name} yet. Please take it now. Once the reminder window ends, it will be marked as not taken.`,
    refillTitle: 'Running low on medicine',
    refillBody: (name, days) => `You have about ${days} day${days === 1 ? '' : 's'} of ${name} left. Plan a refill soon.`,
  },
  ur: {
    doseTitle: 'دوا کی یاد دہانی',
    doseBody: (name, dosage) => `${name}${dosage ? ` (${dosage})` : ''} لینے کا وقت ہو گیا ہے۔`,
    snoozeTitle: 'دوا کی یاد دہانی (اسنوز)',
    snoozeBody: (name) => `${name} لینے کا وقت۔ آپ نے یہ یاد دہانی ملتوی کی تھی۔`,
    warningTitle: 'دوا ابھی تک نہیں لی گئی',
    warningBody: (name) => `آپ نے ابھی تک ${name} نہیں لی۔ براہ کرم ابھی لے لیں۔ یاد دہانی کا وقت ختم ہونے پر یہ نہ لی گئی دوا شمار ہوگی۔`,
    refillTitle: 'دوا کم ہو رہی ہے',
    refillBody: (name, days) => `${name} تقریباً ${days} دن کے لیے باقی ہے۔ جلد نئی خریداری کا منصوبہ بنائیں۔`,
  },
};

function reminderCopy(): ReminderCopy {
  const language = useSettingsStore.getState().language;
  return REMINDER_COPY[language === 'ur' ? 'ur' : 'en'];
}

/** Configure notification behavior - wrapped in try/catch for safety */
export async function configureNotifications(): Promise<void> {
  try {
    // Set up notification handler with safe defaults
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Log notification receipt for debugging
        console.log('[Notifications] Received notification:', notification.request.content.title);
        
        return {
          shouldShowAlert: true,
          shouldPlaySound: Platform.OS !== 'web',
          shouldSetBadge: false,
          shouldShowBanner: Platform.OS === 'android',
          shouldShowList: true,
        };
      },
    });

    // Android requires a notification channel; create it explicitly
    // (setAndroidChannelDefaultsAsync does not exist in this SDK version)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DOSE_CHANNEL_ID, {
        name: 'Medication reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync(REFILL_CHANNEL_ID, {
        name: 'Refill reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }
  } catch (error) {
    console.error('[Notifications] Failed to configure:', error);
    // Don't crash app if notifications fail
  }
}

/** Check notification permission status */
export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule the daily repeating reminder for a medicine dose.
 * The OS re-fires it every day at `time` — even when the app is closed or
 * the device is offline — so reminders never need re-arming after day one.
 * If `time` has already passed today, the first ring happens tomorrow.
 * The window (window_minutes) only relaxes the displayed target range,
 * it never adds extra alerts.
 */
export async function scheduleDoseNotification(params: {
  id: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  mealInstruction: string | null;
  time: string; // HH:mm
}): Promise<string | null> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return null;

  const [hours, minutes] = params.time.split(':').map(Number);

  const mealText = params.mealInstruction && params.mealInstruction !== 'none'
    ? ` (${params.mealInstruction} meals)`
    : '';

  const copy = reminderCopy();

  const notificationId = await Notifications.scheduleNotificationAsync({
    identifier: params.id,
    content: {
      title: copy.doseTitle,
      body: copy.doseBody(params.medicineName, params.dosage, mealText),
      data: {
        type: 'dose',
        medicineId: params.medicineId,
        medicineName: params.medicineName,
        dosage: params.dosage,
        scheduleId: params.id,
      },
      ...(Platform.OS === 'android' ? { channelId: DOSE_CHANNEL_ID } : {}),
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours ?? 8,
      minute: minutes ?? 0,
    },
  });

  return notificationId;
}

/** Cancel a scheduled notification */
export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/** Notification identifier used for a snoozed dose's one-shot re-ring. */
export function snoozeNotificationId(scheduleId: string): string {
  return `snooze-${scheduleId}`;
}

/**
 * Schedule the one-shot re-ring for a snoozed dose. Cancelled again as soon
 * as the dose is taken or skipped, so it never fires uselessly.
 */
export async function scheduleSnoozeReminder(params: {
  scheduleId: string;
  medicineId: string;
  medicineName: string;
  at: Date;
}): Promise<string | null> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return null;

  const copy = reminderCopy();
  const identifier = snoozeNotificationId(params.scheduleId);

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: copy.snoozeTitle,
      body: copy.snoozeBody(params.medicineName),
      data: {
        type: 'dose',
        medicineId: params.medicineId,
        medicineName: params.medicineName,
        scheduleId: params.scheduleId,
      },
      ...(Platform.OS === 'android' ? { channelId: DOSE_CHANNEL_ID } : {}),
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.at,
    },
  });
}

/** How many minutes before the window closes the "still not taken" warning fires */
export const MISSED_WARNING_LEAD_MINUTES = 10;

/** Notification identifier for a schedule's end-of-window warning. */
export function missedWarningNotificationId(scheduleId: string): string {
  return `missed-warning-${scheduleId}`;
}

/** Date object for today at an "HH:mm" time, optionally shifted by minutes */
function dateForTime(time: string, extraMinutes = 0): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  if (extraMinutes !== 0) d.setTime(d.getTime() + extraMinutes * 60_000);
  return d;
}

/**
 * One-shot warning fired near the end of a slot's reminder window while the
 * dose is still pending. Cancelled again as soon as the dose is taken or
 * skipped, so it never nags about a handled dose. Re-armed per day by
 * syncDoseNotifications.
 */
export async function scheduleMissedWarning(params: {
  scheduleId: string;
  medicineId: string;
  medicineName: string;
  at: Date;
}): Promise<string | null> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return null;

  const copy = reminderCopy();

  return Notifications.scheduleNotificationAsync({
    identifier: missedWarningNotificationId(params.scheduleId),
    content: {
      title: copy.warningTitle,
      body: copy.warningBody(params.medicineName),
      data: {
        type: 'dose',
        medicineId: params.medicineId,
        medicineName: params.medicineName,
        scheduleId: params.scheduleId,
      },
      ...(Platform.OS === 'android' ? { channelId: DOSE_CHANNEL_ID } : {}),
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.at,
    },
  });
}

/**
 * Mark today's doses as missed once their reminder window has fully passed
 * without a taken/skipped decision. Runs lazily on home-screen load — the OS
 * fires reminders offline, but only the app can record the outcome, so this
 * backfill keeps the timeline and adherence honest.
 */
export async function markOverdueDosesMissed(): Promise<void> {
  try {
    const schedules = await getActiveSchedules();
    if (schedules.length === 0) return;

    const today = getTodayISO();
    const records = await getTodayDoseRecords(today);
    const handled = new Set(records.map((r) => r.schedule_id));
    const now = Date.now();

    for (const schedule of schedules) {
      if (handled.has(schedule.id)) continue;
      if (schedule.end_date !== null && schedule.end_date < today) continue;

      const windowEnd = dateForTime(schedule.time, schedule.window_minutes);
      if (windowEnd.getTime() > now) continue;

      try {
        await createDoseRecord({
          id: `missed-${schedule.id}-${today}`,
          schedule_id: schedule.id,
          medicine_id: schedule.medicine_id,
          scheduled_time: `${today}T${schedule.time}:00`,
          actual_time: null,
          status: 'missed',
          notes: null,
        });
      } catch {
        // Record may already exist from a concurrent load — safe to skip
      }
      // A snoozed re-ring for a slot that already closed is pointless
      cancelNotification(snoozeNotificationId(schedule.id)).catch(() => {});
    }
  } catch (error) {
    console.warn('[Notifications] Missed marking skipped:', error);
  }
}

/**
 * Self-healing sync for dose reminders, run on every home-screen load:
 * - keeps one daily repeating reminder per active, unexpired schedule (also
 *   repairs older installs whose one-shot reminders already fired),
 * - arms today's end-of-window warning for doses that are still pending,
 * - cancels reminders belonging to schedules that ended, were deactivated,
 *   or were deleted.
 */
export async function syncDoseNotifications(): Promise<void> {
  try {
    const enabled = useSettingsStore.getState().notificationsEnabled;
    const today = getTodayISO();
    const [schedules, records] = await Promise.all([
      getActiveSchedules(),
      getTodayDoseRecords(today),
    ]);
    const handledToday = new Set(records.map((r) => r.schedule_id));
    const now = new Date();
    const validIds = new Set<string>();

    for (const schedule of schedules) {
      const ended = schedule.end_date !== null && schedule.end_date < today;
      const warningId = missedWarningNotificationId(schedule.id);

      if (!enabled || ended) {
        await cancelNotification(schedule.id).catch(() => {});
        await cancelNotification(warningId).catch(() => {});
        continue;
      }

      validIds.add(schedule.id);

      const medicine = await getMedicine(schedule.medicine_id);
      const medicineName = medicine?.name ?? 'Your medicine';

      // Idempotent: re-registering with the same identifier replaces the
      // existing request, so this is safe to run on every load.
      await scheduleDoseNotification({
        id: schedule.id,
        medicineId: schedule.medicine_id,
        medicineName,
        dosage: medicine?.dosage ?? '',
        mealInstruction: schedule.meal_instruction,
        time: schedule.time,
      });

      // Replace any stale warning with today's — only while still pending
      await cancelNotification(warningId).catch(() => {});
      if (handledToday.has(schedule.id)) continue;

      const lead = Math.min(MISSED_WARNING_LEAD_MINUTES, Math.floor(schedule.window_minutes / 2));
      const warningAt = dateForTime(schedule.time, schedule.window_minutes - lead);
      if (warningAt.getTime() <= now.getTime()) continue;

      await scheduleMissedWarning({
        scheduleId: schedule.id,
        medicineId: schedule.medicine_id,
        medicineName,
        at: warningAt,
      });
    }

    // Drop strays: reminders whose schedule no longer exists, is inactive,
    // or has ended. Refill and snooze notifications manage their own lifecycle.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const WARNING_PREFIX = 'missed-warning-';
    for (const request of scheduled) {
      const id = String(request.identifier);
      if (id.startsWith('refill-') || id.startsWith('snooze-')) continue;
      const scheduleId = id.startsWith(WARNING_PREFIX) ? id.slice(WARNING_PREFIX.length) : id;
      if (!validIds.has(scheduleId)) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
    }
  } catch (error) {
    console.warn('[Notifications] Dose sync skipped:', error);
  }
}

/**
 * Refill reminders — deliberately quiet and throttled:
 * - only fire when ≤3 days of supply remain
 * - max once per medicine per 3 days (throttle lives in reminders_state KV)
 * - scheduled for 09:00 on a low-importance channel, never at dose times
 */
export async function syncRefillNotifications(): Promise<void> {
  try {
    const enabled = useSettingsStore.getState().notificationsEnabled;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const refillScheduled = scheduled.filter((n) => String(n.identifier).startsWith('refill-'));

    if (!enabled) {
      for (const n of refillScheduled) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
      return;
    }

    const medicines = await getActiveMedicines();
    const activeIds = new Set(medicines.map((m) => `refill-${m.id}`));

    // Drop refill reminders for medicines that no longer qualify/exist
    for (const n of refillScheduled) {
      if (!activeIds.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }

    for (const med of medicines) {
      const identifier = `refill-${med.id}`;
      const daysLeft =
        med.remaining_quantity !== null && med.remaining_quantity !== undefined && med.frequency
          ? estimateDaysUntilRefillFromFrequency(med.remaining_quantity, med.frequency)
          : null;

      if (daysLeft === null || daysLeft > 3) continue;

      // Already armed or reminded recently? Don't nag again.
      const armedKey = `refill-armed-${med.id}`;
      const lastArmed = await getKV(armedKey);
      if (lastArmed) {
        const diffDays = Math.floor((Date.now() - new Date(lastArmed).getTime()) / 86_400_000);
        if (diffDays < 3) continue;
      }

      const copy = reminderCopy();
      const triggerDate = new Date();
      triggerDate.setDate(triggerDate.getDate() + 1);
      triggerDate.setHours(9, 0, 0, 0);

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: copy.refillTitle,
          body: copy.refillBody(med.name ?? 'Your medicine', Math.max(daysLeft, 0)),
          data: { type: 'refill', medicineId: med.id },
          ...(Platform.OS === 'android' ? { channelId: REFILL_CHANNEL_ID } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      await setKV(armedKey, getTodayISO());
    }
  } catch (error) {
    console.warn('[Notifications] Refill sync skipped:', error);
  }
}

/** Cancel all scheduled notifications */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Get all pending scheduled notifications */
export async function getPendingNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}