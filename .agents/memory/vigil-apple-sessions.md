---
name: Vigil Apple sessions
description: Durable security and release constraints for native Sign in with Apple and future platform expansion.
---

Native iOS Apple sign-in uses Clerk's Expo-native `useSignInWithApple` hook from `@clerk/expo/apple`; only web Apple uses Clerk's `oauth_apple` OAuth strategy.

**Why:** Clerk's native hook exchanges Apple's identity token through Clerk and creates a normal Clerk session. Sending the web OAuth strategy through the native iOS button is rejected by Clerk and does not provide the native flow.

**How to apply:** Keep the native iOS path on `useSignInWithApple()` followed by `setActive({ session: createdSessionId })`; keep `oauth_apple` isolated to the web `useSSO` branch. Keep the existing bundle ID `com.vigilspend` and Apple capability.

Apple private-key secrets may arrive with quoted PEM text, escaped newlines, or base64 wrapping. Normalize and decode those forms before creating the ES256 signing key; a decoder error before the Apple token endpoint indicates local key parsing, not an Apple account problem.

**Why:** Replit secret entry formats can preserve transport quoting or encoding, while Node's crypto decoder accepts only a valid PEM/DER key.

**How to apply:** Keep the normalization server-side and never log the key or its contents. Surface a configuration error instead of a generic failed sign-in.

The Apple Key ID and its matching `.p8` private key must be rotated together. The key ID is metadata outside the private-key material, so secret presence alone cannot prove that a stored `.p8` belongs to a particular Apple key.

**Why:** Updating only the Key ID can pair Apple’s new public key metadata with an old private key and produce the same opaque authorization-code exchange failure.

**How to apply:** Treat `APPLE_SIGN_IN_KEY_ID` and `APPLE_SIGN_IN_PRIVATE_KEY` as one atomic configuration change; keep the Team ID and native client ID unchanged unless Apple’s portal confirms those are wrong.

The current release uses the native iOS App ID registered for the active Vigil App Store app, while the web UI uses Clerk's browser SSO Apple connection. Replit-managed Clerk keeps Development and Production provider settings separate.

**Why:** Preview uses the Development Clerk instance and returns `form_param_value_invalid` for `oauth_apple` when Apple is not enabled there, before redirect validation begins.

**How to apply:** Enable Apple separately in Clerk Development and Production as needed. Keep native iOS on the native hook; use `useSSO()` with `oauth_apple` only for web. If multiple Apple client IDs are introduced later, revoke each refresh token with the client ID that minted it.