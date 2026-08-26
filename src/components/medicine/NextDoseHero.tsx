/**
 * NextDoseHero — glanceable "next dose" card for the Home screen
 * Shows the upcoming (or overdue) pending dose with a live countdown
 * plus one-tap Take and 10-minute Snooze actions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PillIcon } from '../ui/PillIcon';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings-store';
import { formatDigits } from '../../utils/numerals';
import { getTimeRangeParts } from '../../utils/date';
import type { TodayScheduleItem } from '../../types/models';

const SNOOZE_MINUTES = 10;

interface NextDoseHeroProps {
  items: TodayScheduleItem[];
  onTaken: (scheduleId: string, medicineId: string) => void;
}

/** Parse "HH:MM" into a Date for today */
function todaysDateFor(time: string): Date {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function NextDoseHero({ items, onTaken }: NextDoseHeroProps) {
  const { colors, typography: typ, spacing } = useTheme();
  const { t } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const [now, setNow] = useState(() => Date.now());
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});

  const nf = (v: string | number) => formatDigits(v, easternNumerals);

  /** Human countdown, e.g. "in 2h 15m", "due now", "overdue by 35m" */
  const formatCountdown = (diffMs: number): string => {
    const span = (min: number) => {
      if (min < 60) return `${nf(min)}${t.home.minutesShort}`;
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0
        ? `${nf(h)}${t.home.hoursShort}`
        : `${nf(h)}${t.home.hoursShort} ${nf(m)}${t.home.minutesShort}`;
    };
    if (diffMs <= 0) {
      const overdueMin = Math.round(-diffMs / 60000);
      if (overdueMin < 1) return t.home.dueNow;
      return t.home.countdownOverdue.replace('{t}', span(overdueMin));
    }
    const totalMin = Math.round(diffMs / 60000);
    if (totalMin < 1) return t.home.dueNow;
    return t.home.countdownIn.replace('{t}', span(totalMin));
  };

  const formatClock = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return nf(`${h}:${m}`);
  };

  // Tick every 30s so the countdown stays honest
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const pending = useMemo(
    () =>
      items
        .filter((item) => item.status === 'pending')
        .sort((a, b) => todaysDateFor(a.time).getTime() - todaysDateFor(b.time).getTime()),
    [items],
  );

  if (items.length === 0) return null;

  // All done for today
  if (pending.length === 0) {
    return (
      <View style={[styles.hero, { backgroundColor: colors.success + '1A', borderColor: colors.success + '33', borderLeftWidth: 3, borderLeftColor: colors.success }]}>
        <View style={[styles.iconBubble, { backgroundColor: colors.success + '26' }]}>
          <MaterialCommunityIcons name="check-circle" size={26} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typ.label.base, { color: colors.text.primary }]}>{t.home.allDoneToday}</Text>
          <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
            {t.home.allDoneTodayDesc}
          </Text>
        </View>
      </View>
    );
  }

  // Next = earliest pending dose that hasn't passed yet; otherwise the earliest overdue one
  const upcoming =
    pending.find((item) => todaysDateFor(item.time).getTime() > now) ?? pending[0];
  if (!upcoming) return null;
  const next = upcoming;
  const doseDate = todaysDateFor(next.time);
  const diffMs = doseDate.getTime() - now;
  const snoozeUntil = snoozedUntil[next.scheduleId];
  const isSnoozed = !!snoozeUntil && snoozeUntil > now;

  const [rangeStart, rangeEnd] = getTimeRangeParts(next.time, next.windowMinutes ?? 120);
  const windowLabel = t.dose.timeRange
    .replace('{start}', nf(rangeStart))
    .replace('{end}', nf(rangeEnd));

  const handleSnooze = () => {
    setSnoozedUntil((current) => ({
      ...current,
      [next.scheduleId]: Date.now() + SNOOZE_MINUTES * 60_000,
    }));
    setNow(Date.now());
  };

  // Themed like the rest of the card family: surface background, hairline
  // border and a tinted left edge (accent, or warning once the dose is due).
  const overdue = diffMs <= 0;
  const heroTint = overdue ? colors.warning : colors.accent.primary;

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.default,
          borderLeftWidth: 3,
          borderLeftColor: heroTint,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={[
            styles.iconBubble,
            { backgroundColor: overdue ? colors.warning + '26' : colors.accent.subtle },
          ]}
        >
          <PillIcon size={26} color={heroTint} contrastColor={heroTint + '55'} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text
            style={[
              typ.body.xs,
              {
                color: heroTint,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              },
            ]}
          >
            {isSnoozed ? t.home.snoozed : t.home.nextDose}
          </Text>
          <Text
            numberOfLines={1}
            style={[typ.heading.h4, { color: colors.text.primary }]}
          >
            {next.medicineName}
            {next.dosage ? ` — ${next.dosage}` : ''}
          </Text>
          <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
            {isSnoozed
              ? t.home.reminderBackAt.replace('{t}', formatClock(new Date(snoozeUntil)))
              : `${windowLabel} · ${formatCountdown(diffMs)}`}
          </Text>
        </View>
      </View>

      <View style={[styles.actions, { marginTop: spacing.md }]}>
        <TouchableOpacity
          style={[styles.takeButton, { backgroundColor: colors.accent.primary }]}
          onPress={() => onTaken(next.scheduleId, next.medicineId)}
          activeOpacity={0.85}
          accessibilityLabel={`Mark ${next.medicineName} as taken`}
        >
          <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
          <Text style={[typ.label.base, { color: '#FFFFFF', marginLeft: 6 }]}>
            {t.home.take}
          </Text>
        </TouchableOpacity>

        {!isSnoozed && (
          <TouchableOpacity
            style={[styles.snoozeButton, { borderColor: colors.border.default }]}
            onPress={handleSnooze}
            activeOpacity={0.85}
            accessibilityLabel={`Snooze reminder for ${SNOOZE_MINUTES} minutes`}
          >
            <MaterialCommunityIcons
              name="clock-outline"
              size={18}
              color={colors.text.secondary}
            />
            <Text
              style={[
                typ.label.base,
                {
                  color: colors.text.secondary,
                  marginLeft: 6,
                },
              ]}
            >
              {`${t.home.snooze} ${nf(SNOOZE_MINUTES)}${t.home.minutesShort}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  takeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  snoozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
});
