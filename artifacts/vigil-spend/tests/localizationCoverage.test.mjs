import assert from 'node:assert/strict';
import test from 'node:test';
import { extendedMessage } from '../lib/localization.ts';

const languages = ['fr', 'cs', 'de', 'es', 'ru', 'ar'];
const bucketCopyKeys = [
  'needs', 'investment', 'charity', 'fun',
  'bucketCommentTaxSteady', 'bucketCommentTaxTight', 'bucketCommentTaxOver',
  'bucketCommentNeedsSteady', 'bucketCommentNeedsTight', 'bucketCommentNeedsOver',
  'bucketCommentSavingsSteady', 'bucketCommentSavingsTight', 'bucketCommentSavingsOver',
  'bucketCommentInvestmentSteady', 'bucketCommentInvestmentTight', 'bucketCommentInvestmentOver',
  'bucketCommentDevelopmentSteady', 'bucketCommentDevelopmentTight', 'bucketCommentDevelopmentOver',
  'bucketCommentCharitySteady', 'bucketCommentCharityTight', 'bucketCommentCharityOver',
  'bucketCommentFunSteady', 'bucketCommentFunTight', 'bucketCommentFunOver',
];

test('default bucket labels and commentary are translated in every supported language', () => {
  for (const key of bucketCopyKeys) {
    const english = extendedMessage('en', key);
    assert.ok(english, `Missing English source text for ${key}`);

    for (const language of languages) {
      const translated = extendedMessage(language, key);
      assert.ok(translated, `Missing ${language} translation for ${key}`);
      assert.notEqual(translated, english, `${language}:${key} fell back to English`);
    }
  }
});