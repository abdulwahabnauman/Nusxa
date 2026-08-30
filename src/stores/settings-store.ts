import { create } from 'zustand';
import { getProfile, updateProfile } from '../db/repositories/profile';

type Language = 'en' | 'ur';

interface SettingsState {
  language: Language;
  notificationsEnabled: boolean;
  reminderEscalation: boolean;
  reducedMotion: boolean;
  easternNumerals: boolean;
  useOwnKeys: boolean;
  snoozeMinutes: number;
  setLanguage: (lang: Language) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderEscalation: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setEasternNumerals: (enabled: boolean) => void;
  setUseOwnKeys: (enabled: boolean) => void;
  setSnoozeMinutes: (minutes: number) => void;
}

// Helper function to save settings to database
const saveSettingsToDatabase = async (state: SettingsState) => {
  try {
    await updateProfile({
      language: state.language,
      notifications_enabled: state.notificationsEnabled,
      reduced_motion: state.reducedMotion,
      eastern_numerals: state.easternNumerals,
      snooze_minutes: state.snoozeMinutes,
      reminder_escalation: state.reminderEscalation,
      use_own_keys: state.useOwnKeys,
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
        notificationsEnabled: !!profile.notifications_enabled,
        reducedMotion: !!profile.reduced_motion,
        easternNumerals: !!profile.eastern_numerals,
        snoozeMinutes: profile.snooze_minutes ?? 10,
        reminderEscalation: profile.reminder_escalation ?? true,
        useOwnKeys: profile.use_own_keys ?? false,
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

let hydrationRan = false;

/**
 * Re-read persisted settings once the database is ready.
 * The module-level load below usually runs before openDatabase() and falls
 * back to defaults, so the root layout calls this right after the DB opens
 * to guarantee the saved language/preferences win over the defaults.
 */
export async function hydrateSettings(): Promise<void> {
  if (hydrationRan) return;
  hydrationRan = true;
  const loaded = await loadSettingsFromDatabase();
  if (Object.keys(loaded).length === 0) {
    // No profile row yet (fresh install pre-onboarding) — allow a retry
    // on the next call instead of locking in the defaults.
    hydrationRan = false;
    return;
  }
  useSettingsStore.setState({
    language: loaded.language || 'en',
    notificationsEnabled: loaded.notificationsEnabled ?? true,
    reducedMotion: loaded.reducedMotion ?? false,
    easternNumerals: loaded.easternNumerals ?? false,
    snoozeMinutes: loaded.snoozeMinutes ?? 10,
    reminderEscalation: loaded.reminderEscalation ?? true,
    useOwnKeys: loaded.useOwnKeys ?? false,
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Best-effort load at import time. This usually races openDatabase() and
  // resolves with defaults; hydrateSettings() re-applies the saved values
  // once the DB is ready, so the user's language survives cold starts.
  loadSettingsFromDatabase().then((initialSettings) => {
    if (Object.keys(initialSettings).length === 0) return;
    set({
      language: initialSettings.language || 'en',
      notificationsEnabled: initialSettings.notificationsEnabled ?? true,
      reducedMotion: initialSettings.reducedMotion ?? false,
      easternNumerals: initialSettings.easternNumerals ?? false,
      snoozeMinutes: initialSettings.snoozeMinutes ?? 10,
      reminderEscalation: initialSettings.reminderEscalation ?? true,
      useOwnKeys: initialSettings.useOwnKeys ?? false,
    });
  });

  return {
    // Default values (will be overwritten by loaded values)
    language: 'en',
    notificationsEnabled: true,
    reminderEscalation: true,
    reducedMotion: false,
    easternNumerals: false,
    useOwnKeys: false,
    snoozeMinutes: 10,
    
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
      saveSettingsToDatabase(get());
    },
    
    setReducedMotion: (reducedMotion) => {
      set({ reducedMotion });
      saveSettingsToDatabase(get());
    },

    setEasternNumerals: (easternNumerals) => {
      set({ easternNumerals });
      saveSettingsToDatabase(get());
    },

    setUseOwnKeys: (useOwnKeys) => {
      set({ useOwnKeys });
      saveSettingsToDatabase(get());
    },

    setSnoozeMinutes: (snoozeMinutes) => {
      set({ snoozeMinutes });
      saveSettingsToDatabase(get());
    },
  };
});
