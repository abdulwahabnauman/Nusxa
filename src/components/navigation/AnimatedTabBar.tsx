/**
 * AnimatedTabBar — custom bottom tab bar with a snappy icon bounce and a
 * label crossfade on tab focus. Replaces the default bar; honors reduced
 * motion by skipping all entrance animation.
 */

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useSettingsStore } from '../../stores/settings-store';

interface TabButtonProps {
  focused: boolean;
  color: string;
  label: string;
  icon: React.ReactNode;
  labelStyle: object;
  onPress: () => void;
  onLongPress: () => void;
}

function TabButton({ focused, color, label, icon, labelStyle, onPress, onLongPress }: TabButtonProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  // Springy bounce when the tab gains focus
  useEffect(() => {
    if (focused && !reducedMotion) {
      scale.value = withSequence(
        withSpring(1.18, { damping: 13, stiffness: 480 }),
        withSpring(1, { damping: 17, stiffness: 480 })
      );
    }
  }, [focused, reducedMotion, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      activeOpacity={0.8}
    >
      <Animated.View style={iconStyle}>{icon}</Animated.View>
      {/* key flip forces the crossfade entrance on focus change */}
      <Animated.View key={focused ? 'on' : 'off'} entering={reducedMotion ? undefined : FadeIn.duration(160)}>
        <Text
          numberOfLines={1}
          style={[
            labelStyle,
            { color, fontWeight: focused ? '600' : '500' },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  // Urdu Nastaliq script needs extra line height to avoid clipping
  const isRTL = useSettingsStore((s) => s.language) === 'ur';

  return (
    <View
      accessibilityRole="tabbar"
      style={[
        styles.bar,
        {
          backgroundColor: colors.background.surface,
          borderTopColor: colors.border.default,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const focused = state.index === index;
        const color = focused ? colors.accent.primary : colors.text.secondary;
        const label: string =
          typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabButton
            key={route.key}
            focused={focused}
            color={color}
            label={label}
            icon={
              options.tabBarIcon
                ? options.tabBarIcon({ focused, color, size: 22 })
                : null
            }
            labelStyle={{
              fontSize: typography.sizes.xs,
              lineHeight: isRTL ? 20 : 16,
              marginTop: 2,
            }}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
