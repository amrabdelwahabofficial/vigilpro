import type { CountryCode, CurrencyCode, Language } from '@/context/AppContext';

export type DeviceLocale = {
  languageTag?: string;
  languageCode?: string | null;
  regionCode?: string | null;
};

export type CountryOption = {
  code: CountryCode;
  currency: CurrencyCode;
};

export type DeviceDefaults = {
  countryCode: CountryCode;
  currency: CurrencyCode;
  language: Language;
};

const supportedLanguages = new Set<Language>(['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar']);

function languageCodeFor(locale: DeviceLocale) {
  const explicitCode = locale.languageCode?.trim().toLowerCase();
  if (explicitCode) return explicitCode.split('-')[0];
  return locale.languageTag?.split(/[-_]/)[0]?.trim().toLowerCase() ?? '';
}

function regionCodeFor(locale: DeviceLocale) {
  const explicitRegion = locale.regionCode?.trim().toUpperCase();
  if (explicitRegion) return explicitRegion;
  const parts = locale.languageTag?.split(/[-_]/).map((part) => part.trim()) ?? [];
  const region = parts.find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()) || /^\d{3}$/.test(part));
  return region?.toUpperCase() ?? '';
}

export function resolveDeviceDefaults(
  locales: readonly DeviceLocale[],
  countryOptions: readonly CountryOption[],
  fallback: DeviceDefaults = { countryCode: 'AE', currency: 'AED', language: 'en' },
): DeviceDefaults {
  const firstLocale = locales[0];
  const detectedCountry = countryOptions.find((country) => country.code === regionCodeFor(firstLocale ?? {}));
  const language = locales
    .map(languageCodeFor)
    .find((code): code is Language => supportedLanguages.has(code as Language)) ?? 'en';

  return {
    countryCode: detectedCountry?.code ?? fallback.countryCode,
    currency: detectedCountry?.currency ?? fallback.currency,
    language,
  };
}