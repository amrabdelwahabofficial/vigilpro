import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  categoryBreakdown,
  filterTransactions,
  groupTransactionsByDay,
  incomeForMonth,
  monthKey,
  savingsSummary,
  transactionsForMonth,
} from '../lib/finance.ts';
import { accountStorageKey, LEGACY_STORAGE_KEY } from '../lib/accountScope.ts';
import { canAddActiveGoal } from '../lib/goals.ts';

const appContextSource = fs.readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');

const buckets = [
  { id: 'needs', labelKey: 'needs', icon: 'home-outline', percent: 50, tone: 'needs' },
  { id: 'fun', labelKey: 'fun', icon: 'sparkles-outline', percent: 30, tone: 'fun' },
  { id: 'savings', labelKey: 'savings', icon: 'leaf-outline', percent: 20, tone: 'savings' },
];

const transactions = [
  { id: 'a', amount: 100, bucketId: 'needs', note: 'Rent', date: '2026-09-02', source: 'manual' },
  { id: 'b', amount: 25, bucketId: 'fun', note: 'Coffee', date: '2026-09-08', source: 'manual' },
  { id: 'c', amount: 40, bucketId: 'savings', note: 'Transfer', date: '2026-08-31', source: 'manual' },
];

test('month selectors use calendar dates without timezone drift', () => {
  assert.equal(monthKey('2026-09-01'), '2026-09');
  assert.equal(transactionsForMonth(transactions, { year: 2026, month: 8 }).length, 2);
  assert.equal(transactionsForMonth(transactions, { year: 2026, month: 7 }).length, 1);
});

test('category breakdown and savings summary use actual period records', () => {
  const breakdown = categoryBreakdown(transactionsForMonth(transactions, { year: 2026, month: 8 }), buckets);
  assert.deepEqual(breakdown.map((item) => [item.bucketId, item.amount]), [['needs', 100], ['fun', 25]]);
  assert.equal(Math.round(breakdown[0].percentage), 80);

  const entries = [{ id: 'income-1', amount: 500, type: 'salary', date: '2026-09-01' }];
  assert.equal(incomeForMonth(entries, { year: 2026, month: 8 }), 500);
  const summary = savingsSummary(0, transactionsForMonth(transactions, { year: 2026, month: 8 }), entries, { year: 2026, month: 8 });
  assert.equal(summary.expenses, 125);
  assert.equal(summary.retained, 375);
  assert.equal(summary.rate, 75);
});

test('history filters and groups are date-focused', () => {
  const now = new Date('2026-09-10T12:00:00');
  assert.equal(filterTransactions(transactions, '7d', now).length, 1);
  assert.equal(filterTransactions(transactions, 'month', now, { year: 2026, month: 8 }).length, 2);
  assert.equal(filterTransactions(transactions, '3m', now).length, 3);
  assert.equal(filterTransactions(transactions, '6m', now).length, 3);
  assert.equal(filterTransactions(transactions, '1y', now).length, 3);
  const groups = groupTransactionsByDay(transactions, 'en-US');
  assert.equal(groups[0].key, '2026-09-08');
  assert.equal(groups[0].items[0].note, 'Coffee');
});

test('identical names cannot share account-scoped local storage', () => {
  const alexOne = accountStorageKey('clerk-user-one');
  const alexTwo = accountStorageKey('clerk-user-two');
  assert.notEqual(alexOne, alexTwo);
  assert.equal(LEGACY_STORAGE_KEY, 'vigil-state-v3');
  const storage = new Map([
    [alexOne, JSON.stringify({ profileFirstName: 'Alex', income: 100 })],
    [alexTwo, JSON.stringify({ profileFirstName: 'Alex', income: 900 })],
  ]);
  assert.equal(JSON.parse(storage.get(alexOne)).income, 100);
  assert.equal(JSON.parse(storage.get(alexTwo)).income, 900);
});

test('unowned legacy v3 data stays quarantined instead of being claimed by account B', () => {
  const legacyState = JSON.stringify({
    profileFirstName: 'Avery',
    income: 1200,
    incomeEntries: [{ id: 'legacy-income', amount: 1200, type: 'salary', date: '2026-09-01' }],
    transactions: [{ id: 'legacy-transaction', amount: 300, bucketId: 'needs', note: 'Rent', date: '2026-09-02' }],
    goals: [{ id: 'legacy-goal', name: 'Emergency fund', target: 5000, allocated: 100 }],
  });
  const storage = new Map([[LEGACY_STORAGE_KEY, legacyState]]);
  const accountBKey = accountStorageKey('account-b');

  assert.equal(storage.get(accountBKey), undefined);
  assert.equal(storage.get(LEGACY_STORAGE_KEY), legacyState);
  assert.doesNotMatch(appContextSource, /getItem\(LEGACY_STORAGE_KEY\)/);
  assert.doesNotMatch(appContextSource, /removeItem\(LEGACY_STORAGE_KEY\)/);
});

test('Free accounts keep one total goal while Pro accounts can add more', () => {
  const goals = [
    { id: 'goal-1', name: 'Emergency fund', target: 1000, allocated: 100, currency: 'AED', targetDate: null, status: 'active', createdAt: '2026-09-01' },
    { id: 'goal-2', name: 'Trip', target: 2000, allocated: 0, currency: 'AED', targetDate: null, status: 'completed', createdAt: '2026-08-01' },
  ];
  assert.equal(canAddActiveGoal(goals, false), false);
  assert.equal(canAddActiveGoal(goals, true), true);
  assert.equal(canAddActiveGoal(goals.filter((goal) => goal.status !== 'active'), false), false);
  assert.equal(canAddActiveGoal([], false), true);
});