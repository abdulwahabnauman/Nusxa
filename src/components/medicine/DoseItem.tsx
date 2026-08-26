import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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
  const reducedMotion = useReducedMotion();

  // Pop the status icon when the dose transitions out of "pending"
  const prevStatus = useRef(status);
  const iconScale = useSharedValue(1);
  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      if (!reducedMotion) {
        iconScale.value = withSequence(
          withSpring(1.4, { damping: 9, stiffness: 260 }),
          withSpring(1, { damping: 12, stiffness: 260 })
        );
      }
    }
  }, [status, reducedMotion, iconScale]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  // Swipe right = taken (pending doses only)
  const swipeX = useSharedValue(0);
  const swipeEnabled = status === 'pending' && !!onTaken;
  const swipeGesture = Gesture.Pan()
    .enabled(swipeEnabled)
    .onChange((e) => {
      swipeX.value = Math.max(0, Math.min(e.translationX, SWIPE_MAX));
    })
    .onEnd((e) => {
      if (e.translationX >= SWIPE_THRESHOLD && onTaken) {
        runOnJS(onTaken)();
      }
      swipeX.value = withSpring(0, { damping: 18, stiffness: 240 });
    });
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(swipeX.value, [0, SWIPE_THRESHOLD], [0.35, 1], 'clamp'),
  }));

  const statusColor =
    status === 'taken' ? colors.success
    : status === 'missed' ? colors.error
    : status === 'skipped' ? colors.warning
    : colors.text.secondary;

  return (
    <View style={{ borderBottomColor: colors.border.default, borderBottomWidth: 1, overflow: 'hidden' }}>
      {/* Swipe reveal layer */}
      {swipeEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeReveal,
            { backgroundColor: colors.success, borderRadius: borderRadius.sm },
            revealStyle,
          ]}
        >
          <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" />
          <Text style={[typography.label.sm, { color: '#FFFFFF', marginLeft: 6 }]}>Taken</Text>
        </Animated.View>
      )}

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.container, { backgroundColor: colors.background.surface }, rowStyle]}>
      <View style={styles.left}>
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons name={STATUS_ICONS[status]} size={22} color={statusColor} />
        </Animated.View>
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX = 140;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  swipeReveal: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 16,
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
