import { Platform, TextStyle } from 'react-native';

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

/**
 * Bundled Inter faces, loaded in app/_layout.tsx via expo-font. Using the
 * same font files on both platforms makes text metrics identical on iOS and
 * Android — system fonts (SF Pro vs Roboto) measure differently and were the
 * source of cross-platform alignment drift.
 */
export const LATIN_FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  italic: 'Inter_400Regular_Italic',
  boldItalic: 'Inter_700Bold_Italic',
} as const;

export type FontFamilyKey = keyof typeof LATIN_FONTS;

type WeightKey = keyof typeof weights;

export function getTypography(elderly: boolean, fontFamily?: string) {
  const sizes = elderly ? elderlyFontSize : baseFontSize;
  const urdu = !!fontFamily;

  // Urdu (Nastaliq) has a single weight — every slot maps to the same family.
  const families: Record<FontFamilyKey, string> = urdu
    ? {
        regular: fontFamily!,
        medium: fontFamily!,
        semibold: fontFamily!,
        bold: fontFamily!,
        italic: fontFamily!,
        boldItalic: fontFamily!,
      }
    : { ...LATIN_FONTS };

  // Nastaliq glyphs render visually large, so sizes shrink a little, and
  // their deep descenders need generous line boxes. iOS clips tall glyphs
  // sooner than Android, so Urdu gets extra headroom there.
  const fs = (value: number) => (urdu ? Math.round(value * 0.9) : value);
  const lh = (value: number) =>
    urdu ? Math.round(value * (Platform.OS === 'ios' ? 1.8 : 1.6)) : value;

  // Latin text picks an explicit Inter face per weight (no fontWeight —
  // static faces would be double-bolded on Android otherwise). Urdu keeps
  // fontWeight so Android synthesizes the bolder headings.
  const face = (weight: WeightKey): TextStyle =>
    urdu
      ? { fontFamily: fontFamily!, includeFontPadding: false, fontWeight: weights[weight] }
      : { fontFamily: families[weight] };

  return {
    sizes,
    weights,
    families,
    heading: {
      h1: {
        ...face('bold'),
        fontSize: fs(sizes['3xl']),
        lineHeight: lh(36),
      } as TextStyle,
      h2: {
        ...face('bold'),
        fontSize: fs(sizes['2xl']),
        lineHeight: lh(32),
      } as TextStyle,
      h3: {
        ...face('semibold'),
        fontSize: fs(sizes.xl),
        lineHeight: lh(28),
      } as TextStyle,
      h4: {
        ...face('semibold'),
        fontSize: fs(sizes.lg),
        lineHeight: lh(28),
      } as TextStyle,
    },
    body: {
      lg: {
        ...face('regular'),
        fontSize: fs(sizes.lg),
        lineHeight: lh(28),
      } as TextStyle,
      base: {
        ...face('regular'),
        fontSize: fs(sizes.base),
        lineHeight: lh(24),
      } as TextStyle,
      sm: {
        ...face('regular'),
        fontSize: fs(sizes.sm),
        lineHeight: lh(20),
      } as TextStyle,
      xs: {
        ...face('regular'),
        fontSize: fs(sizes.xs),
        lineHeight: lh(16),
      } as TextStyle,
    },
    label: {
      base: {
        ...face('medium'),
        fontSize: fs(sizes.sm),
        lineHeight: lh(20),
      } as TextStyle,
      sm: {
        ...face('medium'),
        fontSize: fs(sizes.xs),
        lineHeight: lh(16),
      } as TextStyle,
    },
    button: {
      ...face('semibold'),
      fontSize: fs(sizes.base),
      lineHeight: lh(24),
    } as TextStyle,
  };
}

export type Typography = ReturnType<typeof getTypography>;
