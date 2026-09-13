export type CurrencyRates = Partial<Record<string, number>>;

export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: CurrencyRates,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const source = normalizeCurrencyCode(fromCurrency);
  const target = normalizeCurrencyCode(toCurrency);
  if (!source || !target) return null;
  if (source === target) return amount;

  const sourceRate = rates[source];
  const targetRate = rates[target];
  if (!Number.isFinite(sourceRate) || !sourceRate || !Number.isFinite(targetRate) || !targetRate) return null;
  return (amount / sourceRate) * targetRate;
}