import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { accountRoutes } from "./account/routes.js";
import { authRoutes } from "./auth/routes.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { ApiError, errorBody, registerErrorHandler } from "./errors.js";
import { registerSecurityHeaders } from "./security-headers.js";
import { vaultRoutes } from "./vault/routes.js";
import { isAppPageRequest, sendAppPage, serveWebApp } from "./web-app.js";

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
  await registerSecurityHeaders(app);
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

  // Every API route lives under /api, so it can never collide with an app page like /vault.
  await app.register(
    async (api: FastifyInstance) => {
      api.get("/health", async () => ({ status: "ok" }));
      authRoutes(api, deps);
      vaultRoutes(api, deps);
      accountRoutes(api, deps);
    },
    { prefix: "/api" },
  );

  if (config.WEB_DIST_DIR) await serveWebApp(app, config.WEB_DIST_DIR);

  // Unknown API URLs get a JSON 404. When serving the web app, any other page URL gets
  // index.html, and the app's router decides what to show.
  app.setNotFoundHandler((request, reply) => {
    if (config.WEB_DIST_DIR && isAppPageRequest(request.method, request.url)) {
      return sendAppPage(reply);
    }
    return reply.status(404).send(errorBody("NOT_FOUND", "Not found."));
  });

  return app;
}
