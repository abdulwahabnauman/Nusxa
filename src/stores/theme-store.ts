import { create } from 'zustand';
import { ThemeMode } from '../theme/tokens';
import { getProfile, updateProfile } from '../db/repositories/profile';

interface ThemeState {
  preference: ThemeMode | 'system';
  elderlyMode: boolean;
  highContrast: boolean;
  setPreference: (pref: ThemeMode | 'system') => void;
  setElderlyMode: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  /** Apply the persisted preference on startup without writing back to the DB */
  restorePreference: (pref: ThemeMode | 'system') => void;
  loadFromDatabase: () => Promise<void>;
}

// Helper function to save theme preference to database
const saveThemeToDatabase = async (state: ThemeState) => {
  try {
    await updateProfile({
      elderly_mode: state.elderlyMode,
      high_contrast: state.highContrast,
      theme_preference: state.preference,
    });
  } catch (error) {
    console.error('Failed to save theme settings to database:', error);
  }
};

// Load theme settings from database
const loadThemeFromDatabase = async (): Promise<{ preference: ThemeMode | 'system'; elderlyMode: boolean; highContrast: boolean }> => {
  try {
    const profile = await getProfile();
    if (profile) {
      return {
        elderlyMode: profile.elderly_mode,
        highContrast: !!profile.high_contrast,
        preference: profile.theme_preference ?? 'system',
      };
    }
  } catch (error) {
    // Gracefully handle database not initialized errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('Database not initialized')) {
      console.error('Failed to load theme settings from database:', error);
    }
  }
  return { preference: 'system' as ThemeMode | 'system', elderlyMode: false, highContrast: false };
};

export const useThemeStore = create<ThemeState>((set) => {
  return {
    preference: 'system',
    elderlyMode: false,
    highContrast: false,

    setPreference: (preference: ThemeMode | 'system') => {
      set({ preference });
      const state = useThemeStore.getState();
      saveThemeToDatabase(state);
    },

    restorePreference: (preference: ThemeMode | 'system') => {
      set({ preference });
    },

    setElderlyMode: (elderlyMode: boolean) => {
      set({ elderlyMode });
      const state = useThemeStore.getState();
      saveThemeToDatabase(state);
    },

    setHighContrast: (highContrast: boolean) => {
      set({ highContrast });
      const state = useThemeStore.getState();
      saveThemeToDatabase(state);
    },

    loadFromDatabase: async () => {
      const settings = await loadThemeFromDatabase();
      set(settings);
    },
  };
});
