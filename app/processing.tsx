import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { ProgressSteps } from '../src/components/ui/ProgressSteps';
import { Button } from '../src/components/ui/Button';
import { processPrescription } from '../src/ai/pipeline';
import { PrescriptionJSON, PipelineStage, PIPELINE_STAGE_LABELS, ValidationResult } from '../src/ai/types';
import { buildDefaultSchedules, savePrescription } from '../src/utils/savePrescription';
import { resolveApiKey } from '../src/utils/secureStorage';
import { useTranslation } from '../src/i18n';

export default function ProcessingScreen() {
  const { colors, typography, spacing } = useTheme();
  const t = useTranslation();
  const router = useRouter();
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const [stage, setStage] = useState<PipelineStage>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    data: PrescriptionJSON;
    validation: ValidationResult;
  } | null>(null);

  useEffect(() => {
    if (!imageUri) {
      setError('No image provided.');
      return;
    }
    runPipeline();
  }, [imageUri]);

  async function runPipeline() {
    try {
      // Read API key from secure store, then fall back to env variable
      const apiKey = await resolveApiKey();
      if (!apiKey) {
        setError('AI service key not configured. Add your Gemini API key in Settings.');
        setStage('error');
        return;
      }
      
      // Process with callback to update stages
      const res = await processPrescription(imageUri!, apiKey, (newStage) => {
        setStage(newStage);
      });
      
      setResult(res);
      
      // Explicitly mark final step as completed
      setStage('complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      setStage('error');
    }
  }

  const handleRetry = () => {
    setError(null);
    setStage('preparing');
    runPipeline();
  };

  const handleContinue = () => {
    if (result && imageUri) {
      router.replace({
        pathname: '/review',
        params: {
          imageUri,
          prescriptionData: JSON.stringify(result.data),
          validationData: JSON.stringify(result.validation),
        },
      });
    }
  };

  // OK = the user approves the scan as-is: persist medicines + schedules
  // with sensible default reminder times and land back on Home.
  const handleApprove = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const verified: PrescriptionJSON = {
        ...result.data,
        verification_status: 'verified',
        medicines: result.data.medicines.map((m) => ({
          ...m,
          verification_status: 'verified' as const,
        })),
      };
      const outcome = await savePrescription(verified, buildDefaultSchedules(verified), imageUri);
      const title =
        outcome.updated > 0 && outcome.added === 0
          ? 'Already in your list'
          : 'Medicines added';
      const body =
        outcome.updated > 0
          ? `${outcome.updated} medicine${outcome.updated === 1 ? ' was' : 's were'} already in your list — the details and reminders were refreshed instead of adding duplicates.${outcome.added > 0 ? ` ${outcome.added} new medicine${outcome.added === 1 ? ' was' : 's were'} added.` : ''}`
          : 'Your prescription was approved. Medicines are loaded with default reminder times — adjust them anytime from the medicine details.';
      Alert.alert(title, body, [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]);
    } catch (err) {
      console.error('Approve prescription error:', err);
      Alert.alert('Error', 'Failed to save your medicines. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { label: PIPELINE_STAGE_LABELS.preparing, status: getStepStatus('preparing') },
    { label: PIPELINE_STAGE_LABELS.reading, status: getStepStatus('reading') },
    { label: PIPELINE_STAGE_LABELS.validating, status: getStepStatus('validating') },
    { label: PIPELINE_STAGE_LABELS.complete, status: getStepStatus('complete') },
  ];

  function getStepStatus(
    target: PipelineStage
  ): 'completed' | 'active' | 'pending' | 'error' {
    const order: PipelineStage[] = ['preparing', 'reading', 'validating', 'complete'];
    const currentIdx = order.indexOf(stage);
    const targetIdx = order.indexOf(target);

    if (stage === 'error') {
      return targetIdx <= currentIdx ? 'error' : 'pending';
    }
    if (targetIdx < currentIdx) return 'completed';
    if (targetIdx === currentIdx) return 'active';
    return 'pending';
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent.subtle }]}>
          <MaterialCommunityIcons
            name={stage === 'error' ? 'alert-circle-outline' : 'file-document-outline'}
            size={56}
            color={stage === 'error' ? colors.error : colors.accent.primary}
          />
        </View>

        <Text style={[typography.heading.h2, { color: colors.text.primary, marginTop: spacing.xl, textAlign: 'center' }]}>
          {stage === 'error' ? 'Processing failed' : 'Reading your prescription'}
        </Text>

        <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
          {stage === 'error'
            ? error
            : 'Please wait while Nusxa reads and processes your prescription image.'}
        </Text>

        <View style={{ marginTop: spacing.xl, width: '100%', paddingHorizontal: 32 }}>
          <ProgressSteps steps={steps} />
        </View>

        {stage === 'error' && (
          <View style={styles.errorActions}>
            <Button title="Try again" onPress={handleRetry} style={{ flex: 1 }} />
            <Button
              title="Go back"
              onPress={() => router.back()}
              variant="ghost"
              style={{ flex: 1 }}
            />
          </View>
        )}

        {stage === 'complete' && result && (
          <View style={styles.successActions}>
            <Text style={[typography.body.sm, { color: colors.success, textAlign: 'center', marginBottom: spacing.base }]}>
              {result.data.medicines.length} medicine{result.data.medicines.length !== 1 ? 's' : ''} detected
              {result.validation.warnings.length > 0 &&
                ` — ${result.validation.warnings.length} item${result.validation.warnings.length !== 1 ? 's' : ''} to review`}
            </Text>
            <View style={{ width: '100%', flexDirection: 'row', gap: spacing.md }}>
              <Button 
                title="OK" 
                onPress={handleApprove}
                loading={saving}
                style={{ flex: 1 }}
              />
              <Button
                title="Review & adjust"
                onPress={handleContinue}
                variant="ghost"
                style={{ flex: 1.7 }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorActions: {
    marginTop: 32,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  successActions: {
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
});
