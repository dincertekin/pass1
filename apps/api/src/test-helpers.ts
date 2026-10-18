import { randomBytes } from "node:crypto";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";

/** A fresh app with its own in-memory database, so tests never share state. */
export async function createTestApp() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_PATH: ":memory:" });
  const db = createDb(config.DATABASE_PATH);
  return { app: await buildApp({ config, db }), db, config };
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
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: registerBody(email), headers: ORIGIN });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const token = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  const userId: string = res.json().user.id;

  const send = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: ORIGIN, cookies: { [SESSION_COOKIE]: token } });
  return { send, userId };
}
