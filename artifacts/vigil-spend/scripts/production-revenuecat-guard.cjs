'use strict';

const crypto = require('node:crypto');

const EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT = '97dbf0564339';

function fingerprintProductionRevenueCatKey(key) {
  if (typeof key !== 'string' || !/^appl_[A-Za-z0-9]+$/.test(key.trim())) {
    throw new Error('A valid Production RevenueCat App Store iOS SDK key is required.');
  }

  return crypto.createHash('sha256').update(key.trim()).digest('hex').slice(0, 12);
}

function resolveProductionRevenueCatConfig(env) {
  const iosKey = env?.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (typeof iosKey !== 'string' || !iosKey.trim()) {
    throw new Error('Production builds require EXPO_PUBLIC_REVENUECAT_IOS_API_KEY.');
  }

  const fingerprint = fingerprintProductionRevenueCatKey(iosKey);
  if (fingerprint !== EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT) {
    throw new Error(
      `Production RevenueCat key fingerprint mismatch; expected ${EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT}.`,
    );
  }

  if (typeof env?.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY === 'string'
    && env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY.trim()) {
    throw new Error('Production builds must not receive the RevenueCat Test Store key.');
  }

  if (typeof env?.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY === 'string'
    && env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY.trim()) {
    throw new Error('Production builds must not receive an unverified RevenueCat Android key.');
  }

  return {
    fingerprint,
    source: 'EAS production profile EXPO_PUBLIC_REVENUECAT_IOS_API_KEY',
  };
}

module.exports = {
  EXPECTED_PRODUCTION_IOS_KEY_FINGERPRINT,
  fingerprintProductionRevenueCatKey,
  resolveProductionRevenueCatConfig,
};