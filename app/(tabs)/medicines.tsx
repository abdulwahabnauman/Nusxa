import React, { useCallback, useState, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Platform,
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
import { useActiveMedicines, MedicineWithInfo } from '../../src/hooks/queries';
import { findInteractionPairs } from '../../src/utils/interactions';
import { useTabScrollReset } from '../../src/hooks/useTabScrollReset';

/** Memoized row so list scrolls stay cheap even with many medicines */
const MedicineRow = memo(function MedicineRow({
  med,
  onPress,
}: {
  med: MedicineWithInfo;
  onPress: (id: string) => void;
}) {
  const { t } = useI18n();
  // MedicineCard already owns its own TouchableOpacity — passing onPress
  // straight in avoids a nested touchable swallowing the tap.
  return (
    <View style={{ marginBottom: 16 }}>
      <MedicineCard
        name={med.name ?? t.common.unknown}
        dosage={med.dosage}
        frequency={med.frequency}
        form={med.form}
        strength={med.strength}
        scheduleTimes={med.scheduleTimes}
        verificationStatus={med.verification_status}
        daysUntilRefill={med.daysUntilRefill}
        onPress={() => onPress(med.id)}
      />
    </View>
  );
});

export default function MedicinesScreen() {
  const { colors, typography, spacing } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  // react-query owns the list (Perf 2); schedules are grouped from one batch
  // query inside the hook instead of one query per medicine (Perf 1).
  const {
    data: medicines = [],
    isLoading: loading,
    refetch,
  } = useActiveMedicines();
  const listRef = useRef<FlatList<MedicineWithInfo>>(null);
  useTabScrollReset(
    useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {
      // Offline-safe
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

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

  const interactions = useMemo(
    () => findInteractionPairs(medicines, t.common.unknownMedicine),
    [medicines, t]
  );

  const listHeader = (
    <>
      <View style={[styles.header, { paddingHorizontal: spacing.base, marginBottom: 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
            {t.medicinesList.title}
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
            {t.medicinesList.subtitle}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/medicine/new')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.accent.primary,
            borderRadius: 999,
            paddingHorizontal: 14,
            minHeight: 44,
            marginStart: spacing.sm,
          }}
          accessibilityRole="button"
          accessibilityLabel={t.manual.title}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.onAccent} />
          <Text style={[typography.label.sm, { color: colors.onAccent, marginStart: 4 }]}>
            {t.manual.title}
          </Text>
        </TouchableOpacity>
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
            marginBottom: 16,
          }}
          accessibilityLabel={(interactions.length === 1
            ? t.interactions.regimenCountOne
            : t.interactions.regimenCount
          ).replace('{n}', String(interactions.length))}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="pill-multiple" size={20} color={colors.error} />
            <Text style={[typography.label.base, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
              {t.interactions.regimenTitle}
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
                    {language === 'ur' ? hit.descriptionUr : hit.description}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 8 }]}>
            {t.review.interactionsDisclaimer}
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
            marginBottom: 16,
          }}
          accessibilityLabel={lowStockCount === 1
            ? t.medicinesList.lowStockOne
            : t.medicinesList.lowStockMany.replace('{n}', String(lowStockCount))}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.warning} />
          <Text style={[typography.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
            {lowStockCount === 1
              ? t.medicinesList.lowStockOne
              : t.medicinesList.lowStockMany.replace('{n}', String(lowStockCount))}
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
      title={t.medicine.noActiveMedicines}
      description={t.medicine.noActiveMedicinesDesc}
      actionLabel={t.home.scanPrescription}
      onAction={() => router.push('/scan')}
    />
  );

  return (
    // The tab bar owns the bottom inset; padding it here too left a gap above the bar.
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <FlatList
        ref={listRef}
        data={medicines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing.base }]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        initialNumToRender={8}
        windowSize={7}
        // iOS physically detaches clipped rows and reattached rows with
        // Reanimated wrappers lose touch responsiveness — Android clipping is
        // purely visual, so keep it there only
        removeClippedSubviews={Platform.OS === 'android'}
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
    flexDirection: 'row',
    alignItems: 'center',
  },
});
