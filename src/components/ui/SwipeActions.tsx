import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, I18nManager, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';

export interface SwipeAction {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  background: string;
  foreground?: string;
  onPress: () => void;
}

export const SWIPE_ACTION_WIDTH = 84;

/**
 * Swipe-to-reveal wrapper for list rows (audit UX17): hides row-level action
 * buttons behind a horizontal swipe for a cleaner list. Reveals to the LEFT
 * in LTR and to the RIGHT in RTL. The card slides over the action strip;
 * tapping an action fires it and snaps the row closed again.
 */
export function SwipeActions({
  children,
  actions,
  style,
}: {
  children: React.ReactNode;
  actions: SwipeAction[];
  style?: ViewStyle;
}) {
  // +1 in LTR (reveal on left swipe), -1 in RTL (reveal on right swipe)
  const dirSign = I18nManager.isRTL ? -1 : 1;
  const { typography } = useTheme();
  const maxShift = SWIPE_ACTION_WIDTH * actions.length;
  // 0 = closed, -maxShift = fully open
  const tx = useSharedValue(0);
  const startTx = useRef(0);

  const close = () => {
    tx.value = withTiming(0, { duration: 180 });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onStart(() => {
      startTx.current = tx.value;
    })
    .onUpdate((e) => {
      'worklet';
      tx.value = Math.max(-maxShift, Math.min(0, startTx.current + e.translationX * dirSign));
    })
    .onEnd((e) => {
      'worklet';
      // Snap open past 40% travel or on a confident flick
      const open = tx.value < -maxShift * 0.4 || e.velocityX * dirSign < -300;
      tx.value = withTiming(open ? -maxShift : 0, { duration: 180 });
    });

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value * dirSign }],
  }));

  if (actions.length === 0) return <View style={style}>{children}</View>;

  return (
    <View style={style}>
      {/* Action strip revealed behind the sliding card */}
      <View style={styles.actionsRow} pointerEvents="box-none">
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.action, { backgroundColor: action.background, width: SWIPE_ACTION_WIDTH }]}
            onPress={() => {
              close();
              action.onPress();
            }}
            accessibilityLabel={action.label}
          >
            <MaterialCommunityIcons name={action.icon} size={22} color={action.foreground ?? '#FFFFFF'} />
            <Text numberOfLines={1} style={[styles.actionLabel, { color: action.foreground ?? '#FFFFFF', fontFamily: typography.families.semibold }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={frontStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    // Trailing edge — flips automatically in RTL
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderRadius: 16,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
  },
});
