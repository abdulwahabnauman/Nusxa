import React, { useCallback, useState, useEffect, useRef } from 'react';
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
import { getTodayRange, getLast7Days, getTodayISO } from '../../src/utils/date';
import { getAdherenceStats, upsertDoseStatus, getTodayDoseRecords, deleteDoseRecord, updateDoseRecord } from '../../src/db/repositories/dose';
import { getActiveSchedules } from '../../src/db/repositories/schedule';
import { getMedicine, updateInventory } from '../../src/db/repositories/medicine';
import { doseHaptic, milestoneHaptic } from '../../src/utils/haptics';
import type { TodayScheduleItem } from '../../src/types/models';

export default function HomeScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [todayItems, setTodayItems] = useState<TodayScheduleItem[]>([]);
  const [adherence, setAdherence] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{ day: string; percentage: number }[]>([]);
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string } | null>(null);
  const { showUndoToast, undoToastElement } = useUndoToast();

  // Celebrate streak milestones (7/30 days) and finishing every dose of the day
  const prevStreakRef = useRef<number | null>(null);
  const prevAllDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    const allDone = todayItems.length > 0 && todayItems.every((item) => item.status !== 'pending');
    if (prevStreakRef.current !== null) {
      if ((streak === 7 || streak === 30) && streak > prevStreakRef.current) {
        milestoneHaptic();
        setCelebration({
          title: `${streak}-day streak!`,
          subtitle: streak === 7 ? 'One full week of showing up. Excellent!' : 'One full month — outstanding dedication!',
        });
      } else if (allDone && prevAllDoneRef.current === false) {
        milestoneHaptic();
        setCelebration({
          title: 'All done for today',
          subtitle: 'Every dose handled. See you tomorrow!',
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
        const dayStats = await getAdherenceStats(last7[i].iso, last7[i].iso);
        if (dayStats.total > 0 && dayStats.taken > 0) {
          currentStreak++;
        } else if (i < last7.length - 1) {
          break; // Only count from the most recent days backward
        }
      }
      setStreak(currentStreak);
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

      showUndoToast('Dose marked as taken', async () => {
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
      const prev = todayItems.find((item) => item.scheduleId === scheduleId);
      const today = getTodayISO();
      const record = await upsertDoseStatus(scheduleId, medicineId, `${today}T${new Date().toTimeString().slice(0, 5)}`, 'skipped');
      doseHaptic();
      await loadData();

      showUndoToast('Dose skipped', async () => {
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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
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
              {profile?.name ?? 'Welcome'}
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
            title="Scan prescription"
            onPress={() => router.push('/scan')}
            icon={<MaterialCommunityIcons name="camera-outline" size={20} color="#FFFFFF" />}
            style={{ flex: 1 }}
          />
        </View>

        {/* Next dose hero */}
        {hasSchedule && (
          <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.lg }}>
            <NextDoseHero items={todayItems} onTaken={handleTaken} />
          </View>
        )}

        {/* Progress Overview */}
        {hasSchedule && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <View style={styles.progressRow}>
              <AdherenceRing percentage={adherence} label="Today" size={90} />
              <View style={styles.streakArea}>
                <StreakCounter streak={streak} />
              </View>
            </View>
          </View>
        )}

        {/* Today's Schedule */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
            Today's medicines
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
                title="No medicines yet"
                description="Scan a prescription to get started with your medication schedule."
                actionLabel="Scan prescription"
                onAction={() => router.push('/scan')}
              />
            )}
          </View>
        </View>

        {/* Weekly Chart */}
        {hasSchedule && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.md }]}>
              This week
            </Text>
            <Card>
              <WeeklyChart data={weeklyData} />
            </Card>
          </View>
        )}

        {/* Quick Links */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.md }]}>
            Quick access
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
                  Emergency
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
                  Doctor visit
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
                  Progress
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
