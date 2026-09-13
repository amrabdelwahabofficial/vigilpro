---
name: Vigil feature gating
description: Product boundary between Vigil Free and Vigil Pro.
---

Vigil Free should provide the core habit: manual spending logs, income, read-only bucket planning, recent history, and one starting currency chosen during onboarding. Vigil Pro should provide the full experience: editing bucket allocations, receipt scanning, bank-message uploads, voice notes, changing currency, live exchange rates, country-aware tax depth, complete Analysis insights, and destructive history reset.

**Why:** The premium plan should be meaningful to the product rather than a generic subscription comparison, while the free plan still lets a user understand the core value.

**How to apply:** Keep the Free/Pro comparison synchronized with actual UI gates. New capture modes, edits, destructive actions, currency changes, exchange tools, or advanced reporting should default to Pro unless the product decision explicitly changes this boundary. First-run onboarding and the quick-start tutorial are part of the guest entry flow.

Admin accounts are an explicit testing exception: a Clerk user with `publicMetadata.role` set to `admin` receives Pro access and can use the protected web admin console. Support can also grant a per-user Pro override through Clerk public metadata; this is not a consumer-facing preview switch and does not change Apple billing.

**Why:** Admin testing and customer support need to exercise or restore the real Pro UI while keeping normal customer access tied to RevenueCat entitlements and leaving the billing record untouched.

**How to apply:** Use the signed-in admin account at the app's `/admin` route for user/subscription reporting and Pro testing. A support override is a Clerk `vigilProOverride` flag, should be visible and reversible in the admin user list, and takes effect after the target user's Clerk session refresh.