import React, { useCallback, useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { useUndoToast } from '../../src/components/ui/UndoToast';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import {
  getAllPrescriptions,
  searchPrescriptions,
  deletePrescription,
  archivePrescription,
  getPrescription,
  createPrescription,
  updatePrescription,
} from '../../src/db/repositories/prescription';
import { getMedicinesByPrescription, createMedicine } from '../../src/db/repositories/medicine';
import { getSchedulesByMedicine, createSchedule } from '../../src/db/repositories/schedule';
import { getDoseRecordsByMedicine, createDoseRecord } from '../../src/db/repositories/dose';
import type { Prescription, Medicine, Schedule, DoseRecord } from '../../src/types/models';

interface PrescriptionItem extends Prescription {
  medicineCount: number;
}

/** Memoized row so the prescription list stays cheap to scroll */
const PrescriptionRow = memo(function PrescriptionRow({
  rx,
  onOpen,
  onArchive,
  onDelete,
}: {
  rx: PrescriptionItem;
  onOpen: (rx: PrescriptionItem) => void;
  onArchive: (rx: PrescriptionItem) => void;
  onDelete: (rx: PrescriptionItem) => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Card style={{ marginBottom: 12 }}>
      <TouchableOpacity
        onPress={() => onOpen(rx)}
        accessibilityLabel={`Prescription from ${rx.date ?? 'unknown date'}`}
      >
        <View style={styles.rxHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              {rx.doctor_name ?? 'Unknown doctor'}
            </Text>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
              {rx.date ?? 'No date'} — {rx.medicineCount} {rx.medicineCount === 1 ? 'medicine' : 'medicines'}
            </Text>
            {rx.hospital && (
              <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 2 }]}>
                {rx.hospital}
              </Text>
            )}
          </View>
          <Badge
            label={rx.treatment_status}
            variant={rx.treatment_status === 'active' ? 'verified' : 'info'}
          />
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {rx.treatment_status === 'active' && (
          <TouchableOpacity
            onPress={() => onArchive(rx)}
            style={styles.actionBtn}
            accessibilityLabel="Archive prescription"
          >
            <MaterialCommunityIcons name="archive-outline" size={18} color={colors.text.secondary} />
            <Text style={[typography.body.xs, { color: colors.text.secondary, marginLeft: 4 }]}>
              Archive
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => onDelete(rx)}
          style={styles.actionBtn}
          accessibilityLabel="Delete prescription"
        >
          <MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} />
          <Text style={[typography.body.xs, { color: colors.error, marginLeft: 4 }]}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
});

export default function HistoryScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const { showUndoToast, undoToastElement } = useUndoToast();

  const loadPrescriptions = useCallback(async () => {
    try {
      let results: Prescription[];
      if (searchQuery.trim()) {
        results = await searchPrescriptions(searchQuery.trim());
      } else {
        results = await getAllPrescriptions();
      }

      const enriched: PrescriptionItem[] = [];
      for (const rx of results) {
        const meds = await getMedicinesByPrescription(rx.id);
        enriched.push({ ...rx, medicineCount: meds.length });
      }
      setPrescriptions(enriched);
    } catch {
      // Offline-safe
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrescriptions();
    setRefreshing(false);
  }, [loadPrescriptions]);

  const handleArchive = useCallback(async (rx: PrescriptionItem) => {
    const prevStatus = rx.treatment_status;
    try {
      await archivePrescription(rx.id);
      await loadPrescriptions();
      showUndoToast('Prescription archived', async () => {
        try {
          await updatePrescription(rx.id, { treatment_status: prevStatus });
          await loadPrescriptions();
        } catch { /* undo is best-effort */ }
      });
    } catch { /* action failed silently */ }
  }, [loadPrescriptions, showUndoToast]);

  const handleDelete = useCallback(async (rx: PrescriptionItem) => {
    try {
      // Snapshot everything the cascade delete will remove so Undo can restore it
      const medicines = await getMedicinesByPrescription(rx.id);
      const scheduleSnapshot: Schedule[] = [];
      const doseSnapshot: DoseRecord[] = [];
      for (const med of medicines) {
        scheduleSnapshot.push(...await getSchedulesByMedicine(med.id));
        doseSnapshot.push(...await getDoseRecordsByMedicine(med.id));
      }
      const rxSnapshot = await getPrescription(rx.id);

      await deletePrescription(rx.id);
      await loadPrescriptions();

      showUndoToast('Prescription deleted', async () => {
        try {
          if (rxSnapshot) {
            const { created_at: _c, updated_at: _u, ...rxData } = rxSnapshot;
            await createPrescription(rxData);
          }
          for (const med of medicines) {
            const { created_at: _c, updated_at: _u, ...medData } = med;
            await createMedicine(medData as Omit<Medicine, 'created_at' | 'updated_at'>);
          }
          for (const sch of scheduleSnapshot) {
            const { created_at: _c, ...schData } = sch;
            await createSchedule(schData);
          }
          for (const rec of doseSnapshot) {
            const { created_at: _c, updated_at: _u, ...recData } = rec;
            await createDoseRecord(recData);
          }
          await loadPrescriptions();
        } catch { /* undo is best-effort */ }
      });
    } catch { /* action failed silently */ }
  }, [loadPrescriptions, showUndoToast]);

  const handleOpen = useCallback((rx: PrescriptionItem) => {
    router.push(`/medicine/${rx.id}`);
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: PrescriptionItem }) => (
      <PrescriptionRow rx={item} onOpen={handleOpen} onArchive={handleArchive} onDelete={handleDelete} />
    ),
    [handleOpen, handleArchive, handleDelete]
  );

  const listHeader = (
    <>
      <View style={[styles.header, { paddingHorizontal: spacing.base }]}>
        <Text style={[typography.heading.h2, { color: colors.text.primary }]}>
          History
        </Text>
        <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
          Your prescription records
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.base }]}>
        <View
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.background.surface,
              borderColor: colors.border.default,
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={colors.text.disabled} />
          <TextInput
            style={[typography.body.base, { color: colors.text.primary, flex: 1, marginLeft: 8 }]}
            placeholder="Search by medicine, doctor, or date"
            placeholderTextColor={colors.text.disabled}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search prescriptions"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.text.disabled} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );

  const listEmpty = loading ? (
    <View style={{ gap: 12, marginTop: 16 }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  ) : (
    <EmptyState
      icon="history"
      title={searchQuery ? 'No results found' : 'No prescription history'}
      description={
        searchQuery
          ? 'Try a different search term.'
          : 'Your scanned prescriptions will appear here, organized chronologically.'
      }
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <FlatList
        data={prescriptions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.base }]}
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
      {undoToastElement}
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
  searchContainer: {
    marginTop: 16,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  content: {
    flex: 1,
    marginTop: 16,
  },
  rxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
