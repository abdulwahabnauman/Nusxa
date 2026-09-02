import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { lightTokens, darkTokens, ThemeMode, elderlyTokens } from './tokens';
import { getTypography, Typography } from './typography';
import { spacing, borderRadius, elderlySpacing, elderlyBorderRadius } from './spacing';
import { useThemeStore } from '../stores/theme-store';
import { useSettingsStore } from '../stores/settings-store';

/** Custom font family used for Urdu (Nastaliq script), loaded via expo-font */
export const URDU_FONT_FAMILY = 'NotoNastaliqUrdu';

interface ThemeContextValue {
  colors: any;
  typography: Typography;
  spacing: typeof spacing | typeof elderlySpacing;
  borderRadius: typeof borderRadius | typeof elderlyBorderRadius;
  mode: ThemeMode;
  isDark: boolean;
  isElderly: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((s) => s.preference);
  const elderlyMode = useThemeStore((s) => s.elderlyMode);
  const highContrast = useThemeStore((s) => s.highContrast);
  const language = useSettingsStore((s) => s.language);

  // Respect the iOS "Bold Text" accessibility setting: Latin faces shift one
  // weight up while it is on. Android has no equivalent setting, so this
  // stays false there and nothing changes.
  const [systemBoldText, setSystemBoldText] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AccessibilityInfo.isBoldTextEnabled()
      .then((enabled) => {
        if (mounted) setSystemBoldText(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('boldTextChanged', (enabled) => {
      setSystemBoldText(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const resolvedMode: ThemeMode = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => {
    // Use elderly colors if elderly mode is enabled
    const baseColors = resolvedMode === 'dark' ? darkTokens : lightTokens;
    const elderlyColors = resolvedMode === 'dark' ? elderlyTokens.dark : elderlyTokens.light;
    // High-contrast mode reuses the boosted elderly palette without the
    // large-text/large-spacing scaling — colors only.
    const useEnhancedColors = elderlyMode || highContrast;
    // Apply Nastaliq font when Urdu is selected
    const fontFamily = language === 'ur' ? URDU_FONT_FAMILY : undefined;

    return {
      colors: useEnhancedColors ? elderlyColors : baseColors,
      typography: getTypography(elderlyMode, fontFamily, systemBoldText),
      spacing: elderlyMode ? elderlySpacing : spacing,
      borderRadius: elderlyMode ? elderlyBorderRadius : borderRadius,
      mode: resolvedMode,
      isDark: resolvedMode === 'dark',
      isElderly: elderlyMode,
    };
  }, [resolvedMode, elderlyMode, highContrast, language, systemBoldText]);

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
