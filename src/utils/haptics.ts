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

/** Success confirmation (saves, exports, completed flows) */
export async function successHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch { /* haptics unavailable */ }
}

/** Failure feedback (errors, failed validations) */
export async function errorHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch { /* haptics unavailable */ }
}

/** Tiny tick for selection changes (toggles, pickers, tabs) */
export async function selectionHaptic(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch { /* haptics unavailable */ }
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
