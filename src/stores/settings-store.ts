import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { getProfile, updateProfile } from '../db/repositories/profile';

type Language = 'en' | 'ur';

const DUPLICATE_INGREDIENTS_KEY = 'nusxa_pref_duplicate_ingredients';
const FOOD_TIMING_KEY = 'nusxa_pref_food_timing';

interface SettingsState {
  language: Language;
  notificationsEnabled: boolean;
  reminderEscalation: boolean;
  reducedMotion: boolean;
  /** Derived from language: Urdu always renders Eastern Arabic-Urdu digits */
  easternNumerals: boolean;
  useOwnKeys: boolean;
  snoozeMinutes: number;
  duplicateIngredientAlerts: boolean;
  foodTimingAlerts: boolean;
  setLanguage: (lang: Language) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderEscalation: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setUseOwnKeys: (enabled: boolean) => void;
  setSnoozeMinutes: (minutes: number) => void;
  setDuplicateIngredientAlerts: (enabled: boolean) => void;
  setFoodTimingAlerts: (enabled: boolean) => void;
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
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Database not initialized')) {
      // Boot race: a preference changed before openDatabase() finished —
      // nothing to persist yet, and the UI isn't interactive until after
      // init, so there is no user change to lose.
      console.debug('Settings save skipped: database not ready yet');
      return;
    }
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
        easternNumerals: ((profile.language as Language) || 'en') === 'ur',
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
  let duplicateIngredientAlerts = false;
  let foodTimingAlerts = false;
  try {
    duplicateIngredientAlerts = (await SecureStore.getItemAsync(DUPLICATE_INGREDIENTS_KEY)) === '1';
    foodTimingAlerts = (await SecureStore.getItemAsync(FOOD_TIMING_KEY)) === '1';
  } catch {}

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
    easternNumerals: (loaded.language || 'en') === 'ur',
    snoozeMinutes: loaded.snoozeMinutes ?? 10,
    reminderEscalation: loaded.reminderEscalation ?? true,
    useOwnKeys: loaded.useOwnKeys ?? false,
    duplicateIngredientAlerts,
    foodTimingAlerts,
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Best-effort load at import time. This usually races openDatabase() and
  // resolves with defaults; hydrateSettings() re-applies the saved values
  // once the DB is ready, so the user's language survives cold starts.
  loadSettingsFromDatabase().then(async (initialSettings) => {
    let duplicateIngredientAlerts = false;
    let foodTimingAlerts = false;
    try {
      duplicateIngredientAlerts = (await SecureStore.getItemAsync(DUPLICATE_INGREDIENTS_KEY)) === '1';
      foodTimingAlerts = (await SecureStore.getItemAsync(FOOD_TIMING_KEY)) === '1';
    } catch {}

    if (Object.keys(initialSettings).length === 0) return;
    set({
      language: initialSettings.language || 'en',
      notificationsEnabled: initialSettings.notificationsEnabled ?? true,
      reducedMotion: initialSettings.reducedMotion ?? false,
      easternNumerals: (initialSettings.language || 'en') === 'ur',
      snoozeMinutes: initialSettings.snoozeMinutes ?? 10,
      reminderEscalation: initialSettings.reminderEscalation ?? true,
      useOwnKeys: initialSettings.useOwnKeys ?? false,
      duplicateIngredientAlerts,
      foodTimingAlerts,
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
    duplicateIngredientAlerts: false,
    foodTimingAlerts: false,
    
    setLanguage: (language) => {
      // Numeral style follows the language: Urdu always shows ۰۱۲۳۴۵۶۷۸۹
      set({ language, easternNumerals: language === 'ur' });
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

    setUseOwnKeys: (useOwnKeys) => {
      set({ useOwnKeys });
      saveSettingsToDatabase(get());
    },

    setSnoozeMinutes: (snoozeMinutes) => {
      set({ snoozeMinutes });
      saveSettingsToDatabase(get());
    },

    setDuplicateIngredientAlerts: (duplicateIngredientAlerts) => {
      set({ duplicateIngredientAlerts });
      SecureStore.setItemAsync(DUPLICATE_INGREDIENTS_KEY, duplicateIngredientAlerts ? '1' : '0').catch(() => {});
    },

    setFoodTimingAlerts: (foodTimingAlerts) => {
      set({ foodTimingAlerts });
      SecureStore.setItemAsync(FOOD_TIMING_KEY, foodTimingAlerts ? '1' : '0').catch(() => {});
    },
  };
});
