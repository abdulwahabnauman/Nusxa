import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PillIcon } from '../../src/components/ui/PillIcon';
import { AnimatedTabBar } from '../../src/components/navigation/AnimatedTabBar';
import { useTranslation } from '../../src/i18n';
import { useSettingsStore } from '../../src/stores/settings-store';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function TabLayout() {
  const t = useTranslation();
  const currentLanguage = useSettingsStore((s) => s.language);
  const isRTL = currentLanguage === 'ur';

  return (
    <Tabs 
      key={isRTL ? 'rtl' : 'ltr'} // Force full re-render on RTL/LTR switch
      // Custom animated bar: icon bounce + label crossfade on focus.
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
