import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  renderLandingPage,
  resolveLandingLanguage,
  supportedLanguages,
  translations,
} from '../server/landingLocalization.js';

const template = fs.readFileSync(
  new URL('../server/templates/landing-page.html', import.meta.url),
  'utf8',
);
const expectedLanguages = ['en', 'fr', 'cs', 'de', 'es', 'ru', 'ar'];

function getValue(source, path) {
  return path.split('.').reduce((value, part) => value?.[part], source);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

test('landing language detection supports regional tags and weighted browser preferences', () => {
  assert.equal(resolveLandingLanguage({ requestedLanguage: 'fr-CA' }), 'fr');
  assert.equal(resolveLandingLanguage({ requestedLanguage: 'ar_AE' }), 'ar');
  assert.equal(
    resolveLandingLanguage({ acceptLanguage: 'it-IT, fr-CA;q=0.8, en-US;q=0.7' }),
    'fr',
  );
  assert.equal(
    resolveLandingLanguage({ acceptLanguage: 'de;q=0.4, es;q=0.9, ar;q=0.2' }),
    'es',
  );
  assert.equal(resolveLandingLanguage({ acceptLanguage: 'it-IT, *;q=0.5' }), 'en');
  assert.equal(resolveLandingLanguage({ requestedLanguage: 'zz', acceptLanguage: 'ar' }), 'ar');
});

test('landing copy completely covers every language and every localized template key', () => {
  assert.deepEqual(supportedLanguages, expectedLanguages);

  const templateKeys = new Set(
    [...template.matchAll(/data-i18n(?:-aria|-content)?="([^"]+)"/g)].map((match) => match[1]),
  );

  for (const language of expectedLanguages) {
    const copy = translations[language];
    assert.ok(copy.meta.title, `${language} needs a translated page title`);
    assert.ok(copy.meta.description, `${language} needs a translated page description`);
    assert.ok(copy.meta.social, `${language} needs translated social metadata`);
    assert.ok(copy.meta.imageAlt, `${language} needs translated image alternative text`);
    assert.equal(copy.how.steps.length, 3, `${language} needs all three how-it-works steps`);
    assert.equal(copy.approach.items.length, 3, `${language} needs all three principles`);
    assert.equal(copy.pro.benefits.length, 4, `${language} needs all four Pro benefits`);

    for (const key of templateKeys) {
      const value = getValue(copy, key);
      assert.equal(typeof value, 'string', `${language} is missing ${key}`);
      assert.ok(value.trim(), `${language} has an empty translation for ${key}`);
    }
  }
});

test('server-rendered landing metadata and page direction match the selected language', () => {
  const arabicPage = renderLandingPage(template, {
    appName: 'Vigil Spend',
    baseUrl: 'https://vigilspend.com',
    requestedLanguage: 'ar',
    acceptLanguage: 'en-US,en;q=0.8',
  });

  assert.match(arabicPage, /<html lang="ar" dir="rtl">/);
  assert.match(arabicPage, /<title id="page-title">Vigil Spend — اعرف إلى أين تذهب أموالك<\/title>/);
  assert.match(arabicPage, /<meta property="og:description" content="طريقة أكثر هدوءاً لمعرفة/);
  assert.match(arabicPage, /<meta property="og:locale" content="ar_AE"/);
  assert.match(arabicPage, /"inLanguage": "ar"/);
  assert.match(arabicPage, /"featureList": \[/);
  assert.match(arabicPage, /<h1 id="hero-title"[^>]*>الوعي هو الخطوة الأولى نحو تغيير حقيقي\.<\/h1>/);
  assert.match(arabicPage, /aria-label="الصفحة الرئيسية لـ Vigil Spend"/);
  assert.doesNotMatch(arabicPage, /LANDING_[A-Z_]+_PLACEHOLDER/);

  const frenchPage = renderLandingPage(template, {
    appName: 'Vigil Spend',
    baseUrl: 'https://vigilspend.com',
    acceptLanguage: 'fr-CA,fr;q=0.9,en;q=0.8',
  });
  assert.match(frenchPage, /<html lang="fr" dir="ltr">/);
  assert.match(frenchPage, /<title id="page-title">Vigil Spend — Sachez où va votre argent<\/title>/);
});

test('the server response renders every visible landing string in the selected locale', () => {
  const textElements = [...template.matchAll(
    /<([a-z][a-z0-9-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/gi,
  )].map((match) => ({ tag: match[1], key: match[2] }));

  for (const language of expectedLanguages) {
    const html = renderLandingPage(template, {
      appName: 'Vigil Spend',
      baseUrl: 'https://vigilspend.com',
      requestedLanguage: language,
    });

    for (const { tag, key } of textElements) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const localizedElement = new RegExp(
        `<${tag}\\b[^>]*\\bdata-i18n="${escapedKey}"[^>]*>([^<]*)<\\/${tag}>`,
        'i',
      ).exec(html);
      assert.ok(localizedElement, `${language} must render an element for ${key}`);
      assert.equal(localizedElement[1], escapeHtml(getValue(translations[language], key)), `${language}: ${key}`);
    }
  }
});

test('inline landing scripts parse, and a selected language is saved for the next visit', () => {
  const scriptBlocks = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1].trim())
    .filter((script) => script && !script.startsWith('{'));

  assert.equal(scriptBlocks.length, 2);
  for (const script of scriptBlocks) assert.doesNotThrow(() => new Function(script));
  assert.match(template, /localStorage\.setItem\("vigil-site-language", activeLanguage\)/);
  assert.match(template, /searchParams\.set\("lang", activeLanguage\)/);
  assert.match(template, /navigator\.languages/);
});

test('download and Pro discovery links lead directly to the App Store', () => {
  const storeLinks = [...template.matchAll(/href="(https:\/\/apps\.apple\.com\/app\/id6811090049)"/g)];
  assert.ok(storeLinks.length >= 4, 'header, hero, Pro, and final call-to-action should reach the App Store');
  assert.doesNotMatch(template, /href="exps:\/\//);
  assert.match(template, /Apple shows the price, renewal terms/);
  assert.match(template, /Choose monthly or annual in the app/);
});