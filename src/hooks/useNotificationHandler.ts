import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

/**
 * Hook that listens for notification taps and navigates
 * to the relevant medicine detail screen.
 */
export function useNotificationResponseHandler() {
  const router = useRouter();
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.medicineId) {
          router.push(`/medicine/${data.medicineId}`);
        }
      }
    );

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
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
