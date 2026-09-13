---
name: Vigil offline startup
description: Offline behavior for authenticated local financial data and browser authentication feedback
---

Authenticated users can continue using their locally stored planning, income, history, settings, and cached rates while Clerk is reconnecting. A first-time sign-in cannot work offline, so the browser sign-in screen must explain connection/auth failures inline rather than relying only on native alerts.

**Why:** Financial planning should remain available during travel or intermittent connectivity, while authentication and network-backed features still need an explicit online boundary.

**How to apply:** Preserve account isolation when restoring the cached local session. Keep exchange-rate refresh, AI capture, advisor requests, and subscription operations non-blocking; show clear user-facing status when those services are unavailable.