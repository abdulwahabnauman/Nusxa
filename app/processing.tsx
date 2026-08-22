import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { ProgressSteps } from '../src/components/ui/ProgressSteps';
import { Button } from '../src/components/ui/Button';
import { processPrescription } from '../src/ai/pipeline';
import { PrescriptionJSON, PipelineStage, PIPELINE_STAGE_LABELS, ValidationResult } from '../src/ai/types';
import { resolveApiKey } from '../src/utils/secureStorage';

export default function ProcessingScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const [stage, setStage] = useState<PipelineStage>('preparing');
  const [error, setError] = useState<string | null>(null);
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
      const res = await processPrescription(imageUri!, apiKey, setStage);
      setResult(res);
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
      <View style={styles.content}>
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
            <Button title="Try again" onPress={handleRetry} />
            <Button
              title="Go back"
              onPress={() => router.back()}
              variant="ghost"
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
            <Button title="Review prescription" onPress={handleContinue} size="lg" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    gap: 12,
    alignItems: 'center',
  },
  successActions: {
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
});
