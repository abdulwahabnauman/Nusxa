import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert, TextInput, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../src/theme/provider';
import { useThemeStore } from '../../src/stores/theme-store';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useAuthStore } from '../../src/stores/auth-store';
import { Card } from '../../src/components/ui/Card';
import { deleteProfile, updateProfile, getProfile } from '../../src/db/repositories/profile';
import { exportAsJSON, importFromJSON } from '../../src/utils/export';
import { saveApiKey, getApiKey, deleteApiKey, saveOpenRouterKey, getOpenRouterKey, deleteOpenRouterKey, saveGroqKey, getGroqKey, deleteGroqKey } from '../../src/utils/secureStorage';
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
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const setEasternNumerals = useSettingsStore((s) => s.setEasternNumerals);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const { t, language, setLanguage } = useI18n();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState('');
  const [hasStoredOpenRouterKey, setHasStoredOpenRouterKey] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [hasStoredGroqKey, setHasStoredGroqKey] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    async function checkKey() {
      const key = await getApiKey();
      setHasStoredKey(!!key);
      const openRouterKey = await getOpenRouterKey();
      setHasStoredOpenRouterKey(!!openRouterKey);
      const groqKey = await getGroqKey();
      setHasStoredGroqKey(!!groqKey);
    }
    checkKey();
  }, []);

  useEffect(() => {
    setNameInput(profile?.name ?? '');
  }, [profile]);

  const handleClearData = () => {
    Alert.alert(
      'Delete all data',
      'This will permanently delete your profile, all prescriptions, medicines, schedules, and dose records.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: async () => {
          try { await deleteProfile(); }
          catch (err) { Alert.alert('Error', 'Failed to delete data. Please try again.'); }
        }}
      ]
    );
  };

  const handleImportData = () => {
    Alert.alert(
      'Import data',
      'Importing restores a previously exported JSON file and REPLACES all current data (profile, prescriptions, medicines, schedules, dose records). Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: ['application/json', 'text/plain'],
                copyToCacheDirectory: true,
              });
              if (result.canceled || !result.assets?.[0]) return;

              setImporting(true);
              const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
              const counts = await importFromJSON(raw);

              // Reflect the restored profile in the app state
              try {
                const restored = await getProfile();
                if (restored) setProfile(restored);
              } catch { /* profile section refreshes on next load */ }

              Alert.alert(
                'Import complete',
                `Restored ${counts.medicines} medicine${counts.medicines !== 1 ? 's' : ''}, ${counts.schedules} schedule${counts.schedules !== 1 ? 's' : ''} and ${counts.doseRecords} dose record${counts.doseRecords !== 1 ? 's' : ''}.`
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : 'The file could not be imported.';
              Alert.alert('Import failed', message);
            } finally {
              setImporting(false);
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
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>{t.settings.title}</Text>
        </View>

        {/* Profile */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.profile}</Text>
          <Card>
            {editingName ? (
              <View style={{ gap: 16 }}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Enter your name"
                  autoFocus
                  style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 }]}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity 
                    style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, flex: 1, paddingVertical: 14, alignItems: 'center' }]}
                    onPress={async () => {
                      if (!nameInput.trim()) return;
                      setSavingName(true);
                      try {
                        await updateProfile({ name: nameInput.trim() });
                        setProfile({ ...profile!, name: nameInput.trim() });
                        setNameInput(nameInput.trim());
                        setEditingName(false);
                        Alert.alert('Saved', 'Your name has been updated.');
                      } catch (err) {
                        console.error('Failed to save name:', err);
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        if (errorMessage.includes('Database not initialized')) {
                          setTimeout(async () => {
                            try {
                              await updateProfile({ name: nameInput.trim() });
                              Alert.alert('Saved', 'Your name has been updated!');
                              setEditingName(false);
                            } catch {
                              Alert.alert('Error', 'Database not ready. Please try again later.');
                            }
                          }, 1000);
                        } else {
                          Alert.alert('Error', 'Failed to save name. Please try again.');
                        }
                      } finally { setSavingName(false); }
                    }}
                    disabled={savingName}
                  >
                    <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.save}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.saveKeyBtn, { backgroundColor: colors.border.default, flex: 1, paddingVertical: 14, alignItems: 'center' }]}
                    onPress={() => { setNameInput(profile?.name ?? ''); setEditingName(false); }}
                  >
                    <Text style={[typography.label.sm, { color: colors.text.secondary }]}>{t.common.cancel}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <Text style={[typography.body.base, { color: colors.text.primary, flex: 1 }]}>{profile?.name || t.common.loading}</Text>
                <TouchableOpacity style={{ padding: 4 }} onPress={() => setEditingName(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.accent.primary} />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        </View>

        {/* Appearance */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.appearance}</Text>
          <Card>
            <View style={styles.row}>
              <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.theme}</Text>
              <View style={styles.themeOptions}>
                {(['system', 'light', 'dark'] as const).map((opt) => (
                  <TouchableOpacity key={opt} style={[styles.themeChip, { backgroundColor: themePref === opt ? colors.accent.primary : colors.background.subtle, borderColor: themePref === opt ? colors.accent.primary : colors.border.default }]} onPress={() => setPreference(opt)} accessibilityLabel={`Set theme to ${opt}`} accessibilityState={{ selected: themePref === opt }}>
                    <Text style={[typography.label.sm, { color: themePref === opt ? '#FFFFFF' : colors.text.secondary }]}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.elderlyMode}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.elderlyModeDesc}</Text>
              </View>
              <Switch value={elderlyMode} onValueChange={setElderlyMode} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle elderly mode" />
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.reducedMotion}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.reducedMotionDesc}</Text>
              </View>
              <Switch value={reducedMotion} onValueChange={setReducedMotion} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle reduced motion" />
            </View>
          </Card>
        </View>

        {/* Language */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.language}</Text>
          <Card>
            <View style={styles.row}>
              <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.language}</Text>
              <View style={styles.themeOptions}>
                {(['en', 'ur'] as const).map((lang) => (
                  <TouchableOpacity key={lang} style={[styles.themeChip, { backgroundColor: language === lang ? colors.accent.primary : colors.background.subtle, borderColor: language === lang ? colors.accent.primary : colors.border.default }]} onPress={async () => {
                    if (language !== lang) {
                      setLanguage(lang);
                      try { await updateProfile({ language: lang }); }
                      catch { console.log('Database not ready'); }
                      const willBeRTL = lang === 'ur';
                      // Persist for cold starts; the live flip is instant via
                      // the root view's `direction` style — no restart needed.
                      I18nManager.allowRTL(true);
                      I18nManager.forceRTL(willBeRTL);
                    }
                  }} accessibilityLabel={`Set language to ${lang === 'en' ? 'English' : 'اردو'}`} accessibilityState={{ selected: language === lang }}>
                    <Text style={[typography.label.sm, { color: language === lang ? '#FFFFFF' : colors.text.secondary }]}>{lang === 'en' ? t.settings.english : t.settings.urdu}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.easternNumerals}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.easternNumeralsDesc}</Text>
              </View>
              <Switch value={easternNumerals} onValueChange={setEasternNumerals} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle Eastern Arabic numerals" />
            </View>
          </Card>
        </View>

        {/* Notifications */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.notifications}</Text>
          <Card>
            <View style={styles.row}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.medicineReminders}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.medicineRemindersDesc}</Text>
              </View>
              <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle medicine reminders" />
            </View>
          </Card>
        </View>

        {/* AI Service */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.aiService}</Text>
          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.aiServiceDesc}\nhttps://aistudio.google.com/app/apikey</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={apiKeyInput} onChangeText={setApiKeyInput} placeholder={hasStoredKey ? t.settings.apiKeySaved : t.settings.apiKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="Gemini API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, borderRadius: 8 }]} onPress={async () => { if (!apiKeyInput.trim()) return; await saveApiKey(apiKeyInput.trim()); setApiKeyInput(''); setHasStoredKey(true); Alert.alert('Saved', 'API key stored securely.'); }} accessibilityLabel="Save API key">
                <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
              </TouchableOpacity>
            </View>
            {hasStoredKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteApiKey(); setHasStoredKey(false); Alert.alert('Deleted', 'API key removed.'); }} accessibilityLabel="Remove stored API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>

          <View style={{ height: spacing.sm }} />

          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.openRouterServiceDesc}\nhttps://openrouter.ai/keys</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={openRouterKeyInput} onChangeText={setOpenRouterKeyInput} placeholder={hasStoredOpenRouterKey ? t.settings.apiKeySaved : t.settings.openRouterKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="OpenRouter API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, borderRadius: 8 }]} onPress={async () => { if (!openRouterKeyInput.trim()) return; await saveOpenRouterKey(openRouterKeyInput.trim()); setOpenRouterKeyInput(''); setHasStoredOpenRouterKey(true); Alert.alert('Saved', 'API key stored securely.'); }} accessibilityLabel="Save OpenRouter API key">
                <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
              </TouchableOpacity>
            </View>
            {hasStoredOpenRouterKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteOpenRouterKey(); setHasStoredOpenRouterKey(false); Alert.alert('Deleted', 'API key removed.'); }} accessibilityLabel="Remove stored OpenRouter API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>

          <View style={{ height: spacing.sm }} />

          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.groqServiceDesc}\nhttps://console.groq.com/keys</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={groqKeyInput} onChangeText={setGroqKeyInput} placeholder={hasStoredGroqKey ? t.settings.apiKeySaved : t.settings.groqKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="Groq API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, borderRadius: 8 }]} onPress={async () => { if (!groqKeyInput.trim()) return; await saveGroqKey(groqKeyInput.trim()); setGroqKeyInput(''); setHasStoredGroqKey(true); Alert.alert('Saved', 'API key stored securely.'); }} accessibilityLabel="Save Groq API key">
                <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
              </TouchableOpacity>
            </View>
            {hasStoredGroqKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteGroqKey(); setHasStoredGroqKey(false); Alert.alert('Deleted', 'API key removed.'); }} accessibilityLabel="Remove stored Groq API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>
        </View>

        {/* Data */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.data}</Text>
          <Card>
            <TouchableOpacity 
              style={styles.row}
              onPress={async () => {
                try {
                  const data = await exportAsJSON();
                  // Write a real .json file so the share sheet hands over a
                  // properly named document instead of a blob of text.
                  const fileName = `Nusxa_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
                  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2), {
                    encoding: FileSystem.EncodingType.UTF8,
                  });
                  await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: 'Export Nusxa data',
                  });
                } catch {
                  Alert.alert('Error', 'Failed to export data.');
                }
              }}
              accessibilityLabel="Export data as JSON"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="download-outline" size={20} color={colors.text.primary} />
                <Text style={[typography.body.base, { color: colors.text.primary, marginLeft: 8 }]}>{t.settings.exportData}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.disabled} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
            <TouchableOpacity
              style={styles.row}
              onPress={handleImportData}
              disabled={importing}
              accessibilityLabel="Import data from JSON"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="upload-outline" size={20} color={colors.text.primary} />
                <Text style={[typography.body.base, { color: colors.text.primary, marginLeft: 8 }]}>
                  {importing ? t.common.loading : t.settings.importData}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.disabled} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
            <TouchableOpacity style={styles.row} onPress={handleClearData} accessibilityLabel="Delete all data">
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={colors.error} />
                <Text style={[typography.body.base, { color: colors.error, marginLeft: 8 }]}>{t.settings.deleteAllData}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.disabled} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* About */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={[typography.body.sm, { color: colors.text.secondary }]}>{t.settings.about}</Text>
              <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 4 }]}>{t.settings.aboutDesc}</Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16, marginBottom: 24 },
  section: { marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeOptions: { flexDirection: 'row', gap: 8 },
  themeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  saveKeyBtn: { paddingHorizontal: 16, paddingVertical: 10 },
});
