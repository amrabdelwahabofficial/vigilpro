import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { VigilProvider } from '@/context/AppContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { AppleOnlyIdentityProvider, IdentityProvider, useIdentity } from '@/context/IdentityContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function LaunchScreen() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 10, stiffness: 120, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={launchStyles.page}>
      <Animated.View style={[launchStyles.lockup, { opacity, transform: [{ scale }] }]}>
        <Image source={require('@/assets/images/icon-transparent.png')} style={launchStyles.mark} />
        <Text style={launchStyles.name}>Vigil Spend</Text>
        <Text style={launchStyles.tagline}>Know where it all goes.</Text>
      </Animated.View>
    </View>
  );
}

function AuthLoadingScreen({ timedOut = false, onRetry }: { timedOut?: boolean; onRetry?: () => void }) {
  return (
    <View style={launchStyles.loadingPage}>
      {timedOut ? (
        <>
          <Text style={launchStyles.errorTitle}>Vigil Spend is taking too long to connect</Text>
          <Text style={launchStyles.errorText}>Check your connection, then try again. Your financial data on this device is safe.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={launchStyles.retryButton}>
            <Text style={launchStyles.retryText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#ef3340" />
          <Text style={launchStyles.loadingText}>Connecting to Vigil Spend…</Text>
        </>
      )}
    </View>
  );
}

function IdentityBootstrap({ onRetry }: { onRetry: () => void }) {
  const { isLoaded, clerkAvailable } = useIdentity();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (__DEV__) {
      console.info('[Vigil] identity readiness', { clerkAvailable, isLoaded });
    }
  }, [clerkAvailable, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      setTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timeout);
  }, [isLoaded]);

  if (!isLoaded && !timedOut) return <AuthLoadingScreen onRetry={onRetry} />;

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <VigilProvider>
            <SubscriptionProvider>
              <RootLayoutNav />
            </SubscriptionProvider>
          </VigilProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

function ConfigurationErrorScreen() {
  return (
    <View style={launchStyles.loadingPage}>
      <Text style={launchStyles.errorTitle}>Vigil Spend could not start</Text>
      <Text style={launchStyles.errorText}>The app’s sign-in configuration is missing. Please install the latest published build.</Text>
    </View>
  );
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="diagnostics" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      <Stack.Screen name="legal" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [clerkAttempt, setClerkAttempt] = useState(0);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    const timeout = setTimeout(() => setShowLaunchScreen(false), Platform.OS === 'web' ? 700 : 2300);
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (showLaunchScreen) return <LaunchScreen />;

  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  // The external Clerk account uses Clerk's frontend API directly. Only an
  // explicitly enabled legacy proxy should be passed to ClerkProvider.
  const proxyUrl = Platform.OS === 'web' && process.env.EXPO_PUBLIC_CLERK_USE_PROXY === 'true'
    ? process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined
    : undefined;
  if (!publishableKey) {
    return (
      <SafeAreaProvider>
        <ErrorBoundary onError={(error, stackTrace) => {
          console.error('[Vigil] render error:', error.message);
          console.error('[Vigil] component stack:', stackTrace);
        }}>
          <AppleOnlyIdentityProvider>
            <IdentityBootstrap onRetry={() => undefined} />
          </AppleOnlyIdentityProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary onError={(error, stackTrace) => {
        console.error('[Vigil] render error:', error.message);
        console.error('[Vigil] component stack:', stackTrace);
      }}>
        <ClerkProvider
          key={clerkAttempt}
          publishableKey={publishableKey}
          tokenCache={tokenCache}
          proxyUrl={proxyUrl}
          __experimental_disableNativeClientSync
        >
          <IdentityProvider>
            <IdentityBootstrap onRetry={() => setClerkAttempt((attempt) => attempt + 1)} />
          </IdentityProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const launchStyles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef3340',
  },
  lockup: {
    alignItems: 'center',
  },
  mark: { width: 112, height: 112 },
  name: {
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: 4.5,
    marginTop: 18,
  },
  tagline: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
    marginTop: 6,
  },
  loadingPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f7f8',
    paddingHorizontal: 28,
  },
  loadingText: {
    color: '#666871',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginTop: 16,
  },
  errorTitle: {
    color: '#17181c',
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  errorText: {
    color: '#666871',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 22,
    minWidth: 150,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#ef3340',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
});
