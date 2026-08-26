import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PillIcon } from '../../src/components/ui/PillIcon';
import { MedicineCard } from '../../src/components/medicine/MedicineCard';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { getActiveMedicines } from '../../src/db/repositories/medicine';
import { getSchedulesByMedicine } from '../../src/db/repositories/schedule';
import { estimateDaysUntilRefillFromFrequency } from '../../src/utils/inventory';
import type { Medicine } from '../../src/types/models';

interface MedicineWithInfo extends Medicine {
  scheduleTimes: string[];
  daysUntilRefill: number | null;
}

export default function MedicinesScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [medicines, setMedicines] = useState<MedicineWithInfo[]>([]);

  const loadMedicines = useCallback(async () => {
    try {
      const active = await getActiveMedicines();
      const enriched: MedicineWithInfo[] = [];
      for (const med of active) {
        const schedules = await getSchedulesByMedicine(med.id);
        const times = schedules.filter((s) => s.is_active).map((s) => s.time);
        const daysUntilRefill = med.remaining_quantity !== null && med.frequency
          ? estimateDaysUntilRefillFromFrequency(med.remaining_quantity, med.frequency)
          : null;
        enriched.push({ ...med, scheduleTimes: times, daysUntilRefill });
      }
      setMedicines(enriched);
    } catch {
      // Offline-safe
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMedicines();
    setRefreshing(false);
  }, [loadMedicines]);

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
        <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            Medicines
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            Your active medications
          </Text>
        </View>

        <View style={[styles.content, { paddingHorizontal: spacing.base }]}>
          {loading ? (
            <View style={{ gap: 12 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : medicines.length === 0 ? (
            <EmptyState
              icon={<PillIcon size={56} color={colors.text.disabled} contrastColor={colors.background.primary} />}
              title="No active medicines"
              description="When you verify a prescription, your medicines will appear here with their schedules."
              actionLabel="Scan prescription"
              onAction={() => router.push('/scan')}
            />
          ) : (
            medicines.map((med) => (
              <TouchableOpacity
                key={med.id}
                onPress={() => router.push(`/medicine/${med.id}`)}
                accessibilityLabel={`View details for ${med.name ?? 'medicine'}`}
                style={{ marginBottom: 12 }}
              >
                <MedicineCard
                  name={med.name ?? 'Unknown'}
                  dosage={med.dosage}
                  frequency={med.frequency}
                  form={med.form}
                  scheduleTimes={med.scheduleTimes}
                  verificationStatus={med.verification_status}
                  daysUntilRefill={med.daysUntilRefill}
                />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
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
    marginTop: 16,
  },
  content: {
    flex: 1,
    marginTop: 16,
  },
});
