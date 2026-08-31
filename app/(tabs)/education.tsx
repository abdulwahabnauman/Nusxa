/**
 * Learn Tab — "Your Medicines"
 * Lists the user's own active medicines (from their prescriptions) with a
 * short purpose snippet; tapping opens the per-medicine education detail.
 */

import React, { memo, useCallback, useState, useRef } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { useTabScrollReset } from '../../src/hooks/useTabScrollReset';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { MedicineFormIcon, PillIcon } from '../../src/components/ui/PillIcon';
import { getActiveMedicines } from '../../src/db/repositories/medicine';
import type { Medicine } from '../../src/types/models';

/** Memoized row so list scrolls stay cheap even with many medicines */
const EducationRow = memo(function EducationRow({
  medicine,
  language,
  onPress,
}: {
  medicine: Medicine;
  language: string;
  onPress: (id: string) => void;
}) {
  const { colors, typography: typ, spacing } = useTheme();
  const snippet =
    language === 'ur' ? medicine.purpose_ur ?? medicine.purpose : medicine.purpose;
  return (
    <TouchableOpacity
      onPress={() => onPress(medicine.id)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Learn about ${medicine.name ?? 'medicine'}`}
      style={{ marginBottom: 10 }}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.accent.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: spacing.sm,
            }}
          >
            <MedicineFormIcon form={medicine.form} size={22} color={colors.accent.primary} contrastColor={colors.accent.primary + '55'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typ.label.base, { color: colors.text.primary }]}>
              {medicine.name ?? 'Unknown'}
            </Text>
            {!!medicine.dosage && (
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
                {medicine.dosage}
              </Text>
            )}
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.text.disabled}
          />
        </View>

        {!!snippet && (
          <Text
            numberOfLines={2}
            style={[typ.body.sm, { color: colors.text.secondary, marginTop: spacing.sm }]}
          >
            {snippet}
          </Text>
        )}
      </Card>
    </TouchableOpacity>
  );
});

export default function EducationScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const listRef = useRef<FlatList<Medicine>>(null);
  useTabScrollReset(
    useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), [])
  );

  const load = useCallback(async () => {
    try {
      const data = await getActiveMedicines();
      setMedicines(data);
    } catch (error) {
      console.error('Failed to load medicines:', error);
      setMedicines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the tab gains focus (data can change after scans or
  // AI gap-filling on the detail screen)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function run() {
        if (!active) return;
        await load();
      }
      run();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openMedicine = useCallback(
    (id: string) => router.push(`/education/${id}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Medicine }) => (
      <EducationRow medicine={item} language={language} onPress={openMedicine} />
    ),
    [language, openMedicine]
  );

  const listHeader = (
    <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md }}>
      <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.education.title}</Text>
      <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.education.subtitle}</Text>
    </View>
  );

  const listEmpty = loading ? (
    <View style={{ gap: spacing.sm }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  ) : (
    <EmptyState
      icon={<PillIcon size={56} color={colors.text.disabled} contrastColor={colors.background.primary} />}
      title={t.education.emptyTitle}
      description={t.education.emptyDesc}
      actionLabel={t.education.emptyAction}
      onAction={() => router.push('/scan')}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <FlatList
        ref={listRef}
        data={medicines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl + 20 }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        initialNumToRender={8}
        windowSize={7}
        // iOS physically detaches clipped rows and reattached rows can lose
        // touch responsiveness — Android clipping is purely visual, so keep
        // it there only
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
