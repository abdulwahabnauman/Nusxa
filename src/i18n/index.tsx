import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { I18nManager } from 'react-native';
import { en, TranslationKeys } from './en';
import { ur } from './ur';
import { useSettingsStore } from '../stores/settings-store';

type Language = 'en' | 'ur';

interface I18nContextValue {
  t: TranslationKeys;
  language: Language;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
}

const translations: Record<Language, TranslationKeys> = { en, ur };

const I18nContext = createContext<I18nContextValue>({
  t: en,
  language: 'en',
  isRTL: false,
  setLanguage: () => {},
});

/** Hook to access translations and language state */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  
  // Provide safe fallback if language is undefined (during init)
  const safeLanguage = context.language || 'en';
  const safeTranslations = translations[safeLanguage] || en;
  const safeIsRTL = safeLanguage === 'ur';
  
  return {
    t: safeTranslations,
    language: safeLanguage,
    isRTL: safeIsRTL,
    setLanguage: context.setLanguage,
  };
}

/** Convenience hook — returns just the translation object */
export function useTranslation(): TranslationKeys {
  const { t } = useContext(I18nContext);
  
  // Safety check - ensure we never return undefined
  if (!t) {
    return en; // Default to English if language isn't loaded yet
  }
  
  return t;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = useSettingsStore((s) => s.language);
  const setLanguagePref = useSettingsStore((s) => s.setLanguage);

  const isRTL = language === 'ur';

  // Sync RN's built-in RTL flag when language changes
  useEffect(() => {
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(isRTL);
    }
  }, [isRTL]);

  const setLanguage = useCallback(
    (lang: Language) => {
      // Always call setLanguagePref - it will handle database readiness
      if (typeof setLanguagePref === 'function') {
        setLanguagePref(lang);
      }
      // If not a function yet, language won't be saved but UI will work
    },
    [],
  );

  const value: I18nContextValue = {
    t: translations[language],
    language,
    isRTL,
    setLanguage,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
