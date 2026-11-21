import { randomBytes } from "node:crypto";
import { buildApp, type AppDeps } from "./app.js";
import { loadConfig } from "./config.js";
import { eq, sql } from "drizzle-orm";
import { openDatabase, type Database, type Db } from "./db/client.js";
import { users, vaultItems } from "./db/schema.js";

// One in-memory Postgres (PGlite) per test file, because starting one takes a moment.
// Every test empties it first, so tests never see each other's data.
//
// Set TEST_DATABASE_URL=postgres://… to run the same tests against a real Postgres server
// (CI does). Test files then run one at a time, since they share that database.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "pglite:memory";
let shared: Database | null = null;

export async function emptyTestDatabase(): Promise<Db> {
  shared ??= await openDatabase(TEST_DATABASE_URL);
  await shared.db.execute(sql`truncate table users, sessions, vault_items, vault_deletions, subscriptions, billing_checkouts, webhook_events cascade`);
  return shared.db;
}

/** A fresh app on an empty database. `deps` swaps in fakes, e.g. a Paddle client. */
export async function createTestApp(env: Record<string, string> = {}, deps: Partial<AppDeps> = {}) {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, ...env });
  const db = await emptyTestDatabase();
  return { app: await buildApp({ config, db, ...deps }), db, config };
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>["app"];

export const ORIGIN = { origin: "http://localhost:5173" };
export const SESSION_COOKIE = "pass1_session";

// The server can't tell real key material from random bytes, so tests use random bytes
// of the right sizes. That keeps them fast.
export const b64 = (bytes: number) => randomBytes(bytes).toString("base64");

export function registerBody(email = "ada@example.com", authKey = b64(32)) {
  return {
    email,
    authKey,
    kdfSalt: b64(16),
    kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 },
    wrappedVaultKey: { v: 1, iv: b64(12), ciphertext: b64(48) },
  };
}

/** Registers a user and returns a function that sends requests as them. */
export async function loggedInAs(app: TestApp, email = "ada@example.com") {
  const body = registerBody(email);
  const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: body, headers: ORIGIN });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const token = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  const userId: string = res.json().user.id;

  const send = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: ORIGIN, cookies: { [SESSION_COOKIE]: token } });
  return { send, userId, token, authKey: body.authKey };
}

/** A random encrypted blob of the right shape. Input: ciphertext bytes. */
export const testBlob = (bytes = 272) => ({ v: 1 as const, iv: b64(12), ciphertext: b64(bytes) });

/**
 * Inserts items straight into the database, for tests that need hundreds of them.
 * Input: the owner, how many, and the size each counts against the plan.
 * Gives each item the next vault version, like a real write, so sync sees them.
 */
export async function insertItemsDirectly(db: Db, userId: string, count: number, size = 272) {
  const [user] = await db
    .update(users)
    .set({ vaultVersion: sql`${users.vaultVersion} + ${count}` })
    .where(eq(users.id, userId))
    .returning({ vaultVersion: users.vaultVersion });
  const firstVersion = user!.vaultVersion - count + 1;
  const now = new Date();
  const rows = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    userId,
    data: testBlob(),
    size,
    changeVersion: firstVersion + index,
    createdAt: now,
    updatedAt: now,
  }));
  await db.insert(vaultItems).values(rows);
}

type Send = Awaited<ReturnType<typeof loggedInAs>>["send"];

/** Follows sync pages until the end. Output: every item in the vault, the trash included. */
export async function fetchWholeVault(send: Send) {
  const items = [];
  let since = 0;
  for (;;) {
    const page = (await send("GET", `/api/vault/items?since=${since}`)).json();
    items.push(...page.items);
    since = page.version;
    if (!page.hasMore) return items;
  }
}
