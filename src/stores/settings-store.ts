import { create } from 'zustand';
import { getProfile, updateProfile } from '../db/repositories/profile';

type Language = 'en' | 'ur';

interface SettingsState {
  language: Language;
  notificationsEnabled: boolean;
  reminderEscalation: boolean;
  reducedMotion: boolean;
  setLanguage: (lang: Language) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderEscalation: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
}

// Helper function to save settings to database
const saveSettingsToDatabase = async (state: SettingsState) => {
  try {
    await updateProfile({
      language: state.language,
      notifications_enabled: state.notificationsEnabled ? 1 : 0,
      reduced_motion: state.reducedMotion ? 1 : 0,
    });
  } catch (error) {
    console.error('Failed to save settings to database:', error);
  }
};

// Load settings from database
const loadSettingsFromDatabase = async (): Promise<Partial<SettingsState>> => {
  try {
    const profile = await getProfile();
    if (profile) {
      return {
        language: (profile.language as Language) || 'en',
        notificationsEnabled: profile.notifications_enabled !== 0,
        reducedMotion: profile.reduced_motion !== 0,
      };
    }
  } catch (error) {
    // Silently fail - database might not be initialized yet
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('Database not initialized')) {
      console.debug('Settings not loaded from database (may be initializing):', error);
    }
  }
  return {};
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Load settings from database on initialization (side effect)
  loadSettingsFromDatabase().then((initialSettings) => {
    set({
      language: initialSettings.language || 'en',
      notificationsEnabled: initialSettings.notificationsEnabled ?? true,
      reducedMotion: initialSettings.reducedMotion ?? false,
    });
  });

  return {
    // Default values (will be overwritten by loaded values)
    language: 'en',
    notificationsEnabled: true,
    reminderEscalation: true,
    reducedMotion: false,
    
    setLanguage: (language) => {
      set({ language });
      saveSettingsToDatabase(get());
    },
    
    setNotificationsEnabled: (notificationsEnabled) => {
      set({ notificationsEnabled });
      saveSettingsToDatabase(get());
    },
    
    setReminderEscalation: (reminderEscalation) => {
      set({ reminderEscalation });
    },
    
    setReducedMotion: (reducedMotion) => {
      set({ reducedMotion });
      saveSettingsToDatabase(get());
    },
  };
});
