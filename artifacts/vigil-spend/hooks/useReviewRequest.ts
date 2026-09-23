import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';
import {
  createReviewState,
  isReviewEligible,
  markReviewAttempt,
  recordMeaningfulUse,
  recordSuccessfulTransactions,
  reviewStorageKey,
  type ReviewState,
} from '@/lib/reviewRequest';

function normalizeReviewState(value: unknown): ReviewState {
  if (!value || typeof value !== 'object') return createReviewState();
  const candidate = value as Partial<ReviewState>;
  return {
    ...createReviewState(),
    ...candidate,
    activeDays: Array.isArray(candidate.activeDays) ? candidate.activeDays.filter((day): day is string => typeof day === 'string') : [],
    successfulTransactionCount: Number.isFinite(candidate.successfulTransactionCount) ? Math.max(0, Number(candidate.successfulTransactionCount)) : 0,
  };
}

export function useReviewRequest(userId: string | null, onboardingComplete: boolean) {
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const stateRef = useRef<ReviewState | null>(null);

  const persist = useCallback(async (next: ReviewState) => {
    stateRef.current = next;
    setReviewState(next);
    if (userId) await AsyncStorage.setItem(reviewStorageKey(userId), JSON.stringify(next));
  }, [userId]);

  useEffect(() => {
    stateRef.current = null;
    setReviewState(null);
    if (!userId) return;
    let cancelled = false;
    void AsyncStorage.getItem(reviewStorageKey(userId)).then((raw) => {
      if (cancelled) return;
      let loaded = createReviewState();
      try {
        loaded = raw ? normalizeReviewState(JSON.parse(raw)) : loaded;
      } catch {
        loaded = createReviewState();
      }
      const next = recordMeaningfulUse(loaded);
      stateRef.current = next;
      setReviewState(next);
      void AsyncStorage.setItem(reviewStorageKey(userId), JSON.stringify(next));
    });
    return () => { cancelled = true; };
  }, [userId]);

  const requestManualReview = useCallback(async () => {
    if (Platform.OS !== 'ios') return false;
    const reviewUrl = 'https://apps.apple.com/app/id6811090049?action=write-review';
    try {
      if (!(await Linking.canOpenURL(reviewUrl))) return false;
      await Linking.openURL(reviewUrl);
      return true;
    } catch {
      return false;
    }
  }, []);

  const recordSuccessfulLog = useCallback(async (count: number) => {
    if (!userId || count <= 0) return false;
    const next = recordSuccessfulTransactions(stateRef.current ?? createReviewState(), count);
    await persist(next);
    if (!isReviewEligible(next, onboardingComplete)) return false;

    const attempted = markReviewAttempt(next);
    await persist(attempted);
    if (Platform.OS !== 'ios' || !(await StoreReview.isAvailableAsync())) return false;
    await StoreReview.requestReview();
    return true;
  }, [onboardingComplete, persist, userId]);

  return { reviewState, requestManualReview, recordSuccessfulLog };
}