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

export function getTypography(elderly: boolean, fontFamily?: string) {
  const sizes = elderly ? elderlyFontSize : baseFontSize;
  // Optional custom family (e.g. Nastaliq for Urdu) applied to every text style.
  // Nastaliq script has deep descenders, so line heights are enlarged when it is active.
  const font = fontFamily ? { fontFamily } : {};
  const lh = (value: number) => (fontFamily ? Math.round(value * 1.9) : value);

  return {
    sizes,
    weights,
    heading: {
      h1: {
        ...font,
        fontSize: sizes['3xl'],
        lineHeight: lh(36),
        fontWeight: weights.bold,
      } as TextStyle,
      h2: {
        ...font,
        fontSize: sizes['2xl'],
        lineHeight: lh(32),
        fontWeight: weights.bold,
      } as TextStyle,
      h3: {
        ...font,
        fontSize: sizes.xl,
        lineHeight: lh(28),
        fontWeight: weights.semibold,
      } as TextStyle,
      h4: {
        ...font,
        fontSize: sizes.lg,
        lineHeight: lh(28),
        fontWeight: weights.semibold,
      } as TextStyle,
    },
    body: {
      lg: {
        ...font,
        fontSize: sizes.lg,
        lineHeight: lh(28),
        fontWeight: weights.regular,
      } as TextStyle,
      base: {
        ...font,
        fontSize: sizes.base,
        lineHeight: lh(24),
        fontWeight: weights.regular,
      } as TextStyle,
      sm: {
        ...font,
        fontSize: sizes.sm,
        lineHeight: lh(20),
        fontWeight: weights.regular,
      } as TextStyle,
      xs: {
        ...font,
        fontSize: sizes.xs,
        lineHeight: lh(16),
        fontWeight: weights.regular,
      } as TextStyle,
    },
    label: {
      base: {
        ...font,
        fontSize: sizes.sm,
        lineHeight: lh(20),
        fontWeight: weights.medium,
      } as TextStyle,
      sm: {
        ...font,
        fontSize: sizes.xs,
        lineHeight: lh(16),
        fontWeight: weights.medium,
      } as TextStyle,
    },
    button: {
      ...font,
      fontSize: sizes.base,
      lineHeight: lh(24),
      fontWeight: weights.semibold,
    } as TextStyle,
  };
}

export type Typography = ReturnType<typeof getTypography>;
