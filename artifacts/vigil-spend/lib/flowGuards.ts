export type AppEntryRoute = '/sign-in' | '/onboarding' | '/';

export function resolveAppEntryRoute({
  isSignedIn,
  onboardingComplete,
}: {
  isSignedIn: boolean;
  onboardingComplete: boolean;
}): AppEntryRoute {
  if (!isSignedIn) return '/sign-in';
  if (!onboardingComplete) return '/onboarding';
  return '/';
}

export function tutorialStorageKey(userId?: string | null) {
  return `vigil-tutorial-${userId ?? 'guest'}`;
}

export function shouldShowTutorial(seen: string | null) {
  return seen !== '1';
}

/**
 * Run a Pro-only action without allowing the Free plan to mutate its state.
 * The unlock callback is deliberately invoked for every blocked interaction so
 * all premium controls lead to the same subscription entry point.
 */
export function runProAction(
  isPro: boolean,
  onUnlock: () => void,
  action: () => void,
) {
  if (!isPro) {
    onUnlock();
    return false;
  }
  action();
  return true;
}