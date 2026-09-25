import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * These records intentionally contain no Apple ID token, authorization code,
 * or plaintext session token. The refresh token is encrypted so it can be
 * revoked when the account is deleted.
 */
export const vigilAppleAccounts = pgTable(
  "vigil_apple_accounts",
  {
    id: text("id").primaryKey(),
    appleSubject: text("apple_subject").notNull(),
    email: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    proOverride: boolean("pro_override").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("vigil_apple_accounts_subject_unique").on(table.appleSubject),
    index("vigil_apple_accounts_deleted_at_idx").on(table.deletedAt),
  ],
);

export const vigilAppleNonceChallenges = pgTable(
  "vigil_apple_nonce_challenges",
  {
    id: text("id").primaryKey(),
    nonceHash: text("nonce_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("vigil_apple_nonce_challenges_expires_at_idx").on(table.expiresAt)],
);

export const vigilAppleSessions = pgTable(
  "vigil_apple_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => vigilAppleAccounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("vigil_apple_sessions_token_hash_unique").on(table.tokenHash),
    index("vigil_apple_sessions_account_id_idx").on(table.accountId),
    index("vigil_apple_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const vigilAppleRefreshTokens = pgTable(
  "vigil_apple_refresh_tokens",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => vigilAppleAccounts.id, { onDelete: "cascade" }),
    // Nullable for existing native sessions; new sessions always record the
    // Apple client ID used to mint the refresh token.
    clientId: text("client_id"),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("vigil_apple_refresh_tokens_ciphertext_unique").on(table.ciphertext),
    index("vigil_apple_refresh_tokens_account_id_idx").on(table.accountId),
  ],
);

// A fixed number of HMAC-derived buckets makes the shared limiter bounded:
// adversaries cannot create an unbounded row per spoofed address.
export const vigilAppleRateLimits = pgTable("vigil_apple_rate_limits", {
  bucket: integer("bucket").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type VigilAppleAccount = typeof vigilAppleAccounts.$inferSelect;