import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { showToast } from '../../src/components/ui/GlobalToast';
import { RepeatSelector } from '../../src/components/schedule/RepeatSelector';
import { MedicineFormIcon } from '../../src/components/ui/PillIcon';
import { addMedicineManually } from '../../src/utils/savePrescription';
import { repeatFrequencyLabel } from '../../src/utils/repeat';
import { isValidTimeFormat } from '../../src/utils/validation';
import { syncDoseNotifications } from '../../src/utils/notifications';
import { useInvalidateData } from '../../src/hooks/queries';
import type { Medicine, MedicineForm } from '../../src/types/models';

const FORM_OPTIONS: NonNullable<MedicineForm>[] = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'drops',
  'cream',
  'inhaler',
  'patch',
  'other',
];

const WINDOW_OPTIONS = [60, 90, 120, 180];

const MEAL_OPTIONS: { value: NonNullable<Medicine['meal_instruction']>; key: 'mealNone' | 'mealBefore' | 'mealWith' | 'mealAfter' }[] = [
  { value: 'none', key: 'mealNone' },
  { value: 'before', key: 'mealBefore' },
  { value: 'with', key: 'mealWith' },
  { value: 'after', key: 'mealAfter' },
];

export default function NewMedicineScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const invalidateData = useInvalidateData();

  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState<NonNullable<MedicineForm>>('tablet');
  const [dosage, setDosage] = useState('');
  const [mealInstruction, setMealInstruction] =
    useState<NonNullable<Medicine['meal_instruction']>>('none');
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState('');
  const [quantity, setQuantity] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [windowMinutes, setWindowMinutes] = useState(120);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const invalidTimes = times.filter((time) => !isValidTimeFormat(time.trim()));
  const quantityInvalid = quantity.trim() !== '' && !/^\d+$/.test(quantity.trim());
  const nameInvalid = name.trim().length === 0;
  const timesInvalid = times.length === 0 || invalidTimes.length > 0;
  const canSave = !nameInvalid && !timesInvalid && !quantityInvalid;

  const repeatLabel = useMemo(
    () => repeatFrequencyLabel(daysOfWeek, intervalDays, times.length, language),
    [daysOfWeek, intervalDays, times.length, language],
  );

  const updateTime = (index: number, value: string) => {
    setTimes((prev) => prev.map((time, i) => (i === index ? value : time)));
  };

  const removeTime = (index: number) => {
    setTimes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const addTime = () => {
    setTimes((prev) => [...prev, prev.length >= 3 ? '20:00' : '13:00']);
  };

  const handleSave = useCallback(async () => {
    setSubmitted(true);
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const parsedQuantity = quantity.trim() === '' ? null : Number(quantity.trim());
      const medicineId = await addMedicineManually({
        name,
        strength,
        form,
        dosage,
        mealInstruction,
        purpose,
        duration,
        initialQuantity: parsedQuantity,
        remainingQuantity: parsedQuantity,
        times: times.map((time) => time.trim()),
        windowMinutes,
        daysOfWeek,
        intervalDays,
        language,
      });
      await syncDoseNotifications();
      invalidateData();
      showToast(t.manual.savedToast, 'success');
      router.replace(`/medicine/${medicineId}`);
    } catch (error) {
      console.error('Failed to add medicine:', error);
      showToast(t.manual.saveFailed, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    saving,
    quantity,
    name,
    strength,
    form,
    dosage,
    mealInstruction,
    purpose,
    duration,
    times,
    windowMinutes,
    daysOfWeek,
    intervalDays,
    language,
    t,
    invalidateData,
    router,
  ]);

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    key?: string,
  ) => (
    <TouchableOpacity
      key={key ?? label}
      style={[
        styles.chip,
        {
          borderRadius: borderRadius.md,
          backgroundColor: selected ? colors.accent.primary : colors.background.subtle,
          borderColor: selected ? colors.accent.primary : colors.border.default,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          typography.label.sm,
          { color: selected ? '#FFFFFF' : colors.text.primary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.inner}>
        <View style={[styles.topBar, { paddingHorizontal: spacing.base }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel={t.common.back}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginStart: spacing.sm }}>
            <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
              {t.manual.title}
            </Text>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
              {t.manual.subtitle}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Card>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.manual.basics}
            </Text>

            <View style={{ gap: spacing.sm }}>
              <Input
                label={t.manual.nameLabel}
                value={name}
                onChangeText={setName}
                placeholder={t.manual.namePlaceholder}
                error={submitted && nameInvalid ? t.manual.nameRequired : undefined}
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Input
                  label={t.manual.strengthLabel}
                  value={strength}
                  onChangeText={setStrength}
                  placeholder={t.manual.strengthPlaceholder}
                  containerStyle={{ flex: 1 }}
                />
                <Input
                  label={t.manual.dosageLabel}
                  value={dosage}
                  onChangeText={setDosage}
                  placeholder={t.manual.dosagePlaceholder}
                  containerStyle={{ flex: 1 }}
                />
              </View>

              <View>
                <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.xs }]}>
                  {t.manual.formLabel}
                </Text>
                <View style={styles.wrapRow}>
                  {FORM_OPTIONS.map((option) =>
                    chip(t.forms[option], form === option, () => setForm(option), option),
                  )}
                </View>
              </View>

              <View>
                <Text style={[typography.label.base, { color: colors.text.secondary, marginBottom: spacing.xs }]}>
                  {t.manual.mealLabel}
                </Text>
                <View style={styles.wrapRow}>
                  {MEAL_OPTIONS.map((option) =>
                    chip(
                      t.manual[option.key],
                      mealInstruction === option.value,
                      () => setMealInstruction(option.value),
                      option.value,
                    ),
                  )}
                </View>
              </View>

              <Input
                label={t.manual.purposeLabel}
                value={purpose}
                onChangeText={setPurpose}
                placeholder={t.manual.purposePlaceholder}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Input
                  label={t.manual.durationLabel}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder={t.manual.durationPlaceholder}
                  containerStyle={{ flex: 1 }}
                />
                <Input
                  label={t.manual.quantityLabel}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder={t.manual.quantityPlaceholder}
                  keyboardType="numeric"
                  containerStyle={{ flex: 1 }}
                  error={quantityInvalid ? t.manual.quantityPlaceholder : undefined}
                />
              </View>
            </View>
          </Card>

          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: colors.accent.subtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginEnd: spacing.sm,
                }}
              >
                <MedicineFormIcon
                  form={form}
                  size={18}
                  color={colors.accent.primary}
                  contrastColor={colors.accent.primary + '55'}
                />
              </View>
              <Text style={[typography.heading.h4, { color: colors.text.primary, flex: 1 }]}>
                {t.manual.scheduleTitle}
              </Text>
            </View>

            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {times.map((time, index) => {
                const invalid = submitted && !isValidTimeFormat(time.trim());
                return (
                  <View key={index} style={styles.timeRow}>
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={18}
                      color={colors.text.secondary}
                    />
                    <Input
                      value={time}
                      onChangeText={(value) => updateTime(index, value)}
                      placeholder="HH:MM"
                      keyboardType="numbers-and-punctuation"
                      containerStyle={{ flex: 1, marginStart: spacing.sm }}
                      error={invalid ? t.schedule.timeInvalid : undefined}
                      accessibilityLabel={`${t.medicine.timeLabel} ${index + 1}`}
                    />
                    {times.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeTime(index)}
                        style={styles.removeButton}
                        accessibilityLabel={t.manual.removeTime}
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.text.disabled} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              {submitted && times.length === 0 && (
                <Text style={[typography.body.xs, { color: colors.error }]}>
                  {t.manual.timesRequired}
                </Text>
              )}
              <TouchableOpacity
                onPress={addTime}
                style={[styles.addTime, { borderColor: colors.border.default }]}
                accessibilityRole="button"
                accessibilityLabel={t.manual.addTime}
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.accent.primary} />
                <Text style={[typography.label.sm, { color: colors.accent.primary, marginStart: 4 }]}>
                  {t.manual.addTime}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[typography.label.base, { color: colors.text.secondary, marginTop: spacing.md }]}>
              {t.schedule.reminderWindow}
            </Text>
            <View style={styles.wrapRow}>
              {WINDOW_OPTIONS.map((minutes) =>
                chip(
                  t.schedule.windowOption.replace('{n}', String(minutes)),
                  windowMinutes === minutes,
                  () => setWindowMinutes(minutes),
                  String(minutes),
                ),
              )}
            </View>

            <RepeatSelector
              daysOfWeek={daysOfWeek}
              intervalDays={intervalDays}
              onChange={(value) => {
                setDaysOfWeek(value.daysOfWeek);
                setIntervalDays(value.intervalDays);
              }}
            />

            <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: spacing.sm }]}>
              {t.manual.autoFrequency.replace('{label}', repeatLabel)}
            </Text>
          </Card>

          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              title={t.manual.save}
              onPress={handleSave}
              loading={saving}
              disabled={!canSave}
              size="lg"
              icon={<MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />}
            />
            <Button title={t.common.cancel} variant="ghost" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: { padding: 4 },
  scrollContent: { paddingBottom: 40 },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  removeButton: {
    padding: 8,
    marginStart: 4,
  },
  addTime: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
