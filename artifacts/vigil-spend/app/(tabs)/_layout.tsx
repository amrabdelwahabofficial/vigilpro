import React from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Redirect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useVigil } from '@/context/AppContext';
import { resolveAppEntryRoute } from '@/lib/flowGuards';
import { useIdentity } from '@/context/IdentityContext';

const iconMap = {
  index: ['trending-up-outline', 'trending-up'],
  plan: ['wallet-outline', 'wallet'],
  history: ['time-outline', 'time'],
  analysis: ['document-text-outline', 'document-text'],
  settings: ['settings-outline', 'settings'],
} as const;

export default function TabLayout() {
  const { palette, isDark, t, hydrated, onboardingComplete, offlineSession } = useVigil();
  const { isLoaded, isSignedIn } = useIdentity();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  if (!hydrated) return null;
  if (!isLoaded && !offlineSession) return null;
  const entryRoute = offlineSession ? '/' : resolveAppEntryRoute({ isSignedIn, onboardingComplete });
  if (isWeb && !offlineSession && !isSignedIn) return <Redirect href="/landing" />;
  if (entryRoute !== '/') return <Redirect href={entryRoute} />;

  const icon = (route: keyof typeof iconMap, focused: boolean, color: ColorValue) => (
    <Ionicons
      name={iconMap[route][focused ? 1 : 0]}
      size={21}
      color={color}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          position: 'absolute',
          height: isWeb ? 84 : undefined,
          backgroundColor: isIOS ? 'transparent' : palette.card,
          borderTopColor: palette.border,
          borderTopWidth: isWeb ? 1 : 0,
          elevation: 0,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={95}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: palette.card }]}
            />
          ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('spending'), tabBarIcon: ({ color, focused }) => icon('index', focused, color) }} />
      <Tabs.Screen name="plan" options={{ title: t('plan'), tabBarIcon: ({ color, focused }) => icon('plan', focused, color) }} />
      <Tabs.Screen name="history" options={{ title: t('history'), tabBarIcon: ({ color, focused }) => icon('history', focused, color) }} />
      <Tabs.Screen name="analysis" options={{ title: t('analysis'), tabBarIcon: ({ color, focused }) => icon('analysis', focused, color) }} />
      <Tabs.Screen name="settings" options={{ title: t('settings'), tabBarIcon: ({ color, focused }) => icon('settings', focused, color) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
});