---
name: Expo GitHub builds
description: Repository linking and monorepo settings required for EAS builds triggered from GitHub.
---

EAS GitHub builds require two separate authorizations: the GitHub App must be installed and linked to the Expo account, and the repository must be connected from the Expo project's own GitHub settings. Replit's GitHub integration alone does not satisfy the project-level link.

**Why:** A valid GitHub repository and a valid Expo connection still produced “No repository found for appId” until the EAS project-to-repository association was present.

**How to apply:** Link the Vigil repository to the Expo project before calling a GitHub-backed build. Because the repository is a monorepo, use `artifacts/vigil-spend` as its base directory; the root `/` does not contain the mobile app's `app.json` or `eas.json`.