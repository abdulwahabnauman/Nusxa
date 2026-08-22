import { create } from 'zustand';

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

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'en',
  notificationsEnabled: true,
  reminderEscalation: true,
  reducedMotion: false,
  setLanguage: (language) => set({ language }),
  setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
  setReminderEscalation: (reminderEscalation) => set({ reminderEscalation }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
}));
