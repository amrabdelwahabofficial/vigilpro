import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveDeviceDefaults } from '../lib/deviceDefaults.ts';

const countryOptions = [
  { code: 'AE', currency: 'AED' },
  { code: 'US', currency: 'USD' },
  { code: 'GB', currency: 'GBP' },
  { code: 'CZ', currency: 'CZK' },
  { code: 'FR', currency: 'EUR' },
  { code: 'EG', currency: 'EGP' },
  { code: 'SA', currency: 'SAR' },
];

const locale = (languageTag, languageCode, regionCode) => ({ languageTag, languageCode, regionCode });

test('device regions resolve country and its full country-list currency', () => {
  const cases = [
    ['AE', 'AED'],
    ['US', 'USD'],
    ['GB', 'GBP'],
    ['CZ', 'CZK'],
    ['FR', 'EUR'],
    ['EG', 'EGP'],
    ['SA', 'SAR'],
  ];
  for (const [regionCode, currency] of cases) {
    assert.deepEqual(
      resolveDeviceDefaults([locale(`en-${regionCode}`, 'en', regionCode)], countryOptions),
      { countryCode: regionCode, currency, language: 'en' },
    );
  }
});

test('language uses the first supported preferred locale and keeps Arabic RTL-capable', () => {
  assert.equal(resolveDeviceDefaults([locale('ar-AE', 'ar', 'AE')], countryOptions).language, 'ar');
  assert.equal(resolveDeviceDefaults([locale('fr-FR', 'fr', 'FR')], countryOptions).language, 'fr');
  assert.equal(resolveDeviceDefaults([locale('cs-CZ', 'cs', 'CZ')], countryOptions).language, 'cs');
  assert.equal(resolveDeviceDefaults([locale('it-IT', 'it', 'IT')], countryOptions).language, 'en');
  assert.equal(resolveDeviceDefaults([], countryOptions).language, 'en');
  assert.equal(
    resolveDeviceDefaults(
      [locale('it-IT', 'it', 'IT'), locale('de-DE', 'de', 'DE')],
      countryOptions,
    ).language,
    'de',
  );
});

test('country and language are resolved independently', () => {
  assert.deepEqual(
    resolveDeviceDefaults([locale('fr-AE', 'fr', 'AE')], countryOptions),
    { countryCode: 'AE', currency: 'AED', language: 'fr' },
  );
  assert.deepEqual(
    resolveDeviceDefaults([locale('en-CZ', 'en', 'CZ')], countryOptions),
    { countryCode: 'CZ', currency: 'CZK', language: 'en' },
  );
});

test('unknown region falls back safely without requesting location permission', () => {
  assert.deepEqual(
    resolveDeviceDefaults([locale('en-IT', 'en', 'IT')], countryOptions),
    { countryCode: 'AE', currency: 'AED', language: 'en' },
  );
  const contextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  const appConfigSource = fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8');
  assert.doesNotMatch(contextSource, /request(?:ed|ing)?\w*Location|requestLocationPermissions/i);
  assert.doesNotMatch(appConfigSource, /NSLocation|expo-location/);
});

test('saved preferences remain authoritative over detected defaults', () => {
  const contextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(contextSource, /\.\.\.initialState,\s*\.\.\.saved/);
  assert.match(contextSource, /AsyncStorage\.setItem\(accountStorageKey\(scopedUserId\)/);
});