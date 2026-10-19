import { z } from "zod";

// All configuration comes from environment variables and is checked once, at startup.
// A missing or invalid value stops the server with a clear message instead of failing later.

const DEV_PRELOGIN_SECRET = "dev-only-prelogin-secret-do-not-use-in-production";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Localhost only by default. Docker sets 0.0.0.0.
    HOST: z.string().default("127.0.0.1"),
    // postgres://… in production; PGlite (Postgres in-process) in development and tests.
    // See db/client.ts for the formats.
    DATABASE_URL: z.string().default("pglite:./data/pglite"),
    // The web app's origin. Requests that change data must come from here.
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    // The built web app (apps/web/dist). When set, the API serves it, so app and API share one
    // origin. Unset in development, where Vite serves the app.
    WEB_DIST_DIR: z.string().optional(),
    // How many proxies (Caddy, a load balancer) sit in front of the API. With 1, the client's IP
    // comes from the X-Forwarded-For header the proxy adds, so rate limits count real users.
    // Leave at 0 when nothing is in front: otherwise anyone could fake their IP with that header.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // "relaxed" is for end-to-end tests only (see rate-limits.ts). Refused in production.
    RATE_LIMITS: z.enum(["strict", "relaxed"]).default("strict"),
    // Used to derive stable fake salts for unknown emails at prelogin (see routes/auth.ts).
    PRELOGIN_SECRET: z.string().min(32).default(DEV_PRELOGIN_SECRET),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PRELOGIN_SECRET !== DEV_PRELOGIN_SECRET, {
    message: "PRELOGIN_SECRET must be set in production",
    path: ["PRELOGIN_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.RATE_LIMITS === "strict", {
    message: "RATE_LIMITS=relaxed is only for tests",
    path: ["RATE_LIMITS"],
  })
  .refine((env) => env.NODE_ENV !== "production" || /^postgres(ql)?:\/\//.test(env.DATABASE_URL), {
    message: "DATABASE_URL must be a postgres:// URL in production (PGlite is for development)",
    path: ["DATABASE_URL"],
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
  }
  return result.data;
}
