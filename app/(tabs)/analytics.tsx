/**
 * Analytics Dashboard Screen
 * Visualize medication adherence patterns and statistics
 */

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { useTranslation } from '../src/i18n';
import { typography, spacing } from '../src/theme/tokens';
import { Card } from '../src/components/ui/Card';
import { getDatabase } from '../src/db/database';
import type { SQLiteDatabase } from 'expo-sqlite';

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

export default function AnalyticsScreen() {
  const { colors, typography: typ } = useTheme();
  const t = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [adherenceData, setAdherenceData] = useState<AdherenceData[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  async function loadAnalyticsData() {
    try {
      const db = getDatabase();
      
      // Calculate period days
      const daysBack = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      
      // Get dose records for period
      const doseRecords = await db.getAllAsync<any>(
        `SELECT dr.*, m.name as medicine_name, s.time as scheduled_time
         FROM dose_records dr
         INNER JOIN medicines m ON dr.medicine_id = m.id
         LEFT JOIN schedules s ON dr.schedule_id = s.id
         WHERE dr.scheduled_time >= ?
         ORDER BY dr.scheduled_time DESC`,
        [startDate.toISOString()]
      );
      
      // Group by date
      const groupedData = groupByDate(doseRecords);
      setAdherenceData(groupedData);
      
      // Calculate weekly stats
      const stats = calculateStats(doseRecords);
      setWeeklyStats(stats);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  function groupByDate(records: any[]): AdherenceData[] {
    const groups: Record<string, AdherenceData> = {};
    
    records.forEach(record => {
      const date = record.scheduled_time.split(' ')[0];
      
      if (!groups[date]) {
        groups[date] = {
          date,
          taken: 0,
          missed: 0,
          skipped: 0,
          pending: 0,
        };
      }
      
      if (record.status === 'taken') groups[date].taken++;
      else if (record.status === 'missed') groups[date].missed++;
      else if (record.status === 'skipped') groups[date].skipped++;
      else groups[date].pending++;
    });
    
    return Object.values(groups).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  function calculateStats(records: any[]): WeeklyStats {
    const totalSchedules = records.length;
    const completed = records.filter(r => r.status === 'taken').length;
    const missed = records.filter(r => r.status === 'missed').length;
    
    return {
      totalSchedules,
      completed,
      missed,
      adherenceRate: totalSchedules > 0 
        ? Math.round((completed / totalSchedules) * 100) 
        : 0,
    };
  }

  const renderBarChart = () => {
    if (adherenceData.length === 0) {
      return (
        <View style={[styles.emptyState, { backgroundColor: colors.background.subtle }]}>
          <Text style={[typ.body.base, { color: colors.text.secondary }]}>No data available</Text>
        </View>
      );
    }
    
    const maxTaken = Math.max(...adherenceData.map(d => d.taken), 1);
    const barWidth = 30;
    const gap = 8;
    
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', paddingHorizontal: spacing.base }}>
          {adherenceData.slice(0, 14).map((day) => {
            const height = (day.taken / maxTaken) * 120;
            
            return (
              <View key={day.date} style={{ width: barWidth, alignItems: 'center', marginHorizontal: gap/2 }}>
                <View 
                  style={[
                    styles.barContainer, 
                    { height: 120, backgroundColor: colors.border.default, borderRadius: 4 }
                  ]}
                >
                  <View 
                    style={[
                      styles.bar, 
                      { 
                        height, 
                        backgroundColor: colors.accent.primary,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                      }
                    ]}
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
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const progress = weeklyStats?.adherenceRate || 0;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    
    return (
      <View style={styles.adherenceCard}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ position: 'relative', width: radius * 2, height: radius * 2 }}>
            {/* Background circle */}
            <View 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: radius,
                borderWidth: 12,
                borderColor: colors.border.default,
              }}
            />
            
            {/* Progress circle (using SVG) */}
            <svg width={radius * 2} height={radius * 2} style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle
                cx={radius}
                cy={radius}
                r={radius}
                fill="transparent"
                stroke={colors.accent.primary}
                strokeWidth={12}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${radius} ${radius})`}
              />
            </svg>
            
            {/* Center text */}
            <View style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Text style={[typ.heading.md, { color: colors.text.primary }]}>
                {progress}%
              </Text>
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>Adherence</Text>
            </View>
          </View>
        </View>
        
        <View style={{ marginTop: spacing.md }}>
          <View style={[styles.statRow, { flexDirection: 'row', justifyContent: 'space-around' }]}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.lg, { color: colors.success }]}>
                {weeklyStats?.completed || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>Taken</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.lg, { color: colors.error }]}>
                {weeklyStats?.missed || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>Missed</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typ.heading.lg, { color: colors.text.primary }]}>
                {weeklyStats?.totalSchedules || 0}
              </Text>
              <Text style={[typ.body.xs, { color: colors.text.secondary }]}>Total</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <View style={[styles.header, { backgroundColor: colors.background.surface, paddingTop: spacing.lg + spacing.xs }]}>
        <Text style={[typ.heading.h2, { color: colors.text.primary }]}>{t.analytics.title}</Text>
        <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.analytics.subtitle}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl + 20 }}>
        {/* Period Selector */}
        <View style={[styles.periodSelector, { paddingHorizontal: spacing.base, paddingVertical: spacing.md }]}>
          {(['7d', '30d', 'all'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodBtn,
                { 
                  backgroundColor: selectedPeriod === period ? colors.accent.primary : colors.background.subtle,
                }
              ]}
              onPress={() => {
                setSelectedPeriod(period);
                loadAnalyticsData();
              }}
            >
              <Text style={[
                typ.label.sm, 
                { 
                  color: selectedPeriod === period ? '#FFFFFF' : colors.text.secondary 
                }
              ]}>
                {period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Adherence Ring */}
        {renderAdherenceRing()}

        {/* Weekly Bar Chart */}
        <View style={{ marginTop: spacing.md, paddingHorizontal: spacing.base }}>
          <Text style={[typ.label.lg, { color: colors.text.secondary, marginBottom: spacing.sm }]}>
            {t.analytics.weeklyActivity}
          </Text>
          {renderBarChart()}
        </View>

        {/* Tips Card */}
        <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.md }}>
          <View style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <MaterialCommunityIcons name="lightbulb-outline" size={20} color={colors.accent.primary} />
              <Text style={[typ.label.md, { color: colors.text.primary, marginLeft: spacing.xs }]}>
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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderBottomColor: 'border',
    borderBottomWidth: 1,
  },
  periodBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  adherenceCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  statRow: {
    marginTop: spacing.md,
  },
  barContainer: {
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});
