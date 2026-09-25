import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eas = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const infoPlist = fs.readFileSync(path.join(projectRoot, 'ios/VigilKnowWhereItAllGoes/Info.plist'), 'utf8');
const xcodeProject = fs.readFileSync(
  path.join(projectRoot, 'ios/VigilKnowWhereItAllGoes.xcodeproj/project.pbxproj'),
  'utf8',
);
const production = eas.build?.production;
const env = production?.env ?? {};
const failures = [];
const clerkSecretKeyReference = /(?:^|[^A-Za-z0-9_])(?:CLERK_SECRET_KEY|VITE_CLERK_SECRET_KEY)(?:$|[^A-Za-z0-9_])/;
const externalProductionClerkReference = '$VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY';
const productionClerkKeyReference = env.EXPO_PUBLIC_VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY;
const productionGenericClerkAliasesAbsent = [
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'VITE_CLERK_PUBLISHABLE_KEY',
].every((alias) => !(alias in env));
const { fingerprintProductionRevenueCatKey } = require('./production-revenuecat-guard.cjs');
const nativeVersion = infoPlist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '';
const nativeBuild = infoPlist.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '';
const xcodeBuildNumbers = [...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/g)]
  .map((match) => match[1]);
const speechPlugin = app.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition');
const speechRecognitionConfigured = Boolean(speechPlugin);
const speechRecognitionPermission = typeof app.ios?.infoPlist?.NSSpeechRecognitionUsageDescription === 'string'
  && app.ios.infoPlist.NSSpeechRecognitionUsageDescription.trim().length > 0;
const nativeSpeechPermission = /<key>NSSpeechRecognitionUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(infoPlist);

function check(condition, message) {
  if (!condition) failures.push(message);
}

const revenueCatKey = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
let revenueCatFingerprint = 'invalid';
if (/^appl_[A-Za-z0-9]+$/.test(revenueCatKey)) {
  revenueCatFingerprint = fingerprintProductionRevenueCatKey(revenueCatKey);
}

