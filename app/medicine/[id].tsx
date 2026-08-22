import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { getMedicine, deleteMedicine } from '../../src/db/repositories/medicine';
import { getSchedulesByMedicine, deactivateSchedulesByMedicine } from '../../src/db/repositories/schedule';
import { cancelAllNotifications } from '../../src/utils/notifications';
import { estimateDaysUntilRefillFromFrequency } from '../../src/utils/inventory';
import { formatTime12h } from '../../src/utils/date';
import type { Medicine, Schedule } from '../../src/types/models';

export default function MedicineDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    async function load() {
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
      }
    }
    load();
  }, [id]);

  if (!medicine) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <Text style={[typography.body.base, { color: colors.text.secondary }]}>
            Loading medicine details...
          </Text>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
                {medicine.name ?? 'Unknown medicine'}
              </Text>
              {medicine.strength && (
                <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: 4 }]}>
                  {medicine.strength} {medicine.form ? `(${medicine.form})` : ''}
                </Text>
              )}
            </View>
            <Badge
              label={medicine.verification_status}
              variant={medicine.verification_status === 'verified' ? 'verified' : 'pending'}
            />
          </View>
        </View>

        {/* Details */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
            Details
          </Text>
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
        </View>

        {/* Schedule */}
        {schedules.length > 0 && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              Schedule
            </Text>
            <Card>
              {schedules.map((sch) => (
                <View key={sch.id} style={styles.scheduleRow}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={colors.accent.primary} />
                  <Text style={[typography.body.base, { color: colors.text.primary, marginLeft: 8 }]}>
                    {formatTime12h(sch.time)} — {sch.frequency}
                    {sch.meal_instruction && sch.meal_instruction !== 'none' && ` (${sch.meal_instruction} meals)`}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Side Effects */}
        {medicine.side_effects.length > 0 && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              Common side effects
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
          </View>
        )}

        {/* Warnings */}
        {medicine.warnings.length > 0 && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
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
          </View>
        )}

        {/* Inventory */}
        {medicine.initial_quantity != null && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              Inventory
            </Text>
            <Card>
              <View style={styles.fieldRow}>
                <Text style={[typography.label.base, { color: colors.text.secondary }]}>Remaining</Text>
                <Text style={[typography.body.base, { color: colors.text.primary }]}>
                  {medicine.remaining_quantity ?? '?'} of {medicine.initial_quantity}
                </Text>
              </View>
              {medicine.remaining_quantity !== null && medicine.frequency && (
                <View style={[styles.fieldRow, { marginTop: spacing.sm }]}>
                  <Text style={[typography.label.base, { color: colors.text.secondary }]}>Est. days remaining</Text>
                  <Text style={[typography.body.base, {
                    color: (estimateDaysUntilRefillFromFrequency(medicine.remaining_quantity, medicine.frequency) ?? Infinity) <= 7
                      ? colors.warning : colors.text.primary,
                  }]}>
                    ~{estimateDaysUntilRefillFromFrequency(medicine.remaining_quantity, medicine.frequency) ?? '?'} days
                  </Text>
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Food Interactions */}
        {medicine.food_interactions.length > 0 && (
          <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
            <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              Food interactions
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
          </View>
        )}

        {/* Actions */}
        <View style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Button
            title="Ask AI about this medicine"
            variant="secondary"
            icon={<MaterialCommunityIcons name="message-outline" size={20} color={colors.accent.primary} />}
            onPress={() => router.push({ pathname: '/chat', params: { medicineId: medicine.id, medicineName: medicine.name ?? '' } })}
          />
          <Button
            title="Complete treatment"
            variant="ghost"
            onPress={async () => {
              Alert.alert(
                'Complete treatment',
                'Mark this medicine as completed? Active schedules will be deactivated.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Complete',
                    onPress: async () => {
                      await deactivateSchedulesByMedicine(medicine.id);
                      router.back();
                    },
                  },
                ]
              );
            }}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  section: { marginTop: 24 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 8 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
});
