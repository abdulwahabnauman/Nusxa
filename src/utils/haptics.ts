/**
 * Haptic feedback helpers.
 * Best-effort everywhere — a haptic failure must never break an action.
 */

import * as Haptics from 'expo-haptics';

/** Light confirmation for logging a dose (taken/skipped) */
export async function doseHaptic(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* haptics unavailable (simulator/Expo Go quirks) */ }
}

/** Celebration pattern for streak milestones and finishing all doses */
export async function milestoneHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Small double-tap feel
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 180);
  } catch { /* haptics unavailable */ }
}
