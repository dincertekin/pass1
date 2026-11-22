import { PLAN_IDS, type EncryptedBlob } from "@pass1/shared";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// The whole database schema (Postgres). After changing it, run `npm run db:generate -w @pass1/api`
// to create a migration, and commit the new file in drizzle/.
//
// Development and tests run the same schema on PGlite (Postgres compiled to WebAssembly),
// so there's one dialect everywhere and no "works in development, breaks in production" surprises.

/** How a session's token travels: in the web's httpOnly cookie, or as an app's bearer token. */
export const SESSION_TRANSPORTS = ["cookie", "token"] as const;

/** Paddle's subscription statuses (see billing/webhooks.ts for what each means for the plan). */
export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "paused", "canceled"] as const;

function createdAt() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Stored lowercased and trimmed (see emailSchema), so the unique index catches duplicates.
  email: text("email").notNull().unique(),
  // Argon2id hash of the auth key the browser derives. Never the auth key itself.
  authHash: text("auth_hash").notNull(),

  // What the browser needs to derive the same keys again at login.
  kdfSalt: text("kdf_salt").notNull(),
  kdfMemoryKiB: integer("kdf_memory_kib").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  kdfParallelism: integer("kdf_parallelism").notNull(),

  // The random vault key, encrypted with the user's encryption key. Unreadable to the server.
  wrappedVaultKey: jsonb("wrapped_vault_key").$type<EncryptedBlob>().notNull(),

  plan: text("plan", { enum: PLAN_IDS }).notNull().default("free"),
  // Goes up by one on every change to this user's vault, so devices can ask for "everything
  // since version N" (see vault/sync.ts). 0 means the vault has never changed.
  vaultVersion: integer("vault_version").notNull().default(0),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the session token in the cookie. A database leak gives no usable sessions.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    // Shown in Settings → Devices so people can tell their sessions apart.
    userAgent: text("user_agent"),
    // An app's own name for the device, e.g. "Ada's iPhone". Null for the web, which shows the browser instead.
    deviceName: text("device_name"),
    // A session only works the way it was created: a cookie session never as a bearer token, and
    // the other way round (see auth/sessions.ts).
    transport: text("transport", { enum: SESSION_TRANSPORTS }).notNull().default("cookie"),
    // Updated at most every few minutes (see auth/sessions.ts), not on every request.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // "Log out everywhere" and password changes delete all of a user's sessions.
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const vaultItems = pgTable(
  "vault_items",
  {
    // Generated in the browser (it's bound into the ciphertext), checked to be a UUID.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The encrypted item. Name, URL, username, password, notes and favorite are all inside.
    data: jsonb("data").$type<EncryptedBlob>().notNull(),
    // Ciphertext size in bytes, stored so plan limits can be checked with one SUM().
    size: integer("size").notNull(),
    // Goes up by one on every change. Edits must name the revision they're based on.
    revision: integer("revision").notNull().default(1),
    // The user's vaultVersion at this item's latest change. Unique per user, so sync pages
    // never split one version in two. No default: every write must take a new version.
    changeVersion: integer("change_version").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the item is in the trash. The server knows an item is trashed, nothing more.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("vault_items_user_id_idx").on(table.userId),
    uniqueIndex("vault_items_user_change_version_idx").on(table.userId, table.changeVersion),
  ],
);

/**
 * Items deleted forever, so other devices learn to remove them on their next sync.
 * Holds only the random item ID and when (in vault versions) it was deleted.
 */
// TODO: delete rows older than a few months once clients can be told to do a full resync instead.
export const vaultDeletions = pgTable(
  "vault_deletions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    changeVersion: integer("change_version").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("vault_deletions_user_change_version_idx").on(table.userId, table.changeVersion),
  ],
);

/**
 * A user's Paddle subscription, kept up to date by Paddle's webhooks (see billing/webhooks.ts).
 * One row per user: a new subscription after a cancelled one replaces it.
 */
export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paddleSubscriptionId: text("paddle_subscription_id").notNull().unique(),
  paddleCustomerId: text("paddle_customer_id").notNull(),
  plan: text("plan", { enum: PLAN_IDS }).notNull(),
  status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull(),
  interval: text("interval", { enum: ["year", "month"] }).notNull(),
  /** When the current paid period ends (and it renews, unless cancelling). */
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
  /** Set when the subscription is due to end at the end of this period. */
  cancelsAt: timestamp("cancels_at", { withTimezone: true }),
  /** When Paddle created the latest event we applied. Older events arriving late are ignored. */
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which user started which Paddle checkout. Paddle's first subscription event names the
 * transaction it came from, which is how a new subscription finds its user.
 */
export const billingCheckouts = pgTable("billing_checkouts", {
  paddleTransactionId: text("paddle_transaction_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/** Paddle webhook events already applied. Paddle can deliver one more than once. */
export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sign-up puzzles already used, so one solution can't create many accounts.
 * Kept until the challenge would have expired anyway, then deleted (see server.ts).
 */
export const usedChallenges = pgTable("used_challenges", {
  // The challenge's random part. Says nothing about who solved it.
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Every "check your inbox" email sent at sign-up, kept for an hour (see auth/signup.ts).
 * For an email without an account, the row also holds the link's token, as a SHA-256 hash.
 * For an email that already has an account, there's no token: that email only says so.
 * Counting rows per email is what stops anyone using pass1 to flood someone's inbox.
 */
export const signupRequests = pgTable(
  "signup_requests",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("signup_requests_email_idx").on(table.email, table.createdAt)],
);

/**
 * Failed logins per account, shared by every API server (see auth/login-throttle.ts).
 * The email is stored only as a keyed hash (privacy-hash.ts). Rows go after the window ends.
 */
export const loginFailures = pgTable("login_failures", {
  emailHash: text("email_hash").primaryKey(),
  count: integer("count").notNull(),
  since: timestamp("since", { withTimezone: true }).notNull(),
});

/**
 * Requests per IP and route, for rate limits shared by every API server (see rate-limit-store.ts).
 * The key holds the route and a keyed hash of the IP, never the IP itself.
 */
export const rateLimitCounters = pgTable("rate_limit_counters", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VaultItemRow = typeof vaultItems.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
