import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MedicineFormIcon } from '../src/components/ui/PillIcon';
import { useTheme } from '../src/theme/provider';
import { useI18n } from '../src/i18n';
import { useSettingsStore } from '../src/stores/settings-store';
import { formatDigits } from '../src/utils/numerals';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { showToast } from '../src/components/ui/GlobalToast';
import { Input } from '../src/components/ui/Input';
import { PrescriptionJSON } from '../src/ai/types';
import {
  buildDefaultSchedules,
  savePrescription,
  ScheduleDraft,
} from '../src/utils/savePrescription';

const WINDOW_OPTIONS = [60, 90, 120, 180];

export default function ScheduleScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const router = useRouter();
  const { prescriptionData, imageUri } = useLocalSearchParams<{
    prescriptionData: string;
    imageUri: string;
  }>();

  const prescription = useMemo(() => {
    try {
      return JSON.parse(prescriptionData ?? '{}') as PrescriptionJSON;
    } catch {
      return null;
    }
  }, [prescriptionData]);

  const [schedules, setSchedules] = useState<ScheduleDraft[]>(() =>
    prescription ? buildDefaultSchedules(prescription) : []
  );

  const [confirming, setConfirming] = useState(false);

  const updateTime = (medIdx: number, timeIdx: number, value: string) => {
    setSchedules((prev) => {
      const updated = [...prev];
      const schedule = { ...updated[medIdx]! };
      schedule.times = [...schedule.times];
      schedule.times[timeIdx] = value;
      updated[medIdx] = schedule;
      return updated;
    });
  };

  const updateWindow = (medIdx: number, value: number) => {
    setSchedules((prev) => {
      const updated = [...prev];
      const schedule = { ...updated[medIdx]! };
      schedule.windowMinutes = value;
      updated[medIdx] = schedule;
      return updated;
    });
  };

  const handleConfirm = async () => {
    if (!prescription) return;
    setConfirming(true);
    try {
      const outcome = await savePrescription(prescription, schedules, imageUri);

      // Toast lives in the root layout, so it stays visible after navigating
      showToast(
        outcome.updated > 0
          ? t.toasts.scheduleConfirmedUpdated.replace('{updated}', String(outcome.updated))
          : t.toasts.scheduleConfirmedDefault,
        'success',
        6000,
      );
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Schedule confirmation error:', err);
      showToast(t.toasts.saveScheduleFailed, 'error');
    } finally {
      setConfirming(false);
    }
  };

  if (!prescription) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <Text style={[typography.body.base, { color: colors.error }]}>
            No prescription data available.
          </Text>
          <Button title="Go back" onPress={() => router.back()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            Confirm your schedule
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            Review the suggested times. You can adjust them before confirming.
          </Text>
        </View>

        {/* Important notice */}
        <View style={[styles.notice, { paddingHorizontal: spacing.base }]}>
          <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.accent.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                Reminders will activate after you confirm this schedule. If timing changes could affect treatment safety, please confirm with your doctor.
              </Text>
            </View>
          </Card>
        </View>

        {/* Schedules */}
        {schedules.map((schedule, medIdx) => (
          <View key={medIdx} style={[styles.medicineSchedule, { paddingHorizontal: spacing.base }]}>
            <Card>
              <View style={styles.medHeader}>
                <MedicineFormIcon
                  form={prescription.medicines[medIdx]?.form}
                  size={20}
                  color={colors.accent.primary}
                  contrastColor={colors.background.primary}
                />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
                    {schedule.medicineName}
                  </Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary }]}>
                    {schedule.dosage}, {schedule.frequency}
                    {schedule.mealInstruction !== 'none' && `, ${schedule.mealInstruction} meals`}
                  </Text>
                </View>
              </View>

              <Text style={[typography.label.base, { color: colors.text.secondary, marginTop: spacing.md }]}>
                Reminder times
              </Text>

              {schedule.times.map((time, timeIdx) => (
                <View key={timeIdx} style={styles.timeRow}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={18}
                    color={colors.text.secondary}
                  />
                  <Input
                    value={time}
                    onChangeText={(value) => updateTime(medIdx, timeIdx, value)}
                    placeholder="HH:MM"
                    containerStyle={{ flex: 1, marginLeft: 8 }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              ))}

              <Text style={[typography.label.base, { color: colors.text.secondary, marginTop: spacing.md }]}>
                {t.schedule.reminderWindow}
              </Text>
              <View style={styles.windowRow}>
                {WINDOW_OPTIONS.map((mins) => {
                  const selected = schedule.windowMinutes === mins;
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={[
                        styles.windowChip,
                        {
                          backgroundColor: selected ? colors.accent.primary : colors.background.subtle,
                          borderColor: selected ? colors.accent.primary : colors.border.default,
                        },
                      ]}
                      onPress={() => updateWindow(medIdx, mins)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          typography.label.sm,
                          { color: selected ? '#FFFFFF' : colors.text.primary },
                        ]}
                      >
                        {t.schedule.windowOption.replace('{n}', formatDigits(mins, easternNumerals))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          </View>
        ))}

        {/* Actions */}
        <View style={[styles.actions, { paddingHorizontal: spacing.base }]}>
          <Button
            title="Confirm schedule"
            onPress={handleConfirm}
            loading={confirming}
            size="lg"
            icon={<MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />}
          />
          <Button
            title="Go back"
            onPress={() => router.back()}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  notice: { marginTop: 16 },
  medicineSchedule: { marginTop: 16 },
  medHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  windowRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  windowChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actions: { marginTop: 32, gap: 12, alignItems: 'center' },
});
