import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useAuthStore } from '../../src/stores/auth-store';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PillIcon } from '../../src/components/ui/PillIcon';
import { ScheduleTimeline } from '../../src/components/medicine/ScheduleTimeline';
import { NextDoseHero } from '../../src/components/medicine/NextDoseHero';
import { useUndoToast } from '../../src/components/ui/UndoToast';
import { Celebration } from '../../src/components/ui/Celebration';
import { AdherenceRing } from '../../src/components/progress/AdherenceRing';
import { StreakCounter } from '../../src/components/progress/StreakCounter';
import { WeeklyChart } from '../../src/components/progress/WeeklyChart';
import { getTodayRange, getLast7Days, getTodayISO, formatTime12h } from '../../src/utils/date';
import { cancelNotification, snoozeNotificationId, syncRefillNotifications } from '../../src/utils/notifications';
import { getAdherenceStats, upsertDoseStatus, getTodayDoseRecords, deleteDoseRecord, updateDoseRecord } from '../../src/db/repositories/dose';
import { getActiveSchedules } from '../../src/db/repositories/schedule';
import { getMedicine, updateInventory } from '../../src/db/repositories/medicine';
import { doseHaptic, milestoneHaptic } from '../../src/utils/haptics';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useI18n } from '../../src/i18n';
import type { TodayScheduleItem } from '../../src/types/models';

