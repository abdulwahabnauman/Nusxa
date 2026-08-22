import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import {
  getAllPrescriptions,
  searchPrescriptions,
  deletePrescription,
  archivePrescription,
} from '../../src/db/repositories/prescription';
import { getMedicinesByPrescription } from '../../src/db/repositories/medicine';
import type { Prescription } from '../../src/types/models';

interface PrescriptionItem extends Prescription {
  medicineCount: number;
}

export default function HistoryScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);

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

  const handleArchive = (id: string) => {
    Alert.alert(
      'Archive prescription',
      'This will hide the prescription from your active list. You can still view it in history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            await archivePrescription(id);
            await loadPrescriptions();
          },
        },
      ]
    );
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete prescription',
      'This will permanently delete this prescription and all associated medicines and schedules. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePrescription(id);
            await loadPrescriptions();
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return colors.success;
      case 'completed': return colors.text.secondary;
      case 'archived': return colors.text.disabled;
      default: return colors.text.secondary;
    }
  };

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

        {/* List */}
        <View style={[styles.content, { paddingHorizontal: spacing.base }]}>
          {prescriptions.length === 0 ? (
            <EmptyState
              icon="history"
              title={searchQuery ? 'No results found' : 'No prescription history'}
              description={
                searchQuery
                  ? 'Try a different search term.'
                  : 'Your scanned prescriptions will appear here, organized chronologically.'
              }
            />
          ) : (
            prescriptions.map((rx) => (
              <Card key={rx.id} style={{ marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => router.push(`/medicine/${rx.id}`)}
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
                      onPress={() => handleArchive(rx.id)}
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
                    onPress={() => handleDelete(rx.id)}
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
