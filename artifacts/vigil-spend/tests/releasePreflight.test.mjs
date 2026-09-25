import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const require = createRequire(import.meta.url);
const { resolveProductionClerkBuildConfig } = require('../scripts/production-clerk-guard.cjs');
const {
  EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT,
  fingerprintProductionRevenueCatKey,
  resolveProductionRevenueCatConfig,
} = require('../scripts/production-revenuecat-guard.cjs');
const appSource = fs.readFileSync(new URL('./components/VigilApp.tsx', root), 'utf8');
const easConfig = JSON.parse(fs.readFileSync(new URL('./eas.json', root), 'utf8'));
const appConfig = JSON.parse(fs.readFileSync(new URL('./app.json', root), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(new URL('./package.json', root), 'utf8'));
const infoPlist = fs.readFileSync(new URL('./ios/VigilKnowWhereItAllGoes/Info.plist', root), 'utf8');
const xcodeProject = fs.readFileSync(new URL('./ios/VigilKnowWhereItAllGoes.xcodeproj/project.pbxproj', root), 'utf8');
const preflightSource = fs.readFileSync(new URL('./scripts/production-preflight.mjs', root), 'utf8');
const buildSource = fs.readFileSync(new URL('./scripts/build.js', root), 'utf8');
const easPreflightPath = fileURLToPath(new URL('./scripts/eas-production-clerk-preflight.mjs', root));
const reviewSource = fs.readFileSync(new URL('./hooks/useReviewRequest.ts', root), 'utf8');
const appContextSource = fs.readFileSync(new URL('./context/AppContext.tsx', root), 'utf8');
const preflightOutput = JSON.parse(execFileSync(
  process.execPath,
  [fileURLToPath(new URL('./scripts/production-preflight.mjs', root))],
  { encoding: 'utf8' },
));

function fixturePublishableKey(environment, host) {
  return `pk_${environment}_${Buffer.from(`${host}$`).toString('base64url')}`;
}

test('production EAS configuration is explicitly external and production-only', () => {
  const production = easConfig.build.production;
  const development = easConfig.build.development;
  const preview = easConfig.build.preview;
  for (const profile of [development, preview]) {
    assert.equal(profile.env.CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
    assert.equal(profile.env.VITE_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
    assert.equal(profile.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY');
    assert.equal(
      profile.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY,
      '$VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY',
    );
  }
  assert.equal(production.environment, 'production');
  assert.equal(production.env.VIGIL_CLERK_MODE, 'production');
  assert.equal(production.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE, 'production');
  assert.equal(production.env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY');
  assert.equal(production.env.CLERK_PUBLISHABLE_KEY, undefined);
  assert.equal(production.env.VITE_CLERK_PUBLISHABLE_KEY, undefined);
  assert.equal(production.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, undefined);
  assert.equal(production.env.EXPO_PUBLIC_CLERK_USE_PROXY, 'false');
  assert.equal(production.env.EXPO_PUBLIC_DOMAIN, 'vigilspend.com');
  assert.equal(production.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY, '');
  assert.equal(preflightOutput.clerk.dedicatedKeyReferenceExternal, true);
  assert.equal(preflightOutput.clerk.genericAliasesAbsent, true);
  assert.equal(preflightOutput.clerk.secretKeyReferences, false);
  assert.equal(mobilePackage.scripts['eas-build-pre-install'], 'node scripts/eas-production-clerk-preflight.mjs');
  assert.match(buildSource, /resolveProductionClerkBuildConfig\(process\.env\)/);
  assert.doesNotMatch(buildSource, /process\.env\.(?:CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY|VITE_CLERK_PUBLISHABLE_KEY|VITE_CLERK_SECRET_KEY)\b/);
  assert.equal(
    fingerprintProductionRevenueCatKey(production.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
    EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT,
  );
  assert.equal(
    Object.entries(production.env).filter(([name, value]) => /REVENUECAT.*API_KEY/i.test(name)
      && typeof value === 'string' && value.trim()).length,
    1,
  );
  assert.equal(easConfig.cli.appVersionSource, 'local');
  assert.equal(production.autoIncrement, false);
  assert.match(preflightSource, /nativeIosBuild/);
  assert.match(preflightSource, /CFBundleShortVersionString/);
  assert.match(preflightSource, /CFBundleVersion/);
  assert.match(preflightSource, /CURRENT_PROJECT_VERSION/);
  assert.match(preflightSource, /nativeConfiguration/);
  assert.match(preflightSource, /iosPermission/);
  assert.match(preflightSource, /PASS_STATIC_EAS_CONFIGURATION_ONLY/);
  assert.match(preflightSource, /runtimeVerification/);
  assert.match(preflightSource, /NOT_RUN/);
  assert.match(preflightSource, /VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY/);
  assert.match(preflightSource, /VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY/);
  assert.doesNotMatch(preflightSource, /Expo Launch|expoLaunch|Replit App Store Launcher/);
  assert.match(preflightSource, /97dbf0564339/);
  assert.ok(!/accounts\.dev|development|preview|test/i.test(JSON.stringify(Object.values(production.env))));
  assert.equal(preflightOutput.status, 'PASS_STATIC_EAS_CONFIGURATION_ONLY');
  assert.equal(preflightOutput.runtimeVerification.status, 'NOT_RUN');
  assert.equal(preflightOutput.nativeIosBuild, '28');
});

test('production Clerk builds fail closed to the external live tenant and Vigil domains', () => {
  const externalProductionKey = fixturePublishableKey('live', 'clerk.vigilspend.com');
  const validConfig = resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: 'https://vigilspend.com',
    VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: externalProductionKey,
    REPLIT_INTERNAL_APP_DOMAIN: 'replit.dev',
    REPLIT_DEV_DOMAIN: 'replit.dev',
  });
  assert.deepEqual(validConfig, {
    domain: 'vigilspend.com',
    clerkHost: 'clerk.vigilspend.com',
  });

  assert.throws(() => resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: 'vigilspend.com',
  }), /external Clerk Production publishable key is required/);
  assert.throws(() => resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: 'replit.dev',
    VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'clerk.vigilspend.com'),
  }), /must use https:\/\/vigilspend\.com/);
  assert.throws(() => resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: 'vigilspend.com',
    VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('test', 'clerk.vigilspend.com'),
  }), /valid live key/);
  assert.throws(() => resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: 'vigilspend.com',
    VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'managed.example.com'),
  }), /must resolve to clerk\.vigilspend\.com/);

  const hookEnv = {
    PATH: process.env.PATH ?? '',
    EAS_BUILD_PROFILE: 'production',
    VIGIL_CLERK_MODE: 'production',
    EXPO_PUBLIC_DOMAIN: 'vigilspend.com',
    EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: externalProductionKey,
    // Simulate the stale generic values Launch previously injected. The app
    // and pre-install guard must use the dedicated external-key alias instead.
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('test', 'fitting-grackle-8629.clerk.accounts.dev'),
    CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'managed.example.com'),
    VITE_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'managed.example.com'),
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: easConfig.build.production.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: '',
  };
  const hookOutput = execFileSync(process.execPath, [easPreflightPath], {
    encoding: 'utf8',
    env: hookEnv,
  });
  assert.match(hookOutput, /guard passed: vigilspend\.com \/ clerk\.vigilspend\.com/);

  // The guard validates the key pinned in source, so a wrong or missing
  // build-environment key cannot change what Production ships.
  for (const injectedKey of [fixturePublishableKey('test', 'fitting-grackle-8629.clerk.accounts.dev'), '']) {
    const output = execFileSync(process.execPath, [easPreflightPath], {
      encoding: 'utf8',
      env: { ...hookEnv, EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: injectedKey },
    });
    assert.match(output, /guard passed: vigilspend\.com \/ clerk\.vigilspend\.com/);
  }
});

