export const LEGACY_STORAGE_KEY = 'vigil-state-v3';
export const ACCOUNT_STORAGE_PREFIX = 'vigil-state-v4:';

export function accountStorageKey(userId: string) {
  return `${ACCOUNT_STORAGE_PREFIX}${userId}`;
}

export function tutorialStorageKeyForAccount(userId: string) {
  return `vigil-tutorial-${userId}`;
}