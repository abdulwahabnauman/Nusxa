import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { PrescriptionJSON } from '../src/ai/types';
import { DEFAULT_SCHEDULE_TIMES } from '../src/constants/medical';
import { createPrescription, updatePrescription } from '../src/db/repositories/prescription';
import { createMedicine } from '../src/db/repositories/medicine';
import { createSchedule } from '../src/db/repositories/schedule';
import { scheduleDoseNotification } from '../src/utils/notifications';
import { getTodayISO } from '../src/utils/date';

interface ScheduleItem {
  medicineIndex: number;
  medicineName: string;
  dosage: string;
  frequency: string;
  mealInstruction: string;
  times: string[];
}

export default function ScheduleScreen() {
  const { colors, typography, spacing } = useTheme();
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

  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    if (!prescription) return [];
    return prescription.medicines.map((med, i) => {
      const freq = (med.frequency ?? 'once daily').toLowerCase();
      const dailyCount = freq.includes('twice') || freq.includes('bid') ? 2
        : freq.includes('three') || freq.includes('tid') || freq.includes('tds') ? 3
        : freq.includes('four') || freq.includes('qid') || freq.includes('qds') ? 4
        : 1;
      const times = DEFAULT_SCHEDULE_TIMES[String(dailyCount)] ?? ['08:00'];
      return {
        medicineIndex: i,
        medicineName: med.name ?? `Medicine ${i + 1}`,
        dosage: med.dosage ?? '',
        frequency: med.frequency ?? 'Once daily',
        mealInstruction: med.meal_instruction ?? 'none',
        times: [...times],
      };
    });
  });

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

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const handleConfirm = async () => {
    if (!prescription) return;
    setConfirming(true);
    try {
      const today = getTodayISO();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // 1. Create the prescription record (already verified from review screen)
      const prescriptionId = generateId();
      await createPrescription({
        id: prescriptionId,
        doctor_name: prescription.prescription?.doctor_name ?? null,
        hospital: prescription.prescription?.hospital ?? null,
        date: prescription.prescription?.date ?? null,
        follow_up_date: prescription.prescription?.follow_up_date ?? null,
        source_image_uri: imageUri ?? null,
        verification_status: 'verified',
        overall_confidence: prescription.overall_confidence ?? 0,
        patient_notes: null,
        treatment_status: 'active',
      });

      // 2. For each medicine, create the medicine record and its schedules
      for (let i = 0; i < prescription.medicines.length; i++) {
        const med = prescription.medicines[i]!;
        const schedule = schedules[i];
        if (!schedule) continue;

        const medicineId = generateId();
        await createMedicine({
          id: medicineId,
          prescription_id: prescriptionId,
          name: med.name ?? null,
          generic_name: med.generic_name ?? null,
          brand_name: med.brand_name ?? null,
          strength: med.strength ?? null,
          form: (med.form as any) ?? null,
          dosage: med.dosage ?? null,
          frequency: med.frequency ?? null,
          meal_instruction: (med.meal_instruction as any) ?? null,
          duration: med.duration ?? null,
          purpose: med.purpose ?? null,
          side_effects: med.side_effects ?? [],
          food_interactions: med.food_interactions ?? [],
          storage: med.storage ?? null,
          confidence: med.confidence ?? 0,
          warnings: med.warnings ?? [],
          verification_status: 'verified',
          initial_quantity: med.initial_quantity ?? null,
          remaining_quantity: med.remaining_quantity ?? med.initial_quantity ?? null,
        });

        // 3. Create schedule entries and schedule notifications for each time
        for (const time of schedule.times) {
          const scheduleId = generateId();
          const notificationId = await scheduleDoseNotification({
            id: scheduleId,
            medicineName: schedule.medicineName,
            dosage: schedule.dosage,
            mealInstruction: schedule.mealInstruction,
            time,
            date: new Date(),
          });

          await createSchedule({
            id: scheduleId,
            medicine_id: medicineId,
            time,
            timezone,
            frequency: schedule.frequency,
            meal_instruction: (schedule.mealInstruction as any) ?? null,
            start_date: today,
            end_date: null,
            is_active: true,
            notification_id: notificationId,
          });
        }
      }

      Alert.alert(
        'Schedule confirmed',
        'Your medication schedule has been set up. You will receive reminders at the scheduled times.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err) {
      console.error('Schedule confirmation error:', err);
      Alert.alert('Error', 'Failed to save schedule. Please try again.');
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
                <MaterialCommunityIcons name="pill" size={20} color={colors.accent.primary} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
                    {schedule.medicineName}
                  </Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary }]}>
                    {schedule.dosage} — {schedule.frequency}
                    {schedule.mealInstruction !== 'none' && ` — ${schedule.mealInstruction} meals`}
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
  actions: { marginTop: 32, gap: 12, alignItems: 'center' },
});
