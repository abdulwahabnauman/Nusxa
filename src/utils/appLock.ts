/**
 * App lock persistence + biometric helpers.
 * The PIN lives in SecureStore (hardware-backed encrypted storage) and is
 * compared directly — it never leaves the device. The enabled/biometric
 * flags sit next to it so the lock survives restarts independently of the
 * SQLite database.
 */
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Dev-only allowance: simulators have no real biometric hardware, so a
 * genuine prompt can never succeed there. Never true on real devices or
 * release builds. */
export function biometricDevBypass(): boolean {
  return __DEV__ && Constants.isDevice === false;
}

/* OS sheets (image picker, camera, share sheet, document picker) push the
 * app to the background for a moment. That transient backgrounding must not
 * trip the app lock, or returning from picking a photo lands on the PIN pad. */
let overlayExempt = false;

export function isLockExemptOverlay(): boolean {
  return overlayExempt;
}

/** Run an OS overlay call without the background lock triggering on return. */
export async function withLockExemption<T>(fn: () => Promise<T>): Promise<T> {
  overlayExempt = true;
  try {
    return await fn();
  } finally {
    overlayExempt = false;
  }
}

const ENABLED_KEY = 'nusxa_app_lock_enabled';
const PIN_KEY = 'nusxa_app_lock_pin';
const BIOMETRIC_KEY = 'nusxa_app_lock_biometric';

export const PIN_LENGTH = 4;

/** App lock counts as enabled only when both the flag and a PIN exist */
export async function isAppLockEnabled(): Promise<boolean> {
  try {
    const [enabled, pin] = await Promise.all([
      SecureStore.getItemAsync(ENABLED_KEY),
      SecureStore.getItemAsync(PIN_KEY),
    ]);
    return enabled === '1' && !!pin;
  } catch {
    return false;
  }
}

export async function enableAppLock(pin: string, preferBiometric: boolean): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await SecureStore.setItemAsync(BIOMETRIC_KEY, preferBiometric ? '1' : '0');
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
}

export async function disableAppLock(): Promise<void> {
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    return stored !== null && stored === pin;
  } catch {
    return false;
  }
}

export async function changePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function isBiometricPreferred(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricPreferred(preferred: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, preferred ? '1' : '0');
}

export interface BiometricSupport {
  /** Hardware present AND at least one fingerprint/face enrolled */
  available: boolean;
  label: 'Fingerprint' | 'Face' | 'Iris' | null;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware || !(await LocalAuthentication.isEnrolledAsync())) {
      return { available: false, label: null };
    }
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    // Android's BiometricPrompt requires BIOMETRIC_STRONG, and Samsung-style
    // face unlock is usually classified WEAK — so even when face hardware is
    // reported, the actual prompt is the fingerprint sensor. Label what the
    // user will really see: fingerprint first on Android, face first on iOS.
    const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasIris = types.includes(LocalAuthentication.AuthenticationType.IRIS);
    const label =
      Platform.OS === 'android' && hasFingerprint
        ? 'Fingerprint'
        : hasFace
          ? 'Face'
          : hasIris
            ? 'Iris'
            : 'Fingerprint';
    return { available: true, label };
  } catch {
    return { available: false, label: null };
  }
}

export interface BiometricAuthResult {
  ok: boolean;
  /** User dismissed the prompt themselves — fall back to PIN silently. */
  cancelled: boolean;
  /** iOS build lacks NSFaceIDUsageDescription — the prompt can never show. */
  misconfigured: boolean;
}

/** One biometric prompt. Only call while the app is in the foreground:
 * Android cancels BiometricPrompt instantly if the activity is not fully
 * resumed, which surfaces as a spurious "did not succeed" error. */
export async function authenticateWithBiometrics(promptMessage: string): Promise<BiometricAuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      // Keep failures inside the app: a cancelled/failed biometric check
      // returns to our own PIN pad, never to the device passcode sheet.
      disableDeviceFallback: true,
    });
    return {
      ok: result.success,
      // user_cancel is the Android cancel; iOS reports system_cancel when the
      // sheet is dismissed. Both mean "user stepped away from biometrics" —
      // fall back to the PIN pad silently instead of showing an error.
      cancelled: !result.success && (result.error === 'user_cancel' || result.error === 'system_cancel'),
      // iOS resolves instantly with this when the built app has no
      // NSFaceIDUsageDescription — attempting again just "blinks". Not in
      // the published LocalAuthenticationError union, hence the cast.
      misconfigured: !result.success && (result.error as string) === 'missing_usage_description',
    };
  } catch {
    return { ok: false, cancelled: false, misconfigured: false };
  }
}
