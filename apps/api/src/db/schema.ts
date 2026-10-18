import { PLAN_IDS, type EncryptedBlob } from "@pass1/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The whole database schema. After changing it, run `npm run db:generate -w @pass1/api`
// to create a migration, and commit the new file in drizzle/.
//
// Moving to Postgres or MySQL later means rewriting this file with pgTable / mysqlTable.
// To keep that easy: IDs are UUID strings, encrypted data is JSON, and nothing here uses
// SQLite-only features.

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
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
  wrappedVaultKey: text("wrapped_vault_key", { mode: "json" }).$type<EncryptedBlob>().notNull(),

  plan: text("plan", { enum: PLAN_IDS }).notNull().default("free"),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 of the session token in the cookie. A database leak gives no usable sessions.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  // "Log out everywhere" and password changes delete all of a user's sessions.
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export const vaultItems = sqliteTable(
  "vault_items",
  {
    // Generated in the browser (it's bound into the ciphertext), checked to be a UUID.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The encrypted item. Name, URL, username, password, notes and favorite are all inside.
    data: text("data", { mode: "json" }).$type<EncryptedBlob>().notNull(),
    // Ciphertext size in bytes, stored so plan limits can be checked with one SUM().
    size: integer("size").notNull(),
    // Goes up by one on every change. Edits must name the revision they're based on.
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    // Set when the item is in the trash. The server knows an item is trashed, nothing more.
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("vault_items_user_id_idx").on(table.userId)],
);

export type VaultItemRow = typeof vaultItems.$inferSelect;
