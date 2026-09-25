import assert from "node:assert/strict";
import test from "node:test";
import { getClerkPublishableKey, getClerkSecretKey } from "../src/lib/clerkConfig.ts";

const credentialNames = [
  "VIGIL_CLERK_MODE",
  "VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY",
  "VIGIL_EXTERNAL_CLERK_SECRET_KEY",
  "VIGIL_EXTERNAL_CLERK_DEVELOPMENT_PUBLISHABLE_KEY",
  "VIGIL_EXTERNAL_CLERK_DEVELOPMENT_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
];

function preserveEnvironment(run) {
  const original = new Map(credentialNames.map((name) => [name, process.env[name]]));
  try {
    run();
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("API Clerk config uses only external credentials and fails when the selected pair is missing", () => {
  preserveEnvironment(() => {
    process.env.VIGIL_CLERK_MODE = "production";
    process.env.VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY = "external-production-publishable";
    process.env.VIGIL_EXTERNAL_CLERK_SECRET_KEY = "external-production-secret";
    process.env.CLERK_PUBLISHABLE_KEY = "managed-publishable-must-not-be-used";
    process.env.CLERK_SECRET_KEY = "managed-secret-must-not-be-used";

    assert.equal(getClerkPublishableKey(), "external-production-publishable");
    assert.equal(getClerkSecretKey(), "external-production-secret");

    delete process.env.VIGIL_EXTERNAL_CLERK_SECRET_KEY;
    assert.throws(
      () => getClerkSecretKey(),
      /VIGIL_EXTERNAL_CLERK_SECRET_KEY is required/,
    );
  });
});