import React, { useCallback, useState, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { PillIcon } from '../../src/components/ui/PillIcon';
import { MedicineCard } from '../../src/components/medicine/MedicineCard';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { getActiveMedicines } from '../../src/db/repositories/medicine';
import { getSchedulesByMedicine } from '../../src/db/repositories/schedule';
import { estimateDaysUntilRefillFromFrequency } from '../../src/utils/inventory';
import { findInteractionPairs } from '../../src/utils/interactions';
import type { Medicine } from '../../src/types/models';

interface MedicineWithInfo extends Medicine {
  scheduleTimes: string[];
  daysUntilRefill: number | null;
}

/** Memoized row so list scrolls stay cheap even with many medicines */
const MedicineRow = memo(function MedicineRow({
  med,
  onPress,
}: {
  med: MedicineWithInfo;
  onPress: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onPress(med.id)}
      accessibilityLabel={`View details for ${med.name ?? 'medicine'}`}
      style={{ marginBottom: 16 }}
    >
      <MedicineCard
        name={med.name ?? 'Unknown'}
        dosage={med.dosage}
        frequency={med.frequency}
        form={med.form}
        strength={med.strength}
        scheduleTimes={med.scheduleTimes}
        verificationStatus={med.verification_status}
        daysUntilRefill={med.daysUntilRefill}
      />
    </TouchableOpacity>
  );
});

export default function MedicinesScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t } = useI18n();
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

  const openMedicine = useCallback(
    (id: string) => router.push(`/medicine/${id}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: MedicineWithInfo }) => (
      <MedicineRow med={item} onPress={openMedicine} />
    ),
    [openMedicine]
  );

  const lowStockCount = medicines.filter(
    (med) => med.daysUntilRefill !== null && med.daysUntilRefill <= 7,
  ).length;

  const interactions = useMemo(() => findInteractionPairs(medicines), [medicines]);

  const listHeader = (
    <>
      <View style={[styles.header, { paddingHorizontal: spacing.base, marginBottom: 16 }]}>
        <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
          {t.medicinesList.title}
        </Text>
        <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
          {t.medicinesList.subtitle}
        </Text>
      </View>
      {!loading && interactions.length > 0 && (
        <View
          style={{
            backgroundColor: colors.error + '0D',
            borderColor: colors.error + '4D',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginTop: 12,
          }}
          accessibilityLabel={`${interactions.length} possible medicine interactions in your regimen`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="pill-multiple" size={20} color={colors.error} />
            <Text style={[typography.label.base, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
              Possible interactions in your regimen
            </Text>
          </View>
          {interactions.map((hit, i) => {
            const tone = hit.severity === 'high' ? colors.error : colors.warning;
            return (
              <View key={`${hit.first}-${hit.second}-${i}`} style={{ flexDirection: 'row', marginTop: 8 }}>
                <MaterialCommunityIcons
                  name={hit.severity === 'high' ? 'alert-octagon' : 'alert-outline'}
                  size={16}
                  color={tone}
                  style={{ marginTop: 2 }}
                />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={[typography.label.sm, { color: colors.text.primary }]}>
                    {hit.first} + {hit.second}
                  </Text>
                  <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                    {hit.description}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 8 }]}>
            Automated guidance only — always confirm with your doctor or pharmacist.
          </Text>
        </View>
      )}
      {!loading && lowStockCount > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.warning + '1A',
            borderColor: colors.warning + '4D',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginTop: 12,
          }}
          accessibilityLabel={`${lowStockCount} medicines running low on supply`}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.warning} />
          <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
            {lowStockCount === 1
              ? '1 medicine is running low — plan a refill soon.'
              : `${lowStockCount} medicines are running low — plan a refill soon.`}
          </Text>
        </View>
      )}
    </>
  );

  const listEmpty = loading ? (
    <View style={{ gap: 12, marginTop: 12 }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  ) : (
    <EmptyState
      icon={<PillIcon size={56} color={colors.text.disabled} contrastColor={colors.background.primary} />}
      title="No active medicines"
      description="When you verify a prescription, your medicines will appear here with their schedules."
      actionLabel="Scan prescription"
      onAction={() => router.push('/scan')}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <FlatList
        data={medicines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing.base }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  header: {
    marginTop: 16,
  },
});
