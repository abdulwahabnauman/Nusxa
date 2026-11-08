/**
 * NextDoseHero — glanceable "next dose" card for the Home screen
 * Shows the upcoming (or overdue) pending dose with a live countdown,
 * a progress ring that fills over the hour before the dose, plus
 * one-tap Take and configurable Snooze actions (long-press for options).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withRepeat,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { MedicineFormIcon } from '../ui/PillIcon';
import { SpeechButton } from '../ui/SpeechButton';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings-store';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatDigits } from '../../utils/numerals';
import { getTimeRangeParts } from '../../utils/date';
import { scheduleSnoozeReminder } from '../../utils/notifications';
import { takeDoseHaptic } from '../../utils/haptics';
import { buildDoseSpeechText } from '../../utils/speech';
import type { TodayScheduleItem } from '../../types/models';

/** Snooze durations offered on long-press (minutes) */
export const SNOOZE_OPTIONS = [5, 10, 15, 30];

/* Countdown ring geometry */
const RING_SIZE = 52;
const RING_RADIUS = 24;
const RING_STROKE = 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/* The ring fills during the final hour before the dose is due */
const RING_LEAD_MS = 60 * 60 * 1000;

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
  const { t, language } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const snoozeMinutes = useSettingsStore((s) => s.snoozeMinutes);
  const setSnoozeMinutes = useSettingsStore((s) => s.setSnoozeMinutes);
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  // {start, until} per schedule so the ring can drain over the snooze window
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, { start: number; until: number }>>({});
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [takingScheduleId, setTakingScheduleId] = useState<string | null>(null);

  // Micro-interaction: spring physics morphing pill to checkmark on take
  const takeButtonScale = useSharedValue(1);
  const morphProgress = useSharedValue(0);

  const nf = (v: string | number) => formatDigits(v, easternNumerals);

  /**
   * Human countdown, e.g. "in 2h 15m", "due now", "overdue by 35m".
   * `trulyOverdue` must reflect the dose WINDOW having closed (not just the
   * dose's start time having passed) — a dose is still "due now", not
   * "overdue", for as long as its window remains open.
   */
  const formatCountdown = (diffMs: number, trulyOverdue: boolean): string => {
    const span = (min: number) => {
      if (min < 60) return `${nf(min)}${t.home.minutesShort}`;
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0
        ? `${nf(h)}${t.home.hoursShort}`
        : `${nf(h)}${t.home.hoursShort} ${nf(m)}${t.home.minutesShort}`;
    };
    if (trulyOverdue) {
      const overdueMin = Math.round(-diffMs / 60000);
      if (overdueMin < 1) return t.home.dueNow;
      return t.home.countdownOverdue.replace('{t}', span(overdueMin));
    }
    if (diffMs <= 0) return t.home.dueNow;
    const totalMin = Math.round(diffMs / 60000);
    if (totalMin < 1) return t.home.dueNow;
    return t.home.countdownIn.replace('{t}', span(totalMin));
  };

  const formatClock = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return nf(`${h}:${m}`);
  };

  // Tick every 30s so the countdown stays honest; while a snooze is active
  // tick faster so the snooze ring visibly drains.
  const hasActiveSnooze = Object.values(snoozedUntil).some((entry) => entry.until > now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), hasActiveSnooze ? 5_000 : 30_000);
    return () => clearInterval(timer);
  }, [hasActiveSnooze]);

  const pending = useMemo(
    () =>
      items
        .filter((item) => item.status === 'pending')
        .sort((a, b) => todaysDateFor(a.time).getTime() - todaysDateFor(b.time).getTime()),
    [items],
  );

  // Next = earliest pending dose, whether it's still ahead of us or already
  // active/overdue. `pending` is sorted ascending by start time, so the
  // earliest entry is always correct — there is no need (and it was a bug)
  // to skip past an already-open dose to reach a later one that simply
  // hasn't started yet.
  const next = pending[0];

  // Timing is derived up here, before any early return, because the
  // animation hooks below depend on it and must run on every render. With no
  // pending dose these fallbacks are computed but never rendered.
  const doseDate = next ? todaysDateFor(next.time) : new Date(now);
  const windowEndDate = new Date(doseDate.getTime() + (next?.windowMinutes ?? 120) * 60_000);
  const diffToStart = doseDate.getTime() - now;
  const diffToEnd = windowEndDate.getTime() - now;
  const snoozeEntry = next ? snoozedUntil[next.scheduleId] : undefined;
  const isSnoozed = !!snoozeEntry && snoozeEntry.until > now;

  // "Started" = the dose window has opened (Take/Snooze become available).
  // "Overdue" = the dose window has fully closed without action — this is
  // the only state that should show the warning tint and "overdue by …"
  // text. A dose that's merely in-progress (started but window still open)
  // reads as "due now" in the normal accent color.
  const started = diffToStart <= 0;
  const overdue = diffToEnd <= 0;

  // Breathing glow on the card once the dose is due within 15 minutes
  const isImminent = !!next && diffToStart <= 15 * 60_000 && !overdue && !isSnoozed;
  const ambientPulse = useSharedValue(1);

  useEffect(() => {
    if (isImminent && !reducedMotion) {
      ambientPulse.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1200 }),
          withTiming(1, { duration: 1200 })
        ),
        -1,
        true
      );
    } else {
      ambientPulse.value = 1;
    }
  }, [isImminent, reducedMotion]);

  useEffect(() => {
    takeButtonScale.value = 1;
    morphProgress.value = 0;
    setTakingScheduleId(null);
  }, [next?.scheduleId]);

  const takeButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: takeButtonScale.value }],
  }));

  const pillIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morphProgress.value, [0, 0.45], [1, 0], 'clamp'),
    transform: [
      { scale: interpolate(morphProgress.value, [0, 0.5], [1, 0.3], 'clamp') },
      { rotate: `${interpolate(morphProgress.value, [0, 0.5], [0, -40], 'clamp')}deg` },
    ],
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    opacity: interpolate(morphProgress.value, [0.4, 1], [0, 1], 'clamp'),
    transform: [
      { scale: interpolate(morphProgress.value, [0.4, 1], [0.3, 1], 'clamp') },
      { rotate: `${interpolate(morphProgress.value, [0.4, 1], [40, 0], 'clamp')}deg` },
    ],
  }));

  const animatedHeroCardStyle = useAnimatedStyle(() => {
    if (!isImminent || reducedMotion) {
      return {
        borderColor: colors.border.default,
      };
    }
    const pulseBorderColor = interpolateColor(
      ambientPulse.value,
      [0.4, 1],
      [colors.warning + '44', colors.warning]
    );
    return {
      borderColor: pulseBorderColor,
      shadowColor: colors.warning,
      shadowOpacity: interpolate(ambientPulse.value, [0.4, 1], [0.06, 0.24], 'clamp'),
      shadowRadius: interpolate(ambientPulse.value, [0.4, 1], [3, 10], 'clamp'),
    };
  });

  if (items.length === 0) return null;

  // All done for today — unless some doses were missed, in which case the
  // timeline below tells that story better than a green "all done" banner
  if (!next) {
    if (items.some((item) => item.status === 'missed')) return null;
    return (
      <View style={[styles.hero, { backgroundColor: colors.success + '1A', borderColor: colors.success + '33', borderStartWidth: 3, borderStartColor: colors.success }]}>
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

  const [rangeStart, rangeEnd] = getTimeRangeParts(next.time, next.windowMinutes ?? 120, language);
  const windowLabel = t.dose.timeRange
    .replace('{start}', nf(rangeStart))
    .replace('{end}', nf(rangeEnd));

  const diffMs = overdue ? diffToEnd : diffToStart;
  const heroTint = overdue ? colors.warning : colors.accent.primary;

  // Ring fills from 0 → 1 during the last hour before the dose is due.
  // While snoozed it restarts as a countdown that drains over the snooze
  // window, so the user sees the reminder visibly counting back in.
  const ringProgress = isSnoozed && snoozeEntry
    ? Math.max(0, Math.min(1, (snoozeEntry.until - now) / Math.max(1, snoozeEntry.until - snoozeEntry.start)))
    : overdue
      ? 1
      : Math.max(0, Math.min(1, 1 - diffToStart / RING_LEAD_MS));
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringProgress);

  /** Snooze the reminder card locally and arm a one-shot re-ring. */
  const applySnooze = (minutes: number) => {
    const start = Date.now();
    const until = start + minutes * 60_000;
    setSnoozedUntil((current) => ({
      ...current,
      [next.scheduleId]: { start, until },
    }));
    setShowSnoozeOptions(false);
    setNow(Date.now());
    scheduleSnoozeReminder({
      scheduleId: next.scheduleId,
      medicineId: next.medicineId,
      medicineName: next.medicineName,
      at: new Date(until),
    }).catch(() => {});
  };

  const pickSnooze = (minutes: number) => {
    setSnoozeMinutes(minutes);
    applySnooze(minutes);
  };

  const handleTakePress = () => {
    takeDoseHaptic();
    if (reducedMotion) {
      onTaken(next.scheduleId, next.medicineId);
      return;
    }
    setTakingScheduleId(next.scheduleId);
    takeButtonScale.value = withSequence(
      withSpring(0.92, { damping: 12, stiffness: 450 }),
      withSpring(1, { damping: 14, stiffness: 350 })
    );
    morphProgress.value = withSpring(1, { damping: 14, stiffness: 320 });
    setTimeout(() => {
      onTaken(next.scheduleId, next.medicineId);
    }, 240);
  };

  return (
    <Animated.View
      style={[
        styles.hero,
        {
          backgroundColor: colors.background.surface,
          borderStartWidth: 3,
          borderStartColor: heroTint,
        },
        animatedHeroCardStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.border.default}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={heroTint}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View
            style={[
              styles.iconBubble,
              styles.iconBubbleAbsolute,
              { backgroundColor: overdue ? colors.warning + '26' : colors.accent.subtle },
            ]}
          >
            <MedicineFormIcon form={next.form} size={22} color={heroTint} contrastColor={heroTint + '55'} />
          </View>
        </View>

        <View style={{ flex: 1, marginStart: spacing.md }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text
              numberOfLines={1}
              style={[typ.heading.h4, { color: colors.text.primary, flex: 1, marginEnd: 8 }]}
            >
              {next.medicineName}
              {next.dosage ? `, ${next.dosage}` : ''}
            </Text>
            <SpeechButton
              text={buildDoseSpeechText({
                medicineName: next.medicineName,
                dosage: next.dosage,
                mealInstruction: next.mealInstruction,
                time: formatClock(doseDate),
                language,
              })}
              medicineName={next.medicineName}
              size={20}
            />
          </View>
          <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
            {isSnoozed && snoozeEntry
              ? t.home.reminderBackAt.replace('{t}', formatClock(new Date(snoozeEntry.until)))
              : `${windowLabel} · ${formatCountdown(diffMs, overdue)}`}
          </Text>
        </View>
      </View>

      {/* Before the scheduled time there is nothing to act on — the ring
          and countdown carry the information until the dose is due */}
      {started && (
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          <TouchableOpacity
            onPress={handleTakePress}
            activeOpacity={0.85}
            accessibilityLabel={t.dose.markTaken.replace('{name}', next.medicineName)}
            disabled={takingScheduleId === next.scheduleId}
          >
            <Animated.View style={[styles.takeButton, { backgroundColor: colors.accent.primary }, takeButtonStyle]}>
              <View style={styles.morphIconWrap}>
                <Animated.View style={pillIconStyle}>
                  <MaterialCommunityIcons name="pill" size={18} color={colors.onAccent} />
                </Animated.View>
                <Animated.View style={checkIconStyle}>
                  <MaterialCommunityIcons name="check-bold" size={18} color={colors.onAccent} />
                </Animated.View>
              </View>
              <Text style={[typ.label.base, { color: colors.onAccent, marginStart: 6 }]}>
                {takingScheduleId === next.scheduleId ? t.dose.taken : t.home.take}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {!isSnoozed && (
            <TouchableOpacity
              style={[styles.snoozeButton, { borderColor: colors.border.default }]}
              onPress={() => applySnooze(snoozeMinutes)}
              onLongPress={() => setShowSnoozeOptions((v) => !v)}
              activeOpacity={0.85}
              accessibilityLabel={t.home.snoozeA11y.replace('{n}', String(snoozeMinutes))}
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
                    marginStart: 6,
                  },
                ]}
              >
                {`${t.home.snooze} ${nf(snoozeMinutes)}${t.home.minutesShort}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {started && showSnoozeOptions && !isSnoozed && (
        <View style={[styles.snoozeOptions, { marginTop: spacing.sm }]}>
          {SNOOZE_OPTIONS.map((min) => (
            <TouchableOpacity
              key={min}
              style={[
                styles.snoozeChip,
                {
                  backgroundColor: snoozeMinutes === min ? colors.accent.primary : colors.background.subtle,
                  borderColor: snoozeMinutes === min ? colors.accent.primary : colors.border.default,
                },
              ]}
              onPress={() => pickSnooze(min)}
              accessibilityLabel={t.home.snoozeFor.replace('{n}', String(min))}
            >
              <Text
                style={[
                  typ.label.sm,
                  { color: snoozeMinutes === min ? colors.onAccent : colors.text.secondary },
                ]}
              >
                {`${nf(min)}${t.home.minutesShort}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleAbsolute: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
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
    minHeight: 44,
    borderRadius: 12,
  },
  morphIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  snoozeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  snoozeChip: {
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
});
