import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { elderlyButtonSpacing } from '../../theme/spacing';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  largeTouchTarget?: boolean; // For elderly mode - ensures minimum touch target size
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  largeTouchTarget = false,
}: ButtonProps) {
  const { colors, typography, borderRadius, spacing, isElderly } = useTheme();
  const reducedMotion = useReducedMotion();

  // In elderly mode the font size is already bumped up; using the full
  // elderlySpacing for padding on top would compound into oversized
  // buttons, so padding growth is capped with a dedicated smaller scale.
  const pad = isElderly ? elderlyButtonSpacing : spacing;

  // Press feedback: a quick spring scale-down on touch
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const handlePressIn = () => {
    if (!reducedMotion) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const containerStyles: ViewStyle[] = [
    styles.base,
    { borderRadius: borderRadius.md },
  ];

  // Size
  if (size === 'sm') {
    containerStyles.push({ paddingVertical: pad.sm, paddingHorizontal: pad.base });
  } else if (size === 'lg') {
    containerStyles.push({ paddingVertical: pad.base, paddingHorizontal: pad.xl });
  } else {
    containerStyles.push({ paddingVertical: pad.md, paddingHorizontal: pad.xl });
  }

  // Variant colors
  let bgColor: string;
  let textColor: string;
  let borderColor: string | undefined;

  switch (variant) {
    case 'primary':
      bgColor = disabled ? colors.border.strong : colors.accent.primary;
      textColor = '#FFFFFF';
      break;
    case 'secondary':
      bgColor = 'transparent';
      textColor = disabled ? colors.text.disabled : colors.accent.primary;
      borderColor = colors.border.strong;
      break;
    case 'ghost':
      // Subtle filled container + hairline border so ghost actions still
      // read as buttons instead of bare text.
      bgColor = colors.background.subtle;
      textColor = disabled ? colors.text.disabled : colors.text.primary;
      borderColor = colors.border.default;
      break;
    case 'danger':
      bgColor = disabled ? colors.border.strong : colors.error;
      textColor = '#FFFFFF';
      break;
    default:
      bgColor = colors.accent.primary;
      textColor = '#FFFFFF';
  }

  containerStyles.push({
    backgroundColor: bgColor,
    borderColor: borderColor ?? 'transparent',
    borderWidth: borderColor ? 1 : 0,
    opacity: disabled && variant !== 'secondary' && variant !== 'ghost' ? 0.6 : 1,
  });

  if (style) containerStyles.push(style);

  const textStyles: TextStyle[] = [
    typography.button,
    { color: textColor },
    size === 'sm' ? { fontSize: typography.sizes.sm } : {},
    size === 'lg' ? { fontSize: typography.sizes.lg } : {},
  ];

  return (
    <AnimatedTouchable
      style={[containerStyles, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      // Ensure minimum touch target of 44x44 pixels for accessibility
      hitSlop={largeTouchTarget ? { top: 10, bottom: 10, left: 10, right: 10 } : undefined}
    >
      {loading ? (
        <ActivityIndicator
          color={textColor}
          size="small"
          accessibilityLabel="Loading"
        />
      ) : (
        <React.Fragment>
          {icon}
          <Text style={[textStyles, icon ? { marginLeft: spacing.sm } : {}]}>
            {title}
          </Text>
        </React.Fragment>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
});
