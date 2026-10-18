import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";

/** A fresh app with its own in-memory database, so tests never share state. */
export async function createTestApp() {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_PATH: ":memory:" });
  const db = createDb(config.DATABASE_PATH);
  return { app: await buildApp({ config, db }), db, config };
}
