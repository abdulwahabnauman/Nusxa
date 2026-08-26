import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/* Android channel used for all medicine reminders */
export const DOSE_CHANNEL_ID = 'medication-reminders';

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

/** Schedule a local notification for a medicine dose */
export async function scheduleDoseNotification(params: {
  id: string;
  medicineName: string;
  dosage: string;
  mealInstruction: string | null;
  time: string; // HH:mm
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

  const notificationId = await Notifications.scheduleNotificationAsync({
    identifier: params.id,
    content: {
      title: 'Medicine reminder',
      body: `It is time to take ${params.medicineName}${params.dosage ? ` — ${params.dosage}` : ''}${mealText}.`,
      data: {
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

/** Cancel all scheduled notifications */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Get all pending scheduled notifications */
export async function getPendingNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}