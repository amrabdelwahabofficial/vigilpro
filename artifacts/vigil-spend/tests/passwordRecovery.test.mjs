import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { extendedMessage } from '../lib/localization.ts';

const signInSource = fs.readFileSync(new URL('../app/(auth)/sign-in.tsx', import.meta.url), 'utf8');
const signupDiagnosticsSource = fs.readFileSync(new URL('../lib/customSignupDiagnostics.ts', import.meta.url), 'utf8');
const ssoCallbackSource = fs.readFileSync(new URL('../app/sso-callback.tsx', import.meta.url), 'utf8');
const identitySource = fs.readFileSync(new URL('../context/IdentityContext.tsx', import.meta.url), 'utf8');
const vigilAppSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
const diagnosticsSource = fs.readFileSync(new URL('../lib/authDiagnostics.ts', import.meta.url), 'utf8');
const diagnosticsScreenSource = fs.readFileSync(new URL('../app/diagnostics.tsx', import.meta.url), 'utf8');
const localizationSource = fs.readFileSync(new URL('../lib/localization.ts', import.meta.url), 'utf8');
const notificationSource = fs.readFileSync(new URL('../lib/notifications.ts', import.meta.url), 'utf8');
const mobilePackageSource = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const mobileAppConfigSource = fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8');
const appShortcutsPluginSource = fs.readFileSync(new URL('../plugins/withVigilAppShortcuts.js', import.meta.url), 'utf8');
const mobileBuildSource = fs.readFileSync(new URL('../scripts/build.js', import.meta.url), 'utf8');
const apiPackageSource = fs.readFileSync(new URL('../../api-server/package.json', import.meta.url), 'utf8');
const apiClerkConfigSource = fs.readFileSync(new URL('../../api-server/src/lib/clerkConfig.ts', import.meta.url), 'utf8');
const apiClerkProxySource = fs.readFileSync(new URL('../../api-server/src/middlewares/clerkProxyMiddleware.ts', import.meta.url), 'utf8');
const easConfig = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

test('email password recovery keeps the complete Clerk reset flow wired', () => {
  assert.match(signInSource, /testID="forgot-password"/);
  assert.match(signInSource, /testID="send-password-reset-code"/);
  assert.match(signInSource, /testID="password-reset-code"/);
  assert.match(signInSource, /testID="password-reset-new-password"/);
  assert.match(signInSource, /testID="complete-password-reset"/);
  assert.match(signInSource, /strategy: 'reset_password_email_code'/);
  assert.match(signInSource, /attemptFirstFactor/);
});

test('verification inputs support native one-time-code autofill and resend cooldown controls', () => {
  assert.match(signInSource, /testID="email-verification-code"[\s\S]*textContentType="oneTimeCode"[\s\S]*autoComplete="one-time-code"/);
  assert.match(signInSource, /testID="email-verification-code"[\s\S]*onSubmitEditing=\{\(\) => void verifyAccount\(\)\}/);
  assert.match(signInSource, /testID="password-reset-code"[\s\S]*textContentType="oneTimeCode"[\s\S]*autoComplete="one-time-code"/);
  assert.match(signInSource, /testID="resend-email-verification-code"/);
  assert.match(signInSource, /testID="resend-password-reset-code"/);
  assert.match(signInSource, /signUp\.verifications\.sendEmailCode\(\)/);
  assert.match(signInSource, /setResendCooldown\(30\)/);
  assert.match(signInSource, /resendCodeIn/);
  assert.match(signInSource, /resendCodeFailed/);
  assert.match(signInSource, /strategy: 'reset_password_email_code'/);
});

