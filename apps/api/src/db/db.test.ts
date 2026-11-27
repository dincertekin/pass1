import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { emptyTestDatabase, TEST_DATABASE_URL } from "../test-helpers.js";
import { openDatabase, type Db } from "./client.js";
import { sessions, users } from "./schema.js";

function newUser(email = "ada@example.com") {
  return {
    id: crypto.randomUUID(),
    email,
    authHash: "argon2-hash",
    kdfSalt: "AAECAwQFBgcICQoLDA0ODw==",
    kdfMemoryKiB: 65536,
    kdfIterations: 3,
    kdfParallelism: 1,
    wrappedVaultKey: { v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" },
  };
}

let db: Db;
beforeEach(async () => {
  db = await emptyTestDatabase();
});

describe("database", () => {
  it("applies migrations and stores a user with defaults", async () => {
    const user = newUser();
    await db.insert(users).values(user);

    const [saved] = await db.select().from(users).where(eq(users.id, user.id));
    expect(saved?.plan).toBe("free");
    expect(saved?.wrappedVaultKey).toEqual(user.wrappedVaultKey);
    expect(saved?.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a second account with the same email", async () => {
    await db.insert(users).values(newUser());
    await expect(db.insert(users).values(newUser())).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("deletes a user's sessions when the user is deleted", async () => {
    const user = newUser();
    await db.insert(users).values(user);
    await db.insert(sessions).values({ id: "token-hash", userId: user.id, expiresAt: new Date(Date.now() + 60_000) });

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe("openDatabase", () => {
  it("refuses an unknown DATABASE_URL instead of guessing", async () => {
    await expect(openDatabase("mysql://localhost/pass1")).rejects.toThrow(/must start with postgres/);
  });
});

// Two API servers starting at the same moment on a database that still needs migrating. Only
// meaningful on a real Postgres server (CI sets TEST_DATABASE_URL); PGlite runs one query at a time.
describe.skipIf(!TEST_DATABASE_URL.startsWith("postgres"))("When Postgres ends a connection", () => {
  it("reports it and keeps working, instead of crashing the server", async () => {
    const lost: Error[] = [];
    const database = await openDatabase(TEST_DATABASE_URL, { onConnectionLost: (error) => lost.push(error) });
    try {
      await database.db.execute(sql`select 1`);
      // What a Postgres restart does to every open connection.
      const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await admin.connect();
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()");
      await admin.end();

      await expect.poll(() => lost.length).toBeGreaterThan(0);
      // The next query reconnects and works.
      expect(await database.db.select({ id: users.id }).from(users).limit(1)).toEqual(expect.any(Array));
    } finally {
      await database.close();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL.startsWith("postgres"))("Several servers starting at once", () => {
  it("migrate one after the other instead of tripping over each other", async () => {
    const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    const name = `pass1_migration_race_${Date.now()}`;
    await admin.query(`create database ${name}`);
    const url = new URL(TEST_DATABASE_URL);
    url.pathname = `/${name}`;
    try {
      const results = await Promise.allSettled([openDatabase(url.href), openDatabase(url.href), openDatabase(url.href)]);
      for (const result of results) if (result.status === "fulfilled") await result.value.close();
      const failures = results.flatMap((result) => (result.status === "rejected" ? [String(result.reason)] : []));
      expect(failures).toEqual([]);
    } finally {
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    }
  });
});
