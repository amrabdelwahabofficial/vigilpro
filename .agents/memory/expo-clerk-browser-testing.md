---
name: Expo Clerk browser testing
description: Limitation affecting automated authenticated browser tests on managed Expo preview hosts.
---

Automated Clerk session handshakes created for Replit's shared development host cannot currently be transferred to the separate managed Expo preview hostname.

**Why:** The generated handshake remains scoped to the shared host; rewriting it for the Expo origin routes the handshake path through Expo Router instead of authenticating the session.

**How to apply:** Treat unauthenticated Expo web rendering as automatable, but verify authenticated Clerk journeys on a physical development/TestFlight build until the testing environment supports the managed Expo origin.