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

/**
 * When iOS "Bold Text" is on, every Latin slot shifts one Inter face up the
 * ladder (regular→medium→semibold→bold). Urdu stays untouched: Nastaliq
 * ships as a single weight, so there is nothing heavier to load.
 */
const BOLD_SHIFT: Record<WeightKey, FontFamilyKey> = {
  regular: 'medium',
  medium: 'semibold',
  semibold: 'bold',
  bold: 'bold',
};

/**
 * Nastaliq ink reaches far beyond the font's own ascent/descent metrics, so a
 * line box sized like a Latin one slices glyph tops and bottoms off — seen on
 * device in Urdu mode as clipped row labels, subtitles and tab titles. Urdu
 * line height is therefore a multiple of its own font size, not of the Latin
 * line height. iOS clips tall glyphs a little sooner than Android.
 */
export const URDU_LINE_RATIO = Platform.OS === 'ios' ? 3.1 : 2.7;

export const urduLineHeight = (fontSize: number): number =>
  Math.round(fontSize * URDU_LINE_RATIO);

export function getTypography(elderly: boolean, fontFamily?: string, boldText = false) {
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
    : boldText
      ? {
          ...LATIN_FONTS,
          regular: LATIN_FONTS[BOLD_SHIFT.regular],
          medium: LATIN_FONTS[BOLD_SHIFT.medium],
          semibold: LATIN_FONTS[BOLD_SHIFT.semibold],
          bold: LATIN_FONTS[BOLD_SHIFT.bold],
        }
      : { ...LATIN_FONTS };

  // Nastaliq glyphs render visually large, so sizes shrink a little.
  const fs = (value: number) => (urdu ? Math.round(value * 0.9) : value);
  // Urdu line boxes come from urduLineHeight(): scaling the Latin line height
  // kept them near 2.4em, which the Nastaliq ink overflows in both directions.
  const lh = (latin: number, fontSize: number) =>
    urdu ? urduLineHeight(fontSize) : latin;

  // Latin text picks an explicit Inter face per weight (no fontWeight —
  // static faces would be double-bolded on Android otherwise). Urdu keeps
  // fontWeight so Android synthesizes the bolder headings, but Nastaliq
  // ships as a single weight: asking Android for 700 on the custom family
  // makes it substitute the system Naskh bold (the tab-screen titles
  // rendered flat on device), so cap Urdu at semibold. Android's default
  // includeFontPadding stays on: the extra metric padding is part of the
  // headroom Nastaliq needs, and turning it off clipped glyphs.
  const face = (weight: WeightKey): TextStyle =>
    urdu
      ? {
          fontFamily: fontFamily!,
          fontWeight: weights[weight === 'bold' ? 'semibold' : weight],
        }
      : { fontFamily: families[weight] };

  // iOS Text does not inherit alignment from the root `direction` style —
  // short or Latin-mixed lines stick to the left edge of their flex box.
  // Pin the alignment (and paragraph base direction) explicitly for Urdu.
  // Android must NOT get this: its Fabric TextLayoutManager swaps
  // NORMAL/OPPOSITE for RTL scripts, so an explicit `right` there flips
  // Urdu text to the left edge (regression seen on device). Android's
  // TextView already right-aligns RTL scripts by default.
  const rtlText: TextStyle =
    urdu && Platform.OS === 'ios'
      ? { textAlign: 'right', writingDirection: 'rtl' }
      : {};

  return {
    sizes,
    weights,
    families,
    heading: {
      h1: {
        ...face('bold'),
        ...rtlText,
        fontSize: fs(sizes['3xl']),
        lineHeight: lh(36, fs(sizes['3xl'])),
      } as TextStyle,
      h2: {
        ...face('bold'),
        ...rtlText,
        fontSize: fs(sizes['2xl']),
        lineHeight: lh(32, fs(sizes['2xl'])),
      } as TextStyle,
      h3: {
        ...face('semibold'),
        ...rtlText,
        fontSize: fs(sizes.xl),
        lineHeight: lh(28, fs(sizes.xl)),
      } as TextStyle,
      h4: {
        ...face('semibold'),
        ...rtlText,
        fontSize: fs(sizes.lg),
        lineHeight: lh(28, fs(sizes.lg)),
      } as TextStyle,
    },
    body: {
      lg: {
        ...face('regular'),
        ...rtlText,
        fontSize: fs(sizes.lg),
        lineHeight: lh(28, fs(sizes.lg)),
      } as TextStyle,
      base: {
        ...face('regular'),
        ...rtlText,
        fontSize: fs(sizes.base),
        lineHeight: lh(24, fs(sizes.base)),
      } as TextStyle,
      sm: {
        ...face('regular'),
        ...rtlText,
        fontSize: fs(sizes.sm),
        lineHeight: lh(20, fs(sizes.sm)),
      } as TextStyle,
      xs: {
        ...face('regular'),
        ...rtlText,
        fontSize: fs(sizes.xs),
        lineHeight: lh(16, fs(sizes.xs)),
      } as TextStyle,
    },
    label: {
      base: {
        ...face('medium'),
        ...rtlText,
        fontSize: fs(sizes.sm),
        lineHeight: lh(20, fs(sizes.sm)),
      } as TextStyle,
      sm: {
        ...face('medium'),
        ...rtlText,
        fontSize: fs(sizes.xs),
        lineHeight: lh(16, fs(sizes.xs)),
      } as TextStyle,
    },
    button: {
      ...face('semibold'),
      ...rtlText,
      fontSize: fs(sizes.base),
      lineHeight: lh(24, fs(sizes.base)),
    } as TextStyle,
  };
}

export type Typography = ReturnType<typeof getTypography>;
