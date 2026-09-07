import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings-store';
import { formatDigits } from '../../utils/numerals';

interface StreakCounterProps {
  streak: number;
}

export function StreakCounter({ streak }: StreakCounterProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);

  const nf = (v: string | number) => formatDigits(v, easternNumerals);

  const iconName = streak > 0 ? 'fire' : 'leaf';
  const iconColor = streak > 0 ? colors.warning : colors.text.secondary;

  const getMessage = () => {
    if (streak === 0) return t.progress.startStreak;
    if (streak === 1) return t.progress.goodStart;
    if (streak < 7) return `${nf(streak)} ${t.progress.daysGoing}`;
    if (streak < 30) return t.progress.greatConsistency;
    return t.progress.outstanding;
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
      accessibilityLabel={`${nf(streak)} ${streak === 1 ? t.progress.day : t.progress.days}. ${getMessage()}`}
    >
      <MaterialCommunityIcons name={iconName} size={28} color={iconColor} />
      <View style={styles.text}>
        <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
          {nf(streak)} {streak === 1 ? t.progress.day : t.progress.days}
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
