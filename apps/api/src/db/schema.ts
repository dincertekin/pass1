import { PLAN_IDS, type EncryptedBlob } from "@pass1/shared";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The whole database schema (Postgres). After changing it, run `npm run db:generate -w @pass1/api`
// to create a migration, and commit the new file in drizzle/.
//
// Development and tests run the same schema on PGlite (Postgres compiled to WebAssembly),
// so there's one dialect everywhere and no "works in development, breaks in production" surprises.

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
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the item is in the trash. The server knows an item is trashed, nothing more.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("vault_items_user_id_idx").on(table.userId)],
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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VaultItemRow = typeof vaultItems.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
