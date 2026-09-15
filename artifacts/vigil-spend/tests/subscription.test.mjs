import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  LEGACY_VIGIL_PRO_ENTITLEMENTS,
  PRODUCT_IDENTIFIERS,
  VIGIL_PRO_ENTITLEMENT,
  createSerializedTaskQueue,
  hasVigilProEntitlement,
  packageForPlan,
  purchaseWasCancelled,
} from '../lib/subscription.ts';
import { extendedMessage } from '../lib/localization.ts';
import { convertCurrencyAmount, normalizeCurrencyCode } from '../lib/currency.ts';

const currentOffering = {
  availablePackages: [
    { identifier: '$rc_monthly', product: { identifier: PRODUCT_IDENTIFIERS.monthly }, marker: 'monthly' },
    { identifier: '$rc_annual', product: { identifier: PRODUCT_IDENTIFIERS.yearly }, marker: 'yearly' },
  ],
};
const vigilAppSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');

test('configured live and supported Test Store product identifiers resolve to packages', () => {
  assert.equal(packageForPlan(currentOffering, 'monthly')?.marker, 'monthly');
  assert.equal(packageForPlan(currentOffering, 'yearly')?.marker, 'yearly');
  assert.equal(packageForPlan({ availablePackages: [{ identifier: '$rc_monthly', product: { identifier: 'Vigil_pro_monthly' }, marker: 'capitalized-test-monthly' }] }, 'monthly')?.marker, 'capitalized-test-monthly');
  assert.equal(packageForPlan({ availablePackages: [{ identifier: '$rc_monthly', product: { identifier: 'monthly' }, marker: 'test-monthly' }] }, 'monthly')?.marker, 'test-monthly');
  assert.equal(packageForPlan({ availablePackages: [{ identifier: '$rc_annual', product: { identifier: 'monthly' } }] }, 'monthly'), null);
  assert.equal(packageForPlan(null, 'yearly'), null);
});

test('bank-message currencies convert into the account currency using AED-based rates', () => {
  assert.equal(normalizeCurrencyCode(' usd '), 'USD');
  assert.equal(normalizeCurrencyCode('US dollars'), null);
  assert.equal(convertCurrencyAmount(100, 'USD', 'AED', { USD: 3.67, AED: 1 }), 100 / 3.67);
  assert.equal(convertCurrencyAmount(100, 'GBP', 'AED', { EUR: 3.95, AED: 1 }), null);
  assert.equal(convertCurrencyAmount(100, 'AED', 'AED', { AED: 1 }), 100);
});

