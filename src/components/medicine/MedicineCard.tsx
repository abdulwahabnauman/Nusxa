import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
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
  const catColor = mode === 'dark'
    ? categoryColors.dark[category as keyof typeof categoryColors.dark] ?? categoryColors.dark.default
    : categoryColors.light[category as keyof typeof categoryColors.light] ?? categoryColors.light.default;

  return (
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

        {/* Refill info */}
        {daysUntilRefill !== null && daysUntilRefill !== undefined && (
          <View style={styles.refillRow}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={14}
              color={daysUntilRefill <= 7 ? colors.warning : colors.text.secondary}
            />
            <Text
              style={[
                typography.body.xs,
                {
                  color: daysUntilRefill <= 7 ? colors.warning : colors.text.secondary,
                  marginLeft: 4,
                },
              ]}
            >
              ~{daysUntilRefill} days remaining (estimate)
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
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
