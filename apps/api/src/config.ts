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
    // SQLite file for now. ":memory:" gives a throwaway database (used by tests).
    DATABASE_PATH: z.string().default("./data/pass1.db"),
    // The web app's origin. Requests that change data must come from here.
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    // Used to derive stable fake salts for unknown emails at prelogin (see routes/auth.ts).
    PRELOGIN_SECRET: z.string().min(32).default(DEV_PRELOGIN_SECRET),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PRELOGIN_SECRET !== DEV_PRELOGIN_SECRET, {
    message: "PRELOGIN_SECRET must be set in production",
    path: ["PRELOGIN_SECRET"],
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
