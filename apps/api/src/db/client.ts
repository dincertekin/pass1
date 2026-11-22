import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import * as schema from "./schema.js";

// Opens the database named by DATABASE_URL and applies any pending migrations.
//
//   postgres://user:pass@host:5432/pass1   a real Postgres server (production)
//   pglite:./data/pglite                   PGlite, stored in a folder (development)
//   pglite:memory                          PGlite in memory, gone when the process exits (tests)
//
// PGlite is Postgres compiled to WebAssembly, running inside this Node process. It's the same
// SQL dialect as production, with SQLite's convenience: no server to install or start.

// Relative to the working directory, which is apps/api for every npm script and in Docker.
const MIGRATIONS_FOLDER = resolve("drizzle");
// Any fixed number works, as long as nothing else uses it for an advisory lock. Chosen at random.
const MIGRATION_LOCK_ID = 734_190_522;

/** Both drivers share the same query API, so the rest of the code only sees this. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    await migrateOneServerAtATime(pool);
    const db = drizzlePg(pool, { schema });
    return { db: db as unknown as Db, close: () => pool.end() };
  }

  if (url.startsWith("pglite:")) {
    // Loaded only here: PGlite is a development dependency and isn't in the production image.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const { migrate: migratePglite } = await import("drizzle-orm/pglite/migrator");

    const location = url.slice("pglite:".length);
    let client: InstanceType<typeof PGlite>;
    if (location === "memory") {
      client = new PGlite();
    } else {
      mkdirSync(resolve(location), { recursive: true });
      client = new PGlite(resolve(location));
    }
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db: db as unknown as Db, close: () => client.close() };
  }

  throw new Error(`DATABASE_URL must start with postgres://, postgresql:// or pglite: (got "${url.split(":")[0]}:...")`);
}

/**
 * Applies pending migrations while holding a Postgres advisory lock. When several API servers
 * start at once, the others wait, then find nothing left to do. Without the lock they ran the
 * same migrations side by side and all but one crashed at startup (db.test.ts reproduces it).
 * The lock belongs to this one connection, and is released even if a migration fails.
 */
async function migrateOneServerAtATime(pool: pg.Pool) {
  const connection = await pool.connect();
  try {
    await connection.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migratePg(drizzlePg(connection, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await connection.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    connection.release();
  }
}
