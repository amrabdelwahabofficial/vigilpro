import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useClerk, useSSO } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Language, ThemeMode, useVigil } from '@/context/AppContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useIdentity } from '@/context/IdentityContext';
import {
  classifyAppleFailure,
  extractAuthError,
  formatDiagnostic,
  appVersionBuild,
  readDiagnostics,
  recordAuthDiagnostic,
  withAppleIdentityDiagnostics,
  type AppleIdentityClaims,
} from '@/lib/authDiagnostics';
import { VIGIL_ADMIN_EMAILS } from '@/lib/admin';

WebBrowser.maybeCompleteAuthSession();
const MIN_PASSWORD_LENGTH = 8;

type AuthMode = 'signIn' | 'signUp' | 'verify' | 'forgotRequest' | 'forgotReset' | 'appleComplete' | 'googleComplete';
type SocialProvider = 'google' | 'apple';
type PendingAppleSignup = {
  update: (params: Record<string, string>) => Promise<{ status: string | null; createdSessionId: string | null }>;
  missingFields: string[];
};
type PendingGoogleSignup = {
  update: (params: Record<string, string>) => Promise<{ status: string | null; createdSessionId: string | null }>;
  missingFields: string[];
};

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      message?: string;
    };
    return candidate.errors?.[0]?.longMessage || candidate.errors?.[0]?.message || candidate.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function safeClerkLogMessage(value: unknown): string {
  return String(value ?? 'Unknown Clerk error')
    .replace(/\b(?:pk|sk)_(?:test|live)_[A-Za-z0-9_-]+/g, '[redacted-clerk-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]')
    .slice(0, 500);
}

function logWebAppleClerkError(error: unknown) {
  const candidate = error as {
    code?: string;
    message?: string;
    longMessage?: string;
    errors?: Array<{ code?: string; longMessage?: string; message?: string }>;
  };
  const details = Array.isArray(candidate?.errors)
    ? candidate.errors.map((item) => ({
        code: item.code || 'unknown',
        message: safeClerkLogMessage(item.longMessage || item.message),
      }))
    : [{
        code: candidate?.code || 'unknown',
        message: safeClerkLogMessage(candidate?.longMessage || candidate?.message || error),
      }];
  console.error('[Vigil] Web Apple Clerk sign-in failed', { errors: details });
}

