import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { showToast } from '../src/components/ui/GlobalToast';
import { getProfile, updateProfile } from '../src/db/repositories/profile';
import { useAuthStore } from '../src/stores/auth-store';

export default function EmergencyCardScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [editing, setEditing] = useState(false);
  // Store original values for cancellation
  const [originalBloodGroup, setOriginalBloodGroup] = useState(profile?.blood_group ?? '');
  const [originalAllergies, setOriginalAllergies] = useState(profile?.allergies?.join(', ') ?? '');
  const [originalEmergencyName, setOriginalEmergencyName] = useState(profile?.emergency_contact?.name ?? '');
  const [originalEmergencyPhone, setOriginalEmergencyPhone] = useState(profile?.emergency_contact?.phone ?? '');
  const [originalPhysician, setOriginalPhysician] = useState(profile?.primary_physician ?? '');
  
  const [bloodGroup, setBloodGroup] = useState(profile?.blood_group ?? '');
  const [allergies, setAllergies] = useState(profile?.allergies?.join(', ') ?? '');
  const [emergencyName, setEmergencyName] = useState(profile?.emergency_contact?.name ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergency_contact?.phone ?? '');
  const [physician, setPhysician] = useState(profile?.primary_physician ?? '');
  const [saving, setSaving] = useState(false);

  // Update all states when profile changes
  useEffect(() => {
    const newBloodGroup = profile?.blood_group ?? '';
    const newAllergies = profile?.allergies?.join(', ') ?? '';
    const newEmergencyName = profile?.emergency_contact?.name ?? '';
    const newEmergencyPhone = profile?.emergency_contact?.phone ?? '';
    const newPhysician = profile?.primary_physician ?? '';
    
    setBloodGroup(newBloodGroup);
    setAllergies(newAllergies);
    setEmergencyName(newEmergencyName);
    setEmergencyPhone(newEmergencyPhone);
    setPhysician(newPhysician);
    
    // Also reset originals if not editing
    if (!editing) {
      setOriginalBloodGroup(newBloodGroup);
      setOriginalAllergies(newAllergies);
      setOriginalEmergencyName(newEmergencyName);
      setOriginalEmergencyPhone(newEmergencyPhone);
      setOriginalPhysician(newPhysician);
    }
  }, [profile]);

  const handleCancel = () => {
    // Check if any field changed
    const isDirty = bloodGroup !== originalBloodGroup || 
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
    setSaving(true);
    try {
      const contact = emergencyName && emergencyPhone
        ? { name: emergencyName, phone: emergencyPhone }
        : null;
      const allergyList = allergies.split(',').map((a) => a.trim()).filter(Boolean);

      await updateProfile({
        blood_group: bloodGroup || null,
        allergies: allergyList,
        emergency_contact: contact,
        primary_physician: physician || null,
      });
      
      // Update local states and original values first
      setOriginalBloodGroup(bloodGroup);
      setOriginalAllergies(allergies);
      setOriginalEmergencyName(emergencyName);
      setOriginalEmergencyPhone(emergencyPhone);
      setOriginalPhysician(physician);
      
      // Update profile in auth store too
      setProfile({
        ...profile!,
        blood_group: bloodGroup || null,
        allergies: allergyList,
        emergency_contact: contact,
        primary_physician: physician || null,
      });

      setEditing(false);
      showToast('Your emergency card has been updated.', 'success');
    } catch (err) {
      showToast('Failed to save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
              Emergency Card
            </Text>
            {!editing && (
              <Button title="Edit" onPress={() => setEditing(true)} variant="secondary" size="sm" />
            )}
          </View>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            This information may help in emergencies. Contact emergency services when needed.
          </Text>
        </View>

        {/* Card Display */}
        <View style={[styles.cardSection, { paddingHorizontal: spacing.base }]}>
          <Card elevated>
            <View style={styles.cardRow}>
              <MaterialCommunityIcons name="account" size={24} color={colors.accent.primary} />
              <View style={{ marginLeft: 12 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Patient</Text>
                <Text style={[typography.body.lg, { color: colors.text.primary }]}>
                  {profile?.name ?? 'Not set'}
                </Text>
              </View>
            </View>

            <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
              <MaterialCommunityIcons name="water" size={24} color={colors.error} />
              <View style={{ marginLeft: 12 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Blood group</Text>
                {editing ? (
                  <Input value={bloodGroup} onChangeText={setBloodGroup} placeholder="e.g. O+" containerStyle={{ width: 120, marginTop: 4 }} />
                ) : (
                  <Text style={[typography.body.lg, { color: colors.text.primary }]}>{bloodGroup || 'Not set'}</Text>
                )}
              </View>
            </View>

            <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.warning} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Allergies</Text>
                {editing ? (
                  <Input value={allergies} onChangeText={setAllergies} placeholder="Comma-separated" containerStyle={{ marginTop: 4 }} />
                ) : (
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>
                    {allergies || 'None listed'}
                  </Text>
                )}
              </View>
            </View>

            <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
              <MaterialCommunityIcons name="phone" size={24} color={colors.success} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Emergency contact</Text>
                {editing ? (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    <Input value={emergencyName} onChangeText={setEmergencyName} placeholder="Contact name" />
                    <Input value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="Phone number" keyboardType="phone-pad" />
                  </View>
                ) : (
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>
                    {emergencyName && emergencyPhone ? `${emergencyName} — ${emergencyPhone}` : 'Not set'}
                  </Text>
                )}
              </View>
            </View>

            <View style={[styles.cardRow, { marginTop: spacing.lg }]}>
              <MaterialCommunityIcons name="stethoscope" size={24} color={colors.info} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Primary physician</Text>
                {editing ? (
                  <Input value={physician} onChangeText={setPhysician} placeholder="Doctor name" containerStyle={{ marginTop: 4 }} />
                ) : (
                  <Text style={[typography.body.base, { color: colors.text.primary }]}>{physician || 'Not set'}</Text>
                )}
              </View>
            </View>
          </Card>
        </View>

        {editing && (
          <View style={[styles.actions, { paddingHorizontal: spacing.base }]}>
            <Button title="Save" onPress={handleSave} loading={saving} />
            <Button title="Cancel" onPress={handleCancel} variant="ghost" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  cardSection: { marginTop: 24 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { marginTop: 24, gap: 12, alignItems: 'center' },
});
