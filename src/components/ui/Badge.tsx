import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';

type BadgeVariant = 'verified' | 'pending' | 'rejected' | 'needs_review' | 'info' | 'warning' | 'error';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_TONE: Record<BadgeVariant, 'success' | 'warning' | 'error' | 'info'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'error',
  needs_review: 'info',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

export function Badge({ label, variant = 'info' }: BadgeProps) {
  const { colors, borderRadius, typography } = useTheme();
  const { t } = useI18n();
  const tone = colors[VARIANT_TONE[variant]];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone + '1A',
          borderRadius: borderRadius.sm,
        },
      ]}
      accessibilityLabel={`${t.common.statusPrefix}: ${label}`}
    >
      <Text style={[typography.label.sm, { color: tone }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
});
