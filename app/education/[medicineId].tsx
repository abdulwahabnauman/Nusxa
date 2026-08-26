/**
 * Learn — Medicine Education Detail
 * Shows what a medicine is for, its common side effects, food interactions,
 * storage and warnings, sourced from the user's own prescription data.
 * When a medicine row is thin on data (e.g. manually entered), gaps are
 * filled once via the AI text provider and cached back into the medicines
 * row so the call is never repeated.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../../src/theme/provider';
import { useI18n } from '../../src/i18n';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { Card } from '../../src/components/ui/Card';
import { MedicineFormIcon } from '../../src/components/ui/PillIcon';
import { getMedicine, updateMedicine } from '../../src/db/repositories/medicine';
import { resolveTextProviderKeys } from '../../src/utils/secureStorage';
import { MEDICINE_INFO_SYSTEM_PROMPT, buildMedicineInfoRequest } from '../../src/ai/prompts';
import type { Medicine } from '../../src/types/models';

/** Shape of the AI gap-fill response */
interface MedicineInfoResult {
  purpose?: string | null;
  side_effects?: string[];
  food_interactions?: string[];
  storage?: string | null;
  warnings?: string[];
}

/** A medicine needs enrichment (for the given language) when it has neither a purpose nor side effects */
function needsEnrichment(medicine: Medicine, language: 'en' | 'ur'): boolean {
  return language === 'ur'
    ? !medicine.purpose_ur && (medicine.side_effects_ur ?? []).length === 0
    : !medicine.purpose && medicine.side_effects.length === 0;
}

