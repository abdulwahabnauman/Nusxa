import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { MedicineCard } from '../../src/components/medicine/MedicineCard';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { getPrescriptionWithMedicines } from '../../src/db/repositories/prescription';
import { getSchedulesByMedicine } from '../../src/db/repositories/schedule';
import { estimateDaysUntilRefillFromFrequency } from '../../src/utils/inventory';
import { formatDateLocalized } from '../../src/utils/date';
import type { PrescriptionWithMedicines } from '../../src/types/models';

/**
 * Prescription detail — where a History card lands. Shows the visit metadata
 * (doctor, hospital, dates) and every medicine on the prescription, each
 * opening the existing medicine detail screen.
 */
export default function PrescriptionDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t, language } = useI18n();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = language === 'ur' ? 'ur-PK' : 'en-US';

  const [prescription, setPrescription] = useState<PrescriptionWithMedicines | null>(null);
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const rx = await getPrescriptionWithMedicines(id);
      setPrescription(rx);
      if (rx) {
        // One prescription carries only a handful of medicines, so a small
        // parallel fan-out here is cheaper than a bespoke batch query.
        const entries = await Promise.all(
          rx.medicines.map(async (med) => {
            try {
              const sch = await getSchedulesByMedicine(med.id);
              return [med.id, sch.filter((s) => s.is_active).map((s) => s.time).sort()] as const;
            } catch {
              return [med.id, []] as const;
            }
          }),
        );
        setScheduleTimes(Object.fromEntries(entries));
      }
    } catch (err) {
      console.error('Failed to load prescription:', err);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Staggered entrance, matching the medicine detail screen
  const enter = (index: number) =>
    reducedMotion ? undefined : FadeInUp.duration(280).delay(index * 55).springify();

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={{ padding: spacing.base, paddingTop: spacing.md, gap: spacing.md }}>
          <View style={{ height: 28, borderRadius: 6, backgroundColor: colors.background.subtle, width: '60%' }} />
          <View style={{ height: 14, borderRadius: 6, backgroundColor: colors.background.subtle, width: '40%' }} />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  // Tombstoned or unknown ids land here instead of an endless skeleton
  if (!prescription || prescription.deleted_at) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <EmptyState
          icon="file-document-remove-outline"
          title={t.history.notFound}
          description={t.history.notFoundDesc}
        />
      </SafeAreaView>
    );
  }

  const displayDate = prescription.date
    ? formatDateLocalized(prescription.date, locale)
    : t.history.noDate;
  const followUp = prescription.follow_up_date
    ? formatDateLocalized(prescription.follow_up_date, locale)
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={enter(0)} style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <View style={styles.headerRow}>
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
              <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
                {prescription.doctor_name ?? t.history.unknownDoctor}
              </Text>
              <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                {displayDate}
                {prescription.hospital ? ` · ${prescription.hospital}` : ''}
              </Text>
            </View>
            <Badge
              label={prescription.treatment_status}
              variant={prescription.treatment_status === 'active' ? 'verified' : 'info'}
            />
          </View>
          {followUp && (
            <View style={styles.followUpRow}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={16} color={colors.text.secondary} />
              <Text style={[typography.body.sm, { color: colors.text.secondary, marginLeft: 6 }]}>
                {t.history.followUp.replace('{date}', followUp)}
              </Text>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={enter(1)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
            {t.history.medicinesTitle}
          </Text>
          {prescription.medicines.length === 0 ? (
            <EmptyState
              icon="pill-off-outline"
              title={t.history.noMedicinesOnRx}
            />
          ) : (
            <View style={{ gap: spacing.base }}>
              {prescription.medicines.map((med) => (
                <MedicineCard
                  key={med.id}
                  name={med.name ?? 'Unknown'}
                  dosage={med.dosage}
                  frequency={med.frequency}
                  form={med.form}
                  strength={med.strength}
                  verificationStatus={med.verification_status}
                  scheduleTimes={scheduleTimes[med.id] ?? []}
                  daysUntilRefill={
                    med.remaining_quantity !== null && med.frequency
                      ? estimateDaysUntilRefillFromFrequency(med.remaining_quantity, med.frequency)
                      : null
                  }
                  onPress={() => router.push(`/medicine/${med.id}`)}
                />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  header: { marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  followUpRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  section: { marginTop: 24 },
});
