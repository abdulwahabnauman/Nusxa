import { create } from 'zustand';
import type { Profile } from '../types/models';

interface AuthState {
  profile: Profile | null;
  isLoaded: boolean;
  /** App lock feature is set up (hydrated from SecureStore at startup) */
  appLockEnabled: boolean;
  /** App is currently locked behind the PIN/biometric gate */
  isLocked: boolean;
  setProfile: (profile: Profile) => void;
  updateProfile: (partial: Partial<Profile>) => void;
  setLoaded: (loaded: boolean) => void;
  setAppLockEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isLoaded: false,
  appLockEnabled: false,
  isLocked: false,
  setProfile: (profile) => set({ profile, isLoaded: true }),
  updateProfile: (partial) =>
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...partial } : null,
    })),
  setLoaded: (isLoaded) => set({ isLoaded }),
  setAppLockEnabled: (appLockEnabled) => set({ appLockEnabled }),
  setLocked: (isLocked) => set({ isLocked }),
}));
