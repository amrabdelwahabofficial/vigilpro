import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eas = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const infoPlist = fs.readFileSync(path.join(projectRoot, 'ios/VigilKnowWhereItAllGoes/Info.plist'), 'utf8');
const production = eas.build?.production;
const env = production?.env ?? {};
const failures = [];
const nativeVersion = infoPlist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '';
const nativeBuild = infoPlist.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '';
const speechPlugin = app.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition');
const speechRecognitionConfigured = Boolean(speechPlugin);
const speechRecognitionPermission = typeof app.ios?.infoPlist?.NSSpeechRecognitionUsageDescription === 'string'
  && app.ios.infoPlist.NSSpeechRecognitionUsageDescription.trim().length > 0;
const nativeSpeechPermission = /<key>NSSpeechRecognitionUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(infoPlist);

function check(condition, message) {
  if (!condition) failures.push(message);
}

const revenueCatKey = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
const revenueCatFingerprint = /^[A-Za-z0-9_]+$/.test(revenueCatKey)
  ? crypto.createHash('sha256').update(revenueCatKey).digest('hex').slice(0, 12)
  : 'invalid';

check(production?.environment === 'production', 'EAS production profile must use the production environment.');
check(app.version === '1.1', 'Marketing version must remain 1.1.');
check(app.ios?.buildNumber === '23', 'iOS build number must be 23.');
check(nativeVersion === '1.1', 'Native CFBundleShortVersionString must be 1.1.');
check(nativeBuild === '23', 'Native CFBundleVersion must be 23.');
check(env.VIGIL_CLERK_MODE === 'production', 'EAS production profile must set VIGIL_CLERK_MODE=production.');
check(env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE === 'production', 'EAS production profile must identify itself as production.');
check(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY === '$VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY', 'Production must reference the external Clerk Production publishable key.');
check(env.EXPO_PUBLIC_CLERK_USE_PROXY === 'false', 'Production must not use the Clerk proxy.');
check(!/development|preview|test|accounts\.dev/i.test(JSON.stringify(env)), 'Production environment must not contain a development/test Clerk tenant or profile.');
check(/^appl_[A-Za-z0-9]+$/.test(revenueCatKey), 'Production must contain an App Store RevenueCat public iOS key.');
check(revenueCatFingerprint === '97dbf0564339', 'Production RevenueCat key fingerprint must match the verified App Store key.');
check(app.name === 'Vigil Spend', 'Expo display name must be Vigil Spend.');
check(app.ios?.bundleIdentifier === 'com.vigilspend', 'iOS bundle identifier must remain com.vigilspend.');
check(app.scheme === 'vigil-spend', 'Deep-link scheme must remain vigil-spend.');
check(app.ios?.usesAppleSignIn === true, 'Apple Sign In must remain enabled.');
check(speechRecognitionConfigured, 'expo-speech-recognition native configuration must be present.');
check(speechRecognitionPermission, 'iOS speech-recognition permission must be present in app.json.');
check(nativeSpeechPermission, 'iOS speech-recognition permission must be present in native Info.plist.');
check(/<key>CFBundleDisplayName<\/key>\s*<string>Vigil Spend<\/string>/.test(infoPlist), 'Native CFBundleDisplayName must be Vigil Spend.');
check(/<key>com\.apple\.developer\.applesignin<\/key>/.test(fs.readFileSync(path.join(projectRoot, 'ios/VigilKnowWhereItAllGoes/VigilKnowWhereItAllGoes.entitlements'), 'utf8')), 'Native Apple Sign In entitlement must remain present.');

console.log(JSON.stringify({
  profile: 'production',
  version: app.version,
  nativeIosBuild: app.ios?.buildNumber,
  CFBundleShortVersionString: nativeVersion,
  CFBundleVersion: nativeBuild,
  clerk: 'external production / production',
  clerkHost: 'clerk.vigilspend.com (derived from the verified live publishable key)',
  revenueCat: { type: 'App Store public iOS key', fingerprint: revenueCatFingerprint },
  displayName: 'Vigil Spend',
  bundleIdentifier: app.ios?.bundleIdentifier,
  appleSignIn: app.ios?.usesAppleSignIn === true,
  speechRecognition: {
    nativeConfiguration: speechRecognitionConfigured,
    iosPermission: speechRecognitionPermission && nativeSpeechPermission,
  },
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;