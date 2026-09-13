---
name: Vigil AI advisor
description: Authentication and provider boundary for the in-app Financial Advisor.
---

The in-app Financial Advisor uses the Replit-managed OpenAI integration from the API server. The native client sends a Clerk bearer token and a small local spending snapshot; it never receives or stores an AI provider key.

**Why:** The app is a native client, so putting provider credentials in the bundle would expose them. Keeping the call server-side also gives the advisor a clear place for authentication, response limits, and safety instructions.

**How to apply:** Any future advisor features should extend the authenticated `/api/vigil/advisor` boundary and preserve concise, non-regulated financial guidance. Do not move the OpenAI client into Expo code.