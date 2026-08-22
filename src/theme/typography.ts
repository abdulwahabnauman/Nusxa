import { TextStyle } from 'react-native';

const baseFontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

const elderlyFontSize = {
  xs: 14,
  sm: 16,
  base: 18,
  lg: 20,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

export type FontSizeKey = keyof typeof baseFontSize;

const baseLineHeight = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 28,
  xl: 28,
  '2xl': 32,
  '3xl': 36,
} as const;

const weights = {
  regular: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
} as const;

export function getTypography(elderly: boolean) {
  const sizes = elderly ? elderlyFontSize : baseFontSize;

  return {
    sizes,
    weights,
    heading: {
      h1: {
        fontSize: sizes['3xl'],
        lineHeight: 36,
        fontWeight: weights.bold,
      } as TextStyle,
      h2: {
        fontSize: sizes['2xl'],
        lineHeight: 32,
        fontWeight: weights.bold,
      } as TextStyle,
      h3: {
        fontSize: sizes.xl,
        lineHeight: 28,
        fontWeight: weights.semibold,
      } as TextStyle,
      h4: {
        fontSize: sizes.lg,
        lineHeight: 28,
        fontWeight: weights.semibold,
      } as TextStyle,
    },
    body: {
      lg: {
        fontSize: sizes.lg,
        lineHeight: 28,
        fontWeight: weights.regular,
      } as TextStyle,
      base: {
        fontSize: sizes.base,
        lineHeight: 24,
        fontWeight: weights.regular,
      } as TextStyle,
      sm: {
        fontSize: sizes.sm,
        lineHeight: 20,
        fontWeight: weights.regular,
      } as TextStyle,
      xs: {
        fontSize: sizes.xs,
        lineHeight: 16,
        fontWeight: weights.regular,
      } as TextStyle,
    },
    label: {
      base: {
        fontSize: sizes.sm,
        lineHeight: 20,
        fontWeight: weights.medium,
      } as TextStyle,
      sm: {
        fontSize: sizes.xs,
        lineHeight: 16,
        fontWeight: weights.medium,
      } as TextStyle,
    },
    button: {
      fontSize: sizes.base,
      lineHeight: 24,
      fontWeight: weights.semibold,
    } as TextStyle,
  };
}

export type Typography = ReturnType<typeof getTypography>;
