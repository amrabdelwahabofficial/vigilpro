---
name: Vigil mobile billing
description: Platform decision for RevenueCat billing in the Vigil app.
---

Vigil is an Expo/React Native mobile app. RevenueCat integration belongs in `react-native-purchases` and `react-native-purchases-ui`; a Swift Package Manager dependency is for a separate native SwiftUI app and should not be added to this artifact.

**Why:** Adding a Swift package to the Expo workspace would not be consumed by the JavaScript app or its Expo build, while the React Native SDK supports the current product and preview workflow.

**How to apply:** Keep offerings, customer info, entitlement checks, purchases, Paywall, and Customer Center behind the existing subscription context. Use the RevenueCat dashboard/App Store Connect for product and trial metadata.