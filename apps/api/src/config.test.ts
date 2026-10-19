import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has working defaults for development", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("127.0.0.1");
  });

  const PROD = { NODE_ENV: "production", PRELOGIN_SECRET: "x".repeat(32), DATABASE_URL: "postgres://pass1@db/pass1" };

  it("refuses to start in production without a prelogin secret", () => {
    expect(() => loadConfig({ ...PROD, PRELOGIN_SECRET: undefined })).toThrow(/PRELOGIN_SECRET must be set in production/);
  });

  it("accepts a real secret and Postgres in production", () => {
    expect(loadConfig(PROD).NODE_ENV).toBe("production");
  });

  it("refuses PGlite in production", () => {
    expect(() => loadConfig({ ...PROD, DATABASE_URL: "pglite:./data/pglite" })).toThrow(/must be a postgres:\/\/ URL in production/);
  });

  it("trusts no proxy unless told how many there are", () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(0);
    expect(loadConfig({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
  });

  it("refuses relaxed rate limits in production", () => {
    expect(() => loadConfig({ ...PROD, RATE_LIMITS: "relaxed" })).toThrow(
      /RATE_LIMITS=relaxed is only for tests/,
    );
  });

  it("names every invalid variable", () => {
    expect(() => loadConfig({ PORT: "not-a-port", WEB_ORIGIN: "nope" })).toThrow(/PORT[\s\S]*WEB_ORIGIN/);
  });
});

describe("billing settings", () => {
  const ALL = {
    PADDLE_API_KEY: "key",
    PADDLE_WEBHOOK_SECRET: "secret",
    PADDLE_PRICE_PLUS_YEARLY: "pri_a",
    PADDLE_PRICE_PLUS_MONTHLY: "pri_b",
    PADDLE_PRICE_UNLIMITED_YEARLY: "pri_c",
    PADDLE_PRICE_UNLIMITED_MONTHLY: "pri_d",
  };

  it("is all or nothing", () => {
    expect(() => loadConfig(ALL)).not.toThrow();
    expect(() => loadConfig({})).not.toThrow();
    expect(() => loadConfig({ PADDLE_API_KEY: "key" })).toThrow(/Set all of PADDLE_API_KEY/);
  });

  it("must use Paddle's production environment in production", () => {
    const prod = { NODE_ENV: "production", PRELOGIN_SECRET: "x".repeat(32), DATABASE_URL: "postgres://db/pass1", ...ALL };
    expect(() => loadConfig(prod)).toThrow(/PADDLE_ENVIRONMENT must be production/);
    expect(() => loadConfig({ ...prod, PADDLE_ENVIRONMENT: "production" })).not.toThrow();
  });
});
