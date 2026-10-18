import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/client.js";

const config = loadConfig();
const { db, close } = await openDatabase(config.DATABASE_URL);
const app = await buildApp({ config, db });

app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Docker sends SIGTERM on stop: finish in-flight requests, then close the database cleanly.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    await app.close();
    await close();
    process.exit(0);
  });
}
