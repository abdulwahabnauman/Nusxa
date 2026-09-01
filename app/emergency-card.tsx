import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert, TouchableOpacity, Linking, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { showToast } from '../src/components/ui/GlobalToast';
import { useSuccessMorph } from '../src/hooks/useSuccessMorph';
import { getProfile, updateProfile } from '../src/db/repositories/profile';
import { useAuthStore } from '../src/stores/auth-store';
import { useI18n } from '../src/i18n';
import { getLocalizedName } from '../src/utils/profileName';
import { calculateAge, isValidDate } from '../src/utils/date';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function EmergencyCardScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t, isRTL, language } = useI18n();
  const router = useRouter();
  const align = isRTL ? 'right' : 'left';
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [editing, setEditing] = useState(false);
  // Store original values for cancellation
  const [originalDob, setOriginalDob] = useState(profile?.date_of_birth ?? '');
  const [originalBloodGroup, setOriginalBloodGroup] = useState(profile?.blood_group ?? '');
  const [originalAllergies, setOriginalAllergies] = useState(profile?.allergies?.join(', ') ?? '');
  const [originalEmergencyName, setOriginalEmergencyName] = useState(profile?.emergency_contact?.name ?? '');
  const [originalEmergencyPhone, setOriginalEmergencyPhone] = useState(profile?.emergency_contact?.phone ?? '');
  const [originalPhysician, setOriginalPhysician] = useState(profile?.primary_physician ?? '');

  const [dob, setDob] = useState(profile?.date_of_birth ?? '');
  const [bloodGroup, setBloodGroup] = useState(profile?.blood_group ?? '');
  const [allergies, setAllergies] = useState(profile?.allergies?.join(', ') ?? '');
  const [emergencyName, setEmergencyName] = useState(profile?.emergency_contact?.name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergency_contact?.phone ?? '');
  const [physician, setPhysician] = useState(profile?.primary_physician ?? '');
  const [saving, setSaving] = useState(false);
  const savedMorph = useSuccessMorph();

  // Update all states when profile changes
  useEffect(() => {
    const newDob = profile?.date_of_birth ?? '';
    const newBloodGroup = profile?.blood_group ?? '';
    const newAllergies = profile?.allergies?.join(', ') ?? '';
    const newEmergencyName = profile?.emergency_contact?.name ?? '';
    const newEmergencyPhone = profile?.emergency_contact?.phone ?? '';
    const newPhysician = profile?.primary_physician ?? '';

    setDob(newDob);
    setBloodGroup(newBloodGroup);
    setAllergies(newAllergies);
    setEmergencyName(newEmergencyName);
    setEmergencyPhone(newEmergencyPhone);
    setPhysician(newPhysician);

    // Also reset originals if not editing
    if (!editing) {
      setOriginalDob(newDob);
      setOriginalBloodGroup(newBloodGroup);
      setOriginalAllergies(newAllergies);
      setOriginalEmergencyName(newEmergencyName);
      setOriginalEmergencyPhone(newEmergencyPhone);
      setOriginalPhysician(newPhysician);
    }
  }, [profile]);

  const handleCancel = () => {
    // Check if any field changed
    const isDirty = dob !== originalDob ||
                   bloodGroup !== originalBloodGroup ||
                   allergies !== originalAllergies ||
                   emergencyName !== originalEmergencyName ||
                   emergencyPhone !== originalEmergencyPhone ||
                   physician !== originalPhysician;

    if (isDirty) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to cancel?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            onPress: () => {
              // Reset all fields to original values
              setDob(originalDob);
              setBloodGroup(originalBloodGroup);
              setAllergies(originalAllergies);
              setEmergencyName(originalEmergencyName);
              setEmergencyPhone(originalEmergencyPhone);
              setPhysician(originalPhysician);
              setEditing(false);
            }
          }
        ]
      );
    } else {
      setEditing(false);
    }
  };

  const handleSave = async () => {
    const trimmedDob = dob.trim();
    if (trimmedDob && !isValidDate(trimmedDob)) {
      showToast(t.onboarding.dobInvalid, 'warning');
      return;
    }
    setSaving(true);
    try {
      const contact = emergencyName && emergencyPhone
        ? { name: emergencyName, phone: emergencyPhone }
        : null;
      const allergyList = allergies.split(',').map((a) => a.trim()).filter(Boolean);

      await updateProfile({
        date_of_birth: trimmedDob || null,
        blood_group: bloodGroup || null,
        allergies: allergyList,
        emergency_contact: contact,
        primary_physician: physician || null,
      });

      // Update local states and original values first
      setOriginalDob(trimmedDob);
      setOriginalBloodGroup(bloodGroup);
      setOriginalAllergies(allergies);
      setOriginalEmergencyName(emergencyName);
      setOriginalEmergencyPhone(emergencyPhone);
      setOriginalPhysician(physician);

      // Update profile in auth store too
      setProfile({
        ...profile!,
        date_of_birth: trimmedDob || null,
        blood_group: bloodGroup || null,
        allergies: allergyList,
        emergency_contact: contact,
        primary_physician: physician || null,
      });

      // Inline confirmation on the Save button, then collapse back to read mode
      savedMorph.trigger();
      setTimeout(() => setEditing(false), 1200);
    } catch (err) {
      showToast(t.toasts.saveFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.inner}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
                {t.emergency.title}
              </Text>
              {!editing && (
                <Button title={t.common.edit} onPress={() => setEditing(true)} variant="secondary" size="sm" />
              )}
            </View>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
              {t.emergency.subtitle}
            </Text>
          </View>

          {/* Card Display */}
          <View style={[styles.cardSection, { paddingHorizontal: spacing.base }]}>
            <Card elevated>
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name="account" size={24} color={colors.accent.primary} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.emergency.patient}</Text>
                  <Text style={[typography.body.lg, { color: colors.text.primary, textAlign: align }]}>
                    {getLocalizedName(profile, language) ?? t.common.notSet}
                  </Text>
                </View>
              </View>

              <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="cake-variant-outline" size={24} color={colors.info} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.onboarding.dobLabel}</Text>
                  {editing ? (
                    <Input value={dob} onChangeText={setDob} placeholder={t.onboarding.dobPlaceholder} keyboardType="numbers-and-punctuation" containerStyle={{ marginTop: 4 }} />
                  ) : dob ? (
                    <Text style={[typography.body.base, { color: colors.text.primary, textAlign: align }]}>
                      {dob}{(() => { const a = calculateAge(dob); return a !== null ? ` · ${t.emergency.ageYears.replace('{n}', String(a))}` : ''; })()}
                    </Text>
                  ) : (
                    <Text style={[typography.body.sm, { color: colors.text.disabled, textAlign: align }]}>{t.emergency.dobHint}</Text>
                  )}
                </View>
              </View>

              <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="water" size={24} color={colors.error} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.emergency.bloodGroup}</Text>
                  {editing ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {BLOOD_GROUPS.map((group) => {
                        const selected = bloodGroup === group;
                        return (
                          <TouchableOpacity
                            key={group}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 16,
                              borderWidth: 1,
                              backgroundColor: selected ? colors.error : colors.background.subtle,
                              borderColor: selected ? colors.error : colors.border.default,
                            }}
                            onPress={() => setBloodGroup(selected ? '' : group)}
                            accessibilityLabel={`Set blood group to ${group}`}
                            accessibilityState={{ selected }}
                          >
                            <Text style={[typography.label.sm, { color: selected ? '#FFFFFF' : colors.text.secondary }]}>{group}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[typography.body.lg, { color: colors.text.primary, textAlign: align }]}>{bloodGroup || t.common.notSet}</Text>
                  )}
                </View>
              </View>

              <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.warning} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.emergency.allergies}</Text>
                  {editing ? (
                    <Input value={allergies} onChangeText={setAllergies} placeholder="Comma-separated" containerStyle={{ marginTop: 4 }} />
                  ) : (
                    <Text style={[typography.body.base, { color: colors.text.primary, textAlign: align }]}>
                      {allergies || t.emergency.noneListed}
                    </Text>
                  )}
                </View>
              </View>

              <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="phone" size={24} color={colors.success} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.emergency.emergencyContact}</Text>
                  {editing ? (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <Input value={emergencyName} onChangeText={setEmergencyName} placeholder="Contact name" />
                      <Input value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="Phone number" keyboardType="phone-pad" />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[typography.body.base, { color: colors.text.primary, textAlign: align, flex: 1 }]}>
                        {emergencyName && emergencyPhone ? `${emergencyName}, ${emergencyPhone}` : t.common.notSet}
                      </Text>
                      {/* One-tap call — the whole point of keeping this number here */}
                      {!!emergencyPhone && !editing && (
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: colors.success,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 20,
                          }}
                          onPress={() => Linking.openURL(`tel:${emergencyPhone.replace(/[\s()-]/g, '')}`)}
                          accessibilityLabel={`${t.emergency.call} ${emergencyName}`}
                        >
                          <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
                          <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.emergency.call}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>

              <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
                <MaterialCommunityIcons name="stethoscope" size={24} color={colors.info} />
                <View style={{ marginStart: 12, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.secondary, textAlign: align }]}>{t.emergency.physician}</Text>
                  {editing ? (
                    <Input value={physician} onChangeText={setPhysician} placeholder="Doctor name" containerStyle={{ marginTop: 4 }} />
                  ) : (
                    <Text style={[typography.body.base, { color: colors.text.primary, textAlign: align }]}>{physician || t.common.notSet}</Text>
                  )}
                </View>
              </View>
            </Card>
          </View>

          {editing && (
            <View style={[styles.actions, { paddingHorizontal: spacing.base }]}>
              <Button
                title={savedMorph.active ? t.common.saved : t.common.save}
                onPress={handleSave}
                loading={saving}
                icon={savedMorph.active ? <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" /> : undefined}
                style={{ flex: 1, ...(savedMorph.active ? { backgroundColor: colors.success } : {}) }}
              />
              <Button title={t.common.cancel} onPress={handleCancel} variant="ghost" style={{ flex: 1 }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  cardSection: { marginTop: 24 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { marginTop: 24, gap: 12, flexDirection: 'row' },
});
