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
  Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings-store';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getTimeRangeParts, getTodayAtMs } from '../../utils/date';
import { formatDigits } from '../../utils/numerals';
import { selectionHaptic, takeDoseHaptic } from '../../utils/haptics';
import { SpeechButton } from '../ui/SpeechButton';
import { buildDoseSpeechText } from '../../utils/speech';
import type { DoseStatus } from '../../types/models';

interface DoseItemProps {
  time: string;
  windowMinutes?: number;
  medicineName: string;
  dosage: string | null;
  mealInstruction: string | null;
  status: DoseStatus;
  /** Current time in epoch-ms; pending doses before their time stay locked */
  nowMs: number;
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
  windowMinutes,
  medicineName,
  dosage,
  mealInstruction,
  status,
  nowMs,
  onTaken,
  onSkip,
}: DoseItemProps) {
  const { colors, typography, borderRadius } = useTheme();
  const { t, language } = useI18n();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const reducedMotion = useReducedMotion();

  const nf = (v: string | number) => formatDigits(v, easternNumerals);
  const [rangeStart, rangeEnd] = getTimeRangeParts(time, windowMinutes ?? 120, language);
  const timeLabel = t.dose.timeRange
    .replace('{start}', nf(rangeStart))
    .replace('{end}', nf(rangeEnd));

  // Pop the status icon and morph in a fill ring when the dose leaves "pending"
  const prevStatus = useRef(status);
  const iconScale = useSharedValue(1);
  const fillScale = useSharedValue(status === 'pending' ? 0 : 1);
  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      if (!reducedMotion) {
        // Quick pop: stiff springs keep the whole bounce under ~300ms
        iconScale.value = withSequence(
          withSpring(1.35, { damping: 13, stiffness: 520 }),
          withSpring(1, { damping: 17, stiffness: 520 })
        );
      }
      if (status !== 'pending') {
        fillScale.value = reducedMotion ? 1 : withSpring(1, { damping: 16, stiffness: 420 });
      } else {
        fillScale.value = 0;
      }
    }
  }, [status, reducedMotion, iconScale, fillScale]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fillScale.value }],
    opacity: fillScale.value,
  }));

  // Swipe right = taken (pending doses once their time has arrived, and
  // missed ones that can still be corrected)
  const actionable =
    (status === 'pending' || status === 'missed') &&
    (status !== 'pending' || nowMs >= getTodayAtMs(time));
  const swipeX = useSharedValue(0);
  const swipePassedThreshold = useSharedValue(false);
  const swipeEnabled = actionable && !!onTaken;

  const triggerThresholdHaptic = () => {
    selectionHaptic();
  };

  const swipeGesture = Gesture.Pan()
    .enabled(swipeEnabled)
    // Axis lock: only claim horizontal gesture with deliberate intent
    .activeOffsetX([-24, 24])
    .failOffsetY([-12, 12])
    .onChange((e) => {
      if (e.translationX <= 0) {
        swipeX.value = 0;
        return;
      }
      if (e.translationX <= SWIPE_THRESHOLD) {
        swipeX.value = e.translationX;
        if (swipePassedThreshold.value) {
          swipePassedThreshold.value = false;
        }
      } else {
        // Elastic rubber-band resistance curve past threshold
        const excess = e.translationX - SWIPE_THRESHOLD;
        const rubberBanded = SWIPE_THRESHOLD + excess * 0.38;
        swipeX.value = Math.min(rubberBanded, SWIPE_MAX + 30);
        if (!swipePassedThreshold.value) {
          swipePassedThreshold.value = true;
          runOnJS(triggerThresholdHaptic)();
        }
      }
    })
    .onEnd((e) => {
      const deliberate =
        e.translationX >= SWIPE_THRESHOLD && e.translationX > Math.abs(e.translationY) * 1.5;
      const fling = e.velocityX > 800 && e.translationX > 40;
      if ((deliberate || fling) && onTaken) {
        runOnJS(takeDoseHaptic)();
        runOnJS(onTaken)();
      }
      swipePassedThreshold.value = false;
      swipeX.value = withSpring(0, { damping: 18, stiffness: 350 });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const revealStyle = useAnimatedStyle(() => {
    const opacity = interpolate(swipeX.value, [0, SWIPE_THRESHOLD * 0.35, SWIPE_THRESHOLD], [0.2, 0.7, 1], Extrapolation.CLAMP);
    const scale = interpolate(swipeX.value, [0, SWIPE_THRESHOLD, SWIPE_MAX + 30], [0.92, 1, 1.06], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const checkIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(swipeX.value, [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD, SWIPE_MAX + 30], [0.4, 0.8, 1, 1.25], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
    };
  });

  const statusColor =
    status === 'taken' ? colors.success
    : status === 'missed' ? colors.error
    : status === 'skipped' ? colors.warning
    : colors.text.secondary;

  return (
    <View style={{ borderBottomColor: colors.border.default, borderBottomWidth: 1, overflow: 'hidden' }}>
      {/* Elastic Swipe reveal layer */}
      {swipeEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeReveal,
            { backgroundColor: colors.success, borderRadius: borderRadius.sm },
            revealStyle,
          ]}
        >
          <Animated.View style={checkIconStyle}>
            <MaterialCommunityIcons name="check" size={24} color={colors.onStatus} />
          </Animated.View>
          <Text style={[typography.label.sm, { color: colors.onStatus, marginStart: 6 }]}>{t.dose.taken}</Text>
        </Animated.View>
      )}

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.container, { backgroundColor: colors.background.surface }, rowStyle]}>
      <View
        style={styles.left}
        accessibilityLabel={`${medicineName}${dosage ? ` ${dosage}` : ''}, ${timeLabel}, ${status}`}
      >
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: statusColor + '2E',
              },
              fillStyle,
            ]}
          />
          <Animated.View style={iconStyle}>
            <MaterialCommunityIcons name={STATUS_ICONS[status]} size={22} color={statusColor} />
          </Animated.View>
        </View>
        <View style={{ marginStart: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[typography.body.base, { color: colors.text.primary, flex: 1 }]}>
              {timeLabel}
            </Text>
            <SpeechButton
              text={buildDoseSpeechText({
                medicineName,
                dosage,
                mealInstruction,
                time: rangeStart,
                language,
              })}
              medicineName={medicineName}
              size={18}
            />
          </View>
          <Text style={[typography.body.sm, { color: colors.text.secondary, marginTop: 2 }]}>
            {medicineName} {dosage ? `, ${dosage}` : ''}
          </Text>
          {mealInstruction && mealInstruction !== 'none' && (
            <Text style={[typography.body.xs, { color: colors.text.disabled, marginTop: 1 }]}>
              {mealInstruction === 'before'
                ? t.dose.beforeMeals
                : mealInstruction === 'with'
                  ? t.dose.withMeals
                  : t.dose.afterMeals}
            </Text>
          )}
        </View>
      </View>

      {actionable && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.accent.primary, borderRadius: borderRadius.sm }]}
            onPress={() => {
              takeDoseHaptic();
              onTaken?.();
            }}
            accessibilityLabel={t.dose.markTaken.replace('{name}', medicineName)}
          >
            <Text style={[typography.label.sm, { color: colors.onAccent }]}>{t.dose.taken}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.background.subtle, borderRadius: borderRadius.sm }]}
            onPress={onSkip}
            accessibilityLabel={t.dose.skipOne.replace('{name}', medicineName)}
          >
            <Text style={[typography.label.sm, { color: colors.text.secondary }]}>{t.dose.skip}</Text>
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
    paddingStart: 16,
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
