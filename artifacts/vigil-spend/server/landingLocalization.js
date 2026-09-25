const translations = require('../lib/landingTranslations.json');

const supportedLanguages = Object.keys(translations);
const openGraphLocales = {
  en: 'en_US',
  fr: 'fr_FR',
  cs: 'cs_CZ',
  de: 'de_DE',
  es: 'es_ES',
  ru: 'ru_RU',
  ar: 'ar_AE',
};

function normalizeLanguageTag(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim().split(/[-_]/, 1)[0].toLowerCase();
  return Object.hasOwn(translations, language) ? language : null;
}

function resolveLandingLanguage({ requestedLanguage, acceptLanguage } = {}) {
  const requested = normalizeLanguageTag(requestedLanguage);
  if (requested) return requested;

  const preferences = typeof acceptLanguage === 'string'
    ? acceptLanguage.split(',').map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { tag, quality: Number.isFinite(quality) ? quality : 0, index };
    }).filter((preference) => preference.quality > 0)
      .sort((left, right) => right.quality - left.quality || left.index - right.index)
    : [];

  for (const preference of preferences) {
    const language = normalizeLanguageTag(preference.tag);
    if (language) return language;
  }

  return 'en';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function getTranslation(copy, key) {
  return key.split('.').reduce((value, part) => value?.[part], copy);
}

function translateMarkup(markup, copy) {
  const translatedText = markup.replace(
    /(<([a-z][a-z0-9-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[\s\S]*?(<\/\2\s*>)/gi,
    (match, openingTag, tagName, key, closingTag) => {
      const value = getTranslation(copy, key);
      return typeof value === 'string'
        ? `${openingTag}${escapeHtml(value)}${closingTag}`
        : match;
    },
  );

  return translatedText.replace(
    /<([a-z][a-z0-9-]*)\b([^>]*\bdata-i18n-aria="([^"]+)"[^>]*)>/gi,
    (match, tagName, attributes, key) => {
      const value = getTranslation(copy, key);
      if (typeof value !== 'string') return match;
      const escapedValue = escapeHtml(value);
      const updatedAttributes = /\baria-label="[^"]*"/i.test(attributes)
        ? attributes.replace(/\baria-label="[^"]*"/i, `aria-label="${escapedValue}"`)
        : `${attributes} aria-label="${escapedValue}"`;
      return `<${tagName}${updatedAttributes}>`;
    },
  );
}

function renderLandingPage(template, { appName, baseUrl, requestedLanguage, acceptLanguage }) {
  const language = resolveLandingLanguage({ requestedLanguage, acceptLanguage });
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const copy = translations[language];

  const localizedMarkup = template
    .replaceAll('BASE_URL_PLACEHOLDER', baseUrl)
    .replaceAll('APP_NAME_PLACEHOLDER', escapeHtml(appName))
    .replaceAll('LANDING_LANGUAGE_PLACEHOLDER', language)
    .replaceAll('LANDING_DIRECTION_PLACEHOLDER', direction)
    .replaceAll('LANDING_META_LOCALE_PLACEHOLDER', openGraphLocales[language])
    .replaceAll('LANDING_META_TITLE_PLACEHOLDER', escapeHtml(copy.meta.title))
    .replaceAll('LANDING_META_DESCRIPTION_PLACEHOLDER', escapeHtml(copy.meta.description))
    .replaceAll('LANDING_META_SOCIAL_PLACEHOLDER', escapeHtml(copy.meta.social))
    .replaceAll('LANDING_META_IMAGE_ALT_PLACEHOLDER', escapeHtml(copy.meta.imageAlt))
    .replaceAll('LANDING_SCHEMA_DESCRIPTION_PLACEHOLDER', escapeHtml(copy.meta.description))
    .replace('LANDING_SCHEMA_FEATURES_PLACEHOLDER', toScriptString(copy.pro.benefits))
    .replace('LANDING_TRANSLATIONS_PLACEHOLDER', toScriptString(translations))
    .replace('LANDING_SERVER_LANGUAGE_PLACEHOLDER', toScriptString(language));

  return translateMarkup(localizedMarkup, copy);
}

module.exports = {
  renderLandingPage,
  resolveLandingLanguage,
  supportedLanguages,
  translations,
};