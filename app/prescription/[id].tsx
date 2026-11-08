import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, Modal } from 'react-native';
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

function parsePrescriptionImageUris(raw?: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
      }
    } catch {
      // Fallback to raw string
    }
  }
  return [trimmed];
}

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
  const [modalImageUri, setModalImageUri] = useState<string | null>(null);

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
          actionLabel={t.history.backToHistory}
          onAction={() => router.replace('/(tabs)/history')}
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

          {/* Original Prescription Document Gallery */}
          {(() => {
            const imageUris = parsePrescriptionImageUris(prescription.source_image_uri);
            if (imageUris.length === 0) return null;
            return (
              <View style={{ marginTop: 16 }}>
                <Text style={[typography.label.sm, { color: colors.text.secondary, marginBottom: 8 }]}>
                  {imageUris.length > 1
                    ? (language === 'ur' ? `نسخے کے صفحات (${imageUris.length})` : `Prescription Pages (${imageUris.length})`)
                    : (language === 'ur' ? 'اصل نسخہ' : 'Original Prescription')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {imageUris.map((uri, idx) => (
                    <TouchableOpacity
                      key={uri + idx}
                      activeOpacity={0.85}
                      onPress={() => setModalImageUri(uri)}
                      style={{
                        borderRadius: 12,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: colors.border.default,
                        backgroundColor: colors.background.subtle,
                      }}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: 140, height: 180, resizeMode: 'cover' }}
                      />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 6,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="magnify-plus-outline" size={12} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>
                          {imageUris.length > 1 ? `${idx + 1}/${imageUris.length}` : (language === 'ur' ? 'دیکھیں' : 'View')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })()}
        </Animated.View>

        <Animated.View entering={enter(1)} style={[styles.section, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
            {t.history.medicinesTitle}
          </Text>
          {prescription.medicines.length === 0 ? (
            <EmptyState
              icon="pill-off-outline"
              title={t.history.noMedicinesOnRx}
              actionLabel={t.home.scanPrescription}
              onAction={() => router.push('/scan')}
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

      {/* Fullscreen Prescription Image Modal */}
      <Modal
        visible={!!modalImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setModalImageUri(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
            <TouchableOpacity
              onPress={() => setModalImageUri(null)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 }}>
            {modalImageUri && (
              <Image
                source={{ uri: modalImageUri }}
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
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