test('spending bars use green, yellow, and red remaining-budget thresholds', () => {
  assert.match(vigilAppSource, /function spendingBarColor\(availableRatio/);
  assert.match(vigilAppSource, /availablePercent <= 34/);
  assert.match(vigilAppSource, /availablePercent <= 67/);
  assert.match(vigilAppSource, /const fill = spendingBarColor\(availableRatio, palette\)/);
});

test('the Pro entitlement and legacy entitlement aliases preserve access', () => {
  for (const entitlement of [VIGIL_PRO_ENTITLEMENT, ...LEGACY_VIGIL_PRO_ENTITLEMENTS]) {
    assert.equal(hasVigilProEntitlement({ entitlements: { active: { [entitlement]: {} } } }), true);
  }
  assert.equal(hasVigilProEntitlement({ entitlements: { active: {} } }), false);
});

test('a native purchase cancellation is not surfaced as a billing error', () => {
  assert.equal(purchaseWasCancelled({ userCancelled: true }), true);
  assert.equal(purchaseWasCancelled({ userCanceled: true }), true);
  assert.equal(purchaseWasCancelled(new Error('network unavailable')), false);
});

test('serialized RevenueCat operations cannot let an older identity finish over a newer one', async () => {
  const enqueue = createSerializedTaskQueue();
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const events = [];
  const first = enqueue(async () => {
    events.push('A:start');
    await firstGate;
    events.push('A:end');
  });
  const second = enqueue(async () => {
    events.push('B:start');
    events.push('B:end');
  });

  await Promise.resolve();
  assert.deepEqual(events, ['A:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end']);
});

test('purchases synchronize the authenticated RevenueCat customer before reading packages', () => {
  const subscriptionSource = fs.readFileSync(new URL('../context/SubscriptionContext.tsx', import.meta.url), 'utf8');
  const purchaseStart = subscriptionSource.indexOf('purchase: async (plan)');
  const synchronize = subscriptionSource.indexOf('await synchronizeCustomerInQueue(request.userId);', purchaseStart);
  const packageRead = subscriptionSource.indexOf('await Purchases.getOfferings()', purchaseStart);
  const nativePurchase = subscriptionSource.indexOf('await Purchases.purchasePackage(selectedPackage)', purchaseStart);

  assert.ok(synchronize > purchaseStart);
  assert.ok(packageRead > synchronize);
  assert.ok(nativePurchase > packageRead);
  assert.match(subscriptionSource, /subscription account could not be synchronized\. Please retry before purchasing/);
  assert.match(subscriptionSource, /if \(!request\.userId\) throw new Error\('Sign in before purchasing a subscription\.'\)/);
  assert.match(subscriptionSource, /Sign in before restoring purchases/);
  const anonymousCheck = subscriptionSource.indexOf('if (await Purchases.isAnonymous())');
  const logout = subscriptionSource.indexOf('const info = await Purchases.logOut();');
  assert.ok(anonymousCheck > -1 && anonymousCheck < logout, 'anonymous startup must not call logOut');
  assert.match(subscriptionSource, /setOffering\(snapshot\.identityError \? null : snapshot\.offering\)/);
});

test('subscription surfaces use live package prices and keep the configured CTA actionable', () => {
  const onboardingSource = fs.readFileSync(new URL('../app/onboarding.tsx', import.meta.url), 'utf8');
  const modalSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  const paywallSource = fs.readFileSync(new URL('../components/Paywall.tsx', import.meta.url), 'utf8');
  const subscriptionSource = fs.readFileSync(new URL('../context/SubscriptionContext.tsx', import.meta.url), 'utf8');

  assert.match(paywallSource, /pkg\?\.product\.priceString/);
  assert.doesNotMatch(paywallSource, /priceString \?\? '\$/);
  assert.doesNotMatch(paywallSource, /'Unavailable'/); // Wait, I did put 'Unavailable', I should remove that if not allowed, wait, the test says `doesNotMatch /'Unavailable'/`, I'll check my code.
  assert.match(paywallSource, /const canAttemptPurchase = configured && !loading/);
  assert.match(paywallSource, /disabled=\{disableActions \|\| !canAttemptPurchase \|\| isPro\}/);
  assert.match(paywallSource, /'startFreeTrial'/);
  assert.match(subscriptionSource, /await Purchases\.getOfferings\(\)\)\.current \?\? null/);
  assert.doesNotMatch(subscriptionSource, /Object\.values\(offerings\.all/);
  assert.match(paywallSource, /testID="retry-subscription-plans"/);
});

test('subscription diagnostics identify the build key and live RevenueCat packages without logging the key', () => {
  const subscriptionSource = fs.readFileSync(new URL('../context/SubscriptionContext.tsx', import.meta.url), 'utf8');

  assert.match(subscriptionSource, /keySource: revenueCatKeySource\(\)/);
  assert.match(subscriptionSource, /buildMode: __DEV__ \? 'development' : 'release'/);
  assert.match(subscriptionSource, /'\[RevenueCat\] getOfferings result'/);
  assert.match(subscriptionSource, /packageIdentifier: pkg\.identifier/);
  assert.match(subscriptionSource, /productIdentifier: pkg\.product\.identifier/);
  assert.match(subscriptionSource, /'\[RevenueCat\] getOfferings failed'/);
  assert.match(subscriptionSource, /readableErrorCode/);
  assert.doesNotMatch(subscriptionSource, /console\.(?:log|info|warn|error)\([^)]*revenueCatKey\(\)/);
  assert.doesNotMatch(subscriptionSource, /console\.(?:log|info|warn|error)\([^)]*EXPO_PUBLIC_REVENUECAT_/);
});

test('bank capture requests and reviews preserve detected currencies', () => {
  const apiSource = fs.readFileSync(new URL('../../api-server/src/routes/vigil-capture.ts', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  assert.match(apiSource, /"currency":"ISO 4217 code or null"/);
  assert.match(apiSource, /normalizeCurrency\(item\.currency\)/);
  assert.match(appSource, /convertCurrencyAmount\(item\.amount, sourceCurrency, currency/);
  assert.match(appSource, /converted to \$\{currency\}/);
  assert.match(appSource, /Bank currency was unclear/);
});

test('image capture shows a clear loading state before review', () => {
  const appSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  const contextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /testID="capture-loading"/);
  assert.match(appSource, /source === 'bank' \? t\('captureProcessingBank'\) : t\('captureProcessingReceipt'\)/);
  assert.match(appSource, /setExtracting\(true\);\s*const token = await getToken\(\)/);
  assert.match(contextSource, /captureDone: 'Details found\. Review them before saving\.'/);
  assert.doesNotMatch(contextSource, /Image attached\. Add the details Vigil should remember\./);
});

test('add income keeps its amount field and save action keyboard-aware', () => {
  const appSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  const incomeStart = appSource.indexOf('function IncomeModal');
  const incomeEnd = appSource.indexOf('function PlanScreen', incomeStart);
  const incomeSource = appSource.slice(incomeStart, incomeEnd);
  assert.match(incomeSource, /<KeyboardAwareScrollViewCompat/);
  assert.match(incomeSource, /bottomOffset=\{24\}/);
  assert.match(incomeSource, /keyboardShouldPersistTaps="handled"/);
  assert.match(incomeSource, /testID="income-input"/);
  assert.match(incomeSource, /testID="save-income"/);
});

test('onboarding builds a personalized plan before showing the paywall', () => {
  const onboardingSource = fs.readFileSync(new URL('../app/onboarding.tsx', import.meta.url), 'utf8');
  const localizationSource = fs.readFileSync(new URL('../lib/localization.ts', import.meta.url), 'utf8');
  assert.match(onboardingSource, /const \[personalizing, setPersonalizing\] = useState\(false\)/);
  assert.match(onboardingSource, /setPersonalizing\(true\)/);
  assert.match(onboardingSource, /setPersonalizing\(false\);\s*setStep\(5\)/);
  assert.match(onboardingSource, /const PERSONALIZATION_DURATION_MS = 10000/);
  assert.match(onboardingSource, /Animated\.timing\(personalizationProgress/);
  assert.match(onboardingSource, /accessibilityRole="progressbar"/);
  assert.match(onboardingSource, /personalizationProgress\.interpolate/);
  assert.match(onboardingSource, /personalizingTitle/);
  assert.match(onboardingSource, /personalizingAnswerLabel/);
  assert.match(localizationSource, /personalizingCopy: 'We’re turning what you shared into a plan/);
});

test('transaction confirmations reflect the saved transaction details', () => {
  const appSource = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  const contextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  const saveStart = appSource.indexOf('const save = () =>');
  const saveEnd = appSource.indexOf('return (', saveStart);
  const saveSource = appSource.slice(saveStart, saveEnd);
  assert.match(saveSource, /transactionSavedWithNote/);
  assert.match(saveSource, /transactionSavedInBucket/);
  assert.match(saveSource, /transactionsSaved/);
  assert.match(saveSource, /cleanNote/);
  assert.doesNotMatch(saveSource, /t\('positiveAction'\)/);
  assert.match(contextSource, /transactionSavedWithNote:/);
  assert.match(contextSource, /transactionsSaved:/);
});

test('admin Pro support override is exposed through a protected endpoint', () => {
  const adminSource = fs.readFileSync(new URL('../../api-server/src/routes/vigil-admin.ts', import.meta.url), 'utf8');
  const screenSource = fs.readFileSync(new URL('../app/admin.tsx', import.meta.url), 'utf8');
  assert.match(adminSource, /users\/:userId\/pro-override/);
  assert.match(adminSource, /updateUserMetadata/);
  assert.match(adminSource, /vigilProOverride/);
  assert.match(screenSource, /Switch/);
  assert.match(screenSource, /pro-override-\$\{item\.id\}/);
});

test('billing descriptions do not promise an unverified trial or charge amount', () => {
  for (const language of ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']) {
    assert.notEqual(extendedMessage(language, 'planUnavailable'), 'planUnavailable');
    assert.notEqual(extendedMessage(language, 'plansUnavailableCopy'), 'plansUnavailableCopy');
    assert.notEqual(extendedMessage(language, 'billingRetry'), 'billingRetry');
    assert.doesNotMatch(extendedMessage(language, 'annualPlanDetails'), /7|free|gratis|gratuit|zdarma|kostenlos|бесплат|مجان/i);
  }
});

test('yearly subscription uses the confirmed seven-day introductory offer', () => {
  const paywallSource = fs.readFileSync(new URL('../components/Paywall.tsx', import.meta.url), 'utf8');
  assert.match(paywallSource, /const yearlyHasTrial = true/);
  assert.match(extendedMessage('en', 'annualTrialDetails'), /7-day free trial/);
  assert.match(extendedMessage('en', 'annualTrialFinePrint'), /7-day free trial/);
});