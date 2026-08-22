import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../src/theme/provider';
import { openDatabase } from '../src/db/database';
import { getProfile } from '../src/db/repositories/profile';
import { useAuthStore } from '../src/stores/auth-store';
import { useSettingsStore } from '../src/stores/settings-store';
import { configureNotifications } from '../src/utils/notifications';
import { useNotificationResponseHandler } from '../src/hooks/useNotificationHandler';
import { I18nProvider } from '../src/i18n';
import { AnimatedSplash } from '../src/components/ui/AnimatedSplash';

// keep the native splash up until we've swapped over to our own animated one
SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this fails the native splash just hides on its own, not worth crashing over
});

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
  const [dbReady, setDbReady] = useState(false);
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const syncLanguage = useSettingsStore((s) => s.setLanguage);

  // Handle notification taps — navigate to medicine detail
  useNotificationResponseHandler();

  // hand off from the native static splash to our animated one the moment we can render
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    async function init() {
      try {
        await configureNotifications();
        await openDatabase();
        const existingProfile = await getProfile();
        if (existingProfile) {
          setProfile(existingProfile);
          // Sync language preference from DB to settings store
          if (existingProfile.language) {
            syncLanguage(existingProfile.language as 'en' | 'ur');
          }
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setDbReady(true);
        setLoaded(true);
      }
    }
    init();
  }, [setProfile, setLoaded]);

  if (!dbReady || !isLoaded || !splashAnimationDone) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background.primary }]}>
        <AnimatedSplash
          backgroundColor={colors.background.primary}
          onAnimationDone={() => setSplashAnimationDone(true)}
        />
      </View>
    );
  }

  const showOnboarding = !profile || !profile.onboarding_complete;

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            <AppContent />
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
