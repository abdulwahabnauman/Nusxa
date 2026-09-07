/**
 * MonthCalendar — day-level adherence heat map for a single month.
 * Each day cell is colored by the share of scheduled doses taken:
 * green (>=80%), amber (>=40%), red (>0% but <40%), neutral (no doses).
 * Navigation is capped at the current month (no peeking into the future).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { Card } from '../ui/Card';
import { getDatabase } from '../../db/database';
import { useSettingsStore } from '../../stores/settings-store';
import { formatDigits } from '../../utils/numerals';

interface DayStat {
  total: number;
  taken: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISODate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function MonthCalendar() {
  const { colors, typography: typ, spacing } = useTheme();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const { t, language } = useI18n();

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [dayStats, setDayStats] = useState<Record<string, DayStat>>({});

  const locale = language === 'ur' ? 'ur' : 'en';

  const loadMonth = useCallback(async (year: number, month: number) => {
    try {
      const db = getDatabase();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
      const rows = await db.getAllAsync<{ scheduled_time: string; status: string }>(
        `SELECT scheduled_time, status FROM dose_records
         WHERE scheduled_time >= ? AND scheduled_time <= ?`,
        [monthStart.toISOString(), monthEnd.toISOString()],
      );

      const grouped: Record<string, DayStat> = {};
      for (const row of rows) {
        const date = String(row.scheduled_time).slice(0, 10);
        if (!grouped[date]) grouped[date] = { total: 0, taken: 0 };
        const stat = grouped[date];
        if (!stat) continue;
        stat.total++;
        if (row.status === 'taken') stat.taken++;
      }
      setDayStats(grouped);
    } catch (error) {
      console.error('Failed to load month adherence:', error);
      setDayStats({});
    }
  }, []);

  useEffect(() => {
    loadMonth(viewYear, viewMonth);
  }, [viewYear, viewMonth, loadMonth]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  // Never navigate past the current month
  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const goNext = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(viewYear, viewMonth, 1));

  // Narrow weekday labels (Sun..Sat), localized
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    // 2024-01-07 was a Sunday
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 7 + i)),
    );
  }, [locale]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();

  const cellColor = (day: number): { bg: string; fg: string } => {
    const iso = toISODate(viewYear, viewMonth, day);
    const stat = dayStats[iso];
    const cellDate = new Date(viewYear, viewMonth, day);
    if (cellDate > today || !stat || stat.total === 0) {
      return { bg: colors.background.subtle, fg: colors.text.disabled };
    }
    const pct = (stat.taken / stat.total) * 100;
    if (pct >= 80) return { bg: colors.success, fg: '#FFFFFF' };
    if (pct >= 40) return { bg: colors.warning, fg: '#FFFFFF' };
    return { bg: colors.error, fg: '#FFFFFF' };
  };

  const cellAccessibility = (day: number): string => {
    const iso = toISODate(viewYear, viewMonth, day);
    const stat = dayStats[iso];
    if (!stat || stat.total === 0) return `${day} ${monthLabel}`;
    const pct = Math.round((stat.taken / stat.total) * 100);
    return `${day} ${monthLabel}: ${pct}% adherence`;
  };

  return (
    <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.md }}>
      <View style={{ padding: spacing.md }}>
        {/* Month navigation */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.sm,
          }}
        >
          <TouchableOpacity
            onPress={goPrev}
            style={{ padding: 4 }}
            accessibilityLabel={t.analytics.prevMonth}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={language === 'ur' ? 'chevron-right' : 'chevron-left'}
              size={22}
              color={colors.text.secondary}
            />
          </TouchableOpacity>
          <Text style={[typ.label.base, { color: colors.text.primary }]}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={goNext}
            disabled={isCurrentMonth}
            style={{ padding: 4, opacity: isCurrentMonth ? 0.3 : 1 }}
            accessibilityLabel={t.analytics.nextMonth}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={language === 'ur' ? 'chevron-left' : 'chevron-right'}
              size={22}
              color={colors.text.secondary}
            />
          </TouchableOpacity>
        </View>

        {/* Weekday header */}
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {weekdayLabels.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[typ.body.xs, { color: colors.text.disabled }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: firstWeekday }, (_, i) => (
            <View key={`pad-${i}`} style={{ width: `${100 / 7}%`, height: 36 }} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const { bg, fg } = cellColor(day);
            return (
              <View
                key={day}
                style={{ width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center' }}
                accessibilityLabel={cellAccessibility(day)}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={[typ.body.xs, { color: fg }]}>{formatDigits(day, easternNumerals)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.md,
            marginTop: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
            <Text style={[typ.body.xs, { color: colors.text.secondary, marginLeft: 4 }]}>
              {t.analytics.legendGood}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning }} />
            <Text style={[typ.body.xs, { color: colors.text.secondary, marginLeft: 4 }]}>
              {t.analytics.legendPartial}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} />
            <Text style={[typ.body.xs, { color: colors.text.secondary, marginLeft: 4 }]}>
              {t.analytics.legendMissed}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
