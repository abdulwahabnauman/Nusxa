import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Shared permission gating. Every feature that needs camera or notifications
 * goes through ensurePermission() instead of hand-rolled per-screen logic, so
 * the retry rules stay identical everywhere:
 *
 * - Granted          → proceed immediately.
 * - Denied but the OS still lets us ask (canAskAgain) → prompt again RIGHT
 *   THEN. Every attempt re-prompts — once, twice, every time — until the user
 *   grants it or the OS stops offering the dialog.
 * - canAskAgain is false (permanently denied) → only NOW is the "go to
 *   settings" fallback appropriate; isPermanentlyDenied() tells the caller.
 */
export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

/** True once the OS will no longer show the prompt — settings is the only path. */
export function isPermanentlyDenied(state: PermissionState | null | undefined): boolean {
  return !!state && !state.granted && !state.canAskAgain;
}

/**
 * Retry-aware permission gate. `current` is the last known permission state
 * (null when never checked); `request` re-shows the OS prompt. While
 * canAskAgain is true the prompt is shown on every call — no artificial
 * "asked once" bookkeeping. Returns the (possibly refreshed) state; callers
 * decide what to show when isPermanentlyDenied(result) is true.
 */
export async function ensurePermission<T extends PermissionState>(
  current: PermissionState | null | undefined,
  request: () => Promise<T>,
): Promise<PermissionState> {
  if (current?.granted) return current;
  if (isPermanentlyDenied(current)) return current as PermissionState;
  // Never asked, or denied while the OS still allows re-prompting
  return request();
}

/** Notification variant for places without a permission hook (settings, home). */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  return ensurePermission(current, () => Notifications.requestPermissionsAsync());
}

/** Best-effort deep link into the app's system settings page. */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Some launchers lack the settings intent — ignore
  }
}
