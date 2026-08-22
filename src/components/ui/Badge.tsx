import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';

type BadgeVariant = 'verified' | 'pending' | 'rejected' | 'needs_review' | 'info' | 'warning' | 'error';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_MAP: Record<BadgeVariant, { light: string; dark: string; bg_light: string; bg_dark: string }> = {
  verified: { light: '#15803D', dark: '#4ADE80', bg_light: '#F0FDF4', bg_dark: '#052E16' },
  pending: { light: '#B45309', dark: '#FBBF24', bg_light: '#FFFBEB', bg_dark: '#451A03' },
  rejected: { light: '#B91C1C', dark: '#F87171', bg_light: '#FEF2F2', bg_dark: '#450A0A' },
  needs_review: { light: '#0369A1', dark: '#38BDF8', bg_light: '#F0F9FF', bg_dark: '#082F49' },
  info: { light: '#0369A1', dark: '#38BDF8', bg_light: '#F0F9FF', bg_dark: '#082F49' },
  warning: { light: '#B45309', dark: '#FBBF24', bg_light: '#FFFBEB', bg_dark: '#451A03' },
  error: { light: '#B91C1C', dark: '#F87171', bg_light: '#FEF2F2', bg_dark: '#450A0A' },
};

export function Badge({ label, variant = 'info' }: BadgeProps) {
  const { mode, borderRadius, typography } = useTheme();
  const isDark = mode === 'dark';
  const v = VARIANT_MAP[variant];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isDark ? v.bg_dark : v.bg_light,
          borderRadius: borderRadius.sm,
        },
      ]}
      accessibilityLabel={`Status: ${label}`}
    >
      <Text
        style={[
          typography.label.sm,
          { color: isDark ? v.dark : v.light },
        ]}
      >
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
