export type CustomSignupDiagnosticSummary = {
  signupStatus: string;
  emailVerificationStatus: string;
  missingFields: string[];
  createdSessionIdPresent: boolean;
  verificationStrategy: string;
};

const signupStatuses = new Set(['missing_requirements', 'complete', 'abandoned']);
const emailVerificationStatuses = new Set([
  'unverified',
  'verified',
  'failed',
  'expired',
  'transferable',
  'pending',
  'not_started',
]);
const verificationStrategies = new Set(['email_code', 'email_link']);
const signupFields = new Set([
  'first_name',
  'last_name',
  'email_address',
  'phone_number',
  'legal_accepted',
  'web3_wallet',
  'external_account',
  'protect_check',
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function allowedValue(value: unknown, allowed: Set<string>): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : 'other';
}

function safeMissingFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((field): field is string => typeof field === 'string')
    .map((field) => allowedValue(field, signupFields))
    .filter((field) => field !== 'unknown'))].slice(0, 12);
}

export function summarizeCustomSignup(result: unknown): CustomSignupDiagnosticSummary {
  const candidate = record(result);
  const emailVerification = record(record(candidate.verifications).emailAddress);
  const createdSessionId = candidate.createdSessionId;

  return {
    signupStatus: allowedValue(candidate.status, signupStatuses),
    emailVerificationStatus: allowedValue(emailVerification.status, emailVerificationStatuses),
    missingFields: safeMissingFields(candidate.missingFields),
    createdSessionIdPresent: typeof createdSessionId === 'string' && createdSessionId.length > 0,
    verificationStrategy: allowedValue(emailVerification.strategy, verificationStrategies),
  };
}