function stringStatus(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function summarizeCustomSignup(result: unknown) {
  const candidate = (result && typeof result === 'object' ? result : {}) as {
    status?: unknown;
    missingFields?: unknown;
    createdSessionId?: unknown;
    verifications?: {
      emailAddress?: { status?: unknown };
    };
  };
  return {
    signupStatus: stringStatus(candidate.status),
    emailVerificationStatus: stringStatus(candidate.verifications?.emailAddress?.status),
    missingFields: stringList(candidate.missingFields),
    createdSessionIdPresent: Boolean(candidate.createdSessionId),
  };
}

function camelFieldName(field: string): string {
  return field.replace(/[-_](.)/g, (_, character: string) => character.toUpperCase());
}

function readableFieldName(field: string): string {
  return field
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function summarizeGoogleSsoResult(result: unknown) {
  const candidate = (result && typeof result === 'object' ? result : {}) as {
    createdSessionId?: unknown;
    authSessionResult?: { type?: unknown };
    signIn?: {
      status?: unknown;
      missingFields?: unknown;
      firstFactorVerification?: { status?: unknown };
      secondFactorVerification?: { status?: unknown };
    };
    signUp?: {
      status?: unknown;
      missingFields?: unknown;
      firstName?: unknown;
      lastName?: unknown;
    };
  };

  return {
    createdSessionIdPresent: Boolean(candidate.createdSessionId),
    authSessionType: stringStatus(candidate.authSessionResult?.type),
    signInStatus: stringStatus(candidate.signIn?.status),
    signInMissingFields: stringList(candidate.signIn?.missingFields),
    firstFactorStatus: stringStatus(candidate.signIn?.firstFactorVerification?.status),
    secondFactorStatus: stringStatus(candidate.signIn?.secondFactorVerification?.status),
    signUpStatus: stringStatus(candidate.signUp?.status),
    signUpMissingFields: stringList(candidate.signUp?.missingFields),
  };
}

function summarizeNativeAppleSsoResult(result: unknown) {
  const candidate = (result && typeof result === 'object' ? result : {}) as {
    createdSessionId?: unknown;
    signIn?: {
      status?: unknown;
      missingFields?: unknown;
      firstFactorVerification?: { status?: unknown };
      secondFactorVerification?: { status?: unknown };
    };
    signUp?: {
      status?: unknown;
      missingFields?: unknown;
      verifications?: {
        externalAccount?: { status?: unknown };
        emailAddress?: { status?: unknown };
        phoneNumber?: { status?: unknown };
      };
    };
  };

  return {
    createdSessionIdPresent: Boolean(candidate.createdSessionId),
    signInStatus: stringStatus(candidate.signIn?.status),
    signInMissingFields: stringList(candidate.signIn?.missingFields),
    firstFactorStatus: stringStatus(candidate.signIn?.firstFactorVerification?.status),
    secondFactorStatus: stringStatus(candidate.signIn?.secondFactorVerification?.status),
    signUpStatus: stringStatus(candidate.signUp?.status),
    signUpMissingFields: stringList(candidate.signUp?.missingFields),
    externalAccountStatus: stringStatus(candidate.signUp?.verifications?.externalAccount?.status),
    emailVerificationStatus: stringStatus(candidate.signUp?.verifications?.emailAddress?.status),
    phoneVerificationStatus: stringStatus(candidate.signUp?.verifications?.phoneNumber?.status),
  };
}

function googleSsoIncompleteMessage(state: ReturnType<typeof summarizeGoogleSsoResult>): string {
  const missingFields = state.signUpMissingFields.map(readableFieldName);
  if (missingFields.length > 0) {
    return `Google sign-up needs: ${missingFields.join(', ')}.`;
  }
  if (state.signInStatus === 'needs_second_factor' || state.secondFactorStatus === 'unverified') {
    return 'Google sign-in requires an additional verification step. Complete it, then try again.';
  }
  if (state.signInStatus === 'needs_first_factor' || state.firstFactorStatus === 'unverified') {
    return 'Google sign-in still needs first-factor verification. Complete it, then try again.';
  }
  return 'Google sign-in could not be completed. Please try again.';
}

function summarizeWebAppleSsoResult(result: unknown) {
  const candidate = (result && typeof result === 'object' ? result : {}) as {
    createdSessionId?: unknown;
    authSessionResult?: { type?: unknown };
    signIn?: {
      status?: unknown;
      missingFields?: unknown;
      firstFactorVerification?: { status?: unknown };
      secondFactorVerification?: { status?: unknown };
    };
    signUp?: {
      status?: unknown;
      missingFields?: unknown;
      verifications?: {
        emailAddress?: { status?: unknown };
        phoneNumber?: { status?: unknown };
      };
    };
  };

  return {
    createdSessionIdPresent: Boolean(candidate.createdSessionId),
    authSessionType: stringStatus(candidate.authSessionResult?.type),
    signInStatus: stringStatus(candidate.signIn?.status),
    signInMissingFields: stringList(candidate.signIn?.missingFields),
    firstFactorStatus: stringStatus(candidate.signIn?.firstFactorVerification?.status),
    secondFactorStatus: stringStatus(candidate.signIn?.secondFactorVerification?.status),
    signUpStatus: stringStatus(candidate.signUp?.status),
    signUpMissingFields: stringList(candidate.signUp?.missingFields),
    emailVerificationStatus: stringStatus(candidate.signUp?.verifications?.emailAddress?.status),
    phoneVerificationStatus: stringStatus(candidate.signUp?.verifications?.phoneNumber?.status),
  };
}

function webAppleStatusMessage(state: ReturnType<typeof summarizeWebAppleSsoResult>): string {
  const statuses = [
    state.signInStatus,
    state.signUpStatus,
    state.firstFactorStatus,
    state.secondFactorStatus,
    state.emailVerificationStatus,
    state.phoneVerificationStatus,
  ].filter(Boolean);
  const statusText = statuses.length > 0 ? statuses.join(', ') : 'unknown';

  if (state.authSessionType && state.authSessionType !== 'success') {
    return 'Apple sign-in could not be completed. Please try again.';
  }
  if (state.signInStatus === 'needs_second_factor' || state.secondFactorStatus === 'unverified') {
    return `Apple sign-in requires additional verification (${statusText}). Please try again.`;
  }
  if (state.signInStatus === 'needs_identifier') {
    return `Apple sign-in needs an identifier (${statusText}).`;
  }
  if (state.signInStatus === 'needs_first_factor' || state.firstFactorStatus === 'unverified') {
    return `Apple sign-in still needs first-factor verification (${statusText}).`;
  }
  if (state.signInStatus === 'needs_new_password') {
    return `Apple sign-in requires a new password (${statusText}).`;
  }
  if (state.signInStatus === 'complete' || state.signUpStatus === 'complete') {
    return `Clerk reported a complete Apple sign-in state (${statusText}) but did not return a session.`;
  }
  return `Apple sign-in returned Clerk state ${statusText}.`;
}

export default function SignInScreen() {
  const { palette, t, language, setLanguage, setProfileFirstName, themeMode, setThemeMode } = useVigil();
  const identity = useIdentity();
  const { isLoaded, isSignedIn, getToken, signOut: signOutIdentity, activateClerk, clerkAvailable } = identity;
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { isLoaded: signInLoaded, signIn: clerkSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { setActive } = useClerk();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const destination = redirect === '/admin' ? '/admin' : '/onboarding';
  const continueAfterAuth = useCallback((name?: string, appearance?: ThemeMode) => {
    const cleanName = name?.trim();
    if (destination === '/onboarding' && cleanName) {
      router.replace({ pathname: '/onboarding', params: { firstName: cleanName, ...(appearance ? { appearance } : {}) } });
      return;
    }
    router.replace(destination);
  }, [destination]);
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [pendingAppleSignup, setPendingAppleSignup] = useState<PendingAppleSignup | null>(null);
  const [appleSignupValues, setAppleSignupValues] = useState<Record<string, string>>({});
  const [pendingGoogleSignup, setPendingGoogleSignup] = useState<PendingGoogleSignup | null>(null);
  const [googleSignupValues, setGoogleSignupValues] = useState<Record<string, string>>({});
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signupInFlightRef = useRef(false);
  const verificationInFlightRef = useRef(false);
  const currentSignupRef = useRef<NonNullable<typeof signUp> | null>(null);
  const verificationSessionActivatedRef = useRef(false);
  const canCopyDiagnostics = identity.isAdmin || VIGIL_ADMIN_EMAILS.has(email.trim().toLowerCase());
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);
  useEffect(() => () => {
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
  }, []);
  const copyDiagnostics = useCallback(async () => {
    if (!canCopyDiagnostics) return;
    const events = await readDiagnostics();
    const text = events.length > 0
      ? events.map(formatDiagnostic).join('\n')
      : 'Vigil Spend diagnostics: no recorded events.';
    await Clipboard.setStringAsync(text);
    const message = events.length > 0
      ? `Copied ${events.length} redacted diagnostic ${events.length === 1 ? 'event' : 'events'}.`
      : 'No recorded diagnostic events to copy.';
    if (Platform.OS === 'web') setAuthMessage(message);
    else Alert.alert('Diagnostics copied', message);
  }, [canCopyDiagnostics]);
  const tapVersion = useCallback(() => {
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
    versionTapCount.current += 1;
    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      void copyDiagnostics();
      return;
    }
    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
    }, 2500);
  }, [copyDiagnostics]);
  const version = appVersionBuild();
  const diagnosticsVersionFooter = (
    <Pressable
      testID="copy-diagnostics-version"
      accessibilityLabel={t('appVersion')}
      onPress={tapVersion}
      style={styles.versionFooter}
    >
      <Text style={[styles.versionText, { color: palette.mutedForeground }]}>
        Vigil Spend {version.version} · Build {version.build}
      </Text>
    </Pressable>
  );
  const languages: { id: Language; label: string }[] = [{ id: 'en', label: 'EN' }, { id: 'fr', label: 'FR' }, { id: 'cs', label: 'CS' }, { id: 'de', label: 'DE' }, { id: 'es', label: 'ES' }, { id: 'ru', label: 'RU' }, { id: 'ar', label: 'ع' }];
  const saveProfileNames = useCallback(async () => {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    setProfileFirstName(cleanFirstName);
    try {
      const token = await getToken();
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!token || !domain) return;
      await fetch(`https://${domain}/api/vigil/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName: cleanFirstName, lastName: cleanLastName }),
      });
    } catch {
      // The account-scoped local profile name is already available to onboarding.
    }
  }, [firstName, getToken, lastName, setProfileFirstName]);

  const verifyVigilBackendSession = useCallback(async () => {
    const token = await getToken();
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!token) {
      throw Object.assign(new Error('Clerk did not provide an active session token.'), { code: 'missing_session_token' });
    }
    if (!domain) {
      throw Object.assign(new Error('The Vigil Spend API domain is not configured.'), { code: 'missing_api_domain' });
    }
    const response = await fetch(`https://${domain}/api/vigil/identity`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) return;
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-clerk-request-id') || undefined;
    throw Object.assign(new Error(`Vigil Spend backend rejected the active Clerk session (HTTP ${response.status}).`), {
      code: `backend_http_${response.status}`,
      status: response.status,
      requestId,
    });
  }, [getToken]);

  const completeAppleSignup = useCallback(async () => {
    if (!pendingAppleSignup || !setActive) return;
    const supportedFields = ['first_name', 'last_name', 'email_address', 'phone_number', 'username'];
    const unsupportedFields = pendingAppleSignup.missingFields.filter((field) => !supportedFields.includes(field));
    if (unsupportedFields.length > 0) {
      setAuthMessage(`Apple sign-up still needs: ${unsupportedFields.map(readableFieldName).join(', ')}.`);
      return;
    }
    const missingValues = pendingAppleSignup.missingFields.filter(
      (field) => !appleSignupValues[camelFieldName(field)]?.trim(),
    );
    if (missingValues.length > 0) {
      setAuthMessage(`Enter: ${missingValues.map(readableFieldName).join(', ')}.`);
      return;
    }
    const values = Object.fromEntries(
      pendingAppleSignup.missingFields.map((field) => [camelFieldName(field), appleSignupValues[camelFieldName(field)].trim()]),
    );
    const cleanFirstName = appleSignupValues.firstName?.trim();
    try {
      setCustomLoading(true);
      const result = await pendingAppleSignup.update(values);
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw Object.assign(new Error(`Apple sign-up still needs: ${pendingAppleSignup.missingFields.join(', ') || 'additional required fields'}.`), {
          code: 'missing_signup_fields',
          missingFields: pendingAppleSignup.missingFields,
          signupStatus: result.status,
        });
      }
      await setActive({ session: result.createdSessionId });
      await verifyVigilBackendSession();
      await activateClerk();
      setPendingAppleSignup(null);
      setAppleSignupValues({});
      continueAfterAuth(cleanFirstName, themeMode);
    } catch (error) {
      setAuthMessage(t('appleSignInIncomplete'));
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, appleSignupValues, continueAfterAuth, pendingAppleSignup, setActive, themeMode, verifyVigilBackendSession]);

  const completeGoogleSignup = useCallback(async () => {
    if (!pendingGoogleSignup || !setActive) return;
    const unsupportedFields = pendingGoogleSignup.missingFields.filter(
      (field) => !['first_name', 'last_name', 'phone_number', 'username'].includes(field),
    );
    if (unsupportedFields.length > 0) {
      setAuthMessage(`Google sign-up still needs: ${unsupportedFields.map(readableFieldName).join(', ')}.`);
      return;
    }
    const missingValues = pendingGoogleSignup.missingFields.filter(
      (field) => !googleSignupValues[camelFieldName(field)]?.trim(),
    );
    if (missingValues.length > 0) {
      setAuthMessage(`Enter: ${missingValues.map(readableFieldName).join(', ')}.`);
      return;
    }
    try {
      setCustomLoading(true);
      const result = await pendingGoogleSignup.update(googleSignupValues);
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error(`Google sign-up still needs: ${pendingGoogleSignup.missingFields.map(readableFieldName).join(', ')}.`);
      }
      await setActive({ session: result.createdSessionId });
      await verifyVigilBackendSession();
      await activateClerk();
      setPendingGoogleSignup(null);
      setGoogleSignupValues({});
      continueAfterAuth(googleSignupValues.firstName, themeMode);
    } catch (error) {
      setAuthMessage(getAuthErrorMessage(error, 'Google sign-up could not be completed. Please try again.'));
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, continueAfterAuth, googleSignupValues, pendingGoogleSignup, setActive, themeMode, verifyVigilBackendSession]);

  const signInWithPassword = useCallback(async () => {
    if (!signInLoaded || !clerkSignIn || !setActive) {
      setAuthMessage(t('connectionIssue'));
      return;
    }
    if (!email.trim() || !password) {
      const message = t('checkCredentials');
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(t('detailsRequiredTitle'), message);
      return;
    }
    try {
      setCustomLoading(true);
      void recordAuthDiagnostic('password', 'sign-in', 'started');
      const result = await clerkSignIn.create({
        identifier: email.trim().toLowerCase(),
        password,
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error(t('additionalVerification'));
      }
      await setActive({ session: result.createdSessionId });
      await activateClerk();
      void recordAuthDiagnostic('password', 'session-activation', 'success');
      router.replace(destination);
    } catch (error) {
      void recordAuthDiagnostic('password', 'sign-in', 'error', extractAuthError(error));
      const message = getAuthErrorMessage(error, t('checkCredentials'));
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(t('signInFailed'), message);
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, clerkSignIn, destination, email, password, setActive, signInLoaded, t]);

  const requestPasswordReset = useCallback(async () => {
    if (!signInLoaded || !clerkSignIn) return;
    const identifier = email.trim().toLowerCase();
    if (!identifier) {
      Alert.alert(t('forgotPassword'), t('emailRequired'));
      return;
    }
    try {
      setCustomLoading(true);
      await clerkSignIn.create({
        strategy: 'reset_password_email_code',
        identifier,
      });
      setResendCooldown(30);
      setResendMessage(t('codeResent'));
      setMode('forgotReset');
    } catch (error) {
      Alert.alert(t('resetPassword'), getAuthErrorMessage(error, t('resetRequestFailed')));
    } finally {
      setCustomLoading(false);
    }
  }, [clerkSignIn, email, signInLoaded, t]);

  const resendVerificationCode = useCallback(async () => {
    if (customLoading || resendCooldown > 0) return;
    try {
      setCustomLoading(true);
      setAuthMessage(null);
      setResendMessage(null);
      if (mode === 'verify') {
        const currentSignup = currentSignupRef.current;
        if (!signUpLoaded || !currentSignup) return;
        await currentSignup.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else if (mode === 'forgotReset') {
        if (!signInLoaded || !clerkSignIn || !email.trim()) return;
        await clerkSignIn.create({
          strategy: 'reset_password_email_code',
          identifier: email.trim().toLowerCase(),
        });
      } else {
        return;
      }
      setVerificationCode('');
      setResendCooldown(30);
      setResendMessage(t('codeResent'));
    } catch (error) {
      setAuthMessage(getAuthErrorMessage(error, t('resendCodeFailed')));
    } finally {
      setCustomLoading(false);
    }
  }, [clerkSignIn, customLoading, email, mode, resendCooldown, signInLoaded, signUpLoaded, t]);

  const completePasswordReset = useCallback(async () => {
    if (!signInLoaded || !clerkSignIn || !setActive) return;
    if (!verificationCode.trim() || resetPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(t('resetPassword'), t('resetDetailsRequired'));
      return;
    }
    try {
      setCustomLoading(true);
      const result = await clerkSignIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: verificationCode.trim(),
        password: resetPassword,
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error(t('resetIncomplete'));
      }
      await setActive({ session: result.createdSessionId });
      await activateClerk();
      router.replace(destination);
    } catch (error) {
      Alert.alert(t('resetPassword'), getAuthErrorMessage(error, t('resetFailed')));
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, clerkSignIn, destination, resetPassword, setActive, signInLoaded, t, verificationCode]);

  const returnToSignIn = useCallback(() => {
    setMode('signIn');
    currentSignupRef.current = null;
    verificationSessionActivatedRef.current = false;
    setResetPassword('');
    setVerificationCode('');
    setResendCooldown(0);
    setResendMessage(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const providerName = 'Google';
    try {
      setAuthMessage(null);
      setSocialLoading('google');
      void recordAuthDiagnostic('google', 'sso', 'started');
      const ssoResult = await Promise.race([
        Platform.OS === 'web'
          // Clerk's web OAuth flow uses the current page when no redirect URL
          // is supplied. Passing an Expo-generated callback here can close the
          // browser session before Clerk receives the callback.
          ? startSSOFlow({ strategy: 'oauth_google' })
          : startSSOFlow({
            strategy: 'oauth_google',
            redirectUrl: AuthSession.makeRedirectUri({
              scheme: 'vigil-spend',
              path: 'oauth-native-callback',
            }),
          }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${providerName} ${t('socialTimedOut')}`)), 45000)),
      ]);
      const { createdSessionId, setActive: activateSession, signIn, signUp } = ssoResult;
      const ssoState = summarizeGoogleSsoResult(ssoResult);
      console.info('[Vigil] Google Clerk SSO result', ssoState);
      if (!createdSessionId || !activateSession) {
        if (signUp?.status === 'missing_requirements' && signUp.missingFields.length > 0) {
          const missingFields = signUp.missingFields.map(String);
          const initialValues = Object.fromEntries(
            missingFields.map((field) => [
              camelFieldName(field),
              field === 'first_name' ? (signUp.firstName ?? '') : field === 'last_name' ? (signUp.lastName ?? '') : '',
            ]),
          );
          setGoogleSignupValues(initialValues);
          setPendingGoogleSignup({
            missingFields,
            update: async (params) => {
              const updated = await signUp.update(params as Parameters<typeof signUp.update>[0]);
              return { status: updated.status, createdSessionId: updated.createdSessionId };
            },
          });
          setMode('googleComplete');
          return;
        }
        throw new Error(googleSsoIncompleteMessage(ssoState));
      }
      await activateSession({ session: createdSessionId });
      await activateClerk();
      void recordAuthDiagnostic('google', 'session-activation', 'success');
      router.replace(destination);
    } catch (error) {
      void recordAuthDiagnostic('google', 'sso', 'error', extractAuthError(error));
      const message = error instanceof Error ? error.message : `${providerName} ${t('socialRetry')}`;
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(t('signInFailed'), message);
    } finally {
      setSocialLoading(null);
    }
  }, [activateClerk, destination, startSSOFlow, t]);

  const signInWithNativeApple = useCallback(async () => {
    const providerName = 'Apple';
    let appleClaims: AppleIdentityClaims = { appleAudience: '', appleIssuer: '' };
    let stage: 'apple-authentication' | 'clerk-token-exchange' | 'session-activation' | 'backend-request' = Platform.OS === 'ios' ? 'apple-authentication' : 'clerk-token-exchange';
    try {
      setAuthMessage(null);
      setSocialLoading('apple');
      void recordAuthDiagnostic('apple', stage, 'started');
      if (Platform.OS === 'ios') {
        const appleResult = await withAppleIdentityDiagnostics(
          () => startAppleAuthenticationFlow(),
          (claims) => { appleClaims = claims; },
        );
        const { createdSessionId, setActive: activateSession } = appleResult;
        const appleState = summarizeNativeAppleSsoResult(appleResult);
        console.info('[Vigil] Native Apple Clerk result', appleState);
        void recordAuthDiagnostic('apple', 'clerk-token-exchange', 'state', {
          code: appleState.createdSessionIdPresent ? 'session_returned' : 'session_missing',
          message: JSON.stringify(appleState),
          ...appleClaims,
        });
        stage = createdSessionId ? 'session-activation' : 'clerk-token-exchange';
        if (!createdSessionId || !activateSession) {
          const missingFields = appleResult.signUp?.missingFields?.map(String) ?? [];
          const supportedFields = ['first_name', 'last_name', 'email_address', 'phone_number', 'username'];
          if (appleResult.signUp && missingFields.length > 0 && missingFields.every((field) => supportedFields.includes(field))) {
            const initialValues = Object.fromEntries(
              missingFields.map((field) => [
                camelFieldName(field),
                field === 'first_name' ? (appleResult.signUp?.firstName ?? '')
                  : field === 'last_name' ? (appleResult.signUp?.lastName ?? '')
                    : '',
              ]),
            );
            setAppleSignupValues(initialValues);
            setFirstName(initialValues.firstName ?? '');
            setLastName(initialValues.lastName ?? '');
            setPendingAppleSignup({
              update: async (params) => {
                const updated = await appleResult.signUp!.update(params as Parameters<typeof appleResult.signUp.update>[0]);
                return { status: updated.status, createdSessionId: updated.createdSessionId };
              },
              missingFields,
            });
            setMode('appleComplete');
            void recordAuthDiagnostic('apple', 'clerk-token-exchange', 'state', {
              message: `missing signup fields: ${missingFields.join(', ') || 'unknown'}`,
              ...appleClaims,
            });
            return;
          }
          throw Object.assign(new Error(
            missingFields.length > 0
              ? `Apple sign-up still needs: ${missingFields.join(', ')}.`
              : `${providerName} returned an incomplete Clerk session. Please try again.`,
          ), {
            code: missingFields.length > 0 ? 'missing_signup_fields' : 'missing_session',
            missingFields,
            signupStatus: appleResult.signUp?.status,
          });
        }
        await activateSession({ session: createdSessionId });
        stage = 'backend-request';
        await verifyVigilBackendSession();
        await activateClerk();
        void recordAuthDiagnostic('apple', 'backend-request', 'success');
        continueAfterAuth(undefined, themeMode);
        return;
      }
      if (Platform.OS === 'web') {
        // On web, Clerk's Expo SSO helper owns the callback URL. Supplying
        // an Expo-generated callback route points the browser at a route that
        // is not part of this app and can produce a
        // dismiss + needs_identifier result without creating a session.
        const ssoResult = await startSSOFlow({ strategy: 'oauth_apple' });
        const ssoState = summarizeWebAppleSsoResult(ssoResult);
        console.info('[Vigil] Web Apple Clerk SSO result', ssoState);
        if (ssoState.authSessionType === 'dismiss') {
          setAuthMessage(null);
          void recordAuthDiagnostic('apple', 'clerk-token-exchange', 'state', { message: 'Apple web flow dismissed.' });
          return;
        }
        if (ssoResult.createdSessionId && ssoResult.setActive) {
          await ssoResult.setActive({ session: ssoResult.createdSessionId });
          stage = 'backend-request';
          await verifyVigilBackendSession();
          await activateClerk();
          void recordAuthDiagnostic('apple', 'backend-request', 'success');
          continueAfterAuth(undefined, themeMode);
          return;
        }
        throw new Error(webAppleStatusMessage(ssoState));
      }
      throw new Error(t('appleOnlyIos'));
    } catch (error) {
      const diagnosticStage = stage === 'apple-authentication' ? classifyAppleFailure(error) : stage;
      void recordAuthDiagnostic('apple', diagnosticStage, 'error', { ...extractAuthError(error), ...appleClaims });
      if (Platform.OS === 'web') logWebAppleClerkError(error);
      const message = t('appleSignInIncomplete');
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(t('signInFailed'), message);
    } finally {
      setSocialLoading(null);
    }
  }, [activateClerk, continueAfterAuth, startAppleAuthenticationFlow, startSSOFlow, themeMode, verifyVigilBackendSession]);

  const createAccount = useCallback(async () => {
    if (!signUpLoaded || !signUp || !setActive || signupInFlightRef.current) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(t('detailsRequiredTitle'), t('detailsRequiredCopy'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('passwordsMismatch'), t('passwordsMismatchCopy'));
      return;
    }
    try {
      signupInFlightRef.current = true;
      setCustomLoading(true);
      void recordAuthDiagnostic('password', 'sign-up', 'started');
      // Do not let a stale native session become the identity for a new
      // account creation attempt.
      if (isSignedIn) await signOutIdentity();
      const createdSignup = await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        password,
         firstName: firstName.trim(),
         lastName: lastName.trim(),
      });
      currentSignupRef.current = createdSignup;
      verificationSessionActivatedRef.current = false;
      void recordAuthDiagnostic('password', 'sign-up', 'state', {
        message: JSON.stringify(summarizeCustomSignup(createdSignup)),
      });
      if (createdSignup.status === 'complete' && createdSignup.createdSessionId) {
        await setActive({ session: createdSignup.createdSessionId });
        await activateClerk();
        await saveProfileNames();
        continueAfterAuth(firstName, themeMode);
        void recordAuthDiagnostic('password', 'session-activation', 'success');
      } else {
        const preparedSignup = await createdSignup.prepareEmailAddressVerification({ strategy: 'email_code' });
        currentSignupRef.current = preparedSignup ?? createdSignup;
        setVerificationCode('');
        setResendCooldown(30);
        setResendMessage(null);
        setMode('verify');
      }
    } catch (error) {
      void recordAuthDiagnostic('password', 'sign-up', 'error', extractAuthError(error));
      Alert.alert(t('createAccountFailed'), getAuthErrorMessage(error, t('checkDetails')));
    } finally {
      signupInFlightRef.current = false;
      setCustomLoading(false);
    }
  }, [activateClerk, confirmPassword, continueAfterAuth, email, firstName, isSignedIn, lastName, password, saveProfileNames, setActive, signOutIdentity, signUp, signUpLoaded, themeMode]);

  const verifyAccount = useCallback(async () => {
    const currentSignup = currentSignupRef.current;
    if (!signUpLoaded || !currentSignup || !setActive || verificationInFlightRef.current) {
      setAuthMessage(t('connectionIssue'));
      return;
    }
    if (!verificationCode.trim()) {
      setAuthMessage(t('checkVerificationCode'));
      return;
    }
    try {
      verificationInFlightRef.current = true;
      setCustomLoading(true);
      void recordAuthDiagnostic('password', 'email-verification', 'started');
      const result = await currentSignup.attemptEmailAddressVerification({ code: verificationCode.trim() });
      currentSignupRef.current = result;
      const signupState = summarizeCustomSignup(result);
      void recordAuthDiagnostic('password', 'email-verification', 'state', {
        message: JSON.stringify(signupState),
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw Object.assign(new Error(t('verificationCodeNotReady')), {
          code: 'signup_incomplete',
          signupStatus: signupState.signupStatus,
          emailVerificationStatus: signupState.emailVerificationStatus,
          missingFields: signupState.missingFields,
        });
      }
      if (verificationSessionActivatedRef.current) return;
      verificationSessionActivatedRef.current = true;
      await setActive({ session: result.createdSessionId });
      await activateClerk();
      await saveProfileNames();
      continueAfterAuth(firstName, themeMode);
      void recordAuthDiagnostic('password', 'email-verification', 'success');
    } catch (error) {
      const details = extractAuthError(error);
      void recordAuthDiagnostic('password', 'email-verification', 'error', details);
      const alreadyVerified = details.message.toLocaleLowerCase().includes('already been verified')
        || details.message.toLocaleLowerCase().includes('already verified');
      const rateLimited = details.httpStatus === '429' || details.message.toLocaleLowerCase().includes('too many requests');
      // Clerk can return an already-verified error when a second UI callback
      // races the first request. Inspect the current resource once; never
      // submit the code again or retry automatically.
      const currentSignupState = summarizeCustomSignup(currentSignup);
      void recordAuthDiagnostic('password', 'email-verification', 'state', {
        message: JSON.stringify(currentSignupState),
      });
      if (alreadyVerified && currentSignup.status === 'complete' && currentSignup.createdSessionId) {
        if (verificationSessionActivatedRef.current) return;
        verificationSessionActivatedRef.current = true;
        await setActive({ session: currentSignup.createdSessionId });
        await activateClerk();
        await saveProfileNames();
        continueAfterAuth(firstName, themeMode);
        void recordAuthDiagnostic('password', 'email-verification', 'success', { message: 'Already verified; activated completed signup.' });
        return;
      }
      const message = rateLimited ? t('verificationRateLimited') : getAuthErrorMessage(error, t('checkVerificationCode'));
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(t('verificationFailed'), message);
    } finally {
      verificationInFlightRef.current = false;
      setCustomLoading(false);
    }
  }, [activateClerk, continueAfterAuth, firstName, saveProfileNames, setActive, signUpLoaded, t, themeMode, verificationCode]);

  const signOutAndSwitchAccount = useCallback(async () => {
    try {
      setCustomLoading(true);
      setAuthMessage(null);
      await signOutIdentity();
    } catch (error) {
       setAuthMessage(getAuthErrorMessage(error, t('signOutFailed')));
    } finally {
      setCustomLoading(false);
    }
  }, [signOutIdentity]);

  const inputStyle = [styles.input, { backgroundColor: palette.card, borderColor: palette.border, color: palette.foreground }];
  if (isLoaded && isSignedIn) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}>
          <Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={[styles.title, { color: palette.foreground }]}>{t('signOutQuestion')}</Text>
        <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
           {email || t('activeAccountCopy')}
        </Text>
        {authMessage ? <Text accessibilityRole="alert" style={[styles.authMessage, { color: palette.destructive }]}>{authMessage}</Text> : null}
        <Pressable
          disabled={customLoading}
          onPress={() => router.replace(destination)}
          style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.primary, borderColor: palette.primary }, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-forward-outline" size={20} color={palette.primaryForeground} />
          <Text style={[styles.providerText, { color: palette.primaryForeground }]}>{t('continueLabel')}</Text>
        </Pressable>
        <Pressable
          testID="sign-out-and-switch-account"
          disabled={customLoading}
          onPress={() => void signOutAndSwitchAccount()}
          style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.card, borderColor: palette.border }, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={20} color={palette.foreground} />
          <Text style={[styles.providerText, { color: palette.foreground }]}>
             {customLoading ? t('loading') : t('signOutAnotherAccount')}
          </Text>
        </Pressable>
        {diagnosticsVersionFooter}
      </View>
    );
  }

  if (mode === 'googleComplete' && pendingGoogleSignup) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={70}>
          <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}>
            <Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={[styles.title, { color: palette.foreground }]}>Complete your Google account</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
            Google sign-in returned successfully, but Clerk needs a few more details before creating your Vigil Spend account.
          </Text>
          {authMessage ? <Text accessibilityRole="alert" style={[styles.authMessage, { color: palette.destructive }]}>{authMessage}</Text> : null}
          <View nativeID="clerk-captcha" style={styles.captchaSlot} />
          {pendingGoogleSignup.missingFields.map((field) => {
            const fieldKey = camelFieldName(field);
            return (
              <TextInput
                key={field}
                testID={`google-signup-${fieldKey}`}
                value={googleSignupValues[fieldKey] ?? ''}
                onChangeText={(value) => setGoogleSignupValues((current) => ({ ...current, [fieldKey]: value }))}
                autoCapitalize={fieldKey === 'phoneNumber' ? 'none' : 'words'}
                keyboardType={fieldKey === 'phoneNumber' ? 'phone-pad' : 'default'}
                autoComplete={fieldKey === 'firstName' ? 'given-name' : fieldKey === 'lastName' ? 'family-name' : fieldKey === 'phoneNumber' ? 'tel' : 'username'}
                placeholder={readableFieldName(field)}
                placeholderTextColor={palette.mutedForeground}
                style={inputStyle}
              />
            );
          })}
          <Pressable
            testID="complete-google-signup"
            disabled={customLoading}
            onPress={() => void completeGoogleSignup()}
            style={[styles.primaryButton, { backgroundColor: palette.primary }]}
          >
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? t('loading') : t('continueLabel')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPendingGoogleSignup(null);
              setGoogleSignupValues({});
              setAuthMessage(null);
              setMode('signIn');
            }}
            style={styles.backButton}
          >
            <Text style={[styles.backText, { color: palette.primary }]}>{t('backToSignIn')}</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (mode === 'appleComplete' && pendingAppleSignup) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={70}>
          <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}><Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" /></View>
          <Text style={[styles.title, { color: palette.foreground }]}>Complete your Apple account</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>Apple sign-in needs your first and last name before Vigil Spend can create the account.</Text>
          {authMessage ? <Text accessibilityRole="alert" style={[styles.authMessage, { color: palette.destructive }]}>{authMessage}</Text> : null}
          <View style={styles.inputRow}>
            {pendingAppleSignup.missingFields.map((field) => {
              const fieldKey = camelFieldName(field);
              return (
                <TextInput
                  key={field}
                  testID={`apple-signup-${fieldKey}`}
                  value={appleSignupValues[fieldKey] ?? ''}
                  onChangeText={(value) => setAppleSignupValues((current) => ({ ...current, [fieldKey]: value }))}
                  placeholder={readableFieldName(field)}
                  placeholderTextColor={palette.mutedForeground}
                  style={[inputStyle, pendingAppleSignup.missingFields.length > 1 ? styles.halfInput : undefined]}
                  autoComplete={fieldKey === 'firstName' ? 'given-name' : fieldKey === 'lastName' ? 'family-name' : fieldKey === 'emailAddress' ? 'email' : fieldKey === 'phoneNumber' ? 'tel' : 'username'}
                  keyboardType={fieldKey === 'emailAddress' ? 'email-address' : fieldKey === 'phoneNumber' ? 'phone-pad' : 'default'}
                  autoCapitalize={fieldKey === 'emailAddress' || fieldKey === 'username' ? 'none' : 'words'}
                />
              );
            })}
          </View>
          <Pressable testID="complete-apple-signup" disabled={customLoading} onPress={() => void completeAppleSignup()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}>
            <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? t('loading') : t('continueLabel')}</Text>
          </Pressable>
          <Pressable onPress={() => { setPendingAppleSignup(null); setAppleSignupValues({}); setMode('signIn'); }} style={styles.backButton}><Text style={[styles.backText, { color: palette.primary }]}>{t('backToSignIn')}</Text></Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (mode === 'forgotRequest' || mode === 'forgotReset') {
    const isResetStep = mode === 'forgotReset';
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={70}>
          <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}><Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" /></View>
          <Text style={[styles.title, { color: palette.foreground }]}>{t('forgotPassword')}</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
            {isResetStep ? `${t('resetCodeSent')}: ${email}` : t('forgotPasswordCopy')}
          </Text>
          <View nativeID="clerk-captcha" style={styles.captchaSlot} />
          {!isResetStep ? (
            <>
              <TextInput
                testID="password-reset-email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder={t('emailAddress')}
                placeholderTextColor={palette.mutedForeground}
                style={inputStyle}
                autoFocus
              />
              <Pressable
                testID="send-password-reset-code"
                disabled={customLoading}
                onPress={() => void requestPasswordReset()}
                style={[styles.primaryButton, { backgroundColor: palette.primary }]}
              >
                <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? t('loading') : t('sendResetCode')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                testID="password-reset-code"
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder={t('verificationCode')}
                placeholderTextColor={palette.mutedForeground}
                style={inputStyle}
                autoFocus
              />
              <TextInput
                testID="password-reset-new-password"
                value={resetPassword}
                onChangeText={setResetPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder={t('newPassword')}
                placeholderTextColor={palette.mutedForeground}
                style={inputStyle}
              />
              <Pressable
                testID="complete-password-reset"
                disabled={customLoading}
                onPress={() => void completePasswordReset()}
                style={[styles.primaryButton, { backgroundColor: palette.primary }]}
              >
                <Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? t('loading') : t('resetPassword')}</Text>
              </Pressable>
              {resendMessage && <Text style={[styles.successMessage, { color: palette.positive }]}>{resendMessage}</Text>}
              <Pressable
                testID="resend-password-reset-code"
                disabled={customLoading || resendCooldown > 0}
                onPress={() => void resendVerificationCode()}
                style={styles.backButton}
              >
                <Text style={[styles.backText, { color: palette.primary }, (customLoading || resendCooldown > 0) && { opacity: 0.55 }]}>
                  {resendCooldown > 0 ? t('resendCodeIn').replace('{seconds}', String(resendCooldown)) : t('resendCode')}
                </Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={returnToSignIn} style={styles.backButton}>
            <Text style={[styles.backText, { color: palette.primary }]}>{t('backToSignIn')}</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (mode !== 'signIn') {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={70}>
           <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}><Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" /></View>
          <Text style={[styles.title, { color: palette.foreground }]}>{mode === 'verify' ? t('checkEmail') : t('customAccount')}</Text>
          <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>{mode === 'verify' ? `${t('checkEmail')}: ${email}` : t('authCopy')}</Text>
           <View nativeID="clerk-captcha" style={styles.captchaSlot} />
          {authMessage && <Text accessibilityRole="alert" style={[styles.authMessage, { color: palette.destructive }]}>{authMessage}</Text>}
          {mode === 'verify' ? (
            <>
               <TextInput
                 testID="email-verification-code"
                 value={verificationCode}
                 onChangeText={(value) => { setVerificationCode(value); setAuthMessage(null); }}
                 onSubmitEditing={() => void verifyAccount()}
                 returnKeyType="done"
                 keyboardType="number-pad"
                 textContentType="oneTimeCode"
                 autoComplete="one-time-code"
                 placeholder={t('verificationCode')}
                 placeholderTextColor={palette.mutedForeground}
                 style={inputStyle}
                 autoFocus
               />
              <Pressable disabled={customLoading} onPress={() => void verifyAccount()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? '…' : t('verifyContinue')}</Text></Pressable>
               {resendMessage && <Text style={[styles.successMessage, { color: palette.positive }]}>{resendMessage}</Text>}
               <Pressable
                 testID="resend-email-verification-code"
                 disabled={customLoading || resendCooldown > 0}
                 onPress={() => void resendVerificationCode()}
                 style={styles.backButton}
               >
                 <Text style={[styles.backText, { color: palette.primary }, (customLoading || resendCooldown > 0) && { opacity: 0.55 }]}>
                   {resendCooldown > 0 ? t('resendCodeIn').replace('{seconds}', String(resendCooldown)) : t('resendCode')}
                 </Text>
               </Pressable>
                <Pressable onPress={() => { setAuthMessage(null); setMode('signUp'); }} style={styles.backButton}><Text style={[styles.backText, { color: palette.primary }]}>{t('backToAccountDetails')}</Text></Pressable>
            </>
          ) : (
            <>
              <View style={styles.inputRow}><TextInput value={firstName} onChangeText={setFirstName} placeholder={t('firstName')} placeholderTextColor={palette.mutedForeground} style={[inputStyle, styles.halfInput]} autoComplete="given-name" /><TextInput value={lastName} onChangeText={setLastName} placeholder={t('lastName')} placeholderTextColor={palette.mutedForeground} style={[inputStyle, styles.halfInput]} autoComplete="family-name" /></View>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('emailAddress')} placeholderTextColor={palette.mutedForeground} style={inputStyle} autoComplete="email" />
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={t('phoneOptional')} placeholderTextColor={palette.mutedForeground} style={inputStyle} autoComplete="tel" />
              <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder={t('passwordHint')} placeholderTextColor={palette.mutedForeground} style={inputStyle} autoComplete="new-password" />
              <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder={t('confirmPassword')} placeholderTextColor={palette.mutedForeground} style={inputStyle} autoComplete="new-password" />
              <Text style={[styles.appearancePrompt, { color: palette.foreground }]}>{t('chooseAppearance')}</Text>
              <View style={styles.themeChoices}>
                {([
                  { id: 'light', label: t('themeLight'), icon: 'sunny-outline' },
                  { id: 'dark', label: t('themeDark'), icon: 'moon-outline' },
                  { id: 'auto', label: t('themeAuto'), icon: 'contrast-outline' },
                ] as const).map((theme) => (
                  <Pressable
                    key={theme.id}
                    testID={`sign-up-appearance-${theme.id}`}
                    onPress={() => setThemeMode(theme.id)}
                    style={[
                      styles.themeChoice,
                      {
                        backgroundColor: themeMode === theme.id ? palette.accent : palette.card,
                        borderColor: themeMode === theme.id ? palette.primary : palette.border,
                      },
                    ]}
                  >
                    <Ionicons name={theme.icon} size={17} color={themeMode === theme.id ? palette.primary : palette.mutedForeground} />
                    <Text style={[styles.themeChoiceText, { color: themeMode === theme.id ? palette.primary : palette.foreground }]}>{theme.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable disabled={customLoading} onPress={() => void createAccount()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? t('creating') : t('createAccount')}</Text></Pressable>
              {(Platform.OS === 'ios' || Platform.OS === 'web') && <Pressable
                testID="apple-sign-up"
                disabled={customLoading || socialLoading !== null}
                onPress={() => void signInWithNativeApple()}
                style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.foreground, borderColor: palette.foreground }, pressed && styles.pressed]}
              >
                <Ionicons name="logo-apple" size={20} color={palette.background} />
                 <Text style={[styles.providerText, { color: palette.background }]}>{socialLoading === 'apple' ? t('openingApple') : t('signUpWithApple')}</Text>
              </Pressable>}
              {clerkAvailable && <Pressable
                testID="google-sign-up"
                disabled={customLoading || socialLoading !== null}
                onPress={() => void signInWithGoogle()}
                style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.card, borderColor: palette.border }, pressed && styles.pressed]}
              >
                <Ionicons name="logo-google" size={20} color={palette.foreground} />
                 <Text style={[styles.providerText, { color: palette.foreground }]}>{socialLoading === 'google' ? t('openingGoogle') : t('signUpWithGoogle')}</Text>
              </Pressable>}
              <Pressable onPress={() => { setAuthMessage(null); setMode('signIn'); }} style={styles.backButton}><Text style={[styles.backText, { color: palette.primary }]}>{t('alreadyAccount')}</Text></Pressable>
            </>
          )}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
       <View style={[styles.logoFrame, { backgroundColor: palette.primary }]}><Image source={require('@/assets/images/icon-transparent.png')} style={styles.logo} resizeMode="contain" /></View>
       <View style={styles.languageRow}>{languages.map((item) => <Pressable key={item.id} onPress={() => setLanguage(item.id)} style={[styles.languageButton, { backgroundColor: language === item.id ? palette.accent : palette.card, borderColor: language === item.id ? palette.primary : palette.border }]}><Text style={[styles.languageText, { color: language === item.id ? palette.primary : palette.mutedForeground }]}>{item.label}</Text></Pressable>)}</View>
       <Text style={[styles.title, { color: palette.foreground }]}>{t('authTitle')}</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
        {t('authCopy')}
      </Text>
       <View nativeID="clerk-captcha" style={styles.captchaSlot} />

        {authMessage ? <Text accessibilityRole="alert" style={[styles.authMessage, { color: palette.destructive }]}>{authMessage}</Text> : null}
        {clerkAvailable && <TextInput
         testID="sign-in-email"
         value={email}
          onChangeText={(value) => { setEmail(value); setAuthMessage(null); }}
         autoCapitalize="none"
         keyboardType="email-address"
         autoComplete="email"
         placeholder={t('emailAddress')}
         placeholderTextColor={palette.mutedForeground}
         style={inputStyle}
        />}
        {clerkAvailable && <TextInput
         testID="sign-in-password"
         value={password}
          onChangeText={(value) => { setPassword(value); setAuthMessage(null); }}
         secureTextEntry
         autoComplete="current-password"
         placeholder={t('passwordHint')}
         placeholderTextColor={palette.mutedForeground}
         style={inputStyle}
        />}
           {clerkAvailable && <Pressable testID="forgot-password" onPress={() => { setAuthMessage(null); setMode('forgotRequest'); }} style={styles.forgotButton}>
          <Text style={[styles.forgotText, { color: palette.primary }]}>{t('forgotPassword')}</Text>
         </Pressable>}
        {clerkAvailable && <Pressable
         testID="email-password-sign-in"
         disabled={customLoading || socialLoading !== null}
         onPress={() => void signInWithPassword()}
         style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.primary, borderColor: palette.primary }, pressed && styles.pressed]}
       >
         <Ionicons name="log-in-outline" size={20} color={palette.primaryForeground} />
          <Text style={[styles.providerText, { color: palette.primaryForeground }]}>{customLoading ? t('loading') : t('signIn')}</Text>
        </Pressable>}

          {(Platform.OS === 'ios' || Platform.OS === 'web') && <Pressable
          testID="apple-sign-in"
          disabled={customLoading || socialLoading !== null}
           onPress={() => void signInWithNativeApple()}
          style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.foreground, borderColor: palette.foreground }, pressed && styles.pressed]}
        >
          <Ionicons name="logo-apple" size={20} color={palette.background} />
           <Text style={[styles.providerText, { color: palette.background }]}>{socialLoading === 'apple' ? t('openingApple') : t('continueWithApple')}</Text>
          </Pressable>}

        {clerkAvailable && <Pressable
         testID="google-sign-in"
         disabled={customLoading || socialLoading !== null}
           onPress={() => void signInWithGoogle()}
         style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.card, borderColor: palette.border }, pressed && styles.pressed]}
       >
         <Ionicons name="logo-google" size={20} color={palette.foreground} />
          <Text style={[styles.providerText, { color: palette.foreground }]}>{socialLoading === 'google' ? t('openingGoogle') : t('continueWithGoogle')}</Text>
        </Pressable>}

       {clerkAvailable && <Pressable onPress={() => { setAuthMessage(null); setMode('signUp'); }} style={styles.createAccountButton}>
        <Text style={[styles.createAccountText, { color: palette.primary }]}>{t('customAccount')}</Text>
      </Pressable>}
       <View style={styles.legalLinks}><Pressable onPress={() => router.push('/legal?document=privacy')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('privacyPolicy')}</Text></Pressable><Pressable onPress={() => router.push('/legal?document=terms')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsConditions')}</Text></Pressable></View>
       {diagnosticsVersionFooter}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  formContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 30 },
  logoFrame: { width: 96, height: 96, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 88, height: 88 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, textAlign: 'center', marginTop: 24 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 28 },
  providerButton: { minHeight: 54, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 11 },
  providerText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  inputRow: { width: '100%', flexDirection: 'row', gap: 9 },
  input: { minHeight: 53, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 10 },
  halfInput: { flex: 1, flexBasis: 0, minWidth: 0, width: 0 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  createAccountButton: { alignItems: 'center', paddingVertical: 8 },
  createAccountText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  forgotButton: { alignItems: 'flex-end', paddingTop: 10, paddingBottom: 2 },
  forgotText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  authMessage: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 14, textAlign: 'center' },
  successMessage: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  appearancePrompt: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 18 },
  themeChoices: { flexDirection: 'row', gap: 8, marginTop: 10 },
  themeChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  themeChoiceText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  backButton: { alignItems: 'center', paddingVertical: 18 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  languageRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 18 },
  languageButton: { minWidth: 32, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  languageText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 16 },
  legalText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  versionFooter: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  versionText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  captchaSlot: { minHeight: 8, width: '100%' },
});