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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/provider';
import { useI18n } from '../src/i18n';
import { Card } from '../src/components/ui/Card';
import { AdherenceRing } from '../src/components/progress/AdherenceRing';
import { showToast } from '../src/components/ui/GlobalToast';
import { MonthCalendar } from '../src/components/progress/MonthCalendar';
import { getDatabase } from '../src/db/database';
import { getProfile } from '../src/db/repositories/profile';
import { generateAnalyticsReportPdf } from '../src/utils/pdf';
import { withLockExemption } from '../src/utils/appLock';

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

type Period = '7d' | '30d' | '90d' | 'all';

export default function AnalyticsScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'ur' ? 'ur-PK' : 'en-US';
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [adherenceData, setAdherenceData] = useState<AdherenceData[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('7d');
  const [exporting, setExporting] = useState(false);

  const periodLabels: Record<Period, string> = {
    '7d': t.analytics.last7Days,
    '30d': t.analytics.last30Days,
    '90d': t.analytics.last90Days,
    all: t.analytics.allTime,
  };

  const loadAnalyticsData = useCallback(async (period: Period) => {
    try {
      const db = getDatabase();

      // 'all' truly means the full history — no date filter at all
      const doseRecords =
        period === 'all'
          ? await db.getAllAsync<{ scheduled_time: string; status: string }>(
              `SELECT dr.scheduled_time, dr.status
               FROM dose_records dr
               ORDER BY dr.scheduled_time DESC`
            )
          : await db.getAllAsync<{ scheduled_time: string; status: string }>(
              `SELECT dr.scheduled_time, dr.status
               FROM dose_records dr
               WHERE dr.scheduled_time >= ?
               ORDER BY dr.scheduled_time DESC`,
              [(() => {
                const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysBack);
                return startDate.toISOString();
              })()],
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
                  {new Date(day.date).toLocaleDateString(locale, { weekday: 'short' })[0]}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderAdherenceRing = () => {
    const progress = weeklyStats?.adherenceRate || 0;

    return (
      <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.md }}>
        <View style={{ padding: spacing.md, alignItems: 'center' }}>
          {/* Reuses the shared AdherenceRing instead of duplicated SVG code */}
          <AdherenceRing percentage={progress} size={140} strokeWidth={12} label={t.analytics.adherence} />

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

  const handleExportReport = async () => {
    if (exporting || !weeklyStats || weeklyStats.totalSchedules === 0) return;
    setExporting(true);
    try {
      const profile = await getProfile().catch(() => null);
      const taken = adherenceData.reduce((sum, d) => sum + d.taken, 0);
      const missed = adherenceData.reduce((sum, d) => sum + d.missed, 0);
      const skipped = adherenceData.reduce((sum, d) => sum + d.skipped, 0);

      const uri = await generateAnalyticsReportPdf({
        profileName: profile?.name ?? 'Patient',
        periodLabel: periodLabels[selectedPeriod],
        adherenceRate: weeklyStats.adherenceRate,
        taken,
        missed,
        skipped,
        total: weeklyStats.totalSchedules,
        days: adherenceData,
      });

      await withLockExemption(() =>
        Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: t.analytics.exportReport,
        })
      );
    } catch (error) {
      console.error('Failed to export analytics report:', error);
      showToast(t.analytics.exportError, 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.background.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: spacing.sm, padding: 4 }}
            accessibilityLabel="Go back"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.analytics.title}</Text>
            <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.analytics.subtitle}</Text>
          </View>
          <TouchableOpacity
            onPress={handleExportReport}
            disabled={exporting || !weeklyStats || weeklyStats.totalSchedules === 0}
            style={{
              marginLeft: spacing.sm,
              padding: 4,
              opacity: exporting || !weeklyStats || weeklyStats.totalSchedules === 0 ? 0.4 : 1,
            }}
            accessibilityLabel={t.analytics.exportReport}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.accent.primary} />
            ) : (
              <MaterialCommunityIcons name="file-pdf-box" size={28} color={colors.accent.primary} />
            )}
          </TouchableOpacity>
        </View>
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
          {(['7d', '30d', '90d', 'all'] as const).map((period) => (
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

        {/* Monthly adherence calendar */}
        <View style={{ marginTop: spacing.md }}>
          <Text style={[typ.label.base, { color: colors.text.secondary, marginBottom: spacing.sm, marginHorizontal: spacing.base }]}>
            {t.analytics.monthCalendar}
          </Text>
          <MonthCalendar />
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
    </SafeAreaView>
  );
}
