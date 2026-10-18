import Fastify from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";

export interface AppDeps {
  config: Config;
  db: Db;
}

export function buildApp({ config }: AppDeps) {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            // Never log request bodies: they carry auth keys and encrypted vault data.
            serializers: {
              req: (req) => ({ method: req.method, url: req.url }),
            },
          },
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Phase 1: POST /auth/prelogin, /auth/register, /auth/login, /auth/logout, GET /auth/me
  // Phase 3: GET/POST/PUT/DELETE /vault/items

  return app;
}
