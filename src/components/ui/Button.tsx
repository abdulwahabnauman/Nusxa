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
import { useTheme } from '../../theme/provider';

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
  const { colors, typography, borderRadius, spacing } = useTheme();

  const containerStyles: ViewStyle[] = [
    styles.base,
    { borderRadius: borderRadius.md },
  ];

  // Size
  if (size === 'sm') {
    containerStyles.push({ paddingVertical: spacing.sm, paddingHorizontal: spacing.base });
  } else if (size === 'lg') {
    containerStyles.push({ paddingVertical: spacing.base, paddingHorizontal: spacing.xl });
  } else {
    containerStyles.push({ paddingVertical: spacing.md, paddingHorizontal: spacing.xl });
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
      bgColor = 'transparent';
      textColor = disabled ? colors.text.disabled : colors.text.primary;
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
    <TouchableOpacity
      style={containerStyles}
      onPress={onPress}
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
    </TouchableOpacity>
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
