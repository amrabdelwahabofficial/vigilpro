---
name: Clerk password recovery
description: Expo Clerk legacy password recovery uses a reset email code and first-factor attempt.
---

Use the Expo legacy Clerk flow for email/password recovery: create a sign-in attempt with the `reset_password_email_code` strategy, then submit the code and new password through `attemptFirstFactor`. A completed result contains the session that should become active.

**Why:** The installed Clerk Expo resource supports the recovery methods above, while some older examples refer to a `signIn.reset()` helper that is not present in the current typings.

**How to apply:** Keep recovery inside the custom branded auth screen, surface Clerk’s structured error messages, keep the Google OAuth path separate, and keep Vigil’s product password requirement at 8 characters across validation and copy.