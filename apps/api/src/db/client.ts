import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";

// Relative to the working directory, which is apps/api for every npm script and in Docker.
const MIGRATIONS_FOLDER = resolve("drizzle");

/**
 * Opens the database and applies any pending migrations.
 *
 * Migrating at startup is fine while there's one server. With several instances on
 * Postgres, run migrations as a separate deploy step instead.
 */
export function createDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  // WAL lets reads continue while a write is in progress.
  sqlite.pragma("journal_mode = WAL");
  // SQLite ignores foreign keys unless this is on, so ON DELETE CASCADE wouldn't work.
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export type Db = ReturnType<typeof createDb>;
