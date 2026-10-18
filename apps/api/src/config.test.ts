import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has working defaults for development", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("127.0.0.1");
  });

  it("refuses to start in production without a prelogin secret", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/PRELOGIN_SECRET must be set in production/);
  });

  it("accepts a real secret in production", () => {
    const config = loadConfig({ NODE_ENV: "production", PRELOGIN_SECRET: "x".repeat(32) });
    expect(config.NODE_ENV).toBe("production");
  });

  it("refuses relaxed rate limits in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", PRELOGIN_SECRET: "x".repeat(32), RATE_LIMITS: "relaxed" })).toThrow(
      /RATE_LIMITS=relaxed is only for tests/,
    );
  });

  it("names every invalid variable", () => {
    expect(() => loadConfig({ PORT: "not-a-port", WEB_ORIGIN: "nope" })).toThrow(/PORT[\s\S]*WEB_ORIGIN/);
  });
});
