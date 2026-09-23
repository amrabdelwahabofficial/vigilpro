import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findOverlappingCandidate, findPossibleDuplicate } from '../lib/duplicateDetection.ts';

const saved = (overrides = {}) => ({
  id: overrides.id ?? 'saved-1',
  amount: overrides.amount ?? 25,
  currency: overrides.currency ?? 'USD',
  originalAmount: overrides.originalAmount ?? 25,
  originalCurrency: overrides.originalCurrency ?? 'USD',
  note: overrides.note ?? 'Coffee shop',
  date: overrides.date ?? '2026-09-22',
});

test('possible duplicate requires multiple matching signals, not amount alone', () => {
  assert.equal(findPossibleDuplicate({ amount: 25, currency: 'USD', note: 'Taxi', date: '2026-09-22' }, [saved()]), null);
  assert.equal(findPossibleDuplicate({ amount: 25, currency: 'USD', note: 'Coffee shop', date: '2026-09-22' }, [saved()])?.kind, 'existing');
});

test('legitimate repeated transactions remain addable when description or date differs', () => {
  assert.equal(findPossibleDuplicate({ amount: 25, currency: 'USD', note: 'Coffee shop', date: '2026-10-01' }, [saved()]), null);
  assert.equal(findPossibleDuplicate({ amount: 25, currency: 'USD', note: 'Taxi', date: '2026-09-22' }, [saved()]), null);
});

test('overlapping capture candidates remain present and are marked instead of discarded', () => {
  const candidates = [
    { amount: 25, currency: 'USD', originalAmount: 25, originalCurrency: 'USD', note: 'Coffee shop', date: '2026-09-22' },
    { amount: 25, currency: 'USD', originalAmount: 25, originalCurrency: 'USD', note: 'Coffee shop', date: '2026-09-22' },
  ];
  assert.equal(candidates.length, 2);
  assert.deepEqual(findOverlappingCandidate(candidates[1], 1, candidates), {
    kind: 'candidate',
    candidateIndex: 0,
    reason: 'overlapping-capture',
  });
});

test('duplicate warning actions and replacement flow are present in the review UI', () => {
  const source = fs.readFileSync(new URL('../components/VigilApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /testID="duplicate-replace"/);
  assert.match(source, /testID="duplicate-add-anyway"/);
  assert.match(source, /testID="duplicate-keep-existing"/);
  assert.match(source, /updateTransaction\(match\.transaction\.id/);
  assert.match(source, /addTransaction\(transaction\)/);
  assert.match(source, /setDuplicateQueue\(pending\)/);
});