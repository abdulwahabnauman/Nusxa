import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/provider';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  elevated?: boolean;
  accessibilityLabel?: string;
}

export function Card({
  children,
  style,
  padding = 'md',
  elevated = false,
  accessibilityLabel,
}: CardProps) {
  const { colors, spacing, borderRadius } = useTheme();

  const paddingMap = {
    none: 0,
    sm: spacing.sm,
    md: spacing.base,
    lg: spacing.xl,
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.default,
          borderRadius: borderRadius.lg,
          padding: paddingMap[padding],
        },
        elevated && {
          shadowColor: colors.text.primary,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
});
