import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { accountRoutes } from "./account/routes.js";
import { authRoutes } from "./auth/routes.js";
import { createPaddleClient, type PaddleClient } from "./billing/paddle.js";
import { billingRoutes, WEBHOOK_PATH } from "./billing/routes.js";
import { billingSettings } from "./billing/settings.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { ApiError, errorBody, registerErrorHandler } from "./errors.js";
import { registerSecurityHeaders } from "./security-headers.js";
import { vaultRoutes } from "./vault/routes.js";
import { isAppPageRequest, sendAppPage, serveWebApp } from "./web-app.js";

export interface AppDeps {
  config: Config;
  db: Db;
  /** Tests pass a fake. Otherwise it's created from the config when billing is on. */
  paddle?: PaddleClient;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(appDeps: AppDeps) {
  const { config } = appDeps;
  // One Paddle client for every route that needs it, when billing is on.
  const settings = billingSettings(config);
  const deps: AppDeps = { ...appDeps, paddle: appDeps.paddle ?? (settings ? createPaddleClient(settings) : undefined) };

  const app = Fastify({
    // The largest request is one encrypted item (64 KiB as base64) plus JSON around it.
    bodyLimit: 256 * 1024,
    // Trust only the nearest TRUST_PROXY hops (see config.ts), so the client's real IP is used
    // for rate limits and nobody further away can fake one with X-Forwarded-For.
    trustProxy: config.TRUST_PROXY > 0 ? (_address: string, hop: number) => hop < config.TRUST_PROXY : false,
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
    // Paddle's webhook comes from Paddle's servers, not the web app; its signature proves it instead.
    if (request.url === WEBHOOK_PATH) return;
    if (UNSAFE_METHODS.has(request.method) && request.headers.origin !== config.WEB_ORIGIN) {
      throw new ApiError(403, "FORBIDDEN", "Request origin not allowed.");
    }
  });

  // API responses carry account data and encrypted vaults: never store them in the browser's
  // disk cache or any cache in between.
  app.addHook("onSend", async (request, reply) => {
    if (request.url.startsWith("/api/")) reply.header("cache-control", "no-store");
  });

  // Every API route lives under /api, so it can never collide with an app page like /vault.
  await app.register(
    async (api: FastifyInstance) => {
      // For uptime monitors and Docker's health check: 200 only when the database answers too.
      api.get("/health", async (_request, reply) => {
        try {
          await deps.db.execute(sql`select 1`);
          return { status: "ok" };
        } catch {
          return reply.status(503).send({ status: "unavailable" });
        }
      });
      authRoutes(api, deps);
      vaultRoutes(api, deps);
      accountRoutes(api, deps);
      billingRoutes(api, deps);
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
