import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  getClerkKeyEnvironment,
  getClerkKeyHost,
  getClerkRuntimePublishableKey,
} from '@/lib/runtimeCredentials';

const DIAGNOSTIC_KEY = 'vigil-diagnostics-v2';
const MAX_EVENTS = 60;

export type AppleDiagnosticStage =
  | 'apple-authentication'
  | 'clerk-token-exchange'
  | 'session-activation'
  | 'backend-request';

export type DiagnosticArea = 'auth' | 'revenuecat';
export type DiagnosticStatus = 'started' | 'success' | 'error' | 'state';

export type DiagnosticEvent = {
  id: string;
  recordedAt: string;
  area: DiagnosticArea;
  flow: string;
  stage: string;
  status: DiagnosticStatus;
  code: string;
  message: string;
  httpStatus: string;
  requestId: string;
  platform: string;
  appVersion: string;
  buildNumber: string;
  bundleId: string;
  clerkMode: string;
  apiHost: string;
  appleAudience: string;
  appleIssuer: string;
  configured: string;
  customerMode: string;
  offeringId: string;
  productIds: string[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function redactedText(value: unknown, maximum = 500): string {
  return String(value ?? 'Unknown error')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:pk|sk)_(?:test|live)_[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/\b(?:appl|goog|rcbl)_[A-Za-z0-9_-]+/gi, '[redacted-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function scalarText(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === 'string' || typeof candidate === 'number');
  return value === undefined ? '' : redactedText(value, 160);
}

function errorRecord(error: unknown): UnknownRecord {
  return error && typeof error === 'object' ? error as UnknownRecord : {};
}

function firstError(error: UnknownRecord): UnknownRecord {
  const errors = error.errors;
  if (!Array.isArray(errors)) return {};
  const item = errors.find((candidate) => candidate && typeof candidate === 'object');
  return item && typeof item === 'object' ? item as UnknownRecord : {};
}

export type AppleIdentityClaims = {
  appleAudience: string;
  appleIssuer: string;
};

function decodeBase64Url(value: string) {
  if (typeof globalThis.atob !== 'function') return '';
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    const binary = globalThis.atob(padded);
    return decodeURIComponent(
      Array.from(binary, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
  } catch {
    return '';
  }
}

function claimText(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return redactedText(value, 160);
  if (Array.isArray(value)) {
    return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      .map((item) => redactedText(item, 80))
      .join(',');
  }
  return '';
}

export function decodeAppleIdentityTokenClaims(identityToken: unknown): AppleIdentityClaims {
  const empty = { appleAudience: '', appleIssuer: '' };
  if (typeof identityToken !== 'string') return empty;
  const payload = identityToken.split('.')[1];
  if (!payload) return empty;
  const decoded = decodeBase64Url(payload);
  if (!decoded) return empty;
  try {
    const claims = JSON.parse(decoded) as UnknownRecord;
    return {
      appleAudience: claimText(claims.aud),
      appleIssuer: claimText(claims.iss),
    };
  } catch {
    return empty;
  }
}

export function appVersionBuild() {
  return {
    version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown',
    build: Constants.nativeBuildVersion ?? Constants.expoConfig?.ios?.buildNumber ?? 'unknown',
  };
}

export function clerkEnvironmentSummary() {
  const publishableKey = getClerkRuntimePublishableKey();
  const mode = process.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE?.trim().toLowerCase()
    || process.env.VIGIL_CLERK_MODE?.trim().toLowerCase()
    || (getClerkKeyEnvironment(publishableKey) === 'LIVE'
      ? 'production'
      : getClerkKeyEnvironment(publishableKey) === 'TEST' ? 'development' : 'unknown');
  return {
    mode,
    keyEnvironment: getClerkKeyEnvironment(publishableKey).toLowerCase(),
  };
}

export function clerkFrontendApiHost() {
  return getClerkKeyHost(getClerkRuntimePublishableKey());
}

function diagnosticBase(area: DiagnosticArea, flow: string, stage: string, status: DiagnosticStatus): Omit<DiagnosticEvent, 'id' | 'recordedAt'> {
  const version = appVersionBuild();
  const clerk = clerkEnvironmentSummary();
  return {
    area,
    flow,
    stage,
    status,
    code: '',
    message: '',
    httpStatus: '',
    requestId: '',
    platform: Platform.OS,
    appVersion: version.version,
    buildNumber: version.build,
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? 'unknown',
    clerkMode: `${clerk.mode}/${clerk.keyEnvironment}`,
    apiHost: clerkFrontendApiHost(),
    appleAudience: '',
    appleIssuer: '',
    configured: '',
    customerMode: '',
    offeringId: '',
    productIds: [],
  };
}

export function extractAuthError(error: unknown) {
  const candidate = errorRecord(error);
  const nested = firstError(candidate);
  const response = errorRecord(candidate.response);
  const headers = errorRecord(response.headers);
  return {
    code: scalarText(candidate.code, candidate.errorCode, nested.code, nested.errorCode),
    message: redactedText(nested.longMessage || nested.message || candidate.longMessage || candidate.message || error),
    httpStatus: scalarText(candidate.status, candidate.statusCode, nested.status, response.status, response.statusCode),
    requestId: scalarText(
      candidate.requestId,
      candidate.request_id,
      candidate.traceId,
      nested.requestId,
      nested.request_id,
      headers['x-request-id'],
      headers['x-clerk-request-id'],
    ),
  };
}

export function revenueCatErrorDetails(error: unknown) {
  const candidate = errorRecord(error);
  const nested = errorRecord(candidate.userInfo);
  return {
    code: scalarText(candidate.code, candidate.errorCode, candidate.readableErrorCode, nested.code),
    message: redactedText(candidate.message || nested.message || error),
    httpStatus: scalarText(candidate.status, candidate.statusCode),
    requestId: '',
  };
}

export async function recordDiagnostic(
  event: Partial<DiagnosticEvent> & Pick<DiagnosticEvent, 'area' | 'flow' | 'stage' | 'status'>,
) {
  const complete: DiagnosticEvent = {
    ...diagnosticBase(event.area, event.flow, event.stage, event.status),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: new Date().toISOString(),
    code: redactedText(event.code ?? '', 160),
    message: redactedText(event.message ?? '', 320),
    httpStatus: redactedText(event.httpStatus ?? '', 80),
    requestId: redactedText(event.requestId ?? '', 160),
    appleAudience: redactedText(event.appleAudience ?? '', 160),
    appleIssuer: redactedText(event.appleIssuer ?? '', 160),
    configured: redactedText(event.configured ?? '', 160),
    customerMode: redactedText(event.customerMode ?? '', 160),
    offeringId: redactedText(event.offeringId ?? '', 160),
    productIds: (event.productIds ?? [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => redactedText(item, 160))
      .slice(0, 12),
  };
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTIC_KEY);
    const prior = raw ? JSON.parse(raw) as DiagnosticEvent[] : [];
    const events = Array.isArray(prior) ? prior.filter((item) => item && typeof item === 'object') : [];
    await AsyncStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify([complete, ...events].slice(0, MAX_EVENTS)));
  } catch {
    // Diagnostics must never interfere with authentication or purchases.
  }
}

export function recordAuthDiagnostic(
  flow: string,
  stage: string,
  status: DiagnosticStatus,
  details: Partial<DiagnosticEvent> = {},
) {
  return recordDiagnostic({ ...details, area: 'auth', flow, stage, status });
}

export function recordRevenueCatDiagnostic(
  flow: string,
  stage: string,
  status: DiagnosticStatus,
  details: Partial<DiagnosticEvent> = {},
) {
  return recordDiagnostic({ ...details, area: 'revenuecat', flow, stage, status });
}

export async function withAppleIdentityDiagnostics<T>(
  action: () => Promise<T>,
  onClaims: (claims: AppleIdentityClaims) => void,
) {
  const AppleAuthentication = await import('expo-apple-authentication');
  const moduleRecord = AppleAuthentication as unknown as {
    signInAsync: (...args: Parameters<typeof AppleAuthentication.signInAsync>) => ReturnType<typeof AppleAuthentication.signInAsync>;
  };
  const originalSignInAsync = moduleRecord.signInAsync;
  const instrumentedSignInAsync = async (...args: Parameters<typeof AppleAuthentication.signInAsync>) => {
    const credential = await originalSignInAsync(...args);
    onClaims(decodeAppleIdentityTokenClaims(credential.identityToken));
    return credential;
  };

  let patched = false;
  try {
    moduleRecord.signInAsync = instrumentedSignInAsync;
    patched = moduleRecord.signInAsync === instrumentedSignInAsync;
  } catch {
    // If the module namespace is immutable, continue with the original flow.
  }

  try {
    return await action();
  } finally {
    if (patched) {
      try {
        moduleRecord.signInAsync = originalSignInAsync;
      } catch {
        // Diagnostics must never interfere with authentication.
      }
    }
  }
}

export async function readDiagnostics() {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTIC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as DiagnosticEvent[] : [];
  } catch {
    return [];
  }
}

