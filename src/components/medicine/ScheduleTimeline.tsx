import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { DoseItem } from './DoseItem';
import type { TodayScheduleItem } from '../../types/models';

interface ScheduleTimelineProps {
  items: TodayScheduleItem[];
  onTaken?: (scheduleId: string, medicineId: string) => void;
  onSkip?: (scheduleId: string, medicineId: string) => void;
  /** When true, doses are grouped under Morning / Afternoon / Night headers */
  groupByTimeOfDay?: boolean;
}

type DayPart = 'Morning' | 'Afternoon' | 'Night';

const DAY_PART_ICONS: Record<DayPart, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Morning: 'weather-sunny',
  Afternoon: 'white-balance-sunny',
  Night: 'weather-night',
};

const DAY_PART_ORDER: DayPart[] = ['Morning', 'Afternoon', 'Night'];

/** Classify an "HH:MM" time into a day part */
function dayPartOf(time: string): DayPart {
  const hour = parseInt(time.split(':')[0] ?? '0', 10);
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  return 'Night';
}

export function ScheduleTimeline({ items, onTaken, onSkip, groupByTimeOfDay = true }: ScheduleTimelineProps) {
  const { colors, typography, spacing } = useTheme();

  if (items.length === 0) return null;

  // Sort by time
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));

  const renderItem = (item: TodayScheduleItem) => (
    <DoseItem
      key={item.scheduleId}
      time={item.time}
      medicineName={item.medicineName}
      dosage={item.dosage}
      mealInstruction={item.mealInstruction}
      status={item.status}
      onTaken={() => onTaken?.(item.scheduleId, item.medicineId)}
      onSkip={() => onSkip?.(item.scheduleId, item.medicineId)}
    />
  );

  if (!groupByTimeOfDay) {
    return <View style={styles.container}>{sorted.map(renderItem)}</View>;
  }

  const grouped = new Map<DayPart, TodayScheduleItem[]>();
  for (const item of sorted) {
    const part = dayPartOf(item.time);
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
                { color: colors.text.secondary, marginLeft: 6 },
              ]}
            >
              {part}
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
