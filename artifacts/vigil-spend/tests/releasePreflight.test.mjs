import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const appSource = fs.readFileSync(new URL('./components/VigilApp.tsx', root), 'utf8');
const easConfig = JSON.parse(fs.readFileSync(new URL('./eas.json', root), 'utf8'));
const appConfig = JSON.parse(fs.readFileSync(new URL('./app.json', root), 'utf8'));
const infoPlist = fs.readFileSync(new URL('./ios/VigilKnowWhereItAllGoes/Info.plist', root), 'utf8');
const preflightSource = fs.readFileSync(new URL('./scripts/production-preflight.mjs', root), 'utf8');
const reviewSource = fs.readFileSync(new URL('./hooks/useReviewRequest.ts', root), 'utf8');
const appContextSource = fs.readFileSync(new URL('./context/AppContext.tsx', root), 'utf8');

test('production EAS configuration is explicitly external and production-only', () => {
  const production = easConfig.build.production;
  assert.equal(production.environment, 'production');
  assert.equal(production.env.VIGIL_CLERK_MODE, 'production');
  assert.equal(production.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE, 'production');
  assert.equal(production.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, '$VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY');
  assert.equal(production.env.EXPO_PUBLIC_CLERK_USE_PROXY, 'false');
  assert.match(production.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, /^appl_[A-Za-z0-9]+$/);
  assert.match(preflightSource, /nativeIosBuild/);
  assert.match(preflightSource, /CFBundleShortVersionString/);
  assert.match(preflightSource, /CFBundleVersion/);
  assert.match(preflightSource, /nativeConfiguration/);
  assert.match(preflightSource, /iosPermission/);
  assert.match(preflightSource, /external Clerk Production/);
  assert.match(preflightSource, /97dbf0564339/);
  assert.doesNotMatch(JSON.stringify(production.env), /accounts\.dev|development|preview|test/i);
});

test('native metadata preserves Vigil Spend branding and the actual local build source', () => {
  assert.equal(appConfig.expo.name, 'Vigil Spend');
  assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.vigilspend');
  assert.equal(appConfig.expo.version, '1.1');
  assert.equal(appConfig.expo.ios.buildNumber, '23');
  assert.match(appConfig.expo.ios.infoPlist.NSSpeechRecognitionUsageDescription, /speech recognition/);
  assert.match(infoPlist, /CFBundleDisplayName<\/key>\s*<string>Vigil Spend<\/string>/);
  assert.match(infoPlist, /CFBundleShortVersionString<\/key>\s*<string>1\.1<\/string>/);
  assert.match(infoPlist, /CFBundleVersion<\/key>\s*<string>23<\/string>/);
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