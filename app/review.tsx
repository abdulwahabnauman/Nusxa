import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { Badge } from '../src/components/ui/Badge';
import { showToast } from '../src/components/ui/GlobalToast';
import { PrescriptionJSON, MedicineJSON, ValidationResult } from '../src/ai/types';
import { LOW_CONFIDENCE_THRESHOLD } from '../src/constants/config';
import {
  analyzePrescriptionDuplicates,
  DuplicateAnalysis,
} from '../src/utils/savePrescription';

export default function ReviewScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const { imageUri, prescriptionData, validationData } = useLocalSearchParams<{
    imageUri: string;
    prescriptionData: string;
    validationData: string;
  }>();

  const initialData = useMemo(() => {
    try {
      return JSON.parse(prescriptionData ?? '{}') as PrescriptionJSON;
    } catch {
      return null;
    }
  }, [prescriptionData]);

  const validation = useMemo(() => {
    try {
      return JSON.parse(validationData ?? '{}') as ValidationResult;
    } catch {
      return null;
    }
  }, [validationData]);

  const [data, setData] = useState<PrescriptionJSON | null>(initialData);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<DuplicateAnalysis | null>(null);

  // Flag re-scans up front so the user knows these medicines already exist.
  useEffect(() => {
    let cancelled = false;
    if (initialData) {
      analyzePrescriptionDuplicates(initialData)
        .then((result) => {
          if (!cancelled) setDupes(result);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  if (!data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <Text style={[typography.body.base, { color: colors.error }]}>
            No prescription data available.
          </Text>
          <Button title="Go back" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const updateMedicine = (index: number, field: keyof MedicineJSON, value: unknown) => {
    setData((prev) => {
      if (!prev) return prev;
      const medicines = [...prev.medicines];
      medicines[index] = { ...medicines[index]!, [field]: value };
      return { ...prev, medicines };
    });
  };

  const isFieldLowConfidence = (medicine: MedicineJSON, field: string) => {
    const source = medicine.field_sources?.[field];
    return medicine.confidence < LOW_CONFIDENCE_THRESHOLD || source === 'unknown';
  };

  const handleVerify = async () => {
    // Check required fields
    const missing: string[] = [];
    data.medicines.forEach((med, i) => {
      if (!med.name) missing.push(`Medicine ${i + 1}: name`);
      if (!med.dosage) missing.push(`Medicine ${i + 1}: dosage`);
      if (!med.frequency) missing.push(`Medicine ${i + 1}: frequency`);
      if (!med.duration) missing.push(`Medicine ${i + 1}: duration`);
    });

    if (missing.length > 0) {
      showToast(`Required fields missing — please fill in: ${missing.join(', ')}`, 'warning', 5000);
      return;
    }

    setSaving(true);
    try {
      // Mark all medicines as verified before handing off to scheduling.
      const verifiedData: PrescriptionJSON = {
        ...data,
        verification_status: 'verified',
        medicines: data.medicines.map((m) => ({
          ...m,
          verification_status: 'verified' as const,
        })),
      };

      // Save to database (will be connected in Phase 5/6)
      // For now, pass data to schedule screen
      router.replace({
        pathname: '/schedule',
        params: {
          prescriptionData: JSON.stringify(verifiedData),
          imageUri: imageUri ?? '',
        },
      });
    } catch (err) {
      showToast('Failed to save prescription. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard prescription',
      'Are you sure you want to discard this prescription? You will need to scan it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.replace('/(tabs)') },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            Review prescription
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            Verify the extracted information before creating your schedule.
          </Text>
        </View>

        {/* Image Preview */}
        {imageUri && (
          <View style={[styles.imageSection, { paddingHorizontal: spacing.base }]}>
            <Image
              source={{ uri: imageUri }}
              style={[styles.prescriptionImage, { borderRadius: borderRadius.md }]}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Duplicate prescription banner */}
        {dupes?.isFullDuplicate && (
          <View style={[styles.warningsSection, { paddingHorizontal: spacing.base }]}>
            <Card style={{ backgroundColor: colors.warning + '1A', borderColor: colors.warning }}>
              <View style={styles.warningRow}>
                <MaterialCommunityIcons name="check-decagram-outline" size={20} color={colors.warning} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={[typography.label.base, { color: colors.text.primary }]}>
                    Already in your list
                  </Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                    {dupes.samePrescriptionOnRecord
                      ? 'This prescription was scanned before and all of its medicines are already being tracked. Continuing will refresh their reminders — nothing will be added twice.'
                      : `All ${dupes.total} medicine${dupes.total === 1 ? '' : 's'} on this prescription ${dupes.total === 1 ? 'is' : 'are'} already in your list. Continuing will refresh ${dupes.total === 1 ? 'its' : 'their'} reminders — nothing will be added twice.`}
                  </Text>
                </View>
              </View>
              <Button
                title="Keep current schedule"
                variant="secondary"
                size="sm"
                onPress={() => router.replace('/(tabs)')}
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
              />
            </Card>
          </View>
        )}

        {/* Warnings */}
        {validation?.warnings && validation.warnings.length > 0 && (
          <View style={[styles.warningsSection, { paddingHorizontal: spacing.base }]}>
            <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.accent.primary }}>
              {validation.warnings.map((warning, i) => (
                <View key={i} style={styles.warningRow}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} />
                  <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {warning}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Prescription Info */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
            Prescription details
          </Text>
          <Card>
            <Input
              label="Doctor name"
              value={data.prescription.doctor_name ?? ''}
              onChangeText={(text) =>
                setData((prev) =>
                  prev ? { ...prev, prescription: { ...prev.prescription, doctor_name: text || null } } : prev
                )
              }
              placeholder="Not detected"
              containerStyle={{ marginBottom: spacing.md }}
            />
            <Input
              label="Hospital / Clinic"
              value={data.prescription.hospital ?? ''}
              onChangeText={(text) =>
                setData((prev) =>
                  prev ? { ...prev, prescription: { ...prev.prescription, hospital: text || null } } : prev
                )
              }
              placeholder="Not detected"
              containerStyle={{ marginBottom: spacing.md }}
            />
            <Input
              label="Date"
              value={data.prescription.date ?? ''}
              onChangeText={(text) =>
                setData((prev) =>
                  prev ? { ...prev, prescription: { ...prev.prescription, date: text || null } } : prev
                )
              }
              placeholder="Not detected"
            />
          </Card>
        </View>

        {/* Medicines */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
            Medicines ({data.medicines.length})
          </Text>

          {data.medicines.map((medicine, index) => (
            <Card key={index} style={{ marginBottom: spacing.md }}>
              <View style={styles.medicineHeader}>
                <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
                  {medicine.name ?? `Medicine ${index + 1}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {dupes?.matched[index] && <Badge label="Already added" variant="verified" />}
                  <Badge
                    label={medicine.confidence >= LOW_CONFIDENCE_THRESHOLD ? 'Good read' : 'Low confidence'}
                    variant={medicine.confidence >= LOW_CONFIDENCE_THRESHOLD ? 'verified' : 'needs_review'}
                  />
                </View>
              </View>

              <Input
                label="Medicine name"
                value={medicine.name ?? ''}
                onChangeText={(text) => updateMedicine(index, 'name', text || null)}
                placeholder="Enter medicine name"
                containerStyle={{ marginTop: spacing.md }}
              />

              <View style={styles.row}>
                <Input
                  label="Dosage"
                  value={medicine.dosage ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'dosage', text || null)}
                  placeholder="e.g. 1 tablet"
                  containerStyle={{ flex: 1, marginRight: spacing.sm }}
                />
                <Input
                  label="Form"
                  value={medicine.form ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'form', text || null)}
                  placeholder="e.g. tablet"
                  containerStyle={{ flex: 1 }}
                />
              </View>

              <Input
                label="Frequency"
                value={medicine.frequency ?? ''}
                onChangeText={(text) => updateMedicine(index, 'frequency', text || null)}
                placeholder="e.g. Three times daily"
                containerStyle={{ marginTop: spacing.sm }}
              />

              <View style={styles.row}>
                <Input
                  label="Duration"
                  value={medicine.duration ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'duration', text || null)}
                  placeholder="e.g. 7 days"
                  containerStyle={{ flex: 1, marginRight: spacing.sm }}
                />
                <Input
                  label="Meal instruction"
                  value={medicine.meal_instruction ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'meal_instruction', text || null)}
                  placeholder="after / before / with"
                  containerStyle={{ flex: 1 }}
                />
              </View>

              <Input
                label="Strength"
                value={medicine.strength ?? ''}
                onChangeText={(text) => updateMedicine(index, 'strength', text || null)}
                placeholder="e.g. 500mg"
                containerStyle={{ marginTop: spacing.sm }}
              />
            </Card>
          ))}
        </View>

        {/* Actions */}
        <View style={[styles.actions, { paddingHorizontal: spacing.base }]}>
          <Button
            title={dupes?.isFullDuplicate ? 'Update reminders' : 'Verify and continue'}
            onPress={handleVerify}
            loading={saving}
            size="lg"
          />
          <Button
            title="Discard prescription"
            onPress={handleDiscard}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    marginTop: 16,
  },
  imageSection: {
    marginTop: 16,
  },
  prescriptionImage: {
    width: '100%',
    height: 200,
  },
  warningsSection: {
    marginTop: 16,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  section: {
    marginTop: 24,
  },
  medicineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actions: {
    marginTop: 32,
    gap: 12,
    alignItems: 'center',
  },
});
