/**
 * App lock gate — rendered INSTEAD of the app stack when the lock is
 * active. Unlocks via biometric prompt (auto on mount when preferred) or
 * a verified PIN. Five wrong PINs trigger a 30-second lockout so the pad
 * cannot be brute-forced.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { spacing } from '../../theme/spacing';
import { PinKeypad } from './PinKeypad';
import {
  PIN_LENGTH,
  authenticateWithBiometrics,
  biometricDevBypass,
  getBiometricSupport,
  isBiometricPreferred,
  verifyPin,
} from '../../utils/appLock';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const { colors, typography: typ } = useTheme();
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricPreferred, setBiometricPreferred] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);
  // Set when the OS reports biometrics can NEVER prompt in this build (iOS
  // without NSFaceIDUsageDescription). Retrying just makes the screen blink,
  // so attempts stop until the next mount and the PIN pad takes over.
  const [biometricBroken, setBiometricBroken] = useState(false);
  const brokenRef = useRef(false);
  const [prompting, setPrompting] = useState(false);
  const verifying = useRef(false);
  const promptingRef = useRef(false);
  const mountedRef = useRef(true);

  // Ignore late biometric results once the gate unmounts: a prompt that was
  // pending when the user unlocked via PIN must not unlock a LATER lock.
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const lockedOut = lockoutUntil !== null && lockoutUntil > now;
  const lockoutRemaining = lockoutUntil
    ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000))
    : 0;

  // Tick the countdown while a lockout is active
  useEffect(() => {
    if (!lockedOut) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedOut]);

  const tryBiometric = useCallback(async (interactive: boolean, bypassPrefCheck = false) => {
    if (promptingRef.current) return;
    if (brokenRef.current) return;
    // Android cancels BiometricPrompt instantly when the activity is not
    // fully resumed — and on re-lock the app can still be mid-resume (the
    // RN AppState 'active' event trails the visible foreground by seconds).
    // Prompting then surfaces a spurious "did not succeed" error, so skip
    // silently and let the AppState listener retry once we're really active.
    if (AppState.currentState !== 'active') return;
    promptingRef.current = true;
    setPrompting(true);
    // A fresh attempt invalidates any stale failure message from a previous
    // lock cycle — otherwise the old error sits on screen like a bug.
    setError(null);
    try {
      // The Settings "Unlock with biometrics" toggle is authoritative: when
      // it is off, biometric unlock is fully disabled — no auto-prompt AND
      // no manual button. Read fresh from SecureStore (not the in-memory
      // state) so a toggle flip takes effect on the very next lock. An
      // explicit tap on a visible button bypasses this: the button only
      // renders when biometrics are preferred.
      if (!bypassPrefCheck && !(await isBiometricPreferred())) return;
      const authPromise = authenticateWithBiometrics('Unlock Nusxa');
      // Real hardware ALWAYS resolves the prompt (success / cancel / error),
      // however long the user takes placing their finger — so await it fully.
      // The old 8s race timed out first on slow attempts, showed a bogus
      // "did not succeed" error while the prompt was still up, and discarded
      // the later genuine success ("biometrics only work once"). Only
      // simulators can hang forever, so keep the safety timeout there alone.
      const result = biometricDevBypass()
        ? await Promise.race([
            authPromise,
            new Promise<{ ok: boolean; cancelled: boolean; misconfigured: boolean }>((resolve) =>
              setTimeout(() => resolve({ ok: false, cancelled: false, misconfigured: false }), 8_000)
            ),
          ])
        : await authPromise;
      if (!mountedRef.current) return;
      if (result.ok) {
        onUnlock();
        return;
      }
      // iOS builds without NSFaceIDUsageDescription resolve instantly with
      // missing_usage_description and can never show a prompt — retrying
      // only blinks the screen. Stop trying and tell the user why.
      if (result.misconfigured) {
        brokenRef.current = true;
        setBiometricBroken(true);
        setError('Biometric unlock needs an app update. Enter your PIN.');
        return;
      }
      // Simulators have no real biometric hardware — a genuine prompt can
      // never succeed there. In dev builds, let an explicit tap on the
      // biometric button unlock anyway so the flow is testable; the
      // automatic prompt on start still falls back to the PIN pad.
      if (interactive && biometricDevBypass()) {
        onUnlock();
        return;
      }
      // A deliberate cancel just falls back to the PIN pad quietly; only a
      // genuine failure (read errors, lockout) deserves the error text.
      if (!result.cancelled) {
        setError('Biometric check did not succeed. Enter your PIN.');
      }
    } finally {
      if (mountedRef.current) {
        promptingRef.current = false;
        setPrompting(false);
      }
    }
  }, [onUnlock]);

  // Auto-prompt biometrics when the hardware exists and the user opted in.
  // Fires on mount IF already in the foreground, and again on every return
  // to 'active': backgrounding re-locks the app while this component stays
  // mounted, so without the AppState hook the prompt would never come back
  // after the first unlock ("biometrics only work once").
  useEffect(() => {
    let cancelled = false;
    const maybePrompt = async () => {
      const [support, preferred] = await Promise.all([
        getBiometricSupport(),
        isBiometricPreferred(),
      ]);
      if (cancelled) return;
      setBiometricAvailable(support.available);
      setBiometricPreferred(preferred);
      setBiometricLabel(support.label);
      if (support.available && preferred) {
        void tryBiometric(false);
      }
    };
    void maybePrompt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void maybePrompt();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [tryBiometric]);

  const handleDigit = (digit: string) => {
    if (lockedOut || verifying.current) return;
    setError(null);
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length !== PIN_LENGTH) return;

    // Brief delay so the fourth dot is visible before feedback
    verifying.current = true;
    setTimeout(async () => {
      try {
        const ok = await verifyPin(next);
        if (ok) {
          onUnlock();
          return;
        }
        setPinInput('');
        const remaining = attemptsLeft - 1;
        if (remaining <= 0) {
          setAttemptsLeft(MAX_ATTEMPTS);
          setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setNow(Date.now());
        } else {
          setAttemptsLeft(remaining);
          setError(`Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`);
        }
      } finally {
        verifying.current = false;
      }
    }, 150);
  };

  const handleBackspace = () => {
    if (lockedOut) return;
    setPinInput((prev) => prev.slice(0, -1));
    setError(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={[styles.lockIcon, { backgroundColor: colors.accent.subtle }]}>
        <MaterialCommunityIcons name="lock-outline" size={44} color={colors.accent.primary} />
      </View>

      <Text style={[typ.heading.h3, { color: colors.text.primary }]}>Nusxa is locked</Text>
      <Text style={[typ.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
        {lockedOut
          ? `Too many attempts. Try again in ${lockoutRemaining}s`
          : 'Enter your PIN to continue'}
      </Text>

      {error !== null && !lockedOut && (
        <Text style={[typ.body.sm, { color: colors.error, marginTop: spacing.sm }]}>
          {error}
        </Text>
      )}

      <View style={styles.keypadWrap}>
        <PinKeypad
          pinLength={PIN_LENGTH}
          entered={pinInput}
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          disabled={lockedOut}
        />
      </View>

      {biometricAvailable && biometricPreferred && !biometricBroken && !lockedOut && (
        <TouchableOpacity
          style={styles.biometricBtn}
          onPress={() => void tryBiometric(true, true)}
          disabled={prompting}
          accessibilityLabel={`Unlock with ${biometricLabel ?? 'biometrics'}`}
        >
          <MaterialCommunityIcons
            name={biometricLabel === 'Face' ? 'face-recognition' : 'fingerprint'}
            size={22}
            color={colors.accent.primary}
          />
          <Text style={[typ.label.base, { color: colors.accent.primary, marginLeft: 8 }]}>
            Use {biometricLabel ?? 'biometrics'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  lockIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  keypadWrap: {
    marginTop: spacing.xl,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