export default function HomeScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [todayItems, setTodayItems] = useState<TodayScheduleItem[]>([]);
  const [adherence, setAdherence] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{ day: string; percentage: number }[]>([]);
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string } | null>(null);
  const { showUndoToast, undoToastElement } = useUndoToast();

  // One-time catch-up: installs that skipped onboarding (upgrade installs,
  // permission auto-grants) never got asked for notifications. If the OS
  // permission is still "undetermined" and the user hasn't dismissed this
  // card before, offer it once here instead of silently staying silent.
  const PERM_PROMPT_KEY = 'nusxa_perm_prompt_dismissed';
  const [showPermPrompt, setShowPermPrompt] = useState(false);
  const [permBusy, setPermBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [perm, dismissed] = await Promise.all([
          Notifications.getPermissionsAsync(),
          SecureStore.getItemAsync(PERM_PROMPT_KEY).catch(() => null),
        ]);
        if (!cancelled && perm.status === 'undetermined' && !dismissed) {
          setShowPermPrompt(true);
        }
      } catch { /* permission checks are best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEnableReminders = useCallback(async () => {
    if (permBusy) return;
    setPermBusy(true);
    try {
      const result = await Notifications.requestPermissionsAsync();
      useSettingsStore.getState().setNotificationsEnabled(result.granted);
      await SecureStore.setItemAsync(PERM_PROMPT_KEY, '1').catch(() => {});
    } catch { /* never block the home screen on permission errors */ }
    setShowPermPrompt(false);
    setPermBusy(false);
  }, [permBusy]);

  const handleDismissPermPrompt = useCallback(async () => {
    await SecureStore.setItemAsync(PERM_PROMPT_KEY, '1').catch(() => {});
    setShowPermPrompt(false);
  }, []);

  // Celebrate streak milestones (7/30 days) and finishing every dose of the day
  const prevStreakRef = useRef<number | null>(null);
  const prevAllDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    const allDone = todayItems.length > 0 && todayItems.every((item) => item.status !== 'pending');
    if (prevStreakRef.current !== null) {
      if ((streak === 7 || streak === 30) && streak > prevStreakRef.current) {
        milestoneHaptic();
        setCelebration({
          title: t.home.streakTitle.replace('{n}', String(streak)),
          subtitle: streak === 7 ? t.home.weekSubtitle : t.home.monthSubtitle,
        });
      } else if (allDone && prevAllDoneRef.current === false) {
        milestoneHaptic();
        setCelebration({
          title: t.home.allDoneToday,
          subtitle: t.home.allDoneTodayDesc,
        });
      }
    }
    prevStreakRef.current = streak;
    prevAllDoneRef.current = allDone;
  }, [streak, todayItems]);

  const loadData = useCallback(async () => {
    try {
      const today = getTodayISO();
      const [rangeStart, rangeEnd] = getTodayRange();
      const [schedules, todayRecords] = await Promise.all([
        getActiveSchedules(),
        getTodayDoseRecords(today),
      ]);
      const recordBySchedule = new Map(todayRecords.map((r) => [r.schedule_id, r]));
      const items: TodayScheduleItem[] = [];

      for (const schedule of schedules) {
        const medicine = await getMedicine(schedule.medicine_id);
        if (!medicine) continue;

        const record = recordBySchedule.get(schedule.id);
        items.push({
          scheduleId: schedule.id,
          medicineId: medicine.id,
          medicineName: medicine.name ?? 'Unknown',
          dosage: medicine.dosage,
          time: schedule.time,
          windowMinutes: schedule.window_minutes,
          mealInstruction: schedule.meal_instruction,
          status: record ? record.status : 'pending',
          doseRecordId: record?.id ?? null,
          category: medicine.form ?? 'other',
        });
      }

      setTodayItems(items);

      // Adherence stats
      const stats = await getAdherenceStats(rangeStart, rangeEnd);
      if (stats.total > 0) {
        setAdherence(Math.round((stats.taken / stats.total) * 100));
      } else {
        setAdherence(0);
      }

      // Weekly data
      const last7 = getLast7Days();
      const weekly: { day: string; percentage: number }[] = [];
      for (const dayInfo of last7) {
        const dayStats = await getAdherenceStats(dayInfo.iso, dayInfo.iso);
        const pct = dayStats.total > 0 ? Math.round((dayStats.taken / dayStats.total) * 100) : 0;
        weekly.push({ day: dayInfo.label, percentage: pct });
      }
      setWeeklyData(weekly);

      // Simple streak calculation: count consecutive days with >0% adherence
      let currentStreak = 0;
      for (let i = last7.length - 1; i >= 0; i--) {
        const day = last7[i];
        if (!day) continue;
        const dayStats = await getAdherenceStats(day.iso, day.iso);
        if (dayStats.total > 0 && dayStats.taken > 0) {
          currentStreak++;
        } else if (i < last7.length - 1) {
          break; // Only count from the most recent days backward
        }
      }
      setStreak(currentStreak);

      // Reconcile throttled refill reminders with current inventory
      void syncRefillNotifications();
    } catch {
      // Silently handle — offline mode is fine
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleTaken = useCallback(async (scheduleId: string, medicineId: string) => {
    try {
      // The dose is handled — no need for a snoozed re-ring to fire
      cancelNotification(snoozeNotificationId(scheduleId)).catch(() => {});
      const prev = todayItems.find((item) => item.scheduleId === scheduleId);
      const today = getTodayISO();
      const record = await upsertDoseStatus(scheduleId, medicineId, `${today}T${new Date().toTimeString().slice(0, 5)}`, 'taken');
      doseHaptic();
      // Decrement inventory
      try {
        const med = await getMedicine(medicineId);
        if (med && med.remaining_quantity !== null && med.remaining_quantity > 0) {
          await updateInventory(medicineId, med.remaining_quantity - 1);
        }
      } catch { /* inventory tracking is best-effort */ }
      await loadData();

      showUndoToast(t.home.doseTakenToast, async () => {
        try {
          if (!prev || prev.status === 'pending') {
            // No record existed before — remove the one we just created
            await deleteDoseRecord(record.id);
          } else if (prev.doseRecordId) {
            await updateDoseRecord(prev.doseRecordId, { status: prev.status });
          }
          // Restore the unit we subtracted from inventory
          try {
            const med = await getMedicine(medicineId);
            if (med && med.remaining_quantity !== null) {
              await updateInventory(medicineId, med.remaining_quantity + 1);
            }
          } catch { /* best-effort */ }
          await loadData();
        } catch { /* undo is best-effort */ }
      });
    } catch {
      Alert.alert('Error', 'Could not record dose. Please try again.');
    }
  }, [loadData, todayItems, showUndoToast]);

  const handleSkip = useCallback(async (scheduleId: string, medicineId: string) => {
    try {
      cancelNotification(snoozeNotificationId(scheduleId)).catch(() => {});
      const prev = todayItems.find((item) => item.scheduleId === scheduleId);
      const today = getTodayISO();
      const record = await upsertDoseStatus(scheduleId, medicineId, `${today}T${new Date().toTimeString().slice(0, 5)}`, 'skipped');
      doseHaptic();
      await loadData();

      showUndoToast(t.home.doseSkippedToast, async () => {
        try {
          if (!prev || prev.status === 'pending') {
            await deleteDoseRecord(record.id);
          } else if (prev.doseRecordId) {
            await updateDoseRecord(prev.doseRecordId, { status: prev.status });
          }
          await loadData();
        } catch { /* undo is best-effort */ }
      });
    } catch {
      Alert.alert('Error', 'Could not record dose. Please try again.');
    }
  }, [loadData, todayItems, showUndoToast]);

  // "Take all" quick action: pending doses sharing the same reminder time,
  // only offered when at least two doses overlap at that time.
  const takeAllGroup = useMemo(() => {
    const pending = todayItems.filter((item) => item.status === 'pending');
    const byTime = new Map<string, TodayScheduleItem[]>();
    for (const item of pending) {
      const list = byTime.get(item.time) ?? [];
      list.push(item);
      byTime.set(item.time, list);
    }
    const groups = [...byTime.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort(([a], [b]) => a.localeCompare(b));
    return groups[0]?.[1] ?? null;
  }, [todayItems]);

  const handleTakeAll = useCallback(async () => {
    const group = takeAllGroup;
    if (!group || group.length === 0) return;
    const snapshots = group.map((item) => ({ item }));
    const today = getTodayISO();
    try {
      for (const { item } of snapshots) {
        cancelNotification(snoozeNotificationId(item.scheduleId)).catch(() => {});
        await upsertDoseStatus(item.scheduleId, item.medicineId, `${today}T${new Date().toTimeString().slice(0, 5)}`, 'taken');
        try {
          const med = await getMedicine(item.medicineId);
          if (med && med.remaining_quantity !== null && med.remaining_quantity > 0) {
            await updateInventory(item.medicineId, med.remaining_quantity - 1);
          }
        } catch { /* inventory tracking is best-effort */ }
      }
      doseHaptic();
      await loadData();

      showUndoToast(
        t.home.takeAllToast.replace('{n}', String(group.length)),
        async () => {
          try {
            for (const { item } of snapshots) {
              if (item.doseRecordId) {
                await updateDoseRecord(item.doseRecordId, { status: item.status });
              } else {
                const records = await getTodayDoseRecords(getTodayISO());
                const fresh = records.find((r) => r.schedule_id === item.scheduleId);
                if (fresh) await deleteDoseRecord(fresh.id);
              }
              try {
                const med = await getMedicine(item.medicineId);
                if (med && med.remaining_quantity !== null) {
                  await updateInventory(item.medicineId, med.remaining_quantity + 1);
                }
              } catch { /* best-effort */ }
            }
            await loadData();
          } catch { /* undo is best-effort */ }
        }
      );
    } catch {
      Alert.alert('Error', 'Could not record doses. Please try again.');
    }
  }, [takeAllGroup, loadData, showUndoToast, t]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.home.goodMorning;
    if (hour < 17) return t.home.goodAfternoon;
    return t.home.goodEvening;
  };

  const hasSchedule = todayItems.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.primary}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <View>
            <Text style={[typography.body.sm, { color: colors.text.secondary }]}>
              {greeting()}
            </Text>
            <Text style={[typography.heading.h2, { color: colors.text.primary, marginTop: 2 }]}>
              {profile?.name ?? t.home.welcome}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/chat')}
            style={[styles.chatButton, { backgroundColor: colors.accent.subtle }]}
            accessibilityLabel="Open AI companion"
          >
            <MaterialCommunityIcons name="message-outline" size={22} color={colors.accent.primary} />
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={[styles.quickActions, { paddingHorizontal: spacing.base }]}>
          <Button
            title={t.home.scanPrescription}
            onPress={() => router.push('/scan')}
            icon={<MaterialCommunityIcons name="camera-outline" size={20} color="#FFFFFF" />}
            style={{ flex: 1 }}
          />
        </View>

        {/* One-time reminders catch-up (only if never asked by the OS) */}
        {showPermPrompt && (
          <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.md }}>
            <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.border.default }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MaterialCommunityIcons name="bell-ring-outline" size={22} color={colors.accent.primary} />
                <View style={{ flex: 1, marginStart: spacing.sm }}>
                  <Text style={[typography.label.base, { color: colors.text.primary }]}>
                    {t.home.permTitle}
                  </Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                    {t.home.permDesc}
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm }}>
                    <TouchableOpacity
                      onPress={handleEnableReminders}
                      disabled={permBusy}
                      style={{ backgroundColor: colors.accent.primary, borderRadius: borderRadius.md, paddingVertical: 8, paddingHorizontal: 14 }}
                      accessibilityLabel={t.home.permEnable}
                    >
                      <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>{t.home.permEnable}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDismissPermPrompt}
                      style={{ borderRadius: borderRadius.md, paddingVertical: 8, paddingHorizontal: 14 }}
                      accessibilityLabel={t.home.permLater}
                    >
                      <Text style={[typography.label.sm, { color: colors.text.secondary }]}>{t.home.permLater}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* Next dose hero */}
        {hasSchedule && (
          <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.lg }}>
            <NextDoseHero items={todayItems} onTaken={handleTaken} />
            {takeAllGroup && (
              <TouchableOpacity
                style={[styles.takeAll, { backgroundColor: colors.accent.subtle, marginTop: spacing.sm }]}
                onPress={handleTakeAll}
                accessibilityLabel={`Take all ${takeAllGroup.length} doses scheduled at ${takeAllGroup[0]!.time}`}
              >
                <MaterialCommunityIcons name="check-all" size={20} color={colors.accent.primary} />
                <Text style={[typography.label.base, { color: colors.accent.primary, marginLeft: 8 }]}>
                  {t.home.takeAll
                    .replace('{n}', String(takeAllGroup.length))
                    .replace('{time}', formatTime12h(takeAllGroup[0]!.time))}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Progress Overview */}
        {hasSchedule && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <View style={styles.progressRow}>
              <AdherenceRing percentage={adherence} label={t.home.today} size={90} />
              <View style={styles.streakArea}>
                <StreakCounter streak={streak} />
              </View>
            </View>
          </View>
        )}

        {/* Today's Schedule */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
            {t.home.todaysMedicines}
          </Text>

          <View style={{ marginTop: spacing.md }}>
            {hasSchedule ? (
              <Card>
                <ScheduleTimeline
                  items={todayItems}
                  onTaken={handleTaken}
                  onSkip={handleSkip}
                />
              </Card>
            ) : (
              <EmptyState
                icon={<PillIcon size={56} color={colors.text.disabled} contrastColor={colors.background.primary} />}
                title={t.home.noMedicines}
                description={t.home.noMedicinesDesc}
                actionLabel={t.home.scanPrescription}
                onAction={() => router.push('/scan')}
              />
            )}
          </View>
        </View>

        {/* Weekly Chart */}
        {hasSchedule && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.md }]}>
              {t.home.thisWeek}
            </Text>
            <Card>
              <WeeklyChart data={weeklyData} />
            </Card>
          </View>
        )}

        {/* Quick Links */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.md }]}>
            {t.home.quickAccess}
          </Text>
          <View style={styles.quickLinks}>
            <Card style={{ flex: 1 }} padding="sm">
              <TouchableOpacity
                style={styles.quickLink}
                onPress={() => router.push('/emergency-card')}
                accessibilityLabel="Emergency card"
              >
                <MaterialCommunityIcons name="medical-bag" size={24} color={colors.error} />
                <Text style={[typography.body.sm, { color: colors.text.primary, marginTop: spacing.xs, textAlign: 'center' }]}>
                  {t.home.emergencyCard}
                </Text>
              </TouchableOpacity>
            </Card>
            <Card style={{ flex: 1 }} padding="sm">
              <TouchableOpacity
                style={styles.quickLink}
                onPress={() => router.push('/doctor-visit')}
                accessibilityLabel="Doctor visit report"
              >
                <MaterialCommunityIcons name="clipboard-text-outline" size={24} color={colors.accent.primary} />
                <Text style={[typography.body.sm, { color: colors.text.primary, marginTop: spacing.xs, textAlign: 'center' }]}>
                  {t.home.doctorVisit}
                </Text>
              </TouchableOpacity>
            </Card>
            <Card style={{ flex: 1 }} padding="sm">
              <TouchableOpacity
                style={styles.quickLink}
                onPress={() => router.push('/analytics')}
                accessibilityLabel="Progress analytics"
              >
                <MaterialCommunityIcons name="chart-bar" size={24} color={colors.success} />
                <Text style={[typography.body.sm, { color: colors.text.primary, marginTop: spacing.xs, textAlign: 'center' }]}>
                  {t.nav.analytics}
                </Text>
              </TouchableOpacity>
            </Card>
          </View>
        </View>
      </ScrollView>
      {undoToastElement}
      {celebration && (
        <Celebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 16,
  },
  chatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: {
    marginTop: 20,
  },
  takeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  section: {
    marginTop: 24,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  streakArea: {
    flex: 1,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  quickLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
