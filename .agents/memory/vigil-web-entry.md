---
name: Vigil web entry
description: How the native Expo artifact behaves when visitors open its published root domain.
---

The published Vigil root is served by the Expo artifact’s standalone server, which returns the HTML landing template for browser requests. The React Expo route is useful for development preview routing, but changing it alone does not change the custom domain’s production root.

**Why:** This artifact is a native mobile app with Expo Go manifests rather than a conventional web deployment, so its production server deliberately handles `/` separately from the native bundles.

**How to apply:** When improving the public website experience, update both the Expo web route if needed and the standalone landing template. Always run the production build and publish it before expecting the custom domain to change.