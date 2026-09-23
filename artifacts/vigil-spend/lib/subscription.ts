export type PlanKind = 'monthly' | 'yearly';

// This is the live RevenueCat entitlement lookup key. Keep the older keys
// below so customers from earlier catalog versions retain access.
export const VIGIL_PRO_ENTITLEMENT = 'vigil_pro_unlimited';

// These entitlement aliases are intentionally retained for people who bought
// before the current entitlement name was introduced.
export const LEGACY_VIGIL_PRO_ENTITLEMENTS = ['vigil_unlimited', 'vigil_know_where_it_all_goes_pro', 'vigil_pro', 'pro'] as const;

export const PRODUCT_IDENTIFIERS: Record<PlanKind, string> = {
  monthly: 'vigil_unlimited_monthly',
  yearly: 'vigil_unlimited_yearly',
};

export const FALLBACK_PRICES: Record<PlanKind, string> = {
  monthly: '$9.99',
  yearly: '$79.99',
};

export function fallbackPriceForPlan(plan: PlanKind) {
  return FALLBACK_PRICES[plan];
}

const TEST_STORE_PRODUCT_IDENTIFIERS: Record<PlanKind, readonly string[]> = {
  // Keep legacy Test Store aliases supported for existing preview customers.
  monthly: ['vigil_unlimited_monthly', 'vigil_pro_monthly', 'Vigil_pro_monthly', 'monthly'],
  yearly: ['vigil_unlimited_yearly', 'vigil_pro_yearly', 'yearly'],
};

const PACKAGE_IDENTIFIERS: Record<PlanKind, string> = {
  monthly: '$rc_monthly',
  yearly: '$rc_annual',
};

type PackageLike = {
  identifier: string;
  product: {
    identifier: string;
  };
};

type OfferingLike<TPackage extends PackageLike> = {
  availablePackages?: TPackage[] | null;
} | null;

export function packageForPlan<TPackage extends PackageLike>(
  offering: OfferingLike<TPackage>,
  plan: PlanKind,
): TPackage | null {
  const expectedProductIdentifier = PRODUCT_IDENTIFIERS[plan];
  const expectedTestStoreProductIdentifier = TEST_STORE_PRODUCT_IDENTIFIERS[plan];
  const expectedPackageIdentifier = PACKAGE_IDENTIFIERS[plan];
  return offering?.availablePackages?.find(
    (item) => item.product.identifier === expectedProductIdentifier
      || (
        item.identifier === expectedPackageIdentifier
        && expectedTestStoreProductIdentifier.includes(item.product.identifier)
      ),
  ) ?? null;
}

export function hasVigilProEntitlement(
  info: { entitlements?: { active?: Record<string, unknown> } } | null,
) {
  const active = info?.entitlements?.active;
  return Boolean(
    active?.[VIGIL_PRO_ENTITLEMENT]
    || LEGACY_VIGIL_PRO_ENTITLEMENTS.some((identifier) => active?.[identifier]),
  );
}

export function purchaseWasCancelled(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    userCancelled?: unknown;
    userCanceled?: unknown;
  };
  return candidate.userCancelled === true || candidate.userCanceled === true;
}

/**
 * Keep the status comparison in one place so callers can pass the SDK's
 * named eligible constant. Unknown and no-offer statuses remain ineligible.
 */
export function isIntroductoryOfferEligible(status: unknown, eligibleStatus: unknown) {
  return status === eligibleStatus;
}

/**
 * RevenueCat's SDK is process-global. Serialize operations that can change
 * its active customer so an older identity cannot complete over a newer one.
 */
export function createSerializedTaskQueue() {
  let tail: Promise<void> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}