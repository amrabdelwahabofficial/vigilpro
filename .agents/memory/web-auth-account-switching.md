---
name: Web auth account switching
description: The required behavior when a browser already has an active Clerk session and the user opens the sign-in route.
---

The web sign-in route must not automatically redirect away when a Clerk session is already active. It should show the current-session state with a clear way to continue or sign out and use another account.

**Why:** Browser cookies can preserve a previous Clerk account in the preview. An automatic redirect makes account switching appear impossible and leaves the user unable to reach the sign-in controls.

**How to apply:** Keep the explicit account-switch action on the sign-in screen for web and preserve the normal signed-in redirect behavior everywhere else.