test('preview email verification shows inline errors instead of relying on native alerts', () => {
  assert.match(signInSource, /if \(!alreadyVerified && !verificationCode\.trim\(\)\) \{\s+setAuthMessage\(t\('checkVerificationCode'\)\)/);
  assert.match(signInSource, /getAuthErrorMessage\(error, t\('checkVerificationCode'\)\)/);
  assert.match(signInSource, /setAuthMessage\(message\);\s+if \(Platform\.OS !== 'web'\) Alert\.alert\(t\('verificationFailed'\), message\)/);
  assert.match(signInSource, /signupState\.emailVerificationStatus === 'verified'/);
});

test('custom email verification guards duplicate submissions and rate-limit loops', () => {
  assert.match(signInSource, /verificationInFlightRef = useRef\(false\)/);
  assert.match(signInSource, /verificationInFlightRef\.current = true/);
  assert.match(signInSource, /if \(!isLoaded \|\| verificationInFlightRef\.current\)/);
  assert.match(signInSource, /emailVerificationCompletedRef\.current \|\| currentState\.emailVerificationStatus === 'verified'/);
  assert.match(signInSource, /details\.httpStatus === '429'/);
  assert.match(signInSource, /serverAlreadyVerified \|\| signupState\.emailVerificationStatus === 'verified'/);
  assert.equal((signInSource.match(/signUp\.verifications\.verifyEmailCode\(/g) ?? []).length, 1);
});

test('custom signup keeps Clerk resource state and avoids misleading verification fallbacks', () => {
  assert.match(signInSource, /useSignUp\s*\}\s*from '@clerk\/expo'/);
  assert.match(signInSource, /signUp\.password\(\{/);
  assert.match(signInSource, /signUp\.verifications\.sendEmailCode\(\)/);
  assert.match(signInSource, /signUp\.verifications\.verifyEmailCode\(\{ code: verificationCode\.trim\(\) \}\)/);
  assert.match(signInSource, /signUp\.update\(profileUpdate\)/);
  assert.match(signInSource, /signUp\.finalize\(\{ navigate: \(\) => \{\} \}\)/);
  assert.match(signInSource, /summarizeCustomSignup/);
  assert.match(signInSource, /emailVerificationStatus/);
  assert.match(signupDiagnosticsSource, /verificationStrategy/);
  assert.match(signInSource, /missingFields/);
  assert.match(signInSource, /createdSessionIdPresent/);
  assert.match(signInSource, /profileUpdate\.firstName = firstName\.trim\(\)/);
  assert.match(signInSource, /profileUpdate\.lastName = lastName\.trim\(\)/);
  assert.doesNotMatch(signInSource, /signUp\.create\(|attemptEmailAddressVerification|prepareEmailAddressVerification/);
});

test('custom signup resend uses the active Future resource and activation is guarded', () => {
  assert.match(signInSource, /signUp\.verifications\.sendEmailCode\(\)/);
  assert.match(signInSource, /verificationSessionActivatedRef = useRef\(false\)/);
  assert.match(signInSource, /verificationSessionActivatedRef\.current = true/);
  assert.doesNotMatch(signInSource, /mode === 'verify'[\s\S]{0,220}signUp\.password/);

  const resendStart = signInSource.indexOf('const resendVerificationCode');
  const resetStart = signInSource.indexOf('const completePasswordReset', resendStart);
  const resendFlow = signInSource.slice(resendStart, resetStart);
  const emailResendStart = resendFlow.indexOf("if (mode === 'verify')");
  const resetBranchStart = resendFlow.indexOf("} else if (mode === 'forgotReset')");
  const emailResendFlow = resendFlow.slice(emailResendStart, resetBranchStart);
  assert.match(emailResendFlow, /summarizeCustomSignup\(signUp\)/);
  assert.match(emailResendFlow, /await finishVerifiedSignup\(\)/);
  assert.match(emailResendFlow, /signUp\.verifications\.sendEmailCode\(\)/);
  assert.doesNotMatch(emailResendFlow, /signUp\.(?:reset|password)\(/);
});

test('resend verification copy is translated in every supported language', () => {
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    for (const key of ['resendCode', 'resendCodeIn', 'codeResent', 'resendCodeFailed']) {
      const value = extendedMessage(language, key);
      assert.ok(value && value !== key, `${language}:${key} must resolve to translated copy`);
    }
    assert.match(extendedMessage(language, 'resendCodeIn'), /seconds|secondes|sek|seg|с|ث|s/);
  }
});

test('verified-but-incomplete signup states have translated, explicit guidance', () => {
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    for (const key of ['signupVerifiedNeedsFields', 'signupSessionNotReady']) {
      const value = extendedMessage(language, key);
      assert.ok(value && value !== key, `${language}:${key} must resolve to translated copy`);
    }
  }
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

test('goal and account-auth copy is translated in every supported language', () => {
  const keys = [
    'confirmPassword',
    'goalsHeroEyebrow',
    'goalsHeroTitle',
    'goalsHeroCopy',
    'addToGoal',
    'goalContributionCopy',
    'firstGoalFreeCopy',
    'oneGoalFreeCopy',
    'proGoalsCopy',
    'noCompletedGoals',
  ];
  const english = Object.fromEntries(keys.map((key) => [key, extendedMessage('en', key)]));
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    for (const key of keys) {
      const value = extendedMessage(language, key);
      assert.ok(value && value !== key, `${language}:${key} must resolve to translated copy`);
      if (language !== 'en') assert.notEqual(value, english[key], `${language}:${key} must not fall back to English`);
    }
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
  assert.match(signInSource, /t\('connectionIssue'\)/);
});

test('Apple Shortcuts can cold-start the app into a prefilled transaction form', () => {
  const captureRoute = fs.readFileSync(new URL('../app/capture.tsx', import.meta.url), 'utf8');
  assert.match(mobileAppConfigSource, /"scheme": "vigil-spend"/);
  assert.match(captureRoute, /capture: '1'/);
  assert.match(captureRoute, /amount/);
  assert.match(captureRoute, /note/);
  assert.match(captureRoute, /bucket/);
  assert.match(vigilAppSource, /Linking\.getInitialURL\(\)/);
  assert.match(vigilAppSource, /shortcutRequest/);
  assert.match(vigilAppSource, /setAmount\(shortcutRequest\.amount\)/);
  assert.match(vigilAppSource, /setNote\(shortcutRequest\.note\)/);
});

test('the iOS build exposes a native Log Transaction App Shortcut', () => {
  assert.match(mobileAppConfigSource, /\.\/plugins\/withVigilAppShortcuts/);
  assert.match(appShortcutsPluginSource, /AppShortcutsProvider/);
  assert.match(appShortcutsPluginSource, /VigilLogTransactionIntent/);
  assert.match(appShortcutsPluginSource, /openAppWhenRun = true/);
  assert.match(appShortcutsPluginSource, /vigil-spend:\/\/capture/);
  assert.match(appShortcutsPluginSource, /Log Transaction/);
  assert.match(appShortcutsPluginSource, /static var appShortcuts: \[AppShortcut\] \{\s+AppShortcut\(/);
  assert.doesNotMatch(appShortcutsPluginSource, /static var appShortcuts: \[AppShortcut\] \{\s+\[/);
});

test('iOS Settings explains how to enable Double Tap Logging', () => {
  assert.match(vigilAppSource, /testID="double-tap-logging"/);
  assert.match(vigilAppSource, /DoubleTapLoggingModal/);
  assert.match(vigilAppSource, /t\('doubleTapStepTwo'\)/);
  assert.match(localizationSource, /doubleTapTitle: 'To enable Double Tap Logging'/);
});

test('reminder toggles schedule daily notifications and an inactivity habit nudge', () => {
  assert.match(mobilePackageSource, /"expo-notifications": "~57\.0\.19"/);
  assert.match(mobileAppConfigSource, /"expo-notifications"/);
  assert.match(notificationSource, /requestPermissionsAsync/);
  assert.match(notificationSource, /hour: 8/);
  assert.match(notificationSource, /hour: 20/);
  assert.match(notificationSource, /INACTIVITY_DAYS = 3/);
  assert.match(notificationSource, /coffee or setting your alarm/);
  assert.match(notificationSource, /if \(!morning && !evening\) return/);
  assert.match(vigilAppSource, /setMorningReminder/);
  assert.match(vigilAppSource, /setEveningReminder/);
});

test('an existing web session can continue or switch accounts', () => {
  assert.match(signInSource, /if \(isLoaded && isSignedIn\)/);
  assert.match(signInSource, /onPress=\{\(\) => router\.replace\(destination\)\}/);
  assert.match(signInSource, /testID="sign-out-and-switch-account"/);
  assert.match(signInSource, /signOutAndSwitchAccount/);
  assert.match(identitySource, /activeProvider !== 'apple' && Boolean\(clerkAuth\.isSignedIn\)/);
});

test('sign-in offers native Apple alongside the retained Google path', () => {
  assert.match(signInSource, /type SocialProvider = 'google' \| 'apple'/);
  assert.match(signInSource, /signInWithNativeApple/);
  assert.match(signInSource, /useSignInWithApple.*@clerk\/expo\/apple/);
  assert.match(signInSource, /startAppleAuthenticationFlow/);
  assert.match(identitySource, /Platform\.OS !== 'ios'/);
  assert.doesNotMatch(identitySource, /signInWithWebApple/);
  assert.match(signInSource, /Platform\.OS === 'ios' \|\| Platform\.OS === 'web'/);
  assert.match(signInSource, /strategy: 'oauth_apple'/);
  assert.match(signInSource, /summarizeWebAppleSsoResult/);
  assert.match(signInSource, /needs_second_factor/);
  assert.match(signInSource, /needs_identifier/);
  assert.match(signInSource, /needs_first_factor/);
  assert.match(signInSource, /needs_new_password/);
  assert.match(signInSource, /Web Apple Clerk SSO result/);
  assert.match(signInSource, /logWebAppleClerkError/);
  assert.match(signInSource, /if \(Platform\.OS === 'ios'\)/);
  assert.match(signInSource, /await activateSession\(\{ session: createdSessionId \}\)/);
  assert.match(signInSource, /strategy: 'oauth_google'/);
  assert.match(signInSource, /testID="apple-sign-in"/);
  assert.match(signInSource, /testID="apple-sign-up"/);
  assert.match(signInSource, /testID="google-sign-up"/);
  assert.match(signInSource, /t\('signUpWithApple'\)/);
  assert.match(signInSource, /t\('signUpWithGoogle'\)/);
  assert.match(signInSource, /path: 'oauth-native-callback'/);
  assert.match(signInSource, /startSSOFlow\(\{ strategy: 'oauth_apple' \}\)/);
  assert.match(signInSource, /startSSOFlow\(\{ strategy: 'oauth_google' \}\)/);
  assert.match(signInSource, /authSessionType === 'dismiss'/);
  assert.doesNotMatch(signInSource, /path: 'sso-callback'/);
});

test('Google OAuth completes Clerk sign-up requirements before activating a session', () => {
  assert.match(signInSource, /const \{ createdSessionId, setActive: activateSession, signIn, signUp \} = ssoResult/);
  assert.match(signInSource, /signUp\?\.status === 'missing_requirements'/);
  assert.match(signInSource, /setPendingGoogleSignup/);
  assert.match(signInSource, /await pendingGoogleSignup\.update\(googleSignupValues\)/);
  assert.match(signInSource, /await setActive\(\{ session: result\.createdSessionId \}\)/);
  assert.match(signInSource, /await verifyVigilBackendSession\(\)/);
  assert.match(signInSource, /testID="complete-google-signup"/);
  assert.match(signInSource, /Google Clerk SSO result/);
  assert.doesNotMatch(signInSource, /pendingAppleSignup.*google/i);
});

test('web Clerk SSO has a real callback route for the Expo auth session', () => {
  assert.match(ssoCallbackSource, /maybeCompleteAuthSession/);
  assert.match(ssoCallbackSource, /Stack\.Screen/);
  assert.match(signInSource, /startSSOFlow\(\{ strategy: 'oauth_google' \}\)/);
  assert.match(signInSource, /startSSOFlow\(\{ strategy: 'oauth_apple' \}\)/);
});

test('Apple failures stay user-safe and signed-in accounts can open redacted diagnostics', () => {
  assert.match(signInSource, /classifyAppleFailure/);
  assert.match(signInSource, /\/api\/vigil\/identity/);
  assert.match(signInSource, /verifyVigilBackendSession/);
  assert.match(signInSource, /complete-apple-signup/);
  assert.match(signInSource, /missingFields/);
  assert.doesNotMatch(signInSource, /copy-diagnostics-sign-in/);
  assert.match(signInSource, /recordAuthDiagnostic/);
  assert.match(signInSource, /copy-diagnostics-version/);
  assert.match(signInSource, /versionTapCount\.current >= 7/);
  assert.match(signInSource, /if \(!canCopyDiagnostics\) return/);
  assert.match(signInSource, /Clipboard\.setStringAsync/);
  assert.match(signInSource, /VIGIL_ADMIN_EMAILS/);
  assert.match(vigilAppSource, /diagnostics-version-tap/);
  assert.match(vigilAppSource, /diagnosticsTapCount\.current >= 5/);
  assert.match(vigilAppSource, /router\.push\('\/diagnostics'\)/);
  assert.doesNotMatch(vigilAppSource, /diagnosticsUnlocked|Tap 5×/);
  assert.match(diagnosticsScreenSource, /const \{ isLoaded, isSignedIn \} = useIdentity\(\)/);
  assert.match(diagnosticsScreenSource, /if \(!isLoaded \|\| !isSignedIn\) return null/);
  assert.doesNotMatch(diagnosticsScreenSource, /isAdmin/);
  assert.match(diagnosticsSource, /redacted-token/);
  assert.match(diagnosticsSource, /redacted-email/);
  assert.match(diagnosticsSource, /decodeAppleIdentityTokenClaims/);
  assert.match(diagnosticsSource, /appleAudience/);
  assert.match(diagnosticsSource, /appleIssuer/);
  assert.match(diagnosticsSource, /withAppleIdentityDiagnostics/);
  assert.match(diagnosticsSource, /clerkFrontendApiHost/);
  assert.match(diagnosticsSource, /x-clerk-request-id/);
  assert.match(diagnosticsSource, /bundle=\$\{event\.bundleId\}/);
  assert.match(diagnosticsSource, /clerk_host=\$\{event\.apiHost\}/);
  assert.match(signInSource, /withAppleIdentityDiagnostics\(/);
  assert.match(signInSource, /appleClaims/);
  assert.doesNotMatch(diagnosticsSource, /\.\.\.event[,}]/);
  assert.match(diagnosticsSource, /message: redactedText\(event\.message \?\? '', 320\)/);
  assert.doesNotMatch(diagnosticsSource, /AsyncStorage\.setItem\([^)]*identityToken/);
});

test('the signed iOS target keeps the native Apple capability and Vigil bundle ID', () => {
  const entitlementsSource = fs.readFileSync(new URL('../ios/VigilKnowWhereItAllGoes/VigilKnowWhereItAllGoes.entitlements', import.meta.url), 'utf8');
  const projectSource = fs.readFileSync(new URL('../ios/VigilKnowWhereItAllGoes.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  assert.match(mobileAppConfigSource, /"bundleIdentifier": "com\.vigilspend"/);
  assert.match(mobileAppConfigSource, /"usesAppleSignIn": true/);
  assert.match(entitlementsSource, /com\.apple\.developer\.applesignin/);
  assert.match(entitlementsSource, /<string>Default<\/string>/);
  assert.match(projectSource, /PRODUCT_BUNDLE_IDENTIFIER = "com\.vigilspend"/);
  assert.match(projectSource, /CODE_SIGN_ENTITLEMENTS = VigilKnowWhereItAllGoes\/VigilKnowWhereItAllGoes\.entitlements/);
});

test('Clerk environment selection is explicit and isolated', () => {
  assert.match(mobilePackageSource, /VIGIL_CLERK_MODE=development/);
  assert.match(mobilePackageSource, /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=\\?"\$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY\\?"/);
  assert.match(mobilePackageSource, /EXPO_PUBLIC_CLERK_USE_PROXY=false/);
  assert.match(mobilePackageSource, /EXPO_PUBLIC_CLERK_PROXY_URL= EXPO_PACKAGER_PROXY_URL/);
  assert.match(mobilePackageSource, /EXPO_PUBLIC_CLERK_USE_PROXY=false/);
  assert.match(mobileBuildSource, /const clerkMode = 'production'/);
  assert.match(mobileBuildSource, /process\.env\.VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY/);
  assert.doesNotMatch(mobileBuildSource, /process\.env\.CLERK_(?:PUBLISHABLE|SECRET)_KEY/);
  assert.match(mobileBuildSource, /EXPO_PUBLIC_CLERK_USE_PROXY: 'false'/);
  assert.match(apiClerkConfigSource, /VIGIL_CLERK_MODE must be explicitly set/);
  assert.doesNotMatch(apiClerkConfigSource, /process\.env\.CLERK_(?:PUBLISHABLE|SECRET)_KEY/);
  assert.match(apiClerkConfigSource, /VIGIL_EXTERNAL_CLERK_DEVELOPMENT_(?:PUBLISHABLE|SECRET)_KEY/);
  assert.match(apiClerkConfigSource, /VIGIL_EXTERNAL_CLERK_(?:PUBLISHABLE|SECRET)_KEY/);
  assert.match(apiClerkProxySource, /if \(isProductionClerkMode\(\)\)/);
  assert.match(apiPackageSource, /VIGIL_CLERK_MODE=development/);
  assert.equal(easConfig.build.development.env.VIGIL_CLERK_MODE, 'development');
  assert.equal(easConfig.build.development.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
  assert.equal(easConfig.build.development.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
  assert.equal(easConfig.build.preview.env.VIGIL_CLERK_MODE, 'development');
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
  assert.equal(easConfig.cli.appVersionSource, 'local');
  assert.equal(easConfig.build.production.autoIncrement, false);
  assert.match(mobileAppConfigSource, /"buildNumber": "28"/);
  assert.equal(easConfig.build.production.env.VIGIL_CLERK_MODE, 'production');
  assert.equal(easConfig.build.production.environment, 'production');
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY');
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, undefined);
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_CLERK_USE_PROXY, 'false');
  assert.equal(easConfig.submit.production.ios.ascAppId, '6811090049');
  assert.equal(easConfig.submit.production.ascAppId, undefined);
});

test('destructive account actions require explicit irreversible-action confirmation', () => {
  assert.match(vigilAppSource, /function DestructiveConfirmationModal/);
  assert.match(vigilAppSource, /visible=\{resetVisible\}/);
  assert.match(vigilAppSource, /await startOver\(\)/);
  assert.doesNotMatch(vigilAppSource, /testID="clear-history-start-over"/);
  assert.match(vigilAppSource, /Alert\.alert\(t\('deleteAccountWarningTitle'\), deleteWarningCopy/);
  assert.match(vigilAppSource, /text: t\('deleteAccountConfirm'\), style: 'destructive'/);
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    for (const key of ['clearHistoryWarningTitle', 'clearHistoryWarningCopy', 'clearHistoryConfirm', 'deleteAccountWarningTitle', 'deleteAccountWarningCopy', 'deleteAccountConfirm']) {
      assert.notEqual(extendedMessage(language, key), key);
    }
  }
});

test('account deletion clears scoped local state and links to Apple subscription management', () => {
  const appContextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  const identityContextSource = fs.readFileSync(new URL('../context/IdentityContext.tsx', import.meta.url), 'utf8');
  assert.match(vigilAppSource, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.match(vigilAppSource, /subscriptionDeletionNotice/);
  assert.match(vigilAppSource, /await deleteIdentityAccount\(\);\s*await startOver\(\);\s*router\.replace\('\/sign-in'\)/);
  assert.match(appContextSource, /await AsyncStorage\.removeItem\(accountStorageKey\(scopedUserId\)\)/);
  assert.doesNotMatch(vigilAppSource, /RevenueCat.*delete|delete.*RevenueCat/i);

  const deleteStart = identityContextSource.indexOf('const deleteAccount = useCallback');
  const deleteEnd = identityContextSource.indexOf('const activateClerk', deleteStart);
  const deleteFlow = identityContextSource.slice(deleteStart, deleteEnd);
  assert.ok(deleteFlow.indexOf("apiUrl('/api/vigil/support-requests/me')") < deleteFlow.indexOf('await clerkUser.delete()'));
  assert.ok(deleteFlow.indexOf('await clerkUser.delete()') < deleteFlow.indexOf('await clerkSignOut()'));
  assert.ok(deleteFlow.indexOf('await clerkSignOut()') < deleteFlow.lastIndexOf("persistActiveProvider('signed-out')"));
  assert.match(deleteFlow, /recordAuthDiagnostic\('account-deletion', 'clerk-session-token'/);
  assert.match(deleteFlow, /recordAuthDiagnostic\('account-deletion', 'support-data'/);
  assert.match(deleteFlow, /recordAuthDiagnostic\('account-deletion', 'clerk-user'/);
  assert.match(deleteFlow, /recordAuthDiagnostic\('account-deletion', 'session-cleanup'/);
  assert.match(deleteFlow, /requestId: supportResponse\.headers\.get\('x-request-id'\)/);
});