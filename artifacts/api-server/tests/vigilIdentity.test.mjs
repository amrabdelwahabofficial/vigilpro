import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppleEmail, opaqueTokenHash } from "../src/lib/vigilIdentity.ts";

test("opaque Apple sessions are stored as one-way SHA-256 hashes", () => {
  const token = "a-device-only-opaque-session-token";
  const hashed = opaqueTokenHash(token);

  assert.notEqual(hashed, token);
  assert.match(hashed, /^[a-f0-9]{64}$/);
  assert.equal(opaqueTokenHash(token), hashed);
  assert.notEqual(opaqueTokenHash(`${token}x`), hashed);
});

test("Apple account emails are normalized independently from display names", () => {
  assert.equal(normalizeAppleEmail("  Person@PrivateRelay.Example  "), "person@privaterelay.example");
  assert.equal(normalizeAppleEmail(""), null);
  assert.equal(normalizeAppleEmail("Not an email"), null);
  assert.equal(normalizeAppleEmail(null), null);
});
