import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Share,
  TextInput,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useThemeStore } from '../../src/stores/theme-store';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useAuthStore } from '../../src/stores/auth-store';
import { Card } from '../../src/components/ui/Card';
import { deleteProfile, updateProfile } from '../../src/db/repositories/profile';
import { exportAsJSON } from '../../src/utils/export';
import { saveApiKey, getApiKey, deleteApiKey, saveOpenRouterKey, getOpenRouterKey, deleteOpenRouterKey } from '../../src/utils/secureStorage';
import { useI18n } from '../../src/i18n';

export default function SettingsScreen() {
  const { colors, typography, spacing } = useTheme();
  const themePref = useThemeStore((s) => s.preference);
  const elderlyMode = useThemeStore((s) => s.elderlyMode);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setElderlyMode = useThemeStore((s) => s.setElderlyMode);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const profile = useAuthStore((s) => s.profile);
  const { t, language, setLanguage } = useI18n();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState('');
  const [hasStoredOpenRouterKey, setHasStoredOpenRouterKey] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    async function checkKey() {
      const key = await getApiKey();
      setHasStoredKey(!!key);
      const openRouterKey = await getOpenRouterKey();
      setHasStoredOpenRouterKey(!!openRouterKey);
    }
    checkKey();
  }, []);

  const handleClearData = () => {
    Alert.alert(
      'Delete all data',
      'This will permanently delete your profile, all prescriptions, medicines, schedules, and dose records. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProfile();
              // App will redirect to onboarding automatically via store
            } catch (err) {
              Alert.alert('Error', 'Failed to delete data. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            {t.settings.title}
          </Text>
        </View>

        {/* Profile */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.profile}
          </Text>
          <Card>
            <View style={styles.row}>
              <Text style={[typography.body.base, { color: colors.text.primary }]}>
                {t.settings.name}
              </Text>
              <Text style={[typography.body.base, { color: colors.text.secondary }]}>
                {profile?.name ?? t.settings.notSet}
              </Text>
            </View>
          </Card>
        </View>

        {/* Appearance */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.appearance}
          </Text>
          <Card>
            {/* Theme Selection */}
            <View style={styles.row}>
              <Text style={[typography.body.base, { color: colors.text.primary }]}>
                {t.settings.theme}
              </Text>
              <View style={styles.themeOptions}>
                {(['system', 'light', 'dark'] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.themeChip,
                      {
                        backgroundColor:
                          themePref === opt ? colors.accent.primary : colors.background.subtle,
                        borderColor:
                          themePref === opt ? colors.accent.primary : colors.border.default,
                      },
                    ]}
                    onPress={() => setPreference(opt)}
                    accessibilityLabel={`Set theme to ${opt}`}
                    accessibilityState={{ selected: themePref === opt }}
                  >
                    <Text
                      style={[
                        typography.label.sm,
                        {
                          color:
                            themePref === opt ? '#FFFFFF' : colors.text.secondary,
                        },
                      ]}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Elderly Mode */}
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>
                  {t.settings.elderlyMode}
                </Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>
                  {t.settings.elderlyModeDesc}
                </Text>
              </View>
              <Switch
                value={elderlyMode}
                onValueChange={setElderlyMode}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                accessibilityLabel="Toggle elderly mode"
              />
            </View>

            {/* Reduced Motion */}
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>
                  {t.settings.reducedMotion}
                </Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>
                  {t.settings.reducedMotionDesc}
                </Text>
              </View>
              <Switch
                value={reducedMotion}
                onValueChange={setReducedMotion}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                accessibilityLabel="Toggle reduced motion"
              />
            </View>
          </Card>
        </View>

        {/* Language */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.language}
          </Text>
          <Card>
            <View style={styles.row}>
              <Text style={[typography.body.base, { color: colors.text.primary }]}>
                {t.settings.language}
              </Text>
              <View style={styles.themeOptions}>
                {(['en', 'ur'] as const).map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.themeChip,
                      {
                        backgroundColor:
                          language === lang ? colors.accent.primary : colors.background.subtle,
                        borderColor:
                          language === lang ? colors.accent.primary : colors.border.default,
                      },
                    ]}
                    onPress={async () => {
                      if (language !== lang) {
                        setLanguage(lang);
                        try {
                          await updateProfile({ language: lang });
                        } catch {
                          // Language will still be in memory for this session
                        }
                        const willBeRTL = lang === 'ur';
                        I18nManager.allowRTL(true);
                        I18nManager.forceRTL(willBeRTL);
                        setNeedsRestart(true);
                        Alert.alert(
                          lang === 'ur' ? '\u0632\u0628\u0627\u0646 \u062a\u0628\u062f\u06cc\u0644 \u06c1\u0648 \u06af\u0626\u06cc' : 'Language changed',
                          lang === 'ur'
                            ? '\u0628\u0631\u0627\u0626\u06d2 \u0645\u06c1\u0631\u0628\u0627\u0646\u06cc \u0627\u06cc\u067e \u06a9\u0648 \u0645\u06a9\u0645\u0644 \u0637\u0648\u0631 \u067e\u0631 \u0628\u0646\u062f \u06a9\u0631 \u06a9\u06d2 \u062f\u0648\u0628\u0627\u0631\u06c1 \u06a9\u06be\u0648\u0644\u06cc\u06ba \u062a\u0627\u06a9\u06c1 RTL \u0644\u06d2 \u0622\u0624\u0679 \u0644\u0627\u06af\u0648 \u06c1\u0648\u06d4'
                            : 'Please fully close and reopen the app for the layout change to take effect.',
                        );
                      }
                    }}
                    accessibilityLabel={`Set language to ${lang === 'en' ? 'English' : 'اردو'}`}
                    accessibilityState={{ selected: language === lang }}
                  >
                    <Text
                      style={[
                        typography.label.sm,
                        {
                          color:
                            language === lang ? '#FFFFFF' : colors.text.secondary,
                        },
                      ]}
                    >
                      {lang === 'en' ? t.settings.english : t.settings.urdu}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {/* Notifications */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.notifications}
          </Text>
          <Card>
            <View style={styles.row}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>
                  {t.settings.medicineReminders}
                </Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>
                  {t.settings.medicineRemindersDesc}
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                accessibilityLabel="Toggle medicine reminders"
              />
            </View>
          </Card>
        </View>

        {/* AI Service */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.aiService}
          </Text>
          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
              {t.settings.aiServiceDesc}{'\n'}https://aistudio.google.com/app/apikey
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[
                  typography.body.base,
                  {
                    color: colors.text.primary,
                    backgroundColor: colors.background.subtle,
                    borderColor: colors.border.default,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flex: 1,
                  },
                ]}
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                placeholder={hasStoredKey ? t.settings.apiKeySaved : t.settings.apiKeyPlaceholder}
                placeholderTextColor={colors.text.disabled}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Gemini API key"
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, borderRadius: 8 }]}
                onPress={async () => {
                  if (!apiKeyInput.trim()) return;
                  await saveApiKey(apiKeyInput.trim());
                  setApiKeyInput('');
                  setHasStoredKey(true);
                  Alert.alert('Saved', 'API key stored securely.');
                }}
                accessibilityLabel="Save API key"
              >
                <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
              </TouchableOpacity>
            </View>
            {hasStoredKey && (
              <TouchableOpacity
                style={{ marginTop: spacing.sm }}
                onPress={async () => {
                  await deleteApiKey();
                  setHasStoredKey(false);
                  Alert.alert('Deleted', 'API key removed.');
                }}
                accessibilityLabel="Remove stored API key"
              >
                <Text style={[typography.body.sm, { color: colors.error }]}>
                  {t.settings.removeKey}
                </Text>
              </TouchableOpacity>
            )}
          </Card>

          <View style={{ height: spacing.sm }} />

          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
              {t.settings.openRouterServiceDesc}{'\n'}https://openrouter.ai/keys
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={[
                  typography.body.base,
                  {
                    color: colors.text.primary,
                    backgroundColor: colors.background.subtle,
                    borderColor: colors.border.default,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flex: 1,
                  },
                ]}
                value={openRouterKeyInput}
                onChangeText={setOpenRouterKeyInput}
                placeholder={hasStoredOpenRouterKey ? t.settings.apiKeySaved : t.settings.openRouterKeyPlaceholder}
                placeholderTextColor={colors.text.disabled}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="OpenRouter API key"
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, borderRadius: 8 }]}
                onPress={async () => {
                  if (!openRouterKeyInput.trim()) return;
                  await saveOpenRouterKey(openRouterKeyInput.trim());
                  setOpenRouterKeyInput('');
                  setHasStoredOpenRouterKey(true);
                  Alert.alert('Saved', 'API key stored securely.');
                }}
                accessibilityLabel="Save OpenRouter API key"
              >
                <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
              </TouchableOpacity>
            </View>
            {hasStoredOpenRouterKey && (
              <TouchableOpacity
                style={{ marginTop: spacing.sm }}
                onPress={async () => {
                  await deleteOpenRouterKey();
                  setHasStoredOpenRouterKey(false);
                  Alert.alert('Deleted', 'API key removed.');
                }}
                accessibilityLabel="Remove stored OpenRouter API key"
              >
                <Text style={[typography.body.sm, { color: colors.error }]}>
                  {t.settings.removeKey}
                </Text>
              </TouchableOpacity>
            )}
          </Card>
        </View>

        {/* Data */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.settings.data}
          </Text>
          <Card>
            <TouchableOpacity
              style={styles.row}
              onPress={async () => {
                try {
                  const data = await exportAsJSON();
                  await Share.share({
                    message: JSON.stringify(data, null, 2),
                    title: 'Nusxa Data Export',
                  });
                } catch {
                  Alert.alert('Error', 'Failed to export data.');
                }
              }}
              accessibilityLabel="Export data as JSON"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="download-outline" size={20} color={colors.text.primary} />
                <Text style={[typography.body.base, { color: colors.text.primary, marginLeft: 8 }]}>
                  {t.settings.exportData}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.disabled} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
            <TouchableOpacity
              style={styles.row}
              onPress={handleClearData}
              accessibilityLabel="Delete all data"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={colors.error} />
                <Text style={[typography.body.base, { color: colors.error, marginLeft: 8 }]}>
                  {t.settings.deleteAllData}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.disabled} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* About */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={[typography.body.sm, { color: colors.text.secondary }]}>
                {t.settings.about}
              </Text>
              <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 4 }]}>
                {t.settings.aboutDesc}
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    marginTop: 16,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  saveKeyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});