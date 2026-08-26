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
        // WhatsApp-style bar: no fixed height or min/max hacks — the bar sizes
        // itself to icon + label so labels are never clipped at the bottom.
        tabBarStyle: {
          backgroundColor: colors.background.surface,
          borderTopColor: colors.border.default,
          borderTopWidth: 1,
          // Lift labels off the screen edge so descenders are never eaten
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          ...(isRTL && {
            flexDirection: 'row-reverse',
          }),
        },
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
          // Centered, unconstrained label — reads fully like WhatsApp's tabs
          textAlign: 'center',
          // Urdu Nastaliq script needs extra line height to avoid clipping
          lineHeight: isRTL ? 20 : 14,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
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
