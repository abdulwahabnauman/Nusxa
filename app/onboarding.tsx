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

type OnboardingStep = 'welcome' | 'profile' | 'permissions' | 'done';

export default function OnboardingScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { setProfile } = useAuthStore();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWelcome = () => {
    setStep('profile');
  };

  const handleProfileSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name to continue.');
      return;
    }
    setStep('permissions');
  };

  const handlePermissions = async () => {
    setLoading(true);
    try {
      // Request notification permission
      try {
        await Notifications.requestPermissionsAsync();
      } catch {
        // Non-critical: continue without notifications
      }

      // Create profile
      const profile = await createProfile({ name: name.trim() });
      await completeOnboarding();
      setProfile({ ...profile, onboarding_complete: true });
    } catch (error) {
      Alert.alert('Error', 'Failed to set up your profile. Please try again.');
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
                Welcome to Nusxa
              </Text>
              <Text style={[typography.body.lg, { color: colors.text.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                Your AI medication companion. Understand prescriptions, follow schedules, and track your treatment with confidence.
              </Text>
              <View style={styles.featureList}>
                {[
                  { icon: 'camera-outline' as const, text: 'Scan prescriptions with your camera' },
                  { icon: 'check-circle-outline' as const, text: 'Verify and understand your medicines' },
                  { icon: 'bell-outline' as const, text: 'Get gentle reminders for each dose' },
                  { icon: 'chart-line' as const, text: 'Track your progress over time' },
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
                <Button title="Get started" onPress={handleWelcome} size="lg" />
              </View>
            </View>
          )}

          {step === 'profile' && (
            <View style={styles.stepContainer}>
              <Text style={[typography.heading.h2, { color: colors.text.primary, textAlign: 'center' }]}>
                What should we call you?
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                Your name helps personalize your experience.
              </Text>
              <View style={{ marginTop: spacing.xl, width: '100%' }}>
                <Input
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  autoCapitalize="words"
                  autoFocus
                  onSubmitEditing={handleProfileSave}
                />
              </View>
              <View style={[styles.buttonContainer, { marginTop: spacing.xl }]}>
                <Button title="Continue" onPress={handleProfileSave} size="lg" />
                <Button title="Back" onPress={() => setStep('welcome')} variant="ghost" />
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
                Almost ready
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.md, textAlign: 'center' }]}>
                Nusxa uses notifications to remind you about your medicines. You can change this anytime in Settings.
              </Text>
              <View style={[styles.permissionNote, { backgroundColor: colors.background.subtle, marginTop: spacing.xl }]}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
                <Text style={[typography.body.sm, { color: colors.text.secondary, marginLeft: spacing.sm, flex: 1 }]}>
                  Camera access will be requested when you scan your first prescription.
                </Text>
              </View>
              <View style={[styles.buttonContainer, { marginTop: spacing.xl }]}>
                <Button
                  title="Set up Nusxa"
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