test('store EAS builds fail without the production app profile', () => {
  const baseEnv = { PATH: process.env.PATH ?? '', EAS_BUILD: 'true' };
  for (const easProfile of ['production', 'launch', '']) {
    assert.throws(
      () => execFileSync(process.execPath, [easPreflightPath], {
        encoding: 'utf8',
        env: { ...baseEnv, EAS_BUILD_PROFILE: easProfile },
      }),
      (error) => error.status === 1
        && /must set EXPO_PUBLIC_VIGIL_BUILD_PROFILE=production/.test(error.stderr.toString()),
    );
  }
  for (const easProfile of ['development', 'preview']) {
    const output = execFileSync(process.execPath, [easPreflightPath], {
      encoding: 'utf8',
      env: { ...baseEnv, EAS_BUILD_PROFILE: easProfile, EXPO_PUBLIC_VIGIL_BUILD_PROFILE: easProfile },
    });
    assert.match(output, /skipped for a non-production EAS build/);
  }
});

test('production Clerk key is pinned in source and selected for production builds', () => {
  const runtimeCredentialsSource = fs.readFileSync(new URL('./lib/runtimeCredentials.ts', root), 'utf8');
  const pinnedKey = runtimeCredentialsSource.match(/PRODUCTION_CLERK_PUBLISHABLE_KEY\s*=\s*'([^']*)'/)?.[1];
  assert.deepEqual(
    resolveProductionClerkBuildConfig({ EXPO_PUBLIC_DOMAIN: 'vigilspend.com', VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: pinnedKey }),
    { domain: 'vigilspend.com', clerkHost: 'clerk.vigilspend.com' },
  );
  assert.match(runtimeCredentialsSource, /if \(profile === 'production'\) \{\s*return PRODUCTION_CLERK_PUBLISHABLE_KEY;\s*\}/);
});

