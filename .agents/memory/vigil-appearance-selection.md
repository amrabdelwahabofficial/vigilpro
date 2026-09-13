---
name: Vigil appearance selection
description: New-account appearance choices must cross the Clerk sign-up boundary before account-scoped state loads.
---

When a user chooses Light, Dark, or Auto before completing Clerk sign-up, carry the choice into onboarding through the auth navigation parameters and apply it after the authenticated account state hydrates.

**Why:** The app resets local state while switching from the signed-out scope to the new Clerk user scope, so a theme set only in the sign-up screen can otherwise be lost.

**How to apply:** Reuse the existing ThemeMode values and onboarding controls, and validate incoming appearance parameters before applying them.