import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { upsertDoseStatus } from '../db/repositories/dose';
import { getMedicine, updateInventory } from '../db/repositories/medicine';
import { getTodayISO } from '../utils/date';
import { useSettingsStore } from '../stores/settings-store';
import {
  ACTION_SNOOZE,
  ACTION_TAKE,
  cancelNotification,
  escalationNotificationId,
  missedWarningNotificationId,
  scheduleSnoozeReminder,
  snoozeNotificationId,
} from '../utils/notifications';

/**
 * Act on the notification quick actions: mark the dose taken or snooze the
 * reminder without ever opening the corresponding screen.
 */
async function handleDoseAction(actionIdentifier: string, data: Record<string, unknown> | undefined): Promise<boolean> {
  const scheduleId = typeof data?.scheduleId === 'string' ? data.scheduleId : null;
  const medicineId = typeof data?.medicineId === 'string' ? data.medicineId : null;
  if (!scheduleId || !medicineId) return false;

  try {
    if (actionIdentifier === ACTION_TAKE) {
      const today = getTodayISO();
      const now = new Date();
      await upsertDoseStatus(scheduleId, medicineId, `${today}T${now.toTimeString().slice(0, 5)}`, 'taken');
      // Decrement inventory, best-effort, same as tapping Taken on Home
      try {
        const med = await getMedicine(medicineId);
        if (med && med.remaining_quantity !== null && med.remaining_quantity > 0) {
          await updateInventory(medicineId, med.remaining_quantity - 1);
        }
      } catch { /* inventory tracking is best-effort */ }
      // No point ringing again for a dose that is already handled
      cancelNotification(snoozeNotificationId(scheduleId)).catch(() => {});
      cancelNotification(missedWarningNotificationId(scheduleId)).catch(() => {});
      cancelNotification(escalationNotificationId(scheduleId)).catch(() => {});
      return true;
    }

    if (actionIdentifier === ACTION_SNOOZE) {
      const minutes = useSettingsStore.getState().snoozeMinutes;
      const medicineName = typeof data?.medicineName === 'string' ? data.medicineName : '';
      await scheduleSnoozeReminder({
        scheduleId,
        medicineId,
        medicineName,
        at: new Date(Date.now() + minutes * 60_000),
      });
      return true;
    }
  } catch (error) {
    console.warn('[Notifications] Action handling skipped:', error);
  }
  return false;
}

/**
 * Hook that listens for notification taps and navigates
 * to the relevant medicine detail screen.
 */
export function useNotificationResponseHandler() {
  const router = useRouter();
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        // Quick actions are handled in place; only a plain tap navigates
        const handled = await handleDoseAction(response.actionIdentifier, data);
        if (handled) return;
        if (data?.medicineId) {
          router.push(`/medicine/${data.medicineId}`);
        }
      }
    );

    return () => {
      responseListener.current?.remove();
    };
  }, [router]);
}

/**
 * Hook that configures notification behavior for foreground/background.
 * Should be called once in the root layout.
 */
export function useNotificationSetup() {
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);
}