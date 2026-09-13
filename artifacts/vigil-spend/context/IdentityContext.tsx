import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import { hasVigilProOverride, isVigilAdmin } from '@/lib/admin';

const APPLE_SESSION_KEY = 'vigil-apple-session-v1';
const ACTIVE_PROVIDER_KEY = 'vigil-active-provider-v1';
type ActiveProvider = 'apple' | 'clerk' | 'signed-out' | null;

type AppleSession = {
  sessionToken: string;
  expiresAt: string;
  identity: {
    userId: string;
    provider: 'apple';
    email: string | null;
    displayName: string | null;
    isAdmin: false;
  };
};

export type VigilIdentity = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  provider: 'apple' | 'clerk' | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  signInWithApple: () => Promise<{ displayName: string | null }>;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  proOverride: boolean;
  clerkAvailable: boolean;
  activateClerk: () => Promise<void>;
};

const IdentityContext = createContext<VigilIdentity | null>(null);

// SecureStore is native-only. Expo Preview runs the retained Clerk/Google
// path on web too, so use browser-safe storage there instead of crashing
// before Clerk can finish loading.
const identityStorage = {
  get: (key: string) => Platform.OS === 'web'
    ? AsyncStorage.getItem(key)
    : SecureStore.getItemAsync(key),
  set: (key: string, value: string) => Platform.OS === 'web'
    ? AsyncStorage.setItem(key, value)
    : SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (key: string) => Platform.OS === 'web'
    ? AsyncStorage.removeItem(key)
    : SecureStore.deleteItemAsync(key),
};

function apiUrl(path: string) {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (explicit) return `${explicit}${path}`;
  if (!domain) throw new Error('The secure API is not configured.');
  return `https://${domain}${path}`;
}

async function readAppleSession() {
  const raw = await identityStorage.get(APPLE_SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AppleSession;
    if (
      !value.sessionToken
      || !value.identity?.userId
      || value.identity.provider !== 'apple'
      || Date.parse(value.expiresAt) <= Date.now()
    ) {
      await identityStorage.remove(APPLE_SESSION_KEY);
      return null;
    }
    return value;
  } catch {
    await identityStorage.remove(APPLE_SESSION_KEY);
    return null;
  }
}

