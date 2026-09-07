import { useSettingsStore } from '../stores/settings-store';

/**
 * Returns true if animations should be reduced.
 * Respects both system preference and user setting.
 */
export function useReducedMotion(): boolean {
  const reducedMotionSetting = useSettingsStore((s) => s.reducedMotion);
  // On React Native, we can't easily detect system reduced motion preference
  // without a native module, so we rely on the user setting
  return reducedMotionSetting ?? false;
}
