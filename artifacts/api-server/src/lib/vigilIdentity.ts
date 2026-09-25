import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, hkdfSync, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import { pool } from "@workspace/db";
import { verifyToken } from "@clerk/backend";
import type { Request, Response } from "express";
import { getClerkSecretKey } from "./clerkConfig.ts";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_SECONDS = 60;
const APPLE_TOKEN_MAX_AGE_SECONDS = 10 * 60;
export const APPLE_WEB_STATE_COOKIE = "vigil_apple_web_state";

type AppleJwk = { kid?: string; kty?: string; n?: string; e?: string; alg?: string; use?: string };
type AppleClaims = { iss?: unknown; aud?: unknown; sub?: unknown; nonce?: unknown; exp?: unknown; iat?: unknown; email?: unknown };

export type VigilIdentity = {
  userId: string;
  provider: "apple" | "clerk";
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  proOverride: boolean;
};

type AppleServerConfig = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  encryptionKey: Buffer;
};

let jwksCache: { keys: AppleJwk[]; expiresAt: number } | null = null;

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function opaqueTokenHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function ids(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function requiredString(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizeApplePrivateKey(value: string) {
  let normalized = value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .replace(/\\r?\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
  normalized = normalized.replace(/^```(?:pem)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const pem = normalized.match(/-----BEGIN ([^-]+?)-----([\s\S]*?)-----END \1-----/);
  if (pem) {
    const body = pem[2].replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g);
    if (lines?.length) {
      return `-----BEGIN ${pem[1].trim()}-----\n${lines.join("\n")}\n-----END ${pem[1].trim()}-----`;
    }
  }
  return normalized;
}

export function normalizeAppleEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized && normalized.length <= 320 && normalized.includes("@") ? normalized : null;
}

function appleServerConfig(clientIdOverride?: string): AppleServerConfig {
  const sessionSecret = requiredString("SESSION_SECRET");
  // Derive an encryption key with a purpose-bound HKDF rather than reusing the
  // session secret directly. No token can be decrypted with another use of it.
  const encryptionKey = Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(sessionSecret, "utf8"),
    Buffer.from("vigil.apple.refresh-token.salt.v1", "utf8"),
    Buffer.from("vigil.apple.refresh-token.encryption.v1", "utf8"),
    32,
  ));
  return {
    clientId: clientIdOverride?.trim() || process.env.APPLE_SIGN_IN_CLIENT_ID?.trim() || "com.vigilspend",
    teamId: requiredString("APPLE_SIGN_IN_TEAM_ID"),
    keyId: requiredString("APPLE_SIGN_IN_KEY_ID"),
    privateKey: normalizeApplePrivateKey(requiredString("APPLE_SIGN_IN_PRIVATE_KEY")),
    encryptionKey,
  };
}

function appleWebConfig() {
  const clientId = requiredString("APPLE_SIGN_IN_WEB_CLIENT_ID");
  const redirectUri = requiredString("APPLE_SIGN_IN_WEB_REDIRECT_URI");
  return { clientId, redirectUri };
}

export function getAppleWebConfig() {
  return appleWebConfig();
}

export function appleWebSignInConfigured() {
  try {
    if (!appleSigningKeyConfigured()) return false;
    appleWebConfig();
    return true;
  } catch {
    return false;
  }
}

export function appleNonceDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function appleWebAuthorizationUrl(challenge: { challengeId: string; nonce: string }) {
  const { clientId, redirectUri } = appleWebConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state: challenge.challengeId,
    nonce: appleNonceDigest(challenge.nonce),
  });
  return `${APPLE_ISSUER}/auth/authorize?${query.toString()}`;
}

export function appleSignInConfigured() {
  try {
    return appleSigningKeyConfigured();
  } catch {
    return false;
  }
}

function responseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/not configured|must be/.test(message)) {
    return "Sign in with Apple is not configured for this build. Please use email or Google.";
  }
  if (/identity token claims were rejected/i.test(message)) {
    return "Apple rejected this app identity. This build must use the existing App Store app identifier.";
  }
  if (/authorization code exchange failed/i.test(message)) {
    return "Apple could not complete the sign-in exchange. The Sign in with Apple key must belong to the existing App Store app identifier.";
  }
  if (/Apple signing key could not be decoded|DECODER routines|unsupported/i.test(message)) {
    return "Apple sign-in is configured with an unreadable signing key. Check the Apple private key format in the app's secure environment.";
  }
  if (/Apple did not provide an email/i.test(message)) {
    return "Apple did not return an email for this account. Please try again so Vigil can securely create your account.";
  }
  if (/challenge is expired|already used/i.test(message)) {
    return "The Apple sign-in request expired. Please try again.";
  }
  return "Apple sign-in could not be completed. Please try again.";
}

export function appleErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const details: { name: string; message: string; code?: string } = {
      name: error.name,
      message: error.message,
    };
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string" && code.length <= 120) details.code = code;
    return details;
  }
  return { message: typeof error === "string" ? error.slice(0, 240) : "Unknown Apple sign-in error" };
}

function createApplePrivateKey(privateKey: string) {
  try {
    return createPrivateKey(privateKey);
  } catch {
    const compact = privateKey.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 100) {
      throw new Error("Apple signing key could not be decoded");
    }
    const decoded = Buffer.from(compact, "base64");
    const decodedText = decoded.toString("utf8");
    if (decodedText.includes("BEGIN PRIVATE KEY")) {
      return createPrivateKey(normalizeApplePrivateKey(decodedText));
    }
    try {
      return createPrivateKey({ key: decoded, format: "der", type: "pkcs8" });
    } catch {
      throw new Error("Apple signing key could not be decoded");
    }
  }
}

function appleSigningKeyConfigured() {
  try {
    const config = appleServerConfig();
    createApplePrivateKey(config.privateKey);
    return true;
  } catch (error) {
    console.warn({ error: appleErrorDetails(error) }, "Apple signing key configuration rejected");
    return false;
  }
}

async function appleJwks(forceRefresh = false) {
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(APPLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Apple signing keys are unavailable");
  const body = await response.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error("Apple signing keys are invalid");
  const keys = body.keys.filter((key): key is AppleJwk =>
    !!key && typeof key === "object" && (key as AppleJwk).kty === "RSA"
      && typeof (key as AppleJwk).kid === "string"
      && typeof (key as AppleJwk).n === "string"
      && typeof (key as AppleJwk).e === "string",
  );
  if (!keys.length) throw new Error("Apple signing keys are invalid");
  jwksCache = { keys, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return keys;
}

function decodeJson(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

function equals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyAppleIdentityToken(identityToken: string, expectedNonceHash: string, config: AppleServerConfig) {
  const parts = identityToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Malformed Apple identity token");
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]) as AppleClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported Apple identity token");
  let key = (await appleJwks()).find((item) => item.kid === header.kid);
  if (!key) key = (await appleJwks(true)).find((item) => item.kid === header.kid);
  if (!key) throw new Error("Unknown Apple signing key");
  const signatureValid = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
    createPublicKey({ key, format: "jwk" }),
    Buffer.from(parts[2], "base64url"),
  );
  if (!signatureValid) throw new Error("Invalid Apple identity token signature");

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== APPLE_ISSUER
    || claims.aud !== config.clientId
    || typeof claims.sub !== "string"
    || !claims.sub
    || typeof claims.nonce !== "string"
    || !equals(claims.nonce, expectedNonceHash)
    || typeof claims.exp !== "number"
    || claims.exp <= now - MAX_CLOCK_SKEW_SECONDS
    || typeof claims.iat !== "number"
    || claims.iat > now + MAX_CLOCK_SKEW_SECONDS
    || claims.iat < now - APPLE_TOKEN_MAX_AGE_SECONDS
  ) {
    throw new Error("Apple identity token claims were rejected");
  }
  return {
    appleSubject: claims.sub,
    email: normalizeAppleEmail(claims.email),
  };
}

function createAppleClientSecret(config: AppleServerConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: config.teamId,
    iat: now,
    exp: now + 5 * 60,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  }));
  const data = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(data), {
    key: createApplePrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${data}.${base64Url(signature)}`;
}

async function exchangeAuthorizationCode(authorizationCode: string, config: AppleServerConfig, redirectUri?: string) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: createAppleClientSecret(config),
    code: authorizationCode,
    grant_type: "authorization_code",
  });
  if (redirectUri) body.set("redirect_uri", redirectUri);
  const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => null) as {
    refresh_token?: unknown;
    id_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;
  if (!response.ok || !data || typeof data.refresh_token !== "string" || !data.refresh_token || typeof data.id_token !== "string" || !data.id_token) {
    const providerError = typeof data?.error === "string" ? data.error : "";
    const providerDescription = typeof data?.error_description === "string" ? data.error_description : "";
    const suffix = [providerError, providerDescription].filter(Boolean).join(": ").slice(0, 240);
    throw new Error(`Apple authorization code exchange failed${suffix ? ` (${suffix})` : ""}`);
  }
  return { refreshToken: data.refresh_token, identityToken: data.id_token };
}

function encryptRefreshToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${base64Url(iv)}.${base64Url(cipher.getAuthTag())}.${base64Url(ciphertext)}`;
}

function decryptRefreshToken(value: string, key: Buffer) {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Stored Apple refresh token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function revokeAppleRefreshToken(refreshToken: string, config: AppleServerConfig) {
  const response = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: createAppleClientSecret(config),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Apple token revocation failed");
}

function requestIp(req: Request) {
  // Express only honors X-Forwarded-For after app.ts explicitly configures the
  // number of trusted proxies; clients cannot opt themselves into that trust.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export async function allowAppleAuthRequest(req: Request, res: Response) {
  const limiterSecret = requiredString("SESSION_SECRET");
  // The address is HMACed and mapped to one of 4096 rows. This is shared
  // across instances and has a strict storage bound, while collisions only
  // make throttling more conservative.
  const digest = createHmac("sha256", limiterSecret).update(requestIp(req)).digest();
  const bucket = digest.readUInt16BE(0) % 4096;
  const result = await pool.query<{ request_count: number; window_started_at: Date }>(
    `INSERT INTO vigil_apple_rate_limits (bucket, window_started_at, request_count, updated_at)
     VALUES ($1, NOW(), 1, NOW())
     ON CONFLICT (bucket) DO UPDATE SET
       request_count = CASE
         WHEN vigil_apple_rate_limits.window_started_at <= NOW() - INTERVAL '1 minute' THEN 1
         ELSE vigil_apple_rate_limits.request_count + 1
       END,
       window_started_at = CASE
         WHEN vigil_apple_rate_limits.window_started_at <= NOW() - INTERVAL '1 minute' THEN NOW()
         ELSE vigil_apple_rate_limits.window_started_at
       END,
       updated_at = NOW()
     RETURNING request_count, window_started_at`,
    [bucket],
  );
  const row = result.rows[0];
  if (row && row.request_count <= 12) return true;
  res.setHeader("Retry-After", "60");
  res.status(429).json({ message: "Too many Apple sign-in attempts. Please wait and try again." });
  return false;
}

export async function issueAppleNonceChallenge() {
  // Expo forwards its nonce unchanged to ASAuthorizationAppleIDRequest. The
  // client SHA-256 hashes this raw value before calling Expo; only that digest
  // is stored and compared with Apple's identity-token nonce claim.
  const nonce = ids(32);
  const id = ids(24);
  void pool.query("DELETE FROM vigil_apple_nonce_challenges WHERE expires_at <= NOW()").catch(() => undefined);
  await pool.query(
    "INSERT INTO vigil_apple_nonce_challenges (id, nonce_hash, expires_at) VALUES ($1, $2, $3)",
    [id, opaqueTokenHash(nonce), new Date(Date.now() + CHALLENGE_TTL_MS)],
  );
  return { challengeId: id, nonce };
}

async function consumeAppleNonceChallenge(challengeId: string) {
  const result = await pool.query<{ nonce_hash: string }>(
    "DELETE FROM vigil_apple_nonce_challenges WHERE id = $1 AND expires_at > NOW() RETURNING nonce_hash",
    [challengeId],
  );
  return result.rows[0]?.nonce_hash ?? null;
}

export async function completeAppleSignIn(input: { challengeId: string; identityToken: string; authorizationCode: string; clientId?: string; redirectUri?: string; fullName?: { givenName?: unknown; familyName?: unknown } }) {
  const config = appleServerConfig(input.clientId);
  const nonceHash = await consumeAppleNonceChallenge(input.challengeId);
  if (!nonceHash) throw new Error("Apple sign-in challenge is expired or was already used");
  const identity = await verifyAppleIdentityToken(input.identityToken, nonceHash, config);
  const accountId = `apple_${ids(24)}`;
  const firstName = typeof input.fullName?.givenName === "string" ? input.fullName.givenName.trim().slice(0, 80) || null : null;
  const lastName = typeof input.fullName?.familyName === "string" ? input.fullName.familyName.trim().slice(0, 80) || null : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize first-time account creation as well as existing-account login.
    // The advisory lock is scoped to this transaction and Apple subject only.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [identity.appleSubject]);
    const existing = await client.query<{ id: string; deleted_at: Date | null; first_name: string | null; last_name: string | null; email: string | null }>(
      "SELECT id, deleted_at, first_name, last_name, email FROM vigil_apple_accounts WHERE apple_subject = $1 FOR UPDATE",
      [identity.appleSubject],
    );
    let account = existing.rows[0];
    if (account?.deleted_at) throw new Error("This Apple account was deleted and cannot be reactivated");
    // Keep the subject's row locked through the code exchange. A concurrent
    // deletion therefore either revokes this newly issued refresh token or the
    // login sees deleted_at and cannot resurrect the account.
    const exchanged = await exchangeAuthorizationCode(input.authorizationCode, config, input.redirectUri);
    const exchangedIdentity = await verifyAppleIdentityToken(exchanged.identityToken, nonceHash, config);
    if (!equals(identity.appleSubject, exchangedIdentity.appleSubject)) {
      throw new Error("Apple authorization response did not match its identity token");
    }
    const verifiedEmail = identity.email ?? exchangedIdentity.email;
    // Apple may omit the email claim after first authorization. A new account
    // must still have the provider-issued email before any user data is stored.
    // Existing accounts keep their previously verified email when Apple omits
    // it on a later sign-in.
    const accountEmail = account?.email ?? verifiedEmail;
    if (!accountEmail) throw new Error("Apple did not provide an email for this account");
    const encryptedRefreshToken = encryptRefreshToken(exchanged.refreshToken, config.encryptionKey);
    if (!account) {
      await client.query(
        "INSERT INTO vigil_apple_accounts (id, apple_subject, email, first_name, last_name) VALUES ($1, $2, $3, $4, $5)",
        [accountId, identity.appleSubject, accountEmail, firstName, lastName],
      );
      account = { id: accountId, deleted_at: null, first_name: firstName, last_name: lastName, email: accountEmail };
    } else {
      await client.query(
        "UPDATE vigil_apple_accounts SET email = COALESCE(email, $1), first_name = COALESCE(first_name, $2), last_name = COALESCE(last_name, $3), updated_at = NOW() WHERE id = $4",
        [verifiedEmail, firstName, lastName, account.id],
      );
      account = { ...account, email: accountEmail };
    }
    await client.query(
      "INSERT INTO vigil_apple_refresh_tokens (id, account_id, client_id, ciphertext) VALUES ($1, $2, $3, $4)",
      [`apr_${ids(24)}`, account.id, config.clientId, encryptedRefreshToken],
    );
    const sessionToken = ids(32);
    await client.query(
      "INSERT INTO vigil_apple_sessions (id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
      [`aps_${ids(24)}`, account.id, opaqueTokenHash(sessionToken), new Date(Date.now() + SESSION_TTL_MS)],
    );
    await client.query("COMMIT");
    return {
      sessionToken,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      identity: {
        userId: account.id,
        provider: "apple" as const,
        email: account.email,
        displayName: [account.first_name ?? firstName, account.last_name ?? lastName].filter(Boolean).join(" ") || null,
        isAdmin: false,
        proOverride: false,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateVigilRequest(req: Request, res: Response): Promise<VigilIdentity | null> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  if (!token.includes(".")) {
    const session = await pool.query<{ id: string; account_id: string; email: string | null; first_name: string | null; last_name: string | null; pro_override: boolean }>(
      `SELECT s.id, a.id AS account_id, a.email, a.first_name, a.last_name, a.pro_override
       FROM vigil_apple_sessions s
       JOIN vigil_apple_accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() AND a.deleted_at IS NULL`,
      [opaqueTokenHash(token)],
    );
    const row = session.rows[0];
    if (!row) {
      res.status(401).json({ message: "Invalid or expired session" });
      return null;
    }
    void pool.query("UPDATE vigil_apple_sessions SET last_seen_at = NOW() WHERE id = $1", [row.id]).catch(() => undefined);
    return {
      userId: row.account_id,
      provider: "apple",
      email: row.email,
      displayName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
      isAdmin: false,
      proOverride: row.pro_override === true,
    };
  }
  try {
    const payload = await verifyToken(token, { secretKey: getClerkSecretKey() });
    return { userId: payload.sub, provider: "clerk", email: null, displayName: null, isAdmin: false, proOverride: false };
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
    return null;
  }
}

export async function signOutAppleSession(token: string) {
  await pool.query("UPDATE vigil_apple_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL", [opaqueTokenHash(token)]);
}

export async function deleteAppleAccountById(accountId: string) {
  const config = appleServerConfig();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ id: string }>(
      "SELECT id FROM vigil_apple_accounts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [accountId],
    );
    if (!account.rows[0]) throw new Error("Account not found");
    const refreshTokens = await client.query<{ id: string; client_id: string | null; ciphertext: string }>(
      "SELECT id, client_id, ciphertext FROM vigil_apple_refresh_tokens WHERE account_id = $1 AND revoked_at IS NULL FOR UPDATE",
      [accountId],
    );
    await client.query("DELETE FROM vigil_support_requests WHERE user_id = $1", [accountId]);
    for (const token of refreshTokens.rows) {
      const tokenConfig = token.client_id ? appleServerConfig(token.client_id) : config;
      await revokeAppleRefreshToken(decryptRefreshToken(token.ciphertext, config.encryptionKey), tokenConfig);
      await client.query("UPDATE vigil_apple_refresh_tokens SET revoked_at = NOW() WHERE id = $1", [token.id]);
    }
    await client.query("UPDATE vigil_apple_sessions SET revoked_at = NOW() WHERE account_id = $1 AND revoked_at IS NULL", [accountId]);
    await client.query("UPDATE vigil_apple_accounts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL", [accountId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAppleAccount(identity: VigilIdentity) {
  if (identity.provider !== "apple") throw new Error("This account is managed by Clerk");
  await deleteAppleAccountById(identity.userId);
}

export function appleAuthFailure(res: Response, error: unknown) {
  res.status(400).json({ message: responseMessage(error) });
}