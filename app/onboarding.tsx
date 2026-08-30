import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PillIcon } from '../src/components/ui/PillIcon';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../src/theme/provider';
import { useAuthStore } from '../src/stores/auth-store';
import { useThemeStore } from '../src/stores/theme-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { upsertProfileForOnboarding } from '../src/db/repositories/profile';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { showToast } from '../src/components/ui/GlobalToast';
import { useI18n } from '../src/i18n';
import { isValidDate } from '../src/utils/date';

// No 'done' step: setup finishes on the permissions step and navigates
// straight into the app (the old 'done' branch was dead code).
type OnboardingStep = 'welcome' | 'profile' | 'health' | 'permissions';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function OnboardingScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const { setProfile } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleWelcome = () => {
    setStep('profile');
  };

  const handleProfileSave = async () => {
    if (!name.trim()) {
      showToast(t.onboarding.nameRequired || 'Name required', 'warning');
      return;
    }
    // Don't save yet - wait until permissions step
    setStep('health');
  };

  // Optional health step: both fields can be left empty / skipped entirely
  const handleHealthSave = () => {
    const trimmedDob = dob.trim();
    if (trimmedDob && !isValidDate(trimmedDob)) {
      showToast(t.onboarding.dobInvalid, 'warning');
      return;
    }
    setStep('permissions');
  };

  const handlePermissions = async () => {
    setLoading(true);
    try {
      // Request notification permission first. A failure here (denied,
      // unavailable on some devices) must never block profile creation —
      // reminders can be enabled later from Settings.
      try {
        const permResult = await Notifications.requestPermissionsAsync();

        console.log('Notification permission granted:', permResult.granted);
      } catch (permError) {
        console.warn('Notification permission request failed, continuing:', permError);
      }

      // Create or update the profile (upsert — a row may already exist on
      // upgrade installs), then mark onboarding complete. Keep whatever
      // language is active right now so a chosen language survives setup.
      // DOB/blood group come from the optional health step (empty = not set).
      const currentLanguage = useSettingsStore.getState().language;
      const trimmedDob = dob.trim();
      const profile = await upsertProfileForOnboarding(name.trim(), currentLanguage, {
        date_of_birth: trimmedDob || null,
        blood_group: bloodGroup,
      });
      setProfile(profile);

      // Navigate to main tabs after successful setup
      router.replace('/');
    } catch (error) {
      console.error('Onboarding error:', error);
      showToast(t.toasts.profileSetupFailed, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'welcome' && (
            <View style={styles.stepContainer}>
              <View style={[styles.iconContainer, { backgroundColor: colors.accent.subtle }]}>
                <PillIcon
                  size={56}
                  color={colors.accent.primary}
                  contrastColor={colors.accent.subtle}
                />
              </View>
              <Text style={[typography.heading.h1, { color: colors.text.primary, marginTop: spacing.xl, textAlign: 'center' }]}>
                {t.onboarding.welcomeTitle}
              </Text>
              <Text style={[typography.body.lg, { color: colors.text.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                {t.onboarding.welcomeDesc}
              </Text>
              <View style={styles.featureList}>
                {[
                  { icon: 'camera-outline' as const, text: t.onboarding.feature1 },
                  { icon: 'check-circle-outline' as const, text: t.onboarding.feature2 },
                  { icon: 'bell-outline' as const, text: t.onboarding.feature3 },
                  { icon: 'chart-line' as const, text: t.onboarding.feature4 },
                ].map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <MaterialCommunityIcons name={feature.icon} size={20} color={colors.accent.primary} />
                    <Text style={[typography.body.base, { color: colors.text.primary, marginLeft: spacing.md }]}>
                      {feature.text}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.buttonContainer}>
                <Button title={t.onboarding.getStarted} onPress={handleWelcome} size="lg" />
              </View>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.stepContainer}>
              <Text style={[typography.heading.h2, { color: colors.text.primary, textAlign: 'center' }]}>
                {t.onboarding.whatToCall}
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                {t.onboarding.nameHelp}
              </Text>
              <View style={{ marginTop: spacing.xl, width: '100%' }}>
                <Input
                  label={t.onboarding.yourName}
                  value={name}
                  onChangeText={setName}
                  placeholder={t.onboarding.yourName}
                  autoCapitalize="words"
                  autoFocus
                  onSubmitEditing={handleProfileSave}
                />
              </View>
              <View style={[styles.buttonContainer, { marginTop: spacing.xl }]}>
                <Button title={t.common.next} onPress={handleProfileSave} size="lg" />
                <Button title={t.common.back} onPress={() => setStep('welcome')} variant="ghost" />
              </View>
            </View>
          )}

          {step === 'health' && (
            <View style={styles.stepContainer}>
              <Text style={[typography.heading.h2, { color: colors.text.primary, textAlign: 'center' }]}>
                {t.onboarding.healthTitle}
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                {t.onboarding.healthDesc}
              </Text>
              <View style={{ marginTop: spacing.xl, width: '100%' }}>
                <Input
                  label={t.onboarding.dobLabel}
                  value={dob}
                  onChangeText={setDob}
                  placeholder={t.onboarding.dobPlaceholder}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={[typography.label.base, { color: colors.text.secondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                  {t.onboarding.bloodGroupLabel}
                </Text>
                <View style={styles.bloodGroupGrid}>
                  {BLOOD_GROUPS.map((group) => {
                    const selected = bloodGroup === group;
                    return (
                      <TouchableOpacity
                        key={group}
                        onPress={() => setBloodGroup(selected ? null : group)}
                        style={[
                          styles.bloodGroupChip,
                          {
                            borderRadius: borderRadius.md,
                            borderColor: selected ? colors.accent.primary : colors.border.default,
                            backgroundColor: selected ? colors.accent.subtle : colors.background.surface,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={group}
                      >
                        <Text style={[typography.label.base, { color: selected ? colors.accent.primary : colors.text.primary }]}>
                          {group}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.buttonContainer, { marginTop: spacing.xl }]}>
                <Button title={t.common.next} onPress={handleHealthSave} size="lg" />
                {/* The whole step is optional — skip keeps DOB/blood unset */}
                <Button title={t.onboarding.skipStep} onPress={() => setStep('permissions')} variant="ghost" />
              </View>
            </View>
          )}

          {step === 'permissions' && (
            <View style={styles.stepContainer}>
              <View style={[styles.iconContainer, { backgroundColor: colors.accent.subtle }]}>
                <MaterialCommunityIcons
                  name="bell-ring-outline"
                  size={56}
                  color={colors.accent.primary}
                />
              </View>
              <Text style={[typography.heading.h2, { color: colors.text.primary, marginTop: spacing.xl, textAlign: 'center' }]}>
                {t.onboarding.almostReady}
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                {t.onboarding.notifDesc}
              </Text>
              <View style={[styles.permissionNote, { backgroundColor: colors.background.subtle, marginTop: spacing.xl }]}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
                <Text style={[typography.body.sm, { color: colors.text.secondary, marginLeft: spacing.sm, flex: 1 }]}>
                  {t.onboarding.cameraNote}
                </Text>
              </View>
              <View style={[styles.buttonContainer, { marginTop: spacing.xl }]}>
                <Button
                  title={t.onboarding.setUp}
                  onPress={handlePermissions}
                  loading={loading}
                  size="lg"
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureList: {
    marginTop: 32,
    gap: 16,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bloodGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bloodGroupChip: {
    minWidth: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  permissionNote: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
    width: '100%',
  },
  buttonContainer: {
    marginTop: 24,
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
});
