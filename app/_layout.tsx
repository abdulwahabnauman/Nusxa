import React, { useEffect, useState } from 'react';
import { View, StyleSheet, LogBox, AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../src/theme/provider';
import { openDatabase } from '../src/db/database';
import { getProfile } from '../src/db/repositories/profile';
import { updateProfile } from '../src/db/repositories/profile';
import { useAuthStore } from '../src/stores/auth-store';
import { useSettingsStore, hydrateSettings } from '../src/stores/settings-store';
import { useThemeStore } from '../src/stores/theme-store';
import { configureNotifications, syncRefillNotifications } from '../src/utils/notifications';
import { dedupeActiveMedicines } from '../src/utils/savePrescription';
import { useNotificationResponseHandler } from '../src/hooks/useNotificationHandler';
import { I18nProvider } from '../src/i18n';
import { AnimatedSplash } from '../src/components/ui/AnimatedSplash';
import { BiometricLock } from '../src/components/ui/BiometricLock';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { GlobalToast } from '../src/components/ui/GlobalToast';
import { isAppLockEnabled } from '../src/utils/appLock';
import type { Profile } from '../src/types/models';

// keep the native splash up until we've swapped over to our own animated one
SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this fails the native splash just hides on its own, not worth crashing over
});

// Expo Go removed Android push-token support in SDK 53, and expo-notifications
// logs a scary-looking warning/error just for importing the module (its
// DevicePushTokenAutoRegistration side-effect fires at require time). Nusxa
// only uses LOCAL scheduled notifications, which work fine in Expo Go — so
// silence that false alarm there. Real dev builds/APKs never emit it.
if (Constants.appOwnership === 'expo') {
  LogBox.ignoreLogs([
    'expo-notifications: Android Push notifications',
    'functionality is not fully supported in Expo Go',
  ]);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppContent() {
  const { colors, mode } = useTheme();
  const { setProfile, setLoaded, profile, isLoaded } = useAuthStore();
  const appLockEnabled = useAuthStore((s) => s.appLockEnabled);
  const isLocked = useAuthStore((s) => s.isLocked);
  const setAppLockEnabled = useAuthStore((s) => s.setAppLockEnabled);
  const setLocked = useAuthStore((s) => s.setLocked);
  const [dbReady, setDbReady] = useState(false);
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const syncLanguage = useSettingsStore((s) => s.setLanguage);
  const syncElderlyMode = useThemeStore((s) => s.setElderlyMode);
  const syncHighContrast = useThemeStore((s) => s.setHighContrast);
  const restoreThemePreference = useThemeStore((s) => s.restorePreference);
  // Live layout direction — driven from JS so language switches flip the UI
  // instantly in both directions without needing an app restart.
  const language = useSettingsStore((s) => s.language);

  // Load the Nastaliq font used for Urdu text
  const [fontsLoaded] = useFonts({
    NotoNastaliqUrdu: require('../assets/fonts/NotoNastaliqUrdu.ttf'),
  });

  // Handle notification taps — navigate to medicine detail
  useNotificationResponseHandler();

  // hand off from the native static splash to our animated one the moment we can render
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    async function init() {
      try {
        // Initialize with minimal required services
        await configureNotifications();
        
        try {
          await openDatabase();
        } catch (dbError) {
          console.error('[Init] Database failed, retrying once:', dbError);
          try {
            await openDatabase();
          } catch (secondError) {
            console.error('[Init] Database failed again, app will run offline:', secondError);
          }
        }

        // The settings store's import-time load usually runs before the DB
        // opens and falls back to defaults — re-apply the saved values now so
        // the user's language/preferences survive a cold start.
        try {
          await hydrateSettings();
        } catch (hydrateError) {
          console.error('[Init] Settings hydration failed:', hydrateError);
        }

        // App lock lives in SecureStore (independent of the DB). When it is
        // set up, every cold start begins behind the lock gate.
        try {
          if (await isAppLockEnabled()) {
            setAppLockEnabled(true);
            setLocked(true);
          }
        } catch (lockError) {
          console.error('[Init] App lock check failed:', lockError);
        }

        // Remove duplicate medicines left over from re-scans that happened
        // before fuzzy matching existed (no-op once the list is clean).
        try {
          await dedupeActiveMedicines();
        } catch (dedupeError) {
          console.error('[Init] Duplicate cleanup failed:', dedupeError);
        }
        
        let existingProfile: Profile | null = null;
        try {
          existingProfile = await getProfile();
        } catch (profileError) {
          console.error('[Init] Could not read profile:', profileError);
        }
        
        // Check if we have a profile record at all
        if (!existingProfile) {
          // New user - no profile exists, show onboarding
          console.log('[Init] No profile found, showing onboarding');
          return;
        }
        
        // Onboarding counts as complete ONLY when the profile has both a name
        // and the completion flag. Anything else forces the setup flow again —
        // this keeps the gate deterministic across Expo Go, dev clients and
        // release APKs (which retain the SQLite file across upgrade installs).
        const needsOnboarding = !existingProfile.name || !existingProfile.onboarding_complete;
        
        if (needsOnboarding) {
          console.log('[Init] Missing name or incomplete onboarding - showing onboarding');
          try {
            await updateProfile({ onboarding_complete: false });
          } catch (error) {
            console.error('[Init] Failed to reset onboarding flag:', error);
          }
          // Leave the auth-store profile null so the onboarding screen shows
          return;
        }
        
        setProfile(existingProfile);
        // Sync language preference from DB to settings store
        if (existingProfile.language) {
          syncLanguage(existingProfile.language as 'en' | 'ur');
        }
        // Sync elderly mode from DB
        if (existingProfile.elderly_mode !== undefined) {
          syncElderlyMode(!!existingProfile.elderly_mode);
        }
        // Sync high-contrast mode from DB
        if (existingProfile.high_contrast !== undefined) {
          syncHighContrast(!!existingProfile.high_contrast);
        }
        // Sync theme preference (light/dark/system) from DB
        if (existingProfile.theme_preference) {
          restoreThemePreference(existingProfile.theme_preference);
        }

        // Reconcile throttled refill reminders with current inventory
        void syncRefillNotifications();
      } catch (error) {
        console.error('[Init] Fatal initialization error:', error);
        // Critical failures still caught here
      } finally {
        setDbReady(true);
        setLoaded(true);
      }
    }
    init();
  }, [setProfile, setLoaded, setAppLockEnabled, setLocked]);

  // Lock the app as soon as it drops to the background when app lock is on.
  // Reads the store imperatively so the listener never goes stale.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && useAuthStore.getState().appLockEnabled) {
        useAuthStore.getState().setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  if (!dbReady || !isLoaded || !splashAnimationDone || !fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background.primary }]}>
        <AnimatedSplash
          backgroundColor={colors.background.primary}
          onAnimationDone={() => setSplashAnimationDone(true)}
        />
      </View>
    );
  }

  const showOnboarding = !profile || !profile.onboarding_complete || !profile.name;

  // Lock gate replaces the entire navigation stack — nothing underneath is
  // reachable (or visible) until the user unlocks.
  const lockGateActive = appLockEnabled && isLocked && !!profile;

  return (
    <View style={{ flex: 1, direction: language === 'ur' ? 'rtl' : 'ltr' }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {lockGateActive ? (
        <BiometricLock onUnlock={() => setLocked(false)} />
      ) : (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.primary },
          animation: 'slide_from_right',
        }}
      >
        {showOnboarding ? (
          <Stack.Screen name="onboarding" />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="processing" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="review" options={{ presentation: 'card' }} />
        <Stack.Screen name="medicine/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="schedule" options={{ presentation: 'card' }} />
        <Stack.Screen name="chat" options={{ presentation: 'card' }} />
        <Stack.Screen name="emergency-card" options={{ presentation: 'card' }} />
        <Stack.Screen name="doctor-visit" options={{ presentation: 'card' }} />
        <Stack.Screen name="analytics" options={{ presentation: 'card' }} />
      </Stack>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            <ErrorBoundary>
              <AppContent />
              <GlobalToast />
            </ErrorBoundary>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
