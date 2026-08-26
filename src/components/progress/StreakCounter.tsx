import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';

interface StreakCounterProps {
  streak: number;
}

export function StreakCounter({ streak }: StreakCounterProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const iconName = streak > 0 ? 'fire' : 'leaf';
  const iconColor = streak > 0 ? colors.warning : colors.text.secondary;

  const getMessage = () => {
    if (streak === 0) return 'Start your streak today';
    if (streak === 1) return 'Good start!';
    if (streak < 7) return `${streak} days going`;
    if (streak < 30) return 'Great consistency!';
    return 'Outstanding dedication!';
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.card,
          borderColor: colors.border.default,
          borderRadius: borderRadius.md,
          padding: spacing.md,
        },
      ]}
      accessibilityLabel={`${streak} day streak. ${getMessage()}`}
    >
      <MaterialCommunityIcons name={iconName} size={28} color={iconColor} />
      <View style={styles.text}>
        <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
          {streak} {streak === 1 ? 'day' : 'days'}
        </Text>
        <Text style={[typography.body.sm, { color: colors.text.secondary }]}>
          {getMessage()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 12,
  },
  text: {
    flex: 1,
  },
});
