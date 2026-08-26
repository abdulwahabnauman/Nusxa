import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { MedicineFormIcon } from '../ui/PillIcon';
import { formatTime12h } from '../../utils/date';
import { formatDigits } from '../../utils/numerals';
import { categoryColors, strengthColor } from '../../theme/tokens';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings-store';

interface MedicineCardProps {
  name: string;
  dosage: string | null;
  frequency: string | null;
  form?: string | null;
  strength?: string | null;
  mealInstruction?: string | null;
  verificationStatus?: string;
  category?: string;
  scheduleTimes?: string[];
  daysUntilRefill?: number | null;
  onPress?: () => void;
}

export function MedicineCard({
  name,
  dosage,
  frequency,
  form,
  strength,
  mealInstruction,
  verificationStatus = 'verified',
  category = 'default',
  scheduleTimes,
  daysUntilRefill,
  onPress,
}: MedicineCardProps) {
  const { colors, typography, spacing, mode } = useTheme();
  const { t } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const reducedMotion = useReducedMotion();

  // Spring press feedback — the card dips slightly on its way to the detail screen
  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  const handlePressIn = () => {
    if (!reducedMotion) {
      pressScale.value = withSpring(0.97, { damping: 20, stiffness: 320 });
    }
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 20, stiffness: 320 });
  };
  const catColor = mode === 'dark'
    ? categoryColors.dark[category as keyof typeof categoryColors.dark] ?? categoryColors.dark.default
    : categoryColors.light[category as keyof typeof categoryColors.light] ?? categoryColors.light.default;

  return (
    // The entering (layout) animation and the press-scale transform must
    // live on separate animated views — Reanimated warns when a layout
    // animation can overwrite a `transform` on the same component.
    <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(350).springify()}>
      <Animated.View style={pressStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
      <Card style={{ borderLeftWidth: 3, borderLeftColor: catColor }}>
        <View style={styles.header}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.accent.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <MedicineFormIcon form={form} size={20} color={colors.accent.primary} contrastColor={colors.accent.primary + '55'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              {name}
            </Text>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
              {dosage ?? '?'} — {frequency ?? '?'}
              {mealInstruction && mealInstruction !== 'none' ? ` — ${mealInstruction} meals` : ''}
            </Text>
            {!!strength && (
              <Text style={[typography.body.xs, { color: strengthColor(strength) ?? colors.text.secondary, marginTop: 2, fontWeight: '600' }]}>
                {strength}
              </Text>
            )}
          </View>
          <Badge
            label={verificationStatus}
            variant={verificationStatus === 'verified' ? 'verified' : 'pending'}
          />
        </View>

        {/* Schedule times */}
        {scheduleTimes && scheduleTimes.length > 0 && (
          <View style={styles.scheduleRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={colors.text.secondary} />
            <Text style={[typography.body.xs, { color: colors.text.secondary, marginLeft: 4 }]}>
              {scheduleTimes.map(formatTime12h).join(', ')}
            </Text>
          </View>
        )}

        {/* Refill info — low stock gets a prominent badge */}
        {daysUntilRefill !== null && daysUntilRefill !== undefined && (
          daysUntilRefill <= 7 ? (
            <View style={styles.refillRow}>
              <Badge
                label={daysUntilRefill <= 0 ? t.home.outOfStock : t.home.daysLeftRefill.replace('{n}', formatDigits(daysUntilRefill, easternNumerals))}
                variant={daysUntilRefill <= 3 ? 'error' : 'warning'}
              />
            </View>
          ) : (
            <View style={styles.refillRow}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={colors.text.secondary}
              />
              <Text
                style={[
                  typography.body.xs,
                  { color: colors.text.secondary, marginLeft: 4 },
                ]}
              >
                {t.medicine.daysRemaining.replace('{n}', formatDigits(daysUntilRefill, easternNumerals))}
              </Text>
            </View>
          )
        )}
        </Card>
      </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  refillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});
