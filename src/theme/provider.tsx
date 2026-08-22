import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { lightTokens, darkTokens, ThemeTokens, ThemeMode } from './tokens';
import { getTypography, Typography } from './typography';
import { spacing, borderRadius } from './spacing';
import { useThemeStore } from '../stores/theme-store';

interface ThemeContextValue {
  colors: ThemeTokens;
  typography: Typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  mode: ThemeMode;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const elderlyMode = useThemeStore((s) => s.elderlyMode);

  const resolvedMode: ThemeMode = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = resolvedMode === 'dark' ? darkTokens : lightTokens;
    return {
      colors,
      typography: getTypography(elderlyMode),
      spacing,
      borderRadius,
      mode: resolvedMode,
      isDark: resolvedMode === 'dark',
    };
  }, [resolvedMode, elderlyMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
