export const REVIEW_VERSION = '1.1';

export type ReviewState = {
  firstMeaningfulUseAt: string | null;
  activeDays: string[];
  successfulTransactionCount: number;
  lastReviewAttemptAt: string | null;
  lastReviewAttemptVersion: string | null;
};

export function createReviewState(): ReviewState {
  return {
    firstMeaningfulUseAt: null,
    activeDays: [],
    successfulTransactionCount: 0,
    lastReviewAttemptAt: null,
    lastReviewAttemptVersion: null,
  };
}

export function reviewStorageKey(userId: string) {
  return `vigil-review-v1:${userId}`;
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function recordMeaningfulUse(state: ReviewState, now = new Date()): ReviewState {
  const day = localDateKey(now);
  return {
    ...state,
    firstMeaningfulUseAt: state.firstMeaningfulUseAt ?? now.toISOString(),
    activeDays: state.activeDays.includes(day) ? state.activeDays : [...state.activeDays, day].slice(-90),
  };
}

export function recordSuccessfulTransactions(state: ReviewState, count: number, now = new Date()): ReviewState {
  if (!Number.isFinite(count) || count <= 0) return recordMeaningfulUse(state, now);
  return {
    ...recordMeaningfulUse(state, now),
    successfulTransactionCount: state.successfulTransactionCount + Math.floor(count),
  };
}

export function isReviewEligible(
  state: ReviewState,
  onboardingComplete: boolean,
  now = new Date(),
) {
  if (!onboardingComplete || !state.firstMeaningfulUseAt) return false;
  const firstUse = Date.parse(state.firstMeaningfulUseAt);
  const daysSinceFirstUse = Number.isFinite(firstUse)
    ? (now.getTime() - firstUse) / (24 * 60 * 60 * 1000)
    : 0;
  return (
    daysSinceFirstUse >= 21
    && state.activeDays.length >= 8
    && state.successfulTransactionCount >= 25
    && state.lastReviewAttemptVersion !== REVIEW_VERSION
  );
}

export function markReviewAttempt(state: ReviewState, now = new Date()): ReviewState {
  return {
    ...state,
    lastReviewAttemptAt: now.toISOString(),
    lastReviewAttemptVersion: REVIEW_VERSION,
  };
}