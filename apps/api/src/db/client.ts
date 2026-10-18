import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
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

/** Both drivers share the same query API, so the rest of the code only sees this. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzlePg(pool, { schema });
    // Fine with one API instance. With several, run migrations as a separate deploy step.
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db: db as unknown as Db, close: () => pool.end() };
  }

  if (url.startsWith("pglite:")) {
    const location = url.slice("pglite:".length);
    let client: PGlite;
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
