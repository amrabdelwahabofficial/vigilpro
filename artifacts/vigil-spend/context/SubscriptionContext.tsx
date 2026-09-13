import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { useIdentity } from '@/context/IdentityContext';
import {
  hasVigilProEntitlement,
  createSerializedTaskQueue,
  packageForPlan,
  PlanKind,
  purchaseWasCancelled,
} from '@/lib/subscription';

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'not_active';
export type SubscriptionError = 'configuration' | 'identity' | 'catalog' | null;

type SubscriptionContextValue = {
  configured: boolean;
  loading: boolean;
  error: SubscriptionError;
  offering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  purchase: (plan: PlanKind) => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  // Kept for the identity flow. UI sign-out relies on the identity transition
  // instead of calling this directly.
  logOutCustomer: () => Promise<void>;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  presentRevenueCatPaywall: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
};

type RevenueCatSnapshot = {
  configured: boolean;
  offering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  identityError: boolean;
  catalogError: boolean;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

let configuredRevenueCatKey: string | null = null;
let synchronizedRevenueCatUserId: string | null = null;
const enqueueRevenueCat = createSerializedTaskQueue();

function revenueCatKey() {
  // Expo Go/Preview API Mode should use the new account's Test Store key.
  // A Test Store key must not be embedded in a production TestFlight build.
  if (__DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY) {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
}

function revenueCatKeySource() {
  if (__DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY) return 'test-store';
  if (Platform.OS === 'ios') return 'ios-app-store';
  if (Platform.OS === 'android') return 'android-app-store';
  return 'test-store';
}

function revenueCatErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { name: null, message: String(error), code: null, readableErrorCode: null, underlyingErrorMessage: null };
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    readableErrorCode?: unknown;
    underlyingErrorMessage?: unknown;
  };
  const value = (input: unknown): string | number | null => (
    typeof input === 'string' || typeof input === 'number' ? input : null
  );

  return {
    name: value(candidate.name) ?? (error as { constructor?: { name?: string } }).constructor?.name ?? null,
    message: value(candidate.message),
    code: value(candidate.code),
    readableErrorCode: value(candidate.readableErrorCode),
    underlyingErrorMessage: value(candidate.underlyingErrorMessage),
  };
}

async function configurePurchasesInQueue(key: string) {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.INFO);
  const alreadyConfigured = configuredRevenueCatKey === key || await Purchases.isConfigured();
  if (!alreadyConfigured) Purchases.configure({ apiKey: key });
  configuredRevenueCatKey = key;
}

async function synchronizeCustomerInQueue(userId: string | null): Promise<CustomerInfo> {
  if (userId) {
    const isAnonymous = await Purchases.isAnonymous();
    const currentAppUserId = await Purchases.getAppUserID();
    if (currentAppUserId !== userId || isAnonymous) {
      const result = await Purchases.logIn(userId);
      synchronizedRevenueCatUserId = userId;
      return result.customerInfo;
    }
    synchronizedRevenueCatUserId = userId;
    return Purchases.getCustomerInfo();
  }

  // Initial SDK configuration creates an anonymous customer. Logging it out is
  // unnecessary and can reject, which used to prevent the first catalog load.
  if (await Purchases.isAnonymous()) {
    synchronizedRevenueCatUserId = null;
    return Purchases.getCustomerInfo();
  }
  const info = await Purchases.logOut();
  synchronizedRevenueCatUserId = null;
  return info;
}

