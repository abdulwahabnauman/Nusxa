import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Button } from '../../src/components/ui/Button';
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
  biometricDevBypass,
  withLockExemption,
} from '../../src/utils/appLock';
import { deleteProfile, updateProfile, getProfile } from '../../src/db/repositories/profile';
import { exportAsJSON, importFromJSON, createEncryptedBackup, isEncryptedBackup, openEncryptedBackup } from '../../src/utils/export';
import type { ImportResult } from '../../src/utils/export';
import { syncDoseNotifications } from '../../src/utils/notifications';
import { isValidDate } from '../../src/utils/date';
import { saveApiKey, getApiKey, deleteApiKey, saveOpenRouterKey, getOpenRouterKey, deleteOpenRouterKey, saveGroqKey, getGroqKey, deleteGroqKey } from '../../src/utils/secureStorage';
import { isAiProxyConfigured } from '../../src/constants/config';
import { formatDigits } from '../../src/utils/numerals';
import { selectionHaptic } from '../../src/utils/haptics';
import { useSuccessMorph } from '../../src/hooks/useSuccessMorph';
import { useTabScrollReset } from '../../src/hooks/useTabScrollReset';
import { useI18n } from '../../src/i18n';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface ApiKeyFieldProps {
  description: string;
  url: string;
  placeholder: string;
  savedPlaceholder: string;
  keyLabel: string;
  loadKey: () => Promise<string | null>;
  saveKey: (key: string) => Promise<void>;
  deleteKey: () => Promise<void>;
}

/** One AI-provider key card: input, save button with success morph, and a
 * remove link. Shared by Gemini, OpenRouter and Groq. */
