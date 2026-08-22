import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { getActiveMedicines } from '../src/db/repositories/medicine';
import { getProfile } from '../src/db/repositories/profile';
import { generateDoctorVisitReport } from '../src/utils/export';
import type { Medicine } from '../src/types/models';

export default function DoctorVisitScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState('');
  const [profileName, setProfileName] = useState('Patient');

  useEffect(() => {
    async function load() {
      try {
        const [meds, profile] = await Promise.all([
          getActiveMedicines(),
          getProfile(),
        ]);
        setMedicines(meds);
        if (profile?.name) setProfileName(profile.name);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleShare = async () => {
    try {
      const report = generateDoctorVisitReport({
        profileName,
        medicines,
        doseRecords: [],
        notes: questions || undefined,
      });
      await Share.share({
        message: report,
        title: 'Doctor Visit Report — Nusxa',
      });
    } catch {
      Alert.alert('Error', 'Failed to generate report.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            Doctor Visit Report
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            A summary to share with your healthcare provider. This is a patient-generated summary, not an official medical record.
          </Text>
        </View>

        {medicines.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.base, marginTop: 32 }}>
            <EmptyState
              icon="clipboard-text-outline"
              title="No active medicines"
              description="When you have active medicines, a visit report will be generated here."
            />
          </View>
        ) : (
          <>
            {/* Current Medicines */}
            <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
              <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                Current medicines
              </Text>
              <Card>
                {medicines.map((med, i) => (
                  <View
                    key={med.id}
                    style={[
                      styles.medRow,
                      i > 0 && { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.default },
                    ]}
                  >
                    <Text style={[typography.body.base, { color: colors.text.primary }]}>
                      {med.name ?? 'Unknown'} {med.strength ? `(${med.strength})` : ''}
                    </Text>
                    <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                      {med.dosage ?? '?'} — {med.frequency ?? '?'} — {med.duration ?? '?'}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>

            {/* Questions for doctor */}
            <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
              <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
                Questions for your doctor
              </Text>
              <Card>
                <TextInput
                  style={[
                    typography.body.base,
                    {
                      color: colors.text.primary,
                      minHeight: 80,
                      textAlignVertical: 'top',
                      padding: 0,
                    },
                  ]}
                  placeholder="Add questions before your visit so you don't forget to ask them..."
                  placeholderTextColor={colors.text.disabled}
                  value={questions}
                  onChangeText={setQuestions}
                  multiline
                  accessibilityLabel="Questions for your doctor"
                />
              </Card>
            </View>

            {/* Disclaimer */}
            <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
              <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.border.default }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
                  <Text style={[typography.body.xs, { color: colors.text.secondary, marginLeft: 8, flex: 1 }]}>
                    This report is a patient-generated summary and is not an official medical record. Always consult your healthcare provider for medical decisions.
                  </Text>
                </View>
              </Card>
            </View>

            {/* Share */}
            <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
              <Button
                title="Share report"
                onPress={handleShare}
                icon={<MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" />}
                size="lg"
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  section: { marginTop: 24 },
  medRow: {},
});
