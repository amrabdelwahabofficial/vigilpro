import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { extendedMessage } from '../lib/localization.ts';

const signInSource = fs.readFileSync(new URL('../app/(auth)/sign-in.tsx', import.meta.url), 'utf8');
const identitySource = fs.readFileSync(new URL('../context/IdentityContext.tsx', import.meta.url), 'utf8');
const vigilAppSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');

test('email password recovery keeps the complete Clerk reset flow wired', () => {
  assert.match(signInSource, /testID="forgot-password"/);
  assert.match(signInSource, /testID="send-password-reset-code"/);
  assert.match(signInSource, /testID="password-reset-code"/);
  assert.match(signInSource, /testID="password-reset-new-password"/);
  assert.match(signInSource, /testID="complete-password-reset"/);
  assert.match(signInSource, /strategy: 'reset_password_email_code'/);
  assert.match(signInSource, /attemptFirstFactor/);
});

test('password recovery copy exists in every supported language', () => {
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    assert.match(extendedMessage(language, 'passwordHint'), /8/);
    assert.match(extendedMessage(language, 'newPassword'), /8/);
    assert.match(extendedMessage(language, 'resetDetailsRequired'), /8/);
    assert.notEqual(extendedMessage(language, 'forgotPassword'), 'forgotPassword');
    assert.notEqual(extendedMessage(language, 'sendResetCode'), 'sendResetCode');
    assert.notEqual(extendedMessage(language, 'resetPassword'), 'resetPassword');
    assert.notEqual(extendedMessage(language, 'backToSignIn'), 'backToSignIn');
  }
});

test('sign-up keeps the selected appearance options and carries the choice into onboarding', () => {
  assert.match(signInSource, /testID=\{`sign-up-appearance-\$\{theme\.id\}`\}/);
  assert.match(signInSource, /id: 'light'/);
  assert.match(signInSource, /id: 'dark'/);
  assert.match(signInSource, /id: 'auto'/);
  assert.match(signInSource, /continueAfterAuth\(firstName, themeMode\)/);
  const onboardingSource = fs.readFileSync(new URL('../app/onboarding.tsx', import.meta.url), 'utf8');
  assert.match(onboardingSource, /routeAppearance/);
  assert.match(onboardingSource, /setThemeMode\(signupAppearance\)/);
});

test('subscription entry defers price and charge confirmation to Apple', () => {
  const paywallSource = fs.readFileSync(new URL('../components/Paywall.tsx', import.meta.url), 'utf8');
  assert.match(paywallSource, /pkg\?\.product\.priceString/);
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    assert.match(extendedMessage(language, 'monthlyCopy'), /Apple/i);
    assert.match(extendedMessage(language, 'annualCopy'), /Apple/i);
  }
});

test('subscription packages target the current App Store product identifiers', () => {
  const subscriptionSource = fs.readFileSync(new URL('../lib/subscription.ts', import.meta.url), 'utf8');
  assert.match(subscriptionSource, /monthly: 'vigil_unlimited_monthly'/);
  assert.match(subscriptionSource, /yearly: 'vigil_unlimited_yearly'/);
  assert.match(subscriptionSource, /item\.product\.identifier === expectedProductIdentifier/);
});

test('normal user-facing copy does not expose the subscription provider name', () => {
  const appContextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  const subscriptionSource = fs.readFileSync(new URL('../context/SubscriptionContext.tsx', import.meta.url), 'utf8');
  assert.match(appContextSource, /subscriptionProviderLabels/);
  assert.doesNotMatch(appContextSource, /connected in RevenueCat/);
  assert.doesNotMatch(subscriptionSource, /new Error\([^)]*RevenueCat/);
});

test('startup gates financial state until the active account scope is loaded', () => {
  const appContextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  const layoutSource = fs.readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const tabsSource = fs.readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  assert.match(appContextSource, /loadedScope/);
  assert.match(appContextSource, /scopedUserId/);
  assert.match(appContextSource, /loadedScope === scopedUserId/);
  assert.match(layoutSource, /if \(!isLoaded && !timedOut\)/);
  assert.match(tabsSource, /loaded|hydrated/);
  assert.match(tabsSource, /resolveAppEntryRoute/);
});

test('web sign-in shows a visible message when auth is unavailable', () => {
  assert.match(signInSource, /const \[authMessage, setAuthMessage\]/);
  assert.match(signInSource, /Platform\.OS !== 'web'/);
  assert.match(signInSource, /accessibilityRole="alert"/);
  assert.match(signInSource, /Sign-in is still connecting/);
});

test('an existing web session can continue or switch accounts', () => {
  assert.match(signInSource, /if \(isLoaded && isSignedIn\)/);
  assert.match(signInSource, /onPress=\{\(\) => router\.replace\(destination\)\}/);
  assert.match(signInSource, /testID="sign-out-and-switch-account"/);
  assert.match(signInSource, /signOutAndSwitchAccount/);
});

test('sign-in offers native Apple alongside the retained Google path', () => {
  assert.match(signInSource, /type SocialProvider = 'google' \| 'apple'/);
  assert.match(signInSource, /signInWithNativeApple/);
  assert.match(signInSource, /signInWithApple/);
  assert.match(identitySource, /Platform\.OS !== 'ios'/);
  assert.doesNotMatch(identitySource, /signInWithWebApple/);
  assert.match(signInSource, /Platform\.OS === 'ios' \|\| Platform\.OS === 'web'/);
  assert.doesNotMatch(signInSource, /oauth_apple/);
  assert.match(signInSource, /strategy: 'oauth_google'/);
  assert.match(signInSource, /testID="apple-sign-in"/);
  assert.match(signInSource, /testID="apple-sign-up"/);
  assert.match(signInSource, /testID="google-sign-up"/);
  assert.match(signInSource, /t\('signUpWithApple'\)/);
  assert.match(signInSource, /t\('signUpWithGoogle'\)/);
  assert.match(signInSource, /path: 'oauth-native-callback'/);
});

test('destructive account actions require explicit irreversible-action confirmation', () => {
  assert.match(vigilAppSource, /Alert\.alert\(t\('clearHistoryWarningTitle'\), t\('clearHistoryWarningCopy'\)/);
  assert.match(vigilAppSource, /text: t\('clearHistoryConfirm'\), style: 'destructive'/);
  assert.match(vigilAppSource, /Alert\.alert\(t\('deleteAccountWarningTitle'\), t\('deleteAccountWarningCopy'\)/);
  assert.match(vigilAppSource, /text: t\('deleteAccountConfirm'\), style: 'destructive'/);
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    for (const key of ['clearHistoryWarningTitle', 'clearHistoryWarningCopy', 'clearHistoryConfirm', 'deleteAccountWarningTitle', 'deleteAccountWarningCopy', 'deleteAccountConfirm']) {
      assert.notEqual(extendedMessage(language, key), key);
    }
  }
});