async function openAppleWebSession(): Promise<AppleSession> {
  if (typeof window === 'undefined') {
    throw new Error('Apple sign-in is not available in this environment.');
  }
  const authOrigin = process.env.EXPO_PUBLIC_APPLE_WEB_AUTH_ORIGIN?.replace(/\/$/, '');
  const startUrl = authOrigin
    ? `${authOrigin}/api/vigil/apple/web/start`
    : apiUrl('/api/vigil/apple/web/start');
  const popup = window.open(
    startUrl,
    'vigil-apple-auth',
    'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
  );
  if (!popup) throw new Error('Apple sign-in was blocked by the browser. Allow pop-ups for Vigil and try again.');

  return new Promise((resolve, reject) => {
    let finished = false;
    const expectedOrigin = new URL(startUrl, window.location.href).origin;
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener('message', handleMessage);
    };
    const finish = (error?: Error, result?: AppleSession) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('Apple sign-in returned an invalid session.'));
    };
    const timeout = window.setTimeout(() => finish(new Error('Apple sign-in timed out. Please try again.')), 120_000);
    const poll = window.setInterval(() => {
      if (popup.closed) finish(new Error('Apple sign-in was cancelled.'));
    }, 500);
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== popup || event.origin !== expectedOrigin) return;
      const result = event.data as Partial<AppleSession> & { type?: string; error?: string };
      if (result.type !== 'vigil-apple-auth') return;
      if (result.error) {
        finish(new Error(result.error));
        return;
      }
      if (
        typeof result.sessionToken !== 'string'
        || typeof result.expiresAt !== 'string'
        || !result.identity
        || result.identity.provider !== 'apple'
        || typeof result.identity.userId !== 'string'
      ) {
        finish(new Error('Apple sign-in returned an invalid session.'));
        return;
      }
      finish(undefined, result as AppleSession);
    };
    window.addEventListener('message', handleMessage);
  });
}

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const clerkAuth = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const { user: clerkUser } = useUser();
  const [appleSession, setAppleSession] = useState<AppleSession | null>(null);
  const [appleRestored, setAppleRestored] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ActiveProvider>(null);

  const persistActiveProvider = useCallback(async (provider: Exclude<ActiveProvider, null>) => {
    // Persist the selection before exposing its session in memory. If a device
    // dies between writes, the safe outcome is a sign-in screen, never a stale
    // Clerk identity replacing an Apple account.
    await identityStorage.set(ACTIVE_PROVIDER_KEY, provider);
    setActiveProvider(provider);
  }, []);

  const clearAppleSession = useCallback(async () => {
    setAppleSession(null);
    await identityStorage.remove(APPLE_SESSION_KEY);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [marker, saved] = await Promise.all([
        identityStorage.get(ACTIVE_PROVIDER_KEY),
        readAppleSession(),
      ]);
      const restoredMarker: ActiveProvider = marker === 'apple' || marker === 'clerk' || marker === 'signed-out' ? marker : null;
      if (active) setActiveProvider(restoredMarker);
      // Safely migrate earlier native sessions which predate the explicit
      // provider marker. A marker that says signed-out never restores one.
      if (saved && restoredMarker !== 'signed-out') {
        if (restoredMarker !== 'apple') await persistActiveProvider('apple');
      }
      if (!saved) {
        if (active) setAppleRestored(true);
        return;
      }
      // An opaque session is validated before it can unlock device-scoped
      // financial data, so a deleted account never regains access on relaunch.
      try {
        const response = await fetch(apiUrl('/api/vigil/identity'), {
          headers: { Authorization: `Bearer ${saved.sessionToken}` },
        });
        if (!response.ok) throw new Error('Invalid Apple session');
        const result = await response.json() as { identity?: AppleSession['identity'] };
        if (!result.identity || result.identity.provider !== 'apple') throw new Error('Invalid Apple identity');
        if (active) setAppleSession({ ...saved, identity: result.identity });
      } catch {
        await identityStorage.remove(APPLE_SESSION_KEY);
      } finally {
        if (active) setAppleRestored(true);
      }
    })();
    return () => { active = false; };
  }, [persistActiveProvider]);

  const getToken = useCallback(async () => {
    if (appleSession) return appleSession.sessionToken;
    return clerkAuth.getToken();
  }, [appleSession, clerkAuth]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS === 'web') {
      const result = await openAppleWebSession();
      await persistActiveProvider('apple');
      await identityStorage.set(APPLE_SESSION_KEY, JSON.stringify(result));
      setAppleSession(result);
      if (clerkAuth.isSignedIn) void clerkSignOut().catch(() => undefined);
      return { displayName: result.identity.displayName };
    }
    if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is available in the iOS app only.');
    if (!(await AppleAuthentication.isAvailableAsync())) throw new Error('Sign in with Apple is not available on this device.');
    const challengeResponse = await fetch(apiUrl('/api/vigil/apple/challenge'));
    const challenge = await challengeResponse.json() as { challengeId?: string; nonce?: string; message?: string };
    if (!challengeResponse.ok || !challenge.challengeId || !challenge.nonce) {
      throw new Error(challenge.message || 'Apple sign-in is unavailable. Please use email or Google.');
    }
    // Expo passes the nonce through to ASAuthorizationAppleIDRequest unchanged.
    // Apple echoes that value in its identity token, so submit a client-side
    // SHA-256 digest of the server's one-time raw nonce.
    const nonceDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, challenge.nonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonceDigest,
    });
    if (!credential.identityToken || !credential.authorizationCode) {
      throw new Error('Apple did not return a complete sign-in response.');
    }
    const response = await fetch(apiUrl('/api/vigil/apple/exchange'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        fullName: credential.fullName ? {
          givenName: credential.fullName.givenName,
          familyName: credential.fullName.familyName,
        } : undefined,
      }),
    });
    const result = await response.json() as AppleSession & { message?: string };
    if (!response.ok || !result.sessionToken || !result.identity?.userId || result.identity.provider !== 'apple') {
      throw new Error(result.message || 'Apple sign-in could not be completed.');
    }
    await persistActiveProvider('apple');
    await identityStorage.set(APPLE_SESSION_KEY, JSON.stringify(result));
    setAppleSession(result);
    // The persisted provider marker prevents a stale Clerk session from ever
    // becoming active while Apple is selected. This cleanup is best-effort and
    // is not used as an authentication boundary.
    if (clerkAuth.isSignedIn) void clerkSignOut().catch(() => undefined);
    return { displayName: result.identity.displayName };
  }, [clerkAuth.isSignedIn, clerkSignOut, persistActiveProvider]);

  const signOut = useCallback(async () => {
    if (appleSession) {
      const response = await fetch(apiUrl('/api/vigil/apple/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${appleSession.sessionToken}` },
      });
      if (!response.ok) throw new Error('Secure sign-out could not be completed. Please check your connection and try again.');
      await persistActiveProvider('signed-out');
      await clearAppleSession();
      return;
    }
    await clerkSignOut();
    await persistActiveProvider('signed-out');
  }, [appleSession, clearAppleSession, clerkSignOut, persistActiveProvider]);

  const deleteAccount = useCallback(async () => {
    if (appleSession) {
      const response = await fetch(apiUrl('/api/vigil/apple/account'), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${appleSession.sessionToken}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || 'Account deletion could not be completed.');
      }
      await persistActiveProvider('signed-out');
      await clearAppleSession();
      return;
    }
    if (!clerkUser) throw new Error('No signed-in account was found.');
    await clerkUser.delete();
    await clerkSignOut();
    await persistActiveProvider('signed-out');
  }, [appleSession, clearAppleSession, clerkSignOut, clerkUser, persistActiveProvider]);

  const activateClerk = useCallback(async () => {
    await persistActiveProvider('clerk');
  }, [persistActiveProvider]);

  const value = useMemo<VigilIdentity>(() => {
    if (appleSession) {
      return {
        isLoaded: appleRestored,
        isSignedIn: appleRestored,
        userId: appleSession.identity.userId,
        provider: 'apple',
        getToken,
        signOut,
        deleteAccount,
        signInWithApple,
        displayName: appleSession.identity.displayName,
        email: appleSession.identity.email,
        isAdmin: false,
        proOverride: false,
        clerkAvailable: clerkAuth.isLoaded,
        activateClerk,
      };
    }
    const clerkSelected = activeProvider === 'clerk' || (activeProvider === null && Boolean(clerkAuth.isSignedIn));
    return {
      // Do not gate the native Apple path on Clerk initialization. Clerk
      // controls only its own legacy sessions and sign-in controls.
      isLoaded: appleRestored,
      isSignedIn: clerkSelected && Boolean(clerkAuth.isSignedIn),
      userId: clerkAuth.userId ?? null,
      provider: clerkSelected && clerkAuth.isSignedIn ? 'clerk' : null,
      getToken,
      signOut,
      deleteAccount,
      signInWithApple,
      displayName: clerkUser?.fullName || clerkUser?.username || clerkUser?.primaryEmailAddress?.emailAddress || null,
      email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
      // Apple sessions are always non-admin; Clerk remains the sole authority
      // for this legacy administrative surface and the server verifies it again.
      isAdmin: clerkSelected && clerkAuth.isSignedIn ? isVigilAdmin(clerkUser) : false,
      proOverride: clerkSelected && clerkAuth.isSignedIn ? hasVigilProOverride(clerkUser) : false,
      clerkAvailable: clerkAuth.isLoaded,
      activateClerk,
    };
  }, [activateClerk, activeProvider, appleRestored, appleSession, clerkAuth.isLoaded, clerkAuth.isSignedIn, clerkAuth.userId, clerkUser, deleteAccount, getToken, signInWithApple, signOut]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

// This adapter deliberately has no Clerk hooks. It is used when a legacy
// Clerk publishable key is absent, so native Apple sign-in remains available
// instead of turning a Clerk configuration error into an Apple outage.
export function AppleOnlyIdentityProvider({ children }: { children: React.ReactNode }) {
  const [appleSession, setAppleSession] = useState<AppleSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const mark = useCallback(async (provider: Exclude<ActiveProvider, null>) => {
    await identityStorage.set(ACTIVE_PROVIDER_KEY, provider);
  }, []);
  const clear = useCallback(async () => {
    setAppleSession(null);
    await identityStorage.remove(APPLE_SESSION_KEY);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [marker, saved] = await Promise.all([identityStorage.get(ACTIVE_PROVIDER_KEY), readAppleSession()]);
      if (saved && marker !== 'signed-out') {
        const response = await fetch(apiUrl('/api/vigil/identity'), {
          headers: { Authorization: `Bearer ${saved.sessionToken}` },
        }).catch(() => null);
        if (response?.ok && mounted) {
          const body = await response.json() as { identity?: AppleSession['identity'] };
          if (body.identity?.provider === 'apple') {
            await mark('apple');
            setAppleSession({ ...saved, identity: body.identity });
          }
        } else if (mounted) {
          await clear();
          await mark('signed-out');
        }
      }
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, [clear, mark]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS === 'web') {
      const result = await openAppleWebSession();
      await mark('apple');
      await identityStorage.set(APPLE_SESSION_KEY, JSON.stringify(result));
      setAppleSession(result);
      return { displayName: result.identity.displayName };
    }
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      throw new Error('Sign in with Apple is available only in the native iOS app.');
    }
    const challengeResponse = await fetch(apiUrl('/api/vigil/apple/challenge'));
    const challenge = await challengeResponse.json() as { challengeId?: string; nonce?: string; message?: string };
    if (!challengeResponse.ok || !challenge.challengeId || !challenge.nonce) throw new Error(challenge.message || 'Apple sign-in is unavailable.');
    const nonceDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, challenge.nonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonceDigest,
    });
    if (!credential.identityToken || !credential.authorizationCode) throw new Error('Apple did not return a complete sign-in response.');
    const response = await fetch(apiUrl('/api/vigil/apple/exchange'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        fullName: credential.fullName ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName } : undefined,
      }),
    });
    const result = await response.json() as AppleSession & { message?: string };
    if (!response.ok || !result.sessionToken || result.identity?.provider !== 'apple') throw new Error(result.message || 'Apple sign-in could not be completed.');
    await mark('apple');
    await identityStorage.set(APPLE_SESSION_KEY, JSON.stringify(result));
    setAppleSession(result);
    return { displayName: result.identity.displayName };
  }, [mark]);

  const signOut = useCallback(async () => {
    if (!appleSession) return;
    const response = await fetch(apiUrl('/api/vigil/apple/logout'), { method: 'POST', headers: { Authorization: `Bearer ${appleSession.sessionToken}` } });
    if (!response.ok) throw new Error('Secure sign-out could not be completed. Please check your connection and try again.');
    await mark('signed-out');
    await clear();
  }, [appleSession, clear, mark]);
  const deleteAccount = useCallback(async () => {
    if (!appleSession) throw new Error('No signed-in account was found.');
    const response = await fetch(apiUrl('/api/vigil/apple/account'), { method: 'DELETE', headers: { Authorization: `Bearer ${appleSession.sessionToken}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message || 'Account deletion could not be completed.');
    }
    await mark('signed-out');
    await clear();
  }, [appleSession, clear, mark]);
  const getToken = useCallback(async () => appleSession?.sessionToken ?? null, [appleSession]);
  const value = useMemo<VigilIdentity>(() => ({
    isLoaded,
    isSignedIn: Boolean(appleSession),
    userId: appleSession?.identity.userId ?? null,
    provider: appleSession ? 'apple' : null,
    getToken,
    signOut,
    deleteAccount,
    signInWithApple,
    displayName: appleSession?.identity.displayName ?? null,
    email: appleSession?.identity.email ?? null,
    isAdmin: false,
    proOverride: false,
    clerkAvailable: false,
    activateClerk: async () => { throw new Error('Email and Google sign-in are unavailable in this build.'); },
  }), [appleSession, deleteAccount, getToken, isLoaded, signInWithApple, signOut]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const value = useContext(IdentityContext);
  if (!value) throw new Error('useIdentity must be used inside IdentityProvider');
  return value;
}