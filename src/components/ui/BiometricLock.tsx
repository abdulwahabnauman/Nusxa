/**
 * App lock gate — rendered INSTEAD of the app stack when the lock is
 * active. Unlocks via biometric prompt (auto on mount when preferred) or
 * a verified PIN. Five wrong PINs trigger a 30-second lockout so the pad
 * cannot be brute-forced.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Modal, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { spacing } from '../../theme/spacing';
import { useI18n } from '../../i18n';
import { PinKeypad } from './PinKeypad';
import { useAuthStore } from '../../stores/auth-store';
import { getActiveMedicines } from '../../db/repositories/medicine';
import { calculateAge } from '../../utils/date';
import { getLocalizedName } from '../../utils/profileName';
import type { Medicine } from '../../types/models';
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
  const { t, language, isRTL } = useI18n();
  const profile = useAuthStore((s) => s.profile);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [activeMeds, setActiveMeds] = useState<Medicine[]>([]);
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

  useEffect(() => {
    if (showEmergencyModal) {
      getActiveMedicines().then(setActiveMeds).catch(() => {});
    }
  }, [showEmergencyModal]);

  const lockedOut = lockoutUntil !== null && lockoutUntil > now;
  const biometricName = biometricLabel ?? t.lock.biometrics;
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
      const authPromise = authenticateWithBiometrics(t.lock.unlockPrompt);
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
        setError(t.lock.misconfigured);
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
        setError(t.lock.biometricFailed);
      }
    } finally {
      if (mountedRef.current) {
        promptingRef.current = false;
        setPrompting(false);
      }
    }
  }, [onUnlock, t]);

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
          setError(
            remaining === 1
              ? t.lock.wrongPinOne
              : t.lock.wrongPin.replace('{remaining}', String(remaining))
          );
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

      <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.lock.title}</Text>
      <Text style={[typ.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
        {lockedOut
          ? t.lock.tooManyAttempts.replace('{s}', String(lockoutRemaining))
          : t.lock.enterPin}
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
          accessibilityLabel={t.lock.unlockWith.replace('{label}', biometricName)}
        >
          <MaterialCommunityIcons
            name={biometricLabel === 'Face' ? 'face-recognition' : 'fingerprint'}
            size={22}
            color={colors.accent.primary}
          />
          <Text style={[typ.label.base, { color: colors.accent.primary, marginLeft: 8 }]}>
            {t.lock.useBiometric.replace('{label}', biometricName)}
          </Text>
        </TouchableOpacity>
      )}

      {/* Emergency Info (ICE) Button — Life safety access for paramedics/first responders */}
      <TouchableOpacity
        style={styles.emergencyBtn}
        onPress={() => setShowEmergencyModal(true)}
        accessibilityLabel={language === 'ur' ? 'ہنگامی معلومات (ICE)' : 'Emergency Medical Info (ICE)'}
      >
        <MaterialCommunityIcons name="medical-bag" size={20} color={colors.error} />
        <Text style={[typ.label.sm, { color: colors.error, marginLeft: 6 }]}>
          {language === 'ur' ? 'ہنگامی طبی معلومات (ICE)' : 'Emergency Info (ICE)'}
        </Text>
      </TouchableOpacity>

      {/* Emergency Modal Sheet */}
      <Modal
        visible={showEmergencyModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEmergencyModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.border.default }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="medical-bag" size={24} color={colors.error} />
              <Text style={[typ.heading.h3, { color: colors.text.primary }]}>
                {language === 'ur' ? 'ہنگامی طبی معلومات (ICE)' : 'Emergency Medical Info'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowEmergencyModal(false)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background.subtle, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Patient Name & Age */}
            <View style={{ backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
              <Text style={[typ.label.sm, { color: colors.text.secondary }]}>{language === 'ur' ? 'مریض کا نام' : 'Patient Name'}</Text>
              <Text style={[typ.heading.h3, { color: colors.text.primary, marginTop: 4 }]}>
                {profile ? getLocalizedName(profile, language) : (language === 'ur' ? 'نامعلوم' : 'Unknown')}
                {profile?.date_of_birth ? ` (${calculateAge(profile.date_of_birth)} yrs)` : ''}
              </Text>
            </View>

            {/* Blood Group & Allergies */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
                <Text style={[typ.label.sm, { color: colors.text.secondary }]}>{language === 'ur' ? 'بلڈ گروپ' : 'Blood Group'}</Text>
                <Text style={[typ.heading.h2, { color: colors.error, marginTop: 4 }]}>
                  {profile?.blood_group || (language === 'ur' ? 'نامعلوم' : 'Unknown')}
                </Text>
              </View>
              <View style={{ flex: 1.5, backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
                <Text style={[typ.label.sm, { color: colors.text.secondary }]}>{language === 'ur' ? 'الرجی' : 'Allergies'}</Text>
                <Text style={[typ.body.base, { color: colors.text.primary, marginTop: 4, fontWeight: '600' }]}>
                  {profile?.allergies && profile.allergies.length > 0
                    ? profile.allergies.join(', ')
                    : (language === 'ur' ? 'کوئی معلوم نہیں' : 'None listed')}
                </Text>
              </View>
            </View>

            {/* Emergency Contact */}
            {profile?.emergency_contact?.phone ? (
              <View style={{ backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
                <Text style={[typ.label.sm, { color: colors.text.secondary }]}>{language === 'ur' ? 'ہنگامی رابطہ' : 'Emergency Contact'}</Text>
                <Text style={[typ.body.lg, { color: colors.text.primary, marginTop: 4 }]}>
                  {profile.emergency_contact.name || (language === 'ur' ? 'قریبی فرد' : 'Next of Kin')}
                </Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.success,
                    marginTop: 12,
                    paddingVertical: 12,
                    borderRadius: 10,
                    gap: 8,
                  }}
                  onPress={() => Linking.openURL(`tel:${profile.emergency_contact!.phone.replace(/[\s()-]/g, '')}`)}
                >
                  <MaterialCommunityIcons name="phone" size={20} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>
                    {language === 'ur' ? `کال کریں: ${profile.emergency_contact.phone}` : `Call: ${profile.emergency_contact.phone}`}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Primary Physician */}
            {profile?.primary_physician ? (
              <View style={{ backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
                <Text style={[typ.label.sm, { color: colors.text.secondary }]}>{language === 'ur' ? 'معالج' : 'Primary Physician'}</Text>
                <Text style={[typ.body.base, { color: colors.text.primary, marginTop: 4 }]}>{profile.primary_physician}</Text>
              </View>
            ) : null}

            {/* Active Medications */}
            <View style={{ backgroundColor: colors.background.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border.default }}>
              <Text style={[typ.label.sm, { color: colors.text.secondary, marginBottom: 8 }]}>
                {language === 'ur' ? 'موجودہ فعال ادویات' : 'Current Active Medications'}
              </Text>
              {activeMeds.length === 0 ? (
                <Text style={[typ.body.sm, { color: colors.text.disabled }]}>
                  {language === 'ur' ? 'کوئی فعال دوا ریکارڈ میں نہیں' : 'No active medications on record'}
                </Text>
              ) : (
                activeMeds.map((med, i) => (
                  <View key={med.id || i} style={{ paddingVertical: 6, borderBottomWidth: i < activeMeds.length - 1 ? 1 : 0, borderColor: colors.border.default }}>
                    <Text style={[typ.body.base, { color: colors.text.primary, fontWeight: '600' }]}>
                      {med.name} {med.strength ? `(${med.strength})` : ''}
                    </Text>
                    <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                      {med.dosage || ''} {med.frequency ? `· ${med.frequency}` : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    justifyContent: 'center',
    minHeight: 44,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
