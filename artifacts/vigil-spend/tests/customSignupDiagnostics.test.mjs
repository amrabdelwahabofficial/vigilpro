import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCustomSignup } from '../lib/customSignupDiagnostics.ts';

test('custom signup diagnostics retain lifecycle state without exposing identifiers or credentials', () => {
  const summary = summarizeCustomSignup({
    status: 'missing_requirements',
    missingFields: ['username', 'first_name', 'private@example.com', 'username'],
    createdSessionId: 'sess_private',
    emailAddress: 'private@example.com',
    password: 'never-log-this',
    verifications: {
      emailAddress: {
        status: 'verified',
        strategy: 'email_code',
        code: '123456',
      },
    },
  });

  assert.deepEqual(summary, {
    signupStatus: 'missing_requirements',
    emailVerificationStatus: 'verified',
    missingFields: ['other', 'first_name'],
    createdSessionIdPresent: true,
    verificationStrategy: 'email_code',
  });
  assert.doesNotMatch(JSON.stringify(summary), /private|sess_|never-log-this|123456|@/);
});

test('unknown signup values are bounded and do not enter diagnostics verbatim', () => {
  const summary = summarizeCustomSignup({
    status: 'user@example.com',
    missingFields: ['unrecognized-sensitive-value'],
    createdSessionId: null,
    verifications: {
      emailAddress: { status: 'token-value', strategy: 'secret-value' },
    },
  });

  assert.deepEqual(summary, {
    signupStatus: 'other',
    emailVerificationStatus: 'other',
    missingFields: ['other'],
    createdSessionIdPresent: false,
    verificationStrategy: 'other',
  });
  assert.doesNotMatch(JSON.stringify(summary), /user@example|token-value|secret-value|unrecognized/);
});