export async function clearDiagnostics() {
  await AsyncStorage.removeItem(DIAGNOSTIC_KEY);
}

export function formatDiagnostic(event: DiagnosticEvent) {
  const parts = [
    `${event.recordedAt} ${event.area}/${event.flow} ${event.status}`,
    `stage=${event.stage}`,
    event.code && `code=${event.code}`,
    event.httpStatus && `http=${event.httpStatus}`,
    event.requestId && `request=${event.requestId}`,
    event.message && event.message,
    event.appleAudience && `apple_aud=${event.appleAudience}`,
    event.appleIssuer && `apple_iss=${event.appleIssuer}`,
    `bundle=${event.bundleId}`,
    `clerk=${event.clerkMode}`,
    `clerk_host=${event.apiHost}`,
    event.area === 'revenuecat' && `configured=${event.configured || 'unknown'}`,
    event.area === 'revenuecat' && `customer=${event.customerMode || 'unknown'}`,
    event.offeringId && `offering=${event.offeringId}`,
    event.productIds.length ? `products=${event.productIds.join(',')}` : '',
    `Vigil ${event.appVersion} (${event.buildNumber}) · ${event.platform}`,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function classifyAppleFailure(error: unknown): AppleDiagnosticStage {
  const candidate = asRecord(error);
  const nested = firstError(candidate);
  const code = text(candidate.code || nested.code || candidate.errorCode || nested.errorCode).toLowerCase();
  const message = text(nested.longMessage || nested.message || candidate.longMessage || candidate.message || error).toLowerCase();
  if (/^err_/.test(code) || message.includes('authorization request') || message.includes('apple authentication') || message.includes('user cancel')) {
    return 'apple-authentication';
  }
  if (Array.isArray(candidate.errors) || candidate.status || candidate.statusCode || candidate.requestId || nested.requestId) {
    return 'clerk-token-exchange';
  }
  return 'apple-authentication';
}