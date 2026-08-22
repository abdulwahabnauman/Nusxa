import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { formatTime12h } from '../../utils/date';
import type { DoseStatus } from '../../types/models';

interface DoseItemProps {
  time: string;
  medicineName: string;
  dosage: string | null;
  mealInstruction: string | null;
  status: DoseStatus;
  onTaken?: () => void;
  onSkip?: () => void;
}

const STATUS_ICONS: Record<DoseStatus, keyof typeof MaterialCommunityIcons.glyphMap> = {
  taken: 'check-circle',
  skipped: 'minus-circle-outline',
  missed: 'alert-circle-outline',
  pending: 'clock-outline',
};

export function DoseItem({
  time,
  medicineName,
  dosage,
  mealInstruction,
  status,
  onTaken,
  onSkip,
}: DoseItemProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const statusColor =
    status === 'taken' ? colors.success
    : status === 'missed' ? colors.error
    : status === 'skipped' ? colors.warning
    : colors.text.secondary;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border.default }]}>
      <View style={styles.left}>
        <MaterialCommunityIcons name={STATUS_ICONS[status]} size={22} color={statusColor} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={[typography.body.base, { color: colors.text.primary }]}>
            {formatTime12h(time)}
          </Text>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
            {medicineName} {dosage ? `— ${dosage}` : ''}
          </Text>
          {mealInstruction && mealInstruction !== 'none' && (
            <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 1 }]}>
              {mealInstruction} meals
            </Text>
          )}
        </View>
      </View>

      {status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.accent.primary, borderRadius: borderRadius.sm }]}
            onPress={onTaken}
            accessibilityLabel={`Mark ${medicineName} as taken`}
          >
            <Text style={[typography.label.sm, { color: '#FFFFFF' }]}>Taken</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.background.subtle, borderRadius: borderRadius.sm }]}
            onPress={onSkip}
            accessibilityLabel={`Skip ${medicineName}`}
          >
            <Text style={[typography.label.sm, { color: colors.text.secondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
