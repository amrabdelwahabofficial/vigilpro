import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveProductionClerkBuildConfig } = require('./production-clerk-guard.cjs');
const { resolveProductionRevenueCatConfig } = require('./production-revenuecat-guard.cjs');

// Expo Launch does not document which eas.json profile it uses. Any EAS build
// that is not an explicit development/preview build is treated as a store
// build and must carry the production app profile, or it fails before install.
const easProfile = process.env.EAS_BUILD_PROFILE ?? '';
if (
  process.env.EAS_BUILD === 'true'
  && easProfile !== 'development'
  && easProfile !== 'preview'
  && process.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE !== 'production'
) {
  console.error(
    `Production config guard failed: EAS profile "${easProfile || 'unknown'}" must set EXPO_PUBLIC_VIGIL_BUILD_PROFILE=production.`,
  );
  process.exit(1);
}

const isProductionBuild = process.env.EAS_BUILD_PROFILE === 'production'
  || process.env.VIGIL_CLERK_MODE === 'production'
  || process.env.EXPO_PUBLIC_VIGIL_BUILD_PROFILE === 'production';

if (!isProductionBuild) {
  console.log('Production Clerk build guard skipped for a non-production EAS build.');
  process.exit(0);
}

try {
  // Production native builds use the key pinned in source, not the build
  // environment, so validate exactly what the app bundle will ship.
  const runtimeCredentialsSource = fs.readFileSync(
    new URL('../lib/runtimeCredentials.ts', import.meta.url),
    'utf8',
  );
  const productionPublishableKey = runtimeCredentialsSource
    .match(/PRODUCTION_CLERK_PUBLISHABLE_KEY\s*=\s*'([^']*)'/)?.[1];
  if (!productionPublishableKey) {
    throw new Error('PRODUCTION_CLERK_PUBLISHABLE_KEY must be pinned in lib/runtimeCredentials.ts.');
  }
  const clerk = resolveProductionClerkBuildConfig({
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN,
    VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY: productionPublishableKey,
  });
  const revenueCat = resolveProductionRevenueCatConfig(process.env);
  console.log(
    `Production config guard passed: ${clerk.domain} / ${clerk.clerkHost} / RevenueCat fingerprint ${revenueCat.fingerprint}.`,
  );
} catch (error) {
  console.error(`Production config guard failed: ${error.message}`);
  process.exit(1);
}