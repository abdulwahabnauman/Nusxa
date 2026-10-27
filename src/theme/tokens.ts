export const lightTokens = {
  background: {
    primary: '#FAFAF9',
    surface: '#FFFFFF',
    subtle: '#F3F3F0',
  },
  text: {
    primary: '#1F1F1E',
    // 7:1 on the ground — keeps secondary copy clearly above the muted tier.
    secondary: '#57574F',
    // 4.9:1 on the app ground — still reads as muted but stays legible for
    // hints, placeholders and empty-state copy.
    disabled: '#6E6E69',
  },
  border: {
    // Card and row edges stay quiet (1.2:1); controls get a separate step
    // that clears 3:1 so inputs and outline buttons read as interactive.
    default: '#E5E5E0',
    strong: '#D2D2CC',
    control: '#8F8F89',
  },
  accent: {
    primary: '#2563EB',
    hover: '#1D4ED8',
    subtle: '#EFF6FF',
  },
  /** Label/icon colour on an accent fill */
  onAccent: '#FFFFFF',
  /** Label/icon colour on a success/warning/error fill */
  onStatus: '#FFFFFF',
  success: '#15803D',
  warning: '#B45309',
  error: '#B91C1C',
  info: '#0369A1',
} as const;

export const darkTokens = {
  background: {
    primary: '#000000',
    surface: '#0F0F0F',
    subtle: '#171717',
  },
  text: {
    primary: '#F5F5F3',
    secondary: '#B5B5AF',
    // 5.9:1 on the surface — placeholders and meta must not disappear.
    disabled: '#8F8F89',
  },
  border: {
    default: '#242424',
    strong: '#383838',
    control: '#666666',
  },
  accent: {
    primary: '#4A90E2',
    hover: '#6BA5EF',
    subtle: '#172554',
  },
  // Dark-mode accent/status fills are light hues, so their labels flip to
  // near-black instead of white (white on #4A90E2 is only 2.9:1).
  onAccent: '#0B0B0B',
  onStatus: '#0B0B0B',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#38BDF8',
} as const;

type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

/** Structural shape shared by every palette (light, dark, elderly, contrast) */
export type ThemeTokens = Widen<typeof lightTokens>;

export type ThemeMode = 'light' | 'dark';

/** Medicine category color mappings per theme */
export const categoryColors = {
  light: {
    'blood-pressure': '#2563EB',
    antibiotic: '#15803D',
    painkiller: '#B45309',
    vitamins: '#0D9488',
    default: '#686863',
  },
  dark: {
    'blood-pressure': '#93C5FD',
    antibiotic: '#86EFAC',
    painkiller: '#FCD34D',
    vitamins: '#5EEAD4',
    default: '#B5B5AF',
  },
} as const;

/** Elderly mode theme - enhanced for better visibility */
export const elderlyTokens = {
  light: {
    background: {
      primary: '#FFFFFF',
      surface: '#FAFAFA',
      subtle: '#F3F3F0',
    },
    text: {
      primary: '#000000', // Pure black for maximum contrast
      secondary: '#333333',
      disabled: '#666666',
    },
    border: {
      default: '#CCCCCC',
      strong: '#999999',
      // Elderly mode needs noticeably stronger control outlines.
      control: '#767676',
    },
    accent: {
      primary: '#0057FF', // Stronger blue (higher contrast)
      hover: '#0044CC',
      subtle: '#E6F0FF',
    },
    onAccent: '#FFFFFF',
    onStatus: '#FFFFFF',
    success: '#1B7A2D',
    warning: '#C2410C', // 5.2:1 on white; the previous orange failed as text
    error: '#AA1515',
    info: '#025C91',
  },
  dark: {
    background: {
      primary: '#121212',
      surface: '#1E1E1E',
      subtle: '#2A2A2A',
    },
    text: {
      primary: '#FFFFFF', // Pure white
      secondary: '#E0E0E0',
      disabled: '#9E9E9E',
    },
    border: {
      default: '#3C3C3C',
      strong: '#555555',
      control: '#8A8A8A',
    },
    accent: {
      primary: '#4DA3FF', // Brighter blue for dark mode
      hover: '#6AB3FF',
      subtle: '#1A2A3D',
    },
    onAccent: '#0B0B0B',
    onStatus: '#0B0B0B',
    success: '#5DD873',
    warning: '#FFAE42',
    error: '#FF8A80',
    info: '#6BD0FE',
  },
} as const;

export type MedicineCategory = keyof typeof categoryColors.light;

const STRENGTH_COLORS = ['#2563EB', '#0891B2', '#B45309', '#B91C1C'];

/**
 * Deterministic color for a strength label ("500 mg", "10ml", …) so each
 * strength of the same medicine always renders with the same hue.
 */
export function strengthColor(strength: string | null | undefined): string | null {
  if (!strength) return null;
  const match = strength.match(/\d+/);
  if (!match) return STRENGTH_COLORS[0] ?? '#2563EB';
  const value = parseInt(match[0] ?? '0', 10);
  if (value < 100) return STRENGTH_COLORS[0] ?? '#2563EB';
  if (value < 500) return STRENGTH_COLORS[1] ?? '#0891B2';
  if (value < 1000) return STRENGTH_COLORS[2] ?? '#B45309';
  return STRENGTH_COLORS[3] ?? '#B91C1C';
}
