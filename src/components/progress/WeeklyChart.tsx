import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';

interface DayData {
  day: string; // e.g. "Mon"
  percentage: number;
}

interface WeeklyChartProps {
  data: DayData[];
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  // Derive the chart height from the live theme tokens instead of
  // hardcoding it: in elderly mode typography.body.xs and spacing.xs are
  // both scaled up, so the day labels need more room beneath the bars.
  const labelFontSize = typography.body.xs.fontSize ?? 12;
  const labelHeight = typography.body.xs.lineHeight ?? Math.round(labelFontSize * 1.4);
  const labelReserve = labelHeight + spacing.xs + 4;
  const chartHeight = MAX_BAR_HEIGHT + labelReserve;

  return (
    <View
      style={[styles.container]}
      accessibilityLabel="Weekly adherence chart"
    >
      <View style={[styles.chartArea, { height: chartHeight }]}>
        {data.map((item, index) => {
          const height = Math.max(4, (item.percentage / 100) * MAX_BAR_HEIGHT);
          const barColor =
            item.percentage >= 80 ? colors.success
            : item.percentage >= 50 ? colors.warning
            : item.percentage > 0 ? colors.error
            : colors.background.subtle;

          return (
            <View key={`${item.day}-${index}`} style={styles.barColumn}>
              <View
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: barColor,
                    borderRadius: borderRadius.sm,
                  },
                ]}
                accessibilityLabel={`${item.day}: ${Math.round(item.percentage)}%`}
              />
              <Text
                style={[
                  typography.body.xs,
                  { color: colors.text.secondary, marginTop: spacing.xs },
                ]}
              >
                {item.day}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const MAX_BAR_HEIGHT = 100;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 20,
  },
});