function ApiKeyField({
  description,
  url,
  placeholder,
  savedPlaceholder,
  keyLabel,
  loadKey,
  saveKey,
  deleteKey,
}: ApiKeyFieldProps) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const morph = useSuccessMorph();
  const [input, setInput] = useState('');
  const [hasStored, setHasStored] = useState(false);

  useEffect(() => {
    loadKey().then((key) => setHasStored(!!key));
  }, [loadKey]);

  return (
    <Card>
      <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
        {`${description}\n${url}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }]}
          value={input}
          onChangeText={setInput}
          placeholder={hasStored ? savedPlaceholder : placeholder}
          placeholderTextColor={colors.text.disabled}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`${keyLabel} API key`}
        />
        <TouchableOpacity
          style={[styles.saveKeyBtn, { backgroundColor: morph.active ? colors.success : colors.accent.primary, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
          onPress={async () => {
            if (!input.trim()) return;
            await saveKey(input.trim());
            setInput('');
            setHasStored(true);
            morph.trigger();
          }}
          accessibilityLabel={`Save ${keyLabel} API key`}
        >
          {morph.active ? (
            <>
              <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
              <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.saved}</Text>
            </>
          ) : (
            <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.settings.saveKey}</Text>
          )}
        </TouchableOpacity>
      </View>
      {hasStored && (
        <TouchableOpacity
          style={{ marginTop: spacing.sm }}
          onPress={async () => {
            await deleteKey();
            setHasStored(false);
            showToast(t.toasts.apiKeyRemoved, 'info');
          }}
          accessibilityLabel={`Remove stored ${keyLabel} API key`}
        >
          <Text style={[typography.body.sm, { color: colors.error }]}>{t.settings.removeKey}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

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
  const reminderEscalation = useSettingsStore((s) => s.reminderEscalation);
  const setReminderEscalation = useSettingsStore((s) => s.setReminderEscalation);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const useOwnKeys = useSettingsStore((s) => s.useOwnKeys);
  const setUseOwnKeys = useSettingsStore((s) => s.setUseOwnKeys);
  const nf = (v: string | number) => formatDigits(v, easternNumerals);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const appLockEnabled = useAuthStore((s) => s.appLockEnabled);
  const setAppLockEnabled = useAuthStore((s) => s.setAppLockEnabled);
  const setLocked = useAuthStore((s) => s.setLocked);
  const { t, language, setLanguage } = useI18n();
  const nameMorph = useSuccessMorph();
  const lockMorph = useSuccessMorph();
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [dobInput, setDobInput] = useState('');
  const [editingDob, setEditingDob] = useState(false);
  const [editingBlood, setEditingBlood] = useState(false);
  const [importing, setImporting] = useState(false);
  const [biometricSupport, setBiometricSupport] = useState<{ available: boolean; label: string | null }>({
    available: false,
    label: null,
  });
  const [biometricPref, setBiometricPref] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollReset(
    useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), [])
  );
  const [pinModal, setPinModal] = useState<'none' | 'enable1' | 'enable2' | 'disable'>('none');
  const [pinDraft, setPinDraft] = useState('');
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  // Encrypted backup flow (audit Feature 17): one modal serves both creating
  // an encrypted export ('export') and restoring one ('import').
  const [encModal, setEncModal] = useState<'none' | 'export' | 'import'>('none');
  const [encPassword, setEncPassword] = useState('');
  const [encConfirm, setEncConfirm] = useState('');
  const [encError, setEncError] = useState<string | null>(null);
  const [encBusy, setEncBusy] = useState(false);
  const pendingEncryptedRaw = useRef<string | null>(null);

  useEffect(() => {
    getBiometricSupport().then(setBiometricSupport);
    isBiometricPreferred().then(setBiometricPref);
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
          catch (err) { showToast(t.toasts.deleteDataFailed, 'error'); }
        }}
      ]
    );
  };

  // Shared tail of every successful import (plain or encrypted): reflect the
  // restored profile in the stores so settings flip live without a restart.
  const finishImport = async (counts: ImportResult) => {
    try {
      const restored = await getProfile();
      if (restored) {
        setProfile(restored);
        const s = useSettingsStore.getState();
        s.setLanguage(restored.language === 'ur' ? 'ur' : 'en');
        s.setNotificationsEnabled(restored.notifications_enabled);
        s.setReminderEscalation(restored.reminder_escalation ?? true);
        s.setReducedMotion(restored.reduced_motion);
        s.setSnoozeMinutes(restored.snooze_minutes ?? 10);
      }
    } catch { /* profile section refreshes on next load */ }

    showToast(
      t.toasts.importComplete
        .replace('{medicines}', String(counts.medicines))
        .replace('{schedules}', String(counts.schedules))
        .replace('{doseRecords}', String(counts.doseRecords)),
      'success',
      6000,
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
              const result = await withLockExemption(() =>
                DocumentPicker.getDocumentAsync({
                  type: ['application/json', 'text/plain'],
                  copyToCacheDirectory: true,
                })
              );
              if (result.canceled || !result.assets?.[0]) return;

              setImporting(true);
              const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);

              // Encrypted backups need a password before they can be restored
              if (isEncryptedBackup(raw)) {
                setImporting(false);
                pendingEncryptedRaw.current = raw;
                setEncPassword('');
                setEncConfirm('');
                setEncError(null);
                setEncModal('import');
                return;
              }

              const counts = await importFromJSON(raw);
              await finishImport(counts);
            } catch (err) {
              const message = err instanceof Error ? err.message : 'The file could not be imported.';
              showToast(t.toasts.importFailed.replace('{error}', message), 'error', 6000);
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  const closeEncModal = () => {
    setEncModal('none');
    setEncPassword('');
    setEncConfirm('');
    setEncError(null);
    pendingEncryptedRaw.current = null;
  };

  const handleEncryptedExport = async () => {
    if (encBusy) return;
    if (encPassword.length < 8) {
      setEncError(t.settings.backupPasswordTooShort);
      return;
    }
    if (encPassword !== encConfirm) {
      setEncError(t.settings.backupPasswordMismatch);
      return;
    }
    setEncBusy(true);
    try {
      const envelope = await createEncryptedBackup(encPassword);
      const fileName = `Nusxa_Encrypted_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, envelope, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      closeEncModal();
      await withLockExemption(() =>
        Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: t.settings.encryptedBackup,
        })
      );
      showToast(t.settings.encryptedBackupReady, 'success');
    } catch (err) {
      // The export pipeline tags each step, so the toast says exactly what failed
      console.error('[backup] encrypted export failed:', err);
      const detail = err instanceof Error && err.message ? err.message : '';
      showToast(t.toasts.exportFailed.replace('{error}', detail).trim(), 'error', 6000);
    } finally {
      setEncBusy(false);
    }
  };

  const handleEncryptedImport = async () => {
    const raw = pendingEncryptedRaw.current;
    if (encBusy || !raw) return;
    setEncBusy(true);
    try {
      const decrypted = openEncryptedBackup(raw, encPassword);
      const counts = await importFromJSON(decrypted);
      closeEncModal();
      await finishImport(counts);
    } catch (err) {
      if (err instanceof Error && err.message === 'wrong-password') {
        setEncError(t.settings.wrongBackupPassword);
      } else {
        const message = err instanceof Error ? err.message : 'The file could not be imported.';
        closeEncModal();
        showToast(t.toasts.importFailed.replace('{error}', message), 'error', 6000);
      }
    } finally {
      setEncBusy(false);
    }
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
          showToast(t.toasts.appLockEnableFailed, 'error');
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

  const aiKeyFields = (
    <>
      <ApiKeyField
        description={t.settings.aiServiceDesc}
        url="https://aistudio.google.com/app/apikey"
        placeholder={t.settings.apiKeyPlaceholder}
        savedPlaceholder={t.settings.apiKeySaved}
        keyLabel="Gemini"
        loadKey={getApiKey}
        saveKey={saveApiKey}
        deleteKey={deleteApiKey}
      />
      <View style={{ height: spacing.sm }} />
      <ApiKeyField
        description={t.settings.groqServiceDesc}
        url="https://console.groq.com/keys"
        placeholder={t.settings.groqKeyPlaceholder}
        savedPlaceholder={t.settings.apiKeySaved}
        keyLabel="Groq"
        loadKey={getGroqKey}
        saveKey={saveGroqKey}
        deleteKey={deleteGroqKey}
      />
      <View style={{ height: spacing.sm }} />
      <ApiKeyField
        description={t.settings.openRouterServiceDesc}
        url="https://openrouter.ai/keys"
        placeholder={t.settings.openRouterKeyPlaceholder}
        savedPlaceholder={t.settings.apiKeySaved}
        keyLabel="OpenRouter"
        loadKey={getOpenRouterKey}
        saveKey={saveOpenRouterKey}
        deleteKey={deleteOpenRouterKey}
      />
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>{t.settings.title}</Text>
        </View>

        {/* Profile */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>{t.settings.profile}</Text>
          <Card>
            {editingName ? (
              <View style={{ gap: 16 }}>
                <Text style={[typography.label.base, { color: colors.text.secondary }]}>{t.settings.name}</Text>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder={t.onboarding.yourName}
                  placeholderTextColor={colors.text.disabled}
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
                              showToast(t.toasts.databaseNotReady, 'error');
                            }
                          }, 1000);
                        } else {
                          showToast(t.toasts.saveNameFailed, 'error');
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
              <>
                <TouchableOpacity style={styles.row} onPress={() => { setNameInput(profile?.name ?? ''); setEditingName(true); }}>
                  <Text style={[typography.body.base, { color: colors.text.secondary }]}>{t.settings.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[typography.body.base, { color: colors.text.primary }]}>
                      {profile?.name || t.common.loading}
                    </Text>
                    {nameMorph.active && (
                      <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} accessibilityLabel={t.common.saved} />
                    )}
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.accent.primary} />
                  </View>
                </TouchableOpacity>

                {/* Date of birth — optional; leave empty to keep it unset */}
                <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                {editingDob ? (
                  <View style={{ gap: 12 }}>
                    <Text style={[typography.label.base, { color: colors.text.secondary }]}>{t.onboarding.dobLabel}</Text>
                    <TextInput
                      value={dobInput}
                      onChangeText={setDobInput}
                      placeholder={t.onboarding.dobPlaceholder}
                      placeholderTextColor={colors.text.disabled}
                      keyboardType="numbers-and-punctuation"
                      autoFocus
                      style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }]}
                    />
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        style={[styles.saveKeyBtn, { backgroundColor: colors.accent.primary, flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 }]}
                        onPress={async () => {
                          const trimmed = dobInput.trim();
                          if (trimmed && !isValidDate(trimmed)) {
                            showToast(t.onboarding.dobInvalid, 'warning');
                            return;
                          }
                          try {
                            await updateProfile({ date_of_birth: trimmed || null });
                            if (profile) setProfile({ ...profile, date_of_birth: trimmed || null });
                            setEditingDob(false);
                          } catch {
                            showToast(t.toasts.saveFailed, 'error');
                          }
                        }}
                      >
                        <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.common.save}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveKeyBtn, { backgroundColor: colors.border.default, flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 }]}
                        onPress={() => setEditingDob(false)}
                      >
                        <Text style={[typography.label.sm, { color: colors.text.secondary }]}>{t.common.cancel}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.row} onPress={() => { setDobInput(profile?.date_of_birth ?? ''); setEditingDob(true); }}>
                    <Text style={[typography.body.base, { color: colors.text.secondary }]}>{t.onboarding.dobLabel}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[typography.body.base, { color: profile?.date_of_birth ? colors.text.primary : colors.text.disabled }]}>
                        {profile?.date_of_birth || t.common.notSet}
                      </Text>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.accent.primary} />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Blood group — optional; tapping the selected chip clears it */}
                {!editingDob && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border.default }]} />
                    <TouchableOpacity style={styles.row} onPress={() => setEditingBlood((v) => !v)}>
                      <Text style={[typography.body.base, { color: colors.text.secondary }]}>{t.emergency.bloodGroup}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[typography.body.base, { color: profile?.blood_group ? colors.text.primary : colors.text.disabled }]}>
                          {profile?.blood_group || t.common.notSet}
                        </Text>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.accent.primary} />
                      </View>
                    </TouchableOpacity>
                    {editingBlood && (
                      <View style={[styles.themeOptions, { flexWrap: 'wrap', marginTop: spacing.sm }]}>
                        {BLOOD_GROUPS.map((group) => {
                          const selected = profile?.blood_group === group;
                          return (
                            <TouchableOpacity
                              key={group}
                              style={[styles.themeChip, { backgroundColor: selected ? colors.accent.primary : colors.background.subtle, borderColor: selected ? colors.accent.primary : colors.border.default }]}
                              onPress={async () => {
                                const next = selected ? null : group;
                                try {
                                  await updateProfile({ blood_group: next });
                                  if (profile) setProfile({ ...profile, blood_group: next });
                                } catch {
                                  showToast(t.toasts.saveFailed, 'error');
                                }
                              }}
                              accessibilityLabel={`Set blood group to ${group}`}
                              accessibilityState={{ selected }}
                            >
                              <Text style={[typography.label.sm, { color: selected ? '#FFFFFF' : colors.text.secondary }]}>{group}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </>
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
                  <TouchableOpacity key={opt} style={[styles.themeChip, { backgroundColor: themePref === opt ? colors.accent.primary : colors.background.subtle, borderColor: themePref === opt ? colors.accent.primary : colors.border.default }]} onPress={() => { if (themePref !== opt) { selectionHaptic(); setPreference(opt); } }} accessibilityLabel={`Set theme to ${opt}`} accessibilityState={{ selected: themePref === opt }}>
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
              <Switch value={elderlyMode} onValueChange={(v) => { selectionHaptic(); setElderlyMode(v); }} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle elderly mode" />
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.highContrast}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.highContrastDesc}</Text>
              </View>
              <Switch value={highContrast} onValueChange={(v) => { selectionHaptic(); setHighContrast(v); }} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle high contrast mode" />
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.reducedMotion}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.reducedMotionDesc}</Text>
              </View>
              <Switch value={reducedMotion} onValueChange={(v) => { selectionHaptic(); setReducedMotion(v); }} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle reduced motion" />
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
                      selectionHaptic();
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
              <Switch value={notificationsEnabled} onValueChange={(v) => { selectionHaptic(); setNotificationsEnabled(v); }} trackColor={{ false: colors.border.default, true: colors.accent.primary }} accessibilityLabel="Toggle medicine reminders" />
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
                    onPress={() => { if (snoozeMinutes !== min) { selectionHaptic(); setSnoozeMinutes(min); } }}
                    accessibilityLabel={`Set snooze to ${min} minutes`}
                    accessibilityState={{ selected: snoozeMinutes === min }}
                  >
                    <Text style={[typography.label.sm, { color: snoozeMinutes === min ? '#FFFFFF' : colors.text.secondary }]}>{nf(min)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.reminderEscalation}</Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.reminderEscalationDesc}</Text>
              </View>
              <Switch
                value={reminderEscalation}
                onValueChange={(value) => {
                  selectionHaptic();
                  setReminderEscalation(value);
                  // Arm/disarm the post-window re-rings right away
                  void syncDoseNotifications();
                }}
                trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                accessibilityLabel="Toggle reminder escalation"
              />
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
                      const ok =
                        (await authenticateWithBiometrics('Confirm biometric unlock')).ok ||
                        biometricDevBypass();
                      if (!ok) {
                        showToast(t.toasts.biometricFallback, 'error');
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
            <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="check-decagram" size={24} color={colors.success} />
                <View style={{ flex: 1, marginStart: spacing.sm }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.aiPreconfigured}</Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>{t.settings.aiPreconfiguredDesc}</Text>
                </View>
              </View>
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.ownKeys}</Text>
                  <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.ownKeysDesc}</Text>
                </View>
                <Switch
                  value={useOwnKeys}
                  onValueChange={(value) => {
                    selectionHaptic();
                    setUseOwnKeys(value);
                  }}
                  trackColor={{ false: colors.border.default, true: colors.accent.primary }}
                  accessibilityLabel="Toggle use my own keys"
                />
              </View>
            </Card>
            {useOwnKeys && (
              <View style={{ marginTop: spacing.sm }}>{aiKeyFields}</View>
            )}
            </>
          ) : (
            aiKeyFields
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
                  await withLockExemption(() =>
                    Sharing.shareAsync(fileUri, {
                      mimeType: 'application/json',
                      dialogTitle: 'Export Nusxa data',
                    })
                  );
                } catch (err) {
                  console.error('[backup] plain export failed:', err);
                  const detail = err instanceof Error && err.message ? err.message : '';
                  showToast(t.toasts.exportFailed.replace('{error}', detail).trim(), 'error', 6000);
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
              onPress={() => {
                setEncPassword('');
                setEncConfirm('');
                setEncError(null);
                setEncModal('export');
              }}
              accessibilityLabel="Create encrypted backup"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.text.primary} />
                <View style={{ marginLeft: 8, flexShrink: 1 }}>
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{t.settings.encryptedBackup}</Text>
                  <Text style={[typography.body.xs, { color: colors.text.secondary }]}>{t.settings.encryptedBackupDesc}</Text>
                </View>
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

      {/* Encrypted backup password (create or restore) */}
      <Modal
        visible={encModal !== 'none'}
        onClose={closeEncModal}
        title={encModal === 'import' ? t.settings.enterBackupPassword : t.settings.setBackupPassword}
      >
        <Text style={[typography.body.sm, { color: colors.text.secondary, marginBottom: spacing.md }]}>
          {encModal === 'import' ? t.settings.enterBackupPasswordHint : t.settings.backupPasswordHint}
        </Text>
        <TextInput
          style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm }]}
          value={encPassword}
          onChangeText={(v) => { setEncPassword(v); setEncError(null); }}
          placeholder={t.settings.backupPasswordLabel}
          placeholderTextColor={colors.text.disabled}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Backup password"
        />
        {encModal === 'export' && (
          <TextInput
            style={[typography.body.base, { color: colors.text.primary, backgroundColor: colors.background.subtle, borderColor: colors.border.default, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm }]}
            value={encConfirm}
            onChangeText={(v) => { setEncConfirm(v); setEncError(null); }}
            placeholder={t.settings.backupPasswordConfirmLabel}
            placeholderTextColor={colors.text.disabled}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Confirm backup password"
          />
        )}
        {encError !== null && (
          <Text style={[typography.body.sm, { color: colors.error, marginBottom: spacing.sm }]}>{encError}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title={t.common.cancel}
            variant="secondary"
            onPress={closeEncModal}
            style={{ flex: 1 }}
          />
          <Button
            title={encModal === 'import' ? t.settings.backupRestore : t.settings.backupCreate}
            onPress={encModal === 'import' ? handleEncryptedImport : handleEncryptedExport}
            loading={encBusy}
            disabled={!encPassword}
            style={{ flex: 1 }}
          />
        </View>
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
