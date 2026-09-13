---
name: Vigil iOS publishing
description: The Expo Launch compatibility constraint between Clerk's optional native bridge and React Native's Swift Package integration.
---

Clerk Expo's optional iOS native bridge declares ClerkKit and ClerkKitUI through React Native's Swift Package integration. CocoaPods can omit the corresponding ClerkExpo target before React Native's post-install hook, causing `package_product_dependencies` to be called on nil.

**Why:** The failure occurs during CocoaPods dependency installation before an iOS build or App Store submission starts, so changing Apple credentials or app UI cannot fix it.

**How to apply:** Vigil uses Clerk's JavaScript hooks and browser SSO rather than Clerk's native SwiftUI views. Keep Clerk excluded from iOS native autolinking and native-client synchronization disabled unless native Clerk UI is deliberately adopted later.

Published Expo bundles must forward the managed Clerk proxy URL and gate the app behind Clerk's loaded state. A launch screen that hides before Clerk finishes can otherwise leave the native app on a blank screen.

**Why:** The physical published build can initialize Clerk more slowly or use production proxy routing even when the development preview renders normally.

**How to apply:** Build-time Expo env forwarding must construct `EXPO_PUBLIC_CLERK_PROXY_URL` from the deployment domain and `CLERK_PROXY_URL`; render a visible loading state while `ClerkLoading` is active.

Direct EAS production builds need the Clerk publishable key, RevenueCat iOS public key, production API domain, and Replit project ID configured in the EAS production environment; local Replit variables are not uploaded automatically.

**Why:** EAS reported an empty production environment, which would produce a signed binary unable to load authentication or App Store products even though development worked.

**How to apply:** Before each release, verify the EAS production environment contains the required public app configuration. Apple signing must also be validated once through the interactive EAS credential flow before non-interactive builds can run.

The product keeps Google sign-in and now includes an Apple OAuth button using Clerk's `oauth_apple` strategy. The Apple provider still must be enabled and verified in Clerk Production before submission.

**Why:** Apple review commonly expects Sign in with Apple when a third-party social login is offered, while Google remains part of the product's chosen login set.

**How to apply:** Do not remove Google without an explicit request. Enable Apple under the Clerk Auth pane for both Development and Production, configure the Apple Developer credentials there, and complete a real-device Production sign-in test before App Store submission.