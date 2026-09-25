'use strict';

const PRODUCTION_DOMAIN = 'vigilspend.com';
const PRODUCTION_CLERK_HOST = 'clerk.vigilspend.com';

function parseProductionDomain(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Production Clerk builds require EXPO_PUBLIC_DOMAIN=vigilspend.com.');
  }

  let parsed;
  try {
    const candidate = value.trim();
    parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    throw new Error('Production Clerk builds require a valid HTTPS Vigil Spend domain.');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.host.toLowerCase() !== PRODUCTION_DOMAIN
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Production Clerk builds must use https://vigilspend.com.');
  }

  return PRODUCTION_DOMAIN;
}

function parseProductionClerkHost(publishableKey) {
  if (typeof publishableKey !== 'string') {
    throw new Error('The external Clerk Production publishable key is required.');
  }

  const match = /^pk_live_([A-Za-z0-9_-]+)$/.exec(publishableKey.trim());
  if (!match) {
    throw new Error('The external Clerk Production publishable key must be a valid live key.');
  }

  let frontendApi;
  try {
    frontendApi = Buffer.from(match[1], 'base64url').toString('utf8').replace(/\$$/, '');
    const candidate = /^https?:\/\//i.test(frontendApi) ? frontendApi : `https://${frontendApi}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('Invalid Clerk frontend API URL.');
    }
    return parsed.hostname.toLowerCase();
  } catch {
    throw new Error('The external Clerk Production publishable key has an invalid frontend host.');
  }
}

function resolveProductionClerkBuildConfig(env) {
  const domain = parseProductionDomain(env?.EXPO_PUBLIC_DOMAIN);
  const publishableKey = env?.VIGIL_EXTERNAL_CLERK_PUBLISHABLE_KEY;
  if (typeof publishableKey !== 'string' || !publishableKey.trim()) {
    throw new Error('The external Clerk Production publishable key is required.');
  }

  const clerkHost = parseProductionClerkHost(publishableKey);
  if (clerkHost !== PRODUCTION_CLERK_HOST) {
    throw new Error('Production Clerk builds must resolve to clerk.vigilspend.com.');
  }

  return { domain, clerkHost };
}

module.exports = {
  PRODUCTION_DOMAIN,
  PRODUCTION_CLERK_HOST,
  resolveProductionClerkBuildConfig,
};