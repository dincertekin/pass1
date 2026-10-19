import { describe, expect, it } from "vitest";
import { b64, createTestApp, loggedInAs, ORIGIN } from "../test-helpers.js";
import { LoginThrottle } from "./login-throttle.js";

describe("LoginThrottle", () => {
  const rule = { maxFailures: 3, windowMs: 1000 };

  it("blocks after the limit and unblocks when the window ends", () => {
    const t = new LoginThrottle(rule);
    for (let i = 0; i < 3; i++) t.recordFailure("a@example.com", 0);
    expect(t.retryAfter("a@example.com", 100)).toBe(900);
    expect(t.retryAfter("a@example.com", 1000)).toBe(0);
  });

  it("forgets failures after a successful login", () => {
    const t = new LoginThrottle(rule);
    t.recordFailure("a@example.com", 0);
    t.recordFailure("a@example.com", 0);
    t.recordSuccess("a@example.com");
    t.recordFailure("a@example.com", 0);
    expect(t.retryAfter("a@example.com", 0)).toBe(0);
  });

  it("counts each account separately", () => {
    const t = new LoginThrottle(rule);
    for (let i = 0; i < 3; i++) t.recordFailure("a@example.com", 0);
    expect(t.retryAfter("b@example.com", 0)).toBe(0);
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
    const { app } = await createTestApp({ TRUST_PROXY: "1" });
    const victim = await loggedInAs(app, "victim@example.com");

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
