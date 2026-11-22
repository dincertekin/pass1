import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loginFailures, rateLimitCounters } from "../db/schema.js";
import { createPrivacyHash } from "../privacy-hash.js";
import { b64, createTestApp, loggedInAs, ORIGIN } from "../test-helpers.js";
import { deleteStaleLoginFailures, LoginThrottle } from "./login-throttle.js";

describe("Counting failed logins", () => {
  const rule = { maxFailures: 3, windowMs: 1000 };

  async function newThrottle() {
    const ctx = await createTestApp();
    return { ctx, throttle: new LoginThrottle(ctx.db, rule, createPrivacyHash(ctx.config)) };
  }

  it("blocks after the limit and unblocks when the window ends", async () => {
    const { throttle } = await newThrottle();
    for (let i = 0; i < 3; i++) await throttle.recordFailure("a@example.com", 0);
    expect(await throttle.retryAfter("a@example.com", 100)).toBe(900);
    expect(await throttle.retryAfter("a@example.com", 1000)).toBe(0);
  });

  it("starts counting again once a window has ended", async () => {
    const { throttle } = await newThrottle();
    for (let i = 0; i < 2; i++) await throttle.recordFailure("a@example.com", 0);
    await throttle.recordFailure("a@example.com", 1500);
    expect(await throttle.retryAfter("a@example.com", 1500)).toBe(0);
  });

  it("forgets failures after a successful login", async () => {
    const { throttle } = await newThrottle();
    await throttle.recordFailure("a@example.com", 0);
    await throttle.recordFailure("a@example.com", 0);
    await throttle.recordSuccess("a@example.com");
    await throttle.recordFailure("a@example.com", 0);
    expect(await throttle.retryAfter("a@example.com", 0)).toBe(0);
  });

  it("counts each account separately", async () => {
    const { throttle } = await newThrottle();
    for (let i = 0; i < 3; i++) await throttle.recordFailure("a@example.com", 0);
    expect(await throttle.retryAfter("b@example.com", 0)).toBe(0);
  });

  it("deletes counts once their window has ended", async () => {
    const { ctx, throttle } = await newThrottle();
    await throttle.recordFailure("a@example.com", 0);
    expect(await deleteStaleLoginFailures(ctx.db, rule, 500)).toBe(0);
    expect(await deleteStaleLoginFailures(ctx.db, rule, 1500)).toBe(1);
  });
});

describe("POST /api/auth/login, guessed from many IPs", () => {
  async function guessFrom(app: Awaited<ReturnType<typeof createTestApp>>["app"], email: string, ip: string, authKey = b64(32)) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, authKey },
      headers: { ...ORIGIN, "x-forwarded-for": ip },
    });
  }

  it("blocks the account after 10 failures, even from new IPs and with the right password", async () => {
    const ctx = await createTestApp({ TRUST_PROXY: "1" });
    const { app } = ctx;
    const victim = await loggedInAs(ctx, "victim@example.com");

    for (let i = 0; i < 10; i++) expect((await guessFrom(app, "victim@example.com", `198.51.100.${i}`)).statusCode).toBe(401);

    const blocked = await guessFrom(app, "victim@example.com", "203.0.113.1", victim.authKey);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.message).toMatch(/Too many failed attempts for this account/);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    // Logged-in devices aren't affected.
    expect((await victim.send("GET", "/api/auth/me")).statusCode).toBe(200);
  });

  it("treats unknown emails the same, so the block reveals nothing", async () => {
    const { app } = await createTestApp({ TRUST_PROXY: "1" });
    for (let i = 0; i < 10; i++) await guessFrom(app, "nobody@example.com", `198.51.100.${i}`);
    expect((await guessFrom(app, "nobody@example.com", "203.0.113.1")).statusCode).toBe(429);
  });
});

// Two API servers behind one load balancer, on one database: guesses and requests counted on
// one must count on the other, or an attacker could spread them across servers.
describe("Several API servers on one database", () => {
  async function twoServers() {
    const ctx = await createTestApp({ TRUST_PROXY: "1" });
    const second = await buildApp({ config: ctx.config, db: ctx.db, sendEmail: async () => {} });
    return { ctx, first: ctx.app, second };
  }

  function loginFrom(app: Awaited<ReturnType<typeof buildApp>>, email: string, ip: string) {
    return app.inject({ method: "POST", url: "/api/auth/login", payload: { email, authKey: b64(32) }, headers: { ...ORIGIN, "x-forwarded-for": ip } });
  }

  it("share the login block: failures on one server block the account on the other", async () => {
    const { first, second } = await twoServers();
    for (let i = 0; i < 5; i++) await loginFrom(first, "victim@example.com", `198.51.100.${i}`);
    for (let i = 5; i < 10; i++) await loginFrom(second, "victim@example.com", `198.51.100.${i}`);
    expect((await loginFrom(first, "victim@example.com", "203.0.113.1")).statusCode).toBe(429);
  });

  it("share rate limits: requests from one IP count on both servers", async () => {
    const { first, second } = await twoServers();
    // The login limit is 10 a minute per IP; spread over two servers it must still be 10.
    for (let i = 0; i < 10; i++) await loginFrom(i % 2 ? second : first, `user${i}@example.com`, "198.51.100.7");
    const res = await loginFrom(first, "one-more@example.com", "198.51.100.7");
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });

  it("count each route separately", async () => {
    const { first } = await twoServers();
    for (let i = 0; i < 10; i++) await loginFrom(first, `user${i}@example.com`, "198.51.100.7");
    const prelogin = await first.inject({ method: "POST", url: "/api/auth/prelogin", payload: { email: "a@example.com" }, headers: { ...ORIGIN, "x-forwarded-for": "198.51.100.7" } });
    expect(prelogin.statusCode).toBe(200);
  });

  it("store no readable email or IP address, only keyed hashes", async () => {
    const { ctx, first } = await twoServers();
    await loginFrom(first, "victim@example.com", "198.51.100.42");
    const stored = JSON.stringify([await ctx.db.select().from(loginFailures), await ctx.db.select().from(rateLimitCounters)]);
    expect(stored).not.toContain("victim");
    expect(stored).not.toContain("198.51.100.42");
    expect(stored).toContain("POST /api/auth/login");
  });
});
