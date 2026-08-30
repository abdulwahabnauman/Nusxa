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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/provider';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { useUndoToast } from '../../src/components/ui/UndoToast';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { SwipeActions, type SwipeAction } from '../../src/components/ui/SwipeActions';
import { useI18n } from '../../src/i18n';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { usePrescriptionList, PrescriptionItem } from '../../src/hooks/queries';
import { useSettingsStore } from '../../src/stores/settings-store';
import { formatDigits } from '../../src/utils/numerals';
import { formatDateLocalized } from '../../src/utils/date';
import {
  deletePrescription,
  restorePrescription,
  archivePrescription,
  updatePrescription,
} from '../../src/db/repositories/prescription';
import { syncDoseNotifications } from '../../src/utils/notifications';

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
  const { t, language } = useI18n();
  const locale = language === 'ur' ? 'ur-PK' : 'en-US';
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const nf = (v: string | number) => formatDigits(v, easternNumerals);

  // Swipe-revealed actions replace the old always-visible button row (UX17)
  const actions: SwipeAction[] = [];
  if (rx.treatment_status === 'active') {
    actions.push({
      label: t.history.archive,
      icon: 'archive-outline',
      background: colors.accent.primary,
      onPress: () => onArchive(rx),
    });
  }
  actions.push({
    label: t.common.delete,
    icon: 'delete-outline',
    background: colors.error,
    onPress: () => onDelete(rx),
  });

  const displayDate = rx.date ? formatDateLocalized(rx.date, locale) : t.history.noDate;

  return (
    <SwipeActions actions={actions} style={{ marginBottom: 16 }}>
      <Card>
        <TouchableOpacity
          onPress={() => onOpen(rx)}
          accessibilityLabel={`Prescription from ${displayDate}`}
        >
          <View style={styles.rxHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
                {rx.doctor_name ?? t.history.unknownDoctor}
              </Text>
              <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
                {displayDate},{' '}
                {nf(
                  (rx.medicineCount === 1 ? t.history.medicineCountOne : t.history.medicineCountMany).replace(
                    '{n}',
                    String(rx.medicineCount),
                  ),
                )}
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
      </Card>
    </SwipeActions>
  );
});

export default function HistoryScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const { t, isRTL } = useI18n();
  const reducedMotion = useReducedMotion();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const { showUndoToast, undoToastElement } = useUndoToast();

  // react-query owns the list (Perf 2): cached, keyed by search term, and
  // enriched with medicine counts in one batch query (no N+1, Perf 1).
  const {
    data: prescriptions = [],
    isLoading: loading,
    refetch,
  } = usePrescriptionList(searchQuery);

  // Marquee placeholder: the search hint stays on one line and, when it is
  // wider than the field, slides across slowly instead of wrapping/disappearing.
  const [placeholderFieldW, setPlaceholderFieldW] = useState(0);
  const [placeholderTextW, setPlaceholderTextW] = useState(0);
  const marqueeX = useSharedValue(0);
  const placeholderOverflow = Math.max(0, placeholderTextW - placeholderFieldW);

  useEffect(() => {
    if (reducedMotion || placeholderOverflow <= 0) {
      marqueeX.value = 0;
      return;
    }
    const dir = isRTL ? 1 : -1;
    const dist = placeholderOverflow + 12;
    // Slow, legible crawl (~18px/s), with pauses at both ends
    marqueeX.value = withRepeat(
      withSequence(
        withDelay(1500, withTiming(dir * dist, { duration: Math.max(2000, dist * 55), easing: Easing.linear })),
        withDelay(1200, withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) })),
      ),
      -1,
      false,
    );
  }, [placeholderOverflow, isRTL, reducedMotion, marqueeX]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeX.value }],
  }));

  const loadPrescriptions = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // Offline-safe
    }
  }, [refetch]);

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
      showUndoToast(t.history.archivedToast, async () => {
        try {
          await updatePrescription(rx.id, { treatment_status: prevStatus });
          await loadPrescriptions();
        } catch { /* undo is best-effort */ }
      });
    } catch { /* action failed silently */ }
  }, [loadPrescriptions, showUndoToast, t]);

  const handleDelete = useCallback(async (rx: PrescriptionItem) => {
    try {
      // Soft delete tombstones the prescription + its medicines; Undo just clears the tombstone
      await deletePrescription(rx.id);
      await syncDoseNotifications();
      await loadPrescriptions();

      showUndoToast(t.history.deletedToast, async () => {
        try {
          await restorePrescription(rx.id);
          await syncDoseNotifications();
          await loadPrescriptions();
        } catch { /* undo is best-effort */ }
      });
    } catch { /* action failed silently */ }
  }, [loadPrescriptions, showUndoToast, t]);

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
          {t.history.title}
        </Text>
        <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 4 }]}>
          {t.history.subtitle} · {t.history.swipeHint}
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
          <View
            style={styles.searchField}
            onLayout={(e) => setPlaceholderFieldW(e.nativeEvent.layout.width)}
          >
            {!searchQuery && !searchFocused && (
              <Animated.View
                pointerEvents="none"
                style={[styles.searchPlaceholderOverlay, marqueeStyle]}
              >
                <Text
                  numberOfLines={1}
                  onLayout={(e) => setPlaceholderTextW(e.nativeEvent.layout.width)}
                  style={[typography.body.base, { color: colors.text.disabled }]}
                >
                  {t.history.searchPlaceholder}
                </Text>
              </Animated.View>
            )}
            <TextInput
              style={[typography.body.base, { color: colors.text.primary, flex: 1 }]}
              placeholder=""
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              accessibilityLabel={t.history.searchPlaceholder}
            />
          </View>
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
      title={searchQuery ? t.history.noResults : t.history.noHistory}
      description={
        searchQuery
          ? t.history.noResultsDesc
          : t.history.noHistoryDesc
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
    marginBottom: 16,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  searchField: {
    flex: 1,
    marginStart: 8,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  searchPlaceholderOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    justifyContent: 'center',
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
});
