import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';
import { Input } from '../ui/Input';
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
  const { colors, typography, spacing } = useTheme();

  const isLowConfidence = confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
  const isMissing = required && !value;

  return (
    <View style={styles.container}>
      <Input
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        error={isMissing ? `${label} is required` : undefined}
        helper={
          isLowConfidence
            ? `Low confidence (${Math.round((confidence ?? 0) * 100)}%). Please verify`
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
