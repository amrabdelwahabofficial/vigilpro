export type DuplicateTransactionLike = {
  amount: number;
  currency?: string | null;
  originalAmount?: number;
  originalCurrency?: string | null;
  note?: string | null;
  date?: string | null;
};

export type DuplicateMatch =
  | { kind: 'existing'; transaction: DuplicateTransactionLike & { id: string }; reason: 'same-amount-date-note' | 'same-amount-note' }
  | { kind: 'candidate'; candidateIndex: number; reason: 'overlapping-capture' };

function normalizedCurrency(value: string | null | undefined) {
  return value?.trim().toUpperCase() || '';
}

export function normalizedDescription(value: string | null | undefined) {
  return (value ?? '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function descriptionSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right || left.includes(right) || right.includes(left)) return 1;
  const leftWords = new Set(left.split(' ').filter((word) => word.length > 1));
  const rightWords = new Set(right.split(' ').filter((word) => word.length > 1));
  if (!leftWords.size || !rightWords.size) return 0;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.max(leftWords.size, rightWords.size);
}

function dateDistanceDays(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const leftTime = new Date(`${left}T12:00:00`).getTime();
  const rightTime = new Date(`${right}T12:00:00`).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000);
}

function amountsMatch(candidate: DuplicateTransactionLike, existing: DuplicateTransactionLike) {
  const candidateOriginalCurrency = normalizedCurrency(candidate.originalCurrency ?? candidate.currency);
  const existingOriginalCurrency = normalizedCurrency(existing.originalCurrency ?? existing.currency);
  const candidateAmount = Number.isFinite(candidate.originalAmount) ? candidate.originalAmount! : candidate.amount;
  const existingAmount = Number.isFinite(existing.originalAmount) ? existing.originalAmount! : existing.amount;
  if (candidateOriginalCurrency && existingOriginalCurrency && candidateOriginalCurrency === existingOriginalCurrency) {
    return Math.abs(candidateAmount - existingAmount) <= 0.01;
  }
  return Math.abs(candidate.amount - existing.amount) <= 0.01;
}

export function findPossibleDuplicate(
  candidate: DuplicateTransactionLike,
  existingTransactions: Array<DuplicateTransactionLike & { id: string }>,
): DuplicateMatch | null {
  const candidateNote = normalizedDescription(candidate.note);
  for (const transaction of existingTransactions) {
    if (!amountsMatch(candidate, transaction)) continue;
    const noteSimilarity = descriptionSimilarity(candidateNote, normalizedDescription(transaction.note));
    const daysApart = dateDistanceDays(candidate.date, transaction.date);
    if (noteSimilarity >= 0.5 && daysApart <= 1) {
      return { kind: 'existing', transaction, reason: 'same-amount-date-note' };
    }
    if (noteSimilarity >= 0.9 && daysApart <= 7) {
      return { kind: 'existing', transaction, reason: 'same-amount-note' };
    }
  }
  return null;
}

export function findOverlappingCandidate(
  candidate: DuplicateTransactionLike,
  candidateIndex: number,
  candidates: DuplicateTransactionLike[],
): DuplicateMatch | null {
  const candidateNote = normalizedDescription(candidate.note);
  for (let index = 0; index < candidateIndex; index += 1) {
    const previous = candidates[index];
    if (!amountsMatch(candidate, previous)) continue;
    const noteSimilarity = descriptionSimilarity(candidateNote, normalizedDescription(previous.note));
    if (noteSimilarity >= 0.5 && dateDistanceDays(candidate.date, previous.date) <= 1) {
      return { kind: 'candidate', candidateIndex: index, reason: 'overlapping-capture' };
    }
  }
  return null;
}