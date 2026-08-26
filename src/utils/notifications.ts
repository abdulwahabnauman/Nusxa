import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useSettingsStore } from '../stores/settings-store';
import { getActiveMedicines } from '../db/repositories/medicine';
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
  refillTitle: string;
  refillBody: (name: string, days: number) => string;
}

const REMINDER_COPY: Record<'en' | 'ur', ReminderCopy> = {
  en: {
    doseTitle: 'Medicine reminder',
    doseBody: (name, dosage, mealText) => `It is time to take ${name}${dosage ? ` — ${dosage}` : ''}${mealText}.`,
    snoozeTitle: 'Medicine reminder (snoozed)',
    snoozeBody: (name) => `Time to take ${name} — you snoozed this reminder.`,
    refillTitle: 'Running low on medicine',
    refillBody: (name, days) => `You have about ${days} day${days === 1 ? '' : 's'} of ${name} left — plan a refill soon.`,
  },
  ur: {
    doseTitle: 'دوا کی یاد دہانی',
    doseBody: (name, dosage) => `${name}${dosage ? ` (${dosage})` : ''} لینے کا وقت ہو گیا ہے۔`,
    snoozeTitle: 'دوا کی یاد دہانی (اسنوز)',
    snoozeBody: (name) => `${name} لینے کا وقت — آپ نے یہ یاد دہانی ملتوی کی تھی۔`,
    refillTitle: 'دوا کم ہو رہی ہے',
    refillBody: (name, days) => `${name} تقریباً ${days} دن کے لیے باقی ہے — جلد نئی خریداری کا منصوبہ بنائیں۔`,
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
 * Schedule a local notification for a medicine dose.
 * Fires exactly once at `time` — the start of the reminder window.
 * The window (window_minutes) only relaxes the displayed target range,
 * it never adds extra alerts.
 */
export async function scheduleDoseNotification(params: {
  id: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  mealInstruction: string | null;
  time: string; // HH:mm — window start
  date: Date;
}): Promise<string | null> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return null;

  const [hours, minutes] = params.time.split(':').map(Number);
  const triggerDate = new Date(params.date);
  triggerDate.setHours(hours ?? 8, minutes ?? 0, 0, 0);

  // If time has already passed today, schedule for tomorrow
  if (triggerDate.getTime() <= Date.now()) {
    triggerDate.setDate(triggerDate.getDate() + 1);
  }

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
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
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