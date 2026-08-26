/**
 * Learn Tab — "Your Medicines"
 * Lists the user's own active medicines (from their prescriptions) with a
 * short purpose snippet; tapping opens the per-medicine education detail.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { Card } from '../../src/components/ui/Card';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { MedicineFormIcon } from '../../src/components/medicine/FormIcon';
import { getActiveMedicines } from '../../src/db/repositories/medicine';
import type { Medicine } from '../../src/types/models';

export default function EducationScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  // Reload whenever the tab gains focus (data can change after scans or
  // AI gap-filling on the detail screen)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        try {
          const data = await getActiveMedicines();
          if (active) setMedicines(data);
        } catch (error) {
          console.error('Failed to load medicines:', error);
          if (active) setMedicines([]);
        } finally {
          if (active) setLoading(false);
        }
      }
      load();
      return () => {
        active = false;
      };
    }, []),
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
        <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.background.surface }}>
          <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.education.title}</Text>
          <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.education.subtitle}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.base, gap: spacing.sm, paddingBottom: spacing.xl + 20 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.base, paddingBottom: spacing.md, backgroundColor: colors.background.surface }}>
        <Text style={[typ.heading.h3, { color: colors.text.primary }]}>{t.education.title}</Text>
        <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{t.education.subtitle}</Text>
      </View>

      {medicines.length === 0 ? (
        <EmptyState
          icon="pill"
          title={t.education.emptyTitle}
          description={t.education.emptyDesc}
          actionLabel={t.education.emptyAction}
          onAction={() => router.push('/scan')}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.base, gap: spacing.sm, paddingBottom: spacing.xl + 20 }}
        >
          {medicines.map((medicine) => {
            const snippet =
              language === 'ur' ? medicine.purpose_ur ?? medicine.purpose : medicine.purpose;
            return (
            <TouchableOpacity
              key={medicine.id}
              onPress={() => router.push(`/education/${medicine.id}`)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MedicineFormIcon
                    form={medicine.form}
                    size={22}
                    color={colors.accent.primary}
                    bubbleBackground={colors.accent.subtle}
                    style={{ marginRight: spacing.sm }}
                  />
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
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
