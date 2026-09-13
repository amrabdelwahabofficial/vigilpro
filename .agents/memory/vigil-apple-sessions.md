---
name: Vigil Apple sessions
description: Durable security and release constraints for native Sign in with Apple and future platform expansion.
---

Native Apple sign-in must remain independent of Clerk: verify the Apple subject, issuer, audience, expiry, and nonce on the server, exchange and verify the authorization-code identity token against the submitted identity token, and issue an opaque server session keyed by the Apple subject.

**Why:** A native Apple credential is not a Clerk session, and matching by email or trusting a client-provided identity can expose an existing account or financial data.

**How to apply:** Keep Apple refresh-token revocation server-side, keep session and provider transitions explicit, and require Apple signing credentials plus the database schema before treating a release as operational.

Apple private-key secrets may arrive with quoted PEM text, escaped newlines, or base64 wrapping. Normalize and decode those forms before creating the ES256 signing key; a decoder error before the Apple token endpoint indicates local key parsing, not an Apple account problem.

**Why:** Replit secret entry formats can preserve transport quoting or encoding, while Node's crypto decoder accepts only a valid PEM/DER key.

**How to apply:** Keep the normalization server-side and never log the key or its contents. Surface a configuration error instead of a generic failed sign-in.

The Apple Key ID and its matching `.p8` private key must be rotated together. The key ID is metadata outside the private-key material, so secret presence alone cannot prove that a stored `.p8` belongs to a particular Apple key.

**Why:** Updating only the Key ID can pair Apple’s new public key metadata with an old private key and produce the same opaque authorization-code exchange failure.

**How to apply:** Treat `APPLE_SIGN_IN_KEY_ID` and `APPLE_SIGN_IN_PRIVATE_KEY` as one atomic configuration change; keep the Team ID and native client ID unchanged unless Apple’s portal confirms those are wrong.

The current release uses the native iOS App ID registered for the active Vigil App Store app; web Apple sign-in is intentionally not part of the active UI. The server-side Apple session model can support a future Android/web authorization flow without changing the account model.

**Why:** The owner is shipping iOS first and wants native Apple credentials aligned with the active App Store app rather than an unused web/Android identifier.

**How to apply:** Keep the iOS App ID as the active Apple client, keep Apple hidden outside iOS, and defer Services ID setup until Android or web sign-in is actually needed. If multiple client IDs are introduced later, revoke each refresh token with the client ID that minted it.