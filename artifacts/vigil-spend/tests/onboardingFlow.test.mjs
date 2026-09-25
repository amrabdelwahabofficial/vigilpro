import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  formatOnboardingTemplate,
  getOnboardingChoiceLabel,
  getOrderedOnboardingFeatures,
  getValidOnboardingAnswers,
  ONBOARDING_QUESTION_COUNT,
  ONBOARDING_QUESTIONS,
  ONBOARDING_RESULT_FEATURES,
} from '../lib/onboardingFlow.ts';
import {
  getOnboardingFlowMessage,
  onboardingFlowCopy,
} from '../lib/onboardingFlowCopy.ts';
import { extendedMessage } from '../lib/localization.ts';

const languages = ['en', 'ar', 'fr', 'cs', 'de', 'es', 'ru'];
const onboardingScreen = fs.readFileSync(
  fileURLToPath(new URL('../app/onboarding.tsx', import.meta.url)),
  'utf8',
);

test('the onboarding questionnaire has six questions with five localized choices each', () => {
  assert.equal(ONBOARDING_QUESTION_COUNT, 6);
  assert.equal(ONBOARDING_QUESTIONS.length, ONBOARDING_QUESTION_COUNT);
  for (const language of languages) {
    for (const [questionIndex, question] of ONBOARDING_QUESTIONS.entries()) {
      const choices = getOnboardingFlowMessage(language, question.choicesKey)?.split('|') ?? [];
      assert.equal(choices.length, question.answerIds.length, `${language} question ${questionIndex + 1}`);
      assert.ok(choices.every((choice) => choice.trim().length > 0), `${language} question ${questionIndex + 1} has an empty choice`);
      assert.ok(getOnboardingFlowMessage(language, question.titleKey)?.trim(), `${language} question ${questionIndex + 1} title`);
      if (question.supportKey) {
        assert.ok(getOnboardingFlowMessage(language, question.supportKey)?.trim(), `${language} question ${questionIndex + 1} support`);
      }
    }
  }
});

test('every onboarding string is present in all seven languages without unresolved templates', () => {
  const keys = Object.keys(onboardingFlowCopy.en);
  assert.ok(keys.length >= 40);
  for (const language of languages) {
    for (const key of keys) {
      const copy = getOnboardingFlowMessage(language, key);
      assert.ok(copy?.trim(), `${language}.${key} should be translated`);
      assert.notEqual(copy, key, `${language}.${key} should not fall back to its key`);
      assert.equal(extendedMessage(language, key), copy, `${language}.${key} should use the onboarding translation`);
    }
    const relief = formatOnboardingTemplate(
      getOnboardingFlowMessage(language, 'onboardingFlowReliefTemplate'),
      { goal: 'a personal goal', friction: 'a real barrier' },
    );
    const result = formatOnboardingTemplate(
      getOnboardingFlowMessage(language, 'onboardingFlowResultTemplate'),
      { goal: 'a personal goal', friction: 'a real barrier' },
    );
    assert.match(relief, /a personal goal/);
    assert.match(result, /a real barrier/);
    assert.doesNotMatch(`${relief} ${result}`, /\{(?:goal|friction)\}/);
  }
});

test('saved answers are validated in order and feature order follows the selected friction', () => {
  assert.deepEqual(
    getValidOnboardingAnswers(['stop-guessing', 'overspend', 'stressed', 'daily', 'manual-entry', 'peace', 'extra']),
    ['stop-guessing', 'overspend', 'stressed', 'daily', 'manual-entry', 'peace'],
  );
  assert.deepEqual(
    getValidOnboardingAnswers(['stop-guessing', 'not-a-choice', 'stressed']),
    ['stop-guessing'],
  );
  assert.equal(getOnboardingChoiceLabel((key) => getOnboardingFlowMessage('en', key), 5, 'peace'), 'Peace of mind');
  const timeFeatures = getOrderedOnboardingFeatures('manual-entry');
  assert.deepEqual(timeFeatures.slice(0, 3).map(({ id }) => id), ['voice', 'receipt', 'bank-screenshot']);
  assert.equal(new Set(timeFeatures.map(({ id }) => id)).size, ONBOARDING_RESULT_FEATURES.length);
  assert.equal(getOrderedOnboardingFeatures('forget')[0].id, 'reminders');
});

test('answers persist as account-local state and the relief, result, and paywall steps are wired', () => {
  assert.match(onboardingScreen, /saveOnboardingAnswers\(nextAnswers\)/);
  assert.match(onboardingScreen, /draftScope !== userId/);
  assert.match(onboardingScreen, /setDraftScope\(userId\)/);
  assert.match(onboardingScreen, /incomeSubmitLock\.current/);
  assert.match(onboardingScreen, /answers\[step\] === choiceId/);
  assert.match(onboardingScreen, /setStep\(RELIEF_STEP\)/);
  assert.match(onboardingScreen, /testID="onboarding-build-my-plan"/);
  assert.match(onboardingScreen, /testID="onboarding-start-taking-control"/);
  assert.match(onboardingScreen, /introHeadline=\{t\('onboardingFlowPaywallHeadline'\)\}/);
  assert.match(onboardingScreen, /goalLine=\{paywallGoal\}/);
  assert.match(onboardingScreen, /direction: language === 'ar' \? 'rtl' : 'ltr'/);
});