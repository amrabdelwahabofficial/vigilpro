import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  resolveAppEntryRoute,
  runProAction,
  shouldShowTutorial,
  tutorialStorageKey,
} from '../lib/flowGuards.ts';

test('clean signed-in storage routes to onboarding before the dashboard', () => {
  assert.equal(
    resolveAppEntryRoute({ isSignedIn: true, onboardingComplete: false }),
    '/onboarding',
  );
  assert.equal(
    resolveAppEntryRoute({ isSignedIn: true, onboardingComplete: true }),
    '/',
  );
  assert.equal(
    resolveAppEntryRoute({ isSignedIn: false, onboardingComplete: false }),
    '/sign-in',
  );
});

test('completing or skipping onboarding shows the tutorial once, then stays on dashboard', () => {
  const storage = new Map();
  const key = tutorialStorageKey('regression-user');

  assert.equal(resolveAppEntryRoute({ isSignedIn: true, onboardingComplete: true }), '/');
  assert.equal(shouldShowTutorial(storage.get(key) ?? null), true);

  storage.set(key, '1');
  assert.equal(shouldShowTutorial(storage.get(key) ?? null), false);
  assert.equal(shouldShowTutorial(storage.get(key) ?? null), false);
  assert.equal(tutorialStorageKey(null), 'vigil-tutorial-guest');
});

test('a Free user is sent to the subscription entry point without mutating currency', () => {
  let currency = 'CAD';
  let subscriptionEntryPointOpens = 0;

  const ran = runProAction(
    false,
    () => { subscriptionEntryPointOpens += 1; },
    () => { currency = 'USD'; },
  );

  assert.equal(ran, false);
  assert.equal(currency, 'CAD');
  assert.equal(subscriptionEntryPointOpens, 1);
});

test('every gated Pro control uses the same entry point and Pro actions still run', () => {
  let currency = 'CAD';
  let subscriptionEntryPointOpens = 0;
  const openSubscription = () => { subscriptionEntryPointOpens += 1; };

  assert.equal(runProAction(false, openSubscription, () => { currency = 'USD'; }), false);
  assert.equal(runProAction(false, openSubscription, () => { currency = 'EUR'; }), false);
  assert.equal(subscriptionEntryPointOpens, 2);
  assert.equal(currency, 'CAD');

  assert.equal(runProAction(true, openSubscription, () => { currency = 'USD'; }), true);
  assert.equal(currency, 'USD');
  assert.equal(subscriptionEntryPointOpens, 2);
});

test('unauthenticated web visitors get the public Vigil landing page', () => {
  const tabsSource = fs.readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  const landingSource = fs.readFileSync(new URL('../app/landing.tsx', import.meta.url), 'utf8');
  const productionLanding = fs.readFileSync(new URL('../server/templates/landing-page.html', import.meta.url), 'utf8');

  assert.match(tabsSource, /isWeb && !offlineSession && !isSignedIn/);
  assert.match(tabsSource, /Redirect href="\/landing"/);
  assert.match(landingSource, /landingTitle/);
  assert.match(landingSource, /landingCopy/);
  assert.match(landingSource, /landingFeature1Title/);
  assert.match(productionLanding, /Download on the App Store/);
  assert.doesNotMatch(productionLanding, /Download Expo Go/);
});