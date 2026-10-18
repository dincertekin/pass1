import { PLAN_IDS, type EncryptedBlob } from "@pass1/shared";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The whole database schema (Postgres). After changing it, run `npm run db:generate -w @pass1/api`
// to create a migration, and commit the new file in drizzle/.
//
// Development and tests run the same schema on PGlite (Postgres compiled to WebAssembly),
// so there's one dialect everywhere and no "works in development, breaks in production" surprises.

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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type VaultItemRow = typeof vaultItems.$inferSelect;
