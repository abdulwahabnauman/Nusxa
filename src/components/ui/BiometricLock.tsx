/**
 * App lock gate — rendered INSTEAD of the app stack when the lock is
 * active. Unlocks via biometric prompt (auto on mount when preferred) or
 * a verified PIN. Five wrong PINs trigger a 30-second lockout so the pad
 * cannot be brute-forced.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { spacing } from '../../theme/spacing';
import { PinKeypad } from './PinKeypad';
import {
  PIN_LENGTH,
  authenticateWithBiometrics,
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
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);
  const [prompting, setPrompting] = useState(false);
  const promptedOnce = useRef(false);
  const verifying = useRef(false);

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

  const tryBiometric = useCallback(async () => {
    if (prompting) return;
    setPrompting(true);
    try {
      const ok = await authenticateWithBiometrics('Unlock Nusxa');
      if (ok) {
        onUnlock();
      } else {
        setError('Biometric check did not succeed — enter your PIN.');
      }
    } finally {
      setPrompting(false);
    }
  }, [onUnlock, prompting]);

  // Auto-prompt biometrics once on mount when the hardware exists and the
  // user opted in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [support, preferred] = await Promise.all([
        getBiometricSupport(),
        isBiometricPreferred(),
      ]);
      if (cancelled) return;
      setBiometricAvailable(support.available);
      setBiometricLabel(support.label);
      if (support.available && preferred && !promptedOnce.current) {
        promptedOnce.current = true;
        void tryBiometric();
      }
    })();
    return () => {
      cancelled = true;
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
          setError(`Wrong PIN — ${remaining} attempt${remaining === 1 ? '' : 's'} left.`);
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
          ? `Too many attempts — try again in ${lockoutRemaining}s`
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

      {biometricAvailable && !lockedOut && (
        <TouchableOpacity
          style={styles.biometricBtn}
          onPress={() => void tryBiometric()}
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
