import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { useSettingsStore } from '../../src/stores/settings-store';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Modal } from '../../src/components/ui/Modal';
import { MedicineFormIcon } from '../../src/components/ui/PillIcon';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { showToast, showToastWithAction } from '../../src/components/ui/GlobalToast';
import { strengthColor } from '../../src/theme/tokens';
import { getMedicine, updateMedicine, deleteMedicine, restoreMedicine } from '../../src/db/repositories/medicine';
import {
  getSchedulesByMedicine,
  updateSchedule,
  deactivateSchedulesByMedicine,
  activateSchedulesByMedicine,
} from '../../src/db/repositories/schedule';
import { syncDoseNotifications } from '../../src/utils/notifications';
import { isValidTimeFormat } from '../../src/utils/validation';
import { useInvalidateData } from '../../src/hooks/queries';
import { estimateDaysUntilRefillFromFrequency } from '../../src/utils/inventory';
import { formatTime12h, addMinutesToTime } from '../../src/utils/date';
import { formatDigits } from '../../src/utils/numerals';
import type { Medicine, Schedule } from '../../src/types/models';

export default function MedicineDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidateData = useInvalidateData();
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDosage, setEditDosage] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editRemaining, setEditRemaining] = useState('');
  const [editInitial, setEditInitial] = useState('');
  const [editTimes, setEditTimes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Refill ordering is planned but not yet built (audit Feature 10) — the
  // entry point lives in the inventory card and opens a "coming soon" sheet.
  const [refillSoonVisible, setRefillSoonVisible] = useState(false);

  const nf = useCallback(
    (v: string | number) => formatDigits(v, easternNumerals),
    [easternNumerals]
  );

  // Staggered entrance so the detail screen feels like it grows out of the card
  const enter = (index: number) =>
    reducedMotion ? undefined : FadeInUp.duration(280).delay(index * 55).springify();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const med = await getMedicine(id);
      if (med) {
        setMedicine(med);
        const sch = await getSchedulesByMedicine(id);
        setSchedules(sch);
      }
    } catch (err) {
      console.error('Failed to load medicine:', err);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = useCallback(() => {
    if (!medicine) return;
    setEditName(medicine.name ?? '');
    setEditDosage(medicine.dosage ?? '');
    setEditFrequency(medicine.frequency ?? '');
    setEditDuration(medicine.duration ?? '');
    setEditRemaining(medicine.remaining_quantity != null ? String(medicine.remaining_quantity) : '');
    setEditInitial(medicine.initial_quantity != null ? String(medicine.initial_quantity) : '');
    const times: Record<string, string> = {};
    for (const sch of schedules) times[sch.id] = sch.time;
    setEditTimes(times);
    setEditVisible(true);
  }, [medicine, schedules]);

  const invalidTimes = Object.entries(editTimes).filter(
    ([, time]) => time.trim() !== '' && !isValidTimeFormat(time.trim())
  );
  const remainingInvalid =
    editRemaining.trim() !== '' &&
    (!/^\d+$/.test(editRemaining.trim()) || Number(editRemaining.trim()) < 0);
  const initialInvalid =
    editInitial.trim() !== '' &&
    (!/^\d+$/.test(editInitial.trim()) || Number(editInitial.trim()) <= 0);
  const editValid = editName.trim().length > 0 && invalidTimes.length === 0 && !remainingInvalid && !initialInvalid;

  const handleSaveEdit = useCallback(async () => {
    if (!medicine || !editValid) return;
    setSaving(true);
    try {
      await updateMedicine(medicine.id, {
        name: editName.trim(),
        dosage: editDosage.trim() || null,
        frequency: editFrequency.trim() || null,
        duration: editDuration.trim() || null,
        remaining_quantity: editRemaining.trim() === '' ? null : Number(editRemaining.trim()),
        initial_quantity: editInitial.trim() === '' ? null : Number(editInitial.trim()),
      });
      let timesChanged = false;
      for (const sch of schedules) {
        const newTime = editTimes[sch.id]?.trim();
        if (newTime && newTime !== sch.time && isValidTimeFormat(newTime)) {
          await updateSchedule(sch.id, { time: newTime });
          timesChanged = true;
        }
      }
      if (timesChanged) await syncDoseNotifications();
      setEditVisible(false);
      await load();
      invalidateData();
      showToast(t.medicine.savedToast, 'success');
    } catch (err) {
      console.error('Failed to update medicine:', err);
    } finally {
      setSaving(false);
    }
  }, [medicine, editValid, editName, editDosage, editFrequency, editDuration, editRemaining, editInitial, editTimes, schedules, load, t, invalidateData]);

  // Pause = all schedules deactivated; resume reactivates them
  const isPaused = schedules.length > 0 && schedules.every((s) => !s.is_active);

  const handleTogglePause = useCallback(async () => {
    if (!medicine) return;
    try {
      if (isPaused) {
        await activateSchedulesByMedicine(medicine.id);
        await syncDoseNotifications();
        showToast(t.medicine.resumedToast, 'success');
      } else {
        await deactivateSchedulesByMedicine(medicine.id);
        await syncDoseNotifications();
        showToast(t.medicine.pausedToast, 'info');
      }
      await load();
      invalidateData();
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  }, [medicine, isPaused, load, t, invalidateData]);

  const handleDelete = useCallback(() => {
    if (!medicine) return;
    Alert.alert(
      t.common.delete,
      t.medicine.deleteHint,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              const medId = medicine.id;
              await deleteMedicine(medId); // soft delete — undo clears the tombstone
              await syncDoseNotifications();
              invalidateData();
              router.back();
              showToastWithAction(t.medicine.deletedToast, {
                label: t.common.undo,
                onPress: async () => {
                  try {
                    await restoreMedicine(medId);
                    await syncDoseNotifications();
                    invalidateData();
                  } catch { /* undo is best-effort */ }
                },
              });
            } catch (err) {
              console.error('Failed to delete medicine:', err);
            }
          },
        },
      ]
    );
  }, [medicine, router, t, invalidateData]);

  if (!medicine) {
    // Once the load has finished with no result the id is gone (deleted or
    // mistyped) — show an empty state instead of spinning the skeleton forever.
    if (loaded) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
          <EmptyState
            icon="pill-off-outline"
            title={t.medicine.notFound}
            description={t.medicine.notFoundDesc}
          />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={{ padding: spacing.base, paddingTop: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 49,
                height: 49,
                borderRadius: 25,
                backgroundColor: colors.background.subtle,
                marginRight: 12,
              }}
            />
            <View style={{ flex: 1 }}>
              <View style={{ height: 20, borderRadius: 6, backgroundColor: colors.background.subtle, width: '60%' }} />
              <View style={{ height: 14, borderRadius: 6, backgroundColor: colors.background.subtle, width: '35%', marginTop: 8 }} />
            </View>
          </View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  const fields = [
    { label: 'Generic name', value: medicine.generic_name },
    { label: 'Brand name', value: medicine.brand_name },
    { label: 'Strength', value: medicine.strength },
    { label: 'Form', value: medicine.form },
    { label: 'Dosage', value: medicine.dosage },
    { label: 'Frequency', value: medicine.frequency },
    { label: 'Duration', value: medicine.duration },
    { label: 'Meal instruction', value: medicine.meal_instruction },
    { label: 'Purpose', value: medicine.purpose },
    { label: 'Storage', value: medicine.storage },
  ].filter((f) => f.value);

  const estDays = medicine.remaining_quantity !== null && medicine.frequency
    ? estimateDaysUntilRefillFromFrequency(medicine.remaining_quantity, medicine.frequency)
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={enter(0)} style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View
              style={{
                width: 49,
                height: 49,
                borderRadius: 25,
                backgroundColor: colors.accent.subtle,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                marginTop: 4,
              }}
            >
              <MedicineFormIcon form={medicine.form} size={26} color={colors.accent.primary} contrastColor={colors.accent.primary + '55'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
                {medicine.name ?? 'Unknown medicine'}
              </Text>
              {(medicine.strength || medicine.form) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
                  {!!medicine.strength && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: (strengthColor(medicine.strength) ?? colors.text.secondary) + '22',
                      }}
                    >
                      <Text style={[typography.label.sm, { color: strengthColor(medicine.strength) ?? colors.text.secondary, fontFamily: typography.families.bold }]}>
                        {medicine.strength}
                      </Text>
                    </View>
                  )}
                  {!!medicine.form && (
                    <Text style={[typography.body.base, { color: colors.text.secondary, textTransform: 'capitalize' }]}>
                      {medicine.form}
                    </Text>
                  )}
                </View>
              )}
            </View>
            <Badge
              label={medicine.verification_status}
              variant={medicine.verification_status === 'verified' ? 'verified' : 'pending'}
            />
          </View>
        </Animated.View>

        {/* Details */}
        <Animated.View entering={enter(1)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              {t.medicine.details}
            </Text>
            <Button
              title={t.medicine.editTitle}
              variant="ghost"
              size="sm"
              icon={<MaterialCommunityIcons name="pencil-outline" size={16} color={colors.accent.primary} />}
              onPress={openEdit}
            />
          </View>
          <Card>
            {fields.map((field, i) => (
              <View key={i} style={[styles.fieldRow, i > 0 && { marginTop: spacing.md }]}>
                <Text style={[typography.label.base, { color: colors.text.secondary }]}>
                  {field.label}
                </Text>
                <Text style={[typography.body.base, { color: colors.text.primary, textAlign: 'right', flex: 1 }]}>
                  {field.value}
                </Text>
              </View>
            ))}
          </Card>
        </Animated.View>

        {/* Schedule */}
        {schedules.length > 0 && (
          <Animated.View entering={enter(2)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.medicine.schedule}
            </Text>
            <Card>
              {schedules.map((sch) => {
                const range = t.dose.timeRange
                  .replace('{start}', nf(formatTime12h(sch.time)))
                  .replace('{end}', nf(formatTime12h(addMinutesToTime(sch.time, sch.window_minutes ?? 120))));
                return (
                <View key={sch.id} style={styles.scheduleRow}>
                  <MaterialCommunityIcons
                    name={sch.is_active ? 'clock-outline' : 'clock-remove-outline'}
                    size={20}
                    color={sch.is_active ? colors.accent.primary : colors.text.disabled}
                  />
                  <Text style={[typography.body.base, {
                    color: sch.is_active ? colors.text.primary : colors.text.disabled,
                    marginLeft: 8,
                  }]}>
                    {range} — {sch.frequency}
                    {sch.meal_instruction && sch.meal_instruction !== 'none' && ` (${sch.meal_instruction} meals)`}
                  </Text>
                </View>
                );
              })}
            </Card>
          </Animated.View>
        )}

        {/* Side Effects */}
        {medicine.side_effects.length > 0 && (
          <Animated.View entering={enter(3)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.medicine.sideEffects}
            </Text>
            <Card>
              {medicine.side_effects.map((effect, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.bullet, { backgroundColor: colors.text.disabled }]} />
                  <Text style={[typography.body.sm, { color: colors.text.primary, flex: 1 }]}>
                    {effect}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Warnings */}
        {medicine.warnings.length > 0 && (
          <Animated.View entering={enter(4)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.warning }}>
              {medicine.warnings.map((warning, i) => (
                <View key={i} style={styles.warningRow}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} />
                  <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {warning}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Inventory */}
        {medicine.initial_quantity != null && (
          <Animated.View entering={enter(5)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.medicine.inventory}
            </Text>
            <Card>
              <View style={styles.fieldRow}>
                <Text style={[typography.label.base, { color: colors.text.secondary }]}>{t.medicine.remaining}</Text>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>
                  {nf(medicine.remaining_quantity ?? '?')} / {nf(medicine.initial_quantity)}
                </Text>
              </View>
              {estDays != null && (
                <View style={[styles.fieldRow, { marginTop: spacing.sm }]}>
                  <Text style={[typography.label.base, { color: colors.text.secondary }]}>{t.medicine.estDaysRemaining}</Text>
                  <Text style={[typography.body.base, {
                    color: (estDays ?? Infinity) <= 7 ? colors.warning : colors.text.primary,
                  }]}>
                    {t.medicine.daysRemaining.replace('{n}', nf(estDays ?? '?'))}
                  </Text>
                </View>
              )}
            </Card>
          </Animated.View>
        )}

        {/* Refill ordering — coming soon (audit Feature 10). Shown even
            without inventory so the teaser is always reachable. */}
        <Animated.View entering={enter(6)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Card>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[typography.label.base, { color: colors.text.primary }]}>
                  {t.medicine.orderRefill}
                </Text>
                <Text style={[typography.body.xs, { color: colors.text.secondary, marginTop: 2 }]}>
                  {t.medicine.orderRefillDesc}
                </Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                  <Badge label={t.medicine.refillComingSoon} variant="pending" />
                </View>
              </View>
              <Button
                title={t.medicine.orderRefill}
                variant="secondary"
                size="sm"
                icon={<MaterialCommunityIcons name="cart-outline" size={16} color={colors.accent.primary} />}
                onPress={() => setRefillSoonVisible(true)}
              />
            </View>
          </Card>
        </Animated.View>

        {/* Food Interactions */}
        {medicine.food_interactions.length > 0 && (
          <Animated.View entering={enter(7)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.medicine.foodInteractions}
            </Text>
            <Card>
              {medicine.food_interactions.map((item, i) => (
                <View key={i} style={styles.listItem}>
                  <MaterialCommunityIcons name="food-apple-outline" size={16} color={colors.warning} />
                  <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View entering={enter(8)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Button
            title={t.medicine.askAI}
            variant="secondary"
            icon={<MaterialCommunityIcons name="message-outline" size={20} color={colors.accent.primary} />}
            onPress={() => router.push({ pathname: '/chat', params: { medicineId: medicine.id, medicineName: medicine.name ?? '' } })}
          />
          {schedules.length > 0 && (
            <Card style={{ marginTop: spacing.sm }}>
              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[typography.label.base, { color: colors.text.primary }]}>
                    {isPaused ? t.medicine.resume : t.medicine.pause}
                  </Text>
                  <Text style={[typography.body.xs, { color: colors.text.secondary, marginTop: 2 }]}>
                    {t.medicine.pauseDesc}
                  </Text>
                </View>
                <Button
                  title={isPaused ? t.medicine.resume : t.medicine.pause}
                  variant={isPaused ? 'primary' : 'ghost'}
                  size="sm"
                  icon={
                    <MaterialCommunityIcons
                      name={isPaused ? 'play-outline' : 'pause'}
                      size={16}
                      color={isPaused ? colors.text.inverse : colors.text.secondary}
                    />
                  }
                  onPress={handleTogglePause}
                />
              </View>
            </Card>
          )}
          <Button
            title={t.medicine.completeTreatment}
            variant="ghost"
            onPress={() => {
              Alert.alert(
                t.medicine.completeTreatment,
                t.medicine.completeMsg,
                [
                  { text: t.common.cancel, style: 'cancel' },
                  {
                    text: t.common.confirm,
                    onPress: async () => {
                      await deactivateSchedulesByMedicine(medicine.id);
                      await syncDoseNotifications();
                      router.back();
                    },
                  },
                ]
              );
            }}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title={t.common.delete}
            variant="ghost"
            icon={<MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} />}
            onPress={handleDelete}
            style={{ marginTop: spacing.sm }}
          />
        </Animated.View>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editVisible} onClose={() => setEditVisible(false)} title={t.medicine.editTitle}>
        <View style={{ gap: spacing.sm }}>
          <Input
            label={t.medicine.nameLabel}
            value={editName}
            onChangeText={setEditName}
          />
          <Input
            label={t.medicine.dosageLabel}
            value={editDosage}
            onChangeText={setEditDosage}
          />
          <Input
            label={t.medicine.frequencyLabel}
            value={editFrequency}
            onChangeText={setEditFrequency}
          />
          <Input
            label={t.medicine.durationLabel}
            value={editDuration}
            onChangeText={setEditDuration}
          />
          <Input
            label={t.medicine.remainingLabel}
            value={editRemaining}
            onChangeText={setEditRemaining}
            keyboardType="numeric"
          />
          <Input
            label={t.medicine.initialLabel}
            value={editInitial}
            onChangeText={setEditInitial}
            keyboardType="numeric"
          />
          {schedules.map((sch) => {
            const val = editTimes[sch.id] ?? sch.time;
            const invalid = val.trim() !== '' && !isValidTimeFormat(val.trim());
            return (
              <Input
                key={sch.id}
                label={`${t.medicine.timeLabel} (${formatTime12h(sch.time)})`}
                value={val}
                onChangeText={(text) => setEditTimes((prev) => ({ ...prev, [sch.id]: text }))}
                placeholder="HH:MM"
                error={invalid ? t.schedule.timeInvalid : undefined}
              />
            );
          })}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              title={t.common.cancel}
              variant="ghost"
              onPress={() => setEditVisible(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={t.common.save}
              variant="primary"
              loading={saving}
              disabled={!editValid}
              onPress={handleSaveEdit}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Modal>

      {/* Refill ordering — coming soon sheet (audit Feature 10) */}
      <Modal visible={refillSoonVisible} onClose={() => setRefillSoonVisible(false)} title={t.medicine.refillComingSoonTitle}>
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.accent.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            <MaterialCommunityIcons name="cart-arrow-down" size={28} color={colors.accent.primary} />
          </View>
          <Text style={[typography.body.base, { color: colors.text.secondary, textAlign: 'center' }]}>
            {t.medicine.refillComingSoonDesc}
          </Text>
          <Button title={t.common.ok} variant="primary" onPress={() => setRefillSoonVisible(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 8 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
});
