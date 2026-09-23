import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_VERSION,
  createReviewState,
  isReviewEligible,
  markReviewAttempt,
  recordMeaningfulUse,
  recordSuccessfulTransactions,
} from '../lib/reviewRequest.ts';

const day = 24 * 60 * 60 * 1000;

function eligibleState() {
  const firstUse = new Date('2026-01-01T10:00:00.000Z');
  let state = recordMeaningfulUse(createReviewState(), firstUse);
  for (let index = 1; index < 8; index += 1) {
    state = recordMeaningfulUse(state, new Date(firstUse.getTime() + index * day));
  }
  return recordSuccessfulTransactions(state, 25, new Date('2026-01-22T10:00:00.000Z'));
}

test('review eligibility requires meaningful activity, onboarding, and 21 days', () => {
  const state = eligibleState();
  assert.equal(isReviewEligible(state, true, new Date('2026-01-23T10:00:00.000Z')), true);
  assert.equal(isReviewEligible(state, false, new Date('2026-01-23T10:00:00.000Z')), false);
  assert.equal(isReviewEligible(state, true, new Date('2026-01-21T09:59:59.000Z')), false);
});

test('insufficient active days or logged transactions never qualifies', () => {
  const state = eligibleState();
  assert.equal(isReviewEligible({ ...state, activeDays: state.activeDays.slice(0, 7) }, true, new Date('2026-02-01T10:00:00.000Z')), false);
  assert.equal(isReviewEligible({ ...state, successfulTransactionCount: 24 }, true, new Date('2026-02-01T10:00:00.000Z')), false);
});

test('automatic review is attempted at most once per release version', () => {
  const state = eligibleState();
  const attempted = markReviewAttempt(state, new Date('2026-01-23T10:00:00.000Z'));
  assert.equal(attempted.lastReviewAttemptVersion, REVIEW_VERSION);
  assert.equal(isReviewEligible(attempted, true, new Date('2026-02-01T10:00:00.000Z')), false);
});