test('production RevenueCat builds require the known-good iOS key and reject fallbacks', () => {
  const productionKey = easConfig.build.production.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const valid = resolveProductionRevenueCatConfig({
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: productionKey,
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: '',
  });
  assert.equal(valid.fingerprint, EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT);

  assert.throws(
    () => resolveProductionRevenueCatConfig({ EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: 'test-placeholder' }),
    /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/,
  );
  assert.throws(
    () => resolveProductionRevenueCatConfig({
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_stalewrong',
      EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: '',
    }),
    /fingerprint mismatch/,
  );
  assert.throws(
    () => resolveProductionRevenueCatConfig({
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: productionKey,
      EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: 'test-placeholder',
    }),
    /must not receive the RevenueCat Test Store key/,
  );

  const hookEnv = {
    PATH: process.env.PATH ?? '',
    EAS_BUILD_PROFILE: 'production',
    VIGIL_CLERK_MODE: 'production',
    EXPO_PUBLIC_DOMAIN: 'vigilspend.com',
    EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'clerk.vigilspend.com'),
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('test', 'fitting-grackle-8629.clerk.accounts.dev'),
    CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'managed.example.com'),
    VITE_CLERK_PUBLISHABLE_KEY: fixturePublishableKey('live', 'managed.example.com'),
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: productionKey,
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: '',
  };
  const output = execFileSync(process.execPath, [easPreflightPath], {
    encoding: 'utf8',
    env: hookEnv,
  });
  assert.match(output, /RevenueCat fingerprint 97dbf0564339/);

  assert.throws(
    () => execFileSync(process.execPath, [easPreflightPath], {
      encoding: 'utf8',
      env: { ...hookEnv, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '' },
    }),
    (error) => error.status === 1 && /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/.test(error.stderr.toString()),
  );
  assert.throws(
    () => execFileSync(process.execPath, [easPreflightPath], {
      encoding: 'utf8',
      env: { ...hookEnv, EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: 'test-placeholder' },
    }),
    (error) => error.status === 1 && /must not receive the RevenueCat Test Store key/.test(error.stderr.toString()),
  );
});

test('native metadata preserves Vigil Spend branding and the actual local build source', () => {
  assert.equal(appConfig.expo.name, 'Vigil Spend');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.vigilspend');
  assert.equal(appConfig.expo.version, '1.1');
  assert.equal(appConfig.expo.ios.buildNumber, '28');
  assert.match(appConfig.expo.ios.infoPlist.NSSpeechRecognitionUsageDescription, /speech recognition/);
  assert.match(infoPlist, /CFBundleDisplayName<\/key>\s*<string>Vigil Spend<\/string>/);
  assert.match(infoPlist, /CFBundleShortVersionString<\/key>\s*<string>1\.1<\/string>/);
  assert.match(infoPlist, /CFBundleVersion<\/key>\s*<string>28<\/string>/);
  assert.equal([...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*28;/g)].length, 2);
  assert.match(infoPlist, /NSSpeechRecognitionUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(appSource, /<Text[^>]*>Vigil Spend<\/Text>/);
  assert.match(appSource, /appVersionBuild\(\)/);
});

test('voice capture exposes one primary microphone and never saves before review', () => {
  assert.equal((appSource.match(/testID="voice-capture"/g) ?? []).length, 1);
  assert.doesNotMatch(appSource, /voiceMicButton/);
  assert.match(appSource, /testID="voice-transcription"/);
  assert.match(appSource, /testID="voice-live-transcript"/);
  assert.match(appSource, /ExpoSpeechRecognitionModule/);
  assert.match(appSource, /updateVoiceVolume/);
  assert.match(appSource, /setReviewTransactions/);
  assert.match(appSource, /reviewBeforeSaving/);
});

test('Ask AI clears only after a successful accepted response', () => {
  const askStart = appSource.indexOf('const ask = async () =>');
  const askEnd = appSource.indexOf('return <Modal', askStart);
  const askSource = appSource.slice(askStart, askEnd);
  assert.match(askSource, /if \(!cleanQuestion \|\| loading\) return/);
  assert.match(askSource, /if \(!response\.ok\) throw/);
  assert.match(askSource, /setQuestion\(''\)/);
  assert.ok(askSource.indexOf('setQuestion(\'\')') > askSource.indexOf('if (!response.ok) throw'));
  assert.match(askSource, /catch \(error\)/);
});

test('manual rating uses the live App Store destination while automatic review stays native', () => {
  assert.match(reviewSource, /id6811090049\?action=write-review/);
  assert.match(reviewSource, /Linking\.openURL/);
  assert.match(reviewSource, /StoreReview\.isAvailableAsync/);
  assert.match(reviewSource, /StoreReview\.requestReview/);
});

test('generic product copy is currency neutral without removing AED defaults', () => {
  assert.doesNotMatch(appContextSource, /Give every dirham|each dirham|كل درهم/);
  assert.match(appContextSource, /Give every amount a purpose/);
  assert.match(appContextSource, /countryCopy: 'AED/);
});