import { create } from 'zustand';
import { ThemeMode } from '../theme/tokens';

interface ThemeState {
  preference: ThemeMode | 'system';
  elderlyMode: boolean;
  setPreference: (pref: ThemeMode | 'system') => void;
  setElderlyMode: (enabled: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  elderlyMode: false,
  setPreference: (preference) => set({ preference }),
  setElderlyMode: (elderlyMode) => set({ elderlyMode }),
}));