async function loadSnapshot(key: string, userId: string | null): Promise<RevenueCatSnapshot> {
  return enqueueRevenueCat(async () => {
    await configurePurchasesInQueue(key);

    let customerInfo: CustomerInfo | null = null;
    let identityError = false;
    try {
      customerInfo = await synchronizeCustomerInQueue(userId);
    } catch {
      identityError = true;
    }

    let offering: PurchasesOffering | null = null;
    let catalogError = false;
    const requestContext = {
      platform: Platform.OS,
      buildMode: __DEV__ ? 'development' : 'release',
      keySource: revenueCatKeySource(),
      customerMode: userId ? 'identified' : 'anonymous',
    };
    try {
      // Never substitute a non-current offering. It may be intentionally
      // unpublished or targeted to a different customer.
      const offerings = await Purchases.getOfferings();
      offering = offerings.current ?? null;
      const packageSummary = offering?.availablePackages.map((pkg) => ({
        packageIdentifier: pkg.identifier,
        productIdentifier: pkg.product.identifier,
      })) ?? [];
      console.info('[RevenueCat] getOfferings result', {
        ...requestContext,
        currentOfferingIdentifier: offering?.identifier ?? null,
        packageSummary,
        allOfferingIdentifiers: Object.keys(offerings.all ?? {}),
      });
      if (!offering) {
        catalogError = true;
        console.warn('[RevenueCat] getOfferings returned no current offering', requestContext);
      }
    } catch (error) {
      catalogError = true;
      console.error('[RevenueCat] getOfferings failed', {
        ...requestContext,
        error: revenueCatErrorDetails(error),
      });
    }

    return { configured: true, offering, customerInfo, identityError, catalogError };
  });
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: identityLoaded, isSignedIn, userId, isAdmin, proOverride } = useIdentity();
  const activeUserId = identityLoaded && isSignedIn && userId ? userId : null;
  const identityState = useRef({ userId: activeUserId, revision: 0 });
  if (identityState.current.userId !== activeUserId) {
    identityState.current = { userId: activeUserId, revision: identityState.current.revision + 1 };
  }

  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SubscriptionError>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!identityLoaded) return;
    const key = revenueCatKey();
    const request = identityState.current;
    if (!key) {
      if (identityState.current.revision === request.revision) {
        setConfigured(false);
        setOffering(null);
        setError('configuration');
        setLoading(false);
      }
      return;
    }

    if (identityState.current.revision === request.revision) {
      setLoading(true);
      setError(null);
    }
    try {
      const snapshot = await loadSnapshot(key, request.userId);
      if (identityState.current.revision !== request.revision) return;
      setConfigured(snapshot.configured);
      // A targeted offering can vary by customer. Never publish an offering
      // read while the requested account could not be synchronized.
      setOffering(snapshot.identityError ? null : snapshot.offering);
      // Preserve the same customer's last known entitlement during a
      // transient CustomerInfo failure. A new identity is cleared below.
      if (!snapshot.identityError && snapshot.customerInfo) setCustomerInfo(snapshot.customerInfo);
      setError(snapshot.identityError ? 'identity' : snapshot.catalogError ? 'catalog' : null);
    } catch {
      if (identityState.current.revision === request.revision) {
        setConfigured(false);
        setOffering(null);
        setError('configuration');
      }
    } finally {
      if (identityState.current.revision === request.revision) setLoading(false);
    }
  }, [identityLoaded]);

  const retry = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!identityLoaded) return;
    // Clear A's entitlement before starting B's serialized SDK transition.
    setCustomerInfo(null);
    setOffering(null);
    void refresh();
  }, [activeUserId, identityLoaded, refresh]);

  useEffect(() => {
    if (!configured) return;
    const listener = (info: CustomerInfo) => {
      const activeIdentity = identityState.current.userId;
      if (activeIdentity && synchronizedRevenueCatUserId === activeIdentity) {
        setCustomerInfo(info);
      }
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [configured]);

  const monthlyPackage = packageForPlan(offering, 'monthly');
  const yearlyPackage = packageForPlan(offering, 'yearly');
  const isPro = hasVigilProEntitlement(customerInfo) || isAdmin || proOverride;

  const value = useMemo<SubscriptionContextValue>(() => ({
    configured,
    loading,
    error,
    offering,
    monthlyPackage,
    yearlyPackage,
    customerInfo,
    isPro,
    refresh,
    retry,
    presentRevenueCatPaywall: async () => {
      if (!configured) throw new Error('Subscription services are not ready on this device.');
      if (!offering) throw new Error('No subscription offering is available right now. Please retry.');
      await RevenueCatUI.presentPaywall({ offering });
      await refresh();
    },
    presentCustomerCenter: async () => {
      if (!configured) throw new Error('Apple subscription services are not ready on this device.');
      await RevenueCatUI.presentCustomerCenter();
      await refresh();
    },
    purchase: async (plan) => {
      const key = revenueCatKey();
      const request = identityState.current;
      if (!key) throw new Error('Apple subscription services are not ready on this device.');
      if (!request.userId) throw new Error('Sign in before purchasing a subscription.');
      return enqueueRevenueCat(async () => {
        await configurePurchasesInQueue(key);
        try {
          await synchronizeCustomerInQueue(request.userId);
        } catch {
          throw new Error('Your subscription account could not be synchronized. Please retry before purchasing.');
        }
        if (identityState.current.revision !== request.revision) {
          throw new Error('Your account changed. Please retry before purchasing.');
        }
        const currentOffering = (await Purchases.getOfferings()).current ?? null;
        const selectedPackage = packageForPlan(currentOffering, plan);
        if (!selectedPackage) throw new Error(`The ${plan} plan is not available right now. Please try again later.`);
        try {
          const result = await Purchases.purchasePackage(selectedPackage);
          if (identityState.current.revision !== request.revision) return 'not_active';
          setCustomerInfo(result.customerInfo);
          return hasVigilProEntitlement(result.customerInfo) ? 'purchased' : 'not_active';
        } catch (purchaseError) {
          if (purchaseWasCancelled(purchaseError)) return 'cancelled';
          throw purchaseError;
        }
      });
    },
    restore: async () => {
      if (isAdmin || proOverride) return true;
      const key = revenueCatKey();
      const request = identityState.current;
      if (!key) throw new Error('Apple subscription services are not ready on this device.');
      if (!request.userId) throw new Error('Sign in before restoring purchases.');
      return enqueueRevenueCat(async () => {
        await configurePurchasesInQueue(key);
        try {
          await synchronizeCustomerInQueue(request.userId);
        } catch {
          throw new Error('Your subscription account could not be synchronized. Please retry before restoring purchases.');
        }
        if (identityState.current.revision !== request.revision) {
          throw new Error('Your account changed. Please retry before restoring purchases.');
        }
        try {
          const info = await Purchases.restorePurchases();
          if (identityState.current.revision !== request.revision) return false;
          setCustomerInfo(info);
          return hasVigilProEntitlement(info);
        } catch (restoreError) {
          if (purchaseWasCancelled(restoreError)) return false;
          throw restoreError;
        }
      });
    },
    logOutCustomer: async () => {
      // An identity transition owns RC logout. This escape hatch is only safe
      // after the app identity is already anonymous.
      if (!configured || identityState.current.userId) return;
      await enqueueRevenueCat(async () => {
        // Do not manufacture another anonymous identity during startup/sign-out.
        if (await Purchases.isAnonymous()) return;
        await Purchases.logOut();
        synchronizedRevenueCatUserId = null;
      });
    },
  }), [configured, customerInfo, error, isAdmin, isPro, loading, monthlyPackage, offering, proOverride, refresh, retry, yearlyPackage]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return value;
}