import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";

const config = loadConfig();
const db = createDb(config.DATABASE_PATH);
const app = buildApp({ config, db });

app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
