import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Input } from '../ui/Input';
import { useI18n } from '../../i18n';
import { LOW_CONFIDENCE_THRESHOLD } from '../../constants/config';

interface VerificationFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  confidence?: number;
  placeholder?: string;
  required?: boolean;
}

export function VerificationField({
  label,
  value,
  onChangeText,
  confidence,
  placeholder,
  required = false,
}: VerificationFieldProps) {
  const { t } = useI18n();
  const isLowConfidence = confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
  const isMissing = required && !value;

  return (
    <View style={styles.container}>
      <Input
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={
          placeholder ?? t.review.fieldPlaceholder.replace('{label}', label.toLowerCase())
        }
        error={isMissing ? t.review.fieldRequired.replace('{label}', label) : undefined}
        helper={
          isLowConfidence
            ? t.review.lowConfidencePercent.replace(
                '{n}',
                String(Math.round((confidence ?? 0) * 100))
              )
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
});
