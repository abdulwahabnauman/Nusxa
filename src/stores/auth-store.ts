import { create } from 'zustand';
import type { Profile } from '../types/models';

interface AuthState {
  profile: Profile | null;
  isLoaded: boolean;
  setProfile: (profile: Profile) => void;
  updateProfile: (partial: Partial<Profile>) => void;
  setLoaded: (loaded: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isLoaded: false,
  setProfile: (profile) => set({ profile, isLoaded: true }),
  updateProfile: (partial) =>
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...partial } : null,
    })),
  setLoaded: (isLoaded) => set({ isLoaded }),
}));
