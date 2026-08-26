import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/ui/EmptyState';
import { showToast } from '../src/components/ui/GlobalToast';
import { getActiveMedicines } from '../src/db/repositories/medicine';
import { getActiveSchedules } from '../src/db/repositories/schedule';
import { getProfile } from '../src/db/repositories/profile';
import type { Medicine, Schedule } from '../src/types/models';

export default function DoctorVisitScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [questions, setQuestions] = useState('');
  const [profileName, setProfileName] = useState('Patient');

  useEffect(() => {
    async function load() {
      try {
        const [meds, activeSchedules, profile] = await Promise.all([
          getActiveMedicines(),
          getActiveSchedules(),
          getProfile(),
        ]);
        setMedicines(meds);
        setSchedules(activeSchedules);
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
    if (sharing) return;
    setSharing(true);
    let pdfUri: string | null = null;
    try {
      // Generate a clean PDF on-device, then hand it to the native share sheet.
      // The PDF stack is heavy, so load it only when the user actually shares.
      const { generateDoctorVisitPdf } = require('../src/utils/pdf') as typeof import('../src/utils/pdf');
      pdfUri = await generateDoctorVisitPdf({
        profileName,
        medicines,
        schedules,
        notes: questions || undefined,
      });
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share doctor visit report',
        UTI: 'com.adobe.pdf',
      });
    } catch {
      showToast('Failed to generate the PDF report.', 'error');
    } finally {
      // The share sheet copies the file out, so the temp PDF can go afterwards
      if (pdfUri) {
        try { await FileSystem.deleteAsync(pdfUri, { idempotent: true }); } catch {}
      }
      setSharing(false);
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
                title={sharing ? 'Preparing PDF…' : 'Share PDF report'}
                onPress={handleShare}
                loading={sharing}
                icon={<MaterialCommunityIcons name="file-pdf-box" size={20} color="#FFFFFF" />}
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
