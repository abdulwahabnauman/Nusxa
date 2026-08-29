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
import { Modal } from '../../src/components/ui/Modal';
import { PinKeypad } from '../../src/components/ui/PinKeypad';
import { showToast } from '../../src/components/ui/GlobalToast';
import {
  PIN_LENGTH,
  disableAppLock,
  enableAppLock,
  getBiometricSupport,
  isBiometricPreferred,
  setBiometricPreferred,
  verifyPin,
  authenticateWithBiometrics,
} from '../../src/utils/appLock';
import { deleteProfile, updateProfile, getProfile } from '../../src/db/repositories/profile';
import { exportAsJSON, importFromJSON } from '../../src/utils/export';
import { saveApiKey, getApiKey, deleteApiKey, saveOpenRouterKey, getOpenRouterKey, deleteOpenRouterKey, saveGroqKey, getGroqKey, deleteGroqKey } from '../../src/utils/secureStorage';
import { isAiProxyConfigured } from '../../src/constants/config';
import { useSuccessMorph } from '../../src/hooks/useSuccessMorph';
import { useI18n } from '../../src/i18n';

export default function SettingsScreen() {
  const { colors, typography, spacing } = useTheme();
  const themePref = useThemeStore((s) => s.preference);
  const elderlyMode = useThemeStore((s) => s.elderlyMode);
  const highContrast = useThemeStore((s) => s.highContrast);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setElderlyMode = useThemeStore((s) => s.setElderlyMode);
  const setHighContrast = useThemeStore((s) => s.setHighContrast);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const snoozeMinutes = useSettingsStore((s) => s.snoozeMinutes);
  const setSnoozeMinutes = useSettingsStore((s) => s.setSnoozeMinutes);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const setEasternNumerals = useSettingsStore((s) => s.setEasternNumerals);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const appLockEnabled = useAuthStore((s) => s.appLockEnabled);
  const setAppLockEnabled = useAuthStore((s) => s.setAppLockEnabled);
  const setLocked = useAuthStore((s) => s.setLocked);
  const { t, language, setLanguage } = useI18n();
  const geminiKeyMorph = useSuccessMorph();
  const openRouterKeyMorph = useSuccessMorph();
  const groqKeyMorph = useSuccessMorph();
  const nameMorph = useSuccessMorph();
  const lockMorph = useSuccessMorph();
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
  const [biometricSupport, setBiometricSupport] = useState<{ available: boolean; label: string | null }>({
    available: false,
    label: null,
  });
  const [biometricPref, setBiometricPref] = useState(false);
  const [pinModal, setPinModal] = useState<'none' | 'enable1' | 'enable2' | 'disable'>('none');
  const [pinDraft, setPinDraft] = useState('');
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    getBiometricSupport().then(setBiometricSupport);
    isBiometricPreferred().then(setBiometricPref);
  }, []);

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
          catch (err) { showToast('Failed to delete data. Please try again.', 'error'); }
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

              showToast(
                `Import complete — restored ${counts.medicines} medicine${counts.medicines !== 1 ? 's' : ''}, ${counts.schedules} schedule${counts.schedules !== 1 ? 's' : ''} and ${counts.doseRecords} dose record${counts.doseRecords !== 1 ? 's' : ''}.`,
                'success',
                6000,
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : 'The file could not be imported.';
              showToast(`Import failed — ${message}`, 'error', 6000);
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  const closePinModal = () => {
    setPinModal('none');
    setPinDraft('');
    setPinEntry('');
    setPinError(null);
  };

  const handleLockToggle = (value: boolean) => {
    // Enabling needs a fresh PIN; disabling must verify the current one
    setPinModal(value ? 'enable1' : 'disable');
  };

  const finishPinEntry = async (pin: string) => {
    if (pinModal === 'enable1') {
      setPinDraft(pin);
      setPinEntry('');
      setPinModal('enable2');
      return;
    }

    if (pinModal === 'enable2') {
      if (pin === pinDraft) {
        try {
          const preferBiometric = biometricSupport.available;
          await enableAppLock(pin, preferBiometric);
          setBiometricPref(preferBiometric);
          setAppLockEnabled(true);
          lockMorph.trigger();
        } catch {
          showToast('Failed to enable app lock. Please try again.', 'error');
        }
        closePinModal();
      } else {
        setPinEntry('');
        setPinDraft('');
        setPinModal('enable1');
        setPinError(t.settings.pinMismatch);
      }
      return;
    }

    if (pinModal === 'disable') {
      if (await verifyPin(pin)) {
        try {
          await disableAppLock();
        } catch {
          // Keys already gone — nothing to clean up
        }
        setAppLockEnabled(false);
        setLocked(false);
        showToast(t.settings.appLockDisabled, 'info');
        closePinModal();
      } else {
        setPinEntry('');
        setPinError(t.settings.wrongPin);
      }
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pinEntry.length >= PIN_LENGTH) return;
    setPinError(null);
    const next = pinEntry + digit;
    setPinEntry(next);
    if (next.length < PIN_LENGTH) return;
    // Brief delay so the final dot is visible before feedback
    setTimeout(() => void finishPinEntry(next), 150);
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
                        nameMorph.trigger();
                      } catch (err) {
                        console.error('Failed to save name:', err);
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        if (errorMessage.includes('Database not initialized')) {
                          setTimeout(async () => {
                            try {
                              await updateProfile({ name: nameInput.trim() });
                              setEditingName(false);
                              nameMorph.trigger();
                            } catch {
                              showToast('Database not ready. Please try again later.', 'error');
                            }
                          }, 1000);
                        } else {
                          showToast('Failed to save name. Please try again.', 'error');
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
                {nameMorph.active && (
                  <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} accessibilityLabel={t.common.saved} />
                )}
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
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.highContrast}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.highContrastDesc}</Text>
              </View>
              <Switch value={highContrast} onValueChange={setHighContrast} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle high contrast mode" />
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
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.snoozeDuration}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.snoozeDurationDesc}</Text>
              </View>
              <View style={styles.themeOptions}>
                {[5, 10, 15, 30].map((min) => (
                  <TouchableOpacity
                    key={min}
                    style={[styles.themeChip, { backgroundColor: snoozeMinutes === min ? colors.accent.primary : colors.background.subtle, borderColor: snoozeMinutes === min ? colors.accent.primary : colors.border.default }]}
                    onPress={() => setSnoozeMinutes(min)}
                    accessibilityLabel={`Set snooze to ${min} minutes`}
                    accessibilityState={{ selected: snoozeMinutes === min }}
                  >
                    <Text style={[typography.label.sm, { color: snoozeMinutes === min ? '#FFFFFF' : colors.text.secondary }]}>{min}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {/* Security */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.security}</Text>
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.appLock}</Text>
                  <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.appLockDesc}</Text>
                </View>
                {lockMorph.active && (
                  <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} accessibilityLabel={t.settings.appLockEnabled} />
                )}
              </View>
              <Switch value={appLockEnabled} onValueChange={handleLockToggle} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle app lock" />
            </View>
            {appLockEnabled && biometricSupport.available && (
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.useBiometric}</Text>
                  <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.useBiometricDesc}</Text>
                </View>
                <Switch
                  value={biometricPref}
                  onValueChange={async (value) => {
                    if (value) {
                      const ok = await authenticateWithBiometrics('Confirm biometric unlock');
                      if (!ok) {
                        showToast('Biometric check did not succeed — PIN will be used.', 'error');
                        return;
                      }
                    }
                    setBiometricPref(value);
                    try {
                      await setBiometricPreferred(value);
                    } catch {
                      // Storage hiccup — toggle still reflects in this session
                    }
                  }}
                  trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                  accessibilityLabel="Toggle biometric unlock"
                />
              </View>
            )}
          </Card>
        </View>

        {/* AI Service */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.aiService}</Text>
          {isAiProxyConfigured() ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="check-decagram" size={24} color={colors.success} />
                <View style={{ flex: 1, marginStart: spacing.sm }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.aiPreconfigured}</Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>{t.settings.aiPreconfiguredDesc}</Text>
                </View>
              </View>
            </Card>
          ) : (
            <>
          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.aiServiceDesc}\nhttps://aistudio.google.com/app/apikey</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={apiKeyInput} onChangeText={setApiKeyInput} placeholder={hasStoredKey ? t.settings.apiKeySaved : t.settings.apiKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="Gemini API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: geminiKeyMorph.active ? colors.success : colors.accent.primary, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={async () => { if (!apiKeyInput.trim()) return; await saveApiKey(apiKeyInput.trim()); setApiKeyInput(''); setHasStoredKey(true); geminiKeyMorph.trigger(); }} accessibilityLabel="Save API key">
                {geminiKeyMorph.active ? (
                  <>
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.saved}</Text>
                  </>
                ) : (
                  <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
                )}
              </TouchableOpacity>
            </View>
            {hasStoredKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteApiKey(); setHasStoredKey(false); showToast('API key removed.', 'info'); }} accessibilityLabel="Remove stored API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>

          <View style={{ height: spacing.sm }} />

          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.openRouterServiceDesc}\nhttps://openrouter.ai/keys</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={openRouterKeyInput} onChangeText={setOpenRouterKeyInput} placeholder={hasStoredOpenRouterKey ? t.settings.apiKeySaved : t.settings.openRouterKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="OpenRouter API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: openRouterKeyMorph.active ? colors.success : colors.accent.primary, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={async () => { if (!openRouterKeyInput.trim()) return; await saveOpenRouterKey(openRouterKeyInput.trim()); setOpenRouterKeyInput(''); setHasStoredOpenRouterKey(true); openRouterKeyMorph.trigger(); }} accessibilityLabel="Save OpenRouter API key">
                {openRouterKeyMorph.active ? (
                  <>
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.saved}</Text>
                  </>
                ) : (
                  <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
                )}
              </TouchableOpacity>
            </View>
            {hasStoredOpenRouterKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteOpenRouterKey(); setHasStoredOpenRouterKey(false); showToast('API key removed.', 'info'); }} accessibilityLabel="Remove stored OpenRouter API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>

          <View style={{ height: spacing.sm }} />

          <Card>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.groqServiceDesc}\nhttps://console.groq.com/keys</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]} value={groqKeyInput} onChangeText={setGroqKeyInput} placeholder={hasStoredGroqKey ? t.settings.apiKeySaved : t.settings.groqKeyPlaceholder} placeholderTextColor={colors.text.disabled} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="Groq API key" />
              <TouchableOpacity style={[styles.saveKeyBtn, { backgroundColor: groqKeyMorph.active ? colors.success : colors.accent.primary, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={async () => { if (!groqKeyInput.trim()) return; await saveGroqKey(groqKeyInput.trim()); setGroqKeyInput(''); setHasStoredGroqKey(true); groqKeyMorph.trigger(); }} accessibilityLabel="Save Groq API key">
                {groqKeyMorph.active ? (
                  <>
                    <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.saved}</Text>
                  </>
                ) : (
                  <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
                )}
              </TouchableOpacity>
            </View>
            {hasStoredGroqKey && (<TouchableOpacity style={{ marginTop: spacing.sm }} onPress={async () => { await deleteGroqKey(); setHasStoredGroqKey(false); showToast('API key removed.', 'info'); }} accessibilityLabel="Remove stored Groq API key"><Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text></TouchableOpacity>)}
          </Card>
            </>
          )}
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
                  showToast('Failed to export data.', 'error');
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

      {/* App lock PIN setup / verification */}
      <Modal
        visible={pinModal !== 'none'}
        onClose={closePinModal}
        title={
          pinModal === 'enable1'
            ? t.settings.enterNewPin
            : pinModal === 'enable2'
              ? t.settings.confirmPin
              : t.settings.enterCurrentPin
        }
      >
        {pinError !== null && (
          <Text style={[typography.body.sm, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>
            {pinError}
          </Text>
        )}
        <PinKeypad
          pinLength={PIN_LENGTH}
          entered={pinEntry}
          onDigit={handlePinDigit}
          onBackspace={() => setPinEntry((prev) => prev.slice(0, -1))}
        />
        <View style={{ height: spacing.md }} />
      </Modal>
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
