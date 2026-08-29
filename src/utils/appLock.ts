/**
 * App lock persistence + biometric helpers.
 * The PIN lives in SecureStore (hardware-backed encrypted storage) and is
 * compared directly — it never leaves the device. The enabled/biometric
 * flags sit next to it so the lock survives restarts independently of the
 * SQLite database.
 */
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

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
    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face'
      : types.includes(LocalAuthentication.AuthenticationType.IRIS)
        ? 'Iris'
        : 'Fingerprint';
    return { available: true, label };
  } catch {
    return { available: false, label: null };
  }
}

/** One biometric prompt; resolves true only on successful authentication */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      // On iOS this keeps the device passcode as FaceID's own fallback
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
