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
  // Nastaliq script has deep descenders, so line heights stay enlarged when it
  // is active — but Nastaliq glyphs render visually large, so sizes shrink a
  // little and includeFontPadding is dropped to keep Urdu text from ballooning.
  const font = fontFamily ? { fontFamily, includeFontPadding: false } : {};
  const fs = (value: number) => (fontFamily ? Math.round(value * 0.9) : value);
  const lh = (value: number) => (fontFamily ? Math.round(value * 1.6) : value);

  return {
    sizes,
    weights,
    heading: {
      h1: {
        ...font,
        fontSize: fs(sizes['3xl']),
        lineHeight: lh(36),
        fontWeight: weights.bold,
      } as TextStyle,
      h2: {
        ...font,
        fontSize: fs(sizes['2xl']),
        lineHeight: lh(32),
        fontWeight: weights.bold,
      } as TextStyle,
      h3: {
        ...font,
        fontSize: fs(sizes.xl),
        lineHeight: lh(28),
        fontWeight: weights.semibold,
      } as TextStyle,
      h4: {
        ...font,
        fontSize: fs(sizes.lg),
        lineHeight: lh(28),
        fontWeight: weights.semibold,
      } as TextStyle,
    },
    body: {
      lg: {
        ...font,
        fontSize: fs(sizes.lg),
        lineHeight: lh(28),
        fontWeight: weights.regular,
      } as TextStyle,
      base: {
        ...font,
        fontSize: fs(sizes.base),
        lineHeight: lh(24),
        fontWeight: weights.regular,
      } as TextStyle,
      sm: {
        ...font,
        fontSize: fs(sizes.sm),
        lineHeight: lh(20),
        fontWeight: weights.regular,
      } as TextStyle,
      xs: {
        ...font,
        fontSize: fs(sizes.xs),
        lineHeight: lh(16),
        fontWeight: weights.regular,
      } as TextStyle,
    },
    label: {
      base: {
        ...font,
        fontSize: fs(sizes.sm),
        lineHeight: lh(20),
        fontWeight: weights.medium,
      } as TextStyle,
      sm: {
        ...font,
        fontSize: fs(sizes.xs),
        lineHeight: lh(16),
        fontWeight: weights.medium,
      } as TextStyle,
    },
    button: {
      ...font,
      fontSize: fs(sizes.base),
      lineHeight: lh(24),
      fontWeight: weights.semibold,
    } as TextStyle,
  };
}

export type Typography = ReturnType<typeof getTypography>;
