import { randomBytes } from "node:crypto";
import { buildApp, type AppDeps } from "./app.js";
import { loadConfig } from "./config.js";
import { sql } from "drizzle-orm";
import { openDatabase, type Database, type Db } from "./db/client.js";

// One in-memory Postgres (PGlite) per test file, because starting one takes a moment.
// Every test empties it first, so tests never see each other's data.
//
// Set TEST_DATABASE_URL=postgres://… to run the same tests against a real Postgres server
// (CI does). Test files then run one at a time, since they share that database.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "pglite:memory";
let shared: Database | null = null;

export async function emptyTestDatabase(): Promise<Db> {
  shared ??= await openDatabase(TEST_DATABASE_URL);
  await shared.db.execute(sql`truncate table users, sessions, vault_items, subscriptions, billing_checkouts, webhook_events cascade`);
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
