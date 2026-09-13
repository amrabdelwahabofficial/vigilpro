---
name: Clerk signup profile fields
description: Managed Clerk credential signup accepts the email/password identity before profile names are saved.
---

Managed Clerk can reject first_name/last_name when they are included in the initial mobile credential signup request, even though the user profile supports those fields. Create the account with email and password first, activate the session, then update the profile through an authenticated server-side Clerk call.

**Why:** The managed tenant returned an invalid-parameter error for the profile field during TestFlight signup.

**How to apply:** Keep email as the identity and treat first/last name as a post-signup profile update. Persist the entered first name in account-scoped local state during the auth-to-onboarding transition because the Clerk mobile user object may lag behind the server update. Do not assume duplicate display names conflict; Clerk uniqueness belongs to the verified email identity.