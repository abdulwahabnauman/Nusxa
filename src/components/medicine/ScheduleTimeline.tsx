import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { DoseItem } from './DoseItem';
import { getDayPart } from '../../utils/date';
import type { TodayScheduleItem } from '../../types/models';

interface ScheduleTimelineProps {
  items: TodayScheduleItem[];
  onTaken?: (scheduleId: string, medicineId: string) => void;
  onSkip?: (scheduleId: string, medicineId: string) => void;
  /** When true, doses are grouped under Morning / Afternoon / Night headers */
  groupByTimeOfDay?: boolean;
  /** Current time in epoch-ms; pending doses before their time are locked */
  nowMs: number;
}

type DayPart = 'morning' | 'afternoon' | 'night';

const DAY_PART_ICONS: Record<DayPart, keyof typeof MaterialCommunityIcons.glyphMap> = {
  morning: 'weather-sunny',
  afternoon: 'white-balance-sunny',
  night: 'weather-night',
};

const DAY_PART_ORDER: DayPart[] = ['morning', 'afternoon', 'night'];

export function ScheduleTimeline({ items, onTaken, onSkip, groupByTimeOfDay = true, nowMs }: ScheduleTimelineProps) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();

  const DAY_PART_LABELS: Record<DayPart, string> = {
    morning: t.dose.morning,
    afternoon: t.dose.afternoon,
    night: t.dose.night,
  };

  if (items.length === 0) return null;

  // Sort by time
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));

  const renderItem = (item: TodayScheduleItem) => (
    <DoseItem
      key={item.scheduleId}
      time={item.time}
      windowMinutes={item.windowMinutes}
      medicineName={item.medicineName}
      dosage={item.dosage}
      mealInstruction={item.mealInstruction}
      status={item.status}
      nowMs={nowMs}
      onTaken={() => onTaken?.(item.scheduleId, item.medicineId)}
      onSkip={() => onSkip?.(item.scheduleId, item.medicineId)}
    />
  );

  if (!groupByTimeOfDay) {
    return <View style={styles.container}>{sorted.map(renderItem)}</View>;
  }

  const grouped = new Map<DayPart, TodayScheduleItem[]>();
  for (const item of sorted) {
    const part = getDayPart(parseInt(item.time.split(':')[0] ?? '0', 10));
    const bucket = grouped.get(part);
    if (bucket) bucket.push(item);
    else grouped.set(part, [item]);
  }

  return (
    <View style={styles.container}>
      {DAY_PART_ORDER.filter((part) => grouped.has(part)).map((part, index) => (
        <View key={part} style={index > 0 ? { marginTop: spacing.md } : undefined}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name={DAY_PART_ICONS[part]}
              size={16}
              color={colors.text.secondary}
            />
            <Text
              style={[
                typography.label.base,
                { color: colors.text.secondary, marginStart: 6 },
              ]}
            >
              {DAY_PART_LABELS[part]}
            </Text>
          </View>
          {(grouped.get(part) ?? []).map(renderItem)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
});