check(production?.environment === 'production', 'EAS production profile must use the production environment.');
check(eas.cli?.appVersionSource === 'local', 'EAS must use checked-in local app version metadata.');
check(production?.autoIncrement === false, 'EAS production must not auto-increment the local iOS build number.');
check(app.version === '1.1', 'Marketing version must remain 1.1.');
check(app.ios?.buildNumber === '28', 'iOS build number must be 28 for the next App Store submission.');
check(nativeVersion === '1.1', 'Native CFBundleShortVersionString must be 1.1.');
check(nativeBuild === '28', 'Native CFBundleVersion must be 28 for the next App Store submission.');
check(xcodeBuildNumbers.length === 2 && xcodeBuildNumbers.every((buildNumber) => buildNumber === '28'), 'Both native Xcode build configurations must use build 28.');
check(env.VIGIL_CLERK_MODE === 'production', 'EAS production profile must set VIGIL_CLERK_MODE=production.');
check(env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE === 'production', 'EAS production profile must identify itself as production.');
check(productionClerkKeyReference === externalProductionClerkReference, 'Production must reference the external Clerk Production publishable key through its dedicated alias.');
check(productionGenericClerkAliasesAbsent, 'Production EAS profile must not include generic Clerk publishable-key aliases.');
check(env.EXPO_PUBLIC_CLERK_USE_PROXY === 'false', 'Production must not use the Clerk proxy.');
check(!clerkSecretKeyReference.test(JSON.stringify(env)), 'Production mobile profile must not reference Clerk secret keys.');
check(!/development|preview|test|accounts\.dev/i.test(JSON.stringify(Object.values(env))), 'Production environment must not contain a development/test Clerk tenant or profile.');
check(!JSON.stringify(env).includes('VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY'), 'Production must not fall back to the Development Clerk key.');
check(env.EXPO_PUBLIC_DOMAIN === 'vigilspend.com', 'EAS production must call the Vigil Spend production API domain.');
check(/^appl_[A-Za-z0-9]+$/.test(revenueCatKey), 'Production must contain an App Store RevenueCat public iOS key.');
check(revenueCatFingerprint === '97dbf0564339', 'Production RevenueCat key fingerprint must match the verified App Store key.');
check(env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY === '', 'Production must explicitly disable the RevenueCat Test Store key.');
check(
  Object.entries(env).filter(([name, value]) => /REVENUECAT.*API_KEY/i.test(name)
    && typeof value === 'string' && value.trim()).length === 1,
  'Production must have exactly one non-empty RevenueCat API-key source.',
);
check(app.name === 'Vigil Spend', 'Expo display name must be Vigil Spend.');
check(app.ios?.infoPlist?.CFBundleDisplayName === 'Vigil Spend', 'Expo iOS CFBundleDisplayName must be Vigil Spend.');
check(app.ios?.infoPlist?.CFBundleName === 'Vigil Spend', 'Expo iOS CFBundleName must be Vigil Spend.');
check(app.ios?.bundleIdentifier === 'com.vigilspend', 'iOS bundle identifier must remain com.vigilspend.');
check(app.scheme === 'vigil-spend', 'Deep-link scheme must remain vigil-spend.');
check(app.ios?.usesAppleSignIn === true, 'Apple Sign In must remain enabled.');
check(speechRecognitionConfigured, 'expo-speech-recognition native configuration must be present.');
check(speechRecognitionPermission, 'iOS speech-recognition permission must be present in app.json.');
check(nativeSpeechPermission, 'iOS speech-recognition permission must be present in native Info.plist.');
check(/<key>CFBundleDisplayName<\/key>\s*<string>Vigil Spend<\/string>/.test(infoPlist), 'Native CFBundleDisplayName must be Vigil Spend.');
check(/<key>CFBundleName<\/key>\s*<string>Vigil Spend<\/string>/.test(infoPlist), 'Native CFBundleName must be Vigil Spend.');
check(/<key>com\.apple\.developer\.applesignin<\/key>/.test(fs.readFileSync(path.join(projectRoot, 'ios/VigilKnowWhereItAllGoes/VigilKnowWhereItAllGoes.entitlements'), 'utf8')), 'Native Apple Sign In entitlement must remain present.');

console.log(JSON.stringify({
  profile: 'production',
  status: failures.length ? 'FAIL' : 'PASS_STATIC_EAS_CONFIGURATION_ONLY',
  runtimeVerification: {
    status: 'NOT_RUN',
    detail: 'Static checks do not inspect EAS-resolved values or a built IPA. The EAS pre-install guard verifies the effective Clerk host and RevenueCat key fingerprint before compilation.',
  },
  version: app.version,
  nativeIosBuild: app.ios?.buildNumber,
  CFBundleShortVersionString: nativeVersion,
  CFBundleVersion: nativeBuild,
  xcodeBuildNumbers,
  clerk: {
    mode: env.VIGIL_CLERK_MODE,
    tenant: 'external',
    keyReference: 'VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY',
    dedicatedKeyReferenceExternal: productionClerkKeyReference === externalProductionClerkReference,
    genericAliasesAbsent: productionGenericClerkAliasesAbsent,
    proxy: env.EXPO_PUBLIC_CLERK_USE_PROXY,
    secretKeyReferences: clerkSecretKeyReference.test(JSON.stringify(env)),
  },
  apiDomain: env.EXPO_PUBLIC_DOMAIN,
  revenueCat: { type: 'App Store public iOS key', fingerprint: revenueCatFingerprint },
  displayName: 'Vigil Spend',
  bundleIdentifier: app.ios?.bundleIdentifier,
  appleSignIn: app.ios?.usesAppleSignIn === true,
  speechRecognition: {
    nativeConfiguration: speechRecognitionConfigured,
    iosPermission: speechRecognitionPermission && nativeSpeechPermission,
  },
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;