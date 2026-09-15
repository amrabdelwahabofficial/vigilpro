import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useClerk, useSSO } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Language, ThemeMode, useVigil } from '@/context/AppContext';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useIdentity } from '@/context/IdentityContext';

WebBrowser.maybeCompleteAuthSession();
const MIN_PASSWORD_LENGTH = 8;

type AuthMode = 'signIn' | 'signUp' | 'verify' | 'forgotRequest' | 'forgotReset';
type SocialProvider = 'google' | 'apple';

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
    return `Apple sign-in browser flow ended with ${state.authSessionType}.`;
  }
  if (state.signInStatus === 'needs_second_factor' || state.secondFactorStatus === 'unverified') {
    return `Apple sign-in requires a second factor (${statusText}). Complete the additional verification and try again.`;
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

function getWebAppleRedirectUrl(): string {
  const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL?.replace(/\/+$/, '');
  if (proxyUrl) return `${proxyUrl}/v1/oauth_callback`;
  return AuthSession.makeRedirectUri({ path: 'sso-callback' });
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
  const [customLoading, setCustomLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
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

  const signInWithPassword = useCallback(async () => {
    if (!signInLoaded || !clerkSignIn || !setActive) {
      setAuthMessage('Sign-in is still connecting. Check your internet connection and try again.');
      return;
    }
    if (!email.trim() || !password) {
      const message = 'Email and password are required.';
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert('Enter your details', message);
      return;
    }
    try {
      setCustomLoading(true);
      const result = await clerkSignIn.create({
        identifier: email.trim().toLowerCase(),
        password,
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error('This account needs an additional verification step. Please use account recovery or contact support.');
      }
      await setActive({ session: result.createdSessionId });
      await activateClerk();
      router.replace(destination);
    } catch (error) {
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
      setMode('forgotReset');
    } catch (error) {
      Alert.alert(t('resetPassword'), getAuthErrorMessage(error, t('resetRequestFailed')));
    } finally {
      setCustomLoading(false);
    }
  }, [clerkSignIn, email, signInLoaded, t]);

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
    setResetPassword('');
    setVerificationCode('');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const providerName = 'Google';
    try {
      setAuthMessage(null);
      setSocialLoading('google');
      const { createdSessionId, setActive: activateSession } = await Promise.race([
        startSSOFlow({
          strategy: 'oauth_google',
          redirectUrl: AuthSession.makeRedirectUri({
            scheme: 'vigil-spend',
            path: 'oauth-native-callback',
          }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${providerName} sign-in timed out`)), 45000)),
      ]);
      if (!createdSessionId || !activateSession) {
        throw new Error(`${providerName} sign-in needs one more verification step. Please try again.`);
      }
      await activateSession({ session: createdSessionId });
      await activateClerk();
      router.replace(destination);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check your connection and try again.';
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(`Could not sign in with ${providerName}`, message);
    } finally {
      setSocialLoading(null);
    }
  }, [activateClerk, destination, startSSOFlow]);

  const signInWithNativeApple = useCallback(async () => {
    const providerName = 'Apple';
    try {
      setAuthMessage(null);
      setSocialLoading('apple');
      if (Platform.OS === 'ios') {
        const { createdSessionId, setActive: activateSession } = await startAppleAuthenticationFlow();
        if (!createdSessionId || !activateSession) {
          throw new Error(`${providerName} sign-in needs one more verification step. Please try again.`);
        }
        await activateSession({ session: createdSessionId });
        await activateClerk();
        continueAfterAuth(undefined, themeMode);
        return;
      }
      if (Platform.OS === 'web') {
        const redirectUrl = getWebAppleRedirectUrl();
        try {
          const redirect = new URL(redirectUrl);
          console.info('[Vigil] Web Apple Clerk redirect', {
            origin: redirect.origin,
            pathname: redirect.pathname,
          });
        } catch {
          console.error('[Vigil] Web Apple Clerk redirect is not an absolute URL');
        }
        const ssoResult = await startSSOFlow({
          strategy: 'oauth_apple',
          redirectUrl,
        });
        const ssoState = summarizeWebAppleSsoResult(ssoResult);
        console.info('[Vigil] Web Apple Clerk SSO result', ssoState);
        if (ssoResult.createdSessionId && ssoResult.setActive) {
          await ssoResult.setActive({ session: ssoResult.createdSessionId });
          await activateClerk();
          continueAfterAuth(undefined, themeMode);
          return;
        }
        throw new Error(webAppleStatusMessage(ssoState));
      }
      throw new Error('Sign in with Apple is available in the iOS app only.');
    } catch (error) {
      if (Platform.OS === 'web') logWebAppleClerkError(error);
      const message = error instanceof Error ? error.message : `${providerName} sign-in could not be completed. Please try again.`;
      setAuthMessage(message);
      if (Platform.OS !== 'web') Alert.alert(`Could not sign in with ${providerName}`, message);
    } finally {
      setSocialLoading(null);
    }
  }, [activateClerk, continueAfterAuth, startAppleAuthenticationFlow, startSSOFlow, themeMode]);

  const createAccount = useCallback(async () => {
    if (!signUpLoaded || !signUp || !setActive) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Complete your details', `First name, last name, email, and a password of at least ${MIN_PASSWORD_LENGTH} characters are required.`);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }
    try {
      setCustomLoading(true);
      // Do not let a stale native session become the identity for a new
      // account creation attempt.
      if (isSignedIn) await signOutIdentity();
      // Managed Clerk tenants validate profile names separately from the
      // credential signup request. Email is the account identity; save names
      // during onboarding after the session is active.
      await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        password,
      });
      if (signUp.status === 'complete') {
        await setActive({ session: signUp.createdSessionId });
        await activateClerk();
        await saveProfileNames();
        continueAfterAuth(firstName, themeMode);
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setMode('verify');
      }
    } catch (error) {
      Alert.alert(t('createAccountFailed'), getAuthErrorMessage(error, t('checkDetails')));
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, confirmPassword, continueAfterAuth, email, firstName, isSignedIn, lastName, password, saveProfileNames, setActive, signOutIdentity, signUp, signUpLoaded, themeMode]);

  const verifyAccount = useCallback(async () => {
    if (!signUpLoaded || !signUp || !setActive) return;
    try {
      setCustomLoading(true);
      const result = await signUp.attemptEmailAddressVerification({ code: verificationCode.trim() });
      if (result.status !== 'complete') throw new Error('That code is not ready yet. Please try again.');
      await setActive({ session: result.createdSessionId });
      await activateClerk();
      await saveProfileNames();
      continueAfterAuth(firstName, themeMode);
    } catch (error) {
      Alert.alert(t('verificationFailed'), getAuthErrorMessage(error, t('checkVerificationCode')));
    } finally {
      setCustomLoading(false);
    }
  }, [activateClerk, continueAfterAuth, firstName, saveProfileNames, setActive, signUp, signUpLoaded, themeMode, verificationCode]);

  const signOutAndSwitchAccount = useCallback(async () => {
    try {
      setCustomLoading(true);
      setAuthMessage(null);
      await signOutIdentity();
    } catch (error) {
      setAuthMessage(getAuthErrorMessage(error, 'The current account could not be signed out. Please try again.'));
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
          {email || 'This browser already has an active Vigil account.'}
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
            {customLoading ? t('loading') : 'Sign out and use another account'}
          </Text>
        </Pressable>
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
              <TextInput value={verificationCode} onChangeText={setVerificationCode} keyboardType="number-pad" placeholder={t('verificationCode')} placeholderTextColor={palette.mutedForeground} style={inputStyle} autoFocus />
              <Pressable disabled={customLoading} onPress={() => void verifyAccount()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={[styles.primaryText, { color: palette.primaryForeground }]}>{customLoading ? '…' : t('verifyContinue')}</Text></Pressable>
              <Pressable onPress={() => setMode('signUp')} style={styles.backButton}><Text style={[styles.backText, { color: palette.primary }]}>Back to account details</Text></Pressable>
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
                <Text style={[styles.providerText, { color: palette.background }]}>{socialLoading === 'apple' ? 'Opening Apple…' : t('signUpWithApple')}</Text>
              </Pressable>}
              {clerkAvailable && <Pressable
                testID="google-sign-up"
                disabled={customLoading || socialLoading !== null}
                onPress={() => void signInWithGoogle()}
                style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.card, borderColor: palette.border }, pressed && styles.pressed]}
              >
                <Ionicons name="logo-google" size={20} color={palette.foreground} />
                <Text style={[styles.providerText, { color: palette.foreground }]}>{socialLoading === 'google' ? 'Opening Google…' : t('signUpWithGoogle')}</Text>
              </Pressable>}
              <Pressable onPress={() => setMode('signIn')} style={styles.backButton}><Text style={[styles.backText, { color: palette.primary }]}>{t('alreadyAccount')}</Text></Pressable>
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
         {clerkAvailable && <Pressable testID="forgot-password" onPress={() => setMode('forgotRequest')} style={styles.forgotButton}>
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
          <Text style={[styles.providerText, { color: palette.background }]}>{socialLoading === 'apple' ? 'Opening Apple…' : t('continueWithApple')}</Text>
          </Pressable>}

        {clerkAvailable && <Pressable
         testID="google-sign-in"
         disabled={customLoading || socialLoading !== null}
           onPress={() => void signInWithGoogle()}
         style={({ pressed }) => [styles.providerButton, { backgroundColor: palette.card, borderColor: palette.border }, pressed && styles.pressed]}
       >
         <Ionicons name="logo-google" size={20} color={palette.foreground} />
         <Text style={[styles.providerText, { color: palette.foreground }]}>{socialLoading === 'google' ? 'Opening Google…' : t('continueWithGoogle')}</Text>
        </Pressable>}

      {clerkAvailable && <Pressable onPress={() => setMode('signUp')} style={styles.createAccountButton}>
        <Text style={[styles.createAccountText, { color: palette.primary }]}>{t('customAccount')}</Text>
      </Pressable>}
      <View style={styles.legalLinks}><Pressable onPress={() => router.push('/legal?document=privacy')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('privacyPolicy')}</Text></Pressable><Pressable onPress={() => router.push('/legal?document=terms')}><Text style={[styles.legalText, { color: palette.mutedForeground }]}>{t('termsConditions')}</Text></Pressable></View>
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
  captchaSlot: { minHeight: 8, width: '100%' },
});