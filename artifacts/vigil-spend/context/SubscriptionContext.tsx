import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { useIdentity } from '@/context/IdentityContext';
import {
  hasVigilProEntitlement,
  createSerializedTaskQueue,
  isIntroductoryOfferEligible,
  packageForPlan,
  PlanKind,
  PRODUCT_IDENTIFIERS,
  purchaseWasCancelled,
} from '@/lib/subscription';
import { recordRevenueCatDiagnostic, revenueCatErrorDetails } from '@/lib/authDiagnostics';
import {
  createRuntimeCredentialProof,
  getClerkRuntimePublishableKey,
  isVigilProductionBuild,
  PRODUCTION_REVENUECAT_IOS_API_KEY,
} from '@/lib/runtimeCredentials';

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'not_active';
export type SubscriptionError = 'configuration' | 'identity' | 'catalog' | null;

type SubscriptionContextValue = {
  configured: boolean;
  loading: boolean;
  error: SubscriptionError;
  offering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  yearlyTrialEligible: boolean;
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  loadedProductIds: string[];
  purchase: (plan: PlanKind) => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  // Kept for the identity flow. UI sign-out relies on the identity transition
  // instead of calling this directly.
  logOutCustomer: () => Promise<void>;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
};

type RevenueCatSnapshot = {
  configured: boolean;
  offering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  yearlyTrialEligible: boolean;
  identityError: boolean;
  catalogError: boolean;
  loadedProductIds: string[];
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

let configuredRevenueCatKey: string | null = null;
let synchronizedRevenueCatUserId: string | null = null;
let runtimeCredentialProofLogged = false;
const enqueueRevenueCat = createSerializedTaskQueue();
function revenueCatKey() {
  const isProduction = isVigilProductionBuild();
  const isExpoGo = Constants.appOwnership === 'expo';

  // Production never falls back to the shared Test Store key. Native iOS
  // Production uses the pinned App Store key; web has no App Store key.
  if (isProduction) {
    return Platform.OS === 'ios' ? PRODUCTION_REVENUECAT_IOS_API_KEY : undefined;
  }

  // Expo Go and web Preview API Mode use the Test Store key. Native
  // development builds still talk to StoreKit, even when __DEV__ is true.
  if ((Platform.OS === 'web' || isExpoGo) && process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY) {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  // No verified Google Play public key is configured. Never consume a stale
  // or Test Store key in an Android native build.
  if (Platform.OS === 'android') return undefined;
  return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
}

async function configurePurchasesInQueue(key: string) {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.INFO);
  const alreadyConfigured = configuredRevenueCatKey === key || await Purchases.isConfigured();
  if (!alreadyConfigured) {
    if (isVigilProductionBuild() && !runtimeCredentialProofLogged) {
      const proof = await createRuntimeCredentialProof(getClerkRuntimePublishableKey(), key);
      console.info('[Vigil] runtime credential proof', proof);
      runtimeCredentialProofLogged = true;
    }
    Purchases.configure({ apiKey: key });
  }
  configuredRevenueCatKey = key;
  void recordRevenueCatDiagnostic('startup', 'configure', 'success', {
    configured: 'true',
    customerMode: 'unknown',
  });
}

async function synchronizeCustomerInQueue(
  userId: string | null,
  requireCustomerInfo = true,
): Promise<CustomerInfo | null> {
  try {
    const info = await (async () => {
      if (userId) {
        const isAnonymous = await Purchases.isAnonymous();
        const currentAppUserId = await Purchases.getAppUserID();
        if (currentAppUserId !== userId || isAnonymous) {
          const result = await Purchases.logIn(userId);
          synchronizedRevenueCatUserId = userId;
          return result.customerInfo;
        }
        synchronizedRevenueCatUserId = userId;
        if (!requireCustomerInfo) {
          return null;
        }
        return await Purchases.getCustomerInfo();
      }

      // Initial SDK configuration creates an anonymous customer. Logging it out is
      // unnecessary and can reject, which used to prevent the first catalog load.
      if (await Purchases.isAnonymous()) {
        synchronizedRevenueCatUserId = null;
        return await Purchases.getCustomerInfo();
      }
      const result = await Purchases.logOut();
      synchronizedRevenueCatUserId = null;
      return result;
    })();
    void recordRevenueCatDiagnostic('startup', 'customer-synchronization', 'success', {
      configured: 'true',
      customerMode: userId ? 'identified' : 'anonymous',
      productIds: info?.activeSubscriptions ?? [],
      message: info
        ? `active entitlement=${hasVigilProEntitlement(info) ? 'true' : 'false'}`
        : 'customer identity selected',
    });
    return info;
  } catch (error) {
      const details = revenueCatErrorDetails(error);
      void recordRevenueCatDiagnostic('startup', 'customer-synchronization', 'error', {
        ...details,
        customerMode: userId ? 'identified' : 'anonymous',
      });
    console.error('[RevenueCat] customer synchronization failed', { platform: Platform.OS });
    throw error;
  }
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
    let yearlyTrialEligible = false;
    let loadedProductIds: string[] = [];
    const requestContext = { platform: Platform.OS, customerMode: userId ? 'identified' : 'anonymous' };
    try {
      // Never substitute a non-current offering. It may be intentionally
      // unpublished or targeted to a different customer.
      const offerings = await Purchases.getOfferings();
      offering = offerings.current ?? null;
      loadedProductIds = offering?.availablePackages.map((pkg) => pkg.product.identifier) ?? [];
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
      void recordRevenueCatDiagnostic('startup', 'offerings', offering ? 'success' : 'state', {
        configured: 'true',
        customerMode: userId ? 'identified' : 'anonymous',
        offeringId: offering?.identifier ?? '',
        productIds: loadedProductIds,
      });
      if (!offering) {
        catalogError = true;
        console.warn('[RevenueCat] getOfferings returned no current offering', requestContext);
      }
    } catch (error) {
      catalogError = true;
      const details = revenueCatErrorDetails(error);
      void recordRevenueCatDiagnostic('startup', 'offerings', 'error', {
        ...details,
        configured: 'true',
        customerMode: userId ? 'identified' : 'anonymous',
      });
      console.error('[RevenueCat] getOfferings failed', requestContext);
    }

    if (!identityError && offering && Platform.OS === 'ios') {
      const yearlyPackage = packageForPlan(offering, 'yearly');
      if (yearlyPackage) {
        try {
          const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([
            yearlyPackage.product.identifier || PRODUCT_IDENTIFIERS.yearly,
          ]);
          yearlyTrialEligible = isIntroductoryOfferEligible(
            eligibility[yearlyPackage.product.identifier]?.status,
            Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
          );
        } catch (error) {
          // Unknown eligibility is intentionally rendered as a normal annual
          // purchase rather than promising a trial StoreKit may reject.
            console.warn('[RevenueCat] yearly introductory eligibility unavailable', requestContext);
        }
      }
    }

    return { configured: true, offering, customerInfo, yearlyTrialEligible, identityError, catalogError, loadedProductIds };
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
  const [loadedProductIds, setLoadedProductIds] = useState<string[]>([]);
  const [yearlyTrialEligible, setYearlyTrialEligible] = useState(false);
  const refresh = useCallback(async () => {
    if (!identityLoaded) return;
    const key = revenueCatKey();
    const request = identityState.current;
    if (!key) {
      void recordRevenueCatDiagnostic('startup', 'configuration', 'error', {
        configured: 'false',
        message: 'No RevenueCat API key is configured for this build.',
      });
      if (identityState.current.revision === request.revision) {
        setConfigured(false);
        setOffering(null);
        setLoadedProductIds([]);
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
      setLoadedProductIds(snapshot.loadedProductIds);
      setYearlyTrialEligible(snapshot.identityError ? false : snapshot.yearlyTrialEligible);
      // Preserve the same customer's last known entitlement during a
      // transient CustomerInfo failure. A new identity is cleared below.
      if (!snapshot.identityError && snapshot.customerInfo) setCustomerInfo(snapshot.customerInfo);
      setError(snapshot.identityError ? 'identity' : snapshot.catalogError ? 'catalog' : null);
    } catch {
      void recordRevenueCatDiagnostic('startup', 'snapshot', 'error', {
        configured: 'false',
        message: 'RevenueCat snapshot could not be loaded.',
      });
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
    setLoadedProductIds([]);
    setYearlyTrialEligible(false);
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
    yearlyTrialEligible,
    customerInfo,
    loadedProductIds,
    isPro,
    refresh,
    retry,
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
          // A purchase only needs the RevenueCat customer identity selected.
          // Requiring a successful CustomerInfo/receipt read here can block a
          // first purchase during a transient network or StoreKit refresh.
          await synchronizeCustomerInQueue(request.userId, false);
        } catch (syncError) {
          const wrappedError = new Error('Your subscription account could not be synchronized. Please retry before purchasing.') as Error & { cause?: unknown };
          wrappedError.cause = syncError;
          throw wrappedError;
        }
        if (identityState.current.revision !== request.revision) {
          throw new Error('Your account changed. Please retry before purchasing.');
        }
        let currentOfferingResult;
        try {
          currentOfferingResult = await Purchases.getOfferings();
        } catch (error) {
          throw error;
        }
        const currentOffering = currentOfferingResult.current ?? null;
        const currentProductIds = currentOffering?.availablePackages.map((pkg) => pkg.product.identifier) ?? [];
        setLoadedProductIds(currentProductIds);
        const selectedPackage = packageForPlan(currentOffering, plan);
        if (!selectedPackage) {
          const catalogError = new Error(`The ${plan} plan is not available right now. Please try again later.`);
          throw catalogError;
        }
        try {
          const result = await Purchases.purchasePackage(selectedPackage);
          if (identityState.current.revision !== request.revision) return 'not_active';
          setCustomerInfo(result.customerInfo);
           void recordRevenueCatDiagnostic('purchase', 'purchase-package', 'success', {
             configured: 'true',
             customerMode: 'identified',
             productIds: [selectedPackage.product.identifier],
           });
          return hasVigilProEntitlement(result.customerInfo) ? 'purchased' : 'not_active';
        } catch (purchaseError) {
          if (purchaseWasCancelled(purchaseError)) return 'cancelled';
           void recordRevenueCatDiagnostic('purchase', 'purchase-package', 'error', {
             ...revenueCatErrorDetails(purchaseError),
             configured: 'true',
             customerMode: 'identified',
             productIds: [selectedPackage.product.identifier],
           });
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
          // Restore also needs the correct RevenueCat identity, not a
          // successful pre-existing receipt/customer-info fetch.
           await synchronizeCustomerInQueue(request.userId, false);
        } catch (syncError) {
          const wrappedError = new Error('Your subscription account could not be synchronized. Please retry before restoring purchases.') as Error & { cause?: unknown };
          wrappedError.cause = syncError;
          throw wrappedError;
        }
        if (identityState.current.revision !== request.revision) {
          throw new Error('Your account changed. Please retry before restoring purchases.');
        }
        try {
          const info = await Purchases.restorePurchases();
          if (identityState.current.revision !== request.revision) return false;
          setCustomerInfo(info);
           void recordRevenueCatDiagnostic('restore', 'restore-purchases', 'success', {
             configured: 'true',
             customerMode: 'identified',
           });
          return hasVigilProEntitlement(info);
        } catch (restoreError) {
          if (purchaseWasCancelled(restoreError)) return false;
           void recordRevenueCatDiagnostic('restore', 'restore-purchases', 'error', {
             ...revenueCatErrorDetails(restoreError),
             configured: 'true',
             customerMode: 'identified',
           });
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
  }), [configured, customerInfo, error, isAdmin, isPro, loadedProductIds, loading, monthlyPackage, offering, proOverride, refresh, retry, yearlyPackage, yearlyTrialEligible]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return value;
}