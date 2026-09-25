import * as Crypto from 'expo-crypto';

export const PRODUCTION_REVENUECAT_IOS_API_KEY = 'appl_czupINwijqbNYMcEQQjOhqxIxcn';
// Public Clerk Production publishable key (clerk.vigilspend.com). Pinned in
// source because Replit Expo Launch can inject the managed pk_test key.
export const PRODUCTION_CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsudmlnaWxzcGVuZC5jb20k';

export function isVigilProductionBuild() {
  return process.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE?.trim().toLowerCase() === 'production';
}

export function getClerkRuntimePublishableKey() {
  const profile = process.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE?.trim().toLowerCase();

  if (profile === 'production') {
    return PRODUCTION_CLERK_PUBLISHABLE_KEY;
  }

  if (profile === 'development' || profile === 'preview') {
    return process.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY?.trim()
      || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
      || '';
  }

  return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
}

export function getClerkKeyEnvironment(publishableKey: string): 'LIVE' | 'TEST' | 'UNKNOWN' {
  if (publishableKey.startsWith('pk_live_')) return 'LIVE';
  if (publishableKey.startsWith('pk_test_')) return 'TEST';
  return 'UNKNOWN';
}

export function getClerkKeyHost(publishableKey: string) {
  const encodedHost = publishableKey.match(/^pk_(?:test|live)_([A-Za-z0-9_-]+)$/)?.[1];
  if (!encodedHost || typeof globalThis.atob !== 'function') return 'not configured';

  try {
    const normalized = encodedHost.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    const binary = globalThis.atob(padded);
    const decoded = decodeURIComponent(
      Array.from(binary, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    ).replace(/\$$/, '');
    const candidate = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
    return new URL(candidate).hostname || 'not configured';
  } catch {
    return '[invalid]';
  }
}

async function keyFingerprint(key: string) {
  if (!key) return 'missing';
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
  return digest.slice(0, 12);
}

function getRevenueCatKeyType(key: string) {
  if (key.startsWith('appl_')) return 'appl_';
  if (key.startsWith('test_')) return 'test_';
  if (key.startsWith('goog_')) return 'goog_';
  if (key.startsWith('rcbl_')) return 'rcbl_';
  return 'unknown';
}

export async function createRuntimeCredentialProof(clerkPublishableKey: string, revenueCatKey: string) {
  const [clerkFingerprint, revenueCatFingerprint] = await Promise.all([
    keyFingerprint(clerkPublishableKey),
    keyFingerprint(revenueCatKey),
  ]);

  return {
    clerkEnvironment: getClerkKeyEnvironment(clerkPublishableKey),
    clerkHostname: getClerkKeyHost(clerkPublishableKey),
    clerkKeyFingerprint: clerkFingerprint,
    revenueCatKeyFingerprint: revenueCatFingerprint,
    revenueCatKeyType: getRevenueCatKeyType(revenueCatKey),
  };
}