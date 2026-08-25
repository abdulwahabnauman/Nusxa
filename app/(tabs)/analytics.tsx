/**
 * Analytics Dashboard Screen
 * Visualize medication adherence patterns and statistics
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { Card } from '../../src/components/ui/Card';
import { getDatabase } from '../../src/db/database';

interface AdherenceData {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
  pending: number;
}

interface WeeklyStats {
  totalSchedules: number;
  completed: number;
  missed: number;
  adherenceRate: number;
}

type Period = '7d' | '30d' | 'all';

export default function AnalyticsScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [adherenceData, setAdherenceData] = useState<AdherenceData[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('7d');

  const loadAnalyticsData = useCallback(async (period: Period) => {
    try {
      const db = getDatabase();

      // Calculate period start date
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get dose records for period
      const doseRecords = await db.getAllAsync<{ scheduled_time: string; status: string }>(
        `SELECT dr.scheduled_time, dr.status
         FROM dose_records dr
         WHERE dr.scheduled_time >= ?
         ORDER BY dr.scheduled_time DESC`,
        [startDate.toISOString()],
      );

      setAdherenceData(groupByDate(doseRecords));
      setWeeklyStats(calculateStats(doseRecords));
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setAdherenceData([]);
      setWeeklyStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalyticsData(selectedPeriod);
  }, [selectedPeriod, loadAnalyticsData]);

  function groupByDate(records: Array<{ scheduled_time: string; status: string }>): AdherenceData[] {
    const groups: Record<string, AdherenceData> = {};

    records.forEach((record) => {
      const date = String(record.scheduled_time).slice(0, 10);

      if (!groups[date]) {
        groups[date] = { date, taken: 0, missed: 0, skipped: 0, pending: 0 };
      }

      const group = groups[date];
      if (!group) return;

      if (record.status === 'taken') group.taken++;
      else if (record.status === 'missed') group.missed++;
      else if (record.status === 'skipped') group.skipped++;
      else group.pending++;
    });

    return Object.values(groups).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  function calculateStats(records: Array<{ status: string }>): WeeklyStats {
    const totalSchedules = records.length;
    const completed = records.filter((r) => r.status === 'taken').length;
    const missed = records.filter((r) => r.status === 'missed').length;

    return {
      totalSchedules,
      completed,
      missed,
      adherenceRate: totalSchedules > 0 ? Math.round((completed / totalSchedules) * 100) : 0,
    };
  }

  const renderBarChart = () => {
    if (adherenceData.length === 0) {
      return (
        <View style={{ padding: spacing.xl, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.background.subtle }}>
          <Text style={[typ.body.base, { color: colors.text.secondary }]}>{t.analytics.noData}</Text>
        </View>
      );
    }

    const maxTaken = Math.max(...adherenceData.map((d) => d.taken), 1);
    const barWidth = 30;
    const gap = 8;

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', paddingHorizontal: spacing.base }}>
          {adherenceData.slice(0, 14).map((day) => {
            const height = (day.taken / maxTaken) * 120;

            return (
              <View key={day.date} style={{ width: barWidth, alignItems: 'center', marginHorizontal: gap / 2 }}>
                <View style={{ height: 120, width: '100%', backgroundColor: colors.background.subtle, borderRadius: 4, justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      height,
                      width: '100%',
                      backgroundColor: colors.accent.primary,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                  />
                </View>
                <Text style={[typ.body.xs, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })[0]}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderAdherenceRing = () => {
    const size = 140;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = weeklyStats?.adherenceRate || 0;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.md }}>
        <View style={{ padding: spacing.md, alignItems: 'center' }}>
          <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
            <Svg width={size} height={size}>
              {/* Track */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={colors.border.default}
                strokeWidth={strokeWidth}
              />
              {/* Progress */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={colors.accent.primary}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </Svg>

            {/* Center text */}
            <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[typ.heading.h2, { color: colors.text.primary }]}>{progress}%</Text>
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.analytics.adherence}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: spacing.md }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.h3, { color: colors.success }]}>
                {weeklyStats?.completed || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>{t.analytics.taken}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.h3, { color: colors.error }]}>
                {weeklyStats?.missed || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>{t.analytics.missed}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.h3, { color: colors.text.primary }]}>
                {weeklyStats?.totalSchedules || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>{t.analytics.total}</Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  const periodLabels: Record<Period, string> = {
    '7d': t.analytics.last7Days,
    '30d': t.analytics.last30Days,
    all: t.analytics.allTime,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <View style={{ paddingTop: spacing.lg + spacing.xs, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.background.surface }}>
        <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.analytics.title}</Text>
        <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.analytics.subtitle}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl + 20 }}>
        {/* Period selector */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.default,
          }}
        >
          {(['7d', '30d', 'all'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: 8,
                backgroundColor: selectedPeriod === period ? colors.accent.primary : colors.background.subtle,
              }}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  typ.label.sm,
                  { color: selectedPeriod === period ? '#FFFFFF' : colors.text.secondary },
                ]}
              >
                {periodLabels[period]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Adherence ring */}
        {renderAdherenceRing()}

        {/* Bar chart */}
        <View style={{ marginTop: spacing.md, paddingHorizontal: spacing.base }}>
          <Text style={[typ.label.base, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.analytics.weeklyActivity}
          </Text>
          {renderBarChart()}
        </View>

        {/* Tips card */}
        <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.md }}>
          <View style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <MaterialCommunityIcons name="lightbulb-outline" size={20} color={colors.accent.primary} />
              <Text style={[typ.label.base, { color: colors.text.primary, marginLeft: spacing.xs }]}>
                {t.analytics.tipTitle}
              </Text>
            </View>
            <Text style={[typ.body.sm, { color: colors.text.secondary, lineHeight: 22 }]}>
              {t.analytics.tipText}
            </Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
