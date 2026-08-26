import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PillIcon } from '../../src/components/ui/PillIcon';
import { useTheme } from '../../src/theme/provider';
import { useTranslation } from '../../src/i18n';
import { useSettingsStore } from '../../src/stores/settings-store';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function TabLayout() {
  const { colors, typography } = useTheme();
  const t = useTranslation();
  const currentLanguage = useSettingsStore((s) => s.language);
  const isRTL = currentLanguage === 'ur';

  return (
    <Tabs 
      key={isRTL ? 'rtl' : 'ltr'} // Force full re-render on RTL/LTR switch
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: {
          backgroundColor: colors.background.surface,
          borderTopColor: colors.border.default,
          borderTopWidth: 1,
          // Fixed padding - no extra space for iOS
          paddingBottom: Platform.OS === 'ios' ? 12 : 8,
          paddingTop: Platform.OS === 'ios' ? 6 : 8,
          // Fix for RTL layout - ensure proper mirroring
          ...(isRTL && {
            flexDirection: 'row-reverse',
          }),
          // Ensure minimum height for proper Urdu font rendering (iOS Nasteq has tall fonts)
          minHeight: 64,
          maxHeight: 72,
          // Disable fixed height to allow dynamic sizing
          height: undefined,
          paddingHorizontal: 0, // Remove side padding for better spacing
        },
        tabBarLabelStyle: {
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.medium,
          // Handle variable text widths in Urdu/Arabic script
          textAlign: isRTL ? 'right' : 'left',
          maxWidth: 90,
          lineHeight: 20,
          // Reduce bottom/top spacing for compact layout
          paddingBottom: isRTL ? 4 : 2,
          paddingTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4, // Small top margin for icon alignment
          marginBottom: 4, // Bottom margin for spacing from labels
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.nav.home,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="medicines"
        options={{
          title: t.nav.medicines,
          tabBarIcon: ({ color, size }) => (
            <PillIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t.nav.history,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="education"
        options={{
          title: t.nav.education,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-page-variant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t.nav.analytics,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-bar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.nav.settings,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
