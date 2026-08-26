import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatTime12h } from '../../utils/date';
import { categoryColors } from '../../theme/tokens';

interface MedicineCardProps {
  name: string;
  dosage: string | null;
  frequency: string | null;
  form?: string | null;
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
  mealInstruction,
  verificationStatus = 'verified',
  category = 'default',
  scheduleTimes,
  daysUntilRefill,
  onPress,
}: MedicineCardProps) {
  const { colors, typography, spacing, mode } = useTheme();
  const reducedMotion = useReducedMotion();
  const catColor = mode === 'dark'
    ? categoryColors.dark[category as keyof typeof categoryColors.dark] ?? categoryColors.dark.default
    : categoryColors.light[category as keyof typeof categoryColors.light] ?? categoryColors.light.default;

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(350).springify()}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Card style={{ borderLeftWidth: 3, borderLeftColor: catColor }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              {name}
            </Text>
            <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
              {dosage ?? '?'} — {frequency ?? '?'}
              {mealInstruction && mealInstruction !== 'none' ? ` — ${mealInstruction} meals` : ''}
            </Text>
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
                label={daysUntilRefill <= 0 ? 'Out of stock — refill now' : `${daysUntilRefill} day${daysUntilRefill === 1 ? '' : 's'} left — refill soon`}
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
                ~{daysUntilRefill} days remaining (estimate)
              </Text>
            </View>
          )
        )}
        </Card>
      </TouchableOpacity>
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
