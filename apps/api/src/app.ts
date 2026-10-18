import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { accountRoutes } from "./account/routes.js";
import { authRoutes } from "./auth/routes.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { ApiError, registerErrorHandler } from "./errors.js";
import { vaultRoutes } from "./vault/routes.js";

export interface AppDeps {
  config: Config;
  db: Db;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(deps: AppDeps) {
  const { config } = deps;

  const app = Fastify({
    // The largest request is one encrypted item (64 KiB as base64) plus JSON around it.
    bodyLimit: 256 * 1024,
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

  registerErrorHandler(app);
  await app.register(helmet);
  await app.register(cookie);
  // Off by default; each route opts in with its own limit (see auth/routes.ts).
  await app.register(rateLimit, { global: false });

  // Second line of defense against cross-site requests, after SameSite=Strict cookies:
  // anything that changes data must come from the web app's own origin.
  app.addHook("onRequest", async (request) => {
    if (UNSAFE_METHODS.has(request.method) && request.headers.origin !== config.WEB_ORIGIN) {
      throw new ApiError(403, "FORBIDDEN", "Request origin not allowed.");
    }
  });

  app.get("/health", async () => ({ status: "ok" }));
  authRoutes(app, deps);
  vaultRoutes(app, deps);
  accountRoutes(app, deps);

  return app;
}