export default function MedicineEducationScreen() {
  const { colors, typography: typ, spacing } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { medicineId } = useLocalSearchParams<{ medicineId: string }>();
  const reducedMotion = useReducedMotion();

  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichFailed, setEnrichFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!medicineId || startedRef.current) return;
    startedRef.current = true;

    async function load() {
      try {
        const data = await getMedicine(medicineId ?? '');
        if (!data) {
          router.back();
          return;
        }
        setMedicine(data);

        if (needsEnrichment(data, language)) {
          // Fire-and-forget: render what we have immediately and show the
          // inline "loading extra details" row while the AI call runs.
          void enrichMedicine(data);
        }
      } catch (error) {
        console.error('Failed to load medicine:', error);
        router.back();
      } finally {
        setLoading(false);
      }
    }

    /**
     * Fill missing purpose/side-effects via the AI text provider, cache the
     * result into the medicines row, and render whatever we end up with.
     * Any failure (offline, rate limit, missing key, bad JSON) just shows
     * the inline fallback message — never a crash, never a blank screen.
     */
    async function enrichMedicine(data: Medicine) {
      setEnriching(true);
      try {
        const keys = await resolveTextProviderKeys();
        if (!keys.openRouterKey && !keys.groqKey) throw new Error('No API key configured');

        // Lazy-load the AI client so the education screen's first paint
        // never pays for the network stack on startup.
        const { chatCompletion } = require('../../src/ai/client') as typeof import('../../src/ai/client');

        const raw = await chatCompletion(
          MEDICINE_INFO_SYSTEM_PROMPT,
          buildMedicineInfoRequest(data, language),
          keys,
        );

        const parsed = JSON.parse(raw) as MedicineInfoResult;
        const asList = (v: unknown): string[] =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

        const patch: Partial<Medicine> = {};
        if (language === 'ur') {
          if (typeof parsed.purpose === 'string' && parsed.purpose.trim()) patch.purpose_ur = parsed.purpose.trim();
          if (typeof parsed.storage === 'string' && parsed.storage.trim()) patch.storage_ur = parsed.storage.trim();
          const sideEffects = asList(parsed.side_effects);
          if (sideEffects.length > 0) patch.side_effects_ur = sideEffects;
          const foodInteractions = asList(parsed.food_interactions);
          if (foodInteractions.length > 0) patch.food_interactions_ur = foodInteractions;
          const warnings = asList(parsed.warnings);
          if (warnings.length > 0) patch.warnings_ur = warnings;
        } else {
          if (typeof parsed.purpose === 'string' && parsed.purpose.trim()) patch.purpose = parsed.purpose.trim();
          if (typeof parsed.storage === 'string' && parsed.storage.trim()) patch.storage = parsed.storage.trim();
          const sideEffects = asList(parsed.side_effects);
          if (sideEffects.length > 0) patch.side_effects = sideEffects;
          const foodInteractions = asList(parsed.food_interactions);
          if (foodInteractions.length > 0) patch.food_interactions = foodInteractions;
          const warnings = asList(parsed.warnings);
          if (warnings.length > 0) patch.warnings = warnings;
        }

        if (Object.keys(patch).length > 0) {
          // Cache into the row so the AI is not re-called on future visits
          await updateMedicine(data.id, patch);
          setMedicine({ ...data, ...patch });
        } else {
          setEnrichFailed(true);
        }
      } catch (error) {
        console.error('Medicine enrichment failed:', error);
        setEnrichFailed(true);
      } finally {
        setEnriching(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicineId]);

  if (loading || !medicine) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  // Language-aware view over the cached content; Urdu falls back to the
  // base columns until the Urdu gap-fill has run (or if it failed)
  const isUr = language === 'ur';
  const purpose = isUr ? medicine.purpose_ur ?? medicine.purpose : medicine.purpose;
  const sideEffects =
    isUr && (medicine.side_effects_ur?.length ?? 0) > 0 ? medicine.side_effects_ur ?? [] : medicine.side_effects;
  const foodInteractions =
    isUr && (medicine.food_interactions_ur?.length ?? 0) > 0 ? medicine.food_interactions_ur ?? [] : medicine.food_interactions;
  const storage = isUr ? medicine.storage_ur ?? medicine.storage : medicine.storage;
  const warnings =
    isUr && (medicine.warnings_ur?.length ?? 0) > 0 ? medicine.warnings_ur ?? [] : medicine.warnings;

  // Staggered zoom-in entrance for each section
  let enterIdx = 0;
  const enter = () =>
    reducedMotion ? undefined : FadeInUp.duration(280).delay(enterIdx++ * 70).springify();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
      {/* Header */}
      <View
        style={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.sm,
          backgroundColor: colors.background.surface,
          borderBottomColor: colors.border.default,
          borderBottomWidth: 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={t.common.back}
          >
            <MaterialCommunityIcons
              name={isRTL ? 'arrow-right' : 'arrow-left'}
              size={24}
              color={colors.text.primary}
            />
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <Text numberOfLines={2} style={[typ.heading.h4, { color: colors.text.primary }]}>
              {medicine.name ?? 'Unknown'}
            </Text>
            {!!medicine.dosage && (
              <Text style={[typ.body.sm, { color: colors.text.secondary }]}>{medicine.dosage}</Text>
            )}
          </View>

          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.accent.subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MedicineFormIcon form={medicine.form} size={22} color={colors.accent.primary} contrastColor={colors.accent.primary + '55'} />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, gap: spacing.lg, paddingBottom: spacing.xl + 40 }}
      >
        {/* AI gap-fill status */}
        {enriching && (
          <Animated.View entering={enter()} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={[typ.body.sm, { color: colors.text.secondary }]}>
              {t.education.loadingExtra}
            </Text>
          </Animated.View>
        )}
        {enrichFailed && !enriching && (
          <Animated.View entering={enter()}>
            <Card style={{ backgroundColor: colors.background.subtle }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.text.secondary} />
                <Text style={[typ.body.sm, { color: colors.text.secondary, marginLeft: spacing.sm, flex: 1 }]}>
                  {t.education.aiFailed}
                </Text>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Purpose */}
        {!!purpose && (
          <Animated.View entering={enter()}>
            <Text style={[typ.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.education.purpose}
            </Text>
            <Card>
              <Text style={[typ.body.base, { color: colors.text.primary }]}>
                {purpose}
              </Text>
            </Card>
          </Animated.View>
        )}

        {/* Side effects */}
        {sideEffects.length > 0 && (
          <Animated.View entering={enter()}>
            <Text style={[typ.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.education.sideEffects}
            </Text>
            <Card>
              {sideEffects.map((effect, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < sideEffects.length - 1 ? spacing.sm : 0 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text.disabled, marginTop: 7, marginRight: 8 }} />
                  <Text style={[typ.body.sm, { color: colors.text.primary, flex: 1 }]}>
                    {effect}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Food interactions */}
        {foodInteractions.length > 0 && (
          <Animated.View entering={enter()}>
            <Text style={[typ.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.education.foodInteractions}
            </Text>
            <Card>
              {foodInteractions.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < foodInteractions.length - 1 ? spacing.sm : 0 }}>
                  <MaterialCommunityIcons name="food-apple-outline" size={16} color={colors.warning} />
                  <Text style={[typ.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Storage */}
        {!!storage && (
          <Animated.View entering={enter()}>
            <Text style={[typ.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.education.storage}
            </Text>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MaterialCommunityIcons name="fridge-outline" size={18} color={colors.accent.primary} />
                <Text style={[typ.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                  {storage}
                </Text>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <Animated.View entering={enter()}>
            <Text style={[typ.heading.h4, { color: colors.text.primary, marginBottom: spacing.sm }]}>
              {t.education.warnings}
            </Text>
            <Card style={{ backgroundColor: colors.accent.subtle, borderColor: colors.warning }}>
              {warnings.map((warning, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < warnings.length - 1 ? spacing.xs : 0 }}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} />
                  <Text style={[typ.body.sm, { color: colors.text.primary, marginLeft: 8, flex: 1 }]}>
                    {warning}
                  </Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Disclaimer */}
        <Animated.View entering={enter()}>
          <Text style={[typ.body.xs, { color: colors.text.disabled, textAlign: 'center' }]}>
            {t.education.disclaimer}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
