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
    primary: '#4A90E2',
    hover: '#6BA5EF',
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
    },
    accent: {
      primary: '#0057FF', // Stronger blue (higher contrast)
      hover: '#0044CC',
      subtle: '#E6F0FF',
    },
    success: '#1B7A2D',
    warning: '#FF4400', // More intense orange
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
    },
    accent: {
      primary: '#4DA3FF', // Brighter blue for dark mode
      hover: '#6AB3FF',
      subtle: '#1A2A3D',
    },
    success: '#5DD873',
    warning: '#FFAE42',
    error: '#FF8A80',
    info: '#6BD0FE',
  },
} as const;

export type MedicineCategory = keyof typeof categoryColors.light;
