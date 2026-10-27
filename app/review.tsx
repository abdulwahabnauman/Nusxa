import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  KeyboardAvoidingView,
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
import { useI18n } from '../src/i18n';
import { PrescriptionJSON, MedicineJSON, ValidationResult } from '../src/ai/types';
import { LOW_CONFIDENCE_THRESHOLD } from '../src/constants/config';
import {
  analyzePrescriptionDuplicates,
  DuplicateAnalysis,
} from '../src/utils/savePrescription';
import {
  findInteractionPairs,
  findCrossInteractions,
} from '../src/utils/interactions';
import { getActiveMedicines } from '../src/db/repositories/medicine';
import { getMissingFields, findDuplicateMedicines, isMedicineComplete } from '../src/utils/validation';
import type { Medicine } from '../src/types/models';

export default function ReviewScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { imageUri, imageUris, prescriptionData, validationData } = useLocalSearchParams<{
    imageUri: string;
    imageUris: string;
    prescriptionData: string;
    validationData: string;
  }>();

  // Multi-page sessions arrive as a JSON array of URIs; single scans keep
  // using the legacy imageUri param. Review shows every page, not just the
  // first one, so each part of a long prescription stays checkable.
  const pageUris = useMemo<string[]>(() => {
    if (imageUris) {
      try {
        const parsed = JSON.parse(imageUris);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((u) => typeof u === 'string' && u.length > 0)
        ) {
          return parsed as string[];
        }
      } catch {
        // Fall through to the single-image param
      }
    }
    return imageUri ? [imageUri] : [];
  }, [imageUri, imageUris]);

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
  const [existingMeds, setExistingMeds] = useState<Medicine[]>([]);

  useEffect(() => {
    getActiveMedicines()
      .then(setExistingMeds)
      .catch(() => {});
  }, []);

  // Safety check: interactions within the incoming batch and against the
  // user's current regimen, re-evaluated as the user edits medicine names.
  const interactions = useMemo(() => {
    const incoming = data?.medicines ?? [];
    return [
      ...findInteractionPairs(incoming),
      ...findCrossInteractions(incoming, existingMeds),
    ];
  }, [data, existingMeds]);

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

  // Same name listed twice on one prescription — usually an OCR double-read
  const duplicateNames = useMemo(
    () => findDuplicateMedicines(data?.medicines ?? []),
    [data]
  );

  if (!data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <Text style={[typography.body.base, { color: colors.error }]}>
            {t.review.noData}
          </Text>
          <Button title={t.common.goBack} onPress={() => router.back()} style={{ marginTop: 16 }} />
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

  const handleVerify = async () => {
    // Check required fields via the shared validation toolkit
    const fieldLabels: Record<string, string> = {
      name: t.review.fieldName,
      dosage: t.review.fieldDosage,
      frequency: t.review.fieldFrequency,
      duration: t.review.fieldDuration,
    };
    const missing: string[] = [];
    data.medicines.forEach((med, i) => {
      for (const field of getMissingFields(med)) {
        missing.push(
          `${t.review.medicineFallback.replace('{n}', String(i + 1))}: ${fieldLabels[field] ?? field}`
        );
      }
    });

    if (missing.length > 0) {
      showToast(t.toasts.requiredFieldsMissing.replace('{fields}', missing.join(', ')), 'warning', 5000);
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

      // Hand the verified prescription over to the schedule screen, which
      // persists everything via savePrescription().
      router.replace({
        pathname: '/schedule',
        params: {
          prescriptionData: JSON.stringify(verifiedData),
          imageUri: imageUri ?? '',
          imageUris: JSON.stringify(pageUris),
        },
      });
    } catch {
      showToast(t.toasts.savePrescriptionFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      t.review.discardTitle,
      t.review.discardMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.discard, style: 'destructive', onPress: () => router.replace('/(tabs)') },
      ]
    );
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
          {/* Header */}
          <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
              {t.review.title}
            </Text>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
              {t.review.subtitle}
            </Text>
          </View>

          {/* Image Preview — all pages of a multi-page scan, not just the first */}
          {pageUris.length > 1 ? (
            <View style={[styles.imageSection, { paddingHorizontal: spacing.base }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pagesStrip}>
                {pageUris.map((uri, idx) => (
                  <View key={uri} style={styles.pageThumbWrap}>
                    <Image
                      source={{ uri }}
                      style={[styles.pageThumbnail, { borderRadius: borderRadius.sm, borderColor: colors.border.default }]}
                      resizeMode="cover"
                    />
                    <Text style={[typography.body.xs, { color: colors.text.secondary, textAlign: 'center', marginTop: 4 }]}>
                      {idx + 1}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : pageUris.length === 1 ? (
            <View style={[styles.imageSection, { paddingHorizontal: spacing.base }]}>
              <Image
                source={{ uri: pageUris[0] }}
                style={[styles.prescriptionImage, { borderRadius: borderRadius.md }]}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {/* Duplicate prescription banner */}
          {dupes?.isFullDuplicate && (
            <View style={[styles.warningsSection, { paddingHorizontal: spacing.base }]}>
              <Card style={{ backgroundColor: colors.warning + '1A', borderColor: colors.warning }}>
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={20} color={colors.warning} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[typography.label.base, { color: colors.text.primary }]}>
                      {t.review.alreadyInList}
                    </Text>
                    <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                      {dupes.samePrescriptionOnRecord
                        ? t.review.duplicateSamePrescription
                        : dupes.total === 1
                          ? t.review.duplicateAllOne
                          : t.review.duplicateAllMany.replace('{n}', String(dupes.total))}
                    </Text>
                  </View>
                </View>
                <Button
                  title={t.review.keepCurrentSchedule}
                  variant="secondary"
                  size="sm"
                  onPress={() => router.replace('/(tabs)')}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                />
              </Card>
            </View>
          )}

          {/* Duplicate names within this prescription */}
          {duplicateNames.length > 0 && (
            <View style={[styles.warningsSection, { paddingHorizontal: spacing.base }]}>
              <Card style={{ backgroundColor: colors.warning + '1A', borderColor: colors.warning }}>
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons name="content-copy" size={20} color={colors.warning} />
                  <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {t.review.duplicateNames.replace('{names}', duplicateNames.join(', '))}
                  </Text>
                </View>
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

          {/* Medicine interaction warnings */}
          {interactions.length > 0 && (
            <View style={[styles.warningsSection, { paddingHorizontal: spacing.base }]}>
              <Card style={{ backgroundColor: colors.error + '0D', borderColor: colors.error }}>
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons name="pill-multiple" size={20} color={colors.error} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[typography.label.base, { color: colors.text.primary }]}>
                      {t.review.interactionsTitle}
                    </Text>
                    <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                      {interactions.length === 1
                        ? t.review.interactionsOne
                        : t.review.interactionsMany.replace('{n}', String(interactions.length))}
                    </Text>
                  </View>
                </View>
                {interactions.map((hit, i) => {
                  const tone = hit.severity === 'high' ? colors.error : colors.warning;
                  return (
                    <View key={`${hit.first}-${hit.second}-${i}`} style={[styles.warningRow, { marginTop: 10 }]}>
                      <MaterialCommunityIcons
                        name={hit.severity === 'high' ? 'alert-octagon' : 'alert-outline'}
                        size={16}
                        color={tone}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={[typography.label.sm, { color: colors.text.primary }]}>
                          {hit.first} + {hit.second}
                        </Text>
                        <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                          {hit.description}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 10 }]}>
                  {t.review.interactionsDisclaimer}
                </Text>
              </Card>
            </View>
          )}

          {/* Prescription Info */}
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.review.details}
            </Text>
            <Card>
              <Input
                label={t.review.doctorName}
                value={data.prescription.doctor_name ?? ''}
                onChangeText={(text) =>
                  setData((prev) =>
                    prev ? { ...prev, prescription: { ...prev.prescription, doctor_name: text || null } } : prev
                  )
                }
                placeholder={t.review.notDetected}
                containerStyle={{ marginBottom: spacing.md }}
              />
              <Input
                label={t.review.hospital}
                value={data.prescription.hospital ?? ''}
                onChangeText={(text) =>
                  setData((prev) =>
                    prev ? { ...prev, prescription: { ...prev.prescription, hospital: text || null } } : prev
                  )
                }
                placeholder={t.review.notDetected}
                containerStyle={{ marginBottom: spacing.md }}
              />
              <Input
                label={t.review.dateLabel}
                value={data.prescription.date ?? ''}
                onChangeText={(text) =>
                  setData((prev) =>
                    prev ? { ...prev, prescription: { ...prev.prescription, date: text || null } } : prev
                  )
                }
                placeholder={t.review.notDetected}
              />
            </Card>
          </View>

          {/* Medicines */}
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.review.medicinesCount.replace('{n}', String(data.medicines.length))}
            </Text>

            {data.medicines.map((medicine, index) => (
              <Card key={index} style={{ marginBottom: spacing.md }}>
                <View style={styles.medicineHeader}>
                  <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
                    {medicine.name ?? t.review.medicineFallback.replace('{n}', String(index + 1))}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {dupes?.matched[index] && <Badge label={t.review.alreadyAdded} variant="verified" />}
                    {!isMedicineComplete(medicine) && (
                      <Badge label={t.review.incomplete} variant="needs_review" />
                    )}
                    <Badge
                      label={medicine.confidence >= LOW_CONFIDENCE_THRESHOLD ? t.review.goodRead : t.review.lowConfidenceBadge}
                      variant={medicine.confidence >= LOW_CONFIDENCE_THRESHOLD ? 'verified' : 'needs_review'}
                    />
                  </View>
                </View>

                <Input
                  label={t.review.fieldName}
                  value={medicine.name ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'name', text || null)}
                  placeholder={t.review.placeholderName}
                  containerStyle={{ marginTop: spacing.md }}
                />

                <View style={styles.row}>
                  <Input
                    label={t.review.fieldDosage}
                    value={medicine.dosage ?? ''}
                    onChangeText={(text) => updateMedicine(index, 'dosage', text || null)}
                    placeholder={t.review.placeholderDosage}
                    containerStyle={{ flex: 1, marginRight: spacing.sm }}
                  />
                  <Input
                    label={t.review.fieldForm}
                    value={medicine.form ?? ''}
                    onChangeText={(text) => updateMedicine(index, 'form', text || null)}
                    placeholder={t.review.placeholderForm}
                    containerStyle={{ flex: 1 }}
                  />
                </View>

                <Input
                  label={t.review.fieldFrequency}
                  value={medicine.frequency ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'frequency', text || null)}
                  placeholder={t.review.placeholderFrequency}
                  containerStyle={{ marginTop: spacing.sm }}
                />

                <View style={styles.row}>
                  <Input
                    label={t.review.fieldDuration}
                    value={medicine.duration ?? ''}
                    onChangeText={(text) => updateMedicine(index, 'duration', text || null)}
                    placeholder={t.review.placeholderDuration}
                    containerStyle={{ flex: 1, marginRight: spacing.sm }}
                  />
                  <Input
                    label={t.review.fieldMeal}
                    value={medicine.meal_instruction ?? ''}
                    onChangeText={(text) => updateMedicine(index, 'meal_instruction', text || null)}
                    placeholder={t.review.placeholderMeal}
                    containerStyle={{ flex: 1 }}
                  />
                </View>

                <Input
                  label={t.review.fieldStrength}
                  value={medicine.strength ?? ''}
                  onChangeText={(text) => updateMedicine(index, 'strength', text || null)}
                  placeholder={t.review.placeholderStrength}
                  containerStyle={{ marginTop: spacing.sm }}
                />

                {/* Verbatim source line: lets the user compare every field
                    against what was actually written on the prescription */}
                {medicine.original_text ? (
                  <View style={[styles.originalTextBlock, { backgroundColor: colors.background.subtle, borderColor: colors.border.default, marginTop: spacing.sm }]}>
                    <Text style={[typography.label.sm, { color: colors.text.secondary }]}>
                      {t.review.asWritten}
                    </Text>
                    <Text style={[typography.body.sm, { color: colors.text.primary, marginTop: 2 }]}>
                      {medicine.original_text}
                    </Text>
                  </View>
                ) : null}
              </Card>
            ))}
          </View>

          {/* Actions */}
          <View style={[styles.actions, { paddingHorizontal: spacing.base }]}>
            <Button
              title={dupes?.isFullDuplicate ? t.review.updateReminders : t.review.verify}
              onPress={handleVerify}
              loading={saving}
              size="lg"
            />
            <Button
              title={t.review.discardPrescription}
              onPress={handleDiscard}
              variant="ghost"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: { flex: 1 },
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
  pagesStrip: {
    flexDirection: 'row',
    gap: 12,
  },
  pageThumbWrap: {
    alignItems: 'center',
  },
  pageThumbnail: {
    width: 96,
    height: 128,
    borderWidth: 1,
  },
  originalTextBlock: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
