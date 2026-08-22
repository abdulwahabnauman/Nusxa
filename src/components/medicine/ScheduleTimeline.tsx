import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';
import { DoseItem } from './DoseItem';
import type { TodayScheduleItem } from '../../types/models';

interface ScheduleTimelineProps {
  items: TodayScheduleItem[];
  onTaken?: (scheduleId: string, medicineId: string) => void;
  onSkip?: (scheduleId: string, medicineId: string) => void;
}

export function ScheduleTimeline({ items, onTaken, onSkip }: ScheduleTimelineProps) {
  const { colors, typography, spacing } = useTheme();

  if (items.length === 0) return null;

  // Sort by time
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <View style={styles.container}>
      {sorted.map((item) => (
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
