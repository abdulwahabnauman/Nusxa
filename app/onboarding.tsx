import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../src/theme/provider';
import { useAuthStore } from '../src/stores/auth-store';
import { useThemeStore } from '../src/stores/theme-store';
import { createProfile, completeOnboarding } from '../src/db/repositories/profile';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { useI18n } from '../src/i18n';

type OnboardingStep = 'welcome' | 'profile' | 'permissions' | 'done';

export default function OnboardingScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { setProfile } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleWelcome = () => {
    setStep('profile');
  };

  const handleProfileSave = async () => {
    if (!name.trim()) {
      Alert.alert(t.common.error, t.onboarding.nameRequired || 'Name required');
      return;
    }
    // Don't save yet - wait until permissions step
    setStep('permissions');
  };

  const handlePermissions = async () => {
    setLoading(true);
    try {
      // Request notification permission first
      const permResult = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
        android: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowVibrate: true,
          allowWarning: true,
          importance: Notifications.AndroidImportance.HIGH,
        },
        web: { vibrate: false },
      });

      console.log('Notification permission granted:', permResult.granted);

      // Only create profile after successful permission request
      const profile = await createProfile({ 
        name: name.trim(),
        language: 'en' // Default to English for now
      });
      
      await completeOnboarding();
      setProfile({ ...profile, onboarding_complete: true });
      
      // Navigate to main tabs after successful setup
      router.replace('/(tabs)/index');
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert(
        t.common.error, 
        'Failed to set up your profile. Please try again.'
      );
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
                <MaterialCommunityIcons
                  name="pill"
                  size={56}
                  color={colors.accent.primary}
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
                <Button title={t.common.continue} onPress={handleProfileSave} size="lg" />
                <Button title={t.common.back} onPress={() => setStep('welcome')} variant="ghost" />
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
  permissionNote: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
    width: '100%',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
});
