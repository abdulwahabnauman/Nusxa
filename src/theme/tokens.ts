export const lightTokens = {
  background: {
    primary: '#FAFAF9',
    surface: '#FFFFFF',
    subtle: '#F3F3F0',
  },
  text: {
    primary: '#1F1F1E',
    secondary: '#686863',
    disabled: '#999993',
  },
  border: {
    default: '#E5E5E0',
    strong: '#D2D2CC',
  },
  accent: {
    primary: '#2563EB',
    hover: '#1D4ED8',
    subtle: '#EFF6FF',
  },
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
    disabled: '#73736E',
  },
  border: {
    default: '#242424',
    strong: '#383838',
  },
  accent: {
    primary: '#60A5FA',
    hover: '#93C5FD',
    subtle: '#172554',
  },
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#38BDF8',
} as const;

export type ThemeTokens = typeof lightTokens;

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

export type MedicineCategory = keyof typeof categoryColors.light;
