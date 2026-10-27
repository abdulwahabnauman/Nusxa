import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import {
  WEEKDAYS,
  normalizeDaysOfWeek,
  weekdayShortLabels,
} from '../../utils/repeat';

export interface RepeatValue {
  daysOfWeek: number[];
  intervalDays: number;
}

interface RepeatSelectorProps {
  daysOfWeek: number[];
  intervalDays: number;
  onChange: (value: RepeatValue) => void;
}

const INTERVAL_OPTIONS = [2, 3, 7, 14];

/**
 * Repeat picker for medicines that are not taken daily: any-day, specific
 * weekdays (once or more per week) or a fixed day interval (alternate days,
 * every N days).
 */
export function RepeatSelector({ daysOfWeek, intervalDays, onChange }: RepeatSelectorProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, language } = useI18n();

  const selectedDays = normalizeDaysOfWeek(daysOfWeek);
  const kind: 'daily' | 'weekdays' | 'interval' =
    selectedDays.length > 0 ? 'weekdays' : intervalDays > 1 ? 'interval' : 'daily';
  const dayLabels = weekdayShortLabels(language === 'ur' ? 'ur-PK' : 'en-US');

  const chipBase = {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const selectKind = (next: typeof kind) => {
    if (next === 'daily') onChange({ daysOfWeek: [], intervalDays: 1 });
    if (next === 'weekdays') {
      const days = selectedDays.length > 0 ? selectedDays : [new Date().getDay()];
      onChange({ daysOfWeek: days, intervalDays: 1 });
    }
    if (next === 'interval') {
      onChange({
        daysOfWeek: [],
        intervalDays: intervalDays > 1 ? intervalDays : 2,
      });
    }
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      // Keep at least one day selected — an empty set means "daily"
      if (selectedDays.length === 1) return;
      onChange({ daysOfWeek: selectedDays.filter((d) => d !== day), intervalDays: 1 });
    } else {
      onChange({ daysOfWeek: [...selectedDays, day].sort((a, b) => a - b), intervalDays: 1 });
    }
  };

  const intervalLabel = (days: number) => {
    if (days === 2) return t.repeat.everyOtherDay;
    if (days === 7) return t.repeat.weekly;
    if (days === 14) return t.repeat.everyTwoWeeks;
    return t.repeat.everyNDays.replace('{n}', String(days));
  };

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[typography.label.base, { color: colors.text.secondary }]}>
        {t.repeat.title}
      </Text>
      <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 2 }]}>
        {t.repeat.hint}
      </Text>

      <View style={styles.row}>
        {(
          [
            ['daily', t.repeat.daily],
            ['weekdays', t.repeat.weekdays],
            ['interval', t.repeat.everyNDaysTitle],
          ] as const
        ).map(([value, label]) => {
          const selected = kind === value;
          return (
            <TouchableOpacity
              key={value}
              style={[
                chipBase,
                {
                  backgroundColor: selected ? colors.accent.primary : colors.background.subtle,
                  borderColor: selected ? colors.accent.primary : colors.border.default,
                },
              ]}
              onPress={() => selectKind(value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  typography.label.sm,
                  { color: selected ? colors.onAccent : colors.text.primary },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {kind === 'weekdays' && (
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          {WEEKDAYS.map((day) => {
            const selected = selectedDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  {
                    borderRadius: borderRadius.full,
                    backgroundColor: selected ? colors.accent.subtle : colors.background.subtle,
                    borderColor: selected ? colors.accent.primary : colors.border.default,
                  },
                ]}
                onPress={() => toggleDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={dayLabels[day]}
              >
                <Text
                  style={[
                    typography.label.sm,
                    { color: selected ? colors.accent.primary : colors.text.secondary },
                  ]}
                >
                  {dayLabels[day]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {kind === 'interval' && (
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          {INTERVAL_OPTIONS.map((days) => {
            const selected = intervalDays === days;
            return (
              <TouchableOpacity
                key={days}
                style={[
                  chipBase,
                  {
                    backgroundColor: selected ? colors.accent.primary : colors.background.subtle,
                    borderColor: selected ? colors.accent.primary : colors.border.default,
                  },
                ]}
                onPress={() => onChange({ daysOfWeek: [], intervalDays: days })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    typography.label.sm,
                    { color: selected ? colors.onAccent : colors.text.primary },
                  ]}
                >
                  {intervalLabel(days)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  dayChip: {
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
