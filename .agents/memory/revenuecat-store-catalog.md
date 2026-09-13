---
name: RevenueCat store catalog
description: Test Store and production store products are separate RevenueCat entities and must both be attached to the offering.
---

RevenueCat’s simulated Test Store products can make browser Preview API Mode work, but they do not satisfy App Store pricing or App Store Connect sync. Production iOS products need their own App Store app association, package attachments, entitlement attachment, and real store pricing configured in App Store Connect.

**Why:** The project had a populated Test Store offering while RevenueCat still reported no products with pricing for the App Store.

**How to apply:** When validating RevenueCat, inspect products by `app_id`, then verify the current offering’s packages include the correct store-specific product for the target platform.

The RevenueCat product response can show `trial_duration: null` for an App Store subscription even when the app copy promises a trial. App Store Connect now confirms the yearly product has a seven-day introductory offer; a Sandbox/TestFlight purchase is still needed to verify account eligibility and checkout behavior.

**Why:** RevenueCat exposes product attachment and store metadata, but Apple controls the introductory-offer configuration used by App Store purchases.

**How to apply:** The yearly paywall may show the confirmed seven-day offer, but keep Apple as the source of truth for eligibility, final price, and whether a specific Apple ID can redeem it.

The app uses a custom native subscription screen and purchases the packages directly. A RevenueCat Paywall UI is optional; the required RevenueCat configuration is the offering with the store-specific monthly and yearly packages.

**Why:** The custom onboarding and subscription modal are the primary purchase flow, while RevenueCatUI is only a fallback when a package cannot be resolved.

**How to apply:** Keep the current offering and package attachments configured, but do not treat creating a RevenueCat Paywall as a prerequisite unless the app is intentionally switching to RevenueCat-hosted paywall UI.

The subscription entry screen should still show the intended monthly and yearly amounts when RevenueCat package data is unavailable, while using live App Store price strings whenever packages resolve.

**Why:** A missing catalog response must not leave users unable to understand what they will be charged before choosing a plan.

**How to apply:** Keep the fallback copy aligned with the configured App Store products, and verify the seven-day yearly introductory offer on a physical TestFlight/Sandbox purchase before launch.

For a production App Store product, the product summary may still show null duration/trial fields while the store-state response contains the authoritative Apple price, availability, title, and introductory-offer configuration. Package links should point at the current product identifiers; legacy products can remain on the entitlement to preserve access for existing subscribers.

**Why:** RevenueCat separates normalized product records, Apple store metadata, package presentation, and entitlement access. Replacing a package link does not require revoking older entitlement associations.

**How to apply:** Inspect store state and package product links separately. Treat `READY_TO_SUBMIT` as an Apple submission state, not as proof that the product is missing, and confirm the trial on a real Sandbox/TestFlight purchase.

RevenueCat can report an App Store product as `WAITING_FOR_REVIEW` with `action_in_progress` while its catalog package links and store pricing are already present.

**Why:** Apple review/synchronization state and RevenueCat package availability are separate signals; the store-state label alone does not identify a client-side offerings failure.

**How to apply:** Keep the package and product links unchanged while investigating, and use release TestFlight `getOfferings()` logs plus a Sandbox purchase to distinguish Apple synchronization from an embedded-key or SDK error.

The iOS SDK key must be the public key belonging to the current RevenueCat App Store app, not merely any `appl_` key from the project. A mismatched key can return invalid-key responses even when the RevenueCat catalog itself looks correct.

**Why:** RevenueCat projects can retain keys from older app configurations, while the mobile build targets one specific App Store app.

**How to apply:** Compare the bundled key against the current App Store app’s public API key without logging its value, then rebuild the app after correcting it.

Apple products can be attached to the RevenueCat offering and still return no prices when their App Store store state is `MISSING_METADATA`. The Replit Publishing sync requires both App Store Connect and In-App Purchase API credentials before Apple metadata is populated.

**Why:** RevenueCat’s catalog configuration and Apple’s product metadata are separate systems; package attachments alone do not make a TestFlight product purchasable.

**How to apply:** Treat `MISSING_METADATA` as the activation blocker, sync through Replit Publishing after TestFlight exists, and only start a real Sandbox purchase after the state changes.

Client public keys, the RevenueCat project ID, and server-side catalog management must all belong to the same RevenueCat account. A new Test Store key can successfully load an offering while an old connected project still controls scripts and catalog audits.

**Why:** RevenueCat public SDK access and management API access are separate credentials and can silently point at different projects.

**How to apply:** When switching accounts, update the client Test Store/iOS keys and rebind the management integration before running catalog mutations or trusting admin metrics.

The current Test Store monthly product uses a capitalized `Vigil_pro_monthly` identifier while the App Store product is lowercase `vigil_pro_monthly`; package matching must keep this distinction.

**Why:** RevenueCat store identifiers are case-sensitive and the Test Store product already exists under the capitalized identifier.

**How to apply:** Keep both store-specific products attached to the current package and accept the existing Test Store spelling without weakening the exact App Store match.