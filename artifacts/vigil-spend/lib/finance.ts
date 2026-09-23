import type { Bucket, IncomeEntry, Transaction } from '@/context/AppContext';

export type MonthPeriod = {
  year: number;
  month: number;
};

export type DateFilter = 'all' | 'today' | '7d' | '30d' | 'month' | '3m' | '6m' | '1y' | 'custom';

export type CategoryBreakdown = {
  bucketId: string;
  labelKey: string;
  amount: number;
  percentage: number;
  colorIndex: number;
};

export function dateFromValue(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

export function monthPeriod(value: Date = new Date()): MonthPeriod {
  return { year: value.getFullYear(), month: value.getMonth() };
}

export function monthKey(value: string | Date) {
  const date = dateFromValue(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(period: MonthPeriod, offset: number): MonthPeriod {
  const value = new Date(period.year, period.month + offset, 1);
  return monthPeriod(value);
}

export function periodLabel(period: MonthPeriod, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(period.year, period.month, 1));
}

export function transactionsForMonth(transactions: Transaction[], period: MonthPeriod) {
  const key = `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
  return transactions.filter((item) => monthKey(item.date) === key);
}

export function incomeForMonth(entries: IncomeEntry[], period: MonthPeriod) {
  return entries
    .filter((item) => monthKey(item.date) === `${period.year}-${String(period.month + 1).padStart(2, '0')}`)
    .reduce((sum, item) => sum + item.amount, 0);
}

export function categoryBreakdown(
  transactions: Transaction[],
  buckets: Bucket[],
): CategoryBreakdown[] {
  const totals = new Map<string, number>();
  transactions.forEach((item) => totals.set(item.bucketId, (totals.get(item.bucketId) ?? 0) + item.amount));
  const total = transactions.reduce((sum, item) => sum + item.amount, 0);
  return buckets
    .map((bucket, index) => ({
      bucketId: bucket.id,
      labelKey: bucket.labelKey,
      amount: totals.get(bucket.id) ?? 0,
      percentage: total > 0 ? ((totals.get(bucket.id) ?? 0) / total) * 100 : 0,
      colorIndex: index,
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function savingsSummary(
  income: number,
  transactions: Transaction[],
  incomeEntries: IncomeEntry[],
  period: MonthPeriod,
) {
  const periodIncome = incomeEntries.length ? incomeForMonth(incomeEntries, period) : income;
  const expenses = transactions.reduce((sum, item) => sum + item.amount, 0);
  const explicitlySaved = transactions
    .filter((item) => item.bucketId === 'savings' || item.bucketId === 'investment')
    .reduce((sum, item) => sum + item.amount, 0);
  const retained = Math.max(0, periodIncome - expenses);
  return {
    income: periodIncome,
    expenses,
    retained,
    explicitlySaved,
    rate: periodIncome > 0 ? (retained / periodIncome) * 100 : 0,
  };
}

export function filterTransactions(
  transactions: Transaction[],
  filter: DateFilter,
  now: Date = new Date(),
  month: MonthPeriod = monthPeriod(now),
  customStart?: string,
  customEnd?: string,
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = (days: number) => {
    const value = new Date(today);
    value.setDate(value.getDate() - (days - 1));
    return value;
  };
  const ranges: Record<Exclude<DateFilter, 'all' | 'month' | 'custom'>, Date> = {
    today,
    '7d': start(7),
    '30d': start(30),
    '3m': new Date(today.getFullYear(), today.getMonth() - 2, 1),
    '6m': new Date(today.getFullYear(), today.getMonth() - 5, 1),
    '1y': new Date(today.getFullYear(), today.getMonth() - 11, 1),
  };
  return transactions.filter((item) => {
    const date = dateFromValue(item.date);
    if (filter === 'all') return true;
    if (filter === 'month') return monthKey(date) === `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
    if (filter === 'custom') {
      const from = customStart ? dateFromValue(customStart) : new Date(0);
      const to = customEnd ? dateFromValue(customEnd) : new Date(8640000000000000);
      return date >= from && date <= to;
    }
    return date >= ranges[filter] && date <= now;
  });
}

export function groupTransactionsByDay(transactions: Transaction[], locale: string) {
  const groups = new Map<string, Transaction[]>();
  transactions.forEach((item) => {
    const date = dateFromValue(item.date);
    const key = item.date.slice(0, 10);
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, item]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      key,
      label: new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(dateFromValue(key)),
      items,
    }));
}